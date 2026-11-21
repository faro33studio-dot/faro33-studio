/* Entrada del Worker faro33-intake.
 *
 * Este archivo se concatena al final de src/lib/*.js en dist/intake.worker.js.
 * Por eso NO usa `import`: en el dist las funciones de las librerías viven en el
 * mismo ámbito del módulo. En pruebas se inyectan como globales antes de llamar.
 *
 * Privacidad: el cuerpo de la petición NUNCA se registra. Los logs solo llevan
 * evento, folio (metadato) y código HTTP. Las respuestas de error nunca incluyen
 * valores: como mucho, ids de campo.
 */

const MAX_CUERPO = 32 * 1024; // 32 KB
const HORA_MS = 60 * 60 * 1000;

function registrar(evento, codigo, folio) {
  const linea = { evento, codigo };
  if (typeof folio === 'string' && folio !== '') linea.folio = folio;
  try {
    console.log(JSON.stringify(linea));
  } catch {
    // Un fallo de consola jamás debe tumbar una petición.
  }
}

function ipDe(request) {
  const cf = request.headers.get('CF-Connecting-IP');
  if (typeof cf === 'string' && cf.trim() !== '') return cf.trim();
  const reenviada = request.headers.get('X-Forwarded-For');
  if (typeof reenviada === 'string' && reenviada.trim() !== '') {
    const primera = reenviada.split(',')[0].trim();
    if (primera !== '') return primera;
  }
  return '0.0.0.0';
}

function enteroPositivo(valor, porOmision) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero > 0 ? numero : porOmision;
}

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function tipoJSON(request) {
  const cabecera = request.headers.get('Content-Type');
  if (typeof cabecera !== 'string') return false;
  return cabecera.split(';')[0].trim().toLowerCase() === 'application/json';
}

export default {
  async fetch(request, env, ctx) {
    const entorno = env || {};
    const url = new URL(request.url);
    const metodo = request.method.toUpperCase();
    const origen = request.headers.get('Origin');
    const permitidos = entorno.ALLOWED_ORIGINS;
    const cabecerasCors = cors(origen, permitidos);
    const permitido = origenPermitido(origen, permitidos);
    let folio = null;

    const responder = (estado, cuerpo, extra) => {
      const evento = estado === 200 ? 'envio' : (estado >= 500 ? 'error' : 'rechazo');
      registrar(evento, estado, folio);
      return respuestaJSON(estado, cuerpo, extra || cabecerasCors);
    };

    try {
      // 1. Preflight CORS. Sin origen permitido no se anuncia nada.
      if (metodo === 'OPTIONS') {
        if (!permitido) {
          registrar('rechazo', 403, null);
          return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
        }
        return new Response(null, { status: 204, headers: cabecerasCors });
      }

      // 2. Salud: pública, sin datos, útil para monitoreo.
      if (metodo === 'GET' && url.pathname === '/salud') {
        return respuestaJSON(200, { ok: true }, cabecerasCors);
      }

      // 3. CORS: el origen debe estar permitido (el navegador siempre lo envía).
      if (!permitido) {
        registrar('rechazo', 403, null);
        return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
      }

      // 4. Rutas y métodos.
      if (url.pathname !== '/' && url.pathname !== '/enviar') {
        return responder(404, { ok: false, error: 'ruta' });
      }
      if (metodo !== 'POST') {
        return responder(405, { ok: false, error: 'metodo' },
          { ...cabecerasCors, Allow: 'POST, OPTIONS' });
      }

      // 5. Content-Type y tamaño. Se comprueba la cabecera y el cuerpo real.
      if (!tipoJSON(request)) {
        return responder(415, { ok: false, error: 'contenido' });
      }
      const declarado = Number(request.headers.get('Content-Length'));
      if (Number.isFinite(declarado) && declarado > MAX_CUERPO) {
        return responder(413, { ok: false, error: 'tamano' });
      }
      let texto;
      try {
        texto = await request.text();
      } catch {
        return responder(400, { ok: false, error: 'json' });
      }
      if (new TextEncoder().encode(texto).byteLength > MAX_CUERPO) {
        return responder(413, { ok: false, error: 'tamano' });
      }

      let datos;
      try {
        datos = JSON.parse(texto);
      } catch {
        return responder(400, { ok: false, error: 'json' });
      }
      if (!esObjeto(datos)) {
        return responder(400, { ok: false, error: 'json' });
      }

      // 6. Identidad del formulario y versión.
      if (datos.formulario !== SCHEMA.id) {
        return responder(400, { ok: false, error: 'formulario' });
      }
      if (datos.version !== SCHEMA.version) {
        return responder(409, { ok: false, error: 'version' });
      }
      if (!foliosValido(datos.folio)) {
        return responder(400, { ok: false, error: 'folio' });
      }
      folio = datos.folio;
      if (!esObjeto(datos.respuestas)) {
        return responder(400, { ok: false, error: 'datos' });
      }

      // 7. Turnstile: obligatorio salvo el escape explícito para pruebas.
      const haySecreto = typeof entorno.TURNSTILE_SECRET === 'string' &&
        entorno.TURNSTILE_SECRET.trim() !== '';
      if (!haySecreto) {
        if (entorno.ALLOW_NO_TURNSTILE !== '1') {
          return responder(503, { ok: false, error: 'config' });
        }
      } else {
        const token = datos.turnstile;
        if (typeof token !== 'string' || token.trim() === '') {
          return responder(403, { ok: false, error: 'verificacion' });
        }
        const verificacion = await verificarTurnstile(token, entorno.TURNSTILE_SECRET, ipDe(request));
        if (!verificacion.ok) {
          return responder(403, { ok: false, error: 'verificacion' });
        }
      }

      // 8. Validación estricta con el schema embebido. Solo ids en la respuesta.
      const revision = validarRespuestas(SCHEMA, datos.respuestas);
      if (!revision.ok) {
        return responder(422, { ok: false, error: 'datos', campos: revision.errores });
      }
      const limpias = revision.respuestas;

      // 9. Idempotencia por folio: un reintento del navegador no duplica ni cobra tasa.
      const existente = await entorno.DB.prepare(
        'SELECT folio FROM submissions WHERE folio = ?'
      ).bind(folio).first();
      if (existente && existente.folio) {
        return responder(200, { ok: true, folio });
      }

      // 10. Límite por IP (hash HMAC; nunca la IP en claro).
      const ip = ipDe(request);
      const ipHash = (await hmacHex(entorno.HMAC_KEY, ip)).slice(0, 32);
      const limite = enteroPositivo(entorno.RATE_LIMIT_PER_HOUR, 5);
      const desde = new Date(Date.now() - HORA_MS).toISOString();
      const conteo = await entorno.DB.prepare(
        'SELECT COUNT(*) AS total FROM submissions WHERE ip_hash = ? AND created_at >= ?'
      ).bind(ipHash, desde).first();
      const usadas = Number(conteo && conteo.total) || 0;
      if (usadas >= limite) {
        return responder(429, { ok: false, error: 'limite' });
      }

      // 11. Cifrado del blob. La PII solo vive dentro de ciphertext.
      const telefono = typeof limpias.telefono === 'string' ? limpias.telefono : '';
      const telefonoNormalizado = normalizarTelefono(telefono);
      const phoneHash = telefonoNormalizado === ''
        ? null
        : await hmacHex(entorno.HMAC_KEY, telefonoNormalizado);

      const meta = esObjeto(datos.meta) ? datos.meta : {};
      const pagina = limitarTexto(meta.pagina, 120);
      const cta = limitarTexto(meta.cta, 120);
      const origenMeta = limitarTexto(meta.origen, 120);

      const { version: keyVersion, clave } = await claveActiva(entorno);
      const recibido = ahoraISO();
      const blob = {
        respuestas: limpias,
        meta: { pagina, cta, origen: origenMeta },
        recibido
      };
      const { iv, ciphertext } = await cifrar(clave, blob, folio);

      const tipo = typeof limpias.tipo === 'string' ? limpias.tipo : null;
      const insercion = await entorno.DB.prepare(
        'INSERT INTO submissions (folio, created_at, formulario, version, tipo, origen, cta, status, phone_hash, ip_hash, key_version, iv, ciphertext) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(folio) DO NOTHING'
      ).bind(
        folio, recibido, SCHEMA.id, SCHEMA.version, tipo,
        origenMeta === '' ? null : origenMeta,
        cta === '' ? null : cta,
        'nuevo', phoneHash, ipHash, keyVersion, iv, ciphertext
      ).run();

      // Si otra petición simultánea ganó la carrera, tampoco hay error: es idempotente.
      const cambios = insercion && insercion.meta ? Number(insercion.meta.changes) : 1;
      if (!cambios) {
        return responder(200, { ok: true, folio });
      }
      return responder(200, { ok: true, folio });
    } catch {
      // Nunca se expone el mensaje de la excepción (podría contener datos).
      registrar('error', 500, folio);
      return respuestaJSON(500, { ok: false, error: 'interno' }, cabecerasCors);
    }
  }
};

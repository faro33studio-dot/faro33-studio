/* Entrada del Worker faro33-admin.
 *
 * Se concatena al final de src/lib/*.js en dist/admin.worker.js; por eso NO usa
 * `import`: `verificarAccess`, `aCSV`, `abrirFila`, `etiquetar`, `ESTADOS`,
 * `hmacHex`, `normalizarTelefono`, `foliosValido` y `ahoraISO` viven en el mismo
 * ámbito del módulo generado.
 *
 * Seguridad:
 *   - Cloudflare Access es la primera barrera; aquí se verifica el JWT otra vez.
 *   - Todas las respuestas llevan cabeceras de no-store, nosniff, DENY, etc.
 *   - La lista NO descifra: solo metadatos. El detalle y el CSV sí descifran.
 *   - Las mutaciones exigen Content-Type JSON, X-F33-Admin: 1 y mismo origen.
 *   - Los logs y los errores nunca incluyen respuestas ni mensajes de excepción.
 */

const POR_PAGINA = 25;
const MAX_CUERPO = 4 * 1024;
const MAX_EXPORTACION = 2000;

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; " +
  "frame-ancestors 'none'";

const SEGURIDAD = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': CSP
};

function registrar(evento, codigo, folio) {
  const linea = { evento, codigo };
  if (typeof folio === 'string' && folio !== '') linea.folio = folio;
  try {
    console.log(JSON.stringify(linea));
  } catch {
    // Un fallo de consola jamás debe tumbar una petición.
  }
}

function responder(estado, cuerpo, opciones) {
  const extra = opciones || {};
  const cabeceras = { ...SEGURIDAD, ...(extra.cabeceras || {}) };
  if (cuerpo === undefined || cuerpo === null) {
    return new Response(null, { status: estado, headers: cabeceras });
  }
  if (typeof cuerpo === 'string') {
    return new Response(cuerpo, { status: estado, headers: cabeceras });
  }
  cabeceras['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
}

function json(estado, cuerpo, extra) {
  return responder(estado, cuerpo, { cabeceras: extra });
}

function tipoJSON(request) {
  const cabecera = request.headers.get('Content-Type');
  if (typeof cabecera !== 'string') return false;
  return cabecera.split(';')[0].trim().toLowerCase() === 'application/json';
}

/** CSRF: solo peticiones del mismo origen y con las cabeceras esperadas. */
function mutacionPermitida(request) {
  if (!tipoJSON(request)) return false;
  if (request.headers.get('X-F33-Admin') !== '1') return false;
  const origen = request.headers.get('Origin');
  if (origen === null || origen === '') return true;
  try {
    return new URL(origen).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function leerCuerpoJSON(request) {
  const declarado = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declarado) && declarado > MAX_CUERPO) {
    return { ok: false, error: 'tamano' };
  }
  let texto;
  try {
    texto = await request.text();
  } catch {
    return { ok: false, error: 'json' };
  }
  if (new TextEncoder().encode(texto).byteLength > MAX_CUERPO) {
    return { ok: false, error: 'tamano' };
  }
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    return { ok: false, error: 'json' };
  }
  return { ok: true, datos };
}

async function auditar(env, actor, accion, folio) {
  await env.DB.prepare(
    'INSERT INTO audit (at, actor, accion, folio) VALUES (?, ?, ?, ?)'
  ).bind(ahoraISO(), actor, accion, typeof folio === 'string' ? folio : '').run();
}

function entero(valor, porOmision) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero > 0 ? numero : porOmision;
}

function condicionesDe(url, permitirTelefono) {
  const condiciones = [];
  const argumentos = [];
  const tipo = (url.searchParams.get('tipo') || '').trim();
  const estado = (url.searchParams.get('estado') || '').trim();
  const telefono = permitirTelefono ? (url.searchParams.get('tel') || '').trim() : '';

  if (tipo !== '') {
    condiciones.push('tipo = ?');
    argumentos.push(tipo.slice(0, 40));
  }
  if (estado !== '') {
    condiciones.push('status = ?');
    argumentos.push(estado.slice(0, 40));
  }
  return { condiciones, argumentos, estado, telefono };
}

async function listarEnvios(request, env) {
  const url = new URL(request.url);
  const pagina = entero(url.searchParams.get('pagina'), 1);
  const { condiciones, argumentos, estado, telefono } = condicionesDe(url, true);

  if (estado !== '' && !ESTADOS.includes(estado)) {
    return json(400, { ok: false, error: 'estado' });
  }

  if (telefono !== '') {
    const normalizado = normalizarTelefono(telefono);
    if (normalizado === '') {
      return json(200, { total: 0, pagina, porPagina: POR_PAGINA, filas: [] });
    }
    const hash = await hmacHex(env.HMAC_KEY, normalizado);
    condiciones.push('phone_hash = ?');
    argumentos.push(hash);
  }

  const where = condiciones.length > 0 ? ' WHERE ' + condiciones.join(' AND ') : '';
  const conteo = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM submissions' + where
  ).bind(...argumentos).first();
  const total = Number(conteo && conteo.total) || 0;

  const desplazamiento = (pagina - 1) * POR_PAGINA;
  const consulta = await env.DB.prepare(
    'SELECT folio, created_at, tipo, status, origen, cta FROM submissions' + where +
    ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
  ).bind(...argumentos, POR_PAGINA, desplazamiento).all();

  const resultados = consulta && Array.isArray(consulta.results) ? consulta.results : [];
  return json(200, {
    total,
    pagina,
    porPagina: POR_PAGINA,
    filas: resultados.map(fila => ({
      folio: fila.folio,
      creado: fila.created_at,
      tipo: fila.tipo,
      estado: fila.status,
      origen: fila.origen,
      cta: fila.cta
    }))
  });
}

async function detalleEnvio(env, folio, correo) {
  if (!foliosValido(folio)) return json(400, { ok: false, error: 'folio' });

  const fila = await env.DB.prepare(
    'SELECT * FROM submissions WHERE folio = ?'
  ).bind(folio).first();
  if (!fila) return json(404, { ok: false, error: 'folio' });

  // Se audita el intento de ver antes de descifrar: si la llave falla, el
  // acceso autorizado a ese folio también queda registrado (sin PII).
  await auditar(env, correo, 'ver', folio);

  let abierto;
  try {
    abierto = await abrirFila(env, fila);
  } catch {
    return json(500, { ok: false, error: 'interno' });
  }

  const campos = etiquetar(SCHEMA, abierto.respuestas);
  return json(200, {
    ok: true,
    // Campos planos (cómodos para clientes simples) y agrupados (los usa la UI).
    folio: abierto.folio,
    creado: abierto.creado,
    tipo: abierto.tipo,
    estado: abierto.estado,
    origen: abierto.origen,
    cta: abierto.cta,
    meta: abierto.meta,
    respuestas: abierto.respuestas,
    // El detalle completo también va anidado: algunos clientes prefieren
    // `envio.respuestas` y otros los campos planos.
    envio: abierto,
    campos
  });
}

async function cambiarEstado(request, env, folio, correo) {
  if (!mutacionPermitida(request)) {
    return json(403, { ok: false, error: 'origen' });
  }
  if (!foliosValido(folio)) return json(400, { ok: false, error: 'folio' });

  const cuerpo = await leerCuerpoJSON(request);
  if (!cuerpo.ok) return json(400, { ok: false, error: cuerpo.error });
  const estado = cuerpo.datos.estado;
  if (typeof estado !== 'string' || !ESTADOS.includes(estado)) {
    return json(400, { ok: false, error: 'estado' });
  }

  const resultado = await env.DB.prepare(
    'UPDATE submissions SET status = ? WHERE folio = ?'
  ).bind(estado, folio).run();
  const cambios = resultado && resultado.meta ? Number(resultado.meta.changes) : 0;
  if (!cambios) return json(404, { ok: false, error: 'folio' });

  await auditar(env, correo, 'estado:' + estado, folio);
  return json(200, { ok: true, folio, estado });
}

async function borrarEnvio(request, env, folio, correo) {
  if (!mutacionPermitida(request)) {
    return json(403, { ok: false, error: 'origen' });
  }
  if (!foliosValido(folio)) return json(400, { ok: false, error: 'folio' });

  const cuerpo = await leerCuerpoJSON(request);
  if (!cuerpo.ok) return json(400, { ok: false, error: cuerpo.error });
  if (cuerpo.datos.confirmar !== folio) {
    return json(400, { ok: false, error: 'confirmacion' });
  }

  const resultado = await env.DB.prepare(
    'DELETE FROM submissions WHERE folio = ?'
  ).bind(folio).run();
  const cambios = resultado && resultado.meta ? Number(resultado.meta.changes) : 0;
  if (!cambios) return json(404, { ok: false, error: 'folio' });

  await auditar(env, correo, 'borrar', folio);
  return json(200, { ok: true, folio });
}

function columnasExportacion() {
  const columnas = [
    { clave: 'folio', etiqueta: 'folio' },
    { clave: 'creado', etiqueta: 'creado' },
    { clave: 'tipo', etiqueta: 'tipo' },
    { clave: 'estado', etiqueta: 'estado' },
    { clave: 'origen', etiqueta: 'origen' },
    { clave: 'cta', etiqueta: 'cta' }
  ];
  const preguntas = [];
  const secciones = SCHEMA && Array.isArray(SCHEMA.secciones) ? SCHEMA.secciones : [];
  for (const seccion of secciones) {
    if (!seccion || !Array.isArray(seccion.campos)) continue;
    const titulo = typeof seccion.titulo === 'string' ? seccion.titulo : seccion.id;
    for (const campo of seccion.campos) {
      if (!campo || typeof campo.id !== 'string') continue;
      preguntas.push({
        clave: 'q:' + campo.id,
        etiqueta: typeof campo.etiqueta === 'string' ? campo.etiqueta : campo.id,
        seccion: titulo
      });
    }
  }
  return { columnas: columnas.concat(preguntas.map(p => ({ clave: p.clave, etiqueta: p.etiqueta }))), preguntas };
}

async function exportarCSV(request, env, correo) {
  const url = new URL(request.url);
  const { condiciones, argumentos, estado } = condicionesDe(url, false);
  if (estado !== '' && !ESTADOS.includes(estado)) {
    return json(400, { ok: false, error: 'estado' });
  }
  const where = condiciones.length > 0 ? ' WHERE ' + condiciones.join(' AND ') : '';

  const consulta = await env.DB.prepare(
    'SELECT * FROM submissions' + where +
    ' ORDER BY created_at DESC, id DESC LIMIT ' + MAX_EXPORTACION
  ).bind(...argumentos).all();
  const filas = consulta && Array.isArray(consulta.results) ? consulta.results : [];

  const { columnas, preguntas } = columnasExportacion();
  const salida = [];
  for (const fila of filas) {
    const abierto = await abrirFila(env, fila);
    const registro = {
      folio: abierto.folio,
      creado: abierto.creado,
      tipo: abierto.tipo,
      estado: abierto.estado,
      origen: abierto.origen,
      cta: abierto.cta
    };
    const porPregunta = new Map();
    for (const campo of etiquetar(SCHEMA, abierto.respuestas)) {
      porPregunta.set(campo.seccion + '\u0000' + campo.etiqueta, campo.valor);
    }
    for (const pregunta of preguntas) {
      registro[pregunta.clave] = porPregunta.get(pregunta.seccion + '\u0000' + pregunta.etiqueta) || '';
    }
    salida.push(registro);
  }

  await auditar(env, correo, 'exportar', '');
  const fecha = new Date().toISOString().slice(0, 10);
  return responder(200, aCSV(salida, columnas, { bom: true }), {
    cabeceras: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="envios-' + fecha + '.csv"'
    }
  });
}

async function manejar(request, env, marcarFolio) {
  let acceso;
  try {
    acceso = await verificarAccess(request, env);
  } catch {
    acceso = { ok: false };
  }
  if (!acceso || acceso.ok !== true) {
    return responder(403, null);
  }
  const correo = typeof acceso.correo === 'string' ? acceso.correo : '';

  const url = new URL(request.url);
  const metodo = request.method.toUpperCase();
  // Se tolera la barra final (/api/envios/), pero no se altera la raíz.
  const ruta = url.pathname.length > 1 && url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1)
    : url.pathname;
  const partes = ruta.split('/').filter(Boolean);

  // Portada.
  if (ruta === '/' || ruta === '') {
    if (metodo !== 'GET') return responder(405, { ok: false, error: 'metodo' }, {
      cabeceras: { Allow: 'GET' }
    });
    return responder(200, HTML_ADMIN, {
      cabeceras: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // Lista paginada (solo metadatos, sin descifrar).
  if (ruta === '/api/envios') {
    if (metodo !== 'GET') return responder(405, { ok: false, error: 'metodo' }, {
      cabeceras: { Allow: 'GET' }
    });
    return listarEnvios(request, env);
  }

  // Exportación CSV (respeta tipo/estado; no acepta búsqueda por teléfono).
  if (ruta === '/api/exportar.csv') {
    if (metodo !== 'GET') return responder(405, { ok: false, error: 'metodo' }, {
      cabeceras: { Allow: 'GET' }
    });
    return exportarCSV(request, env, correo);
  }

  // /api/envios/:folio y /api/envios/:folio/estado
  if (partes.length >= 3 && partes[0] === 'api' && partes[1] === 'envios') {
    const folio = partes[2];
    marcarFolio(folio);

    if (partes.length === 3) {
      if (metodo === 'GET') return detalleEnvio(env, folio, correo);
      if (metodo === 'DELETE') return borrarEnvio(request, env, folio, correo);
      return responder(405, { ok: false, error: 'metodo' }, {
        cabeceras: { Allow: 'GET, DELETE' }
      });
    }

    if (partes.length === 4 && partes[3] === 'estado') {
      if (metodo !== 'POST') return responder(405, { ok: false, error: 'metodo' }, {
        cabeceras: { Allow: 'POST' }
      });
      return cambiarEstado(request, env, folio, correo);
    }
  }

  return responder(404, { ok: false, error: 'ruta' });
}

export default {
  async fetch(request, env) {
    let folio = null;
    let estadoFinal = 500;
    let eventoFinal = 'error';
    try {
      const respuesta = await manejar(request, env || {}, valor => { folio = valor; });
      estadoFinal = respuesta.status;
      eventoFinal = estadoFinal === 200 ? 'admin' : (estadoFinal >= 500 ? 'error' : 'rechazo');
      return respuesta;
    } catch {
      estadoFinal = 500;
      eventoFinal = 'error';
      return responder(500, { ok: false, error: 'interno' });
    } finally {
      registrar(eventoFinal, estadoFinal, folio);
    }
  }
};

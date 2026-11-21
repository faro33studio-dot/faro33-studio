/* Verificación del JWT de Cloudflare Access (defensa en profundidad).
 *
 * Cloudflare Access ya filtra en el borde, pero el Worker comprueba el token
 * otra vez. Reglas:
 *   - Solo RS256 y una llave del JWKS del equipo, elegida por `kid`.
 *   - `iss`, `aud`, `exp` y `nbf` se validan con tolerancia de 60 s.
 *   - El correo debe estar en ADMIN_EMAILS (lista separada por comas).
 *   - Si ADMIN_EMAILS falta o está vacío, se deniega TODO.
 *   - Cualquier fallo devuelve {ok:false}: nunca se explica el motivo.
 *
 * El JWKS se guarda en memoria 10 minutos. Si la red falla, se rechaza la
 * petición (no se usa una copia vieja: una llave revocada no debe seguir viva).
 */

const VIDA_CACHE_MS = 10 * 60 * 1000;
const TOLERANCIA_MS = 60 * 1000;
const cacheJWKS = new Map(); // url -> { expira: number, llaves: JWK[] }

function normalizarDominio(valor) {
  if (typeof valor !== 'string') return '';
  return valor.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function decodificarBase64Url(texto) {
  if (typeof texto !== 'string' || !/^[A-Za-z0-9_-]+$/.test(texto)) {
    throw new Error('base64url_invalido');
  }
  const normal = texto.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = normal.length % 4 === 0 ? '' : '='.repeat(4 - (normal.length % 4));
  const binario = atob(normal + relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function leerJSONBase64Url(texto) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodificarBase64Url(texto)));
}

/** URL del JWKS; lanza si el dominio no está configurado. */
function urlJWKS(teamDomain) {
  const dominio = normalizarDominio(teamDomain);
  if (dominio === '') throw new Error('access_sin_dominio');
  return 'https://' + dominio + '/cdn-cgi/access/certs';
}

async function obtenerLlaves(teamDomain) {
  const url = urlJWKS(teamDomain);
  const ahora = Date.now();
  const guardado = cacheJWKS.get(url);
  if (guardado && guardado.expira > ahora) return guardado.llaves;

  const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!respuesta || !respuesta.ok) throw new Error('jwks_no_disponible');
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error('jwks_invalido');
  }
  if (!datos || !Array.isArray(datos.keys)) throw new Error('jwks_invalido');
  const llaves = datos.keys.filter(llave =>
    llave && typeof llave === 'object' &&
    typeof llave.kid === 'string' && llave.kid !== '' &&
    typeof llave.n === 'string' && typeof llave.e === 'string'
  );
  if (llaves.length === 0) throw new Error('jwks_invalido');

  // Solo se cachea una respuesta válida y reciente.
  cacheJWKS.set(url, { expira: ahora + VIDA_CACHE_MS, llaves });
  return llaves;
}

function correosPermitidos(env) {
  const crudo = env ? env.ADMIN_EMAILS : '';
  const texto = Array.isArray(crudo) ? crudo.join(',') : (typeof crudo === 'string' ? crudo : '');
  return new Set(
    texto.split(',').map(correo => correo.trim().toLowerCase()).filter(Boolean)
  );
}

/**
 * Verifica `Cf-Access-Jwt-Assertion`. Devuelve {ok:true, correo} o {ok:false}.
 * No se exponen motivos: el llamador solo necesita saber si pasa o no.
 */
export async function verificarAccess(request, env) {
  try {
    const permiso = correosPermitidos(env || {});
    if (permiso.size === 0) return { ok: false };

    const audiencia = env && typeof env.ACCESS_AUD === 'string' ? env.ACCESS_AUD.trim() : '';
    const dominio = normalizarDominio(env && env.ACCESS_TEAM_DOMAIN);
    if (audiencia === '' || dominio === '') return { ok: false };

    const crudo = request && request.headers ? request.headers.get('Cf-Access-Jwt-Assertion') : null;
    if (typeof crudo !== 'string' || crudo.trim() === '') return { ok: false };
    const token = crudo.trim();

    const partes = token.split('.');
    if (partes.length !== 3) return { ok: false };

    let cabecera;
    let carga;
    let firma;
    try {
      cabecera = leerJSONBase64Url(partes[0]);
      carga = leerJSONBase64Url(partes[1]);
      firma = decodificarBase64Url(partes[2]);
    } catch {
      return { ok: false };
    }
    if (!cabecera || cabecera.alg !== 'RS256') return { ok: false };
    if (typeof cabecera.kid !== 'string' || cabecera.kid === '') return { ok: false };
    if (!carga || typeof carga !== 'object' || Array.isArray(carga)) return { ok: false };

    // Tiempos: segundos UNIX. exp debe seguir vigente (60 s de gracia) y nbf
    // no puede estar en el futuro (misma gracia).
    const ahora = Date.now();
    if (typeof carga.exp !== 'number' || !Number.isFinite(carga.exp)) return { ok: false };
    if (carga.exp * 1000 + TOLERANCIA_MS <= ahora) return { ok: false };
    if (carga.nbf !== undefined) {
      if (typeof carga.nbf !== 'number' || !Number.isFinite(carga.nbf)) return { ok: false };
      if (carga.nbf * 1000 > ahora + TOLERANCIA_MS) return { ok: false };
    }

    if (carga.iss !== 'https://' + dominio) return { ok: false };

    const audiencias = Array.isArray(carga.aud) ? carga.aud : [carga.aud];
    if (!audiencias.includes(audiencia)) return { ok: false };

    const correo = typeof carga.email === 'string' ? carga.email.trim().toLowerCase() : '';
    if (correo === '' || !permiso.has(correo)) return { ok: false };

    const llaves = await obtenerLlaves(dominio);
    const llave = llaves.find(candidata => candidata.kid === cabecera.kid);
    if (!llave) return { ok: false };

    let clave;
    try {
      clave = await crypto.subtle.importKey(
        'jwk',
        { kty: llave.kty || 'RSA', n: llave.n, e: llave.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
    } catch {
      return { ok: false };
    }

    const firmado = new TextEncoder().encode(partes[0] + '.' + partes[1]);
    const valida = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', clave, firma, firmado
    );
    if (!valida) return { ok: false };

    return { ok: true, correo };
  } catch {
    // Red caída, JWKS inválido, JSON roto, etc.: se deniega sin detalles.
    return { ok: false };
  }
}

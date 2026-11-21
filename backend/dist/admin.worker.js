/*
 * faro33-admin — Worker de administración de envíos (Cloudflare Workers + D1).
 * ARCHIVO GENERADO: no editar a mano
 * Fecha de generación: 2026-11-21T22:34:36.046Z
 * Fuente: src/lib (6 módulos) + src/admin-ui.js + src/admin.js + ../cuestionario/schema.json
 * Schema: cuestionario-proyecto v1 (60 campos)
 * Bindings: DB, ENC_KEY_V1...ENC_KEY_Vn, ACTIVE_KEY_VERSION, HMAC_KEY,
 *           ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS
 * Regenerar: node build.mjs --target admin --schema ../cuestionario/schema.json
 */

// ---- src/lib/cripto.js ----
/* Criptografía del Worker: AES-GCM-256 para el blob y HMAC-SHA256 para hashes.
 *
 * Reglas de seguridad:
 *   - La llave AES viaja en base64 (32 bytes = 256 bits) y se importa como CryptoKey.
 *   - El IV es aleatorio de 12 bytes y NUNCA se reutiliza con la misma llave.
 *   - El AAD es el folio: el texto cifrado queda atado a su fila; moverlo a otra
 *     fila (o cambiar el folio) hace que el descifrado falle.
 *   - Aquí no se registra nada en consola ni se devuelven mensajes con PII.
 */

const LARGO_LLAVE = 32;
const LARGO_IV = 12;
const LARGO_TAG = 128;

/** Convierte bytes (Uint8Array/ArrayBuffer) a base64 estándar. */
function b64(bytes) {
  const arreglo = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binario = '';
  // Por bloques para no desbordar la pila con textos grandes.
  const bloque = 0x8000;
  for (let i = 0; i < arreglo.length; i += bloque) {
    binario += String.fromCharCode.apply(null, arreglo.subarray(i, i + bloque));
  }
  return btoa(binario);
}

/** Decodifica base64 estándar de forma estricta y devuelve Uint8Array. */
function deb64(texto) {
  if (typeof texto !== 'string') throw new Error('base64_invalido');
  const limpio = texto.replace(/\s+/g, '');
  if (limpio.length === 0 || limpio.length % 4 === 1) throw new Error('base64_invalido');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(limpio)) throw new Error('base64_invalido');
  let binario;
  try {
    binario = atob(limpio);
  } catch {
    throw new Error('base64_invalido');
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function bytesDeLlave(base64) {
  if (typeof base64 !== 'string' || base64.trim() === '') {
    throw new Error('clave_invalida: se esperaba base64 de 32 bytes');
  }
  let bytes;
  try {
    bytes = deb64(base64);
  } catch {
    throw new Error('clave_invalida: base64 mal formado');
  }
  if (bytes.length !== LARGO_LLAVE) {
    throw new Error('clave_invalida: se esperaban 32 bytes (256 bits) y llegaron ' + bytes.length);
  }
  return bytes;
}

/** Importa una llave AES-GCM de 32 bytes en base64. Lanza error claro si no lo es. */
async function importarClaveAES(base64) {
  const bytes = bytesDeLlave(base64);
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Acepta una CryptoKey ya importada o el base64 de 32 bytes. */
async function resolverClave(clave) {
  if (typeof clave === 'string') return importarClaveAES(clave);
  if (clave && typeof clave === 'object' && clave.algorithm) return clave;
  throw new Error('clave_invalida');
}

/** Cifra un objeto JSON con AES-GCM-256. Devuelve {iv, ciphertext} en base64. */
async function cifrar(clave, objeto, folio) {
  if (typeof folio !== 'string' || folio === '') throw new Error('folio_invalido_para_aad');
  const llave = await resolverClave(clave);
  const iv = crypto.getRandomValues(new Uint8Array(LARGO_IV));
  const texto = JSON.stringify(objeto);
  const datos = new TextEncoder().encode(texto);
  const adicional = new TextEncoder().encode(folio);
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: adicional, tagLength: LARGO_TAG },
    llave,
    datos
  );
  return { iv: b64(iv), ciphertext: b64(new Uint8Array(cifrado)) };
}

/** Descifra {iv, ciphertext} con AAD = folio. Falla si el AAD o los bytes cambian. */
async function descifrar(clave, paquete, folio) {
  if (!paquete || typeof paquete !== 'object') throw new Error('paquete_invalido');
  if (typeof folio !== 'string' || folio === '') throw new Error('folio_invalido_para_aad');
  const llave = await resolverClave(clave);
  const iv = deb64(paquete.iv);
  const ciphertext = deb64(paquete.ciphertext);
  if (iv.length !== LARGO_IV) throw new Error('iv_invalido');
  const adicional = new TextEncoder().encode(folio);
  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: adicional, tagLength: LARGO_TAG },
    llave,
    ciphertext
  );
  return JSON.parse(new TextDecoder().decode(plano));
}

/** HMAC-SHA256 en hex minúsculas. La llave debe ser base64 de 32 bytes. */
async function hmacHex(claveHmacBase64, texto) {
  const bytes = bytesDeLlave(claveHmacBase64);
  const clave = await crypto.subtle.importKey(
    'raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(String(texto)));
  return Array.from(new Uint8Array(firma), byte => byte.toString(16).padStart(2, '0')).join('');
}

// ---- src/lib/llaves.js ----
/* Versionado de llaves de cifrado.
 *
 * Convención:
 *   - env.ENC_KEY_V<n> contiene la llave n en base64 (32 bytes).
 *   - env.ACTIVE_KEY_VERSION dice qué versión se usa para cifrar filas nuevas.
 *   - Las filas viejas se descifran con claveDeVersion(env, fila.key_version).
 *
 * Si la llave no existe, el error es siempre 'llave_no_configurada' y sin
 * detalles: no se revela configuración interna en respuestas ni en logs.
 */

function versionDe(texto, porOmision) {
  if (texto === undefined || texto === null || texto === '') return porOmision;
  const numero = Number(texto);
  return Number.isInteger(numero) && numero >= 1 ? numero : null;
}

/** Devuelve {version, clave} para una versión concreta. */
async function claveDeVersion(env, numero) {
  const version = versionDe(numero, null);
  if (version === null) throw new Error('llave_no_configurada');
  const base64 = env ? env['ENC_KEY_V' + version] : undefined;
  if (typeof base64 !== 'string' || base64.trim() === '') {
    throw new Error('llave_no_configurada');
  }
  try {
    const clave = await importarClaveAES(base64);
    return { version, clave };
  } catch {
    // Llave presente pero inválida: para el exterior es el mismo fallo de configuración.
    throw new Error('llave_no_configurada');
  }
}

/** Devuelve {version, clave} de la llave activa (ACTIVE_KEY_VERSION, por omisión 1). */
async function claveActiva(env) {
  const version = versionDe(env ? env.ACTIVE_KEY_VERSION : undefined, 1);
  if (version === null) throw new Error('llave_no_configurada');
  return claveDeVersion(env, version);
}

// ---- src/lib/util.js ----
/* Utilidades sin dependencias: teléfonos, fechas, folios, CORS y respuestas. */

const ORIGENES_POR_OMISION = 'https://faro33studio.com,https://www.faro33studio.com';
const FOLIO_RE = /^F33-[A-Z2-9]{6}$/;

/** Últimos 10 dígitos de un teléfono (sirve para comparar/hashear, no para validar). */
function normalizarTelefono(txt) {
  if (typeof txt !== 'string') return '';
  return txt.replace(/\D/g, '').slice(-10);
}

/** Fecha actual en ISO UTC, formato que guarda D1. */
function ahoraISO() {
  return new Date().toISOString();
}

/** Folio con el formato que genera el cliente: F33- + 6 caracteres A-Z/2-9. */
function foliosValido(folio) {
  return typeof folio === 'string' && FOLIO_RE.test(folio);
}

function conCabecerasBase(cabeceras) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(cabeceras || {})
  };
}

/** Respuesta JSON con no-store. cuerpo null/undefined => respuesta sin cuerpo. */
function respuestaJSON(estado, cuerpo, cabeceras) {
  const opciones = { status: estado, headers: conCabecerasBase(cabeceras) };
  if (cuerpo === undefined || cuerpo === null) return new Response(null, opciones);
  return new Response(JSON.stringify(cuerpo), opciones);
}

/** Convierte la lista de orígenes (texto separado por comas o arreglo) en arreglo. */
function listarOrigenes(permitidos) {
  const texto = Array.isArray(permitidos)
    ? permitidos.join(',')
    : (typeof permitidos === 'string' ? permitidos : ORIGENES_POR_OMISION);
  return texto.split(',').map(origen => origen.trim()).filter(Boolean);
}

/** ¿El Origin de la petición está en la lista permitida? */
function origenPermitido(origen, permitidos) {
  if (typeof origen !== 'string' || origen === '') return false;
  return listarOrigenes(permitidos).includes(origen);
}

/**
 * Cabeceras CORS. Access-Control-Allow-Origin se pone únicamente si el origen
 * está permitido; el resto de cabeceras son inocuas.
 */
function cors(origen, permitidos) {
  const cabeceras = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origenPermitido(origen, permitidos)) {
    cabeceras['Access-Control-Allow-Origin'] = origen;
    cabeceras['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    cabeceras['Access-Control-Allow-Headers'] = 'Content-Type';
    cabeceras['Access-Control-Max-Age'] = '86400';
  }
  return cabeceras;
}

/** Recorta a `maximo` caracteres; cualquier valor que no sea texto se vuelve ''. */
function limitarTexto(valor, maximo = 120) {
  if (typeof valor !== 'string') return '';
  const limpio = valor.trim();
  return limpio.length > maximo ? limpio.slice(0, maximo) : limpio;
}

// ---- src/lib/access.js ----
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
async function verificarAccess(request, env) {
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

// ---- src/lib/csv.js ----
/* Generación de CSV segura, sin dependencias.
 *
 * Dos riesgos que se atacan aquí:
 *   1. Inyección de fórmulas: una celda que empieza con = + - @ TAB o CR puede
 *      ejecutarse al abrir el archivo en una hoja de cálculo. Se prefija con '
 *      (apóstrofo) para que la hoja la trate como texto.
 *   2. Comillas, comas y saltos de línea: se aplica el escape de RFC 4180
 *      (comillas dobles duplicadas y campo entrecomillado).
 *
 * `columnas` acepta textos ("folio") u objetos {clave, etiqueta}. La etiqueta es
 * el encabezado visible; la clave indica qué propiedad de cada fila se usa.
 */

const PELIGRO_FORMULA = /^[=+\-@\t\r]/;

function etiquetaDe(columna) {
  if (typeof columna === 'string') return columna;
  if (columna && typeof columna === 'object') {
    if (typeof columna.etiqueta === 'string') return columna.etiqueta;
    if (typeof columna.clave === 'string') return columna.clave;
  }
  return '';
}

function claveDe(columna) {
  if (typeof columna === 'string') return columna;
  if (columna && typeof columna === 'object' && typeof columna.clave === 'string') {
    return columna.clave;
  }
  return etiquetaDe(columna);
}

function textoCSV(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  try {
    return JSON.stringify(valor);
  } catch {
    return '';
  }
}

/** Neutraliza fórmulas antes de escapar. */
function neutralizar(texto) {
  return PELIGRO_FORMULA.test(texto) ? "'" + texto : texto;
}

/** Escapa un campo según RFC 4180. */
function escapar(texto) {
  if (/[",\r\n]/.test(texto)) return '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

/**
 * Devuelve el CSV completo (texto). `opciones.bom` antepone BOM UTF-8 para que
 * Excel reconozca los acentos; por omisión no se añade.
 */
function aCSV(filas, columnas, opciones = {}) {
  const listaColumnas = Array.isArray(columnas) ? columnas : [];
  const listaFilas = Array.isArray(filas) ? filas : [];
  const lineas = [];

  lineas.push(
    listaColumnas
      .map(columna => escapar(neutralizar(etiquetaDe(columna))))
      .join(',')
  );

  for (const fila of listaFilas) {
    const celdas = listaColumnas.map(columna => {
      const clave = claveDe(columna);
      const valor = fila && typeof fila === 'object' ? fila[clave] : '';
      return escapar(neutralizar(textoCSV(valor)));
    });
    lineas.push(celdas.join(','));
  }

  const bom = opciones && opciones.bom ? '\uFEFF' : '';
  return bom + lineas.join('\r\n') + '\r\n';
}

// ---- src/lib/envio.js ----
/* Funciones puras para leer un envío descifrado y etiquetarlo con el schema.
 *
 * Este archivo se concatena en el dist y NO usa imports: `claveDeVersion` y
 * `descifrar` viven en el mismo ámbito del módulo generado.
 *
 * La PII solo existe aquí, en memoria, después de descifrar. Nunca se registra.
 */

const ESTADOS = [
  'nuevo',
  'contactado',
  'cotizando',
  'ganado',
  'perdido',
  'descartado'
];

function objeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function presente(valor) {
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'string') return valor.trim() !== '';
  return valor === true;
}

/** Traduce un valor de opción a su etiqueta; si no existe, deja el valor crudo. */
function traducirOpcion(campo, valor) {
  const opciones = Array.isArray(campo.opciones) ? campo.opciones : [];
  const encontrada = opciones.find(opcion => opcion && opcion.valor === valor);
  if (encontrada && typeof encontrada.etiqueta === 'string') return encontrada.etiqueta;
  return typeof valor === 'string' ? valor : String(valor);
}

function textoDe(valor) {
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return '';
}

/** Etiqueta legible de un campo según su tipo. Devuelve '' si está vacío. */
function valorEtiquetado(campo, valor) {
  if (!presente(valor)) return '';

  if (campo.tipo === 'checkbox') {
    if (!Array.isArray(valor)) return textoDe(valor);
    return valor
      .filter(item => item !== null && item !== undefined && item !== '')
      .map(item => traducirOpcion(campo, item))
      .filter(Boolean)
      .join(', ');
  }

  if (campo.tipo === 'select' || campo.tipo === 'radio') {
    return traducirOpcion(campo, valor);
  }

  if (campo.tipo === 'consent') return valor === true ? 'Sí' : '';

  return textoDe(valor);
}

/**
 * Descifra una fila de `submissions` (AAD = folio) y devuelve sus metadatos y
 * respuestas en claro. Lanza si la llave no existe o el cifrado no cuadra; el
 * llamador decide qué responder sin exponer el motivo.
 */
async function abrirFila(env, fila) {
  if (!objeto(fila) || typeof fila.folio !== 'string' || fila.folio === '') {
    throw new Error('fila_invalida');
  }
  const { clave } = await claveDeVersion(env, fila.key_version);
  const blob = await descifrar(
    clave,
    { iv: fila.iv, ciphertext: fila.ciphertext },
    fila.folio
  );
  return {
    folio: fila.folio,
    creado: typeof fila.created_at === 'string' ? fila.created_at : null,
    tipo: typeof fila.tipo === 'string' ? fila.tipo : null,
    estado: typeof fila.status === 'string' ? fila.status : null,
    origen: typeof fila.origen === 'string' ? fila.origen : null,
    cta: typeof fila.cta === 'string' ? fila.cta : null,
    respuestas: objeto(blob) && objeto(blob.respuestas) ? blob.respuestas : {},
    meta: objeto(blob) && objeto(blob.meta) ? blob.meta : {}
  };
}

/**
 * Recorre el schema en orden y devuelve [{seccion, etiqueta, valor}] solo con
 * campos contestados. Los valores de select/radio/checkbox se traducen a la
 * etiqueta que ve la dueña del estudio.
 */
function etiquetar(schema, respuestas) {
  const campos = [];
  const datos = objeto(respuestas) ? respuestas : {};
  const secciones = schema && Array.isArray(schema.secciones) ? schema.secciones : [];

  for (const seccion of secciones) {
    if (!seccion || !Array.isArray(seccion.campos)) continue;
    const titulo = typeof seccion.titulo === 'string' && seccion.titulo !== ''
      ? seccion.titulo
      : (typeof seccion.id === 'string' ? seccion.id : '');

    for (const campo of seccion.campos) {
      if (!campo || typeof campo.id !== 'string') continue;
      if (!Object.prototype.hasOwnProperty.call(datos, campo.id)) continue;
      const valor = valorEtiquetado(campo, datos[campo.id]);
      if (valor === '') continue;
      campos.push({
        seccion: titulo,
        etiqueta: typeof campo.etiqueta === 'string' ? campo.etiqueta : campo.id,
        valor
      });
    }
  }

  return campos;
}

// ---- schema embebido (mismo que cuestionario/schema.json) ----
const SCHEMA = {"id":"cuestionario-proyecto","version":1,"titulo":"Cuéntanos de tu proyecto","intro":"Responde lo que sepas; lo demás lo definimos juntos en la primera visita. Tarda unos 6 minutos y las preguntas de diseño son opcionales.","secciones":[{"id":"tipo","titulo":"Tu proyecto","campos":[{"id":"tipo","tipo":"radio","etiqueta":"¿Qué tipo de proyecto es?","requerido":true,"opciones":[{"valor":"residencial","etiqueta":"Residencial","ayuda":"Casa o departamento"},{"valor":"comercial","etiqueta":"Comercial","ayuda":"Restaurante, tienda, clínica, hotel…"},{"valor":"oficinas","etiqueta":"Oficinas","ayuda":"Oficinas corporativas o de equipo"}]}]},{"id":"contacto","titulo":"Cómo contactarte","mostrarSi":{"campo":"tipo","presente":true},"campos":[{"id":"nombre","tipo":"text","etiqueta":"Tu nombre","requerido":true,"max":80,"autocompletar":"name"},{"id":"telefono","tipo":"tel","etiqueta":"Teléfono / WhatsApp","requerido":true,"max":20,"autocompletar":"tel","ayuda":"10 dígitos"},{"id":"correo","tipo":"email","etiqueta":"Correo (opcional)","requerido":false,"max":120,"autocompletar":"email"},{"id":"ciudad","tipo":"text","etiqueta":"Ciudad del proyecto","requerido":true,"max":80,"valorInicial":"Culiacán"},{"id":"contacto_preferido","tipo":"radio","etiqueta":"¿Cómo prefieres que te contactemos?","requerido":true,"opciones":[{"valor":"whatsapp","etiqueta":"WhatsApp"},{"valor":"llamada","etiqueta":"Llamada"},{"valor":"correo","etiqueta":"Correo"}]}]},{"id":"proyecto","titulo":"Sobre el espacio","mostrarSi":{"campo":"tipo","presente":true},"campos":[{"id":"situacion","tipo":"radio","etiqueta":"¿En qué etapa está el inmueble?","requerido":true,"opciones":[{"valor":"obra_nueva","etiqueta":"Obra nueva o en construcción"},{"valor":"obra_gris","etiqueta":"Construido, sin acabados"},{"valor":"remodelacion","etiqueta":"Remodelación de un espacio en uso"}]},{"id":"m2","tipo":"select","etiqueta":"Superficie aproximada","requerido":true,"opciones":[{"valor":"menos_50","etiqueta":"Menos de 50 m²"},{"valor":"50_100","etiqueta":"50 a 100 m²"},{"valor":"100_150","etiqueta":"100 a 150 m²"},{"valor":"150_250","etiqueta":"150 a 250 m²"},{"valor":"250_500","etiqueta":"250 a 500 m²"},{"valor":"mas_500","etiqueta":"Más de 500 m²"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"alcance","tipo":"checkbox","etiqueta":"¿Qué necesitas?","requerido":true,"opciones":[{"valor":"diseno_planos","etiqueta":"Diseño y planos"},{"valor":"obra_acabados","etiqueta":"Obra y acabados"},{"valor":"carpinteria","etiqueta":"Carpintería a medida"},{"valor":"mobiliario","etiqueta":"Mobiliario y decoración"},{"valor":"iluminacion","etiqueta":"Iluminación"},{"valor":"cortinas","etiqueta":"Cortinas"},{"valor":"llave_en_mano","etiqueta":"Todo, llave en mano"}]},{"id":"plazo","tipo":"radio","etiqueta":"¿Cuándo te gustaría empezar?","requerido":true,"opciones":[{"valor":"ya","etiqueta":"Lo antes posible"},{"valor":"1_3_meses","etiqueta":"En 1 a 3 meses"},{"valor":"3_6_meses","etiqueta":"En 3 a 6 meses"},{"valor":"explorando","etiqueta":"Solo estoy explorando"}]},{"id":"inversion","tipo":"select","etiqueta":"Inversión aproximada (con IVA)","requerido":false,"ayuda":"Es solo para orientarnos; cada proyecto se cotiza sobre su levantamiento.","opciones":[{"valor":"menos_250k","etiqueta":"Menos de $250 mil"},{"valor":"250k_700k","etiqueta":"$250 mil a $700 mil"},{"valor":"700k_1_5m","etiqueta":"$700 mil a $1.5 millones"},{"valor":"1_5m_3_5m","etiqueta":"$1.5 a $3.5 millones"},{"valor":"mas_3_5m","etiqueta":"Más de $3.5 millones"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]}]},{"id":"diseno","titulo":"Tu estilo","descripcion":"Opcional, pero nos ayuda mucho a proponerte algo que sí te represente. Si no sabes, déjalo en blanco.","mostrarSi":{"campo":"tipo","presente":true},"campos":[{"id":"d_ambiente","tipo":"checkbox","etiqueta":"¿Cómo quieres que se sienta el espacio? (elige hasta 3)","requerido":false,"opciones":[{"valor":"calido","etiqueta":"Cálido"},{"valor":"sereno","etiqueta":"Sereno"},{"valor":"elegante","etiqueta":"Elegante"},{"valor":"atrevido","etiqueta":"Atrevido"},{"valor":"minimalista","etiqueta":"Minimalista"},{"valor":"acogedor","etiqueta":"Acogedor"},{"valor":"luminoso","etiqueta":"Luminoso"},{"valor":"sobrio","etiqueta":"Sobrio"}],"maxSeleccion":3},{"id":"d_paleta","tipo":"checkbox","etiqueta":"Paleta de colores que te atrae","requerido":false,"opciones":[{"valor":"neutros_claros","etiqueta":"Neutros claros (blancos, beige, arena)"},{"valor":"tierra","etiqueta":"Tonos tierra (café, terracota, oliva)"},{"valor":"oscuros","etiqueta":"Oscuros con contraste (negro, grafito, azul profundo)"},{"valor":"color_vibrante","etiqueta":"Color vibrante en acentos"},{"valor":"blanco_madera","etiqueta":"Blanco con madera"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"d_materiales","tipo":"checkbox","etiqueta":"Materiales que te gustan","requerido":false,"opciones":[{"valor":"madera","etiqueta":"Madera"},{"valor":"piedra_marmol","etiqueta":"Piedra o mármol"},{"valor":"concreto","etiqueta":"Concreto o microcemento"},{"valor":"metal","etiqueta":"Metal (latón, negro)"},{"valor":"vidrio_espejo","etiqueta":"Vidrio y espejos"},{"valor":"textiles","etiqueta":"Textiles y tapices"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"d_luz","tipo":"radio","etiqueta":"Iluminación que prefieres","requerido":false,"opciones":[{"valor":"calida_tenue","etiqueta":"Cálida y tenue"},{"valor":"neutra_clara","etiqueta":"Neutra y clara"},{"valor":"mixta_regulable","etiqueta":"Mixta, con regulación (dimmer)"},{"valor":"acentos_led","etiqueta":"Con acentos LED en muebles y muros"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"d_prioridad","tipo":"radio","etiqueta":"Lo que más pesa en tu decisión","requerido":false,"opciones":[{"valor":"estetica","etiqueta":"Que se vea espectacular"},{"valor":"funcionalidad","etiqueta":"Que funcione perfecto"},{"valor":"durabilidad","etiqueta":"Que dure muchos años"},{"valor":"rapidez","etiqueta":"Que quede pronto"},{"valor":"costo","etiqueta":"Cuidar el presupuesto"}]},{"id":"d_smart","tipo":"radio","etiqueta":"¿Te interesa automatizar luces y cortinas?","requerido":false,"opciones":[{"valor":"si","etiqueta":"Sí"},{"valor":"quizas","etiqueta":"Quizás más adelante"},{"valor":"no","etiqueta":"No"}]},{"id":"d_evitar","tipo":"textarea","etiqueta":"¿Qué NO te gusta o quieres evitar?","requerido":false,"max":300,"ayuda":"Colores, materiales, formas, estilos…"},{"id":"d_decide","tipo":"radio","etiqueta":"¿Quién toma la decisión final?","requerido":false,"opciones":[{"valor":"yo","etiqueta":"Yo"},{"valor":"pareja_familia","etiqueta":"En pareja o familia"},{"valor":"socios","etiqueta":"Socios o comité"}]}]},{"id":"residencial","titulo":"Tu casa o departamento","mostrarSi":{"campo":"tipo","igual":"residencial"},"campos":[{"id":"res_inmueble","tipo":"radio","etiqueta":"¿Qué tipo de inmueble es?","requerido":true,"opciones":[{"valor":"casa","etiqueta":"Casa"},{"valor":"departamento","etiqueta":"Departamento"},{"valor":"casa_fraccionamiento","etiqueta":"Casa en fraccionamiento privado"},{"valor":"otro","etiqueta":"Otro"}]},{"id":"res_espacios","tipo":"checkbox","etiqueta":"¿Qué espacios quieres trabajar?","requerido":true,"opciones":[{"valor":"sala","etiqueta":"Sala"},{"valor":"comedor","etiqueta":"Comedor"},{"valor":"cocina","etiqueta":"Cocina"},{"valor":"recamara_principal","etiqueta":"Recámara principal"},{"valor":"recamaras","etiqueta":"Otras recámaras"},{"valor":"banos","etiqueta":"Baños"},{"valor":"tv","etiqueta":"Cuarto o muro de TV"},{"valor":"estudio","etiqueta":"Estudio / oficina en casa"},{"valor":"terraza","etiqueta":"Terraza o jardín"},{"valor":"todo","etiqueta":"Toda la casa"}]},{"id":"res_ocupantes","tipo":"select","etiqueta":"¿Cuántas personas viven ahí?","requerido":true,"opciones":[{"valor":"1_2","etiqueta":"1 a 2"},{"valor":"3_4","etiqueta":"3 a 4"},{"valor":"5_mas","etiqueta":"5 o más"}]},{"id":"res_hogar","tipo":"checkbox","etiqueta":"En casa hay…","requerido":false,"opciones":[{"valor":"ninos","etiqueta":"Niños"},{"valor":"adultos_mayores","etiqueta":"Adultos mayores"},{"valor":"mascotas","etiqueta":"Mascotas"}]},{"id":"res_estilo","tipo":"checkbox","etiqueta":"¿Qué estilo te atrae?","requerido":false,"opciones":[{"valor":"contemporaneo","etiqueta":"Contemporáneo"},{"valor":"minimalista","etiqueta":"Minimalista"},{"valor":"calido","etiqueta":"Cálido y orgánico"},{"valor":"clasico","etiqueta":"Clásico"},{"valor":"rustico","etiqueta":"Rústico"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"res_ocupada","tipo":"radio","etiqueta":"Durante la obra, la casa estará…","requerido":true,"mostrarSi":{"campo":"situacion","igual":"remodelacion"},"opciones":[{"valor":"habitada","etiqueta":"Habitada"},{"valor":"desocupada","etiqueta":"Desocupada"}]},{"id":"res_muebles","tipo":"radio","etiqueta":"¿Reutilizarías muebles que ya tienes?","requerido":false,"opciones":[{"valor":"mucho","etiqueta":"Sí, la mayoría"},{"valor":"algo","etiqueta":"Algunos"},{"valor":"nada","etiqueta":"Casi ninguno"}]},{"id":"res_vida","tipo":"checkbox","etiqueta":"Lo que más haces en casa","requerido":false,"opciones":[{"valor":"recibir","etiqueta":"Recibir invitados"},{"valor":"cocinar","etiqueta":"Cocinar"},{"valor":"home_office","etiqueta":"Trabajar desde casa"},{"valor":"cine","etiqueta":"Ver TV o cine"},{"valor":"ninos","etiqueta":"Que jueguen los niños"},{"valor":"ejercicio","etiqueta":"Ejercicio o yoga"},{"valor":"jardin","etiqueta":"Estar en terraza o jardín"},{"valor":"descanso","etiqueta":"Descansar y leer"}]},{"id":"res_almacenaje","tipo":"radio","etiqueta":"¿Cuánto espacio de guardado necesitas?","requerido":false,"opciones":[{"valor":"mucho","etiqueta":"Mucho (closets, alacenas, bodega)"},{"valor":"moderado","etiqueta":"Moderado"},{"valor":"poco","etiqueta":"Poco, prefiero lo minimalista"}]},{"id":"res_cocina_tipo","tipo":"radio","etiqueta":"Tu cocina ideal","requerido":false,"opciones":[{"valor":"isla","etiqueta":"Abierta, con isla"},{"valor":"semiabierta","etiqueta":"Semiabierta"},{"valor":"cerrada","etiqueta":"Cerrada"},{"valor":"no_se","etiqueta":"Aún no lo sé"}],"mostrarSi":{"campo":"res_espacios","contiene":"cocina"}},{"id":"res_cocina_uso","tipo":"radio","etiqueta":"¿Qué tanto cocinas?","requerido":false,"opciones":[{"valor":"intenso","etiqueta":"A diario y con ganas"},{"valor":"ligero","etiqueta":"A diario, cosas sencillas"},{"valor":"ocasional","etiqueta":"Ocasionalmente"}],"mostrarSi":{"campo":"res_espacios","contiene":"cocina"}},{"id":"res_recamara","tipo":"checkbox","etiqueta":"En la recámara principal te gustaría…","requerido":false,"opciones":[{"valor":"vestidor","etiqueta":"Vestidor"},{"valor":"closet_medida","etiqueta":"Closet a la medida"},{"valor":"bano_suite","etiqueta":"Baño en suite"},{"valor":"cabecera","etiqueta":"Cabecera de diseño"},{"valor":"escritorio","etiqueta":"Escritorio"}],"mostrarSi":{"campo":"res_espacios","contiene":"recamara_principal"}},{"id":"res_tv_tamano","tipo":"radio","etiqueta":"Tu pantalla de TV","requerido":false,"opciones":[{"valor":"55_65","etiqueta":"55 a 65 pulgadas"},{"valor":"75_mas","etiqueta":"75 pulgadas o más"},{"valor":"proyector","etiqueta":"Proyector"},{"valor":"no_se","etiqueta":"Aún no lo sé"}],"mostrarSi":{"campo":"res_espacios","contiene":"tv"}},{"id":"res_tv_extras","tipo":"checkbox","etiqueta":"En el muro de TV te interesa…","requerido":false,"opciones":[{"valor":"led","etiqueta":"Luz LED"},{"valor":"torres","etiqueta":"Torres con repisas"},{"valor":"cables","etiqueta":"Ocultar cables"},{"valor":"panel_flotante","etiqueta":"Panel flotante"},{"valor":"sonido","etiqueta":"Barra de sonido integrada"}],"mostrarSi":{"campo":"res_espacios","contiene":"tv"}}]},{"id":"comercial","titulo":"Tu negocio","mostrarSi":{"campo":"tipo","igual":"comercial"},"campos":[{"id":"com_giro","tipo":"select","etiqueta":"¿Qué tipo de negocio es?","requerido":true,"opciones":[{"valor":"restaurante","etiqueta":"Restaurante, cafetería o bar"},{"valor":"retail","etiqueta":"Tienda o showroom"},{"valor":"belleza","etiqueta":"Salón, spa o estética"},{"valor":"salud","etiqueta":"Clínica o consultorio"},{"valor":"hospedaje","etiqueta":"Hotel u hospedaje"},{"valor":"gimnasio","etiqueta":"Gimnasio o estudio"},{"valor":"otro","etiqueta":"Otro"}]},{"id":"com_giro_otro","tipo":"text","etiqueta":"Cuéntanos qué giro es","requerido":true,"max":80,"mostrarSi":{"campo":"com_giro","igual":"otro"}},{"id":"com_aforo","tipo":"select","etiqueta":"Personas a la vez en el espacio (aprox.)","requerido":true,"opciones":[{"valor":"menos_20","etiqueta":"Menos de 20"},{"valor":"20_50","etiqueta":"20 a 50"},{"valor":"50_100","etiqueta":"50 a 100"},{"valor":"mas_100","etiqueta":"Más de 100"}]},{"id":"com_marca","tipo":"radio","etiqueta":"¿Tienes identidad de marca?","requerido":true,"opciones":[{"valor":"manual","etiqueta":"Sí, logotipo y manual de marca"},{"valor":"logo","etiqueta":"Tengo logotipo, sin manual"},{"valor":"ninguna","etiqueta":"Todavía no"}]},{"id":"com_apertura","tipo":"radio","etiqueta":"¿Para cuándo necesitas abrir?","requerido":true,"opciones":[{"valor":"menos_3_meses","etiqueta":"En menos de 3 meses"},{"valor":"3_6_meses","etiqueta":"En 3 a 6 meses"},{"valor":"mas_6_meses","etiqueta":"En más de 6 meses"},{"valor":"ya_opera","etiqueta":"Ya opera, es renovación"}]},{"id":"com_cierre","tipo":"radio","etiqueta":"Durante la obra, el negocio…","requerido":true,"mostrarSi":{"campo":"com_apertura","igual":"ya_opera"},"opciones":[{"valor":"cierra","etiqueta":"Puede cerrar"},{"valor":"parcial","etiqueta":"Debe seguir abierto en parte"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"com_permisos","tipo":"radio","etiqueta":"Licencias y permisos del local","requerido":false,"opciones":[{"valor":"listos","etiqueta":"Listos"},{"valor":"tramite","etiqueta":"En trámite"},{"valor":"pendientes","etiqueta":"Aún no los inicio"},{"valor":"no_se","etiqueta":"No sé"}]},{"id":"com_sucursales","tipo":"radio","etiqueta":"¿Será una sola sucursal?","requerido":false,"opciones":[{"valor":"unica","etiqueta":"Sí, única"},{"valor":"varias","etiqueta":"Es la primera de varias"}]},{"id":"com_experiencia","tipo":"checkbox","etiqueta":"¿Qué debe sentir tu cliente al entrar?","requerido":false,"opciones":[{"valor":"rapidez","etiqueta":"Rapidez y orden"},{"valor":"intimidad","etiqueta":"Intimidad"},{"valor":"premium","etiqueta":"Algo premium"},{"valor":"familiar","etiqueta":"Ambiente familiar"},{"valor":"creativo","etiqueta":"Creatividad"},{"valor":"fotos","etiqueta":"Que sea 'fotografiable' para redes"}]},{"id":"com_cliente","tipo":"checkbox","etiqueta":"¿Quién es tu cliente principal?","requerido":false,"opciones":[{"valor":"familias","etiqueta":"Familias"},{"valor":"jovenes","etiqueta":"Jóvenes"},{"valor":"ejecutivos","etiqueta":"Ejecutivos"},{"valor":"turistas","etiqueta":"Turistas"},{"valor":"alto_ingreso","etiqueta":"Clientes de alto ingreso"}]},{"id":"com_zonas","tipo":"checkbox","etiqueta":"Zonas que necesita el espacio","requerido":false,"opciones":[{"valor":"recepcion","etiqueta":"Recepción o mostrador"},{"valor":"barra","etiqueta":"Barra"},{"valor":"cocina_vista","etiqueta":"Cocina a la vista"},{"valor":"mesas","etiqueta":"Zona de mesas"},{"valor":"vitrinas","etiqueta":"Vitrinas o exhibición"},{"valor":"cabinas","etiqueta":"Cabinas o probadores"},{"valor":"espera","etiqueta":"Sala de espera"},{"valor":"fachada","etiqueta":"Fachada y rótulo"}]},{"id":"com_mobiliario","tipo":"radio","etiqueta":"Mobiliario","requerido":false,"opciones":[{"valor":"medida","etiqueta":"A la medida"},{"valor":"comprado","etiqueta":"Comprado"},{"valor":"mixto","etiqueta":"Mezcla de ambos"}]}]},{"id":"oficinas","titulo":"Tus oficinas","mostrarSi":{"campo":"tipo","igual":"oficinas"},"campos":[{"id":"ofi_personas","tipo":"select","etiqueta":"¿Cuántas personas trabajarán ahí?","requerido":true,"opciones":[{"valor":"1_10","etiqueta":"1 a 10"},{"valor":"11_25","etiqueta":"11 a 25"},{"valor":"26_60","etiqueta":"26 a 60"},{"valor":"mas_60","etiqueta":"Más de 60"}]},{"id":"ofi_modelo","tipo":"radio","etiqueta":"¿Cómo trabaja el equipo?","requerido":true,"opciones":[{"valor":"fijos","etiqueta":"Puestos fijos, presencial"},{"valor":"hibrido","etiqueta":"Híbrido, escritorios compartidos"},{"valor":"mixto","etiqueta":"Mixto"}]},{"id":"ofi_espacios","tipo":"checkbox","etiqueta":"¿Qué áreas necesitas?","requerido":true,"opciones":[{"valor":"recepcion","etiqueta":"Recepción y sala de espera"},{"valor":"juntas","etiqueta":"Salas de juntas"},{"valor":"privados","etiqueta":"Oficinas privadas"},{"valor":"operativa","etiqueta":"Área operativa abierta"},{"valor":"cocineta","etiqueta":"Cocineta o comedor"},{"valor":"descanso","etiqueta":"Área de descanso"},{"valor":"capacitacion","etiqueta":"Sala de capacitación"},{"valor":"rack","etiqueta":"Cuarto de servidores o rack"},{"valor":"archivo","etiqueta":"Archivo o bodega"}]},{"id":"ofi_acustica","tipo":"radio","etiqueta":"¿Qué tan importante es el control del ruido?","requerido":false,"opciones":[{"valor":"mucho","etiqueta":"Muy importante"},{"valor":"moderada","etiqueta":"Moderada"},{"valor":"poco","etiqueta":"Poco"}]},{"id":"ofi_cableado","tipo":"radio","etiqueta":"Cableado de datos y eléctrico","requerido":false,"opciones":[{"valor":"existe","etiqueta":"Ya existe"},{"valor":"nuevo","etiqueta":"Hay que hacerlo nuevo"},{"valor":"no_se","etiqueta":"No sé"}]},{"id":"ofi_inmueble","tipo":"radio","etiqueta":"El espacio es…","requerido":true,"opciones":[{"valor":"propio","etiqueta":"Propio"},{"valor":"rentado","etiqueta":"Rentado"}]},{"id":"ofi_horario","tipo":"radio","etiqueta":"Horario para trabajar en obra","requerido":false,"opciones":[{"valor":"libre","etiqueta":"Podemos entrar de noche o fines de semana"},{"valor":"oficina","etiqueta":"Solo en horario de oficina"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"ofi_cultura","tipo":"radio","etiqueta":"Cultura de la empresa","requerido":false,"opciones":[{"valor":"formal","etiqueta":"Formal y corporativa"},{"valor":"creativa","etiqueta":"Creativa y dinámica"},{"valor":"relajada","etiqueta":"Relajada"},{"valor":"mixta","etiqueta":"Mixta"}]},{"id":"ofi_marca_color","tipo":"radio","etiqueta":"Colores de la marca en la oficina","requerido":false,"opciones":[{"valor":"visibles","etiqueta":"Bien visibles"},{"valor":"sutil","etiqueta":"De forma sutil"},{"valor":"no","etiqueta":"No los usaría"}]},{"id":"ofi_privacidad","tipo":"radio","etiqueta":"Distribución","requerido":false,"opciones":[{"valor":"abierta","etiqueta":"Abierta"},{"valor":"mixta","etiqueta":"Mixta"},{"valor":"privada","etiqueta":"Mayormente privada"}]},{"id":"ofi_visitas","tipo":"radio","etiqueta":"¿Reciben clientes en la oficina?","requerido":false,"opciones":[{"valor":"frecuente","etiqueta":"Con frecuencia"},{"valor":"ocasional","etiqueta":"Ocasionalmente"},{"valor":"casi_nunca","etiqueta":"Casi nunca"}]}]},{"id":"cierre","titulo":"Para terminar","mostrarSi":{"campo":"tipo","presente":true},"campos":[{"id":"referencias","tipo":"textarea","etiqueta":"Enlaces de referencia (Pinterest, Instagram…)","requerido":false,"max":500,"ayuda":"Si tienes fotos o planos, mándalos por WhatsApp después."},{"id":"comentarios","tipo":"textarea","etiqueta":"¿Algo más que debamos saber?","requerido":false,"max":800},{"id":"origen","tipo":"select","etiqueta":"¿Cómo nos conociste?","requerido":false,"opciones":[{"valor":"instagram","etiqueta":"Instagram"},{"valor":"facebook","etiqueta":"Facebook o anuncio"},{"valor":"google","etiqueta":"Google"},{"valor":"recomendacion","etiqueta":"Recomendación"},{"valor":"ya_conocia","etiqueta":"Ya los conocía"},{"valor":"otro","etiqueta":"Otro"}]},{"id":"consentimiento","tipo":"consent","etiqueta":"He leído el Aviso de privacidad y acepto que Faro 33 Studio use mis datos para contactarme sobre mi proyecto.","enlace":{"texto":"Aviso de privacidad","href":"/aviso-de-privacidad/"},"requerido":true}]}]};

// ---- src/admin-ui.js ----
/* HTML del panel de administración, con CSS y JS embebidos.
 *
 * Reglas que no se deben romper:
 *   - Sin recursos externos: todo vive en esta cadena.
 *   - Todo dato dinámico se pinta con textContent; nunca se interpreta HTML.
 *   - Móvil primero: a 390 px la tabla se convierte en tarjetas sin scroll lateral.
 *   - Objetivos táctiles de 44 px como mínimo y contraste AA.
 *
 * El HTML se construye con una plantilla para que sea fácil de leer; dentro del
 * script embebido no se usan plantillas ni comillas invertidas.
 */

const HTML_ADMIN = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Faro 33 · Envíos</title>
<style>
  :root {
    --navy: #10263d;
    --navy-2: #1d3a57;
    --crema: #f7f1e3;
    --crema-2: #efe6d2;
    --blanco: #fffdf7;
    --texto: #17202a;
    --tenue: #425466;
    --linea: #b9ab90;
    --rojo: #8c1d18;
    --verde: #1f5c3a;
    --foco: #0b5cad;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; max-width: 100%; overflow-x: hidden; }
  body {
    background: var(--crema);
    color: var(--texto);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.45;
  }
  h1, h2, h3, h4 { color: var(--navy); line-height: 1.2; margin: 0 0 .5rem; }
  h1 { font-size: 1.45rem; letter-spacing: .01em; }
  h2 { font-size: 1.15rem; }
  h3 { font-size: 1.05rem; margin-top: 1.1rem; }
  p { margin: .4rem 0; }
  a { color: var(--navy); }
  .cabecera {
    background: var(--navy);
    color: var(--crema);
    padding: 1rem 1rem .85rem;
  }
  .cabecera h1 { color: var(--crema); margin: 0; }
  .cabecera .sub { color: #e8dfca; margin: .25rem 0 0; font-size: .92rem; }
  .aviso {
    position: sticky;
    top: 0;
    z-index: 20;
    background: #fbe9c8;
    color: #5a3a00;
    border-bottom: 2px solid #b07a12;
    padding: .7rem 1rem;
    font-weight: 700;
    text-align: center;
    font-size: .95rem;
  }
  .contenedor { max-width: 1100px; margin: 0 auto; padding: 1rem; }
  .panel {
    background: var(--blanco);
    border: 1px solid var(--linea);
    border-radius: 14px;
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 2px rgba(16, 38, 61, .08);
  }
  .filtros {
    display: grid;
    grid-template-columns: 1fr;
    gap: .75rem;
  }
  .filtros label, .detalle-estado label, .detalle-borrar label {
    display: block;
    font-weight: 700;
    color: var(--navy);
    font-size: .92rem;
  }
  input, select, button {
    font: inherit;
    min-height: 44px;
    border-radius: 10px;
  }
  input, select {
    width: 100%;
    margin-top: .25rem;
    padding: .55rem .65rem;
    border: 1px solid #7b8794;
    background: #fffefb;
    color: var(--texto);
  }
  button {
    border: 1px solid var(--navy);
    background: var(--navy);
    color: #fffdf7;
    padding: .6rem 1rem;
    font-weight: 700;
    cursor: pointer;
  }
  button:hover { background: var(--navy-2); }
  button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 3px solid var(--foco);
    outline-offset: 2px;
  }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.secundario {
    background: transparent;
    color: var(--navy);
    border: 2px solid var(--navy);
  }
  button.secundario:hover { background: var(--crema-2); }
  button.peligro { background: var(--rojo); border-color: var(--rojo); }
  button.peligro:hover { background: #6d1511; }
  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    align-items: center;
    margin-top: 1rem;
  }
  .resumen { color: var(--tenue); font-size: .92rem; }
  .tabla-envoltura { width: 100%; overflow-x: hidden; }
  table.tabla {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .tabla th, .tabla td {
    text-align: left;
    padding: .65rem .5rem;
    border-bottom: 1px solid var(--crema-2);
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .tabla th {
    background: var(--navy);
    color: var(--crema);
    font-size: .85rem;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .tabla tbody tr { cursor: pointer; }
  .tabla tbody tr:hover, .tabla tbody tr:focus {
    background: #fdf7e8;
    outline: 2px solid var(--navy);
    outline-offset: -2px;
  }
  .folio { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; }
  .chip {
    display: inline-block;
    border: 1px solid var(--navy);
    border-radius: 999px;
    padding: .1rem .55rem;
    font-size: .82rem;
    background: var(--crema-2);
    color: var(--navy);
    white-space: nowrap;
  }
  .paginacion {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    align-items: center;
    justify-content: space-between;
    margin-top: 1rem;
  }
  .paginacion span { color: var(--tenue); }
  .vacio { color: var(--tenue); padding: .75rem 0; }
  .cargando { color: var(--tenue); padding: .5rem 0; }
  dialog {
    width: min(720px, calc(100% - 1.5rem));
    max-height: calc(100% - 2rem);
    overflow-y: auto;
    border: 1px solid var(--linea);
    border-radius: 16px;
    padding: 1rem;
    background: var(--blanco);
    color: var(--texto);
  }
  dialog::backdrop { background: rgba(16, 38, 61, .65); }
  .detalle-cabecera {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: .75rem;
  }
  .detalle-cabecera h2 { margin: 0; }
  .meta { color: var(--tenue); font-size: .92rem; }
  .grupo { border-top: 1px solid var(--crema-2); padding-top: .35rem; }
  dl { margin: 0 0 .5rem; }
  dt { font-weight: 700; color: var(--navy); margin-top: .55rem; }
  dd { margin: .1rem 0 0; overflow-wrap: anywhere; }
  .detalle-estado, .detalle-borrar {
    border-top: 2px solid var(--crema-2);
    margin-top: 1rem;
    padding-top: .75rem;
  }
  .detalle-borrar p { color: var(--tenue); font-size: .92rem; }
  .detalle-borrar input { margin-bottom: .5rem; }
  .aviso-error { color: var(--rojo); font-weight: 700; }
  .aviso-ok { color: var(--verde); font-weight: 700; }
  .pie { color: var(--tenue); font-size: .82rem; text-align: center; padding: 0 1rem 2rem; }
  @media (min-width: 640px) {
    .filtros { grid-template-columns: repeat(3, minmax(0, 1fr)) auto auto; align-items: end; }
  }
  @media (max-width: 639px) {
    .tabla thead { display: none; }
    .tabla, .tabla tbody, .tabla tr, .tabla td { display: block; width: 100%; }
    .tabla tbody tr {
      border: 1px solid var(--linea);
      border-radius: 12px;
      margin-bottom: .75rem;
      padding: .4rem .6rem;
      background: var(--blanco);
    }
    .tabla td {
      display: flex;
      justify-content: space-between;
      gap: .75rem;
      border-bottom: 1px solid var(--crema-2);
      padding: .5rem .1rem;
      text-align: right;
    }
    .tabla td:last-child { border-bottom: 0; }
    .tabla td::before {
      content: attr(data-etiqueta);
      color: var(--navy);
      font-weight: 700;
      text-align: left;
      flex: 0 0 45%;
    }
  }
</style>
</head>
<body>
<header class="cabecera">
  <h1>Faro 33 · Envíos</h1>
  <p class="sub">Panel privado de la dueña del estudio. Solo lectura descifrada con su sesión.</p>
</header>
<div class="aviso" role="note">Contiene datos personales: no compartas capturas</div>
<main class="contenedor">
  <section class="panel" aria-labelledby="titulo-filtros">
    <h2 id="titulo-filtros">Buscar envíos</h2>
    <form id="filtros" class="filtros">
      <label for="tipo">Tipo
        <select id="tipo">
          <option value="">Todos</option>
          <option value="residencial">Residencial</option>
          <option value="comercial">Comercial</option>
          <option value="oficinas">Oficinas</option>
        </select>
      </label>
      <label for="estado">Estado
        <select id="estado">
          <option value="">Todos</option>
          <option value="nuevo">Nuevo</option>
          <option value="contactado">Contactado</option>
          <option value="cotizando">Cotizando</option>
          <option value="ganado">Ganado</option>
          <option value="perdido">Perdido</option>
          <option value="descartado">Descartado</option>
        </select>
      </label>
      <label for="tel">Teléfono
        <input id="tel" name="tel" type="tel" inputmode="tel" autocomplete="off" placeholder="10 dígitos o +52">
      </label>
      <button type="submit">Buscar</button>
      <button type="button" id="limpiar" class="secundario">Limpiar</button>
    </form>
    <div class="acciones">
      <button type="button" id="exportar">Exportar CSV</button>
      <span id="resumen" class="resumen" aria-live="polite"></span>
    </div>
  </section>

  <section class="panel" aria-labelledby="titulo-lista">
    <h2 id="titulo-lista">Envíos recibidos</h2>
    <p id="cargando" class="cargando" hidden>Cargando…</p>
    <div class="tabla-envoltura">
      <table class="tabla" id="tabla">
        <thead>
          <tr>
            <th scope="col">Folio</th>
            <th scope="col">Fecha</th>
            <th scope="col">Tipo</th>
            <th scope="col">Estado</th>
            <th scope="col">Origen</th>
            <th scope="col">CTA</th>
          </tr>
        </thead>
        <tbody id="filas"></tbody>
      </table>
    </div>
    <p id="vacio" class="vacio" hidden>No hay envíos con estos filtros.</p>
    <nav class="paginacion" aria-label="Paginación">
      <button type="button" id="anterior">Anterior</button>
      <span id="pagina-info" aria-live="polite"></span>
      <button type="button" id="siguiente">Siguiente</button>
    </nav>
  </section>
  <p class="pie">Faro 33 Studio · Los datos se muestran solo en esta sesión y no se guardan en el navegador.</p>
</main>

<dialog id="detalle" aria-labelledby="detalle-titulo">
  <div class="detalle-cabecera">
    <h2 id="detalle-titulo">Envío</h2>
    <button type="button" id="cerrar" class="secundario">Cerrar</button>
  </div>
  <p id="detalle-meta" class="meta"></p>
  <div id="detalle-campos"></div>

  <div class="detalle-estado">
    <label for="nuevo-estado">Estado del envío</label>
    <select id="nuevo-estado">
      <option value="nuevo">Nuevo</option>
      <option value="contactado">Contactado</option>
      <option value="cotizando">Cotizando</option>
      <option value="ganado">Ganado</option>
      <option value="perdido">Perdido</option>
      <option value="descartado">Descartado</option>
    </select>
    <div class="acciones">
      <button type="button" id="guardar-estado">Guardar estado</button>
    </div>
  </div>

  <div class="detalle-borrar">
    <h3>Borrar (ARCO)</h3>
    <p>El borrado es definitivo y no se puede deshacer. Para confirmarlo, escribe el folio exacto de este envío.</p>
    <label for="confirmar-folio">Folio de confirmación</label>
    <input id="confirmar-folio" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false">
    <div class="acciones">
      <button type="button" id="borrar" class="peligro">Borrar (ARCO)</button>
    </div>
  </div>

  <p id="detalle-aviso" role="status"></p>
</dialog>

<script>
(function () {
  'use strict';

  var POR_PAGINA = 25;
  var pagina = 1;
  var total = 0;
  var filtros = { tipo: '', estado: '', tel: '' };
  var folioActual = null;
  var estadoActual = null;

  var ETIQUETAS_ESTADO = {
    nuevo: 'Nuevo',
    contactado: 'Contactado',
    cotizando: 'Cotizando',
    ganado: 'Ganado',
    perdido: 'Perdido',
    descartado: 'Descartado'
  };

  function porId(id) {
    return document.getElementById(id);
  }

  function crear(tag, clase, texto) {
    var elemento = document.createElement(tag);
    if (clase) elemento.className = clase;
    if (texto !== undefined && texto !== null) elemento.textContent = String(texto);
    return elemento;
  }

  function limpiar(nodo) {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  }

  function fechaLocal(iso) {
    if (!iso) return '—';
    var fecha = new Date(iso);
    if (isNaN(fecha.getTime())) return String(iso);
    try {
      return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Mazatlan'
      }).format(fecha);
    } catch (error) {
      return fecha.toISOString();
    }
  }

  function textoEstado(estado) {
    return ETIQUETAS_ESTADO[estado] || estado || '—';
  }

  function textoONada(valor) {
    return (valor === null || valor === undefined || valor === '') ? '—' : String(valor);
  }

  function consulta() {
    var partes = ['pagina=' + encodeURIComponent(String(pagina))];
    if (filtros.tipo) partes.push('tipo=' + encodeURIComponent(filtros.tipo));
    if (filtros.estado) partes.push('estado=' + encodeURIComponent(filtros.estado));
    if (filtros.tel) partes.push('tel=' + encodeURIComponent(filtros.tel));
    return partes.join('&');
  }

  function pedir(url, opciones) {
    return fetch(url, opciones).then(function (respuesta) {
      return respuesta.text().then(function (texto) {
        var datos = null;
        if (texto) {
          try { datos = JSON.parse(texto); } catch (error) { datos = null; }
        }
        if (!respuesta.ok) {
          var motivo = datos && datos.error ? datos.error : 'Error ' + respuesta.status;
          throw new Error(motivo);
        }
        return datos;
      });
    });
  }

  function avisar(texto, esError) {
    var aviso = porId('detalle-aviso');
    aviso.textContent = texto;
    aviso.className = esError ? 'aviso-error' : 'aviso-ok';
  }

  function filaTabla(fila) {
    var tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', 'Abrir envío ' + fila.folio);

    var celdas = [
      ['Folio', fila.folio, 'folio'],
      ['Fecha', fechaLocal(fila.creado), ''],
      ['Tipo', textoONada(fila.tipo), ''],
      ['Estado', textoEstado(fila.estado), ''],
      ['Origen', textoONada(fila.origen), ''],
      ['CTA', textoONada(fila.cta), '']
    ];

    celdas.forEach(function (celda) {
      var td = document.createElement('td');
      td.setAttribute('data-etiqueta', celda[0]);
      if (celda[2]) td.className = celda[2];
      if (celda[0] === 'Estado') {
        var chip = crear('span', 'chip', celda[1]);
        td.appendChild(chip);
      } else {
        td.textContent = celda[1];
      }
      tr.appendChild(td);
    });

    function abrir() { abrirDetalle(fila.folio); }
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        abrir();
      }
    });
    return tr;
  }

  function cargarLista() {
    var cargando = porId('cargando');
    var vacio = porId('vacio');
    cargando.hidden = false;
    vacio.hidden = true;

    return pedir('/api/envios?' + consulta(), { headers: { Accept: 'application/json' } })
      .then(function (datos) {
        total = datos && typeof datos.total === 'number' ? datos.total : 0;
        var filas = datos && Array.isArray(datos.filas) ? datos.filas : [];
        var cuerpo = porId('filas');
        limpiar(cuerpo);
        filas.forEach(function (fila) { cuerpo.appendChild(filaTabla(fila)); });

        vacio.hidden = filas.length !== 0;
        porId('resumen').textContent = total + (total === 1 ? ' envío' : ' envíos');

        var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
        porId('pagina-info').textContent = 'Página ' + pagina + ' de ' + paginas;
        porId('anterior').disabled = pagina <= 1;
        porId('siguiente').disabled = pagina >= paginas;
      })
      .catch(function () {
        var cuerpo = porId('filas');
        limpiar(cuerpo);
        vacio.hidden = false;
        vacio.textContent = 'No se pudo cargar la lista. Vuelve a intentarlo.';
        porId('resumen').textContent = '';
        porId('pagina-info').textContent = '';
      })
      .then(function () {
        cargando.hidden = true;
      });
  }

  function grupoDeCampos(campos) {
    var grupos = [];
    var mapa = {};
    campos.forEach(function (campo) {
      var nombre = campo.seccion || 'Sin sección';
      if (!mapa[nombre]) {
        mapa[nombre] = { seccion: nombre, campos: [] };
        grupos.push(mapa[nombre]);
      }
      mapa[nombre].campos.push(campo);
    });
    return grupos;
  }

  function pintarDetalle(datos) {
    var envio = datos.envio || {};
    porId('detalle-titulo').textContent = 'Envío ' + (envio.folio || '');
    porId('detalle-meta').textContent =
      'Creado: ' + fechaLocal(envio.creado) +
      ' · Tipo: ' + textoONada(envio.tipo) +
      ' · Estado: ' + textoEstado(envio.estado) +
      ' · Origen: ' + textoONada(envio.origen) +
      ' · CTA: ' + textoONada(envio.cta);

    var contenedor = porId('detalle-campos');
    limpiar(contenedor);
    var campos = Array.isArray(datos.campos) ? datos.campos : [];
    if (campos.length === 0) {
      contenedor.appendChild(crear('p', 'vacio', 'Este envío no tiene respuestas legibles.'));
    } else {
      grupoDeCampos(campos).forEach(function (grupo) {
        var bloque = crear('section', 'grupo');
        bloque.appendChild(crear('h3', '', grupo.seccion));
        var lista = document.createElement('dl');
        grupo.campos.forEach(function (campo) {
          lista.appendChild(crear('dt', '', campo.etiqueta));
          lista.appendChild(crear('dd', '', campo.valor));
        });
        bloque.appendChild(lista);
        contenedor.appendChild(bloque);
      });
    }

    estadoActual = envio.estado || 'nuevo';
    porId('nuevo-estado').value = estadoActual;
    porId('confirmar-folio').value = '';
    avisar('', false);
  }

  function abrirDetalle(folio) {
    var dialogo = porId('detalle');
    folioActual = folio;
    avisar('', false);
    porId('detalle-titulo').textContent = 'Envío ' + folio;
    porId('detalle-meta').textContent = '';
    limpiar(porId('detalle-campos'));

    pedir('/api/envios/' + encodeURIComponent(folio), { headers: { Accept: 'application/json' } })
      .then(function (datos) {
        pintarDetalle(datos);
        if (typeof dialogo.showModal === 'function') {
          if (!dialogo.open) dialogo.showModal();
        } else {
          dialogo.setAttribute('open', 'open');
        }
      })
      .catch(function () {
        avisar('No se pudo abrir el envío. Vuelve a intentarlo.', true);
        if (typeof dialogo.showModal === 'function') {
          if (!dialogo.open) dialogo.showModal();
        } else {
          dialogo.setAttribute('open', 'open');
        }
      });
  }

  function cerrarDetalle() {
    var dialogo = porId('detalle');
    folioActual = null;
    if (typeof dialogo.close === 'function' && dialogo.open) {
      dialogo.close();
    } else {
      dialogo.removeAttribute('open');
    }
  }

  function guardarEstado() {
    if (!folioActual) return;
    var nuevo = porId('nuevo-estado').value;
    avisar('Guardando…', false);

    pedir('/api/envios/' + encodeURIComponent(folioActual) + '/estado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-F33-Admin': '1',
        Accept: 'application/json'
      },
      body: JSON.stringify({ estado: nuevo })
    }).then(function (datos) {
      estadoActual = datos && datos.estado ? datos.estado : nuevo;
      avisar('Estado guardado.', false);
      return cargarLista();
    }).catch(function () {
      avisar('No se pudo guardar el estado. Vuelve a intentarlo.', true);
    });
  }

  function borrarEnvio() {
    if (!folioActual) return;
    var escrito = porId('confirmar-folio').value.trim();
    if (escrito !== folioActual) {
      avisar('El folio no coincide. Escríbelo exactamente igual para confirmar.', true);
      return;
    }
    avisar('Borrando…', false);

    pedir('/api/envios/' + encodeURIComponent(folioActual), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-F33-Admin': '1',
        Accept: 'application/json'
      },
      body: JSON.stringify({ confirmar: escrito })
    }).then(function () {
      cerrarDetalle();
      return cargarLista();
    }).catch(function () {
      avisar('No se pudo borrar. Vuelve a intentarlo.', true);
    });
  }

  function leerFiltros() {
    filtros.tipo = porId('tipo').value;
    filtros.estado = porId('estado').value;
    filtros.tel = porId('tel').value.trim();
    pagina = 1;
  }

  porId('filtros').addEventListener('submit', function (evento) {
    evento.preventDefault();
    leerFiltros();
    cargarLista();
  });

  porId('tipo').addEventListener('change', function () {
    leerFiltros();
    cargarLista();
  });

  porId('estado').addEventListener('change', function () {
    leerFiltros();
    cargarLista();
  });

  porId('limpiar').addEventListener('click', function () {
    porId('tipo').value = '';
    porId('estado').value = '';
    porId('tel').value = '';
    leerFiltros();
    cargarLista();
  });

  porId('exportar').addEventListener('click', function () {
    var partes = [];
    if (filtros.tipo) partes.push('tipo=' + encodeURIComponent(filtros.tipo));
    if (filtros.estado) partes.push('estado=' + encodeURIComponent(filtros.estado));
    window.location.href = '/api/exportar.csv' + (partes.length ? '?' + partes.join('&') : '');
  });

  porId('anterior').addEventListener('click', function () {
    if (pagina > 1) {
      pagina -= 1;
      cargarLista();
    }
  });

  porId('siguiente').addEventListener('click', function () {
    pagina += 1;
    cargarLista();
  });

  porId('cerrar').addEventListener('click', cerrarDetalle);
  porId('guardar-estado').addEventListener('click', guardarEstado);
  porId('borrar').addEventListener('click', borrarEnvio);

  porId('detalle').addEventListener('click', function (evento) {
    if (evento.target === porId('detalle')) cerrarDetalle();
  });

  cargarLista();
})();
</script>
</body>
</html>`;

// ---- src/admin.js ----
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


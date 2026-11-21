/* Utilidades sin dependencias: teléfonos, fechas, folios, CORS y respuestas. */

const ORIGENES_POR_OMISION = 'https://faro33studio.com,https://www.faro33studio.com';
const FOLIO_RE = /^F33-[A-Z2-9]{6}$/;

/** Últimos 10 dígitos de un teléfono (sirve para comparar/hashear, no para validar). */
export function normalizarTelefono(txt) {
  if (typeof txt !== 'string') return '';
  return txt.replace(/\D/g, '').slice(-10);
}

/** Fecha actual en ISO UTC, formato que guarda D1. */
export function ahoraISO() {
  return new Date().toISOString();
}

/** Folio con el formato que genera el cliente: F33- + 6 caracteres A-Z/2-9. */
export function foliosValido(folio) {
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
export function respuestaJSON(estado, cuerpo, cabeceras) {
  const opciones = { status: estado, headers: conCabecerasBase(cabeceras) };
  if (cuerpo === undefined || cuerpo === null) return new Response(null, opciones);
  return new Response(JSON.stringify(cuerpo), opciones);
}

/** Convierte la lista de orígenes (texto separado por comas o arreglo) en arreglo. */
export function listarOrigenes(permitidos) {
  const texto = Array.isArray(permitidos)
    ? permitidos.join(',')
    : (typeof permitidos === 'string' ? permitidos : ORIGENES_POR_OMISION);
  return texto.split(',').map(origen => origen.trim()).filter(Boolean);
}

/** ¿El Origin de la petición está en la lista permitida? */
export function origenPermitido(origen, permitidos) {
  if (typeof origen !== 'string' || origen === '') return false;
  return listarOrigenes(permitidos).includes(origen);
}

/**
 * Cabeceras CORS. Access-Control-Allow-Origin se pone únicamente si el origen
 * está permitido; el resto de cabeceras son inocuas.
 */
export function cors(origen, permitidos) {
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
export function limitarTexto(valor, maximo = 120) {
  if (typeof valor !== 'string') return '';
  const limpio = valor.trim();
  return limpio.length > maximo ? limpio.slice(0, maximo) : limpio;
}

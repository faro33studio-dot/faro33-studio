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
export function aCSV(filas, columnas, opciones = {}) {
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

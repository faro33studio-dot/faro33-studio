/* Funciones puras para leer un envío descifrado y etiquetarlo con el schema.
 *
 * Este archivo se concatena en el dist y NO usa imports: `claveDeVersion` y
 * `descifrar` viven en el mismo ámbito del módulo generado.
 *
 * La PII solo existe aquí, en memoria, después de descifrar. Nunca se registra.
 */

export const ESTADOS = [
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
export async function abrirFila(env, fila) {
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
export function etiquetar(schema, respuestas) {
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

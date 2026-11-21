/* Validación del lado del servidor basada en el mismo schema del cliente.
 *
 * Objetivo: reproducir EXACTAMENTE la visibilidad (mostrarSi en cascada) y la
 * limpieza de `Cuestionario.payload`, y añadir comprobaciones estrictas que el
 * navegador no puede garantizar: tipos, opciones válidas, duplicados y consent.
 *
 * Los errores son SOLO ids de campo. Nunca se devuelve ni se registra un valor.
 */

/** ¿El valor cuenta como respuesta? Misma definición que el cliente. */
function presente(valor) {
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'string') return valor.trim() !== '';
  return valor === true;
}

/** Evalúa una condición mostrarSi contra los campos ya activos. */
function cumple(condicion, activas) {
  if (!condicion) return true;
  if (!activas.has(condicion.campo)) return false;
  const valor = activas.get(condicion.campo);
  if (condicion.presente === true) return presente(valor);
  if ('contiene' in condicion) return Array.isArray(valor) && valor.includes(condicion.contiene);
  const valores = Array.isArray(valor) ? valor : [valor];
  const esperados = condicion.en || [condicion.igual];
  return valores.some(item => esperados.includes(item));
}

function schemaEfectivo(schema) {
  if (schema && typeof schema === 'object') return schema;
  // En el dist, SCHEMA es una constante del mismo módulo. En pruebas se inyecta
  // como global; `typeof` es seguro incluso si no existe.
  if (typeof SCHEMA !== 'undefined') return SCHEMA;
  if (typeof globalThis !== 'undefined' && globalThis.SCHEMA) return globalThis.SCHEMA;
  throw new Error('schema_no_disponible');
}

function objeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

/**
 * Recorre secciones y campos en orden. Devuelve las secciones visibles y un Map
 * id -> valor crudo de los campos activos (incluidos los ausentes, como el cliente).
 */
export function evaluarSchema(schema, respuestas) {
  const secciones = new Set();
  const activas = new Map();
  const datos = objeto(respuestas) ? respuestas : {};
  const leer = campo => (Object.prototype.hasOwnProperty.call(datos, campo.id)
    ? datos[campo.id] : undefined);

  (schema.secciones || []).forEach(seccion => {
    if (!cumple(seccion.mostrarSi, activas)) return;
    secciones.add(seccion.id);
    (seccion.campos || []).forEach(campo => {
      if (cumple(campo.mostrarSi, activas)) activas.set(campo.id, leer(campo));
    });
  });
  return { secciones, activas };
}

/** Respuestas limpias: solo campos visibles, presentes, con texto recortado. */
export function limpiarRespuestas(schema, respuestas) {
  const datos = objeto(respuestas) ? respuestas : {};
  const { activas } = evaluarSchema(schema, datos);
  const limpias = {};
  activas.forEach((valor, id) => {
    if (!Object.prototype.hasOwnProperty.call(datos, id)) return;
    const copia = Array.isArray(valor) ? valor.slice() : valor;
    if (!presente(copia)) return;
    // defineProperty evita que un id especial (p. ej. __proto__) altere el objeto.
    Object.defineProperty(limpias, id, {
      value: typeof copia === 'string' ? copia.trim() : copia,
      enumerable: true,
      writable: true,
      configurable: true
    });
  });
  return limpias;
}

function valoresOpciones(campo) {
  return new Set((campo.opciones || [])
    .map(opcion => (opcion && typeof opcion.valor === 'string' ? opcion.valor : null))
    .filter(valor => valor !== null));
}

/** Devuelve true si el campo visible tiene un problema (sin mirar `requerido`). */
function campoInvalido(campo, valor) {
  const tipo = campo.tipo;

  if (tipo === 'checkbox') {
    if (!Array.isArray(valor)) return true;
    if (campo.maxSeleccion && valor.length > campo.maxSeleccion) return true;
    const opciones = valoresOpciones(campo);
    const vistos = new Set();
    for (const item of valor) {
      if (typeof item !== 'string' || !opciones.has(item)) return true;
      if (vistos.has(item)) return true;
      vistos.add(item);
    }
    return false;
  }

  if (tipo === 'consent') return valor !== true;

  if (tipo === 'select' || tipo === 'radio') {
    return typeof valor !== 'string' || !valoresOpciones(campo).has(valor);
  }

  // text, textarea, tel, email y cualquier tipo textual.
  if (typeof valor !== 'string') return true;
  if (campo.max && valor.length > campo.max) return true;
  if (tipo === 'tel') {
    const digitos = valor.replace(/[\s()-]/g, '').replace(/^\+52/, '');
    return !/^\d{10,}$/.test(digitos);
  }
  if (tipo === 'email') {
    return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
  }
  return false;
}

/** Valida y devuelve {ok, respuestas limpias, errores: [ids]}. */
export function validarRespuestas(schema, respuestas) {
  const base = schemaEfectivo(schema);
  const datos = objeto(respuestas) ? respuestas : {};
  const { activas } = evaluarSchema(base, datos);
  const errores = [];

  (base.secciones || []).forEach(seccion => {
    (seccion.campos || []).forEach(campo => {
      if (!activas.has(campo.id)) return;
      const valor = activas.get(campo.id);
      if (!presente(valor)) {
        if (campo.requerido) errores.push(campo.id);
        return;
      }
      if (campoInvalido(campo, valor)) errores.push(campo.id);
    });
  });

  return {
    ok: errores.length === 0,
    respuestas: limpiarRespuestas(base, datos),
    errores
  };
}

/** Variante con el schema embebido (la que usa el Worker en producción). */
export function validar(respuestas) {
  return validarRespuestas(schemaEfectivo(null), respuestas);
}

/*
 * faro33-intake — Worker de recepción del cuestionario (Cloudflare Workers + D1).
 * ARCHIVO GENERADO: no editar a mano
 * Fecha de generación: 2026-11-21T22:34:36.101Z
 * Fuente: src/lib/*.js (5 módulos) + src/intake.js + ../cuestionario/schema.json
 * Schema: cuestionario-proyecto v1 (60 campos)
 * Bindings: DB, ENC_KEY_V1...ENC_KEY_Vn, ACTIVE_KEY_VERSION, HMAC_KEY,
 *           TURNSTILE_SECRET, ALLOWED_ORIGINS, RATE_LIMIT_PER_HOUR
 * Regenerar: node build.mjs --schema ../cuestionario/schema.json
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

// ---- src/lib/turnstile.js ----
/* Verificación de Cloudflare Turnstile.
 *
 * No se registra el token ni la IP; solo se devuelve {ok}.
 * Tiempo máximo de espera: 5 s (AbortController).
 */

const URL_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ESPERA_MAXIMA_MS = 5000;

/** POST de siteverify con formulario. Devuelve {ok} y nunca lanza por red. */
async function verificarTurnstile(token, secreto, ip) {
  if (typeof token !== 'string' || token.trim() === '') return { ok: false };
  if (typeof secreto !== 'string' || secreto.trim() === '') return { ok: false };

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);
  try {
    const cuerpo = new URLSearchParams();
    cuerpo.set('secret', secreto);
    cuerpo.set('response', token);
    if (typeof ip === 'string' && ip !== '') cuerpo.set('remoteip', ip);

    const respuesta = await fetch(URL_TURNSTILE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo.toString(),
      signal: control.signal
    });
    if (!respuesta || !respuesta.ok) return { ok: false };
    const datos = await respuesta.json();
    return { ok: Boolean(datos && datos.success === true) };
  } catch {
    // Token inválido, timeout, red caída o JSON roto: todo es "no verificado".
    return { ok: false };
  } finally {
    clearTimeout(temporizador);
  }
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

// ---- src/lib/validar.js ----
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
function evaluarSchema(schema, respuestas) {
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
function limpiarRespuestas(schema, respuestas) {
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
function validarRespuestas(schema, respuestas) {
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
function validar(respuestas) {
  return validarRespuestas(schemaEfectivo(null), respuestas);
}

// ---- schema embebido (mismo que cuestionario/schema.json) ----
const SCHEMA = {"id":"cuestionario-proyecto","version":1,"titulo":"Cuéntanos de tu proyecto","intro":"Responde lo que sepas; lo demás lo definimos juntos en la primera visita. Tarda unos 6 minutos y las preguntas de diseño son opcionales.","secciones":[{"id":"tipo","titulo":"Tu proyecto","campos":[{"id":"tipo","tipo":"radio","etiqueta":"¿Qué tipo de proyecto es?","requerido":true,"opciones":[{"valor":"residencial","etiqueta":"Residencial","ayuda":"Casa o departamento"},{"valor":"comercial","etiqueta":"Comercial","ayuda":"Restaurante, tienda, clínica, hotel…"},{"valor":"oficinas","etiqueta":"Oficinas","ayuda":"Oficinas corporativas o de equipo"}]}]},{"id":"contacto","titulo":"Cómo contactarte","mostrarSi":{"campo":"tipo","presente":true},"campos":[{"id":"nombre","tipo":"text","etiqueta":"Tu nombre","requerido":true,"max":80,"autocompletar":"name"},{"id":"telefono","tipo":"tel","etiqueta":"Teléfono / WhatsApp","requerido":true,"max":20,"autocompletar":"tel","ayuda":"10 dígitos"},{"id":"correo","tipo":"email","etiqueta":"Correo (opcional)","requerido":false,"max":120,"autocompletar":"email"},{"id":"ciudad","tipo":"text","etiqueta":"Ciudad del proyecto","requerido":true,"max":80,"valorInicial":"Culiacán"},{"id":"contacto_preferido","tipo":"radio","etiqueta":"¿Cómo prefieres que te contactemos?","requerido":true,"opciones":[{"valor":"whatsapp","etiqueta":"WhatsApp"},{"valor":"llamada","etiqueta":"Llamada"},{"valor":"correo","etiqueta":"Correo"}]}]},{"id":"proyecto","titulo":"Sobre el espacio","mostrarSi":{"campo":"tipo","presente":true},"campos":[{"id":"situacion","tipo":"radio","etiqueta":"¿En qué etapa está el inmueble?","requerido":true,"opciones":[{"valor":"obra_nueva","etiqueta":"Obra nueva o en construcción"},{"valor":"obra_gris","etiqueta":"Construido, sin acabados"},{"valor":"remodelacion","etiqueta":"Remodelación de un espacio en uso"}]},{"id":"m2","tipo":"select","etiqueta":"Superficie aproximada","requerido":true,"opciones":[{"valor":"menos_50","etiqueta":"Menos de 50 m²"},{"valor":"50_100","etiqueta":"50 a 100 m²"},{"valor":"100_150","etiqueta":"100 a 150 m²"},{"valor":"150_250","etiqueta":"150 a 250 m²"},{"valor":"250_500","etiqueta":"250 a 500 m²"},{"valor":"mas_500","etiqueta":"Más de 500 m²"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"alcance","tipo":"checkbox","etiqueta":"¿Qué necesitas?","requerido":true,"opciones":[{"valor":"diseno_planos","etiqueta":"Diseño y planos"},{"valor":"obra_acabados","etiqueta":"Obra y acabados"},{"valor":"carpinteria","etiqueta":"Carpintería a medida"},{"valor":"mobiliario","etiqueta":"Mobiliario y decoración"},{"valor":"iluminacion","etiqueta":"Iluminación"},{"valor":"cortinas","etiqueta":"Cortinas"},{"valor":"llave_en_mano","etiqueta":"Todo, llave en mano"}]},{"id":"plazo","tipo":"radio","etiqueta":"¿Cuándo te gustaría empezar?","requerido":true,"opciones":[{"valor":"ya","etiqueta":"Lo antes posible"},{"valor":"1_3_meses","etiqueta":"En 1 a 3 meses"},{"valor":"3_6_meses","etiqueta":"En 3 a 6 meses"},{"valor":"explorando","etiqueta":"Solo estoy explorando"}]},{"id":"inversion","tipo":"select","etiqueta":"Inversión aproximada (con IVA)","requerido":false,"ayuda":"Es solo para orientarnos; cada proyecto se cotiza sobre su levantamiento.","opciones":[{"valor":"menos_250k","etiqueta":"Menos de $250 mil"},{"valor":"250k_700k","etiqueta":"$250 mil a $700 mil"},{"valor":"700k_1_5m","etiqueta":"$700 mil a $1.5 millones"},{"valor":"1_5m_3_5m","etiqueta":"$1.5 a $3.5 millones"},{"valor":"mas_3_5m","etiqueta":"Más de $3.5 millones"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]}]},{"id":"diseno","titulo":"Tu estilo","descripcion":"Opcional, pero nos ayuda mucho a proponerte algo que sí te represente. Si no sabes, déjalo en blanco.","mostrarSi":{"campo":"tipo","presente":true},"campos":[{"id":"d_ambiente","tipo":"checkbox","etiqueta":"¿Cómo quieres que se sienta el espacio? (elige hasta 3)","requerido":false,"opciones":[{"valor":"calido","etiqueta":"Cálido"},{"valor":"sereno","etiqueta":"Sereno"},{"valor":"elegante","etiqueta":"Elegante"},{"valor":"atrevido","etiqueta":"Atrevido"},{"valor":"minimalista","etiqueta":"Minimalista"},{"valor":"acogedor","etiqueta":"Acogedor"},{"valor":"luminoso","etiqueta":"Luminoso"},{"valor":"sobrio","etiqueta":"Sobrio"}],"maxSeleccion":3},{"id":"d_paleta","tipo":"checkbox","etiqueta":"Paleta de colores que te atrae","requerido":false,"opciones":[{"valor":"neutros_claros","etiqueta":"Neutros claros (blancos, beige, arena)"},{"valor":"tierra","etiqueta":"Tonos tierra (café, terracota, oliva)"},{"valor":"oscuros","etiqueta":"Oscuros con contraste (negro, grafito, azul profundo)"},{"valor":"color_vibrante","etiqueta":"Color vibrante en acentos"},{"valor":"blanco_madera","etiqueta":"Blanco con madera"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"d_materiales","tipo":"checkbox","etiqueta":"Materiales que te gustan","requerido":false,"opciones":[{"valor":"madera","etiqueta":"Madera"},{"valor":"piedra_marmol","etiqueta":"Piedra o mármol"},{"valor":"concreto","etiqueta":"Concreto o microcemento"},{"valor":"metal","etiqueta":"Metal (latón, negro)"},{"valor":"vidrio_espejo","etiqueta":"Vidrio y espejos"},{"valor":"textiles","etiqueta":"Textiles y tapices"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"d_luz","tipo":"radio","etiqueta":"Iluminación que prefieres","requerido":false,"opciones":[{"valor":"calida_tenue","etiqueta":"Cálida y tenue"},{"valor":"neutra_clara","etiqueta":"Neutra y clara"},{"valor":"mixta_regulable","etiqueta":"Mixta, con regulación (dimmer)"},{"valor":"acentos_led","etiqueta":"Con acentos LED en muebles y muros"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"d_prioridad","tipo":"radio","etiqueta":"Lo que más pesa en tu decisión","requerido":false,"opciones":[{"valor":"estetica","etiqueta":"Que se vea espectacular"},{"valor":"funcionalidad","etiqueta":"Que funcione perfecto"},{"valor":"durabilidad","etiqueta":"Que dure muchos años"},{"valor":"rapidez","etiqueta":"Que quede pronto"},{"valor":"costo","etiqueta":"Cuidar el presupuesto"}]},{"id":"d_smart","tipo":"radio","etiqueta":"¿Te interesa automatizar luces y cortinas?","requerido":false,"opciones":[{"valor":"si","etiqueta":"Sí"},{"valor":"quizas","etiqueta":"Quizás más adelante"},{"valor":"no","etiqueta":"No"}]},{"id":"d_evitar","tipo":"textarea","etiqueta":"¿Qué NO te gusta o quieres evitar?","requerido":false,"max":300,"ayuda":"Colores, materiales, formas, estilos…"},{"id":"d_decide","tipo":"radio","etiqueta":"¿Quién toma la decisión final?","requerido":false,"opciones":[{"valor":"yo","etiqueta":"Yo"},{"valor":"pareja_familia","etiqueta":"En pareja o familia"},{"valor":"socios","etiqueta":"Socios o comité"}]}]},{"id":"residencial","titulo":"Tu casa o departamento","mostrarSi":{"campo":"tipo","igual":"residencial"},"campos":[{"id":"res_inmueble","tipo":"radio","etiqueta":"¿Qué tipo de inmueble es?","requerido":true,"opciones":[{"valor":"casa","etiqueta":"Casa"},{"valor":"departamento","etiqueta":"Departamento"},{"valor":"casa_fraccionamiento","etiqueta":"Casa en fraccionamiento privado"},{"valor":"otro","etiqueta":"Otro"}]},{"id":"res_espacios","tipo":"checkbox","etiqueta":"¿Qué espacios quieres trabajar?","requerido":true,"opciones":[{"valor":"sala","etiqueta":"Sala"},{"valor":"comedor","etiqueta":"Comedor"},{"valor":"cocina","etiqueta":"Cocina"},{"valor":"recamara_principal","etiqueta":"Recámara principal"},{"valor":"recamaras","etiqueta":"Otras recámaras"},{"valor":"banos","etiqueta":"Baños"},{"valor":"tv","etiqueta":"Cuarto o muro de TV"},{"valor":"estudio","etiqueta":"Estudio / oficina en casa"},{"valor":"terraza","etiqueta":"Terraza o jardín"},{"valor":"todo","etiqueta":"Toda la casa"}]},{"id":"res_ocupantes","tipo":"select","etiqueta":"¿Cuántas personas viven ahí?","requerido":true,"opciones":[{"valor":"1_2","etiqueta":"1 a 2"},{"valor":"3_4","etiqueta":"3 a 4"},{"valor":"5_mas","etiqueta":"5 o más"}]},{"id":"res_hogar","tipo":"checkbox","etiqueta":"En casa hay…","requerido":false,"opciones":[{"valor":"ninos","etiqueta":"Niños"},{"valor":"adultos_mayores","etiqueta":"Adultos mayores"},{"valor":"mascotas","etiqueta":"Mascotas"}]},{"id":"res_estilo","tipo":"checkbox","etiqueta":"¿Qué estilo te atrae?","requerido":false,"opciones":[{"valor":"contemporaneo","etiqueta":"Contemporáneo"},{"valor":"minimalista","etiqueta":"Minimalista"},{"valor":"calido","etiqueta":"Cálido y orgánico"},{"valor":"clasico","etiqueta":"Clásico"},{"valor":"rustico","etiqueta":"Rústico"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"res_ocupada","tipo":"radio","etiqueta":"Durante la obra, la casa estará…","requerido":true,"mostrarSi":{"campo":"situacion","igual":"remodelacion"},"opciones":[{"valor":"habitada","etiqueta":"Habitada"},{"valor":"desocupada","etiqueta":"Desocupada"}]},{"id":"res_muebles","tipo":"radio","etiqueta":"¿Reutilizarías muebles que ya tienes?","requerido":false,"opciones":[{"valor":"mucho","etiqueta":"Sí, la mayoría"},{"valor":"algo","etiqueta":"Algunos"},{"valor":"nada","etiqueta":"Casi ninguno"}]},{"id":"res_vida","tipo":"checkbox","etiqueta":"Lo que más haces en casa","requerido":false,"opciones":[{"valor":"recibir","etiqueta":"Recibir invitados"},{"valor":"cocinar","etiqueta":"Cocinar"},{"valor":"home_office","etiqueta":"Trabajar desde casa"},{"valor":"cine","etiqueta":"Ver TV o cine"},{"valor":"ninos","etiqueta":"Que jueguen los niños"},{"valor":"ejercicio","etiqueta":"Ejercicio o yoga"},{"valor":"jardin","etiqueta":"Estar en terraza o jardín"},{"valor":"descanso","etiqueta":"Descansar y leer"}]},{"id":"res_almacenaje","tipo":"radio","etiqueta":"¿Cuánto espacio de guardado necesitas?","requerido":false,"opciones":[{"valor":"mucho","etiqueta":"Mucho (closets, alacenas, bodega)"},{"valor":"moderado","etiqueta":"Moderado"},{"valor":"poco","etiqueta":"Poco, prefiero lo minimalista"}]},{"id":"res_cocina_tipo","tipo":"radio","etiqueta":"Tu cocina ideal","requerido":false,"opciones":[{"valor":"isla","etiqueta":"Abierta, con isla"},{"valor":"semiabierta","etiqueta":"Semiabierta"},{"valor":"cerrada","etiqueta":"Cerrada"},{"valor":"no_se","etiqueta":"Aún no lo sé"}],"mostrarSi":{"campo":"res_espacios","contiene":"cocina"}},{"id":"res_cocina_uso","tipo":"radio","etiqueta":"¿Qué tanto cocinas?","requerido":false,"opciones":[{"valor":"intenso","etiqueta":"A diario y con ganas"},{"valor":"ligero","etiqueta":"A diario, cosas sencillas"},{"valor":"ocasional","etiqueta":"Ocasionalmente"}],"mostrarSi":{"campo":"res_espacios","contiene":"cocina"}},{"id":"res_recamara","tipo":"checkbox","etiqueta":"En la recámara principal te gustaría…","requerido":false,"opciones":[{"valor":"vestidor","etiqueta":"Vestidor"},{"valor":"closet_medida","etiqueta":"Closet a la medida"},{"valor":"bano_suite","etiqueta":"Baño en suite"},{"valor":"cabecera","etiqueta":"Cabecera de diseño"},{"valor":"escritorio","etiqueta":"Escritorio"}],"mostrarSi":{"campo":"res_espacios","contiene":"recamara_principal"}},{"id":"res_tv_tamano","tipo":"radio","etiqueta":"Tu pantalla de TV","requerido":false,"opciones":[{"valor":"55_65","etiqueta":"55 a 65 pulgadas"},{"valor":"75_mas","etiqueta":"75 pulgadas o más"},{"valor":"proyector","etiqueta":"Proyector"},{"valor":"no_se","etiqueta":"Aún no lo sé"}],"mostrarSi":{"campo":"res_espacios","contiene":"tv"}},{"id":"res_tv_extras","tipo":"checkbox","etiqueta":"En el muro de TV te interesa…","requerido":false,"opciones":[{"valor":"led","etiqueta":"Luz LED"},{"valor":"torres","etiqueta":"Torres con repisas"},{"valor":"cables","etiqueta":"Ocultar cables"},{"valor":"panel_flotante","etiqueta":"Panel flotante"},{"valor":"sonido","etiqueta":"Barra de sonido integrada"}],"mostrarSi":{"campo":"res_espacios","contiene":"tv"}}]},{"id":"comercial","titulo":"Tu negocio","mostrarSi":{"campo":"tipo","igual":"comercial"},"campos":[{"id":"com_giro","tipo":"select","etiqueta":"¿Qué tipo de negocio es?","requerido":true,"opciones":[{"valor":"restaurante","etiqueta":"Restaurante, cafetería o bar"},{"valor":"retail","etiqueta":"Tienda o showroom"},{"valor":"belleza","etiqueta":"Salón, spa o estética"},{"valor":"salud","etiqueta":"Clínica o consultorio"},{"valor":"hospedaje","etiqueta":"Hotel u hospedaje"},{"valor":"gimnasio","etiqueta":"Gimnasio o estudio"},{"valor":"otro","etiqueta":"Otro"}]},{"id":"com_giro_otro","tipo":"text","etiqueta":"Cuéntanos qué giro es","requerido":true,"max":80,"mostrarSi":{"campo":"com_giro","igual":"otro"}},{"id":"com_aforo","tipo":"select","etiqueta":"Personas a la vez en el espacio (aprox.)","requerido":true,"opciones":[{"valor":"menos_20","etiqueta":"Menos de 20"},{"valor":"20_50","etiqueta":"20 a 50"},{"valor":"50_100","etiqueta":"50 a 100"},{"valor":"mas_100","etiqueta":"Más de 100"}]},{"id":"com_marca","tipo":"radio","etiqueta":"¿Tienes identidad de marca?","requerido":true,"opciones":[{"valor":"manual","etiqueta":"Sí, logotipo y manual de marca"},{"valor":"logo","etiqueta":"Tengo logotipo, sin manual"},{"valor":"ninguna","etiqueta":"Todavía no"}]},{"id":"com_apertura","tipo":"radio","etiqueta":"¿Para cuándo necesitas abrir?","requerido":true,"opciones":[{"valor":"menos_3_meses","etiqueta":"En menos de 3 meses"},{"valor":"3_6_meses","etiqueta":"En 3 a 6 meses"},{"valor":"mas_6_meses","etiqueta":"En más de 6 meses"},{"valor":"ya_opera","etiqueta":"Ya opera, es renovación"}]},{"id":"com_cierre","tipo":"radio","etiqueta":"Durante la obra, el negocio…","requerido":true,"mostrarSi":{"campo":"com_apertura","igual":"ya_opera"},"opciones":[{"valor":"cierra","etiqueta":"Puede cerrar"},{"valor":"parcial","etiqueta":"Debe seguir abierto en parte"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"com_permisos","tipo":"radio","etiqueta":"Licencias y permisos del local","requerido":false,"opciones":[{"valor":"listos","etiqueta":"Listos"},{"valor":"tramite","etiqueta":"En trámite"},{"valor":"pendientes","etiqueta":"Aún no los inicio"},{"valor":"no_se","etiqueta":"No sé"}]},{"id":"com_sucursales","tipo":"radio","etiqueta":"¿Será una sola sucursal?","requerido":false,"opciones":[{"valor":"unica","etiqueta":"Sí, única"},{"valor":"varias","etiqueta":"Es la primera de varias"}]},{"id":"com_experiencia","tipo":"checkbox","etiqueta":"¿Qué debe sentir tu cliente al entrar?","requerido":false,"opciones":[{"valor":"rapidez","etiqueta":"Rapidez y orden"},{"valor":"intimidad","etiqueta":"Intimidad"},{"valor":"premium","etiqueta":"Algo premium"},{"valor":"familiar","etiqueta":"Ambiente familiar"},{"valor":"creativo","etiqueta":"Creatividad"},{"valor":"fotos","etiqueta":"Que sea 'fotografiable' para redes"}]},{"id":"com_cliente","tipo":"checkbox","etiqueta":"¿Quién es tu cliente principal?","requerido":false,"opciones":[{"valor":"familias","etiqueta":"Familias"},{"valor":"jovenes","etiqueta":"Jóvenes"},{"valor":"ejecutivos","etiqueta":"Ejecutivos"},{"valor":"turistas","etiqueta":"Turistas"},{"valor":"alto_ingreso","etiqueta":"Clientes de alto ingreso"}]},{"id":"com_zonas","tipo":"checkbox","etiqueta":"Zonas que necesita el espacio","requerido":false,"opciones":[{"valor":"recepcion","etiqueta":"Recepción o mostrador"},{"valor":"barra","etiqueta":"Barra"},{"valor":"cocina_vista","etiqueta":"Cocina a la vista"},{"valor":"mesas","etiqueta":"Zona de mesas"},{"valor":"vitrinas","etiqueta":"Vitrinas o exhibición"},{"valor":"cabinas","etiqueta":"Cabinas o probadores"},{"valor":"espera","etiqueta":"Sala de espera"},{"valor":"fachada","etiqueta":"Fachada y rótulo"}]},{"id":"com_mobiliario","tipo":"radio","etiqueta":"Mobiliario","requerido":false,"opciones":[{"valor":"medida","etiqueta":"A la medida"},{"valor":"comprado","etiqueta":"Comprado"},{"valor":"mixto","etiqueta":"Mezcla de ambos"}]}]},{"id":"oficinas","titulo":"Tus oficinas","mostrarSi":{"campo":"tipo","igual":"oficinas"},"campos":[{"id":"ofi_personas","tipo":"select","etiqueta":"¿Cuántas personas trabajarán ahí?","requerido":true,"opciones":[{"valor":"1_10","etiqueta":"1 a 10"},{"valor":"11_25","etiqueta":"11 a 25"},{"valor":"26_60","etiqueta":"26 a 60"},{"valor":"mas_60","etiqueta":"Más de 60"}]},{"id":"ofi_modelo","tipo":"radio","etiqueta":"¿Cómo trabaja el equipo?","requerido":true,"opciones":[{"valor":"fijos","etiqueta":"Puestos fijos, presencial"},{"valor":"hibrido","etiqueta":"Híbrido, escritorios compartidos"},{"valor":"mixto","etiqueta":"Mixto"}]},{"id":"ofi_espacios","tipo":"checkbox","etiqueta":"¿Qué áreas necesitas?","requerido":true,"opciones":[{"valor":"recepcion","etiqueta":"Recepción y sala de espera"},{"valor":"juntas","etiqueta":"Salas de juntas"},{"valor":"privados","etiqueta":"Oficinas privadas"},{"valor":"operativa","etiqueta":"Área operativa abierta"},{"valor":"cocineta","etiqueta":"Cocineta o comedor"},{"valor":"descanso","etiqueta":"Área de descanso"},{"valor":"capacitacion","etiqueta":"Sala de capacitación"},{"valor":"rack","etiqueta":"Cuarto de servidores o rack"},{"valor":"archivo","etiqueta":"Archivo o bodega"}]},{"id":"ofi_acustica","tipo":"radio","etiqueta":"¿Qué tan importante es el control del ruido?","requerido":false,"opciones":[{"valor":"mucho","etiqueta":"Muy importante"},{"valor":"moderada","etiqueta":"Moderada"},{"valor":"poco","etiqueta":"Poco"}]},{"id":"ofi_cableado","tipo":"radio","etiqueta":"Cableado de datos y eléctrico","requerido":false,"opciones":[{"valor":"existe","etiqueta":"Ya existe"},{"valor":"nuevo","etiqueta":"Hay que hacerlo nuevo"},{"valor":"no_se","etiqueta":"No sé"}]},{"id":"ofi_inmueble","tipo":"radio","etiqueta":"El espacio es…","requerido":true,"opciones":[{"valor":"propio","etiqueta":"Propio"},{"valor":"rentado","etiqueta":"Rentado"}]},{"id":"ofi_horario","tipo":"radio","etiqueta":"Horario para trabajar en obra","requerido":false,"opciones":[{"valor":"libre","etiqueta":"Podemos entrar de noche o fines de semana"},{"valor":"oficina","etiqueta":"Solo en horario de oficina"},{"valor":"no_se","etiqueta":"Aún no lo sé"}]},{"id":"ofi_cultura","tipo":"radio","etiqueta":"Cultura de la empresa","requerido":false,"opciones":[{"valor":"formal","etiqueta":"Formal y corporativa"},{"valor":"creativa","etiqueta":"Creativa y dinámica"},{"valor":"relajada","etiqueta":"Relajada"},{"valor":"mixta","etiqueta":"Mixta"}]},{"id":"ofi_marca_color","tipo":"radio","etiqueta":"Colores de la marca en la oficina","requerido":false,"opciones":[{"valor":"visibles","etiqueta":"Bien visibles"},{"valor":"sutil","etiqueta":"De forma sutil"},{"valor":"no","etiqueta":"No los usaría"}]},{"id":"ofi_privacidad","tipo":"radio","etiqueta":"Distribución","requerido":false,"opciones":[{"valor":"abierta","etiqueta":"Abierta"},{"valor":"mixta","etiqueta":"Mixta"},{"valor":"privada","etiqueta":"Mayormente privada"}]},{"id":"ofi_visitas","tipo":"radio","etiqueta":"¿Reciben clientes en la oficina?","requerido":false,"opciones":[{"valor":"frecuente","etiqueta":"Con frecuencia"},{"valor":"ocasional","etiqueta":"Ocasionalmente"},{"valor":"casi_nunca","etiqueta":"Casi nunca"}]}]},{"id":"cierre","titulo":"Para terminar","mostrarSi":{"campo":"tipo","presente":true},"campos":[{"id":"referencias","tipo":"textarea","etiqueta":"Enlaces de referencia (Pinterest, Instagram…)","requerido":false,"max":500,"ayuda":"Si tienes fotos o planos, mándalos por WhatsApp después."},{"id":"comentarios","tipo":"textarea","etiqueta":"¿Algo más que debamos saber?","requerido":false,"max":800},{"id":"origen","tipo":"select","etiqueta":"¿Cómo nos conociste?","requerido":false,"opciones":[{"valor":"instagram","etiqueta":"Instagram"},{"valor":"facebook","etiqueta":"Facebook o anuncio"},{"valor":"google","etiqueta":"Google"},{"valor":"recomendacion","etiqueta":"Recomendación"},{"valor":"ya_conocia","etiqueta":"Ya los conocía"},{"valor":"otro","etiqueta":"Otro"}]},{"id":"consentimiento","tipo":"consent","etiqueta":"He leído el Aviso de privacidad y acepto que Faro 33 Studio use mis datos para contactarme sobre mi proyecto.","enlace":{"texto":"Aviso de privacidad","href":"/aviso-de-privacidad/"},"requerido":true}]}]};

// ---- src/intake.js ----
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


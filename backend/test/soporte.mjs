/* Apoyo común de las pruebas: schema, worker y datos de ejemplo.
 *
 * intake.js no usa imports (se concatena en el dist). Para probarlo tal cual,
 * aquí se cargan las librerías y se exponen como globales antes de importarlo.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cripto from '../src/lib/cripto.js';
import * as llaves from '../src/lib/llaves.js';
import * as validarMod from '../src/lib/validar.js';
import * as util from '../src/lib/util.js';
import * as turnstile from '../src/lib/turnstile.js';
import * as access from '../src/lib/access.js';
import * as csv from '../src/lib/csv.js';
import * as envio from '../src/lib/envio.js';
import { HTML_ADMIN } from '../src/admin-ui.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');

export const SCHEMA = JSON.parse(readFileSync(join(RAIZ, 'cuestionario', 'schema.json'), 'utf8'));

Object.assign(globalThis, cripto, llaves, validarMod, util, turnstile, access, csv, envio);
globalThis.SCHEMA = SCHEMA;
globalThis.HTML_ADMIN = HTML_ADMIN;

export { cripto, llaves, validarMod, util, turnstile, access, csv, envio, HTML_ADMIN };
export { crearDB } from './d1falso.mjs';
export { hmacHex } from '../src/lib/cripto.js';

const { default: worker } = await import(pathToFileURL(join(AQUI, '..', 'src', 'intake.js')).href);
export { worker };

const { default: adminWorker } = await import(pathToFileURL(join(AQUI, '..', 'src', 'admin.js')).href);
export { adminWorker };

/** Llaves de prueba de exactamente 32 bytes en base64. */
export function llavesPrueba(semilla = 7) {
  const aes = Buffer.alloc(32, semilla);
  const hmac = Buffer.alloc(32, semilla + 1);
  return { aes: aes.toString('base64'), hmac: hmac.toString('base64') };
}

/** Entorno mínimo del Worker; cada prueba puede sobrescribir campos. */
export function crearEntorno(db, extra = {}) {
  const claves = llavesPrueba();
  return {
    DB: db,
    ENC_KEY_V1: claves.aes,
    ACTIVE_KEY_VERSION: '1',
    HMAC_KEY: claves.hmac,
    TURNSTILE_SECRET: 'secreto-de-prueba',
    ALLOWED_ORIGINS: 'https://faro33studio.com,https://www.faro33studio.com',
    RATE_LIMIT_PER_HOUR: '5',
    ...extra
  };
}

const ORIGEN = 'https://faro33studio.com';

/** Respuestas válidas de ejemplo para cada rama. */
export function respuestasResidencial(extra = {}) {
  return {
    tipo: 'residencial',
    nombre: 'Ana Pérez',
    telefono: '667 123 4567',
    ciudad: 'Culiacán',
    contacto_preferido: 'whatsapp',
    situacion: 'obra_nueva',
    m2: '50_100',
    alcance: ['diseno_planos', 'carpinteria'],
    plazo: '1_3_meses',
    res_inmueble: 'casa',
    res_espacios: ['sala', 'cocina'],
    res_ocupantes: '3_4',
    consentimiento: true,
    ...extra
  };
}

export function respuestasComercial(extra = {}) {
  return {
    tipo: 'comercial',
    nombre: 'Bruno Ruiz',
    telefono: '+52 (667) 555-0199',
    ciudad: 'Culiacán',
    contacto_preferido: 'llamada',
    situacion: 'remodelacion',
    m2: '100_150',
    alcance: ['obra_acabados', 'iluminacion'],
    plazo: '3_6_meses',
    com_giro: 'restaurante',
    com_aforo: '20_50',
    com_marca: 'logo',
    com_apertura: '3_6_meses',
    consentimiento: true,
    ...extra
  };
}

export function respuestasOficinas(extra = {}) {
  return {
    tipo: 'oficinas',
    nombre: 'Carla Soto',
    telefono: '6671234567',
    ciudad: 'Culiacán',
    contacto_preferido: 'correo',
    situacion: 'obra_gris',
    m2: '150_250',
    alcance: ['diseno_planos', 'mobiliario'],
    plazo: '1_3_meses',
    ofi_personas: '11_25',
    ofi_modelo: 'hibrido',
    ofi_espacios: ['juntas', 'operativa'],
    ofi_inmueble: 'rentado',
    consentimiento: true,
    ...extra
  };
}

/** Cuerpo JSON que envía el navegador. */
export function cuerpo(campos = {}) {
  return {
    formulario: SCHEMA.id,
    version: SCHEMA.version,
    folio: 'F33-ABC234',
    respuestas: respuestasResidencial(),
    meta: { pagina: '/cuestionario/', cta: 'hero', origen: 'instagram' },
    turnstile: 'token-de-prueba',
    ...campos
  };
}

/** Request POST válido hacia el Worker. */
export function peticion(datos = cuerpo(), opciones = {}) {
  return new Request('https://faro33-intake.example/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGEN,
      'CF-Connecting-IP': '203.0.113.7',
      ...(opciones.cabeceras || {})
    },
    body: typeof datos === 'string' ? datos : JSON.stringify(datos)
  });
}

/**
 * Sustituye fetch global por un Turnstile simulado. Devuelve una función para
 * restaurar el fetch original y el arreglo de llamadas recibidas.
 */
export function simularTurnstile(exito = true) {
  const original = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), opciones });
    return new Response(JSON.stringify({ success: exito }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  return {
    llamadas,
    restaurar() { globalThis.fetch = original; }
  };
}

export const ORIGEN_PERMITIDO = ORIGEN;

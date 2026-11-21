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
export function b64(bytes) {
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
export function deb64(texto) {
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
export async function importarClaveAES(base64) {
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
export async function cifrar(clave, objeto, folio) {
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
export async function descifrar(clave, paquete, folio) {
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
export async function hmacHex(claveHmacBase64, texto) {
  const bytes = bytesDeLlave(claveHmacBase64);
  const clave = await crypto.subtle.importKey(
    'raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(String(texto)));
  return Array.from(new Uint8Array(firma), byte => byte.toString(16).padStart(2, '0')).join('');
}

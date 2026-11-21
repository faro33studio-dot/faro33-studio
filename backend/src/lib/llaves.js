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
export async function claveDeVersion(env, numero) {
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
export async function claveActiva(env) {
  const version = versionDe(env ? env.ACTIVE_KEY_VERSION : undefined, 1);
  if (version === null) throw new Error('llave_no_configurada');
  return claveDeVersion(env, version);
}

/* Verificación de Cloudflare Turnstile.
 *
 * No se registra el token ni la IP; solo se devuelve {ok}.
 * Tiempo máximo de espera: 5 s (AbortController).
 */

const URL_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ESPERA_MAXIMA_MS = 5000;

/** POST de siteverify con formulario. Devuelve {ok} y nunca lanza por red. */
export async function verificarTurnstile(token, secreto, ip) {
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

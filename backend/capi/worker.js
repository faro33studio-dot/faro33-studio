/* Worker `faro33-capi` (Cloudflare) — copia de REFERENCIA para el repositorio.
 *
 * La versión desplegada vive en el dashboard de Cloudflare (Workers & Pages → faro33-capi); si la cambias allá,
 * actualiza esta copia. Recibe desde el sitio (assets/origen.js) el mismo `Lead` que el Píxel dispara en el
 * navegador y lo reenvía a la API de conversiones de Meta con el MISMO event_id, para que Meta deduplique.
 * No recibe ni envía correo, teléfono ni datos personales: solo IP/navegador del visitante y cookies _fbp/_fbc.
 *
 * Variables en Cloudflare (Settings → Variables and Secrets):
 *   PIXEL_ID    texto   883854600914341
 *   META_TOKEN  SECRET  token de acceso de la API de conversiones (nunca en el repo ni en chats)
 *   TEST_CODE   texto   código de «Probar eventos»; MIENTRAS ESTÉ PUESTO los eventos del servidor NO cuentan como
 *                       reales. BORRARLO al terminar la prueba.
 * Versión de Graph API: v21.0 — verificar en la documentación de Meta que siga vigente.
 *
 * TikTok Events API (2026-11-26, opcional: sin estas variables no se envía nada a TikTok):
 *   TIKTOK_PIXEL_ID   texto   ID del píxel de TikTok (el mismo que TIKTOK_PIXEL_ID en assets/origen.js)
 *   TIKTOK_TOKEN      SECRET  Access token de la Events API (Events Manager de TikTok; nunca en el repo ni en chats)
 *   TIKTOK_TEST_CODE  texto   código de prueba de TikTok; MIENTRAS ESTÉ PUESTO los eventos son de prueba. Borrarlo al terminar.
 * El navegador manda en el mismo POST `tt_event` (Contact = clic a WhatsApp, Lead = cuestionario), `ttp` (cookie _ttp)
 * y `ttclid`. Se usa el MISMO event_id que el píxel de TikTok: TikTok deduplica navegador y servidor.
 * Endpoint v1.3 — verificar en business-api.tiktok.com/portal/docs que siga vigente.
 */
const ORIGINS = ['https://faro33studio.com', 'https://www.faro33studio.com'];
const EVENTS = ['Lead', 'VistaCortinas', 'DescargaBrochure'];

const TT_EVENTS = ['Contact', 'Lead'];
const TT_KEEP = ['value', 'currency', 'content_name', 'content_category'];

function tiktok(b, req, env) {
  if (!env.TIKTOK_PIXEL_ID || !env.TIKTOK_TOKEN || b.event_name !== 'Lead' || !TT_EVENTS.includes(b.tt_event)) return null;
  const c = b.custom || {};
  const properties = {};
  for (const k of TT_KEEP) if (c[k] !== undefined) properties[k] = c[k];
  const body = {
    event_source: 'web',
    event_source_id: env.TIKTOK_PIXEL_ID,
    data: [{
      event: b.tt_event,
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(b.event_id).slice(0, 64),
      user: {
        ip: req.headers.get('CF-Connecting-IP') || undefined,
        user_agent: req.headers.get('User-Agent') || undefined,
        ttp: b.ttp ? String(b.ttp).slice(0, 200) : undefined,
        ttclid: b.ttclid ? String(b.ttclid).slice(0, 200) : undefined,
      },
      page: { url: String(b.url || '').slice(0, 500) },
      properties,
    }],
  };
  if (env.TIKTOK_TEST_CODE) body.test_event_code = env.TIKTOK_TEST_CODE;
  return fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Access-Token': env.TIKTOK_TOKEN },
    body: JSON.stringify(body),
  }).catch(() => null);
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const ok = ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST' || !ok) return new Response('no', { status: 403, headers: cors });

    let b;
    try { b = await req.json(); } catch { return new Response('bad', { status: 400, headers: cors }); }
    if (!EVENTS.includes(b.event_name) || !b.event_id) {
      return new Response('bad', { status: 400, headers: cors });
    }

    const payload = {
      data: [{
        event_name: b.event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: String(b.event_id).slice(0, 64),
        event_source_url: String(b.url || '').slice(0, 500),
        action_source: 'website',
        user_data: {
          client_ip_address: req.headers.get('CF-Connecting-IP'),
          client_user_agent: req.headers.get('User-Agent'),
          fbp: b.fbp || undefined,
          fbc: b.fbc || undefined,
        },
        custom_data: b.custom || {},
      }],
    };
    if (env.TEST_CODE) payload.test_event_code = env.TEST_CODE;

    const tt = tiktok(b, req, env);
    if (tt && ctx && ctx.waitUntil) ctx.waitUntil(tt);

    const r = await fetch(
      `https://graph.facebook.com/v21.0/${env.PIXEL_ID}/events?access_token=${env.META_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    return new Response(r.ok ? 'ok' : 'meta-error', { status: r.ok ? 200 : 502, headers: cors });
  },
};

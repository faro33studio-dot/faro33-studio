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
 */
const ORIGINS = ['https://faro33studio.com', 'https://www.faro33studio.com'];
const EVENTS = ['Lead', 'VistaCortinas', 'DescargaBrochure'];

export default {
  async fetch(req, env) {
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

    const r = await fetch(
      `https://graph.facebook.com/v21.0/${env.PIXEL_ID}/events?access_token=${env.META_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    return new Response(r.ok ? 'ok' : 'meta-error', { status: r.ok ? 200 : 502, headers: cors });
  },
};

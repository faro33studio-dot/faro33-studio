// Conversions API para Faro 33 Studio (Cloudflare Worker).
// Recibe eventos del navegador con el mismo event_id que el pixel y los reenvía a Meta.
// El token de acceso va en el secreto META_TOKEN, nunca en este archivo.

const PIXEL_ID = '883854600914341';
const GRAPH_VERSION = 'v21.0'; // revisar la versión vigente de la Graph API al desplegar
const ALLOWED_ORIGINS = ['https://faro33studio.com', 'https://www.faro33studio.com'];
const ALLOWED_EVENTS = new Set(['Lead', 'Contact']);
const SHA256_HEX = /^[a-f0-9]{64}$/;

const text = (v, max) => (typeof v === 'string' && v.length ? v.slice(0, max) : undefined);

export function buildPayload(body, req, testEventCode) {
  if (!body || !ALLOWED_EVENTS.has(body.event_name)) return null;
  const eventId = text(body.event_id, 128);
  if (!eventId) return null;

  const ud = body.user_data || {};
  const userData = {};
  if (SHA256_HEX.test(ud.em)) userData.em = [ud.em];
  if (SHA256_HEX.test(ud.ph)) userData.ph = [ud.ph];
  const fbp = text(ud.fbp, 200);
  const fbc = text(ud.fbc, 200);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  // La IP y el user agent los toma el Worker de la conexión; el navegador no los envía.
  const ip = req.headers.get('CF-Connecting-IP');
  const ua = req.headers.get('User-Agent');
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;

  const payload = {
    data: [{
      event_name: body.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: text(body.url, 500),
      action_source: 'website',
      user_data: userData,
      custom_data: {
        content_name: text(body.content_name, 100),
        content_category: text(body.content_category, 50),
      },
    }],
  };
  if (testEventCode) payload.test_event_code = testEventCode;
  return payload;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = allowed
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Vary': 'Origin',
        }
      : {};

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST' || !allowed) return new Response('forbidden', { status: 403, headers: cors });

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response('bad json', { status: 400, headers: cors });
    }

    const payload = buildPayload(body, req, env.TEST_EVENT_CODE);
    if (!payload) return new Response('invalid event', { status: 400, headers: cors });

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${env.META_TOKEN}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // No se reenvía el cuerpo de Meta al navegador.
    return new Response(r.ok ? 'ok' : 'upstream error', { status: r.ok ? 200 : 502, headers: cors });
  },
};

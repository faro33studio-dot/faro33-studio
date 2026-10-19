import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { buildPayload } from '../worker.js';

const HASH = 'a'.repeat(64);
const req = (headers = {}) => new Request('https://faro33-meta-capi.example.workers.dev/', {
  method: 'POST',
  headers: { 'CF-Connecting-IP': '189.1.2.3', 'User-Agent': 'UA-test', ...headers },
});

test('arma el evento con event_id, hashes e IP del servidor', () => {
  const p = buildPayload({
    event_name: 'Lead', event_id: 'abc-123', url: 'https://faro33studio.com/',
    content_name: 'Brief form', user_data: { em: HASH, ph: HASH, fbp: 'fb.1.1.1', fbc: 'fb.1.1.2' },
  }, req());
  const e = p.data[0];
  assert.equal(e.event_name, 'Lead');
  assert.equal(e.event_id, 'abc-123');
  assert.equal(e.action_source, 'website');
  assert.deepEqual(e.user_data.em, [HASH]);
  assert.deepEqual(e.user_data.ph, [HASH]);
  assert.equal(e.user_data.client_ip_address, '189.1.2.3');
  assert.equal(e.user_data.client_user_agent, 'UA-test');
  assert.equal(e.custom_data.content_name, 'Brief form');
});

test('rechaza eventos fuera de la lista y sin event_id', () => {
  assert.equal(buildPayload({ event_name: 'Purchase', event_id: 'x' }, req()), null);
  assert.equal(buildPayload({ event_name: 'Lead' }, req()), null);
  assert.equal(buildPayload(null, req()), null);
});

test('descarta datos personales que no estén hasheados', () => {
  const p = buildPayload({ event_name: 'Contact', event_id: 'x', user_data: { em: 'persona@correo.com', ph: '6675402559' } }, req());
  assert.equal(p.data[0].user_data.em, undefined);
  assert.equal(p.data[0].user_data.ph, undefined);
});

test('pasa el código de prueba solo si se configura', () => {
  assert.equal(buildPayload({ event_name: 'Lead', event_id: 'x' }, req(), 'TEST1').test_event_code, 'TEST1');
  assert.equal(buildPayload({ event_name: 'Lead', event_id: 'x' }, req()).test_event_code, undefined);
});

test('responde 403 a orígenes no permitidos', async () => {
  const r = await worker.fetch(req({ Origin: 'https://otro-sitio.com' }), { META_TOKEN: 't' });
  assert.equal(r.status, 403);
});

test('reenvía a Meta con el token y devuelve 200', async () => {
  const realFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return new Response('{}', { status: 200 }); };
  try {
    const r = await worker.fetch(req({ Origin: 'https://faro33studio.com' }).clone(), { META_TOKEN: 'SECRET' });
    assert.equal(r.status, 400); // cuerpo vacío → JSON inválido
    const body = JSON.stringify({ event_name: 'Contact', event_id: 'z1', user_data: { em: HASH } });
    const ok = await worker.fetch(new Request('https://x.example/', {
      method: 'POST', body,
      headers: { Origin: 'https://www.faro33studio.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.1.1.1' },
    }), { META_TOKEN: 'SECRET' });
    assert.equal(ok.status, 200);
    assert.match(seen.url, /graph\.facebook\.com\/v\d+\.\d+\/883854600914341\/events\?access_token=SECRET$/);
    assert.equal(seen.body.data[0].event_id, 'z1');
  } finally {
    globalThis.fetch = realFetch;
  }
});

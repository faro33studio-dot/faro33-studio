import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cuerpo, crearDB, crearEntorno, hmacHex, llavesPrueba, ORIGEN_PERMITIDO,
  peticion, respuestasResidencial, simularTurnstile, worker
} from './soporte.mjs';
import { claveActiva } from '../src/lib/llaves.js';
import { descifrar } from '../src/lib/cripto.js';

async function ejecutar(datos, opciones = {}) {
  const db = opciones.db || crearDB();
  const env = opciones.env || crearEntorno(db, opciones.envExtra || {});
  const turnstile = opciones.turnstile || simularTurnstile(opciones.exitoTurnstile !== false);
  try {
    const respuesta = await worker.fetch(
      opciones.request || peticion(datos, opciones.requestOpciones || {}),
      env,
      {}
    );
    const texto = await respuesta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* respuesta sin cuerpo */ }
    return { respuesta, texto, json, db, env, turnstile };
  } finally {
    turnstile.restaurar();
  }
}

test('éxito: 200, una fila y PII solo dentro de ciphertext', async () => {
  const datos = cuerpo();
  const { respuesta, json, db, env } = await ejecutar(datos);
  assert.equal(respuesta.status, 200);
  assert.deepEqual(json, { ok: true, folio: datos.folio });
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(respuesta.headers.get('access-control-allow-origin'), ORIGEN_PERMITIDO);

  assert.equal(db.filas.length, 1);
  const fila = db.filas[0];
  assert.equal(fila.folio, datos.folio);
  assert.equal(fila.status, 'nuevo');
  assert.equal(fila.key_version, 1);
  assert.equal(fila.tipo, 'residencial');
  assert.equal(fila.origen, 'instagram');
  assert.equal(fila.cta, 'hero');
  assert.match(fila.created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fila.phone_hash, await hmacHex(env.HMAC_KEY, '6671234567'));
  assert.equal(fila.ip_hash.length, 32);
  assert.match(fila.iv, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.ok(fila.ciphertext.length > 0);

  const serializada = JSON.stringify(fila);
  assert.equal(serializada.includes('Ana Pérez'), false);
  assert.equal(serializada.includes('667 123 4567'), false);
  assert.equal(serializada.includes('6671234567'), false);
  assert.equal(serializada.includes('Culiacán'), false);

  const { clave } = await claveActiva(env);
  const blob = await descifrar(clave, { iv: fila.iv, ciphertext: fila.ciphertext }, fila.folio);
  assert.equal(blob.respuestas.nombre, 'Ana Pérez');
  assert.equal(blob.respuestas.telefono, '667 123 4567');
  assert.deepEqual(blob.meta, { pagina: '/cuestionario/', cta: 'hero', origen: 'instagram' });
  assert.match(blob.recibido, /^\d{4}-\d{2}-\d{2}T/);
});

test('folio repetido: 200 idempotente y una sola fila', async () => {
  const db = crearDB();
  const env = crearEntorno(db);
  const datos = cuerpo();
  const turnstile = simularTurnstile(true);
  try {
    const primera = await worker.fetch(peticion(datos), env, {});
    const segunda = await worker.fetch(peticion(datos), env, {});
    assert.equal(primera.status, 200);
    assert.equal(segunda.status, 200);
    assert.deepEqual(await segunda.json(), { ok: true, folio: datos.folio });
  } finally {
    turnstile.restaurar();
  }
  assert.equal(db.filas.length, 1);
});

test('origen no permitido: 403 sin cuerpo útil y sin Access-Control-Allow-Origin', async () => {
  const { respuesta, texto, db } = await ejecutar(cuerpo(), {
    requestOpciones: { cabeceras: { Origin: 'https://malicioso.example' } }
  });
  assert.equal(respuesta.status, 403);
  assert.equal(texto, '');
  assert.equal(respuesta.headers.get('access-control-allow-origin'), null);
  assert.equal(db.filas.length, 0);
});

test('Turnstile inválido: 403 verificacion', async () => {
  const { respuesta, json, db } = await ejecutar(cuerpo(), { exitoTurnstile: false });
  assert.equal(respuesta.status, 403);
  assert.deepEqual(json, { ok: false, error: 'verificacion' });
  assert.equal(db.filas.length, 0);
});

test('sin TURNSTILE_SECRET: 503 config; con ALLOW_NO_TURNSTILE=1 pasa', async () => {
  const sinSecreto = await ejecutar(cuerpo(), {
    envExtra: { TURNSTILE_SECRET: undefined }
  });
  assert.equal(sinSecreto.respuesta.status, 503);
  assert.deepEqual(sinSecreto.json, { ok: false, error: 'config' });

  const permitido = await ejecutar(cuerpo(), {
    envExtra: { TURNSTILE_SECRET: undefined, ALLOW_NO_TURNSTILE: '1' }
  });
  assert.equal(permitido.respuesta.status, 200);
  assert.equal(permitido.db.filas.length, 1);
});

test('token de Turnstile ausente: 403 verificacion', async () => {
  const { respuesta } = await ejecutar(cuerpo({ turnstile: '' }));
  assert.equal(respuesta.status, 403);
});

test('cuerpo mayor de 32 KB: 413', async () => {
  const enorme = cuerpo({ relleno: 'x'.repeat(33 * 1024) });
  const { respuesta, json } = await ejecutar(enorme);
  assert.equal(respuesta.status, 413);
  assert.deepEqual(json, { ok: false, error: 'tamano' });
});

test('Content-Length declarado mayor de 32 KB: 413 aunque el cuerpo real sea corto', async () => {
  const solicitud = new Request('https://faro33-intake.example/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGEN_PERMITIDO,
      'CF-Connecting-IP': '203.0.113.7',
      'Content-Length': String(33 * 1024)
    },
    body: '{}'
  });
  const { respuesta, json } = await ejecutar(null, { request: solicitud });
  assert.equal(respuesta.status, 413);
  assert.deepEqual(json, { ok: false, error: 'tamano' });
});

test('JSON malformado: 400', async () => {
  const { respuesta } = await ejecutar('{esto no es json');
  assert.equal(respuesta.status, 400);
});

test('versión distinta: 409 version', async () => {
  const { respuesta, json } = await ejecutar(cuerpo({ version: 2 }));
  assert.equal(respuesta.status, 409);
  assert.deepEqual(json, { ok: false, error: 'version' });
});

test('datos inválidos: 422 solo con ids y sin valores', async () => {
  const datos = cuerpo({
    respuestas: respuestasResidencial({
      telefono: '98765',
      nombre: 'NombreQueNoDebeSalir',
      correo: 'privado@ejemplo.mx'
    })
  });
  const { respuesta, json, texto } = await ejecutar(datos);
  assert.equal(respuesta.status, 422);
  assert.deepEqual(json, { ok: false, error: 'datos', campos: ['telefono'] });
  assert.equal(texto.includes('98765'), false);
  assert.equal(texto.includes('NombreQueNoDebeSalir'), false);
  assert.equal(texto.includes('privado@ejemplo.mx'), false);
});

test('límite por IP: la sexta en una hora responde 429', async () => {
  const db = crearDB();
  const env = crearEntorno(db, { RATE_LIMIT_PER_HOUR: '5' });
  const turnstile = simularTurnstile(true);
  const estados = [];
  try {
    for (let i = 0; i < 6; i += 1) {
      const folio = 'F33-ABC23' + String(i + 2);
      const respuesta = await worker.fetch(peticion(cuerpo({ folio })), env, {});
      estados.push(respuesta.status);
      if (i === 5) assert.deepEqual(await respuesta.json(), { ok: false, error: 'limite' });
    }
  } finally {
    turnstile.restaurar();
  }
  assert.deepEqual(estados, [200, 200, 200, 200, 200, 429]);
  assert.equal(db.filas.length, 5);
});

test('ninguna respuesta de error contiene valores de las respuestas', async () => {
  const secreto = 'DatoSensibleXYZ';
  const escenarios = [
    cuerpo({ respuestas: respuestasResidencial({ nombre: secreto, telefono: '1' }) }),
    cuerpo({ version: 99 }),
    '{roto ' + secreto,
    cuerpo({ folio: 'MALO' })
  ];
  for (const datos of escenarios) {
    const { texto } = await ejecutar(datos);
    assert.equal(texto.includes(secreto), false, 'la respuesta filtró un valor');
  }
});

test('ningún log contiene PII y todos son JSON con evento/codigo', async () => {
  const original = console.log;
  const lineas = [];
  console.log = (...partes) => lineas.push(partes.join(' '));
  try {
    await ejecutar(cuerpo());
  } finally {
    console.log = original;
  }
  assert.ok(lineas.length >= 1);
  for (const linea of lineas) {
    const registro = JSON.parse(linea);
    assert.deepEqual(Object.keys(registro).sort(), ['codigo', 'evento', 'folio']);
    assert.equal(linea.includes('Ana'), false);
    assert.equal(linea.includes('667'), false);
  }
});

test('OPTIONS correcto para origen permitido', async () => {
  const respuesta = await worker.fetch(new Request('https://faro33-intake.example/', {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGEN_PERMITIDO,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  }), crearEntorno(crearDB()), {});
  assert.equal(respuesta.status, 204);
  assert.equal(respuesta.headers.get('access-control-allow-origin'), ORIGEN_PERMITIDO);
  assert.match(respuesta.headers.get('access-control-allow-methods'), /POST/);
  assert.match(respuesta.headers.get('access-control-allow-headers'), /Content-Type/i);
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
});

test('OPTIONS de origen no permitido: 403', async () => {
  const respuesta = await worker.fetch(new Request('https://faro33-intake.example/', {
    method: 'OPTIONS',
    headers: { Origin: 'https://malicioso.example' }
  }), crearEntorno(crearDB()), {});
  assert.equal(respuesta.status, 403);
  assert.equal(respuesta.headers.get('access-control-allow-origin'), null);
});

test('GET /salud responde {ok:true} sin datos y sin exigir Origin', async () => {
  const respuesta = await worker.fetch(new Request('https://faro33-intake.example/salud'),
    crearEntorno(crearDB()), {});
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { ok: true });
});

test('método y ruta incorrectos: 405 y 404', async () => {
  const get = await worker.fetch(new Request('https://faro33-intake.example/', {
    method: 'GET', headers: { Origin: ORIGEN_PERMITIDO }
  }), crearEntorno(crearDB()), {});
  assert.equal(get.status, 405);

  const otra = await worker.fetch(new Request('https://faro33-intake.example/otra', {
    method: 'POST', headers: { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' },
    body: '{}'
  }), crearEntorno(crearDB()), {});
  assert.equal(otra.status, 404);
});

test('Content-Type distinto de application/json: 415', async () => {
  const respuesta = await worker.fetch(new Request('https://faro33-intake.example/', {
    method: 'POST',
    headers: { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'text/plain' },
    body: JSON.stringify(cuerpo())
  }), crearEntorno(crearDB()), {});
  assert.equal(respuesta.status, 415);
});

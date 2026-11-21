import test from 'node:test';
import assert from 'node:assert/strict';

import { verificarAccess } from '../src/lib/access.js';

/* Par RSA de prueba y JWKS simulado. La verificación real usa WebCrypto. */
const par = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256'
  },
  true,
  ['sign', 'verify']
);

const jwkPublica = await crypto.subtle.exportKey('jwk', par.publicKey);
const KID = 'llave-prueba-1';
const JWKS = {
  keys: [{
    kty: 'RSA',
    n: jwkPublica.n,
    e: jwkPublica.e,
    alg: 'RS256',
    use: 'sig',
    kid: KID
  }]
};

let contadorDominios = 0;
function dominioNuevo() {
  contadorDominios += 1;
  return 'equipo-' + contadorDominios + '.cloudflareaccess.com';
}

function b64url(valor) {
  if (typeof valor === 'string') return Buffer.from(valor, 'utf8').toString('base64url');
  return Buffer.from(valor).toString('base64url');
}

function carga(dominio, extra = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://' + dominio,
    aud: 'aud-faro33',
    email: 'duena@faro33.mx',
    exp: ahora + 300,
    iat: ahora - 10,
    nbf: ahora - 10,
    ...extra
  };
}

async function firmar(dominio, opciones = {}) {
  const cabecera = {
    alg: 'RS256',
    typ: 'JWT',
    kid: KID,
    ...(opciones.cabecera || {})
  };
  const cuerpo = opciones.carga || carga(dominio, opciones.extra || {});
  const h = b64url(JSON.stringify(cabecera));
  const p = b64url(JSON.stringify(cuerpo));
  if (opciones.sinFirma) return h + '.' + p + '.';
  const firma = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    par.privateKey,
    new TextEncoder().encode(h + '.' + p)
  ));
  let texto = b64url(firma);
  if (opciones.alterarFirma) texto = (texto[0] === 'A' ? 'B' : 'A') + texto.slice(1);
  return h + '.' + p + '.' + texto;
}

function entorno(dominio, extra = {}) {
  return {
    ACCESS_TEAM_DOMAIN: dominio,
    ACCESS_AUD: 'aud-faro33',
    ADMIN_EMAILS: 'duena@faro33.mx',
    ...extra
  };
}

function peticion(token) {
  const cabeceras = {};
  if (token !== undefined) cabeceras['Cf-Access-Jwt-Assertion'] = token;
  return new Request('https://admin.faro33.example/', { headers: cabeceras });
}

function simularJWKS(respuesta, opciones = {}) {
  const original = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url) => {
    llamadas.push(String(url));
    if (opciones.fallar) throw new Error('sin red');
    return new Response(JSON.stringify(respuesta), {
      status: opciones.estado || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  return {
    llamadas,
    restaurar() { globalThis.fetch = original; }
  };
}

async function verificar(token, env) {
  return verificarAccess(peticion(token), env);
}

test('JWT válido: {ok:true, correo} y una petición al JWKS', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio);
  const jwks = simularJWKS(JWKS);
  try {
    const resultado = await verificar(token, entorno(dominio));
    assert.deepEqual(resultado, { ok: true, correo: 'duena@faro33.mx' });
    assert.equal(jwks.llamadas.length, 1);
    assert.match(jwks.llamadas[0], /\/cdn-cgi\/access\/certs$/);
  } finally {
    jwks.restaurar();
  }
});

test('firma alterada: deniega', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio, { alterarFirma: true });
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('alg distinto de RS256: deniega sin verificar la firma', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio, { cabecera: { alg: 'HS256' } });
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('aud incorrecto: deniega', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio, { extra: { aud: 'otra-audiencia' } });
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('iss incorrecto: deniega', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio, { extra: { iss: 'https://otro-equipo.cloudflareaccess.com' } });
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('expirado (más de 60 s): deniega', async () => {
  const dominio = dominioNuevo();
  const ahora = Math.floor(Date.now() / 1000);
  const token = await firmar(dominio, { extra: { exp: ahora - 120 } });
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('nbf en el futuro: deniega', async () => {
  const dominio = dominioNuevo();
  const ahora = Math.floor(Date.now() / 1000);
  const token = await firmar(dominio, { extra: { nbf: ahora + 300 } });
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('kid desconocido: deniega', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio, { cabecera: { kid: 'no-existe' } });
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('correo fuera de ADMIN_EMAILS: deniega', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio, { extra: { email: 'intruso@ejemplo.mx' } });
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('ADMIN_EMAILS vacío: deniega todo', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio);
  const jwks = simularJWKS(JWKS);
  try {
    assert.deepEqual(await verificar(token, entorno(dominio, { ADMIN_EMAILS: '' })), { ok: false });
    assert.deepEqual(await verificar(token, entorno(dominio, { ADMIN_EMAILS: ' , ' })), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('sin cabecera Cf-Access-Jwt-Assertion: deniega', async () => {
  const dominio = dominioNuevo();
  assert.deepEqual(await verificar(undefined, entorno(dominio)), { ok: false });
});

test('JWKS no disponible (red caída): deniega', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio);
  const jwks = simularJWKS(JWKS, { fallar: true });
  try {
    assert.deepEqual(await verificar(token, entorno(dominio)), { ok: false });
  } finally {
    jwks.restaurar();
  }
});

test('caché del JWKS: dos verificaciones seguidas hacen una sola petición', async () => {
  const dominio = dominioNuevo();
  const token = await firmar(dominio);
  const jwks = simularJWKS(JWKS);
  try {
    const primera = await verificar(token, entorno(dominio));
    const segunda = await verificar(token, entorno(dominio));
    assert.equal(primera.ok, true);
    assert.equal(segunda.ok, true);
    assert.equal(jwks.llamadas.length, 1);
  } finally {
    jwks.restaurar();
  }
});

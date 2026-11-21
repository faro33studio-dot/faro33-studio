import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { b64, deb64, cifrar, descifrar, hmacHex, importarClaveAES } from '../src/lib/cripto.js';
import { claveActiva, claveDeVersion } from '../src/lib/llaves.js';
import { normalizarTelefono } from '../src/lib/util.js';
import { llavesPrueba } from './soporte.mjs';

test('base64: ida y vuelta con bytes arbitrarios', () => {
  const bytes = new Uint8Array([0, 1, 2, 127, 128, 255, 10, 20]);
  assert.deepEqual([...deb64(b64(bytes))], [...bytes]);
  assert.throws(() => deb64('***'), /base64_invalido/);
});

test('importarClaveAES valida que sean exactamente 32 bytes', async () => {
  const corta = Buffer.alloc(16, 1).toString('base64');
  await assert.rejects(() => importarClaveAES(corta), /32 bytes/);
  await assert.rejects(() => importarClaveAES('no-es-base64'), /clave_invalida/);
  const valida = await importarClaveAES(llavesPrueba().aes);
  assert.equal(valida.algorithm.name, 'AES-GCM');
});

test('cifrar/descifrar: ida y vuelta con AAD = folio', async () => {
  const { aes } = llavesPrueba();
  const clave = await importarClaveAES(aes);
  const original = {
    respuestas: { nombre: 'Ana Pérez', telefono: '667 123 4567', consentimiento: true },
    meta: { pagina: '/cuestionario/', cta: 'hero', origen: 'instagram' },
    recibido: '2026-01-02T03:04:05.000Z'
  };
  const paquete = await cifrar(clave, original, 'F33-ABC234');
  assert.equal(deb64(paquete.iv).length, 12);
  const claro = await descifrar(clave, paquete, 'F33-ABC234');
  assert.deepEqual(claro, original);
});

test('descifrar falla si el AAD (folio) no coincide', async () => {
  const clave = await importarClaveAES(llavesPrueba().aes);
  const paquete = await cifrar(clave, { hola: 'mundo' }, 'F33-ABC234');
  await assert.rejects(() => descifrar(clave, paquete, 'F33-ZZZ999'));
});

test('descifrar falla si se altera un byte del texto cifrado', async () => {
  const clave = await importarClaveAES(llavesPrueba().aes);
  const paquete = await cifrar(clave, { hola: 'mundo' }, 'F33-ABC234');
  const bytes = deb64(paquete.ciphertext);
  bytes[bytes.length - 1] ^= 0x01;
  await assert.rejects(() =>
    descifrar(clave, { iv: paquete.iv, ciphertext: b64(bytes) }, 'F33-ABC234'));
});

test('versionado: una fila v1 se descifra después de activar v2', async () => {
  const v1 = llavesPrueba(7);
  const v2 = llavesPrueba(21);
  const entorno = {
    ENC_KEY_V1: v1.aes,
    ENC_KEY_V2: v2.aes,
    ACTIVE_KEY_VERSION: '1'
  };
  const activa1 = await claveActiva(entorno);
  assert.equal(activa1.version, 1);
  const paqueteV1 = await cifrar(activa1.clave, { dato: 'fila vieja' }, 'F33-ABC234');

  entorno.ACTIVE_KEY_VERSION = '2';
  const activa2 = await claveActiva(entorno);
  assert.equal(activa2.version, 2);
  const paqueteV2 = await cifrar(activa2.clave, { dato: 'fila nueva' }, 'F33-DEF567');
  assert.notEqual(paqueteV1.ciphertext, paqueteV2.ciphertext);

  const vieja = await claveDeVersion(entorno, 1);
  assert.deepEqual(await descifrar(vieja.clave, paqueteV1, 'F33-ABC234'), { dato: 'fila vieja' });
  // La llave nueva no puede abrir la fila vieja.
  await assert.rejects(() => descifrar(activa2.clave, paqueteV1, 'F33-ABC234'));
});

test('claveActiva/claveDeVersion fallan con llave_no_configurada', async () => {
  await assert.rejects(() => claveActiva({}), /llave_no_configurada/);
  await assert.rejects(() => claveDeVersion({ ENC_KEY_V1: llavesPrueba().aes }, 2),
    /llave_no_configurada/);
  await assert.rejects(() => claveActiva({ ENC_KEY_V1: llavesPrueba().aes, ACTIVE_KEY_VERSION: 'x' }),
    /llave_no_configurada/);
});

test('hmacHex coincide con node:crypto y es estable', async () => {
  const { hmac } = llavesPrueba();
  const texto = '203.0.113.7';
  const obtenido = await hmacHex(hmac, texto);
  const esperado = createHmac('sha256', Buffer.from(hmac, 'base64')).update(texto).digest('hex');
  assert.equal(obtenido, esperado);
  assert.match(obtenido, /^[0-9a-f]{64}$/);
  assert.equal(await hmacHex(hmac, texto), obtenido);
  assert.notEqual(await hmacHex(hmac, texto + 'x'), obtenido);
});

test('normalizarTelefono deja los últimos 10 dígitos con +52, espacios y guiones', () => {
  assert.equal(normalizarTelefono('+52 667 123 4567'), '6671234567');
  assert.equal(normalizarTelefono('+52 (667) 123-4567'), '6671234567');
  assert.equal(normalizarTelefono('667-123-4567'), '6671234567');
  assert.equal(normalizarTelefono('667.123.4567'), '6671234567');
  assert.equal(normalizarTelefono('+52 1 667 123 4567'), '6671234567');
  assert.equal(normalizarTelefono('123'), '123');
  assert.equal(normalizarTelefono(''), '');
  assert.equal(normalizarTelefono(null), '');
});

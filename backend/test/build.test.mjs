import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { cuerpo, crearDB, crearEntorno, peticion, simularTurnstile } from './soporte.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(AQUI, '..');
const DIST = join(BACKEND, 'dist', 'intake.worker.js');
const DIST_ADMIN = join(BACKEND, 'dist', 'admin.worker.js');

function construir(argumentos) {
  return spawnSync(process.execPath, ['build.mjs', ...argumentos], {
    cwd: BACKEND,
    encoding: 'utf8'
  });
}

test('build.mjs genera un módulo ES válido, sin imports y con la leyenda', async () => {
  const resultado = construir(['--schema', '../cuestionario/schema.json']);
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);
  assert.match(resultado.stdout, /Generado/);

  const codigo = readFileSync(DIST, 'utf8');
  assert.match(codigo, /ARCHIVO GENERADO: no editar a mano/);
  assert.match(codigo, /Fecha de generación:/);
  assert.match(codigo, /const SCHEMA = \{/);
  assert.equal(/^\s*import\b/m.test(codigo), false, 'el dist no debe tener imports');
  assert.equal((codigo.match(/^\s*export\s+default\b/gm) || []).length, 1);

  const modulo = await import(pathToFileURL(DIST).href + '?v=' + Date.now());
  assert.equal(typeof modulo.default.fetch, 'function');
});

test('el dist se comporta igual que la fuente en un envío exitoso', async () => {
  const construccion = construir([]);
  assert.equal(construccion.status, 0, construccion.stderr);

  const modulo = await import(pathToFileURL(DIST).href + '?v=' + Date.now() + '-flujo');
  const datos = cuerpo();
  const db = crearDB();
  const env = crearEntorno(db);
  const turnstile = simularTurnstile(true);
  try {
    const respuesta = await modulo.default.fetch(peticion(datos), env, {});
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), { ok: true, folio: datos.folio });
  } finally {
    turnstile.restaurar();
  }
  assert.equal(db.filas.length, 1);
  assert.equal(JSON.stringify(db.filas[0]).includes('Ana Pérez'), false);
});

test('--target admin genera un módulo ES válido, sin imports y con fetch', async () => {
  const resultado = construir(['--target', 'admin', '--schema', '../cuestionario/schema.json']);
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);
  assert.match(resultado.stdout, /admin\.worker\.js/);

  const codigo = readFileSync(DIST_ADMIN, 'utf8');
  assert.match(codigo, /ARCHIVO GENERADO: no editar a mano/);
  assert.match(codigo, /Fecha de generación:/);
  assert.match(codigo, /const SCHEMA = \{/);
  assert.match(codigo, /const HTML_ADMIN =/);
  assert.match(codigo, /ACCESS_TEAM_DOMAIN/);
  assert.equal(/^\s*import\b/m.test(codigo), false, 'el dist admin no debe tener imports');
  assert.equal((codigo.match(/^\s*export\s+default\b/gm) || []).length, 1);

  const modulo = await import(pathToFileURL(DIST_ADMIN).href + '?v=' + Date.now());
  assert.equal(typeof modulo.default.fetch, 'function');
});

test('--target intake conserva su dist sin librerías del panel admin', () => {
  const resultado = construir(['--target', 'intake', '--schema', '../cuestionario/schema.json']);
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);
  const codigo = readFileSync(DIST, 'utf8');
  assert.equal(codigo.includes('src/lib/access.js'), false);
  assert.equal(codigo.includes('src/lib/csv.js'), false);
  assert.equal(codigo.includes('src/lib/envio.js'), false);
  assert.equal(codigo.includes('src/lib/validar.js'), true);
});

test('--target desconocido falla', () => {
  const resultado = construir(['--target', 'otro']);
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /target/);
});

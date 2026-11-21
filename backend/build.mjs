#!/usr/bin/env node
/*
 * Genera un único módulo ES listo para pegar en el editor del dashboard de
 * Cloudflare.
 *
 * Uso:
 *   node build.mjs                                  # intake (por omisión)
 *   node build.mjs --target intake
 *   node build.mjs --target admin
 *   node build.mjs --schema ../cuestionario/schema.json
 *
 * Solo usa la librería estándar de Node (sin npm).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA_DIST_INTAKE = join(AQUI, 'dist', 'intake.worker.js');
const RUTA_DIST_ADMIN = join(AQUI, 'dist', 'admin.worker.js');
const LEYENDA = 'ARCHIVO GENERADO: no editar a mano';

/* Orden explícito: el dist de intake no debe cambiar al añadir librerías del
 * panel admin. Para admin se concatenan solo las que necesita. */
const LIBRERIAS_INTAKE = ['cripto.js', 'llaves.js', 'turnstile.js', 'util.js', 'validar.js'];
const LIBRERIAS_ADMIN = ['cripto.js', 'llaves.js', 'util.js', 'access.js', 'csv.js', 'envio.js'];

function ayuda() {
  console.log('Uso: node build.mjs [--target intake|admin] [--schema <ruta a schema.json>]');
  console.log('  intake (por omisión) genera dist/intake.worker.js');
  console.log('  admin genera dist/admin.worker.js');
}

function leerArgumentos(argv) {
  let rutaSchema = null;
  let target = 'intake';
  for (let i = 0; i < argv.length; i += 1) {
    const argumento = argv[i];
    if (argumento === '--help' || argumento === '-h') {
      ayuda();
      process.exit(0);
    } else if (argumento === '--schema') {
      rutaSchema = argv[i + 1];
      i += 1;
      if (!rutaSchema) throw new Error('--schema necesita una ruta');
    } else if (argumento.startsWith('--schema=')) {
      rutaSchema = argumento.slice('--schema='.length);
      if (!rutaSchema) throw new Error('--schema necesita una ruta');
    } else if (argumento === '--target') {
      target = argv[i + 1];
      i += 1;
      if (!target) throw new Error('--target necesita intake o admin');
    } else if (argumento.startsWith('--target=')) {
      target = argumento.slice('--target='.length);
      if (!target) throw new Error('--target necesita intake o admin');
    } else {
      throw new Error('argumento desconocido: ' + argumento);
    }
  }
  if (target !== 'intake' && target !== 'admin') {
    throw new Error('--target desconocido: ' + target + ' (usa intake o admin)');
  }
  return { rutaSchema, target };
}

/** Busca el schema en varias ubicaciones razonables según desde dónde se ejecute. */
function resolverSchema(rutaSchema) {
  const candidatos = [];
  if (rutaSchema) {
    if (isAbsolute(rutaSchema)) {
      candidatos.push(rutaSchema);
    } else {
      // Se prueba desde el cwd y desde la carpeta del script (y dos niveles arriba)
      // para que funcione tanto `node build.mjs` en backend/ como desde la raíz.
      candidatos.push(
        resolve(process.cwd(), rutaSchema),
        resolve(AQUI, rutaSchema),
        resolve(AQUI, '..', rutaSchema),
        resolve(AQUI, '..', '..', rutaSchema)
      );
    }
  } else {
    candidatos.push(
      resolve(AQUI, '..', 'cuestionario', 'schema.json'),
      resolve(process.cwd(), 'cuestionario', 'schema.json'),
      resolve(process.cwd(), '..', 'cuestionario', 'schema.json')
    );
  }

  const vistos = new Set();
  for (const candidato of candidatos) {
    if (vistos.has(candidato)) continue;
    vistos.add(candidato);
    if (existsSync(candidato)) return candidato;
  }
  throw new Error(
    'no encontré el schema. Probé:\n  ' + [...vistos].join('\n  ') +
    '\nPasa la ruta con --schema <ruta a schema.json>.'
  );
}

function cargarSchema(rutaSchema) {
  const archivoSchema = resolverSchema(rutaSchema);
  let schema;
  try {
    schema = JSON.parse(readFileSync(archivoSchema, 'utf8'));
  } catch (error) {
    throw new Error('el schema no es JSON válido (' + archivoSchema + '): ' + error.message);
  }
  if (!schema || typeof schema.id !== 'string' || typeof schema.version !== 'number' ||
      !Array.isArray(schema.secciones)) {
    throw new Error('el schema debe tener id (texto), version (número) y secciones (arreglo)');
  }
  return { archivoSchema, schema };
}

/** Quita el prefijo `export ` de las declaraciones de las librerías. */
function quitarExport(codigo) {
  return codigo.replace(
    /^export\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b|class\b)/gm,
    ''
  );
}

/** Comprueba que no quede ningún import (el dist debe ser autocontenido). */
function verificarSinImports(codigo) {
  const problemas = [];
  codigo.split('\n').forEach((linea, indice) => {
    if (/^\s*import\b/.test(linea) || /\bimport\s*\(/.test(linea)) {
      problemas.push((indice + 1) + ': ' + linea.trim());
    }
  });
  if (problemas.length > 0) {
    throw new Error(
      'quedó un import en el código generado; el dist debe ser autocontenido:\n  ' +
      problemas.join('\n  ')
    );
  }
}

function verificarExportsUnicos(codigo) {
  const exportsIndebidos = codigo.split('\n').filter(
    linea => /^\s*export\s+/.test(linea) && !/^\s*export\s+default\b/.test(linea)
  );
  if (exportsIndebidos.length > 0) {
    throw new Error('quedaron exports en las librerías:\n  ' + exportsIndebidos.join('\n  '));
  }
  const porDefecto = (codigo.match(/^\s*export\s+default\b/gm) || []).length;
  if (porDefecto !== 1) {
    throw new Error('el dist debe tener exactamente un export default (encontré ' + porDefecto + ')');
  }
}

function contarCampos(schema) {
  return schema.secciones.reduce(
    (total, seccion) => total + (Array.isArray(seccion.campos) ? seccion.campos.length : 0),
    0
  );
}

function leerLibrerias(nombres) {
  const carpetaLib = join(AQUI, 'src', 'lib');
  if (!existsSync(carpetaLib)) throw new Error('no existe ' + carpetaLib);
  return nombres.map(nombre => {
    const ruta = join(carpetaLib, nombre);
    if (!existsSync(ruta)) throw new Error('falta src/lib/' + nombre);
    const contenido = quitarExport(readFileSync(ruta, 'utf8'));
    if (/^\s*import\b/m.test(contenido)) {
      throw new Error('src/lib/' + nombre + ' contiene un import; las librerías deben ser puras');
    }
    return '// ---- src/lib/' + nombre + ' ----\n' + contenido.trim();
  });
}

function construirIntake(rutaSchema) {
  const { archivoSchema, schema } = cargarSchema(rutaSchema);
  const librerias = leerLibrerias(LIBRERIAS_INTAKE);

  const rutaIntake = join(AQUI, 'src', 'intake.js');
  const intake = readFileSync(rutaIntake, 'utf8');
  if (!/export\s+default\s*\{/.test(intake)) {
    throw new Error('src/intake.js debe exportar default { fetch }');
  }

  const campos = contarCampos(schema);
  const rutaSchemaVisible = relative(AQUI, archivoSchema) || archivoSchema;
  const cabecera = [
    '/*',
    ' * faro33-intake — Worker de recepción del cuestionario (Cloudflare Workers + D1).',
    ' * ' + LEYENDA,
    ' * Fecha de generación: ' + new Date().toISOString(),
    ' * Fuente: src/lib/*.js (' + librerias.length + ' módulos) + src/intake.js + ' +
      rutaSchemaVisible,
    ' * Schema: ' + schema.id + ' v' + schema.version + ' (' + campos + ' campos)',
    ' * Bindings: DB, ENC_KEY_V1...ENC_KEY_Vn, ACTIVE_KEY_VERSION, HMAC_KEY,',
    ' *           TURNSTILE_SECRET, ALLOWED_ORIGINS, RATE_LIMIT_PER_HOUR',
    ' * Regenerar: node build.mjs --schema ../cuestionario/schema.json',
    ' */'
  ].join('\n');

  const codigo = [
    cabecera,
    ...librerias,
    '// ---- schema embebido (mismo que cuestionario/schema.json) ----\n' +
      'const SCHEMA = ' + JSON.stringify(schema) + ';',
    '// ---- src/intake.js ----\n' + intake.trim(),
    ''
  ].join('\n\n');

  verificarSinImports(codigo);
  verificarExportsUnicos(codigo);

  mkdirSync(dirname(RUTA_DIST_INTAKE), { recursive: true });
  writeFileSync(RUTA_DIST_INTAKE, codigo, 'utf8');
  const kb = (Buffer.byteLength(codigo, 'utf8') / 1024).toFixed(1);
  console.log('Generado ' + RUTA_DIST_INTAKE + ' (' + kb + ' KB, ' + campos + ' campos)');
}

function construirAdmin(rutaSchema) {
  const { archivoSchema, schema } = cargarSchema(rutaSchema);
  const librerias = leerLibrerias(LIBRERIAS_ADMIN);

  const rutaUI = join(AQUI, 'src', 'admin-ui.js');
  const ui = quitarExport(readFileSync(rutaUI, 'utf8'));
  if (!/const\s+HTML_ADMIN\s*=/.test(ui)) {
    throw new Error('src/admin-ui.js debe exportar const HTML_ADMIN');
  }

  const rutaAdmin = join(AQUI, 'src', 'admin.js');
  const admin = readFileSync(rutaAdmin, 'utf8');
  if (!/export\s+default\s*\{/.test(admin)) {
    throw new Error('src/admin.js debe exportar default { fetch }');
  }

  const campos = contarCampos(schema);
  const rutaSchemaVisible = relative(AQUI, archivoSchema) || archivoSchema;
  const cabecera = [
    '/*',
    ' * faro33-admin — Worker de administración de envíos (Cloudflare Workers + D1).',
    ' * ' + LEYENDA,
    ' * Fecha de generación: ' + new Date().toISOString(),
    ' * Fuente: src/lib (' + librerias.length + ' módulos) + src/admin-ui.js + src/admin.js + ' +
      rutaSchemaVisible,
    ' * Schema: ' + schema.id + ' v' + schema.version + ' (' + campos + ' campos)',
    ' * Bindings: DB, ENC_KEY_V1...ENC_KEY_Vn, ACTIVE_KEY_VERSION, HMAC_KEY,',
    ' *           ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS',
    ' * Regenerar: node build.mjs --target admin --schema ../cuestionario/schema.json',
    ' */'
  ].join('\n');

  const codigo = [
    cabecera,
    ...librerias,
    '// ---- schema embebido (mismo que cuestionario/schema.json) ----\n' +
      'const SCHEMA = ' + JSON.stringify(schema) + ';',
    '// ---- src/admin-ui.js ----\n' + ui.trim(),
    '// ---- src/admin.js ----\n' + admin.trim(),
    ''
  ].join('\n\n');

  verificarSinImports(codigo);
  verificarExportsUnicos(codigo);

  mkdirSync(dirname(RUTA_DIST_ADMIN), { recursive: true });
  writeFileSync(RUTA_DIST_ADMIN, codigo, 'utf8');
  const kb = (Buffer.byteLength(codigo, 'utf8') / 1024).toFixed(1);
  console.log('Generado ' + RUTA_DIST_ADMIN + ' (' + kb + ' KB, ' + campos + ' campos)');
}

function main() {
  const { rutaSchema, target } = leerArgumentos(process.argv.slice(2));
  if (target === 'admin') {
    construirAdmin(rutaSchema);
  } else {
    construirIntake(rutaSchema);
  }
}

try {
  main();
} catch (error) {
  console.error('build: ' + (error && error.message ? error.message : String(error)));
  process.exitCode = 1;
}

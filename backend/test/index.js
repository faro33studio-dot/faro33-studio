/*
 * Permite `node --test test/` en versiones de Node que no expanden carpetas:
 * al resolver el directorio, Node carga este index.js y aquí se importan las
 * pruebas en orden alfabético. Con `node --test` (sin ruta) también se descubre
 * cada archivo *.test.mjs por separado; este archivo no importa nada más.
 */

const { readdirSync } = require('node:fs');
const { join } = require('node:path');

(async () => {
  const archivos = readdirSync(__dirname)
    .filter(nombre => nombre.endsWith('.test.mjs'))
    .sort();
  for (const nombre of archivos) {
    await import('./' + nombre);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

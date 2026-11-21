import test from 'node:test';
import assert from 'node:assert/strict';

import { HTML_ADMIN } from '../src/admin-ui.js';

test('la UI declara español y el encabezado/aviso pedidos', () => {
  assert.equal(typeof HTML_ADMIN, 'string');
  assert.match(HTML_ADMIN, /<html lang="es">/);
  assert.match(HTML_ADMIN, /Faro 33 · Envíos/);
  assert.match(HTML_ADMIN, /Contiene datos personales: no compartas capturas/);
  assert.match(HTML_ADMIN, /Exportar CSV/);
  assert.match(HTML_ADMIN, /Borrar \(ARCO\)/);
});

test('no usa innerHTML ni recursos externos', () => {
  assert.equal(/innerHTML/i.test(HTML_ADMIN), false, 'no debe usarse innerHTML');
  const sinComentarios = HTML_ADMIN
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/https?:\/\//i.test(sinComentarios), false, 'no debe haber recursos externos');
});

test('el script embebido parsea y usa textContent y zona horaria de Mazatlán', () => {
  const scripts = HTML_ADMIN.match(/<script>[\s\S]*?<\/script>/g) || [];
  assert.equal(scripts.length, 1);
  const contenido = scripts[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  assert.doesNotThrow(() => new Function(contenido));
  assert.match(contenido, /textContent/);
  assert.match(contenido, /America\/Mazatlan/);
  assert.match(contenido, /X-F33-Admin/);
  assert.equal(/\beval\s*\(/.test(contenido), false);
});

test('móvil primero: objetivos táctiles de 44 px y tabla convertida en tarjetas', () => {
  assert.match(HTML_ADMIN, /min-height:\s*44px/);
  assert.match(HTML_ADMIN, /@media \(max-width: 639px\)/);
  assert.match(HTML_ADMIN, /data-etiqueta/);
  assert.match(HTML_ADMIN, /grid-template-columns/);
});

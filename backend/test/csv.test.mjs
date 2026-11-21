import test from 'node:test';
import assert from 'node:assert/strict';

import { aCSV } from '../src/lib/csv.js';

test('CSV básico: encabezados, filas y columnas por objeto', () => {
  const csv = aCSV(
    [{ folio: 'F33-ABC234', nombre: 'Ana' }],
    [{ clave: 'folio', etiqueta: 'folio' }, { clave: 'nombre', etiqueta: 'Nombre' }]
  );
  assert.equal(csv, 'folio,Nombre\r\nF33-ABC234,Ana\r\n');
});

test('escapa comillas dobles duplicándolas', () => {
  const csv = aCSV([{ texto: 'dice "hola"' }], ['texto']);
  assert.equal(csv, 'texto\r\n"dice ""hola"""\r\n');
});

test('entrecomilla comas y saltos de línea', () => {
  const csv = aCSV([{ a: 'uno, dos', b: 'linea1\nlinea2' }], ['a', 'b']);
  assert.equal(csv, 'a,b\r\n"uno, dos","linea1\nlinea2"\r\n');
});

test('neutraliza inyección de fórmulas en = + - @ TAB y CR', () => {
  const csv = aCSV(
    [{ a: '=1+1', b: '+52 667', c: '-5', d: '@cmd', e: '\tTAB', f: '\rCR' }],
    ['a', 'b', 'c', 'd', 'e', 'f']
  );
  assert.match(csv, /'=1\+1/);
  assert.match(csv, /'\+52 667/);
  assert.match(csv, /'-5/);
  assert.match(csv, /'@cmd/);
  assert.match(csv, /'\tTAB/);
  assert.match(csv, /"'\rCR"/);
  assert.equal(csv.includes('\n=1+1'), false);
});

test('neutraliza también una etiqueta de encabezado peligrosa', () => {
  const csv = aCSV([{ a: 'x' }], [{ clave: 'a', etiqueta: '=SUMA(A1)' }]);
  assert.equal(csv.split('\r\n')[0], "'=SUMA(A1)");
});

test('BOM UTF-8 opcional', () => {
  const sinBom = aCSV([{ a: 'á' }], ['a']);
  const conBom = aCSV([{ a: 'á' }], ['a'], { bom: true });
  assert.equal(sinBom.charCodeAt(0), 'a'.charCodeAt(0));
  assert.equal(conBom.charCodeAt(0), 0xFEFF);
  assert.ok(conBom.endsWith('á\r\n'));
});

test('valores nulos, indefinidos y números se serializan sin romper', () => {
  const csv = aCSV([{ a: null, b: undefined, c: 3 }], ['a', 'b', 'c']);
  assert.equal(csv, 'a,b,c\r\n,,3\r\n');
});

test('lista vacía conserva el encabezado', () => {
  const csv = aCSV([], ['folio', 'estado']);
  assert.equal(csv, 'folio,estado\r\n');
});

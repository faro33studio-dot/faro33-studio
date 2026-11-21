#!/usr/bin/env node
'use strict';

const assert = require('assert').strict;
const schema = require('../../cuestionario/schema.json');
const { visibles, limpiar, payload, validar } = require('../../assets/cuestionario.js');

const comun = {
  nombre: 'Persona de prueba', telefono: '+52 (667) 123-4567', ciudad: 'Culiacán',
  contacto_preferido: 'whatsapp', situacion: 'obra_nueva', m2: '50_100',
  alcance: ['diseno_planos', 'obra_acabados'], plazo: 'ya', consentimiento: true
};
const casa = Object.assign({}, comun, {
  tipo: 'residencial', res_inmueble: 'casa', res_espacios: ['sala'], res_ocupantes: '1_2'
});
const comercial = Object.assign({}, comun, {
  tipo: 'comercial', com_giro: 'retail', com_aforo: 'menos_20', com_marca: 'manual',
  com_apertura: 'ya_opera', com_cierre: 'parcial'
});

assert.deepEqual([...visibles(schema, { nombre: 'Residual' })], ['tipo']);
const cambio = Object.assign({}, casa, { tipo: 'comercial', res_ocupada: 'habitada' });
const limpio = limpiar(schema, cambio);
assert.ok(!Object.keys(limpio).some(id => id.startsWith('res_')));
assert.equal(limpio.nombre, casa.nombre);
assert.equal(cambio.res_inmueble, 'casa');
console.log('OK · residencial → comercial borra res_* y conserva las respuestas comunes');

const remodelacion = Object.assign({}, casa, { situacion: 'remodelacion' });
assert.ok(!visibles(schema, casa).has('res_ocupada'));
assert.ok(visibles(schema, remodelacion).has('res_ocupada'));
assert.ok(!visibles(schema, Object.assign({}, remodelacion, { tipo: 'oficinas' })).has('res_ocupada'));
assert.deepEqual([...validar(schema, casa)], []);
assert.deepEqual([...validar(schema, remodelacion).keys()], ['res_ocupada']);
console.log('OK · res_ocupada se valida solo en remodelación residencial');

assert.deepEqual([...validar(schema, comercial)], []);
const apertura = Object.assign({}, comercial, { com_apertura: 'menos_3_meses' });
assert.ok(!visibles(schema, apertura).has('com_cierre'));
assert.ok(!('com_cierre' in limpiar(schema, apertura)));
const otraRama = Object.assign({}, comercial, { tipo: 'oficinas' });
assert.ok(!visibles(schema, otraRama).has('com_cierre'));
assert.ok(!('com_apertura' in limpiar(schema, otraRama)));
assert.ok(!('com_cierre' in limpiar(schema, otraRama)));
console.log('OK · com_cierre se limpia al cambiar la apertura o salir de comercial');

const datos = payload(schema, Object.assign({}, comercial, casa, {
  tipo: 'comercial', com_apertura: 'menos_3_meses', correo: ' ', comentarios: '  Ejemplo  ',
  com_giro_otro: 'Residual', referencias: '', res_hogar: [], desconocido: 'fuera del esquema'
}));
assert.ok(!Object.keys(datos).some(id => id.startsWith('res_')));
for (const id of ['com_cierre', 'com_giro_otro', 'correo', 'referencias', 'desconocido']) {
  assert.ok(!(id in datos), id);
}
assert.deepEqual(datos.alcance, ['diseno_planos', 'obra_acabados']);
assert.notEqual(datos.alcance, comun.alcance);
assert.equal(datos.com_giro, 'retail');
assert.equal(datos.comentarios, 'Ejemplo');
assert.equal(datos.consentimiento, true);
console.log('OK · payload omite ocultos, vacíos y desconocidos y conserva tipos');

const encadenado = { secciones: [
  { id: 'base', campos: [
    { id: 'a', tipo: 'checkbox' },
    { id: 'b', tipo: 'text', mostrarSi: { campo: 'a', en: ['uno', 'dos'] } }
  ] },
  { id: 'siguiente', mostrarSi: { campo: 'b', presente: true }, campos: [
    { id: 'c', tipo: 'text', requerido: true }
  ] }
] };
assert.deepEqual([...visibles(encadenado, { a: ['dos'], b: 'sí' })], ['a', 'b', 'c']);
assert.deepEqual(limpiar(encadenado, { a: ['otra'], b: 'sí', c: 'residual' }), { a: ['otra'] });
assert.equal(validar(encadenado, { a: ['otra'], b: 'sí' }).size, 0);
console.log('OK · dependencias transitivas entre campos y secciones con en y presente');

const detallePorEspacio = {
  cocina: { res_cocina_tipo: 'isla', res_cocina_uso: 'intenso' },
  recamara_principal: { res_recamara: ['vestidor'] },
  tv: { res_tv_tamano: '55_65', res_tv_extras: ['led'] }
};
const espacios = Object.keys(detallePorEspacio);
const casaConDetalle = Object.assign({}, casa, { res_espacios: espacios }, ...Object.values(detallePorEspacio));
const todosVisibles = visibles(schema, casaConDetalle);
for (const espacio of espacios) {
  const cambioEspacios = { ...casaConDetalle, res_espacios: espacios.filter(valor => valor !== espacio) };
  const camposVisibles = visibles(schema, cambioEspacios);
  const respuestasLimpias = limpiar(schema, cambioEspacios);
  const envio = payload(schema, cambioEspacios);
  assert.deepEqual(envio.res_espacios, cambioEspacios.res_espacios);
  for (const [grupo, detalle] of Object.entries(detallePorEspacio)) {
    for (const [id, valor] of Object.entries(detalle)) {
      assert.ok(todosVisibles.has(id), id);
      assert.equal(camposVisibles.has(id), grupo !== espacio, id);
      assert.equal(id in respuestasLimpias, grupo !== espacio, id);
      if (grupo === espacio) assert.ok(!(id in envio), id);
      else assert.deepEqual(envio[id], valor, id);
    }
  }
}
console.log('OK · contiene muestra, oculta y limpia cocina, recámara y TV; el payload omite sus respuestas ocultas');

const cadenaConContiene = { secciones: [
  { id: 'base', campos: [
    { id: 'a', tipo: 'checkbox' },
    { id: 'b', tipo: 'checkbox', mostrarSi: { campo: 'a', contiene: 'uno' } }
  ] },
  { id: 'siguiente', mostrarSi: { campo: 'b', contiene: 'dos' }, campos: [
    { id: 'c', tipo: 'text', requerido: true }
  ] }
] };
assert.deepEqual([...visibles(cadenaConContiene, { a: ['uno'], b: ['dos'] })], ['a', 'b', 'c']);
assert.deepEqual([...validar(cadenaConContiene, { a: ['uno'], b: ['dos'] }).keys()], ['c']);
assert.deepEqual(limpiar(cadenaConContiene, { a: [], b: ['dos'], c: 'residual' }), { a: [] });
assert.deepEqual([...validar(cadenaConContiene, { a: [], b: ['dos'] })], []);
assert.deepEqual([...visibles(cadenaConContiene, { a: 'uno', b: ['dos'] })], ['a']);
console.log('OK · contiene se aplica en cadena y los campos requeridos ocultos no bloquean');

const estilo = {
  d_ambiente: ['calido', 'sereno', 'elegante'], d_paleta: ['tierra'], d_materiales: ['madera'],
  d_luz: 'calida_tenue', d_prioridad: 'estetica', d_smart: 'si', d_evitar: 'Brillo', d_decide: 'yo'
};
const diseno = schema.secciones.find(seccion => seccion.id === 'diseno');
assert.deepEqual(diseno.campos.map(campo => campo.id), Object.keys(estilo));
assert.ok(diseno.campos.every(campo => !campo.requerido));
assert.deepEqual([...validar(schema, { ...casa, ...estilo })], []);
assert.deepEqual([...validar(schema, { ...casa, d_ambiente: [...estilo.d_ambiente, 'atrevido'] })], [
  ['d_ambiente', 'Elige hasta 3 opciones.']
]);
console.log('OK · Tu estilo es opcional y maxSeleccion rechaza la cuarta opción en d_ambiente');

const todasLasRamas = {
  ...casaConDetalle, ...comercial, ...estilo, com_experiencia: ['creativo'], ofi_cultura: 'mixta'
};
for (const [tipo, prefijo, campoPropio] of [
  ['residencial', 'res_', 'res_tv_tamano'],
  ['comercial', 'com_', 'com_experiencia'],
  ['oficinas', 'ofi_', 'ofi_cultura']
]) {
  const respuestas = { ...todasLasRamas, tipo };
  for (const resultado of [limpiar(schema, respuestas), payload(schema, respuestas)]) {
    assert.deepEqual(resultado[campoPropio], todasLasRamas[campoPropio]);
    for (const id of Object.keys(todasLasRamas)) {
      if (/^(res|com|ofi)_/.test(id) && !id.startsWith(prefijo)) assert.ok(!(id in resultado), id);
    }
    for (const [id, valor] of Object.entries(estilo)) assert.deepEqual(resultado[id], valor, id);
  }
}
console.log('OK · cambiar el tipo limpia las otras ramas (res_*, com_*, ofi_*) y conserva d_*');

const invalidos = Object.assign({}, casa, {
  nombre: 'X'.repeat(81), telefono: '+52 (667) 123-456', correo: 'persona@ejemplo', consentimiento: false
});
assert.deepEqual([...validar(schema, invalidos).keys()], ['nombre', 'telefono', 'correo', 'consentimiento']);
console.log('OK · límites, teléfono, correo y consentimiento');

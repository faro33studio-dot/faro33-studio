import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { SCHEMA, respuestasComercial, respuestasOficinas, respuestasResidencial } from './soporte.mjs';
import { validar, validarRespuestas } from '../src/lib/validar.js';

const require = createRequire(import.meta.url);
// El motor real del navegador, sin modificarlo.
const Cuestionario = require('../../assets/cuestionario.js');

function compararConCliente(nombre, respuestas) {
  const erroresCliente = [...Cuestionario.validar(SCHEMA, respuestas).keys()].sort();
  const limpiasCliente = Cuestionario.payload(SCHEMA, respuestas);
  const servidor = validarRespuestas(SCHEMA, respuestas);

  assert.deepEqual(servidor.errores.slice().sort(), erroresCliente,
    nombre + ': los ids de error deben coincidir con el cliente');
  assert.equal(servidor.ok, erroresCliente.length === 0,
    nombre + ': el veredicto debe coincidir con el cliente');
  assert.deepEqual(servidor.respuestas, limpiasCliente,
    nombre + ': las respuestas limpias deben coincidir con Cuestionario.payload');
  return { erroresCliente, servidor };
}

const casos = [
  ['residencial completo válido', respuestasResidencial(), []],
  ['residencial sin consentimiento', respuestasResidencial({ consentimiento: undefined }),
    ['consentimiento']],
  ['residencial con consentimiento en falso', respuestasResidencial({ consentimiento: false }),
    ['consentimiento']],
  ['residencial con teléfono inválido', respuestasResidencial({ telefono: '123' }),
    ['telefono']],
  ['residencial sin nombre', respuestasResidencial({ nombre: '' }), ['nombre']],
  ['residencial con nombre demasiado largo', respuestasResidencial({ nombre: 'x'.repeat(81) }),
    ['nombre']],
  ['residencial con correo inválido', respuestasResidencial({ correo: 'malo' }), ['correo']],
  ['residencial sin alcance', respuestasResidencial({ alcance: [] }), ['alcance']],
  ['comercial completo válido', respuestasComercial(), []],
  ['comercial giro "otro" sin detalle', respuestasComercial({ com_giro: 'otro' }),
    ['com_giro_otro']],
  ['comercial giro "otro" con detalle',
    respuestasComercial({ com_giro: 'otro', com_giro_otro: 'Taller de cerámica' }), []],
  ['comercial que ya opera sin com_cierre',
    respuestasComercial({ com_apertura: 'ya_opera' }), ['com_cierre']],
  ['comercial que ya opera con com_cierre',
    respuestasComercial({ com_apertura: 'ya_opera', com_cierre: 'cierra' }), []],
  ['com_cierre oculto se descarta',
    respuestasComercial({ com_apertura: '3_6_meses', com_cierre: 'cierra' }), []],
  ['oficinas completo válido', respuestasOficinas(), []],
  ['oficinas sin áreas', respuestasOficinas({ ofi_espacios: [] }), ['ofi_espacios']],
  ['oficinas sin inmueble', respuestasOficinas({ ofi_inmueble: undefined }), ['ofi_inmueble']],
  ['campo desconocido se ignora',
    respuestasResidencial({ campo_inventado: 'no debe pasar' }), []],
  ['requerido oculto (res_ocupada) no se exige',
    respuestasResidencial({ situacion: 'obra_nueva' }), []],
  ['requerido visible (res_ocupada) sí se exige',
    respuestasResidencial({ situacion: 'remodelacion' }), ['res_ocupada']],
  ['cascada contiene: cocina, tv y recámara visibles', respuestasResidencial({
    res_espacios: ['sala', 'cocina', 'tv', 'recamara_principal'],
    res_cocina_tipo: 'isla',
    res_recamara: ['vestidor', 'closet_medida'],
    res_tv_tamano: '55_65'
  }), []],
  ['cascada contiene: respuestas de ramas ocultas se descartan', respuestasResidencial({
    res_espacios: ['sala'],
    res_cocina_tipo: 'isla',
    res_tv_tamano: '55_65'
  }), []],
  ['maxSeleccion respetado', respuestasResidencial({
    d_ambiente: ['calido', 'sereno', 'elegante']
  }), []],
  ['maxSeleccion excedido', respuestasResidencial({
    d_ambiente: ['calido', 'sereno', 'elegante', 'atrevido']
  }), ['d_ambiente']],
  ['checkbox sin marcar no requerido', respuestasResidencial({ res_hogar: [] }), []]
];

for (const [nombre, respuestas, erroresEsperados] of casos) {
  test('paridad cliente/servidor: ' + nombre, () => {
    const { erroresCliente } = compararConCliente(nombre, respuestas);
    assert.deepEqual(erroresCliente, erroresEsperados.slice().sort());
  });
}

test('validar() usa el schema embebido/global', () => {
  const resultado = validar(respuestasResidencial());
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.errores, []);
});

test('el servidor es más estricto: select fuera de opciones', () => {
  const resultado = validarRespuestas(SCHEMA, respuestasResidencial({ m2: 'inventado' }));
  assert.equal(resultado.ok, false);
  assert.deepEqual(resultado.errores, ['m2']);
});

test('el servidor es más estricto: checkbox con opción inválida y duplicados', () => {
  const inventada = validarRespuestas(SCHEMA, respuestasResidencial({ alcance: ['diseno_planos', 'x'] }));
  assert.deepEqual(inventada.errores, ['alcance']);

  const duplicada = validarRespuestas(SCHEMA, respuestasResidencial({
    alcance: ['diseno_planos', 'diseno_planos']
  }));
  assert.deepEqual(duplicada.errores, ['alcance']);
});

test('el servidor exige consentimiento estrictamente booleano verdadero', () => {
  const resultado = validarRespuestas(SCHEMA, respuestasResidencial({ consentimiento: 'sí' }));
  assert.deepEqual(resultado.errores, ['consentimiento']);
});

test('los errores solo contienen ids, jamás valores', () => {
  const resultado = validarRespuestas(SCHEMA, respuestasResidencial({
    nombre: 'NombreSecretoXYZ',
    telefono: '123',
    correo: 'secreto@ejemplo.mx'
  }));
  const serializado = JSON.stringify(resultado.errores);
  assert.equal(serializado.includes('NombreSecretoXYZ'), false);
  assert.equal(serializado.includes('secreto@ejemplo.mx'), false);
  assert.deepEqual(resultado.errores, ['telefono']);
});

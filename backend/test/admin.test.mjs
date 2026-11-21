import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adminWorker, cuerpo, crearDB, crearEntorno, peticion,
  respuestasComercial, respuestasOficinas, respuestasResidencial,
  simularTurnstile, worker
} from './soporte.mjs';
import { verificarAccess } from '../src/lib/access.js';

/* ------------------------------------------------------------------------- *
 * Access de prueba: un par RSA, un JWKS simulado y un JWT válido cacheado.
 * ------------------------------------------------------------------------- */

const DOMINIO = 'admin-pruebas-f33.cloudflareaccess.com';
const AUD = 'aud-admin-f33';
const CORREO = 'duena@faro33.mx';
const KID = 'admin-prueba-1';

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
const publica = await crypto.subtle.exportKey('jwk', par.publicKey);
const JWKS = {
  keys: [{
    kty: 'RSA',
    n: publica.n,
    e: publica.e,
    alg: 'RS256',
    use: 'sig',
    kid: KID
  }]
};

function b64url(valor) {
  if (typeof valor === 'string') return Buffer.from(valor, 'utf8').toString('base64url');
  return Buffer.from(valor).toString('base64url');
}

async function crearToken() {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const carga = b64url(JSON.stringify({
    iss: 'https://' + DOMINIO,
    aud: AUD,
    email: CORREO,
    exp: ahora + 3600,
    iat: ahora - 10,
    nbf: ahora - 10
  }));
  const firma = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    par.privateKey,
    new TextEncoder().encode(cabecera + '.' + carga)
  ));
  return cabecera + '.' + carga + '.' + b64url(firma);
}

const TOKEN = await crearToken();

// Se calienta la caché del JWKS para que las pruebas del Worker no dependan de
// la red; la verificación real del token se hace una vez aquí.
{
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(JWKS), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
  try {
    const caliente = await verificarAccess(
      new Request('https://admin.faro33.example/', {
        headers: { 'Cf-Access-Jwt-Assertion': TOKEN }
      }),
      { ACCESS_TEAM_DOMAIN: DOMINIO, ACCESS_AUD: AUD, ADMIN_EMAILS: CORREO }
    );
    assert.equal(caliente.ok, true, 'no se pudo precalentar el JWKS de prueba');
  } finally {
    globalThis.fetch = original;
  }
}

/* ------------------------------------------------------------------------- *
 * Utilidades de las pruebas.
 * ------------------------------------------------------------------------- */

function entornoAdmin(db, extra = {}) {
  return crearEntorno(db, {
    ACCESS_TEAM_DOMAIN: DOMINIO,
    ACCESS_AUD: AUD,
    ADMIN_EMAILS: ' ' + CORREO + ' , otra@faro33.mx ',
    RATE_LIMIT_PER_HOUR: '1000',
    ...extra
  });
}

function peticionAdmin(ruta, opciones = {}) {
  const cabeceras = { ...(opciones.cabeceras || {}) };
  if (opciones.jwt !== false) cabeceras['Cf-Access-Jwt-Assertion'] = TOKEN;
  let cuerpoPeticion = opciones.body;
  if (cuerpoPeticion !== undefined && typeof cuerpoPeticion !== 'string') {
    cuerpoPeticion = JSON.stringify(cuerpoPeticion);
  }
  return new Request('https://admin.faro33.example' + ruta, {
    method: opciones.method || 'GET',
    headers: cabeceras,
    body: cuerpoPeticion
  });
}

function mutacion(ruta, metodo, datos, extra = {}) {
  return peticionAdmin(ruta, {
    method: metodo,
    body: datos,
    cabeceras: {
      'Content-Type': 'application/json',
      'X-F33-Admin': '1',
      Origin: 'https://admin.faro33.example',
      ...(extra.cabeceras || {})
    }
  });
}

async function ejecutar(request, env) {
  const respuesta = await adminWorker.fetch(request, env, {});
  const texto = await respuesta.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* respuesta vacía o no JSON */ }
  return { respuesta, texto, json };
}

function datosResidencial(folio, extra = {}) {
  return cuerpo({ folio, respuestas: respuestasResidencial(extra) });
}

function datosComercial(folio, extra = {}) {
  return cuerpo({ folio, respuestas: respuestasComercial(extra) });
}

function datosOficinas(folio, extra = {}) {
  return cuerpo({ folio, respuestas: respuestasOficinas(extra) });
}

async function sembrar(db, env, datos) {
  const turnstile = simularTurnstile(true);
  try {
    const respuesta = await worker.fetch(peticion(datos), env, {});
    assert.equal(respuesta.status, 200, 'no se pudo sembrar el envío de prueba');
  } finally {
    turnstile.restaurar();
  }
}

async function sembrarVarios(db, env, lista) {
  const turnstile = simularTurnstile(true);
  try {
    for (const datos of lista) {
      const respuesta = await worker.fetch(peticion(datos), env, {});
      assert.equal(respuesta.status, 200, 'no se pudo sembrar ' + datos.folio);
    }
  } finally {
    turnstile.restaurar();
  }
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function folioDe(numero) {
  let x = numero;
  let texto = '';
  for (let i = 0; i < 6; i += 1) {
    texto = ALFABETO[x % ALFABETO.length] + texto;
    x = Math.floor(x / ALFABETO.length);
  }
  return 'F33-' + texto;
}

function campo(campos, etiqueta) {
  return campos.find(actual => actual.etiqueta === etiqueta);
}

const CSP_ESPERADO = "default-src 'none'; script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function revisarCabeceras(respuesta) {
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(respuesta.headers.get('x-frame-options'), 'DENY');
  assert.equal(respuesta.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(respuesta.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(respuesta.headers.get('content-security-policy'), CSP_ESPERADO);
}

/* ------------------------------------------------------------------------- *
 * Pruebas.
 * ------------------------------------------------------------------------- */

test('sin JWT: 403 vacío en todas las rutas', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  const casos = [
    ['/', { method: 'GET' }],
    ['/api/envios', { method: 'GET' }],
    ['/api/envios/F33-ABC234', { method: 'GET' }],
    ['/api/envios/F33-ABC234/estado', { method: 'POST', body: { estado: 'nuevo' } }],
    ['/api/envios/F33-ABC234', { method: 'DELETE', body: { confirmar: 'F33-ABC234' } }],
    ['/api/exportar.csv', { method: 'GET' }]
  ];

  for (const [ruta, opciones] of casos) {
    const cabeceras = {};
    if (opciones.body) cabeceras['Content-Type'] = 'application/json';
    const { respuesta, texto } = await ejecutar(
      peticionAdmin(ruta, { ...opciones, jwt: false, cabeceras }),
      env
    );
    assert.equal(respuesta.status, 403, ruta);
    assert.equal(texto, '', ruta);
    revisarCabeceras(respuesta);
  }
});

test('la lista no descifra ni devuelve datos personales', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234', {
    nombre: 'Ana Pérez',
    telefono: '667 123 4567',
    ciudad: 'Culiacán',
    comentarios: 'CENTINELA_LISTA'
  }));

  const { respuesta, texto, json } = await ejecutar(peticionAdmin('/api/envios'), env);
  assert.equal(respuesta.status, 200);
  assert.equal(json.total, 1);
  assert.equal(json.pagina, 1);
  assert.equal(json.porPagina, 25);
  assert.equal(json.filas.length, 1);
  assert.deepEqual(Object.keys(json.filas[0]).sort(), [
    'creado', 'cta', 'estado', 'folio', 'origen', 'tipo'
  ]);
  assert.equal(json.filas[0].folio, 'F33-ABC234');
  assert.equal(json.filas[0].tipo, 'residencial');
  assert.equal(json.filas[0].estado, 'nuevo');
  assert.equal(json.filas[0].origen, 'instagram');
  assert.equal(json.filas[0].cta, 'hero');

  for (const prohibido of ['Ana', '667', 'Culiacán', 'CENTINELA_LISTA', 'phone_hash']) {
    assert.equal(texto.includes(prohibido), false, 'la lista filtró ' + prohibido);
  }
  assert.equal(db.auditoria.length, 0, 'la lista no debe auditar');
});

test('el detalle descifra, traduce etiquetas y audita "ver"', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234', {
    comentarios: 'CENTINELA_DETALLE'
  }));

  const { respuesta, json } = await ejecutar(peticionAdmin('/api/envios/F33-ABC234'), env);
  assert.equal(respuesta.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.envio.folio, 'F33-ABC234');
  assert.equal(json.envio.estado, 'nuevo');
  assert.match(json.envio.creado, /^\d{4}-\d{2}-\d{2}T/);

  assert.deepEqual(campo(json.campos, '¿Qué tipo de proyecto es?'), {
    seccion: 'Tu proyecto',
    etiqueta: '¿Qué tipo de proyecto es?',
    valor: 'Residencial'
  });
  assert.equal(campo(json.campos, 'Tu nombre').valor, 'Ana Pérez');
  assert.equal(campo(json.campos, 'Superficie aproximada').valor, '50 a 100 m²');
  assert.equal(campo(json.campos, '¿Qué necesitas?').valor, 'Diseño y planos, Carpintería a medida');
  assert.equal(campo(json.campos, '¿Algo más que debamos saber?').valor, 'CENTINELA_DETALLE');
  assert.equal(campo(json.campos, 'He leído el Aviso de privacidad y acepto que Faro 33 Studio use mis datos para contactarme sobre mi proyecto.').valor, 'Sí');

  assert.equal(db.auditoria.length, 1);
  assert.equal(db.auditoria[0].actor, CORREO);
  assert.equal(db.auditoria[0].accion, 'ver');
  assert.equal(db.auditoria[0].folio, 'F33-ABC234');
  assert.equal(JSON.stringify(db.auditoria).includes('Ana'), false);
  assert.equal(JSON.stringify(db.auditoria).includes('667'), false);
});

test('detalle de un folio válido inexistente: 404', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  const { respuesta, json } = await ejecutar(peticionAdmin('/api/envios/F33-ZZZ999'), env);
  assert.equal(respuesta.status, 404);
  assert.deepEqual(json, { ok: false, error: 'folio' });
});

test('búsqueda por teléfono: normaliza +52, espacios y guiones sin exponer hashes', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234', { telefono: '667 123 4567' }));
  await sembrar(db, env, datosComercial('F33-XYZ789', { telefono: '+52 (667) 555-0199' }));

  const casos = [
    ['+52 667-123-4567', 'F33-ABC234'],
    ['6671234567', 'F33-ABC234'],
    ['6675550199', 'F33-XYZ789'],
    ['+52 (667) 555 0199', 'F33-XYZ789']
  ];

  for (const [telefono, folio] of casos) {
    const { respuesta, texto, json } = await ejecutar(
      peticionAdmin('/api/envios?tel=' + encodeURIComponent(telefono)),
      env
    );
    assert.equal(respuesta.status, 200);
    assert.equal(json.total, 1, telefono);
    assert.equal(json.filas[0].folio, folio);
    assert.equal(texto.includes('phone_hash'), false);
    assert.equal(texto.includes('6671234567'), false);
  }

  const vacio = await ejecutar(peticionAdmin('/api/envios?tel=6670000000'), env);
  assert.equal(vacio.json.total, 0);
  assert.deepEqual(vacio.json.filas, []);
});

test('filtros por tipo y estado; estado de filtro inválido: 400', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-AAA222'));
  await sembrar(db, env, datosComercial('F33-BBB333'));
  await sembrar(db, env, datosOficinas('F33-CCC444'));

  const comercial = await ejecutar(peticionAdmin('/api/envios?tipo=comercial'), env);
  assert.equal(comercial.json.total, 1);
  assert.equal(comercial.json.filas[0].folio, 'F33-BBB333');

  const residencialNuevo = await ejecutar(
    peticionAdmin('/api/envios?tipo=residencial&estado=nuevo'),
    env
  );
  assert.equal(residencialNuevo.json.total, 1);
  assert.equal(residencialNuevo.json.filas[0].folio, 'F33-AAA222');

  const cambio = await ejecutar(
    mutacion('/api/envios/F33-BBB333/estado', 'POST', { estado: 'contactado' }),
    env
  );
  assert.equal(cambio.respuesta.status, 200);

  const contactados = await ejecutar(peticionAdmin('/api/envios?estado=contactado'), env);
  assert.equal(contactados.json.total, 1);
  assert.equal(contactados.json.filas[0].folio, 'F33-BBB333');

  const invalido = await ejecutar(peticionAdmin('/api/envios?estado=inventado'), env);
  assert.equal(invalido.respuesta.status, 400);
  assert.deepEqual(invalido.json, { ok: false, error: 'estado' });
});

test('paginación de 25 en 25', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  const lista = [];
  for (let i = 0; i < 30; i += 1) {
    lista.push(datosResidencial(folioDe(i), { nombre: 'Persona ' + i }));
  }
  await sembrarVarios(db, env, lista);

  const primera = await ejecutar(peticionAdmin('/api/envios?pagina=1'), env);
  assert.equal(primera.respuesta.status, 200);
  assert.equal(primera.json.total, 30);
  assert.equal(primera.json.pagina, 1);
  assert.equal(primera.json.porPagina, 25);
  assert.equal(primera.json.filas.length, 25);

  const segunda = await ejecutar(peticionAdmin('/api/envios?pagina=2'), env);
  assert.equal(segunda.json.total, 30);
  assert.equal(segunda.json.pagina, 2);
  assert.equal(segunda.json.filas.length, 5);

  const vistos = new Set();
  for (const fila of primera.json.filas.concat(segunda.json.filas)) {
    assert.equal(vistos.has(fila.folio), false, 'folio repetido entre páginas');
    vistos.add(fila.folio);
  }
  assert.equal(vistos.size, 30);
});

test('cambio de estado válido e inválido', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234'));

  const valido = await ejecutar(
    mutacion('/api/envios/F33-ABC234/estado', 'POST', { estado: 'contactado' }),
    env
  );
  assert.equal(valido.respuesta.status, 200);
  assert.deepEqual(valido.json, { ok: true, folio: 'F33-ABC234', estado: 'contactado' });
  assert.equal(db.filas[0].status, 'contactado');
  assert.equal(db.auditoria.at(-1).accion, 'estado:contactado');
  assert.equal(db.auditoria.at(-1).actor, CORREO);

  const antes = db.auditoria.length;
  const invalido = await ejecutar(
    mutacion('/api/envios/F33-ABC234/estado', 'POST', { estado: 'volando' }),
    env
  );
  assert.equal(invalido.respuesta.status, 400);
  assert.deepEqual(invalido.json, { ok: false, error: 'estado' });
  assert.equal(db.filas[0].status, 'contactado');
  assert.equal(db.auditoria.length, antes);

  const sinEstado = await ejecutar(
    mutacion('/api/envios/F33-ABC234/estado', 'POST', {}),
    env
  );
  assert.equal(sinEstado.respuesta.status, 400);

  const inexistente = await ejecutar(
    mutacion('/api/envios/F33-ZZZ999/estado', 'POST', { estado: 'ganado' }),
    env
  );
  assert.equal(inexistente.respuesta.status, 404);
});

test('CSRF: sin X-F33-Admin, con Origin ajeno o Content-Type incorrecto: 403', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234'));

  const sinCabecera = await ejecutar(peticionAdmin('/api/envios/F33-ABC234/estado', {
    method: 'POST',
    body: { estado: 'ganado' },
    cabeceras: {
      'Content-Type': 'application/json',
      Origin: 'https://admin.faro33.example'
    }
  }), env);
  assert.equal(sinCabecera.respuesta.status, 403);
  assert.deepEqual(sinCabecera.json, { ok: false, error: 'origen' });
  assert.equal(db.filas[0].status, 'nuevo');
  revisarCabeceras(sinCabecera.respuesta);

  const origenAjeno = await ejecutar(mutacion(
    '/api/envios/F33-ABC234/estado', 'POST', { estado: 'ganado' },
    { cabeceras: { Origin: 'https://malicioso.example' } }
  ), env);
  assert.equal(origenAjeno.respuesta.status, 403);
  assert.equal(db.filas[0].status, 'nuevo');

  const contenidoMalo = await ejecutar(mutacion(
    '/api/envios/F33-ABC234/estado', 'POST', { estado: 'ganado' },
    { cabeceras: { 'Content-Type': 'text/plain' } }
  ), env);
  assert.equal(contenidoMalo.respuesta.status, 403);

  const borradoSinCabecera = await ejecutar(peticionAdmin('/api/envios/F33-ABC234', {
    method: 'DELETE',
    body: { confirmar: 'F33-ABC234' },
    cabeceras: {
      'Content-Type': 'application/json',
      Origin: 'https://admin.faro33.example'
    }
  }), env);
  assert.equal(borradoSinCabecera.respuesta.status, 403);
  assert.equal(db.filas.length, 1);
});

test('borrado ARCO: exige confirmación exacta y deja audit sin PII', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234', {
    nombre: 'Ana Pérez',
    telefono: '667 123 4567'
  }));

  const incorrecto = await ejecutar(
    mutacion('/api/envios/F33-ABC234', 'DELETE', { confirmar: 'F33-OTRO22' }),
    env
  );
  assert.equal(incorrecto.respuesta.status, 400);
  assert.deepEqual(incorrecto.json, { ok: false, error: 'confirmacion' });
  assert.equal(db.filas.length, 1);

  const correcto = await ejecutar(
    mutacion('/api/envios/F33-ABC234', 'DELETE', { confirmar: 'F33-ABC234' }),
    env
  );
  assert.equal(correcto.respuesta.status, 200);
  assert.deepEqual(correcto.json, { ok: true, folio: 'F33-ABC234' });
  assert.equal(db.filas.length, 0);

  const registro = db.auditoria.at(-1);
  assert.equal(registro.accion, 'borrar');
  assert.equal(registro.folio, 'F33-ABC234');
  assert.equal(registro.actor, CORREO);
  assert.equal(JSON.stringify(db.auditoria).includes('Ana'), false);
  assert.equal(JSON.stringify(db.auditoria).includes('667'), false);

  const otraVez = await ejecutar(
    mutacion('/api/envios/F33-ABC234', 'DELETE', { confirmar: 'F33-ABC234' }),
    env
  );
  assert.equal(otraVez.respuesta.status, 404);
});

test('exportar CSV: etiquetas, filtros, BOM, fórmulas neutralizadas y audit', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234', {
    nombre: '+Ana',
    ciudad: '-Culiacán',
    comentarios: '=HYPERLINK("https://ejemplo.mx","x")',
    d_evitar: '@mala'
  }));
  await sembrar(db, env, datosComercial('F33-XYZ789', { nombre: 'Bruno' }));

  const { respuesta, texto } = await ejecutar(
    peticionAdmin('/api/exportar.csv?tipo=residencial'),
    env
  );
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type'), /^text\/csv/);
  assert.match(
    respuesta.headers.get('content-disposition'),
    /^attachment; filename="envios-\d{4}-\d{2}-\d{2}\.csv"$/
  );

  const cruda = await adminWorker.fetch(
    peticionAdmin('/api/exportar.csv?tipo=residencial'),
    env,
    {}
  );
  const bytes = new Uint8Array(await cruda.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xEF, 0xBB, 0xBF], 'falta el BOM UTF-8');
  assert.match(texto, /folio,creado,tipo,estado,origen,cta,/);
  assert.match(texto, /¿Qué tipo de proyecto es\?/);
  assert.match(texto, /Residencial/);
  assert.match(texto, /"Diseño y planos, Carpintería a medida"/);
  assert.match(texto, /'=HYPERLINK/);
  assert.match(texto, /'\+Ana/);
  assert.match(texto, /'-Culiacán/);
  assert.match(texto, /'@mala/);
  assert.equal(texto.includes('Bruno'), false, 'el filtro por tipo no se respetó');

  const lineas = texto.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
  for (const linea of lineas) {
    assert.equal(/^[=+\-@\t\r]/.test(linea), false, 'quedó una fórmula sin neutralizar');
  }

  const registro = db.auditoria.at(-1);
  assert.equal(registro.accion, 'exportar');
  assert.equal(registro.folio, '');
  assert.equal(registro.actor, CORREO);
  assert.ok(db.consultas.some(consulta => consulta.sql.includes('LIMIT 2000')));
});

test('cabeceras de seguridad presentes en todas las respuestas', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234'));

  const respuestas = [
    (await ejecutar(peticionAdmin('/'), env)).respuesta,
    (await ejecutar(peticionAdmin('/api/envios'), env)).respuesta,
    (await ejecutar(peticionAdmin('/api/envios/F33-ABC234'), env)).respuesta,
    (await ejecutar(peticionAdmin('/api/envios/MALO'), env)).respuesta,
    (await ejecutar(peticionAdmin('/api/envios/F33-ZZZ999'), env)).respuesta,
    (await ejecutar(peticionAdmin('/api/exportar.csv'), env)).respuesta,
    (await ejecutar(peticionAdmin('/api/desconocida'), env)).respuesta,
    (await ejecutar(peticionAdmin('/', { jwt: false }), env)).respuesta
  ];

  for (const respuesta of respuestas) revisarCabeceras(respuesta);

  const portada = await ejecutar(peticionAdmin('/'), env);
  assert.match(portada.respuesta.headers.get('content-type'), /^text\/html/);
  assert.match(portada.texto, /Faro 33 · Envíos/);
  assert.match(portada.texto, /Contiene datos personales: no compartas capturas/);
});

test('folio mal formado: 400 en detalle, estado y borrado', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  const malos = ['F33-ABC', 'F33-ABC10', 'f33-abc234', 'ABC234', 'F33-ABC2345'];

  for (const folio of malos) {
    const detalle = await ejecutar(peticionAdmin('/api/envios/' + folio), env);
    assert.equal(detalle.respuesta.status, 400, folio);
    assert.deepEqual(detalle.json, { ok: false, error: 'folio' });

    const estado = await ejecutar(
      mutacion('/api/envios/' + folio + '/estado', 'POST', { estado: 'nuevo' }),
      env
    );
    assert.equal(estado.respuesta.status, 400, folio);

    const borrado = await ejecutar(
      mutacion('/api/envios/' + folio, 'DELETE', { confirmar: folio }),
      env
    );
    assert.equal(borrado.respuesta.status, 400, folio);
  }
});

test('errores y logs no contienen respuestas (cadenas centinela)', async () => {
  const db = crearDB();
  const env = entornoAdmin(db);
  await sembrar(db, env, datosResidencial('F33-ABC234', {
    nombre: 'CENTINELA_NOMBRE',
    telefono: '6670000000',
    ciudad: 'CENTINELA_CIUDAD',
    comentarios: 'CENTINELA_COMENTARIO'
  }));

  // Fila corrupta: descifrar debe fallar sin filtrar nada.
  db.filas.push({
    id: 999,
    folio: 'F33-CORRUP',
    created_at: new Date().toISOString(),
    formulario: 'cuestionario-proyecto',
    version: 1,
    tipo: 'residencial',
    origen: 'prueba',
    cta: 'prueba',
    status: 'nuevo',
    phone_hash: null,
    ip_hash: null,
    key_version: 1,
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'CENTINELA_CIFRADO'
  });

  const originalLog = console.log;
  const lineas = [];
  console.log = (...partes) => lineas.push(partes.join(' '));

  const errores = [];
  try {
    const lista = await ejecutar(peticionAdmin('/api/envios'), env);
    assert.equal(lista.respuesta.status, 200);
    errores.push(lista.texto);

    const detalle = await ejecutar(peticionAdmin('/api/envios/F33-ABC234'), env);
    assert.equal(detalle.respuesta.status, 200);

    const corrupto = await ejecutar(peticionAdmin('/api/envios/F33-CORRUP'), env);
    assert.equal(corrupto.respuesta.status, 500);
    errores.push(corrupto.texto);

    const malo = await ejecutar(peticionAdmin('/api/envios/F33-ABC10'), env);
    assert.equal(malo.respuesta.status, 400);
    errores.push(malo.texto);

    const estado = await ejecutar(
      mutacion('/api/envios/F33-ABC234/estado', 'POST', { estado: 'CENTINELA_ESTADO' }),
      env
    );
    assert.equal(estado.respuesta.status, 400);
    errores.push(estado.texto);

    const borrado = await ejecutar(
      mutacion('/api/envios/F33-ABC234', 'DELETE', { confirmar: 'CENTINELA_CONFIRMA' }),
      env
    );
    assert.equal(borrado.respuesta.status, 400);
    errores.push(borrado.texto);

    const roto = await ejecutar(peticionAdmin('/api/envios/F33-ABC234/estado', {
      method: 'POST',
      body: '{ "x": "CENTINELA_JSON"',
      cabeceras: {
        'Content-Type': 'application/json',
        'X-F33-Admin': '1',
        Origin: 'https://admin.faro33.example'
      }
    }), env);
    assert.equal(roto.respuesta.status, 400);
    errores.push(roto.texto);
  } finally {
    console.log = originalLog;
  }

  for (const texto of errores) {
    assert.equal(texto.includes('CENTINELA_'), false, 'una respuesta de error filtró datos');
  }

  assert.ok(lineas.length > 0);
  for (const linea of lineas) {
    assert.equal(linea.includes('CENTINELA_'), false, 'un log filtró datos: ' + linea);
    assert.equal(linea.includes('Ana'), false);
    assert.equal(linea.includes('667'), false);
    const registro = JSON.parse(linea);
    const claves = Object.keys(registro).sort();
    assert.ok(
      JSON.stringify(claves) === JSON.stringify(['codigo', 'evento']) ||
      JSON.stringify(claves) === JSON.stringify(['codigo', 'evento', 'folio']),
      'log con claves inesperadas: ' + linea
    );
  }
});

/* HTML del panel de administración, con CSS y JS embebidos.
 *
 * Reglas que no se deben romper:
 *   - Sin recursos externos: todo vive en esta cadena.
 *   - Todo dato dinámico se pinta con textContent; nunca se interpreta HTML.
 *   - Móvil primero: a 390 px la tabla se convierte en tarjetas sin scroll lateral.
 *   - Objetivos táctiles de 44 px como mínimo y contraste AA.
 *
 * El HTML se construye con una plantilla para que sea fácil de leer; dentro del
 * script embebido no se usan plantillas ni comillas invertidas.
 */

export const HTML_ADMIN = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Faro 33 · Envíos</title>
<style>
  :root {
    --navy: #10263d;
    --navy-2: #1d3a57;
    --crema: #f7f1e3;
    --crema-2: #efe6d2;
    --blanco: #fffdf7;
    --texto: #17202a;
    --tenue: #425466;
    --linea: #b9ab90;
    --rojo: #8c1d18;
    --verde: #1f5c3a;
    --foco: #0b5cad;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; max-width: 100%; overflow-x: hidden; }
  body {
    background: var(--crema);
    color: var(--texto);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.45;
  }
  h1, h2, h3, h4 { color: var(--navy); line-height: 1.2; margin: 0 0 .5rem; }
  h1 { font-size: 1.45rem; letter-spacing: .01em; }
  h2 { font-size: 1.15rem; }
  h3 { font-size: 1.05rem; margin-top: 1.1rem; }
  p { margin: .4rem 0; }
  a { color: var(--navy); }
  .cabecera {
    background: var(--navy);
    color: var(--crema);
    padding: 1rem 1rem .85rem;
  }
  .cabecera h1 { color: var(--crema); margin: 0; }
  .cabecera .sub { color: #e8dfca; margin: .25rem 0 0; font-size: .92rem; }
  .aviso {
    position: sticky;
    top: 0;
    z-index: 20;
    background: #fbe9c8;
    color: #5a3a00;
    border-bottom: 2px solid #b07a12;
    padding: .7rem 1rem;
    font-weight: 700;
    text-align: center;
    font-size: .95rem;
  }
  .contenedor { max-width: 1100px; margin: 0 auto; padding: 1rem; }
  .panel {
    background: var(--blanco);
    border: 1px solid var(--linea);
    border-radius: 14px;
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 2px rgba(16, 38, 61, .08);
  }
  .filtros {
    display: grid;
    grid-template-columns: 1fr;
    gap: .75rem;
  }
  .filtros label, .detalle-estado label, .detalle-borrar label {
    display: block;
    font-weight: 700;
    color: var(--navy);
    font-size: .92rem;
  }
  input, select, button {
    font: inherit;
    min-height: 44px;
    border-radius: 10px;
  }
  input, select {
    width: 100%;
    margin-top: .25rem;
    padding: .55rem .65rem;
    border: 1px solid #7b8794;
    background: #fffefb;
    color: var(--texto);
  }
  button {
    border: 1px solid var(--navy);
    background: var(--navy);
    color: #fffdf7;
    padding: .6rem 1rem;
    font-weight: 700;
    cursor: pointer;
  }
  button:hover { background: var(--navy-2); }
  button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 3px solid var(--foco);
    outline-offset: 2px;
  }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.secundario {
    background: transparent;
    color: var(--navy);
    border: 2px solid var(--navy);
  }
  button.secundario:hover { background: var(--crema-2); }
  button.peligro { background: var(--rojo); border-color: var(--rojo); }
  button.peligro:hover { background: #6d1511; }
  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    align-items: center;
    margin-top: 1rem;
  }
  .resumen { color: var(--tenue); font-size: .92rem; }
  .tabla-envoltura { width: 100%; overflow-x: hidden; }
  table.tabla {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .tabla th, .tabla td {
    text-align: left;
    padding: .65rem .5rem;
    border-bottom: 1px solid var(--crema-2);
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .tabla th {
    background: var(--navy);
    color: var(--crema);
    font-size: .85rem;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .tabla tbody tr { cursor: pointer; }
  .tabla tbody tr:hover, .tabla tbody tr:focus {
    background: #fdf7e8;
    outline: 2px solid var(--navy);
    outline-offset: -2px;
  }
  .folio { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; }
  .chip {
    display: inline-block;
    border: 1px solid var(--navy);
    border-radius: 999px;
    padding: .1rem .55rem;
    font-size: .82rem;
    background: var(--crema-2);
    color: var(--navy);
    white-space: nowrap;
  }
  .paginacion {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    align-items: center;
    justify-content: space-between;
    margin-top: 1rem;
  }
  .paginacion span { color: var(--tenue); }
  .vacio { color: var(--tenue); padding: .75rem 0; }
  .cargando { color: var(--tenue); padding: .5rem 0; }
  dialog {
    width: min(720px, calc(100% - 1.5rem));
    max-height: calc(100% - 2rem);
    overflow-y: auto;
    border: 1px solid var(--linea);
    border-radius: 16px;
    padding: 1rem;
    background: var(--blanco);
    color: var(--texto);
  }
  dialog::backdrop { background: rgba(16, 38, 61, .65); }
  .detalle-cabecera {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: .75rem;
  }
  .detalle-cabecera h2 { margin: 0; }
  .meta { color: var(--tenue); font-size: .92rem; }
  .grupo { border-top: 1px solid var(--crema-2); padding-top: .35rem; }
  dl { margin: 0 0 .5rem; }
  dt { font-weight: 700; color: var(--navy); margin-top: .55rem; }
  dd { margin: .1rem 0 0; overflow-wrap: anywhere; }
  .detalle-estado, .detalle-borrar {
    border-top: 2px solid var(--crema-2);
    margin-top: 1rem;
    padding-top: .75rem;
  }
  .detalle-borrar p { color: var(--tenue); font-size: .92rem; }
  .detalle-borrar input { margin-bottom: .5rem; }
  .aviso-error { color: var(--rojo); font-weight: 700; }
  .aviso-ok { color: var(--verde); font-weight: 700; }
  .pie { color: var(--tenue); font-size: .82rem; text-align: center; padding: 0 1rem 2rem; }
  @media (min-width: 640px) {
    .filtros { grid-template-columns: repeat(3, minmax(0, 1fr)) auto auto; align-items: end; }
  }
  @media (max-width: 639px) {
    .tabla thead { display: none; }
    .tabla, .tabla tbody, .tabla tr, .tabla td { display: block; width: 100%; }
    .tabla tbody tr {
      border: 1px solid var(--linea);
      border-radius: 12px;
      margin-bottom: .75rem;
      padding: .4rem .6rem;
      background: var(--blanco);
    }
    .tabla td {
      display: flex;
      justify-content: space-between;
      gap: .75rem;
      border-bottom: 1px solid var(--crema-2);
      padding: .5rem .1rem;
      text-align: right;
    }
    .tabla td:last-child { border-bottom: 0; }
    .tabla td::before {
      content: attr(data-etiqueta);
      color: var(--navy);
      font-weight: 700;
      text-align: left;
      flex: 0 0 45%;
    }
  }
</style>
</head>
<body>
<header class="cabecera">
  <h1>Faro 33 · Envíos</h1>
  <p class="sub">Panel privado de la dueña del estudio. Solo lectura descifrada con su sesión.</p>
</header>
<div class="aviso" role="note">Contiene datos personales: no compartas capturas</div>
<main class="contenedor">
  <section class="panel" aria-labelledby="titulo-filtros">
    <h2 id="titulo-filtros">Buscar envíos</h2>
    <form id="filtros" class="filtros">
      <label for="tipo">Tipo
        <select id="tipo">
          <option value="">Todos</option>
          <option value="residencial">Residencial</option>
          <option value="comercial">Comercial</option>
          <option value="oficinas">Oficinas</option>
        </select>
      </label>
      <label for="estado">Estado
        <select id="estado">
          <option value="">Todos</option>
          <option value="nuevo">Nuevo</option>
          <option value="contactado">Contactado</option>
          <option value="cotizando">Cotizando</option>
          <option value="ganado">Ganado</option>
          <option value="perdido">Perdido</option>
          <option value="descartado">Descartado</option>
        </select>
      </label>
      <label for="tel">Teléfono
        <input id="tel" name="tel" type="tel" inputmode="tel" autocomplete="off" placeholder="10 dígitos o +52">
      </label>
      <button type="submit">Buscar</button>
      <button type="button" id="limpiar" class="secundario">Limpiar</button>
    </form>
    <div class="acciones">
      <button type="button" id="exportar">Exportar CSV</button>
      <span id="resumen" class="resumen" aria-live="polite"></span>
    </div>
  </section>

  <section class="panel" aria-labelledby="titulo-lista">
    <h2 id="titulo-lista">Envíos recibidos</h2>
    <p id="cargando" class="cargando" hidden>Cargando…</p>
    <div class="tabla-envoltura">
      <table class="tabla" id="tabla">
        <thead>
          <tr>
            <th scope="col">Folio</th>
            <th scope="col">Fecha</th>
            <th scope="col">Tipo</th>
            <th scope="col">Estado</th>
            <th scope="col">Origen</th>
            <th scope="col">CTA</th>
          </tr>
        </thead>
        <tbody id="filas"></tbody>
      </table>
    </div>
    <p id="vacio" class="vacio" hidden>No hay envíos con estos filtros.</p>
    <nav class="paginacion" aria-label="Paginación">
      <button type="button" id="anterior">Anterior</button>
      <span id="pagina-info" aria-live="polite"></span>
      <button type="button" id="siguiente">Siguiente</button>
    </nav>
  </section>
  <p class="pie">Faro 33 Studio · Los datos se muestran solo en esta sesión y no se guardan en el navegador.</p>
</main>

<dialog id="detalle" aria-labelledby="detalle-titulo">
  <div class="detalle-cabecera">
    <h2 id="detalle-titulo">Envío</h2>
    <button type="button" id="cerrar" class="secundario">Cerrar</button>
  </div>
  <p id="detalle-meta" class="meta"></p>
  <div id="detalle-campos"></div>

  <div class="detalle-estado">
    <label for="nuevo-estado">Estado del envío</label>
    <select id="nuevo-estado">
      <option value="nuevo">Nuevo</option>
      <option value="contactado">Contactado</option>
      <option value="cotizando">Cotizando</option>
      <option value="ganado">Ganado</option>
      <option value="perdido">Perdido</option>
      <option value="descartado">Descartado</option>
    </select>
    <div class="acciones">
      <button type="button" id="guardar-estado">Guardar estado</button>
    </div>
  </div>

  <div class="detalle-borrar">
    <h3>Borrar (ARCO)</h3>
    <p>El borrado es definitivo y no se puede deshacer. Para confirmarlo, escribe el folio exacto de este envío.</p>
    <label for="confirmar-folio">Folio de confirmación</label>
    <input id="confirmar-folio" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false">
    <div class="acciones">
      <button type="button" id="borrar" class="peligro">Borrar (ARCO)</button>
    </div>
  </div>

  <p id="detalle-aviso" role="status"></p>
</dialog>

<script>
(function () {
  'use strict';

  var POR_PAGINA = 25;
  var pagina = 1;
  var total = 0;
  var filtros = { tipo: '', estado: '', tel: '' };
  var folioActual = null;
  var estadoActual = null;

  var ETIQUETAS_ESTADO = {
    nuevo: 'Nuevo',
    contactado: 'Contactado',
    cotizando: 'Cotizando',
    ganado: 'Ganado',
    perdido: 'Perdido',
    descartado: 'Descartado'
  };

  function porId(id) {
    return document.getElementById(id);
  }

  function crear(tag, clase, texto) {
    var elemento = document.createElement(tag);
    if (clase) elemento.className = clase;
    if (texto !== undefined && texto !== null) elemento.textContent = String(texto);
    return elemento;
  }

  function limpiar(nodo) {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  }

  function fechaLocal(iso) {
    if (!iso) return '—';
    var fecha = new Date(iso);
    if (isNaN(fecha.getTime())) return String(iso);
    try {
      return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Mazatlan'
      }).format(fecha);
    } catch (error) {
      return fecha.toISOString();
    }
  }

  function textoEstado(estado) {
    return ETIQUETAS_ESTADO[estado] || estado || '—';
  }

  function textoONada(valor) {
    return (valor === null || valor === undefined || valor === '') ? '—' : String(valor);
  }

  function consulta() {
    var partes = ['pagina=' + encodeURIComponent(String(pagina))];
    if (filtros.tipo) partes.push('tipo=' + encodeURIComponent(filtros.tipo));
    if (filtros.estado) partes.push('estado=' + encodeURIComponent(filtros.estado));
    if (filtros.tel) partes.push('tel=' + encodeURIComponent(filtros.tel));
    return partes.join('&');
  }

  function pedir(url, opciones) {
    return fetch(url, opciones).then(function (respuesta) {
      return respuesta.text().then(function (texto) {
        var datos = null;
        if (texto) {
          try { datos = JSON.parse(texto); } catch (error) { datos = null; }
        }
        if (!respuesta.ok) {
          var motivo = datos && datos.error ? datos.error : 'Error ' + respuesta.status;
          throw new Error(motivo);
        }
        return datos;
      });
    });
  }

  function avisar(texto, esError) {
    var aviso = porId('detalle-aviso');
    aviso.textContent = texto;
    aviso.className = esError ? 'aviso-error' : 'aviso-ok';
  }

  function filaTabla(fila) {
    var tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', 'Abrir envío ' + fila.folio);

    var celdas = [
      ['Folio', fila.folio, 'folio'],
      ['Fecha', fechaLocal(fila.creado), ''],
      ['Tipo', textoONada(fila.tipo), ''],
      ['Estado', textoEstado(fila.estado), ''],
      ['Origen', textoONada(fila.origen), ''],
      ['CTA', textoONada(fila.cta), '']
    ];

    celdas.forEach(function (celda) {
      var td = document.createElement('td');
      td.setAttribute('data-etiqueta', celda[0]);
      if (celda[2]) td.className = celda[2];
      if (celda[0] === 'Estado') {
        var chip = crear('span', 'chip', celda[1]);
        td.appendChild(chip);
      } else {
        td.textContent = celda[1];
      }
      tr.appendChild(td);
    });

    function abrir() { abrirDetalle(fila.folio); }
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        abrir();
      }
    });
    return tr;
  }

  function cargarLista() {
    var cargando = porId('cargando');
    var vacio = porId('vacio');
    cargando.hidden = false;
    vacio.hidden = true;

    return pedir('/api/envios?' + consulta(), { headers: { Accept: 'application/json' } })
      .then(function (datos) {
        total = datos && typeof datos.total === 'number' ? datos.total : 0;
        var filas = datos && Array.isArray(datos.filas) ? datos.filas : [];
        var cuerpo = porId('filas');
        limpiar(cuerpo);
        filas.forEach(function (fila) { cuerpo.appendChild(filaTabla(fila)); });

        vacio.hidden = filas.length !== 0;
        porId('resumen').textContent = total + (total === 1 ? ' envío' : ' envíos');

        var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
        porId('pagina-info').textContent = 'Página ' + pagina + ' de ' + paginas;
        porId('anterior').disabled = pagina <= 1;
        porId('siguiente').disabled = pagina >= paginas;
      })
      .catch(function () {
        var cuerpo = porId('filas');
        limpiar(cuerpo);
        vacio.hidden = false;
        vacio.textContent = 'No se pudo cargar la lista. Vuelve a intentarlo.';
        porId('resumen').textContent = '';
        porId('pagina-info').textContent = '';
      })
      .then(function () {
        cargando.hidden = true;
      });
  }

  function grupoDeCampos(campos) {
    var grupos = [];
    var mapa = {};
    campos.forEach(function (campo) {
      var nombre = campo.seccion || 'Sin sección';
      if (!mapa[nombre]) {
        mapa[nombre] = { seccion: nombre, campos: [] };
        grupos.push(mapa[nombre]);
      }
      mapa[nombre].campos.push(campo);
    });
    return grupos;
  }

  function pintarDetalle(datos) {
    var envio = datos.envio || {};
    porId('detalle-titulo').textContent = 'Envío ' + (envio.folio || '');
    porId('detalle-meta').textContent =
      'Creado: ' + fechaLocal(envio.creado) +
      ' · Tipo: ' + textoONada(envio.tipo) +
      ' · Estado: ' + textoEstado(envio.estado) +
      ' · Origen: ' + textoONada(envio.origen) +
      ' · CTA: ' + textoONada(envio.cta);

    var contenedor = porId('detalle-campos');
    limpiar(contenedor);
    var campos = Array.isArray(datos.campos) ? datos.campos : [];
    if (campos.length === 0) {
      contenedor.appendChild(crear('p', 'vacio', 'Este envío no tiene respuestas legibles.'));
    } else {
      grupoDeCampos(campos).forEach(function (grupo) {
        var bloque = crear('section', 'grupo');
        bloque.appendChild(crear('h3', '', grupo.seccion));
        var lista = document.createElement('dl');
        grupo.campos.forEach(function (campo) {
          lista.appendChild(crear('dt', '', campo.etiqueta));
          lista.appendChild(crear('dd', '', campo.valor));
        });
        bloque.appendChild(lista);
        contenedor.appendChild(bloque);
      });
    }

    estadoActual = envio.estado || 'nuevo';
    porId('nuevo-estado').value = estadoActual;
    porId('confirmar-folio').value = '';
    avisar('', false);
  }

  function abrirDetalle(folio) {
    var dialogo = porId('detalle');
    folioActual = folio;
    avisar('', false);
    porId('detalle-titulo').textContent = 'Envío ' + folio;
    porId('detalle-meta').textContent = '';
    limpiar(porId('detalle-campos'));

    pedir('/api/envios/' + encodeURIComponent(folio), { headers: { Accept: 'application/json' } })
      .then(function (datos) {
        pintarDetalle(datos);
        if (typeof dialogo.showModal === 'function') {
          if (!dialogo.open) dialogo.showModal();
        } else {
          dialogo.setAttribute('open', 'open');
        }
      })
      .catch(function () {
        avisar('No se pudo abrir el envío. Vuelve a intentarlo.', true);
        if (typeof dialogo.showModal === 'function') {
          if (!dialogo.open) dialogo.showModal();
        } else {
          dialogo.setAttribute('open', 'open');
        }
      });
  }

  function cerrarDetalle() {
    var dialogo = porId('detalle');
    folioActual = null;
    if (typeof dialogo.close === 'function' && dialogo.open) {
      dialogo.close();
    } else {
      dialogo.removeAttribute('open');
    }
  }

  function guardarEstado() {
    if (!folioActual) return;
    var nuevo = porId('nuevo-estado').value;
    avisar('Guardando…', false);

    pedir('/api/envios/' + encodeURIComponent(folioActual) + '/estado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-F33-Admin': '1',
        Accept: 'application/json'
      },
      body: JSON.stringify({ estado: nuevo })
    }).then(function (datos) {
      estadoActual = datos && datos.estado ? datos.estado : nuevo;
      avisar('Estado guardado.', false);
      return cargarLista();
    }).catch(function () {
      avisar('No se pudo guardar el estado. Vuelve a intentarlo.', true);
    });
  }

  function borrarEnvio() {
    if (!folioActual) return;
    var escrito = porId('confirmar-folio').value.trim();
    if (escrito !== folioActual) {
      avisar('El folio no coincide. Escríbelo exactamente igual para confirmar.', true);
      return;
    }
    avisar('Borrando…', false);

    pedir('/api/envios/' + encodeURIComponent(folioActual), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-F33-Admin': '1',
        Accept: 'application/json'
      },
      body: JSON.stringify({ confirmar: escrito })
    }).then(function () {
      cerrarDetalle();
      return cargarLista();
    }).catch(function () {
      avisar('No se pudo borrar. Vuelve a intentarlo.', true);
    });
  }

  function leerFiltros() {
    filtros.tipo = porId('tipo').value;
    filtros.estado = porId('estado').value;
    filtros.tel = porId('tel').value.trim();
    pagina = 1;
  }

  porId('filtros').addEventListener('submit', function (evento) {
    evento.preventDefault();
    leerFiltros();
    cargarLista();
  });

  porId('tipo').addEventListener('change', function () {
    leerFiltros();
    cargarLista();
  });

  porId('estado').addEventListener('change', function () {
    leerFiltros();
    cargarLista();
  });

  porId('limpiar').addEventListener('click', function () {
    porId('tipo').value = '';
    porId('estado').value = '';
    porId('tel').value = '';
    leerFiltros();
    cargarLista();
  });

  porId('exportar').addEventListener('click', function () {
    var partes = [];
    if (filtros.tipo) partes.push('tipo=' + encodeURIComponent(filtros.tipo));
    if (filtros.estado) partes.push('estado=' + encodeURIComponent(filtros.estado));
    window.location.href = '/api/exportar.csv' + (partes.length ? '?' + partes.join('&') : '');
  });

  porId('anterior').addEventListener('click', function () {
    if (pagina > 1) {
      pagina -= 1;
      cargarLista();
    }
  });

  porId('siguiente').addEventListener('click', function () {
    pagina += 1;
    cargarLista();
  });

  porId('cerrar').addEventListener('click', cerrarDetalle);
  porId('guardar-estado').addEventListener('click', guardarEstado);
  porId('borrar').addEventListener('click', borrarEnvio);

  porId('detalle').addEventListener('click', function (evento) {
    if (evento.target === porId('detalle')) cerrarDetalle();
  });

  cargarLista();
})();
</script>
</body>
</html>`;

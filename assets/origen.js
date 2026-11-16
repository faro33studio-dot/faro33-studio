/* Faro 33 — código de origen para el mensaje de WhatsApp y para Pixel/GA4.
   1) Código de PÁGINA/BOTÓN: al hacer clic en un enlace wa.me se añade «(ref: <pagina>[-<boton>])» al final
      del texto (p. ej. cocinas-hero, inicio-fab). Es solo texto del mensaje: no guarda nada en el navegador.
      Se puede forzar con data-ref="…" en el enlace.
   2) Código de CANAL/CAMPAÑA (utm_source/utm_campaign/fbclid): se guarda en sessionStorage y se añade como
      «(ref: canal-campana)». Solo con consentimiento; si el visitante rechazó, no se guarda ni se añade.
   3) Pixel y GA4: este script publica el código en window.__f33cta (antes de que corran los manejadores de la página)
      y cada página lo envía como parámetro cta en el Lead de Meta y en generate_lead de GA4.
   No toca el href estático: la reescritura ocurre al hacer clic. */
(function () {
  'use strict';
  var KEY = 'f33-origen';

  function rejected() {
    try {
      var c = JSON.parse(localStorage.getItem('f33-consent') || 'null');
      return !!(c && c.c === 'no' && Date.now() - c.t < 31536e6);
    } catch (e) { return false; }
  }
  function param(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }
  function stored() {
    try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function save(code) {
    try { sessionStorage.setItem(KEY, code); } catch (e) {}
  }
  function calc() {
    var src = param('utm_source').toLowerCase().replace(/^\s+|\s+$/g, '');
    var ch = '';
    if (src === 'facebook' || src === 'fb') ch = 'fb';
    else if (src === 'instagram' || src === 'ig') ch = 'ig';
    else if (src === 'google') ch = 'g';
    else if (src === 'whatsapp') ch = 'wa';
    else if (src) ch = src.replace(/[^a-z0-9]/g, '').slice(0, 6);
    if (!ch && param('fbclid')) ch = 'fb';
    if (!ch) return '';
    var camp = param('utm_campaign').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 14);
    return (ch + (camp ? '-' + camp : '')).slice(0, 22);
  }

  /* ---------- código de página ---------- */
  var PAGES = {
    '': 'inicio', 'muebles': 'muebles', 'proyecto-integral': 'integral', 'proyectos-integrales': 'integrales', 'cocinas': 'cocinas',
    'acabados-de-pared': 'acabados', 'centros-de-entretenimiento': 'centros', 'proyectos': 'proyectos',
    'nosotros': 'nosotros', 'contacto': 'contacto', 'caso-oshio': 'oshio', 'casa-en-la-colina': 'colina',
    'casa-quintas': 'quintas', 'un-rincon-cerca-del-cielo': 'rincon', 'un-pedacito-de-cielo': 'pedacito',
    'cocina-oxford': 'oxford', 'rincon-de-delicias': 'delicias', 'aviso-de-privacidad': 'aviso'
  };
  function pageCode() {
    var segs = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (segs.length > 1 && segs[0] === 'centros-de-entretenimiento') return segs[1].replace(/[^a-z0-9-]/g, '').slice(0, 14) || 'centros';
    var k = segs[0] || '';
    return PAGES[k] || k.replace(/[^a-z0-9-]/g, '').slice(0, 14) || 'sitio';
  }
  var PAGE = pageCode();
  function buttonCode(a) {
    var d = a.getAttribute('data-ref');
    if (d) return d.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
    var part = '';
    if (a.classList && a.classList.contains('wa-fab')) part = 'fab';
    else if (a.closest('#residencial')) part = 'residencial';
    else if (a.closest('#comercial')) part = 'comercial';
    else if (a.closest('#contacto')) part = 'contacto';
    else if (a.closest('.hero')) part = 'hero';
    else if (a.closest('header, .hdr, .nav, .top')) part = 'menu';
    else if (a.closest('footer, .ftr, .foot')) part = 'pie';
    return (PAGE + (part ? '-' + part : '')).slice(0, 30);
  }

  /* ---------- reescritura del texto al hacer clic ---------- */
  function addMark(a, mark) {
    var href = a.getAttribute('href') || '';
    var u;
    try { u = new URL(href, location.href); } catch (err) { return; }
    var text = u.searchParams.get('text') || '';
    if (text.indexOf(mark) > -1) return;
    var q = href.indexOf('?');
    var hash = href.indexOf('#');
    var base = q < 0 ? (hash < 0 ? href : href.slice(0, hash)) : href.slice(0, q);
    var query = q < 0 ? '' : href.slice(q + 1, hash < 0 ? href.length : hash);
    var frag = hash < 0 ? '' : href.slice(hash);
    var parts = query ? query.split('&') : [];
    var extra = (text ? ' ' : '') + mark;
    var found = false;
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      var k = eq < 0 ? parts[i] : parts[i].slice(0, eq);
      if (k === 'text') {
        parts[i] = 'text=' + encodeURIComponent(text + extra);
        found = true;
        break;
      }
    }
    if (!found) parts.push('text=' + encodeURIComponent(text + extra));
    a.setAttribute('href', base + '?' + parts.join('&') + frag);
  }

  var nuevo = calc();
  if (nuevo && !rejected()) save(nuevo);

  /* Escucha en window (fase de captura): corre ANTES que los manejadores de cada página, que disparan Lead/generate_lead. */
  window.__f33cta = '';
  window.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="wa.me"]') : null;
    if (!a) return;
    var ref = buttonCode(a);
    window.__f33cta = ref;
    addMark(a, '(ref: ' + ref + ')');
    if (!rejected()) {
      var code = stored();
      if (code) addMark(a, '(ref: ' + code + ')');
    }
  }, true);
})();

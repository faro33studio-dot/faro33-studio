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
    'acabados-de-pared': 'acabados', 'cortinas': 'cortinas', 'centros-de-entretenimiento': 'centros', 'proyectos': 'proyectos',
    'nosotros': 'nosotros', 'contacto': 'contacto', 'cuestionario': 'cuestionario', 'caso-oshio': 'oshio', 'casa-en-la-colina': 'colina',
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

/* Faro 33 — API de conversiones (servidor) para el Lead de WhatsApp.
   Envuelve fbq SOLO si el Pixel real está cargado (con consentimiento, fuera de localhost y de bots: en esos casos
   fbq es un stub y no se toca nada). En cada fbq('track','Lead',…) añade un eventID y envía el mismo evento al
   Worker de Cloudflare, que lo reenvía a Meta con ese event_id: Meta deduplica navegador y servidor.
   No se envía correo, teléfono ni ningún dato personal: solo cookies _fbp/_fbc, URL y parámetros del Lead. */
(function () {
  'use strict';
  var ENDPOINT = 'https://faro33-capi.faro33studio.workers.dev';
  var KEEP = ['value', 'currency', 'content_name', 'content_category', 'content_ids', 'cta'];
  function real(f) { return typeof f === 'function' && (Array.isArray(f.queue) || typeof f.callMethod === 'function'); }
  function cookie(n) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function fbc() {
    var c = cookie('_fbc');
    if (c) return c;
    var m = location.search.match(/[?&]fbclid=([^&]+)/);
    return m ? 'fb.1.' + Date.now() + '.' + decodeURIComponent(m[1]) : '';
  }
  function ttclid() {
    var m = location.search.match(/[?&]ttclid=([^&]+)/);
    if (m) return decodeURIComponent(m[1]).slice(0, 200);
    try { return sessionStorage.getItem('f33-ttclid') || ''; } catch (e) { return ''; }
  }
  function send(id, data) {
    var custom = {};
    KEEP.forEach(function (k) { if (data && data[k] !== undefined) custom[k] = data[k]; });
    var body = JSON.stringify({
      event_name: 'Lead', event_id: id, url: location.href.slice(0, 500),
      fbp: cookie('_fbp'), fbc: fbc(), custom: custom,
      /* TikTok Events API (el Worker solo lo usa si tiene TIKTOK_PIXEL_ID y TIKTOK_TOKEN) */
      tt_event: /^\/cuestionario\//.test(location.pathname) ? 'Lead' : 'Contact',
      ttp: cookie('_ttp'), ttclid: ttclid()
    });
    try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }).catch(function () {}); } catch (e) {}
  }
  function install() {
    var orig = window.fbq;
    if (!real(orig) || orig.__f33capi || window.__f33bot) return;
    var wrapped = function () {
      var a = [].slice.call(arguments);
      if (a[0] === 'track' && a[1] === 'Lead') {
        try {
          var id = (a[3] && a[3].eventID) || ('l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
          a[3] = Object.assign({}, a[3], { eventID: id });
          send(id, a[2]);
        } catch (e) {}
      }
      return orig.apply(this, a);
    };
    for (var k in orig) { try { wrapped[k] = orig[k]; } catch (e) {} }
    wrapped.__f33capi = true;
    window.fbq = wrapped;
  }
  install();
})();


/* Faro 33 — TikTok Pixel y Microsoft Clarity (2026-11-26).
   Misma compuerta que Meta/GA4: NO carga si el visitante rechazó cookies, en localhost, ni con bots/automatización.
   Con el ID vacío no carga nada. Los IDs son públicos (como el del Pixel de Meta); los tokens viven solo en Cloudflare.
   TikTok replica los eventos de Meta con el MISMO event_id que recibe el Worker (deduplica navegador + servidor):
     fbq Lead al tocar WhatsApp  → ttq Contact      fbq Lead del cuestionario → ttq Lead
     fbq ViewContent             → ttq ViewContent  (además ttq.page() en cada página)
   Clarity no se carga en /cuestionario/ (formulario con datos personales). Sin datos personales en ningún evento. */
(function () {
  'use strict';
  var TIKTOK_PIXEL_ID = '';   /* p. ej. 'CXXXXXXXXXXXXXXXXXXX' — Events Manager de TikTok Ads */
  var CLARITY_ID = '';        /* p. ej. 'abcd1234ef' — clarity.microsoft.com → Settings → Overview */

  function rejected() {
    try {
      var c = JSON.parse(localStorage.getItem('f33-consent') || 'null');
      return !!(c && c.c === 'no' && Date.now() - c.t < 31536e6);
    } catch (e) { return false; }
  }
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local || rejected() || window.__f33bot || navigator.webdriver === true) return;

  /* ---------- Microsoft Clarity ---------- */
  if (CLARITY_ID && !/^\/cuestionario\//.test(location.pathname)) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  /* ---------- TikTok Pixel ---------- */
  if (!TIKTOK_PIXEL_ID) return;
  try {
    var tc = (location.search.match(/[?&]ttclid=([^&]+)/) || [])[1];
    if (tc) sessionStorage.setItem('f33-ttclid', decodeURIComponent(tc).slice(0, 200));
  } catch (e) {}

  /* Código base oficial de TikTok (cola hasta que cargue events.js). */
  !function (w, d, t) {
    w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
    ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; };
    ttq.load = function (e, n) {
      var r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r; ttq._t = ttq._t || {}; ttq._t[e] = +new Date; ttq._o = ttq._o || {}; ttq._o[e] = n || {};
      var s = d.createElement('script'); s.type = 'text/javascript'; s.async = !0; s.src = r + '?sdkid=' + e + '&lib=' + t;
      var f = d.getElementsByTagName('script')[0]; f.parentNode.insertBefore(s, f);
    };
    ttq.load(TIKTOK_PIXEL_ID);
    ttq.page();
  }(window, document, 'ttq');

  function props(p) {
    var o = {};
    if (!p) return o;
    if (p.value !== undefined) o.value = p.value;
    if (p.currency) o.currency = p.currency;
    if (p.content_name) o.content_name = String(p.content_name).slice(0, 100);
    if (p.content_category) o.content_category = String(p.content_category).slice(0, 100);
    if (Array.isArray(p.content_ids) && p.content_ids.length) { o.content_id = String(p.content_ids[0]); o.content_type = 'product'; }
    if (p.tipo_proyecto) o.description = 'Cuestionario ' + String(p.tipo_proyecto).slice(0, 40);
    return o;
  }
  function mirror(args) {
    if (args[0] !== 'track' || rejected()) return;
    var p = args[2], id = args[3] && args[3].eventID;
    if (args[1] === 'ViewContent') {
      window.ttq.track('ViewContent', props(p), id ? { event_id: id } : undefined);
      return true;
    }
    if (args[1] === 'Lead') {
      var ev = /^\/cuestionario\//.test(location.pathname) ? 'Lead' : 'Contact';
      window.ttq.track(ev, props(p), id ? { event_id: id } : undefined);
    }
  }

  /* ViewContent que la página disparó ANTES de cargar este script (sigue en la cola del stub de Meta). */
  try {
    var q = window.fbq && window.fbq.queue;
    if (Array.isArray(q)) q.forEach(function (c) { if (c && c[0] === 'track' && c[1] === 'ViewContent' ) mirror([].slice.call(c)); });
  } catch (e) {}

  /* Envuelve fbq por FUERA del envoltorio de la API de conversiones: crea el event_id del Lead aquí, para que
     Meta (navegador y servidor) y TikTok usen el mismo. */
  var orig = window.fbq;
  if (typeof orig !== 'function' || orig.__f33tt) return;
  var wrapped = function () {
    var a = [].slice.call(arguments);
    try {
      if (a[0] === 'track' && a[1] === 'Lead' && !(a[3] && a[3].eventID)) {
        a[3] = Object.assign({}, a[3], { eventID: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) });
      }
      mirror(a);
    } catch (e) {}
    return orig.apply(this, a);
  };
  for (var k in orig) { try { wrapped[k] = orig[k]; } catch (e) {} }
  wrapped.__f33tt = true;
  window.fbq = wrapped;
})();

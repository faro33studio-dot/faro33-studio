/* Faro 33 — código de origen de campaña para el mensaje de WhatsApp.
   Guarda el canal/campaña en sessionStorage y etiqueta el enlace al hacer clic.
   No toca el href estático ni actúa si el visitante rechazó la medición. */
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

  var nuevo = calc();
  if (nuevo && !rejected()) save(nuevo);
  if (rejected()) return;
  var code = stored();
  if (!code) return;

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="wa.me"]') : null;
    if (!a || rejected()) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('wa.me') < 0) return;
    var u;
    try { u = new URL(href, location.href); } catch (err) { return; }
    var text = u.searchParams.get('text') || '';
    if (text.indexOf('(ref: ' + code + ')') > -1) return;

    var q = href.indexOf('?');
    var hash = href.indexOf('#');
    var base = q < 0 ? (hash < 0 ? href : href.slice(0, hash)) : href.slice(0, q);
    var query = q < 0 ? '' : href.slice(q + 1, hash < 0 ? href.length : hash);
    var frag = hash < 0 ? '' : href.slice(hash);
    var parts = query ? query.split('&') : [];
    var extra = (text ? ' ' : '') + '(ref: ' + code + ')';
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
  }, true);
})();

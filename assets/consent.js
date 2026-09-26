/* Faro 33 — aviso de cookies (México, LFPDPPP).
   Modelo: consentimiento tácito + opción clara de rechazo para analítica y publicidad.
   - Barra pequeña, no bloqueante, abajo a la izquierda (no choca con el botón de WhatsApp).
   - "Aceptar" la oculta. "Rechazar" apaga GA4 y Meta Pixel desde ese momento y en visitas futuras
     (el bloqueo anticipado vive en el <head> de cada página: ver F33_CONSENT_EARLY en CLAUDE.md).
   - Cualquier enlace con [data-cookie-prefs] vuelve a abrir la barra.
   La elección se guarda 12 meses en localStorage ('f33-consent'). */
(function () {
  'use strict';
  var KEY = 'f33-consent', GA = 'G-91L2N1S9T3', YEAR = 365 * 864e5;
  var doc = document;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Date.now() - v.t < YEAR ? v : null; }
    catch (e) { return null; }
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify({ c: c, t: Date.now() })); } catch (e) {} }

  var css = ''
    + '.f33c{position:fixed;left:16px;bottom:16px;z-index:70;width:min(470px,calc(100vw - 32px));display:flex;align-items:center;gap:14px;'
    + 'padding:10px 10px 10px 16px;border-radius:16px;color:#fff;background:rgba(10,27,54,.94);--lg-alpha:.86;'
    + 'font-family:ui-sans-serif,-apple-system,"Inter","Helvetica Neue",Arial,sans-serif;font-size:12px;line-height:1.45;letter-spacing:.01em;'
    + 'box-shadow:0 12px 32px -12px rgba(10,27,54,.55);opacity:0;transform:translateY(12px);pointer-events:none;'
    + 'transition:opacity .45s cubic-bezier(.2,.7,.2,1),transform .55s cubic-bezier(.3,1.2,.5,1)}'
    + '.f33c.on{opacity:1;transform:none;pointer-events:auto}'
    + '.f33c>*{position:relative;z-index:1}'
    + '.f33c p{margin:0;flex:1 1 auto;min-width:0;color:rgba(255,255,255,.86)}'
    + '.f33c a{color:#E2C99A;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}'
    + '.f33c a:hover{color:#fff}'
    + '.f33c .bt{display:flex;gap:6px;flex:0 0 auto}'
    + '.f33c button{position:relative;min-height:32px;padding:0 13px;border-radius:999px;cursor:pointer;font:inherit;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;transition:background .2s,color .2s,border-color .2s}'
    + '.f33c button::after{content:"";position:absolute;inset:-6px -3px}' /* área táctil ≥ 44 px */
    + '.f33c .no{background:none;border:1px solid rgba(255,255,255,.28);color:rgba(255,255,255,.82)}'
    + '.f33c .no:hover{border-color:#fff;color:#fff}'
    + '.f33c .ok{background:#E2C99A;border:1px solid #E2C99A;color:#0E2547}'
    + '.f33c .ok:hover{background:#fff;border-color:#fff}'
    + '.f33c button:focus-visible,.f33c a:focus-visible{outline:2px solid #E2C99A;outline-offset:2px}'
    + '@media (max-width:640px){.f33c{left:10px;right:84px;bottom:12px;width:auto;flex-direction:column;align-items:stretch;gap:8px;padding:10px 12px;border-radius:14px;font-size:11.5px}'
    + '.f33c .bt button{flex:1}}'
    + (reduce ? '.f33c{transition:none;transform:none}' : '');

  var bar = null;
  function build() {
    var st = doc.createElement('style'); st.textContent = css; doc.head.appendChild(st);
    bar = doc.createElement('div');
    bar.className = 'f33c lg';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Aviso de cookies');
    bar.innerHTML = '<p>Usamos cookies para medir visitas y mejorar nuestros anuncios. '
      + '<a href="/aviso-de-privacidad/#cookies">Aviso de privacidad</a></p>'
      + '<div class="bt"><button type="button" class="no">Rechazar</button><button type="button" class="ok">Aceptar</button></div>';
    doc.body.appendChild(bar);
    bar.querySelector('.ok').addEventListener('click', function () { choose('ok'); });
    bar.querySelector('.no').addEventListener('click', function () { choose('no'); });
  }
  function show(delay) {
    if (!bar) build();
    setTimeout(function () { bar.classList.add('on'); }, delay || 0);
  }
  function hide() { if (bar) bar.classList.remove('on'); }

  function choose(c) {
    var prev = read();
    save(c);
    hide();
    if (c === 'no') {
      /* apagar desde este momento, sin recargar */
      window['ga-disable-' + GA] = true;
      try { if (typeof fbq === 'function') fbq('consent', 'revoke'); } catch (e) {}
    } else if (prev && prev.c === 'no') {
      /* antes había rechazado: la medición estaba bloqueada desde el inicio de la página */
      location.reload();
    }
  }

  function init() {
    doc.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-cookie-prefs]');
      if (t) { e.preventDefault(); show(0); }
    });
    if (!read()) show(1200); /* después de la entrada del hero; nunca bloquea */
  }
  window.f33Consent = { open: function () { show(0); } };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();

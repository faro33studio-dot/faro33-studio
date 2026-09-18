/* Faro 33 — Liquid Glass (comportamiento).
   1. Luz: el reflejo y el filo de cada pieza de vidrio siguen al puntero (--lg-x, --lg-y, --lg-a).
   2. Refracción: en Chromium de escritorio, las piezas principales doblan lo que tienen detrás
      en el borde (mapa de desplazamiento SVG calculado a su tamaño exacto). Resto de navegadores:
      el vidrio esmerilado de glass.css, sin cambios. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var mq = function (q) { return window.matchMedia && matchMedia(q).matches; };
  if (mq('(prefers-reduced-transparency: reduce)')) return;
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var fine = mq('(hover: hover) and (pointer: fine)');

  var GLASS = '.lg, header.hdr--scrolled, nav.nav.is-scrolled, header.top.is-scrolled, .wa-fab, .ls-arrow, .hero .btn--on-deep-ghost';
  var HEAD = 'header.hdr, nav.nav, header.top';
  var REFRACT = HEAD + ', .wa-fab, .f33m-btn, .ls-arrow';

  /* ---------- 1. luz que sigue al puntero ---------- */
  if (fine && !reduce) {
    var px = -1, py = -1, queued = false;
    var paint = function () {
      queued = false;
      var els = doc.querySelectorAll(GLASS), vh = window.innerHeight;
      for (var i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh || !r.width) continue;
        var x = (px - r.left) / r.width, y = (py - r.top) / r.height;
        els[i].style.setProperty('--lg-x', (Math.max(-0.4, Math.min(1.4, x)) * 100).toFixed(1) + '%');
        els[i].style.setProperty('--lg-y', (Math.max(-0.8, Math.min(1.8, y)) * 100).toFixed(1) + '%');
        var ang = Math.atan2(py - (r.top + r.height / 2), px - (r.left + r.width / 2)) * 180 / Math.PI + 90;
        els[i].style.setProperty('--lg-a', ang.toFixed(0) + 'deg');
      }
    };
    doc.addEventListener('pointermove', function (e) {
      px = e.clientX; py = e.clientY;
      if (!queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
  }

  /* ---------- 2. refracción (solo Chromium de escritorio) ---------- */
  var brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  var chromium = brands.some(function (b) { return /Chromium/.test(b.brand); });
  if (!chromium || !fine) return;

  var NS = 'http://www.w3.org/2000/svg';
  var svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  var defs = doc.createElementNS(NS, 'defs');
  svg.appendChild(defs);
  doc.body.appendChild(svg);

  var st = doc.createElement('style');
  st.textContent = 'html body .lg-refract.lg-refract.lg-refract{-webkit-backdrop-filter:var(--lg-refract);backdrop-filter:var(--lg-refract)}';
  doc.head.appendChild(st);

  var seq = 0, cache = {};

  /* mapa de desplazamiento de una "lente" rectangular redondeada:
     cerca del borde (bisel) el fondo se muestrea hacia el centro → se curva como vidrio grueso */
  function lensMap(w, h, rad, bezel) {
    var c = doc.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    var hw = w / 2, hh = h / 2, bx = hw - rad, by = hh - rad;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var px = x + 0.5 - hw, py = y + 0.5 - hh;
        var qx = Math.abs(px) - bx, qy = Math.abs(py) - by, dist, nx, ny;
        if (qx > 0 && qy > 0) {                 /* zona de esquina */
          var l = Math.sqrt(qx * qx + qy * qy) || 1;
          dist = rad - l; nx = qx / l; ny = qy / l;
        } else if (qx > qy) { dist = rad - qx; nx = 1; ny = 0; }
        else { dist = rad - qy; nx = 0; ny = 1; }
        nx *= px < 0 ? -1 : 1; ny *= py < 0 ? -1 : 1;
        var t = dist < bezel ? 1 - Math.max(0, dist) / bezel : 0;
        var m = t * t;                          /* más fuerte en el filo */
        var i = (y * w + x) * 4;
        d[i] = Math.round(128 - nx * m * 127);  /* hacia adentro */
        d[i + 1] = Math.round(128 - ny * m * 127);
        d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function filterFor(w, h, rad) {
    var bezel = Math.max(6, Math.min(18, Math.min(w, h) * 0.32));
    var key = w + 'x' + h + 'r' + rad;
    if (cache[key]) return cache[key];
    var id = 'f33lg' + (++seq);
    var f = doc.createElementNS(NS, 'filter');
    f.setAttribute('id', id);
    f.setAttribute('x', '0'); f.setAttribute('y', '0');
    f.setAttribute('width', w); f.setAttribute('height', h);
    f.setAttribute('filterUnits', 'userSpaceOnUse');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.innerHTML =
      '<feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>' +
      '<feImage href="' + lensMap(w, h, rad, bezel) + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" result="m"/>' +
      '<feDisplacementMap in="b" in2="m" scale="' + Math.round(bezel * 1.6) + '" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
      '<feColorMatrix in="d" type="saturate" values="1.5"/>';
    defs.appendChild(f);
    var keys = Object.keys(cache);
    if (keys.length > 24) { var old = cache[keys[0]]; delete cache[keys[0]]; var n = doc.getElementById(old.id); if (n) n.remove(); }
    cache[key] = { id: id };
    return cache[key];
  }

  function isGlass(el) {
    if (el.matches(HEAD)) return el.matches('.hdr--scrolled, .is-scrolled');
    if (el.matches('.f33m-btn')) return !el.closest('.hdr--scrolled, .is-scrolled'); /* sin doble vidrio */
    return true;
  }
  function setRefract(el, on) {
    if (el.classList.contains('lg-refract') !== on) el.classList.toggle('lg-refract', on);
  }
  function apply(el) {
    if (!el.isConnected) return;
    if (!isGlass(el)) { setRefract(el, false); return; }
    var r = el.getBoundingClientRect();
    var w = Math.round(r.width), h = Math.round(r.height);
    if (w < 8 || h < 8 || w * h > 900000) { setRefract(el, false); return; }
    var rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    rad = Math.min(rad, w / 2, h / 2);
    var f = filterFor(w, h, Math.round(rad));
    var v = 'url(#' + f.id + ')';
    if (el.style.getPropertyValue('--lg-refract') !== v) el.style.setProperty('--lg-refract', v);
    setRefract(el, true);
  }

  /* debounce: durante la transición de la cápsula no se recalcula el mapa cuadro a cuadro */
  var ro = new ResizeObserver(function (es) {
    es.forEach(function (e) {
      var el = e.target;
      clearTimeout(el.__lgT);
      el.__lgT = setTimeout(function () { apply(el); }, 140);
    });
  });
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  function scan() {
    [].forEach.call(doc.querySelectorAll(REFRACT), function (el) {
      if (seen && !seen.has(el)) { seen.add(el); ro.observe(el); }
      apply(el);
    });
  }
  /* la cápsula del header cambia de tamaño al terminar su transición */
  /* solo reacciona al cambio real de estado (scrolled), no a sus propios cambios de clase */
  var mo = new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      var el = m.target, now = isGlass(el);
      if (el.__lgState === now) return;
      el.__lgState = now;
      scan(); setTimeout(scan, 650);
    });
  });
  function init() {
    scan();
    [].forEach.call(doc.querySelectorAll(HEAD), function (el) { el.__lgState = isGlass(el); mo.observe(el, { attributes: true, attributeFilter: ['class'] }); });
    setTimeout(scan, 800); /* botones que menu.js/gallery.js inyectan después */
  }
  if (doc.readyState === 'complete') init(); else window.addEventListener('load', init);
})();

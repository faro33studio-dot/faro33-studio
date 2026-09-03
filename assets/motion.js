/* Faro 33 — motor de movimiento compartido.
   Una sola inclusión por página (<script src="/assets/motion.js" defer>):
   1. Reveals al hacer scroll (solo en páginas SIN motor propio: detecta .rv/.reveal).
   2. Estado "scrolled" del header fijo (.nav.is-scrolled).
   3. Carga diferida: [data-bg] (estilo inline) y section.is-near (reglas CSS gateadas).
   4. Videos: solo se descargan y reproducen cuando están en pantalla ([data-autoplay]).
   Respeta prefers-reduced-motion en todo. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  root.classList.add('js');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var EASE = 'cubic-bezier(.2,.7,.2,1)';

  /* ---------- estilos ---------- */
  var css = ''
    + '.mo{opacity:0;transform:translateY(22px);transition:opacity .9s ' + EASE + ',transform .9s ' + EASE + ';will-change:opacity,transform}'
    + '.mo.in{opacity:1;transform:none;will-change:auto}'
    + '.nav{transition:background .35s ease,padding .35s ' + EASE + ',box-shadow .35s ease}'
    + '.nav.is-scrolled{background:rgba(10,27,54,.86);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);padding-top:12px;padding-bottom:12px;box-shadow:0 1px 0 rgba(255,255,255,.07)}'
    + (reduce ? '.mo{opacity:1!important;transform:none!important;transition:none!important}' : '');
  var st = doc.createElement('style');
  st.textContent = css;
  doc.head.appendChild(st);

  /* ---------- header fijo: fondo al hacer scroll ---------- */
  var nav = doc.querySelector('nav.nav');
  if (nav) {
    var navOn = null;
    var onNav = function () {
      var on = (window.scrollY || root.scrollTop) > 40;
      if (on !== navOn) { navOn = on; nav.classList.toggle('is-scrolled', on); }
    };
    onNav();
    window.addEventListener('scroll', onNav, { passive: true });
  }

  /* ---------- carga diferida de fondos ---------- */
  function hydrate(el) {
    var v = el.getAttribute('data-bg');
    if (v === null) return;
    var cur = el.getAttribute('style') || '';
    el.setAttribute('style', cur ? cur.replace(/;?\s*$/, ';') + v : v);
    el.removeAttribute('data-bg');
  }
  function lazyBackgrounds() {
    var bgs = [].slice.call(doc.querySelectorAll('[data-bg]'));
    var secs = [].slice.call(doc.querySelectorAll('section, header.hero, .fullbleed'));
    if (!hasIO) { bgs.forEach(hydrate); secs.forEach(function (s) { s.classList.add('is-near'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        hydrate(e.target);
        e.target.classList.add('is-near');
        /* galerías horizontales: sus tiles fuera de pantalla se cargan con la sección */
        [].forEach.call(e.target.querySelectorAll('[data-bg]'), function (el) { hydrate(el); io.unobserve(el); });
        io.unobserve(e.target);
      });
    }, { rootMargin: '700px 0px 700px 0px' });
    bgs.forEach(function (el) { io.observe(el); });
    secs.forEach(function (el) { io.observe(el); });
  }

  /* ---------- videos: reproducir solo en pantalla ---------- */
  function lazyVideos() {
    var vids = [].slice.call(doc.querySelectorAll('video[data-autoplay]'));
    if (!vids.length) return;
    if (reduce) return; /* póster estático */
    function prep(v) {
      if (v.__prepped) return; v.__prepped = true;
      /* pantallas anchas: fuente HD (1080px) si la hay; móvil: 720px */
      var hd = v.querySelector('source[data-hd]');
      if (hd && (window.innerWidth || 0) >= 900) hd.setAttribute('src', hd.getAttribute('data-hd'));
      v.preload = 'auto';
      v.load();
    }
    function play(v) { prep(v); v.muted = true; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    if (!hasIO) { vids.forEach(play); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        v.__inView = e.isIntersecting;
        if (e.isIntersecting) play(v);
        else if (!v.paused) v.pause();
      });
    }, { rootMargin: '300px 0px 300px 0px', threshold: 0.01 });
    vids.forEach(function (v) { io.observe(v); });
    /* Chrome pausa el video en pestañas de fondo y no lo reanuda solo */
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState !== 'visible') return;
      vids.forEach(function (v) { if (v.__inView && v.paused) play(v); });
    });
  }

  /* ---------- reveals genéricos ---------- */
  var GROUPS = ['specs', 'twin', 'palette', 'rooms', 'pieces', 'mats', 'split', 'six', 'grid', 'meta-grid', 'meta', 'row'];
  function isGroup(el) {
    var cl = el.classList;
    for (var i = 0; i < GROUPS.length; i++) if (cl.contains(GROUPS[i])) return true;
    return false;
  }
  function reveals() {
    if (doc.querySelector('.rv, .reveal')) return; /* la página trae su propio motor */
    var targets = [];
    function add(el, delay) {
      if (!el || el.__mo) return;
      if (getComputedStyle(el).transform !== 'none') return; /* no pisar transforms propios */
      el.__mo = true;
      if (delay) el.style.transitionDelay = delay + 'ms';
      targets.push(el);
    }
    function addSet(list, step, cap) {
      var d = 0;
      [].forEach.call(list, function (el) { add(el, Math.min(d, cap)); d += step; });
    }
    var q = ':scope > .wrap > *, :scope > .stage > .cap > *, :scope > .cap > *, :scope > .body > .wrap > *, '
      + ':scope > .head, :scope > .scroller, :scope > .hint, :scope > .vid, :scope > .strip, :scope > .meta, :scope > .photo, :scope > .inner > .head';
    [].forEach.call(doc.querySelectorAll('section, .fullbleed'), function (sec) {
      if (sec.classList.contains('hero')) return;
      var kids;
      try { kids = sec.querySelectorAll(q); } catch (e) { return; }
      var d = 0;
      [].forEach.call(kids, function (el) {
        if (el.tagName === 'VIDEO' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        if (isGroup(el)) { addSet(el.children, 80, 480); }
        else { add(el, Math.min(d, 240)); d += 60; }
      });
    });
    [].forEach.call(doc.querySelectorAll('.related-projects .grid'), function (g) { addSet(g.children, 100, 300); });
    if (!targets.length) return;

    if (reduce || !hasIO) { targets.forEach(function (el) { el.classList.add('mo', 'in'); }); return; }
    var vh = window.innerHeight || root.clientHeight;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) {
      el.classList.add('mo');
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) {
        /* ya visible: entrada suave sin esperar al observer */
        setTimeout(function () { el.classList.add('in'); }, 40);
      } else io.observe(el);
    });
    /* red de seguridad: nada se queda invisible si el observer no dispara */
    setTimeout(function () {
      targets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) el.classList.add('in');
      });
    }, 2500);
  }

  function init() { lazyBackgrounds(); lazyVideos(); reveals(); }
  if (doc.readyState === 'complete') init();
  else doc.addEventListener('DOMContentLoaded', init);
})();

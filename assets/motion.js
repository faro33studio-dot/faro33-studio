/* Faro 33 — motor de movimiento compartido.
   Una sola inclusión por página (<script src="/assets/motion.js" defer>):
   1. Reveals al hacer scroll (solo en páginas SIN motor propio: detecta .rv/.reveal).
   2. Estado "scrolled" del header fijo (.nav.is-scrolled).
   3. Carga diferida: [data-bg] (estilo inline) y section.is-near (reglas CSS gateadas).
   4. Videos: solo se descargan y reproducen cuando están en pantalla ([data-autoplay]).
   5. Reveal por línea de titulares marcados con [data-line-reveal].
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

  /* ---------- parallax (data-parallax) ---------- */
  function parallax() {
    var els = [].slice.call(doc.querySelectorAll('[data-parallax]'));
    if (!els.length) return;
    /* activo solo si el visitante no pidió menos movimiento */
    if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: no-preference)').matches)) return;
    var items = [], ticking = false;

    function maxShift() {
      return (window.innerWidth || root.clientWidth) <= 768 ? 12 : 32;
    }
    function apply(it) {
      var r = it.frame.getBoundingClientRect();
      var vh = window.innerHeight || root.clientHeight;
      if (r.bottom < 0 || r.top > vh) return;
      var off = (r.top + r.height / 2 - vh / 2) * it.speed;
      /* la holgura la da el inset negativo (32 px escritorio / 12 px móvil).
         Si el CSS no la aplica, over = 0 y el fondo no se mueve: nunca hay blanco. */
      var over = (it.el.getBoundingClientRect().height - r.height) / 2;
      var max = Math.min(maxShift(), Math.max(0, over));
      max = Math.floor(max * 100) / 100; /* redondeo hacia abajo: ni un píxel de más */
      var y = Math.max(-max, Math.min(max, -off));
      if (y === it.y) return;
      it.y = y;
      it.el.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
    }
    function tick() {
      ticking = false;
      items.forEach(function (it) { if (it.inView) apply(it); });
    }
    function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }

    els.forEach(function (el) {
      var it = {
        el: el,
        frame: el.parentElement || el,
        speed: parseFloat(el.getAttribute('data-parallax')) || 0.14,
        inView: !hasIO,
        y: 0
      };
      /* primer frame en reposo: translate 0, sin scale (scale 1), como la foto original */
      el.style.transform = 'translate3d(0,0,0)';
      el.style.willChange = 'transform';
      items.push(it);
      if (hasIO) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            it.inView = e.isIntersecting;
            if (it.inView) requestTick();
          });
        }, { rootMargin: '80px 0px 80px 0px' }).observe(it.frame);
      }
    });

    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', function () {
      items.forEach(function (it) { it.y = NaN; });
      requestTick();
    });
    tick();
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
    if (root.hasAttribute('data-no-reveal')) return; /* p. ej. páginas legales: texto quieto */
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

  /* ---------- reveal por línea de titulares ---------- */
  function lineReveals() {
    var heads = [].slice.call(doc.querySelectorAll('[data-line-reveal]'));
    if (!heads.length || reduce || !hasIO) return;
    if (!doc.createTreeWalker || !doc.createRange) return;

    var lineIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        lineIO.unobserve(e.target);
        if (e.target.__lrShow) e.target.__lrShow();
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });

    function setup(head) {
      if (head.__lr) return;
      head.__lr = true;
      var original = head.innerHTML;

      /* palabras en spans para medir los renglones reales */
      var walker = doc.createTreeWalker(head, 4, null, false);
      var texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      texts.forEach(function (node) {
        if (!/\S/.test(node.nodeValue)) return;
        var frag = doc.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); return; }
          var w = doc.createElement('span');
          w.className = 'lr-w';
          w.textContent = part;
          frag.appendChild(w);
        });
        node.parentNode.replaceChild(frag, node);
      });

      var words = [].slice.call(head.querySelectorAll('.lr-w'));
      var lines = [], line = [], top = null;
      words.forEach(function (w) {
        var t = w.getBoundingClientRect().top;
        if (top === null || Math.abs(t - top) > 2) {
          if (line.length) lines.push(line);
          line = [w];
          top = t;
        } else line.push(w);
      });
      if (line.length) lines.push(line);
      if (!lines.length) { head.innerHTML = original; return; }

      lines.forEach(function (group, i) {
        var first = group[0], last = group[group.length - 1];
        var topChild = first;
        while (topChild.parentNode && topChild.parentNode !== head) topChild = topChild.parentNode;
        var marker = doc.createComment('lr');
        head.insertBefore(marker, topChild);
        var range = doc.createRange();
        range.setStartBefore(first);
        range.setEndAfter(last);
        var frag = range.extractContents();
        var lineEl = doc.createElement('span');
        lineEl.className = 'lr-line';
        var inner = doc.createElement('span');
        inner.className = 'lr-inner';
        inner.style.transitionDelay = (i * 80) + 'ms';
        inner.appendChild(frag);
        lineEl.appendChild(inner);
        head.insertBefore(lineEl, marker);
        head.removeChild(marker);
      });

      head.classList.add('lr-ready');
      var total = (lines.length - 1) * 80 + 760;
      var shown = false;
      function show() {
        if (shown) return;
        shown = true;
        head.classList.add('lr-in');
        /* devuelve el marcado original: la página queda igual que sin JS */
        setTimeout(function () {
          head.innerHTML = original;
          head.classList.remove('lr-ready', 'lr-in');
        }, total);
      }
      head.__lrShow = show;

      var vh = window.innerHeight || root.clientHeight;
      var r = head.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh * 0.92) {
        requestAnimationFrame(function () { requestAnimationFrame(show); });
      } else {
        lineIO.observe(head);
      }
    }

    function run() { heads.forEach(setup); }
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(run).catch(run);
    else run();
  }

  function init() { lazyBackgrounds(); lazyVideos(); parallax(); reveals(); lineReveals(); }
  if (doc.readyState === 'complete') init();
  else doc.addEventListener('DOMContentLoaded', init);
})();

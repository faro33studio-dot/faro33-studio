/* Faro 33 — galería compartida: lightbox + flechas/arrastre en scrollers horizontales.
   Se activa sola sobre fotos conocidas (ver ZOOM); no requiere marcado extra. */
(function () {
  'use strict';
  var doc = document;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ZOOM = [
    '.gallery .scroller .img', '.twin .panel .img', '.rooms .room .img', '.proyecto .hero-img',
    '.cocina .photo', '.metafora .strip', '.ph.gal', '.finish .ph',
    '.proc-grid .img', '.case-feature .img', '.case-grid .shot'
  ].join(',');

  var css = ''
    + '.lb-z{cursor:zoom-in}'
    + '.lb-hint{position:absolute;right:14px;bottom:14px;z-index:3;width:34px;height:34px;border-radius:50%;background:rgba(10,27,54,.55);color:#fff;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:.85;transition:opacity .2s}'
    + '.lb-hint svg{width:16px;height:16px}'
    + '@media (hover:hover){.lb-hint{opacity:0}.lb-z:hover .lb-hint{opacity:1}}'
    + '.lb{position:fixed;inset:0;z-index:300;background:rgba(10,27,54,.96);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .35s ease}'
    + '.lb.on{opacity:1;pointer-events:auto}'
    + '.lb img{max-width:min(92vw,1600px);max-height:82vh;object-fit:contain;box-shadow:0 30px 80px rgba(0,0,0,.5);transform:scale(.96);transition:transform .45s cubic-bezier(.2,.7,.2,1),opacity .3s ease;opacity:0}'
    + '.lb.on img.ok{transform:none;opacity:1}'
    + '.lb-cap{position:absolute;left:clamp(16px,4vw,48px);right:clamp(16px,4vw,48px);bottom:clamp(14px,3vh,28px);display:flex;justify-content:space-between;align-items:flex-end;gap:16px;color:#fff;font-family:"Bodoni MT","Bodoni Moda",Georgia,serif;font-size:clamp(15px,1.6vw,20px);line-height:1.3}'
    + '.lb-cap .n{font-family:ui-sans-serif,-apple-system,"Inter",Arial,sans-serif;font-size:10.5px;letter-spacing:.28em;text-transform:uppercase;color:#E2C99A;white-space:nowrap}'
    + '.lb-btn{position:absolute;background:none;border:0;color:#fff;cursor:pointer;padding:14px;opacity:.8;transition:opacity .15s}'
    + '.lb-btn:hover{opacity:1}.lb-btn svg{width:26px;height:26px;display:block}'
    + '.lb-x{top:clamp(10px,2vh,22px);right:clamp(10px,2vw,22px)}'
    + '.lb-p,.lb-n{top:50%;transform:translateY(-50%)}.lb-p{left:clamp(4px,1.5vw,18px)}.lb-n{right:clamp(4px,1.5vw,18px)}'
    + '@media (max-width:640px){.lb-p,.lb-n{top:auto;bottom:calc(clamp(14px,3vh,28px) + 44px);transform:none}.lb-cap{padding-right:0;flex-direction:column;align-items:flex-start;gap:6px}}'
    + '.gallery{position:relative}'
    + '.gsc-btn{position:absolute;top:50%;z-index:4;width:48px;height:48px;border-radius:50%;border:1px solid rgba(19,48,92,.25);background:rgba(251,248,242,.92);color:#13305C;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(10,27,54,.18);transition:transform .2s,opacity .2s;opacity:.95}'
    + '.gsc-btn:hover{transform:scale(1.06)}.gsc-btn[disabled]{opacity:.25;cursor:default;transform:none}.gsc-btn svg{width:20px;height:20px}'
    + '.gsc-btn.p{left:clamp(10px,2vw,28px)}.gsc-btn.n{right:clamp(10px,2vw,28px)}'
    + '.scroller.drag{cursor:grabbing;scroll-snap-type:none!important}.scroller.drag *{pointer-events:none}'
    + (reduce ? '.lb,.lb img,.lb-hint,.gsc-btn{transition:none!important}' : '');
  var st = doc.createElement('style'); st.textContent = css; doc.head.appendChild(st);

  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 5l14 14M19 5L5 19"/></svg>';
  var ICON_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 5l-7 7 7 7"/></svg>';
  var ICON_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5l7 7-7 7"/></svg>';
  var ICON_Z = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

  function bgUrl(el) {
    var layer = el.querySelector && el.querySelector('.gal-layer.is-on');
    var bg = getComputedStyle(layer || el).backgroundImage || '';
    var m = /url\(["']?([^"')]+)["']?\)/.exec(bg);
    if (!m) { /* fondo diferido aún no hidratado: leer data-bg (preferir webp) */
      var d = el.getAttribute('data-bg') || '';
      m = /url\(["']?([^"')]+\.webp)["']?\)/.exec(d) || /url\(["']?([^"')]+)["']?\)/.exec(d);
    }
    return m ? m[1] : null;
  }
  function captionOf(el) {
    var t = el.getAttribute('aria-label');
    if (!t) { var inner = el.querySelector('.tag, .n, figcaption'); if (inner) t = inner.textContent; }
    if (!t) { var fc = el.closest('figure'); if (fc && fc.querySelector('figcaption')) t = fc.querySelector('figcaption').textContent; }
    if (!t) { var p = el.parentElement; var h = p && p.querySelector('.t, h3, h2'); if (h) t = h.textContent; }
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  /* ---------- lightbox ---------- */
  var items = [], cur = 0, lb, img, cap, num, lastFocus;
  function build() {
    lb = doc.createElement('div'); lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Foto ampliada');
    lb.innerHTML = '<img alt=""><div class="lb-cap"><span class="c"></span><span class="n"></span></div>'
      + '<button class="lb-btn lb-x" aria-label="Cerrar">' + ICON_X + '</button>'
      + '<button class="lb-btn lb-p" aria-label="Anterior">' + ICON_L + '</button>'
      + '<button class="lb-btn lb-n" aria-label="Siguiente">' + ICON_R + '</button>';
    doc.body.appendChild(lb);
    img = lb.querySelector('img'); cap = lb.querySelector('.c'); num = lb.querySelector('.n');
    lb.querySelector('.lb-x').addEventListener('click', close);
    lb.querySelector('.lb-p').addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    lb.querySelector('.lb-n').addEventListener('click', function (e) { e.stopPropagation(); go(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target === img) close(); });
    doc.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('on')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    });
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    });
  }
  function show(i) {
    cur = (i + items.length) % items.length;
    var it = items[cur];
    img.classList.remove('ok');
    img.onload = function () { img.classList.add('ok'); };
    img.src = it.src; img.alt = it.cap;
    cap.textContent = it.cap;
    num.textContent = (cur + 1) + ' / ' + items.length;
    lb.querySelector('.lb-p').style.visibility = lb.querySelector('.lb-n').style.visibility = items.length > 1 ? '' : 'hidden';
    /* precarga vecinos */
    [1, -1].forEach(function (d) { var n = items[(cur + d + items.length) % items.length]; if (n) { var pre = new Image(); pre.src = n.src; } });
  }
  function go(d) { show(cur + d); }
  function open(i) {
    if (!lb) build();
    lastFocus = doc.activeElement;
    show(i);
    lb.classList.add('on');
    doc.documentElement.style.overflow = 'hidden';
    lb.querySelector('.lb-x').focus();
  }
  function close() {
    lb.classList.remove('on');
    doc.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function collect() {
    items = [];
    [].forEach.call(doc.querySelectorAll(ZOOM), function (el) {
      if (el.closest('a, .related-projects, .lb')) return;
      var idx = items.length;
      items.push({ el: el, src: null, cap: captionOf(el) });
      el.classList.add('lb-z');
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', el.getAttribute('role') || 'button');
      if (!el.querySelector('.lb-hint')) {
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        var h = doc.createElement('span'); h.className = 'lb-hint'; h.setAttribute('aria-hidden', 'true'); h.innerHTML = ICON_Z; el.appendChild(h);
      }
      function act() {
        /* resolver src al momento: los fondos diferidos ya cargaron cuando el usuario llega */
        items.forEach(function (it) { it.src = it.src || bgUrl(it.el); });
        var live = items.filter(function (it) { return it.src; });
        var j = live.indexOf(items[idx]); if (j < 0) return;
        items = live; open(j);
      }
      el.addEventListener('click', function (e) { if (el.__dragged) { el.__dragged = false; return; } e.preventDefault(); act(); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    });
  }

  /* ---------- scrollers horizontales: flechas + arrastre ---------- */
  function scrollers() {
    [].forEach.call(doc.querySelectorAll('.gallery .scroller'), function (sc) {
      var host = sc.closest('.gallery') || sc.parentElement;
      var p = doc.createElement('button'), n = doc.createElement('button');
      p.className = 'gsc-btn p'; n.className = 'gsc-btn n';
      p.setAttribute('aria-label', 'Fotos anteriores'); n.setAttribute('aria-label', 'Más fotos');
      p.innerHTML = ICON_L; n.innerHTML = ICON_R;
      host.appendChild(p); host.appendChild(n);
      function step() { var k = sc.firstElementChild; return k ? k.getBoundingClientRect().width + 24 : sc.clientWidth * 0.8; }
      function upd() { p.disabled = sc.scrollLeft <= 4; n.disabled = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 4; }
      p.addEventListener('click', function () { sc.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }); });
      n.addEventListener('click', function () { sc.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }); });
      sc.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd); upd();
      /* posicionar flechas a la altura del scroller */
      function place() { var t = sc.offsetTop + sc.clientHeight / 2; p.style.top = n.style.top = t + 'px'; p.style.transform = n.style.transform = 'translateY(-50%)'; }
      place(); window.addEventListener('resize', place); setTimeout(place, 600);
      /* arrastre con mouse */
      var down = false, sx = 0, sl = 0, moved = 0;
      sc.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = 0; sx = e.clientX; sl = sc.scrollLeft; });
      window.addEventListener('pointermove', function (e) {
        if (!down) return; var dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
        if (moved > 6) { sc.classList.add('drag'); sc.scrollLeft = sl - dx; }
      });
      window.addEventListener('pointerup', function (e) {
        if (!down) return; down = false;
        if (moved > 6) { sc.classList.remove('drag'); [].forEach.call(sc.querySelectorAll('.lb-z'), function (z) { z.__dragged = true; setTimeout(function () { z.__dragged = false; }, 50); }); }
      });
    });
  }

  function init() { collect(); scrollers(); }
  if (doc.readyState === 'complete') init(); else doc.addEventListener('DOMContentLoaded', init);
})();

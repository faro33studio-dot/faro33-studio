/* Faro 33 — /muebles/ · M2: filtro por línea, contador y ?linea=.
   M3: ficha lateral con #pieza=, datos por fetch (una sola vez), historial y foco. */
(function () {
  'use strict';
  var bar = document.querySelector('.mb-chips');
  var countEl = document.querySelector('.mb-count');
  if (!bar || !countEl) return;
  var chips = [].slice.call(bar.querySelectorAll('.chip[data-slug]'));
  var sections = [].slice.call(document.querySelectorAll('.mb-sec'));
  var seleccion = document.getElementById('seleccion');
  var lines = sections.filter(function (s) { return s.hasAttribute('data-linea'); });
  if (!chips.length || !lines.length) return;

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var DUR = reduce ? 200 : 560;
  var total = 0;
  lines.forEach(function (s) {
    var n = s.querySelectorAll('.mb-grid > a.mb[data-linea]').length;
    if (!n) n = parseInt(s.getAttribute('data-n'), 10) || 0;
    s.f33n = n;
    total += n;
  });

  function chipFor(slug) {
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].getAttribute('data-slug') === slug) return chips[i];
    }
    return null;
  }
  function label(chip) {
    return chip ? chip.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function lineName(value) {
    var chip = chipFor(value);
    return chip ? label(chip) : String(value || '');
  }
  function trackView(info) {
    if (typeof fbq !== 'function') return;
    try {
      fbq('track', 'ViewContent', {
        content_type: 'product',
        content_ids: [info.id],
        content_name: info.nombre,
        content_category: lineName(info.linea)
      });
    } catch (e) {}
  }
  function trackFilter(chip, slug) {
    if (typeof fbq !== 'function') return;
    try {
      fbq('trackCustom', 'FiltrarLinea', {
        content_category: slug === 'todas' ? 'Todas' : label(chip),
        linea: slug
      });
    } catch (e) {}
  }
  function toggle(section, show) {
    if (!section) return;
    if (show) section.removeAttribute('hidden');
    else section.setAttribute('hidden', '');
  }
  function clearEnds() {
    [].forEach.call(document.querySelectorAll('.mb-end'), function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }
  function addEnd(section, name) {
    clearEnds();
    if (!section) return;
    var grid = section.querySelector('.mb-grid');
    if (!grid) return;
    var end = document.createElement('div');
    end.className = 'mb-end';
    var p = document.createElement('p');
    p.className = 'mb-end-h';
    p.textContent = '¿Buscas otra medida o acabado?';
    var a = document.createElement('a');
    a.className = 'mb-btn mb-btn--wa';
    a.href = 'https://wa.me/526675402559?text=' + encodeURIComponent(
      'Hola, estoy viendo la línea ' + name + ' de la Colección Verano 2026 y busco otra medida o acabado.'
    );
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('data-wa-label', 'Muebles: ' + name);
    a.setAttribute('data-wa-cat', name);
    a.setAttribute('data-wa-name', name);
    a.textContent = 'Escríbenos por WhatsApp';
    end.appendChild(p);
    end.appendChild(a);
    grid.appendChild(end);
  }

  var fadeTimer;
  function fade(list) {
    if (reduce || !list.length) return;
    list.forEach(function (s) {
      s.style.transition = 'none';
      s.style.opacity = '0';
    });
    void list[0].offsetWidth;
    list.forEach(function (s) {
      s.style.transition = 'opacity 160ms linear';
      s.style.opacity = '1';
    });
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () {
      list.forEach(function (s) {
        s.style.transition = '';
        s.style.opacity = '';
      });
    }, 240);
  }
  function writeUrl(slug) {
    try {
      var u = new URL(location.href);
      if (slug === 'todas') u.searchParams['delete']('linea');
      else u.searchParams.set('linea', slug);
      var next = u.pathname + u.search + u.hash;
      if (next !== location.pathname + location.search + location.hash) {
        history.replaceState(null, '', next);
      }
    } catch (e) {}
  }
  function chipInView(chip, smooth) {
    if (!chip) return;
    var behavior = (smooth && !reduce) ? 'smooth' : 'instant';
    try {
      chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: behavior });
    } catch (e) {
      chip.scrollIntoView(false);
    }
  }
  function scrollToSection(section) {
    if (!section) return;
    try {
      section.scrollIntoView({ block: 'start', inline: 'nearest', behavior: reduce ? 'instant' : 'smooth' });
    } catch (e) {
      section.scrollIntoView(true);
    }
  }
  function updateMask() {
    var max = bar.scrollWidth - bar.clientWidth;
    bar.classList.toggle('is-end', max <= 1 || bar.scrollLeft >= max - 1);
  }

  var state = { slug: 'todas', open: null };

  function apply(slug, opts) {
    opts = opts || {};
    var chip = chipFor(slug);
    if (!chip) { slug = 'todas'; chip = chipFor('todas'); }
    state.slug = slug;
    chips.forEach(function (c) {
      c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
    });
    var shown = [];
    if (slug === 'todas') {
      if (seleccion) { toggle(seleccion, true); shown.push(seleccion); }
      lines.forEach(function (s) { toggle(s, true); shown.push(s); });
      clearEnds();
      countEl.textContent = total + ' piezas · Colección Verano 2026';
    } else {
      if (seleccion) toggle(seleccion, false);
      var target = null;
      lines.forEach(function (s) {
        var on = s.getAttribute('data-linea') === slug;
        toggle(s, on);
        if (on) { target = s; shown.push(s); }
      });
      addEnd(target, label(chip));
      countEl.textContent = (target ? target.f33n : 0) + ' piezas · ' + label(chip);
    }
    if (opts.fade !== false) fade(shown);
    if (opts.url !== false) writeUrl(slug);
    chipInView(chip, opts.chipSmooth !== false);
    updateMask();
    if (opts.scroll) scrollToSection(shown[0]);
  }
  function readLinea() {
    var m = location.search.match(/[?&]linea=([^&]*)/);
    if (!m) return 'todas';
    var raw = m[1].replace(/\+/g, ' ');
    try { raw = decodeURIComponent(raw); } catch (e) { return null; }
    if (!raw) return null;
    return chipFor(raw) ? raw : null;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var slug = chip.getAttribute('data-slug');
      apply(slug, { scroll: true });
      /* Solo la acción del usuario: la carga con ?linea= y popstate no pasan por aquí. */
      trackFilter(chip, slug);
    });
  });
  bar.addEventListener('scroll', updateMask, false);
  window.addEventListener('resize', function () { updateMask(); syncCookie(); });

  var initial = readLinea();
  if (initial === null) {
    writeUrl('todas');
  } else if (initial === 'todas') {
    if (/[?&]linea=/.test(location.search)) writeUrl('todas');
  } else {
    apply(initial, { scroll: false, url: false, fade: false, chipSmooth: false });
  }
  updateMask();

  window.addEventListener('popstate', function () {
    var raw = readLinea();
    var s = raw === null ? 'todas' : raw;
    /* Atrás solo cambia el hash al cerrar la ficha: no repetir el fundido del filtro. */
    if (raw === null || s !== state.slug) {
      apply(s, { scroll: false, url: true, chipSmooth: false });
    }
    fromHash();
  });

  /* ---------------------------------------------------------------------
     M3 · ficha
     --------------------------------------------------------------------- */
  var sheet = document.getElementById('mb-sheet');
  var veil = document.getElementById('mb-veil');
  var closeBtn = document.getElementById('mb-close');
  var prevBtn = document.getElementById('mb-prev');
  var nextBtn = document.getElementById('mb-next');
  var waBtn = document.getElementById('mb-wa');
  var copyBtn = document.getElementById('mb-copy');
  var posEl = document.getElementById('mb-pos');
  var bodyEl = document.getElementById('mb-body');
  var detailEl = document.getElementById('mb-detail');
  var phEl = document.getElementById('mb-ph');
  var mainImg = document.getElementById('mb-main-img');
  var catEl = document.getElementById('mb-cat');
  var titleEl = document.getElementById('mb-sheet-title');
  var toastEl = document.getElementById('mb-toast');
  if (!sheet || !veil || !closeBtn || !waBtn || !copyBtn || !bodyEl) return;

  var dataById = null;
  var dataPromise = null;
  var hideTimer = null;
  var toastTimer = null;
  var backCard = null;
  var prevBodyStyle = null;
  var bgEls = [].slice.call(document.querySelectorAll('main, .nav, .foot, .wa-fab, .skip-link'));

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function selId(id) {
    return 'a.mb[data-id="' + String(id).replace(/"/g, '\\"') + '"]';
  }
  function cardFor(id) {
    var sel = selId(id);
    for (var i = 0; i < lines.length; i++) {
      var c = lines[i].querySelector(sel);
      if (c) return c;
    }
    return document.querySelector(sel);
  }
  function orderIds() {
    var out = [];
    var secs = state.slug === 'todas' ? lines : lines.filter(function (s) {
      return s.getAttribute('data-linea') === state.slug;
    });
    secs.forEach(function (s) {
      [].forEach.call(s.querySelectorAll('.mb-grid > a.mb[data-id]'), function (a) {
        out.push(a.getAttribute('data-id'));
      });
    });
    return out;
  }
  function cardInfo(card) {
    var c = card.querySelector('.mb-c');
    var n = card.querySelector('.mb-n');
    var img = card.querySelector('img');
    return {
      id: card.getAttribute('data-id'),
      nombre: n ? n.textContent.trim() : '',
      categoria: c ? c.textContent.trim() : '',
      img: (img && (img.currentSrc || img.getAttribute('src'))) || '',
      linea: card.getAttribute('data-linea') || ''
    };
  }
  function waText(p) {
    return 'Hola, vi ' + p.nombre + ' (' + p.categoria + ', Colección Verano 2026) en ' +
      'faro33studio.com/muebles/#pieza=' + p.id + ' y quiero algo así.';
  }
  function setWa(p) {
    waBtn.href = 'https://wa.me/526675402559?text=' + encodeURIComponent(waText(p));
    var nom = p.nombre || '';
    waBtn.setAttribute('data-wa-label', 'Muebles: ' + nom);
    waBtn.setAttribute('data-wa-ids', p.id || '');
    waBtn.setAttribute('data-wa-cat', lineName(p.linea));
    waBtn.setAttribute('data-wa-name', nom);
  }
  function updatePos() {
    var ids = orderIds();
    var i = ids.indexOf(state.open);
    posEl.textContent = i > -1 ? (i + 1) + ' / ' + ids.length : '';
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, msg.length > 42 ? 6000 : 2400);
  }
  function lock(on) {
    bgEls.forEach(function (el) {
      if (!el) return;
      if (on) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
    if (on) {
      prevBodyStyle = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight };
      var sw = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = sw > 0 ? sw + 'px' : '';
    } else if (prevBodyStyle) {
      document.body.style.overflow = prevBodyStyle.overflow;
      document.body.style.paddingRight = prevBodyStyle.paddingRight;
      prevBodyStyle = null;
    }
  }
  function syncCookie() {
    var c = document.querySelector('.f33c');
    var visible = !!(c && c.classList.contains('on') && c.offsetHeight);
    var h = visible ? Math.ceil(c.getBoundingClientRect().height) : 0;
    document.body.style.setProperty('--mb-cookie-h', h + 'px');
    sheet.classList.toggle('mb-cookie-on', visible && state.open !== null);
  }
  var cookieTimer;
  function queueCookie() {
    clearTimeout(cookieTimer);
    cookieTimer = setTimeout(syncCookie, 0);
  }
  try {
    new MutationObserver(queueCookie).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class']
    });
  } catch (e) {}

  function ensureData() {
    if (dataPromise) return dataPromise;
    dataPromise = fetch('/muebles/data/verano-2026.json', { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (list) {
      var map = {};
      for (var i = 0; i < list.length; i++) map[list[i].id] = list[i];
      dataById = map;
      return map;
    });
    return dataPromise;
  }

  function shell(p) {
    phEl.className = 'mb-sheet-ph' + (p.linea === 'decoracion' || p.linea === 'Decoración' ? ' mb-sheet-ph--deco' : '');
    if (p.img) mainImg.src = p.img;
    mainImg.alt = p.nombre;
    catEl.textContent = p.categoria;
    titleEl.textContent = p.nombre;
    detailEl.innerHTML = '';
    detailEl.className = 'mb-sheet-detail';
    detailEl.setAttribute('aria-busy', 'true');
    bodyEl.scrollTop = 0;
    setWa(p);
  }

  function norm(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function detailHtml(p) {
    var mat = p.materiales || [];
    var meds = (p.variantes && p.variantes.length) ? p.variantes : (p.medidas ? [p.medidas] : []);
    var colors = p.colores || [];
    var vars = p.variantes_acabado || [];
    var inc = p.incluye || [];
    var h = '';
    /* Si hay bloque «Colores», la fila «Color» de materiales lo duplica (y se
       contradice al cambiar de acabado): solo se conserva cuando no hay colores. */
    var matRows = colors.length ? mat.filter(function (x) {
      return norm(x.k) !== 'color';
    }) : mat;
    if (matRows.length) {
      h += '<dl class="mb-sheet-dl">' + matRows.map(function (x) {
        return '<dt>' + esc(x.k) + '</dt><dd>' + esc(x.v) + '</dd>';
      }).join('') + '</dl>';
    }
    if (meds.length) {
      h += '<section class="mb-sheet-block"><h3>Medidas</h3>' + meds.map(function (m) {
        return '<p class="mb-sheet-med">' + esc(m) + '</p>';
      }).join('') + '</section>';
    }
    if (!mat.length && !meds.length) {
      h += '<p class="mb-sheet-nomed">Medidas y acabados a tu medida: pregúntanos.</p>';
    }
    if (colors.length) {
      h += '<section class="mb-sheet-block"><h3>Colores</h3>' +
        '<p class="mb-sheet-colors" id="mb-colors">' + esc(colors.join(' / ')) + '</p></section>';
    }
    if (vars.length) {
      h += '<section class="mb-sheet-block"><h3>Otros acabados</h3>' +
        '<div class="mb-sheet-sw" role="group" aria-label="Otros acabados">' +
        '<button type="button" class="mb-sheet-sw-b" aria-pressed="true" data-img="' + esc(p.img) +
        '" data-color="' + esc(colors.join(' / ')) + '" aria-label="Acabado base"><img src="' +
        esc(p.thumb || p.img) + '" alt="" loading="lazy" decoding="async"></button>' +
        vars.map(function (v) {
          return '<button type="button" class="mb-sheet-sw-b" aria-pressed="false" data-img="' +
            esc(v.img) + '" data-color="' + esc(v.color || '') + '" aria-label="' +
            esc(v.color || v.id) + '"><img src="' + esc(v.thumb || v.img) +
            '" alt="" loading="lazy" decoding="async"></button>';
        }).join('') + '</div></section>';
    }
    if (inc.length) {
      h += '<section class="mb-sheet-block"><h3>Este set incluye</h3><div class="mb-sheet-inc">' +
        inc.map(function (i) {
          return '<a href="#pieza=' + esc(i.id) + '">' + esc(i.nombre) + '</a>';
        }).join('') + '</div></section>';
    }
    /* Segunda imagen de ambiente: el JSON de detalle aún no trae un campo propio
       (ni marca de recorte); si algún día llega, se pinta con su pie. */
    if (p.ambiente && p.ambiente_img) {
      h += '<figure class="mb-sheet-amb"><img src="' + esc(p.ambiente_img) +
        '" alt="' + esc(p.nombre) + ' en ambiente" loading="lazy" decoding="async">' +
        '<figcaption>Imagen ilustrativa</figcaption></figure>';
    }
    return h;
  }

  function renderDetail(p) {
    mainImg.src = p.img;
    mainImg.alt = p.nombre;
    phEl.className = 'mb-sheet-ph' + (p.linea === 'Decoración' ? ' mb-sheet-ph--deco' : '');
    titleEl.textContent = p.nombre;
    catEl.textContent = p.categoria;
    detailEl.innerHTML = detailHtml(p);
    detailEl.setAttribute('aria-busy', 'false');
    void detailEl.offsetWidth;
    detailEl.classList.add('is-in');
    setWa(p);
    updatePos();
  }
  function renderError() {
    detailEl.innerHTML = '<p class="mb-sheet-error">No pudimos cargar los detalles. Pregúntanos por WhatsApp.</p>';
    detailEl.setAttribute('aria-busy', 'false');
    detailEl.classList.add('is-in');
  }

  function show() {
    clearTimeout(hideTimer);
    sheet.hidden = false;
    veil.hidden = false;
    sheet.removeAttribute('aria-hidden');
    void sheet.offsetWidth;
    requestAnimationFrame(function () {
      if (state.open === null) return;
      sheet.classList.add('on');
      veil.classList.add('on');
    });
    document.body.classList.add('mb-ficha-abierta');
    lock(true);
    syncCookie();
  }
  function hide() {
    sheet.classList.remove('on');
    veil.classList.remove('on');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mb-ficha-abierta');
    lock(false);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (state.open === null) {
        sheet.hidden = true;
        veil.hidden = true;
        sheet.classList.remove('mb-cookie-on');
      }
    }, DUR + 40);
  }
  function pushHash(id) {
    var h = '#pieza=' + id;
    if (location.hash === h) return;
    try { history.pushState(null, '', location.pathname + location.search + h); } catch (e) {}
  }
  function replaceHash(id) {
    try { history.replaceState(null, '', location.pathname + location.search + '#pieza=' + id); } catch (e) {}
  }
  function clearHash() {
    if (!location.hash) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  function focusClose() {
    try { closeBtn.focus({ preventScroll: true, focusVisible: true }); } catch (e) { closeBtn.focus(); }
  }

  function open(id, opts) {
    opts = opts || {};
    var card = cardFor(id);
    if (!card) return;
    if (state.open === id && !sheet.hidden) {
      if (opts.replace) replaceHash(id);
      if (opts.focusClose) focusClose();
      return;
    }
    if (state.slug !== 'todas' && orderIds().indexOf(id) < 0) {
      apply('todas', { scroll: false, url: true, fade: false, chipSmooth: false });
    }
    if (opts.scroll) {
      try { card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); }
      catch (e) { card.scrollIntoView(); }
    }
    var wasOpen = state.open !== null;
    state.open = id;
    backCard = opts.origin || card;
    var info = cardInfo(card);
    var d = dataById && dataById[id];
    shell(d || info);
    /* Una sola vez por apertura; el early-return de arriba evita repetir la misma. */
    trackView(d || info);
    if (d) {
      renderDetail(d);
    } else {
      ensureData().then(function (map) {
        if (state.open !== id) return;
        if (map[id]) renderDetail(map[id]);
        else renderError();
      }, function () {
        if (state.open !== id) return;
        renderError();
      });
    }
    updatePos();
    if (wasOpen) syncCookie();
    else show();
    if (opts.push) pushHash(id);
    else if (opts.replace) replaceHash(id);
    if (opts.focusClose !== false) focusClose();
  }

  function close(fromHistory) {
    if (state.open === null) return;
    var back = backCard || cardFor(state.open);
    state.open = null;
    hide();
    if (!fromHistory) clearHash();
    if (back && back.focus) {
      try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); }
    }
  }

  function step(dir) {
    if (state.open === null) return;
    var ids = orderIds();
    var i = ids.indexOf(state.open);
    if (i < 0) return;
    var j = i + dir;
    if (j < 0 || j >= ids.length) return;
    open(ids[j], { scroll: false, replace: true, focusClose: false });
  }

  function fromHash() {
    var m = /^#pieza=(.+)$/.exec(location.hash);
    if (!m) {
      if (state.open !== null) close(true);
      return;
    }
    var id = m[1];
    try { id = decodeURIComponent(id); } catch (e) {}
    if (!cardFor(id)) {
      if (state.open !== null) close(true);
      clearHash();
      return;
    }
    open(id, { scroll: state.open === null, push: false, replace: false, focusClose: state.open !== id });
  }

  function trap(e) {
    var f = [].slice.call(sheet.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return el.getClientRects().length > 0; });
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!sheet.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
  }

  document.addEventListener('click', function (e) {
    var card = e.target.closest ? e.target.closest('a.mb[data-id]') : null;
    if (card) { e.preventDefault(); open(card.getAttribute('data-id'), { push: true, origin: card }); }
  });
  if (veil) veil.addEventListener('click', function () { close(false); });
  closeBtn.addEventListener('click', function () { close(false); });
  prevBtn.addEventListener('click', function () { step(-1); });
  nextBtn.addEventListener('click', function () { step(1); });
  copyBtn.addEventListener('click', function () {
    if (!state.open) return;
    var url = 'https://faro33studio.com/muebles/#pieza=' + state.open;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          toast('Enlace copiado');
        }, function () {
          toast(url);
        });
      } else {
        toast(url);
      }
    } catch (e) {
      toast(url);
    }
  });
  detailEl.addEventListener('click', function (e) {
    var sw = e.target.closest ? e.target.closest('.mb-sheet-sw-b') : null;
    if (sw) {
      [].forEach.call(detailEl.querySelectorAll('.mb-sheet-sw-b'), function (b) {
        b.setAttribute('aria-pressed', b === sw ? 'true' : 'false');
      });
      var im = sw.getAttribute('data-img');
      if (im) mainImg.src = im;
      var col = sw.getAttribute('data-color');
      var colEl = document.getElementById('mb-colors');
      if (colEl && col !== null) colEl.textContent = col;
      return;
    }
    var inc = e.target.closest ? e.target.closest('a[href^="#pieza="]') : null;
    if (inc) {
      e.preventDefault();
      var id = inc.getAttribute('href').replace(/^#pieza=/, '');
      open(id, { replace: true, focusClose: true });
    }
  });
  document.addEventListener('keydown', function (e) {
    if (state.open === null) return;
    if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); close(false); return; }
    if (e.key === 'ArrowLeft' || e.keyCode === 37) { e.preventDefault(); step(-1); return; }
    if (e.key === 'ArrowRight' || e.keyCode === 39) { e.preventDefault(); step(1); return; }
    if (e.key === 'Tab' || e.keyCode === 9) trap(e);
  });
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('resize', syncCookie);

  fromHash();
})();

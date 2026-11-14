/* Faro 33 — /muebles/ · M2: filtro por línea, contador y ?linea=. Sin dependencias. */
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
  function apply(slug, opts) {
    opts = opts || {};
    var chip = chipFor(slug);
    if (!chip) { slug = 'todas'; chip = chipFor('todas'); }
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
      apply(chip.getAttribute('data-slug'), { scroll: true });
    });
  });
  bar.addEventListener('scroll', updateMask, false);
  window.addEventListener('resize', updateMask);

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
    var s = readLinea();
    apply(s === null ? 'todas' : s, { scroll: false, url: true, chipSmooth: false });
  });
})();

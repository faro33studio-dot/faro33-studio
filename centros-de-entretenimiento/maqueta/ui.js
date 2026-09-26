/* Faro 33 — Maqueta 3D: overlay HTML (capítulos, barra, subtítulo, botones, teclado). */

function track(name, params) {
  if (typeof gtag === 'function') { try { gtag('event', name, params || {}); } catch (e) { /* sin analítica */ } }
}

export function createUI(stage, tl, { onUserNav } = {}) {
  const $ = (s) => stage.querySelector(s);
  const chWrap = $('#chapters'), bar = $('#bar'), fill = $('#bar-fill'), head = $('#bar-head');
  const caption = $('#caption'), playBtn = $('#btn-play'), nextBtn = $('#btn-next');
  const glassBtns = [playBtn, nextBtn];

  tl.chapters.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ch';
    b.innerHTML = `<span class="n">0${i + 1}</span><span class="t">${c.name}</span>`;
    b.addEventListener('click', () => {
      onUserNav && onUserNav();
      tl.goChapter(i);
      track('maqueta_capitulo', { event_label: c.name });
    });
    chWrap.appendChild(b);
  });
  const chBtns = [...chWrap.children];

  playBtn.addEventListener('click', () => {
    onUserNav && onUserNav();
    tl.toggle();
    if (tl.playing) track('maqueta_play');
    update();
  });
  nextBtn.addEventListener('click', () => { onUserNav && onUserNav(); tl.next(); });

  // arrastrar la barra
  let dragging = false;
  const seekFromEvent = (e) => {
    const r = bar.getBoundingClientRect();
    tl.seek(tl.timeAtProgress((e.clientX - r.left) / r.width));
  };
  bar.addEventListener('pointerdown', (e) => {
    onUserNav && onUserNav();
    dragging = true; bar.setPointerCapture(e.pointerId); seekFromEvent(e);
  });
  bar.addEventListener('pointermove', (e) => { if (dragging) seekFromEvent(e); });
  bar.addEventListener('pointerup', () => { dragging = false; });
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); onUserNav && onUserNav(); tl.next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); onUserNav && onUserNav(); tl.prev(); }
  });

  // teclado global (sin robar teclas a campos o al menú abierto)
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.documentElement.classList.contains('f33m-open')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === ' ' && !e.target.closest('button, a')) { e.preventDefault(); onUserNav && onUserNav(); tl.toggle(); update(); }
    else if (k === 'ArrowRight' && e.target === document.body) { onUserNav && onUserNav(); tl.next(); }
    else if (k === 'ArrowLeft' && e.target === document.body) { onUserNav && onUserNav(); tl.prev(); }
    else if (/^[1-4]$/.test(k)) { onUserNav && onUserNav(); tl.goChapter(Number(k) - 1); }
  });

  let lastStep = -1, lastNight = null;
  function update(v) {
    v = v || tl.values();
    const p = tl.progress();
    fill.style.width = (p * 100).toFixed(2) + '%';
    head.style.left = (p * 100).toFixed(2) + '%';
    bar.setAttribute('aria-valuenow', Math.round(p * 100));

    const i = tl.stepIndex(), ch = tl.bounds[i].ch;
    chBtns.forEach((b, j) => b.classList.toggle('on', j === ch));
    if (i !== lastStep) {
      lastStep = i;
      caption.textContent = tl.bounds[i].text;
      caption.classList.remove('in'); void caption.offsetWidth; caption.classList.add('in');
      bar.setAttribute('aria-valuetext', `${tl.chapters[ch].name}: ${tl.bounds[i].text}`);
    }

    const night = v.noche > 0.5;
    if (night !== lastNight) {
      lastNight = night;
      stage.classList.toggle('is-night', night);
      glassBtns.forEach((b) => b.classList.toggle('lg-light', !night));
    }

    const playing = tl.playing;
    playBtn.querySelector('.ic').textContent = playing ? '❚❚' : '▶';
    playBtn.querySelector('.tx').textContent = playing ? 'Pausa' : 'Reproducir';
    playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }

  return { update, topEl: $('#ov-top'), bottomEl: $('#ov-bottom') };
}

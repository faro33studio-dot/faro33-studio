/* Faro 33 — Maqueta 3D: página completa (línea de tiempo, UI, vistas, loop bajo demanda). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DESIGN, roomFor, wallLayout } from './scene.js';
import { createViewer, AZ, EL } from './viewer.js';
import { createTimeline, STEPS, INITIAL, buildSteps, initialFor } from './timeline.js';
import { createUI } from './ui.js';
import { VIEW_STATES, VIEW_NOTES, setClay, createLabels, createCotas } from './views.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('maqueta');
const EASE = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

function track(name, params) {
  if (typeof gtag === 'function') { try { gtag('event', name, params || {}); } catch (e) { /* sin analítica */ } }
}

/* ¿Viene un diseño del configurador en la URL (#d=…)? Si no, el modelo de muestra. */
const custom = window.F33Diseno ? window.F33Diseno.fromHash(location.hash) : null;
const design = custom || DESIGN;
window.addEventListener('hashchange', () => location.reload());

/* Textos, enlaces y WhatsApp para "tu diseño". Solo números saneados y nombres de listas cerradas. */
function applyDesignCopy(d) {
  const N = window.F33Diseno, code = N.encode(d), room = roomFor(d), L = wallLayout(d, room);
  const cm = (m) => Math.round(m * 100);
  const editUrl = `/centros-de-entretenimiento/configurador/#d=${code}`;
  document.body.classList.add('is-custom');
  document.title = 'Tu centro de entretenimiento en 3D — Faro 33';
  stage.setAttribute('aria-label', 'Maqueta 3D de tu centro de entretenimiento');

  document.querySelector('.ttl .meta').textContent = `Tu diseño · muro ${d.w} × ${d.h} cm`;
  const h1 = document.querySelector('.ttl h1');
  h1.textContent = 'Tu centro de ';
  const em = document.createElement('em');
  em.textContent = 'entretenimiento';
  h1.appendChild(em);
  document.getElementById('lnk-edit').href = editUrl;

  const both = L.hasLeft && L.hasRight;
  const towers = L.sides
    ? `${both ? '2 torres' : '1 torre'} de ${cm(L.tw)}×${cm(L.th)} cm ${L.mount === 'sobre' ? 'sobre el mueble' : 'al lado del mueble'}${d.towersLit ? (both ? ', iluminadas' : ', iluminada') : ''}`
    : 'sin torres';
  const tvPanel = L.panel ? `, panel flotante detrás de la TV${d.tvPanelLit ? ' con luz' : ''}` : '';
  const finishes = d.panels.length ? ` Acabados atrás: ${N.describePanels(d.panels)}.` : '';
  const msg = `Hola Faro 33 — armé mi centro de entretenimiento en el configurador y lo vi en 3D: muro de ${d.w}×${d.h} cm, ` +
    `consola de ${cm(L.cl)}×${cm(L.ch)} cm con ${d.cols} compartimentos${tvPanel}, ${towers}.${finishes} Acabado del mueble: ${N.FINISH_NAMES[d.finish]}. ` +
    `Míralo aquí: https://faro33studio.com/centros-de-entretenimiento/maqueta/#d=${code} ¿Podemos platicar sobre cotización?`;
  document.querySelectorAll('.cta-wa, .btn-wa').forEach((a) => { a.href = 'https://wa.me/526675402559?text=' + encodeURIComponent(msg); });

  const ghost = document.querySelector('.cfg-cta .btn-ghost');
  ghost.href = editUrl;
  ghost.textContent = 'Editar mi diseño →';
  const sum = document.querySelector('.cfg-cta .summary');
  sum.textContent = '';
  const b = document.createElement('b');
  b.textContent = '¿Lo cotizamos?';
  sum.append(b, 'Mándanos tu diseño por WhatsApp: el enlace 3D va incluido en el mensaje.');

  document.getElementById('design-note').textContent =
    `Así se vería tu diseño en una sala de ${room.W.toFixed(1)} × ${room.D.toFixed(1)} m. El muro, la consola, la TV y las torres tienen las medidas y acabados que elegiste; ` +
    'la sala, los muebles sueltos y los momentos animados son ilustrativos.';
}
if (custom) applyDesignCopy(custom);

function start() {
  const low = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const viewer = createViewer(canvas, design, { low });
  if (!viewer) { stage.classList.add('no-webgl'); return; }
  const { scene, decor, apply, labels, layout, room, renderer, camera, target, composer, setAngles, getAngles } = viewer;
  const PLAN_EL = THREE.MathUtils.degToRad(89.5);

  let controls = null;
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.35;
    controls.minAzimuthAngle = AZ - 0.28; controls.maxAzimuthAngle = AZ + 0.28;
    const polar = Math.PI / 2 - EL;
    controls.minPolarAngle = polar - 0.14; controls.maxPolarAngle = polar + 0.1;
    controls.update();
  }

  /* ---------- estado: la línea de tiempo manda en "General"; las otras vistas fijan su propio estado ---------- */
  let dirty = true, view = 'general', current = null;
  function applyValues(v) {
    current = v;
    apply(v);
    ui.update(v);
    dirty = true;
  }
  const tl = createTimeline({
    steps: custom ? buildSteps(custom) : STEPS,
    initial: custom ? initialFor(custom) : INITIAL,
    onChange(v) { if (view === 'general' && !valueTween) applyValues(v); } });

  let userTookControl = false;
  const ui = createUI(stage, tl, {
    onUserNav: () => {
      userTookControl = true;
      if (view !== 'general') setView('general');
    }
  });
  applyValues(tl.values());

  /* ---------- encuadre: la maqueta completa en el área libre entre el título y los controles ---------- */
  let W = 1, H = 1;
  function fitFrustum() {
    const sr = stage.getBoundingClientRect();
    const wide = W > 900;
    let top = ui.topEl.getBoundingClientRect().bottom - sr.top + 8;
    if (wide) top = Math.min(top, H * 0.12);
    const bottom = sr.bottom - ui.bottomEl.getBoundingClientRect().top + 8;
    const side = wide ? W * 0.06 : 12;
    viewer.fit(W, H, { top, bottom, left: side, right: side }, view === 'planta' ? 1.18 : 1.02);
    dirty = true;
  }
  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    viewer.resize(W, H);
    fitFrustum();
  }
  resize();
  new ResizeObserver(resize).observe(stage);

  /* ---------- vistas: General · Carpintería · Planta ---------- */
  const lbls = createLabels(document.getElementById('labels'), labels);
  const cotas = createCotas(document.getElementById('cotas'), layout, room);
  const tabs = [...stage.querySelectorAll('.tabs [data-view]')];
  const note = document.getElementById('view-note');
  let camTween = null, valueTween = null;

  function setView(name, instant = false) {
    if (name === view) return;
    view = name;
    stage.dataset.view = name;
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.view === name ? 'true' : 'false'));
    track('maqueta_vista', { event_label: name });
    if (name !== 'general') { userTookControl = true; tl.pause(); note.textContent = VIEW_NOTES[name]; }
    stage.classList.remove('show-labels', 'show-cotas');
    setClay(decor, name === 'carpinteria');

    const from = { ...current }, to = name === 'general' ? tl.values() : VIEW_STATES[name];
    valueTween = { t: 0, dur: reduce || instant ? 0.001 : 1.1, from, to };
    const [az0, el0] = getAngles();
    const el1 = name === 'planta' ? PLAN_EL : EL, az1 = name === 'planta' ? 0 : AZ;
    camTween = { t: 0, dur: reduce || instant ? 0.001 : 1.3, az0, el0, az1, el1 };
    ui.update();
  }
  tabs.forEach((t) => t.addEventListener('click', () => { userTookControl = true; setView(t.dataset.view); }));
  document.getElementById('btn-back').addEventListener('click', () => {
    setView('general');
    tl.play(); ui.update();
  });

  function stepTweens(dt) {
    let active = false;
    if (valueTween) {
      valueTween.t = Math.min(1, valueTween.t + dt / valueTween.dur);
      const u = EASE(valueTween.t), v = {};
      for (const k in valueTween.to) v[k] = valueTween.from[k] + (valueTween.to[k] - valueTween.from[k]) * u;
      applyValues(v);
      if (valueTween.t >= 1) valueTween = null;
      active = true;
    }
    if (camTween) {
      camTween.t = Math.min(1, camTween.t + dt / camTween.dur);
      const u = EASE(camTween.t);
      setAngles(camTween.az0 + (camTween.az1 - camTween.az0) * u, camTween.el0 + (camTween.el1 - camTween.el0) * u);
      fitFrustum();
      if (camTween.t >= 1) {
        camTween = null;
        if (view === 'carpinteria') stage.classList.add('show-labels');
        if (view === 'planta') stage.classList.add('show-cotas');
        if (controls && view === 'general') controls.update();
      }
      active = true;
    }
    return active;
  }

  /* ---------- autoplay en bucle mientras la maqueta está a la vista y el usuario no tomó el control ---------- */
  let visible = true;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (userTookControl || reduce) return;
    if (visible && !tl.busy) tl.play();
    if (!visible && tl.playing) tl.pause();
    ui.update();
  }, { threshold: 0.25 }).observe(stage);

  const timer = new THREE.Timer();
  timer.connect(document);
  let first = true;
  function frame(ts) {
    requestAnimationFrame(frame);
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 1 / 20);
    const tweening = stepTweens(dt);
    const moved = view === 'general' ? tl.tick(dt) : false;
    const orbited = controls && view === 'general' && !camTween ? controls.update() : false;
    if (tweening || moved || orbited || dirty) {
      composer.render();
      dirty = false;
      if (view === 'carpinteria') lbls.update(camera, W, H);
      if (view === 'planta') cotas.update(camera, W, H);
      if (first) {
        first = false;
        stage.classList.add('ready');
        if (!reduce) setTimeout(() => { if (!userTookControl && visible) { tl.play(); ui.update(); } }, 900);
      }
    }
  }
  requestAnimationFrame(frame);

  const qs = new URLSearchParams(location.search);
  if (qs.has('debug')) {
    window.__maqueta = { tl, camera, scene, renderer, apply, setView };
    if (qs.has('paso')) { userTookControl = true; tl.seek(tl.bounds[Number(qs.get('paso'))].end); }
    if (qs.has('vista')) { userTookControl = true; setView(qs.get('vista'), true); }
  }
}

start();

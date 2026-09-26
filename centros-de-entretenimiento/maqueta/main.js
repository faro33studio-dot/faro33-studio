/* Faro 33 — Maqueta 3D: arranque (renderer, cámara isométrica, post-proceso, vistas, loop bajo demanda). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildScene, DESIGN, roomFor, wallLayout } from './scene.js';
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

  const towers = L.hasLeft || L.hasRight
    ? `${L.hasLeft && L.hasRight ? '2 torres' : '1 torre'} de ${cm(L.tw)}×${cm(L.th)} cm${d.towerStart === 'consola' ? ' sobre la consola' : ''}${d.towersLit ? (L.hasLeft && L.hasRight ? ', iluminadas' : ', iluminada') : ''}`
    : 'sin torres';
  const msg = `Hola Faro 33 — armé mi centro de entretenimiento en el configurador y lo vi en 3D: muro de ${d.w}×${d.h} cm (${N.WALL_NAMES[d.wallFinish]}), ` +
    `consola de ${cm(L.cl)}×${cm(L.ch)} cm con ${d.cols} compartimentos, ${towers}, acabado ${N.FINISH_NAMES[d.finish]}. ` +
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
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { stage.classList.add('no-webgl'); return; }
  if (!renderer.getContext()) { stage.classList.add('no-webgl'); return; }

  const low = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;

  const { scene, decor, apply, bounds, labels, layout, room } = buildScene(design);
  scene.traverse((o) => { if (o.isDirectionalLight) o.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048); });

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  /* ---------- cámara ortográfica isométrica (como el video) ---------- */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const target = new THREE.Vector3(room.W / 2, 0.9, room.D / 2);
  const AZ = THREE.MathUtils.degToRad(32), EL = THREE.MathUtils.degToRad(30), R = 20;
  const PLAN_EL = THREE.MathUtils.degToRad(89.5);
  function setAngles(az, el) {
    camera.position.set(
      target.x + Math.sin(az) * Math.cos(el) * R,
      target.y + Math.sin(el) * R,
      target.z + Math.cos(az) * Math.cos(el) * R
    );
    camera.lookAt(target);
  }
  function getAngles() {
    const o = camera.position.clone().sub(target);
    return [Math.atan2(o.x, o.z), Math.asin(o.y / o.length())];
  }
  setAngles(AZ, EL);

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

  /* ---------- post-proceso: render → oclusión ambiental → bloom → tone mapping / sRGB ---------- */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: low ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (!low) {
    const gtao = new GTAOPass(scene, camera, 512, 512);
    gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.05, 0.35, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- estado: la línea de tiempo manda en "General"; las otras vistas fijan su propio estado ---------- */
  let dirty = true, view = 'general', current = null;
  function applyValues(v) {
    current = v;
    apply(v);
    bloom.strength = 0.03 + 0.4 * v.noche;
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
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  let W = 1, H = 1;
  function fitFrustum() {
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse, v = new THREE.Vector3();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      v.copy(c).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const sr = stage.getBoundingClientRect();
    const wide = W > 900;
    let topIn = ui.topEl.getBoundingClientRect().bottom - sr.top + 8;
    if (wide) topIn = Math.min(topIn, H * 0.12);
    const botIn = sr.bottom - ui.bottomEl.getBoundingClientRect().top + 8;
    const padX = wide ? W * 0.06 : 12;
    const aw = W - 2 * padX, ah = Math.max(120, H - topIn - botIn);
    const s = Math.max((maxX - minX) / aw, (maxY - minY) / ah) * (view === 'planta' ? 1.18 : 1.02);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const ax = padX + aw / 2, ay = topIn + ah / 2;
    camera.left = cx - ax * s; camera.right = camera.left + W * s;
    camera.top = cy + ay * s; camera.bottom = camera.top - H * s;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
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

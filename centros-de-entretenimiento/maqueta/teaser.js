/* Faro 33 — Teaser de la maqueta para la portada (diapositiva 02 del carrusel "Especialidades").
   Guion: la cámara gira hasta la vista isométrica → se ilumina el mueble de TV → la luz se apaga en fade.
   La portada lo dispara con postMessage({type:'f33-teaser', action:'play'|'stop'}) al mostrar/ocultar la diapositiva. */
import * as THREE from 'three';
import { DESIGN } from './scene.js';
import { INITIAL } from './timeline.js';
import { createViewer, AZ, EL } from './viewer.js';

const T_INTRO = 2.6;               // giro de cámara
const T_ON = 3.0, D_ON = 1.2;      // se ilumina el mueble
const T_OFF = 6.2, D_OFF = 2.0;    // la luz se apaga en fade
const T_END = T_OFF + D_OFF;

const DAY = { ...INITIAL, luzDia: 1, noche: 0, led: 0 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/* La sala baja un poco su luz mientras el LED está encendido, para que el brillo se lea. */
function stateAt(t) {
  const k = ease(clamp01((t - T_ON) / D_ON)) * (1 - ease(clamp01((t - T_OFF) / D_OFF)));
  return { ...DAY, led: k, luzDia: 1 - 0.7 * k, noche: 0.32 * k };
}
function anglesAt(t) {
  const u = 1 - ease(clamp01(t / T_INTRO));
  return [AZ + 0.85 * u, EL + 0.32 * u];
}

function tell(status) {
  if (window.parent !== window) window.parent.postMessage({ type: 'f33-teaser', status }, location.origin);
}

function start() {
  const canvas = document.getElementById('c');
  const low = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const viewer = createViewer(canvas, DESIGN, { low });
  if (!viewer) { document.documentElement.classList.add('no-webgl'); tell('no-webgl'); return; }

  let W = 1, H = 1, t = reduce ? T_END : 0, playing = false, dirty = true;

  /* Área libre: a la derecha del texto de la diapositiva (escritorio) o arriba de él (celular). */
  function insets() {
    if (W > 700) return { top: 64, bottom: 40, left: Math.min(W * 0.42, 640), right: 84 };
    return { top: Math.min(128, H * 0.12) + 26, bottom: H * 0.47, left: 14, right: 14 };
  }
  function pose() {
    viewer.apply(stateAt(t));
    const [az, el] = anglesAt(t);
    viewer.setAngles(az, el);
    viewer.fit(W, H, insets());
  }
  function resize() {
    W = document.documentElement.clientWidth; H = document.documentElement.clientHeight;
    viewer.resize(W, H);
    dirty = true;
  }
  resize();
  new ResizeObserver(resize).observe(document.documentElement);

  function play() { t = reduce ? T_END : 0; playing = !reduce; dirty = true; }
  function stop() { playing = false; }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'f33-teaser') return;
    if (e.data.action === 'play') play();
    else if (e.data.action === 'stop') stop();
  });

  const qs = new URLSearchParams(location.search);
  if (qs.has('t')) t = Math.max(0, Math.min(T_END, Number(qs.get('t')) || 0));
  else if (window.parent === window) play();            // abierto solo: se reproduce una vez

  const timer = new THREE.Timer();
  timer.connect(document);
  let first = true;
  function frame(ts) {
    requestAnimationFrame(frame);
    timer.update(ts);
    if (playing) {
      t += Math.min(timer.getDelta(), 1 / 20);
      if (t >= T_END) { t = T_END; playing = false; }
      dirty = true;
    }
    if (!dirty) return;
    pose();
    viewer.render();
    dirty = false;
    if (first) { first = false; document.documentElement.classList.add('ready'); tell('ready'); }
  }
  requestAnimationFrame(frame);
}

start();

/* Faro 33 — Maqueta 3D: línea de tiempo.
   La escena es función pura del tiempo T: cada canal (0..1) se interpola por tramos
   compilados desde los pasos. Eso permite reproducir, avanzar, retroceder y arrastrar. */

export const CHAPTERS = ['Día', 'Cine', 'Reunión', 'Noche'];

/* Estado de reposo = final del bucle (noche). El primer paso trae la mañana. */
export const INITIAL = {
  luzDia: 0, noche: 1, calidez: 0, lampara: 0, mesa: 0, cortinas: 0,
  paneles: 0, tv: 0, consolas: 0, led: 0.35, bar: 0, barLuz: 0, pufs: 0
};

export const STEPS = [
  { ch: 0, text: 'Entra la luz de la mañana', dur: 1.6, to: { luzDia: 1, noche: 0, led: 0 } },
  { ch: 0, text: 'La mesa de centro sube para trabajar', dur: 1.2, to: { mesa: 0.6 } },
  { ch: 0, text: 'La lámpara de lectura gira sobre el sofá', dur: 1.2, to: { lampara: 1 } },

  { ch: 1, text: 'La mesa baja y la lámpara regresa', dur: 1.2, to: { mesa: 0, lampara: 0 } },
  { ch: 1, text: 'Las cortinas se cierran', dur: 1.4, to: { cortinas: 1 } },
  { ch: 1, text: 'La luz se atenúa', dur: 1.3, to: { luzDia: 0.12, noche: 0.55 } },
  { ch: 1, text: 'Los listones se deslizan y revelan la TV', dur: 1.5, to: { paneles: 1 } },
  { ch: 1, text: 'La pantalla se enciende', dur: 0.9, to: { tv: 1 } },
  { ch: 1, text: 'La puerta abatible revela las consolas', dur: 1.0, to: { consolas: 1 } },
  { ch: 1, text: 'Las torres se encienden', dur: 1.0, to: { led: 1 } },

  { ch: 2, text: 'Se abre el bar de la torre', dur: 1.3, to: { consolas: 0, bar: 1, barLuz: 1 } },
  { ch: 2, text: 'Los pufs salen de la mesa', dur: 1.2, to: { pufs: 1 } },
  { ch: 2, text: 'La mesa sube a altura de servicio', dur: 1.2, to: { mesa: 1 } },
  { ch: 2, text: 'Luz cálida en la sala', dur: 1.1, to: { calidez: 1 } },

  { ch: 3, text: 'El bar se cierra', dur: 1.1, to: { bar: 0, barLuz: 0 } },
  { ch: 3, text: 'Los pufs regresan y la mesa baja', dur: 1.3, to: { pufs: 0, mesa: 0 } },
  { ch: 3, text: 'Los listones ocultan la TV', dur: 1.4, to: { tv: 0, paneles: 0 } },
  { ch: 3, text: 'Las cortinas se abren a la noche', dur: 1.4, to: { cortinas: 0, luzDia: 0, noche: 1, calidez: 0.25 } },
  { ch: 3, text: 'Sólo queda la tira LED', dur: 1.2, to: { led: 0.35, calidez: 0 } }
];

/* Guion para un diseño del configurador: solo narra lo que ese diseño tiene
   (sin listones ni bar; puertas/cajones y torres LED solo si existen). */
export function buildSteps(d) {
  const doorTypes = d.doors.slice(0, d.cols);
  const hinged = doorTypes.some((x) => x === 1 || x === 2), drawers = doorTypes.includes(3);
  const lit = d.towersLit && d.towerCount > 0;
  const doorsText = hinged && drawers ? 'Se abren puertas y cajones' : drawers ? 'Se abren los cajones' : 'Se abren las puertas de la consola';
  const s = [
    { ch: 0, text: 'Entra la luz de la mañana', dur: 1.6, to: { luzDia: 1, noche: 0, led: 0 } },
    { ch: 0, text: 'La mesa de centro sube para trabajar', dur: 1.2, to: { mesa: 0.6 } },
    { ch: 0, text: 'La lámpara de lectura gira sobre el sofá', dur: 1.2, to: { lampara: 1 } },
    { ch: 1, text: 'La mesa baja y la lámpara regresa', dur: 1.2, to: { mesa: 0, lampara: 0 } },
    { ch: 1, text: 'Las cortinas se cierran', dur: 1.4, to: { cortinas: 1 } },
    { ch: 1, text: 'La luz se atenúa', dur: 1.3, to: { luzDia: 0.12, noche: 0.55 } }
  ];
  if (d.tvOn) s.push({ ch: 1, text: 'La pantalla se enciende', dur: 0.9, to: { tv: 1 } });
  if (hinged || drawers) s.push({ ch: 1, text: doorsText, dur: 1.4, to: { consolas: 1 } });
  if (lit) s.push({ ch: 1, text: 'Las torres se encienden', dur: 1.0, to: { led: 1 } });
  s.push(
    { ch: 2, text: hinged || drawers ? 'La consola se cierra y salen los pufs' : 'Los pufs salen de la mesa', dur: 1.3, to: { consolas: 0, pufs: 1 } },
    { ch: 2, text: 'La mesa sube a altura de servicio', dur: 1.2, to: { mesa: 1 } },
    { ch: 2, text: 'Luz cálida en la sala', dur: 1.1, to: { calidez: 1 } },
    { ch: 3, text: 'Los pufs regresan y la mesa baja', dur: 1.3, to: { pufs: 0, mesa: 0 } }
  );
  if (d.tvOn) s.push({ ch: 3, text: 'La pantalla se apaga', dur: 1.0, to: { tv: 0 } });
  s.push(
    { ch: 3, text: 'Las cortinas se abren a la noche', dur: 1.4, to: { cortinas: 0, luzDia: 0, noche: 1, calidez: 0.25 } },
    { ch: 3, text: lit ? 'Sólo queda la tira LED' : 'Se apagan las luces', dur: 1.2, to: { led: lit ? 0.35 : 0, calidez: 0 } }
  );
  return s;
}

export function initialFor(d) {
  return { ...INITIAL, led: d.towersLit && d.towerCount > 0 ? 0.35 : 0 };
}

const EASE = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export function createTimeline({ steps = STEPS, initial = INITIAL, hold = 0.45, onChange }) {
  const tracks = {}, cur = { ...initial }, bounds = [];
  let t = 0;
  for (const s of steps) {
    const start = t, moveEnd = t + s.dur, end = moveEnd + hold;
    for (const k in s.to) {
      (tracks[k] ||= []).push({ t0: start, t1: moveEnd, v0: cur[k], v1: s.to[k] });
      cur[k] = s.to[k];
    }
    bounds.push({ start, end, ch: s.ch, text: s.text });
    t = end;
  }
  const total = t;
  for (const k in initial) {
    if (Math.abs(cur[k] - initial[k]) > 1e-6) console.warn(`[maqueta] el canal "${k}" no cierra el bucle`);
  }

  const chapters = CHAPTERS.map((name, c) => {
    const idx = bounds.map((b, i) => (b.ch === c ? i : -1)).filter((i) => i >= 0);
    return { name, first: idx[0], last: idx[idx.length - 1], start: bounds[idx[0]].start, end: bounds[idx[idx.length - 1]].end };
  });

  let T = bounds[0].end, playing = false, speed = 1, stopAt = null;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function valueAt(k, time) {
    const tr = tracks[k];
    let v = initial[k];
    if (!tr) return v;
    for (const seg of tr) {
      if (time < seg.t0) break;
      if (time >= seg.t1) { v = seg.v1; continue; }
      return seg.v0 + (seg.v1 - seg.v0) * EASE((time - seg.t0) / (seg.t1 - seg.t0));
    }
    return v;
  }

  function values() {
    const v = {};
    for (const k in initial) v[k] = valueAt(k, T);
    return v;
  }

  function stepIndex(time = T) {
    if (time <= 1e-6) return bounds.length - 1;
    for (let i = 0; i < bounds.length; i++) if (time <= bounds[i].end + 1e-6) return i;
    return bounds.length - 1;
  }

  function emit() { onChange && onChange(values()); }

  function jump(time) { T = Math.max(0, Math.min(total, time)); emit(); }

  function playTo(target, sp = 1) {
    if (reduce) { playing = false; stopAt = null; jump(target); return; }
    stopAt = target;
    speed = target >= T ? Math.abs(sp) : -Math.abs(sp);
    playing = true;
  }

  const api = {
    total, bounds, chapters,
    get time() { return T; },
    get playing() { return playing && stopAt === null; },
    get busy() { return playing; },
    values, stepIndex, valueAt,
    chapterAt(time = T) { return bounds[stepIndex(time)].ch; },

    /* Avanza el reloj; devuelve true si la escena cambió. */
    tick(dt) {
      if (!playing) return false;
      T += dt * speed;
      if (stopAt !== null && ((speed > 0 && T >= stopAt) || (speed < 0 && T <= stopAt))) {
        T = stopAt; stopAt = null; playing = false;
      } else if (T >= total) {
        T -= total;
      } else if (T < 0) {
        T += total;
      }
      emit();
      return true;
    },

    play() {
      if (reduce) return api.next();
      if (T >= total - 1e-6) T = 0;
      stopAt = null; speed = 1; playing = true;
    },
    pause() { playing = false; stopAt = null; },
    toggle() { api.playing ? api.pause() : api.play(); },

    next() {
      const i = stepIndex();
      const atRest = Math.abs(T - bounds[i].end) < 1e-3;
      if (atRest && i === bounds.length - 1) { T = 0; emit(); playTo(bounds[0].end); return; }
      playTo(atRest ? bounds[i + 1].end : bounds[i].end);
    },
    prev() {
      const i = stepIndex();
      playTo(bounds[i].start, 1.6);
    },
    goChapter(c) {
      const target = bounds[chapters[c].first].end;
      playTo(target, Math.max(3, Math.abs(target - T) / 1.6));
    },
    seek(time) { api.pause(); jump(time); },

    /* Barra de progreso: cada capítulo ocupa 1/4 aunque dure distinto (como en el video). */
    progress(time = T) {
      if (time <= 1e-6) return 0;
      const c = api.chapterAt(time), ch = chapters[c];
      return (c + (time - ch.start) / (ch.end - ch.start)) / chapters.length;
    },
    timeAtProgress(p) {
      const n = chapters.length, x = Math.max(0, Math.min(0.99999, p)) * n, c = Math.floor(x), ch = chapters[c];
      return ch.start + (x - c) * (ch.end - ch.start);
    }
  };
  return api;
}

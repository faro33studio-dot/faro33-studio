/* Faro 33 — Maqueta 3D: sala en corte + muro de TV transformable.
   Unidades: metros. x = a lo largo del muro de TV, z = hacia la cámara, y = arriba.
   El muro de TV se construye desde un `design` con el mismo esquema (en cm) que `state`
   en ../configurador/configurador.js (ver ../diseno.js). `wallLayout` replica su `computeLayout`
   para que la maqueta coincida con el plano 2D. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMaterials, wallTexture, finishSet, contactShadowTexture } from './materials.js';

/* Modelo de muestra. `float`, `tvGap` y `extras` solo existen aquí: el configurador no los ofrece. */
export const DESIGN = {
  w: 340, h: 260, d: 40,
  wallFinish: 'marmol',
  consoleLen: 220, consoleH: 36, cols: 4, doors: [1, 1, 1, 1],
  tvOn: true, tvW: 140, tvH: 80,
  towerCount: 2, towerSide: 'derecha', towerStart: 'piso', towerW: 34, towerH: 240, towersLit: true,
  finish: 'roble',
  float: 16, tvGap: 22,
  extras: { listones: true, bar: true, flip: 1, glow: true, seams: 'center' }
};

/* La sala crece si el muro de TV lo pide (deja espacio para la planta y la puerta). */
export function roomFor(design) {
  return { W: Math.max(5.2, design.w / 100 + 1.8), D: 4.0, H: Math.max(2.6, design.h / 100), T: 0.14, CUT: 0.22, SLAB: 0.14 };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = (v) => clamp(v, 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);

/* Misma geometría que computeLayout() del configurador, en metros y con y hacia arriba. */
export function wallLayout(D, room) {
  const w = D.w / 100, h = D.h / 100, dep = D.d / 100;
  const x0 = room.W / 2 - w / 2;
  const hasLeft = D.towerCount === 2 || (D.towerCount === 1 && D.towerSide === 'izquierda');
  const hasRight = D.towerCount === 2 || (D.towerCount === 1 && D.towerSide === 'derecha');
  const tw = clamp(D.towerW, 20, Math.floor(D.w * 0.3)) / 100;
  const innerL = hasLeft ? tw + 0.08 : 0, innerR = hasRight ? w - tw - 0.08 : w;
  const avail = Math.max(0.6, innerR - innerL);
  const cl = clamp(D.consoleLen / 100, 0.8, avail);
  const ch = clamp(D.consoleH / 100, 0.15, Math.max(0.15, h * 0.5));
  const float = (D.float ?? 4) / 100;
  const cTop = float + ch;
  const cx0 = x0 + innerL + (avail - cl) / 2;

  let th = 0, ty0 = 0;
  if (hasLeft || hasRight) {
    if (D.towerStart === 'consola') { ty0 = cTop; th = clamp(D.towerH / 100, 0.3, Math.max(0.3, h - cTop - 0.04)); }
    else th = clamp(D.towerH / 100, 0.4, h);
  }

  let tv = null;
  if (D.tvOn) {
    const gap = (D.tvGap ?? 12) / 100;
    const tvW = clamp(D.tvW / 100, 0.4, w - 0.16);
    const tvH = clamp(D.tvH / 100, 0.2, Math.max(0.2, h - cTop - 0.2));
    const fromTop = Math.max(0.04, h - cTop - gap - tvH);
    tv = { x0: room.W / 2 - tvW / 2, y0: h - fromTop - tvH, w: tvW, h: tvH };
  }
  return { w, h, dep, x0, hasLeft, hasRight, tw, cl, ch, cx0, float, cTop, th, ty0, tv };
}

const geoCache = new Map();
function roundedGeo(w, h, d, r) {
  const rr = Math.min(r, Math.min(w, h, d) * 0.45);
  const key = [w, h, d, rr].map((n) => n.toFixed(4)).join('|');
  if (!geoCache.has(key)) geoCache.set(key, rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

/* Caja posicionada por su esquina mínima (x0,y0,z0), relativa a `parent`. */
function B(parent, x0, y0, z0, w, h, d, mat, o = {}) {
  const m = new THREE.Mesh(Array.isArray(mat) ? new THREE.BoxGeometry(w, h, d) : roundedGeo(w, h, d, o.r ?? 0.006), mat);
  m.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  parent.add(m);
  return m;
}

function G(parent, x, y, z, millwork) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (millwork) g.userData.millwork = millwork;
  parent.add(g);
  return g;
}

function cyl(parent, x, y, z, rTop, rBot, h, mat, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 28), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function pointLight(parent, x, y, z, color, distance) {
  const l = new THREE.PointLight(color, 0, distance, 2);
  l.position.set(x, y, z);
  parent.add(l);
  return l;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- sala */
function buildRoom(root, M, decor, room) {
  const { W, D, H, T, CUT, SLAB } = room;
  // Orden de caras de BoxGeometry: +x, -x, +y, -y, +z, -z
  B(root, -T, -SLAB, -T, W + 2 * T, SLAB, D + 2 * T, [M.slab, M.slab, M.floor, M.slab, M.slab, M.slab]);

  const wall = M.wall, cap = M.cap;
  B(root, -T, 0, -T, W + 2 * T, H, T, [cap, wall, cap, wall, wall, wall]);                 // fondo (muro de TV)

  const zw0 = 1.05, zw1 = 2.85, sill = 0.5, head = 2.25;                                    // izquierdo, con ventana
  B(root, -T, 0, 0, T, H, zw0, [wall, wall, cap, wall, wall, wall]);
  B(root, -T, 0, zw1, T, H, D + T - zw1, [wall, wall, cap, wall, cap, wall]);
  B(root, -T, 0, zw0, T, sill, zw1 - zw0, [wall, wall, wall, wall, wall, wall]);
  B(root, -T, head, zw0, T, H - head, zw1 - zw0, [wall, wall, cap, wall, wall, wall]);

  B(root, 0, 0, D, W + T, CUT, T, [cap, cap, cap, cap, cap, wall]);                         // frente (cortado)
  B(root, W, 0, 0, T, CUT, D, [cap, wall, cap, cap, cap, cap]);                             // derecho (cortado)

  // ventana: marco, parteluces y vidrio a media hoja
  const fx = -T * 0.55, ft = 0.035;
  B(root, fx, sill, zw0, ft, 0.04, zw1 - zw0, M.frame);
  B(root, fx, head - 0.04, zw0, ft, 0.04, zw1 - zw0, M.frame);
  B(root, fx, sill, zw0, ft, head - sill, 0.04, M.frame);
  B(root, fx, sill, zw1 - 0.04, ft, head - sill, 0.04, M.frame);
  for (const k of [1, 2]) B(root, fx, sill, zw0 + ((zw1 - zw0) * k) / 3 - 0.015, ft, head - sill, 0.03, M.frame);
  B(root, fx + 0.01, sill, zw0, 0.008, head - sill, zw1 - zw0, M.glass, { cast: false, receive: false, r: 0 });
  B(root, -T * 0.5, sill - 0.02, zw0 - 0.02, T * 0.5 + 0.03, 0.025, zw1 - zw0 + 0.04, M.cream);

  // puerta de acceso (siempre a 80 cm del muro derecho)
  const dx = W - 0.8;
  B(decor, dx, 0, 0, 0.72, 2.1, 0.035, M.door);
  B(decor, dx - 0.03, 0, 0, 0.03, 2.13, 0.02, M.oakInner);
  B(decor, dx + 0.72, 0, 0, 0.03, 2.13, 0.02, M.oakInner);
  B(decor, dx - 0.03, 2.1, 0, 0.78, 0.03, 0.02, M.oakInner);
  B(decor, dx + 0.06, 1.0, 0.035, 0.12, 0.012, 0.025, M.brass);

  // cuadro
  B(decor, 0, 1.28, 3.18, 0.022, 0.6, 0.46, M.frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.54), M.art);
  art.position.set(0.024, 1.58, 3.41); art.rotation.y = Math.PI / 2;
  decor.add(art);

  // tapete
  B(decor, W / 2 - 1.45, 0, 1.3, 2.9, 0.006, 2.15, M.rug, { r: 0.002, cast: false });

  // sombra de contacto bajo la maqueta (flotando sobre el fondo, como en el video)
  const cs = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 2.6, D + 2.6),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, color: '#000' })
  );
  cs.rotation.x = -Math.PI / 2;
  cs.position.set(W / 2, -SLAB - 0.004, D / 2);
  root.add(cs);

  return { contactShadow: cs };
}

/* Cortinas: pliegues en zigzag; el grupo escala en z desde su ancla. */
function buildCurtains(root, M) {
  const z0 = 0.82, z1 = 3.08, half = (z1 - z0) / 2, pleats = 8, pw = half / pleats, h = 2.33;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, z1 - z0 + 0.1, 16), M.brass);
  rod.rotation.x = Math.PI / 2; rod.position.set(0.1, 2.41, (z0 + z1) / 2); root.add(rod);

  const mk = (anchor, dir) => {
    const g = G(root, 0.1, 0.05, anchor);
    for (let i = 0; i < pleats; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, h, pw / Math.cos(0.6)), M.curtain);
      p.position.set(0, h / 2, dir * (i + 0.5) * pw);
      p.rotation.y = i % 2 ? 0.6 : -0.6;
      p.castShadow = true; p.receiveShadow = true;
      g.add(p);
    }
    return g;
  };
  return { left: mk(z0, 1), right: mk(z1, -1) };
}

const WALL_LABELS = {
  marmol: ['Panel de mármol', '122 × 280 por placa'],
  piedra: ['Piedra mosaico', 'piezas de 60 × 120'],
  papel: ['Papel tapiz', 'franjas de 50 cm']
};

/* -------------------------------------------------- muro de TV (Faro 33) */
function buildMillwork(root, M, D, decor, room) {
  const L = wallLayout(D, room), ex = D.extras || {}, F = finishSet(M, D.finish);
  const t = 0.018, dep = L.dep, tw = L.tw;
  const labels = [], lights = { led: [], bar: null, glow: [], tv: null }, doorRigs = [];
  const r = mulberry(4);
  let barDoor = null, panels = [];

  // acabado de muro a todo lo ancho; el mueble se adelanta su espesor para no quedar dentro
  let z0 = 0;
  if (D.wallFinish !== 'pintura') {
    const mat = new THREE.MeshStandardMaterial({ map: wallTexture(D.wallFinish, L.w, L.h, ex.seams || 'left'), roughness: D.wallFinish === 'marmol' ? 0.28 : 0.9 });
    B(root, L.x0, 0, 0, L.w, L.h, 0.02, mat, { r: 0.002 });
    z0 = 0.02;
    const [text, sub] = WALL_LABELS[D.wallFinish];
    const xr = L.x0 + L.w - (L.hasRight ? tw : 0) - 0.4;
    labels.push({ text, sub, pos: new THREE.Vector3(xr, L.h - 0.35, z0 + 0.01), dir: [60, -40] });
  }

  const books = (g, y, x0, x1) => {
    let x = x0;
    while (true) {
      const bw = 0.018 + r() * 0.022, bh = 0.18 + r() * 0.13;
      if (x + bw > x1) break;
      B(g, x, y, 0.06 + r() * 0.04, bw, bh, Math.min(dep - 0.1, 0.2 + r() * 0.06), M.book[Math.floor(r() * M.book.length)], { r: 0.002 });
      x += bw + 0.002;
    }
  };

  // torres (desde el piso o flotando sobre la altura de la consola)
  const tower = (xL, side, bar) => {
    const g = G(root, xL, L.ty0, z0, 'tower'), th = L.th, floor = L.ty0 < 0.01;
    B(g, 0, 0, 0, t, th, dep, F.body); B(g, tw - t, 0, 0, t, th, dep, F.body);
    B(g, t, th - t, 0, tw - 2 * t, t, dep, F.body);
    let yb = 0;
    if (floor) { B(g, t, 0, 0.03, tw - 2 * t, 0.08, dep - 0.03, M.cap, { r: 0.002 }); yb = 0.08; }
    B(g, t, yb, 0, tw - 2 * t, t, dep, F.body);
    B(g, t, yb, 0, tw - 2 * t, th - yb, 0.012, F.inner, { r: 0 });
    let y = yb;
    const lowerDoor = floor && th >= 1.0;
    if (lowerDoor) {
      B(g, 0.003, 0.1, dep, tw - 0.006, 0.52, 0.018, F.door);
      B(g, t, 0.64, 0, tw - 2 * t, t, dep, F.body);
      if (!bar) cyl(g, 0.1, 0.64 + t, 0.2, 0.05, 0.06, 0.22, M.cream);
      y = 0.64;
    }
    if (bar && th >= 1.6) {
      // bar: interior oscuro, repisa de vidrio, botellas, copas y luz
      B(g, t, 0.66, 0.012, tw - 2 * t, 0.9, 0.004, M.felt, { r: 0 });
      B(g, t, 1.1, 0.02, tw - 2 * t, 0.008, dep - 0.04, M.shelfGlass, { r: 0, cast: false });
      [[0.05, 0.3, M.bottle], [0.12, 0.26, M.bottleAmber], [0.2, 0.32, M.bottle], [0.27, 0.24, M.bottleAmber]].forEach(([bx, bh, bm]) => {
        if (bx < tw - 2 * t) {
          cyl(g, t + bx, 0.64 + t, 0.18, 0.028, 0.032, bh * 0.75, bm);
          cyl(g, t + bx, 0.64 + t + bh * 0.75, 0.18, 0.01, 0.024, bh * 0.25, bm);
        }
      });
      for (const gx of [0.06, 0.15, 0.24]) {
        if (gx > tw - 2 * t) continue;
        cyl(g, t + gx, 1.108, 0.14, 0.025, 0.02, 0.1, M.shelfGlass, { cast: false });
        cyl(g, t + gx, 1.108, 0.26, 0.025, 0.02, 0.1, M.shelfGlass, { cast: false });
      }
      B(g, t + 0.01, 1.555, 0.05, tw - 2 * t - 0.02, 0.006, 0.012, M.ledBar, { cast: false, r: 0 });
      lights.bar = pointLight(g, tw / 2, 1.4, 0.25, '#FFC98A', 1.4);
      barDoor = G(g, tw - 0.003, 0.66, dep);
      B(barDoor, -(tw - 0.006), 0, 0, tw - 0.006, 0.9, 0.018, F.door);
      B(barDoor, -(tw - 0.006) + 0.03, 0.4, 0.018, 0.008, 0.12, 0.012, M.brass);
      B(g, t, 1.58, 0, tw - 2 * t, t, dep, F.body);
      labels.push({ text: 'Bar integrado', sub: 'luz y repisa de vidrio', pos: new THREE.Vector3(xL + tw / 2, 1.2, z0 + dep), dir: [80, 0] });
      y = 1.58;
    }
    // entrepaños abiertos cada 40 cm, con libros y algún objeto
    const levels = [y];
    for (let sy = y + 0.4; sy < th - 0.25; sy += 0.4) { B(g, t, sy, 0, tw - 2 * t, t, dep, F.body); levels.push(sy); }
    levels.forEach((ly, k) => {
      const space = (k + 1 < levels.length ? levels[k + 1] : th - t) - ly - t;
      if (space < 0.34 || (lowerDoor && !bar && k === 0)) return;
      if (k % 2) { books(g, ly + t, t + 0.02, tw - t - 0.13); cyl(g, tw - t - 0.06, ly + t, 0.2, 0.04, 0.05, 0.16, M.terracotta); }
      else books(g, ly + t, t + 0.01, tw - t - 0.02);
    });
    if (!bar && !labels.some((l) => l.tower)) {
      labels.push({
        tower: true, text: D.towersLit ? 'Torre con LED' : 'Torre', sub: `${Math.round(tw * 100)} × ${Math.round(th * 100)} cm`,
        pos: new THREE.Vector3(xL + tw / 2, L.ty0 + th * 0.8, z0 + dep), dir: side === 'L' ? [-80, -40] : [80, -40]
      });
    }
  };
  if (L.hasLeft) tower(L.x0, 'L', false);
  if (L.hasRight) tower(L.x0 + L.w - tw, 'R', !!ex.bar);

  // tiras LED en el canto interior de cada torre + baño de luz suave sobre el muro
  if (D.towersLit && L.th > 0) {
    const edges = [];
    if (L.hasLeft) edges.push([L.x0 + tw, 1]);
    if (L.hasRight) edges.push([L.x0 + L.w - tw, -1]);
    for (const [ex_, dir] of edges) {
      B(root, dir > 0 ? ex_ : ex_ - 0.006, L.ty0 + 0.1, z0 + dep - 0.035, 0.006, L.th - 0.2, 0.014, M.led, { cast: false, r: 0 });
      for (const f of [0.2, 0.5, 0.8]) lights.led.push(pointLight(root, ex_ + dir * 0.3, L.ty0 + L.th * f, z0 + 0.42, '#FFB866', 2.2));
    }
  }

  // consola flotante: cada compartimento como en el configurador (abierto, puerta lisa, vidrio o cajón)
  const n = D.cols, dw = L.cl / n, ch = L.ch;
  const cg = G(root, L.cx0, L.float, z0, 'console');
  B(cg, 0, ch - t, 0, L.cl, t, dep - 0.018, F.body);
  B(cg, 0, 0, 0, L.cl, t, dep - 0.018, F.body);
  B(cg, 0, 0, 0, t, ch, dep - 0.018, F.body); B(cg, L.cl - t, 0, 0, t, ch, dep - 0.018, F.body);
  B(cg, 0, 0, 0, L.cl, ch, 0.01, F.inner, { r: 0 });
  for (let i = 1; i < n; i++) B(cg, i * dw - t / 2, t, 0.01, t, ch - 2 * t, dep - 0.03, F.inner, { r: 0 });
  const inside = ch - 2 * t;
  for (let i = 0; i < n; i++) {
    const x = i * dw + 0.002, fw = dw - 0.004, fh = ch - 0.008, fz = dep - 0.018;
    const type = ex.flip === i ? 'flip' : (D.doors[i] ?? 1);
    if (type === 'flip') {
      const p = G(cg, x, 0.004, fz);
      B(p, 0, 0, 0, fw, fh, 0.018, F.door);
      B(p, fw / 2 - 0.06, fh - 0.042, 0.018, 0.12, 0.008, 0.01, M.brass, { r: 0.002 });
      doorRigs.push({ type: 'flip', g: p });
      B(cg, x + 0.05, t, 0.05, Math.min(0.3, fw - 0.2), Math.min(0.07, inside - 0.02), 0.24, M.consoleWhite, { r: 0.01 });
      B(cg, x + fw - 0.17, t, 0.18, 0.13, 0.035, 0.09, M.black, { r: 0.012 });
      B(cg, x + fw - 0.17, t, 0.06, 0.13, 0.035, 0.09, M.black, { r: 0.012 });
    } else if (type === 0) {
      // nicho abierto: libros acostados y una bocina
      B(cg, x + 0.04, t, 0.08, Math.min(0.26, fw * 0.5), 0.05, 0.2, M.book[0], { r: 0.003 });
      B(cg, x + 0.05, t + 0.05, 0.1, Math.min(0.22, fw * 0.45), 0.035, 0.17, M.book[2], { r: 0.003 });
      if (fw > 0.3 && inside > 0.2) cyl(cg, x + fw - 0.1, t, 0.2, 0.06, 0.06, Math.min(0.18, inside - 0.03), M.black);
    } else if (type === 1 || type === 2) {
      // puerta con bisagra; la jaladera va del lado contrario (como en el plano 2D)
      const hingeLeft = i % 2 === 0;
      const p = G(cg, hingeLeft ? x : x + fw, 0.004, fz);
      const ox = hingeLeft ? 0 : -fw;
      if (type === 1) B(p, ox, 0, 0, fw, fh, 0.018, F.door);
      else {
        const s = Math.min(0.035, fh * 0.15);
        B(p, ox, 0, 0, s, fh, 0.018, F.door); B(p, ox + fw - s, 0, 0, s, fh, 0.018, F.door);
        B(p, ox + s, 0, 0, fw - 2 * s, s, 0.018, F.door); B(p, ox + s, fh - s, 0, fw - 2 * s, s, 0.018, F.door);
        B(p, ox + s, s, 0.006, fw - 2 * s, fh - 2 * s, 0.006, M.doorGlass, { r: 0, cast: false });
        if (inside > 0.14) cyl(cg, x + fw / 2, t, 0.2, 0.05, 0.07, Math.min(0.2, inside - 0.03), M.cream);
      }
      const ph = Math.max(0.05, fh * 0.2);
      B(p, hingeLeft ? ox + fw - 0.04 : ox + 0.032, fh / 2 - ph / 2, 0.018, 0.008, ph, 0.012, M.brass, { r: 0.002 });
      doorRigs.push({ type: 'hinge', g: p, sign: hingeLeft ? -1 : 1 });
      if (type === 1) B(cg, x + 0.05, t, 0.06, Math.min(0.3, fw - 0.1), Math.min(0.12, inside - 0.02), 0.22, M.book[4], { r: 0.004 });
    } else {
      // cajón: frente + charola que sale hacia el frente
      const g = G(cg, x, 0.004, fz), td = dep - 0.07;
      B(g, 0, 0, 0, fw, fh, 0.018, F.door);
      B(g, 0.02, 0.02, -td, fw - 0.04, 0.012, td, F.inner, { r: 0 });
      B(g, 0.02, 0.02, -td, 0.012, fh * 0.55, td, F.inner, { r: 0 });
      B(g, fw - 0.032, 0.02, -td, 0.012, fh * 0.55, td, F.inner, { r: 0 });
      B(g, 0.02, 0.02, -td, fw - 0.04, fh * 0.55, 0.012, F.inner, { r: 0 });
      B(g, 0.05, 0.032, -td + 0.03, Math.max(0.05, fw * 0.4), Math.min(0.08, fh * 0.4), td * 0.6, M.fabricDark, { r: 0.02 });
      B(g, fw / 2 - 0.06, fh * 0.76, 0.018, 0.12, 0.008, 0.012, M.brass, { r: 0.002 });
      doorRigs.push({ type: 'drawer', g, z: fz, dist: Math.min(0.3, td - 0.04) });
    }
  }
  if (ex.glow) {
    B(cg, 0.05, -0.006, dep - 0.07, L.cl - 0.1, 0.006, 0.012, M.led, { cast: false, r: 0 });
    lights.glow = [-L.cl / 3, 0, L.cl / 3].map((dx) => pointLight(root, L.cx0 + L.cl / 2 + dx, 0.12, z0 + 0.3, '#FFB866', 1.1));
  }
  const kinds = ex.flip != null ? 'puertas' : 'compartimentos';
  labels.push({ text: ex.glow ? 'Consola flotante' : 'Consola de TV', sub: `${Math.round(L.cl * 100)} × ${Math.round(ch * 100)} cm · ${n} ${kinds}`, pos: new THREE.Vector3(L.cx0 + L.cl * 0.83, L.float + ch / 2, z0 + dep), dir: [50, 70] });

  // TV
  if (L.tv) {
    const tv = L.tv;
    B(decor, tv.x0, tv.y0, z0, tv.w, tv.h, 0.035, M.black, { r: 0.004 });
    B(decor, tv.x0 + 0.012, tv.y0 + 0.012, z0 + 0.0352, tv.w - 0.024, tv.h - 0.024, 0.002, M.screen, { r: 0, cast: false });
    lights.tv = pointLight(root, room.W / 2, tv.y0 + tv.h / 2, 0.9, '#D7B3C9', 3.2);

    // paneles de listones corredizos (4 hojas en 2 rieles) que ocultan la TV — solo el modelo de muestra
    if (ex.listones) {
      const pw = (tv.w + 0.12) / 4, pY = Math.max(L.cTop + 0.03, tv.y0 - 0.12), pH = tv.y0 + tv.h + 0.12 - pY;
      const cover0 = room.W / 2 - 2 * pw;
      const inL = L.x0 + (L.hasLeft ? tw : 0), inR = L.x0 + L.w - (L.hasRight ? tw : 0);
      B(root, inL + 0.08, pY + pH + 0.006, z0 + 0.045, inR - inL - 0.16, 0.035, 0.075, M.frame, { r: 0.003 });
      const slats = 7, sw = 0.04, gap = (pw - slats * sw) / (slats - 1);
      panels = [0, 1, 2, 3].map((j) => {
        const front = j === 0 || j === 3;
        const g = G(root, cover0 + j * pw, pY, z0 + (front ? 0.083 : 0.049), 'listones');
        B(g, 0.004, 0.01, 0, pw - 0.008, pH - 0.02, 0.01, M.felt, { r: 0 });
        for (let k = 0; k < slats; k++) B(g, k * (sw + gap), 0, 0.01, sw, pH, 0.022, M.slat, { r: 0.004 });
        const open = [cover0 - pw - 0.03, cover0 - pw - 0.012, cover0 + 4 * pw + 0.012, cover0 + 4 * pw + 0.03][j];
        return { g, closed: cover0 + j * pw, open, inner: !front };
      });
      labels.push({ text: 'Listones corredizos', sub: 'ocultan la pantalla', pos: new THREE.Vector3(cover0 - pw / 2, pY + pH * 0.45, z0 + 0.12), dir: [-90, 50] });
    }
  }

  return { labels, lights, doorRigs, barDoor, panels, geo: { x0: L.x0, w: L.w, dep, tw, cx0: L.cx0, cl: L.cl, z0 } };
}

/* ----------------------------------------------------------- mobiliario */
function buildFurniture(decor, M, room) {
  const shift = room.W / 2 - 2.6;           // todo se diseñó centrado en x = 2.6
  const root = G(decor, shift, 0, 0);

  // sofá (respaldo hacia la cámara, mirando al muro de TV)
  const sx = 1.3, sz = 2.8, sl = 2.6, sd = 0.95;
  for (const [lx, lz] of [[0.05, 0.05], [sl - 0.09, 0.05], [0.05, sd - 0.09], [sl - 0.09, sd - 0.09]]) B(root, sx + lx, 0, sz + lz, 0.04, 0.06, 0.04, M.black, { r: 0.004 });
  B(root, sx, 0.06, sz, sl, 0.24, sd, M.fabricDark, { r: 0.03 });
  B(root, sx, 0.06, sz + sd - 0.22, sl, 0.68, 0.22, M.fabricDark, { r: 0.04 });
  B(root, sx, 0.06, sz, 0.18, 0.5, sd - 0.2, M.fabricDark, { r: 0.04 });
  B(root, sx + sl - 0.18, 0.06, sz, 0.18, 0.5, sd - 0.2, M.fabricDark, { r: 0.04 });
  const cw = (sl - 0.36) / 3;
  for (let i = 0; i < 3; i++) {
    B(root, sx + 0.18 + i * cw + 0.004, 0.3, sz + 0.02, cw - 0.008, 0.14, sd - 0.26, M.fabric, { r: 0.045 });
    const bc = B(root, sx + 0.18 + i * cw + 0.004, 0.44, sz + sd - 0.44, cw - 0.008, 0.36, 0.2, M.fabric, { r: 0.06 });
    bc.rotation.x = 0.14;
  }
  [[0.3, M.terracotta, -0.2], [0.78, M.cream, 0.1], [2.0, M.olive, 0.15]].forEach(([px, pm, rz]) => {
    const p = B(root, sx + px, 0.46, sz + sd - 0.58, 0.4, 0.38, 0.13, pm, { r: 0.06 });
    p.rotation.set(0.25, 0, rz);
  });

  // mesa de centro elevable
  const tx = 2.05, tz = 1.85, tl = 1.1, td = 0.6;
  const legs = [[0, 0], [tl - 0.045, 0], [0, td - 0.045], [tl - 0.045, td - 0.045]].map(([lx, lz]) => {
    const g = G(root, tx + lx, 0, tz + lz);
    B(g, 0, 0, 0, 0.045, 1, 0.045, M.oak, { r: 0 });
    return g;
  });
  const top = G(root, tx, 0.4, tz, null);
  B(top, 0, -0.035, 0, tl, 0.035, td, M.oak, { r: 0.008 });
  B(top, 0.02, -0.075, 0.02, tl - 0.04, 0.04, 0.02, M.oak, { r: 0.003 });
  B(top, 0.02, -0.075, td - 0.04, tl - 0.04, 0.04, 0.02, M.oak, { r: 0.003 });
  B(top, 0.18, 0, 0.14, 0.26, 0.04, 0.2, M.book[1], { r: 0.003 });
  B(top, 0.2, 0.04, 0.16, 0.22, 0.03, 0.17, M.book[3], { r: 0.003 });
  cyl(top, 0.8, 0, 0.3, 0.1, 0.06, 0.07, M.cream);

  // pufs guardados bajo la mesa
  const puf = (x) => {
    const g = G(root, x, 0, tz + 0.075);
    B(g, 0, 0, 0, 0.45, 0.34, 0.45, M.emerald, { r: 0.07 });
    return g;
  };
  const pufs = [
    { g: puf(2.12), in: 2.12, out: 1.36 },
    { g: puf(2.63), in: 2.63, out: 3.39 }
  ];

  // lámpara de piso con brazo giratorio
  const lx = 1.02, lz = 3.35;
  cyl(root, lx, 0, lz, 0.14, 0.15, 0.025, M.black);
  cyl(root, lx, 0.025, lz, 0.012, 0.012, 1.58, M.brass, { seg: 12 });
  const arm = G(root, lx, 1.6, lz);
  const armRod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.95, 10), M.brass);
  armRod.rotation.z = Math.PI / 2; armRod.position.set(0.475, 0, 0); armRod.castShadow = true;
  arm.add(armRod);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.13, 0.15, 28, 1, true), M.shade);
  shade.position.set(0.95, -0.1, 0); shade.castShadow = true;
  arm.add(shade);
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), M.bulb);
  bulb.rotation.x = Math.PI / 2; bulb.position.set(0.95, -0.17, 0);
  arm.add(bulb);
  const lampLight = pointLight(arm, 0.95, -0.24, 0, '#FFB46B', 3.2);

  // planta (en la esquina del fondo, fuera del grupo desplazado)
  const r = mulberry(3);
  cyl(decor, 0.42, 0, 0.45, 0.15, 0.12, 0.38, M.pot);
  cyl(decor, 0.42, 0.38, 0.45, 0.012, 0.016, 0.95, M.frame, { seg: 8 });
  for (let i = 0; i < 16; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), M.leaf);
    const a = r() * Math.PI * 2, y = 0.62 + i * 0.05 + r() * 0.05, rad = 0.08 + r() * 0.12;
    leaf.scale.set(0.13, 0.018, 0.08);
    leaf.position.set(0.42 + Math.cos(a) * rad, y, 0.45 + Math.sin(a) * rad);
    leaf.rotation.set(r() * 0.6 - 0.3, -a, 0.35 + r() * 0.3);
    leaf.castShadow = true;
    decor.add(leaf);
  }

  return { legs, top, pufs, arm, lampLight, table: { x: tx + shift, z: tz, l: tl, d: td } };
}

/* ------------------------------------------------------------ escena */
export function buildScene(design = DESIGN) {
  const M = createMaterials();
  const room = roomFor(design);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);

  const decor = new THREE.Group();
  root.add(decor);
  const rm = buildRoom(root, M, decor, room);
  const curtains = buildCurtains(decor, M);
  const mw = buildMillwork(root, M, design, decor, room);
  const fu = buildFurniture(decor, M, room);

  // luces
  const hemi = new THREE.HemisphereLight('#FFF7EC', '#B09C84', 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFE6C2', 3);
  const sunTarget = new THREE.Vector3(room.W * 0.385, 0.3, 1.8);
  sun.position.copy(sunTarget).add(new THREE.Vector3(-6, 4.4, 1.9));
  sun.target.position.copy(sunTarget);
  sun.castShadow = true;
  const sc = sun.shadow.camera, ext = Math.max(5, room.W * 0.9);
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 25;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const DAY = new THREE.Color('#E7E2DB'), DUSK = new THREE.Color('#6D6864'), NIGHT = new THREE.Color('#0E1C33');
  const HEMI_COOL = new THREE.Color('#FFF7EC'), HEMI_WARM = new THREE.Color('#FFD9AE');
  scene.background = DAY.clone();

  const lampOn = 0.3, lampRest = Math.PI / 2;
  const onlyFlip = mw.doorRigs.some((d) => d.type === 'flip');

  /* Aplica un estado completo de canales (0..1) a la escena. */
  function apply(v) {
    const dark = 1 - 0.7 * v.noche;
    sun.intensity = 2.6 * v.luzDia;
    hemi.intensity = (0.1 + 0.42 * v.luzDia) * dark + 0.1 * v.calidez;
    hemi.color.copy(HEMI_COOL).lerp(HEMI_WARM, clamp01(v.calidez * 0.8 + (1 - v.luzDia) * 0.3));
    scene.environmentIntensity = (0.1 + 0.3 * v.luzDia) * dark + 0.05 * v.calidez;
    scene.background.copy(DUSK).lerp(DAY, v.luzDia).lerp(NIGHT, v.noche);
    rm.contactShadow.material.opacity = 0.25 + 0.75 * v.luzDia;

    const cw = lerp(0.27, 1, smooth(v.cortinas));
    curtains.left.scale.z = cw; curtains.right.scale.z = cw;

    fu.arm.rotation.y = lerp(lampRest, lampOn, smooth(v.lampara));
    fu.lampLight.intensity = 2.6 * v.calidez;
    M.bulb.emissiveIntensity = 2.2 * v.calidez;

    const topY = lerp(0.4, 0.72, v.mesa);
    fu.top.position.y = topY;
    for (const l of fu.legs) l.scale.y = topY - 0.035;
    for (const p of fu.pufs) p.g.position.x = lerp(p.in, p.out, smooth(v.pufs));

    for (const p of mw.panels) {
      const u = p.inner ? clamp01(v.paneles / 0.8) : clamp01((v.paneles - 0.2) / 0.8);
      p.g.position.x = lerp(p.closed, p.open, smooth(u));
    }
    M.screen.emissiveIntensity = 1.15 * v.tv;
    if (mw.lights.tv) mw.lights.tv.intensity = 1.6 * v.tv;

    // `consolas`: en el modelo de muestra solo la puerta abatible; en un diseño propio, todas las puertas y cajones
    mw.doorRigs.forEach((d, i) => {
      if (onlyFlip && d.type !== 'flip') return;
      const u = smooth(clamp01((v.consolas - i * 0.06) / (1 - Math.min(0.5, mw.doorRigs.length * 0.06))));
      if (d.type === 'flip') d.g.rotation.x = (Math.PI / 2) * 0.97 * smooth(v.consolas);
      else if (d.type === 'hinge') d.g.rotation.y = d.sign * 1.75 * u;
      else d.g.position.z = d.z + d.dist * u;
    });

    M.led.emissiveIntensity = 4 * v.led;
    for (const l of mw.lights.led) l.intensity = 0.22 * v.led;
    for (const l of mw.lights.glow) l.intensity = 0.16 * v.led;

    if (mw.barDoor) mw.barDoor.rotation.y = 1.9 * smooth(v.bar);
    M.ledBar.emissiveIntensity = 3 * v.barLuz;
    if (mw.lights.bar) mw.lights.bar.intensity = 1.4 * v.barLuz;
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(-room.T, -room.SLAB, -room.T),
    new THREE.Vector3(room.W + room.T, room.H, room.D + room.T)
  );

  return { scene, root, decor, apply, bounds, room, labels: mw.labels, layout: { ...mw.geo, table: fu.table }, materials: M };
}

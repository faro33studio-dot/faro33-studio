/* Faro 33 — Maqueta 3D: sala en corte + muro de TV transformable.
   Unidades: metros. x = a lo largo del muro de TV, z = hacia la cámara, y = arriba.
   El muro de TV se construye desde un `design` con el mismo esquema (en cm) que `state`
   en ../configurador/configurador.js (ver ../diseno.js). `wallLayout` replica su `computeLayout`
   línea por línea (en cm) para que la maqueta coincida con el plano 2D. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMaterials, wallTexture, finishSet, slatSet, haloTexture, shelfGlowTexture, contactShadowTexture } from './materials.js';

/* Modelo de muestra (como la referencia: lambrín a un lado, panel de TV con luz, torre iluminada al lado del mueble).
   `float`, `tvGap` y `extras` solo existen aquí: el configurador no los ofrece. */
export const DESIGN = {
  w: 340, h: 260, d: 40,
  consoleLen: 220, consoleH: 36, cols: 4, doors: [1, 1, 1, 1],
  tvOn: true, tvW: 140, tvH: 80, tvPanel: true, tvPanelLit: true,
  towerCount: 1, towerSide: 'derecha', towerMount: 'lado', towerOffset: 0, towerW: 34, towerH: 240, towersLit: true,
  finish: 'roble',
  panels: [{ type: 'lambrin', tone: 'nogal', x: 0, w: 70 }],
  float: 16, tvGap: 22,
  extras: { listones: true, flip: 1 }
};

/* La sala crece si el muro de TV lo pide (deja espacio para la planta y la puerta). */
export function roomFor(design) {
  return { W: Math.max(5.2, design.w / 100 + 1.8), D: 4.0, H: Math.max(2.6, design.h / 100), T: 0.14, CUT: 0.22, SLAB: 0.14 };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = (v) => clamp(v, 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);

/* Misma regla que computeLayout() del configurador (se calcula en cm y se devuelve en metros, y hacia arriba).
   · Torre "lado": en el piso, pegada al extremo de la consola; el grupo va centrado en el muro; el offset la separa.
   · Torre "sobre": apoyada en la cubierta, en el extremo; el offset la recorre hacia el centro.
   · La TV (y su panel) se centran en el tramo libre de la consola. */
export function wallLayout(D, room) {
  const w = D.w, h = D.h;
  const hasLeft = D.towerCount === 2 || (D.towerCount === 1 && D.towerSide === 'izquierda');
  const hasRight = D.towerCount === 2 || (D.towerCount === 1 && D.towerSide === 'derecha');
  const sides = (hasLeft ? 1 : 0) + (hasRight ? 1 : 0);
  const mount = D.towerMount;
  const tw = clamp(D.towerW, 20, Math.floor(w * 0.3));
  const ch = clamp(D.consoleH, 15, Math.max(15, h * 0.5));
  const float = D.float ?? 4;
  const cTop = float + ch;
  let cl, cx0, off = 0, tLx = 0, tRx = 0, ty0 = 0, th = 0;

  const f5 = (v) => Math.floor(v / 5) * 5;          // mismos topes que los sliders del configurador
  if (sides && mount === 'lado') {
    cl = clamp(D.consoleLen, 80, f5(w - sides * tw));
    off = clamp(D.towerOffset || 0, 0, Math.min(120, Math.max(0, f5((w - cl - sides * tw) / sides))));
    const gx0 = (w - (cl + sides * (tw + off))) / 2;
    cx0 = gx0 + (hasLeft ? tw + off : 0);
    tLx = gx0; tRx = cx0 + cl + off;
    th = clamp(D.towerH, 40, h);
  } else {
    cl = clamp(D.consoleLen, 80, w);
    cx0 = (w - cl) / 2;
    if (sides) {
      off = clamp(D.towerOffset || 0, 0, Math.min(120, Math.max(0, f5((cl - sides * tw - 40) / sides))));
      tLx = cx0 + off; tRx = cx0 + cl - tw - off;
      ty0 = cTop; th = clamp(D.towerH, 30, Math.max(30, f5(h - cTop - 4)));
    }
  }

  let fx0 = cx0, fx1 = cx0 + cl;
  if (sides && mount === 'sobre') { if (hasLeft) fx0 = tLx + tw; if (hasRight) fx1 = tRx; }

  let tv = null, panel = null;
  if (D.tvOn) {
    const gap = D.tvGap ?? 12;
    const tvW = clamp(D.tvW, 40, Math.max(40, fx1 - fx0 - 10));
    const tvH = clamp(D.tvH, 20, Math.max(20, h - cTop - 20));
    const top = Math.min(h - 4, cTop + gap + tvH);
    tv = { x: (fx0 + fx1) / 2 - tvW / 2, y0: top - tvH, w: tvW, h: tvH };
    if (D.tvPanel) {
      const pw = Math.min(tvW + 50, fx1 - fx0);
      const py0 = Math.max(cTop + 4, tv.y0 - 18), py1 = Math.min(h - 6, top + 18);
      panel = { x: tv.x + tvW / 2 - pw / 2, y0: py0, w: pw, h: py1 - py0 };
    }
  }

  const m = (v) => v / 100, x0 = room.W / 2 - m(w) / 2, ax = (v) => x0 + m(v);
  const rect = (r) => r && { x0: ax(r.x), y0: m(r.y0), w: m(r.w), h: m(r.h) };
  return {
    w: m(w), h: m(h), dep: m(D.d), x0, hasLeft, hasRight, sides, mount, off: m(off),
    tw: m(tw), th: m(th), ty0: m(ty0), tLx: ax(tLx), tRx: ax(tRx),
    cl: m(cl), ch: m(ch), cx0: ax(cx0), float: m(float), cTop: m(cTop), fx0: ax(fx0), fx1: ax(fx1),
    tv: rect(tv), panel: rect(panel)
  };
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

const PANEL_LABELS = {
  lambrin: 'Lambrín', marmol: 'Mármol', piedra: 'Piedra mosaico', papel: 'Papel tapiz'
};

/* -------------------------------------------------- muro de TV (Faro 33) */
function buildMillwork(root, M, D, decor, room) {
  const L = wallLayout(D, room), ex = D.extras || {}, F = finishSet(M, D.finish);
  const t = 0.018, dep = L.dep, tw = L.tw;
  const labels = [], doorRigs = [], towerLights = [];
  const lights = { tv: null };
  const r = mulberry(4);
  let panels = [], halo = null;
  const panelsDef = D.panels || [];
  const side = (x) => (x < room.W / 2 ? -1 : 1);

  /* acabados atrás: franjas a todo lo alto; el mueble se adelanta el espesor del más grueso */
  const z0 = panelsDef.some((p) => p.type === 'lambrin') ? 0.035 : panelsDef.length ? 0.02 : 0;
  panelsDef.forEach((p) => {
    const px = L.x0 + p.x / 100, pw = p.w / 100;
    if (p.type === 'lambrin') {
      B(root, px, 0, 0, pw, L.h, 0.012, M.felt, { r: 0 });
      const slat = 0.04, gap = 0.016, n = Math.max(1, Math.floor((pw + gap) / (slat + gap)));
      const lead = (pw - (n * slat + (n - 1) * gap)) / 2;
      const inst = new THREE.InstancedMesh(roundedGeo(slat, L.h, 0.023, 0.004), slatSet(M, p.tone), n);
      const mtx = new THREE.Matrix4();
      for (let k = 0; k < n; k++) inst.setMatrixAt(k, mtx.makeTranslation(px + lead + k * (slat + gap) + slat / 2, L.h / 2, 0.012 + 0.0115));
      inst.castShadow = true; inst.receiveShadow = true;
      root.add(inst);
    } else {
      const mat = new THREE.MeshStandardMaterial({ map: wallTexture(p.type, pw, L.h, ex.seams || 'left'), roughness: p.type === 'marmol' ? 0.4 : 0.9 });
      B(root, px, 0, 0, pw, L.h, 0.02, mat, { r: 0.002 });
    }
    const name = PANEL_LABELS[p.type] + (p.type === 'lambrin' ? ` ${p.tone}` : '');
    labels.push({ text: name, sub: `${p.w} cm de ancho`, pos: new THREE.Vector3(px + pw / 2, L.h - 0.3, 0.04), dir: [side(px + pw / 2) * 70, -45] });
  });

  /* torres de repisas abiertas; si van iluminadas, la luz sale bajo cada repisa y baña el fondo */
  const tower = (xL) => {
    const floor = L.mount !== 'sobre', th = L.th, td = Math.min(dep, 0.38);
    const g = G(root, xL, L.ty0, z0, 'tower');
    B(g, 0, 0, 0, t, th, td, F.body); B(g, tw - t, 0, 0, t, th, td, F.body);
    B(g, t, th - t, 0, tw - 2 * t, t, td, F.body);
    let yb = 0;
    if (floor) { B(g, t, 0, 0.03, tw - 2 * t, 0.08, td - 0.03, M.cap, { r: 0.002 }); yb = 0.08; }
    B(g, t, yb, 0, tw - 2 * t, t, td, F.body);
    const y1 = yb + t, y2 = th - t, n = Math.max(1, Math.round((y2 - y1) / 0.38)), sp = (y2 - y1) / n;
    const back = F.inner.clone();
    back.emissive = new THREE.Color('#FFB866');
    back.emissiveMap = shelfGlowTexture();
    back.emissiveIntensity = 0;
    const tl = { mat: back, lights: [] };
    for (let k = 0; k < n; k++) {
      const bb = y1 + k * sp, bt = bb + sp;                                   // entrepaño: de la repisa de abajo a la de arriba
      B(g, t, bb, 0, tw - 2 * t, sp, 0.012, back, { r: 0 });
      if (k > 0) B(g, t, bb - 0.01, 0.012, tw - 2 * t, 0.02, td - 0.012, F.body, { r: 0.002 });
      B(g, t + 0.004, bt - (k === n - 1 ? 0.006 : 0.016), td - 0.03, tw - 2 * t - 0.008, 0.006, 0.012, M.led, { cast: false, r: 0 });
      const cx = t + (tw - 2 * t) / 2, base = bb + (k > 0 ? 0.01 : 0);
      if (k % 3 === 0) { cyl(g, cx - 0.04, base, td * 0.45, 0.035, 0.045, Math.min(0.2, sp * 0.55), M.cream); cyl(g, cx + 0.06, base, td * 0.55, 0.03, 0.03, Math.min(0.1, sp * 0.3), M.terracotta); }
      else if (k % 3 === 1) { B(g, cx - 0.1, base, td * 0.3, 0.2, 0.035, 0.16, M.book[1], { r: 0.003 }); B(g, cx - 0.08, base + 0.035, td * 0.32, 0.16, 0.03, 0.14, M.book[2], { r: 0.003 }); }
      else cyl(g, cx, base, td * 0.5, 0.07, 0.05, Math.min(0.07, sp * 0.2), M.black);
      if (k % 2 === 0) { const l = pointLight(g, cx, bt - 0.12, td * 0.8, '#FFBE78', 0.7); tl.lights.push(l); }
    }
    towerLights.push(tl);
    if (xL === (L.hasRight ? L.tRx : L.tLx)) {                             // con dos torres se etiqueta la derecha
      labels.push({
        text: D.towersLit ? 'Torre iluminada' : 'Torre', sub: `${Math.round(tw * 100)} × ${Math.round(th * 100)} cm · ${floor ? 'al lado del mueble' : 'sobre el mueble'}`,
        pos: new THREE.Vector3(xL + tw / 2, L.ty0 + th * 0.75, z0 + td), dir: [side(xL) * 90, -30]
      });
    }
  };
  if (L.hasLeft) tower(L.tLx);
  if (L.hasRight) tower(L.tRx);

  /* consola flotante: cada compartimento como en el configurador (abierto, puerta lisa, vidrio o cajón) */
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
      B(cg, x + 0.04, t, 0.08, Math.min(0.26, fw * 0.5), 0.05, 0.2, M.book[0], { r: 0.003 });
      B(cg, x + 0.05, t + 0.05, 0.1, Math.min(0.22, fw * 0.45), 0.035, 0.17, M.book[2], { r: 0.003 });
      if (fw > 0.3 && inside > 0.2) cyl(cg, x + fw - 0.1, t, 0.2, 0.06, 0.06, Math.min(0.18, inside - 0.03), M.black);
    } else if (type === 1 || type === 2) {
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
      const g = G(cg, x, 0.004, fz), tdr = dep - 0.07;
      B(g, 0, 0, 0, fw, fh, 0.018, F.door);
      B(g, 0.02, 0.02, -tdr, fw - 0.04, 0.012, tdr, F.inner, { r: 0 });
      B(g, 0.02, 0.02, -tdr, 0.012, fh * 0.55, tdr, F.inner, { r: 0 });
      B(g, fw - 0.032, 0.02, -tdr, 0.012, fh * 0.55, tdr, F.inner, { r: 0 });
      B(g, 0.02, 0.02, -tdr, fw - 0.04, fh * 0.55, 0.012, F.inner, { r: 0 });
      B(g, 0.05, 0.032, -tdr + 0.03, Math.max(0.05, fw * 0.4), Math.min(0.08, fh * 0.4), tdr * 0.6, M.fabricDark, { r: 0.02 });
      B(g, fw / 2 - 0.06, fh * 0.76, 0.018, 0.12, 0.008, 0.012, M.brass, { r: 0.002 });
      doorRigs.push({ type: 'drawer', g, z: fz, dist: Math.min(0.3, tdr - 0.04) });
    }
  }
  const kinds = ex.flip != null ? 'puertas' : 'compartimentos';
  labels.push({ text: ex.flip != null ? 'Consola flotante' : 'Consola de TV', sub: `${Math.round(L.cl * 100)} × ${Math.round(ch * 100)} cm · ${n} ${kinds}`, pos: new THREE.Vector3(L.cx0 + L.cl * 0.5, L.float + ch / 2, z0 + dep), dir: [40, 75] });

  /* panel flotante detrás de la TV (separado del muro), con halo de luz que asoma por sus orillas */
  let tvZ = z0;
  if (L.panel) {
    const P = L.panel, margin = 0.35;
    B(root, P.x0, P.y0, z0 + 0.03, P.w, P.h, 0.04, M.tvPanel, { r: 0.004 });
    B(root, P.x0 + P.w / 2 - 0.3, P.y0 + 0.1, z0, 0.6, P.h - 0.2, 0.03, M.felt, { r: 0 });
    tvZ = z0 + 0.07;
    if (D.tvPanelLit) {
      halo = new THREE.Mesh(
        new THREE.PlaneGeometry(P.w + 2 * margin, P.h + 2 * margin),
        new THREE.MeshBasicMaterial({ map: haloTexture(P.w, P.h, margin), color: '#FFC47A', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.position.set(P.x0 + P.w / 2, P.y0 + P.h / 2, z0 + 0.006);
      root.add(halo);
    }
    labels.push({ text: 'Panel de TV', sub: D.tvPanelLit ? 'flotante, con luz detrás' : 'flotante', pos: new THREE.Vector3(P.x0 + 0.08, P.y0 + 0.12, tvZ), dir: [-70, 65] });
  }

  /* TV */
  if (L.tv) {
    const tv = L.tv;
    B(decor, tv.x0, tv.y0, tvZ, tv.w, tv.h, 0.035, M.black, { r: 0.004 });
    B(decor, tv.x0 + 0.012, tv.y0 + 0.012, tvZ + 0.0352, tv.w - 0.024, tv.h - 0.024, 0.002, M.screen, { r: 0, cast: false });
    lights.tv = pointLight(root, tv.x0 + tv.w / 2, tv.y0 + tv.h / 2, 0.9, '#D7B3C9', 3.2);

    // paneles de listones corredizos (4 hojas en 2 rieles) que ocultan la TV — solo el modelo de muestra
    if (ex.listones) {
      const pw = (tv.w + 0.12) / 4, pY = Math.max(L.cTop + 0.03, tv.y0 - 0.12), pH = tv.y0 + tv.h + 0.12 - pY;
      const cover0 = tv.x0 + tv.w / 2 - 2 * pw, zb = tvZ + 0.049, zf = tvZ + 0.083;
      B(root, cover0 - pw - 0.06, pY + pH + 0.006, tvZ + 0.045, 6 * pw + 0.12, 0.035, 0.075, M.frame, { r: 0.003 });
      const slats = 7, sw = 0.04, gap = (pw - slats * sw) / (slats - 1);
      panels = [0, 1, 2, 3].map((j) => {
        const front = j === 0 || j === 3;
        const g = G(root, cover0 + j * pw, pY, front ? zf : zb, 'listones');
        B(g, 0.004, 0.01, 0, pw - 0.008, pH - 0.02, 0.01, M.felt, { r: 0 });
        for (let k = 0; k < slats; k++) B(g, k * (sw + gap), 0, 0.01, sw, pH, 0.022, M.slat, { r: 0.004 });
        const open = [cover0 - pw - 0.03, cover0 - pw - 0.012, cover0 + 4 * pw + 0.012, cover0 + 4 * pw + 0.03][j];
        return { g, closed: cover0 + j * pw, open, inner: !front };
      });
      labels.push({ text: 'Listones corredizos', sub: 'ocultan la pantalla', pos: new THREE.Vector3(cover0 + 2 * pw, pY + pH * 0.5, zf + 0.03), dir: [-40, -110] });
    }
  }

  return { labels, lights, doorRigs, panels, towerLights, halo, geo: { x0: L.x0, w: L.w, dep, tw, cx0: L.cx0, cl: L.cl, z0, towers: [L.hasLeft && L.tLx, L.hasRight && L.tRx].filter((v) => v !== false) } };
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
  const D_ = design;
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

    // luz del mueble (`led`): LED bajo cada repisa + fondo de las torres, y halo detrás del panel de TV
    const kt = D_.towersLit ? v.led : 0;
    M.led.emissiveIntensity = 4 * kt;
    for (const tl of mw.towerLights) {
      tl.mat.emissiveIntensity = 1.3 * kt;
      for (const l of tl.lights) l.intensity = 0.3 * kt * (1 - 0.9 * v.luzDia);   // de día su derrame por los costados quemaría el muro
    }
    if (mw.halo) mw.halo.material.opacity = 0.95 * v.led;
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(-room.T, -room.SLAB, -room.T),
    new THREE.Vector3(room.W + room.T, room.H, room.D + room.T)
  );

  return { scene, root, decor, apply, bounds, room, labels: mw.labels, layout: { ...mw.geo, table: fu.table }, materials: M };
}

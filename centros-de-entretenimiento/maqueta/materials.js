/* Faro 33 — Maqueta 3D: materiales y texturas procedurales (CanvasTexture, nada se descarga). */
import * as THREE from 'three';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

/* Pseudo-aleatorio determinista: la misma veta en cada carga. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function woodGrain(base, dark, seed = 7) {
  return canvas(512, 512, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x0 = r() * w, amp = 2 + r() * 6, freq = 0.004 + r() * 0.01, ph = r() * 6.28;
      g.strokeStyle = dark; g.globalAlpha = 0.04 + r() * 0.08; g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      for (let y = 0; y <= h; y += 8) g.lineTo(x0 + Math.sin(y * freq + ph) * amp, y);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

/* Mármol: vetas + juntas de placa de 122 cm, centradas (modelo de muestra) o desde la izquierda (como el plano del configurador). */
export function marbleTexture(panelW, panelH, seams = 'center', slab = 1.22) {
  const px = 380; // px por metro
  const c = canvas(Math.round(panelW * px), Math.round(panelH * px), (g, w, h) => {
    const r = rng(33);
    g.fillStyle = '#E9E3D8'; g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(200,188,168,0.3)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    /* vetas diagonales largas: halo difuso + trazo fino, con ramas cortas */
    const vein = (x, y, ang, len, soft) => {
      const pts = [[x, y]];
      let a = ang;
      for (let s = 0; s < len; s += 24) {
        a += (r() - 0.5) * 0.35;
        x += Math.cos(a) * 24; y += Math.sin(a) * 24;
        pts.push([x, y]);
      }
      const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); };
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = '#B3A48C'; g.globalAlpha = 0.07 * soft; g.lineWidth = 16; path(); g.stroke();
      g.strokeStyle = '#9C8C74'; g.globalAlpha = 0.18 * soft; g.lineWidth = 5; path(); g.stroke();
      g.strokeStyle = '#7E6E58'; g.globalAlpha = 0.45 * soft; g.lineWidth = 1.2; path(); g.stroke();
      return pts;
    };
    const veins = Math.max(5, Math.round(9 * panelW / 2.72));
    for (let i = 0; i < veins; i++) {
      const pts = vein(r() * w * 1.1 - w * 0.2, -30 + r() * h * 0.3, 1.05 + (r() - 0.5) * 0.4, h * (0.8 + r() * 0.6), 0.7 + r() * 0.5);
      for (let b = 0; b < 3; b++) {
        const p = pts[Math.floor(r() * pts.length)];
        vein(p[0], p[1], 1.05 + (r() - 0.5) * 1.6, 60 + r() * 160, 0.5);
      }
    }
    g.globalAlpha = 0.55; g.strokeStyle = '#B9AD99'; g.lineWidth = 1.5;
    const sp = slab * px, xs = [];
    if (seams === 'left') for (let x = sp; x < w - 2; x += sp) xs.push(x);
    else for (let k = 0; w / 2 - sp / 2 - k * sp > 2; k++) xs.push(w / 2 - sp / 2 - k * sp, w / 2 + sp / 2 + k * sp);
    for (const sx of xs) { g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, h); g.stroke(); }
    g.globalAlpha = 1;
  });
  return tex(c);
}

/* Piedra: piezas de 60 × 120 a hueso (hiladas desfasadas), desde la esquina superior izquierda, como el plano 2D. */
export function stoneTexture(panelW, panelH, tw = 0.6, th = 1.2) {
  const px = 300;
  return tex(canvas(Math.round(panelW * px), Math.round(panelH * px), (g, w, h) => {
    const r = rng(71), TW = tw * px, TH = th * px;
    g.fillStyle = '#D5C8AD'; g.fillRect(0, 0, w, h);
    for (let row = 0, y = 0; y < h; row++, y += TH) {
      for (let x = row % 2 ? -TW / 2 : 0; x < w; x += TW) {
        const tone = 0.9 + r() * 0.14;
        g.fillStyle = `rgb(${Math.round(213 * tone)},${Math.round(200 * tone)},${Math.round(173 * tone)})`;
        g.fillRect(x + 1.5, y + 1.5, TW - 3, TH - 3);
        g.globalAlpha = 0.08;
        for (let k = 0; k < 14; k++) {
          g.fillStyle = r() > 0.5 ? '#8A7E68' : '#F2EADB';
          g.beginPath(); g.arc(x + r() * TW, y + r() * TH, 2 + r() * 10, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
      }
    }
    g.strokeStyle = 'rgba(110,98,78,0.55)'; g.lineWidth = 2;
    for (let row = 0, y = 0; y < h; row++, y += TH) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      for (let x = row % 2 ? -TW / 2 : 0; x < w; x += TW) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + TH); g.stroke(); }
    }
  }));
}

/* Papel tapiz: franjas verticales de 50 cm alternadas, desde la izquierda (como el plano 2D). */
export function wallpaperTexture(panelW, panelH, stripe = 0.5) {
  const px = 200;
  return tex(canvas(Math.round(panelW * px), Math.round(panelH * px), (g, w, h) => {
    const S = stripe * px;
    g.fillStyle = '#F1ECE2'; g.fillRect(0, 0, w, h);
    for (let i = 0, x = 0; x < w; i++, x += S) {
      if (i % 2) { g.fillStyle = '#DCE5EE'; g.fillRect(x, 0, S, h); }
      g.fillStyle = 'rgba(19,48,92,0.06)';
      for (let k = 6; k < S; k += 12) g.fillRect(x + k, 0, 1, h);
    }
  }));
}

export function wallTexture(key, panelW, panelH, seams) {
  if (key === 'marmol') return marbleTexture(panelW, panelH, seams);
  if (key === 'piedra') return stoneTexture(panelW, panelH);
  if (key === 'papel') return wallpaperTexture(panelW, panelH);
  return null;
}

/* Acabado del mueble (mismas opciones que el configurador). */
export function finishSet(M, key) {
  if (key === 'roble') return { body: M.oak, door: M.oakDoor, inner: M.oakInner };
  if (key === 'nogal') return { body: M.walnut, door: M.walnutDoor, inner: M.walnutInner };
  if (key === 'blanco') return { body: M.white, door: M.whiteDoor, inner: M.whiteInner };
  return { body: M.navy, door: M.navyDoor, inner: M.navyInner };
}

function rugTexture() {
  return tex(canvas(512, 384, (g, w, h) => {
    g.fillStyle = '#D9CEBD'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#B9AB95'; g.lineWidth = 5; g.strokeRect(26, 26, w - 52, h - 52);
    g.strokeStyle = 'rgba(0,0,0,0.035)'; g.lineWidth = 1;
    for (let y = 0; y < h; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }));
}

function artTexture() {
  return tex(canvas(300, 400, (g, w, h) => {
    g.fillStyle = '#F3EEE5'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#B4512F'; g.beginPath(); g.arc(w / 2, h * 0.42, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#13305C'; g.fillRect(w * 0.2, h * 0.72, w * 0.6, 6);
  }));
}

/* Imagen de la TV: atardecer sobre el mar (evoca el video, sin usar fotos de terceros). */
function screenTexture() {
  return tex(canvas(512, 292, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, '#2B3A67'); sky.addColorStop(0.55, '#C4707A'); sky.addColorStop(1, '#F2B27A');
    g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62);
    const sea = g.createLinearGradient(0, h * 0.62, 0, h);
    sea.addColorStop(0, '#3C4A78'); sea.addColorStop(1, '#141C3A');
    g.fillStyle = sea; g.fillRect(0, h * 0.62, w, h);
    g.fillStyle = '#FFE2B0'; g.beginPath(); g.arc(w / 2, h * 0.6, 22, Math.PI, 0); g.fill();
    const r = rng(5);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,214,160,${0.25 + r() * 0.5})`;
      const y = h * 0.64 + r() * h * 0.3, sp = 8 + (y - h * 0.64) * 0.6;
      g.fillRect(w / 2 - sp / 2 + (r() - 0.5) * sp, y, 6 + r() * 14, 1.5);
    }
  }));
}

export function contactShadowTexture() {
  return tex(canvas(256, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.22)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }), { srgb: false });
}

export function createMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const oakMap = tex(woodGrain('#C9A36E', '#6E4E2A', 11));
  const oakDoorMap = tex(woodGrain('#C49C66', '#6E4E2A', 23));
  const slatMap = tex(woodGrain('#B98D57', '#5E4122', 41));
  const doorMap = tex(woodGrain('#B08A5F', '#5E4122', 57));
  const walnutMap = tex(woodGrain('#6B4B35', '#2A1A10', 13));
  const walnutDoorMap = tex(woodGrain('#654531', '#2A1A10', 29));

  return {
    floor: std({ color: '#C9C2B7', roughness: 0.92 }),
    wall: std({ color: '#DDD6CC', roughness: 0.96 }),
    cap: std({ color: '#4B423B', roughness: 0.85 }),
    slab: std({ color: '#5A5048', roughness: 0.9 }),
    oak: std({ map: oakMap, roughness: 0.62 }),
    oakDoor: std({ map: oakDoorMap, roughness: 0.58 }),
    oakInner: std({ color: '#B8915E', roughness: 0.7 }),
    walnut: std({ map: walnutMap, roughness: 0.55 }),
    walnutDoor: std({ map: walnutDoorMap, roughness: 0.5 }),
    walnutInner: std({ color: '#553A28', roughness: 0.7 }),
    navy: std({ color: '#1B3B69', roughness: 0.34 }),
    navyDoor: std({ color: '#1D3F70', roughness: 0.3 }),
    navyInner: std({ color: '#142C4E', roughness: 0.6 }),
    white: std({ color: '#ECE7DE', roughness: 0.78 }),
    whiteDoor: std({ color: '#F0EBE3', roughness: 0.74 }),
    whiteInner: std({ color: '#DDD6CA', roughness: 0.85 }),
    doorGlass: new THREE.MeshStandardMaterial({ color: '#D6E0E6', roughness: 0.15, transparent: true, opacity: 0.42, depthWrite: false }),
    slat: std({ map: slatMap, roughness: 0.6 }),
    felt: std({ color: '#3B3430', roughness: 1 }),
    door: std({ map: doorMap, roughness: 0.6 }),
    marble: std({ color: '#ffffff', roughness: 0.28 }),
    fabric: std({ color: '#E3DACB', roughness: 1 }),
    fabricDark: std({ color: '#D2C7B5', roughness: 1 }),
    terracotta: std({ color: '#B4512F', roughness: 0.95 }),
    olive: std({ color: '#5E6B3A', roughness: 0.95 }),
    cream: std({ color: '#F1EBDF', roughness: 1 }),
    emerald: std({ color: '#1F4D3F', roughness: 0.85 }),
    brass: std({ color: '#B8924A', roughness: 0.32, metalness: 0.85 }),
    black: std({ color: '#1A1B1D', roughness: 0.45 }),
    screen: std({ color: '#0B0C0E', roughness: 0.18, emissive: '#ffffff', emissiveMap: screenTexture(), emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: '#C9D6DE', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false }),
    frame: std({ color: '#3F3A35', roughness: 0.6, metalness: 0.2 }),
    curtain: std({ color: '#EEE7DA', roughness: 1, side: THREE.DoubleSide }),
    rug: std({ map: rugTexture(), roughness: 1 }),
    leaf: std({ color: '#4E6A3E', roughness: 0.8 }),
    pot: std({ color: '#CDBFAA', roughness: 0.9 }),
    art: std({ map: artTexture(), roughness: 0.9 }),
    led: std({ color: '#FFD9A3', emissive: '#FFB866', emissiveIntensity: 0, roughness: 0.4 }),
    ledBar: std({ color: '#FFD9A3', emissive: '#FFC98A', emissiveIntensity: 0, roughness: 0.4 }),
    shade: std({ color: '#2B2A28', roughness: 0.5, metalness: 0.3 }),
    bulb: std({ color: '#FFF1D6', emissive: '#FFC27A', emissiveIntensity: 0 }),
    bottle: std({ color: '#5B7A4E', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }),
    bottleAmber: std({ color: '#8A4F1E', roughness: 0.15, transparent: true, opacity: 0.85 }),
    shelfGlass: new THREE.MeshStandardMaterial({ color: '#E8EEF0', roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }),
    consoleWhite: std({ color: '#EDEDED', roughness: 0.4 }),
    book: ['#B4512F', '#13305C', '#C9BCA1', '#5E6B3A', '#8A7E68', '#E2C99A'].map((c) => std({ color: c, roughness: 0.9 })),
  };
}

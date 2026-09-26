/* Faro 33 — Maqueta 3D: vistas Carpintería y Planta (etiquetas, cotas y maqueta blanca). */
import * as THREE from 'three';

/* Estados de canales que muestra cada vista (lo abierto se lee mejor en Carpintería). */
export const VIEW_STATES = {
  carpinteria: { luzDia: 1, noche: 0, calidez: 0, lampara: 0, mesa: 0, cortinas: 0, paneles: 1, tv: 0, consolas: 1, led: 1, bar: 1, barLuz: 1, pufs: 0 },
  planta: { luzDia: 1, noche: 0, calidez: 0, lampara: 0, mesa: 0, cortinas: 0, paneles: 0, tv: 0, consolas: 0, led: 0, bar: 0, barLuz: 0, pufs: 0 }
};

export const VIEW_NOTES = {
  carpinteria: 'En madera: todo lo que fabricamos en nuestro taller.',
  planta: 'Planta · cotas en centímetros'
};

const CLAY = new THREE.MeshStandardMaterial({ color: '#E4DFD7', roughness: 1 });

/* Lo que no fabrica Faro 33 pasa a maqueta blanca (opaca: la oclusión ambiental sigue limpia). */
export function setClay(group, on) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (on) {
      if (!o.userData.mat) o.userData.mat = o.material;
      o.material = CLAY;
    } else if (o.userData.mat) {
      o.material = o.userData.mat;
    }
  });
}

const v3 = new THREE.Vector3();
function toScreen(p, camera, w, h) {
  v3.copy(p).project(camera);
  return [(v3.x + 1) / 2 * w, (1 - v3.y) / 2 * h];
}

/* Etiqueta = punto sobre la pieza + línea guía + caja desplazada en la dirección `dir` (px). */
export function createLabels(container, labels) {
  const els = labels.map((l) => {
    const d = document.createElement('div');
    d.className = 'lbl3d';
    d.innerHTML = `<i></i><em></em><span><b>${l.text}</b>${l.sub ? `<small>${l.sub}</small>` : ''}</span>`;
    container.appendChild(d);
    return { root: d, lead: d.querySelector('em'), box: d.querySelector('span') };
  });
  return {
    update(camera, w, h) {
      const k = Math.min(1, w / 1200) * (w < 700 ? 0.8 : 1);
      labels.forEach((l, i) => {
        const [x, y] = toScreen(l.pos, camera, w, h);
        const [dx, dy] = (l.dir || [40, -30]).map((n) => n * k);
        const e = els[i];
        e.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        e.lead.style.width = `${Math.hypot(dx, dy).toFixed(1)}px`;
        e.lead.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
        e.box.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) translate(${dx < 0 ? '-100%' : '0'}, -50%)`;
      });
    }
  };
}

export function createCotas(svg, layout, room) {
  const { W, D, T } = room, L = layout, y = 0.02, cm = (m) => Math.round(m * 100);
  const P = (x, z) => new THREE.Vector3(x, y, z);
  const front = L.z0 + L.dep, tx = L.table.x + L.table.l + 0.28;
  const cotas = [
    { a: P(0, -T - 0.32), b: P(W, -T - 0.32), text: `${cm(W)}` },
    { a: P(-T - 0.32, 0), b: P(-T - 0.32, D), text: `${cm(D)}` },
    { a: P(L.x0, front + 0.2), b: P(L.x0 + L.w, front + 0.2), text: `Muro TV ${cm(L.w)}` },
    { a: P(L.cx0, front + 0.5), b: P(L.cx0 + L.cl, front + 0.5), text: `Consola ${cm(L.cl)}` },
    { a: P(L.x0 - 0.2, L.z0), b: P(L.x0 - 0.2, front), text: `${cm(L.dep)}` },
    { a: P(tx, front), b: P(tx, L.table.z), text: `Paso ${cm(L.table.z - front)}` }
  ];
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  return {
    update(camera, w, h) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.innerHTML = '';
      for (const c of cotas) {
        const [x1, y1] = toScreen(c.a, camera, w, h), [x2, y2] = toScreen(c.b, camera, w, h);
        const g = mk('g', {});
        g.appendChild(mk('line', { x1, y1, x2, y2, class: 'c-line' }));
        for (const [px, py] of [[x1, y1], [x2, y2]]) g.appendChild(mk('line', { x1: px - 5, y1: py + 5, x2: px + 5, y2: py - 5, class: 'c-tick' }));
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
        const ang = vertical ? -90 : 0;
        const tw = c.text.length * 6.6 + 14;
        const lab = mk('g', { transform: `translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${ang})` });
        lab.appendChild(mk('rect', { x: -tw / 2, y: -10, width: tw, height: 20, rx: 10, class: 'c-bg' }));
        const t = mk('text', { x: 0, y: 4, 'text-anchor': 'middle', class: 'c-txt' });
        t.textContent = c.text;
        lab.appendChild(t);
        g.appendChild(lab);
        svg.appendChild(g);
      }
    }
  };
}

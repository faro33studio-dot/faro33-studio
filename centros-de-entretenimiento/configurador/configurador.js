/* Faro 33 — Configurador de centros de entretenimiento.
   Dibuja vista de frente y planta (SVG, 1 unidad = 1 cm) a partir de un objeto de estado único:
   acabados atrás (franjas movibles) + consola de TV (compartimentos) + pantalla con panel flotante
   + torres de repisas (al lado del mueble o sobre él), iluminadas por dentro.
   La geometría de computeLayout() la replica wallLayout() en ../maqueta/scene.js: cambiar ambas a la vez.
   Sin dependencias externas. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var NAVY = '#13305C';
  var BRASS = '#B8924A';
  var PAPER = '#FBF8F2';
  var WARM = '#FFD08A';

  var FINISHES = [
    { key: 'navy',   name: 'Navy lacado',   hex: '#13305C', line: '#0A1B36', inner: '#0F2747' },
    { key: 'blanco', name: 'Blanco mate',   hex: '#F4EFE5', line: '#C9BCA1', inner: '#E6DFD2' },
    { key: 'roble',  name: 'Roble natural', hex: '#C7A56B', line: '#8A7E68', inner: '#B38F5A' },
    { key: 'nogal',  name: 'Nogal',         hex: '#5C4030', line: '#3B2A20', inner: '#4A3326' }
  ];

  var PANEL_TYPES = [
    { key: 'lambrin', name: 'Lambrín' },
    { key: 'marmol',  name: 'Mármol' },
    { key: 'piedra',  name: 'Piedra' },
    { key: 'papel',   name: 'Papel' }
  ];
  var TONES = { roble: '#C49A62', nogal: '#6B4B35', blanco: '#ECE7DE', negro: '#2F2B28' };
  var TONE_KEYS = ['roble', 'nogal', 'blanco', 'negro'];
  var MAX_PANELS = 3;

  var DOOR_LABELS = ['Abierto', 'Puerta lisa', 'Puerta con vidrio', 'Cajón'];

  var state = {
    w: 280, h: 220, d: 40,
    consoleLen: 200, consoleH: 35,
    cols: 4,
    doors: [1, 1, 1, 1],
    tvOn: true, tvW: 130, tvH: 70, tvPanel: false, tvPanelLit: true,
    towerCount: 0, towerSide: 'derecha', towerMount: 'lado', towerOffset: 0,
    towerW: 28, towerH: 200, towersLit: true,
    finish: 'navy',
    panels: []
  };

  function finishOf(key) {
    for (var i = 0; i < FINISHES.length; i++) if (FINISHES[i].key === key) return FINISHES[i];
    return FINISHES[0];
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ---------- geometría compartida (frente + planta; la maqueta 3D usa la misma regla) ----------
     Medidas en cm; alturas (y) desde el piso.
     · Torre "al lado": en el piso, pegada al extremo de la consola; el grupo torre+consola(+torre) va centrado
       en el muro y "mover torre" la separa de la consola.
     · Torre "sobre": apoyada en la cubierta de la consola, en su extremo; "mover torre" la recorre hacia el centro.
     · La TV se centra en el tramo libre de la consola (sin torres encima). */
  function computeLayout() {
    var w = state.w, h = state.h;
    var hasLeft = state.towerCount === 2 || (state.towerCount === 1 && state.towerSide === 'izquierda');
    var hasRight = state.towerCount === 2 || (state.towerCount === 1 && state.towerSide === 'derecha');
    var sides = (hasLeft ? 1 : 0) + (hasRight ? 1 : 0);
    var mount = state.towerMount;
    var tw = clamp(state.towerW, 20, Math.floor(w * 0.3));
    var ch = clamp(state.consoleH, 15, Math.max(15, h * 0.5));
    var cTop = 4 + ch;                           // la consola flota 4 cm sobre el piso
    var cl, cx0, off = 0, tLx = 0, tRx = 0, ty0 = 0, th = 0;
    var lim = { cl: w, off: 0, th: h };             // topes reales (múltiplos de 5, como los sliders)

    if (sides && mount === 'lado') {
      // la consola conserva su largo; la torre sólo se separa lo que cabe en el muro
      lim.cl = f5(w - sides * tw);
      cl = clamp(state.consoleLen, 80, lim.cl);
      lim.off = Math.min(120, Math.max(0, f5((w - cl - sides * tw) / sides)));
      off = clamp(state.towerOffset, 0, lim.off);
      var gx0 = (w - (cl + sides * (tw + off))) / 2;
      cx0 = gx0 + (hasLeft ? tw + off : 0);
      tLx = gx0; tRx = cx0 + cl + off;
      th = clamp(state.towerH, 40, h);
    } else {
      cl = clamp(state.consoleLen, 80, w);
      cx0 = (w - cl) / 2;
      if (sides) {
        lim.off = Math.min(120, Math.max(0, f5((cl - sides * tw - 40) / sides)));
        off = clamp(state.towerOffset, 0, lim.off);
        tLx = cx0 + off; tRx = cx0 + cl - tw - off;
        lim.th = Math.max(30, f5(h - cTop - 4));
        ty0 = cTop; th = clamp(state.towerH, 30, lim.th);
      }
    }

    var fx0 = cx0, fx1 = cx0 + cl;
    if (sides && mount === 'sobre') { if (hasLeft) fx0 = tLx + tw; if (hasRight) fx1 = tRx; }

    var tv = null, panel = null;
    if (state.tvOn) {
      var tvW = clamp(state.tvW, 40, Math.max(40, fx1 - fx0 - 10));
      var tvH = clamp(state.tvH, 20, Math.max(20, h - cTop - 20));
      var top = Math.min(h - 4, cTop + 12 + tvH);
      tv = { x: (fx0 + fx1) / 2 - tvW / 2, y0: top - tvH, w: tvW, h: tvH };
      if (state.tvPanel) {
        var pw = Math.min(tvW + 50, fx1 - fx0);
        var py0 = Math.max(cTop + 4, tv.y0 - 18), py1 = Math.min(h - 6, top + 18);
        panel = { x: tv.x + tvW / 2 - pw / 2, y0: py0, w: pw, h: py1 - py0 };
      }
    }

    return {
      w: w, h: h, hasLeft: hasLeft, hasRight: hasRight, sides: sides, mount: mount, off: off,
      tw: tw, th: th, ty0: ty0, tLx: tLx, tRx: tRx,
      cl: cl, ch: ch, cx0: cx0, cTop: cTop, fx0: fx0, fx1: fx1, tv: tv, panel: panel, lim: lim
    };
  }
  function f5(v) { return Math.floor(v / 5) * 5; }

  /* ---------- cotas (líneas de dimensión estilo arquitectónico) ---------- */
  function tick(cx, cy, len) {
    var a = len / 2;
    return el('line', { x1: cx - a, y1: cy + a, x2: cx + a, y2: cy - a, stroke: NAVY, 'stroke-width': 0.35 });
  }

  function dimHorizontal(g, x1, x2, y, dimY, label) {
    g.appendChild(el('line', { x1: x1, y1: y, x2: x1, y2: dimY - 2, stroke: NAVY, 'stroke-width': 0.25, opacity: 0.55 }));
    g.appendChild(el('line', { x1: x2, y1: y, x2: x2, y2: dimY - 2, stroke: NAVY, 'stroke-width': 0.25, opacity: 0.55 }));
    g.appendChild(el('line', { x1: x1, y1: dimY, x2: x2, y2: dimY, stroke: NAVY, 'stroke-width': 0.3 }));
    g.appendChild(tick(x1, dimY, 3));
    g.appendChild(tick(x2, dimY, 3));
    var midX = (x1 + x2) / 2;
    g.appendChild(el('rect', { x: midX - (String(label).length * 2.1 + 3), y: dimY - 4.4, width: (String(label).length * 2.1 + 3) * 2, height: 8, fill: PAPER }));
    var t = el('text', { x: midX, y: dimY + 2.4, 'text-anchor': 'middle', 'font-size': 6.6, fill: NAVY, 'font-family': 'var(--font-ui, sans-serif)', 'font-weight': '600' });
    t.textContent = label;
    g.appendChild(t);
  }

  function dimVertical(g, y1, y2, x, dimX, label) {
    g.appendChild(el('line', { x1: x, y1: y1, x2: dimX + 2, y2: y1, stroke: NAVY, 'stroke-width': 0.25, opacity: 0.55 }));
    g.appendChild(el('line', { x1: x, y1: y2, x2: dimX + 2, y2: y2, stroke: NAVY, 'stroke-width': 0.25, opacity: 0.55 }));
    g.appendChild(el('line', { x1: dimX, y1: y1, x2: dimX, y2: y2, stroke: NAVY, 'stroke-width': 0.3 }));
    g.appendChild(tick(dimX, y1, 3));
    g.appendChild(tick(dimX, y2, 3));
    var midY = (y1 + y2) / 2;
    var t = el('text', {
      x: dimX - 3.5, y: midY, 'text-anchor': 'middle', 'font-size': 6.6, fill: NAVY,
      'font-family': 'var(--font-ui, sans-serif)', 'font-weight': '600',
      transform: 'rotate(-90 ' + (dimX - 3.5) + ' ' + midY + ')'
    });
    t.textContent = label;
    g.appendChild(t);
  }

  function caption(svg, x, y, text) {
    var t = el('text', { x: x, y: y, 'text-anchor': 'middle', 'font-size': 5, fill: NAVY, 'font-family': 'var(--font-ui, sans-serif)', opacity: 0.72 });
    t.textContent = text;
    svg.appendChild(t);
  }

  /* ---------- acabados atrás: franjas a todo lo alto, con su patrón desde su propia orilla ---------- */
  function drawPanel(svg, x, y, w, h, p, i) {
    var id = 'pnl' + i;
    var defs = el('defs', {});
    var cp = el('clipPath', { id: id });
    cp.appendChild(el('rect', { x: x, y: y, width: w, height: h }));
    defs.appendChild(cp);
    svg.appendChild(defs);
    var g = el('g', { 'clip-path': 'url(#' + id + ')' });

    if (p.type === 'lambrin') {
      var tone = TONES[p.tone] || TONES.roble, slat = 4, gap = 1.6;
      g.appendChild(el('rect', { x: x, y: y, width: w, height: h, fill: '#2A2522' }));
      for (var sx = x + gap / 2; sx < x + w; sx += slat + gap) {
        g.appendChild(el('rect', { x: sx, y: y, width: slat, height: h, fill: tone }));
        g.appendChild(el('line', { x1: sx + slat, y1: y, x2: sx + slat, y2: y + h, stroke: '#000', 'stroke-width': 0.3, opacity: 0.18 }));
      }
    } else if (p.type === 'marmol') {
      g.appendChild(el('rect', { x: x, y: y, width: w, height: h, fill: '#EDE7DA' }));
      var slab = 122, k = 0;
      for (var mx = x; mx < x + w; mx += slab, k++) {
        if (mx > x) g.appendChild(el('line', { x1: mx, y1: y, x2: mx, y2: y + h, stroke: '#C9BCA1', 'stroke-width': 0.25, opacity: 0.6 }));
        var v1 = (k * 41) % 100 + 10, v2 = (k * 67) % 90 + 15;
        g.appendChild(el('line', { x1: mx + v1, y1: y, x2: mx + v1 - 26, y2: y + h, stroke: '#9E927E', 'stroke-width': 0.45, opacity: 0.5 }));
        g.appendChild(el('line', { x1: mx + v2, y1: y + h * 0.15, x2: mx + v2 + 30, y2: y + h * 0.85, stroke: '#B8AE99', 'stroke-width': 0.35, opacity: 0.45 }));
      }
    } else if (p.type === 'piedra') {
      g.appendChild(el('rect', { x: x, y: y, width: w, height: h, fill: '#D8CBB0' }));
      for (var ry = y, ri = 0; ry < y + h; ry += 120, ri++) {
        for (var rx = x - (ri % 2 ? 30 : 0); rx < x + w; rx += 60) {
          g.appendChild(el('rect', { x: rx, y: ry, width: 60, height: 120, fill: 'none', stroke: '#8A7E68', 'stroke-width': 0.22, opacity: 0.6 }));
        }
      }
    } else {
      g.appendChild(el('rect', { x: x, y: y, width: w, height: h, fill: '#F4EFE5' }));
      for (var px = x, pi = 0; px < x + w; px += 50, pi++) {
        if (pi % 2) g.appendChild(el('rect', { x: px, y: y, width: 50, height: h, fill: '#E4ECF4' }));
      }
    }
    svg.appendChild(g);
    svg.appendChild(el('rect', { x: x, y: y, width: w, height: h, fill: 'none', stroke: NAVY, 'stroke-width': 0.2, opacity: 0.35 }));
  }

  function ensureDefs(svg) {
    var defs = el('defs', {});
    var lg = el('linearGradient', { id: 'shelfGlow', x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(el('stop', { offset: 0, 'stop-color': WARM, 'stop-opacity': 0.95 }));
    lg.appendChild(el('stop', { offset: 1, 'stop-color': WARM, 'stop-opacity': 0 }));
    defs.appendChild(lg);
    var fl = el('filter', { id: 'halo', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    fl.appendChild(el('feGaussianBlur', { stdDeviation: 3.2 }));
    defs.appendChild(fl);
    svg.appendChild(defs);
  }

  /* ---------- torres: repisas abiertas; si van iluminadas, la luz sale bajo cada repisa, por dentro ---------- */
  function drawTower(svg, x, y, w, h, f, lit, floor) {
    var t = 1.8, plinth = floor ? 8 : 0;
    svg.appendChild(el('rect', { x: x, y: y, width: w, height: h, fill: f.hex, stroke: f.line, 'stroke-width': 0.4 }));
    if (plinth) svg.appendChild(el('rect', { x: x + t, y: y + h - plinth, width: w - 2 * t, height: plinth, fill: '#3A3430' }));
    var ix = x + t, iw = w - 2 * t, top = y + t, bottom = y + h - plinth - t;
    svg.appendChild(el('rect', { x: ix, y: top, width: iw, height: bottom - top, fill: f.inner }));
    var n = Math.max(1, Math.round((bottom - top) / 38)), sp = (bottom - top) / n;
    for (var k = 0; k < n; k++) {
      var sy = top + k * sp;                       // cara inferior de la repisa (o del techo del mueble)
      if (lit) svg.appendChild(el('rect', { x: ix, y: sy, width: iw, height: sp * 0.8, fill: 'url(#shelfGlow)' }));
      if (k > 0) svg.appendChild(el('rect', { x: ix, y: sy - 1, width: iw, height: 2, fill: f.hex, stroke: f.line, 'stroke-width': 0.2 }));
      if (lit) svg.appendChild(el('line', { x1: ix + 1, y1: sy + 1.3, x2: ix + iw - 1, y2: sy + 1.3, stroke: '#FFF3D6', 'stroke-width': 0.8 }));
      // objetos sueltos en la repisa de abajo (alternados)
      var base = sy + sp - (k === n - 1 ? 0 : 1);
      if (k % 2 === 0) svg.appendChild(el('rect', { x: ix + iw * 0.18, y: base - sp * 0.42, width: iw * 0.16, height: sp * 0.42, rx: 1.5, fill: '#E8E1D4', opacity: 0.9 }));
      else svg.appendChild(el('rect', { x: ix + iw * 0.55, y: base - sp * 0.2, width: iw * 0.3, height: sp * 0.2, fill: '#8A7E68', opacity: 0.8 }));
    }
    svg.appendChild(el('rect', { x: x, y: y, width: w, height: h, fill: 'none', stroke: f.line, 'stroke-width': 0.5 }));
  }

  /* ---------- compartimentos de la consola ---------- */
  function drawCompartments(svg, bx0, by0, totalLen, totalH, n, doors, f) {
    var bw = totalLen / n;
    svg.appendChild(el('rect', { x: bx0, y: by0, width: totalLen, height: totalH, fill: f.inner, stroke: f.line, 'stroke-width': 0.4 }));
    for (var i = 0; i < n; i++) {
      var bx = bx0 + i * bw, by = by0;
      var doorState = doors[i] || 0;
      var g = el('g', { class: 'cfg-bay', 'data-idx': i });
      g.appendChild(el('rect', { x: bx, y: by, width: bw, height: totalH, fill: 'transparent', stroke: f.line, 'stroke-width': 0.35 }));

      if (doorState === 0) {
        g.appendChild(el('line', { x1: bx + 2, y1: by + totalH * 0.55, x2: bx + bw - 2, y2: by + totalH * 0.55, stroke: f.line, 'stroke-width': 0.4 }));
      } else if (doorState === 1) {
        g.appendChild(el('rect', { x: bx + 0.6, y: by + 0.6, width: bw - 1.2, height: totalH - 1.2, fill: f.hex, stroke: f.line, 'stroke-width': 0.3 }));
        var pullX = (i % 2 === 0) ? bx + bw - 4 : bx + 4;
        g.appendChild(el('line', { x1: pullX, y1: by + totalH * 0.42, x2: pullX, y2: by + totalH * 0.58, stroke: BRASS, 'stroke-width': 0.7, 'stroke-linecap': 'round' }));
      } else if (doorState === 2) {
        g.appendChild(el('rect', { x: bx + 0.6, y: by + 0.6, width: bw - 1.2, height: totalH - 1.2, fill: '#F2F6FA', stroke: f.line, 'stroke-width': 0.3 }));
        var gx1 = bx + bw * 0.18, gy1 = by + totalH * 0.15, gx2 = bx + bw * 0.82, gy2 = by + totalH * 0.85;
        g.appendChild(el('line', { x1: gx1, y1: gy1, x2: gx2, y2: gy2, stroke: '#93AECC', 'stroke-width': 0.3 }));
        g.appendChild(el('line', { x1: gx2, y1: gy1, x2: gx1, y2: gy2, stroke: '#93AECC', 'stroke-width': 0.3 }));
        var pullX2 = (i % 2 === 0) ? bx + bw - 4 : bx + 4;
        g.appendChild(el('line', { x1: pullX2, y1: by + totalH * 0.42, x2: pullX2, y2: by + totalH * 0.58, stroke: BRASS, 'stroke-width': 0.7, 'stroke-linecap': 'round' }));
      } else {
        g.appendChild(el('rect', { x: bx + 0.6, y: by + 0.6, width: bw - 1.2, height: totalH - 1.2, fill: f.hex, stroke: f.line, 'stroke-width': 0.3 }));
        g.appendChild(el('line', { x1: bx + bw * 0.3, y1: by + totalH * 0.22, x2: bx + bw * 0.7, y2: by + totalH * 0.22, stroke: BRASS, 'stroke-width': 0.7, 'stroke-linecap': 'round' }));
        g.appendChild(el('line', { x1: bx + 1, y1: by + totalH * 0.42, x2: bx + bw - 1, y2: by + totalH * 0.42, stroke: f.line, 'stroke-width': 0.2, opacity: 0.6 }));
      }
      svg.appendChild(g);
    }
  }

  /* ---------- vista de frente ---------- */
  function renderFront(L) {
    var svg = document.getElementById('svg-front');
    svg.innerHTML = '';
    ensureDefs(svg);
    var f = finishOf(state.finish);
    var mL = 32, mT = 26, mR = 14, mB = 14;
    var w = L.w, h = L.h;
    svg.setAttribute('viewBox', '0 0 ' + (w + mL + mR) + ' ' + (h + mT + mB));
    var x0 = mL, y0 = mT, floorY = y0 + h;
    var Y = function (up) { return floorY - up; };      // altura desde el piso → coordenada SVG

    /* muro pintado + acabados atrás */
    svg.appendChild(el('rect', { x: x0, y: y0, width: w, height: h, fill: PAPER }));
    state.panels.forEach(function (p, i) { drawPanel(svg, x0 + p.x, y0, p.w, h, p, i); });
    svg.appendChild(el('rect', { x: x0, y: y0, width: w, height: h, fill: 'none', stroke: NAVY, 'stroke-width': 0.4, opacity: 0.5 }));
    svg.appendChild(el('line', { x1: x0, y1: floorY, x2: x0 + w, y2: floorY, stroke: NAVY, 'stroke-width': 0.45 }));

    /* panel flotante detrás de la TV (con halo de luz si va iluminado) */
    if (L.panel) {
      var P = L.panel;
      if (state.tvPanelLit) svg.appendChild(el('rect', { x: x0 + P.x - 5, y: Y(P.y0 + P.h) - 5, width: P.w + 10, height: P.h + 10, rx: 4, fill: WARM, opacity: 0.85, filter: 'url(#halo)' }));
      svg.appendChild(el('rect', { x: x0 + P.x, y: Y(P.y0 + P.h), width: P.w, height: P.h, fill: '#EFEAE2', stroke: '#C9BCA1', 'stroke-width': 0.35 }));
    }

    /* torres */
    var lit = state.towersLit, floor = L.mount === 'lado';
    var towers = [];
    if (L.hasLeft) towers.push(L.tLx);
    if (L.hasRight) towers.push(L.tRx);
    towers.forEach(function (tx) { drawTower(svg, x0 + tx, Y(L.ty0 + L.th), L.tw, L.th, f, lit, floor); });

    /* consola de TV */
    var cxAbs = x0 + L.cx0, cyAbs = Y(L.cTop);
    svg.appendChild(el('ellipse', { cx: cxAbs + L.cl / 2, cy: floorY + 1.4, rx: L.cl * 0.42, ry: 1.8, fill: '#0A1B36', opacity: 0.16 }));
    drawCompartments(svg, cxAbs, cyAbs, L.cl, L.ch, state.cols, state.doors, f);
    caption(svg, cxAbs + L.cl / 2, cyAbs + L.ch + 7.5, Math.round(L.cl) + '×' + Math.round(L.ch) + ' cm');
    if (towers.length) caption(svg, x0 + towers[0] + L.tw / 2, Y(L.ty0 + L.th) - 2.5, 'Torre ' + Math.round(L.tw) + '×' + Math.round(L.th));

    /* pantalla de TV */
    if (L.tv) {
      var T = L.tv, tx = x0 + T.x, ty = Y(T.y0 + T.h);
      svg.appendChild(el('rect', { x: tx, y: ty, width: T.w, height: T.h, fill: '#14171B', stroke: '#0A1B36', 'stroke-width': 0.5 }));
      svg.appendChild(el('rect', { x: tx + 1.4, y: ty + 1.4, width: Math.max(0, T.w - 2.8), height: Math.max(0, T.h - 2.8), fill: 'none', stroke: '#3A4048', 'stroke-width': 0.3, opacity: 0.6 }));
      var tvc = el('text', { x: tx + T.w / 2, y: ty + T.h / 2 + 2, 'text-anchor': 'middle', 'font-size': 5.4, fill: '#C9D2DC', 'font-family': 'var(--font-ui, sans-serif)', opacity: 0.8 });
      tvc.textContent = 'TV · ' + Math.round(T.w) + '×' + Math.round(T.h) + ' cm';
      svg.appendChild(tvc);
    }

    /* cotas generales */
    var dg = el('g');
    dimHorizontal(dg, x0, x0 + w, y0, y0 - 14, Math.round(w) + ' cm');
    dimVertical(dg, y0, y0 + h, x0, x0 - 18, Math.round(h) + ' cm');
    svg.appendChild(dg);
  }

  /* ---------- vista de planta ---------- */
  function renderPlan(L) {
    var svg = document.getElementById('svg-plan');
    svg.innerHTML = '';
    var f = finishOf(state.finish);
    var mL = 32, mT = 20, mR = 14, mB = 14;
    var w = L.w, d = state.d, wallThin = 3;
    svg.setAttribute('viewBox', '0 0 ' + (w + mL + mR) + ' ' + (wallThin + 4 + d + mT + mB));
    var x0 = mL, y0 = mT;

    svg.appendChild(el('rect', { x: x0, y: y0, width: w, height: wallThin, fill: NAVY, opacity: 0.85 }));
    /* acabados atrás: franja delgada sobre el muro */
    state.panels.forEach(function (p) {
      var c = p.type === 'lambrin' ? (TONES[p.tone] || TONES.roble) : p.type === 'marmol' ? '#DCD3C3' : p.type === 'piedra' ? '#C9BCA1' : '#DCE4EE';
      svg.appendChild(el('rect', { x: x0 + p.x, y: y0 + wallThin, width: p.w, height: 3, fill: c, stroke: '#8A7E68', 'stroke-width': 0.2 }));
    });
    var objY = y0 + wallThin + 3;

    svg.appendChild(el('rect', { x: x0 + L.cx0, y: objY, width: L.cl, height: d, fill: f.hex, stroke: f.line, 'stroke-width': 0.35 }));
    var n = state.cols, bw = L.cl / n;
    for (var i = 1; i < n; i++) {
      var lx = x0 + L.cx0 + i * bw;
      svg.appendChild(el('line', { x1: lx, y1: objY, x2: lx, y2: objY + d, stroke: f.line, 'stroke-width': 0.2, opacity: 0.6 }));
    }
    /* torres (sobre el mueble se dibujan encima de la consola, con contorno más marcado) */
    var td = Math.min(d, 35);
    [L.hasLeft ? L.tLx : null, L.hasRight ? L.tRx : null].forEach(function (tx) {
      if (tx === null) return;
      svg.appendChild(el('rect', { x: x0 + tx, y: objY, width: L.tw, height: td, fill: f.inner, stroke: NAVY, 'stroke-width': L.mount === 'sobre' ? 0.6 : 0.35 }));
    });
    svg.appendChild(el('line', { x1: x0, y1: objY + d, x2: x0 + w, y2: objY + d, stroke: NAVY, 'stroke-width': 0.4, opacity: 0.55 }));

    var dg = el('g');
    dimHorizontal(dg, x0, x0 + w, y0, y0 - 10, Math.round(w) + ' cm');
    dimVertical(dg, objY, objY + d, x0, x0 - 18, Math.round(d) + ' cm');
    svg.appendChild(dg);
  }

  /* ---------- resumen + WhatsApp ---------- */
  function towersText(L) {
    if (!L.sides) return '';
    var both = L.hasLeft && L.hasRight;
    return (both ? '2 torres' : '1 torre') + ' de ' + Math.round(L.tw) + '×' + Math.round(L.th) + ' cm ' +
      (L.mount === 'sobre' ? 'sobre el mueble' : 'al lado del mueble') + (state.towersLit ? (both ? ', iluminadas' : ', iluminada') : '');
  }

  function renderSummary(L) {
    var f = finishOf(state.finish), N = window.F33Diseno;
    document.getElementById('cta-summary').textContent = state.w + ' × ' + state.h + ' × ' + state.d + ' cm';
    var detail = 'Consola ' + Math.round(L.cl) + '×' + Math.round(L.ch) + ' cm · ' + f.name;
    if (L.sides) detail += ' · ' + (L.hasLeft && L.hasRight ? '2 torres' : '1 torre') + (L.mount === 'sobre' ? ' sobre el mueble' : ' al lado');
    if (state.panels.length) detail += ' · ' + state.panels.length + (state.panels.length > 1 ? ' acabados' : ' acabado');
    document.getElementById('cta-detail').textContent = detail;

    var msg = 'Hola Faro 33 — diseñé un centro de entretenimiento de ' + state.w + '×' + state.h + '×' + state.d + ' cm. ' +
      'Consola de TV de ' + Math.round(L.cl) + '×' + Math.round(L.ch) + ' cm, ' + state.cols + ' compartimentos';
    if (L.tv) msg += ', pantalla de ' + Math.round(L.tv.w) + '×' + Math.round(L.tv.h) + ' cm';
    if (L.panel) msg += ', panel flotante detrás de la TV' + (state.tvPanelLit ? ' con luz' : '');
    if (L.sides) msg += ', ' + towersText(L);
    msg += '.';
    if (state.panels.length && N) msg += ' Acabados atrás: ' + N.describePanels(state.panels) + '.';
    msg += ' Acabado del mueble: ' + f.name + '.';
    if (N) {
      var code = N.encode(state);
      document.getElementById('cfg-3d').setAttribute('href', '/centros-de-entretenimiento/maqueta/#d=' + code);
      msg += ' Míralo en 3D: https://faro33studio.com/centros-de-entretenimiento/maqueta/#d=' + code;
      saveHash(code);
    }
    msg += ' ¿Podemos platicar sobre cotización?';
    document.getElementById('wa-cfg').setAttribute('href', 'https://wa.me/526675402559?text=' + encodeURIComponent(msg));

    var hint = document.getElementById('hint-toweroff');
    if (hint) {
      var room = L.lim.off || !L.sides;
      hint.textContent = L.mount === 'sobre'
        ? (room ? 'Recorre la torre sobre la cubierta, hacia el centro del mueble.' : 'Alarga la consola para poder recorrer la torre.')
        : (room ? 'Separa la torre del mueble (en 0 queda pegada).' : 'No queda espacio para separarla: acorta la consola o ensancha el muro.');
    }
  }

  /* La URL guarda el diseño (#d=…) para poder volver desde la maqueta 3D o compartirlo. */
  var ready = false, hashTimer = null;
  function saveHash(code) {
    if (!ready) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      if (location.hash !== '#d=' + code) history.replaceState(null, '', '#d=' + code);
    }, 400);
  }

  function restoreFromHash() {
    var d = window.F33Diseno && window.F33Diseno.fromHash(location.hash);
    if (!d) return;
    Object.keys(d).forEach(function (k) { state[k] = d[k]; });
    var vals = {
      'in-w': d.w, 'in-h': d.h, 'in-d': d.d, 'in-consolelen': d.consoleLen, 'in-consoleh': d.consoleH, 'in-cols': d.cols,
      'in-tvw': d.tvW, 'in-tvh': d.tvH, 'in-towerw': d.towerW, 'in-towerh': d.towerH, 'in-toweroff': d.towerOffset
    };
    Object.keys(vals).forEach(function (id) { document.getElementById(id).value = vals[id]; });
    document.getElementById('in-tv').checked = d.tvOn;
    document.getElementById('in-tvpanel').checked = d.tvPanel;
    document.getElementById('in-tvpanellit').checked = d.tvPanelLit;
    document.getElementById('in-towerslit').checked = d.towersLit;
    document.getElementById('out-finish').textContent = finishOf(d.finish).name;
  }

  /* Los sliders muestran lo que realmente se dibuja: tope según el espacio y valor efectivo (sin tocar `state`,
     para que al cambiar de "sobre" a "al lado" la torre recupere su alto). */
  var limitsOn = false;
  function limitRange(id, outId, lim, eff) {
    var input = document.getElementById(id);
    if (!input.dataset.max) input.dataset.max = input.max;
    input.max = Math.max(Number(input.min), Math.min(Number(input.dataset.max), lim));
    input.value = eff;
    document.getElementById(outId).textContent = Math.round(eff) + ' cm';
  }
  function syncLimits(L) {
    limitRange('in-consolelen', 'out-consolelen', L.lim.cl, L.cl);
    if (!L.sides) return;
    limitRange('in-toweroff', 'out-toweroff', L.lim.off, L.off);
    limitRange('in-towerh', 'out-towerh', L.lim.th, L.th);
  }

  function render() {
    var L = computeLayout();
    if (limitsOn) syncLimits(L);
    renderFront(L);
    renderPlan(L);
    renderSummary(L);
  }

  /* ---------- controles ---------- */
  function bindRange(id, outId, suffix, key, after) {
    var input = document.getElementById(id);
    var out = document.getElementById(outId);
    function sync() {
      state[key] = Number(input.value);
      if (out) out.textContent = input.value + (suffix || '');
      if (after) after();
      render();
    }
    input.addEventListener('input', sync);
    sync();
  }

  function buildSwatches() {
    var wrap = document.getElementById('swatches');
    FINISHES.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = f.hex;
      b.title = f.name;
      b.setAttribute('aria-label', f.name);
      b.setAttribute('aria-pressed', f.key === state.finish ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.finish = f.key;
        document.getElementById('out-finish').textContent = f.name;
        Array.prototype.forEach.call(wrap.querySelectorAll('.swatch'), function (s) { s.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        render();
      });
      wrap.appendChild(b);
    });
  }

  /* ---------- acabados atrás: lista editable (tipo, tono, cuánto cubre y dónde va) ---------- */
  function clampPanels() {
    state.panels = window.F33Diseno ? window.F33Diseno.sanitizePanels(state.panels, state.w) : state.panels;
  }

  function panelsLabel() {
    var out = document.getElementById('out-panels');
    if (out) out.textContent = state.panels.length ? state.panels.length + ' de ' + MAX_PANELS : 'Solo pintura';
    document.getElementById('btn-add-panel').disabled = state.panels.length >= MAX_PANELS;
  }

  function panelField(label, key, p, n, min, max, onInput) {
    var fld = document.createElement('div');
    fld.className = 'fld';
    fld.innerHTML = '<div class="lbl"><span></span><b></b></div><input type="range" step="5">';
    fld.querySelector('span').textContent = label;
    var out = fld.querySelector('b'), input = fld.querySelector('input');
    input.min = min; input.max = max; input.value = p[key];
    input.setAttribute('aria-label', label + ' (acabado ' + n + ')');
    out.textContent = p[key] + ' cm';
    input.addEventListener('input', function () { onInput(Number(input.value)); });
    return { fld: fld, input: input, out: out };
  }

  function buildPanelsUI() {
    var list = document.getElementById('panels-list');
    list.innerHTML = '';
    state.panels.forEach(function (p, i) {
      var box = document.createElement('div');
      box.className = 'pnl';
      var head = document.createElement('div');
      head.className = 'pnl-head';
      head.innerHTML = '<span></span><button type="button" class="pnl-del"></button>';
      head.querySelector('span').textContent = 'Acabado ' + (i + 1);
      var del = head.querySelector('.pnl-del');
      del.textContent = '×';
      del.setAttribute('aria-label', 'Quitar acabado ' + (i + 1));
      del.addEventListener('click', function () { state.panels.splice(i, 1); buildPanelsUI(); render(); });
      box.appendChild(head);

      var seg = document.createElement('div');
      seg.className = 'seg seg-sm';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Tipo de acabado ' + (i + 1));
      PANEL_TYPES.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'seg-btn'; b.textContent = t.name;
        b.setAttribute('aria-pressed', t.key === p.type ? 'true' : 'false');
        b.addEventListener('click', function () { p.type = t.key; buildPanelsUI(); render(); });
        seg.appendChild(b);
      });
      box.appendChild(seg);

      if (p.type === 'lambrin') {
        var tones = document.createElement('div');
        tones.className = 'tones';
        TONE_KEYS.forEach(function (k) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'tone'; b.style.background = TONES[k];
          b.title = 'Lambrín ' + k; b.setAttribute('aria-label', 'Lambrín ' + k);
          b.setAttribute('aria-pressed', k === p.tone ? 'true' : 'false');
          b.addEventListener('click', function () { p.tone = k; buildPanelsUI(); render(); });
          tones.appendChild(b);
        });
        box.appendChild(tones);
      }

      var pos;
      var cover = panelField('Cubre', 'w', p, i + 1, 10, state.w, function (v) {
        p.w = v; p.x = Math.min(p.x, state.w - p.w);
        cover.out.textContent = p.w + ' cm';
        pos.input.max = state.w - p.w; pos.input.value = p.x; pos.out.textContent = p.x + ' cm';
        render();
      });
      pos = panelField('Posición desde la izquierda', 'x', p, i + 1, 0, state.w - p.w, function (v) {
        p.x = v; pos.out.textContent = p.x + ' cm'; render();
      });
      box.appendChild(cover.fld);
      box.appendChild(pos.fld);
      list.appendChild(box);
    });
    panelsLabel();
  }

  function bindPanels() {
    document.getElementById('btn-add-panel').addEventListener('click', function () {
      if (state.panels.length >= MAX_PANELS) return;
      var end = state.panels.reduce(function (m, p) { return Math.max(m, p.x + p.w); }, 0);
      var w = Math.min(80, state.w);
      state.panels.push({ type: 'lambrin', tone: 'nogal', x: end + w <= state.w ? end : 0, w: w });
      buildPanelsUI();
      render();
    });
    buildPanelsUI();
  }

  function bindToggle(id, key, subId) {
    var chk = document.getElementById(id);
    var sub = subId ? document.getElementById(subId) : null;
    function sync() {
      state[key] = chk.checked;
      if (sub) sub.style.display = chk.checked ? 'flex' : 'none';
      render();
    }
    chk.addEventListener('change', sync);
    sync();
  }

  function bindSeg(containerId, initial, onChange) {
    var wrap = document.getElementById(containerId);
    var btns = Array.prototype.slice.call(wrap.querySelectorAll('.seg-btn'));
    function setActive(val) {
      btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-val') === String(val) ? 'true' : 'false'); });
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var val = b.getAttribute('data-val');
        setActive(val);
        onChange(val);
      });
    });
    setActive(initial);
  }

  function bindTowerControls() {
    var sub = document.getElementById('tower-subfields');
    var sideFld = document.getElementById('tower-side-fld');
    function vis() {
      sub.style.display = state.towerCount > 0 ? 'flex' : 'none';
      sideFld.style.display = state.towerCount === 1 ? 'flex' : 'none';
    }
    vis();
    bindSeg('seg-towercount', state.towerCount, function (val) {
      state.towerCount = Number(val);
      vis();
      render();
    });
    bindSeg('seg-towerside', state.towerSide, function (val) { state.towerSide = val; render(); });
    bindSeg('seg-towermount', state.towerMount, function (val) { state.towerMount = val; render(); });
  }

  function bindCanvasClicks() {
    document.getElementById('svg-front').addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('.cfg-bay') : null;
      if (!g) return;
      var idx = Number(g.getAttribute('data-idx'));
      state.doors[idx] = (state.doors[idx] + 1) % DOOR_LABELS.length;
      render();
    });
  }

  function syncDoorsLength() {
    var input = document.getElementById('in-cols');
    input.addEventListener('input', function () {
      var n = Number(input.value);
      while (state.doors.length < n) state.doors.push(1);
      state.doors.length = n;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    restoreFromHash();
    buildSwatches();
    bindToggle('in-tv', 'tvOn', 'tv-subfields');
    bindToggle('in-tvpanel', 'tvPanel', 'tvpanel-sub');
    bindToggle('in-tvpanellit', 'tvPanelLit');
    bindToggle('in-towerslit', 'towersLit');
    bindTowerControls();
    bindCanvasClicks();
    syncDoorsLength();
    bindRange('in-w', 'out-w', ' cm', 'w', function () {
      var before = JSON.stringify(state.panels);
      clampPanels();
      if (JSON.stringify(state.panels) !== before || document.querySelector('#panels-list input')) buildPanelsUI();
    });
    bindRange('in-h', 'out-h', ' cm', 'h');
    bindRange('in-d', 'out-d', ' cm', 'd');
    bindRange('in-consolelen', 'out-consolelen', ' cm', 'consoleLen');
    bindRange('in-consoleh', 'out-consoleh', ' cm', 'consoleH');
    bindRange('in-cols', 'out-cols', '', 'cols');
    bindRange('in-tvw', 'out-tvw', ' cm', 'tvW');
    bindRange('in-tvh', 'out-tvh', ' cm', 'tvH');
    bindRange('in-towerw', 'out-towerw', ' cm', 'towerW');
    bindRange('in-towerh', 'out-towerh', ' cm', 'towerH');
    bindRange('in-toweroff', 'out-toweroff', ' cm', 'towerOffset');
    bindPanels();
    limitsOn = true;
    render();
    ready = true;
  });
})();

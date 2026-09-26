/* Faro 33 — Configurador de centros de entretenimiento.
   Dibuja vista de frente y planta (SVG, 1 unidad = 1 cm) a partir de un objeto de estado único:
   muro (acabado) + consola de TV (compartimentos) + pantalla + torres laterales iluminadas.
   Sin dependencias externas. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var NAVY = '#13305C';
  var BRASS = '#B8924A';
  var PAPER = '#FBF8F2';

  var FINISHES = [
    { key: 'navy',   name: 'Navy lacado',  hex: '#13305C', line: '#0A1B36' },
    { key: 'blanco', name: 'Blanco mate',  hex: '#F4EFE5', line: '#C9BCA1' },
    { key: 'roble',  name: 'Roble natural',hex: '#C7A56B', line: '#8A7E68' },
    { key: 'nogal',  name: 'Nogal',        hex: '#5C4030', line: '#3B2A20' }
  ];

  var WALL_FINISHES = [
    { key: 'pintura', name: 'Pintura' },
    { key: 'marmol',  name: 'Mármol (122×280)' },
    { key: 'piedra',  name: 'Piedra mosaico (60×120)' },
    { key: 'papel',   name: 'Papel tapiz (franjas vert. 50cm)' }
  ];

  var DOOR_LABELS = ['Abierto', 'Puerta lisa', 'Puerta con vidrio', 'Cajón'];

  var state = {
    w: 280, h: 220, d: 40,
    wallFinish: 'pintura',
    consoleLen: 200, consoleH: 35,
    cols: 4,
    doors: [1, 1, 1, 1],
    tvOn: true, tvW: 130, tvH: 70,
    towerCount: 0, towerSide: 'derecha', towerStart: 'piso',
    towerW: 28, towerH: 200, towersLit: true,
    finish: 'navy'
  };

  function finishOf(key) {
    for (var i = 0; i < FINISHES.length; i++) if (FINISHES[i].key === key) return FINISHES[i];
    return FINISHES[0];
  }
  function wallFinishOf(key) {
    for (var i = 0; i < WALL_FINISHES.length; i++) if (WALL_FINISHES[i].key === key) return WALL_FINISHES[i];
    return WALL_FINISHES[0];
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ---------- geometría compartida (frente + planta usan los mismos cálculos) ---------- */
  function computeLayout() {
    var w = state.w, h = state.h;
    var hasLeft = state.towerCount === 2 || (state.towerCount === 1 && state.towerSide === 'izquierda');
    var hasRight = state.towerCount === 2 || (state.towerCount === 1 && state.towerSide === 'derecha');
    var towerWc = clamp(state.towerW, 20, Math.floor(w * 0.3));

    var innerLeft = hasLeft ? towerWc + 8 : 0;
    var innerRight = hasRight ? w - towerWc - 8 : w;
    var availWidth = Math.max(60, innerRight - innerLeft);
    var consoleLenC = clamp(state.consoleLen, 80, availWidth);
    var consoleHc = clamp(state.consoleH, 15, Math.max(15, h * 0.5));
    var consoleX = innerLeft + (availWidth - consoleLenC) / 2;
    var consoleGap = 4;
    var consoleTopY = h - consoleGap - consoleHc;

    var towerHc = 0, towerTopY = 0, towerBottomY = 0;
    if (hasLeft || hasRight) {
      if (state.towerStart === 'consola') {
        var maxH = Math.max(30, consoleTopY - 4);
        towerHc = clamp(state.towerH, 30, maxH);
        towerBottomY = consoleTopY;
      } else {
        towerHc = clamp(state.towerH, 40, h);
        towerBottomY = h;
      }
      towerTopY = towerBottomY - towerHc;
    }

    var tvOn = state.tvOn, tvWc = 0, tvHc = 0, tvX = 0, tvY = 0;
    if (tvOn) {
      tvWc = clamp(state.tvW, 40, w - 16);
      var maxTvH = consoleTopY - 16 - 4;
      tvHc = clamp(state.tvH, 20, Math.max(20, maxTvH));
      tvX = (w - tvWc) / 2;
      tvY = Math.max(4, consoleTopY - 12 - tvHc);
    }

    return {
      w: w, h: h,
      hasLeft: hasLeft, hasRight: hasRight, towerWc: towerWc, towerHc: towerHc, towerTopY: towerTopY,
      consoleLenC: consoleLenC, consoleHc: consoleHc, consoleX: consoleX, consoleTopY: consoleTopY,
      tvOn: tvOn, tvWc: tvWc, tvHc: tvHc, tvX: tvX, tvY: tvY
    };
  }

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

  /* ---------- acabado de muro (patrones) ---------- */
  function drawWallFinish(svg, x0, y0, w, h, key) {
    var uid = 'wf' + Math.round(x0 * 13 + y0 * 7 + w);
    var defs = el('defs', {});
    var cp = el('clipPath', { id: uid });
    cp.appendChild(el('rect', { x: x0, y: y0, width: w, height: h }));
    defs.appendChild(cp);
    svg.appendChild(defs);

    var g = el('g', { 'clip-path': 'url(#' + uid + ')' });
    var base = { pintura: '#FBF8F2', marmol: '#EDE7DA', piedra: '#D8CBB0', papel: '#F4EFE5' }[key] || '#FBF8F2';
    g.appendChild(el('rect', { x: x0, y: y0, width: w, height: h, fill: base }));

    if (key === 'marmol') {
      var slab = 122, i = 0;
      for (var sx = x0; sx < x0 + w; sx += slab, i++) {
        if (sx > x0) g.appendChild(el('line', { x1: sx, y1: y0, x2: sx, y2: y0 + h, stroke: '#C9BCA1', 'stroke-width': 0.25, opacity: 0.6 }));
        var v1 = (i * 41) % (slab - 20) + 10, v2 = (i * 67) % (slab - 30) + 15;
        g.appendChild(el('line', { x1: sx + v1, y1: y0, x2: sx + v1 - 26, y2: y0 + h, stroke: '#B8AE99', 'stroke-width': 0.35, opacity: 0.45 }));
        g.appendChild(el('line', { x1: sx + v2, y1: y0 + h * 0.15, x2: sx + v2 + 30, y2: y0 + h * 0.85, stroke: '#CFC6B4', 'stroke-width': 0.3, opacity: 0.4 }));
      }
    } else if (key === 'piedra') {
      var tw = 60, th = 120, ri = 0;
      for (var ry = y0; ry < y0 + h; ry += th, ri++) {
        var offset = (ri % 2 === 0) ? 0 : tw / 2;
        for (var rx = x0 - offset; rx < x0 + w; rx += tw) {
          g.appendChild(el('rect', { x: rx, y: ry, width: tw, height: th, fill: 'none', stroke: '#8A7E68', 'stroke-width': 0.22, opacity: 0.6 }));
        }
      }
    } else if (key === 'papel') {
      var stripe = 50, pi = 0;
      for (var px = x0; px < x0 + w; px += stripe, pi++) {
        if (pi % 2 === 1) g.appendChild(el('rect', { x: px, y: y0, width: Math.min(stripe, x0 + w - px), height: h, fill: '#E4ECF4' }));
        else if (px > x0) g.appendChild(el('line', { x1: px, y1: y0, x2: px, y2: y0 + h, stroke: '#C2D2E4', 'stroke-width': 0.2, opacity: 0.5 }));
      }
    }
    svg.appendChild(g);
  }

  /* ---------- torres laterales ---------- */
  function drawTower(svg, x, y, w, h, f, lit, glowSide) {
    svg.appendChild(el('rect', { x: x, y: y, width: w, height: h, fill: f.hex, stroke: f.line, 'stroke-width': 0.4 }));
    svg.appendChild(el('line', { x1: x + 1.5, y1: y + h * 0.33, x2: x + w - 1.5, y2: y + h * 0.33, stroke: f.line, 'stroke-width': 0.2, opacity: 0.5 }));
    svg.appendChild(el('line', { x1: x + 1.5, y1: y + h * 0.66, x2: x + w - 1.5, y2: y + h * 0.66, stroke: f.line, 'stroke-width': 0.2, opacity: 0.5 }));
    if (lit) {
      var edge = glowSide === 'right' ? x + w : x;
      var widths = [6, 3, 1.2], opacities = [0.14, 0.3, 0.6];
      for (var k = 0; k < 3; k++) {
        var ww = widths[k];
        var rx = glowSide === 'right' ? edge : edge - ww;
        svg.appendChild(el('rect', { x: rx, y: y + 2, width: ww, height: h - 4, fill: BRASS, opacity: opacities[k] }));
      }
    }
  }

  /* ---------- compartimentos de la consola ---------- */
  function drawCompartments(svg, bx0, by0, totalLen, totalH, n, doors, f) {
    var bw = totalLen / n;
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
    var f = finishOf(state.finish);
    var mL = 32, mT = 26, mR = 14, mB = 14;
    var w = L.w, h = L.h;
    svg.setAttribute('viewBox', '0 0 ' + (w + mL + mR) + ' ' + (h + mT + mB));
    var x0 = mL, y0 = mT, floorY = y0 + h;

    /* muro */
    drawWallFinish(svg, x0, y0, w, h, state.wallFinish);
    svg.appendChild(el('rect', { x: x0, y: y0, width: w, height: h, fill: 'none', stroke: NAVY, 'stroke-width': 0.4, opacity: 0.5 }));
    svg.appendChild(el('line', { x1: x0, y1: floorY, x2: x0 + w, y2: floorY, stroke: NAVY, 'stroke-width': 0.45 }));

    /* torres laterales */
    if (L.hasLeft || L.hasRight) {
      var tY = y0 + L.towerTopY;
      if (L.hasLeft) drawTower(svg, x0, tY, L.towerWc, L.towerHc, f, state.towersLit, 'right');
      if (L.hasRight) drawTower(svg, x0 + w - L.towerWc, tY, L.towerWc, L.towerHc, f, state.towersLit, 'left');
    }

    /* consola de TV */
    var consoleXabs = x0 + L.consoleX;
    var consoleYabs = y0 + L.consoleTopY;
    svg.appendChild(el('ellipse', { cx: consoleXabs + L.consoleLenC / 2, cy: floorY + 1.4, rx: L.consoleLenC * 0.42, ry: 1.8, fill: '#0A1B36', opacity: 0.16 }));
    drawCompartments(svg, consoleXabs, consoleYabs, L.consoleLenC, L.consoleHc, state.cols, state.doors, f);
    var ccap = el('text', { x: consoleXabs + L.consoleLenC / 2, y: consoleYabs - 3.2, 'text-anchor': 'middle', 'font-size': 5, fill: NAVY, 'font-family': 'var(--font-ui, sans-serif)', opacity: 0.7 });
    ccap.textContent = Math.round(L.consoleLenC) + '×' + Math.round(L.consoleHc) + ' cm';
    svg.appendChild(ccap);

    /* pantalla de TV */
    if (L.tvOn) {
      var tvXabs = x0 + L.tvX, tvYabs = y0 + L.tvY;
      svg.appendChild(el('line', { x1: tvXabs + L.tvWc / 2, y1: tvYabs + L.tvHc, x2: consoleXabs + L.consoleLenC / 2, y2: consoleYabs, stroke: NAVY, 'stroke-width': 0.25, 'stroke-dasharray': '1,1.4', opacity: 0.4 }));
      svg.appendChild(el('rect', { x: tvXabs, y: tvYabs, width: L.tvWc, height: L.tvHc, fill: '#14171B', stroke: '#0A1B36', 'stroke-width': 0.5 }));
      svg.appendChild(el('rect', { x: tvXabs + 1.4, y: tvYabs + 1.4, width: Math.max(0, L.tvWc - 2.8), height: Math.max(0, L.tvHc - 2.8), fill: 'none', stroke: '#3A4048', 'stroke-width': 0.3, opacity: 0.6 }));
      var tvc = el('text', { x: tvXabs + L.tvWc / 2, y: tvYabs + L.tvHc + 6, 'text-anchor': 'middle', 'font-size': 5.4, fill: NAVY, 'font-family': 'var(--font-ui, sans-serif)', opacity: 0.75 });
      tvc.textContent = 'TV · ' + Math.round(L.tvWc) + '×' + Math.round(L.tvHc) + ' cm';
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
    svg.setAttribute('viewBox', '0 0 ' + (w + mL + mR) + ' ' + (wallThin + d + mT + mB));
    var x0 = mL, y0 = mT;

    /* muro (delgado, al fondo) */
    svg.appendChild(el('rect', { x: x0, y: y0, width: w, height: wallThin, fill: NAVY, opacity: 0.85 }));

    var objY = y0 + wallThin;

    /* torres */
    if (L.hasLeft) svg.appendChild(el('rect', { x: x0, y: objY, width: L.towerWc, height: d, fill: f.hex, stroke: f.line, 'stroke-width': 0.3 }));
    if (L.hasRight) svg.appendChild(el('rect', { x: x0 + w - L.towerWc, y: objY, width: L.towerWc, height: d, fill: f.hex, stroke: f.line, 'stroke-width': 0.3 }));

    /* consola */
    svg.appendChild(el('rect', { x: x0 + L.consoleX, y: objY, width: L.consoleLenC, height: d, fill: f.hex, stroke: f.line, 'stroke-width': 0.35 }));
    var n = state.cols, bw = L.consoleLenC / n;
    for (var i = 1; i < n; i++) {
      var lx = x0 + L.consoleX + i * bw;
      svg.appendChild(el('line', { x1: lx, y1: objY, x2: lx, y2: objY + d, stroke: f.line, 'stroke-width': 0.2, opacity: 0.6 }));
    }
    svg.appendChild(el('line', { x1: x0, y1: objY + d, x2: x0 + w, y2: objY + d, stroke: NAVY, 'stroke-width': 0.4, opacity: 0.55 }));

    var dg = el('g');
    dimHorizontal(dg, x0, x0 + w, y0, y0 - 10, Math.round(w) + ' cm');
    dimVertical(dg, objY, objY + d, x0, x0 - 18, Math.round(d) + ' cm');
    svg.appendChild(dg);
  }

  /* ---------- resumen + WhatsApp ---------- */
  function renderSummary(L) {
    var f = finishOf(state.finish);
    var wf = wallFinishOf(state.wallFinish);
    document.getElementById('cta-summary').textContent = state.w + ' × ' + state.h + ' × ' + state.d + ' cm';
    var towersOn = L.hasLeft || L.hasRight;
    var towerCountLbl = (L.hasLeft && L.hasRight) ? '2 torres' : '1 torre';
    var towerStartLbl = state.towerStart === 'consola' ? 'sobre la consola' : 'desde el piso';

    var detail = 'Muro ' + wf.name + ' · Consola ' + Math.round(L.consoleLenC) + '×' + Math.round(L.consoleHc) + ' cm · ' + f.name;
    if (towersOn) detail += ' · ' + towerCountLbl + (state.towersLit ? ((L.hasLeft && L.hasRight) ? ' iluminadas' : ' iluminada') : '');
    document.getElementById('cta-detail').textContent = detail;

    var msg = 'Hola Faro 33 — diseñé un centro de entretenimiento de ' + state.w + '×' + state.h + '×' + state.d + ' cm. ' +
      'Muro: ' + wf.name + '. Consola de TV de ' + Math.round(L.consoleLenC) + '×' + Math.round(L.consoleHc) + ' cm, ' + state.cols + ' compartimentos';
    if (L.tvOn) msg += ', pantalla de ' + Math.round(L.tvWc) + '×' + Math.round(L.tvHc) + ' cm';
    var litLbl = (L.hasLeft && L.hasRight) ? ', iluminadas' : ', iluminada';
    if (towersOn) msg += ', ' + towerCountLbl + ' de ' + L.towerWc + '×' + L.towerHc + ' cm ' + towerStartLbl + (state.towersLit ? litLbl : '');
    msg += '. Acabado ' + f.name + '.';
    if (window.F33Diseno) {
      var code = window.F33Diseno.encode(state);
      document.getElementById('cfg-3d').setAttribute('href', '/centros-de-entretenimiento/maqueta/#d=' + code);
      msg += ' Míralo en 3D: https://faro33studio.com/centros-de-entretenimiento/maqueta/#d=' + code;
      saveHash(code);
    }
    msg += ' ¿Podemos platicar sobre cotización?';
    document.getElementById('wa-cfg').setAttribute('href', 'https://wa.me/526675402559?text=' + encodeURIComponent(msg));
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
      'in-tvw': d.tvW, 'in-tvh': d.tvH, 'in-towerw': d.towerW, 'in-towerh': d.towerH
    };
    Object.keys(vals).forEach(function (id) { document.getElementById(id).value = vals[id]; });
    document.getElementById('in-tv').checked = d.tvOn;
    document.getElementById('in-towerslit').checked = d.towersLit;
    document.getElementById('out-finish').textContent = finishOf(d.finish).name;
    document.getElementById('out-wallfinish').textContent = wallFinishOf(d.wallFinish).name;
  }

  function render() {
    var L = computeLayout();
    renderFront(L);
    renderPlan(L);
    renderSummary(L);
  }

  /* ---------- controles ---------- */
  function bindRange(id, outId, suffix, key) {
    var input = document.getElementById(id);
    var out = document.getElementById(outId);
    function sync() {
      state[key] = Number(input.value);
      if (out) out.textContent = input.value + (suffix || '');
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

  function wallFinishCss(key) {
    if (key === 'marmol') return 'linear-gradient(72deg, #EDE7DA 0%, #EDE7DA 40%, #D8CFC0 42%, #EDE7DA 46%, #EDE7DA 70%, #CFC6B4 72%, #EDE7DA 76%, #EDE7DA 100%)';
    if (key === 'piedra') return 'repeating-linear-gradient(0deg, #8A7E68 0, #8A7E68 1px, transparent 1px, transparent 11px), repeating-linear-gradient(90deg, #8A7E68 0, #8A7E68 1px, transparent 1px, transparent 16px), #D8CBB0';
    if (key === 'papel') return 'repeating-linear-gradient(90deg, #F4EFE5 0 6px, #E4ECF4 6px 12px)';
    return '#FBF8F2';
  }

  function buildWallSwatches() {
    var wrap = document.getElementById('wswatches');
    WALL_FINISHES.forEach(function (wf) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wswatch';
      b.style.backgroundImage = wallFinishCss(wf.key);
      b.title = wf.name;
      b.setAttribute('aria-pressed', wf.key === state.wallFinish ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.wallFinish = wf.key;
        document.getElementById('out-wallfinish').textContent = wf.name;
        Array.prototype.forEach.call(wrap.querySelectorAll('.wswatch'), function (s) { s.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        render();
      });
      wrap.appendChild(b);
    });
  }

  function bindTvToggle() {
    var chk = document.getElementById('in-tv');
    var sub = document.getElementById('tv-subfields');
    function sync() {
      state.tvOn = chk.checked;
      sub.style.display = state.tvOn ? 'flex' : 'none';
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
    bindSeg('seg-towerstart', state.towerStart, function (val) { state.towerStart = val; render(); });
  }

  function bindTowersLit() {
    var chk = document.getElementById('in-towerslit');
    chk.addEventListener('change', function () {
      state.towersLit = chk.checked;
      render();
    });
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
    buildWallSwatches();
    bindTvToggle();
    bindTowerControls();
    bindTowersLit();
    bindCanvasClicks();
    syncDoorsLength();
    bindRange('in-w', 'out-w', ' cm', 'w');
    bindRange('in-h', 'out-h', ' cm', 'h');
    bindRange('in-d', 'out-d', ' cm', 'd');
    bindRange('in-consolelen', 'out-consolelen', ' cm', 'consoleLen');
    bindRange('in-consoleh', 'out-consoleh', ' cm', 'consoleH');
    bindRange('in-cols', 'out-cols', '', 'cols');
    bindRange('in-tvw', 'out-tvw', ' cm', 'tvW');
    bindRange('in-tvh', 'out-tvh', ' cm', 'tvH');
    bindRange('in-towerw', 'out-towerw', ' cm', 'towerW');
    bindRange('in-towerh', 'out-towerh', ' cm', 'towerH');
    render();
    ready = true;
  });
})();

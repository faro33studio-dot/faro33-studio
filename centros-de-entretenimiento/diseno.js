/* Faro 33 — esquema compartido del diseño de centro de entretenimiento.
   Una sola fuente de verdad para rangos, nombres y el enlace `#d=` entre
   /configurador/ (lo escribe y lo restaura) y /maqueta/ (lo dibuja en 3D).
   Todo lo que llega por URL se sanea aquí: solo números acotados y valores de listas cerradas.
   Los enlaces viejos (con `towerStart` y `wallFinish`) se convierten al esquema actual. */
(function () {
  'use strict';

  // [mín, máx, por defecto] — deben coincidir con los <input type="range"> del configurador
  var NUM = {
    w: [180, 450, 280], h: [150, 280, 220], d: [30, 60, 40],
    consoleLen: [120, 240, 200], consoleH: [20, 45, 35], cols: [2, 6, 4],
    tvW: [40, 260, 130], tvH: [30, 120, 70],
    towerCount: [0, 2, 0], towerW: [20, 35, 28], towerH: [80, 240, 200], towerOffset: [0, 120, 0]
  };
  var ENUM = {
    towerSide: ['derecha', 'izquierda'],
    towerMount: ['lado', 'sobre'],        // al lado del mueble (en el piso) · sobre el mueble
    finish: ['navy', 'blanco', 'roble', 'nogal']
  };
  var BOOL = { tvOn: true, towersLit: true, tvPanel: false, tvPanelLit: true };

  var PANEL_TYPES = ['lambrin', 'marmol', 'piedra', 'papel'];
  var PANEL_TONES = ['roble', 'nogal', 'blanco', 'negro'];
  var MAX_PANELS = 3;

  var FINISH_NAMES = { navy: 'Navy lacado', blanco: 'Blanco mate', roble: 'Roble natural', nogal: 'Nogal' };
  var PANEL_NAMES = { lambrin: 'Lambrín', marmol: 'Mármol', piedra: 'Piedra mosaico', papel: 'Papel tapiz' };
  var TONE_NAMES = { roble: 'roble', nogal: 'nogal', blanco: 'blanco', negro: 'negro' };
  var DOOR_NAMES = ['Abierto', 'Puerta lisa', 'Puerta con vidrio', 'Cajón'];

  function clampInt(v, r) {
    var n = Number(v);
    if (!isFinite(n)) return r[2];
    return Math.round(Math.min(r[1], Math.max(r[0], n)));
  }

  /* Acabados atrás: franjas a todo lo alto del muro, cada una con tipo, tono, posición (x) y ancho (w) en cm. */
  function sanitizePanels(list, wall) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length && out.length < MAX_PANELS; i++) {
      var p = list[i];
      if (!p || typeof p !== 'object' || PANEL_TYPES.indexOf(p.type) < 0) continue;
      var x = clampInt(p.x, [0, wall - 10, 0]);
      var w = clampInt(p.w, [10, wall - x, wall - x]);
      out.push({ type: p.type, tone: PANEL_TONES.indexOf(p.tone) >= 0 ? p.tone : 'roble', x: x, w: w });
    }
    return out;
  }

  function sanitize(o) {
    o = o && typeof o === 'object' ? o : {};
    // enlaces anteriores: torre "desde el piso / sobre la consola" y acabado de muro completo
    if (!o.towerMount && o.towerStart) o = Object.assign({}, o, { towerMount: o.towerStart === 'consola' ? 'sobre' : 'lado' });
    if (!o.panels && ['marmol', 'piedra', 'papel'].indexOf(o.wallFinish) >= 0) o = Object.assign({}, o, { panels: [{ type: o.wallFinish, x: 0, w: 9999 }] });

    var s = {}, k;
    for (k in NUM) s[k] = clampInt(o[k], NUM[k]);
    for (k in ENUM) s[k] = ENUM[k].indexOf(o[k]) >= 0 ? o[k] : ENUM[k][0];
    for (k in BOOL) s[k] = typeof o[k] === 'boolean' ? o[k] : BOOL[k];
    var src = Array.isArray(o.doors) ? o.doors : [];
    s.doors = [];
    for (var i = 0; i < s.cols; i++) s.doors.push(clampInt(src[i], [0, 3, 1]));
    s.panels = sanitizePanels(o.panels, s.w);
    return s;
  }

  function encode(state) {
    return btoa(JSON.stringify(sanitize(state))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(str) {
    try {
      var b = String(str).replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      return sanitize(JSON.parse(atob(b)));
    } catch (e) {
      return null;
    }
  }

  function fromHash(hash) {
    var m = /(?:^#|&)d=([A-Za-z0-9_-]{8,3000})/.exec(hash || '');
    return m ? decode(m[1]) : null;
  }

  /* Descripción corta de los acabados, para resúmenes y WhatsApp. */
  function describePanels(panels) {
    return panels.map(function (p) {
      return PANEL_NAMES[p.type] + (p.type === 'lambrin' ? ' ' + TONE_NAMES[p.tone] : '') + ' ' + p.w + ' cm';
    }).join(', ');
  }

  window.F33Diseno = {
    NUM: NUM, ENUM: ENUM, PANEL_TYPES: PANEL_TYPES, PANEL_TONES: PANEL_TONES, MAX_PANELS: MAX_PANELS,
    FINISH_NAMES: FINISH_NAMES, PANEL_NAMES: PANEL_NAMES, TONE_NAMES: TONE_NAMES, DOOR_NAMES: DOOR_NAMES,
    sanitize: sanitize, sanitizePanels: sanitizePanels, encode: encode, decode: decode, fromHash: fromHash,
    describePanels: describePanels
  };
})();

/* Faro 33 — esquema compartido del diseño de centro de entretenimiento.
   Una sola fuente de verdad para rangos, nombres y el enlace `#d=` entre
   /configurador/ (lo escribe y lo restaura) y /maqueta/ (lo dibuja en 3D).
   Todo lo que llega por URL se sanea aquí: solo números acotados y valores de listas cerradas. */
(function () {
  'use strict';

  // [mín, máx, por defecto] — deben coincidir con los <input type="range"> del configurador
  var NUM = {
    w: [180, 450, 280], h: [150, 280, 220], d: [30, 60, 40],
    consoleLen: [120, 240, 200], consoleH: [20, 45, 35], cols: [2, 6, 4],
    tvW: [40, 260, 130], tvH: [30, 120, 70],
    towerCount: [0, 2, 0], towerW: [20, 35, 28], towerH: [80, 240, 200]
  };
  var ENUM = {
    wallFinish: ['pintura', 'marmol', 'piedra', 'papel'],
    towerSide: ['derecha', 'izquierda'],
    towerStart: ['piso', 'consola'],
    finish: ['navy', 'blanco', 'roble', 'nogal']
  };
  var BOOL = { tvOn: true, towersLit: true };

  var FINISH_NAMES = { navy: 'Navy lacado', blanco: 'Blanco mate', roble: 'Roble natural', nogal: 'Nogal' };
  var WALL_NAMES = { pintura: 'Pintura', marmol: 'Mármol', piedra: 'Piedra mosaico', papel: 'Papel tapiz' };
  var DOOR_NAMES = ['Abierto', 'Puerta lisa', 'Puerta con vidrio', 'Cajón'];

  function clampInt(v, r) {
    var n = Number(v);
    if (!isFinite(n)) return r[2];
    return Math.round(Math.min(r[1], Math.max(r[0], n)));
  }

  function sanitize(o) {
    o = o && typeof o === 'object' ? o : {};
    var s = {}, k;
    for (k in NUM) s[k] = clampInt(o[k], NUM[k]);
    for (k in ENUM) s[k] = ENUM[k].indexOf(o[k]) >= 0 ? o[k] : ENUM[k][0];
    for (k in BOOL) s[k] = typeof o[k] === 'boolean' ? o[k] : BOOL[k];
    var src = Array.isArray(o.doors) ? o.doors : [];
    s.doors = [];
    for (var i = 0; i < s.cols; i++) s.doors.push(clampInt(src[i], [0, 3, 1]));
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
    var m = /(?:^#|&)d=([A-Za-z0-9_-]{8,2000})/.exec(hash || '');
    return m ? decode(m[1]) : null;
  }

  window.F33Diseno = {
    NUM: NUM, ENUM: ENUM, FINISH_NAMES: FINISH_NAMES, WALL_NAMES: WALL_NAMES, DOOR_NAMES: DOOR_NAMES,
    sanitize: sanitize, encode: encode, decode: decode, fromHash: fromHash
  };
})();

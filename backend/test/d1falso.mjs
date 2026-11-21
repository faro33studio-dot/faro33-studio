/* D1 falso en memoria para las pruebas de los Workers.
 *
 * Implementa lo mínimo que usan intake.js y admin.js:
 *   prepare(sql).bind(...args).run() / .first() / .all()
 * Reconoce las sentencias por patrón (son pocas y fijas). No pretende ser SQL.
 *
 * Además de `submissions`, mantiene `auditoria` (tabla audit) para comprobar
 * que las acciones del panel no guardan PII.
 */

function normalizar(sql) {
  return String(sql).replace(/\s+/g, ' ').trim().toUpperCase();
}

class Sentencia {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.normalizada = normalizar(sql);
    this.args = args;
  }

  bind(...args) {
    return new Sentencia(this.db, this.sql, args);
  }

  _insertar() {
    const coincidencia = this.normalizada.match(
      /^INSERT INTO SUBMISSIONS \(([^)]+)\) VALUES \(([^)]+)\)(?: ON CONFLICT\(FOLIO\) DO NOTHING)?$/
    );
    if (!coincidencia) throw new Error('d1falso: INSERT no reconocido: ' + this.normalizada);
    const columnas = coincidencia[1].split(',').map(columna => columna.trim().toLowerCase());
    if (columnas.length !== this.args.length) {
      throw new Error('d1falso: columnas (' + columnas.length + ') y valores (' +
        this.args.length + ') no coinciden');
    }
    const fila = {};
    columnas.forEach((columna, indice) => { fila[columna] = this.args[indice]; });

    if (this.normalizada.includes('ON CONFLICT(FOLIO) DO NOTHING') &&
        this.db.filas.some(actual => actual.folio === fila.folio)) {
      return { success: true, meta: { changes: 0, last_row_id: null } };
    }
    if (this.db.filas.some(actual => actual.folio === fila.folio)) {
      throw new Error('d1falso: UNIQUE constraint failed: submissions.folio');
    }
    fila.id = this.db.siguienteId;
    this.db.siguienteId += 1;
    this.db.filas.push(fila);
    return { success: true, meta: { changes: 1, last_row_id: fila.id } };
  }

  _insertarAuditoria() {
    const coincidencia = this.normalizada.match(
      /^INSERT INTO AUDIT \(([^)]+)\) VALUES \(([^)]+)\)$/
    );
    if (!coincidencia) throw new Error('d1falso: INSERT audit no reconocido: ' + this.normalizada);
    const columnas = coincidencia[1].split(',').map(columna => columna.trim().toLowerCase());
    const fila = { id: this.db.siguienteAuditoria };
    this.db.siguienteAuditoria += 1;
    columnas.forEach((columna, indice) => { fila[columna] = this.args[indice]; });
    this.db.auditoria.push(fila);
    return { success: true, meta: { changes: 1, last_row_id: fila.id } };
  }

  /**
   * Aplica el WHERE / ORDER BY / LIMIT de una sentencia de submissions.
   * `cola` es lo que sigue a "FROM SUBMISSIONS". Devuelve las filas y cuántos
   * argumentos consumió.
   */
  _aplicar(cola, args, filasBase) {
    let resto = cola;
    let filas = (filasBase || this.db.filas).slice();
    let pos = 0;

    if (resto.startsWith(' WHERE ')) {
      resto = resto.slice(' WHERE '.length);
      const corte = resto.search(/ ORDER BY | LIMIT | GROUP BY /);
      const donde = corte >= 0 ? resto.slice(0, corte) : resto;
      resto = corte >= 0 ? resto.slice(corte) : '';

      // Los argumentos se consumen UNA vez, en orden, antes de filtrar. Si se
      // hiciera dentro del callback de filter, un `every` que corta en la primera
      // condición falsa desincronizaría las posiciones.
      const condiciones = donde.split(/\s+AND\s+/).map(condicion => condicion.trim()).map(condicion => {
        if (condicion === '1=1') return { constante: true };
        const partes = condicion.match(/^([A-Z_]+)\s*(>=|<=|=|>|<)\s*\?$/);
        if (!partes) throw new Error('d1falso: condición no reconocida: ' + condicion);
        const esperado = args[pos];
        pos += 1;
        return {
          columna: partes[1].toLowerCase(),
          operador: partes[2],
          esperado
        };
      });
      filas = filas.filter(fila => condiciones.every(condicion => {
        if (condicion.constante) return true;
        const actual = fila[condicion.columna];
        if (condicion.operador === '=') return actual === condicion.esperado;
        if (condicion.operador === '>=') return actual >= condicion.esperado;
        if (condicion.operador === '<=') return actual <= condicion.esperado;
        if (condicion.operador === '>') return actual > condicion.esperado;
        return actual < condicion.esperado;
      }));
    }

    const orden = resto.match(/ORDER BY\s+(.+?)(?:\s+LIMIT\b|$)/);
    if (orden) {
      const claves = orden[1].split(',').map(parte => {
        const trozos = parte.trim().split(/\s+/);
        return { columna: trozos[0].toLowerCase(), descendente: trozos[1] === 'DESC' };
      });
      filas.sort((a, b) => {
        for (const clave of claves) {
          const valorA = a[clave.columna];
          const valorB = b[clave.columna];
          if (valorA === valorB) continue;
          const comparacion = valorA < valorB ? -1 : 1;
          return clave.descendente ? -comparacion : comparacion;
        }
        return 0;
      });
    }

    const limite = resto.match(/LIMIT\s+(\?|\d+)(?:\s+OFFSET\s+(\?|\d+))?/);
    if (limite) {
      const cuantos = limite[1] === '?' ? Number(args[pos++]) : Number(limite[1]);
      const desde = limite[2] === undefined
        ? 0
        : (limite[2] === '?' ? Number(args[pos++]) : Number(limite[2]));
      filas = filas.slice(desde, desde + cuantos);
    }

    return { filas, usados: pos };
  }

  _desdeTabla(tabla) {
    const marca = ' FROM ' + tabla;
    const indice = this.normalizada.indexOf(marca);
    if (indice < 0) return null;
    return this.normalizada.slice(indice + marca.length);
  }

  _desdeSubmissions() {
    return this._desdeTabla('SUBMISSIONS');
  }

  async run() {
    this.db.consultas.push({ sql: this.normalizada, args: this.args });
    if (this.normalizada.startsWith('INSERT INTO SUBMISSIONS')) return this._insertar();
    if (this.normalizada.startsWith('INSERT INTO AUDIT')) return this._insertarAuditoria();
    if (this.normalizada.startsWith('DELETE FROM SUBMISSIONS WHERE FOLIO = ?')) {
      const antes = this.db.filas.length;
      this.db.filas = this.db.filas.filter(fila => fila.folio !== this.args[0]);
      return { success: true, meta: { changes: antes - this.db.filas.length } };
    }
    if (this.normalizada === 'UPDATE SUBMISSIONS SET STATUS = ? WHERE FOLIO = ?') {
      let cambios = 0;
      for (const fila of this.db.filas) {
        if (fila.folio === this.args[1]) {
          fila.status = this.args[0];
          cambios += 1;
        }
      }
      return { success: true, meta: { changes: cambios } };
    }
    throw new Error('d1falso: run() no reconocido: ' + this.normalizada);
  }

  async first(columna) {
    this.db.consultas.push({ sql: this.normalizada, args: this.args });
    let fila = null;

    if (this.normalizada.startsWith('SELECT COUNT(*) AS TOTAL FROM SUBMISSIONS')) {
      const cola = this._desdeSubmissions();
      const { filas } = this._aplicar(cola, this.args);
      fila = { total: filas.length };
    } else if (this.normalizada.startsWith('SELECT COUNT(*) AS TOTAL FROM AUDIT')) {
      const cola = this._desdeTabla('AUDIT');
      const { filas } = this._aplicar(cola, this.args, this.db.auditoria);
      fila = { total: filas.length };
    } else if (/^SELECT .+ FROM SUBMISSIONS\b/.test(this.normalizada)) {
      const cola = this._desdeSubmissions();
      const { filas } = this._aplicar(cola, this.args);
      fila = filas.length > 0 ? filas[0] : null;
    } else if (/^SELECT .+ FROM AUDIT\b/.test(this.normalizada)) {
      const cola = this._desdeTabla('AUDIT');
      const { filas } = this._aplicar(cola, this.args, this.db.auditoria);
      fila = filas.length > 0 ? filas[0] : null;
    } else {
      throw new Error('d1falso: first() no reconocido: ' + this.normalizada);
    }

    if (fila === null) return null;
    return columna ? fila[columna] : { ...fila };
  }

  async all() {
    this.db.consultas.push({ sql: this.normalizada, args: this.args });
    if (/^SELECT .+ FROM SUBMISSIONS\b/.test(this.normalizada)) {
      const cola = this._desdeSubmissions();
      const { filas } = this._aplicar(cola, this.args);
      return { success: true, results: filas.map(fila => ({ ...fila })) };
    }
    if (/^SELECT .+ FROM AUDIT\b/.test(this.normalizada)) {
      const cola = this._desdeTabla('AUDIT');
      const { filas } = this._aplicar(cola, this.args, this.db.auditoria);
      return { success: true, results: filas.map(fila => ({ ...fila })) };
    }
    throw new Error('d1falso: all() no reconocido: ' + this.normalizada);
  }
}

export class D1Falso {
  constructor() {
    this.filas = [];
    this.auditoria = [];
    this.audit = this.auditoria;
    this.siguienteId = 1;
    this.siguienteAuditoria = 1;
    this.consultas = [];
  }

  prepare(sql) {
    return new Sentencia(this, sql);
  }

  reiniciar() {
    this.filas = [];
    this.auditoria = [];
    this.audit = this.auditoria;
    this.siguienteId = 1;
    this.siguienteAuditoria = 1;
    this.consultas = [];
  }
}

export function crearDB() {
  return new D1Falso();
}

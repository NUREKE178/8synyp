// Кесте моделі: ұяшықтар, есептеу, көшіру/қою, толтыру (fill), болдырмау (undo).

import { parse, ParseError } from './parser.js';
import { evaluate } from './evaluate.js';
import { ERR, formatValue, parseEntry, isErr } from './values.js';
import { shiftFormula, normalizeFormula, validateFormula, canonicalFormula, functionsUsed } from './formula.js';
import { addr, parseAddr, rectWidth, rectHeight, normRect } from './refs.js';

const MAX_UNDO = 100;

export class Workbook {
  /** @param {{cols:number, rows:number}} size */
  constructor({ cols, rows }) {
    this.cols = cols;
    this.rows = rows;
    /** @type {Map<string,{raw:string, value?:number, fmt?:object}>} — өзгермейтін объектілер */
    this.cells = new Map();
    this._cache = new Map();
    this._stack = new Set();
    this._ast = new Map();
    this._undo = [];
    this._redo = [];
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(info) { this._cache.clear(); for (const fn of this.listeners) fn(info); }

  // ---------- оқу ----------
  getCell(a) { return this.cells.get(a) || null; }
  getRaw(a) { const c = this.cells.get(a); return c ? c.raw : ''; }
  getFmt(a) { const c = this.cells.get(a); return c ? c.fmt : undefined; }
  isFormula(a) { return this.getRaw(a).startsWith('='); }
  isEmpty(a) { return !this.cells.has(a); }

  /** Есептелген мән: number | string | boolean | XlError | null */
  value(a) {
    if (this._cache.has(a)) return this._cache.get(a);
    const cell = this.cells.get(a);
    let v;
    if (!cell) v = null;
    else if (cell.raw.startsWith('=')) {
      if (this._stack.has(a)) return ERR.CYCLE;
      this._stack.add(a);
      try { v = this._evalFormula(cell.raw); } finally { this._stack.delete(a); }
      // Цикл ішінде есептелген аралық мәндерді кэшке жазбаймыз
      if (isErr(v) && v === ERR.CYCLE && this._stack.size) return v;
    } else if (typeof cell.value === 'number') v = cell.value;
    else v = cell.raw;
    this._cache.set(a, v);
    return v;
  }

  valueAt(col, row) {
    if (col < 1 || row < 1 || col > this.cols || row > this.rows) return ERR.REF;
    return this.value(addr(col, row));
  }

  _evalFormula(raw) {
    let ast = this._ast.get(raw);
    if (!ast) {
      try { ast = parse(raw.slice(1)); } catch (e) {
        if (e instanceof ParseError) ast = { type: 'err', code: ERR.NAME.code };
        else throw e;
      }
      this._ast.set(raw, ast);
    }
    return evaluate(ast, { cell: (c, r) => this.valueAt(c, r) });
  }

  display(a) {
    const cell = this.cells.get(a);
    if (!cell) return '';
    return formatValue(this.value(a), cell.fmt);
  }

  /** Тексеру функциялары үшін: канондық формула. */
  canonical(a) { return canonicalFormula(this.getRaw(a)); }
  fnsUsed(a) { return functionsUsed(this.getRaw(a)); }

  // ---------- жазу ----------
  /**
   * Теру нәтижесін ұяшыққа жазу.
   * @returns {{ok:true}|{ok:false,message:string,pos:number}}
   */
  setEntry(a, text, { silent = false } = {}) {
    const t = text.trim();
    if (t === '') { this.clear(a, { silent }); return { ok: true }; }
    if (t.startsWith('=')) {
      const bad = validateFormula(t);
      if (bad) return { ok: false, ...bad };
      this._put(a, { raw: normalizeFormula(t), fmt: this.getFmt(a) });
    } else {
      const num = parseEntry(t);
      if (num) this._put(a, { raw: t, value: num.value, fmt: num.fmt || this.getFmt(a) });
      else this._put(a, { raw: text, fmt: this.getFmt(a) });
    }
    if (!silent) this._emit({ type: 'set', cells: [a] });
    return { ok: true };
  }

  /** Бастапқы деректерді жүктеу (undo-сыз). */
  load(data) {
    for (const [a, v] of Object.entries(data)) {
      const raw = typeof v === 'object' ? v.raw : String(v);
      const fmt = typeof v === 'object' ? v.fmt : undefined;
      if (raw.startsWith('=')) this._put(a, { raw: normalizeFormula(raw), fmt });
      else {
        const num = parseEntry(raw);
        this._put(a, num ? { raw, value: num.value, fmt: fmt || num.fmt } : { raw, fmt });
      }
    }
    this._emit({ type: 'load' });
  }

  setFmt(a, fmt) {
    const c = this.cells.get(a);
    if (!c) {
      if (fmt) this.cells.set(a, { raw: '', fmt });
      return;
    }
    const next = { ...c };
    if (fmt) next.fmt = fmt; else delete next.fmt;
    this.cells.set(a, next);
  }

  clear(a, { silent = false } = {}) {
    if (!this.cells.has(a)) return;
    this.cells.delete(a);
    if (!silent) this._emit({ type: 'clear', cells: [a] });
  }

  _put(a, cell) {
    if (!cell.fmt) delete cell.fmt;
    if (cell.value === undefined) delete cell.value;
    this.cells.set(a, cell);
  }

  // ---------- undo / redo ----------
  /** Өзгерістер тобын бір қадам ретінде жазып алу. */
  transact(fn) {
    const before = new Map(this.cells);
    const result = fn();
    this._undo.push(before);
    if (this._undo.length > MAX_UNDO) this._undo.shift();
    this._redo = [];
    this._emit({ type: 'transact' });
    return result;
  }
  canUndo() { return this._undo.length > 0; }
  canRedo() { return this._redo.length > 0; }
  undo() {
    const prev = this._undo.pop();
    if (!prev) return false;
    this._redo.push(new Map(this.cells));
    this.cells = prev;
    this._emit({ type: 'undo' });
    return true;
  }
  redo() {
    const next = this._redo.pop();
    if (!next) return false;
    this._undo.push(new Map(this.cells));
    this.cells = next;
    this._emit({ type: 'redo' });
    return true;
  }

  // ---------- көшіру / қою / толтыру ----------
  /** Аймақты буферге көшіру. */
  copyRect(rect) {
    const rows = [];
    for (let r = rect.r1; r <= rect.r2; r++) {
      const row = [];
      for (let c = rect.c1; c <= rect.c2; c++) {
        const cell = this.cells.get(addr(c, r));
        row.push(cell ? { ...cell } : null);
      }
      rows.push(row);
    }
    return { rect: { ...rect }, rows };
  }

  /**
   * Буферді (col,row) бұрышына қою. Салыстырмалы сілтемелер көшіру қадамына қарай ауысады.
   * @param {(a:string)=>boolean} [canEdit]
   * @returns {string[]} өзгерген адрестер
   */
  pasteClip(clip, col, row, canEdit = () => true) {
    const changed = [];
    clip.rows.forEach((rowCells, dy) => {
      rowCells.forEach((cell, dx) => {
        const c = col + dx, r = row + dy;
        if (c > this.cols || r > this.rows) return;
        const a = addr(c, r);
        if (!canEdit(a)) return;
        this._writeShifted(a, cell, c - (clip.rect.c1 + dx), r - (clip.rect.r1 + dy));
        changed.push(a);
      });
    });
    return changed;
  }

  _writeShifted(a, cell, dc, dr) {
    if (!cell) { this.cells.delete(a); return; }
    if (cell.raw.startsWith('=')) this._put(a, { raw: shiftFormula(cell.raw, dc, dr), fmt: cell.fmt });
    else this._put(a, { ...cell });
  }

  /**
   * Толтыру маркері: src аймағын dst бағытында жалғастыру.
   * dst — src-ті қамтитын кеңейтілген аймақ (бір бағытта ғана кеңейеді).
   * @returns {{changed:string[], log:{addr:string, from:string, to:string}[]}}
   */
  fill(src, dst, canEdit = () => true) {
    const changed = [];
    const log = [];
    const w = rectWidth(src), h = rectHeight(src);
    for (let r = dst.r1; r <= dst.r2; r++) {
      for (let c = dst.c1; c <= dst.c2; c++) {
        if (c >= src.c1 && c <= src.c2 && r >= src.r1 && r <= src.r2) continue;
        if (c < 1 || r < 1 || c > this.cols || r > this.rows) continue;
        const a = addr(c, r);
        if (!canEdit(a)) continue;
        // Бастапқы ұяшық: жиекке қарай мерзімді қайталау
        const sc = src.c1 + ((((c - src.c1) % w) + w) % w);
        const sr = src.r1 + ((((r - src.r1) % h) + h) % h);
        const cell = this.cells.get(addr(sc, sr)) || null;
        this._writeShifted(a, cell, c - sc, r - sr);
        changed.push(a);
        if (cell && cell.raw.startsWith('=')) log.push({ addr: a, from: addr(sc, sr), to: this.getRaw(a), rawFrom: cell.raw });
      }
    }
    return { changed, log };
  }

  /** Қолмен орындалатын "толтыру" қысқа жолдары үшін: аймақтың бірінші жолы/бағанынан толтыру. */
  fillDownRect(rect, canEdit) {
    if (rectHeight(rect) < 2) return { changed: [], log: [] };
    return this.fill(normRect(rect.c1, rect.r1, rect.c2, rect.r1), rect, canEdit);
  }
  fillRightRect(rect, canEdit) {
    if (rectWidth(rect) < 2) return { changed: [], log: [] };
    return this.fill(normRect(rect.c1, rect.r1, rect.c1, rect.r2), rect, canEdit);
  }

  /** Деректер бар соңғы жол (екі шектеулі аймақ ішінде). */
  lastDataRow(col) {
    for (let r = this.rows; r >= 1; r--) if (this.cells.has(addr(col, r))) return r;
    return 0;
  }

  /** Сілтеме адрестері {col,row} тізімін адрес жолдарына ауыстыру. */
  static addrOf(col, row) { return addr(col, row); }
  static parse(a) { return parseAddr(a); }
}

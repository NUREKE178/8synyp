// Интерактивті кесте (мини-Excel): таңдау, теру, формула жолағы, сілтемелерді түспен бөлектеу,
// ұяшықты көрсету арқылы сілтеме енгізу, толтыру маркері (сүйреу), көшіру/қою, undo/redo, F4.

import { addr, parseAddr, normRect, rectToText, cellsIn, colToLetters, rectWidth, rectHeight, rectContains } from '../engine/refs.js';
import { refSpans, toggleAbsAt, shiftFormula } from '../engine/formula.js';
import { formatValue, isErr } from '../engine/values.js';
import { refColor, colorizeFormula, escapeHtml } from './colors.js';

const SVG_ICONS = {
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/>',
  down: '<path d="M12 4v14m0 0-5-5m5 5 5-5M5 21h14"/>',
  right: '<path d="M4 12h14m0 0-5-5m5 5-5 5M21 5v14"/>',
  fx: '<path d="M4 7h4m-2 0v10m6-10 6 10m0-10-6 10"/>',
  pct: '<path d="M19 5 5 19M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm9 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>',
  decPlus: '<path d="M3 14h3M10 9a3 3 0 0 1 3 3v0a3 3 0 0 1-6 0v0a3 3 0 0 1 3-3Zm7 0a3 3 0 0 1 3 3v0a3 3 0 0 1-6 0v0a3 3 0 0 1 3-3Z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${SVG_ICONS[name]}</svg>`;

/** Қолмен сілтеме көрсетуге болатын орын ба? ("=" , "(" , ";" , оператордан кейін) */
function canPoint(text, caret) {
  if (!text.startsWith('=')) return false;
  const before = text.slice(0, caret).trimEnd();
  if (before === '=') return true;
  return /[=+\-*/^(;,&<>]$/.test(before);
}

export class Sheet {
  /**
   * @param {HTMLElement} root
   * @param {{
   *  workbook: import('../engine/workbook.js').Workbook,
   *  colWidths?: number[], rowHeight?: number, headerHeight?: number, rowHeaderWidth?: number,
   *  canEdit?: (a:string)=>boolean, targets?: string[], cellStyle?: (a:string, v:any)=>object|null,
   *  toolbar?: boolean|string[], formulaBar?: boolean, label?: string,
   * }} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.wb = opts.workbook;
    this.opts = opts;
    this.cols = this.wb.cols;
    this.rows = this.wb.rows;
    this.rowH = opts.rowHeight || 34;
    this.headH = opts.headerHeight || 28;
    this.rowHeadW = opts.rowHeaderWidth || 44;
    this.widths = Array.from({ length: this.cols }, (_, i) => (opts.colWidths && opts.colWidths[i]) || 96);
    this.colX = [0, this.rowHeadW];
    for (let c = 1; c <= this.cols; c++) this.colX[c + 1] = this.colX[c] + this.widths[c - 1];
    this.canEdit = opts.canEdit || (() => true);
    this.listeners = {};
    this.anchor = { col: 1, row: 1 };
    this.focus = { col: 1, row: 1 };
    this.edit = null;
    this.clip = null;
    this.showFormulas = false;
    this.targets = new Set();
    (opts.targets || []).forEach((t) => { const r = parseRectSafe(t); if (r) for (const a of cellsIn(r)) this.targets.add(a); });
    this._timers = new Set();
    this._build();
    this._unsub = this.wb.onChange((info) => { this.render(); this.emit('change', info); });
    this.render();
    this.select('A1');
  }

  // ---------- оқиғалар ----------
  on(type, fn) { (this.listeners[type] ||= []).push(fn); return this; }
  emit(type, detail) { (this.listeners[type] || []).forEach((fn) => fn(detail)); }

  // ---------- құрылым ----------
  _build() {
    const tools = this.opts.toolbar === false ? [] : (this.opts.toolbar || ['undo', 'redo', '|', 'fillDown', 'fillRight', '|', 'pct', 'decPlus', 'decMinus', '|', 'f4', 'showF']);
    this.root.classList.add('sheet');
    this.root.innerHTML = `
      ${tools.length ? `<div class="sheet-toolbar" role="toolbar" aria-label="Кесте құралдары"></div>` : ''}
      ${this.opts.formulaBar === false ? '' : `<div class="sheet-fbar">
        <div class="namebox" aria-label="Ұяшық адресі">A1</div>
        <div class="fx-label" aria-hidden="true">ƒx</div>
        <div class="cin fbar-cin"><div class="cin-mirror" aria-hidden="true"></div><input class="cin-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Формула жолағы" /></div>
      </div>`}
      <div class="sheet-scroll">
        <div class="sheet-grid" role="grid" tabindex="0" aria-label="${escapeHtml(this.opts.label || 'Электрондық кесте')}" aria-rowcount="${this.rows}" aria-colcount="${this.cols}"></div>
      </div>
      <div class="sr-only" aria-live="polite" role="status"></div>`;
    this.toolbarEl = this.root.querySelector('.sheet-toolbar');
    this.namebox = this.root.querySelector('.namebox');
    this.fbarWrap = this.root.querySelector('.fbar-cin');
    this.fbar = this.root.querySelector('.fbar-cin .cin-input');
    this.fbarMirror = this.root.querySelector('.fbar-cin .cin-mirror');
    this.scroll = this.root.querySelector('.sheet-scroll');
    this.grid = this.root.querySelector('.sheet-grid');
    this.live = this.root.querySelector('.sr-only');

    const W = this.colX[this.cols + 1], H = this.headH + this.rows * this.rowH;
    this.grid.style.width = W + 'px';
    this.grid.style.height = H + 'px';

    const frag = document.createDocumentFragment();
    const corner = el('div', 'hdr corner'); place(corner, 0, 0, this.rowHeadW, this.headH); frag.append(corner);
    this.colHdr = []; this.rowHdr = [];
    for (let c = 1; c <= this.cols; c++) {
      const h = el('div', 'hdr col-hdr'); h.dataset.col = c; h.textContent = colToLetters(c);
      place(h, this.colX[c], 0, this.widths[c - 1], this.headH); h.setAttribute('role', 'columnheader'); frag.append(h); this.colHdr[c] = h;
    }
    for (let r = 1; r <= this.rows; r++) {
      const h = el('div', 'hdr row-hdr'); h.dataset.row = r; h.textContent = r;
      place(h, 0, this.headH + (r - 1) * this.rowH, this.rowHeadW, this.rowH); h.setAttribute('role', 'rowheader'); frag.append(h); this.rowHdr[r] = h;
    }
    this.cellEls = new Map();
    for (let r = 1; r <= this.rows; r++) {
      for (let c = 1; c <= this.cols; c++) {
        const a = addr(c, r);
        const d = el('div', 'cell'); d.dataset.a = a; d.setAttribute('role', 'gridcell');
        place(d, this.colX[c], this.headH + (r - 1) * this.rowH, this.widths[c - 1], this.rowH);
        d.innerHTML = '<span class="v"></span><span class="f"></span>';
        frag.append(d); this.cellEls.set(a, d);
      }
    }
    this.layer = el('div', 'layer');
    this.refLayer = el('div', 'ref-layer'); this.layer.append(this.refLayer);
    this.clipBox = el('div', 'clip-box'); this.clipBox.hidden = true; this.layer.append(this.clipBox);
    this.selBox = el('div', 'sel-box'); this.layer.append(this.selBox);
    this.fillBox = el('div', 'fill-box'); this.fillBox.hidden = true; this.layer.append(this.fillBox);
    this.tip = el('div', 'fill-tip'); this.tip.hidden = true; this.layer.append(this.tip);
    frag.append(this.layer);

    this.handle = el('div', 'fill-handle'); this.handle.title = 'Толтыру маркері: төмен немесе оңға сүйре'; this.handle.setAttribute('aria-hidden', 'true');
    frag.append(this.handle);

    // ұяшық ішіндегі теру өрісі
    this.editorWrap = el('div', 'cin cell-cin'); this.editorWrap.hidden = true;
    this.editorWrap.innerHTML = '<div class="cin-mirror" aria-hidden="true"></div><input class="cin-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Ұяшықты өңдеу" />';
    this.editor = this.editorWrap.querySelector('input');
    this.editorMirror = this.editorWrap.querySelector('.cin-mirror');
    frag.append(this.editorWrap);
    this.grid.append(frag);

    if (this.toolbarEl) this._buildToolbar(tools);
    this._bind();
  }

  _buildToolbar(tools) {
    const defs = {
      undo: { ic: 'undo', label: 'Болдырмау', hint: 'Ctrl+Z', run: () => this.undo() },
      redo: { ic: 'redo', label: 'Қайтару', hint: 'Ctrl+Y', run: () => this.redo() },
      fillDown: { ic: 'down', label: 'Төмен толтыру', hint: 'Ctrl+D', run: () => this.fillSelection('down') },
      fillRight: { ic: 'right', label: 'Оңға толтыру', hint: 'Ctrl+R', run: () => this.fillSelection('right') },
      pct: { ic: 'pct', label: 'Пайыз пішімі', hint: '%', run: () => this.togglePercent() },
      decPlus: { txt: '.0→', label: 'Үтірден кейінгі таңбаны көбейту', run: () => this.changeDecimals(1) },
      decMinus: { txt: '←.0', label: 'Үтірден кейінгі таңбаны азайту', run: () => this.changeDecimals(-1) },
      f4: { txt: 'F4', label: 'F4: сілтеме түрін ауыстыру ($)', hint: 'F4', cls: 'f4', run: () => this.applyF4() },
      showF: { ic: 'fx', label: 'Формулаларды көрсету', toggle: true, run: () => this.setShowFormulas(!this.showFormulas) },
    };
    this.toolBtns = {};
    for (const t of tools) {
      if (t === '|') { this.toolbarEl.append(el('span', 'sep')); continue; }
      const d = defs[t]; if (!d) continue;
      const b = el('button', 'tbtn' + (d.cls ? ' ' + d.cls : '')); b.type = 'button';
      b.innerHTML = d.ic ? icon(d.ic) : `<b>${d.txt}</b>`;
      b.title = d.label + (d.hint ? ` (${d.hint})` : ''); b.setAttribute('aria-label', d.label);
      if (d.toggle) b.setAttribute('aria-pressed', 'false');
      // фокус теру өрісінде қалуы үшін
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { d.run(); this._updateToolbar(); });
      this.toolbarEl.append(b); this.toolBtns[t] = b;
    }
    this._updateToolbar();
  }

  _updateToolbar() {
    if (!this.toolBtns) return;
    if (this.toolBtns.undo) this.toolBtns.undo.disabled = !this.wb.canUndo();
    if (this.toolBtns.redo) this.toolBtns.redo.disabled = !this.wb.canRedo();
    if (this.toolBtns.showF) { this.toolBtns.showF.setAttribute('aria-pressed', String(this.showFormulas)); this.toolBtns.showF.classList.toggle('on', this.showFormulas); }
    if (this.toolBtns.f4) this.toolBtns.f4.classList.toggle('hot', !!this.edit && this.edit.text.startsWith('='));
  }

  // ---------- геометрия ----------
  cellRect(col, row) { return { x: this.colX[col], y: this.headH + (row - 1) * this.rowH, w: this.widths[col - 1], h: this.rowH }; }
  rectPx(r) {
    const a = this.cellRect(r.c1, r.r1), b = this.cellRect(r.c2, r.r2);
    return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
  }
  _hit(clientX, clientY) {
    const g = this.grid.getBoundingClientRect();
    const x = clientX - g.left, y = clientY - g.top;
    let col = 1;
    for (let c = 1; c <= this.cols; c++) if (x >= this.colX[c]) col = c;
    let row = Math.floor((y - this.headH) / this.rowH) + 1;
    row = Math.max(1, Math.min(this.rows, row));
    return { col, row };
  }
  selRect() { return normRect(this.anchor.col, this.anchor.row, this.focus.col, this.focus.row); }
  get active() { return addr(this.anchor.col, this.anchor.row); }

  // ---------- кіріс оқиғалары ----------
  _bind() {
    const g = this.grid;
    g.addEventListener('mousedown', (e) => { if (!e.target.closest('.cin')) e.preventDefault(); });
    g.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    g.addEventListener('dblclick', (e) => {
      const cell = e.target.closest('.cell'); if (!cell || e.target.closest('.cin')) return;
      this.startEdit(cell.dataset.a, this.wb.getRaw(cell.dataset.a));
    });
    g.addEventListener('keydown', (e) => this._onKeyDown(e));
    g.addEventListener('copy', (e) => { e.preventDefault(); this.copy(e); });
    g.addEventListener('paste', (e) => { e.preventDefault(); this.paste(e); });
    this.handle.addEventListener('pointerdown', (e) => this._onHandleDown(e));
    this.handle.addEventListener('dblclick', () => this._autoFillDown());

    for (const [inp, which] of [[this.editor, 'cell'], [this.fbar, 'bar']]) {
      if (!inp) continue;
      inp.addEventListener('input', () => this._onEditInput(inp));
      inp.addEventListener('keydown', (e) => this._onEditKey(e, inp));
      inp.addEventListener('keyup', () => this._syncMirror(inp));
      inp.addEventListener('scroll', () => this._syncMirror(inp));
      inp.addEventListener('click', () => this._renderRefs());
      inp.addEventListener('focus', () => {
        if (which === 'bar' && !this.edit) {
          if (!this.canEdit(this.active)) { this.emit('locked', { addr: this.active }); this.grid.focus(); return; }
          this.startEdit(this.active, this.wb.getRaw(this.active), { focusBar: true });
        }
      });
    }
    this.root.addEventListener('focusout', (e) => {
      if (!this.edit) return;
      if (e.relatedTarget && this.root.contains(e.relatedTarget)) return;
      // Басқа жерге басқанда — теруді аяқтау (қате болса болдырмау)
      if (!this.commitEdit()) this.cancelEdit();
    });
  }

  _onPointerDown(e) {
    if (e.target.closest('.cin') || e.target === this.handle) return;
    const hdr = e.target.closest('.hdr');
    if (hdr && !hdr.classList.contains('corner')) {
      if (this.edit && !this.commitEdit()) return;
      if (hdr.dataset.col) { const c = Number(hdr.dataset.col); this.anchor = { col: c, row: 1 }; this.focus = { col: c, row: this.rows }; }
      else { const r = Number(hdr.dataset.row); this.anchor = { col: 1, row: r }; this.focus = { col: this.cols, row: r }; }
      this._selectionChanged(); this.grid.focus({ preventScroll: true });
      return;
    }
    const cellEl = e.target.closest('.cell');
    if (!cellEl) return;
    const { col, row } = this._hit(e.clientX, e.clientY);

    // «Көрсету» режимі: формула жазып жатқанда ұяшықты басу — адресін енгізу
    if (this.edit) {
      const inp = this._activeInput();
      const caret = inp.selectionStart ?? inp.value.length;
      const pointing = this.edit.point && caret === this.edit.point.end;
      if (this.edit.text.startsWith('=') && (pointing || canPoint(this.edit.text, caret))) {
        e.preventDefault();
        this._pointStart(col, row, e);
        return;
      }
      if (!this.commitEdit()) { e.preventDefault(); return; }
    }

    e.preventDefault(); // мәтін таңдауды өшіру
    this.grid.focus({ preventScroll: true });
    const sameCell = this.anchor.col === col && this.anchor.row === row && rectWidth(this.selRect()) === 1 && rectHeight(this.selRect()) === 1;
    if (e.shiftKey) this.focus = { col, row };
    else { this.anchor = { col, row }; this.focus = { col, row }; }
    this._selectionChanged();
    if (e.pointerType === 'touch' && sameCell && !e.shiftKey) { this.startEdit(addr(col, row), this.wb.getRaw(addr(col, row))); return; }

    // сүйреп ауқымды таңдау
    if (e.pointerType !== 'touch') {
      const move = (ev) => { const h = this._hit(ev.clientX, ev.clientY); if (h.col !== this.focus.col || h.row !== this.focus.row) { this.focus = h; this._selectionChanged(); } };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    }
  }

  _pointStart(col, row, e) {
    const apply = (c2, r2) => {
      const rect = normRect(col, row, c2, r2);
      const text = rectToText(rect);
      const inp = this._activeInput();
      const cur = this.edit.text;
      const span = this.edit.point || { start: inp.selectionStart ?? cur.length, end: inp.selectionStart ?? cur.length };
      const next = cur.slice(0, span.start) + text + cur.slice(span.end);
      this.edit.text = next; this.edit.point = { start: span.start, end: span.start + text.length };
      this._setEditorText(next, this.edit.point.end);
      this._renderRefs(); this._updateToolbar();
    };
    apply(col, row);
    const move = (ev) => { const h = this._hit(ev.clientX, ev.clientY); apply(h.col, h.row); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this._activeInput().focus({ preventScroll: true }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  _onKeyDown(e) {
    if (this.edit || e.target.closest('.cin')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const move = (dc, dr) => {
      e.preventDefault();
      const base = e.shiftKey ? this.focus : this.anchor;
      const nc = clamp(base.col + dc, 1, this.cols), nr = clamp(base.row + dr, 1, this.rows);
      if (e.shiftKey) this.focus = { col: nc, row: nr }; else { this.anchor = { col: nc, row: nr }; this.focus = { col: nc, row: nr }; }
      this._selectionChanged();
    };
    if (k === 'ArrowUp') return move(0, -1);
    if (k === 'ArrowDown') return move(0, 1);
    if (k === 'ArrowLeft') return move(-1, 0);
    if (k === 'ArrowRight') return move(1, 0);
    if (k === 'Tab') return move(e.shiftKey ? -1 : 1, 0);
    if (k === 'Home') return move(-this.cols, 0);
    if (k === 'Enter') { if (e.shiftKey) return move(0, -1); e.preventDefault(); this._beginEditActive(); return; }
    if (k === 'F2') { e.preventDefault(); this._beginEditActive(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.clearSelection(); return; }
    if (k === 'Escape') { this.clip = null; this._renderClip(); return; }
    if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); this.undo(); return; }
    if (ctrl && (k.toLowerCase() === 'y')) { e.preventDefault(); this.redo(); return; }
    if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); this.fillSelection('down'); return; }
    if (ctrl && k.toLowerCase() === 'r') { e.preventDefault(); this.fillSelection('right'); return; }
    if (ctrl && (k === '`' || k === '~' || k === 'ё')) { e.preventDefault(); this.setShowFormulas(!this.showFormulas); return; }
    if (!ctrl && !e.altKey && k.length === 1) {
      e.preventDefault();
      if (!this.canEdit(this.active)) { this.emit('locked', { addr: this.active }); return; }
      this.startEdit(this.active, k, { fresh: true });
    }
  }

  _beginEditActive() {
    const a = this.active;
    if (!this.canEdit(a)) { this.emit('locked', { addr: a }); return; }
    this.startEdit(a, this.wb.getRaw(a));
  }

  // ---------- таңдау ----------
  /** @param {string} target — "B2" немесе "B2:B6" */
  select(target, { silent = false } = {}) {
    const r = parseRectSafe(target); if (!r) return;
    this.anchor = { col: r.c1, row: r.r1 }; this.focus = { col: r.c2, row: r.r2 };
    this._selectionChanged(silent);
  }

  _selectionChanged(silent) {
    const r = this.selRect();
    this._renderSel();
    this._renderRefs();
    this._renderClip();
    if (this.namebox) this.namebox.textContent = rectToText(r);
    const a = this.active;
    if (this.fbar && !this.edit) { this.fbar.value = this.wb.getRaw(a); this._syncMirror(this.fbar); }
    const cell = this.cellEls.get(a);
    const label = `${a}: ${this.wb.getRaw(a) ? (this.wb.isFormula(a) ? 'формула ' + this.wb.getRaw(a) + ', ' : '') + 'мәні ' + this.wb.display(a) : 'бос'}`;
    this.live.textContent = label;
    if (cell) this._scrollIntoView(r);
    this.grid.querySelectorAll('.cell.sel, .hdr.sel').forEach((n) => n.classList.remove('sel'));
    for (let c = r.c1; c <= r.c2; c++) this.colHdr[c]?.classList.add('sel');
    for (let rr = r.r1; rr <= r.r2; rr++) this.rowHdr[rr]?.classList.add('sel');
    if (!silent) this.emit('select', { addr: a, rect: r });
  }

  _scrollIntoView(r) {
    const p = this.rectPx(r), s = this.scroll;
    if (p.x < s.scrollLeft + this.rowHeadW) s.scrollLeft = Math.max(0, p.x - this.rowHeadW);
    else if (p.x + p.w > s.scrollLeft + s.clientWidth) s.scrollLeft = p.x + p.w - s.clientWidth + 8;
  }

  // ---------- сурет салу ----------
  render() {
    for (const [a, d] of this.cellEls) {
      const cell = this.wb.getCell(a);
      const v = cell ? this.wb.value(a) : null;
      const shown = cell ? formatValue(v, cell.fmt) : '';
      const vEl = d.firstChild, fEl = d.lastChild;
      if (vEl.textContent !== shown) vEl.textContent = shown;
      const f = cell && cell.raw.startsWith('=') ? cell.raw : '';
      if (fEl.textContent !== f) fEl.textContent = f;
      d.classList.toggle('is-num', typeof v === 'number');
      d.classList.toggle('is-err', isErr(v));
      d.classList.toggle('is-f', !!f);
      d.classList.toggle('editable', this.canEdit(a));
      d.classList.toggle('target', this.targets.has(a) && !cell);
      d.setAttribute('aria-label', `${a} ${shown}`);
      const st = this.opts.cellStyle ? this.opts.cellStyle(a, v) : null;
      d.style.background = st && st.background ? st.background : '';
      d.style.color = st && st.color ? st.color : '';
      d.style.fontWeight = st && st.weight ? st.weight : '';
    }
    this.grid.classList.toggle('show-f', this.showFormulas);
    this._renderSel(); this._renderRefs(); this._updateToolbar();
    if (this.fbar && !this.edit) { this.fbar.value = this.wb.getRaw(this.active); this._syncMirror(this.fbar); }
  }

  _setBox(box, r, pad = 0) {
    const p = this.rectPx(r);
    box.style.left = p.x - pad + 'px'; box.style.top = p.y - pad + 'px';
    box.style.width = p.w + pad * 2 + 'px'; box.style.height = p.h + pad * 2 + 'px';
  }

  _renderSel() {
    const r = this.selRect();
    this._setBox(this.selBox, r);
    this.selBox.classList.toggle('multi', rectWidth(r) * rectHeight(r) > 1);
    const p = this.rectPx(r);
    const canFill = !this.edit && this.canEdit(this.active) && !this.opts.readOnly;
    this.handle.style.display = canFill ? '' : 'none';
    this.handle.style.left = p.x + p.w - 7 + 'px';
    this.handle.style.top = p.y + p.h - 7 + 'px';
  }

  /** Формуладағы сілтемелерді түсті жиектермен көрсету (өңдеу кезінде де, таңдағанда да). */
  _renderRefs() {
    this.refLayer.textContent = '';
    const text = this.edit ? this.edit.text : this.wb.getRaw(this.active);
    const spans = refSpans(text);
    this.currentSpans = spans;
    spans.forEach((s, i) => {
      const box = el('div', 'ref-box'); box.style.setProperty('--c', refColor(i));
      this._setBox(box, s.rect);
      const tag = el('span', 'ref-tag'); tag.textContent = s.text.replace(/\$/g, '$'); box.append(tag);
      this.refLayer.append(box);
    });
    this.emit('spans', { text, spans });
  }

  _renderClip() {
    if (!this.clip) { this.clipBox.hidden = true; return; }
    this.clipBox.hidden = false; this._setBox(this.clipBox, this.clip.rect);
  }

  // ---------- теру ----------
  _activeInput() { return document.activeElement === this.fbar ? this.fbar : this.editor; }

  startEdit(a, text, { fresh = false, focusBar = false } = {}) {
    if (this.opts.readOnly) return false;
    if (!this.canEdit(a)) { this.emit('locked', { addr: a }); return false; }
    const p = parseAddr(a);
    if (this.edit) this.cancelEdit();
    this.edit = { addr: a, text, point: null, original: this.wb.getRaw(a), fresh };
    this.select(a, { silent: true });
    const rc = this.cellRect(p.col, p.row);
    this.editorWrap.hidden = false;
    this.editorWrap.style.left = rc.x + 'px'; this.editorWrap.style.top = rc.y + 'px';
    this.editorWrap.style.width = Math.max(rc.w, 140) + 'px'; this.editorWrap.style.height = rc.h + 'px';
    this.handle.style.display = 'none';
    this._setEditorText(text, text.length);
    if (focusBar && this.fbar) { this.fbar.focus(); } else { this.editor.focus({ preventScroll: true }); }
    this.editor.setSelectionRange(text.length, text.length);
    this._renderRefs(); this._updateToolbar();
    this.emit('edit-start', { addr: a });
    return true;
  }

  _setEditorText(text, caret) {
    this.editor.value = text;
    if (this.fbar) this.fbar.value = text;
    const inp = this._activeInput();
    if (caret != null) { try { inp.setSelectionRange(caret, caret); } catch { /* ignore */ } }
    this._syncMirror(this.editor); if (this.fbar) this._syncMirror(this.fbar);
  }

  _syncMirror(inp) {
    const m = inp === this.fbar ? this.fbarMirror : this.editorMirror; if (!m) return;
    const t = inp.value;
    const spans = t.startsWith('=') ? refSpans(t) : [];
    m.innerHTML = colorizeFormula(t, spans) + '&#8203;';
    m.scrollLeft = inp.scrollLeft;
  }

  _onEditInput(inp) {
    if (!this.edit) return;
    this.edit.text = inp.value; this.edit.point = null;
    const other = inp === this.fbar ? this.editor : this.fbar;
    if (other) other.value = inp.value;
    this._syncMirror(this.editor); if (this.fbar) this._syncMirror(this.fbar);
    this._renderRefs(); this._updateToolbar();
    this.emit('edit-input', { addr: this.edit.addr, text: inp.value });
  }

  _onEditKey(e, inp) {
    e.stopPropagation(); // грид-тің пернетақта өңдеушісіне өтпесін
    if (!this.edit) return;
    if (e.key === 'F4') { e.preventDefault(); this.applyF4(); return; }
    if (e.key === 'Enter') { e.preventDefault(); const a = this.edit.addr; if (this.commitEdit()) this._afterCommitMove(a, 0, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Tab') { e.preventDefault(); const a = this.edit.addr; if (this.commitEdit()) this._afterCommitMove(a, e.shiftKey ? -1 : 1, 0); return; }
    if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); return; }
    // Формула ішінде бағыттауыш пернелері — курсорды жылжыту (ұяшыққа өтпейді)
  }

  _afterCommitMove(a, dc, dr) {
    const p = parseAddr(a);
    const nc = clamp(p.col + dc, 1, this.cols), nr = clamp(p.row + dr, 1, this.rows);
    this.select(addr(nc, nr));
    this.grid.focus({ preventScroll: true });
  }

  /** F4: курсордағы сілтемеге $ белгілерін айналдыру. */
  applyF4() {
    if (!this.edit) { this._beginEditActive(); if (!this.edit) return; }
    const inp = this._activeInput();
    const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? s;
    const res = toggleAbsAt(this.edit.text, s, e);
    if (!res) { this.emit('f4-miss', {}); return; }
    this.edit.text = res.text; this.edit.point = null;
    this._setEditorText(res.text, res.caret);
    this._renderRefs();
    this.emit('f4', { text: res.text, addr: this.edit.addr });
    inp.focus({ preventScroll: true });
  }

  commitEdit() {
    if (!this.edit) return true;
    const { addr: a, text } = this.edit;
    let result;
    const before = this.wb.getRaw(a);
    this.wb.transact(() => { result = this.wb.setEntry(a, text, { silent: true }); });
    if (!result.ok) {
      this.wb._undo.pop(); // бос өзгеріс тарихқа түспесін
      this.emit('formula-error', { addr: a, text, message: result.message, pos: result.pos });
      const inp = this._activeInput();
      try { inp.setSelectionRange(result.pos, result.pos); } catch { /* ignore */ }
      return false;
    }
    this.edit = null;
    this.editorWrap.hidden = true;
    this.render();
    this._selectionChanged(true);
    this.emit('commit', { addr: a, text, raw: this.wb.getRaw(a), changed: before !== this.wb.getRaw(a) });
    return true;
  }

  cancelEdit() {
    if (!this.edit) return;
    this.edit = null; this.editorWrap.hidden = true;
    this._selectionChanged(true); this.render();
    this.grid.focus({ preventScroll: true });
    this.emit('edit-cancel', {});
  }

  // ---------- өзгерту әрекеттері ----------
  _editableCheck() { return (a) => this.canEdit(a) && !this.opts.readOnly; }

  clearSelection() {
    const r = this.selRect(); const ok = this._editableCheck(); let n = 0;
    this.wb.transact(() => { for (const a of cellsIn(r)) if (ok(a) && !this.wb.isEmpty(a)) { this.wb.clear(a, { silent: true }); n++; } });
    if (!n) { this.wb._undo.pop(); const first = this.active; if (!this.canEdit(first)) this.emit('locked', { addr: first }); }
    this.render();
  }

  undo() { this.wb.undo(); }
  redo() { this.wb.redo(); }

  setShowFormulas(v) { this.showFormulas = v; this.grid.classList.toggle('show-f', v); this._updateToolbar(); }

  _formatTargets() { const ok = this._editableCheck(); return [...cellsIn(this.selRect())].filter(ok); }
  togglePercent() {
    const cells = this._formatTargets(); if (!cells.length) { this.emit('locked', { addr: this.active }); return; }
    const on = cells.every((a) => this.wb.getFmt(a)?.type === 'percent');
    this.wb.transact(() => cells.forEach((a) => this.wb.setFmt(a, on ? undefined : { type: 'percent', dec: 0 })));
    this.render(); this.emit('format', { cells, percent: !on });
  }
  changeDecimals(delta) {
    const cells = this._formatTargets(); if (!cells.length) { this.emit('locked', { addr: this.active }); return; }
    this.wb.transact(() => cells.forEach((a) => {
      const f = this.wb.getFmt(a) || {};
      const shown = this.wb.display(a).replace('%', '');
      const cur = typeof f.dec === 'number' ? f.dec : ((shown.split(',')[1] || '').length);
      this.wb.setFmt(a, { ...f, dec: Math.max(0, Math.min(8, cur + delta)) });
    }));
    this.render();
  }

  // ---------- толтыру ----------
  fillSelection(dir) {
    const r = this.selRect();
    const ok = this._editableCheck();
    let res;
    if (dir === 'down' && rectHeight(r) > 1) {
      this.wb.transact(() => { res = this.wb.fillDownRect(r, ok); });
    } else if (dir === 'right' && rectWidth(r) > 1) {
      this.wb.transact(() => { res = this.wb.fillRightRect(r, ok); });
    } else { this.emit('hint', { message: dir === 'down' ? 'Алдымен формула бар ұяшықтан төмен қарай бірнеше ұяшықты белгіле' : 'Алдымен формула бар ұяшықтан оңға қарай бірнеше ұяшықты белгіле' }); return; }
    this._afterFill(dir === 'down' ? normRect(r.c1, r.r1, r.c2, r.r1) : normRect(r.c1, r.r1, r.c1, r.r2), r, res, 'toolbar');
  }

  /** Бағдарламалық толтыру (демо және тапсырмалар үшін). */
  fill(src, dst, via = 'api') {
    let res; const ok = this._editableCheck();
    this.wb.transact(() => { res = this.wb.fill(src, dst, ok); });
    this._afterFill(src, dst, res, via);
    return res;
  }

  _afterFill(src, dst, res, via) {
    this.render();
    this.select(rectToText(dst), { silent: true }); this._selectionChanged(true);
    this._flash(res.changed);
    if (!res.changed.length) { this.emit('locked', { addr: this.active }); }
    this.emit('fill', { src, dst, changed: res.changed, log: res.log, via });
  }

  /** Көшіру кезінде формулалар бір сәт көрінеді (ақырын қозғалыс), сосын мәндерге ауысады. */
  _flash(list) {
    const few = list.length <= 12; // көп ұяшық толса — формула мәтінін көрсетпейміз, тек түс толқыны
    list.forEach((a, i) => {
      const d = this.cellEls.get(a); if (!d) return;
      const step = few ? 90 : 14;
      d.style.setProperty('--i', Math.min(i, few ? 99 : 60));
      d.style.setProperty('--step', step + 'ms');
      d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash');
      if (few) d.classList.add('peek');
      const wait = Math.min(i, few ? 99 : 60) * step;
      const t1 = setTimeout(() => d.classList.remove('flash'), 900 + wait);
      const t2 = setTimeout(() => d.classList.remove('peek'), 2600 + wait);
      this._timers.add(t1); this._timers.add(t2);
    });
  }

  _onHandleDown(e) {
    e.preventDefault(); e.stopPropagation();
    const src = this.selRect();
    this.handle.setPointerCapture?.(e.pointerId);
    this.grid.classList.add('filling');
    let dst = src;
    const compute = (ev) => {
      const { col, row } = this._hit(ev.clientX, ev.clientY);
      const dRight = col - src.c2, dLeft = src.c1 - col, dDown = row - src.r2, dUp = src.r1 - row;
      const m = Math.max(dRight, dLeft, dDown, dUp);
      if (m <= 0) return src;
      if (m === dDown) return normRect(src.c1, src.r1, src.c2, row);
      if (m === dRight) return normRect(src.c1, src.r1, col, src.r2);
      if (m === dUp) return normRect(src.c1, row, src.c2, src.r2);
      return normRect(col, src.r1, src.c2, src.r2);
    };
    const move = (ev) => {
      dst = compute(ev);
      const changed = dst.c1 !== src.c1 || dst.c2 !== src.c2 || dst.r1 !== src.r1 || dst.r2 !== src.r2;
      this.fillBox.hidden = !changed; if (changed) this._setBox(this.fillBox, dst);
      // Қалқымалы көмек: соңғы ұяшыққа қандай формула түседі
      if (changed) {
        const last = this._lastFillCell(src, dst); const raw = this._previewRaw(src, last);
        if (raw) {
          const rc = this.cellRect(last.col, last.row);
          this.tip.hidden = false; this.tip.textContent = `${addr(last.col, last.row)}: ${raw}`;
          this.tip.style.left = rc.x + 'px'; this.tip.style.top = rc.y + rc.h + 6 + 'px';
        } else this.tip.hidden = true;
      } else this.tip.hidden = true;
    };
    const up = () => {
      this.handle.removeEventListener('pointermove', move); this.handle.removeEventListener('pointerup', up); this.handle.removeEventListener('pointercancel', up);
      this.grid.classList.remove('filling'); this.fillBox.hidden = true; this.tip.hidden = true;
      if (dst !== src && (dst.c1 !== src.c1 || dst.c2 !== src.c2 || dst.r1 !== src.r1 || dst.r2 !== src.r2)) this.fill(src, dst, 'drag');
    };
    this.handle.addEventListener('pointermove', move); this.handle.addEventListener('pointerup', up); this.handle.addEventListener('pointercancel', up);
  }

  _lastFillCell(src, dst) {
    if (dst.r2 > src.r2) return { col: src.c2, row: dst.r2 };
    if (dst.c2 > src.c2) return { col: dst.c2, row: src.r2 };
    if (dst.r1 < src.r1) return { col: src.c1, row: dst.r1 };
    return { col: dst.c1, row: src.r1 };
  }
  _previewRaw(src, cell) {
    const w = rectWidth(src), h = rectHeight(src);
    const sc = src.c1 + ((((cell.col - src.c1) % w) + w) % w), sr = src.r1 + ((((cell.row - src.r1) % h) + h) % h);
    const raw = this.wb.getRaw(addr(sc, sr));
    if (!raw.startsWith('=')) return '';
    return shiftFormula(raw, cell.col - sc, cell.row - sr);
  }

  /** Қос шерту: көрші баған бойынша соңына дейін төмен толтыру. */
  _autoFillDown() {
    const r = this.selRect(); if (rectWidth(r) !== 1 || rectHeight(r) !== 1) return;
    const last = Math.max(this.wb.lastDataRow(r.c1 - 1), this.wb.lastDataRow(r.c1 + 1));
    if (last > r.r2) this.fill(r, normRect(r.c1, r.r1, r.c2, last), 'dblclick');
  }

  // ---------- көшіру / қою ----------
  copy(e) {
    const r = this.selRect();
    this.clip = this.wb.copyRect(r);
    this._renderClip();
    const tsv = this._tsv(r);
    this.clip.tsv = tsv;
    if (e && e.clipboardData) e.clipboardData.setData('text/plain', tsv);
    this.emit('copy', { rect: r });
  }
  _tsv(r) {
    const lines = [];
    for (let rr = r.r1; rr <= r.r2; rr++) { const row = []; for (let c = r.c1; c <= r.c2; c++) row.push(this.wb.display(addr(c, rr))); lines.push(row.join('\t')); }
    return lines.join('\n');
  }
  paste(e) {
    const ok = this._editableCheck();
    const text = e && e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    const r = this.selRect(); let changed = [];
    if (this.clip && (!text || text === this.clip.tsv)) {
      this.wb.transact(() => { changed = this.wb.pasteClip(this.clip, r.c1, r.r1, ok); });
      this.emit('paste', { changed, src: this.clip.rect, dst: { c1: r.c1, r1: r.r1 } });
    } else if (text) {
      this.wb.transact(() => {
        text.split(/\r?\n/).forEach((line, dy) => line.split('\t').forEach((v, dx) => {
          const c = r.c1 + dx, rr = r.r1 + dy; if (c > this.cols || rr > this.rows) return;
          const a = addr(c, rr); if (!ok(a)) return; this.wb.setEntry(a, v, { silent: true }); changed.push(a);
        }));
      });
    }
    this.render(); this._flash(changed);
  }


  // ---------- демо (мұғалім / басты бет) ----------
  /** Адрес бойынша символ-символ теріп, Enter басады. */
  async typeInto(a, text, { perChar = 55, isCancelled = () => false } = {}) {
    const prev = this.canEdit, prevRO = this.opts.readOnly;
    this.canEdit = () => true; this.opts.readOnly = false;
    try {
      this.select(a);
      await sleep(260);
      if (isCancelled()) return;
      this.startEdit(a, '');
      for (let i = 1; i <= text.length; i++) {
        if (isCancelled()) { this.cancelEdit(); return; }
        const inp = this._activeInput();
        inp.value = text.slice(0, i);
        this._onEditInput(inp);
        await sleep(perChar);
      }
      await sleep(320);
      this.commitEdit();
    } finally { this.canEdit = prev; this.opts.readOnly = prevRO; this.render(); }
  }

  /** Толтыру маркерін сүйреген әсерді жасап, толтырады. */
  async animateFill(src, dst, { ms = 900, isCancelled = () => false } = {}) {
    const prev = this.canEdit, prevRO = this.opts.readOnly;
    this.canEdit = () => true; this.opts.readOnly = false;
    try {
      this.select(rectToText(src));
      await sleep(350);
      const steps = Math.max(rectWidth(dst) - rectWidth(src), rectHeight(dst) - rectHeight(src));
      const down = dst.r2 > src.r2;
      this.grid.classList.add('filling'); this.fillBox.hidden = false;
      for (let i = 1; i <= steps; i++) {
        if (isCancelled()) break;
        const part = down ? normRect(src.c1, src.r1, src.c2, src.r2 + i) : normRect(src.c1, src.r1, src.c2 + i, src.r2);
        this._setBox(this.fillBox, part);
        const last = this._lastFillCell(src, part); const raw = this._previewRaw(src, last);
        if (raw) { const rc = this.cellRect(last.col, last.row); this.tip.hidden = false; this.tip.textContent = `${addr(last.col, last.row)}: ${raw}`; this.tip.style.left = rc.x + 'px'; this.tip.style.top = rc.y + rc.h + 6 + 'px'; }
        await sleep(ms / steps);
      }
      this.grid.classList.remove('filling'); this.fillBox.hidden = true; this.tip.hidden = true;
      if (!isCancelled()) this.fill(src, dst, 'demo');
    } finally { this.canEdit = prev; this.opts.readOnly = prevRO; this.render(); }
  }

  destroy() {
    this._unsub?.();
    this._timers.forEach(clearTimeout);
    this.root.innerHTML = '';
  }
}

// ---------- көмекші ----------
function el(tag, cls) { const d = document.createElement(tag); if (cls) d.className = cls; return d; }
function place(d, x, y, w, h) { d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.width = w + 'px'; d.style.height = h + 'px'; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function parseRectSafe(t) {
  const parts = String(t).split(':'); const a = parseAddr(parts[0]); const b = parts[1] ? parseAddr(parts[1]) : a;
  return a && b ? normRect(a.col, a.row, b.col, b.row) : null;
}
export { parseRectSafe };

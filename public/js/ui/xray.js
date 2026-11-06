// «Формула рентгені»: таңдалған ұяшықтың формуласын түсті сілтемелермен және түсіндірмемен көрсетеді.
import { refSpans, explainRefKind } from '../engine/formula.js';
import { formatValue, isErr, ERROR_HELP } from '../engine/values.js';
import { colorizeFormula, escapeHtml, refColor } from './colors.js';

export class XRay {
  constructor(root, sheet) {
    this.root = root; this.sheet = sheet; this.log = null;
    root.classList.add('xray');
    sheet.on('select', () => this.render());
    sheet.on('spans', () => this.render());
    sheet.on('change', () => this.render());
    sheet.on('fill', (e) => { this.log = e; this.render(); });
    this.render();
  }

  render() {
    const sh = this.sheet, wb = sh.wb;
    const editing = sh.edit;
    const a = sh.active;
    const raw = editing ? editing.text : wb.getRaw(a);
    const isF = raw.startsWith('=');
    const spans = isF ? refSpans(raw) : [];
    const v = editing ? null : wb.value(a);
    let html = `<div class="xr-top"><span class="xr-addr">${a}</span>`;
    if (isF) {
      html += `<div class="xr-formula">${colorizeFormula(raw, spans)}</div>`;
      if (!editing) html += `<span class="xr-eq">=</span><span class="xr-val ${isErr(v) ? 'err' : ''}">${escapeHtml(wb.display(a))}</span>`;
    } else if (raw) {
      html += `<div class="xr-plain">${escapeHtml(raw)}</div><span class="xr-note">тұрақты мән (формула емес)</span>`;
    } else {
      html += `<div class="xr-plain xr-empty">бос ұяшық</div>`;
    }
    html += '</div>';

    if (spans.length) {
      html += '<ul class="xr-refs">';
      spans.forEach((s, i) => {
        const ex = explainRefKind(s.refs[0]);
        const same = s.kind === 'range' ? explainRefKind(s.refs[1]).label === ex.label : true;
        html += `<li style="--c:${refColor(i)}"><b>${escapeHtml(s.text)}</b><span class="k">${s.kind === 'range' ? 'диапазон · ' : ''}${ex.icon} ${same ? ex.label : 'аралас'}</span><span class="n">${escapeHtml(ex.note)}</span></li>`;
      });
      html += '</ul>';
    } else if (!raw) {
      html += '<p class="xr-hint">Формула бар ұяшықты бас: сілтемелер түсті қорапшамен көрінеді.</p>';
    }
    if (!editing && isErr(v)) html += `<p class="xr-err"><b>${escapeHtml(v.code)}</b> — ${escapeHtml(ERROR_HELP[v.code] || '')}</p>`;

    if (this.log && this.log.log && this.log.log.length) {
      html += '<div class="xr-log"><div class="xr-log-h">Көшіру журналы <small>(сілтеме қалай ауысты)</small></div><ul>';
      const items = this.log.log.slice(0, 6);
      items.forEach((l) => {
        const sa = refSpans(l.rawFrom), sb = refSpans(l.to);
        const changed = new Set(); sb.forEach((s, i) => { if (!sa[i] || sa[i].text !== s.text) changed.add(i); });
        html += `<li><span class="addr">${l.addr}</span><code class="from">${escapeHtml(l.rawFrom)}</code><span class="arr">→</span><code class="to">${colorizeFormula(l.to, sb, { changed })}</code></li>`;
      });
      if (this.log.log.length > items.length) html += `<li class="more">… тағы ${this.log.log.length - items.length} ұяшық</li>`;
      html += '</ul></div>';
    }
    this.root.innerHTML = html;
  }
}

// Формуладағы сілтемелерді бөлектейтін түстер (Excel-дегідей): формула мәтіні мен кестедегі жиек бір түсте.
export const REF_COLORS = ['#2f6bff', '#e0334f', '#8a3ffc', '#e08a00', '#0fa37f'];
export const refColor = (i) => REF_COLORS[i % REF_COLORS.length];

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Формуланы түсті HTML-ге айналдыру (сілтемелер — өз түсінде). */
export function colorizeFormula(text, spans, { changed } = {}) {
  let out = '', pos = 0;
  spans.forEach((s, i) => {
    out += escapeHtml(text.slice(pos, s.start));
    const cls = changed && changed.has(i) ? ' class="ch"' : '';
    out += `<span${cls} style="--c:${refColor(i)}">${escapeHtml(text.slice(s.start, s.end))}</span>`;
    pos = s.end;
  });
  return out + escapeHtml(text.slice(pos));
}

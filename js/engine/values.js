// Мәндер типтері, қателер және сандарды көрсету форматы.

export class XlError {
  constructor(code) { this.code = code; }
  toString() { return this.code; }
}

export const ERR = {
  DIV0: new XlError('#ДЕЛ/0!'),
  NAME: new XlError('#ИМЯ?'),
  VALUE: new XlError('#ЗНАЧ!'),
  REF: new XlError('#ССЫЛ!'),
  NUM: new XlError('#ЧИСЛО!'),
  NA: new XlError('#Н/Д'),
  CYCLE: new XlError('#ЦИКЛ!'),
};

export const isErr = (v) => v instanceof XlError;

/** Қате кодтарының оқушыға түсінікті түсіндірмесі (қазақша). */
export const ERROR_HELP = {
  '#ДЕЛ/0!': 'Нөлге бөлу! Бөлгіш ұяшық бос немесе 0-ге тең. Сілтеме қате жаққа ауысып кетпеді ме?',
  '#ИМЯ?': 'Excel бұл атауды танымады. Функция атын (СУММ, МАКС…) немесе ұяшық адресін (латын әрпімен!) тексер.',
  '#ЗНАЧ!': 'Мәтінмен есептеуге болмайды. Формула сілтеме жасаған ұяшықта сан емес, мәтін тұр.',
  '#ССЫЛ!': 'Сілтеме кестеден шығып кетті (мысалы, 1-жолдан жоғары).',
  '#ЧИСЛО!': 'Сан тым үлкен немесе есептеу мүмкін емес.',
  '#Н/Д': 'Мән табылмады.',
  '#ЦИКЛ!': 'Формула өз-өзіне сілтеме жасап тұр (шеңбер).',
};

/** Ортақ формат: 3,5 (үтірмен), артық нөлдерсіз. */
function general(v) {
  if (!Number.isFinite(v)) return ERR.NUM.code;
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e11 || abs < 1e-9) return v.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E').replace('.', ',');
  return String(Number(v.toPrecision(10))).replace('.', ',');
}

function fixed(n, dec) {
  // Қайта-қайта қосқанда 34.65 → 34.6 болмауы үшін аздап түзетеміз
  const f = 10 ** dec;
  const r = Math.round((n + Math.sign(n) * Number.EPSILON * Math.abs(n)) * f) / f;
  return r.toFixed(dec).replace('.', ',');
}

/**
 * @param {*} v — number | string | boolean | XlError | null
 * @param {{type?:'percent', dec?:number}|undefined} fmt
 */
export function formatValue(v, fmt) {
  if (v === null || v === undefined) return '';
  if (isErr(v)) return v.code;
  if (typeof v === 'boolean') return v ? 'ИСТИНА' : 'ЛОЖЬ';
  if (typeof v === 'string') return v;
  if (fmt && fmt.type === 'percent') return fixed(v * 100, fmt.dec ?? 0) + '%';
  if (fmt && typeof fmt.dec === 'number') return fixed(v, fmt.dec);
  return general(v);
}

/** Тор ішіндегі теру мәтінін мәнге айналдыру: "12,5" → 12.5, "50%" → 0.5 (+ пайыз форматы). */
export function parseEntry(text) {
  const t = text.trim();
  const m = /^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(%?)$/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (m[2]) {
    const dec = (m[1].split(/[.,]/)[1] || '').length;
    return { value: n / 100, fmt: { type: 'percent', dec } };
  }
  return { value: n };
}

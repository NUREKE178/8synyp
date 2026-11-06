// Ұяшық адрестерімен жұмыс: A1, $A$1, B2:B6.
// Таза функциялар — DOM-ға да, Node-қа да тәуелсіз (тесттер үшін).

export const MAX_COL = 702; // ZZ

/** 1 → "A", 27 → "AA" */
export function colToLetters(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "A" → 1, "AA" → 27 */
export function lettersToCol(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

// Орыс/қазақ пернетақтасында B, C, A әрпінің орнына дәл осындай кириллица әрпі жиі басылады.
const LOOKALIKE = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
  а: 'a', в: 'b', с: 'c', е: 'e', н: 'h', к: 'k', м: 'm', о: 'o', р: 'p', т: 't', х: 'x',
};

/** Кириллицадағы «қос әріптерді» латынға ауыстырады (тек адрес үшін). */
export function latinizeLetters(s) {
  return s.replace(/[А-Яа-я]/g, (ch) => LOOKALIKE[ch] ?? ch);
}

const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})$/;

/**
 * "$B$2" → { col:2, row:2, absCol:true, absRow:true } немесе null.
 * Кириллица әріптерін де қабылдайды (В2 → B2).
 */
export function parseRef(text) {
  const m = REF_RE.exec(latinizeLetters(text));
  if (!m) return null;
  const row = Number(m[4]);
  const col = lettersToCol(m[2]);
  if (row < 1 || col < 1 || col > MAX_COL) return null;
  return { col, row, absCol: m[1] === '$', absRow: m[3] === '$' };
}

export function formatRef(ref) {
  return (ref.absCol ? '$' : '') + colToLetters(ref.col) + (ref.absRow ? '$' : '') + ref.row;
}

/** Қарапайым адрес: (2,3) → "B3" */
export function addr(col, row) {
  return colToLetters(col) + row;
}

/** "B3" → {col:2,row:3} (доллар белгісіз де, доллармен де) */
export function parseAddr(text) {
  const r = parseRef(text);
  return r ? { col: r.col, row: r.row } : null;
}

/** Тіктөртбұрыш: { c1, r1, c2, r2 } (c1<=c2, r1<=r2) */
export function normRect(c1, r1, c2, r2) {
  return { c1: Math.min(c1, c2), r1: Math.min(r1, r2), c2: Math.max(c1, c2), r2: Math.max(r1, r2) };
}

/** "B2:B6" немесе "B2" → rect */
export function parseRect(text) {
  const parts = text.split(':');
  const a = parseAddr(parts[0]);
  const b = parts[1] ? parseAddr(parts[1]) : a;
  if (!a || !b) return null;
  return normRect(a.col, a.row, b.col, b.row);
}

export function rectToText(r) {
  const a = addr(r.c1, r.r1);
  return r.c1 === r.c2 && r.r1 === r.r2 ? a : `${a}:${addr(r.c2, r.r2)}`;
}

export function rectWidth(r) { return r.c2 - r.c1 + 1; }
export function rectHeight(r) { return r.r2 - r.r1 + 1; }
export function rectContains(r, col, row) {
  return col >= r.c1 && col <= r.c2 && row >= r.r1 && row <= r.r2;
}

/** Тіктөртбұрыштағы барлық адрестер (жол бойынша). */
export function* cellsIn(r) {
  for (let row = r.r1; row <= r.r2; row++) {
    for (let col = r.c1; col <= r.c2; col++) yield addr(col, row);
  }
}

/**
 * F4 циклі: A1 → $A$1 → A$1 → $A1 → A1.
 */
export function cycleAbs(ref) {
  const { absCol, absRow } = ref;
  if (!absCol && !absRow) return { ...ref, absCol: true, absRow: true };
  if (absCol && absRow) return { ...ref, absCol: false, absRow: true };
  if (!absCol && absRow) return { ...ref, absCol: true, absRow: false };
  return { ...ref, absCol: false, absRow: false };
}

/** Сілтеме түрі: relative | absolute | mixed-col | mixed-row */
export function refKind(ref) {
  if (ref.absCol && ref.absRow) return 'absolute';
  if (ref.absCol) return 'mixed-col';
  if (ref.absRow) return 'mixed-row';
  return 'relative';
}

// 10 балдық жүйе (6–10): жиналған XP-дің максималды XP-ге қатынасы бойынша.
// Шектерді мұғалім панелінен өзгертуге болады (браузерде сақталады).
import { LEVELS, levelMaxXp } from './levels.js';

/** Барлық деңгей + финал бойынша мүмкін болатын максималды XP (қосымша тапсырмаларымен). */
export const MAX_XP = LEVELS.reduce((s, l) => s + levelMaxXp(l), 0) + 8 * 60 + 300;

/** Әдепкі шкала: min — үлес (0…1). Одан төмені — 6 балл. */
export const DEFAULT_RULES = [
  { grade: 10, min: 0.85 },
  { grade: 9, min: 0.70 },
  { grade: 8, min: 0.55 },
  { grade: 7, min: 0.40 },
];
export const MIN_GRADE = 6;

const KEY = 'formula-quest:grade-rules';

export function loadRules() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(r) && r.length === 4 && r.every((x) => typeof x.min === 'number')) return DEFAULT_RULES.map((d, i) => ({ grade: d.grade, min: r[i].min }));
  } catch { /* әдепкі */ }
  return DEFAULT_RULES.map((r) => ({ ...r }));
}
export function saveRules(rules) { try { localStorage.setItem(KEY, JSON.stringify(rules)); } catch { /* ignore */ } }

/**
 * @param {number} xp
 * @param {number} [max]
 * @param {{grade:number,min:number}[]} [rules] — кему ретімен (10, 9, 8, 7)
 * @returns {number|null} 6…10, ал ештеңе істемеген оқушы үшін null
 */
export function gradeFor(xp, max = MAX_XP, rules = DEFAULT_RULES) {
  if (!xp || xp <= 0) return null;
  const share = xp / (max || MAX_XP);
  for (const r of rules) if (share >= r.min) return r.grade;
  return MIN_GRADE;
}

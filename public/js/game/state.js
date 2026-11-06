// Прогресс пен баптауларды localStorage-та сақтау (қолжетімсіз болса да ойын жұмыс істейді).

const KEY = 'formula-quest:v1';
const genUid = () => {
  try { return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join(''); } catch { return Array.from({ length: 16 }, () => ((Math.random() * 16) | 0).toString(16)).join(''); }
};
const defaults = () => ({ uid: genUid(), name: '', cls: '', startedAt: Date.now(), done: {}, quizBest: 0, mute: true, theme: 'auto', seenIntro: false });

let mem = defaults();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) mem = { ...defaults(), ...JSON.parse(raw) };
} catch { /* жеке терезе немесе сақтау өшірілген */ }
if (!/^[a-f0-9]{16}$/.test(mem.uid || '')) mem.uid = genUid();
delete mem.teacher; // мұғалім режимі енді тек сервер сессиясы арқылы

const subs = new Set();
export const state = mem;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* ignore */ }
  subs.forEach((fn) => fn(mem));
}

export function resetProgress() {
  const keep = { mute: mem.mute, theme: mem.theme };
  Object.assign(mem, defaults(), keep);
  save();
}

/** Деңгей бойынша жиналған XP (жарияланған жетістіктер) */
export const levelXp = (id) => (mem.done[id] ? mem.done[id].xp : 0);
export const totalXp = () => Object.values(mem.done).reduce((s, d) => s + (d.xp || 0), 0);

export function markLevel(id, data) {
  const prev = mem.done[id];
  // Қайта өткенде ең жақсы нәтиже сақталады
  if (!prev || data.xp >= prev.xp) mem.done[id] = { ...data, at: Date.now() };
  save();
}

/** Ранг: максималды XP-ге қатысты пайыз бойынша */
export const RANKS = [
  { at: 0, name: 'Жаңа бастаушы', icon: '🥚' },
  { at: 0.12, name: 'Формула шәкірті', icon: '🐣' },
  { at: 0.35, name: 'Кесте шебері', icon: '⚡' },
  { at: 0.65, name: 'Excel батыры', icon: '🛡️' },
  { at: 0.9, name: 'Excel аңызы', icon: '👑' },
];

export function rankFor(xp, maxXp) {
  const p = maxXp ? xp / maxXp : 0;
  let idx = 0;
  RANKS.forEach((r, i) => { if (p >= r.at) idx = i; });
  const next = RANKS[idx + 1];
  return { ...RANKS[idx], idx, next, toNext: next ? Math.ceil(next.at * maxXp - xp) : 0 };
}

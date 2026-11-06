// Оқушының нәтижесін мұғалімнің панеліне үнсіз жіберу. Сервер жоқ болса (мысалы, файлды ашқанда) — ештеңе бұзылмайды.
import { state, totalXp, subscribe } from './state.js';
import { MAX_XP } from './grade.js';
import { isTeacher } from './teacher.js';

let timer = null, retry = null, inFlight = false, dirty = false;

function payload() {
  const levels = {};
  for (const [id, d] of Object.entries(state.done)) {
    levels[id] = { xp: d.xp || 0, stars: d.stars || 0, hints: d.hints || 0 };
    if (id === 'boss') Object.assign(levels[id], { win: !!d.win, hearts: d.hearts || 0, correct: d.correct || 0 });
  }
  return { uid: state.uid, name: state.name, cls: state.cls || '', xp: totalXp(), max: MAX_XP, levels, startedAt: state.startedAt };
}

async function send() {
  if (inFlight) { dirty = true; return; }
  if (isTeacher() || !state.name) return;
  inFlight = true; dirty = false;
  try {
    const res = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()), keepalive: true });
    if (res.status === 404 || res.status === 405) return; // API жоқ — қайталамаймыз
    if (!res.ok) throw new Error(String(res.status));
    clearTimeout(retry); retry = null;
  } catch {
    clearTimeout(retry); retry = setTimeout(send, 20000); // желі үзілсе — 20 секундтан кейін қайталаймыз
  } finally {
    inFlight = false;
    if (dirty) scheduleSync(300);
  }
}

export function scheduleSync(delay = 900) { clearTimeout(timer); timer = setTimeout(send, delay); }

export function startSync() {
  subscribe(() => scheduleSync());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') scheduleSync(0); });
  scheduleSync(1500);
}

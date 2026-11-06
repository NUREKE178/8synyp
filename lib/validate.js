'use strict';
// Оқушы жіберетін нәтижені тексеру және тазалау. Клиентке сенбейміз: барлық өрістің түрі мен шегі тексеріледі.

const LEVEL_IDS = ['addr', 'stats', 'relative', 'absolute', 'share', 'mixed', 'boss'];
const int = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; };
// Басқару таңбаларын және HTML-ге қауіпті тізбектерді алып тастаймыз, ұзындықты шектейміз
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

class ValidationError extends Error {}

function result(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Дұрыс емес сұраныс');
  const uid = typeof body.uid === 'string' && /^[a-f0-9]{16}$/.test(body.uid) ? body.uid : null;
  if (!uid) throw new ValidationError('uid жоқ');
  const name = text(body.name, 40);
  if (!name) throw new ValidationError('Аты жоқ');
  const levels = {};
  const src = body.levels && typeof body.levels === 'object' ? body.levels : {};
  for (const id of LEVEL_IDS) {
    const l = src[id]; if (!l || typeof l !== 'object') continue;
    levels[id] = { xp: int(l.xp, 0, 3000), stars: int(l.stars, 0, 3), hints: int(l.hints, 0, 99) };
    if (id === 'boss') Object.assign(levels[id], { win: !!l.win, hearts: int(l.hearts, 0, 3), correct: int(l.correct, 0, 20) });
  }
  const now = Date.now();
  return {
    uid, name, cls: text(body.cls, 8),
    xp: int(body.xp, 0, 20000),
    max: int(body.max, 0, 20000),
    levels,
    startedAt: int(body.startedAt, 0, now + 60000) || now,
    updatedAt: now,
  };
}

module.exports = { result, ValidationError, LEVEL_IDS };

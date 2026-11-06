'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let G, L;
test.before(async () => {
  const root = path.join(__dirname, '..', 'public', 'js', 'game');
  G = await import(pathToFileURL(path.join(root, 'grade.js')).href);
  L = await import(pathToFileURL(path.join(root, 'levels.js')).href);
});

test('балл тек 6–10 аралығында; ештеңе істемеген оқушыға балл жоқ', () => {
  assert.equal(G.gradeFor(0), null);
  for (let p = 0.01; p <= 1.2; p += 0.01) { const g = G.gradeFor(G.MAX_XP * p); assert.ok(g >= 6 && g <= 10, `p=${p} → ${g}`); }
});

test('шектер: 85% → 10, 70% → 9, 55% → 8, 40% → 7, одан төмен → 6', () => {
  const at = (p) => G.gradeFor(G.MAX_XP * p);
  assert.deepEqual([at(0.9), at(0.85), at(0.84), at(0.7), at(0.55), at(0.4), at(0.39), at(0.05)], [10, 10, 9, 9, 8, 7, 6, 6]);
});

test('көмексіз, мінсіз өткен оқушы 10 алады; барлық көмекті қолданған — төмен', () => {
  const per = (l, hints) => l.quests.filter((q) => !q.bonus).length * Math.max(25, 100 - hints * 25) + (l.predict ? 50 : 0) + 100 + (hints ? 0 : 50);
  const perfect = L.LEVELS.reduce((s, l) => s + per(l, 0), 0) + 8 * 60 + 300;
  const hinted = L.LEVELS.reduce((s, l) => s + per(l, 3), 0) + 3 * 60;
  assert.equal(G.gradeFor(perfect), 10);
  assert.ok(G.gradeFor(hinted) <= 7);
});

test('шкаланы өзгертуге болады', () => {
  const strict = [{ grade: 10, min: 0.95 }, { grade: 9, min: 0.85 }, { grade: 8, min: 0.7 }, { grade: 7, min: 0.5 }];
  assert.equal(G.gradeFor(G.MAX_XP * 0.9, G.MAX_XP, strict), 9);
});

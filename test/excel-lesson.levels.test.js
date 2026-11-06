'use strict';
// Деңгей деректерінің тұтастығы: шешім барлық міндетті тапсырмаларды өткізуі керек,
// ал бастапқы күйде бірде-бір тапсырма өздігінен орындалған болмауы тиіс.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', 'public', 'js');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);

let W, F, R, L;
test.before(async () => {
  W = (await load('engine/workbook.js')).Workbook;
  F = await load('engine/formula.js');
  R = await load('engine/refs.js');
  L = await load('game/levels.js');
});

function build(level) {
  const S = level.sheet;
  const wb = new W({ cols: S.cols, rows: S.rows });
  const data = { ...S.data };
  if (level.treasures) Object.keys(level.treasures).forEach((a) => { data[a] = '❓'; });
  wb.load(data);
  const flags = { visited: new Set(), edited: new Set(), filled: false, dragged: false, f4: false };
  const ctx = {
    wb, flags, val: (a) => wb.value(a), raw: (a) => wb.getRaw(a), disp: (a) => wb.display(a), canon: (a) => wb.canonical(a),
    canonOf: F.canonicalFormula, isF: (a) => wb.isFormula(a), fns: (a) => wb.fnsUsed(a), fmt: (a) => wb.getFmt(a),
  };
  return { wb, flags, ctx };
}

test('бастапқы күйде тапсырмалар өздігінен орындалмайды', () => {
  for (const level of L.LEVELS) {
    const { ctx } = build(level);
    for (const q of level.quests) assert.equal(!!q.check(ctx), false, `${level.id}/${q.id} бастапқыда орындалып қойған`);
  }
});

test('шешім барлық міндетті тапсырмаларды өткізеді', () => {
  for (const level of L.LEVELS) {
    const { wb, flags, ctx } = build(level);
    for (const [a, f] of Object.entries(level.solution)) wb.setEntry(a, f);
    for (const [s, d] of level.solutionFill || []) wb.fill(R.parseRect(s), R.parseRect(d));
    for (const [r, f] of Object.entries(level.solutionFmt || {})) for (const a of R.cellsIn(R.parseRect(r))) wb.setFmt(a, f);
    // оқушы барлық ұяшықты басып шығады деп есептейміз
    for (let c = 1; c <= level.sheet.cols; c++) for (let r = 1; r <= level.sheet.rows; r++) flags.visited.add(R.addr(c, r));
    if (level.id === 'addr') wb.setEntry('A1', '10');
    if (level.id === 'relative') wb.setEntry('C3', '3500');
    if (level.id === 'stats') wb.setEntry('B5', '70');
    if (level.id === 'share') wb.setEntry('C5', '=СУММ(C2:C4)');
    for (const q of level.quests) assert.equal(!!q.check(ctx), true, `${level.id}/${q.id} шешіммен орындалмады`);
  }
});

test('болжау сұрақтарының дұрыс жауаптары қозғалтқышпен сәйкес', () => {
  const rel = L.LEVELS.find((l) => l.id === 'relative').predict;
  assert.equal(rel.options[rel.answer], '=B5*C5');
  assert.equal(F.shiftFormula('=B2*C2', 0, 3), '=B5*C5');
  const mixed = L.LEVELS.find((l) => l.id === 'mixed').predict;
  assert.equal(mixed.options[mixed.answer], F.shiftFormula('=$A2*B$1', 2, 2));
});

test('босс-викторина: әр сұрақта бір ғана дұрыс жауап, нұсқалар қайталанбайды', () => {
  for (let i = 0; i < 20; i++) {
    for (const q of L.buildQuiz()) {
      assert.ok(q.answer >= 0 && q.answer < q.options.length);
      assert.equal(new Set(q.options).size, q.options.length, `қайталанатын нұсқа: ${q.q}`);
    }
  }
});

test('деңгейлердің XP есебі оң және ерекше идентификаторлар', () => {
  const ids = L.LEVELS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const l of L.LEVELS) assert.ok(L.levelMaxXp(l) > 0);
});

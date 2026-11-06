'use strict';
// «Формула Квест» сабағының кесте қозғалтқышы: есептеу, сілтемелердің ауысуы, F4, толтыру.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const base = path.join(__dirname, '..', 'public', 'js', 'engine');
const load = (f) => import(pathToFileURL(path.join(base, f)).href);

let W, F, R, V;
test.before(async () => {
  W = (await load('workbook.js')).Workbook;
  F = await load('formula.js');
  R = await load('refs.js');
  V = await load('values.js');
});

const sheet = (data) => { const w = new W({ cols: 12, rows: 20 }); w.load(data); return w; };

test('адрестер: A1, $A$1, кириллица В2', () => {
  assert.equal(R.colToLetters(27), 'AA');
  assert.equal(R.lettersToCol('AB'), 28);
  assert.deepEqual(R.parseRef('$B$2'), { col: 2, row: 2, absCol: true, absRow: true });
  assert.deepEqual(R.parseRef('В2'), { col: 2, row: 2, absCol: false, absRow: false });
  assert.equal(R.parseRef('A0'), null);
});

test('статистикалық функциялар (орысша және ағылшынша)', () => {
  const w = sheet({ B2: '10', B3: '20', B4: 'жоқ', B5: '30', B6: '40' });
  w.setEntry('C1', '=СУММ(B2:B6)'); assert.equal(w.value('C1'), 100);
  w.setEntry('C2', '=срзнак(B2:B6)'); // қате атау → #ИМЯ?
  assert.equal(w.display('C2'), '#ИМЯ?');
  w.setEntry('C2', '=СРЗНАЧ(B2:B6)'); assert.equal(w.value('C2'), 25);
  w.setEntry('C3', '=MAX(B2:B6)'); assert.equal(w.value('C3'), 40);
  w.setEntry('C4', '=МИН(B2:B6)'); assert.equal(w.value('C4'), 10);
  w.setEntry('C5', '=СЧЁТ(B2:B6)'); assert.equal(w.value('C5'), 4); // мәтін санамайды
  assert.equal(w.getRaw('C3'), '=МАКС(B2:B6)'); // функция аты орысшаға нормаланады
});

test('арифметика мен басымдық', () => {
  const w = sheet({ A1: '2', A2: '3' });
  w.setEntry('B1', '=A1+A2*2'); assert.equal(w.value('B1'), 8);
  w.setEntry('B2', '=(A1+A2)*2'); assert.equal(w.value('B2'), 10);
  w.setEntry('B3', '=-A1^2'); assert.equal(w.value('B3'), 4); // Excel-дегідей
  w.setEntry('B4', '=A1/0'); assert.equal(w.display('B4'), '#ДЕЛ/0!');
  w.setEntry('B5', '=A1*0,5'); assert.equal(w.value('B5'), 1);
});

test('автоматты қайта есептеу', () => {
  const w = sheet({ A1: '5', B1: '7', C1: '=A1+B1' });
  assert.equal(w.value('C1'), 12);
  w.setEntry('A1', '10'); assert.equal(w.value('C1'), 17);
});

test('салыстырмалы сілтеме көшіргенде ауысады', () => {
  assert.equal(F.shiftFormula('=B2*C2', 0, 1), '=B3*C3');
  assert.equal(F.shiftFormula('=B2*C2', 1, 0), '=C2*D2');
  assert.equal(F.shiftFormula('=B2*2', 0, 3), '=B5*2');
});

test('абсолютті және аралас сілтеме', () => {
  assert.equal(F.shiftFormula('=B2/$E$1', 0, 2), '=B4/$E$1');
  assert.equal(F.shiftFormula('=$A2*B$1', 2, 2), '=$A4*D$1');
  assert.equal(F.shiftFormula('=СУММ(B2:B6)', 1, 0), '=СУММ(C2:C6)');
  assert.equal(F.shiftFormula('=СУММ($B$2:B6)', 0, 1), '=СУММ($B$2:B7)');
});

test('кестеден шығып кету → #ССЫЛ!', () => {
  assert.equal(F.shiftFormula('=A1+B1', 0, -1), '=#ССЫЛ!+#ССЫЛ!');
  const w = sheet({ A1: '1', A2: '=A1' });
  w.setEntry('A2', '=A1');
  w.cells.set('A3', { raw: F.shiftFormula('=A1', 0, -5) });
  assert.equal(w.display('A3'), '#ССЫЛ!');
});

test('fill: бір формуланы төмен созу', () => {
  const w = sheet({ B2: '3', B3: '4', B4: '5', C2: '10', C3: '20', C4: '30', D2: '=B2*C2' });
  const res = w.fill({ c1: 4, r1: 2, c2: 4, r2: 2 }, { c1: 4, r1: 2, c2: 4, r2: 4 });
  assert.deepEqual(res.changed, ['D3', 'D4']);
  assert.equal(w.getRaw('D3'), '=B3*C3');
  assert.equal(w.getRaw('D4'), '=B4*C4');
  assert.equal(w.value('D4'), 150);
});

test('баг: F4-сіз доллар бағамы → #ДЕЛ/0!, түзеткен соң дұрыс', () => {
  const w = sheet({ E1: '500', B2: '250', B3: '150', B4: '3000', C2: '=B2/E1' });
  w.fill({ c1: 3, r1: 2, c2: 3, r2: 2 }, { c1: 3, r1: 2, c2: 3, r2: 4 });
  assert.equal(w.getRaw('C3'), '=B3/E2');
  assert.equal(w.display('C3'), '#ДЕЛ/0!');
  w.setEntry('C2', '=B2/$E$1');
  w.fill({ c1: 3, r1: 2, c2: 3, r2: 2 }, { c1: 3, r1: 2, c2: 3, r2: 4 });
  assert.deepEqual([w.value('C2'), w.value('C3'), w.value('C4')], [0.5, 0.3, 6]);
});

test('үлес: $B$5 бекітілген, пайыз форматы', () => {
  const w = sheet({ B2: '24', B3: '26', B4: '25', B5: '=СУММ(B2:B4)', C2: '=B2/$B$5' });
  w.fill({ c1: 3, r1: 2, c2: 3, r2: 2 }, { c1: 3, r1: 2, c2: 3, r2: 4 });
  assert.equal(w.value('B5'), 75);
  w.setFmt('C2', { type: 'percent', dec: 1 }); w.setFmt('C3', { type: 'percent', dec: 1 }); w.setFmt('C4', { type: 'percent', dec: 1 });
  assert.deepEqual(['C2', 'C3', 'C4'].map((a) => w.display(a)), ['32,0%', '34,7%', '33,3%']);
});

test('көбейту кестесі: =$A2*B$1 бір формуламен бүкіл кестеге', () => {
  const w = sheet({ B1: '1', C1: '2', D1: '3', A2: '1', A3: '2', A4: '3', B2: '=$A2*B$1' });
  w.fill({ c1: 2, r1: 2, c2: 2, r2: 2 }, { c1: 2, r1: 2, c2: 4, r2: 2 }); // оңға
  w.fill({ c1: 2, r1: 2, c2: 4, r2: 2 }, { c1: 2, r1: 2, c2: 4, r2: 4 }); // төмен (3 бағаннан)
  assert.equal(w.getRaw('D4'), '=$A4*D$1');
  assert.equal(w.value('D4'), 9);
  assert.equal(w.value('C3'), 4);
});

test('F4: A1 → $A$1 → A$1 → $A1 → A1', () => {
  let t = '=B2*C2';
  const seq = [];
  for (let i = 0; i < 4; i++) { t = F.toggleAbsAt(t, 3).text; seq.push(t); } // курсор B2 соңында
  assert.deepEqual(seq, ['=$B$2*C2', '=B$2*C2', '=$B2*C2', '=B2*C2']);
  assert.equal(F.toggleAbsAt('=1+2', 2), null);
});

test('F4 диапазонда: екі шетіне де қолданылады', () => {
  assert.equal(F.toggleAbsAt('=СУММ(B2:B6)', 8).text, '=СУММ($B$2:$B$6)');
});

test('цикл анықталады', () => {
  const w = sheet({});
  w.setEntry('A1', '=B1'); w.setEntry('B1', '=A1');
  assert.equal(w.display('A1'), '#ЦИКЛ!');
});

test('формула қатесі теру кезінде ұсталады', () => {
  const w = sheet({});
  assert.equal(w.setEntry('A1', '=(1+2').ok, false);
  assert.equal(w.setEntry('A1', '=1+').ok, false);
  assert.equal(w.setEntry('A1', '=1+2)').ok, false);
  assert.equal(w.setEntry('A1', '=СУММ(').ok, false);
  assert.equal(w.setEntry('A1', '=1+2').ok, true);
});

test('канондық түр: тәртіп, бос орын, тіл маңызды емес; $ маңызды', () => {
  assert.equal(F.canonicalFormula('=C2 * B2'), F.canonicalFormula('=B2*C2'));
  assert.equal(F.canonicalFormula('=сумм(b2:b6)'), F.canonicalFormula('=SUM(B2:B6)'));
  assert.notEqual(F.canonicalFormula('=B2/$E$1'), F.canonicalFormula('=B2/E1'));
});

test('undo / redo', () => {
  const w = sheet({ A1: '1' });
  w.transact(() => w.setEntry('A1', '99', { silent: true }));
  assert.equal(w.value('A1'), 99);
  w.undo(); assert.equal(w.value('A1'), 1);
  w.redo(); assert.equal(w.value('A1'), 99);
});

test('көрсету форматы: үтір, пайыз', () => {
  assert.equal(V.formatValue(0.5), '0,5');
  assert.equal(V.formatValue(0.1 + 0.2), '0,3');
  assert.equal(V.formatValue(1 / 3, { type: 'percent', dec: 1 }), '33,3%');
  assert.equal(V.formatValue(0.32, { type: 'percent' }), '32%');
  assert.deepEqual(V.parseEntry('50%'), { value: 0.5, fmt: { type: 'percent', dec: 0 } });
});

'use strict';
// Нәтижелерді жинау API-і: оқушы жібереді, тек мұғалім көреді/өшіреді.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-test-'));
process.env.TEACHER_PASSWORD = 'mugalim-2026';
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL;
const { handle } = require('../lib/app');

let server, base, cookie = '';
const uid = (n) => n.toString(16).padStart(16, '0');
test.before(async () => { server = http.createServer(handle); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
test.after(() => server.close());

async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}
const sample = (n, over = {}) => ({ uid: uid(n), name: 'Айдана С.', cls: '8А', xp: 1200, max: 4630, levels: { addr: { xp: 650, stars: 3, hints: 0 }, boss: { xp: 300, stars: 2, hints: 0, win: true, hearts: 2, correct: 7 } }, startedAt: Date.now(), ...over });

test('нәтижелерді мұғалім кірместен көруге болмайды', async () => {
  assert.equal((await call('GET', '/api/results')).status, 401);
  assert.equal((await call('DELETE', '/api/results?all=1')).status, 401);
});

test('оқушы нәтиже жібереді (кірусіз), ал қате деректер қабылданбайды', async () => {
  assert.equal((await call('POST', '/api/submit', sample(1))).status, 200);
  assert.equal((await call('POST', '/api/submit', { ...sample(2), uid: 'bad' })).status, 400);
  assert.equal((await call('POST', '/api/submit', { ...sample(2), name: '   ' })).status, 400);
  assert.equal((await call('GET', '/api/submit')).status, 405);
});

test('қате құпиясөз қабылданбайды, дұрысы cookie береді', async () => {
  assert.equal((await call('POST', '/api/teacher', { password: 'wrong' })).status, 401);
  assert.equal((await call('GET', '/api/results')).status, 401);
  const ok = await call('POST', '/api/teacher', { password: 'mugalim-2026' });
  assert.equal(ok.status, 200);
  assert.ok(cookie.startsWith('fq_teacher='));
  assert.deepEqual((await call('GET', '/api/teacher')).data, { enabled: true, teacher: true, storage: 'filesystem' });
});

test('мұғалім нәтижелерді көреді; қайта жіберу жазбаны жаңартады, көбейтпейді', async () => {
  await call('POST', '/api/submit', sample(1, { xp: 2000 }));
  await call('POST', '/api/submit', sample(3, { name: 'Нұрлан Б.', cls: '8Ә', xp: 300 }));
  const r = await call('GET', '/api/results');
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 2);
  const a = r.data.items.find((x) => x.uid === uid(1));
  assert.equal(a.xp, 2000); assert.equal(a.cls, '8А'); assert.equal(a.levels.boss.win, true);
});

test('деректер тазаланады және шектеледі', async () => {
  await call('POST', '/api/submit', sample(4, { name: '<b>Ұзын</b>' + 'а'.repeat(80), cls: '8Б-ұзын-сынып', xp: 9e9, levels: { addr: { xp: -5, stars: 99, hints: 'x' }, hack: { xp: 1 } } }));
  const it = (await call('GET', '/api/results')).data.items.find((x) => x.uid === uid(4));
  assert.ok(it.name.length <= 40 && !/[<>]/.test(it.name));
  assert.ok(it.cls.length <= 8);
  assert.equal(it.xp, 20000);
  assert.deepEqual(it.levels, { addr: { xp: 0, stars: 3, hints: 0 } });
});

test('тым үлкен сұраныс қабылданбайды', async () => {
  const res = await call('POST', '/api/submit', { ...sample(5), pad: 'x'.repeat(20000) });
  assert.equal(res.status, 413);
});

test('өшіру: біреуін және барлығын', async () => {
  assert.equal((await call('DELETE', `/api/results?id=${uid(3)}`)).status, 200);
  assert.equal((await call('GET', '/api/results')).data.items.some((x) => x.uid === uid(3)), false);
  assert.equal((await call('DELETE', '/api/results')).status, 400);
  assert.equal((await call('DELETE', '/api/results?all=1')).status, 200);
  assert.equal((await call('GET', '/api/results')).data.items.length, 0);
});

test('шығу cookie-ді өшіреді', async () => {
  await call('DELETE', '/api/teacher'); cookie = '';
  assert.equal((await call('GET', '/api/results')).status, 401);
});

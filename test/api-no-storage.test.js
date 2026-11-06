'use strict';
// Vercel-де Blob қосылмаған болса: «бос тізім» емес, түсінікті қате көрінуі керек.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.VERCEL = '1';
process.env.TEACHER_PASSWORD = 'mugalim-2026';
delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_STORE_ID;
for (const k of Object.keys(process.env)) if (/_READ_WRITE_TOKEN$/.test(k)) delete process.env[k];
const { handle } = require('../lib/app');

let server, base, cookie = '';
test.before(async () => { server = http.createServer(handle); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
test.after(() => server.close());
async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('оқушы жіберімі 503 + түсінікті хабарлама қайтарады', async () => {
  const r = await call('POST', '/api/submit', { uid: 'a'.repeat(16), name: 'Айдана', xp: 10 });
  assert.equal(r.status, 503);
  assert.match(r.data.error, /Blob/);
});

test('мұғалім тізімі бос емес, нақты қате көрсетеді; диагностика себебін айтады', async () => {
  await call('POST', '/api/teacher', { password: 'mugalim-2026' });
  const r = await call('GET', '/api/results');
  assert.equal(r.status, 503);
  assert.match(r.data.error, /Blob/);
  const d = await call('GET', '/api/diagnose');
  assert.equal(d.status, 200);
  assert.equal(d.data.write.ok, false);
  assert.match(d.data.hint, /Connect Project/);
});

'use strict';
// Vercel Blob жолы жалған SDK-мен: нақты қойманың талаптарын (cacheControlMaxAge ≥ 60, Public/Private) тексереді.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
process.env.TEACHER_PASSWORD = 'mugalim-2026';
delete process.env.BLOB_ACCESS;
const files = new Map(); const calls = [];
let storeAccess = 'private'; // қойма Private болып жасалған деп есептейміз
const wrongAccess = () => new Error('Vercel Blob: Cannot use public access on a private store');
const fake = {
  put: async (key, body, o) => {
    calls.push(['put', o.access]);
    if (o.cacheControlMaxAge !== undefined && o.cacheControlMaxAge < 60) throw new Error('Vercel Blob: cacheControlMaxAge must be at least 60 seconds');
    if (o.access !== storeAccess) throw wrongAccess();
    files.set(key, { body: Buffer.from(body), contentType: o.contentType });
    return { url: `https://x.${storeAccess}.blob.vercel-storage.com/${key}`, pathname: key };
  },
  get: async (key, o) => {
    if (o.access !== storeAccess) throw wrongAccess();
    const f = files.get(key); return f ? { stream: new Blob([f.body]).stream(), blob: { contentType: f.contentType, size: f.body.length } } : null;
  },
  list: async ({ prefix }) => ({ blobs: [...files.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ pathname: k, url: `https://x.${storeAccess}.blob.vercel-storage.com/${k}` })), hasMore: false }),
  del: async (u) => { for (const x of [].concat(u)) { const k = [...files.keys()].find((kk) => x.endsWith('/' + kk) || x === kk); if (k) files.delete(k); } },
};
// SDK орнатылмаса да жұмыс істеу үшін require-ді тікелей ауыстырамыз
const Module = require('node:module'); const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === '@vercel/blob' ? fake : origLoad.call(this, request, ...rest); };
const { handle } = require('../lib/app');

let server, base, cookie = '';
test.before(async () => { server = http.createServer(handle); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
test.after(() => server.close());
async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}
const uid = (n) => n.toString(16).padStart(16, '0');

test('Private Blob-қа жазылады (public қатесінен кейін өзі ауысады) және мұғалімге көрінеді', async () => {
  for (let i = 1; i <= 5; i++) assert.equal((await call('POST', '/api/submit', { uid: uid(i), name: `Оқушы ${i}`, cls: '8А', xp: i * 100 })).status, 200);
  await call('POST', '/api/teacher', { password: 'mugalim-2026' });
  const r = await call('GET', '/api/results');
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 5);
  assert.equal(r.data.storage, 'vercel-blob');
  assert.deepEqual(r.data.warnings, []);
});

test('қайта жіберу файлды көбейтпейді; өшіру жұмыс істейді', async () => {
  await call('POST', '/api/submit', { uid: uid(1), name: 'Оқушы 1', cls: '8А', xp: 999 });
  const r = await call('GET', '/api/results');
  assert.equal(r.data.items.length, 5);
  assert.equal(r.data.items.find((x) => x.uid === uid(1)).xp, 999);
  await call('DELETE', `/api/results?id=${uid(2)}`);
  assert.equal((await call('GET', '/api/results')).data.items.length, 4);
});

test('диагностика барлық қадамның сәтті екенін көрсетеді', async () => {
  const d = (await call('GET', '/api/diagnose')).data;
  assert.equal(d.write.ok, true); assert.equal(d.read.ok, true); assert.equal(d.list.ok, true); assert.equal(d.hint, '');
});

'use strict';
/**
 * Оқушылардың нәтижелерін сақтау. Әр оқушы — бөлек файл: results/<uid>.json
 * (бір уақытта 30 оқушы жіберсе де, бірі екіншісін өшірмейді).
 *
 * Екі режим (автоматты таңдалады):
 *  - Vercel Blob — токен болса (Vercel-де);
 *  - файл жүйесі (data/results/) — жергілікті іске қосуда.
 * Blob-қойма Public немесе Private болуы мүмкін: қате болса, екінші түрін өзі сынайды.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const FS_DIR = path.join(DATA_DIR, 'results');
const PREFIX = 'results/';
let ACCESS = process.env.BLOB_ACCESS === 'private' ? 'private' : 'public';

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { source: 'BLOB_READ_WRITE_TOKEN' };
  const custom = Object.keys(process.env).find((k) => /_READ_WRITE_TOKEN$/.test(k) && process.env[k]);
  if (custom) return { source: custom, token: process.env[custom] };
  if (process.env.BLOB_STORE_ID) return { source: 'BLOB_STORE_ID (OIDC)' };
  return null;
}
const useBlob = () => Boolean(blobAuth());
const onVercel = () => Boolean(process.env.VERCEL);
const blob = () => require('@vercel/blob');
const opts = () => ({ ...(blobAuth()?.token ? { token: blobAuth().token } : {}) });

class StorageError extends Error {}
function assertWritable() {
  if (onVercel() && !useBlob()) {
    throw new StorageError('Қойма қосылмаған. Vercel: Storage → Blob → Connect Project, содан кейін Redeploy жасаңыз.');
  }
}

async function withAccess(fn) {
  try { return await fn(ACCESS); } catch (e) {
    if (process.env.BLOB_ACCESS) throw e;
    const other = ACCESS === 'public' ? 'private' : 'public';
    try { const r = await fn(other); ACCESS = other; return r; } catch { throw e; }
  }
}

const idOk = (id) => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id);
const missing = (e) => (e && (e.name === 'BlobNotFoundError' || /not.?found|404|does not exist/i.test(String(e.message || ''))) ? null : Promise.reject(e));

async function readBlobJson(pathname) {
  const res = await withAccess((access) => blob().get(pathname, { access, useCache: false, ...opts() }).catch(missing));
  if (!res || !res.stream) return null;
  try { return JSON.parse(await new Response(res.stream).text()); } catch { return null; }
}

async function listBlobs() {
  const out = []; let cursor;
  do {
    const page = await blob().list({ prefix: PREFIX, limit: 1000, cursor, ...opts() });
    out.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** Нәтиже сақтау (бар болса — жаңартады). */
async function saveResult(rec) {
  assertWritable();
  const json = JSON.stringify(rec);
  if (useBlob()) {
    await withAccess((access) => blob().put(`${PREFIX}${rec.uid}.json`, json, { access, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, ...opts() }));
  } else {
    await fs.mkdir(FS_DIR, { recursive: true });
    const f = path.join(FS_DIR, `${rec.uid}.json`);
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, json); await fs.rename(tmp, f);
  }
}

/** Vercel-де Blob қосылмаса, файл жүйесі тек оқуға арналған: «бос тізім» емес, нақты қате береміз. */
function assertReadable() {
  if (onVercel() && !useBlob()) throw new StorageError('Қойма қосылмаған, сондықтан нәтижелер сақталмайды. Vercel: Storage → Blob → Connect Project (Production және Preview), содан кейін Redeploy жасаңыз.');
}

/** @returns {{items:object[], failed:number, firstError:string|null}} */
async function listResults() {
  assertReadable();
  if (useBlob()) {
    const blobs = await listBlobs();
    let firstError = null;
    const all = await Promise.all(blobs.map((b) => readBlobJson(b.pathname).catch((e) => { firstError = firstError || String((e && e.message) || e).slice(0, 200); return null; })));
    const items = all.filter(Boolean);
    return { items, failed: blobs.length - items.length, firstError };
  }
  let names = [];
  try { names = (await fs.readdir(FS_DIR)).filter((n) => /^[a-f0-9]{16}\.json$/.test(n)); } catch { return { items: [], failed: 0, firstError: null }; }
  const all = await Promise.all(names.map((n) => fs.readFile(path.join(FS_DIR, n), 'utf8').then(JSON.parse).catch(() => null)));
  const items = all.filter(Boolean);
  return { items, failed: names.length - items.length, firstError: null };
}

/** Жаңа оқушыны қабылдауға бола ма (лимит), бір тізіммен. */
async function canAccept(uid, limit) {
  if (useBlob()) {
    const blobs = await listBlobs();
    return blobs.some((b) => b.pathname === `${PREFIX}${uid}.json`) || blobs.length < limit;
  }
  return (await hasResult(uid)) || (await countResults()) < limit;
}

/** Қойманы тексеру: жазу, оқу, тізім, өшіру. Теріс нәтижеде не істеу керегін айтады. */
async function diagnose() {
  const auth = blobAuth();
  const out = { mode: mode(), vercel: onVercel(), credentials: auth ? auth.source : null, access: null, write: null, read: null, list: null, hint: '' };
  const fail = (e) => ({ ok: false, error: String((e && e.message) || e).slice(0, 300) });
  try {
    assertWritable();
    if (useBlob()) {
      const key = 'diagnostics/ping.json';
      await withAccess((access) => blob().put(key, '{"ok":true}', { access, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, ...opts() }));
      out.access = ACCESS; out.write = { ok: true };
      const got = await withAccess((access) => blob().get(key, { access, useCache: false, ...opts() }));
      out.read = got ? { ok: true } : { ok: false, error: 'Файл жазылды, бірақ оқылмайды' };
      try { out.list = { ok: true, count: (await listBlobs()).length }; } catch (e) { out.list = fail(e); }
      await blob().del(key, opts()).catch(() => {});
    } else {
      await fs.mkdir(FS_DIR, { recursive: true });
      const f = path.join(DATA_DIR, 'ping.tmp');
      await fs.writeFile(f, 'ok'); out.write = { ok: true };
      out.read = { ok: (await fs.readFile(f, 'utf8')) === 'ok' }; await fs.unlink(f);
      out.list = { ok: true, count: await countResults() };
    }
  } catch (e) {
    if (!out.write) out.write = fail(e); else if (!out.read) out.read = fail(e); else out.list = fail(e);
  }
  const err = `${out.write?.error || ''} ${out.read?.error || ''} ${out.list?.error || ''}`.toLowerCase();
  if (out.vercel && !out.credentials) out.hint = 'Blob осы деплойға қосылмаған: Vercel → Storage → Blob → Connect Project (Production және Preview белгілеңіз), содан кейін Redeploy жасаңыз.';
  else if (/token|credential|unauthor|forbidden|no blob/.test(err)) out.hint = 'Blob-қа қолжетімділік қабылданбады. Қойманы жобадан ажыратып, қайта қосыңыз да, Redeploy жасаңыз.';
  else if (err.trim()) out.hint = 'Қойма қате берді. Төмендегі қате мәтінін жазып жіберіңіз.';
  return out;
}

async function countResults() {
  if (useBlob()) return (await listBlobs()).length;
  try { return (await fs.readdir(FS_DIR)).filter((n) => n.endsWith('.json')).length; } catch { return 0; }
}

async function hasResult(uid) {
  if (useBlob()) return (await listBlobs()).some((b) => b.pathname === `${PREFIX}${uid}.json`);
  try { await fs.access(path.join(FS_DIR, `${uid}.json`)); return true; } catch { return false; }
}

async function deleteResult(uid) {
  if (!idOk(uid)) return;
  if (useBlob()) {
    const b = (await listBlobs()).find((x) => x.pathname === `${PREFIX}${uid}.json`);
    if (b) await blob().del(b.url, opts());
  } else await fs.unlink(path.join(FS_DIR, `${uid}.json`)).catch(() => {});
}

async function deleteAll() {
  if (useBlob()) {
    const urls = (await listBlobs()).map((b) => b.url);
    if (urls.length) await blob().del(urls, opts());
  } else {
    let names = []; try { names = await fs.readdir(FS_DIR); } catch { return; }
    await Promise.all(names.filter((n) => n.endsWith('.json')).map((n) => fs.unlink(path.join(FS_DIR, n)).catch(() => {})));
  }
}

const mode = () => (useBlob() ? 'vercel-blob' : 'filesystem');

module.exports = { saveResult, listResults, canAccept, diagnose, countResults, hasResult, deleteResult, deleteAll, StorageError, mode, useBlob, onVercel, idOk };

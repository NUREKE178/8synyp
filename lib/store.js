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
    await withAccess((access) => blob().put(`${PREFIX}${rec.uid}.json`, json, { access, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0, ...opts() }));
  } else {
    await fs.mkdir(FS_DIR, { recursive: true });
    const f = path.join(FS_DIR, `${rec.uid}.json`);
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, json); await fs.rename(tmp, f);
  }
}

async function listResults() {
  if (useBlob()) {
    const blobs = await listBlobs();
    const all = await Promise.all(blobs.map((b) => readBlobJson(b.pathname).catch(() => null)));
    return all.filter(Boolean);
  }
  let names = [];
  try { names = (await fs.readdir(FS_DIR)).filter((n) => /^[a-f0-9]{16}\.json$/.test(n)); } catch { return []; }
  const all = await Promise.all(names.map((n) => fs.readFile(path.join(FS_DIR, n), 'utf8').then(JSON.parse).catch(() => null)));
  return all.filter(Boolean);
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

module.exports = { saveResult, listResults, countResults, hasResult, deleteResult, deleteAll, StorageError, mode, useBlob, onVercel, idOk };

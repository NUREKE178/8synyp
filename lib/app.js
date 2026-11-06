'use strict';
/**
 * API:
 *   POST   /api/submit   — оқушы нәтижесін жібереді (ашық, тек өз uid-імен жазады)
 *   GET    /api/teacher  — мұғалім сессиясының күйі { enabled, teacher, storage }
 *   POST   /api/teacher  — кіру { password }
 *   DELETE /api/teacher  — шығу
 *   GET    /api/results  — барлық нәтиже (тек мұғалім)
 *   DELETE /api/results?id=<uid> | ?all=1 — өшіру (тек мұғалім)
 *   GET    /api/diagnose — қойманы тексеру (тек мұғалім)
 */
const auth = require('./auth');
const store = require('./store');
const validate = require('./validate');

const MAX_RESULTS = 600;
const BODY_LIMIT = 8 * 1024;

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(payload);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > BODY_LIMIT) throw Object.assign(new Error('Тым үлкен'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('JSON қате'), { status: 400 }); }
}

const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('path') || url.pathname.replace(/^\/api\/?/, '');
  const clean = route.replace(/\/+$/, '');
  const m = req.method;
  try {
    if (clean === 'submit') {
      if (m !== 'POST') return send(res, 405, { error: 'POST керек' });
      const rec = validate.result(await readJson(req));
      if (!(await store.canAccept(rec.uid, MAX_RESULTS))) return send(res, 507, { error: 'Қойма толы' });
      await store.saveResult(rec);
      return send(res, 200, { ok: true });
    }

    if (clean === 'teacher') {
      if (m === 'GET') return send(res, 200, { enabled: auth.enabled(), teacher: auth.isTeacher(req), storage: store.mode() });
      if (m === 'DELETE') return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
      if (m === 'POST') {
        if (!auth.enabled()) return send(res, 503, { error: 'Мұғалім панелі өшірулі: Vercel-де TEACHER_PASSWORD (кемінде 6 таңба) орнатыңыз.' });
        const ip = ipOf(req);
        if (auth.tooManyAttempts(ip)) return send(res, 429, { error: 'Тым көп әрекет. 10 минуттан кейін қайталаңыз.' });
        const body = await readJson(req);
        if (!auth.checkPassword(body.password)) {
          auth.registerFailure(ip);
          await new Promise((r) => setTimeout(r, 400));
          return send(res, 401, { error: 'Құпиясөз қате' });
        }
        auth.clearFailures(ip);
        return send(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(req) });
      }
      return send(res, 405, { error: 'Рұқсат етілмейді' });
    }

    if (clean === 'results') {
      if (!auth.isTeacher(req)) return send(res, 401, { error: 'Кіру керек' });
      if (m === 'GET') {
        const { items, failed, firstError } = await store.listResults();
        items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const warnings = failed ? [`${failed} файлды оқу мүмкін болмады${firstError ? ': ' + firstError : ''}`] : [];
        return send(res, 200, { items, storage: store.mode(), now: Date.now(), warnings });
      }
      if (m === 'DELETE') {
        if (url.searchParams.get('all') === '1') await store.deleteAll();
        else if (store.idOk(url.searchParams.get('id'))) await store.deleteResult(url.searchParams.get('id'));
        else return send(res, 400, { error: 'id керек' });
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: 'Рұқсат етілмейді' });
    }

    if (clean === 'diagnose') {
      if (!auth.isTeacher(req)) return send(res, 401, { error: 'Кіру керек' });
      return send(res, 200, await store.diagnose());
    }

    return send(res, 404, { error: 'Табылмады' });
  } catch (e) {
    if (e instanceof validate.ValidationError) return send(res, 400, { error: e.message });
    if (e instanceof store.StorageError) return send(res, 503, { error: e.message });
    if (e && e.status) return send(res, e.status, { error: e.message });
    console.error('API қатесі:', e);
    return send(res, 500, { error: 'Сервер қатесі' });
  }
}

module.exports = { handle };

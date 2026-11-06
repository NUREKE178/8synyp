'use strict';
/**
 * Мұғалім кіруі. Құпиясөз — TEACHER_PASSWORD ортасы айнымалысы (кемінде 6 таңба); жоқ болса панель өшірулі.
 * Сессия — HMAC-қолтаңбалы HttpOnly cookie, серверде ештеңе сақталмайды.
 */
const crypto = require('node:crypto');

const COOKIE = 'fq_teacher';
const SESSION_MS = 8 * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const enabled = () => Boolean(process.env.TEACHER_PASSWORD && process.env.TEACHER_PASSWORD.length >= 6);
const secret = () => process.env.SESSION_SECRET || sha256('fq-session:' + process.env.TEACHER_PASSWORD);

function checkPassword(candidate) {
  if (!enabled() || typeof candidate !== 'string') return false;
  return crypto.timingSafeEqual(sha256(candidate), sha256(process.env.TEACHER_PASSWORD));
}

function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(crypto.createHmac('sha256', secret()).update(body).digest())}`;
}

function verify(token) {
  if (!enabled() || typeof token !== 'string') return false;
  const [body, mac] = token.split('.');
  if (!body || !mac) return false;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest();
  let given; try { given = Buffer.from(mac, 'base64url'); } catch { return false; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const isTeacher = (req) => verify(parseCookies(req.headers.cookie)[COOKIE]);

function sessionCookie(req) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') || req.socket?.encrypted ? '; Secure' : '';
  return `${COOKIE}=${sign({ exp: Date.now() + SESSION_MS })}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`;
}
const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

// Қате құпиясөзді қайта-қайта сынауға шек (бір экземпляр шегінде)
const attempts = new Map();
const MAX_ATTEMPTS = 8, WINDOW_MS = 10 * 60 * 1000;
function tooManyAttempts(ip) { const r = attempts.get(ip); return !!r && r.reset > Date.now() && r.count >= MAX_ATTEMPTS; }
function registerFailure(ip) {
  const now = Date.now(), r = attempts.get(ip);
  if (!r || r.reset < now) attempts.set(ip, { count: 1, reset: now + WINDOW_MS }); else r.count += 1;
  if (attempts.size > 5000) attempts.clear();
}
const clearFailures = (ip) => attempts.delete(ip);

module.exports = { enabled, checkPassword, isTeacher, sessionCookie, clearCookie, tooManyAttempts, registerFailure, clearFailures };

// Мұғалім сессиясы: құпиясөзді сервер тексереді, сессия — HttpOnly cookie. Түймесі беттерде көрінбейді.
let info = { enabled: false, teacher: false, storage: null, reachable: false };

async function call(method, path, body) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    let data = null; try { data = await res.json(); } catch { /* HTML/бос жауап */ }
    return { ok: res.ok, status: res.status, data };
  } catch { return { ok: false, status: 0, data: null }; } finally { clearTimeout(t); }
}

export const isTeacher = () => info.teacher;
export const teacherInfo = () => info;

/** Бет ашылғанда: сессия бар ма? (API жоқ статикалық хостингте үнсіз өтеді) */
export async function checkSession() {
  const r = await call('GET', '/api/teacher');
  info = r.ok && r.data && typeof r.data.enabled === 'boolean' ? { ...r.data, reachable: true } : { enabled: false, teacher: false, storage: null, reachable: false };
  return info;
}

export async function login(password) {
  const r = await call('POST', '/api/teacher', { password });
  if (r.ok) { info.teacher = true; return { ok: true }; }
  return { ok: false, error: (r.data && r.data.error) || (r.status === 0 ? 'Серверге қосылу мүмкін емес' : 'Қате') };
}

export async function logout() { await call('DELETE', '/api/teacher'); info.teacher = false; }

export async function fetchResults() {
  const r = await call('GET', '/api/results');
  if (r.status === 401) info.teacher = false;
  return r;
}
export const diagnose = () => call('GET', '/api/diagnose');
export const deleteResult = (uid) => call('DELETE', `/api/results?id=${encodeURIComponent(uid)}`);
export const deleteAllResults = () => call('DELETE', '/api/results?all=1');

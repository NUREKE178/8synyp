// Жасырын мұғалім панелі (#/teacher): сынып нәтижелері, 6–10 балл, CSV. Сілтеме беттерде жоқ, кіру — құпиясөзбен.
import { LEVELS } from './levels.js';
import { MAX_XP, gradeFor, loadRules, saveRules, DEFAULT_RULES } from './grade.js';
import { teacherInfo, checkSession, login, logout, fetchResults, deleteResult, deleteAllResults } from './teacher.js';
import { escapeHtml as esc } from '../ui/colors.js';

const ids = [...LEVELS.map((l) => l.id), 'boss'];
const TITLES = Object.fromEntries([...LEVELS.map((l) => [l.id, `${l.num}. ${l.title}`]), ['boss', 'Финал']]);

function ago(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'қазір';
  if (s < 3600) return `${Math.round(s / 60)} мин бұрын`;
  if (s < 86400) return `${Math.round(s / 3600)} сағ бұрын`;
  return `${Math.round(s / 86400)} күн бұрын`;
}

function csvCell(v) { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

/**
 * @param {HTMLElement} app
 * @param {{go:(h:string)=>void, toast:(m:string,k?:string)=>void, onAuthChange:()=>void, openPlan:()=>void}} io
 * @returns {() => void} destroy
 */
export function mountTeacherPanel(app, io) {
  let alive = true, timer = null, items = [], now = Date.now(), filterCls = 'all', query = '', sort = { key: 'name', dir: 1 }, auto = true, expanded = new Set(), rules = loadRules();

  const destroy = () => { alive = false; clearInterval(timer); };

  // ---------- кіру экраны ----------
  function renderGate(msg = '') {
    const info = teacherInfo();
    app.innerHTML = `<section class="tp-gate"><div class="tp-gate-card">
      <div class="tp-lock" aria-hidden="true">🔒</div><h2>Мұғалім кіруі</h2>
      ${!info.reachable ? `<p class="fb bad">Сервер жауап бермейді. Нәтижелерді жинау үшін сайт Vercel-де (немесе <code>npm start</code> арқылы) жұмыс істеуі керек.</p>`
        : !info.enabled ? `<p class="fb bad"><b>Панель өшірулі.</b> Vercel → Settings → Environment Variables ішінде <code>TEACHER_PASSWORD</code> (кемінде 6 таңба) қосып, Redeploy жасаңыз.</p>`
          : `<form id="tpForm"><label for="tpPass">Құпиясөз</label><div class="row"><input id="tpPass" type="password" autocomplete="current-password" required autofocus /><button class="btn primary" type="submit">Кіру</button></div><p class="tp-err" role="alert">${esc(msg)}</p></form>`}
      <a class="btn ghost small" href="#/">← Басты бет</a></div></section>`;
    const form = app.querySelector('#tpForm');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button'); btn.disabled = true;
      const r = await login(form.querySelector('#tpPass').value);
      btn.disabled = false;
      if (!alive) return;
      if (r.ok) { io.onAuthChange(); start(); } else renderGate(r.error);
    });
  }

  // ---------- есептеулер ----------
  const view = (r) => {
    const done = LEVELS.filter((l) => r.levels && r.levels[l.id]).length;
    const hints = Object.values(r.levels || {}).reduce((s, l) => s + (l.hints || 0), 0);
    const pct = Math.round(((r.xp || 0) / (r.max || MAX_XP)) * 100);
    return { ...r, done, boss: !!(r.levels && r.levels.boss), bossWin: !!(r.levels && r.levels.boss && r.levels.boss.win), hints, pct, grade: gradeFor(r.xp, r.max || MAX_XP, rules) };
  };

  function rows() {
    let list = items.map(view);
    if (filterCls !== 'all') list = list.filter((r) => (r.cls || '—') === filterCls);
    if (query) list = list.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
    const k = sort.key;
    list.sort((a, b) => {
      const av = k === 'name' ? a.name.toLowerCase() : k === 'cls' ? a.cls : k === 'updatedAt' ? a.updatedAt : k === 'grade' ? (a.grade || 0) : a[k] ?? 0;
      const bv = k === 'name' ? b.name.toLowerCase() : k === 'cls' ? b.cls : k === 'updatedAt' ? b.updatedAt : k === 'grade' ? (b.grade || 0) : b[k] ?? 0;
      return (av < bv ? -1 : av > bv ? 1 : a.name.localeCompare(b.name, 'kk')) * sort.dir;
    });
    return list;
  }

  // ---------- панель ----------
  function render() {
    if (!alive) return;
    const list = rows();
    const all = items.map(view);
    const graded = all.filter((r) => r.grade);
    const avg = graded.length ? (graded.reduce((s, r) => s + r.grade, 0) / graded.length).toFixed(1).replace('.', ',') : '—';
    const dist = [10, 9, 8, 7, 6].map((g) => ({ g, n: graded.filter((r) => r.grade === g).length }));
    const maxN = Math.max(1, ...dist.map((d) => d.n));
    const classes = [...new Set(items.map((r) => r.cls || '—'))].sort((a, b) => a.localeCompare(b, 'kk'));
    const active = all.filter((r) => now - r.updatedAt < 5 * 60 * 1000).length;
    const th = (key, label) => `<th scope="col"><button type="button" class="tp-sort ${sort.key === key ? 'on' : ''}" data-sort="${key}" aria-label="${label} бойынша сұрыптау">${label}${sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
    const scrollY = window.scrollY;

    app.innerHTML = `<section class="tp">
      <div class="tp-head">
        <div><p class="eyebrow">Мұғалім панелі · жасырын</p><h2>Сынып нәтижелері</h2><p class="muted">Балл — 6–10 шкаласымен, жиналған XP үлесі бойынша. Оқушылар бұл бетті көрмейді.</p></div>
        <div class="tp-actions">
          <button class="btn small" id="tpRefresh" type="button">↻ Жаңарту</button>
          <label class="tp-auto"><input type="checkbox" id="tpAuto" ${auto ? 'checked' : ''}/> авто (15 с)</label>
          <button class="btn small" id="tpCsv" type="button" ${items.length ? '' : 'disabled'}>⬇ CSV</button>
          <button class="btn small" id="tpPrint" type="button">🖨</button>
          <button class="btn small" id="tpPlan" type="button">📋 Жоспар</button>
          <button class="btn small danger" id="tpOut" type="button">Шығу</button>
        </div>
      </div>

      <div class="tp-stats">
        <div class="tp-stat"><b>${items.length}</b><span>оқушы</span></div>
        <div class="tp-stat"><b>${avg}</b><span>орташа балл</span></div>
        <div class="tp-stat"><b>${all.filter((r) => r.bossWin).length}</b><span>финалды жеңген</span></div>
        <div class="tp-stat"><b>${active}</b><span>қазір белсенді</span></div>
      </div>

      <div class="tp-dist" aria-label="Баллдар таралуы">${dist.map((d) => `<div class="tp-bar g${d.g}"><span class="n">${d.n}</span><div class="bar" style="height:${Math.max(4, (d.n / maxN) * 100)}%"></div><span class="g">${d.g}</span></div>`).join('')}</div>

      <div class="tp-filters">
        <div class="tp-chips" role="group" aria-label="Сынып сүзгісі"><button type="button" class="${filterCls === 'all' ? 'on' : ''}" data-cls="all">Барлығы</button>${classes.map((c) => `<button type="button" class="${filterCls === c ? 'on' : ''}" data-cls="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <input id="tpSearch" type="search" placeholder="Аты бойынша іздеу" value="${esc(query)}" aria-label="Іздеу" />
      </div>

      ${list.length ? `<div class="tp-table-wrap"><table class="tp-table">
        <thead><tr><th scope="col">№</th>${th('name', 'Аты-жөні')}${th('cls', 'Сынып')}${th('done', 'Деңгей')}${th('xp', 'XP')}${th('pct', '%')}${th('grade', 'Балл')}${th('hints', 'Көмек')}${th('updatedAt', 'Белсенділік')}<th></th></tr></thead>
        <tbody>${list.map((r, i) => {
          const open = expanded.has(r.uid);
          return `<tr class="${open ? 'open' : ''}" data-uid="${r.uid}">
            <td>${i + 1}</td>
            <td><button type="button" class="tp-name" data-toggle="${r.uid}" aria-expanded="${open}">${esc(r.name)}</button></td>
            <td>${esc(r.cls || '—')}</td>
            <td><span class="tp-dots" title="${r.done}/6 деңгей${r.boss ? (r.bossWin ? ', финал жеңілді' : ', финалға қатысты') : ''}">${LEVELS.map((l) => `<i class="${r.levels && r.levels[l.id] ? 'on' : ''}"></i>`).join('')}<i class="boss ${r.bossWin ? 'on' : r.boss ? 'half' : ''}"></i></span></td>
            <td class="num">${r.xp}</td><td class="num">${r.pct}%</td>
            <td><span class="grade g${r.grade || 0}">${r.grade || '—'}</span></td>
            <td class="num">${r.hints}</td><td class="muted">${ago(r.updatedAt, now)}</td>
            <td><button type="button" class="tp-del" data-del="${r.uid}" aria-label="${esc(r.name)} нәтижесін өшіру" title="Өшіру">✕</button></td></tr>
            ${open ? `<tr class="tp-detail"><td></td><td colspan="9"><div class="tp-levels">${ids.map((id) => { const l = r.levels && r.levels[id]; return `<span class="tp-lv ${l ? 'on' : ''}"><b>${esc(TITLES[id])}</b>${l ? `${l.xp} XP · ${'★'.repeat(l.stars)}${'☆'.repeat(3 - l.stars)}${l.hints ? ` · 💡${l.hints}` : ''}${id === 'boss' ? ` · ❤${l.hearts} · ${l.correct}/8` : ''}` : 'өтпеді'}</span>`; }).join('')}</div></td></tr>` : ''}`;
        }).join('')}</tbody></table></div>` : `<p class="tp-empty">${items.length ? 'Сүзгіге сәйкес оқушы жоқ.' : 'Әзірше ешкім ойын бастаған жоқ. Оқушылар сайтқа кіріп, аты-жөнін жазғаннан кейін осында пайда болады.'}</p>`}

      <details class="tp-rules"><summary>⚙ Бағалау шкаласы</summary>
        <p class="muted">Баллды жиналған XP үлесі анықтайды (максимум ${MAX_XP} XP, қосымша тапсырмаларымен). Шектер осы браузерде сақталады.</p>
        <div class="tp-rule-grid">${rules.map((r, i) => `<label>${r.grade} балл: ≥ <input type="number" min="1" max="100" step="1" data-rule="${i}" value="${Math.round(r.min * 100)}" aria-label="${r.grade} баллға минималды пайыз" /> %</label>`).join('')}<label>6 балл: одан төмен (XP &gt; 0)</label></div>
        <button class="btn small" id="tpRulesReset" type="button">Әдепкіге қайтару</button>
      </details>
      <details class="tp-danger"><summary>Қауіпті аймақ</summary><p class="muted">Барлық оқушылардың нәтижелерін серверден өшіреді. Қайтару мүмкін емес.</p><button class="btn small danger" id="tpClear" type="button" ${items.length ? '' : 'disabled'}>Барлығын өшіру</button></details>
      <p class="tp-foot muted">Жаңартылды: ${new Date(now).toLocaleTimeString('ru-RU')} · қойма: ${esc(storage)}</p>
    </section>`;
    bind();
    window.scrollTo({ top: scrollY });
  }

  let storage = '—';

  function bind() {
    const $ = (s) => app.querySelector(s);
    $('#tpRefresh').addEventListener('click', load);
    $('#tpAuto').addEventListener('change', (e) => { auto = e.target.checked; schedule(); });
    $('#tpPrint').addEventListener('click', () => window.print());
    $('#tpPlan').addEventListener('click', io.openPlan);
    $('#tpOut').addEventListener('click', async () => { await logout(); io.onAuthChange(); destroy(); io.go('#/'); });
    $('#tpCsv').addEventListener('click', exportCsv);
    $('#tpSearch').addEventListener('input', (e) => { query = e.target.value; const pos = e.target.selectionStart; render(); const s = app.querySelector('#tpSearch'); s.focus(); s.setSelectionRange(pos, pos); });
    app.querySelectorAll('[data-cls]').forEach((b) => b.addEventListener('click', () => { filterCls = b.dataset.cls; render(); }));
    app.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.sort; sort = { key: k, dir: sort.key === k ? -sort.dir : (k === 'name' || k === 'cls' ? 1 : -1) }; render(); }));
    app.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => { const u = b.dataset.toggle; expanded.has(u) ? expanded.delete(u) : expanded.add(u); render(); }));
    app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const r = items.find((x) => x.uid === b.dataset.del); if (!r || !confirm(`«${r.name}» нәтижесін өшіру керек пе?`)) return;
      const res = await deleteResult(r.uid); if (res.ok) { items = items.filter((x) => x.uid !== r.uid); render(); } else io.toast('Өшіру мүмкін болмады', 'warn');
    }));
    app.querySelectorAll('[data-rule]').forEach((inp) => inp.addEventListener('change', () => {
      const next = rules.map((r) => ({ ...r }));
      next[Number(inp.dataset.rule)].min = Math.max(0.01, Math.min(1, Number(inp.value) / 100 || 0.5));
      // шектер кему ретімен болуы керек
      for (let i = 1; i < next.length; i++) if (next[i].min > next[i - 1].min) next[i].min = next[i - 1].min;
      rules = next; saveRules(rules); render();
    }));
    $('#tpRulesReset').addEventListener('click', () => { rules = DEFAULT_RULES.map((r) => ({ ...r })); saveRules(rules); render(); });
    $('#tpClear').addEventListener('click', async () => {
      if (!confirm('БАРЛЫҚ оқушылардың нәтижесі өшіріледі. Жалғастыру керек пе?')) return;
      const res = await deleteAllResults(); if (res.ok) { items = []; render(); io.toast('Барлық нәтиже өшірілді'); } else io.toast('Өшіру мүмкін болмады', 'warn');
    });
  }

  function exportCsv() {
    const head = ['Аты-жөні', 'Сынып', 'Өткен деңгей', 'Финал', 'XP', 'Пайыз', 'Балл', 'Көмек'];
    const lines = rows().map((r) => [r.name, r.cls || '', `${r.done}/6`, r.bossWin ? 'жеңді' : r.boss ? 'қатысты' : '', r.xp, r.pct + '%', r.grade || '', r.hints].map(csvCell).join(';'));
    const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `formula-quest-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function load() {
    const r = await fetchResults();
    if (!alive) return;
    if (r.status === 401) { io.onAuthChange(); renderGate('Сессия аяқталды, қайта кіріңіз'); clearInterval(timer); return; }
    if (!r.ok || !r.data) { io.toast((r.data && r.data.error) || 'Нәтижелерді жүктеу мүмкін болмады', 'warn'); if (!items.length) render(); return; }
    items = r.data.items || []; now = r.data.now || Date.now(); storage = r.data.storage === 'vercel-blob' ? 'Vercel Blob' : 'жергілікті файл';
    render();
  }

  function schedule() { clearInterval(timer); if (auto) timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000); }
  function start() { load(); schedule(); }

  (async () => {
    app.innerHTML = '<p class="muted" style="padding:24px">Жүктелуде…</p>';
    const info = await checkSession();
    if (!alive) return;
    if (info.teacher) start(); else renderGate();
  })();

  return destroy;
}

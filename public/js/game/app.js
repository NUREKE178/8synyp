// Ойын қабығы: бағыттау (hash), басты бет, карта, деңгей, босс, ойын алаңы, нәтиже. HUD мен диалогтар.

import { Workbook } from '../engine/workbook.js';
import { canonicalFormula } from '../engine/formula.js';
import { cellsIn, parseRect } from '../engine/refs.js';
import { ERROR_HELP, isErr } from '../engine/values.js';
import { Sheet } from '../ui/sheet.js';
import { XRay } from '../ui/xray.js';
import { Mascot } from '../ui/mascot.js';
import { sound, confetti, toast } from '../ui/fx.js';
import { LEVELS, XP } from './levels.js';
import { state, save, subscribe, markLevel, totalXp, rankFor, resetProgress, RANKS } from './state.js';
import { MAX_XP } from './grade.js';
import { isTeacher, checkSession } from './teacher.js';
import { startSync } from './sync.js';
import { mountTeacherPanel } from './teacher-panel.js';
import { DemoRunner } from './demo.js';
import { mountBoss } from './quiz.js';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const SLIDES = { addr: '5-слайд', stats: '3–4-слайд', relative: '6–8-слайд', absolute: '9–10-слайд', share: '11–12-слайд', mixed: '13-слайд' };
let current = null; // ағымдағы экранның destroy функциясы

const PRAISE = ['Керемет!', 'Жарайсың!', 'Дәл солай!', 'Мінсіз!', 'Супер, шебер!', 'Бәрекелде!'];
const pick = (a) => a[(Math.random() * a.length) | 0];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// ───────────────────────── HUD ─────────────────────────
function updateHud() {
  const xp = totalXp();
  const r = rankFor(xp, MAX_XP);
  $('#hudXp').textContent = xp;
  $('#hudRank').textContent = `${r.icon} ${r.name}`;
  const from = RANKS[r.idx].at * MAX_XP, to = r.next ? r.next.at * MAX_XP : MAX_XP;
  $('#hudBar').style.width = Math.min(100, ((xp - from) / Math.max(1, to - from)) * 100) + '%';
  $('#btnSound').setAttribute('aria-pressed', String(!state.mute));
  $('#btnSound').textContent = state.mute ? '🔇' : '🔊';
  $('#btnPlan').hidden = !isTeacher();
  $('#teacherBadge').hidden = !isTeacher();
  document.body.classList.toggle('teacher', isTeacher());
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme === 'auto' ? '' : state.theme;
  if (!state.theme || state.theme === 'auto') delete document.documentElement.dataset.theme;
}

function bindHud() {
  $('#btnSound').addEventListener('click', () => { sound.toggle(); updateHud(); });
  $('#btnTheme').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark']; state.theme = order[(order.indexOf(state.theme) + 1) % 3]; save(); applyTheme();
    toast({ auto: 'Тақырып: құрылғыға сай', light: 'Тақырып: жарық', dark: 'Тақырып: қараңғы' }[state.theme]);
  });
  // Жасырын кіру: логотипті 3 рет жылдам бассаң — мұғалім кіруі ашылады (түйме жоқ)
  let taps = 0, tapTimer = null;
  $('.logo').addEventListener('click', (e) => {
    taps += 1; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 700);
    if (taps >= 3) { e.preventDefault(); taps = 0; location.hash = '#/teacher'; }
  });
  $('#btnCheat').addEventListener('click', openCheat);
  $('#btnPlan').addEventListener('click', openPlan);
  subscribe(updateHud);
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-close]'); if (b) b.closest('dialog').close(); });
}

function openCheat() {
  const d = $('#dlgCheat');
  d.querySelector('.dlg-body').innerHTML = `
    <h3>Функциялар</h3>
    <table class="fn-table"><tr><th>Функция</th><th>EN</th><th>Не істейді</th><th>Мысал</th></tr>
      <tr><td><code>СУММ</code></td><td>SUM</td><td>қосындысын табады</td><td><code>=СУММ(B2:B6)</code></td></tr>
      <tr><td><code>СРЗНАЧ</code></td><td>AVERAGE</td><td>орташа мәнін табады</td><td><code>=СРЗНАЧ(B2:B6)</code></td></tr>
      <tr><td><code>МАКС</code></td><td>MAX</td><td>ең үлкен мәнді табады</td><td><code>=МАКС(B2:B6)</code></td></tr>
      <tr><td><code>МИН</code></td><td>MIN</td><td>ең кіші мәнді табады</td><td><code>=МИН(B2:B6)</code></td></tr>
      <tr><td><code>СЧЁТ</code></td><td>COUNT</td><td>сандық ұяшықтарды санайды</td><td><code>=СЧЁТ(B2:B6)</code></td></tr></table>
    <p class="muted"><code>B2:B6</code> — ұяшықтар диапазоны (B2-ден B6-ға дейін). Аргументтерді «;» белгісімен бөлеміз.</p>
    <h3>Сілтеме түрлері</h3>
    <div class="ref-cards">
      <div class="rc"><code>A1</code><b>Салыстырмалы</b><span>көшіргенде адрес ауысады</span><em>әдепкі түрі</em></div>
      <div class="rc"><code>$A$1</code><b>Абсолютті</b><span>көшіргенде өзгермейді</span><em>баған да, жол да бекітілген</em></div>
      <div class="rc"><code>$A1</code> · <code>A$1</code><b>Аралас</b><span>$A1 – баған бекітілген<br>A$1 – жол бекітілген</span><em>F4 түрін ауыстырады</em></div></div>
    <h3>Пернелер</h3>
    <ul class="keys"><li><kbd>F4</kbd> сілтеме түрін ауыстырады</li><li><kbd>Ctrl</kbd>+<kbd>D</kbd> төмен толтыру · <kbd>Ctrl</kbd>+<kbd>R</kbd> оңға толтыру</li><li><kbd>Ctrl</kbd>+<kbd>Z</kbd> болдырмау · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> көшіру/қою</li><li><kbd>F2</kbd> немесе екі рет шерту — ұяшықты өңдеу</li><li>Формула жазып жатқанда ұяшықты бассаң — оның адресі енгізіледі</li></ul>`;
  d.showModal();
}

function openPlan() {
  const d = $('#dlgPlan');
  let t = 3;
  const rows = [`<li><span class="t">0–3 мин</span><div><b>Қызығушылықты ояту</b><p>Басты беттегі демо: бір формула — көп есептеу. «Бүгін үйренеміз» (2-слайд).</p></div></li>`];
  LEVELS.forEach((l) => {
    rows.push(`<li><span class="t">${t}–${t + l.minutes} мин</span><div><b>${l.num}. ${esc(l.title)}</b> <small>· ${esc(l.topic)} · ${SLIDES[l.id]}</small><p>💬 ${l.teacher.discuss.map(esc).join(' &nbsp;·&nbsp; ')}</p><p class="tip">💡 ${esc(l.teacher.tip)}</p></div></li>`);
    t += l.minutes;
  });
  rows.push(`<li><span class="t">${t}–${t + 5} мин</span><div><b>Финал: Қателер королі</b> <small>· 14–15-слайд</small><p>💬 Қорытынды сұрақтар. Қай жауапта қателестіңдер және неге?</p></div></li>`);
  t += 5;
  rows.push(`<li><span class="t">${t}–${t + 2} мин</span><div><b>Қорытынды</b><p>Салыстырмалы сілтеме көшіргенде ауысады, абсолютті ($A$1) өзгермейді, аралас — тек баған немесе жол бекітіледі.</p></div></li>`);
  d.querySelector('.dlg-body').innerHTML = `<h3>Сабақ жоспары · 45 минут</h3><ol class="plan">${rows.join('')}</ol>
    <p class="muted">Кеңес: ойынды проекторға шығарыңыз, оқушылар өз құрылғысынан <b>${location.origin}${location.pathname}</b> сілтемесімен кіреді. Әр деңгейде «▶ Демо» батырмасы формулаларды өздігінен жазып көрсетеді.</p>
    <button class="btn danger small" id="resetAll" type="button">Барлық прогрессті тазалау</button>`;
  d.querySelector('#resetAll').addEventListener('click', () => { if (confirm('Прогресс өшіріледі. Жалғастыру керек пе?')) { resetProgress(); d.close(); location.hash = '#/'; render(); } });
  d.showModal();
}

// ───────────────────────── бағыттау ─────────────────────────
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  return { name: h[0] || 'home', id: h[1] };
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

function render() {
  if (current) { current(); current = null; }
  const { name, id } = parseHash();
  window.scrollTo({ top: 0 });
  document.body.dataset.screen = name;
  let title = 'Формула Квест';
  if (name === 'map') current = screenMap();
  else if (name === 'level') {
    const L = LEVELS.find((l) => l.id === id);
    if (!L) { go('#/map'); return; }
    if (!isUnlocked(L)) { toast('Алдымен алдыңғы деңгейді өт 🔒'); go('#/map'); return; }
    title = `${L.title} · Формула Квест`;
    current = screenLevel(L);
  } else if (name === 'boss') {
    if (!bossUnlocked()) { toast('Финал алты деңгейді өткен соң ашылады 🔒'); go('#/map'); return; }
    current = screenBoss();
  } else if (name === 'teacher') current = mountTeacherPanel(app, { go, toast, onAuthChange: updateHud, openPlan });
  else if (name === 'sandbox') current = screenSandbox();
  else if (name === 'end') current = screenEnd();
  else current = screenHome();
  document.title = title;
  updateHud();
  const h = app.querySelector('h1, h2'); if (h) { h.setAttribute('tabindex', '-1'); }
}

const isDone = (id) => !!state.done[id];
function isUnlocked(L) { if (isTeacher()) return true; const i = LEVELS.indexOf(L); return i === 0 || isDone(LEVELS[i - 1].id); }
const bossUnlocked = () => isTeacher() || LEVELS.every((l) => isDone(l.id));

// ───────────────────────── басты бет ─────────────────────────
function screenHome() {
  app.innerHTML = `
  <section class="home">
    <div class="hero">
      <div class="hero-copy">
        <p class="eyebrow">8-сынып · Информатика</p>
        <h1>Формула <span class="grad">Квест</span></h1>
        <p class="lead">Статистикалық мәліметтер. Абсолютті және салыстырмалы сілтемелер. Шын кестемен жұмыс істе, баг аула, қазына тап және финалда <b>Қателер королімен</b> шайқас!</p>
        <form class="start-form" id="startForm">
          <label for="pname">Аты-жөніңді жаз</label>
          <div class="row"><input id="pname" name="name" maxlength="40" required placeholder="Аты-жөні (мысалы, Айдана С.)" autocomplete="name" value="${esc(state.name)}"/>
            <input id="pcls" name="cls" list="clsList" maxlength="8" class="cls" placeholder="Сынып" aria-label="Сынып" value="${esc(state.cls || '')}"/><datalist id="clsList"><option value="8А"><option value="8Ә"><option value="8Б"></datalist></div>
          <div class="row"><button class="btn primary big" type="submit">${Object.keys(state.done).length ? 'Жалғастыру' : 'Ойынды бастау'} ▶</button></div>
        </form>
        <ul class="chips"><li>6 деңгей</li><li>1 финалдық босс</li><li>≈ 45 минут</li><li>Нағыз Excel сияқты кесте</li></ul>
      </div>
      <div class="hero-demo" aria-label="Автоматты демо: формуланы төмен сүйреу">
        <div id="heroMascot"></div>
        <div id="heroSheet" class="hero-sheet"></div>
      </div>
    </div>
    <section class="goals" aria-labelledby="goalsH">
      <h2 id="goalsH">Бүгін үйренеміз</h2>
      <ol class="goal-list">
        <li><span class="n">1</span><p>Статистикалық функциялармен (СУММ, СРЗНАЧ, МАКС, МИН) мәліметтерді өңдеу</p></li>
        <li><span class="n">2</span><p>Салыстырмалы, абсолютті және аралас сілтемені ажырату</p></li>
        <li><span class="n">3</span><p>Сілтемелерді практикалық есепте дұрыс қолдану</p></li>
      </ol>
    </section>
    <section class="how" aria-labelledby="howH">
      <h2 id="howH">Қалай ойнаймыз?</h2>
      <ul class="how-list">
        <li><b>📖 Түсін</b><span>Қысқа теория картасы</span></li>
        <li><b>🔮 Болжа</b><span>Алдымен ойла, сосын тексер</span></li>
        <li><b>🧪 Орында</b><span>Кестеде формула жаз, маркерді сүйре, F4 бас</span></li>
        <li><b>🏆 Жең</b><span>XP жина, ранг өсір, босстан өт</span></li>
      </ul>
    </section>
  </section>`;
  const mascot = new Mascot($('#heroMascot'));
  const wb = new Workbook({ cols: 4, rows: 5 });
  const base = { A1: 'Тауар', B1: 'Саны', C1: 'Баға', D1: 'Сома', A2: 'Скин', B2: '2', C2: '1500', A3: 'Қылыш', B3: '1', C3: '3000', A4: 'Қалқан', B4: '3', C4: '800', A5: 'Алмаз', B5: '10', C5: '250' };
  wb.load(base);
  const sheet = new Sheet($('#heroSheet'), { workbook: wb, colWidths: [96, 64, 80, 88], toolbar: false, rowHeight: 32, readOnly: true, canEdit: () => false, label: 'Демо кесте' });
  const demo = new DemoRunner(sheet, { say: (t) => mascot.say(t, 'think') });
  let alive = true;
  (async () => {
    mascot.say('Сәлем! Мен — Формик. Қараңдар: бір формула жазамын…', 'happy');
    await new Promise((r) => setTimeout(r, 1500));
    while (alive) {
      const ok = await demo.run([
        { type: ['D2', '=B2*C2'] }, { say: 'Енді жасыл шаршыны төмен сүйреймін!' }, { drag: ['D2', 'D2:D5'] },
        { say: 'Әр жолда формула өз жолына қарай өзгерді — бұл «салыстырмалы сілтеме»!' }, { wait: 3600 },
      ]);
      if (!ok || !alive) break;
      for (const a of ['D2', 'D3', 'D4', 'D5']) wb.clear(a, { silent: true });
      wb._emit({ type: 'reset' }); sheet.select('A1', { silent: true });
      await new Promise((r) => setTimeout(r, 900));
    }
  })();
  $('#startForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.name = ($('#pname').value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!state.name) { $('#pname').focus(); return; }
    state.cls = ($('#pcls').value || '').trim().slice(0, 8); save();
    sound.play('click');
    go('#/map');
  });
  return () => { alive = false; demo.stop(); sheet.destroy(); };
}

// ───────────────────────── карта ─────────────────────────
function screenMap() {
  const xp = totalXp(); const r = rankFor(xp, MAX_XP);
  const doneCount = LEVELS.filter((l) => isDone(l.id)).length;
  const cards = LEVELS.map((l) => {
    const open = isUnlocked(l); const d = state.done[l.id];
    return `<li><${open ? 'a' : 'div'} class="lv-card ${d ? 'done' : open ? 'open' : 'locked'}" ${open ? `href="#/level/${l.id}"` : 'aria-disabled="true"'} style="--lv:${l.color}">
      <span class="lv-badge">${l.num}</span><span class="lv-ic" aria-hidden="true">${open ? l.icon : '🔒'}</span>
      <span class="lv-title">${esc(l.title)}</span><span class="lv-topic">${esc(l.topic)}</span>
      <span class="lv-foot"><span>⏱ ${l.minutes} мин</span><span class="stars" aria-label="${d ? d.stars : 0} жұлдыз">${stars(d ? d.stars : 0)}</span></span></${open ? 'a' : 'div'}></li>`;
  }).join('');
  const bd = state.done.boss; const bo = bossUnlocked();
  app.innerHTML = `
  <section class="map">
    <div class="map-head">
      <div><p class="eyebrow">Сәлем, ${esc(state.name || 'ойыншы')}!</p><h2>Квест картасы</h2><p class="muted">Деңгейлерді ретімен өт. Әрқайсысында: түсін → болжа → орында.</p></div>
      <div class="rank-card"><div class="rank-ic">${r.icon}</div><div><b>${r.name}</b><div class="rank-xp">${xp} XP${r.next ? ` · келесі рангқа ${r.toNext} XP` : ' · ең жоғары ранг!'}</div></div></div>
    </div>
    <ol class="levels">${cards}
      <li><${bo ? 'a' : 'div'} class="lv-card boss ${bd ? 'done' : bo ? 'open' : 'locked'}" ${bo ? 'href="#/boss"' : 'aria-disabled="true"'} style="--lv:#8a3ffc">
        <span class="lv-badge">★</span><span class="lv-ic" aria-hidden="true">${bo ? '👾' : '🔒'}</span><span class="lv-title">Қателер королі</span><span class="lv-topic">Финалдық босс · викторина</span>
        <span class="lv-foot"><span>⏱ 5 мин</span><span class="stars">${stars(bd ? bd.stars : 0)}</span></span></${bo ? 'a' : 'div'}></li>
    </ol>
    <div class="map-extra">
      <a class="lv-card wide" href="#/sandbox"><span class="lv-ic" aria-hidden="true">🧰</span><span><b>Ойын алаңы</b><br><small>Еркін кесте + 14-слайдтағы 4 тапсырма</small></span></a>
      ${doneCount === LEVELS.length && bd ? '<a class="btn primary big" href="#/end">🎓 Нәтижем мен сертификат</a>' : `<p class="muted">Өтілген деңгей: <b>${doneCount} / ${LEVELS.length}</b>${doneCount === LEVELS.length ? ' — финал ашық!' : ''}</p>`}
    </div>
  </section>`;
  return () => {};
}

// ───────────────────────── деңгей ─────────────────────────
function heatStyle(L) {
  return (a, v) => {
    const m = /^([A-Z]+)(\d+)$/.exec(a); const col = m[1], row = Number(m[2]);
    if (L.sheet.heat && col !== 'A' && row > 1 && typeof v === 'number') {
      const t = Math.max(0, Math.min(1, (v - 1) / 80));
      return { background: `hsl(${185 + t * 150} 85% ${90 - t * 32}%)`, color: '#14122b', weight: 600 };
    }
    if (row === 1 && typeof v === 'string' && v !== '') return { background: 'var(--hdr-cell)', weight: 700 };
    if (L.sheet.heat && col === 'A' && row > 1) return { background: 'var(--hdr-cell)', weight: 700 };
    return null;
  };
}

function screenLevel(L) {
  const first = !isDone(L.id);
  app.innerHTML = `
  <section class="level" style="--lv:${L.color}">
    <div class="lv-left">
      <div class="lv-head"><span class="lv-num">${L.num}</span><div><h2>${esc(L.title)}</h2><p class="topic">${esc(L.topic)}</p></div>
        <button class="btn ghost small" id="btnReset" type="button" title="Деңгейді қайта бастау">↺</button></div>
      <div id="mascotSlot"></div>
      <div class="tabs" role="tablist" aria-label="Бөлімдер">
        <button role="tab" id="tabTheory" aria-controls="panTheory" aria-selected="${first}" data-tab="theory">📖 Теория</button>
        <button role="tab" id="tabTasks" aria-controls="panTasks" aria-selected="${!first}" data-tab="tasks">🎯 Тапсырмалар <span class="count" id="qCount">0/${L.quests.filter((q) => !q.bonus).length}</span></button>
      </div>
      <div class="panel" id="panTheory" role="tabpanel" aria-labelledby="tabTheory" ${first ? '' : 'hidden'}>
        <p class="story">${L.story}</p>
        <div class="cards">${L.theory.map((c, i) => `<article class="card"><h3><span>${i + 1}</span>${c.title}</h3>${c.html}</article>`).join('')}</div>
        <button class="btn primary big" id="toTasks" type="button">Тапсырмаға көш →</button>
      </div>
      <div class="panel" id="panTasks" role="tabpanel" aria-labelledby="tabTasks" ${first ? 'hidden' : ''}>
        ${L.predict ? `<div class="predict" id="predict"><div class="ph">🔮 Болжа! <small>+${XP.predict} XP</small></div><p>${L.predict.q}</p>
          <div class="p-opts">${L.predict.options.map((o, i) => `<button type="button" class="p-opt" data-i="${i}">${/^=/.test(o) ? `<code>${esc(o)}</code>` : esc(o)}</button>`).join('')}</div><div class="p-fb" aria-live="polite"></div></div>` : ''}
        <ul class="quests" id="quests">${L.quests.map((q) => `<li class="quest ${q.bonus ? 'bonus' : ''}" data-id="${q.id}"><span class="chk" aria-hidden="true"></span><div class="qb"><div class="qt">${q.text}</div><div class="hint-box" hidden></div></div><div class="qr"><span class="xp">+${q.bonus ? XP.bonus : XP.quest}</span><button class="hint-btn" type="button" title="Көмек (−${XP.hintCost} XP)" aria-label="Көмек алу">💡</button></div></li>`).join('')}</ul>
        <div class="lvl-xp">Деңгей XP: <b id="lvXp">0</b></div>
      </div>
    </div>
    <div class="lv-right">
      <div class="teacher-bar" ${isTeacher() ? '' : 'hidden'}>
        <span class="tb-label">Мұғалім</span>
        <button class="btn small" id="btnDemo" type="button">▶ Демо</button>
        <button class="btn small" id="btnSolve" type="button">✔ Шешімді көрсету</button>
        <span class="tb-time">⏱ ${L.minutes} мин · ${SLIDES[L.id]}</span>
        <details class="tb-disc"><summary>💬 Талқылау</summary><ul>${L.teacher.discuss.map((d) => `<li>${esc(d)}</li>`).join('')}</ul><p>${esc(L.teacher.tip)}</p></details>
      </div>
      <div id="sheetRoot"></div>
      <div id="xrayRoot"></div>
      <p class="sheet-legend"><span class="sw edit"></span> жұмыс аймағы <span class="sw target"></span> осы жерге жаз <span class="sw lock"></span> дайын деректер · <kbd>Enter</kbd> бекіту · <kbd>F4</kbd> $ · <kbd>Esc</kbd> бас тарту</p>
    </div>
    <div class="overlay" id="overlay" hidden></div>
  </section>`;

  // ---- модель
  const S = L.sheet;
  const editable = new Set(); S.editable.forEach((r) => { for (const a of cellsIn(parseRect(r))) editable.add(a); });
  const data = { ...S.data }; if (L.treasures) Object.keys(L.treasures).forEach((a) => { data[a] = '❓'; });
  const wb = new Workbook({ cols: S.cols, rows: S.rows }); wb.load(data);
  const mascot = new Mascot($('#mascotSlot'));
  const sheet = new Sheet($('#sheetRoot'), { workbook: wb, colWidths: S.colWidths, rowHeight: S.rowHeight, rowHeaderWidth: S.rowHeaderWidth, canEdit: (a) => editable.has(a), targets: S.targets, cellStyle: heatStyle(L), label: L.title });
  const xray = new XRay($('#xrayRoot'), sheet);
  const flags = { visited: new Set(), edited: new Set(), filled: false, dragged: false, f4: false };
  sheet.select(S.select || 'A1', { silent: true }); flags.visited.clear();

  const done = new Map(); // quest.id → xp
  const hintsUsed = new Map();
  let predictXp = 0, predictAnswered = false, predictOk = true, completed = false, assisted = false, evalQueued = false;
  const totalHints = () => [...hintsUsed.values()].reduce((s, n) => s + n, 0);
  const questXp = () => [...done.values()].reduce((s, n) => s + n, 0);
  const levelXp = () => questXp() + predictXp + (completed ? XP.level + (totalHints() === 0 ? XP.noHints : 0) : 0);
  const ctx = { wb, flags, val: (a) => wb.value(a), raw: (a) => wb.getRaw(a), disp: (a) => wb.display(a), canon: (a) => wb.canonical(a), canonOf: canonicalFormula, isF: (a) => wb.isFormula(a), fns: (a) => wb.fnsUsed(a), fmt: (a) => wb.getFmt(a) };
  const demo = new DemoRunner(sheet, { say: (t) => mascot.say(t, 'think'), onState: (on) => { const b = $('#btnDemo'); if (b) b.textContent = on ? '⏹ Тоқтату' : '▶ Демо'; } });

  mascot.say(first ? `Сәлем! ${L.story}` : 'Қайта келдің! Бұл жолы мінсіз өтуге тырыс.', 'happy');

  // ---- UI көмекшілері
  const tab = (name) => {
    $('#panTheory').hidden = name !== 'theory'; $('#panTasks').hidden = name !== 'tasks';
    $('#tabTheory').setAttribute('aria-selected', String(name === 'theory')); $('#tabTasks').setAttribute('aria-selected', String(name === 'tasks'));
  };
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { sound.play('click'); tab(b.dataset.tab); }));
  $('#toTasks').addEventListener('click', () => { sound.play('click'); tab('tasks'); mascot.say(L.predict ? 'Алдымен болжап көр, сосын кестеге өт!' : 'Кестеде орында! Алға!', 'think'); });
  $('#btnReset').addEventListener('click', () => { if (!completed && done.size === 0 || confirm('Деңгей қайта басталады. Жалғастыру керек пе?')) render(); });

  const refreshUi = () => {
    L.quests.forEach((q) => {
      const li = app.querySelector(`.quest[data-id="${q.id}"]`); if (!li) return;
      li.classList.toggle('done', done.has(q.id));
      if (done.has(q.id)) li.querySelector('.xp').textContent = '+' + done.get(q.id);
    });
    $('#qCount').textContent = `${L.quests.filter((q) => !q.bonus && done.has(q.id)).length}/${L.quests.filter((q) => !q.bonus).length}`;
    $('#lvXp').textContent = levelXp();
  };

  // ---- болжау
  if (L.predict) {
    const box = $('#predict');
    box.querySelectorAll('.p-opt').forEach((b) => b.addEventListener('click', () => {
      if (predictAnswered) return; predictAnswered = true;
      const i = Number(b.dataset.i), ok = i === L.predict.answer;
      predictOk = ok; if (ok) predictXp = XP.predict;
      box.querySelectorAll('.p-opt').forEach((x, k) => { x.disabled = true; if (k === L.predict.answer) x.classList.add('right'); else if (k === i) x.classList.add('wrong'); });
      box.querySelector('.p-fb').innerHTML = `<div class="fb ${ok ? 'good' : 'bad'}"><b>${ok ? 'Дәл болжадың! +' + XP.predict + ' XP' : 'Дұрыс жауап белгіленді.'}</b> ${L.predict.explain}</div>`;
      sound.play(ok ? 'ok' : 'bad'); mascot.say(ok ? 'Ой-ой, бұл болжау — керемет!' : 'Ештеңе етпейді, қазір кестеде өзің көресің.', ok ? 'happy' : 'think');
      refreshUi();
    }));
  }

  // ---- көмек
  app.querySelectorAll('.quest').forEach((li) => {
    const q = L.quests.find((x) => x.id === li.dataset.id);
    li.querySelector('.hint-btn').addEventListener('click', () => {
      if (done.has(q.id)) return;
      const n = Math.min(q.hints.length, (hintsUsed.get(q.id) || 0) + 1);
      hintsUsed.set(q.id, n);
      const box = li.querySelector('.hint-box'); box.hidden = false;
      box.innerHTML = q.hints.slice(0, n).map((h, i) => `<div class="hint"><span>💡 ${i + 1}</span>${esc(h)}</div>`).join('');
      sound.play('click'); mascot.say(q.hints[n - 1], 'think');
    });
  });

  // ---- тапсырмаларды тексеру
  function evaluate() {
    evalQueued = false;
    for (const q of L.quests) {
      if (done.has(q.id)) continue;
      let ok = false; try { ok = !!q.check(ctx); } catch { ok = false; }
      if (ok) completeQuest(q);
    }
  }
  const queueEval = () => { if (!evalQueued) { evalQueued = true; requestAnimationFrame(evaluate); } };

  function completeQuest(q) {
    const hints = hintsUsed.get(q.id) || 0;
    const xp = q.bonus ? XP.bonus : Math.max(25, XP.quest - hints * XP.hintCost);
    done.set(q.id, xp);
    sound.play('ok');
    const li = app.querySelector(`.quest[data-id="${q.id}"]`);
    if (li) { li.classList.add('just'); const pop = document.createElement('span'); pop.className = 'xp-pop'; pop.textContent = `+${xp} XP`; li.append(pop); setTimeout(() => pop.remove(), 1400); li.querySelector('.hint-box').hidden = true; }
    mascot.say(`${pick(PRAISE)} ${q.bonus ? 'Бонус алынды!' : ''}`.trim(), 'happy');
    refreshUi();
    if (completed) persist();
    const required = L.quests.filter((x) => !x.bonus);
    if (!completed && required.every((x) => done.has(x.id))) setTimeout(completeLevel, 1100);
  }

  function persist() {
    if (assisted) return;
    const s = totalHints() === 0 && predictOk ? 3 : totalHints() <= 2 ? 2 : 1;
    const prevD = state.done[L.id];
    markLevel(L.id, { xp: levelXp(), stars: Math.max(s, prevD ? prevD.stars : 0), hints: totalHints(), predictOk: predictAnswered && predictOk, dragged: flags.dragged || (prevD && prevD.dragged), f4: flags.f4 || (prevD && prevD.f4) });
  }

  function completeLevel() {
    completed = true; persist(); refreshUi();
    const idx = LEVELS.indexOf(L), next = LEVELS[idx + 1];
    const s = state.done[L.id] ? state.done[L.id].stars : 1;
    const ov = $('#overlay'); ov.hidden = false;
    ov.innerHTML = `<div class="ov-card" role="dialog" aria-modal="true" aria-label="Деңгей өтілді">
      <div class="ov-big">${assisted ? '👀' : '🎉'}</div><h3>${assisted ? 'Шешім көрсетілді' : 'Деңгей өтілді!'}</h3>
      <div class="ov-stars" aria-label="${s} жұлдыз">${stars(s)}</div>
      <p class="ov-xp">${assisted ? 'Мұғалім демонстрациясы: ұпай есептелмейді' : `+${levelXp()} XP · ${totalXp()} XP барлығы`}</p>
      <div class="insight"><b>Есте сақта:</b> ${L.insight}</div>
      <div class="row">${next ? `<a class="btn primary big" href="#/level/${next.id}">${next.icon} ${esc(next.title)} →</a>` : '<a class="btn primary big" href="#/boss">👾 Финалға!</a>'}<button class="btn" id="ovStay" type="button">Кестені қарау</button><a class="btn ghost" href="#/map">Карта</a></div></div>`;
    sound.play('level'); confetti(); mascot.say(`Деңгей өтілді! ${s === 3 ? 'Үш жұлдыз — мінсіз!' : ''}`, 'happy');
    ov.querySelector('.btn.primary').focus();
    $('#ovStay').addEventListener('click', () => { ov.hidden = true; tab('tasks'); });
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.hidden = true; });
  }

  // ---- кесте оқиғалары
  let lockedAt = 0;
  sheet.on('select', ({ addr }) => {
    flags.visited.add(addr);
    if (L.treasures && L.treasures[addr] && wb.getRaw(addr) === '❓') {
      wb.setEntry(addr, L.treasures[addr]);
      sound.play('ok'); confetti({ count: 50, ms: 1200 }); mascot.say(`Алмас табылды! Адрес — ${addr}: ${addr.replace(/\d+/, '')} бағаны, ${addr.replace(/\D+/, '')}-жол.`, 'happy');
    }
    queueEval();
  });
  sheet.on('change', queueEval);
  sheet.on('commit', ({ addr, raw }) => {
    flags.edited.add(addr);
    const v = wb.value(addr);
    if (isErr(v)) { sound.play('bad'); mascot.say(`${v.code}: ${ERROR_HELP[v.code] || ''}`, 'oops'); }
    queueEval();
  });
  sheet.on('fill', (e) => {
    if (!e.changed.length) return;
    flags.filled = true; if (e.via === 'drag') flags.dragged = true;
    sound.play('fill');
    const errs = e.changed.filter((a) => isErr(wb.value(a)));
    if (errs.length) mascot.say(`Қараңдар, ${errs.join(', ')} қызыл болды! Төмендегі «Көшіру журналын» оқы: сілтеме қалай ауысты?`, 'oops');
    else mascot.say('Формула таралды! Төмендегі журналда әр ұяшықтың формуласы көрсетілген — түсті бөліктер ауысқан сілтемелер.', 'happy');
    queueEval();
  });
  sheet.on('f4', () => { flags.f4 = true; sound.play('click'); mascot.say('F4 $ белгілерін қойды! Қайта басып көр: A1 → $A$1 → A$1 → $A1.', 'happy'); });
  sheet.on('f4-miss', () => { toast('Алдымен курсорды сілтеменің (мысалы, E1) жанына қой, сосын F4 бас'); mascot.say('F4 сілтеме жанында тұрғанда жұмыс істейді: курсорды E1 сөзінің ішіне не соңына қой.', 'think'); });
  sheet.on('locked', () => { const t = Date.now(); if (t - lockedAt < 1200) return; lockedAt = t; sound.play('bad'); toast('🔒 Бұл ұяшықты өзгертуге болмайды. Сарғыш түсті жұмыс аймағында жаз.'); });
  sheet.on('formula-error', ({ message }) => { sound.play('bad'); toast('⚠ ' + message, 'warn', 4200); mascot.say(`Формулада қате: ${message}`, 'oops'); });
  sheet.on('hint', ({ message }) => toast(message));

  // ---- мұғалім құралдары
  $('#btnDemo').addEventListener('click', async () => {
    if (demo.running) { demo.stop(); return; }
    assisted = true; wbReset();
    await demo.run(L.demo);
  });
  $('#btnSolve').addEventListener('click', async () => {
    assisted = true; demo.stop();
    wbReset();
    for (const [a, f] of Object.entries(L.solution)) wb.setEntry(a, f);
    for (const [s, d] of (L.solutionFill || [])) sheet.fill(parseRectSafe2(s), parseRectSafe2(d), 'solution');
    if (L.solutionFmt) for (const [r, f] of Object.entries(L.solutionFmt)) for (const a of cellsIn(parseRect(r))) wb.setFmt(a, f);
    wb._emit({ type: 'solve' });
    mascot.say('Шешім осылай: формулаларды басып, сілтемелердің түсін қара.', 'happy');
    queueEval();
  });
  function wbReset() {
    // демо тазадан басталуы үшін алдыңғы жазбаларды тазалаймыз
    wb.cells.clear(); wb.load(data); wb._undo = []; wb._redo = []; sheet.select(S.select || 'A1', { silent: true }); sheet.render();
  }
  const parseRectSafe2 = (t) => parseRect(t);

  refreshUi();
  evaluate();
  return () => { demo.stop(); sheet.destroy(); };
}

// ───────────────────────── босс ─────────────────────────
function screenBoss() {
  app.innerHTML = `<section class="boss"><div class="boss-head"><p class="eyebrow">Финал</p><h2>Қателер королі</h2><div id="mascotSlot"></div></div><div id="bossRoot"></div></section>`;
  const mascot = new Mascot($('#mascotSlot'));
  mascot.say('Король #ДЕЛ/0! қателерді тарату үшін келді. Білімің — сенің қаруың!', 'think');
  mountBoss($('#bossRoot'), {
    mascot,
    onFinish: ({ win, correct, total, hearts }) => {
      const xp = correct * 60 + (win ? hearts * 100 : 0);
      const stars_ = win ? (hearts === 3 ? 3 : hearts === 2 ? 2 : 1) : 0;
      const prev = state.done.boss;
      if (win || !prev) markLevel('boss', { xp: Math.max(xp, prev ? prev.xp : 0), stars: Math.max(stars_, prev ? prev.stars : 0), hearts, correct, total, win });
      if (win && !prev) updateHud();
    },
    onExit: (win) => go(win ? '#/end' : '#/map'),
  });
  return () => {};
}

// ───────────────────────── ойын алаңы ─────────────────────────
function screenSandbox() {
  const tasks = [
    '5 пәннен бағалары бар кесте құрыңдар: СРЗНАЧ, МАКС, МИН функцияларымен қорытынды шығарыңдар',
    'Баға тізімін бағам ұяшығы арқылы доллар/еуроға аударыңдар (абсолютті сілтеме)',
    'Сынып оқушыларының санынан үлес пайызын есептеңдер ($B$5)',
    'Көбейту кестесін бір формуламен құрыңдар (аралас сілтеме)',
  ];
  app.innerHTML = `<section class="sandbox"><div class="sb-left"><p class="eyebrow">Ойын алаңы</p><h2>Еркін кесте</h2>
    <p class="muted">Мұнда ештеңе бұзылмайды: кез келген ұяшыққа жаз, формулаларды сына. Ctrl+Z — болдырмау.</p>
    <h3>Тапсырмалар (14-слайд)</h3><ol class="sb-tasks">${tasks.map((t, i) => `<li><label><input type="checkbox" data-i="${i}"/> <span>${t}</span></label></li>`).join('')}</ol>
    <div id="mascotSlot"></div></div>
    <div class="sb-right"><div id="sheetRoot"></div><div id="xrayRoot"></div></div></section>`;
  const wb = new Workbook({ cols: 10, rows: 14 });
  wb.load({ A1: 'Тауар', B1: 'Баға, тг', C1: 'Баға, USD', D1: 'Бағам:', E1: '500', A2: 'Дәптер', B2: '250', A3: 'Қалам', B3: '150', A4: 'Кітап', B4: '3000' });
  const sheet = new Sheet($('#sheetRoot'), { workbook: wb, colWidths: [110, 90, 100, 90, 80, 80, 80, 80, 80, 80], label: 'Еркін кесте' });
  new XRay($('#xrayRoot'), sheet);
  const mascot = new Mascot($('#mascotSlot')); mascot.say('Тәжірибе жаса! Формула жазып, маркерді сүйреп көр.', 'happy');
  sheet.on('formula-error', ({ message }) => { toast('⚠ ' + message, 'warn'); mascot.say(message, 'oops'); });
  sheet.on('f4-miss', () => toast('Курсорды сілтеме жанына қой, сосын F4 бас'));
  const KEY = 'sandbox-tasks';
  app.querySelectorAll('.sb-tasks input').forEach((cb) => { try { cb.checked = (localStorage.getItem(`fq:${KEY}:${cb.dataset.i}`) === '1'); } catch { /* ignore */ } cb.addEventListener('change', () => { try { localStorage.setItem(`fq:${KEY}:${cb.dataset.i}`, cb.checked ? '1' : '0'); } catch { /* ignore */ } if (cb.checked) { sound.play('ok'); mascot.say(pick(PRAISE), 'happy'); } }); });
  return () => sheet.destroy();
}

// ───────────────────────── нәтиже ─────────────────────────
function badgesFor() {
  const d = state.done; const all = Object.values(d);
  return [
    { id: 'tr', icon: '💎', name: 'Қазына аулаушы', ok: !!d.addr },
    { id: 'drag', icon: '🔁', name: 'Сүйреу шебері', ok: all.some((x) => x.dragged) },
    { id: 'f4', icon: '⌨️', name: 'F4 ниндзясы', ok: all.some((x) => x.f4) },
    { id: 'bug', icon: '🐞', name: 'Баг аулаушы', ok: !!d.absolute },
    { id: 'oracle', icon: '🔮', name: 'Көріпкел', ok: all.filter((x) => x.predictOk).length >= 4 },
    { id: 'perfect', icon: '🌟', name: 'Мінсіз ойын', ok: all.filter((x) => x.stars === 3).length >= 3 },
    { id: 'boss', icon: '👑', name: 'Король жеңімпазы', ok: !!(d.boss && d.boss.win && d.boss.hearts === 3) },
  ];
}

function screenEnd() {
  const xp = totalXp(); const r = rankFor(xp, MAX_XP); const b = badgesFor();
  const MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
  const now = new Date();
  const date = `${now.getFullYear()} жылғы ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  app.innerHTML = `<section class="end">
    <div class="cert" id="cert"><div class="cert-in">
      <p class="eyebrow">Формула Квест · 8-сынып · Информатика</p>
      <h2>Сертификат</h2>
      <p>Осы сертификат иесі</p><div class="cert-name">${esc(state.name || 'Ойыншы')}</div>
      <p>«Статистикалық мәліметтер. Абсолютті және салыстырмалы сілтемелер» тақырыбын<br>ойын арқылы меңгеріп, <b>${xp} XP</b> жинады.</p>
      <div class="cert-rank">${r.icon} ${r.name}</div>
      <div class="cert-badges">${b.map((x) => `<span class="badge ${x.ok ? 'on' : ''}" title="${x.name}">${x.icon}<small>${x.name}</small></span>`).join('')}</div>
      <p class="cert-date">${date}</p></div></div>
    <div class="end-actions"><button class="btn primary big" id="btnPrint" type="button">🖨 Сертификатты басып шығару</button><a class="btn" href="#/map">Картаға оралу</a><a class="btn ghost" href="#/boss">Финалды қайталау</a></div>
  </section>`;
  confetti({ count: 160 });
  $('#btnPrint').addEventListener('click', () => window.print());
  return () => {};
}

// ───────────────────────── іске қосу ─────────────────────────
export async function boot() {
  applyTheme(); bindHud(); updateHud();
  await checkSession();   // мұғалім сессиясы бар ма (API жоқ болса — үнсіз өтеді)
  updateHud();
  window.addEventListener('hashchange', render);
  startSync();
  render();
}

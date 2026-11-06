// Финал: «Қателер королі» — босспен шайқас (викторина). Дұрыс жауап — босс жараланады, қате — жан кетеді.
import { buildQuiz } from './levels.js';
import { sound, confetti } from '../ui/fx.js';
import { escapeHtml } from '../ui/colors.js';

const BOSS_SVG = `
<svg viewBox="0 0 220 200" class="boss-svg" aria-hidden="true">
  <g class="boss-body">
    <rect x="46" y="18" width="22" height="26" fill="#14122b"/><rect x="152" y="18" width="22" height="26" fill="#14122b"/>
    <rect x="30" y="38" width="160" height="120" rx="26" fill="#8a3ffc" stroke="#14122b" stroke-width="6"/>
    <rect x="48" y="58" width="124" height="34" rx="8" fill="#fff6e0" stroke="#14122b" stroke-width="4"/>
    <text x="110" y="83" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="800" font-size="22" fill="#e0334f" class="boss-err">#ДЕЛ/0!</text>
    <g class="boss-eyes"><rect x="62" y="104" width="32" height="26" rx="6" fill="#fff" stroke="#14122b" stroke-width="4"/><rect x="126" y="104" width="32" height="26" rx="6" fill="#fff" stroke="#14122b" stroke-width="4"/>
    <rect x="76" y="112" width="12" height="14" fill="#e0334f"/><rect x="132" y="112" width="12" height="14" fill="#e0334f"/>
    <path d="M58 98l40 10M162 98l-40 10" stroke="#14122b" stroke-width="7" stroke-linecap="round"/></g>
    <path d="M70 142l12-10 12 10 12-10 12 10 12-10 12 10 12-10 12 10" fill="none" stroke="#14122b" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="62" y="158" width="26" height="30" fill="#6c4dff" stroke="#14122b" stroke-width="5"/><rect x="132" y="158" width="26" height="30" fill="#6c4dff" stroke="#14122b" stroke-width="5"/>
  </g>
</svg>`;

const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * @param {HTMLElement} root
 * @param {{mascot:any, onFinish:(r:{win:boolean,correct:number,total:number,hearts:number})=>void, onExit:()=>void}} io
 */
export function mountBoss(root, io) {
  const LIVES = 3;
  let questions, idx, hearts, correct, locked;

  function start() {
    // 8 сұрақ: тізімнен араластырып аламыз; жауаптар орны да араласады
    questions = shuffle(buildQuiz()).slice(0, 8).map((q) => {
      const opts = q.options.map((t, i) => ({ t, ok: i === q.answer }));
      return { ...q, opts: shuffle(opts) };
    });
    idx = 0; hearts = LIVES; correct = 0; locked = false;
    root.innerHTML = `
      <div class="boss-wrap">
        <div class="boss-stage">
          <div class="boss-fig">${BOSS_SVG}</div>
          <div class="boss-name">Қателер королі</div>
          <div class="hp" role="progressbar" aria-label="Босстың өмірі" aria-valuemin="0" aria-valuemax="${questions.length}"><div class="hp-fill"></div></div>
          <div class="hearts" aria-label="Жандар"></div>
        </div>
        <div class="boss-card" id="bossCard"></div>
      </div>`;
    root.querySelector('.hp-fill').style.width = '100%';
    renderHearts();
    question();
  }

  function renderHearts() {
    root.querySelector('.hearts').innerHTML = Array.from({ length: LIVES }, (_, i) => `<span class="heart ${i < hearts ? 'on' : 'off'}">${i < hearts ? '❤️' : '🖤'}</span>`).join('');
    root.querySelector('.hearts').setAttribute('aria-label', `Жандар: ${hearts}`);
  }
  function setHp() {
    const left = questions.length - correct;
    const fill = root.querySelector('.hp-fill'); fill.style.width = (left / questions.length) * 100 + '%';
    root.querySelector('.hp').setAttribute('aria-valuenow', String(left));
  }

  function question() {
    const q = questions[idx]; locked = false;
    const card = root.querySelector('#bossCard');
    card.innerHTML = `
      <div class="q-meta">Сұрақ ${idx + 1} / ${questions.length}</div>
      <h3 class="q-text">${q.q}</h3>
      <div class="q-opts" role="group" aria-label="Жауап нұсқалары">${q.opts.map((o, i) => `<button class="q-opt" data-i="${i}" type="button"><span class="k">${'ABCD'[i]}</span><span class="t">${/^=/.test(o.t) ? `<code>${escapeHtml(o.t)}</code>` : o.t}</span></button>`).join('')}</div>
      <div class="q-fb" aria-live="polite"></div>`;
    card.querySelectorAll('.q-opt').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.i))));
    io.mascot.say(['Қане, көрейік!', 'Абайла — король қулық жасайды.', 'Сен істей аласың!'][idx % 3], 'think');
  }

  function answer(i) {
    if (locked) return; locked = true;
    const q = questions[idx];
    const card = root.querySelector('#bossCard');
    const ok = q.opts[i].ok;
    card.querySelectorAll('.q-opt').forEach((b, k) => { b.disabled = true; if (q.opts[k].ok) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); });
    const stage = root.querySelector('.boss-stage');
    if (ok) {
      correct++; sound.play('hit'); setHp();
      stage.classList.remove('hit'); void stage.offsetWidth; stage.classList.add('hit');
      io.mascot.say('Дәл тидің! Король жараланды!', 'happy');
    } else {
      hearts--; sound.play('bad'); renderHearts();
      stage.classList.remove('hurt'); void stage.offsetWidth; stage.classList.add('hurt');
      io.mascot.say('Ой! Түсіндірмені оқып ал — келесіде дұрыс істейсің.', 'oops');
    }
    const fb = card.querySelector('.q-fb');
    const last = idx === questions.length - 1;
    const over = hearts <= 0;
    fb.innerHTML = `<div class="fb ${ok ? 'good' : 'bad'}"><b>${ok ? 'Дұрыс!' : 'Қате.'}</b> ${q.explain}</div><button class="btn primary" type="button" id="qNext">${over ? 'Нәтижені көру' : last ? 'Финал!' : 'Келесі сұрақ →'}</button>`;
    fb.querySelector('#qNext').focus();
    fb.querySelector('#qNext').addEventListener('click', () => {
      if (over || last) return finish();
      idx++; question();
    });
  }

  function finish() {
    const win = hearts > 0 && correct >= Math.ceil(questions.length * 0.6);
    if (win) { sound.play('level'); confetti({ count: 200, ms: 2800 }); }
    io.onFinish({ win, correct, total: questions.length, hearts: Math.max(0, hearts) });
    const card = root.querySelector('#bossCard');
    card.innerHTML = `
      <div class="boss-result ${win ? 'win' : 'lose'}">
        <div class="big">${win ? '🏆' : '💥'}</div>
        <h3>${win ? 'Король жеңілді!' : 'Король әлі тұр…'}</h3>
        <p>${correct} / ${questions.length} дұрыс жауап · ${'❤️'.repeat(Math.max(0, hearts)) || '—'}</p>
        <div class="row"><button class="btn primary" id="again" type="button">${win ? 'Қайта ойнау' : 'Қайта көру'}</button><button class="btn" id="exit" type="button">${win ? 'Нәтижелер' : 'Картаға'}</button></div>
      </div>`;
    card.querySelector('#again').addEventListener('click', start);
    card.querySelector('#exit').addEventListener('click', () => io.onExit(win));
    io.mascot.say(win ? 'Жарайсың! Сен нағыз Кесте шебері болдың!' : 'Қиын болды ма? Деңгейлерді қайталап, қайта келіп көр!', win ? 'happy' : 'oops');
  }

  start();
  return { restart: start };
}

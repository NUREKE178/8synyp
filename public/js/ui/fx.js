// Дыбыс (WebAudio), конфетти, хабарламалар, терілетін мәтін.
import { state, save } from '../game/state.js';

const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- дыбыс ----------
let actx = null;
function ctx() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, start, dur, type = 'square', vol = 0.05) {
  const c = ctx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
const SOUNDS = {
  click: () => tone(520, 0, 0.05, 'square', 0.03),
  ok: () => { tone(523, 0, 0.1); tone(659, 0.09, 0.1); tone(784, 0.18, 0.16); },
  bad: () => { tone(180, 0, 0.18, 'sawtooth', 0.05); tone(130, 0.14, 0.22, 'sawtooth', 0.05); },
  fill: () => { for (let i = 0; i < 5; i++) tone(400 + i * 90, i * 0.05, 0.06, 'triangle', 0.04); },
  level: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.16, 'square', 0.05)); },
  hit: () => { tone(300, 0, 0.08, 'square', 0.06); tone(200, 0.06, 0.12, 'square', 0.05); },
};
export const sound = {
  get on() { return !state.mute; },
  toggle() { state.mute = !state.mute; save(); if (!state.mute) SOUNDS.ok(); return !state.mute; },
  play(name) { if (!state.mute && SOUNDS[name]) SOUNDS[name](); },
};

// ---------- конфетти ----------
export function confetti({ count = 140, ms = 2200 } = {}) {
  if (reduced()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti'; cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (cv.width = innerWidth * dpr), H = (cv.height = innerHeight * dpr);
  const g = cv.getContext('2d');
  const colors = ['#6c4dff', '#20d6a0', '#ffd23f', '#ff5c7a', '#3db8ff', '#ff9f43'];
  const ps = Array.from({ length: count }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
    vx: (Math.random() - 0.5) * 16 * dpr, vy: (-Math.random() * 14 - 4) * dpr,
    s: (6 + Math.random() * 8) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const k = t - t0;
    g.clearRect(0, 0, W, H);
    ps.forEach((p) => {
      p.vy += 0.45 * dpr; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.995;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - k / ms);
      g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
    });
    if (k < ms) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}

// ---------- хабарлама ----------
export function toast(message, kind = 'info', ms = 3200) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.textContent = message;
  box.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
  while (box.children.length > 3) box.firstChild.remove();
}

// ---------- терілетін мәтін ----------
const typers = new WeakMap();
export function typewriter(node, text, speed = 14) {
  clearInterval(typers.get(node));
  if (reduced() || text.length > 220) { node.textContent = text; return; }
  node.textContent = '';
  let i = 0;
  const id = setInterval(() => { i += 2; node.textContent = text.slice(0, i); if (i >= text.length) clearInterval(id); }, speed);
  typers.set(node, id);
}

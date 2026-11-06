// Формик — сабақ жүргізетін робот-гид. Көңіл-күйі: idle | happy | think | oops.
import { typewriter } from './fx.js';

const SVG = `
<svg viewBox="0 0 120 130" class="mascot-svg" aria-hidden="true">
  <g class="bot">
    <line x1="60" y1="8" x2="60" y2="22" stroke="#14122b" stroke-width="4" stroke-linecap="round"/>
    <circle class="ant" cx="60" cy="8" r="6" fill="#ffd23f" stroke="#14122b" stroke-width="3"/>
    <rect x="22" y="22" width="76" height="62" rx="14" fill="#6c4dff" stroke="#14122b" stroke-width="4"/>
    <rect x="31" y="32" width="58" height="38" rx="8" fill="#fff6e0" stroke="#14122b" stroke-width="3"/>
    <g class="eyes eyes-idle"><rect class="eye" x="41" y="43" width="11" height="13" rx="3" fill="#14122b"/><rect class="eye" x="68" y="43" width="11" height="13" rx="3" fill="#14122b"/></g>
    <g class="eyes eyes-happy"><path d="M40 55q6-12 12 0M67 55q6-12 12 0" fill="none" stroke="#14122b" stroke-width="4" stroke-linecap="round"/></g>
    <g class="eyes eyes-think"><rect x="41" y="46" width="11" height="10" rx="3" fill="#14122b"/><rect x="68" y="40" width="11" height="16" rx="3" fill="#14122b"/></g>
    <g class="eyes eyes-oops"><path d="M40 44l12 12m0-12L40 56M67 44l12 12m0-12L67 56" stroke="#e0334f" stroke-width="4" stroke-linecap="round"/></g>
    <path class="mouth mouth-idle" d="M52 64h16" stroke="#14122b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <path class="mouth mouth-happy" d="M48 62q12 10 24 0" stroke="#14122b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <path class="mouth mouth-oops" d="M50 67q10-8 20 0" stroke="#14122b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <rect x="34" y="88" width="52" height="30" rx="8" fill="#20d6a0" stroke="#14122b" stroke-width="4"/>
    <text x="60" y="110" text-anchor="middle" font-family="JetBrains Mono, monospace" font-weight="800" font-size="16" fill="#14122b">ƒx</text>
    <rect x="10" y="94" width="14" height="10" rx="5" fill="#6c4dff" stroke="#14122b" stroke-width="3"/>
    <rect x="96" y="94" width="14" height="10" rx="5" fill="#6c4dff" stroke="#14122b" stroke-width="3"/>
  </g>
</svg>`;

export class Mascot {
  constructor(root) {
    this.root = root;
    root.classList.add('mascot');
    root.innerHTML = `<div class="mascot-fig mood-idle">${SVG}</div><div class="bubble" role="status" aria-live="polite"><span class="bubble-text"></span></div>`;
    this.fig = root.querySelector('.mascot-fig');
    this.text = root.querySelector('.bubble-text');
    this.bubble = root.querySelector('.bubble');
  }
  mood(m) {
    this.fig.className = `mascot-fig mood-${m}`;
    clearTimeout(this._t);
    if (m !== 'idle') this._t = setTimeout(() => { this.fig.className = 'mascot-fig mood-idle'; }, 3600);
  }
  say(msg, mood = 'idle') {
    this.mood(mood);
    this.bubble.classList.remove('pop'); void this.bubble.offsetWidth; this.bubble.classList.add('pop');
    typewriter(this.text, msg);
  }
}

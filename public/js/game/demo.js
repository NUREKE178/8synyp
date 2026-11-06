// Демо-режим: мұғалімге арналған «автопилот». Қадамдар: say | select | type | drag | wait | fmt
import { parseRectSafe } from '../ui/sheet.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class DemoRunner {
  /** @param {import('../ui/sheet.js').Sheet} sheet @param {{say?:(t:string)=>void}} io */
  constructor(sheet, io = {}) { this.sheet = sheet; this.io = io; this.token = 0; this.running = false; }

  stop() { this.token++; this.running = false; this.io.onState?.(false); }

  async run(steps) {
    const my = ++this.token; this.running = true; this.io.onState?.(true);
    const cancelled = () => my !== this.token;
    for (const st of steps) {
      if (cancelled()) return false;
      if (st.say) { this.io.say?.(st.say); await sleep(Math.min(2600, 700 + st.say.length * 28)); }
      else if (st.select) { this.sheet.select(st.select); await sleep(450); }
      else if (st.type) { await this.sheet.typeInto(st.type[0], st.type[1], { isCancelled: cancelled }); await sleep(250); }
      else if (st.drag) { await this.sheet.animateFill(parseRectSafe(st.drag[0]), parseRectSafe(st.drag[1]), { isCancelled: cancelled }); await sleep(500); }
      else if (st.wait) await sleep(st.wait);
    }
    if (!cancelled()) { this.running = false; this.io.onState?.(false); }
    return !cancelled();
  }
}

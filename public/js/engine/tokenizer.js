// Формула мәтінін токендерге бөлу. Әр токенде мәтіндегі орны (start/end) сақталады —
// сондықтан сілтемелерді көшіргенде формуланың қалған бөлігі (бос орындар, регистр) өзгермейді.

import { parseRef, latinizeLetters } from './refs.js';

const LETTER = 'A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі_';
const NAME_RE = new RegExp(`^[${LETTER}][${LETTER}.\\d]*`);
const REF_CANDIDATE_RE = /^\$?[A-Za-zА-Яа-я]{1,3}\$?\d+/;
const NUMBER_RE = /^(?:\d+(?:[.,]\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
const ERROR_RE = /^#[А-ЯЁA-Z\/0-9!?]+/;

/**
 * @typedef {{type:string,text:string,start:number,end:number,ref?:object}} Token
 * type: num | str | ref | name | op | lparen | rparen | sep | colon | pct | error | bad
 */

/** @returns {Token[]} */
export function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const rest = src.slice(i);
    let m;

    if (ch === '"') {
      let j = i + 1, out = '';
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') { out += '"'; j += 2; continue; }
          break;
        }
        out += src[j++];
      }
      if (j >= src.length) { tokens.push({ type: 'bad', text: src.slice(i), start: i, end: src.length }); break; }
      tokens.push({ type: 'str', text: src.slice(i, j + 1), value: out, start: i, end: j + 1 });
      i = j + 1;
      continue;
    }

    if ((m = ERROR_RE.exec(rest)) && ch === '#') {
      tokens.push({ type: 'error', text: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }

    if ((m = NUMBER_RE.exec(rest))) {
      tokens.push({ type: 'num', text: m[0], value: Number(m[0].replace(',', '.')), start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }

    if ((ch === '$' || /[A-Za-zА-Яа-я]/.test(ch)) && (m = REF_CANDIDATE_RE.exec(rest))) {
      const after = rest[m[0].length];
      const ref = parseRef(m[0]);
      // "СУММ(" немесе "LOG10(" сияқты аттар сілтеме емес
      if (ref && !(after && new RegExp(`[${LETTER}\\d(]`).test(after))) {
        tokens.push({ type: 'ref', text: m[0], ref, start: i, end: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }

    if ((m = NAME_RE.exec(rest))) {
      tokens.push({ type: 'name', text: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      tokens.push({ type: 'op', text: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>'.includes(ch)) { tokens.push({ type: 'op', text: ch, start: i, end: i + 1 }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen', text: ch, start: i, end: i + 1 }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', text: ch, start: i, end: i + 1 }); i++; continue; }
    if (ch === ';' || ch === ',') { tokens.push({ type: 'sep', text: ch, start: i, end: i + 1 }); i++; continue; }
    if (ch === ':') { tokens.push({ type: 'colon', text: ch, start: i, end: i + 1 }); i++; continue; }
    if (ch === '%') { tokens.push({ type: 'pct', text: ch, start: i, end: i + 1 }); i++; continue; }

    tokens.push({ type: 'bad', text: ch, start: i, end: i + 1 });
    i++;
  }
  return tokens;
}

export { latinizeLetters };

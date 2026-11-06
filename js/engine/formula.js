// Формула мәтінімен жұмыс (AST-сіз, токен бойынша): көшіру кезіндегі ауысу, F4, түстермен бөлектеу, канондық түр.

import { tokenize } from './tokenizer.js';
import { parse, ParseError } from './parser.js';
import { formatRef, cycleAbs, refKind, colToLetters, rectToText, normRect } from './refs.js';
import { canonicalFnName, FN_DISPLAY } from './evaluate.js';

/** Токенді мәтінде ауыстыру (орны сақталады). */
function splice(text, start, end, replacement) {
  return text.slice(0, start) + replacement + text.slice(end);
}

/**
 * Ұяшықты (dc, dr) қадамға көшіргенде формуладағы салыстырмалы сілтемелер ауысады,
 * абсолютті ($) бөліктер өзгермейді.
 */
export function shiftFormula(text, dc, dr) {
  if (!text.startsWith('=')) return text;
  const body = text.slice(1);
  const tokens = tokenize(body);
  const edits = [];
  const shiftOne = (ref) => {
    const col = ref.absCol ? ref.col : ref.col + dc;
    const row = ref.absRow ? ref.row : ref.row + dr;
    if (col < 1 || row < 1) return null;
    return formatRef({ ...ref, col, row });
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'ref') continue;
    const isRangeStart = tokens[i + 1] && tokens[i + 1].type === 'colon' && tokens[i + 2] && tokens[i + 2].type === 'ref';
    if (isRangeStart) {
      const t2 = tokens[i + 2];
      const a = shiftOne(t.ref), b = shiftOne(t2.ref);
      if (a && b) {
        edits.push([t.start, t.end, a], [t2.start, t2.end, b]);
      } else {
        edits.push([t.start, t2.end, '#ССЫЛ!']);
      }
      i += 2;
    } else {
      edits.push([t.start, t.end, shiftOne(t.ref) ?? '#ССЫЛ!']);
    }
  }
  let out = body;
  for (const [s, e, r] of edits.sort((x, y) => y[0] - x[0])) out = splice(out, s, e, r);
  return '=' + out;
}

/**
 * Теру кезінде жазылған формуланы әдемілейді: адрестер үлкен латын әріпімен,
 * функция аттары орысша үлкен әріппен, бөлгіш — «;».
 */
export function normalizeFormula(text) {
  if (!text.startsWith('=')) return text;
  const body = text.slice(1);
  const tokens = tokenize(body);
  let out = body;
  for (const t of [...tokens].sort((a, b) => b.start - a.start)) {
    let rep = null;
    if (t.type === 'ref') rep = formatRef(t.ref);
    else if (t.type === 'name') {
      const next = body.slice(t.end).trimStart()[0];
      if (next === '(') {
        const key = canonicalFnName(t.text);
        rep = key ? FN_DISPLAY[key] : t.text.toUpperCase();
      }
    } else if (t.type === 'sep') rep = ';';
    if (rep !== null) out = splice(out, t.start, t.end, rep);
  }
  return '=' + out;
}

/**
 * Формуладағы сілтемелердің тізімі (түстермен бөлектеу үшін).
 * Диапазон бір бірлік болып саналады. Әр бірлік — бір түс.
 * @returns {{start:number,end:number,text:string,kind:'ref'|'range',rect:object,refs:object[]}[]}
 */
export function refSpans(text) {
  if (!text.startsWith('=')) return [];
  const body = text.slice(1);
  const tokens = tokenize(body);
  const spans = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'ref') continue;
    const isRange = tokens[i + 1] && tokens[i + 1].type === 'colon' && tokens[i + 2] && tokens[i + 2].type === 'ref';
    if (isRange) {
      const t2 = tokens[i + 2];
      spans.push({
        start: t.start + 1, end: t2.end + 1, text: body.slice(t.start, t2.end), kind: 'range',
        rect: normRect(t.ref.col, t.ref.row, t2.ref.col, t2.ref.row), refs: [t.ref, t2.ref],
      });
      i += 2;
    } else {
      spans.push({
        start: t.start + 1, end: t.end + 1, text: t.text, kind: 'ref',
        rect: normRect(t.ref.col, t.ref.row, t.ref.col, t.ref.row), refs: [t.ref],
      });
    }
  }
  return spans;
}

/**
 * F4: курсор тұрған сілтеменің түрін ауыстырады (A1 → $A$1 → A$1 → $A1 → A1).
 * @returns {{text:string, caret:number}|null}
 */
export function toggleAbsAt(text, caret, selEnd = caret) {
  if (!text.startsWith('=')) return null;
  const body = text.slice(1);
  const tokens = tokenize(body);
  const c0 = caret - 1, c1 = selEnd - 1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'ref') continue;
    const isRange = tokens[i + 1] && tokens[i + 1].type === 'colon' && tokens[i + 2] && tokens[i + 2].type === 'ref';
    const spanEnd = isRange ? tokens[i + 2].end : t.end;
    if (c1 < t.start || c0 > spanEnd) { if (isRange) i += 2; continue; }
    if (isRange) {
      const t2 = tokens[i + 2];
      // Курсор қай шетінде тұр — сол шектің жаңа күйін екі шетке де қолданамыз
      const first = c0 <= t.end;
      const next = cycleAbs((first ? t : t2).ref);
      const a = formatRef({ ...t.ref, absCol: next.absCol, absRow: next.absRow });
      const b = formatRef({ ...t2.ref, absCol: next.absCol, absRow: next.absRow });
      let out = splice(body, t2.start, t2.end, b);
      out = splice(out, t.start, t.end, a);
      return { text: '=' + out, caret: 1 + t.start + a.length + 1 + b.length };
    }
    const rep = formatRef(cycleAbs(t.ref));
    return { text: '=' + splice(body, t.start, t.end, rep), caret: 1 + t.start + rep.length };
  }
  return null;
}

/** Канондық жол: бос орынсыз, ағылшынша функция аты, * және + қосылғыштары сұрыпталған. */
export function canonicalFormula(text) {
  if (typeof text !== 'string' || !text.startsWith('=')) return null;
  let ast;
  try { ast = parse(text.slice(1)); } catch { return null; }
  const s = (n) => {
    switch (n.type) {
      case 'num': return String(n.value);
      case 'str': return JSON.stringify(n.value);
      case 'err': return n.code;
      case 'paren': return s(n.arg);
      case 'ref': return formatRef(n.ref);
      case 'range': return rectToText(n.rect).replace(/^([A-Z]+\d+)$/, '$1');
      case 'name': return n.name.toUpperCase();
      case 'neg': return `-(${s(n.arg)})`;
      case 'pct': return `(${s(n.arg)})%`;
      case 'call': return `${canonicalFnName(n.name) || n.name.toUpperCase()}(${n.args.map(s).join(',')})`;
      case 'bin': {
        const l = s(n.left), r = s(n.right);
        if (n.op === '+' || n.op === '*') return `(${[l, r].sort().join(n.op)})`;
        return `(${l}${n.op}${r})`;
      }
      default: return '?';
    }
  };
  return '=' + s(ast);
}

/** Формула қолданатын функциялар (канондық аттармен). */
export function functionsUsed(text) {
  if (typeof text !== 'string' || !text.startsWith('=')) return [];
  return tokenize(text.slice(1))
    .filter((t, i, arr) => t.type === 'name' && arr[i + 1] && arr[i + 1].type === 'lparen')
    .map((t) => canonicalFnName(t.text) || t.text.toUpperCase());
}

/** Сілтеме түрінің қазақша сипаттамасы (X-ray панелі үшін). */
export function explainRefKind(ref) {
  switch (refKind(ref)) {
    case 'relative': return { label: 'салыстырмалы', note: 'көшіргенде адрес ауысады', icon: '↔' };
    case 'absolute': return { label: 'абсолютті', note: 'көшіргенде өзгермейді (баған да, жол да бекітілген)', icon: '⚓' };
    case 'mixed-col': return { label: 'аралас', note: `${colToLetters(ref.col)} бағаны бекітілген, жол ауысады`, icon: '⇕' };
    default: return { label: 'аралас', note: `${ref.row}-жол бекітілген, баған ауысады`, icon: '⇔' };
  }
}

export { ParseError };

/**
 * Формуланы тексеру: оқушыға түсінікті қате хабарын қайтарады.
 * @returns {null | {message:string,pos:number}}
 */
export function validateFormula(text) {
  if (!text.startsWith('=')) return null;
  const body = text.slice(1);
  if (!body.trim()) return { message: '«=» белгісінен кейін формуланы жазыңыз', pos: 1 };
  try { parse(body); return null; } catch (e) {
    if (e instanceof ParseError) return { message: e.message, pos: e.pos + 1 };
    throw e;
  }
}

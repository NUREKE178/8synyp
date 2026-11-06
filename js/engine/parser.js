// Формуланы AST-ке айналдыру (рекурсивті түсу).
// Басымдық (жоғарыдан төменге): унарлы минус, %, ^, * /, + -, &, салыстыру — Excel-дегідей.

import { tokenize } from './tokenizer.js';
import { normRect } from './refs.js';

export class ParseError extends Error {
  constructor(message, pos = 0, code = 'syntax') {
    super(message);
    this.pos = pos;
    this.code = code;
  }
}

/**
 * @param {string} text — "=" белгісінсіз формула денесі
 * @returns {object} AST
 */
export function parse(text) {
  const tokens = tokenize(text);
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const isOp = (t, ...ops) => t && t.type === 'op' && ops.includes(t.text);

  const bad = tokens.find((t) => t.type === 'bad');
  if (bad) throw new ParseError(`«${bad.text}» таңбасы формулада қолданылмайды`, bad.start, 'bad-char');
  if (!tokens.length) throw new ParseError('Формула бос', 0, 'empty');

  function comparison() {
    let left = concat();
    while (isOp(peek(), '=', '<>', '<', '>', '<=', '>=')) {
      const op = next().text;
      left = { type: 'bin', op, left, right: concat() };
    }
    return left;
  }
  function concat() {
    let left = additive();
    while (isOp(peek(), '&')) { next(); left = { type: 'bin', op: '&', left, right: additive() }; }
    return left;
  }
  function additive() {
    let left = term();
    while (isOp(peek(), '+', '-')) {
      const op = next().text;
      left = { type: 'bin', op, left, right: term() };
    }
    return left;
  }
  function term() {
    let left = power();
    while (isOp(peek(), '*', '/')) {
      const op = next().text;
      left = { type: 'bin', op, left, right: power() };
    }
    return left;
  }
  function power() {
    let left = unary();
    while (isOp(peek(), '^')) { next(); left = { type: 'bin', op: '^', left, right: unary() }; }
    return left;
  }
  function unary() {
    const t = peek();
    if (isOp(t, '-', '+')) {
      next();
      const arg = unary();
      return t.text === '-' ? { type: 'neg', arg } : arg;
    }
    return postfix();
  }
  function postfix() {
    let node = primary();
    while (peek() && peek().type === 'pct') { next(); node = { type: 'pct', arg: node }; }
    return node;
  }
  function primary() {
    const t = next();
    if (!t) throw new ParseError('Формула аяқталмай қалды', text.length, 'eof');
    switch (t.type) {
      case 'num': return { type: 'num', value: t.value };
      case 'str': return { type: 'str', value: t.value };
      case 'error': return { type: 'err', code: t.text };
      case 'ref': {
        if (peek() && peek().type === 'colon') {
          next();
          const t2 = next();
          if (!t2 || t2.type !== 'ref') throw new ParseError('Диапазонның екінші шеті жоқ (мысалы B2:B6)', t.end, 'range');
          const r = normRect(t.ref.col, t.ref.row, t2.ref.col, t2.ref.row);
          return { type: 'range', rect: r, a: t.ref, b: t2.ref };
        }
        return { type: 'ref', ref: t.ref };
      }
      case 'name': {
        if (peek() && peek().type === 'lparen') {
          next();
          const args = [];
          if (peek() && peek().type === 'rparen') { next(); return { type: 'call', name: t.text, args }; }
          for (;;) {
            args.push(comparison());
            const n = next();
            if (!n) throw new ParseError('Жақша жабылмады: «)» жетіспейді', text.length, 'paren');
            if (n.type === 'rparen') break;
            if (n.type !== 'sep') throw new ParseError('Аргументтерді «;» арқылы бөліңіз', n.start, 'sep');
          }
          return { type: 'call', name: t.text, args };
        }
        return { type: 'name', name: t.text };
      }
      case 'lparen': {
        const e = comparison();
        const n = next();
        if (!n || n.type !== 'rparen') throw new ParseError('Жақша жабылмады: «)» жетіспейді', n ? n.start : text.length, 'paren');
        return { type: 'paren', arg: e };
      }
      default:
        throw new ParseError(`Күтпеген белгі: «${t.text}»`, t.start, 'unexpected');
    }
  }

  const ast = comparison();
  if (p < tokens.length) {
    const t = tokens[p];
    throw new ParseError(t.type === 'rparen' ? 'Артық жабатын жақша «)»' : `Күтпеген белгі: «${t.text}»`, t.start, 'unexpected');
  }
  return ast;
}

// AST-ті есептеу. Ұяшық мәнін `ctx.cell(col,row)` береді (workbook).

import { ERR, XlError, isErr } from './values.js';

/** Функция аттары: орысша да, ағылшынша да жазуға болады. */
export const FN_ALIASES = {
  SUM: 'SUM', 'СУММ': 'SUM',
  AVERAGE: 'AVERAGE', 'СРЗНАЧ': 'AVERAGE',
  MAX: 'MAX', 'МАКС': 'MAX',
  MIN: 'MIN', 'МИН': 'MIN',
  COUNT: 'COUNT', 'СЧЁТ': 'COUNT', 'СЧЕТ': 'COUNT',
  ROUND: 'ROUND', 'ОКРУГЛ': 'ROUND',
};

/** Көрсету үшін негізгі (орысша) атау. */
export const FN_DISPLAY = { SUM: 'СУММ', AVERAGE: 'СРЗНАЧ', MAX: 'МАКС', MIN: 'МИН', COUNT: 'СЧЁТ', ROUND: 'ОКРУГЛ' };

export function canonicalFnName(name) {
  return FN_ALIASES[name.toUpperCase()] || null;
}

function toNumber(v) {
  if (isErr(v)) return v;
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.');
    if (t !== '' && Number.isFinite(Number(t))) return Number(t);
  }
  return ERR.VALUE;
}

function toText(v) {
  if (isErr(v)) return v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'ИСТИНА' : 'ЛОЖЬ';
  if (typeof v === 'number') return String(Number(v.toPrecision(12))).replace('.', ',');
  return String(v);
}

/** Аргументтерден сандар жинау (диапазонда тек нақты сандар). */
function collectNumbers(args, ctx, env) {
  const nums = [];
  for (const a of args) {
    if (a.type === 'range') {
      for (let r = a.rect.r1; r <= a.rect.r2; r++) {
        for (let c = a.rect.c1; c <= a.rect.c2; c++) {
          const v = ctx.cell(c, r);
          if (isErr(v)) return v;
          if (typeof v === 'number') nums.push(v);
        }
      }
    } else if (a.type === 'ref') {
      const v = ctx.cell(a.ref.col, a.ref.row);
      if (isErr(v)) return v;
      if (typeof v === 'number') nums.push(v);
    } else {
      const v = evaluate(a, ctx, env);
      if (isErr(v)) return v;
      const n = toNumber(v);
      if (isErr(n)) return n;
      nums.push(n);
    }
  }
  return nums;
}

function countNumbers(args, ctx, env) {
  let n = 0;
  for (const a of args) {
    if (a.type === 'range') {
      for (let r = a.rect.r1; r <= a.rect.r2; r++) {
        for (let c = a.rect.c1; c <= a.rect.c2; c++) {
          if (typeof ctx.cell(c, r) === 'number') n++;
        }
      }
    } else if (a.type === 'ref') {
      if (typeof ctx.cell(a.ref.col, a.ref.row) === 'number') n++;
    } else {
      const v = evaluate(a, ctx, env);
      if (!isErr(v) && !isErr(toNumber(v))) n++;
    }
  }
  return n;
}

const FUNCS = {
  SUM: (args, ctx, env) => {
    const nums = collectNumbers(args, ctx, env);
    return isErr(nums) ? nums : nums.reduce((s, x) => s + x, 0);
  },
  AVERAGE: (args, ctx, env) => {
    const nums = collectNumbers(args, ctx, env);
    if (isErr(nums)) return nums;
    return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : ERR.DIV0;
  },
  MAX: (args, ctx, env) => {
    const nums = collectNumbers(args, ctx, env);
    return isErr(nums) ? nums : nums.length ? Math.max(...nums) : 0;
  },
  MIN: (args, ctx, env) => {
    const nums = collectNumbers(args, ctx, env);
    return isErr(nums) ? nums : nums.length ? Math.min(...nums) : 0;
  },
  COUNT: (args, ctx, env) => countNumbers(args, ctx, env),
  ROUND: (args, ctx, env) => {
    if (args.length < 1 || args.length > 2) return ERR.VALUE;
    const x = toNumber(evaluate(args[0], ctx, env));
    if (isErr(x)) return x;
    const d = args[1] ? toNumber(evaluate(args[1], ctx, env)) : 0;
    if (isErr(d)) return d;
    const f = 10 ** Math.trunc(d);
    return Math.sign(x) * Math.round(Math.abs(x) * f + Number.EPSILON) / f;
  },
};

function compare(op, a, b) {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  const norm = (v) => (v === null || v === undefined ? (typeof (typeof a === 'string' ? a : b) === 'string' ? '' : 0) : v);
  let x = norm(a), y = norm(b);
  if (typeof x === 'string' && typeof y === 'string') { x = x.toLowerCase(); y = y.toLowerCase(); }
  else if (typeof x !== typeof y) {
    // Excel: сан < мәтін < логикалық
    const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
    x = rank(x); y = rank(y);
  }
  switch (op) {
    case '=': return x === y;
    case '<>': return x !== y;
    case '<': return x < y;
    case '>': return x > y;
    case '<=': return x <= y;
    case '>=': return x >= y;
    default: return ERR.VALUE;
  }
}

/**
 * @param {object} ast
 * @param {{cell:(col:number,row:number)=>any}} ctx
 */
export function evaluate(ast, ctx, env = {}) {
  switch (ast.type) {
    case 'num': return ast.value;
    case 'str': return ast.value;
    case 'err': return new XlError(ast.code);
    case 'paren': return evaluate(ast.arg, ctx, env);
    case 'ref': return ctx.cell(ast.ref.col, ast.ref.row);
    case 'range': return ERR.VALUE; // диапазон функция ішінен тыс тұрса
    case 'name': return ERR.NAME;
    case 'neg': {
      const n = toNumber(evaluate(ast.arg, ctx, env));
      return isErr(n) ? n : -n;
    }
    case 'pct': {
      const n = toNumber(evaluate(ast.arg, ctx, env));
      return isErr(n) ? n : n / 100;
    }
    case 'call': {
      const key = canonicalFnName(ast.name);
      if (!key) return ERR.NAME;
      return FUNCS[key](ast.args, ctx, env);
    }
    case 'bin': {
      const lv = evaluate(ast.left, ctx, env);
      const rv = evaluate(ast.right, ctx, env);
      if (ast.op === '&') {
        const a = toText(lv), b = toText(rv);
        return isErr(a) ? a : isErr(b) ? b : a + b;
      }
      if (['=', '<>', '<', '>', '<=', '>='].includes(ast.op)) return compare(ast.op, lv, rv);
      const a = toNumber(lv), b = toNumber(rv);
      if (isErr(a)) return a;
      if (isErr(b)) return b;
      switch (ast.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? ERR.DIV0 : a / b;
        case '^': {
          const r = a ** b;
          return Number.isFinite(r) ? r : ERR.NUM;
        }
        default: return ERR.VALUE;
      }
    }
    default:
      return ERR.VALUE;
  }
}

/* ============================================================
 * 10-frontend.js — 归一层 + 解析 + 参数收集 + 编译求值
 *
 * 把「学生语法」翻译成 math.js 语法：
 *   |x-1| → abs(x-1)   π→pi  ≤≥≠ → <= >= !=
 *   ln → log(自然对数)  lg → log10  log(a,x)→log(x,a)
 *   sin^-1 → asin   sin²(x) → sin(x)^2   arcsin → asin
 *   √x → sqrt(x)   分段 {expr,cond;...} → Piecewise
 * 同时维护偏移重映射表（归一化串 ↔ 原文），报错位置指回原文。
 * ============================================================ */
'use strict';

/* ---------- 字符表 ---------- */
const UNICODE = {
  'π': 'pi', '≤': '<=', '≥': '>=', '≠': '!=', '·': '*', '×': '*', '÷': '/',
  '−': '-', '∞': 'Infinity',
};
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '²': '2' };
const RESERVED = new Set(['e', 'pi', 'tau', 'phi', 'i', 'Infinity', 'infinity', 'NaN', 'true', 'false', 'x']);

function isLetter(c) { return /[a-zA-Z]/.test(c); }
function isDigit(c) { return /[0-9]/.test(c); }

/* ---------- 顶层切分工具 ---------- */
function splitTopLevel(s, sep) {
  const parts = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '|') { /* abs 已归一到括号前；此处仅在分段外层用到 */ }
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  parts.push(cur);
  return parts;
}
function findTopLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) return i;
  }
  return -1;
}
/* 顶层等号（关系式 F(x,y)=0 用）：跳过 <= >= != == 与括号内部 */
function findTopLevelEq(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '=' && depth === 0) {
      const prev = s[i - 1], next = s[i + 1];
      if (prev === '<' || prev === '>' || prev === '!' || prev === '=') continue;
      if (next === '=') { i++; continue; }
      return i;
    }
  }
  return -1;
}
function matchingParen(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* ---------- 单个表达式归一化（tokenizer，含 remap） ---------- */
function normalizeExpr(s) {
  let out = '', map = [];
  let prev = '';
  const push = (str, orig) => { for (const ch of str) { out += ch; map.push(orig); } };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (c === ' ') { push(' ', i); continue; }

    if (c === '|') {
      const isOpen = !/[)\w]/.test(prev);
      push(isOpen ? 'abs(' : ')', i);
      prev = isOpen ? '(' : ')';
      continue;
    }
    if (c === '√') {
      // 看下一个非空字符
      let k = i + 1; while (k < s.length && s[k] === ' ') k++;
      if (s[k] === '(') { push('sqrt', i); prev = 't'; continue; }
      push('sqrt(', i);
      // 读一个原子
      if (k < s.length && isLetter(s[k])) { push(s[k], k); i = k; prev = s[k]; }
      else if (k < s.length && isDigit(s[k])) { let j = k; while (j < s.length && isDigit(s[j])) j++; push(s.slice(k, j), k); prev = s[j - 1]; i = j - 1; }
      push(')', i);
      prev = ')';
      continue;
    }

    // 标识符（含函数名处理）
    if (isLetter(c)) {
      let j = i; while (j < s.length && isLetter(s[j])) j++;
      const word = s.slice(i, j);
      // 看后随（跳过空格）
      let k = j; while (k < s.length && s[k] === ' ') k++;
      const next = s[k];

      // 1) ln → log（自然对数）
      if (word === 'ln') { push('log', i); prev = 'g'; i = j - 1; continue; }
      if (word === 'lg') { push('log10', i); prev = '0'; i = j - 1; continue; }
      if (word === 'arcsin' || word === 'arccos' || word === 'arctan') { push('a' + word.slice(3), i); prev = 'n'; i = j - 1; continue; }

      // 2) log(a, x) → log(x, a)
      if (word === 'log' && next === '(') {
        const close = matchingParen(s, k);
        if (close > 0) {
          const inner = s.slice(k + 1, close);
          if (findTopLevelComma(inner) > 0 && splitTopLevel(inner, ',').length === 2) {
            const args = splitTopLevel(inner, ',').map(x => x.trim());
            push('log(' + args[1] + ',' + args[0] + ')', i);
            prev = ')'; i = close; continue;
          }
        }
        push('log', i); prev = 'g'; i = j - 1; continue;
      }

      // 3) sin^-1 → asin（及 cos/tan）
      if ((word === 'sin' || word === 'cos' || word === 'tan') && next === '^' && s[k + 1] === '-' && s[k + 2] === '1') {
        push('a' + word, i); prev = 'n'; i = k + 2; continue;
      }

      // 4) sin²(x) / sin^2(x) → sin(x)^2
      if (next === '²' || (next === '^' && isDigit(s[k + 1]))) {
        const sup = next === '²' ? '2' : s[k + 1];
        let p = next === '²' ? k + 1 : k + 2;
        while (p < s.length && s[p] === ' ') p++;
        if (s[p] === '(') {
          const close = matchingParen(s, p);
          if (close > 0) {
            const inner = s.slice(p + 1, close);
            const sub = normalizeExpr(inner);
            push(word + '(', i);
            for (let t = 0; t < sub.norm.length; t++) { out += sub.norm[t]; map.push(p + 1 + sub.map[t]); }
            push(')^' + sup, close);
            prev = ')'; i = close; continue;
          }
        }
      }

      push(word, i); prev = word.slice(-1); i = j - 1; continue;
    }

    // 上标
    if (SUP[c] !== undefined) { push('^' + SUP[c], i); prev = SUP[c]; continue; }

    // unicode
    if (UNICODE[c] !== undefined) { push(UNICODE[c], i); prev = UNICODE[c].slice(-1); continue; }

    // 默认
    push(c, i); prev = c;
  }
  return { norm: out, map };
}

/* ---------- 归一化主入口 ---------- */
function normalize(raw) {
  raw = (raw || '').trim();
  if (!raw) return { ok: false, error: STR.errEmpty };

  let defName = null, defVar = 'x', body = raw, offset = 0;
  const m = raw.match(/^([a-zA-Z])\s*\(\s*([a-zA-Z])\s*\)\s*=\s*(.*)$/s);
  if (m) { defName = m[1]; defVar = m[2]; body = m[3]; offset = raw.indexOf('=') + 1; }
  body = body.trim();

  // 关系式：顶层有等号且不是 f(x)=… 定义式 → y=… 视作显式，其余视作 F(x,y)=0
  let relation = null;
  if (!m && !defName) {
    const eqIdx = findTopLevelEq(body);
    if (eqIdx > 0) {
      const lhs = body.slice(0, eqIdx).trim(), rhs = body.slice(eqIdx + 1).trim();
      if (!rhs) return { ok: false, error: '等式右边为空，请写成 y=… 或 F(x,y)=0' };
      if (/^y$/i.test(lhs)) { body = rhs; offset = raw.indexOf(rhs); }
      else relation = { lhs, rhs, eqAt: offset + eqIdx, lhsAt: offset, rhsAt: offset + eqIdx + 1 + (body.slice(eqIdx + 1).length - rhs.length) };
    }
  }

  // 分段检测：首字符 { 且末尾 }
  let piecewise = null;
  if (!relation && body[0] === '{' && body[body.length - 1] === '}') {
    const inner = body.slice(1, -1);
    const caseStrs = splitTopLevel(inner, ';').map(x => x.trim()).filter(x => x);
    if (caseStrs.length === 0) return { ok: false, error: '分段函数格式应为 {表达式, 条件; …}，如 {x^2, x≥0; -x, x<0}' };
    const cases = [];
    for (const cs of caseStrs) {
      const ci = findTopLevelComma(cs);
      if (ci < 0) return { ok: false, error: '分段每一项需写成「表达式, 条件」，如 x^2, x≥0' };
      const exprStr = cs.slice(0, ci).trim();
      const condStr = cs.slice(ci + 1).trim();
      const re = normalizeExpr(exprStr);
      const rc = normalizeExpr(condStr);
      if (!re.norm || !rc.norm) return { ok: false, error: '分段内表达式为空' };
      cases.push({ exprSrc: exprStr, condSrc: condStr, expr: re.norm, cond: rc.norm });
    }
    piecewise = { kind: 'piecewise', cases };
    return { ok: true, defName, defVar, offset, piecewise, norm: '', map: [] };
  }

  if (relation) {
    const rl = normalizeExpr(relation.lhs), rr = normalizeExpr(relation.rhs);
    const norm = '(' + rl.norm + ')-(' + rr.norm + ')';
    const map = [relation.lhsAt].concat(rl.map, [relation.eqAt], [relation.eqAt], [relation.rhsAt], rr.map, [relation.rhsAt + relation.rhs.length - 1]);
    return { ok: true, defName: null, defVar: 'x', offset: 0, piecewise: null, relation: true, lhsNorm: rl.norm, rhsNorm: rr.norm, norm, map };
  }

  const r = normalizeExpr(body);
  return { ok: true, defName, defVar, offset, piecewise: null, norm: r.norm, map: r.map };
}

/* ---------- 解析：构建可用的函数条目 ---------- */
let FN_SEQ = 0;
function buildFn(normResult, raw, opts) {
  opts = opts || {};
  const n = normResult;
  let expr = null, piecewise = null;
  try {
    if (n.piecewise) {
      piecewise = {
        kind: 'piecewise',
        cases: n.piecewise.cases.map(c => ({ expr: math.parse(c.expr), condSrc: c.condSrc, cond: math.parse(c.cond) })),
      };
    } else {
      expr = math.parse(n.norm);
    }
  } catch (e) {
    const char = typeof e.char === 'number' ? e.char : null;
    const pos = char != null ? (n.map[char] != null ? n.map[char] + n.offset : char + n.offset) : null;
    return { ok: false, error: STR.errParse + '：' + e.message.replace(/\(char \d+\)/, ''), pos, raw };
  }

  const node = piecewise || expr;
  if (n.relation) return { ok: true, fn: buildImplicitFn(node, n, raw, opts) };
  const params = collectParams(node, n.defVar);
  const fn = {
    id: 'fn' + (++FN_SEQ),
    src: raw,
    name: opts.name || n.defName || null,
    var: n.defVar,
    expr: node,
    piecewise: !!piecewise,
    params: {}, paramOrder: params, paramRanges: {},
    color: opts.color || PALETTE[FN_SEQ % PALETTE.length],
    visible: true,
    isDerived: !!opts.isDerived, derivedFrom: opts.derivedFrom || null, derivedLabel: opts.derivedLabel || null,
  };
  for (const p of params) { fn.params[p] = new Rat(1, 1); fn.paramRanges[p] = [-5, 5, 0.1]; }
  return { ok: true, fn };
}

/* 一般隐式方程 F(x,y)=0：由关系式归一化结果构造曲线条目 */
function buildImplicitFn(Fnode, n, raw, opts) {
  const fn = {
    id: 'fn' + (++FN_SEQ),
    src: raw,
    name: opts.name || null,
    var: 'x',
    expr: Fnode,                 // F(x,y)（不是 y=f(x)，绘图按 fn.implicit 分发）
    piecewise: false,
    params: {}, paramOrder: [], paramRanges: {},
    color: opts.color || PALETTE[FN_SEQ % PALETTE.length],
    visible: true,
    isDerived: !!opts.isDerived, derivedFrom: opts.derivedFrom || null, derivedLabel: opts.derivedLabel || null,
    implicit: true, conicType: null,
    Fnode: Fnode,
  };
  for (const p of collectParams(Fnode, ['x', 'y'])) { fn.params[p] = new Rat(1, 1); fn.paramRanges[p] = [-5, 5, 0.1]; fn.paramOrder.push(p); }
  fn.implicitFn = makeImplicitEvaluator(fn);
  let tex = null;
  try { tex = nodeToTex(math.parse(n.lhsNorm)) + '=' + nodeToTex(math.parse(n.rhsNorm)); } catch (e) { tex = null; }
  fn.implicitTex = tex || (nodeToTex(Fnode) + '=0');
  return fn;
}
/* F(x,y) 求值闭包：坐标 + 参数滑块实时生效（等值线网格每帧调用上万次，复用 scope 对象） */
function makeImplicitEvaluator(fn) {
  const c = compileNode(fn.expr), scope = { x: 0, y: 0 };
  const keys = Object.keys(fn.params);
  return function (x, y) {
    scope.x = x; scope.y = y;
    for (let i = 0; i < keys.length; i++) scope[keys[i]] = fn.params[keys[i]].toNumber();
    try {
      const v = c.single.evaluate(scope);
      return (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'number' ? v : NaN);
    } catch (e) { return NaN; }
  };
}

function collectParams(node, exclude) {
  const excl = Array.isArray(exclude) ? new Set(exclude) : new Set([exclude]);
  const set = new Set();
  const walk = (nd) => {
    if (!nd) return;
    if (nd.isSymbolNode) {
      if (!RESERVED.has(nd.name) && !excl.has(nd.name)) set.add(nd.name);
      return;
    }
    // 子节点字段不统一：args（运算/函数）、content（括号）、items（数组）
    // 注意不递归 FunctionNode.fn，否则 sin/cos 会被当成自由字母
    if (nd.args) nd.args.forEach(walk);
    if (nd.content) walk(nd.content);
    if (nd.items) nd.items.forEach(walk);
  };
  if (node.kind === 'piecewise') node.cases.forEach(c => { walk(c.expr); walk(c.cond); });
  else walk(node);
  return [...set].sort();
}

/* ---------- 编译求值（LRU） ---------- */
const COMPILE_CACHE = new LRU(256);
function compileNode(node) {
  const key = node.kind === 'piecewise'
    ? 'pw:' + node.cases.map(c => c.expr.toString() + '|' + c.cond.toString()).join(';')
    : node.toString();
  const hit = COMPILE_CACHE.get(key);
  if (hit) return hit;
  let compiled;
  if (node.kind === 'piecewise') {
    compiled = {
      cases: node.cases.map(c => ({ ef: c.expr.compile(), cf: c.cond.compile() })),
    };
  } else {
    compiled = { single: node.compile() };
  }
  COMPILE_CACHE.set(key, compiled);
  return compiled;
}
function evalFn(fn, x, paramsOverride) {
  const params = paramsOverride || fn.params;
  const scope = { x };
  for (const p in params) scope[p] = params[p].toNumber();
  const c = compileNode(fn.expr);
  try {
    if (c.single) return c.single.evaluate(scope);
    for (const cs of c.cases) {
      if (cs.cf.evaluate(scope)) return cs.ef.evaluate(scope);
    }
    return NaN; // 无分支命中（条件覆盖不全）
  } catch (e) { return NaN; }
}
function evalNodeWithParams(node, x, params) {
  const scope = { x };
  for (const p in params) scope[p] = params[p].toNumber();
  if (node.kind === 'piecewise') {
    const c = compileNode(node);
    for (const cs of c.cases) if (cs.cf.evaluate(scope)) return cs.ef.evaluate(scope);
    return NaN;
  }
  try { return node.compile().evaluate(scope); } catch (e) { return NaN; }
}

/* ---------- 排版（toTex + 微调） ---------- */
function nodeToTex(node, tweak) {
  if (node.kind === 'piecewise') {
    const body = node.cases.map(c => {
      let et = c.expr.toTex({ parenthesis: 'auto' });
      let ct = c.cond.toTex({ parenthesis: 'auto' });
      et = tweakTex(et); ct = tweakTex(ct);
      return et + ' & ' + ct;
    }).join(' \\\\ ');
    return '\\begin{cases} ' + body + ' \\end{cases}';
  }
  let t = node.toTex({ parenthesis: 'auto' });
  return tweakTex(t);
}
function tweakTex(t) {
  // x^(1/2) → sqrt{x}
  t = t.replace(/\{\s*([a-zA-Z0-9]+)\s*\}^\{\(\\frac\{1\}\{2\}\)\}/g, '\\sqrt{$1}');
  t = t.replace(/\(\\frac\{1\}\{2\}\)/g, '\\frac{1}{2}');
  // 2~ x → 2x 等（去隐式乘空格，保数字×字母更紧）
  t = t.replace(/~ /g, '');
  // e^ 美化
  t = t.replace(/\\left\(\s*(-?)\{\s*x\s*\}\s*\\right\)/g, '$1x');
  return t;
}

/* 表达式比较：数值近似等价（用于 checkStep） */
function numericEqual(nodeA, nodeB, domain, n = 8, seed = 42) {
  // domain: 抽样区间 [lo, hi]；若为空返回 true
  if (!domain || domain[0] >= domain[1]) return true;
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < n; i++) {
    const x = domain[0] + (domain[1] - domain[0]) * rnd();
    const a = evalNodeWithParams(nodeA, x, {});
    const b = evalNodeWithParams(nodeB, x, {});
    if (isNaN(a) && isNaN(b)) continue;
    if (isNaN(a) || isNaN(b)) return false;
    if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
  }
  return true;
}

/* 符号第二意见：simplify(realContext)(a - b) === 0，辅以 rationalize 展开多项式幂 */
function symbolicallyEqual(nodeA, nodeB) {
  try {
    const diff = math.parse('(' + nodeA.toString() + ')-(' + nodeB.toString() + ')');
    const s = math.simplify(diff, {}, math.simplify.realContext);
    if (s.toString() === '0') return true;
    // simplify 不会展开 (x+1)^2 这类幂，改用 rationalize（把有理函数化为多项式比值）
    // 仅当两侧都是代数/有理表达式时适用，否则抛错跳过
    const r = math.rationalize(diff);
    if (r && r.toString() === '0') return true;
    return false;
  } catch (e) { return false; }
}

var FRONTEND = { normalize, buildFn, buildImplicitFn, makeImplicitEvaluator, collectParams, compileNode, evalFn, evalNodeWithParams, nodeToTex, tweakTex, numericEqual, symbolicallyEqual, splitTopLevel, findTopLevelComma, findTopLevelEq, isLetter, isDigit, UNICODE, SUP };

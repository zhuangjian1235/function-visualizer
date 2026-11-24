/* ============================================================
 * 11-math.js — 自研数学层（math.js 只做工具箱）
 *  导数(含 log 常量美化) · 多项式系数(精确 Rat) · 因式分解
 *  精确二次根(根式) · 求根 · 定义域(极/洞/边界) · 符号表(穿根法)
 *  四则/复合 · 反函数
 * ============================================================ */
'use strict';

/* ================= 基础 ================= */
function constToRat(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && typeof v.n === 'number' && typeof v.d === 'number') {
    // math.Fraction：s * n / d
    const s = v.s || 1;
    return new Rat(BigInt(s * v.n), BigInt(v.d));
  }
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return new Rat(BigInt(v), 1n);
    return Rat.fromNumber(v);
  }
  if (typeof v === 'bigint') return new Rat(v, 1n);
  return null;
}
function fact(k) { let r = 1n; for (let i = 2n; i <= BigInt(k); i++) r *= i; return r; }

/* 参数替换（精确分数） */
function substParamsExact(node, params) {
  return node.transform(nd => {
    if (nd.isSymbolNode && params && params[nd.name]) {
      const r = params[nd.name];
      const f = math.fraction(Number(r.n), Number(r.d));
      return new math.ConstantNode(f);
    }
    return nd;
  });
}

/* ================= 导数 ================= */
function derivativeOf(node, params) {
  let n = params ? substParamsExact(node, params) : node;
  if (n.kind === 'piecewise') {
    return { kind: 'piecewise', cases: n.cases.map(c => ({ expr: beautifyDeriv(math.simplify(math.derivative(c.expr, 'x'), {}, math.simplify.realContext)), cond: c.cond })) };
  }
  let d;
  try { d = math.simplify(math.derivative(n, 'x'), {}, math.simplify.realContext); }
  catch (e) { return null; }
  return beautifyDeriv(d);
}
function beautifyDeriv(node) {
  const n = math.parse(node.toString());
  return n.transform(nd => {
    if (nd.isConstantNode && typeof nd.value === 'number') {
      const v = nd.value;
      if (v > 0 && v < 3 && !Number.isInteger(v)) {
        const L = 1 / v;
        for (let k = 2; k <= 20; k++) {
          if (Math.abs(Math.exp(L) - k) < 1e-6) return math.parse('1/log(' + k + ')');
        }
      }
    }
    return nd;
  });
}

/* ================= 多项式系数（精确 Rat[]，[c0..cn]） ================= */
function polyCoeffsExact(node) {
  // coeffsFromNode 已覆盖多项式 + - * /（常数分母）^ 与括号；高次幂（>20）返回 null 即"优雅拒绝"
  return coeffsFromNode(node);
}
function coeffsFromNode(node) {
  // 返回 Rat[] 或 null（非多项式）
  if (!node) return null;
  if (node.isConstantNode) { const r = constToRat(node.value); return r ? [r] : null; }
  if (node.isSymbolNode) { return node.name === 'x' ? [new Rat(0n), new Rat(1n)] : null; }
  if (node.isParenthesisNode) return coeffsFromNode(node.content);
  if (node.isOperatorNode) {
    const op = node.op, args = node.args;
    if (node.fn === 'unaryMinus') { const c = coeffsFromNode(args[0]); if (!c) return null; return c.map(x => x.neg()); }
    if (op === '+') {
      let acc = coeffsFromNode(args[0]);
      if (!acc) return null;
      for (let i = 1; i < args.length; i++) { const c = coeffsFromNode(args[i]); if (!c) return null; acc = addPoly(acc, c); }
      return acc;
    }
    if (op === '-') {
      let acc = coeffsFromNode(args[0]);
      if (!acc) return null;
      for (let i = 1; i < args.length; i++) { const c = coeffsFromNode(args[i]); if (!c) return null; acc = subPoly(acc, c); }
      return acc;
    }
    if (op === '*') {
      // 每个因子要么是多项式要么是常数
      let poly = [new Rat(1n)];
      for (const a of args) {
        const c = coeffsFromNode(a);
        if (c === null) return null;
        if (c.length === 1) poly = scalePoly(poly, c[0]);
        else poly = mulPoly(poly, c);
      }
      return poly;
    }
    if (op === '/') {
      const num = coeffsFromNode(args[0]);
      const den = coeffsFromNode(args[1]);
      if (!num) return null;
      if (den && den.length === 1) return scalePoly(num, den[0].isZero() ? null : new Rat(den[0].d, den[0].n));
      return null; // 非多项式（分母含 x）
    }
    if (op === '^') {
      const base = coeffsFromNode(args[0]);
      const exp = constToRat(args[1].value);
      if (!base || !exp || !exp.isInt() || exp.n < 0n) return null;
      const e = Number(exp.n);
      if (e > 20) return null;
      let out = [new Rat(1n)];
      for (let i = 0; i < e; i++) out = mulPoly(out, base);
      return out;
    }
  }
  if (node.isFunctionNode) return null;
  return null;
}
function addPoly(a, b) {
  const len = Math.max(a.length, b.length);
  const r = [];
  for (let i = 0; i < len; i++) r.push((a[i] || new Rat(0n)).add(b[i] || new Rat(0n)));
  return trimPoly(r);
}
function subPoly(a, b) { return addPoly(a, b.map(x => x.neg())); }
function scalePoly(a, s) { if (s === null) return null; return trimPoly(a.map(x => x.mul(s))); }
function mulPoly(a, b) {
  const r = new Array(a.length + b.length - 1).fill(null).map(() => new Rat(0n));
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = r[i + j].add(a[i].mul(b[j]));
  return trimPoly(r);
}
function trimPoly(a) { let e = a.length - 1; while (e > 0 && a[e].isZero()) e--; return a.slice(0, e + 1); }
function polyDegree(a) { return a.length - 1; }
function polyEval(a, xRat) { // xRat: Rat
  let acc = new Rat(0n);
  for (let i = a.length - 1; i >= 0; i--) acc = acc.mul(xRat).add(a[i]);
  return acc;
}

/* ================= 整数化 & 有理根 ================= */
function lcmBig(a, b) { return (a / gcdBig(a, b)) * b; }
function gcdBig(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
function toIntegerCoeffs(coeffs) {
  // 返回 BigInt[]（可能带负）
  let denom = 1n;
  for (const c of coeffs) denom = lcmBig(denom, c.d);
  return coeffs.map(c => (c.n * (denom / c.d)));
}
function divisorsBig(n) {
  n = n < 0n ? -n : n; const ds = [];
  for (let i = 1n; i * i <= n; i++) { if (n % i === 0n) { ds.push(i); if (i !== n / i) ds.push(n / i); } }
  return ds;
}
function rationalRoots(coeffs) {
  // coeffs BigInt[]，返回 Rat[]（去重，含重数）
  const deg = coeffs.length - 1;
  const a0 = coeffs[0], an = coeffs[deg];
  if (a0 === 0n) return [new Rat(0n)]; // x=0 根
  const pCand = divisorsBig(a0), qCand = divisorsBig(an);
  const roots = [];
  const seen = new Set();
  for (const p of pCand) for (const q of qCand) {
    for (const sign of [1n, -1n]) {
      const r = new Rat(sign * p, q);
      const key = r.n + '/' + r.d;
      if (seen.has(key)) continue;
      seen.add(key);
      if (polyEval(coeffs.map((c, i) => new Rat(c)), r).isZero()) roots.push(r);
    }
  }
  return roots;
}
function syntheticDivide(coeffs, r) { // coeffs: Rat[] 低次到高次；r: Rat；返回商（低次到高次）
  const hi = coeffs.slice().reverse(); // 高次到低次
  const n = hi.length;
  const res = new Array(n - 1);
  let prev = hi[0];
  res[0] = prev;
  for (let i = 1; i < n - 1; i++) {
    prev = hi[i].add(prev.mul(r));
    res[i] = prev;
  }
  return res.slice().reverse(); // 低次到高次
}
function factorPolynomial(coeffs) {
  // 输入 Rat[]（去尾 0），输出 factors: [{r: Rat, mult}] 与 remainder: Rat[]（剩余多项式系数）
  const factors = [];
  let cur = coeffs.slice();
  let guard = 0;
  while (polyDegree(cur) >= 1 && guard < 30) {
    guard++;
    const intC = toIntegerCoeffs(cur);
    const rs = rationalRoots(intC);
    if (rs.length === 0) break;
    // 取一个根，除一次（记录重数由循环自然处理）
    const r = rs[0];
    const quot = syntheticDivide(intC.map(c => new Rat(c)), r);
    factors.push(r);
    cur = trimPoly(quot);
  }
  return { factors, remainder: cur };
}

/* ================= 精确二次根 ================= */
function isPerfectSquareRat(r) {
  if (r.sign() < 0) return false;
  const sn = isPerfectSquareBig(r.n), sd = isPerfectSquareBig(r.d);
  if (sn === null || sd === null) return false;
  return new Rat(sn, sd);
}
function isPerfectSquareBig(n) {
  if (n < 0n) return null;
  if (n === 0n) return 0n;
  let x = n, y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  if (x * x === n) return x; return null;
}
function simplifySqrtBig(n) { // √n = k√m，n>0
  let k = 1n, m = n;
  for (let i = 2n; i * i <= n; i++) {
    while (m % (i * i) === 0n) { k *= i; m /= (i * i); }
  }
  return { k, m };
}
function surdOfRat(r) { // √(p/q) = coef·√radicand
  const P = r.n * r.d, Q = r.d;
  const { k, m } = simplifySqrtBig(P);
  return { coef: new Rat(k, Q), radicand: m };
}
function exactQuadratic(a, b, c) {
  // a,b,c: Rat；ax²+bx+c=0
  if (a.isZero()) {
    if (b.isZero()) return c.isZero() ? { roots: [], completeness: 'identity' } : { roots: [], completeness: 'exact' };
    return { roots: [c.neg().div(b)], completeness: 'exact' }; // bx + c = 0
  }
  const disc = b.mul(b).sub(a.mul(c).mul(new Rat(4n)));
  if (disc.sign() < 0) return { roots: [], completeness: 'exact', noReal: true };
  const twoA = a.mul(new Rat(2n));
  if (disc.isZero()) { const r = b.neg().div(twoA); return { roots: [r], completeness: 'exact', double: true }; }
  const sq = isPerfectSquareRat(disc);
  if (sq) {
    const r1 = b.neg().add(sq).div(twoA), r2 = b.neg().sub(sq).div(twoA);
    return { roots: [r1, r2], completeness: 'exact', disc, discPerfect: true };
  }
  // 无理根 (-b ± √disc)/(2a)
  const s = surdOfRat(disc);
  return { roots: [{ b: b.neg().div(twoA), coef: s.coef.div(twoA), radicand: s.radicand }], completeness: 'exact', disc, surd: true };
}
// 线性精确根（覆盖 exactQuadratic 退化分支）
function exactLinear(b, c) { // bx + c = 0
  if (b.isZero()) return null;
  return c.neg().div(b);
}

/* ================= 求根 ================= */
function findRoots(node, params, range) {
  range = range || [-20, 20];
  const n = params ? substParamsExact(node, params) : node;
  const pc = polyCoeffsExact(n);
  if (pc) {
    const deg = polyDegree(pc);
    if (deg === 0) return pc[0].isZero() ? { roots: [], completeness: 'identity' } : { roots: [], completeness: 'exact' };
    if (deg === 1) { const r = exactLinear(pc[1], pc[0]); return { roots: r ? [ratRootObj(r)] : [], completeness: 'exact' }; }
    if (deg === 2) return quadraticRootsFromCoeffs(pc, range);
    // 3 次以上：有理根 + 降次
    const { factors, remainder } = factorPolynomial(pc);
    const remDeg = polyDegree(remainder);
    const roots = factors.map(r => ratRootObj(r));
    let completeness = 'exact';
    if (remDeg >= 1) {
      if (remDeg === 2) {
        const q = quadraticRootsFromCoeffs(remainder, range);
        roots.push(...q.roots);
        if (q.completeness !== 'exact') completeness = 'partial';
      } else {
        // 剩余不可解因子 → 数值补
        const numeric = numericRoots(n, range);
        roots.push(...numeric.map(x => ({ x, tex: fmtNum(x), exact: false })));
        completeness = 'partial';
      }
    }
    roots.sort((a, b) => a.x - b.x);
    return { roots, completeness, factorCount: factors.length };
  }
  // 三角方程：尝试周期通式
  const trig = solveTrigEq(n, range);
  if (trig) return trig;
  const numeric = numericRoots(n, range);
  return { roots: numeric.map(x => ({ x, tex: fmtNum(x), exact: false })), completeness: 'window' };
}
function ratRootObj(r) { return { x: r.toNumber(), tex: r.toTeX(), exact: true }; }
function quadraticRootsFromCoeffs(pc, range) {
  const [c, b, a] = [pc[0], pc[1], pc[2]];
  const q = exactQuadratic(a, b, c);
  if (q.noReal) return { roots: [], completeness: 'exact' };
  if (q.surd) {
    const o = q.roots[0];
    const sq = Math.sqrt(Number(o.radicand));
    const cAbs = o.coef.abs();
    const plus = { x: o.b.toNumber() + cAbs.toNumber() * sq, tex: surdTex({ b: o.b, coef: cAbs, radicand: o.radicand }), exact: true, surd: o };
    const minus = { x: o.b.toNumber() - cAbs.toNumber() * sq, tex: surdTex({ b: o.b, coef: cAbs.neg(), radicand: o.radicand }), exact: true, surd: o };
    return { roots: [minus, plus], completeness: 'exact' };
  }
  if (q.double) return { roots: q.roots.map(r => ratRootObj(r)), completeness: 'exact' };
  const rr = q.roots.map(r => ratRootObj(r)).sort((a, b) => a.x - b.x);
  return { roots: rr, completeness: 'exact' };
}
function surdTex(o) {
  // o = {b: Rat, coef: Rat, radicand}
  const sign = o.coef.sign() < 0 ? '-' : '+';
  const coef = o.coef.abs();
  let coefStr = '';
  if (coef.eq(new Rat(1n))) coefStr = '';
  else coefStr = coef.toTeX();
  const rad = o.radicand === 1n ? '' : '\\sqrt{' + o.radicand + '}';
  const tail = coefStr + rad;
  if (o.b.isZero()) return sign === '-' ? ('-' + tail) : tail;
  return o.b.toTeX() + sign + tail;
}

/* 数值求根 */
function numericRoots(node, range, n) {
  n = n || 2000;
  const f = x => evalNodeWithParams(node, x, {});
  const lo = range[0], hi = range[1];
  const step = (hi - lo) / n;
  const brackets = [];
  let px = lo, py = f(lo);
  for (let i = 1; i <= n; i++) {
    const x = lo + i * step, y = f(x);
    if (isNaN(y)) { px = x; py = NaN; continue; }
    if (!isNaN(py)) {
      if (py === 0) brackets.push([px, px]);
      else if (py * y < 0) brackets.push([px, x]);
    }
    px = x; py = y;
  }
  const roots = [];
  for (const [a, b] of brackets) {
    if (a === b) { roots.push(a); continue; }
    roots.push(brent(f, a, b));
  }
  return dedupe(roots, 1e-7);
}
function brent(f, a, b) {
  let fa = f(a), fb = f(b);
  if (fa === 0) return a; if (fb === 0) return b;
  if (fa * fb > 0) return (a + b) / 2;
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < 200; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol = 2 * Number.EPSILON * Math.abs(b) + 1e-12;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol || fb === 0) return b;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      let s = fb / fa, p, q;
      if (a === c) { p = 2 * xm * s; q = 1 - s; }
      else { q = fa / fc; const r = fb / fc; p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; p = Math.abs(p);
      const min1 = 3 * xm * q - Math.abs(tol * q), min2 = Math.abs(e * q);
      if (2 * p < Math.min(min1, min2)) { e = d; d = p / q; } else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    if (Math.abs(d) > tol) b += d; else b += (xm > 0 ? tol : -tol);
    fb = f(b);
  }
  return b;
}
function dedupe(arr, tol) {
  const out = [];
  for (const x of arr.sort((p, q) => p - q)) {
    if (out.length === 0 || Math.abs(x - out[out.length - 1]) > tol) out.push(x);
  }
  return out;
}

/* ================= 定义域（极/洞/边界） ================= */
function solveBreak(exprNode, params) {
  // 解 exprNode=0 的零点作为 break 点；返回 [{x, tex}]（tex 为 LaTeX，含精确根式）
  const n = params ? substParamsExact(exprNode, params) : exprNode;
  const r = findRoots(n, null, [-30, 30]);
  return r.roots.map(o => ({ x: o.x, tex: o.tex || fmtNum(o.x, 4) }));
}
function collectBreakExprs(node, acc) {
  if (node.kind === 'piecewise') { node.cases.forEach(c => collectBreakExprs(c.expr, acc)); return; }
  const walk = (nd, den) => {
    if (!nd) return;
    if (nd.isOperatorNode && nd.op === '/') { walk(nd.args[1], true); walk(nd.args[0], den); return; }
    if (nd.isFunctionNode) {
      const name = nd.fn.name || nd.fn;
      const arg = nd.args[0];
      if (name === 'tan' || name === 'sec') acc.push({ type: 'tansec', arg });
      else if (name === 'cot' || name === 'csc') acc.push({ type: 'cotcsc', arg });
      else if (name === 'sqrt') acc.push({ type: 'sqrt', arg, den: !!den });
      else if (name === 'nthRoot') { const e = constToRat(nd.args[1].value); if (e && e.n % 2n === 0n) acc.push({ type: 'sqrt', arg, den: !!den }); }
      else if (name === 'log' || name === 'log10') acc.push({ type: 'log', arg });
      else if (name === 'asin' || name === 'acos') acc.push({ type: 'asinacos', arg });
    }
    nd.args && nd.args.forEach(a => walk(a, den));
  };
  walk(node, false);
}
function analyzeDomain(fn) {
  const node = fn.expr;
  const params = fn.params;
  const breaks = new Map(); // x -> kind ('pole'|'boundary'|'hole')
  const acc = [];
  // 分母根 → 极/洞
  const denoms = [];
  const collectDen = nd => {
    if (!nd) return;
    if (nd.isOperatorNode && nd.op === '/') { denoms.push(nd.args[1]); collectDen(nd.args[0]); }
    nd.args && nd.args.forEach(collectDen);
  };
  if (node.kind === 'piecewise') node.cases.forEach(c => collectDen(c.expr));
  else collectDen(node);

  // 洞检测：整体 P/Q 因式分解找公因子
  const holeSet = new Map();
  if (node.kind !== 'piecewise') {
    try {
      const rat = math.rationalize(node, true);
      if (rat && rat.numerator && rat.denominator) {
        const pcNum = polyCoeffsExact(rat.numerator), pcDen = polyCoeffsExact(rat.denominator);
        if (pcNum && pcDen) {
          const fn2 = factorPolynomial(pcNum), fd = factorPolynomial(pcDen);
          for (const rf of fn2.factors) {
            for (const rd of fd.factors) {
              if (rf.eq(rd)) holeSet.set(rf.toNumber(), rf);
            }
          }
        }
      }
    } catch (e) { /* 非有理式，忽略 */ }
  }

  for (const d of denoms) {
    const xs = solveBreak(d, params);
    for (const o of xs) {
      if (holeSet.has(o.x)) { if (!breaks.has(o.x)) breaks.set(o.x, { kind: 'hole', inclusive: false, tex: o.tex }); }
      else if (!breaks.has(o.x)) breaks.set(o.x, { kind: 'pole', inclusive: false, tex: o.tex });
    }
  }
  // 其它约束
  collectBreakExprs(node, acc);
  for (const c of acc) {
    if (c.type === 'tansec') {
      // x = π/2 + kπ 满足 arg=π/2+kπ → 解 arg - π/2 的零点在 mod π
      for (let k = -10; k <= 10; k++) {
        const v = PI / 2 + k * PI;
        const n = substParamsExact(c.arg, params);
        const r = findRoots(math.parse('(' + n.toString() + ')-(' + v + ')'), null, [-30, 30]);
        r.roots.forEach(o => { if (!breaks.has(o.x)) breaks.set(o.x, { kind: 'pole', inclusive: false, tex: fmtNum(o.x, 4) }); });
      }
    } else if (c.type === 'cotcsc') {
      for (let k = -10; k <= 10; k++) {
        const v = k * PI;
        const n = substParamsExact(c.arg, params);
        const r = findRoots(math.parse('(' + n.toString() + ')-(' + v + ')'), null, [-30, 30]);
        r.roots.forEach(o => { if (!breaks.has(o.x)) breaks.set(o.x, { kind: 'pole', inclusive: false, tex: fmtNum(o.x, 4) }); });
      }
    } else if (c.type === 'sqrt') {
      // √arg：arg≥0，边界闭；除非 √ 在分母 → 严格 arg>0，边界开
      const xs = solveBreak(c.arg, params);
      for (const o of xs) if (!breaks.has(o.x)) breaks.set(o.x, { kind: 'boundary', inclusive: !c.den, tex: o.tex });
    } else if (c.type === 'log') {
      // log arg：arg>0 严格，边界开
      const xs = solveBreak(c.arg, params);
      for (const o of xs) if (!breaks.has(o.x)) breaks.set(o.x, { kind: 'boundary', inclusive: false, tex: o.tex });
    } else if (c.type === 'asinacos') {
      // asin/acos：|arg|≤1，边界闭
      const n = substParamsExact(c.arg, params);
      const xs1 = solveBreak(math.parse('(' + n.toString() + ')-1'), null);
      const xs2 = solveBreak(math.parse('(' + n.toString() + ')+1'), null);
      [...xs1, ...xs2].forEach(o => { if (!breaks.has(o.x)) breaks.set(o.x, { kind: 'boundary', inclusive: true, tex: o.tex }); });
    }
  }

  const breakList = [...breaks.entries()].map(([x, info]) => ({ x, kind: info.kind, inclusive: info.inclusive, tex: info.tex })).sort((a, b) => a.x - b.x);
  const poles = breakList.filter(b => b.kind === 'pole').map(b => b.x);
  const holes = breakList.filter(b => b.kind === 'hole').map(b => {
    // 洞的 y 值 = 化简后函数在该点的值（用双侧极限，可去间断点两侧极限相等）
    const eps = 1e-7;
    const yl = evalFn(fn, b.x - eps), yr = evalFn(fn, b.x + eps);
    return { x: b.x, y: (yl + yr) / 2 };
  });
  return { breaks: breakList, poles, holes, intervals: domainIntervals(fn, breakList) };
}
function domainIntervals(fn, breakList) {
  const fin = x => { const v = evalFn(fn, x); return isFinite(v); };
  const pts = breakList.filter(b => b.kind !== 'hole').sort((a, b) => a.x - b.x);
  const result = [];
  for (let i = 0; i <= pts.length; i++) {
    const a = i === 0 ? -Infinity : pts[i - 1].x;
    const b = i === pts.length ? Infinity : pts[i].x;
    if (a === b) continue;
    let mid;
    if (a === -Infinity && b === Infinity) mid = 0;
    else if (a === -Infinity) mid = b - 1;
    else if (b === Infinity) mid = a + 1;
    else mid = (a + b) / 2;
    if (!fin(mid)) continue;
    const loObj = i === 0 ? null : pts[i - 1];
    const hiObj = i === pts.length ? null : pts[i];
    const loOpen = i === 0 ? true : !(loObj.inclusive === true);
    const hiOpen = i === pts.length ? true : !(hiObj.inclusive === true);
    result.push({ lo: a, hi: b, loOpen, hiOpen, loTex: loObj ? loObj.tex : null, hiTex: hiObj ? hiObj.tex : null });
  }
  return result;
}

/* ================= 符号表（穿根法） ================= */
function signTable(fn, range) {
  range = range || [-20, 20];
  const node = fn.expr, params = fn.params;
  const r = findRoots(node, params, range);
  const dom = analyzeDomain(fn);
  const crits = [];
  r.roots.forEach(o => crits.push({ x: o.x, tex: o.tex, kind: 'root' }));
  dom.poles.forEach(x => crits.push({ x, tex: fmtNum(x), kind: 'pole' }));
  // 去重（根与极重合时以极优先）
  const map = new Map();
  for (const c of crits) {
    const key = Math.round(c.x * 1e8);
    if (map.has(key)) { if (c.kind === 'pole') map.set(key, c); }
    else map.set(key, c);
  }
  const sorted = [...map.values()].sort((a, b) => a.x - b.x).filter(c => c.x >= range[0] && c.x <= range[1]);
  const signs = [];
  const f = x => evalFn(fn, x);
  const intervals = [];
  for (let i = 0; i <= sorted.length; i++) {
    const lo = i === 0 ? range[0] : sorted[i - 1].x;
    const hi = i === sorted.length ? range[1] : sorted[i].x;
    let mid = (lo + hi) / 2;
    if (i === 0) mid = Math.max(range[0], lo + 0.5);
    if (i === sorted.length) mid = Math.min(range[1], hi - 0.5);
    const v = f(mid);
    const sign = isNaN(v) ? 0 : (v > 0 ? 1 : v < 0 ? -1 : 0);
    intervals.push({ lo, hi, sign });
  }
  return { crits: sorted, intervals, roots: r.roots, completeness: r.completeness };
}

/* ================= 四则 / 复合 ================= */
function opNode(fNode, gNode, op) {
  const fs = '(' + fNode.toString() + ')', gs = '(' + gNode.toString() + ')';
  switch (op) {
    case 'add': return math.parse(fs + '+' + gs);
    case 'sub': return math.parse(fs + '-' + gs);
    case 'mul': return math.parse(fs + '*' + gs);
    case 'div': return math.parse(fs + '/' + gs);
  }
}
function composeNode(fNode, gNode) {
  return fNode.transform(nd => (nd.isSymbolNode && nd.name === 'x') ? math.parse('(' + gNode.toString() + ')') : nd);
}

/* ================= 反函数 ================= */
function inverseOf(fn) {
  const node = fn.expr;
  const pc = node.kind === 'piecewise' ? null : polyCoeffsExact(node);
  // 线性
  if (pc && polyDegree(pc) === 1) {
    const [c, b] = [pc[0], pc[1]]; // bx + c
    const inv = math.parse('(x-(' + c.toTeX() + '))/(' + b.toTeX() + ')');
    return { ok: true, expr: inv, note: null };
  }
  // 幂函数 x^n
  if (pc && pc.length >= 2 && pc.every((c, i) => i === pc.length - 1 || c.isZero())) {
    const n = polyDegree(pc);
    if (n % 2 === 1) return { ok: true, expr: math.parse('nthRoot(x,' + n + ')'), note: null };
    return { ok: false, note: 'x^' + n + ' 在全体实数上非单调，需限制区间（如 x≥0）后反函数为 nthRoot(x,' + n + ')' };
  }
  // e^x / a^x
  const s = node.toString();
  if (/^\(\s*[0-9.]+\s*\^\s*x\s*\)$/.test(s) || /^[0-9.e]+\s*\^\s*x$/.test(s)) {
    const base = s.match(/^\(?([0-9.e]+)\)?\s*\^\s*x/)[1];
    return { ok: true, expr: math.parse('log(x,' + base + ')'), note: null };
  }
  if (/^log/.test(s) && s.indexOf(',') < 0) return { ok: true, expr: math.parse('exp(x)'), note: null };
  // 反比例 a/x
  const m = s.match(/^\(?([0-9.\-]+)\)?\s*\/\s*x$/);
  if (m) return { ok: true, expr: math.parse(m[1] + '/x'), note: '反比例函数 y=a/x 的反函数仍是自身' };
  return { ok: false, note: '该函数形式暂不支持自动求反函数，或需先限制单调区间。' };
}

/* ================= 配方（完成平方） ================= */
function completeSquare(pc) {
  // pc: Rat[] 低次到高次，二次 ax²+bx+c；返回 { tex, h, k, a, b, c } 或 null
  if (!pc || pc.length !== 3) return null;
  const [c, b, a] = [pc[0], pc[1], pc[2]];
  if (a.isZero()) return null;
  const h = b.neg().div(a.mul(new Rat(2n)));
  const k = c.sub(a.mul(h.mul(h)));
  // tex = a(x-h)² + k
  let tex = '';
  if (a.eq(new Rat(1n))) tex = '(x' + (h.sign() < 0 ? '+' : h.sign() > 0 ? '-' : '') + (h.sign() < 0 ? h.neg().toTeX() : h.toTeX()) + ')^2';
  else if (a.eq(new Rat(-1n))) tex = '-(x' + (h.sign() < 0 ? '+' : h.sign() > 0 ? '-' : '') + (h.sign() < 0 ? h.neg().toTeX() : h.toTeX()) + ')^2';
  else tex = a.toTeX() + '(x' + (h.sign() < 0 ? '+' : h.sign() > 0 ? '-' : '') + (h.sign() < 0 ? h.neg().toTeX() : h.toTeX()) + ')^2';
  if (!k.isZero()) tex += (k.sign() >= 0 ? '+' : '') + k.toTeX();
  return { tex, h, k, a, b, c };
}

/* ================= 周期通式（三角方程） ================= */
const TRIG_SPECIAL = {
  'sin': { '0': '0', '0.5': '\\frac{\\pi}{6}', '-0.5': '-\\frac{\\pi}{6}', '0.7071067811865476': '\\frac{\\pi}{4}', '-0.7071067811865476': '-\\frac{\\pi}{4}', '0.8660254037844386': '\\frac{\\pi}{3}', '-0.8660254037844386': '-\\frac{\\pi}{3}', '1': '\\frac{\\pi}{2}', '-1': '-\\frac{\\pi}{2}' },
  'cos': { '0': '\\frac{\\pi}{2}', '0.5': '\\frac{\\pi}{3}', '-0.5': '\\frac{2\\pi}{3}', '0.7071067811865476': '\\frac{\\pi}{4}', '0.8660254037844386': '\\frac{\\pi}{6}', '1': '0', '-1': '\\pi' },
  'tan': { '0': '0', '1': '\\frac{\\pi}{4}', '-1': '-\\frac{\\pi}{4}', '1.7320508075688772': '\\frac{\\pi}{3}', '0.5773502691896257': '\\frac{\\pi}{6}' },
};
function angleTex(fn, value) {
  const table = TRIG_SPECIAL[fn];
  if (!table) return null;
  const key = String(value);
  if (table[key]) return table[key];
  // 非特殊角 → 数值
  return fmtNum(value, 4);
}
const ANGLE_TEX = {
  '0.5235987755982988': '\\frac{\\pi}{6}', '0.7853981633974483': '\\frac{\\pi}{4}', '1.0471975511965976': '\\frac{\\pi}{3}', '1.5707963267948966': '\\frac{\\pi}{2}',
  '2.0943951023931953': '\\frac{2\\pi}{3}', '2.356194490192345': '\\frac{3\\pi}{4}', '2.6179938779914944': '\\frac{5\\pi}{6}', '3.141592653589793': '\\pi',
};
function angleTexByValue(a) {
  const key = String(a);
  if (ANGLE_TEX[key]) return ANGLE_TEX[key];
  return fmtNum(a, 4);
}
function solveTrigEq(node, range) {
  range = range || [-20, 20];
  const isTrig = nd => nd && nd.isFunctionNode && ['sin', 'cos', 'tan'].includes(nd.fn.name || nd.fn);
  const constVal = nd => {
    if (!nd) return null;
    if (nd.isConstantNode) return typeof nd.value === 'number' ? nd.value : nd.value.toNumber ? nd.value.toNumber() : parseFloat(nd.value);
    try { const v = nd.compile().evaluate({}); if (isFinite(v)) return v; } catch (e) { return null; }
    return null;
  };
  let trigFn = null, uNode = null, C = 0;
  if (isTrig(node)) { trigFn = node.fn.name; uNode = node.args[0]; C = 0; }
  else if (node.isOperatorNode && (node.op === '-' || node.op === '+') && node.args.length === 2) {
    const [a, b] = node.args;
    if (isTrig(a)) { const cv = constVal(b); if (cv === null) return null; trigFn = a.fn.name; uNode = a.args[0]; C = node.op === '-' ? cv : -cv; }
    else if (isTrig(b)) { const cv = constVal(a); if (cv === null) return null; trigFn = b.fn.name; uNode = b.args[0]; C = cv; }
  }
  if (!trigFn || uNode == null) return null;
  // u = kx + m（线性）
  const apc = polyCoeffsExact(uNode);
  if (!apc || apc.length > 2) return null;
  const k = apc.length === 2 ? apc[1] : new Rat(0n);
  const m = apc.length >= 1 ? apc[0] : new Rat(0n);
  if (k.isZero()) return null;
  const kNum = k.toNumber(), mNum = m.toNumber();
  if (trigFn !== 'tan' && Math.abs(C) > 1 + 1e-9) return null; // 无解
  const base = trigFn === 'sin' ? Math.asin(C) : trigFn === 'cos' ? Math.acos(C) : Math.atan(C);
  const baseTex = angleTex(trigFn, C) || fmtNum(base, 4);
  const nz = 'n\\in\\mathbb{Z}';
  const kIs1mIs0 = k.eq(new Rat(1n)) && m.isZero();
  const families = [];
  if (trigFn === 'sin') {
    const a2 = Math.PI - base;
    const t1 = kIs1mIs0 ? 'x=' + baseTex + '+2n\\pi' : 'x=\\frac{' + baseTex + '-' + m.toTeX() + '}{' + k.toTeX() + '}+2n\\pi';
    const t2 = kIs1mIs0 ? 'x=' + angleTexByValue(a2) + '+2n\\pi' : 'x=\\frac{\\pi-' + baseTex + '-' + m.toTeX() + '}{' + k.toTeX() + '}+2n\\pi';
    families.push({ base: (base - mNum) / kNum, period: TAU / kNum, tex: t1 + ', \\; ' + nz });
    families.push({ base: (a2 - mNum) / kNum, period: TAU / kNum, tex: t2 + ', \\; ' + nz });
  } else if (trigFn === 'cos') {
    const t = kIs1mIs0 ? 'x=\\pm' + baseTex + '+2n\\pi' : 'x=\\frac{\\pm' + baseTex + '-' + m.toTeX() + '}{' + k.toTeX() + '}+2n\\pi';
    families.push({ base: (base - mNum) / kNum, period: TAU / kNum, tex: t + ', \\; ' + nz });
    families.push({ base: (-base - mNum) / kNum, period: TAU / kNum, tex: t + ', \\; ' + nz });
  } else {
    const t = kIs1mIs0 ? 'x=' + baseTex + '+n\\pi' : 'x=\\frac{' + baseTex + '-' + m.toTeX() + '}{' + k.toTeX() + '}+n\\pi';
    families.push({ base: (base - mNum) / kNum, period: PI / kNum, tex: t + ', \\; ' + nz });
  }
  // 窗口内具体值
  const roots = [];
  for (const f of families) {
    // 遍历 n 使 base + n*period 落在 range
    const n0 = Math.ceil((range[0] - f.base) / f.period - 0.5);
    const n1 = Math.floor((range[1] - f.base) / f.period + 0.5);
    for (let n = n0; n <= n1; n++) {
      const x = f.base + n * f.period;
      if (x >= range[0] - 1e-6 && x <= range[1] + 1e-6) roots.push({ x, tex: fmtNum(x, 4), exact: false });
    }
  }
  roots.sort((a, b) => a.x - b.x);
  // 去重
  const dedup = [];
  for (const r of roots) if (dedup.length === 0 || Math.abs(r.x - dedup[dedup.length - 1].x) > 1e-6) dedup.push(r);
  return { roots: dedup, completeness: 'periodic', periodic: true, families: families.map(f => f.tex) };
}

/* 定义域自检：抓"定义域被偷偷放大"（可去间断点/消除的极点必须被 caveat 声明） */
function checkDomain(beforeFn, afterFn, caveats) {
  const db = MATH_.analyzeDomain(beforeFn);
  const caveatSet = new Set((caveats || []).map(x => Math.round(x * 1e6)));
  // before 的可去间断点若未被 caveat 声明 → 报警
  for (const h of db.holes) {
    if (!caveatSet.has(Math.round(h.x * 1e6))) return { ok: false, at: h.x, kind: 'missing-caveat' };
  }
  // 数值补充：after 有定义但 before 无定义的点（定义域被放大）
  const N = 400;
  for (let i = 0; i <= N; i++) {
    const x = -20 + (40 * i) / N;
    const vb = FRONTEND.evalFn(beforeFn, x);
    const va = FRONTEND.evalFn(afterFn, x);
    if (!isFinite(vb) && isFinite(va)) {
      // after 定义域比 before 大：该点是否在 caveat 附近
      let covered = false;
      for (const c of caveats || []) if (Math.abs(x - c) < 0.05) { covered = true; break; }
      if (!covered) return { ok: false, at: x, kind: 'enlarged' };
    }
  }
  return { ok: true };
}

/* ================= 坐标系变换（旋转 θ + 平移 a,b） ================= */
function isLinear(node) {
  if (!node || node.kind === 'piecewise') return { linear: false };
  const pc = polyCoeffsExact(node);
  if (!pc) return { linear: false };
  const deg = polyDegree(pc);
  if (deg > 1) return { linear: false };
  const m = deg === 1 ? pc[1] : new Rat(0n);
  const c = pc[0] || new Rat(0n);
  return { linear: true, m, c };
}
function numToSrc(x) {
  if (!isFinite(x)) return '0';
  if (Math.abs(x) < 1e-12) return '0';
  if (Number.isInteger(x)) return String(x);
  const r = Rat.fromNumber(x, 1000000n);
  if (r.d <= 100000n) return '(' + r.n + '/' + r.d + ')';
  return String(x);
}
function niceRatOrNumber(x) {
  if (!isFinite(x)) return x;
  if (Math.abs(x) < 1e-12) return new Rat(0n);
  const rnd = Math.round(x);
  if (Math.abs(x - rnd) < 1e-9) return new Rat(BigInt(rnd), 1n);
  const r = approxRat(x, 1000);
  if (r && Math.abs(r.toNumber() - x) < 1e-9) return r;
  return x;
}
/* 连分数逼近：找分母 ≤ maxDen 的最近有理数（把 0.3333… 还原为 1/3） */
function approxRat(x, maxDen) {
  if (x < 0) { const r = approxRat(-x, maxDen); return r ? r.neg() : null; }
  if (!isFinite(x)) return null;
  if (Math.abs(x) < 1e-12) return new Rat(0n);
  let h0 = 0n, k0 = 1n, h1 = 1n, k1 = 0n;
  let b = x;
  for (let i = 0; i < 24; i++) {
    const a = Math.floor(b);
    const h2 = BigInt(a) * h1 + h0, k2 = BigInt(a) * k1 + k0;
    if (k2 > BigInt(maxDen)) break;
    h0 = h1; k0 = k1; h1 = h2; k1 = k2;
    const fr = b - a;
    if (fr < 1e-12) break;
    b = 1 / fr;
  }
  if (k1 === 0n) return null;
  return new Rat(h1, k1);
}
function ratObjSrc(o) { return (o instanceof Rat) ? (o.d === 1n ? o.n.toString() : '(' + o.n + '/' + o.d + ')') : numToSrc(o); }
function ratObjTex(o) { return (o instanceof Rat) ? o.toTeX() : fmtNum(o, 6); }
/* 直线 y=mx+c 在新坐标系 S'（S 平移 (a,b)+逆时针旋转 θ）中的派生函数 y=m'x+c' */
function rotateLine(m, c, thetaDeg, aRat, bRat) {
  const th = thetaDeg * PI / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  const mN = m.toNumber(), cN = c.toNumber();
  const aN = aRat ? aRat.toNumber() : 0, bN = bRat ? bRat.toNumber() : 0;
  const denom = cos + mN * sin;
  if (Math.abs(denom) < 1e-9) {
    const X0 = -aN * cos + (cN - bN) * sin;
    return { kind: 'vertical', X0 };
  }
  const mp = (mN * cos - sin) / denom;
  const cp = (mN * aN + cN - bN) / denom;
  const mObj = niceRatOrNumber(mp), cObj = niceRatOrNumber(cp);
  const mIsZero = (mObj instanceof Rat && mObj.isZero()) || (typeof mObj === 'number' && Math.abs(mObj) < 1e-12);
  const cIsZero = (cObj instanceof Rat && cObj.isZero()) || (typeof cObj === 'number' && Math.abs(cObj) < 1e-12);
  const mSrc = ratObjSrc(mObj), cSrc = ratObjSrc(cObj);
  let srcRaw;
  if (mIsZero) srcRaw = cSrc;
  else if (cIsZero) srcRaw = '(' + mSrc + ')*x';
  else {
    const cNeg = (cObj instanceof Rat) ? cObj.sign() < 0 : cObj < 0;
    const cAbsSrc = cNeg ? ratObjSrc((cObj instanceof Rat) ? cObj.neg() : -cObj) : cSrc;
    srcRaw = '(' + mSrc + ')*x' + (cNeg ? '-' + cAbsSrc : '+' + cSrc);
  }
  let node;
  try { node = math.parse(srcRaw); }
  catch (e) { node = math.parse(numToSrc(mp) + '*x+' + numToSrc(cp)); }
  return { kind: 'function', node, src: node.toString(), m: mObj, c: cObj, mTex: ratObjTex(mObj), cTex: ratObjTex(cObj), exact: (mObj instanceof Rat) && (cObj instanceof Rat) };
}
/* 纯平移（θ=0）：所有函数 g(x)=f(x+a)-b 精确 */
function translateExact(fn, aRat, bRat) {
  const inner = '(x+(' + aRat.toTeX() + '))';
  let composed;
  try { composed = composeNode(fn.expr, math.parse(inner)); } catch (e) { return null; }
  let expr = '(' + composed.toString() + ')';
  if (!bRat.isZero()) expr += '-(' + bRat.toTeX() + ')';
  let node;
  try { node = math.parse(expr); } catch (e) { return null; }
  let display = null;
  try { const r = math.rationalize(node); if (r && r.toString() !== node.toString()) display = r; } catch (e) {}
  if (!display) { try { const s = math.simplify(node, {}, math.simplify.realContext); if (s.toString() !== node.toString()) display = s; } catch (e) {} }
  return { kind: 'function', node, display: display || node, src: (display || node).toString() };
}
/* 非一次函数 + 旋转：参数曲线 (X(t), Y(t)) = R(-θ)(t-a, f(t)-b) */
function paramEquations(fn, thetaDeg, aRat, bRat) {
  const th = thetaDeg * PI / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  const aN = aRat ? aRat.toNumber() : 0, bN = bRat ? bRat.toNumber() : 0;
  const evalX = t => { const y = FRONTEND.evalFn(fn, t); if (!isFinite(y)) return NaN; return (t - aN) * cos + (y - bN) * sin; };
  const evalY = t => { const y = FRONTEND.evalFn(fn, t); if (!isFinite(y)) return NaN; return -(t - aN) * sin + (y - bN) * cos; };
  return { kind: 'parametric', evalX, evalY, thetaDeg, a: aN, b: bN, cos, sin };
}
function coordinateTransform(fn, cfg) {
  cfg = cfg || {};
  const thetaDeg = cfg.thetaDeg || 0;
  const aRat = cfg.a || new Rat(0n);
  const bRat = cfg.b || new Rat(0n);
  if (fn.piecewise) return { kind: 'unsupported', note: '分段函数暂不支持坐标系变换' };
  const lin = isLinear(fn.expr);
  if (lin.linear) return rotateLine(lin.m, lin.c, thetaDeg, aRat, bRat);
  if (Math.abs(thetaDeg) < 1e-9) return translateExact(fn, aRat, bRat);
  return paramEquations(fn, thetaDeg, aRat, bRat);
}

/* ================= 隐式方程 F(x,y)=0 与圆锥曲线 ================= */

/* 显式函数 y=f(x) → 隐式方程 y - f(x) = 0 */
function explicitImplicit(fn) {
  const evalF = (x, y) => { const v = FRONTEND.evalFn(fn, x, fn.params); return isFinite(v) ? (y - v) : NaN; };
  let tex;
  try { tex = 'y - \\left(' + FRONTEND.nodeToTex(fn.expr) + '\\right) = 0'; }
  catch (e) { tex = 'y - f(x) = 0'; }
  return { evalF, tex };
}

/* 隐式节点常数美化：0.5 → 1/2 等（有理数还原），无理数保持浮点 */
function beautifyImplicitNode(node) {
  return node.transform(nd => {
    if (nd.isConstantNode && typeof nd.value === 'number') {
      const v = nd.value;
      if (Number.isInteger(v)) return nd;
      const r = niceRatOrNumber(v);
      if (r instanceof Rat) return new math.ConstantNode(math.fraction(Number(r.n), Number(r.d)));
      return nd;
    }
    return nd;
  });
}

/* 旋转参数曲线 → 隐式方程（通用公式，无需消参）
   F(X,Y) = f(a + X·cosθ − Y·sinθ) − b − X·sinθ − Y·cosθ = 0 */
function paramImplicit(fn) {
  const th = fn.pcTheta * PI / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  const aN = fn.pcA ? fn.pcA.toNumber() : 0, bN = fn.pcB ? fn.pcB.toNumber() : 0;
  let srcNode;
  try { srcNode = math.parse(fn.pcSrcExpr); } catch (e) { return null; }
  if (fn.pcSrcParams) srcNode = substParamsExact(srcNode, fn.pcSrcParams);
  const cS = numToSrc(cos), sS = numToSrc(sin);
  const sub = nd => (nd.isSymbolNode && nd.name === 'x')
    ? math.parse('(' + numToSrc(aN) + '+X*(' + cS + ')-Y*(' + sS + '))')
    : nd;
  const inner = srcNode.transform(sub);
  let Fnode;
  try { Fnode = math.parse('(' + inner.toString() + ')-(' + numToSrc(bN) + ')-X*(' + sS + ')-Y*(' + cS + ')'); }
  catch (e) { return null; }
  let display = Fnode;
  try { const r = math.rationalize(Fnode); if (r && r.toString() !== Fnode.toString()) display = r; } catch (e) {}
  if (display === Fnode) { try { const s = math.simplify(Fnode, {}, math.simplify.realContext); if (s.toString() !== Fnode.toString()) display = s; } catch (e) {} }
  // 求值器：用数值节点（number 系数）求值，避免 Fraction 对象污染结果
  const compiled = display.compile();
  const evalF = (X, Y) => { try { const v = compiled.evaluate({ X: X, Y: Y }); return (typeof v === 'number' && isFinite(v)) ? v : NaN; } catch (e) { return NaN; } };
  // 展示：常数美化（有理数还原为分数），仅用于公式排版，不参与求值
  let tex;
  try {
    const pretty = beautifyImplicitNode(display);
    tex = FRONTEND.tweakTex(pretty.toTex({ parenthesis: 'auto' })) + ' = 0';
  } catch (e) { tex = 'F(X,Y) = 0'; }
  return { evalF, tex, node: display };
}

/* ---------- 圆锥曲线四类 ---------- */
function signedRatTex(r) { const s = r.sign() < 0 ? '-' : '+'; const a = r.abs(); if (a.isZero()) return ''; return s + a.toTeX(); }
const CONIC = {
  circle: {
    label: '圆',
    params: ['h', 'k', 'r'],
    generalTex: '(x-h)^2+(y-k)^2=r^2',
    paramDesc: { h: '圆心横坐标', k: '圆心纵坐标', r: '半径' },
    implicitEval: p => (x, y) => { const dx = x - p.h.toNumber(), dy = y - p.k.toNumber(); return dx * dx + dy * dy - p.r.toNumber() * p.r.toNumber(); },
    implicitTex: p => '(x' + signedRatTex(p.h) + ')^2+(y' + signedRatTex(p.k) + ')^2=' + p.r.toTeX() + '^2',
    paramSegs: p => [{ evalX: t => p.h.toNumber() + p.r.toNumber() * Math.cos(t), evalY: t => p.k.toNumber() + p.r.toNumber() * Math.sin(t) }],
    tRange: [0, TAU],
    paramTex: p => 'x=' + p.h.toTeX() + '+' + p.r.toTeX() + '\\cos t,\\; y=' + p.k.toTeX() + '+' + p.r.toTeX() + '\\sin t',
  },
  ellipse: {
    label: '椭圆',
    params: ['h', 'k', 'a', 'b'],
    generalTex: '\\frac{(x-h)^2}{a^2}+\\frac{(y-k)^2}{b^2}=1',
    paramDesc: { h: '中心横坐标', k: '中心纵坐标', a: '半长轴', b: '半短轴' },
    implicitEval: p => (x, y) => { const dx = (x - p.h.toNumber()) / p.a.toNumber(), dy = (y - p.k.toNumber()) / p.b.toNumber(); return dx * dx + dy * dy - 1; },
    implicitTex: p => '\\frac{(x' + signedRatTex(p.h) + ')^2}{' + p.a.toTeX() + '^2}+\\frac{(y' + signedRatTex(p.k) + ')^2}{' + p.b.toTeX() + '^2}=1',
    paramSegs: p => [{ evalX: t => p.h.toNumber() + p.a.toNumber() * Math.cos(t), evalY: t => p.k.toNumber() + p.b.toNumber() * Math.sin(t) }],
    tRange: [0, TAU],
    paramTex: p => 'x=' + p.h.toTeX() + '+' + p.a.toTeX() + '\\cos t,\\; y=' + p.k.toTeX() + '+' + p.b.toTeX() + '\\sin t',
  },
  hyperbola: {
    label: '双曲线',
    params: ['h', 'k', 'a', 'b'],
    generalTex: '\\frac{(x-h)^2}{a^2}-\\frac{(y-k)^2}{b^2}=1',
    paramDesc: { h: '中心横坐标', k: '中心纵坐标', a: '实半轴', b: '虚半轴' },
    implicitEval: p => (x, y) => { const dx = (x - p.h.toNumber()) / p.a.toNumber(), dy = (y - p.k.toNumber()) / p.b.toNumber(); return dx * dx - dy * dy - 1; },
    implicitTex: p => '\\frac{(x' + signedRatTex(p.h) + ')^2}{' + p.a.toTeX() + '^2}-\\frac{(y' + signedRatTex(p.k) + ')^2}{' + p.b.toTeX() + '^2}=1',
    paramSegs: p => [
      { evalX: t => p.h.toNumber() + p.a.toNumber() * Math.cosh(t), evalY: t => p.k.toNumber() + p.b.toNumber() * Math.sinh(t) },
      { evalX: t => p.h.toNumber() - p.a.toNumber() * Math.cosh(t), evalY: t => p.k.toNumber() + p.b.toNumber() * Math.sinh(t) },
    ],
    tRange: [-3, 3],
    paramTex: p => 'x=' + p.h.toTeX() + '\\pm' + p.a.toTeX() + '\\cosh t,\\; y=' + p.k.toTeX() + '+' + p.b.toTeX() + '\\sinh t',
  },
  parabola: {
    label: '抛物线',
    params: ['h', 'k', 'p'],
    generalTex: '(y-k)^2=4p(x-h)',
    paramDesc: { h: '顶点横坐标', k: '顶点纵坐标', p: '焦准距（正→开口向右，负→向左，|p| 越大越开阔）' },
    implicitEval: p => (x, y) => { const dy = y - p.k.toNumber(); return dy * dy - 4 * p.p.toNumber() * (x - p.h.toNumber()); },
    implicitTex: p => '(y' + signedRatTex(p.k) + ')^2=4' + (p.p.eq(new Rat(1n)) ? '' : p.p.toTeX()) + '(x' + signedRatTex(p.h) + ')',
    paramSegs: p => [{ evalX: t => p.h.toNumber() + (t * t) / (4 * p.p.toNumber()), evalY: t => p.k.toNumber() + t }],
    tRange: [-10, 10],
    paramTex: p => 'x=' + p.h.toTeX() + '+\\frac{t^2}{4' + (p.p.eq(new Rat(1n)) ? '' : p.p.toTeX()) + '},\\; y=' + p.k.toTeX() + '+t',
  },
};

/* 刷新圆锥曲线（活曲线：参数变化时重算隐式式与参数方程） */
function updateConic(fn) {
  const def = CONIC[fn.conicType];
  if (!def) return;
  const p = fn.conicParams;
  fn.implicitFn = def.implicitEval(p);
  fn.implicitTex = def.implicitTex(p);
  fn.paramSegs = def.paramSegs(p);
  fn.tRange = def.tRange;
  fn.paramTex = def.paramTex(p);
}
/* 构造圆锥曲线对象（不含 id/color，由 UI 层补） */
function buildConic(type, params) {
  if (!CONIC[type]) return null;
  const def = CONIC[type];
  const fn = {
    src: '圆锥曲线', name: null, var: 'x',
    expr: math.parse('0'), piecewise: false,
    params: params, paramOrder: def.params.slice(), paramRanges: {},
    visible: true, isDerived: false, derivedFrom: null, derivedLabel: null,
    implicit: true, conicType: type, conicParams: params,
  };
  for (const k of def.params) fn.paramRanges[k] = (k === 'h' || k === 'k') ? [-5, 5, 0.1] : [0.5, 5, 0.1];
  updateConic(fn);
  return fn;
}

/* ================= 分支显式化（比大小用） ================= */
function ratSrc(r) { return r.d === 1n ? r.n.toString() : '(' + r.n + '/' + r.d + ')'; }
function xSubRat(r) { if (r.isZero()) return 'x'; return '(x' + (r.sign() < 0 ? '+' : '-') + ratSrc(r.abs()) + ')'; }
function xSubTex(r) { if (r.isZero()) return 'x'; return '(x' + (r.sign() < 0 ? '+' : '-') + r.abs().toTeX() + ')'; }
function pow2Src(e) { return '(' + e + ')^2'; }
function pow2Tex(e) { return '\\left(' + e + '\\right)^2'; }

/* 构造含 √ 的显式支：y = A ± |B|·√(P(x))，node 供作差/求根，yAt 供求值/阴影 */
function makeRadicalBranch(label, tex, A, B, Pnode, domains, sign) {
  let node = null;
  const inner = Pnode.toString();
  let src;
  if (B.eq(new Rat(1n))) src = 'sqrt(' + inner + ')';
  else if (B.eq(new Rat(-1n))) src = '-sqrt(' + inner + ')';
  else src = ratSrc(B) + '*sqrt(' + inner + ')';
  if (!A.isZero()) src = ratSrc(A) + (src.charAt(0) === '-' ? src : '+' + src);
  try { node = math.parse(src); } catch (e) { node = null; }
  const yAt = x => { if (node && isFinite(x)) { const v = evalNodeWithParams(node, x, {}); return isFinite(v) ? v : NaN; } return NaN; };
  return { label, tex, A, B, P: Pnode, node, domains, yAt, radical: true, sign, sourceKind: 'conic' };
}

/* 支 y = A ± |B|·√(inner) 的 TeX（A=0 时省略 0，B=±1 时省略系数） */
function radicalTex(A, B, innerTex) {
  const rad = '\\sqrt{' + innerTex + '}';
  const sign = B.sign() < 0 ? '-' : '+';
  const Babs = B.abs();
  const tail = (Babs.eq(new Rat(1n)) ? '' : Babs.toTeX()) + rad;
  if (A.isZero()) return (sign === '-' ? '-' : '') + tail;
  return A.toTeX() + sign + tail;
}

/* 圆锥曲线 → 上下两支（精确 Rat 系数） */
function conicBranches(fn) {
  const p = fn.conicParams, t = fn.conicType;
  const h = p.h, k = p.k, hs = xSubRat(h);
  const branches = [];
  if (t === 'circle') {
    const r = p.r, r2 = r.mul(r);
    const P = math.parse(ratSrc(r2) + '-' + pow2Src(hs));
    const d = [[h.sub(r).toNumber(), h.add(r).toNumber()]];
    const inner = r.toTeX() + '^2-' + pow2Tex(xSubTex(h));
    branches.push(makeRadicalBranch('上半圆', radicalTex(k, new Rat(1n), inner), k, new Rat(1n), P, d, +1));
    branches.push(makeRadicalBranch('下半圆', radicalTex(k, new Rat(-1n), inner), k, new Rat(-1n), P, d, -1));
  } else if (t === 'ellipse') {
    const a = p.a, b = p.b, a2 = a.mul(a);
    const P = math.parse('1-' + pow2Src(hs) + '/' + ratSrc(a2));
    const d = [[h.sub(a).toNumber(), h.add(a).toNumber()]];
    const inner = '1-\\frac{' + pow2Tex(xSubTex(h)) + '}{' + a.toTeX() + '^2}';
    branches.push(makeRadicalBranch('椭圆·上支', radicalTex(k, b, inner), k, b, P, d, +1));
    branches.push(makeRadicalBranch('椭圆·下支', radicalTex(k, b.neg(), inner), k, b.neg(), P, d, -1));
  } else if (t === 'hyperbola') {
    const a = p.a, b = p.b, a2 = a.mul(a);
    const P = math.parse(pow2Src(hs) + '/' + ratSrc(a2) + '-1');
    const d = [[-Infinity, h.sub(a).toNumber()], [h.add(a).toNumber(), Infinity]];
    const inner = '\\frac{' + pow2Tex(xSubTex(h)) + '}{' + a.toTeX() + '^2}-1';
    branches.push(makeRadicalBranch('双曲线·上支', radicalTex(k, b, inner), k, b, P, d, +1));
    branches.push(makeRadicalBranch('双曲线·下支', radicalTex(k, b.neg(), inner), k, b.neg(), P, d, -1));
  } else if (t === 'parabola') {
    const pp = p.p;
    const P = math.parse(ratSrc(pp) + '*' + hs);
    const d = pp.sign() > 0 ? [[h.toNumber(), Infinity]] : [[-Infinity, h.toNumber()]];
    const inner = pp.toTeX() + xSubTex(h);
    branches.push(makeRadicalBranch('抛物线·上支', radicalTex(k, new Rat(2n), inner), k, new Rat(2n), P, d, +1));
    branches.push(makeRadicalBranch('抛物线·下支', radicalTex(k, new Rat(-2n), inner), k, new Rat(-2n), P, d, -1));
  }
  return branches;
}

/* 数值扫描求根（对任意函数 f(x)，返回根的 number 数组） */
function scanRoots(f, lo, hi, n) {
  n = n || 2000;
  if (!isFinite(lo) || !isFinite(hi) || lo >= hi) return [];
  const step = (hi - lo) / n;
  const brackets = [];
  let px = lo, py = f(lo);
  for (let i = 1; i <= n; i++) {
    const x = lo + i * step, y = f(x);
    if (isNaN(y)) { px = x; py = NaN; continue; }
    if (!isNaN(py)) {
      if (py === 0) brackets.push([px, px]);
      else if (py * y < 0) brackets.push([px, x]);
    }
    px = x; py = y;
  }
  const roots = [];
  for (const [a, b] of brackets) roots.push(a === b ? a : brent(f, a, b));
  return dedupe(roots, 1e-7);
}

/* 参数曲线按 X(t) 单调段切分 */
function paramMonotonicSegments(fn, range) {
  range = range || [-20, 20];
  const th = fn.pcTheta * PI / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  let srcNode;
  try { srcNode = math.parse(fn.pcSrcExpr); } catch (e) { return []; }
  if (fn.pcSrcParams) srcNode = substParamsExact(srcNode, fn.pcSrcParams);
  const d = derivativeOf(srcNode, fn.pcSrcParams || {});
  const dNode = d && d.kind !== 'piecewise' ? d : null;
  const dXdt = t => {
    let fprime = 0;
    if (dNode) { try { fprime = dNode.compile().evaluate({ x: t }); } catch (e) { fprime = 0; } }
    if (!isFinite(fprime)) fprime = 0;
    return cos + fprime * sin;
  };
  const roots = scanRoots(dXdt, range[0], range[1], 2000);
  const pts = [range[0], ...roots, range[1]].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const tLo = pts[i], tHi = pts[i + 1];
    if (tHi - tLo < 1e-6) continue;
    const xLo = fn.evalX(tLo), xHi = fn.evalX(tHi);
    if (!isFinite(xLo) || !isFinite(xHi)) continue;
    segs.push({ tLo, tHi, xLo, xHi, increasing: xHi > xLo });
  }
  return segs;
}
/* 数值反解 t = X⁻¹(x)（在单调段 [tLo,tHi] 内二分） */
function invertParamX(fn, x, seg) {
  let lo = seg.tLo, hi = seg.tHi;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const xm = fn.evalX(mid);
    if (!isFinite(xm)) return NaN;
    if (seg.increasing) { if (xm < x) lo = mid; else hi = mid; }
    else { if (xm > x) lo = mid; else hi = mid; }
  }
  return (lo + hi) / 2;
}
function paramBranches(fn, range) {
  const segs = paramMonotonicSegments(fn, range);
  return segs.map((seg, i) => {
    const xlo = Math.min(seg.xLo, seg.xHi), xhi = Math.max(seg.xLo, seg.xHi);
    const label = '参数曲线·第' + (i + 1) + '段';
    const yAt = x => {
      if (!isFinite(x) || x < xlo - 1e-9 || x > xhi + 1e-9) return NaN;
      const t = invertParamX(fn, x, seg);
      if (!isFinite(t)) return NaN;
      const y = fn.evalY(t);
      return isFinite(y) ? y : NaN;
    };
    return { label, tex: null, A: null, B: null, P: null, node: null, domains: [[xlo, xhi]], yAt, radical: false, sign: 0, sourceKind: 'parametric' };
  });
}

/* 显式化入口：任意曲线 → 若干 y=f(x) 分支 */
function explicitBranches(fn) {
  if (fn.implicit && fn.conicType) {
    const branches = conicBranches(fn);
    return { branches, note: null };
  }
  if (fn.parametric) {
    const branches = paramBranches(fn);
    return { branches, note: branches.length ? null : '参数曲线无法拆分为 y=f(x) 分支' };
  }
  if (fn.implicit) return { branches: [], note: '一般隐式方程暂不支持比大小' };
  const dom = analyzeDomain(fn);
  const branch = {
    label: fn.name || 'f', tex: 'y=' + FRONTEND.nodeToTex(fn.expr),
    A: null, B: null, P: null, node: fn.expr,
    domains: (dom.intervals || []).map(iv => [iv.lo, iv.hi]),
    yAt: x => FRONTEND.evalFn(fn, x), radical: false, sign: 0, sourceKind: 'explicit',
  };
  return { branches: [branch], note: null };
}

/* 无理方程求解：支 y=A+B·√(P(x)) 与多项式 g(x) 的零点
   移项 → 平方 → 多项式 → 求根 → 验根（√ 定义域 + 符号 + 回代） */
function solveRadicalEquation(branch, gNode, gParams, range) {
  range = range || [-20, 20];
  const g = gParams ? substParamsExact(gNode, gParams) : gNode;
  const gpc = polyCoeffsExact(g);
  if (!gpc || !branch.radical || !branch.P) return null;
  const A = branch.A, B = branch.B, P = branch.P;
  let lhs, gma;
  try {
    gma = math.parse('(' + g.toString() + ')-(' + ratSrc(A) + ')');
    lhs = math.parse('(' + ratSrc(B.mul(B)) + ')*(' + P.toString() + ')-(' + gma.toString() + ')^2');
  } catch (e) { return null; }
  const pc = polyCoeffsExact(lhs);
  if (!pc) return null;
  const deg = polyDegree(pc);
  let roots, exact;
  if (deg <= 2) {
    const fr = findRoots(lhs, null, range);
    roots = fr.roots; exact = true;
  } else {
    const numeric = numericRoots(lhs, range);
    roots = numeric.map(x => ({ x, tex: fmtNum(x), exact: false })); exact = false;
  }
  const gEval = x => evalNodeWithParams(g, x, {});
  const valid = [];
  for (const o of roots) {
    const x = o.x;
    const pv = evalNodeWithParams(P, x, {});
    if (!isFinite(pv) || pv < -1e-7) continue;
    const gv = gEval(x);
    if (!isFinite(gv)) continue;
    if ((gv - A.toNumber()) * B.toNumber() < -1e-6) continue;
    const bv = A.toNumber() + B.toNumber() * Math.sqrt(Math.max(0, pv));
    if (Math.abs(bv - gv) > 1e-6) continue;
    valid.push(o);
  }
  return { roots: valid, exact, equation: lhs, gMinusA: gma };
}

/* ============================================================
 * 微积分：符号积分引擎 · n 阶导 · n 重积分 · 定积分 · 隐函数求导
 * ============================================================ */

/* ---------- 多项式辅助（TeX / src 字符串） ---------- */
function polyToTeX(pc) {
  const terms = [];
  for (let i = pc.length - 1; i >= 0; i--) {
    const c = pc[i];
    if (c.isZero()) continue;
    if (i === 0) terms.push(c.toTeX());
    else if (i === 1) terms.push((c.eq(new Rat(1n)) ? '' : c.eq(new Rat(-1n)) ? '-' : c.toTeX()) + 'x');
    else terms.push((c.eq(new Rat(1n)) ? '' : c.eq(new Rat(-1n)) ? '-' : c.toTeX()) + 'x^{' + i + '}');
  }
  if (!terms.length) return '0';
  return terms.join('+').replace(/\+\-/g, '-');
}
function polyToSrc(pc) {
  const terms = [];
  for (let i = 0; i < pc.length; i++) {
    const c = pc[i];
    if (c.isZero()) continue;
    const coef = ratSrc(c);
    if (i === 0) terms.push(coef);
    else if (i === 1) terms.push(c.eq(new Rat(1n)) ? 'x' : c.eq(new Rat(-1n)) ? '-x' : coef + '*x');
    else terms.push(c.eq(new Rat(1n)) ? 'x^' + i : c.eq(new Rat(-1n)) ? '-x^' + i : coef + '*x^' + i);
  }
  if (!terms.length) return '0';
  return terms.join('+').replace(/\+\-/g, '-');
}
function termMonoTeX(c, i) {
  if (i === 0) return c.toTeX();
  const cs = c.eq(new Rat(1n)) ? '' : c.eq(new Rat(-1n)) ? '-' : c.toTeX();
  return cs + (i === 1 ? 'x' : 'x^{' + i + '}');
}
function mulRatSrc(c, expr) {
  if (c.eq(new Rat(1n))) return expr;
  if (c.eq(new Rat(-1n))) return '-(' + expr + ')';
  return ratSrc(c) + '*(' + expr + ')';
}
function ratPow(r) { return r.d === 1n ? r.n.toString() : '(' + r.n + '/' + r.d + ')'; }
function addNodes(parts) {
  if (!parts.length) return math.parse('0');
  if (parts.length === 1) return parts[0];
  return math.parse(parts.map(p => '(' + p.toString() + ')').join('+'));
}
function negNode(node) { return math.parse('-(' + node.toString() + ')'); }
function powRatInt(r, n) {
  let acc = new Rat(1n);
  const nn = Math.abs(n);
  for (let i = 0; i < nn; i++) acc = acc.mul(r);
  if (n < 0) acc = new Rat(1n).div(acc);
  return acc;
}
function fallingFactorial(i, n) { let r = 1n; for (let k = 0; k < n; k++) r *= BigInt(i - k); return r; }
function risingFactorial(k, n) { let r = 1n; for (let i = 0; i < n; i++) r *= BigInt(k + i); return r; }
/* 检测 ax+b 线性内层，返回 {a,b}（Rat）或 null */
function matchLinearInner(node) {
  const pc = polyCoeffsExact(node);
  if (!pc || pc.length > 2) return null;
  if (pc.length === 1) return { a: new Rat(0n), b: pc[0] };
  return { a: pc[1], b: pc[0] };
}
/* 检测 c·g(ax+b)，g∈{sin,cos,exp}，返回 {name,a,b,c,inner} 或 null */
function matchSimpleFn(node) {
  if (node.isFunctionNode) {
    const name = node.fn.name || node.fn;
    if (['sin', 'cos', 'exp'].includes(name)) {
      const lin = matchLinearInner(node.args[0]);
      if (!lin) return null;
      return { name, a: lin.a, b: lin.b, c: new Rat(1n), inner: node.args[0] };
    }
    return null;
  }
  if (node.fn === 'unaryMinus') {
    const r = matchSimpleFn(node.args[0]);
    return r ? { name: r.name, a: r.a, b: r.b, c: r.c.neg(), inner: r.inner } : null;
  }
  if (node.isOperatorNode && node.op === '*') {
    let c = new Rat(1n), fn = null;
    for (const a of node.args) {
      const apc = polyCoeffsExact(a);
      if (apc && apc.length === 1) c = c.mul(apc[0]);
      else if (!fn && a.isFunctionNode) fn = a;
      else return null;
    }
    if (!fn) return null;
    const name = fn.fn.name || fn.fn;
    if (!['sin', 'cos', 'exp'].includes(name)) return null;
    const lin = matchLinearInner(fn.args[0]);
    if (!lin) return null;
    return { name, a: lin.a, b: lin.b, c, inner: fn.args[0] };
  }
  return null;
}

/* ---------- 符号积分 ---------- */
function integratePoly(pc) {
  const out = new Array(pc.length + 1).fill(null).map(() => new Rat(0n));
  const steps = [];
  for (let i = 0; i < pc.length; i++) {
    const c = pc[i];
    if (c.isZero()) continue;
    const e = i + 1;
    out[e] = c.div(new Rat(BigInt(e), 1n));
    steps.push({ rule: '幂法则', before: '\\int ' + termMonoTeX(c, i) + '\\,dx', after: termMonoTeX(out[e], e), justification: '\\int x^n dx=\\frac{x^{n+1}}{n+1}' });
  }
  const trimmed = trimPoly(out);
  let node = null;
  try { node = math.parse(polyToSrc(trimmed)); } catch (e) { node = null; }
  if (!node) return null;
  return { node, tex: polyToTeX(trimmed), steps };
}
function powerIntegral(exp) {
  if (exp.eq(new Rat(-1n))) {
    const n2 = math.parse('log(abs(x))');
    return { node: n2, tex: '\\ln|x|', steps: [{ rule: '特殊幂', before: '\\int x^{-1}dx', after: '\\ln|x|', justification: '\\int x^{-1}dx=\\ln|x|' }] };
  }
  const e1 = exp.add(new Rat(1n));
  const coef = new Rat(1n).div(e1);
  let src = e1.eq(new Rat(1n)) ? mulRatSrc(coef, 'x') : mulRatSrc(coef, 'x^' + ratPow(e1));
  let node = null;
  try { node = math.parse(src); } catch (e) { node = null; }
  if (!node) return null;
  const ctex = coef.eq(new Rat(1n)) ? '' : coef.eq(new Rat(-1n)) ? '-' : coef.toTeX();
  const xtex = e1.eq(new Rat(1n)) ? 'x' : 'x^{' + e1.toTeX() + '}';
  const tex = ctex + xtex;
  return { node, tex, steps: [{ rule: '幂法则', before: '\\int x^{' + exp.toTeX() + '}dx', after: tex, justification: '\\int x^n dx=\\frac{x^{n+1}}{n+1}\\;(n\\neq -1)' }] };
}
function basicFunctionIntegral(node) {
  const name = node.fn.name || node.fn;
  const inner = node.args[0];
  const lin = matchLinearInner(inner);
  const innerTex = FRONTEND.nodeToTex(inner);
  if (name === 'sin' || name === 'cos' || name === 'exp') {
    if (!lin) return null;
    if (lin.a.isZero()) {
      const src = name + '(' + ratSrc(lin.b) + ')*x';
      let n2 = null; try { n2 = math.parse(src); } catch (e) {}
      if (!n2) return null;
      return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: [{ rule: '常数法则', before: '\\int ' + name + '(' + lin.b.toTeX() + ')\\,dx', after: name + '(' + lin.b.toTeX() + ')x', justification: '被积函数为常数' }] };
    }
    const a = lin.a;
    let coef, fname, after;
    if (name === 'sin') { coef = new Rat(-1n).div(a); fname = 'cos'; after = '-\\frac{1}{' + a.toTeX() + '}\\cos(' + innerTex + ')'; }
    else if (name === 'cos') { coef = new Rat(1n).div(a); fname = 'sin'; after = '\\frac{1}{' + a.toTeX() + '}\\sin(' + innerTex + ')'; }
    else { coef = new Rat(1n).div(a); fname = 'exp'; after = '\\frac{1}{' + a.toTeX() + '}e^{' + innerTex + '}'; }
    const src = mulRatSrc(coef, fname + '(' + inner.toString() + ')');
    let n2 = null; try { n2 = math.parse(src); } catch (e) {}
    if (!n2) return null;
    const just = name === 'sin' ? '\\int\\sin(ax+b)dx=-\\frac{1}{a}\\cos(ax+b)' : name === 'cos' ? '\\int\\cos(ax+b)dx=\\frac{1}{a}\\sin(ax+b)' : '\\int e^{ax+b}dx=\\frac{1}{a}e^{ax+b}';
    return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: [{ rule: '基本公式', before: '\\int ' + name + '(' + innerTex + ')\\,dx', after, justification: just }] };
  }
  if (name === 'sqrt') {
    if (!lin || lin.a.isZero()) return null;
    const a = lin.a;
    const coef = new Rat(2n).div(a.mul(new Rat(3n)));
    const src = mulRatSrc(coef, '(' + inner.toString() + ')^(3/2)');
    let n2 = null; try { n2 = math.parse(src); } catch (e) {}
    if (!n2) return null;
    return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: [{ rule: '幂法则(换元)', before: '\\int\\sqrt{' + innerTex + '}\\,dx', after: '\\frac{2}{3' + a.toTeX() + '}(' + innerTex + ')^{3/2}', justification: '\\int(ax+b)^{1/2}dx=\\frac{2}{3a}(ax+b)^{3/2}' }] };
  }
  if (name === 'log') {
    if (inner.isSymbolNode && inner.name === 'x') {
      const src = 'x*log(x)-x';
      let n2 = null; try { n2 = math.parse(src); } catch (e) {}
      if (!n2) return null;
      return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: [{ rule: '分部积分', before: '\\int\\ln x\\,dx', after: 'x\\ln x-x', justification: '\\int\\ln x\\,dx=x\\ln x-x+C' }] };
    }
    return null;
  }
  return null;
}
function byPartsIntegral(node) {
  if (!node.isOperatorNode || node.op !== '*') return null;
  let xSeen = false, fn = null, coef = new Rat(1n);
  for (const a of node.args) {
    if (a.isSymbolNode && a.name === 'x') { xSeen = true; continue; }
    const apc = polyCoeffsExact(a);
    if (apc && apc.length === 1) { coef = coef.mul(apc[0]); continue; }
    if (a.isFunctionNode && !fn) { fn = a; continue; }
    return null;
  }
  if (!xSeen || !fn) return null;
  const name = fn.fn.name || fn.fn;
  const lin = matchLinearInner(fn.args[0]);
  if (!lin || lin.a.isZero()) return null;
  const a = lin.a;
  const innerSrc = fn.args[0].toString();
  const innerTex = FRONTEND.nodeToTex(fn.args[0]);
  const a2 = a.mul(a);
  let src = null, after = null, just = null;
  if (name === 'exp') {
    src = 'exp(' + innerSrc + ')*(' + ratSrc(a) + '*x-1)/' + ratSrc(a2);
    after = '\\frac{e^{' + innerTex + '}(' + a.toTeX() + 'x-1)}{' + a2.toTeX() + '}';
    just = '\\int x e^{ax+b}dx=\\frac{e^{ax+b}(ax-1)}{a^2}';
  } else if (name === 'sin') {
    src = '(sin(' + innerSrc + ')-' + ratSrc(a) + '*x*cos(' + innerSrc + '))/' + ratSrc(a2);
    after = '\\frac{\\sin(' + innerTex + ')-' + a.toTeX() + 'x\\cos(' + innerTex + ')}{' + a2.toTeX() + '}';
    just = '\\int x\\sin(ax+b)dx=\\frac{\\sin(ax+b)-ax\\cos(ax+b)}{a^2}';
  } else if (name === 'cos') {
    src = '(cos(' + innerSrc + ')+' + ratSrc(a) + '*x*sin(' + innerSrc + '))/' + ratSrc(a2);
    after = '\\frac{\\cos(' + innerTex + ')+' + a.toTeX() + 'x\\sin(' + innerTex + ')}{' + a2.toTeX() + '}';
    just = '\\int x\\cos(ax+b)dx=\\frac{\\cos(ax+b)+ax\\sin(ax+b)}{a^2}';
  } else if (name === 'log' && fn.args[0].isSymbolNode && fn.args[0].name === 'x') {
    src = 'x^2*(2*log(x)-1)/4';
    after = '\\frac{x^2(2\\ln x-1)}{4}';
    just = '\\int x\\ln x\\,dx=\\frac{x^2(2\\ln x-1)}{4}';
  } else return null;
  let n2 = null; try { n2 = math.parse(src); } catch (e) {}
  if (!n2) return null;
  if (!coef.eq(new Rat(1n))) { n2 = math.parse(mulRatSrc(coef, '(' + n2.toString() + ')')); after = coef.toTeX() + '\\left(' + after + '\\right)'; }
  return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: [{ rule: '分部积分', before: '\\int x\\,' + name + '(' + innerTex + ')\\,dx', after, justification: just }] };
}
/* ---------- 有理函数积分（部分分式） ---------- */
function polyDiv(num, den) {
  // Rat[] 长除法（低次到高次），返回 {quot, rem}；den 须非零多项式
  let rem = trimPoly(num.slice());
  const ddeg = polyDegree(den);
  const qdeg = polyDegree(rem) - ddeg;
  if (qdeg < 0) return { quot: [new Rat(0n)], rem };
  const quot = new Array(qdeg + 1).fill(new Rat(0n));
  while (polyDegree(rem) >= ddeg && !(rem.length === 1 && rem[0].isZero())) {
    const rdeg = polyDegree(rem);
    const i = rdeg - ddeg;
    const coef = rem[rdeg].div(den[ddeg]);
    quot[i] = coef;
    for (let j = 0; j <= ddeg; j++) rem[i + j] = rem[i + j].sub(den[j].mul(coef));
    rem = trimPoly(rem);
  }
  return { quot: trimPoly(quot), rem };
}
function solveLinear(A, b) {
  // A: Rat[][] n×n，b: Rat[] n；高斯-约当消元，返回 Rat[] 或 null（奇异）
  const n = b.length;
  const M = [];
  for (let i = 0; i < n; i++) M.push(A[i].concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = -1;
    for (let r = col; r < n; r++) if (!M[r][col].isZero()) { piv = r; break; }
    if (piv < 0) return null;
    if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
    const pv = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col].div(pv);
      if (f.isZero()) continue;
      for (let c = col; c <= n; c++) M[r][c] = M[r][c].sub(M[col][c].mul(f));
    }
  }
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n].div(M[i][i]);
  return x;
}
function xPlusSrc(r) { return r.isZero() ? 'x' : 'x' + (r.sign() < 0 ? '-' : '+') + ratSrc(r.abs()); }
function xPlusTeX(r) { return r.isZero() ? 'x' : 'x' + (r.sign() < 0 ? '-' : '+') + r.abs().toTeX(); }
function mulRatTeX(c, expr) {
  if (c.eq(new Rat(1n))) return expr;
  if (c.eq(new Rat(-1n))) return '-' + expr;
  if (c.sign() < 0) return '-' + mulRatTeX(c.neg(), expr);
  return c.toTeX() + '\\left(' + expr + '\\right)';
}
function integrateQuadraticTerm(p, q, B, C) {
  // ∫ (Bx+C)/(x²+px+q) dx，判别式 < 0；返回 {parts:[{node,tex}], steps:[...]} 或 null
  const half = p.div(new Rat(2n));
  const aSq = q.sub(half.mul(half)); // > 0
  const B2 = B.div(new Rat(2n));
  const K = C.sub(B.mul(half)); // C − B·p/2
  const qTex = polyToTeX([q, p, new Rat(1n)]);
  const qSrc = polyToSrc([q, p, new Rat(1n)]);
  const parts = [], steps = [];
  if (!B2.isZero()) {
    const src = mulRatSrc(B2, 'log(abs(' + qSrc + '))');
    let nd = null; try { nd = math.parse(src); } catch (e) {}
    if (!nd) return null;
    parts.push({ node: nd, tex: mulRatTeX(B2, '\\ln|' + qTex + '|') });
    steps.push({ rule: '对数项', before: '\\int\\frac{' + B.toTeX() + 'x+' + C.toTeX() + '}{' + qTex + '}dx\\;(对数部分)', after: mulRatTeX(B2, '\\ln|' + qTex + '|'), justification: "\\int\\frac{u'}{u}dx=\\ln|u|" });
  }
  if (!K.isZero()) {
    const sq = isPerfectSquareRat(aSq);
    let aSrc, aTex;
    if (sq) { aSrc = ratSrc(sq); aTex = sq.toTeX(); }
    else { const s = surdOfRat(aSq); aSrc = mulRatSrc(s.coef, 'sqrt(' + s.radicand + ')'); aTex = (s.coef.eq(new Rat(1n)) ? '' : s.coef.toTeX()) + '\\sqrt{' + s.radicand + '}'; }
    let argSrc, argTex;
    if (sq && sq.eq(new Rat(1n))) { argSrc = xPlusSrc(half); argTex = xPlusTeX(half); }
    else { argSrc = '(' + xPlusSrc(half) + ')/(' + aSrc + ')'; argTex = '\\frac{' + xPlusTeX(half) + '}{' + aTex + '}'; }
    let coefSrc, coefTex;
    if (sq) {
      const c = K.div(sq);
      coefSrc = ratSrc(c);
      coefTex = (c.eq(new Rat(1n)) ? '' : c.eq(new Rat(-1n)) ? '-' : c.toTeX());
    } else {
      coefSrc = ratSrc(K) + '/(' + aSrc + ')';
      coefTex = '\\frac{' + K.toTeX() + '}{' + aTex + '}';
    }
    const src = (coefSrc === '1' ? '' : '(' + coefSrc + ')*') + 'atan(' + argSrc + ')';
    let nd = null; try { nd = math.parse(src); } catch (e) {}
    if (!nd) return null;
    const texTail = '\\arctan\\left(' + argTex + '\\right)';
    parts.push({ node: nd, tex: coefTex + texTail });
    steps.push({ rule: '反正切项', before: '\\int\\frac{' + K.toTeX() + '}{' + qTex + '}dx', after: coefTex + texTail, justification: '\\int\\frac{dx}{u^2+a^2}=\\frac{1}{a}\\arctan\\frac{u}{a}' });
  }
  return { parts, steps };
}
function integrateRational(node) {
  // ∫ P(x)/Q(x) dx：长除法 + 部分分式（一次因式任意重数、不可约二次 m=1）
  const num = polyCoeffsExact(node.args[0]);
  const den = polyCoeffsExact(node.args[1]);
  if (!num || !den) return null;
  const numM = trimPoly(num), denM = trimPoly(den);
  const dd = polyDegree(denM);
  if (dd < 1) return null;
  const steps = [];
  // 1) 长除法（假分式）
  let quot = [new Rat(0n)], rem = numM;
  if (polyDegree(numM) >= dd) {
    const d = polyDiv(numM, denM);
    quot = d.quot; rem = d.rem;
    steps.push({ rule: '长除法', before: '\\frac{' + polyToTeX(numM) + '}{' + polyToTeX(denM) + '}', after: polyToTeX(quot) + ' + \\frac{' + polyToTeX(rem) + '}{' + polyToTeX(denM) + '}', justification: '\\deg P\\ge\\deg Q：先化为「商 + 真分式」' });
  }
  // 2) 归一化分母 + 因式分解
  const lc = denM[dd];
  const monic = denM.map(c => c.div(lc));
  const remS = trimPoly(rem.map(c => c.div(lc)));
  const fac = factorPolynomial(monic);
  const linByRoot = new Map();
  for (const r of fac.factors) {
    const key = r.n + '/' + r.d;
    if (!linByRoot.has(key)) linByRoot.set(key, { r, mult: 0 });
    linByRoot.get(key).mult++;
  }
  const remFac = trimPoly(fac.remainder);
  const remDeg = polyDegree(remFac);
  let quad = null;
  if (remDeg === 2) {
    const p = remFac[1], q = remFac[0];
    const disc = p.mul(p).sub(q.mul(new Rat(4n)));
    if (disc.sign() < 0) quad = { p, q };
    else return null; // 有实根但非有理（无理根）→ 优雅拒绝
  } else if (remDeg !== 0) {
    return null; // 高次不可约 → 优雅拒绝
  }
  // 因式分解 TeX
  let denFact = '';
  for (const [, g] of linByRoot) {
    const t = xPlusTeX(g.r.neg());
    denFact += (denFact ? '\\cdot ' : '') + (g.mult === 1 ? '(' + t + ')' : '(' + t + ')^{' + g.mult + '}');
  }
  if (quad) denFact += (denFact ? '\\cdot ' : '') + '(' + polyToTeX([quad.q, quad.p, new Rat(1n)]) + ')';
  if (!denFact) denFact = '1';
  steps.push({ rule: '因式分解', before: '\\frac{' + polyToTeX(remS) + '}{' + polyToTeX(monic) + '}', after: '\\frac{' + polyToTeX(remS) + '}{' + denFact + '}', justification: '分母分解为一次因式（可重）与不可约二次因式' });
  // 3) 部分分式（待定系数）
  const termDefs = [];
  for (const [, g] of linByRoot) for (let k = 1; k <= g.mult; k++) termDefs.push({ kind: 'lin', r: g.r, k });
  if (quad) termDefs.push({ kind: 'quad', p: quad.p, q: quad.q });
  const qis = [];
  for (const t of termDefs) {
    let Dp;
    if (t.kind === 'lin') {
      let dp = [new Rat(1n)];
      const lp = [t.r.neg(), new Rat(1n)];
      for (let j = 0; j < t.k; j++) dp = mulPoly(dp, lp);
      Dp = dp;
    } else Dp = [t.q, t.p, new Rat(1n)];
    qis.push(polyDiv(monic, Dp).quot);
  }
  const bases = [];
  for (let i = 0; i < termDefs.length; i++) {
    if (termDefs[i].kind === 'lin') bases.push(qis[i]);
    else { bases.push(mulPoly([new Rat(0n), new Rat(1n)], qis[i])); bases.push(qis[i]); }
  }
  const nu = bases.length;
  const A = [], b = [];
  for (let k = 0; k < nu; k++) {
    const row = [];
    for (let j = 0; j < nu; j++) row.push(bases[j][k] || new Rat(0n));
    A.push(row); b.push(remS[k] || new Rat(0n));
  }
  const coeffs = solveLinear(A, b);
  if (!coeffs) return null;
  // 部分分式 TeX
  let pf = '';
  let ci = 0;
  for (const t of termDefs) {
    if (t.kind === 'lin') {
      const c = coeffs[ci++];
      if (c.isZero()) continue;
      const linTex = xPlusTeX(t.r.neg());
      pf += (pf ? '+' : '') + '\\frac{' + c.toTeX() + '}{' + (t.k === 1 ? linTex : '(' + linTex + ')^{' + t.k + '}') + '}';
    } else {
      const Bc = coeffs[ci++], Cc = coeffs[ci++];
      if (Bc.isZero() && Cc.isZero()) continue;
      const qTex = polyToTeX([t.q, t.p, new Rat(1n)]);
      pf += (pf ? '+' : '') + '\\frac{' + Bc.toTeX() + 'x+' + Cc.toTeX() + '}{' + qTex + '}';
    }
  }
  pf = pf.replace(/\+\-/g, '-');
  steps.push({ rule: '部分分式', before: '\\frac{' + polyToTeX(remS) + '}{' + polyToTeX(monic) + '}', after: pf, justification: '待定系数法：通分后对比分子系数' });
  // 4) 逐项积分
  const parts = [];
  if (!(quot.length === 1 && quot[0].isZero())) {
    const qi = integratePoly(quot);
    if (!qi) return null;
    parts.push({ node: qi.node, tex: qi.tex });
  }
  ci = 0;
  for (const t of termDefs) {
    if (t.kind === 'lin') {
      const c = coeffs[ci++];
      if (c.isZero()) continue;
      const r = t.r, k = t.k;
      const linSrc = xPlusSrc(r.neg());
      const linTex = xPlusTeX(r.neg());
      if (k === 1) {
        const src = mulRatSrc(c, 'log(abs(' + linSrc + '))');
        let nd = null; try { nd = math.parse(src); } catch (e) {}
        if (!nd) return null;
        parts.push({ node: nd, tex: mulRatTeX(c, '\\ln|' + linTex + '|') });
        steps.push({ rule: '对数项', before: '\\int\\frac{' + c.toTeX() + '}{' + linTex + '}dx', after: mulRatTeX(c, '\\ln|' + linTex + '|'), justification: '\\int\\frac{dx}{x-a}=\\ln|x-a|' });
      } else {
        const e2 = new Rat(1n - BigInt(k));
        const coef = c.div(e2);
        const src = mulRatSrc(coef, '(' + linSrc + ')^(' + ratPow(e2) + ')');
        let nd = null; try { nd = math.parse(src); } catch (e) {}
        if (!nd) return null;
        parts.push({ node: nd, tex: mulRatTeX(coef, '(' + linTex + ')^{' + e2.toTeX() + '}') });
        steps.push({ rule: '幂项', before: '\\int\\frac{' + c.toTeX() + '}{(' + linTex + ')^' + k + '}dx', after: mulRatTeX(coef, '(' + linTex + ')^{' + e2.toTeX() + '}'), justification: '\\int\\frac{dx}{(x-a)^k}=\\frac{(x-a)^{1-k}}{1-k}\\;(k>1)' });
      }
    } else {
      const Bc = coeffs[ci++], Cc = coeffs[ci++];
      if (Bc.isZero() && Cc.isZero()) continue;
      const res = integrateQuadraticTerm(t.p, t.q, Bc, Cc);
      if (!res) return null;
      for (const pr of res.parts) parts.push(pr);
      for (const s of res.steps) steps.push(s);
    }
  }
  if (!parts.length) return null;
  const nodeSum = addNodes(parts.map(p => p.node));
  const texSum = parts.map(p => p.tex).join('+').replace(/\+\-/g, '-');
  return { node: nodeSum, tex: texSum, steps };
}

/* ---------- 乘积三角积分（积化和差 / 降幂） ---------- */
function matchTrigPower(a) {
  if (a.isFunctionNode) {
    const name = a.fn.name || a.fn;
    if (['sin', 'cos'].includes(name)) {
      const lin = matchLinearInner(a.args[0]);
      if (lin) return { name, a: lin.a, b: lin.b, pow: 1 };
    }
    return null;
  }
  if (a.isOperatorNode && a.op === '^') {
    const base = a.args[0];
    if (base.isFunctionNode && ['sin', 'cos'].includes(base.fn.name || base.fn)) {
      const lin = matchLinearInner(base.args[0]);
      const e = constToRat(a.args[1].value);
      if (lin && e && e.isInt() && e.n >= 0n && e.n <= 2n) return { name: base.fn.name, a: lin.a, b: lin.b, pow: Number(e.n) };
    }
  }
  return null;
}
function trigTex(t) { return '\\' + t.name + '(' + polyToTeX([t.b, t.a]) + ')'; }
function integrateLinearTrig(name, k, c, coef) {
  // ∫ coef·name(kx+c) dx；k=0 且为 sin(0) 时返回 null（零项，省略）
  const inner = polyToSrc([c, k]);
  const innerTex = polyToTeX([c, k]);
  if (k.isZero()) {
    if (c.isZero()) {
      if (name === 'sin') return null; // sin(0)=0 → 整项为 0
      const src = mulRatSrc(coef, 'x');
      let nd = null; try { nd = math.parse(src); } catch (e) {}
      if (!nd) return null;
      return { node: nd, tex: mulRatTeX(coef, 'x') };
    }
    const src = mulRatSrc(coef, name + '(' + ratSrc(c) + ')*x');
    let nd = null; try { nd = math.parse(src); } catch (e) {}
    if (!nd) return null;
    return { node: nd, tex: mulRatTeX(coef, '\\' + name + '(' + c.toTeX() + ')\\,x') };
  }
  const ck = coef.div(k);
  const outName = name === 'sin' ? 'cos' : 'sin';
  const outCoef = name === 'sin' ? ck.neg() : ck;
  const src = mulRatSrc(outCoef, outName + '(' + inner + ')');
  let nd = null; try { nd = math.parse(src); } catch (e) {}
  if (!nd) return null;
  return { node: nd, tex: mulRatTeX(outCoef, '\\' + outName + '(' + innerTex + ')') };
}
function integrateTrigProduct(node) {
  // sin·cos / sin·sin / cos·cos（各一次，ax+b）
  if (!node.isOperatorNode || node.op !== '*') return null;
  let coef = new Rat(1n);
  const sins = [], coss = [];
  for (const a of node.args) {
    const apc = polyCoeffsExact(a);
    if (apc && apc.length === 1) { coef = coef.mul(apc[0]); continue; }
    const t = matchTrigPower(a);
    if (!t || t.pow !== 1) return null;
    if (t.name === 'sin') sins.push(t); else coss.push(t);
  }
  if ((sins.length + coss.length) !== 2) return null;
  let A, B, mode;
  if (sins.length === 2) { A = sins[0]; B = sins[1]; mode = 'ss'; }
  else if (coss.length === 2) { A = coss[0]; B = coss[1]; mode = 'cc'; }
  else { A = sins[0]; B = coss[0]; mode = 'sc'; }
  const a1 = A.a, b1 = A.b, a2 = B.a, b2 = B.b;
  const kPlus = a1.add(a2), kMinus = a1.sub(a2);
  const cPlus = b1.add(b2), cMinus = b1.sub(b2);
  const half = new Rat(1n, 2n);
  const parts = [], steps = [];
  const push = (name, k, c, sgn) => {
    const r = integrateLinearTrig(name, k, c, half.mul(coef).mul(sgn));
    if (r) parts.push(r);
    return true;
  };
  const modeTex = { ss: '\\sin A\\sin B=\\tfrac12[\\cos(A-B)-\\cos(A+B)]', cc: '\\cos A\\cos B=\\tfrac12[\\cos(A+B)+\\cos(A-B)]', sc: '\\sin A\\cos B=\\tfrac12[\\sin(A+B)+\\sin(A-B)]' }[mode];
  steps.push({ rule: '积化和差', before: '\\int ' + mulRatTeX(coef, '\\,' + trigTex(A) + '\\cdot' + trigTex(B)) + '\\,dx', after: '\\tfrac12[\\ldots]', justification: modeTex });
  if (mode === 'ss') {
    if (!push('cos', kMinus, cMinus, new Rat(1n))) return null;
    if (!push('cos', kPlus, cPlus, new Rat(-1n))) return null;
  } else if (mode === 'cc') {
    if (!push('cos', kPlus, cPlus, new Rat(1n))) return null;
    if (!push('cos', kMinus, cMinus, new Rat(1n))) return null;
  } else {
    if (!push('sin', kPlus, cPlus, new Rat(1n))) return null;
    if (!push('sin', kMinus, cMinus, new Rat(1n))) return null;
  }
  if (!parts.length) return null;
  const nodeSum = addNodes(parts.map(p => p.node));
  const texSum = parts.map(p => p.tex).join('+').replace(/\+\-/g, '-');
  return { node: nodeSum, tex: texSum, steps };
}
function integrateTrigPower(node) {
  // sin^n / cos^n（n=2 降幂）
  if (!node.isOperatorNode || node.op !== '^') return null;
  const base = node.args[0];
  if (!base.isFunctionNode || !['sin', 'cos'].includes(base.fn.name || base.fn)) return null;
  const lin = matchLinearInner(base.args[0]);
  const e = constToRat(node.args[1].value);
  if (!lin || !e || !e.isInt() || e.n !== 2n) return null;
  const name = base.fn.name;
  const a = lin.a, b = lin.b;
  const twoA = a.mul(new Rat(2n));
  const half = new Rat(1n, 2n);
  const amp = new Rat(1n).div(a.mul(new Rat(4n)));
  const outCoef = name === 'sin' ? amp.neg() : amp;
  const inner = polyToSrc([b.mul(new Rat(2n)), twoA]);
  const innerTex = polyToTeX([b.mul(new Rat(2n)), twoA]);
  const parts = [];
  let n0 = null; try { n0 = math.parse(mulRatSrc(half, 'x')); } catch (e) {}
  let n1 = null; try { n1 = math.parse(mulRatSrc(outCoef, 'sin(' + inner + ')')); } catch (e) {}
  if (!n0 || !n1) return null;
  parts.push({ node: n0, tex: '\\frac{x}{2}' });
  parts.push({ node: n1, tex: mulRatTeX(outCoef, '\\sin(' + innerTex + ')') });
  const steps = [{
    rule: '降幂',
    before: '\\int\\' + name + '^2(' + polyToTeX([b, a]) + ')\\,dx',
    after: '\\frac{x}{2}' + (name === 'sin' ? '-' : '+') + '\\frac{\\sin(' + innerTex + ')}{' + a.mul(new Rat(4n)).toTeX() + '}',
    justification: name === 'sin' ? '\\sin^2 u=\\frac{1-\\cos 2u}{2}' : '\\cos^2 u=\\frac{1+\\cos 2u}{2}',
  }];
  const nodeSum = addNodes(parts.map(p => p.node));
  const texSum = parts.map(p => p.tex).join('+').replace(/\+\-/g, '-');
  return { node: nodeSum, tex: texSum, steps };
}

/* ---------- 数值积分（自适应辛普森）与无初等原函数判定 ---------- */
function numericIntegrate(f, a, b) {
  if (!isFinite(a) || !isFinite(b) || !(a < b)) return NaN;
  const simpson = (lo, hi, flo, fmid, fhi) => (hi - lo) * (flo + 4 * fmid + fhi) / 6;
  const rec = (lo, hi, flo, fmid, fhi, whole, depth) => {
    const mid = (lo + hi) / 2;
    const flm = f((lo + mid) / 2), frm = f((mid + hi) / 2);
    if (!isFinite(flm) || !isFinite(frm)) return NaN;
    const left = simpson(lo, mid, flo, flm, fmid);
    const right = simpson(mid, hi, fmid, frm, fhi);
    if (depth <= 0 || Math.abs(left + right - whole) <= 1e-12 * Math.max(1, Math.abs(left + right))) {
      return left + right + (left + right - whole) / 15;
    }
    const l = rec(lo, mid, flo, flm, fmid, left, depth - 1);
    const r = rec(mid, hi, fmid, frm, fhi, right, depth - 1);
    return (isFinite(l) && isFinite(r)) ? l + r : NaN;
  };
  const flo = f(a), fmid = f((a + b) / 2), fhi = f(b);
  if (!isFinite(flo) || !isFinite(fmid) || !isFinite(fhi)) return NaN;
  return rec(a, b, flo, fmid, fhi, simpson(a, b, flo, fmid, fhi), 14);
}
function matchNonElementary(node) {
  // 常见「无初等原函数」模式（Liouville），返回 TeX 描述或 null
  if (!node) return null;
  if (node.isFunctionNode) {
    const name = node.fn.name || node.fn;
    if (name === 'exp') {
      const pc = polyCoeffsExact(node.args[0]);
      if (pc && pc.length >= 3) return 'e^{' + polyToTeX(pc) + '}（指数为二次及以上多项式）无初等原函数';
    }
    if (name === 'sin' || name === 'cos') {
      const pc = polyCoeffsExact(node.args[0]);
      if (pc && pc.length >= 3) return '\\' + name + '(' + polyToTeX(pc) + ')（内层为二次及以上多项式）无初等原函数';
    }
  }
  if (node.isOperatorNode && node.op === '^' && node.args[0].isSymbolNode && node.args[0].name === 'e') {
    // e^x 被 math.js 解析为 OperatorNode(e ^ x)，非 FunctionNode exp；补指数为二次及以上多项式的判定
    const pc = polyCoeffsExact(node.args[1]);
    if (pc && pc.length >= 3) return 'e^{' + polyToTeX(pc) + '}（指数为二次及以上多项式）无初等原函数';
  }
  if (node.isOperatorNode && node.op === '/') {
    const n = node.args[0], d = node.args[1];
    if (d.isSymbolNode && d.name === 'x') {
      if (n.isFunctionNode && ['sin', 'cos', 'exp'].includes(n.fn.name || n.fn)) {
        const nm = n.fn.name || n.fn;
        return '\\frac{' + (nm === 'exp' ? 'e^x' : '\\' + nm + ' x') + '}{x} 无初等原函数（\\frac{\\sin x}{x},\\frac{e^x}{x} 型）';
      }
      // e^x / x 形态：分子是 e^x（OperatorNode ^，底为 e）
      if (n.isOperatorNode && n.op === '^' && n.args[0].isSymbolNode && n.args[0].name === 'e' && n.args[1].isSymbolNode && n.args[1].name === 'x') {
        return '\\frac{e^x}{x} 无初等原函数（\\frac{\\sin x}{x},\\frac{e^x}{x} 型）';
      }
    }
    if (d.isFunctionNode && (d.fn.name || d.fn) === 'log') {
      return '\\frac{1}{\\ln x} 无初等原函数';
    }
  }
  return null;
}

function integrate(node) {
  if (!node) return null;
  if (node.isParenthesisNode) return integrate(node.content);
  const pc = polyCoeffsExact(node);
  if (pc) return integratePoly(pc);
  if (node.isOperatorNode && node.op === '+') {
    const parts = [], steps = [];
    for (const a of node.args) { const r = integrate(a); if (!r) return null; parts.push(r.node); for (const s of r.steps) steps.push(s); }
    const n2 = addNodes(parts);
    return { node: n2, tex: FRONTEND.nodeToTex(n2), steps };
  }
  if (node.isOperatorNode && node.op === '-') {
    const parts = [], steps = [];
    const r0 = integrate(node.args[0]); if (!r0) return null; parts.push(r0.node); for (const s of r0.steps) steps.push(s);
    for (let i = 1; i < node.args.length; i++) { const r = integrate(node.args[i]); if (!r) return null; parts.push(negNode(r.node)); for (const s of r.steps) steps.push(s); }
    const n2 = addNodes(parts);
    return { node: n2, tex: FRONTEND.nodeToTex(n2), steps };
  }
  if (node.fn === 'unaryMinus') {
    const r = integrate(node.args[0]); if (!r) return null;
    const n2 = negNode(r.node);
    return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: r.steps };
  }
  if (node.isOperatorNode && node.op === '*') {
    let c = new Rat(1n), rest = [];
    for (const a of node.args) { const apc = polyCoeffsExact(a); if (apc && apc.length === 1) c = c.mul(apc[0]); else rest.push(a); }
    if (rest.length === 1) {
      const r = integrate(rest[0]); if (!r) return null;
      if (c.eq(new Rat(1n))) return r;
      const n2 = c.eq(new Rat(-1n)) ? negNode(r.node) : math.parse(mulRatSrc(c, '(' + r.node.toString() + ')'));
      return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: r.steps };
    }
    const tp = integrateTrigProduct(node);
    if (tp) return tp;
    return byPartsIntegral(node);
  }
  if (node.isOperatorNode && node.op === '/') {
    const numPc = polyCoeffsExact(node.args[0]);
    const lin = matchLinearInner(node.args[1]);
    if (numPc && numPc.length === 1 && lin && !lin.a.isZero()) {
      const coef = numPc[0].div(lin.a);
      const src = mulRatSrc(coef, 'log(abs(' + node.args[1].toString() + '))');
      let n2 = null; try { n2 = math.parse(src); } catch (e) {}
      if (n2) return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: [{ rule: '对数法则', before: '\\int\\frac{' + numPc[0].toTeX() + '}{' + FRONTEND.nodeToTex(node.args[1]) + '}dx', after: coef.toTeX() + '\\ln|' + FRONTEND.nodeToTex(node.args[1]) + '|', justification: '\\int\\frac{dx}{ax+b}=\\frac{1}{a}\\ln|ax+b|' }] };
    }
    const rat = integrateRational(node);
    if (rat) return rat;
    return null;
  }
  if (node.isOperatorNode && node.op === '^') {
    const base = node.args[0], exp = constToRat(node.args[1].value);
    if (base.isSymbolNode && base.name === 'x' && exp) return powerIntegral(exp);
    const tp2 = integrateTrigPower(node);
    if (tp2) return tp2;
    return null;
  }
  if (node.isSymbolNode && node.name === 'x') return powerIntegral(new Rat(1n));
  if (node.isConstantNode) {
    const c = constToRat(node.value);
    if (c) {
      const n2 = math.parse(ratSrc(c) + '*x');
      return { node: n2, tex: FRONTEND.nodeToTex(n2), steps: [{ rule: '常数法则', before: '\\int ' + c.toTeX() + '\\,dx', after: c.toTeX() + 'x', justification: '\\int c\\,dx=cx' }] };
    }
    return null;
  }
  if (node.isFunctionNode) return basicFunctionIntegral(node);
  return null;
}

/* ---------- n 阶导 ---------- */
function nthDerivativePoly(pc, n) {
  const out = new Array(Math.max(0, pc.length - n)).fill(null).map(() => new Rat(0n));
  const termSteps = [];
  for (let i = n; i < pc.length; i++) {
    const c = pc[i];
    if (c.isZero()) continue;
    const coeff = c.mul(new Rat(fallingFactorial(i, n), 1n));
    out[i - n] = coeff;
    termSteps.push('(' + termMonoTeX(c, i) + ')^{(' + n + ')} = ' + termMonoTeX(coeff, i - n));
  }
  const trimmed = trimPoly(out);
  let node = null; try { node = math.parse(polyToSrc(trimmed)); } catch (e) {}
  return { node, tex: polyToTeX(trimmed), termSteps };
}
function nthDerivative(node, n) {
  n = Math.max(0, Math.round(n));
  if (n === 0) return { node, tex: FRONTEND.nodeToTex(node), formula: null, formulaSteps: [] };
  const pc = polyCoeffsExact(node);
  if (pc) {
    const r = nthDerivativePoly(pc, n);
    const d1 = nthDerivativePoly(pc, 1), d2 = nthDerivativePoly(pc, 2);
    const formulaSteps = [
      "f'(x) = " + d1.tex,
      "f''(x) = " + d2.tex,
      '逐项求导：每一项 x^{i} 求 n 阶导后系数乘下降阶乘 i(i-1)\\cdots(i-n+1)，指数降为 i-n',
    ].concat(n >= 3 ? [] : []);
    formulaSteps.push('代入 n=' + n + '：f^{(' + n + ')}(x) = ' + r.tex);
    return { node: r.node, tex: r.tex, formula: 'f^{(n)}(x)=\\sum_{i\\ge n} c_i\\,i(i-1)\\cdots(i-n+1)\\,x^{\\,i-n}', formulaSteps };
  }
  const fnm = matchSimpleFn(node);
  if (fnm && (fnm.name === 'sin' || fnm.name === 'cos' || fnm.name === 'exp')) {
    const a = fnm.a, b = fnm.b, c = fnm.c, inner = fnm.inner;
    const innerTex = FRONTEND.nodeToTex(inner);
    const an = powRatInt(a, n);
    let fname, sign, formula;
    if (fnm.name === 'exp') { fname = 'exp'; sign = 1; formula = 'f^{(n)}(x)=' + c.toTeX() + a.toTeX() + '^{n}e^{' + innerTex + '}'; }
    else {
      const r = ((n % 4) + 4) % 4;
      if (fnm.name === 'sin') { if (r === 0) { fname = 'sin'; sign = 1; } else if (r === 1) { fname = 'cos'; sign = 1; } else if (r === 2) { fname = 'sin'; sign = -1; } else { fname = 'cos'; sign = -1; } }
      else { if (r === 0) { fname = 'cos'; sign = 1; } else if (r === 1) { fname = 'sin'; sign = -1; } else if (r === 2) { fname = 'cos'; sign = -1; } else { fname = 'sin'; sign = 1; } }
      formula = 'f^{(n)}(x)=' + c.toTeX() + a.toTeX() + '^{n}\\' + fnm.name + '\\left(' + innerTex + '+\\frac{n\\pi}{2}\\right)';
    }
    const c2 = c.mul(an).mul(new Rat(BigInt(sign), 1n));
    const src = mulRatSrc(c2, fname + '(' + inner.toString() + ')');
    let n2 = null; try { n2 = math.parse(src); } catch (e) {}
    const d1 = derivativeOf(node), d2 = d1 ? derivativeOf(d1) : null, d3 = d2 ? derivativeOf(d2) : null;
    const formulaSteps = [
      "f'(x) = " + (d1 ? FRONTEND.nodeToTex(d1) : '…'),
      "f''(x) = " + (d2 ? FRONTEND.nodeToTex(d2) : '…'),
      "f'''(x) = " + (d3 ? FRONTEND.nodeToTex(d3) : '…'),
      (fnm.name === 'exp' ? '每求一次导系数乘 a' : '每求一次导系数乘 a、相位后移 \\frac{\\pi}{2}'),
      '归纳得通式：' + formula,
      '代入 n=' + n + '：f^{(' + n + ')}(x) = ' + (n2 ? FRONTEND.nodeToTex(n2) : '…'),
    ];
    return { node: n2, tex: n2 ? FRONTEND.nodeToTex(n2) : '…', formula, formulaSteps };
  }
  let cur = node;
  for (let i = 0; i < n; i++) { const d = derivativeOf(cur); if (!d) break; cur = d; }
  return { node: cur, tex: FRONTEND.nodeToTex(cur), formula: null, formulaSteps: [] };
}

/* ---------- n 重积分 ---------- */
function nthIntegralPoly(pc, n) {
  const out = new Array(pc.length + n).fill(null).map(() => new Rat(0n));
  const termSteps = [];
  for (let i = 0; i < pc.length; i++) {
    const c = pc[i];
    if (c.isZero()) continue;
    const e = i + n;
    out[e] = c.div(new Rat(risingFactorial(i + 1, n), 1n));
    termSteps.push(termMonoTeX(c, i) + ' \\;\\xrightarrow{n\\text{ 重积分}}\\; ' + termMonoTeX(out[e], e));
  }
  const trimmed = trimPoly(out);
  let node = null; try { node = math.parse(polyToSrc(trimmed)); } catch (e) {}
  const constTerms = [];
  for (let i = n - 1; i >= 0; i--) constTerms.push(i === 0 ? 'C_0' : i === 1 ? 'C_1x' : 'C_{' + i + '}x^{' + i + '}');
  const mainTex = polyToTeX(trimmed);
  const tex = (mainTex === '0' ? '' : mainTex + ' + ') + constTerms.join(' + ');
  return { node, tex, termSteps };
}
function nthIntegral(node, n) {
  n = Math.max(0, Math.round(n));
  if (n === 0) return { node, tex: FRONTEND.nodeToTex(node), formula: null, formulaSteps: [] };
  const pc = polyCoeffsExact(node);
  if (pc) {
    const r = nthIntegralPoly(pc, n);
    const formulaSteps = [
      '每积一次，指数加 1、系数除以新指数；n 重积分产生 n 个积分常数',
      '\\int^{(n)} x^{i}dx=\\frac{x^{i+n}}{(i+1)(i+2)\\cdots(i+n)}',
      '代入 n=' + n + '：\\int^{(n)}f\\,dx = ' + r.tex,
    ];
    return { node: r.node, tex: r.tex, formula: '\\int^{(n)}f\\,dx=\\sum_{i}\\frac{c_i\\,x^{\\,i+n}}{(i+1)(i+2)\\cdots(i+n)}+C_0+C_1x+\\cdots+C_{n-1}x^{n-1}', formulaSteps };
  }
  const fnm = matchSimpleFn(node);
  if (fnm && fnm.name === 'exp' && !fnm.a.isZero()) {
    const a = fnm.a, c = fnm.c, inner = fnm.inner;
    const an = powRatInt(a, n);
    const c2 = c.div(an);
    const src = mulRatSrc(c2, 'exp(' + inner.toString() + ')');
    let n2 = null; try { n2 = math.parse(src); } catch (e) {}
    const constTerms = [];
    for (let i = n - 1; i >= 0; i--) constTerms.push(i === 0 ? 'C_0' : i === 1 ? 'C_1x' : 'C_{' + i + '}x^{' + i + '}');
    const tex = (n2 ? FRONTEND.nodeToTex(n2) : '…') + ' + ' + constTerms.join(' + ');
    const formulaSteps = ['每积一次系数除以 a', '\\int^{(n)}e^{ax+b}dx=\\frac{e^{ax+b}}{a^n}+C_0+C_1x+\\cdots', '代入 n=' + n + '：\\int^{(n)}f\\,dx = ' + tex];
    return { node: n2, tex, formula: '\\int^{(n)}e^{ax+b}dx=\\frac{e^{ax+b}}{a^n}+C_0+C_1x+\\cdots+C_{n-1}x^{n-1}', formulaSteps };
  }
  let cur = node, allSteps = [];
  for (let i = 0; i < n; i++) { const r = integrate(cur); if (!r) return { node: cur, tex: FRONTEND.nodeToTex(cur), formula: null, formulaSteps: allSteps, partial: true }; cur = r.node; for (const s of r.steps) allSteps.push(s); }
  return { node: cur, tex: FRONTEND.nodeToTex(cur), formula: null, formulaSteps: allSteps.map(s => '\\int ' + s.before.replace('\\int ', '') + ' = ' + s.after) };
}

/* ---------- 定积分（牛顿-莱布尼茨） ---------- */
function toRatOrNull(x) {
  if (x && typeof x.n === 'bigint' && typeof x.d === 'bigint') return x;
  if (typeof x === 'number' && isFinite(x)) return Rat.fromNumber(x);
  return null;
}
function definiteIntegral(node, a, b) {
  const F = integrate(node);
  if (!F || !F.node) return null;
  const Fpc = polyCoeffsExact(F.node);
  const ra = toRatOrNull(a), rb = toRatOrNull(b);
  if (Fpc && ra && rb) {
    const val = polyEval(Fpc, rb).sub(polyEval(Fpc, ra));
    return { exact: true, value: val, valueNum: val.toNumber(), antideriv: F, tex: val.toTeX() };
  }
  try {
    const fa = F.node.compile().evaluate({ x: a });
    const fb = F.node.compile().evaluate({ x: b });
    const val = fb - fa;
    if (isFinite(val)) return { exact: false, value: null, valueNum: val, antideriv: F, tex: fmtNum(val) };
  } catch (e) {}
  return null;
}

/* ---------- 隐函数求导 dy/dx = -F_x/F_y ---------- */
function ySubRat(r) { if (r.isZero()) return 'y'; return '(y' + (r.sign() < 0 ? '+' : '-') + ratSrc(r.abs()) + ')'; }
function conicImplicitNode(fn) {
  const p = fn.conicParams, t = fn.conicType;
  const h = p.h, k = p.k;
  const hs = xSubRat(h), ks = ySubRat(k);
  let src;
  if (t === 'circle') src = pow2Src(hs) + '+' + pow2Src(ks) + '-' + ratSrc(p.r.mul(p.r));
  else if (t === 'ellipse') src = pow2Src(hs) + '/' + ratSrc(p.a.mul(p.a)) + '+' + pow2Src(ks) + '/' + ratSrc(p.b.mul(p.b)) + '-1';
  else if (t === 'hyperbola') src = pow2Src(hs) + '/' + ratSrc(p.a.mul(p.a)) + '-' + pow2Src(ks) + '/' + ratSrc(p.b.mul(p.b)) + '-1';
  else if (t === 'parabola') src = pow2Src(ks) + '-' + ratSrc(p.p.mul(new Rat(4n))) + '*(' + hs + ')';
  else return null;
  let node = null; try { node = math.parse(src); } catch (e) { node = null; }
  return node;
}
function implicitDerivative(FNode) {
  let fx = null, fy = null;
  try { fx = math.simplify(math.derivative(FNode, 'x'), {}, math.simplify.realContext); } catch (e) {}
  try { fy = math.simplify(math.derivative(FNode, 'y'), {}, math.simplify.realContext); } catch (e) {}
  if (!fx || !fy) return null;
  let dydx = null;
  try { dydx = math.simplify(math.parse('-(' + fx.toString() + ')/(' + fy.toString() + ')'), {}, math.simplify.realContext); } catch (e) {}
  return { fx, fy, dydx };
}

/* ---------- 参数方程求导 dy/dx = (dY/dt)/(dX/dt) ----------
   项目参数曲线由「二维函数 f 绕原点旋转 θ + 平移 (a,b)」生成：
   X(t) = (t-a)cosθ + (f(t)-b)sinθ，Y(t) = -(t-a)sinθ + (f(t)-b)cosθ
   → X'(t) = cosθ + f'(t)sinθ，Y'(t) = -sinθ + f'(t)cosθ */
function paramDerivative(fn) {
  if (!fn || !fn.parametric) return null;
  let srcNode;
  try { srcNode = math.parse(fn.pcSrcExpr); } catch (e) { return null; }
  const srcParams = fn.pcSrcParams || {};
  const d = derivativeOf(srcNode, srcParams);
  if (!d || d.kind === 'piecewise') return null;
  // 参数符号统一为 t：把源函数/导数里的 x 重命名为 t，避免公式里 x、t 混用
  const rename = nd => (nd.isSymbolNode && nd.name === 'x') ? math.parse('t') : nd;
  const srcT = srcNode.transform(rename);
  const dT = d.transform(rename);
  const ftex = FRONTEND.nodeToTex(srcT);
  const fptex = FRONTEND.nodeToTex(dT);
  const aTex = fn.pcA ? fn.pcA.toTeX() : '0';
  const bTex = fn.pcB ? fn.pcB.toTeX() : '0';
  const xSub = (aTex === '0') ? 't' : '(t-' + aTex + ')';
  const fSub = (bTex === '0') ? ftex : '(' + ftex + '-' + bTex + ')';
  const cosT = '\\cos\\theta', sinT = '\\sin\\theta';
  const Xtex = xSub + cosT + '+' + fSub + sinT;
  const Ytex = '-' + xSub + sinT + '+' + fSub + cosT;
  const dXtex = cosT + '+(' + fptex + ')' + sinT;
  const dYtex = '-' + sinT + '+(' + fptex + ')' + cosT;
  const dydxTex = '\\frac{' + dYtex + '}{' + dXtex + '}';
  return { ok: true, thetaDeg: fn.pcTheta, ftex, fptex, Xtex, Ytex, dXtex, dYtex, dydxTex };
}

/* ---------- 数值左右极限 ---------- */
function approxLimit(fn, a, side) {
  const vals = [];
  for (let k = 3; k <= 9; k++) {
    const eps = Math.pow(10, -k);
    const y = FRONTEND.evalFn(fn, a + side * eps, fn.params);
    if (!isFinite(y)) return null;
    vals.push(y);
  }
  let inc = true, dec = true;
  for (let i = 1; i < vals.length; i++) { if (vals[i] > vals[i - 1]) dec = false; if (vals[i] < vals[i - 1]) inc = false; }
  const last = vals[vals.length - 1];
  if ((inc && last > 500) || (dec && last < -500)) return last > 0 ? Infinity : -Infinity;
  return last;
}

var MATH_ = {
  derivativeOf, polyCoeffsExact, factorPolynomial, exactQuadratic, findRoots, numericRoots,
  analyzeDomain, signTable, opNode, composeNode, inverseOf, substParamsExact, surdTex,
  ratRootObj, brent, dedupe, completeSquare, solveTrigEq, checkDomain,
  isLinear, rotateLine, translateExact, paramEquations, coordinateTransform,
  explicitImplicit, paramImplicit, CONIC, buildConic, updateConic,
  explicitBranches, conicBranches, paramMonotonicSegments, invertParamX, solveRadicalEquation, scanRoots,
  integrate, nthDerivative, nthIntegral, definiteIntegral, conicImplicitNode, implicitDerivative, paramDerivative, approxLimit,
  polyDiv, solveLinear, integrateRational, integrateTrigProduct, integrateTrigPower,
  numericIntegrate, matchNonElementary,
};

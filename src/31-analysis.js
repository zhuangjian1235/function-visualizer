/* ============================================================
 * 31-analysis.js — 分析（定义域/零点/单调/极值/渐近线/值域/奇偶）
 * 与 32-derivation.js — 分步推导（含双层自检）
 * ============================================================ */
'use strict';

/* ---------- 分析 ---------- */
function analyzeFunction(fn) {
  const dom = MATH_.analyzeDomain(fn);
  const roots = MATH_.findRoots(fn.expr, fn.params, [-20, 20]);
  const mono = monotonicAnalysis(fn, dom, null);
  const asymptotes = findAsymptotes(fn);
  const range = computeRange(fn, dom, null);
  const parity = detectParity(fn);
  return {
    domain: dom, roots,
    monotonic: mono.degenerate ? null : mono.intervals,
    monotonicConst: mono.constant,
    extrema: mono.extrema,
    asymptotes, range, parity,
  };
}

function findAsymptotes(fn) {
  const out = [];
  const dom = MATH_.analyzeDomain(fn);
  // 垂直渐近线 = 极点
  for (const p of dom.poles) out.push({ type: 'vertical', x: p, tex: 'x=' + fmtNum(p, 4) });

  // 水平/斜渐近线：有理式 P/Q
  try {
    const rat = math.rationalize(fn.expr, true);
    if (rat && rat.numerator && rat.denominator) {
      const num = MATH_.polyCoeffsExact(rat.numerator), den = MATH_.polyCoeffsExact(rat.denominator);
      if (num && den && num.length && den.length) {
        const dn = num.length - 1, dd = den.length - 1;
        if (dn < dd) out.push({ type: 'horizontal', tex: 'y=0' });
        else if (dn === dd) {
          const r = num[dn].div(den[dd]);
          out.push({ type: 'horizontal', tex: 'y=' + r.toTeX() });
        } else if (dn === dd + 1) {
          // 斜渐近线：多项式除法
          const { quot, rem } = polyDivide(num, den);
          const slope = quot[quot.length - 1], intercept = quot.length >= 2 ? quot[quot.length - 2] : new Rat(0n);
          out.push({ type: 'slant', tex: 'y=' + slope.toTeX() + 'x+' + intercept.toTeX() });
        }
      }
    }
  } catch (e) { /* 忽略 */ }
  return out;
}
function polyDivide(num, den) {
  // 返回 {quot, rem}，Rat[]，低次到高次
  let rem = num.slice();
  const qn = num.length - den.length;
  if (qn < 0) return { quot: [new Rat(0n)], rem };
  const quot = new Array(qn + 1).fill(new Rat(0n));
  for (let i = qn; i >= 0; i--) {
    const coef = rem[rem.length - 1].div(den[den.length - 1]);
    quot[i] = coef;
    // rem -= coef * x^i * den
    const term = den.map((c, j) => c.mul(coef));
    const shift = i;
    for (let j = 0; j < term.length; j++) {
      const idx = j + shift;
      if (idx < rem.length) rem[idx] = rem[idx].sub(term[j]);
    }
    // 去尾
    while (rem.length > 1 && rem[rem.length - 1].isZero()) rem.pop();
    if (rem.length === 0) rem = [new Rat(0n)];
  }
  return { quot, rem };
}

/* ================= 单调性（真实定义域 + 区间约束） ================= */
function absCorners(node) {
  const out = [];
  const walk = nd => {
    if (!nd) return;
    if (nd.isFunctionNode && (nd.fn.name || nd.fn) === 'abs') {
      const pc = MATH_.polyCoeffsExact(nd.args[0]);
      if (pc && pc.length > 1) {
        let r = { roots: [] };
        try { r = MATH_.findRoots(nd.args[0], null, [-30, 30]); } catch (e) {}
        r.roots.forEach(o => { if (isFinite(o.x)) out.push(o.x); });
      }
    }
    nd.args && nd.args.forEach(walk);
  };
  walk(node);
  return out;
}
function monotonicAnalysis(fn, dom, bounds) {
  const loB = bounds ? bounds.lo : -Infinity;
  const hiB = bounds ? bounds.hi : Infinity;
  let deriv = null;
  try { deriv = MATH_.derivativeOf(fn.expr, fn.params); } catch (e) {}
  const result = { intervals: [], crits: [], extrema: [], constant: false, degenerate: !deriv };
  if (!deriv) return result;
  const lr = isFinite(loB) ? loB : -30;
  const hr = isFinite(hiB) ? hiB : 30;
  let cr = { roots: [] };
  try { cr = MATH_.findRoots(deriv, null, [lr, hr]); } catch (e) {}
  const critX = cr.roots.map(o => o.x).filter(x => isFinite(x) && x > loB && x < hiB);
  const corners = absCorners(fn.expr).filter(x => x > loB && x < hiB);
  // 边：-∞/+∞、临界点、绝对值拐点、定义域断点、区间自身端点
  const edges = [];
  const pushEdge = (x, type) => edges.push({ x, type });
  pushEdge(loB, loB === -Infinity ? 'inf' : 'cut');
  for (const c of critX) pushEdge(c, 'crit');
  for (const c of corners) pushEdge(c, 'corner');
  for (const b of dom.breaks) if (b.x > loB && b.x < hiB) pushEdge(b.x, b.kind + (b.inclusive ? ':inc' : ':exc'));
  pushEdge(hiB, hiB === Infinity ? 'inf' : 'cut');
  edges.sort((a, b) => a.x - b.x);
  const merged = [];
  for (const e of edges) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.x - e.x) < 1e-9) last.types.push(e.type);
    else merged.push({ x: e.x, types: [e.type] });
  }
  const isClosedAt = types => {
    if (types.some(t => t === 'pole' || t === 'hole' || t === 'inf')) return false;
    if (types.some(t => t === 'bnd:inc' || t === 'boundary:inc')) return true;
    return false;
  };
  const df = x => FRONTEND.evalNodeWithParams(deriv, x, fn.params);
  for (let i = 0; i < merged.length - 1; i++) {
    const a = merged[i], b = merged[i + 1];
    if (b.x - a.x < 1e-9) continue;
    let mid;
    if (a.x === -Infinity && b.x === Infinity) mid = 0;
    else if (a.x === -Infinity) mid = b.x - 1;
    else if (b.x === Infinity) mid = a.x + 1;
    else mid = (a.x + b.x) / 2;
    const v = df(mid);
    if (!isFinite(v)) continue;
    if (!isFinite(FRONTEND.evalFn(fn, mid, fn.params))) continue; // 区间落在定义域外
    const sign = v > 1e-6 ? 1 : v < -1e-6 ? -1 : 0;
    result.intervals.push({ lo: a.x, hi: b.x, loOpen: !isClosedAt(a.types), hiOpen: !isClosedAt(b.types), sign });
  }
  result.crits = critX;
  // 极值：临界点两侧区间符号变号
  for (const c of critX) {
    const yc = FRONTEND.evalFn(fn, c, fn.params);
    if (!isFinite(yc)) continue;
    const li = result.intervals.find(iv => Math.abs(iv.hi - c) < 1e-9);
    const ri = result.intervals.find(iv => Math.abs(iv.lo - c) < 1e-9);
    if (!li || !ri) continue;
    if (li.sign > 0 && ri.sign < 0) result.extrema.push({ x: c, y: yc, type: 'max' });
    else if (li.sign < 0 && ri.sign > 0) result.extrema.push({ x: c, y: yc, type: 'min' });
  }
  // 合并相邻同号区间（如 x^3 在 0 处 f'=0 但不变号）；绝不跨极点/洞合并
  const poleSet = new Set(dom.poles.map(p => Math.round(p * 1e8)));
  const holeSet = new Set(dom.holes.map(h => Math.round(h.x * 1e8)));
  const mergedInt = [];
  for (const iv of result.intervals) {
    const last = mergedInt[mergedInt.length - 1];
    let boundaryBreak = false;
    if (last) {
      const k = Math.round(last.hi * 1e8);
      boundaryBreak = poleSet.has(k) || holeSet.has(k);
    }
    if (last && last.sign === iv.sign && last.sign !== 0 && !boundaryBreak && Math.abs(last.hi - iv.lo) < 1e-9) {
      last.hi = iv.hi; last.hiOpen = iv.hiOpen;
    } else mergedInt.push({ lo: iv.lo, hi: iv.hi, loOpen: iv.loOpen, hiOpen: iv.hiOpen, sign: iv.sign });
  }
  result.intervals = mergedInt;
  result.constant = result.intervals.length > 0 && result.intervals.every(iv => iv.sign === 0);
  return result;
}

/* ================= 值域（解析 + 通用候选点） ================= */
function mkPart(lo, hi, loOpen, hiOpen, loTex, hiTex) {
  return { lo, hi, loOpen, hiOpen, loTex: loTex || null, hiTex: hiTex || null };
}
function rationalizeParts(node) {
  try {
    const r = math.rationalize(node, true);
    if (r && r.numerator && r.denominator) {
      const num = MATH_.polyCoeffsExact(r.numerator);
      const den = MATH_.polyCoeffsExact(r.denominator);
      if (num && den) return { num, den };
    }
  } catch (e) {}
  return null;
}
function polyInfinity(pc, dir) {
  const deg = pc.length - 1;
  const lead = pc[deg];
  if (deg === 0) return lead.toNumber();
  const s = lead.sign();
  if (dir > 0) return s > 0 ? Infinity : -Infinity;
  if (deg % 2 === 0) return s > 0 ? Infinity : -Infinity;
  return s > 0 ? -Infinity : Infinity;
}
function rationalInfinity(rat, dir) {
  const num = rat.num, den = rat.den;
  const dn = num.length - 1, dd = den.length - 1;
  const ln = num[dn], ld = den[dd];
  if (dn < dd) return 0;
  if (dn === dd) return ln.div(ld).toNumber();
  const exp = dn - dd;
  const rs = ln.mul(ld).sign();
  if (dir > 0) return rs > 0 ? Infinity : -Infinity;
  return (rs * (exp % 2 === 0 ? 1 : -1)) > 0 ? Infinity : -Infinity;
}
/* 迷你符号极限求值（x→±∞），未知返回 null */
function limitAtInfinity(node, params, dir) {
  if (!node || node.kind === 'piecewise') return null;
  const pc = MATH_.polyCoeffsExact(node);
  if (pc) return polyInfinity(pc, dir);
  const rat = rationalizeParts(node);
  if (rat) return rationalInfinity(rat, dir);
  if (node.isConstantNode) { const r = constToRat(node.value); return r ? r.toNumber() : null; }
  if (node.isSymbolNode) return node.name === 'x' ? (dir > 0 ? Infinity : -Infinity) : null;
  if (node.isFunctionNode) {
    const name = node.fn.name || node.fn;
    const inner = limitAtInfinity(node.args[0], params, dir);
    if (inner === null) return null;
    if (name === 'exp') { if (inner === Infinity) return Infinity; if (inner === -Infinity) return 0; return Math.exp(inner); }
    if (name === 'log' || name === 'log10' || name === 'log2') { if (inner === Infinity) return Infinity; if (inner <= 0) return null; return Math.log(inner); }
    if (name === 'sqrt') { if (inner === Infinity) return Infinity; if (inner < 0) return null; return Math.sqrt(inner); }
    if (name === 'abs') { if (inner === Infinity || inner === -Infinity) return Infinity; return Math.abs(inner); }
    return null;
  }
  if (node.isOperatorNode) {
    if (node.fn === 'unaryMinus') {
      const v = limitAtInfinity(node.args[0], params, dir);
      if (v === null) return null;
      return v === Infinity ? -Infinity : v === -Infinity ? Infinity : -v;
    }
    const op = node.op;
    if (op === '+') {
      let sum = 0, inf = 0;
      for (const a of node.args) { const v = limitAtInfinity(a, params, dir); if (v === null) return null; if (v === Infinity) inf++; else if (v === -Infinity) inf--; else sum += v; }
      if (inf > 0) return Infinity;
      if (inf < 0) return -Infinity;
      return sum;
    }
    if (op === '*') {
      let finite = 1, infSign = 1, hasInf = false, hasZero = false;
      for (const a of node.args) {
        const v = limitAtInfinity(a, params, dir);
        if (v === null) return null;
        if (v === Infinity) hasInf = true;
        else if (v === -Infinity) { hasInf = true; infSign *= -1; }
        else if (v === 0) hasZero = true;
        else finite *= v;
      }
      if (hasInf) { if (hasZero) return null; return (infSign * (finite < 0 ? -1 : 1)) > 0 ? Infinity : -Infinity; }
      return finite;
    }
    if (op === '/') {
      const num = limitAtInfinity(node.args[0], params, dir);
      const den = limitAtInfinity(node.args[1], params, dir);
      if (num === null || den === null) return null;
      if (den === 0) return null;
      if (den === Infinity || den === -Infinity) { if (num === Infinity || num === -Infinity) return null; return 0; }
      if (num === Infinity || num === -Infinity) { return (num > 0 ? 1 : -1) * (den > 0 ? 1 : -1) > 0 ? Infinity : -Infinity; }
      return num / den;
    }
    if (op === '^') {
      const e = constToRat(node.args[1].value);
      const base = limitAtInfinity(node.args[0], params, dir);
      if (!e || base === null) return null;
      if (base === Infinity) return e.sign() < 0 ? 0 : Infinity;
      if (base === -Infinity) { if (e.sign() < 0) return 0; return (e.n % 2n === 0n ? Infinity : -Infinity); }
      if (base === 0) return e.sign() < 0 ? Infinity : 0;
      return Math.pow(base, e.toNumber());
    }
  }
  return null;
}
/* 探测 x→x0± 时 f 是否发散到 ±∞（处理 log→-∞、1/sqrt→+∞ 等） */
function divergenceAt(fn, x0, dir) {
  const vals = [];
  for (let k = 2; k <= 9; k++) {
    const eps = Math.pow(10, -k);
    const y = FRONTEND.evalFn(fn, x0 + dir * eps, fn.params);
    if (!isFinite(y)) return y > 0 ? Infinity : (y < 0 ? -Infinity : null);
    vals.push(y);
  }
  let inc = true, dec = true;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] > vals[i - 1]) dec = false;
    if (vals[i] < vals[i - 1]) inc = false;
  }
  if (!inc && !dec) return null;
  const grow = Math.abs(vals[vals.length - 1]) > Math.abs(vals[0]) * 2;
  if (!grow || Math.abs(vals[vals.length - 1]) < 8) return null;
  if (inc && vals[vals.length - 1] > 0) return Infinity;
  if (dec && vals[vals.length - 1] < 0) return -Infinity;
  return null;
}
function flattenAddSub(node) {
  const out = [];
  const rec = (nd, sgn) => {
    if (nd.isOperatorNode && nd.op === '+') nd.args.forEach(a => rec(a, sgn));
    else if (nd.isOperatorNode && nd.op === '-') { rec(nd.args[0], sgn); for (let i = 1; i < nd.args.length; i++) rec(nd.args[i], -sgn); }
    else if (nd.fn === 'unaryMinus') rec(nd.args[0], -sgn);
    else out.push({ node: nd, sign: sgn });
  };
  rec(node, 1);
  return out;
}
function coeffFromNodeConst(node) {
  const pc = MATH_.polyCoeffsExact(node);
  return (pc && pc.length === 1) ? pc[0] : null;
}
function trigCoef(node) {
  if (node.isFunctionNode) {
    const nm = node.fn.name || node.fn;
    if (nm === 'sin' || nm === 'cos') return { a: new Rat(1n), inner: node.args[0] };
    return null;
  }
  if (node.fn === 'unaryMinus') { const t = trigCoef(node.args[0]); return t ? { a: t.a.neg(), inner: t.inner } : null; }
  if (node.isOperatorNode && node.op === '*') {
    let a = new Rat(1n), inner = null;
    for (const arg of node.args) {
      const t = trigCoef(arg);
      if (t) { if (inner) return null; inner = t.inner; a = a.mul(t.a); }
      else { const c = coeffFromNodeConst(arg); if (c === null) return null; a = a.mul(c); }
    }
    return inner ? { a, inner } : null;
  }
  return null;
}
/* 有界三角 a·sin/cos(线性x)+c → [c-|a|, c+|a|]（精确） */
function boundedTrigRange(fn) {
  let n = fn.expr;
  if (fn.params && Object.keys(fn.params).length) n = MATH_.substParamsExact(n, fn.params);
  const terms = flattenAddSub(n);
  let amp = null, offset = new Rat(0n);
  for (const t of terms) {
    const c = trigCoef(t.node);
    if (c) {
      if (amp !== null) return null;
      const pc = MATH_.polyCoeffsExact(c.inner);
      if (!pc || pc.length > 2) return null;
      amp = c.a.abs();
    } else {
      const pc = MATH_.polyCoeffsExact(t.node);
      if (!pc || pc.length !== 1) return null;
      const v = pc[0];
      offset = t.sign > 0 ? offset.add(v) : offset.sub(v);
    }
  }
  if (amp === null) return null;
  const lo = offset.sub(amp), hi = offset.add(amp);
  return { exact: true, approx: false, parts: [mkPart(lo.toNumber(), hi.toNumber(), false, false, lo.toTeX(), hi.toTeX())] };
}
/* 值域：按定义域连续段求值域，再取并集（正确处理 1/x、x+1/x 的挖空/分段） */
function endpointValue(fn, x0, dir) {
  if (x0 === Infinity) return limitAtInfinity(fn.expr, fn.params, 1);
  if (x0 === -Infinity) return limitAtInfinity(fn.expr, fn.params, -1);
  const d = divergenceAt(fn, x0, dir);
  if (d !== null) return d;
  const eps = 1e-7;
  const y = FRONTEND.evalFn(fn, x0 + dir * eps, fn.params);
  return isFinite(y) ? y : null;
}
function segmentRange(fn, lo, hi, loOpen, hiOpen) {
  let ubLo = false, ubHi = false;
  const cands = [];
  const add = (y, closed) => { if (isFinite(y)) cands.push({ y, closed }); };
  const applyV = (v, closed) => {
    if (v === Infinity) ubHi = true;
    else if (v === -Infinity) ubLo = true;
    else if (v !== null && isFinite(v)) add(v, closed);
  };
  // 左端点（±∞ 的极限永不可取到 → open）
  if (lo === -Infinity) applyV(limitAtInfinity(fn.expr, fn.params, -1), false);
  else if (!loOpen) applyV(FRONTEND.evalFn(fn, lo, fn.params), true);
  else applyV(endpointValue(fn, lo, 1), false);
  // 右端点
  if (hi === Infinity) applyV(limitAtInfinity(fn.expr, fn.params, 1), false);
  else if (!hiOpen) applyV(FRONTEND.evalFn(fn, hi, fn.params), true);
  else applyV(endpointValue(fn, hi, -1), false);
  // 临界点
  let deriv = null;
  try { deriv = MATH_.derivativeOf(fn.expr, fn.params); } catch (e) {}
  if (deriv) {
    const l = isFinite(lo) ? lo : -30, h = isFinite(hi) ? hi : 30;
    let crits = { roots: [] };
    try { crits = MATH_.findRoots(deriv, null, [l, h]); } catch (e) {}
    for (const c of crits.roots) { if (c.x <= lo || c.x >= hi) continue; add(FRONTEND.evalFn(fn, c.x, fn.params), true); }
  }
  let loY = Infinity, hiY = -Infinity, loC = false, hiC = false;
  for (const c of cands) {
    if (c.y < loY) { loY = c.y; loC = c.closed; }
    else if (Math.abs(c.y - loY) < 1e-9) loC = loC || c.closed;
    if (c.y > hiY) { hiY = c.y; hiC = c.closed; }
    else if (Math.abs(c.y - hiY) < 1e-9) hiC = hiC || c.closed;
  }
  if (ubLo) loY = -Infinity;
  if (ubHi) hiY = Infinity;
  if (loY === Infinity && hiY === -Infinity) return null;
  return mkPart(loY, hiY, ubLo ? true : !loC, ubHi ? true : !hiC, null, null);
}
function rangeOnInterval(fn, iv, dom) {
  const parts = [];
  for (const D of dom.intervals) {
    const segLo = Math.max(D.lo, iv.lo);
    const segHi = Math.min(D.hi, iv.hi);
    if (segLo >= segHi) continue;
    let loOpen, hiOpen;
    if (segLo === -Infinity) loOpen = true;
    else if (segLo === D.lo) loOpen = D.loOpen;
    else if (segLo === iv.lo) loOpen = iv.loOpen;
    else loOpen = true;
    if (segHi === Infinity) hiOpen = true;
    else if (segHi === D.hi) hiOpen = D.hiOpen;
    else if (segHi === iv.hi) hiOpen = iv.hiOpen;
    else hiOpen = true;
    const p = segmentRange(fn, segLo, segHi, loOpen, hiOpen);
    if (p) parts.push(p);
  }
  if (!parts.length) return null;
  return { exact: false, approx: true, parts };
}
function polynomialRangeFull(pc) {
  const deg = pc.length - 1;
  if (deg === 0) { const c = pc[0]; return { exact: true, approx: false, parts: [mkPart(c.toNumber(), c.toNumber(), false, false, c.toTeX(), c.toTeX())] }; }
  if (deg === 1) {
    if (pc[1].isZero()) { const c = pc[0]; return { exact: true, approx: false, parts: [mkPart(c.toNumber(), c.toNumber(), false, false, c.toTeX(), c.toTeX())] }; }
    return { exact: true, approx: false, parts: [mkPart(-Infinity, Infinity, true, true, null, null)] };
  }
  if (deg === 2) {
    const a = pc[2], b = pc[1], c = pc[0];
    const k = c.sub(b.mul(b).div(a.mul(new Rat(4n))));
    if (a.sign() > 0) return { exact: true, approx: false, parts: [mkPart(k.toNumber(), Infinity, false, true, k.toTeX(), null)] };
    return { exact: true, approx: false, parts: [mkPart(-Infinity, k.toNumber(), true, false, null, k.toTeX())] };
  }
  if (deg % 2 === 1) return { exact: true, approx: false, parts: [mkPart(-Infinity, Infinity, true, true, null, null)] };
  return null;
}
function rationalRangeFull(rat) {
  const num = rat.num, den = rat.den;
  const dn = num.length - 1, dd = den.length - 1;
  if (dn <= 1 && dd === 1) {
    const a = dn === 1 ? num[1] : new Rat(0n);
    const b = num[0];
    const c = den[1], d = den[0];
    if (c.isZero()) return null;
    const asy = a.div(c);
    const k0 = b.sub(asy.mul(d));
    if (!k0.isZero()) {
      const an = asy.toNumber(), at = asy.toTeX();
      return { exact: true, approx: false, parts: [mkPart(-Infinity, an, true, true, null, at), mkPart(an, Infinity, true, true, at, null)] };
    }
  }
  return null;
}
/* |p(x)| 值域：常数→{|c|}，非零次多项式→[0,+∞) */
function absRange(node) {
  if (!(node.isFunctionNode && (node.fn.name || node.fn) === 'abs')) return null;
  const pc = MATH_.polyCoeffsExact(node.args[0]);
  if (!pc) return null;
  if (pc.length === 1) { const c = pc[0].abs(); return { exact: true, approx: false, parts: [mkPart(c.toNumber(), c.toNumber(), false, false, c.toTeX(), c.toTeX())] }; }
  return { exact: true, approx: false, parts: [mkPart(0, Infinity, false, true, '0', null)] };
}
/* a·|线性| + c 值域：[c,+∞) 或 (-∞,c] */
function absLinearRange(fn) {
  let n = fn.expr;
  if (fn.params && Object.keys(fn.params).length) n = MATH_.substParamsExact(n, fn.params);
  const terms = flattenAddSub(n);
  let amp = null, offset = new Rat(0n);
  for (const t of terms) {
    let a = null;
    if (t.node.isFunctionNode && (t.node.fn.name || t.node.fn) === 'abs') a = new Rat(1n);
    else if (t.node.fn === 'unaryMinus' && t.node.args[0].isFunctionNode && (t.node.args[0].fn.name || t.node.args[0].fn) === 'abs') a = new Rat(-1n);
    else if (t.node.isOperatorNode && t.node.op === '*') {
      a = new Rat(1n); let absSeen = false;
      for (const arg of t.node.args) {
        if (arg.isFunctionNode && (arg.fn.name || arg.fn) === 'abs') { if (absSeen) { a = null; break; } absSeen = true; }
        else { const c = coeffFromNodeConst(arg); if (c === null) { a = null; break; } a = a.mul(c); }
      }
      if (!absSeen) a = null;
    }
    if (a !== null) {
      if (amp !== null) return null;
      amp = a.abs();
    } else {
      const pc = MATH_.polyCoeffsExact(t.node);
      if (!pc || pc.length !== 1) return null;
      offset = t.sign > 0 ? offset.add(pc[0]) : offset.sub(pc[0]);
    }
  }
  if (amp === null) return null;
  if (amp.isZero()) return { exact: true, approx: false, parts: [mkPart(offset.toNumber(), offset.toNumber(), false, false, offset.toTeX(), offset.toTeX())] };
  return { exact: true, approx: false, parts: [mkPart(offset.toNumber(), Infinity, false, true, offset.toTeX(), null)] };
}
function computeRange(fn, dom, iv) {
  iv = iv || { lo: -Infinity, loOpen: true, hi: Infinity, hiOpen: true };
  const full = iv.lo === -Infinity && iv.hi === Infinity;
  if (full) {
    const pc = MATH_.polyCoeffsExact(fn.expr);
    if (pc) { const r = polynomialRangeFull(pc); if (r) return r; }
    const rat = rationalizeParts(fn.expr);
    if (rat) { const r = rationalRangeFull(rat); if (r) return r; }
    const trig = boundedTrigRange(fn);
    if (trig) return trig;
    const ab = absRange(fn.expr) || absLinearRange(fn);
    if (ab) return ab;
  }
  return rangeOnInterval(fn, iv, dom);
}
/* 区间分析：给定 [lo,hi] 的单调性/零点/极值/值域 */
function analyzeOnInterval(fn, iv) {
  const dom = MATH_.analyzeDomain(fn);
  const mono = monotonicAnalysis(fn, dom, iv);
  const lr = isFinite(iv.lo) ? iv.lo : -20;
  const hr = isFinite(iv.hi) ? iv.hi : 20;
  const roots = MATH_.findRoots(fn.expr, fn.params, [lr, hr]);
  const zeros = roots.roots.filter(o => o.x > iv.lo && o.x < iv.hi)
    .filter(o => !dom.poles.some(p => Math.abs(p - o.x) < 1e-6));
  const endpointZero = x => {
    if (!isFinite(x)) return null;
    const y = FRONTEND.evalFn(fn, x, fn.params);
    if (Math.abs(y) < 1e-9) return { x, tex: fmtNum(x, 4), exact: false };
    return null;
  };
  if (!iv.loOpen) { const z = endpointZero(iv.lo); if (z && !zeros.some(o => Math.abs(o.x - z.x) < 1e-6)) zeros.push(z); }
  if (!iv.hiOpen) { const z = endpointZero(iv.hi); if (z && !zeros.some(o => Math.abs(o.x - z.x) < 1e-6)) zeros.push(z); }
  zeros.sort((a, b) => a.x - b.x);
  const range = computeRange(fn, dom, iv);
  return { monotonic: mono.intervals, monotonicConst: mono.constant, monotonicDegenerate: mono.degenerate, zeros, zerosCompleteness: roots.completeness, extrema: mono.extrema, range };
}

function detectParity(fn) {
  const N = 8;
  let even = true, odd = true;
  for (let i = 1; i <= N; i++) {
    const x = i * 0.7;
    const fx = FRONTEND.evalFn(fn, x, fn.params);
    const fnx = FRONTEND.evalFn(fn, -x, fn.params);
    if (!isFinite(fx) || !isFinite(fnx)) { even = odd = false; break; }
    if (Math.abs(fx - fnx) > 1e-6) even = false;
    if (Math.abs(fx + fnx) > 1e-6) odd = false;
  }
  if (even) return '偶函数';
  if (odd) return '奇函数';
  return null;
}

/* ---------- 推导 ---------- */
function checkStep(beforeNode, afterNode, domain) {
  const numOk = FRONTEND.numericEqual(beforeNode, afterNode, domain, 8);
  const symOk = FRONTEND.symbolicallyEqual(beforeNode, afterNode);
  return { ok: numOk && symOk, numeric: numOk, symbolic: symOk };
}

function buildDerivation(fn, goal, opts) {
  // 返回 Derivation 对象
  const steps = [];
  const node = fn.expr;
  const params = fn.params;
  const result = { goal, title: goalTitle(goal), steps, conclusion: null, meta: {} };

  if (goal === 'analyze') {
    result.title = '函数分析';
    // 提供「展开/配方」等演示步骤仅当多项式
    const pc = MATH_.polyCoeffsExact(node);
    if (pc && pc.length >= 2) {
      const tex = polyTex(pc);
      steps.push(makeStep('整理为标准形式', tex, '将各项按降幂排列，合并同类项。', 'basic', null, null,
        ['f(x) = ' + FRONTEND.nodeToTex(node), '= ' + tex]));
      // 配方（二次）
      if (pc.length === 3) {
        const a = pc[2], b = pc[1], c = pc[0];
        const h = b.neg().div(a.mul(new Rat(2n)));
        const k = c.sub(a.mul(h.mul(h)));
        const vertexTex = a.toTeX() + '(x' + (h.sign() >= 0 ? '+' : '') + h.toTeX() + ')^2' + (k.sign() >= 0 ? '+' : '') + k.toTeX();
        const before = node, after = math.parse(vertexTex.replace(/\^/g, '^'));
        const v = checkStep(before, after, [-20, 20]);
        const al = ['f(x) = ' + tex];
        if (a.eq(new Rat(1n))) {
          const half = b.div(new Rat(2n)), halfSq = half.mul(half);
          const bx = b.isZero() ? '' : (b.eq(new Rat(1n)) ? '+x' : b.eq(new Rat(-1n)) ? '-x' : (b.sign() >= 0 ? '+' : '') + b.toTeX() + 'x');
          al.push('= (x^{2}' + bx + (halfSq.sign() >= 0 ? '+' : '') + halfSq.toTeX() + ')' + (k.sign() >= 0 ? '+' : '') + k.toTeX());
        }
        al.push('= ' + vertexTex);
        steps.push(makeStep('配方（完成平方）', 'f(x)=' + vertexTex, '二次函数配成顶点式 f(x)=a(x-h)²+k，顶点为 (h,k)，开口方向由 a 决定。', 'key', v, { kind: 'text', payload: 'h=-b/(2a)，k=f(h)。顶点坐标 ' + h.toDisplay() + ', ' + k.toDisplay() }, al));
      }
    }
    result.conclusion = { tex: null, text: '见左侧「分析」页签的完整结果。', badges: [] };
  } else if (goal === 'compare') {
    result.title = '比较 f 与 g';
    buildCompareSteps(result, steps);
  } else if (goal === 'intersection') {
    result.title = '联立求交点';
    buildIntersectionSteps(result, steps);
  } else if (goal === 'roots') {
    result.title = '求零点';
    const roots = MATH_.findRoots(node, params, [-20, 20]);
    const tex = roots.roots.map(o => o.tex).join(' \\ \\text{或} \\ ') || '\\text{（无实根）}';
    const alRoot = ['f(x) = 0', FRONTEND.nodeToTex(node) + ' = 0'];
    const pc = MATH_.polyCoeffsExact(node);
    if (pc && pc.length === 3) {
      const cc = pc[0], bb = pc[1], aa = pc[2];
      if (!aa.isZero()) {
        const disc = bb.mul(bb).sub(aa.mul(cc).mul(new Rat(4n)));
        alRoot.push('\\Delta = b^2 - 4ac = ' + disc.toTeX());
        const discTex = sqrtRatTeX(disc);
        if (discTex && disc.sign() >= 0) alRoot.push('x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = \\frac{' + bb.neg().toTeX() + ' \\pm ' + discTex + '}{' + aa.mul(new Rat(2n)).toTeX() + '}');
      }
    }
    alRoot.push('x = ' + tex);
    steps.push(makeStep('解方程 f(x)=0', 'x=' + tex, roots.roots.length ? '令函数值为零，解出方程的解即为零点。' : '判别式 Δ<0，无实根。', 'key', null, null, alRoot));
    result.conclusion = { tex: roots.roots.length ? 'x = ' + roots.roots.map(o => o.tex).join(' \\ \\text{或} \\ ') : null, text: roots.roots.length ? roots.roots.length + ' 个零点' : '无实根（判别式 Δ<0）', badges: [completenessBadge(roots.completeness)] };
  } else if (goal === 'continuity') {
    result.title = '连续性判定';
    const cont = checkContinuity(fn);
    const domTex = domainIntervalTeX(cont.domain);
    steps.push(makeStep('确定定义域', 'D = ' + domTex, '先求定义域，间断只可能出现在无定义处或分段拼接处。', 'basic', null, null, ['f(x) = ' + FRONTEND.nodeToTex(fn.expr), '定义域：' + domTex]));
    if (cont.points.length) {
      steps.push(makeStep('列出可疑间断点', 'x \\in \\{' + cont.points.map(p => fmtNum(p.x, 4)).join(',\\,') + '\\}', '可疑点包括极点、洞、分段拼接点。', 'basic', null, null, cont.points.map(p => 'x=' + fmtNum(p.x, 4) + '（' + p.type + '）')));
      for (const p of cont.points) {
        const l = MATH_.approxLimit(fn, p.x, -1), r = MATH_.approxLimit(fn, p.x, 1);
        const limTeX = v => v === Infinity ? '+\\infty' : v === -Infinity ? '-\\infty' : v === null ? '?' : fmtNum(v, 5);
        const al = ['\\lim_{x\\to ' + fmtNum(p.x, 4) + '^-} f(x) = ' + limTeX(l), '\\lim_{x\\to ' + fmtNum(p.x, 4) + '^+} f(x) = ' + limTeX(r)];
        const v = FRONTEND.evalFn(fn, p.x, fn.params);
        if (isFinite(v)) al.push('f(' + fmtNum(p.x, 4) + ') = ' + fmtNum(v, 5));
        steps.push(makeStep('分析 x=' + fmtNum(p.x, 4), p.type, p.reason, 'key', { ok: true, numeric: true, symbolic: true }, null, al));
      }
      result.conclusion = { tex: null, text: '函数在 x=' + cont.points.map(p => fmtNum(p.x, 4)).join('、') + ' 处不连续（' + [...new Set(cont.points.map(p => p.type))].join('、') + '）。', badges: [STR.window] };
    } else {
      steps.push(makeStep('无可疑间断点', '初等函数在其定义域内处处连续', '定义域内无极点、洞或分段拼接不连续点。', 'basic', null, null, []));
      result.conclusion = { tex: null, text: '函数在其定义域内处处连续。', badges: [STR.exact] };
    }
  } else if (goal === 'derivative') {
    const n = (opts && opts.order) || 1;
    if (n === 1) {
      const pc = MATH_.polyCoeffsExact(node);
      const dnode = MATH_.derivativeOf(node, params);
      if (pc && pc.length >= 2) {
        const al = ['f(x) = ' + polyTex(pc)];
        const dpc = new Array(Math.max(0, pc.length - 1)).fill(null).map(() => new Rat(0n));
        for (let i = 1; i < pc.length; i++) { const c = pc[i]; if (c.isZero()) continue; const nc = c.mul(new Rat(BigInt(i), 1n)); dpc[i - 1] = nc; al.push('(' + monoTeX(c, i) + ')' + "' = " + monoTeX(nc, i - 1)); }
        al.push("f'(x) = " + (dnode ? FRONTEND.nodeToTex(dnode) : polyTex(dpc)));
        steps.push(makeStep('逐项求导', "f'(x)=" + (dnode ? FRONTEND.nodeToTex(dnode) : polyTex(dpc)), '多项式逐项求导：(cx^n)' + "'" + '=ncx^{n-1}。', 'key', { ok: true, numeric: true, symbolic: true }, null, al));
      } else {
        const al = ['f(x) = ' + FRONTEND.nodeToTex(node), "f'(x) = " + (dnode ? FRONTEND.nodeToTex(dnode) : '…')];
        steps.push(makeStep('求一阶导', dnode ? "f'(x)=" + FRONTEND.nodeToTex(dnode) : '无法求导', '应用求导法则（和差/乘积/商/链式法则）。', 'key', dnode ? { ok: true, numeric: true, symbolic: true } : null, null, al));
      }
    } else {
      const nth = MATH_.nthDerivative(node, n);
      if (nth.formula) {
        steps.push(makeStep('n 阶导通式', nth.formula, '先求低阶导观察规律，再归纳出 n 阶导通式。', 'key', { ok: true, numeric: true, symbolic: true }, null, nth.formulaSteps || []));
      } else {
        steps.push(makeStep('求 n 阶导', 'f^{(' + n + ')}(x)=' + nth.tex, '无闭式通式，逐阶递归求导。', 'key', { ok: true, numeric: true, symbolic: true }, null, ['f^{(' + n + ')}(x) = ' + nth.tex]));
      }
    }
    const diff = checkDifferentiability(fn);
    if (diff.nonDiff.length) {
      steps.push(makeStep('不可导点判定', 'x \\in \\{' + diff.nonDiff.map(p => fmtNum(p.x, 4)).join(',\\,') + '\\}', '检查间断点、绝对值尖点、分段角点、垂直切线。', 'advanced', { ok: true, numeric: true, symbolic: true }, null, diff.nonDiff.map(p => 'x=' + fmtNum(p.x, 4) + '：' + p.reason)));
      result.conclusion = { tex: null, text: '函数在 x=' + diff.nonDiff.map(p => fmtNum(p.x, 4)).join('、') + ' 处不可导；其余各点可导。', badges: [STR.window] };
    } else {
      result.conclusion = { tex: null, text: '函数在其定义域内处处可导。', badges: [STR.exact] };
    }
  } else if (goal === 'differential') {
    result.title = '可微性判定（微分）';
    const diff = checkDifferentiability(fn);
    const d1 = MATH_.derivativeOf(node, params);
    const dtex = d1 ? FRONTEND.nodeToTex(d1) : '…';
    steps.push(makeStep('可微 ⟺ 可导', '一元函数在 x=a 可微 ⟺ 在 x=a 可导', '这是实数域一元函数的等价定理。', 'basic', null, null, ["定理：f 在 x=a 可微 \\iff f'(a) 存在"]));
    steps.push(makeStep('求导', "f'(x)=" + dtex, '可微性取决于导数是否存在。', 'key', null, null, ['f(x) = ' + FRONTEND.nodeToTex(node), "f'(x) = " + dtex]));
    steps.push(makeStep('写出微分形式', "dy = f'(x)\\,dx", "微分是函数增量的线性主部 Δy = f'(a)Δx + o(Δx)。", 'key', null, null, ["dy = f'(x)dx", "在 x=a 处：dy = f'(a)dx"]));
    if (diff.nonDiff.length) result.conclusion = { tex: null, text: '函数在 x=' + diff.nonDiff.map(p => fmtNum(p.x, 4)).join('、') + ' 处不可微（=不可导）；其余各点可微。', badges: [STR.window] };
    else result.conclusion = { tex: null, text: "函数处处可微，微分 dy=f'(x)dx。", badges: [STR.exact] };
  } else if (goal === 'integral') {
    const n = (opts && opts.order) || 1;
    if (n === 1) {
      const F = MATH_.integrate(node);
      if (F) {
        const al = ['\\int f(x)\\,dx = \\int ' + FRONTEND.nodeToTex(node) + '\\,dx'];
        for (const s of F.steps) al.push('\\;\\;\\;' + s.before + ' = ' + s.after);
        al.push('= ' + F.tex + ' + C');
        steps.push(makeStep('求原函数', '\\int f(x)dx = ' + F.tex + ' + C', '逐项/基本公式/换元/分部积分求出原函数 F(x)。', 'key', { ok: true, numeric: true, symbolic: true }, null, al));
        const Fp = MATH_.derivativeOf(F.node);
        const vOk = Fp ? FRONTEND.symbolicallyEqual(Fp, node) : false;
        steps.push(makeStep("验证 F'=f", vOk ? "F'(x)=f(x)\\ \\checkmark" : '（数值核对）', '对原函数求导，应还原被积函数。', 'advanced', { ok: !!vOk, numeric: Fp ? FRONTEND.numericEqual(Fp, node, [-10, 10], 8) : false, symbolic: !!vOk }, null, ['F(x) = ' + F.tex, "F'(x) = " + (Fp ? FRONTEND.nodeToTex(Fp) : '…'), "核对 F'(x) = f(x)"]));
        result.conclusion = { tex: '\\int ' + FRONTEND.nodeToTex(node) + '\\,dx = ' + F.tex + ' + C', text: '原函数 F(x) = ' + F.tex + ' + C。', badges: [STR.exact] };
      } else {
        result.conclusion = { tex: null, text: '该函数暂不支持符号积分（超出可精确积分的函数表）。', badges: [] };
      }
    } else {
      const nth = MATH_.nthIntegral(node, n);
      if (nth.formula) {
        steps.push(makeStep('n 重积分通式', nth.formula, '逐重积分并归纳通式。', 'key', { ok: true, numeric: true, symbolic: true }, null, nth.formulaSteps || []));
        result.conclusion = { tex: '\\int^{(n)}f\\,dx = ' + nth.tex, text: 'n=' + n + ' 重积分结果。', badges: [STR.exact] };
      } else if (nth.partial) {
        result.conclusion = { tex: null, text: '该函数无法完整求 n 重符号积分。', badges: [] };
      } else {
        steps.push(makeStep('逐重积分', '\\int^{(n)}f\\,dx = ' + nth.tex, '递归逐重积分。', 'key', { ok: true, numeric: true, symbolic: true }, null, nth.formulaSteps || []));
        result.conclusion = { tex: '\\int^{(n)}f\\,dx = ' + nth.tex, text: 'n=' + n + ' 重积分结果。', badges: [STR.window] };
      }
    }
  } else if (goal === 'integrability') {
    result.title = '可积性判定与定积分';
    const a = (opts && opts.a !== undefined) ? opts.a : -10;
    const b = (opts && opts.b !== undefined) ? opts.b : 10;
    if (!(a < b)) { result.conclusion = { tex: null, text: '区间无效（需 a<b 的有限闭区间）。', badges: [] }; return result; }
    const integ = checkIntegrability(fn, a, b);
    steps.push(makeStep('判断区间上的连续性与有界性', integ.integrable ? 'f 在 [' + fmtNum(a) + ',' + fmtNum(b) + '] 上连续 ⇒ 可积' : '区间内含无穷间断点 ⇒ 无界不可积', '闭区间上连续函数必可积（黎曼可积）；有界且仅有有限个间断点亦可积。', 'basic', null, null, ['区间：[' + fmtNum(a) + ',' + fmtNum(b) + ']', integ.integrable ? '区间内无极点，f 连续' : '区间内含极点 x=' + integ.polesIn.map(p => fmtNum(p.x, 4)).join('、')]));
    if (integ.integrable && integ.defInt) {
      const di = integ.defInt;
      const al = ['求原函数：F(x) = ' + di.antideriv.tex];
      for (const s of di.antideriv.steps) al.push('\\;\\;\\;' + s.before + ' = ' + s.after);
      al.push('牛顿-莱布尼茨公式：\\int_a^b f\\,dx = F(b) - F(a)');
      al.push('= ' + (di.exact ? di.tex : fmtNum(di.valueNum)));
      steps.push(makeStep('牛顿-莱布尼茨求定积分', '\\int_{' + fmtNum(a) + '}^{' + fmtNum(b) + '} f\\,dx = ' + (di.exact ? di.tex : fmtNum(di.valueNum)), '先求原函数，再用 F(b)-F(a)。', 'key', { ok: true, numeric: true, symbolic: di.exact }, null, al));
      result.conclusion = { tex: '\\int_{' + fmtNum(a) + '}^{' + fmtNum(b) + '} f(x)\\,dx = ' + (di.exact ? di.tex : fmtNum(di.valueNum)), text: '函数在 [' + fmtNum(a) + ',' + fmtNum(b) + '] 上可积，定积分值为 ' + (di.exact ? di.tex : fmtNum(di.valueNum)) + '。', badges: [di.exact ? STR.exact : STR.window] };
    } else if (integ.integrable) {
      result.conclusion = { tex: null, text: '函数可积，但符号积分失败（可改用数值积分近似）。', badges: [STR.window] };
    } else {
      result.conclusion = { tex: null, text: '函数在 [' + fmtNum(a) + ',' + fmtNum(b) + '] 上不可积（区间内含无穷间断点）。', badges: [] };
    }
  } else if (goal === 'implicitDerivative') {
    result.title = '隐函数求导';
    let Fnode = null, Ftex = null;
    if (fn.implicit && fn.conicType) {
      Fnode = MATH_.conicImplicitNode(fn);
      Ftex = fn.implicitTex;
    }
    if (!Fnode) { result.conclusion = { tex: null, text: '仅支持圆锥曲线（圆/椭圆/双曲线/抛物线）的隐函数求导。', badges: [] }; return result; }
    const id = MATH_.implicitDerivative(Fnode);
    if (!id || !id.dydx) { result.conclusion = { tex: null, text: '隐函数求导失败（F 不可偏导）。', badges: [] }; return result; }
    const al = ['F(x,y) = ' + (Ftex || FRONTEND.nodeToTex(Fnode)) + ' = 0', '两边对 x 求导（y 视作 x 的函数，链式法则）：', "F_x + F_y \\cdot y' = 0", 'F_x = ' + FRONTEND.nodeToTex(id.fx), 'F_y = ' + FRONTEND.nodeToTex(id.fy), "y' = -\\frac{F_x}{F_y} = " + FRONTEND.nodeToTex(id.dydx)];
    steps.push(makeStep('两边对 x 求导', "y'=-\\frac{F_x}{F_y}", '隐式方程 F(x,y)=0 两边对 x 求导，用链式法则解出 dy/dx。', 'key', { ok: true, numeric: true, symbolic: true }, null, al));
    result.conclusion = { tex: '\\frac{dy}{dx} = ' + FRONTEND.nodeToTex(id.dydx), text: '隐函数求导结果。', badges: [STR.exact] };
  } else if (goal === 'paramDerivative') {
    result.title = '参数方程求导';
    const pd = MATH_.paramDerivative(fn);
    if (!pd || !pd.ok) { result.conclusion = { tex: null, text: '参数方程求导失败（源函数不可导）。', badges: [] }; return result; }
    const al = [
      '\\begin{cases} x(t) = ' + pd.Xtex + ' \\\\ y(t) = ' + pd.Ytex + ' \\end{cases}',
      '\\text{其中 } f(t) = ' + pd.ftex + '\\text{，} f\'(t) = ' + pd.fptex,
      '\\text{两边对 } t \\text{ 求导：}',
      '\\frac{dx}{dt} = ' + pd.dXtex,
      '\\frac{dy}{dt} = ' + pd.dYtex,
      '\\frac{dy}{dx} = \\frac{dy/dt}{dx/dt} = ' + pd.dydxTex,
    ];
    steps.push(makeStep('参数方程求导', '\\frac{dy}{dx} = ' + pd.dydxTex, '由链式法则 dy/dx = (dy/dt)/(dx/dt)；θ=' + pd.thetaDeg + '° 为固定旋转角。', 'key', { ok: true, numeric: true, symbolic: true }, null, al));
    result.conclusion = { tex: '\\frac{dy}{dx} = ' + pd.dydxTex, text: '参数曲线在参数 t 处的切线斜率（θ=' + pd.thetaDeg + '°）。', badges: [STR.exact] };
  }

  return result;
}
/* 由符号表结果生成区间写法结论：f>g ⟺ x∈(...)∪(...) 等 */
function compareIntervalConclusion(st) {
  if (!st || !st.intervals.length || !st.crits.length) return null;
  if (st.intervals.length !== st.crits.length + 1) return null;
  const gt = [], lt = [];
  for (let i = 0; i < st.intervals.length; i++) {
    const s = st.intervals[i].sign;
    if (!s) continue; // 零测度区间（重根点）跳过
    const loTex = i === 0 ? '-\\infty' : st.crits[i - 1].tex;
    const hiTex = i === st.intervals.length - 1 ? '+\\infty' : st.crits[i].tex;
    const iv = '(' + loTex + ',\\ ' + hiTex + ')';
    if (s > 0) gt.push(iv); else if (s < 0) lt.push(iv);
  }
  const lines = [];
  if (gt.length) lines.push('f>g \\iff x \\in ' + gt.join(' \\cup '));
  if (lt.length) lines.push('f<g \\iff x \\in ' + lt.join(' \\cup '));
  return lines.length ? lines : null;
}
/* 比较两支的公共 x 范围（限定符号表/求根） */
function commonCompareRange(fb, gb) {
  const fins = [];
  for (const d of fb.domains) { if (isFinite(d[0])) fins.push(d[0]); if (isFinite(d[1])) fins.push(d[1]); }
  for (const d of gb.domains) { if (isFinite(d[0])) fins.push(d[0]); if (isFinite(d[1])) fins.push(d[1]); }
  if (!fins.length) return [-20, 20];
  let lo = Math.min(...fins), hi = Math.max(...fins);
  const pad = (hi - lo) * 0.05 || 1;
  lo = Math.max(-30, lo - pad); hi = Math.min(30, hi + pad);
  return lo < hi ? [lo, hi] : [-20, 20];
}
/* 求差 h=f支−g支 的零点：radical vs 多项式走精确移项平方，否则数值 */
function solveCompareRoots(fb, gb, range) {
  if (fb.radical && fb.node && gb.node && !gb.radical) {
    const gpc = MATH_.polyCoeffsExact(gb.node);
    if (gpc) {
      const r = MATH_.solveRadicalEquation(fb, gb.node, null, range);
      if (r) return { roots: r.roots, exact: r.exact, radicalSteps: r, radicalOn: 'f' };
    }
  }
  if (gb.radical && gb.node && fb.node && !fb.radical) {
    const fpc = MATH_.polyCoeffsExact(fb.node);
    if (fpc) {
      const r = MATH_.solveRadicalEquation(gb, fb.node, null, range);
      if (r) return { roots: r.roots, exact: r.exact, radicalSteps: r, radicalOn: 'g' };
    }
  }
  const h = x => { const yf = fb.yAt(x), yg = gb.yAt(x); return (isFinite(yf) && isFinite(yg)) ? (yf - yg) : NaN; };
  const roots = MATH_.scanRoots(h, range[0], range[1], 2000);
  return { roots: roots.map(x => ({ x, tex: fmtNum(x), exact: false })), exact: false, radicalSteps: null, radicalOn: null };
}
/* 分支差值的符号表（基于 yAt 数值采样） */
function branchSignTable(fb, gb, range) {
  const h = x => { const yf = fb.yAt(x), yg = gb.yAt(x); return (isFinite(yf) && isFinite(yg)) ? (yf - yg) : NaN; };
  const roots = MATH_.scanRoots(h, range[0], range[1], 2000);
  const crits = roots.map(x => ({ x, tex: fmtNum(x), kind: 'root' })).sort((a, b) => a.x - b.x);
  const intervals = [];
  const all = [range[0], ...roots, range[1]];
  for (let i = 0; i < all.length - 1; i++) {
    const lo = all[i], hi = all[i + 1];
    const mid = (lo + hi) / 2;
    const v = h(mid);
    intervals.push({ lo, hi, sign: isNaN(v) ? 0 : (v > 0 ? 1 : v < 0 ? -1 : 0) });
  }
  return { crits, intervals };
}
/* 两支公共定义域交集（用于把结论限定在合法 x 范围） */
function intersectDomains(fb, gb) {
  const out = [];
  for (const d1 of fb.domains) for (const d2 of gb.domains) {
    const lo = Math.max(d1[0], d2[0]), hi = Math.min(d1[1], d2[1]);
    if (lo < hi) out.push([lo, hi]);
  }
  return out;
}
/* 分支比较的区间写法结论：用公共定义域端点（而非硬编码 ±∞） */
function branchCompareConclusion(st, common) {
  if (!st || !st.intervals.length || !st.crits.length) return null;
  if (st.intervals.length !== st.crits.length + 1) return null;
  const domLo = common.length ? common[0][0] : -Infinity;
  const domHi = common.length ? common[common.length - 1][1] : Infinity;
  const domLoTex = isFinite(domLo) ? fmtNum(domLo) : '-\\infty';
  const domHiTex = isFinite(domHi) ? fmtNum(domHi) : '+\\infty';
  const gt = [], lt = [];
  for (let i = 0; i < st.intervals.length; i++) {
    const s = st.intervals[i].sign;
    if (!s) continue;
    const loTex = i === 0 ? domLoTex : st.crits[i - 1].tex;
    const hiTex = i === st.intervals.length - 1 ? domHiTex : st.crits[i].tex;
    const iv = '(' + loTex + ',\\ ' + hiTex + ')';
    if (s > 0) gt.push(iv); else if (s < 0) lt.push(iv);
  }
  const lines = [];
  if (gt.length) lines.push('f>g \\iff x \\in ' + gt.join(' \\cup '));
  if (lt.length) lines.push('f<g \\iff x \\in ' + lt.join(' \\cup '));
  return lines.length ? lines : null;
}

/* 比大小完整推导：显式化 → 作差 → 求根（精确/数值） → 符号表 → 结论 */
function buildCompareSteps(result, steps) {
  const s = GLOBAL_STORE;
  if (!s || !s.compareTarget) { result.conclusion = { tex: null, text: '请先选择两个函数或分支进行比较。', badges: [] }; return; }
  const br = s.getCompareBranches();
  if (!br) { result.conclusion = { tex: null, text: '所选曲线无法显式化为 y=f(x) 分支，暂不支持比较。', badges: [] }; return; }
  const fb = br.f, gb = br.g;
  const fLabel = fb.sourceKind === 'explicit' ? br.fName : (br.fName + '·' + fb.label);
  const gLabel = gb.sourceKind === 'explicit' ? br.gName : (br.gName + '·' + gb.label);
  result.title = '比较 ' + fLabel + ' 与 ' + gLabel;

  // 步骤 0：显式化
  if (fb.sourceKind !== 'explicit' || gb.sourceKind !== 'explicit') {
    const alEx = [];
    if (fb.sourceKind === 'conic') { alEx.push('由隐式方程解出 y，取 ' + fb.label + '：'); alEx.push('y = ' + (fb.tex || '…')); }
    else if (fb.sourceKind === 'parametric') { alEx.push(br.fName + '：x=X(t), y=Y(t)'); alEx.push('按 X(t) 单调段拆分，得 ' + fb.label + ' 的 y=f(x)'); }
    if (gb.sourceKind === 'conic') { alEx.push('由隐式方程解出 y，取 ' + gb.label + '：'); alEx.push('y = ' + (gb.tex || '…')); }
    else if (gb.sourceKind === 'parametric') { alEx.push(br.gName + '：x=X(t), y=Y(t)'); alEx.push('按 X(t) 单调段拆分，得 ' + gb.label + ' 的 y=f(x)'); }
    steps.push(makeStep('显式化', '化为 y=f(x) 分支', '非 y=f(x) 曲线先化为若干 y=f(x) 分支，再逐支比较大小。', 'basic', null, null, alEx));
  }

  // 作差
  let diff = null;
  if (fb.node && gb.node) { try { diff = MATH_.opNode(fb.node, gb.node, 'sub'); } catch (e) { diff = null; } }
  const alSub = ['h(x) = f(x) - g(x)'];
  if (diff) {
    alSub.push('= (' + (fb.tex || FRONTEND.nodeToTex(fb.node)) + ') - (' + (gb.tex || FRONTEND.nodeToTex(gb.node)) + ')');
    let expanded = null;
    try { const r = math.rationalize(diff); if (r.toString() !== diff.toString()) expanded = r; } catch (e) {}
    if (expanded) alSub.push('= ' + FRONTEND.nodeToTex(expanded));
  } else {
    alSub.push('（分支为数值反解，作差按数值采样进行）');
  }
  steps.push(makeStep('作差', diff ? 'h(x)=' + FRONTEND.nodeToTex(diff) : 'h(x)=f支-g支', '比较两曲线大小，等价于研究差 h=f−g 的正负号。', 'basic', { ok: true, numeric: true, symbolic: true }, null, alSub));

  // 求根
  const range = commonCompareRange(fb, gb);
  const sol = solveCompareRoots(fb, gb, range);
  const roots = sol.roots;
  if (sol.radicalSteps) {
    const rs = sol.radicalSteps;
    const alRad = [];
    alRad.push('含 √ 的支：y = ' + (sol.radicalOn === 'f' ? (fb.tex || '…') : (gb.tex || '…')));
    alRad.push('另一侧：y = ' + (sol.radicalOn === 'f' ? (gb.tex || FRONTEND.nodeToTex(gb.node)) : (fb.tex || FRONTEND.nodeToTex(fb.node))));
    alRad.push('移项平方得：' + FRONTEND.nodeToTex(rs.equation) + ' = 0');
    alRad.push('求根后验根（√ 内非负、两侧同号、回代吻合）');
    alRad.push(roots.length ? ('x = ' + roots.map(o => o.tex).join(' 或 ')) : '无满足验根条件的实根');
    steps.push(makeStep('解无理方程（移项平方+验根）', roots.length ? ('x=' + roots.map(o => o.tex).join(' 或 ')) : '无实根', '对含 √ 的方程移项平方，得多项式方程求根，再回代验根排除增根。', 'key', { ok: true, numeric: true, symbolic: sol.exact }, null, alRad));
  } else if (roots.length) {
    const alRoot = ['h(x) = 0'];
    if (diff) {
      alRoot.push(FRONTEND.nodeToTex(diff) + ' = 0');
      const pc = MATH_.polyCoeffsExact(diff);
      if (pc && pc.length === 3) {
        const cc = pc[0], bb = pc[1], aa = pc[2];
        if (!aa.isZero()) {
          const disc = bb.mul(bb).sub(aa.mul(cc).mul(new Rat(4n)));
          const discTex = sqrtRatTeX(disc);
          alRoot.push('\\Delta = b^2-4ac = ' + disc.toTeX());
          if (discTex && disc.sign() >= 0) alRoot.push('x = \\frac{-b\\pm\\sqrt{\\Delta}}{2a} = \\frac{' + bb.neg().toTeX() + '\\pm' + discTex + '}{' + aa.mul(new Rat(2n)).toTeX() + '}');
        }
      }
    }
    alRoot.push('x = ' + roots.map(o => o.tex).join(' 或 '));
    steps.push(makeStep('求 h 的零点', 'x=' + roots.map(o => o.tex).join(' 或 '), '令差为零求出分界点，再用符号表判断各区间的正负。', 'key', { ok: true, numeric: true, symbolic: sol.exact }, null, alRoot));
  }

  // 符号表
  const st = branchSignTable(fb, gb, range);
  if (st.intervals.length) {
    const sigStr = st.intervals.map(iv => (iv.sign > 0 ? 'f>g' : iv.sign < 0 ? 'f<g' : 'f=g')).join(' → ');
    const alSig = ['在公共定义域各区间取测试点代入 h：', '符号变化：' + st.intervals.map(iv => (iv.sign > 0 ? '正' : iv.sign < 0 ? '负' : '零')).join(' → ')];
    steps.push(makeStep('符号表（穿根法）', '符号：' + sigStr, '在相邻零点之间取测试点，代入 h 判断正负。', 'advanced', { ok: true, numeric: true, symbolic: true }, null, alSig));
  }

  // 结论（区间写法限定在公共定义域内）
  const common = intersectDomains(fb, gb);
  let conclTex = null;
  if (roots.length) conclTex = branchCompareConclusion(st, common);
  else if (st.intervals.length === 1 && st.intervals[0].sign !== 0) {
    conclTex = (st.intervals[0].sign > 0 ? 'f>g' : 'f<g') + '\\ \\text{在公共定义域上恒成立}';
  }
  result.conclusion = {
    tex: conclTex,
    text: conclTex ? '比较两曲线大小，即研究差 h=f−g 的正负号。' : '根据符号表判断 f 与 g 的大小关系。',
    badges: [sol.exact ? STR.exact : STR.window],
  };
}

/* 联立求交点：联立（y 相等）→ 显式化 → 作差 → 解方程 → 代回求 y → 交点 */
function buildIntersectionSteps(result, steps) {
  const s = GLOBAL_STORE;
  if (!s || !s.intersectionTarget) { result.conclusion = { tex: null, text: '请先选择两个函数进行联立。', badges: [] }; return; }
  const br = s.getIntersectionBranches();
  if (!br) { result.conclusion = { tex: null, text: '所选曲线无法显式化为 y=f(x) 分支，暂不支持联立。', badges: [] }; return; }
  const fb = br.f, gb = br.g;
  const fLabel = fb.sourceKind === 'explicit' ? br.fName : (br.fName + '·' + fb.label);
  const gLabel = gb.sourceKind === 'explicit' ? br.gName : (br.gName + '·' + gb.label);
  result.title = '联立 ' + fLabel + ' 与 ' + gLabel;

  const ftex = fb.tex || 'f(x)', gtex = gb.tex || 'g(x)';
  // 步骤 0：联立（y 值相等）
  steps.push(makeStep('联立方程', '\\begin{cases} y=' + ftex + '\\\\ y=' + gtex + '\\end{cases}', '两曲线相交 ⟺ 存在点 (x,y) 同时满足两式，即两式的 y 值相等。', 'basic', null, null, ['\\text{令两式右边相等（y 值相等）：}', ftex + ' = ' + gtex]));

  // 显式化（非 y=f(x) 曲线先化分支）
  if (fb.sourceKind !== 'explicit' || gb.sourceKind !== 'explicit') {
    const alEx = [];
    if (fb.sourceKind === 'conic') { alEx.push('由隐式方程解出 y，取 ' + fb.label + '：'); alEx.push('y = ' + ftex); }
    else if (fb.sourceKind === 'parametric') { alEx.push(br.fName + '：x=X(t), y=Y(t)'); alEx.push('按 X(t) 单调段拆分，得 ' + fb.label + ' 的 y=f(x)'); }
    if (gb.sourceKind === 'conic') { alEx.push('由隐式方程解出 y，取 ' + gb.label + '：'); alEx.push('y = ' + gtex); }
    else if (gb.sourceKind === 'parametric') { alEx.push(br.gName + '：x=X(t), y=Y(t)'); alEx.push('按 X(t) 单调段拆分，得 ' + gb.label + ' 的 y=f(x)'); }
    steps.push(makeStep('显式化', '化为 y=f(x) 分支', '非 y=f(x) 曲线先化为若干 y=f(x) 分支，再逐支联立。', 'basic', null, null, alEx));
  }

  // 作差
  let diff = null;
  if (fb.node && gb.node) { try { diff = MATH_.opNode(fb.node, gb.node, 'sub'); } catch (e) { diff = null; } }
  const alSub = ['h(x) = f(x) - g(x)'];
  if (diff) {
    alSub.push('= (' + ftex + ') - (' + gtex + ')');
    let expanded = null;
    try { const r = math.rationalize(diff); if (r.toString() !== diff.toString()) expanded = r; } catch (e) {}
    if (expanded) alSub.push('= ' + FRONTEND.nodeToTex(expanded));
  } else {
    alSub.push('（分支为数值反解，作差按数值采样进行）');
  }
  steps.push(makeStep('移项作差', (diff ? 'h(x)=' + FRONTEND.nodeToTex(diff) : 'h(x)=f支-g支') + '=0', '令 y 值相等得 f(x)=g(x)，移项得差为零，解出 x 即交点横坐标。', 'key', { ok: true, numeric: true, symbolic: true }, null, alSub));

  // 求根
  const range = commonCompareRange(fb, gb);
  const sol = solveCompareRoots(fb, gb, range);
  const roots = sol.roots;
  if (sol.radicalSteps) {
    const rs = sol.radicalSteps;
    const alRad = [];
    alRad.push('含 √ 的支：y = ' + (sol.radicalOn === 'f' ? ftex : gtex));
    alRad.push('另一侧：y = ' + (sol.radicalOn === 'f' ? gtex : ftex));
    alRad.push('移项平方得：' + FRONTEND.nodeToTex(rs.equation) + ' = 0');
    alRad.push('求根后验根（√ 内非负、两侧同号、回代吻合）');
    alRad.push(roots.length ? ('x = ' + roots.map(o => o.tex).join(' 或 ')) : '无满足验根条件的实根');
    steps.push(makeStep('解方程（移项平方+验根）', roots.length ? ('x=' + roots.map(o => o.tex).join(' 或 ')) : '无实根', '对含 √ 的方程移项平方求根，再回代验根排除增根。', 'key', { ok: true, numeric: true, symbolic: sol.exact }, null, alRad));
  } else if (roots.length) {
    const alRoot = ['h(x) = 0'];
    if (diff) {
      alRoot.push(FRONTEND.nodeToTex(diff) + ' = 0');
      const pc = MATH_.polyCoeffsExact(diff);
      if (pc && pc.length === 3) {
        const cc = pc[0], bb = pc[1], aa = pc[2];
        if (!aa.isZero()) {
          const disc = bb.mul(bb).sub(aa.mul(cc).mul(new Rat(4n)));
          const discTex = sqrtRatTeX(disc);
          alRoot.push('\\Delta = b^2-4ac = ' + disc.toTeX());
          if (discTex && disc.sign() >= 0) alRoot.push('x = \\frac{-b\\pm\\sqrt{\\Delta}}{2a} = \\frac{' + bb.neg().toTeX() + '\\pm' + discTex + '}{' + aa.mul(new Rat(2n)).toTeX() + '}');
        }
      }
    }
    alRoot.push('x = ' + roots.map(o => o.tex).join(' 或 '));
    steps.push(makeStep('解方程 h(x)=0', 'x=' + roots.map(o => o.tex).join(' 或 '), '解出差函数的零点，即两曲线交点的横坐标。', 'key', { ok: true, numeric: true, symbolic: sol.exact }, null, alRoot));
  }

  // 代回求 y
  const pts = roots.map(o => ({ x: o.x, y: fb.yAt(o.x), tex: o.tex }));
  if (roots.length) {
    const alY = ['\\text{把横坐标代回任一侧求纵坐标：}'];
    pts.forEach((p, i) => { alY.push('y_{' + (i + 1) + '} = f(x_{' + (i + 1) + '}) = ' + fmtNum(p.y, 5)); });
    const verifyAll = pts.every(p => isFinite(p.y) && isFinite(gb.yAt(p.x)) && Math.abs(p.y - gb.yAt(p.x)) < 1e-4);
    steps.push(makeStep('代回求纵坐标', 'y_i = f(x_i) = g(x_i)', '把横坐标代回任一侧（两式相等，结果一致），得到交点纵坐标。', 'key', { ok: verifyAll, numeric: true, symbolic: sol.exact }, null, alY));
  }

  // 结论
  if (pts.length) {
    const conclTex = pts.map(p => '(' + p.tex + ',\\ ' + fmtNum(p.y, 5) + ')').join('\\;,\\quad ');
    result.conclusion = {
      tex: '\\text{交点：}\\ ' + conclTex,
      text: '两曲线共有 ' + pts.length + ' 个交点。',
      badges: [sol.exact ? STR.exact : STR.window],
    };
  } else {
    result.conclusion = { tex: null, text: '两曲线无交点。', badges: [STR.exact] };
  }
  result.meta.intersections = pts;
}

/* 计算联立交点（供渲染层标亮），返回 [{x,y,tex,fName,gName,...}] 或 null */
function computeIntersections() {
  const s = GLOBAL_STORE;
  if (!s || !s.intersectionTarget) return null;
  const br = s.getIntersectionBranches();
  if (!br) return null;
  const range = commonCompareRange(br.f, br.g);
  const sol = solveCompareRoots(br.f, br.g, range);
  return sol.roots.map(o => ({ x: o.x, y: br.f.yAt(o.x), tex: o.tex, fName: br.fName, gName: br.gName, fColor: br.fColor, gColor: br.gColor }));
}

function goalTarget() {
  const s = GLOBAL_STORE;
  if (!s || !s.compareTarget) return null;
  return { f: s.getById(s.compareTarget.fId), g: s.getById(s.compareTarget.gId) };
}
var GLOBAL_STORE = null;

function makeStep(ruleName, eqTex, justification, tier, verify, detail, algebra) {
  const s = {
    id: 's' + Math.random().toString(36).slice(2, 7), ruleName, eqTex, justification, tier,
    verify: verify || null, detail: detail || null, caveats: [], algebra: algebra || null,
  };
  return s;
}
/* 化简二次根式：n = k²·m（m 为无平方因子），返回 {k,m}（BigInt） */
function simplifySqrtBigInt(n) {
  if (n < 0n) return null;
  let k = 1n, m = n;
  for (let i = 2n; i * i <= m; i++) {
    while (m % (i * i) === 0n) { m /= i * i; k *= i; }
  }
  return { k, m };
}
/* √(Rat) 的 TeX：√(n/d) = k√m / d */
function sqrtRatTeX(r) {
  if (r.sign() < 0) return null;
  const N = r.n * r.d, D = r.d;
  const s = simplifySqrtBigInt(N);
  if (!s) return null;
  const { k, m } = s;
  let body = m === 1n ? k.toString() : (k === 1n ? '' : k.toString()) + '\\sqrt{' + m + '}';
  return D === 1n ? body : '\\frac{' + body + '}{' + D + '}';
}
function goalTitle(goal) {
  return {
    analyze: '函数分析', compare: '比较 f 与 g', intersection: '联立求交点', roots: '求零点',
    continuity: '连续性判定', derivative: '求导', differential: '可微性判定',
    integrability: '可积性与定积分', integral: '积分', implicitDerivative: '隐函数求导', paramDerivative: '参数方程求导',
  }[goal] || '推导';
}
function completenessBadge(c) {
  return c === 'exact' ? STR.exact : c === 'periodic' ? STR.periodic : c === 'partial' ? STR.partial : STR.window;
}
function polyTex(pc) {
  let terms = [];
  for (let i = pc.length - 1; i >= 0; i--) {
    const c = pc[i];
    if (c.isZero()) continue;
    let t = '';
    if (i === 0) t = c.toTeX();
    else if (i === 1) t = (c.eq(new Rat(1n)) ? '' : c.eq(new Rat(-1n)) ? '-' : c.toTeX()) + 'x';
    else t = (c.eq(new Rat(1n)) ? '' : c.eq(new Rat(-1n)) ? '-' : c.toTeX()) + 'x^{' + i + '}';
    terms.push(t);
  }
  if (terms.length === 0) return '0';
  let s = terms.join('+').replace(/\+\-/g, '-');
  return s;
}

/* ================= 微积分判定辅助 ================= */
function monoTeX(c, i) {
  if (i === 0) return c.toTeX();
  const cs = c.eq(new Rat(1n)) ? '' : c.eq(new Rat(-1n)) ? '-' : c.toTeX();
  return cs + (i === 1 ? 'x' : 'x^{' + i + '}');
}
function domainIntervalTeX(dom) {
  if (!dom || !dom.intervals || !dom.intervals.length) return 'x \\in \\mathbb{R}';
  const parts = dom.intervals.map(iv => {
    const l = iv.lo === -Infinity ? '(-\\infty' : (iv.loOpen ? '(' : '[') + fmtNum(iv.lo, 4);
    const r = iv.hi === Infinity ? '+\\infty)' : fmtNum(iv.hi, 4) + (iv.hiOpen ? ')' : ']');
    return l + ', ' + r;
  });
  return 'x \\in ' + parts.join(' \\cup ');
}
function numericDerivative(fn, a, side) {
  const h = side * 1e-5;
  const y0 = FRONTEND.evalFn(fn, a, fn.params);
  const y1 = FRONTEND.evalFn(fn, a + h, fn.params);
  if (!isFinite(y0) || !isFinite(y1)) return null;
  return (y1 - y0) / h;
}
function piecewiseBounds(fn) {
  const pts = [];
  if (!fn.expr || fn.expr.kind !== 'piecewise') return pts;
  for (const c of fn.expr.cases) {
    const walk = nd => {
      if (!nd) return;
      if (nd.isConstantNode && typeof nd.value === 'number') pts.push(nd.value);
      if (nd.isOperatorNode && nd.op === '-') {
        const l = nd.args[0], r = nd.args[1];
        if (l.isSymbolNode && l.name === 'x' && r) { const rc = constToRat(r.value); if (rc) pts.push(rc.toNumber()); }
      }
      if (nd.args) nd.args.forEach(walk);
    };
    walk(c.cond);
  }
  return MATH_.dedupe(pts, 1e-9);
}
function sqrtEndpoints(node) {
  const out = [];
  const walk = nd => {
    if (!nd) return;
    if (nd.isFunctionNode && (nd.fn.name || nd.fn) === 'sqrt') {
      const pc = MATH_.polyCoeffsExact(nd.args[0]);
      if (pc && pc.length >= 2) {
        try { const r = MATH_.findRoots(nd.args[0], null, [-30, 30]); r.roots.forEach(o => { if (isFinite(o.x)) out.push(o.x); }); } catch (e) {}
      }
    }
    if (nd.args) nd.args.forEach(walk);
  };
  walk(node);
  return out;
}
function hasPoint(arr, x) { return arr.some(p => Math.abs(p.x - x) < 1e-9); }

function checkContinuity(fn) {
  const dom = MATH_.analyzeDomain(fn);
  const points = [];
  for (const p of dom.poles) points.push({ x: p, type: '无穷间断', kind: 'pole', reason: 'x=' + fmtNum(p, 4) + ' 处分母为零，函数值趋于无穷' });
  for (const h of dom.holes) points.push({ x: h.x, type: '可去间断', kind: 'hole', reason: 'x=' + fmtNum(h.x, 4) + ' 处未定义，但左右极限存在且相等' });
  for (const a of piecewiseBounds(fn)) {
    const l = MATH_.approxLimit(fn, a, -1), r = MATH_.approxLimit(fn, a, 1);
    if (l === null || r === null) continue;
    const v = FRONTEND.evalFn(fn, a, fn.params);
    if (Math.abs(l - r) > 1e-4) points.push({ x: a, type: '跳跃间断', kind: 'jump', reason: '左右极限不相等：\\lim_{x\\to a^-}=' + fmtNum(l, 5) + ',\\;\\lim_{x\\to a^+}=' + fmtNum(r, 5) });
    else if (!isFinite(v) || Math.abs(v - l) > 1e-4) points.push({ x: a, type: '可去间断', kind: 'hole', reason: '左右极限相等（=' + fmtNum(l, 5) + '）但不等于函数值' });
  }
  const seen = new Set();
  const uniq = points.filter(p => { const k = Math.round(p.x * 1e8); if (seen.has(k)) return false; seen.add(k); return true; });
  return { continuous: uniq.length === 0, points: uniq, domain: dom };
}
function checkDifferentiability(fn) {
  const deriv = MATH_.derivativeOf(fn.expr, fn.params);
  const nonDiff = [];
  const cont = checkContinuity(fn);
  for (const p of cont.points) nonDiff.push({ x: p.x, type: '间断点', reason: '不连续 ⇒ 不可导' });
  for (const x of absCorners(fn.expr)) if (!hasPoint(nonDiff, x)) nonDiff.push({ x, type: '尖点', reason: '|·| 在拐点处不可导' });
  for (const a of piecewiseBounds(fn)) {
    if (hasPoint(nonDiff, a)) continue;
    const dl = numericDerivative(fn, a, -1), dr = numericDerivative(fn, a, 1);
    if (dl === null || dr === null) continue;
    if (Math.abs(dl - dr) > 1e-2) nonDiff.push({ x: a, type: '角点', reason: "左右导数不等：f'_{-}=" + fmtNum(dl, 4) + ",\\;f'_{+}=" + fmtNum(dr, 4) });
  }
  for (const x of sqrtEndpoints(fn.expr)) {
    if (hasPoint(nonDiff, x)) continue;
    const dl = numericDerivative(fn, x, -1), dr = numericDerivative(fn, x, 1);
    if ((dl !== null && !isFinite(dl)) || (dr !== null && !isFinite(dr)) || (dl !== null && Math.abs(dl) > 1e4) || (dr !== null && Math.abs(dr) > 1e4)) nonDiff.push({ x, type: '垂直切线', reason: '切线竖直，导数趋于无穷' });
  }
  return { differentiable: nonDiff.length === 0, nonDiff, deriv };
}
function checkIntegrability(fn, a, b) {
  const cont = checkContinuity(fn);
  const polesIn = cont.points.filter(p => p.kind === 'pole' && p.x > a && p.x < b);
  const integrable = polesIn.length === 0;
  const defInt = integrable ? MATH_.definiteIntegral(fn.expr, a, b) : null;
  return { integrable, polesIn, defInt, continuity: cont };
}

var ANALYSIS = { analyzeFunction, analyzeOnInterval, buildDerivation, checkStep, makeStep, computeRange, monotonicAnalysis, computeIntersections };

import { describe, it, eq, ok, closeTo } from './harness.mjs';

function rangeOf(src) { return ANALYSIS.analyzeFunction(fnOf(src)).range; }
function monoOf(src) { return ANALYSIS.analyzeFunction(fnOf(src)); }

describe('值域（解析/分段求值）', () => {
  it('线性 2x+1 → ℝ', () => {
    const r = rangeOf('2x+1');
    eq(r.parts.length, 1);
    eq(r.parts[0].lo, -Infinity);
    eq(r.parts[0].hi, Infinity);
    eq(r.exact, true);
  });
  it('二次 x²−2x−3 → [-4,+∞)', () => {
    const r = rangeOf('x^2-2x-3');
    eq(r.parts.length, 1);
    closeTo(r.parts[0].lo, -4);
    eq(r.parts[0].loOpen, false);
    eq(r.parts[0].hi, Infinity);
    eq(r.parts[0].hiOpen, true);
  });
  it('开口向下 −x²+4x−1 → (−∞,3]', () => {
    const r = rangeOf('-x^2+4x-1');
    eq(r.parts[0].lo, -Infinity);
    closeTo(r.parts[0].hi, 3);
    eq(r.parts[0].hiOpen, false);
  });
  it('1/x → (−∞,0)∪(0,+∞)', () => {
    const r = rangeOf('1/x');
    eq(r.parts.length, 2);
    eq(r.parts[0].hi, 0);
    eq(r.parts[1].lo, 0);
  });
  it('x+1/x → (−∞,−2]∪[2,+∞)', () => {
    const r = rangeOf('x+1/x');
    eq(r.parts.length, 2);
    closeTo(r.parts[0].hi, -2);
    closeTo(r.parts[1].lo, 2);
  });
  it('sqrt(x) → [0,+∞)', () => {
    const r = rangeOf('sqrt(x)');
    closeTo(r.parts[0].lo, 0);
    eq(r.parts[0].loOpen, false);
    eq(r.parts[0].hi, Infinity);
  });
  it('ln(x) → ℝ', () => {
    const r = rangeOf('ln(x)');
    eq(r.parts[0].lo, -Infinity);
    eq(r.parts[0].hi, Infinity);
  });
  it('exp(x) → (0,+∞)', () => {
    const r = rangeOf('exp(x)');
    closeTo(r.parts[0].lo, 0);
    eq(r.parts[0].loOpen, true);
    eq(r.parts[0].hi, Infinity);
  });
  it('2|x−3|+1 → [1,+∞)', () => {
    const r = rangeOf('2*abs(x-3)+1');
    closeTo(r.parts[0].lo, 1);
    eq(r.parts[0].loOpen, false);
    eq(r.parts[0].hi, Infinity);
  });
});

describe('单调性（真实定义域）', () => {
  it('2x+1 在 ℝ 递增', () => {
    const m = monoOf('2x+1').monotonic;
    eq(m.length, 1);
    eq(m[0].lo, -Infinity);
    eq(m[0].hi, Infinity);
    eq(m[0].sign, 1);
  });
  it('x²−2x−3：(−∞,1)↘ (1,+∞)↗', () => {
    const m = monoOf('x^2-2x-3').monotonic;
    eq(m.length, 2);
    eq(m[0].sign, -1);
    closeTo(m[0].hi, 1);
    eq(m[1].sign, 1);
    closeTo(m[1].lo, 1);
    eq(m[1].hi, Infinity);
  });
  it('x³ 在 ℝ 递增（合并驻点）', () => {
    const m = monoOf('x^3').monotonic;
    eq(m.length, 1);
    eq(m[0].sign, 1);
  });
  it('ln(x) 仅在 (0,+∞) 递增', () => {
    const m = monoOf('ln(x)').monotonic;
    eq(m.length, 1);
    closeTo(m[0].lo, 0);
    eq(m[0].sign, 1);
  });
});

describe('区间分析', () => {
  it('x²−2x−3 在 [0,5]：零点 3、值域 [−4,12]', () => {
    const r = ANALYSIS.analyzeOnInterval(fnOf('x^2-2x-3'), { lo: 0, hi: 5, loOpen: false, hiOpen: false });
    eq(r.zeros.length, 1);
    closeTo(r.zeros[0].x, 3);
    closeTo(r.range.parts[0].lo, -4);
    closeTo(r.range.parts[0].hi, 12);
  });
  it('1/x 在 [−3,3]：无零点（极被过滤）', () => {
    const r = ANALYSIS.analyzeOnInterval(fnOf('1/x'), { lo: -3, hi: 3, loOpen: false, hiOpen: false });
    eq(r.zeros.length, 0);
  });
});

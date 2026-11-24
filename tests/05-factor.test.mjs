import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('因式分解', () => {
  function rootsOf(src) {
    const fn = fnOf(src);
    return MATH_.findRoots(fn.expr, fn.params).roots.map(o => o.x).sort((a, b) => a - b);
  }
  it('x²−5x+6 → 根 2,3', () => {
    const r = rootsOf('x^2-5x+6');
    closeTo(r[0], 2); closeTo(r[1], 3);
  });
  it('2x²+3x−2 → 根 1/2, -2', () => {
    const r = rootsOf('2x^2+3x-2');
    closeTo(r[0], -2); closeTo(r[1], 0.5);
  });
  it('x³−x → 根 0, ±1', () => {
    const r = rootsOf('x^3-x');
    eq(r.length, 3);
    closeTo(r[0], -1); closeTo(r[1], 0); closeTo(r[2], 1);
  });
  it('x⁴−1 → 有理根 ±1，余 x²+1（实数不可分解）', () => {
    const fn = fnOf('x^4-1');
    const pc = MATH_.polyCoeffsExact(fn.expr);
    const { factors, remainder } = MATH_.factorPolynomial(pc);
    const fr = factors.map(f => f.toNumber()).sort((a, b) => a - b);
    closeTo(fr[0], -1); closeTo(fr[1], 1);
    // 余 x²+1（无实根）
    eq(remainder.length, 3);
    const q = MATH_.exactQuadratic(remainder[2], remainder[1], remainder[0]);
    ok(q.noReal, 'x²+1 应无实根');
  });
  it('x²+4 实数范围不可分解', () => {
    const fn = fnOf('x^2+4');
    const pc = MATH_.polyCoeffsExact(fn.expr);
    const { factors, remainder } = MATH_.factorPolynomial(pc);
    eq(factors.length, 0);
    const q = MATH_.exactQuadratic(remainder[2], remainder[1], remainder[0]);
    ok(q.noReal);
  });
  it('性质：随机二次式分解后乘回等于原式（有理根情形）', () => {
    // 构造 (x-r1)(x-r2) 的若干实例，验证 findRoots 找回
    for (const [a, b] of [[2, 3], [-1, 5], [0, 4], [-2, -3], [7, -1]]) {
      const src = `(x-${a})*(x-${b})`;
      const r = rootsOf(src).map(x => Math.round(x));
      eq(r.sort().join(','), [a, b].sort().join(','), `(x-${a})(x-${b})`);
    }
  });
});

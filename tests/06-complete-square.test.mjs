import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('配方（完成平方）', () => {
  function cs(src) {
    const fn = fnOf(src);
    return MATH_.completeSquare(MATH_.polyCoeffsExact(fn.expr));
  }
  it('x²−4x−4 = (x−2)²−8', () => {
    const r = cs('x^2-4x-4');
    closeTo(r.h.toNumber(), 2); closeTo(r.k.toNumber(), -8);
  });
  it('2x²−8x+5 = 2(x−2)²−3', () => {
    const r = cs('2x^2-8x+5');
    closeTo(r.h.toNumber(), 2); closeTo(r.k.toNumber(), -3);
    ok(r.tex.includes('2(x-2)^2-3') || r.tex.includes('2(x-2)^2'), r.tex);
  });
  it('−x²+4x−1 = −(x−2)²+3', () => {
    const r = cs('-x^2+4x-1');
    closeTo(r.h.toNumber(), 2); closeTo(r.k.toNumber(), 3);
    ok(r.tex.includes('(x-2)^2') && r.tex.includes('-'), r.tex);
  });
  it('顶点坐标：x²−2x−3 → (1,−4)', () => {
    const r = cs('x^2-2x-3');
    closeTo(r.h.toNumber(), 1); closeTo(r.k.toNumber(), -4);
  });
});

describe('自检（checkDomain 抓定义域被放大）', () => {
  it('(x²−1)/(x+1) → x−1 忘标 x≠−1 应报警', () => {
    const before = fnOf('(x^2-1)/(x+1)');
    const after = fnOf('x-1');
    const r = MATH_.checkDomain(before, after, []);
    ok(!r.ok, '应报警');
    closeTo(r.at, -1, 1e-5);
  });
  it('标注 caveat [-1] 后通过', () => {
    const before = fnOf('(x^2-1)/(x+1)');
    const after = fnOf('x-1');
    const r = MATH_.checkDomain(before, after, [-1]);
    ok(r.ok, '应通过');
  });
  it('无洞的变换不报警', () => {
    const before = fnOf('x^2');
    const after = fnOf('x*x');
    const r = MATH_.checkDomain(before, after, []);
    ok(r.ok);
  });
});

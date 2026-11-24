import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('精确根与根式', () => {
  it('x²−4x−4=0 → 2±2√2（根式非小数）', () => {
    const r = MATH_.findRoots(fnOf('x^2-4x-4').expr, {});
    eq(r.completeness, 'exact');
    eq(r.roots.length, 2);
    ok(r.roots.every(o => o.exact));
    // 必须含 sqrt 且不含小数
    ok(r.roots.some(o => o.tex.includes('\\sqrt{2}')), r.roots.map(o => o.tex).join(' | '));
    closeTo(r.roots[0].x, 2 - 2 * Math.sqrt(2));
    closeTo(r.roots[1].x, 2 + 2 * Math.sqrt(2));
  });
  it('x²+2x+5=0 → Δ<0 无实根', () => {
    const r = MATH_.findRoots(fnOf('x^2+2x+5').expr, {});
    eq(r.roots.length, 0);
  });
  it('x²−5x+6=0 → 2,3 精确有理', () => {
    const r = MATH_.findRoots(fnOf('x^2-5x+6').expr, {});
    ok(r.roots.every(o => o.exact && !o.tex.includes('sqrt')));
    closeTo(r.roots[0].x, 2); closeTo(r.roots[1].x, 3);
  });
  it('x²−2x+1=0 → 重根 x=1', () => {
    const r = MATH_.findRoots(fnOf('x^2-2x+1').expr, {});
    eq(r.roots.length, 1);
    closeTo(r.roots[0].x, 1);
  });
  it('线性 x-3=0 → x=3', () => {
    const r = MATH_.findRoots(fnOf('x-3').expr, {});
    closeTo(r.roots[0].x, 3);
  });
});

describe('数值根完整性', () => {
  it('sin x = x/2 在 [-8,8] 恰 3 根', () => {
    const r = MATH_.findRoots(fnOf('sin(x)-x/2').expr, {}, [-8, 8]);
    eq(r.roots.length, 3);
    eq(r.completeness, 'window');
    ok(r.roots.every(o => !o.exact));
  });
  it('2^x = x+3 有 2 根', () => {
    const r = MATH_.findRoots(fnOf('2^x-(x+3)').expr, {}, [-10, 10]);
    eq(r.roots.length, 2);
  });
  it('x³−3x+1 → 3 个根', () => {
    const r = MATH_.findRoots(fnOf('x^3-3x+1').expr, {}, [-5, 5]);
    ok(r.roots.length >= 3, '应有 3 个根，实际 ' + r.roots.length);
  });
  it('1/3 + 1/6 打印 1/2', () => {
    eq(fmtNum(1 / 3 + 1 / 6), '1/2');
  });
});

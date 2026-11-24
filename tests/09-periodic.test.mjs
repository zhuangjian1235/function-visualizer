import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('周期通式（三角方程）', () => {
  it('sin(x)=1/2 → π/6+2kπ 与 5π/6+2kπ', () => {
    const fn = fnOf('sin(x)-1/2');
    const r = MATH_.findRoots(fn.expr, fn.params, [-8, 8]);
    eq(r.completeness, 'periodic');
    ok(r.periodic, '应标记为周期解');
    ok(r.families.length >= 2, '应有两个通式族');
    // 窗口内具体值含 π/6 ≈ 0.5236
    ok(r.roots.some(o => Math.abs(o.x - Math.PI / 6) < 1e-4), '含 π/6');
  });
  it('tan(x)=1 → π/4+nπ', () => {
    const fn = fnOf('tan(x)-1');
    const r = MATH_.findRoots(fn.expr, fn.params, [-8, 8]);
    eq(r.completeness, 'periodic');
    ok(r.roots.some(o => Math.abs(o.x - Math.PI / 4) < 1e-4), '含 π/4');
  });
  it('cos(x)=0 → π/2+kπ', () => {
    const fn = fnOf('cos(x)');
    const r = MATH_.findRoots(fn.expr, fn.params, [-8, 8]);
    eq(r.completeness, 'periodic');
    ok(r.roots.some(o => Math.abs(o.x - Math.PI / 2) < 1e-4), '含 π/2');
  });
  it('通式回代逐点验证', () => {
    const fn = fnOf('sin(x)-1/2');
    const r = MATH_.findRoots(fn.expr, fn.params, [-8, 8]);
    for (const o of r.roots) {
      closeTo(FRONTEND.evalFn(fn, o.x), 0, 1e-6, 'sin(x)-1/2 在 ' + o.x + ' 应≈0');
    }
  });
});

describe('展开（有上限，不挂死）', () => {
  it('(x+1)^3 展开系数', () => {
    const pc = MATH_.polyCoeffsExact(math.parse('(x+1)^3'));
    // x^3+3x^2+3x+1 → [1,3,3,1]
    deepEqArr(pc.map(c => c.n.toString()), ['1', '3', '3', '1']);
  });
  it('(x-1)(x+1) → x²−1', () => {
    const pc = MATH_.polyCoeffsExact(math.parse('(x-1)*(x+1)'));
    deepEqArr(pc.map(c => c.n.toString()), ['-1', '0', '1']);
  });
  it('(x+1)^40 被上限优雅拒绝（不挂死）', () => {
    // coeffsFromNode 对 >20 次幂返回 null（优雅拒绝），不会触发 rationalize 组合爆炸
    const pc = MATH_.polyCoeffsExact(math.parse('(x+1)^40'));
    eq(pc, null);
  });
  it('(2x−1)^4 展开系数', () => {
    // (2x-1)^4 = 16x^4 - 32x^3 + 24x^2 - 8x + 1
    const pc = MATH_.polyCoeffsExact(math.parse('(2x-1)^4'));
    deepEqArr(pc.map(c => c.n.toString()), ['1', '-8', '24', '-32', '16']);
  });
});
function deepEqArr(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); }

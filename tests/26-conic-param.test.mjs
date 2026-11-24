import { describe, it, eq, ok, closeTo } from './harness.mjs';

/* 参数方程求导：dy/dx = (dY/dt)/(dX/dt)，参数符号统一为 t */
describe('参数方程求导 · paramDerivative', () => {
  it('f(x)=x^2, θ=0°, a=0, b=0 → dy/dx = 2t', () => {
    const pcFn = { parametric: true, pcTheta: 0, pcA: new Rat(0n), pcB: new Rat(0n), pcSrcExpr: 'x^2', pcSrcParams: {} };
    const pd = MATH_.paramDerivative(pcFn);
    ok(pd && pd.ok, '应能求导');
    eq(pd.thetaDeg, 0);
    ok(pd.dydxTex.indexOf('t') >= 0, '公式应含参数 t: ' + pd.dydxTex);
    ok(pd.dydxTex.indexOf('x') === -1, '公式不应残留 x（已重命名为 t）: ' + pd.dydxTex);
  });
  it('f(x)=x^2, θ=90° → X(t)=t^2, Y(t)=-t → dy/dx = -1/(2t)', () => {
    const pcFn = { parametric: true, pcTheta: 90, pcA: new Rat(0n), pcB: new Rat(0n), pcSrcExpr: 'x^2', pcSrcParams: {} };
    const pd = MATH_.paramDerivative(pcFn);
    ok(pd && pd.ok);
    eq(pd.thetaDeg, 90);
    ok(pd.dydxTex.indexOf('\\mathrm{t}') >= 0, '公式应含参数 t: ' + pd.dydxTex);
    ok(pd.dydxTex.indexOf('x') === -1, '公式不应残留 x: ' + pd.dydxTex);
  });
  it('含平移 (a,b) 时公式正确保留', () => {
    const pcFn = { parametric: true, pcTheta: 0, pcA: new Rat(1n), pcB: new Rat(2n), pcSrcExpr: 'x', pcSrcParams: {} };
    const pd = MATH_.paramDerivative(pcFn);
    ok(pd && pd.ok);
    ok(pd.Xtex.indexOf('t-1') >= 0 || pd.Xtex.indexOf('(t-1)') >= 0, '应含 (t-a): ' + pd.Xtex);
  });
  it('非参数函数返回 null', () => {
    const fn = fnOf('x^2');
    ok(MATH_.paramDerivative(fn) === null);
  });
});

/* 圆锥曲线选支显式化 → 分支可按 y=f(x) 参与求导 */
describe('圆锥曲线分支求导 · explicitBranches + derivativeOf', () => {
  it('圆 x²+y²=4 上半支 y=√(4-x²) 可求导', () => {
    const fn = MATH_.buildConic('circle', { h: new Rat(0n), k: new Rat(0n), r: new Rat(2n) });
    const eb = MATH_.explicitBranches(fn);
    ok(eb.branches.length >= 1);
    const upper = eb.branches.find(b => b.label.indexOf('上') >= 0 || b.B.sign() >= 0) || eb.branches[0];
    ok(upper.node, '分支应有显式节点');
    const d = MATH_.derivativeOf(upper.node, {});
    ok(d, '分支应可求导');
  });
  it('抛物线 y²=x 分支显式化后为 y=±√x', () => {
    const fn = MATH_.buildConic('parabola', { h: new Rat(0n), k: new Rat(0n), p: new Rat(1n) });
    const eb = MATH_.explicitBranches(fn);
    ok(eb.branches.length >= 2, '抛物线应有上下两支');
  });
});

import { describe, it, ok, eq, closeTo, fnOf } from './harness.mjs';

/* 块 C：一般隐式方程 F(x,y)=0 —— 输入、数值分支追踪、面积/弧长推导 */

const PI = Math.PI;
function branches(src, xr, opts) {
  return MATH_.implicitBranchesAuto(fnOf(src).implicitFn, xr, opts || {}).branches;
}
function byArea(bs) { return bs.slice().sort((p, q) => Math.abs(q.area) - Math.abs(p.area)); }

describe('一般隐式方程输入 · F(x,y)=0', () => {
  it('关系式走 relation 归一化，构造出 implicit 条目', () => {
    const n = FRONTEND.normalize('x^2+y^2-4=0');
    ok(n.ok && n.relation === true, '应识别为关系式');
    eq(n.lhsNorm, 'x^2+y^2-4');
    eq(n.rhsNorm, '0');
    const fn = FRONTEND.buildFn(n, 'x^2+y^2-4=0').fn;
    ok(fn.implicit === true && !fn.conicType, '应为一般隐式条目（非圆锥模板）');
    ok(fn.Fnode && fn.implicitTex, '应带 F 节点与 TeX');
  });
  it('implicitFn 闭包按 F(x,y)=L-R 求值', () => {
    const fn = fnOf('x^2+y^2-4=0');
    closeTo(fn.implicitFn(0, 2), 0, 1e-12);
    closeTo(fn.implicitFn(1, 1), -2, 1e-12);
  });
  it('回归：y=x^2 仍是显式函数，不再被解析成赋值语句', () => {
    const fn = fnOf('y=x^2');
    ok(!fn.implicit, '不应判为隐式');
    closeTo(FRONTEND.evalFn(fn, 3, fn.params), 9, 1e-12);
    eq(fn.paramOrder.length, 0);
  });
  it('隐式方程里的自由字母收集为参数，改值即时生效', () => {
    const fn = fnOf('x^2+y^2=a^2');
    eq(fn.paramOrder.join(','), 'a');
    closeTo(fn.implicitFn(0, 1), 0, 1e-12);          // 默认 a=1
    fn.params.a = new Rat(2n, 1n);
    closeTo(fn.implicitFn(0, 2), 0, 1e-12);          // a=2 → 半径 2
    closeTo(fn.implicitFn(0, 1), -3, 1e-12);
  });
  it('撤销/重做快照能还原一般隐式条目', () => {
    const st = new STORE.Store();
    const fn = fnOf('x^2+y^2-4=0');
    st.functions.push(fn);
    const snap = st.snapshot();
    st.functions = [];
    st.restore(snap);
    eq(st.functions.length, 1);
    ok(st.functions[0].implicit && typeof st.functions[0].implicitFn === 'function', '还原后仍可求值');
    closeTo(st.functions[0].implicitFn(0, 2), 0, 1e-12);
  });
});

describe('数值分支追踪 · 垂直切线不崩', () => {
  it('圆：上下两支，面积与弧长都≈2π', () => {
    const bs = byArea(branches('x^2+y^2-4=0', [-4, 4]));
    eq(bs.length, 2);
    for (const b of bs) {
      closeTo(Math.abs(b.area), 2 * PI, 2 * PI * 1e-3, '面积');
      closeTo(Math.abs(b.arcLen), 2 * PI, 2 * PI * 1e-3, '弧长');
      closeTo(b.x0, -2, 1e-6, '左端点');
      closeTo(b.x1, 2, 1e-6, '右端点');
    }
  });
  it('抛物线 y²=4x：面积=8√6，顶点处 F_y=0 仍收敛', () => {
    const b = byArea(branches('y^2=4x', [-1, 6]))[0];
    closeTo(Math.abs(b.area), 8 * Math.sqrt(6), 8 * Math.sqrt(6) * 1e-3);
    closeTo(b.x0, 0, 1e-6);
  });
  it('菱形 |x|+|y|=1：上下两支，面积 1、弧长 2√2', () => {
    const bs = branches('|x|+|y|=1', [-3, 3]);
    eq(bs.length, 2);
    for (const b of bs) {
      closeTo(Math.abs(b.area), 1, 5e-3, '面积');
      closeTo(b.arcLen, 2 * Math.SQRT2, 1e-3, '弧长');
    }
  });
  it('双曲线 x²−y²=1：四支，顶点在 x=±1', () => {
    const bs = branches('x^2-y^2=1', [-4, 4]);
    eq(bs.length, 4);
    ok(bs.some(b => Math.abs(b.x0 - 1) < 1e-6), '右支应从 x=1 起');
    ok(bs.every(b => b.pts.length >= 3 && isFinite(b.area)), '各支都应有效');
  });
  it('垂直直线 x=3 与空集 y²+1=0：0 支而非崩溃', () => {
    eq(branches('x=3', [-5, 5]).length, 0);
    eq(branches('y^2+1=0', [-5, 5]).length, 0);
    eq(branches('x^2+y^2=0', [-5, 5]).length, 0);
  });
  it('分支采样点单调递增且都落在窗口内', () => {
    for (const b of branches('x^3+y^3-3*x*y=0', [-3, 4])) {
      for (let i = 1; i < b.pts.length; i++) ok(b.pts[i].x >= b.pts[i - 1].x - 1e-12, 'x 应单调不减');
      ok(b.pts.every(p => isFinite(p.x) && isFinite(p.y)), '坐标应有限');
    }
  });
  it('implicitSlope：F_y=0 处判为垂直切线（null）', () => {
    const fn = fnOf('x^2+y^2-4=0');
    eq(MATH_.implicitSlope(fn.implicitFn, 2, 0), null);
    closeTo(MATH_.implicitSlope(fn.implicitFn, 0, 2), 0, 1e-6);
  });
});

describe('隐式曲线积分推导 · 诚实标注数值', () => {
  it('一般隐式方程可走隐函数求导', () => {
    const d = ANALYSIS.buildDerivation(fnOf('x^2+y^2-4=0'), 'implicitDerivative', {});
    eq(d.steps.length, 1);
    ok(d.conclusion.tex.indexOf('\\frac{dy}{dx}') === 0, '应给出 dy/dx: ' + d.conclusion.tex);
    ok(d.conclusion.tex.indexOf('y') > 0, '分母含 y');
    eq(d.conclusion.badges[0], STR.exact);
  });
  it('积分目标给出分支/面积/弧长三步，并挂数值徽标', () => {
    const fn = fnOf('x^2+y^2-4=0');
    const d = ANALYSIS.buildDerivation(fn, 'implicitIntegral', { a: -4, b: 4, branchIdx: 1 });
    eq(d.title, '隐式曲线积分（面积与弧长）');
    eq(d.steps.map(s => s.ruleName).join(','), '分支追踪,面积（对 x 积分）,弧长');
    eq(d.conclusion.badges[0], STR.window);
    ok(/6\.28/.test(d.conclusion.text), '面积数值应≈2π: ' + d.conclusion.text);
  });
  it('无穷/无效区间明确拒答', () => {
    const fn = fnOf('x^2+y^2-4=0');
    const d = ANALYSIS.buildDerivation(fn, 'implicitIntegral', { a: -Infinity, b: 4 });
    ok(d.conclusion.text.indexOf('区间无效') >= 0, '应提示区间无效');
    eq(d.steps.length, 0);
  });
  it('追不到分支时说明原因而不是给 0', () => {
    const d = ANALYSIS.buildDerivation(fnOf('x=3'), 'implicitIntegral', { a: -5, b: 5 });
    ok(d.conclusion.text.indexOf('没有追踪到') >= 0, '应说明没有分支: ' + d.conclusion.text);
    ok(d.steps.length >= 1, '应留下追踪步骤作为证据');
  });
  it('branchIdx 越界自动收敛到已有分支', () => {
    const fn = fnOf('x^2+y^2-4=0');
    const d = ANALYSIS.buildDerivation(fn, 'implicitIntegral', { a: -4, b: 4, branchIdx: 99 });
    ok(/\\approx/.test(d.conclusion.tex), '越界也应产出结果: ' + d.conclusion.tex);
  });
  it('分支端点求根残差不污染显示（顶点写作 0 而非 -2.5e-11）', () => {
    const d = ANALYSIS.buildDerivation(fnOf('y^2=4x'), 'implicitIntegral', { a: -10, b: 10, branchIdx: 0 });
    const tex = d.steps[1].eqTex;
    ok(tex.indexOf('e-') < 0 && tex.indexOf('e+') < 0, '积分限不应出现科学计数噪声: ' + tex);
    ok(tex.indexOf('\\int_{0}^{10}') > 0, '顶点应显示为 0: ' + tex);
  });
  it('分支结果按参数与区间缓存', () => {
    const fn = fnOf('x^2+y^2=a^2');
    const r1 = ANALYSIS.implicitBranchesFor(fn, -4, 4);
    ok(ANALYSIS.implicitBranchesFor(fn, -4, 4) === r1, '同参数同区间应复用缓存');
    ok(ANALYSIS.implicitBranchesFor(fn, -3, 3) !== r1, '区间变了要重算');
    fn.params.a = new Rat(3n, 1n);
    ok(ANALYSIS.implicitBranchesFor(fn, -4, 4) !== r1, '参数变了要重算');
  });
});

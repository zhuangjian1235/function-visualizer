import { describe, it, eq, ok, closeTo, fnOf } from './harness.mjs';

function integNode(src) {
  const n = math.parse(FRONTEND.normalize(src).norm);
  return MATH_.integrate(n);
}
/* 用 F'=f 验证不定积分正确性 */
function verifyIntegral(src) {
  const f = math.parse(FRONTEND.normalize(src).norm);
  const F = MATH_.integrate(f);
  ok(F, '积分失败: ' + src);
  const Fp = MATH_.derivativeOf(F.node);
  const sym = FRONTEND.symbolicallyEqual(Fp, f);
  const num = FRONTEND.numericEqual(Fp, f, [-3, 3], 12);
  ok(sym || num, "F'=f 验证失败: " + src + " → F=" + F.node.toString() + " → F'=" + (Fp ? Fp.toString() : 'null'));
}

describe('符号积分引擎', () => {
  it('∫x²dx = x³/3', () => { const F = integNode('x^2'); const v = F.node.compile().evaluate({ x: 2 }); closeTo(v, 8 / 3, 1e-6); });
  it('∫x dx = x²/2', () => { const F = integNode('x'); const v = F.node.compile().evaluate({ x: 3 }); closeTo(v, 4.5, 1e-6); });
  it('∫3x²dx = x³', () => { const F = integNode('3*x^2'); const v = F.node.compile().evaluate({ x: 2 }); closeTo(v, 8, 1e-6); });
  it('∫(x²+2x+1)dx = x³/3+x²+x', () => { const F = integNode('x^2+2*x+1'); const v = F.node.compile().evaluate({ x: 1 }); closeTo(v, 7 / 3, 1e-6); });
  it('∫sin(x)dx = -cos(x)', () => { const F = integNode('sin(x)'); const v = F.node.compile().evaluate({ x: 0 }); closeTo(v, -1, 1e-6); });
  it('∫cos(x)dx = sin(x)', () => { const F = integNode('cos(x)'); const v = F.node.compile().evaluate({ x: 1 }); closeTo(v, Math.sin(1), 1e-6); });
  it('∫exp(x)dx = exp(x)', () => { const F = integNode('exp(x)'); const v = F.node.compile().evaluate({ x: 0.5 }); closeTo(v, Math.exp(0.5), 1e-6); });
  it('∫1/x dx = ln|x|', () => { const F = integNode('1/x'); const v = F.node.compile().evaluate({ x: 2 }); closeTo(v, Math.log(2), 1e-6); });
  it('∫sqrt(x)dx', () => { const F = integNode('sqrt(x)'); const v = F.node.compile().evaluate({ x: 4 }); closeTo(v, (2 / 3) * Math.pow(4, 1.5), 1e-6); });
  it('∫sin(2x)dx = -cos(2x)/2', () => { const F = integNode('sin(2*x)'); const v = F.node.compile().evaluate({ x: 0 }); closeTo(v, -0.5, 1e-6); });
  it('分部积分 ∫x·e^x dx', () => { const F = integNode('x*exp(x)'); const v = F.node.compile().evaluate({ x: 2 }); closeTo(v, Math.exp(2) * 1, 1e-6); });
  it('分部积分 ∫x·sin(x) dx', () => { const F = integNode('x*sin(x)'); const v = F.node.compile().evaluate({ x: 1 }); closeTo(v, Math.sin(1) - Math.cos(1), 1e-6); });
  it('∫ln(x)dx = xlnx - x', () => { const F = integNode('ln(x)'); const v = F.node.compile().evaluate({ x: 2 }); closeTo(v, 2 * Math.log(2) - 2, 1e-6); });
  it("F'=f 自检（多组）", () => { ['x^2', 'x^3-3x', 'sin(x)', 'cos(2*x)', 'exp(3*x)', '1/x', 'sqrt(x)'].forEach(verifyIntegral); });
});

describe('n 阶导', () => {
  it('x³ 的 2 阶导 = 6x', () => { const r = MATH_.nthDerivative(math.parse('x^3'), 2); closeTo(r.node.compile().evaluate({ x: 3 }), 18, 1e-6); });
  it('x³ 的 3 阶导 = 6', () => { const r = MATH_.nthDerivative(math.parse('x^3'), 3); closeTo(r.node.compile().evaluate({ x: 3 }), 6, 1e-6); });
  it('x³ 的 4 阶导 = 0', () => { const r = MATH_.nthDerivative(math.parse('x^3'), 4); closeTo(r.node.compile().evaluate({ x: 3 }), 0, 1e-6); });
  it('sin(x) 3 阶导 = -cos(x) 且有通式', () => { const r = MATH_.nthDerivative(math.parse('sin(x)'), 3); ok(r.formula, '应有通式'); closeTo(r.node.compile().evaluate({ x: 0.3 }), -Math.cos(0.3), 1e-6); });
  it('sin(x) 4 阶导 = sin(x)', () => { const r = MATH_.nthDerivative(math.parse('sin(x)'), 4); closeTo(r.node.compile().evaluate({ x: 0.3 }), Math.sin(0.3), 1e-6); });
  it('exp(2x) 3 阶导 = 8·exp(2x)', () => { const r = MATH_.nthDerivative(math.parse('exp(2*x)'), 3); closeTo(r.node.compile().evaluate({ x: 0.5 }), 8 * Math.exp(1), 1e-6); });
  it('多项式 5 阶导后为 0（x⁴）', () => { const r = MATH_.nthDerivative(math.parse('x^4'), 5); closeTo(r.node.compile().evaluate({ x: 1 }), 0, 1e-6); });
});

describe('n 重积分', () => {
  it('x² 的 2 重积分 = x⁴/12', () => { const r = MATH_.nthIntegral(math.parse('x^2'), 2); closeTo(r.node.compile().evaluate({ x: 2 }), Math.pow(2, 4) / 12, 1e-6); });
  it('x 的 3 重积分 = x⁴/24', () => { const r = MATH_.nthIntegral(math.parse('x'), 3); closeTo(r.node.compile().evaluate({ x: 2 }), Math.pow(2, 4) / 24, 1e-6); });
  it('exp(x) 的 2 重积分 = exp(x)', () => { const r = MATH_.nthIntegral(math.parse('exp(x)'), 2); closeTo(r.node.compile().evaluate({ x: 0.5 }), Math.exp(0.5), 1e-6); });
});

describe('定积分（牛顿-莱布尼茨）', () => {
  it('∫[0,1]x²dx = 1/3（精确）', () => { const r = MATH_.definiteIntegral(math.parse('x^2'), 0, 1); ok(r && r.exact, '应精确'); closeTo(r.valueNum, 1 / 3, 1e-9); });
  it('∫[0,π]sin(x)dx = 2', () => { const r = MATH_.definiteIntegral(math.parse('sin(x)'), 0, Math.PI); closeTo(r.valueNum, 2, 1e-6); });
});

describe('隐函数求导', () => {
  it('圆 x²+y²=1 → dy/dx = -x/y', () => {
    const fn = MATH_.buildConic('circle', { h: new Rat(0n), k: new Rat(0n), r: new Rat(1n) });
    const F = MATH_.conicImplicitNode(fn);
    ok(F, 'F(x,y) 构造失败');
    const id = MATH_.implicitDerivative(F);
    ok(id && id.dydx, '隐函数求导失败');
    const v = id.dydx.compile().evaluate({ x: 0.6, y: 0.8 });
    closeTo(v, -0.75, 1e-6);
  });
  it('抛物线 (y-k)²=4p(x-h) → dy/dx = 2p/(y-k)', () => {
    const fn = MATH_.buildConic('parabola', { h: new Rat(0n), k: new Rat(0n), p: new Rat(1n) });
    const F = MATH_.conicImplicitNode(fn);
    const id = MATH_.implicitDerivative(F);
    const v = id.dydx.compile().evaluate({ x: 1, y: 2 });
    closeTo(v, 1, 1e-6); // 2p/(y-k) = 2/2 = 1
  });
});

describe('连续性 / 可导性判定', () => {
  it('1/x 在 x=0 无穷间断', () => { const fn = fnOf('1/x'); const c = checkContinuity(fn); ok(!c.continuous, '应不连续'); ok(c.points.some(p => p.type === '无穷间断'), '应有无穷间断点'); });
  it('x² 处处连续', () => { const fn = fnOf('x^2'); const c = checkContinuity(fn); ok(c.continuous, '应连续'); });
  it('abs(x) 在 x=0 不可导', () => { const fn = fnOf('abs(x)'); const d = checkDifferentiability(fn); ok(!d.differentiable, '应不可导'); ok(d.nonDiff.some(p => Math.abs(p.x) < 1e-6), '应在 x=0 不可导'); });
  it('x² 处处可导', () => { const fn = fnOf('x^2'); const d = checkDifferentiability(fn); ok(d.differentiable, '应可导'); });
});

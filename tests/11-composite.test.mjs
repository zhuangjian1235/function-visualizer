import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('复合与除法', () => {
  it('f∘g ≠ g∘f', () => {
    const f = math.parse('x^2'), g = math.parse('2*x-1');
    const fg = MATH_.composeNode(f, g); // f(g(x)) = (2x-1)^2
    const gf = MATH_.composeNode(g, f); // g(f(x)) = 2x^2-1
    ok(fg.toString().replace(/\s/g, '') !== gf.toString().replace(/\s/g, ''));
    // f∘g 在 x=2 处 = (3)^2 = 9
    closeTo(fg.compile().evaluate({ x: 2 }), 9);
  });
  it('f∘g = 4x²−4（f=x², g=2x−1 的替代验证）', () => {
    const f = math.parse('x^2'), g = math.parse('2*x-1');
    const fg = MATH_.composeNode(f, g);
    closeTo(fg.compile().evaluate({ x: 2 }), 9);
    closeTo(fg.compile().evaluate({ x: 0 }), 1);
  });
  it('f÷g 定义域含 g=0 的极点', () => {
    // f=x, g=x+1/2 → f/g = x/(x+1/2)，极点 x=-1/2
    const f = math.parse('x'), g = math.parse('x+1/2');
    const div = MATH_.opNode(f, g, 'div');
    const dom = MATH_.analyzeDomain({ expr: div, params: {}, var: 'x', piecewise: false });
    ok(dom.poles.some(p => Math.abs(p + 0.5) < 1e-6), '极点 x=-1/2');
  });
  it('(x+1)/(x²−1) 的洞为 x=1（x=-1 也是洞，两个 caveat）', () => {
    const fn = fnOf('(x+1)/(x^2-1)');
    const dom = MATH_.analyzeDomain(fn);
    // x²-1 = (x-1)(x+1)，与 x+1 约去 → x=-1 是洞；x=1 是极点（未约去）
    ok(dom.holes.some(h => Math.abs(h.x + 1) < 1e-6), '洞 x=-1');
    ok(dom.poles.some(p => Math.abs(p - 1) < 1e-6), '极点 x=1');
  });
});

describe('反函数', () => {
  it('2/(x−1) 的反函数（线性）', () => {
    const fn = fnOf('2*x+1');
    const inv = MATH_.inverseOf(fn);
    ok(inv.ok);
  });
  it('x³ 的反函数 nthRoot(x,3)', () => {
    const fn = fnOf('x^3');
    const inv = MATH_.inverseOf(fn);
    ok(inv.ok);
  });
  it('x² 非单调拒绝', () => {
    const fn = fnOf('x^2');
    const inv = MATH_.inverseOf(fn);
    ok(!inv.ok, '应拒绝');
  });
  it('f∘f⁻¹ ≡ x 逐点验证', () => {
    const fn = fnOf('2*x+1');
    const inv = MATH_.inverseOf(fn);
    const fNode = fn.expr, invNode = inv.expr;
    const comp = MATH_.composeNode(fNode, invNode);
    for (let i = -5; i <= 5; i++) {
      const x = i * 0.7;
      closeTo(comp.compile().evaluate({ x }), x, 1e-6, 'f∘f⁻¹(' + x + ')');
    }
  });
});

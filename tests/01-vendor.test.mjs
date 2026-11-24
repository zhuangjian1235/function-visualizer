import { describe, it, eq, ok } from './harness.mjs';

describe('vendor 行为固化（math.js 实测）', () => {
  it('-x^2 = -(x^2)（unaryMinus 优先于 ^）', () => {
    const n = math.parse('-x^2');
    eq(n.compile().evaluate({ x: 3 }), -9);
    eq(n.fn, 'unaryMinus');
  });
  it('-2^2 = -4', () => eq(math.parse('-2^2').evaluate(), -4));
  it('2^x^3 = 2^(x^3)（右结合）', () => {
    const n = math.parse('2^x^3');
    eq(n.compile().evaluate({ x: 3 }), 134217728);
  });
  it('1/2x = (1/2)*x（隐式乘）', () => {
    eq(math.parse('1/2x').compile().evaluate({ x: 3 }), 1.5);
  });
  it('2(x+1)(x-1) 隐式乘正常', () => {
    eq(math.parse('2(x+1)(x-1)').compile().evaluate({ x: 3 }), 16);
  });
  it('parse 报错对象含 char 字段', () => {
    try { math.parse('x+)'); } catch (e) { ok(typeof e.char === 'number'); }
  });
  it('ln 不被 derivative 支持（须归一为 log）', () => {
    let threw = false;
    try { math.derivative(math.parse('ln(x)'), 'x'); } catch (e) { threw = true; }
    ok(threw, 'ln 应抛错');
  });
  it('sec/cot 原生支持求导', () => {
    ok(math.derivative(math.parse('sec(x)'), 'x') != null);
    ok(math.derivative(math.parse('cot(x)'), 'x') != null);
  });
  it('toTex 长相：frac/sqrt/abs/nthRoot', () => {
    ok(math.parse('1/x').toTex().includes('\\frac'));
    ok(math.parse('abs(x-1)').toTex().includes('\\left|'));
    ok(math.parse('nthRoot(x,3)').toTex().includes('\\sqrt[3]'));
  });
  it('simplify x/x → 1（即使 realContext 也如此，故不能依赖其保定义域）', () => {
    eq(math.simplify('x/x', {}, math.simplify.realContext).toString(), '1');
  });
  it('rationalize (x+1)^2 → 展开', () => {
    eq(math.rationalize('(x+1)^2').toString().replace(/\s/g, ''), 'x^2+2*x+1');
  });
});

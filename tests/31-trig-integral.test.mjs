import { describe, it, ok, closeTo } from './harness.mjs';

/* 块 B：乘积三角积分（积化和差 / 降幂） */
function integNode(src) {
  const n = math.parse(FRONTEND.normalize(src).norm);
  return MATH_.integrate(n);
}
function verifyIntegral(src) {
  const f = math.parse(FRONTEND.normalize(src).norm);
  const F = MATH_.integrate(f);
  ok(F, '积分失败: ' + src);
  const Fp = MATH_.derivativeOf(F.node);
  const sym = Fp ? FRONTEND.symbolicallyEqual(Fp, f) : false;
  const num = Fp ? FRONTEND.numericEqual(Fp, f, [-3, 3], 12) : false;
  ok(sym || num, "F'=f 验证失败: " + src + ' → F=' + F.node.toString());
}

describe('乘积三角积分（积化和差 / 降幂）', () => {
  it('∫sin(x)cos(x)dx = -¼cos(2x)', () => {
    const F = integNode('sin(x)*cos(x)');
    ok(F, '应可积');
    closeTo(F.node.compile().evaluate({ x: 1 }), -Math.cos(2) / 4, 1e-6);
  });
  it('∫sin²(x)dx = x/2 - ¼sin(2x)', () => {
    const F = integNode('sin(x)^2');
    ok(F, '应可积');
    closeTo(F.node.compile().evaluate({ x: 1 }), 0.5 - Math.sin(2) / 4, 1e-6);
  });
  it('∫cos²(x)dx = x/2 + ¼sin(2x)', () => {
    const F = integNode('cos(x)^2');
    ok(F, '应可积');
    closeTo(F.node.compile().evaluate({ x: 1 }), 0.5 + Math.sin(2) / 4, 1e-6);
  });
  it('∫sin(2x)cos(3x)dx（积化和差）', () => {
    const F = integNode('sin(2*x)*cos(3*x)');
    ok(F, '应可积');
    closeTo(F.node.compile().evaluate({ x: 1 }), -Math.cos(5) / 10 + Math.cos(-1) / 2, 1e-6);
  });
  it("F'=f 自检（多组）", () => {
    ['sin(x)*cos(x)', 'sin(x)^2', 'cos(x)^2', 'sin(2*x)*cos(3*x)'].forEach(verifyIntegral);
  });
});

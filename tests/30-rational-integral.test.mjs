import { describe, it, eq, ok, closeTo } from './harness.mjs';

/* 块 A：一般有理函数积分（部分分式分解） */
function integNode(src) {
  const n = math.parse(FRONTEND.normalize(src).norm);
  return MATH_.integrate(n);
}
/* 用 F'=f 验证不定积分正确性（符号或数值核对） */
function verifyIntegral(src) {
  const f = math.parse(FRONTEND.normalize(src).norm);
  const F = MATH_.integrate(f);
  ok(F, '积分失败: ' + src);
  const Fp = MATH_.derivativeOf(F.node);
  const sym = Fp ? FRONTEND.symbolicallyEqual(Fp, f) : false;
  const num = Fp ? FRONTEND.numericEqual(Fp, f, [-3, 3], 12) : false;
  ok(sym || num, "F'=f 验证失败: " + src + ' → F=' + F.node.toString());
}

describe('有理函数积分（部分分式）', () => {
  it('∫1/(x²-1)dx = ½ln|x-1| - ½ln|x+1|', () => {
    const F = integNode('1/(x^2-1)');
    ok(F, '应可积');
    const v = F.node.compile().evaluate({ x: 3 });
    closeTo(v, (Math.log(2) - Math.log(4)) / 2, 1e-6); // ½ln2 - ½ln4
  });
  it('∫1/(x²+1)dx = arctan(x)', () => {
    const F = integNode('1/(x^2+1)');
    ok(F, '应可积');
    closeTo(F.node.compile().evaluate({ x: 1 }), Math.atan(1), 1e-6);
  });
  it('∫(x³+x)/(x²-1)dx = x²/2 + ln|x-1| + ln|x+1|', () => {
    const F = integNode('(x^3+x)/(x^2-1)');
    ok(F, '应可积');
    const x = 3;
    const v = F.node.compile().evaluate({ x });
    closeTo(v, x * x / 2 + Math.log(x - 1) + Math.log(x + 1), 1e-6);
  });
  it('∫(2x+3)/(x²+2x+5)dx = ln|x²+2x+5| + ½arctan((x+1)/2)', () => {
    const F = integNode('(2*x+3)/(x^2+2*x+5)');
    ok(F, '应可积');
    const x = 1;
    const v = F.node.compile().evaluate({ x });
    closeTo(v, Math.log(x * x + 2 * x + 5) + Math.atan((x + 1) / 2) / 2, 1e-6);
  });
  it('∫1/(x-1)²dx = -(x-1)⁻¹', () => {
    const F = integNode('1/(x-1)^2');
    ok(F, '应可积');
    closeTo(F.node.compile().evaluate({ x: 3 }), -1 / 2, 1e-6);
  });
  it('∫x/(x²+1)dx = ½ln|x²+1|', () => {
    const F = integNode('x/(x^2+1)');
    ok(F, '应可积');
    closeTo(F.node.compile().evaluate({ x: 2 }), Math.log(5) / 2, 1e-6);
  });
  it('∫(x²+1)/(x²-1)dx = x + ln|x-1| - ln|x+1|（先长除法）', () => {
    const F = integNode('(x^2+1)/(x^2-1)');
    ok(F, '应可积');
    const x = 3;
    const v = F.node.compile().evaluate({ x });
    closeTo(v, x + Math.log(x - 1) - Math.log(x + 1), 1e-6);
  });
  it('F\'=f 自检（多组）', () => {
    ['1/(x^2-1)', '1/(x^2+1)', '(x^3+x)/(x^2-1)', '(2*x+3)/(x^2+2*x+5)', '1/(x-1)^2', 'x/(x^2+1)', '(x^2+1)/(x^2-1)'].forEach(verifyIntegral);
  });
  it('分母含无理根（x²-2）优雅拒绝 → null', () => {
    ok(integNode('1/(x^2-2)') === null, 'x²-2 有无理根，应返回 null（优雅拒绝）');
  });
});

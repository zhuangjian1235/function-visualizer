import { describe, it, ok, eq } from './harness.mjs';

/* 块 D：参数方程不定积分（诚实声明无初等原函数 + 换元推导） */
function paramFn(expr, theta) {
  return { parametric: true, pcTheta: theta || 0, pcA: new Rat(0n), pcB: new Rat(0n), pcSrcExpr: expr, pcSrcParams: {} };
}

describe('参数方程积分 · paramIntegral goal', () => {
  it('f(x)=x², θ=0° → 输出换元推导 + 无初等原函数结论', () => {
    const d = buildDerivation(paramFn('x^2', 0), 'paramIntegral', {});
    eq(d.title, '参数方程积分（不定积分）');
    ok(d.conclusion && d.conclusion.text.indexOf('无初等原函数') >= 0, '结论应声明无初等原函数: ' + (d.conclusion && d.conclusion.text));
    ok(d.conclusion.text.indexOf('Liouville') >= 0, '结论应提及 Liouville 定理');
    ok(d.steps.length >= 1, '应有换元步骤');
    const alg = d.steps[0].algebra || [];
    ok(alg.some(line => line.indexOf('\\int y(t)') >= 0 || line.indexOf('x\'(t)') >= 0), '代数推导应含换元 ∫y(t)x\'(t)dt');
  });
  it('参数方程积分结论强调定积分可用数值法', () => {
    const d = buildDerivation(paramFn('x^2', 90), 'paramIntegral', {});
    ok(d.conclusion && d.conclusion.text.indexOf('数值') >= 0, '应提示数值法: ' + d.conclusion.text);
  });
});

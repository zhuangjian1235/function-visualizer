import { describe, it, eq, ok } from './harness.mjs';

describe('自检真的有害（证伪测试）', () => {
  it('注入符号写反的等价变换，checkStep 报警', () => {
    const before = math.parse('x^2');
    const after = math.parse('-x^2'); // 符号写反
    const r = ANALYSIS.checkStep(before, after, [-5, 5]);
    ok(!r.ok, 'checkStep 应报警');
    ok(!r.numeric, '数值层应报警');
  });
  it('正确等价变换 checkStep 通过', () => {
    const before = math.parse('(x+1)^2');
    const after = math.parse('x^2+2*x+1');
    const r = ANALYSIS.checkStep(before, after, [-5, 5]);
    ok(r.ok, '应通过');
  });
  it('去掉 cancelFactor 的 caveat，checkDomain 报警', () => {
    const before = fnOf('(x^2-1)/(x+1)');
    const after = fnOf('x-1');
    const r = MATH_.checkDomain(before, after, []);
    ok(!r.ok, 'checkDomain 应报警');
    closeTo(r.at, -1, 1e-5);
  });
  it('x/x → 1 化简：默认 context 的坑被 checkDomain 拦下', () => {
    // §4.2 禁令：默认 simplify 会 x/x→1，但这是错的（x≠0）
    // checkStep 数值+符号在随机点都不命中 x=0，故通过；
    // 但 checkDomain 发现 before 在 x=0 有可去间断点未声明 → 报警
    const before = fnOf('x/x');
    const after = fnOf('1');
    const dom = MATH_.analyzeDomain(before);
    ok(dom.holes.some(h => Math.abs(h.x) < 1e-6), 'x/x 应有洞 x=0');
    const r = MATH_.checkDomain(before, after, []);
    ok(!r.ok, 'checkDomain 应拦下 x/x → 1');
  });
});
function closeTo(a, b, tol) { if (Math.abs(a - b) > (tol || 1e-9)) throw new Error(`期望 ≈${b}，实际 ${a}`); }

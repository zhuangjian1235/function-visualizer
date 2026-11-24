import { describe, it, eq, ok, closeTo } from './harness.mjs';

function rat(n, d) { return new Rat(BigInt(n), BigInt(d || 1)); }
function mkConic(type, p) { return MATH_.buildConic(type, p); }

describe('分支显式化 · conicBranches', () => {
  it('圆 → 上下两支，yAt/node 正确', () => {
    const b = MATH_.explicitBranches(mkConic('circle', { h: rat(0), k: rat(0), r: rat(1) })).branches;
    eq(b.length, 2);
    eq(b[0].label, '上半圆');
    eq(b[1].label, '下半圆');
    closeTo(b[0].yAt(0), 1, 1e-9);
    closeTo(b[1].yAt(0), -1, 1e-9);
    ok(b[0].node, '上支应有显式 node');
    ok(b[0].radical, '上支应标记 radical');
  });
  it('椭圆/双曲线/抛物线 → 各两支', () => {
    eq(MATH_.conicBranches(mkConic('ellipse', { h: rat(0), k: rat(0), a: rat(2), b: rat(1) })).length, 2);
    eq(MATH_.conicBranches(mkConic('hyperbola', { h: rat(0), k: rat(0), a: rat(1), b: rat(1) })).length, 2);
    eq(MATH_.conicBranches(mkConic('parabola', { h: rat(0), k: rat(0), p: rat(1) })).length, 2);
  });
  it('双曲线定义域不连通（两段）', () => {
    const b = MATH_.conicBranches(mkConic('hyperbola', { h: rat(0), k: rat(0), a: rat(1), b: rat(1) }));
    eq(b[0].domains.length, 2);
  });
  it('显式函数 → 单支', () => {
    const b = MATH_.explicitBranches(fnOf('2x+1')).branches;
    eq(b.length, 1);
    eq(b[0].sourceKind, 'explicit');
    closeTo(b[0].yAt(3), 7, 1e-9);
  });
});

describe('无理方程 · solveRadicalEquation', () => {
  it('上半圆 vs y=x → 精确根 √2/2（验根排除 -√2/2）', () => {
    const cb = MATH_.explicitBranches(mkConic('circle', { h: rat(0), k: rat(0), r: rat(1) })).branches;
    const sol = MATH_.solveRadicalEquation(cb[0], fnOf('x').expr, null, [-2, 2]);
    ok(sol, '应返回解');
    eq(sol.exact, true);
    eq(sol.roots.length, 1);
    closeTo(sol.roots[0].x, Math.SQRT1_2, 1e-9);
    ok(sol.roots[0].exact, '应为精确根');
  });
  it('下半圆 vs y=x → 精确根 -√2/2', () => {
    const cb = MATH_.explicitBranches(mkConic('circle', { h: rat(0), k: rat(0), r: rat(1) })).branches;
    const sol = MATH_.solveRadicalEquation(cb[1], fnOf('x').expr, null, [-2, 2]);
    closeTo(sol.roots[0].x, -Math.SQRT1_2, 1e-9);
  });
  it('上半圆 vs y=x^2（四次）→ 数值近似', () => {
    const cb = MATH_.explicitBranches(mkConic('circle', { h: rat(0), k: rat(0), r: rat(1) })).branches;
    const sol = MATH_.solveRadicalEquation(cb[0], fnOf('x^2').expr, null, [-2, 2]);
    ok(sol, '应返回解');
    eq(sol.exact, false);
    eq(sol.roots.length, 2);
  });
  it('抛物线上支 vs y=x+1 → 精确', () => {
    const pb = MATH_.explicitBranches(mkConic('parabola', { h: rat(0), k: rat(0), p: rat(1) })).branches;
    const sol = MATH_.solveRadicalEquation(pb[0], fnOf('x+1').expr, null, [0, 10]);
    ok(sol, '应返回解');
    eq(sol.exact, true);
    ok(sol.roots.length >= 1);
  });
});

describe('参数曲线拆支', () => {
  it('旋转抛物线 → 2 段', () => {
    const src = fnOf('x^2');
    const r = MATH_.coordinateTransform(src, { thetaDeg: 45, a: rat(0), b: rat(0) });
    const pc = { parametric: true, pcTheta: 45, pcA: rat(0), pcB: rat(0), pcSrcExpr: src.expr.toString(), pcSrcParams: {}, evalX: r.evalX, evalY: r.evalY };
    eq(MATH_.paramMonotonicSegments(pc, [-10, 10]).length, 2);
  });
  it('参数曲线分支 yAt 在定义域内有限', () => {
    const src = fnOf('x^2');
    const r = MATH_.coordinateTransform(src, { thetaDeg: 45, a: rat(0), b: rat(0) });
    const pc = { parametric: true, pcTheta: 45, pcA: rat(0), pcB: rat(0), pcSrcExpr: src.expr.toString(), pcSrcParams: {}, evalX: r.evalX, evalY: r.evalY };
    const br = MATH_.explicitBranches(pc).branches;
    ok(br.length >= 1, '至少一个分支');
    let found = false;
    for (const b of br) {
      const mid = (b.domains[0][0] + b.domains[0][1]) / 2;
      if (isFinite(b.yAt(mid))) { found = true; break; }
    }
    ok(found, '应有可求值的分支点');
  });
});

describe('store 比较分支', () => {
  it('setCompare + getCompareBranches', () => {
    const f = fnOf('x'); f.id = 'fn1'; f.name = 'f';
    const c = mkConic('circle', { h: rat(0), k: rat(0), r: rat(1) }); c.id = 'fn2'; c.name = 'g';
    const s = new Store();
    s.functions = [f, c];
    s.setCompare('fn1', 'fn2', 0, 1);
    const br = s.getCompareBranches();
    ok(br, '应返回分支');
    eq(br.f.sourceKind, 'explicit');
    eq(br.g.label, '下半圆');
  });
});

describe('比大小推导', () => {
  it('显式 vs 显式 → 作差+求根+符号表', () => {
    const f = fnOf('x'); f.id = 'f1'; f.name = 'f';
    const g = fnOf('2x+1'); g.id = 'g1'; g.name = 'g';
    const s = new Store();
    s.functions = [f, g];
    s.setCompare('f1', 'g1');
    GLOBAL_STORE = s;
    const d = ANALYSIS.buildDerivation(f, 'compare');
    const names = d.steps.map(st => st.ruleName);
    ok(names.includes('作差'), '应有作差步骤');
    ok(names.includes('求 h 的零点'), '应有求根步骤');
    ok(d.conclusion, '应有结论');
  });
  it('上半圆 vs y=x → 显式化 + 解无理方程 步骤 + 精确徽章', () => {
    const line = fnOf('x'); line.id = 'L'; line.name = 'f';
    const c = mkConic('circle', { h: rat(0), k: rat(0), r: rat(1) }); c.id = 'C'; c.name = 'g';
    const s = new Store();
    s.functions = [line, c];
    s.setCompare('L', 'C', 0, 0);
    GLOBAL_STORE = s;
    const d = ANALYSIS.buildDerivation(line, 'compare');
    const names = d.steps.map(st => st.ruleName);
    ok(names.includes('显式化'), '应有显式化步骤');
    ok(names.includes('解无理方程（移项平方+验根）'), '应有解无理方程步骤');
    ok(d.conclusion.badges.includes(STR.exact), '徽章应为精确解');
  });
});

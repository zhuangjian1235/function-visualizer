import { describe, it, eq, ok, closeTo } from './harness.mjs';

function rat(n, d) { return new Rat(BigInt(n), BigInt(d || 1)); }
function mkConic(type, p) { return MATH_.buildConic(type, p); }

describe('联立求交点 · buildIntersectionSteps', () => {
  it('显式 y=x^2 与 y=x+2 → 交点 (-1,1),(2,4)', () => {
    const f = fnOf('x^2'); f.id = 'f1'; f.name = 'f';
    const g = fnOf('x+2'); g.id = 'g1'; g.name = 'g';
    const s = new Store();
    s.functions = [f, g];
    s.setIntersection('f1', 'g1');
    GLOBAL_STORE = s;
    const d = ANALYSIS.buildDerivation(f, 'intersection');
    const names = d.steps.map(st => st.ruleName);
    ok(names.includes('联立方程'), '应有联立步骤');
    ok(names.includes('移项作差'), '应有作差步骤');
    ok(names.includes('解方程 h(x)=0'), '应有解方程步骤');
    ok(names.includes('代回求纵坐标'), '应有代回求 y 步骤');
    ok(d.conclusion, '应有结论');
    const pts = d.meta.intersections;
    eq(pts.length, 2);
    const xs = pts.map(p => Math.round(p.x * 1e6)).sort((a, b) => a - b);
    eq(xs[0], -1000000); eq(xs[1], 2000000);
    closeTo(pts.find(p => p.x === -1).y, 1, 1e-6);
    closeTo(pts.find(p => p.x === 2).y, 4, 1e-6);
  });
  it('上半圆 x^2+y^2=1 与 y=x → 精确交点 (√2/2, √2/2)', () => {
    const line = fnOf('x'); line.id = 'L'; line.name = 'f';
    const c = mkConic('circle', { h: rat(0), k: rat(0), r: rat(1) }); c.id = 'C'; c.name = 'g';
    const s = new Store();
    s.functions = [line, c];
    s.setIntersection('L', 'C', 0, 0);
    GLOBAL_STORE = s;
    const d = ANALYSIS.buildDerivation(line, 'intersection');
    const names = d.steps.map(st => st.ruleName);
    ok(names.includes('显式化'), '应有显式化步骤');
    ok(names.includes('解方程（移项平方+验根）'), '应有解无理方程步骤');
    ok(d.conclusion.badges.includes(STR.exact), '徽章应为精确解');
    const pts = d.meta.intersections;
    eq(pts.length, 1);
    closeTo(pts[0].x, Math.SQRT1_2, 1e-9);
    closeTo(pts[0].y, Math.SQRT1_2, 1e-9);
    ok(pts[0].tex.indexOf('sqrt') >= 0 || pts[0].tex.indexOf('frac') >= 0, 'x 应为精确 TeX');
  });
  it('无交点 y=x^2 与 y=-1 → 无交点结论', () => {
    const f = fnOf('x^2'); f.id = 'f1'; f.name = 'f';
    const g = fnOf('-1'); g.id = 'g1'; g.name = 'g';
    const s = new Store();
    s.functions = [f, g];
    s.setIntersection('f1', 'g1');
    GLOBAL_STORE = s;
    const d = ANALYSIS.buildDerivation(f, 'intersection');
    eq(d.meta.intersections.length, 0);
    ok(d.conclusion.text.indexOf('无交点') >= 0, '结论应提示无交点');
  });
});

describe('联立求交点 · computeIntersections（渲染标亮数据）', () => {
  it('返回交点数组含 fName/gName/tex', () => {
    const f = fnOf('x^2'); f.id = 'f1'; f.name = 'f';
    const g = fnOf('x+2'); g.id = 'g1'; g.name = 'g';
    const s = new Store();
    s.functions = [f, g];
    s.setIntersection('f1', 'g1');
    GLOBAL_STORE = s;
    const pts = ANALYSIS.computeIntersections();
    eq(pts.length, 2);
    ok(pts.every(p => p.fName === 'f' && p.gName === 'g'));
    ok(pts.every(p => isFinite(p.y)));
  });
  it('无 intersectionTarget 时返回 null', () => {
    const s = new Store();
    s.functions = [fnOf('x')];
    GLOBAL_STORE = s;
    eq(ANALYSIS.computeIntersections(), null);
  });
});

describe('store 联立分支', () => {
  it('setIntersection + getIntersectionBranches', () => {
    const f = fnOf('x'); f.id = 'fn1'; f.name = 'f';
    const c = mkConic('circle', { h: rat(0), k: rat(0), r: rat(1) }); c.id = 'fn2'; c.name = 'g';
    const s = new Store();
    s.functions = [f, c];
    s.setIntersection('fn1', 'fn2', 0, 1);
    const br = s.getIntersectionBranches();
    ok(br, '应返回分支');
    eq(br.f.sourceKind, 'explicit');
    eq(br.g.label, '下半圆');
  });
  it('删除函数后 intersectionTarget 清理', () => {
    const f = fnOf('x'); f.id = 'fn1';
    const g = fnOf('x+1'); g.id = 'fn2';
    const s = new Store();
    s.functions = [f, g];
    s.setIntersection('fn1', 'fn2');
    s.removeFn('fn1');
    eq(s.intersectionTarget, null);
  });
});

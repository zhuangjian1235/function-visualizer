import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('隐式方程 · explicitImplicit（显式 → y−f(x)=0）', () => {
  it('y=x^2−2x−3 → 隐式求值器在曲线上为 0', () => {
    const fn = fnOf('x^2-2*x-3');
    const imp = MATH_.explicitImplicit(fn);
    closeTo(imp.evalF(2, 2 * 2 - 2 * 2 - 3), 0, 1e-9);
    closeTo(imp.evalF(0, -3), 0, 1e-9);
    closeTo(imp.evalF(0, 0), 3, 1e-9); // y=0 时 F=0−f(0)=3
  });
  it('tex 含 = 0', () => {
    const imp = MATH_.explicitImplicit(fnOf('x^2'));
    ok(imp.tex.indexOf('= 0') >= 0);
  });
});

describe('隐式方程 · paramImplicit（参数曲线 → F(X,Y)=0 通用公式）', () => {
  it('y=x^2 转 45° 的参数曲线，隐式 F 在曲线上恒为 0', () => {
    const srcFn = fnOf('x^2');
    const res = MATH_.coordinateTransform(srcFn, { thetaDeg: 45, a: new Rat(0n), b: new Rat(0n) });
    const pcFn = {
      parametric: true, pcTheta: 45, pcA: new Rat(0n), pcB: new Rat(0n),
      pcSrcExpr: srcFn.expr.toString(), pcSrcParams: {}, evalX: res.evalX, evalY: res.evalY,
    };
    const imp = MATH_.paramImplicit(pcFn);
    ok(imp, '应能构造隐式方程');
    for (const t of [0, 1, 2, -1, 3]) {
      closeTo(imp.evalF(pcFn.evalX(t), pcFn.evalY(t)), 0, 1e-6);
    }
  });
  it('y=x 参数化后隐式仍成立', () => {
    const srcFn = fnOf('x');
    const res = MATH_.paramEquations(srcFn, 30, new Rat(1n), new Rat(2n));
    const pcFn = {
      parametric: true, pcTheta: 30, pcA: new Rat(1n), pcB: new Rat(2n),
      pcSrcExpr: srcFn.expr.toString(), pcSrcParams: {}, evalX: res.evalX, evalY: res.evalY,
    };
    const imp = MATH_.paramImplicit(pcFn);
    ok(imp);
    closeTo(imp.evalF(pcFn.evalX(0), pcFn.evalY(0)), 0, 1e-6);
  });
  it('tex 含 = 0', () => {
    const srcFn = fnOf('x^2');
    const res = MATH_.coordinateTransform(srcFn, { thetaDeg: 45, a: new Rat(0n), b: new Rat(0n) });
    const pcFn = { parametric: true, pcTheta: 45, pcA: new Rat(0n), pcB: new Rat(0n), pcSrcExpr: srcFn.expr.toString(), pcSrcParams: {} };
    const imp = MATH_.paramImplicit(pcFn);
    ok(imp.tex.indexOf('= 0') >= 0);
  });
});

describe('圆锥曲线 · buildConic 四类', () => {
  it('圆 h=0,k=0,r=2：隐式求值器与参数方程正确', () => {
    const fn = MATH_.buildConic('circle', { h: new Rat(0n), k: new Rat(0n), r: new Rat(2n) });
    ok(fn.implicit && fn.conicType === 'circle');
    closeTo(fn.implicitFn(2, 0), 0, 1e-9);
    closeTo(fn.implicitFn(0, 2), 0, 1e-9);
    closeTo(fn.implicitFn(0, 0), -4, 1e-9);
    eq(fn.paramSegs.length, 1);
    closeTo(fn.paramSegs[0].evalX(0), 2, 1e-9);
    closeTo(fn.paramSegs[0].evalY(0), 0, 1e-9);
    closeTo(fn.paramSegs[0].evalY(Math.PI / 2), 2, 1e-9);
    eq(fn.tRange[0], 0);
    closeTo(fn.tRange[1], TAU, 1e-9);
  });
  it('椭圆 h=0,k=0,a=3,b=2', () => {
    const fn = MATH_.buildConic('ellipse', { h: new Rat(0n), k: new Rat(0n), a: new Rat(3n), b: new Rat(2n) });
    closeTo(fn.implicitFn(3, 0), 0, 1e-9);
    closeTo(fn.implicitFn(0, 2), 0, 1e-9);
    closeTo(fn.paramSegs[0].evalX(0), 3, 1e-9);
  });
  it('双曲线 h=0,k=0,a=2,b=2：两支', () => {
    const fn = MATH_.buildConic('hyperbola', { h: new Rat(0n), k: new Rat(0n), a: new Rat(2n), b: new Rat(2n) });
    closeTo(fn.implicitFn(2, 0), 0, 1e-9);
    closeTo(fn.implicitFn(-2, 0), 0, 1e-9);
    eq(fn.paramSegs.length, 2);
    closeTo(fn.paramSegs[0].evalX(0), 2, 1e-9); // 右支
    closeTo(fn.paramSegs[1].evalX(0), -2, 1e-9); // 左支
  });
  it('抛物线 h=0,k=0,p=1：(y)^2=4x', () => {
    const fn = MATH_.buildConic('parabola', { h: new Rat(0n), k: new Rat(0n), p: new Rat(1n) });
    closeTo(fn.implicitFn(1, 2), 0, 1e-9);  // 4−4·1·1=0
    closeTo(fn.implicitFn(1, -2), 0, 1e-9);
    closeTo(fn.paramSegs[0].evalX(2), 1, 1e-9); // t²/(4p)=4/4=1
    closeTo(fn.paramSegs[0].evalY(2), 2, 1e-9);
  });
});

describe('圆锥曲线 · updateConic 活曲线刷新', () => {
  it('改 r 后隐式求值器与参数方程同步更新', () => {
    const fn = MATH_.buildConic('circle', { h: new Rat(0n), k: new Rat(0n), r: new Rat(2n) });
    fn.conicParams.r = new Rat(3n);
    MATH_.updateConic(fn);
    closeTo(fn.implicitFn(3, 0), 0, 1e-9);
    closeTo(fn.paramSegs[0].evalX(0), 3, 1e-9);
    ok(fn.implicitTex.indexOf('3') >= 0);
  });
});

describe('圆锥曲线 · 快照可重建（store 层）', () => {
  it('implicit 项经 snapshot/restore 后求值器仍可用', () => {
    const store = new Store();
    const fn = MATH_.buildConic('circle', { h: new Rat(0n), k: new Rat(0n), r: new Rat(2n) });
    fn.id = 'fn' + (++FN_SEQ);
    fn.color = PALETTE[0];
    store.functions.push(fn);
    const snap = store.snapshot();
    store.restore(snap);
    const r = store.functions[0];
    ok(r && r.implicit && r.conicType === 'circle');
    closeTo(r.implicitFn(2, 0), 0, 1e-9);
    closeTo(r.paramSegs[0].evalX(0), 2, 1e-9);
  });
});

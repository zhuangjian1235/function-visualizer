import { describe, it, eq, ok, closeTo } from './harness.mjs';

function ev(node, x) { return FRONTEND.evalNodeWithParams(node, x, {}); }

describe('坐标系变换 · isLinear', () => {
  it('2x+1 → 线性 m=2 c=1', () => {
    const r = MATH_.isLinear(fnOf('2x+1').expr);
    ok(r.linear);
    eq(r.m.toNumber(), 2);
    eq(r.c.toNumber(), 1);
  });
  it('x^2 → 非一次', () => {
    ok(!MATH_.isLinear(fnOf('x^2').expr).linear);
  });
  it('常数 5 → 线性 m=0 c=5', () => {
    const r = MATH_.isLinear(fnOf('5').expr);
    ok(r.linear);
    eq(r.m.toNumber(), 0);
    eq(r.c.toNumber(), 5);
  });
});

describe('坐标系变换 · rotateLine（直线）', () => {
  it('y=x 转 45° → y=0（成为新横轴）', () => {
    const r = MATH_.rotateLine(new Rat(1n), new Rat(0n), 45, new Rat(0n), new Rat(0n));
    eq(r.kind, 'function');
    closeTo(r.m.toNumber(), 0, 1e-9);
    closeTo(r.c.toNumber(), 0, 1e-9);
  });
  it('y=x 转 90° → y=-x（斜率 -1）', () => {
    const r = MATH_.rotateLine(new Rat(1n), new Rat(0n), 90, new Rat(0n), new Rat(0n));
    eq(r.kind, 'function');
    closeTo(r.m.toNumber(), -1, 1e-9);
    closeTo(r.c.toNumber(), 0, 1e-9);
  });
  it('y=x 转 135° → 竖直直线 X=0（不再是函数）', () => {
    const r = MATH_.rotateLine(new Rat(1n), new Rat(0n), 135, new Rat(0n), new Rat(0n));
    eq(r.kind, 'vertical');
    closeTo(r.X0, 0, 1e-9);
  });
  it('y=2x+1 转 0° → 不变 m=2 c=1', () => {
    const r = MATH_.rotateLine(new Rat(2n), new Rat(1n), 0, new Rat(0n), new Rat(0n));
    closeTo(r.m.toNumber(), 2, 1e-9);
    closeTo(r.c.toNumber(), 1, 1e-9);
  });
  it('y=2x+1 转 0° 平移到 (3,4) → y=2x+3', () => {
    const r = MATH_.rotateLine(new Rat(2n), new Rat(1n), 0, new Rat(3n), new Rat(4n));
    closeTo(r.m.toNumber(), 2, 1e-9);
    closeTo(r.c.toNumber(), 3, 1e-9); // m·a + c − b = 2·3+1−4 = 3
  });
  it('y=x 转 90° 平移到 (1,1) → y=-x（c=0）', () => {
    const r = MATH_.rotateLine(new Rat(1n), new Rat(0n), 90, new Rat(1n), new Rat(1n));
    eq(r.kind, 'function');
    closeTo(r.m.toNumber(), -1, 1e-9);
    closeTo(r.c.toNumber(), 0, 1e-9);
  });
});

describe('坐标系变换 · 纯平移（所有函数精确）', () => {
  it('y=x^2 平移 (2,1) → g(x)=(x+2)^2−1', () => {
    const r = MATH_.coordinateTransform(fnOf('x^2'), { thetaDeg: 0, a: new Rat(2n), b: new Rat(1n) });
    eq(r.kind, 'function');
    closeTo(ev(r.node, 0), 3, 1e-9);   // (0+2)^2−1
    closeTo(ev(r.node, -2), -1, 1e-9); // 0−1
  });
  it('y=2x+1 纯平移 (3,4) → 2x+3', () => {
    const r = MATH_.coordinateTransform(fnOf('2x+1'), { thetaDeg: 0, a: new Rat(3n), b: new Rat(4n) });
    eq(r.kind, 'function');
    closeTo(ev(r.node, 0), 3, 1e-9);
    closeTo(ev(r.node, 1), 5, 1e-9);
  });
  it('y=sqrt(x) 纯平移 (1,0) → sqrt(x+1)', () => {
    const r = MATH_.coordinateTransform(fnOf('sqrt(x)'), { thetaDeg: 0, a: new Rat(1n), b: new Rat(0n) });
    eq(r.kind, 'function');
    closeTo(ev(r.node, 3), 2, 1e-9); // sqrt(3+1)
  });
  it('含自由参数 a*x+b 纯平移 (2,1) 保留参数', () => {
    const fn = fnOf('a*x+b');
    const r = MATH_.coordinateTransform(fn, { thetaDeg: 0, a: new Rat(2n), b: new Rat(1n) });
    eq(r.kind, 'function');
    // g(x)=a(x+2)+b−1，取 a=2,b=3 → g(0)=2·2+3−1=6
    closeTo(FRONTEND.evalNodeWithParams(r.node, 0, { a: new Rat(2n), b: new Rat(3n) }), 6, 1e-9);
  });
});

describe('坐标系变换 · 非一次旋转 → 参数曲线', () => {
  it('y=x^2 转 45° → parametric，采样点满足 R(−θ)(t−a, f(t)−b)', () => {
    const fn = fnOf('x^2');
    const r = MATH_.coordinateTransform(fn, { thetaDeg: 45, a: new Rat(0n), b: new Rat(0n) });
    eq(r.kind, 'parametric');
    const th = 45 * PI / 180;
    const t = 2, f = t * t;
    const expX = t * Math.cos(th) + f * Math.sin(th);
    const expY = -t * Math.sin(th) + f * Math.cos(th);
    closeTo(r.evalX(t), expX, 1e-9);
    closeTo(r.evalY(t), expY, 1e-9);
  });
  it('分段函数 → unsupported', () => {
    const r = MATH_.coordinateTransform(fnOf('{x^2, x>=0; -x, x<0}'), { thetaDeg: 45, a: new Rat(0n), b: new Rat(0n) });
    eq(r.kind, 'unsupported');
  });
});

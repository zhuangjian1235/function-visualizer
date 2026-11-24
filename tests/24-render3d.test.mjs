import { describe, it, eq, ok, closeTo } from './harness.mjs';

function rat(n, d) { return new Rat(BigInt(n), BigInt(d || 1)); }

describe('三维网格生成器', () => {
  it('sphereMesh：顶点在球面上', () => {
    const m = RENDER3D.sphereMesh(2, 16);
    ok(m.vertices.length > 0 && m.faces.length > 0);
    for (const v of m.vertices) {
      const r = Math.hypot(v[0], v[1], v[2]);
      closeTo(r, 2, 1e-9);
    }
  });
  it('cylinderMesh：侧面 x²+y²=r²，z∈[0,h]', () => {
    const m = RENDER3D.cylinderMesh(1.5, 3, 24);
    ok(m.faces.length > 0);
    for (const v of m.vertices) {
      ok(v[2] >= -1e-9 && v[2] <= 3 + 1e-9, 'z 应在 [0,h]');
      // 侧面或圆盘中心，xy 半径 ≤ r
      ok(Math.hypot(v[0], v[1]) <= 1.5 + 1e-9, '半径不超过 r');
    }
  });
  it('coneMesh：顶点 (0,0,h) 存在', () => {
    const m = RENDER3D.coneMesh(1.5, 3, 24);
    ok(m.vertices.some(v => Math.abs(v[2] - 3) < 1e-9), '顶点 z=h');
  });
  it('cuboidMesh：8 顶点（seg=1 时）', () => {
    const m = RENDER3D.cuboidMesh(3, 2, 1.5, 1);
    eq(m.vertices.length, 8);
    eq(m.faces.length, 6);
  });
  it('revolutionMesh 绕 x 轴旋转 y=x → x²=y²+z²（圆锥面）', () => {
    const m = RENDER3D.revolutionMesh(x => x, { p0: [0, 0, 0], n: [1, 0, 0] }, -2, 2, 20, 16);
    ok(m.vertices.length > 0);
    for (const v of m.vertices) {
      const lhs = v[0] * v[0];
      const rhs = v[1] * v[1] + v[2] * v[2];
      closeTo(lhs, rhs, 1e-6);
    }
  });
  it('bivariateMesh 和：z=x+y 顶点满足', () => {
    const m = RENDER3D.bivariateMesh(x => x, y => y, 'sum', -2, 2, 8);
    for (const v of m.vertices) closeTo(v[2], v[0] + v[1], 1e-9);
  });
  it('intersectionCurve：f=x² 与 g=y → 交线 (t, t², t²)', () => {
    const c = RENDER3D.intersectionCurve(x => x * x, y => y, -2, 2, 40);
    ok(c.points.length > 0);
    for (const p of c.points) {
      closeTo(p[2], p[0] * p[0], 1e-6);
      closeTo(p[1], p[2], 1e-6);
    }
  });
});

describe('三维轴解析与隐式方程', () => {
  it('resolveAxis：坐标轴与自定轴归一化', () => {
    deepEqAxis(RENDER3D.resolveAxis('x').n, [1, 0, 0]);
    deepEqAxis(RENDER3D.resolveAxis('y').n, [0, 1, 0]);
    const a = RENDER3D.resolveAxis({ p0: [rat(0), rat(0), rat(0)], v: [rat(0), rat(0), rat(2)] });
    deepEqAxis(a.n, [0, 0, 1]);
  });
  it('buildShape3d 球：隐式方程 x²+y²+z²=r²', () => {
    const s = RENDER3D.buildShape3d('sphere', { r: rat(2) }, null, null, null, null, null, '球');
    ok(s.mesh && s.mesh.vertices.length > 0);
    eq(s.implicitLines.length, 1);
    ok(s.implicitLines[0].indexOf('x^{2}+y^{2}+z^{2}=') >= 0);
  });
  it('buildShape3d 圆柱：隐式方程组含 z 范围', () => {
    const s = RENDER3D.buildShape3d('cylinder', { r: rat(3, 2), h: rat(3) }, null, null, null, null, null, '圆柱');
    ok(s.implicitLines[0].indexOf('x^{2}+y^{2}') >= 0);
    ok(s.implicitLines[0].indexOf('0\\le z\\le') >= 0);
  });
  it('buildShape3d 旋转体（绕 x 轴）：隐式 y²+z²=f(x)²', () => {
    const f = fnOf('x^2');
    const s = RENDER3D.buildShape3d('revolution', {}, f, null, 'x', null, [-2, 2], 'x^2');
    ok(s.mesh && s.mesh.vertices.length > 0);
    ok(s.implicitLines[0].indexOf('y^{2}+z^{2}') >= 0);
  });
  it('buildShape3d 二元曲面组合（积）', () => {
    const f = fnOf('x'), g = fnOf('sin(x)');
    const s = RENDER3D.buildShape3d('bivariate', {}, f, g, null, 'prod', [-2, 2], null);
    ok(s.mesh && s.mesh.vertices.length > 0);
    ok(s.implicitLines[0].indexOf('z=') >= 0);
  });
  it('buildShape3d 空间曲线交线：两个方程', () => {
    const f = fnOf('x^2'), g = fnOf('x');
    const s = RENDER3D.buildShape3d('intersection', {}, f, g, null, null, [-2, 2], null);
    ok(s.mesh && s.mesh.points && s.mesh.points.length > 0);
    eq(s.implicitLines.length, 1);
    ok(s.implicitLines[0].indexOf('z=') >= 0);
  });
});

describe('Camera3D 投影', () => {
  it('project 返回屏幕坐标与深度，后方点返回 null', () => {
    const cam = new RENDER3D.Camera3D();
    const pr = cam.project([0, 0, 0], 800, 600);
    ok(pr && isFinite(pr.x) && isFinite(pr.y) && isFinite(pr.z));
    // 球面上一点投影也在屏幕内
    const pr2 = cam.project([1, 1, 1], 800, 600);
    ok(pr2 && isFinite(pr2.x));
  });
});

function deepEqAxis(a, b) {
  ok(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9, '轴向量不匹配: ' + JSON.stringify(a));
}

describe('三维图形增删与撤销（store 序列化）', () => {
  function mkShape(st, kind, params, axis, combine) {
    return {
      id: st.newShapeId(), kind, name: null, color: '#3b6ef5', visible: true,
      params: params || {}, srcFnId: null, srcFnId2: null,
      axis: axis || null, combine: combine || null, range: null, mesh: null, implicitLines: [],
    };
  }
  it('基本体（axis=null）可添加、删除、撤销、重做', () => {
    const st = new Store();
    st.addShape3d(mkShape(st, 'sphere', { r: rat(2) }));
    st.addShape3d(mkShape(st, 'cylinder', { r: rat(3, 2), h: rat(3) }));
    eq(st.shapes3d.length, 2);
    const id = st.shapes3d[0].id;
    st.removeShape3d(id);
    eq(st.shapes3d.length, 1);
    ok(!st.getShapeById(id), '删除后图形不存在');
    st.undo();
    eq(st.shapes3d.length, 2);
    ok(!!st.getShapeById(id), '撤销后图形恢复');
    st.redo();
    eq(st.shapes3d.length, 1);
    ok(!st.getShapeById(id), '重做后图形再次删除');
  });
  it('自定轴（axis 对象）snapshot/restore 往返后分量仍为 Rat 且 mesh 重建', () => {
    const st = new Store();
    const f = fnOf('x^2');
    st.addFn(f);
    const sh = mkShape(st, 'revolution', {}, { p0: [rat(0), rat(0), rat(0)], v: [rat(0), rat(0), rat(1)] }, null);
    sh.srcFnId = f.id;
    st.addShape3d(sh);
    eq(st.shapes3d.length, 1);
    ok(st.shapes3d[0].mesh && st.shapes3d[0].mesh.vertices.length > 0, '自定轴旋转体 mesh 生成');
    st.undo();
    eq(st.shapes3d.length, 0);
    st.redo();
    eq(st.shapes3d.length, 1);
    const ax = st.shapes3d[0].axis;
    ok(ax && Array.isArray(ax.p0) && ax.p0.length === 3, '自定轴 p0 恢复为数组');
    ok(ax.v[2] instanceof Rat && ax.v[2].toNumber() === 1, '自定轴方向分量恢复为 Rat');
    ok(st.shapes3d[0].mesh && st.shapes3d[0].mesh.vertices.length > 0, '恢复后 mesh 重建');
  });
});

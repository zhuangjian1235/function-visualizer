/* ============================================================
 * 21-render3d.js — 三维渲染层（自研轻量引擎，零外部依赖）
 *  Camera3D（透视/正交投影 + 方位角/仰角/距离）
 *  基本体 / 旋转体(Rodrigues) / 柱面 / 二元曲面 / 空间曲线 生成器
 *  隐式方程组文本 · 深度排序(painter) · Lambert 光照 · 旋转/缩放/平移交互
 *  世界坐标约定：右手系，z 轴向上（x 右、y 深、z 高）
 * ============================================================ */
'use strict';

/* ---------- 向量工具 ---------- */
function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function v3cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function v3sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function v3add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function v3scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function v3norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/* ---------- Camera3D ---------- */
function Camera3D() {
  this.azimuth = 0.7;      // 绕 z 轴水平旋转
  this.elevation = 0.45;   // 仰角
  this.distance = 9;
  this.target = { x: 0, y: 0, z: 0 };
  this.projection = 'perspective'; // 'perspective' | 'orthographic'
}
Camera3D.prototype.clamp = function () {
  this.elevation = Math.max(-1.5, Math.min(1.5, this.elevation));
  this.distance = Math.max(1, Math.min(60, this.distance));
};
Camera3D.prototype.eye = function () {
  const ce = Math.cos(this.elevation), se = Math.sin(this.elevation);
  const ca = Math.cos(this.azimuth), sa = Math.sin(this.azimuth);
  return {
    x: this.target.x + this.distance * ce * ca,
    y: this.target.y + this.distance * ce * sa,
    z: this.target.z + this.distance * se,
  };
};
Camera3D.prototype.basis = function () {
  const e = this.eye();
  let fx = this.target.x - e.x, fy = this.target.y - e.y, fz = this.target.z - e.z;
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  // right = normalize(cross(forward, up))，up=(0,0,1) → (fy, -fx, 0)
  let rx = fy, ry = -fx, rz = 0;
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  // up_cam = cross(right, forward)
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  return { e, f: { x: fx, y: fy, z: fz }, r: { x: rx, y: ry, z: rz }, u: { x: ux, y: uy, z: uz } };
};
/* 世界点 p=[x,y,z] → 屏幕 {x,y,z(深度)}；在相机后方返回 null */
Camera3D.prototype.project = function (p, w, h) {
  const b = this.basis();
  const dx = p[0] - b.e.x, dy = p[1] - b.e.y, dz = p[2] - b.e.z;
  const xc = dx * b.r.x + dy * b.r.y + dz * b.r.z;
  const yc = dx * b.u.x + dy * b.u.y + dz * b.u.z;
  const zc = dx * b.f.x + dy * b.f.y + dz * b.f.z;
  if (zc <= 0.03) return null;
  const ws = Math.min(w, h) / (2 * this.distance);
  let k = ws;
  if (this.projection === 'perspective') k = ws * (this.distance / zc);
  return { x: w / 2 + xc * k, y: h / 2 - yc * k, z: zc };
};

/* ---------- 网格生成器（纯数据，返回 {vertices:[[x,y,z],...], faces:[...]} 或 {points:[...]}） ---------- */

/* 球：经纬网格（z 轴为极轴） */
function sphereMesh(r, seg) {
  seg = seg || 24;
  const vertices = [], faces = [];
  const m = seg, n = seg;
  for (let i = 0; i <= m; i++) {
    const phi = Math.PI * i / m;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let j = 0; j <= n; j++) {
      const th = 2 * Math.PI * j / n;
      vertices.push([r * sp * Math.cos(th), r * sp * Math.sin(th), r * cp]);
    }
  }
  const stride = n + 1;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
    const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
    faces.push([a, b, d, c]);
  }
  return { vertices, faces };
}

/* 圆柱：轴线沿 z，z∈[0,h]，含侧面 + 顶底圆盘 */
function cylinderMesh(r, h, seg) {
  seg = seg || 36;
  const vertices = [], faces = [];
  const m = seg;
  for (let i = 0; i <= 1; i++) {
    const z = h * i;
    for (let j = 0; j <= m; j++) {
      const th = 2 * Math.PI * j / m;
      vertices.push([r * Math.cos(th), r * Math.sin(th), z]);
    }
  }
  const stride = m + 1;
  for (let j = 0; j < m; j++) {
    faces.push([j, j + 1, stride + j + 1, stride + j]); // 侧面
  }
  const bc = vertices.length; vertices.push([0, 0, 0]);
  for (let j = 0; j < m; j++) faces.push([bc, j + 1, j]); // 底面
  const tc = vertices.length; vertices.push([0, 0, h]);
  for (let j = 0; j < m; j++) faces.push([tc, stride + j, stride + j + 1]); // 顶面
  return { vertices, faces };
}

/* 圆锥：顶点 (0,0,h)，底面 z=0 半径 r */
function coneMesh(r, h, seg) {
  seg = seg || 36;
  const vertices = [], faces = [];
  const m = seg;
  for (let j = 0; j <= m; j++) {
    const th = 2 * Math.PI * j / m;
    vertices.push([r * Math.cos(th), r * Math.sin(th), 0]);
  }
  const apex = vertices.length; vertices.push([0, 0, h]);
  for (let j = 0; j < m; j++) faces.push([j, j + 1, apex]); // 侧面
  const bc = vertices.length; vertices.push([0, 0, 0]);
  for (let j = 0; j < m; j++) faces.push([bc, j + 1, j]); // 底面
  return { vertices, faces };
}

/* 长方体：|x|≤a/2, |y|≤b/2, |z|≤c/2（凸体，6 面 8 顶点，painter 面心排序即可） */
function cuboidMesh(a, b, c) {
  const x = a / 2, y = b / 2, z = c / 2;
  const vertices = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
  ];
  const faces = [
    [0, 1, 2, 3], [4, 5, 6, 7],   // 底、顶
    [0, 1, 5, 4], [2, 3, 7, 6],   // 前、后
    [0, 3, 7, 4], [1, 2, 6, 5],   // 左、右
  ];
  return { vertices, faces };
}

/* 旋转体：母线 y=f(t)（在 xy 平面），绕任意轴（Rodrigues）
   axis = { p0:[x0,y0,z0], n:[nx,ny,nz] }（n 单位向量） */
function revolutionMesh(evalF, axis, lo, hi, seg, ring) {
  seg = seg || 48; ring = ring || 36;
  const n = axis.n, p0 = axis.p0;
  const vertices = [], faces = [];
  const m = seg, nn = ring;
  for (let i = 0; i <= m; i++) {
    const t = lo + (hi - lo) * i / m;
    const ft = evalF(t);
    if (!isFinite(ft)) { continue; }
    const Q = [t, ft, 0];
    const dq = [Q[0] - p0[0], Q[1] - p0[1], Q[2] - p0[2]];
    const s = dq[0] * n[0] + dq[1] * n[1] + dq[2] * n[2];
    const Qp = [p0[0] + s * n[0], p0[1] + s * n[1], p0[2] + s * n[2]];
    const rv = [Q[0] - Qp[0], Q[1] - Qp[1], Q[2] - Qp[2]];
    const cr = v3cross(n, rv);
    for (let j = 0; j <= nn; j++) {
      const th = 2 * Math.PI * j / nn;
      const c = Math.cos(th), sn = Math.sin(th);
      vertices.push([
        Qp[0] + rv[0] * c + cr[0] * sn,
        Qp[1] + rv[1] * c + cr[1] * sn,
        Qp[2] + rv[2] * c + cr[2] * sn,
      ]);
    }
  }
  const stride = nn + 1;
  for (let i = 0; i < m; i++) for (let j = 0; j < nn; j++) {
    const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
    faces.push([a, b, d, c]);
  }
  return { vertices, faces };
}

/* 柱面：母线 z=f(x)（xz 平面）沿 y 方向平移，y∈[-L,L] */
function extrusionMesh(evalF, lo, hi, yExtent, seg) {
  seg = seg || 72; yExtent = yExtent || 3;
  const vertices = [], faces = [];
  const m = seg, ny = 2;
  for (let i = 0; i <= m; i++) {
    const x = lo + (hi - lo) * i / m;
    const z = evalF(x);
    if (!isFinite(z)) { continue; }
    for (let j = 0; j <= ny; j++) {
      const y = -yExtent + 2 * yExtent * j / ny;
      vertices.push([x, y, z]);
    }
  }
  const stride = ny + 1;
  for (let i = 0; i < m; i++) for (let j = 0; j < ny; j++) {
    const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
    faces.push([a, b, d, c]);
  }
  return { vertices, faces };
}

/* 二元曲面：z = fx(x) + fy(y) 或 fx(x)·fy(y) */
function bivariateMesh(fx, fy, combine, lo, hi, seg) {
  seg = seg || 40;
  const vertices = [], faces = [];
  const m = seg, n = seg;
  for (let i = 0; i <= m; i++) {
    const x = lo + (hi - lo) * i / m;
    const fxv = fx(x);
    for (let j = 0; j <= n; j++) {
      const y = lo + (hi - lo) * j / n;
      const z = combine === 'prod' ? fxv * fy(y) : fxv + fy(y);
      vertices.push([x, y, isFinite(z) ? z : NaN]);
    }
  }
  const stride = n + 1;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
    const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
    faces.push([a, b, d, c]);
  }
  return { vertices, faces };
}

/* 空间曲线交线：柱面 z=fx(x) 与 z=fy(y) 交线，返回 {points:[[x,y,z],...]} */
function intersectionCurve(fx, fy, lo, hi, seg) {
  seg = seg || 240;
  const points = [];
  for (let i = 0; i <= seg; i++) {
    const t = lo + (hi - lo) * i / seg;
    const z = fx(t);
    if (!isFinite(z)) continue;
    const g = y => fy(y) - z;
    const roots = MATH_.scanRoots(g, -12, 12, 800);
    if (!roots.length) continue;
    const y = roots[0];
    if (!isFinite(y)) continue;
    points.push([t, y, z]);
  }
  return { points };
}

/* ---------- 隐式方程文本与 shape 构建 ---------- */
function ratHalf(r) { return r.div(new Rat(2n)); }
function ratTex(r) { return r.d === 1n ? r.n.toString() : r.toTeX(); }

function toNumArr(arr) { return arr.map(x => (x && typeof x.toNumber === 'function') ? x.toNumber() : Number(x)); }
function resolveAxis(axis) {
  if (axis === 'x') return { p0: [0, 0, 0], n: [1, 0, 0] };
  if (axis === 'y') return { p0: [0, 0, 0], n: [0, 1, 0] };
  if (axis && Array.isArray(axis.p0) && Array.isArray(axis.v)) {
    const n = v3norm(toNumArr(axis.v));
    return { p0: toNumArr(axis.p0), n };
  }
  return { p0: [0, 0, 0], n: [1, 0, 0] };
}
function axisLabel(axis) {
  if (axis === 'x') return 'x 轴';
  if (axis === 'y') return 'y 轴';
  return '自定三维直线';
}
function isAxisN(n, idx) {
  const e = [0, 0, 0]; e[idx] = 1;
  return Math.abs(n[0] - e[0]) < 1e-9 && Math.abs(n[1] - e[1]) < 1e-9 && Math.abs(n[2] - e[2]) < 1e-9;
}
function revolutionImplicit(axis, fTex) {
  const a = resolveAxis(axis);
  if (isAxisN(a.n, 0)) return ['y^{2}+z^{2}=\\left(' + fTex + '\\right)^{2}'];
  if (isAxisN(a.n, 1)) return ['x^{2}+z^{2}=\\left(f^{-1}(y)\\right)^{2}'];
  // 自定轴一般式：到轴距离 = 母函数在轴向投影处的值
  return [
    's=(P-P_0)\\cdot\\hat{n}',
    '|P-P_0|^{2}-s^{2}=\\left(f(s)\\right)^{2}',
  ];
}

/* 由描述构建 shape 的 mesh 与隐式方程
   params: {r,h,a,b,c} 等 Rat；f/g：二维函数对象（可 null）
   返回 {mesh, implicitLines, buildNote} */
function buildShape3d(kind, params, f, g, axis, combine, range, name) {
  const evalF = f ? (x => FRONTEND.evalFn(f, x)) : null;
  const evalG = g ? (x => FRONTEND.evalFn(g, x)) : null;
  const fTex = f ? FRONTEND.nodeToTex(f.expr) : 'f(x)';
  const gTex = g ? FRONTEND.nodeToTex(g.expr) : 'g(y)';
  const rng = (range && Array.isArray(range) && range.length === 2) ? range : [-3, 3];
  let mesh = null, lines = [], note = '';
  if (kind === 'sphere') {
    mesh = sphereMesh(params.r.toNumber(), 24);
    lines = ['x^{2}+y^{2}+z^{2}=' + ratTex(params.r.mul(params.r))];
    note = '球：半径 r=' + params.r.toDisplay();
  } else if (kind === 'cylinder') {
    mesh = cylinderMesh(params.r.toNumber(), params.h.toNumber(), 36);
    lines = ['\\begin{cases} x^{2}+y^{2}=' + ratTex(params.r.mul(params.r)) + ' \\\\ 0\\le z\\le ' + ratTex(params.h) + ' \\end{cases}'];
    note = '圆柱：底面半径 r=' + params.r.toDisplay() + '，高 h=' + params.h.toDisplay();
  } else if (kind === 'cone') {
    mesh = coneMesh(params.r.toNumber(), params.h.toNumber(), 36);
    lines = ['\\begin{cases} x^{2}+y^{2}=\\left(' + params.r.toTeX() + '\\left(1-\\dfrac{z}{' + ratTex(params.h) + '}\\right)\\right)^{2} \\\\ 0\\le z\\le ' + ratTex(params.h) + ' \\end{cases}'];
    note = '圆锥：底面半径 r=' + params.r.toDisplay() + '，高 h=' + params.h.toDisplay();
  } else if (kind === 'cuboid') {
    mesh = cuboidMesh(params.a.toNumber(), params.b.toNumber(), params.c.toNumber());
    lines = ['\\begin{cases} |x|\\le ' + ratHalf(params.a).toTeX() + ' \\\\ |y|\\le ' + ratHalf(params.b).toTeX() + ' \\\\ |z|\\le ' + ratHalf(params.c).toTeX() + ' \\end{cases}'];
    note = '长方体：长 a=' + params.a.toDisplay() + '，宽 b=' + params.b.toDisplay() + '，高 c=' + params.c.toDisplay();
  } else if (kind === 'cube') {
    mesh = cuboidMesh(params.a.toNumber(), params.a.toNumber(), params.a.toNumber());
    lines = ['\\begin{cases} |x|\\le ' + ratHalf(params.a).toTeX() + ' \\\\ |y|\\le ' + ratHalf(params.a).toTeX() + ' \\\\ |z|\\le ' + ratHalf(params.a).toTeX() + ' \\end{cases}'];
    note = '正方体：边长 a=' + params.a.toDisplay();
  } else if (kind === 'revolution') {
    if (evalF) {
      mesh = revolutionMesh(evalF, resolveAxis(axis), rng[0], rng[1], 48, 36);
      lines = revolutionImplicit(axis, fTex);
      note = '由 ' + (name || 'f(x)') + ' 绕' + axisLabel(axis) + '旋转';
    }
  } else if (kind === 'extrusion') {
    if (evalF) {
      mesh = extrusionMesh(evalF, rng[0], rng[1], 3, 72);
      lines = ['z=' + fTex + '\\quad(y\\ \\text{自由})'];
      note = '由 z=' + fTex + ' 沿 y 轴平移扫成柱面';
    }
  } else if (kind === 'bivariate') {
    if (evalF && evalG) {
      mesh = bivariateMesh(evalF, evalG, combine, rng[0], rng[1], 40);
      const op = combine === 'prod' ? '\\cdot' : '+';
      lines = ['z=' + fTex + op + gTex];
      note = '二元曲面 z=f(x)' + (combine === 'prod' ? '·' : '+') + 'g(y)';
    }
  } else if (kind === 'intersection') {
    if (evalF && evalG) {
      mesh = intersectionCurve(evalF, evalG, rng[0], rng[1], 240);
      lines = ['\\begin{cases} z=' + fTex + ' \\\\ z=' + gTex + ' \\end{cases}'];
      note = '两柱面交线：z=f(x) 与 z=g(y)';
    }
  }
  return { mesh, implicitLines: lines, buildNote: note };
}

/* ---------- 颜色工具 ---------- */
function shadeColor(hex, f, alpha) {
  let n = parseInt(String(hex).slice(1), 16);
  if (isNaN(n)) n = 0x3b6ef5;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, Math.round(r * f)); g = Math.min(255, Math.round(g * f)); b = Math.min(255, Math.round(b * f));
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
}

/* ---------- Renderer3D ---------- */
function Renderer3D(canvas, store) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.camera = new Camera3D();
  this.store = store;
  this.w = 1; this.h = 1;
  this.light = v3norm([0.5, 0.7, 0.8]);
  this.showGrid = true;
  this.wireframe = false;
  this.active = false;
  this.bind();
}
Renderer3D.prototype.resize = function () {
  const dpr = window.devicePixelRatio || 1;
  const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
  if (!w || !h) return;
  this.w = w; this.h = h;
  this.canvas.width = Math.round(w * dpr);
  this.canvas.height = Math.round(h * dpr);
  this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};
Renderer3D.prototype.render = function () {
  if (!this.w || !this.h) this.resize();
  const ctx = this.ctx, w = this.w, h = this.h;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  this.drawAxes();
  if (this.showGrid) this.drawGrid();
  const shapes = (this.store && this.store.shapes3d) ? this.store.shapes3d.filter(s => s.visible) : [];
  const polys = [];
  const curves = [];
  for (const s of shapes) {
    if (!s.mesh) continue;
    if (s.mesh.points) { curves.push({ points: s.mesh.points, color: s.color }); continue; }
    const V = s.mesh.vertices, F = s.mesh.faces;
    for (const face of F) {
      const pts = [], world = [];
      let zsum = 0, ok = true;
      for (const idx of face) {
        const vtx = V[idx];
        if (!vtx || !isFinite(vtx[0]) || !isFinite(vtx[1]) || !isFinite(vtx[2])) { ok = false; break; }
        const pr = this.camera.project(vtx, w, h);
        if (!pr) { ok = false; break; }
        pts.push(pr); world.push(vtx); zsum += pr.z;
      }
      if (!ok || pts.length < 3) continue;
      polys.push({ z: zsum / face.length, pts, world, color: s.color });
    }
  }
  polys.sort((a, b) => b.z - a.z);
  for (const poly of polys) this.drawFace(poly);
  for (const c of curves) this.drawCurve3D(c);
};
Renderer3D.prototype.faceNormal = function (world) {
  const a = world[0], b = world[1], c = world[2];
  const u = v3sub(b, a), v = v3sub(c, a);
  return v3norm(v3cross(u, v));
};
Renderer3D.prototype.drawFace = function (poly) {
  const ctx = this.ctx;
  const nrm = this.faceNormal(poly.world);
  const d = Math.abs(v3dot(nrm, this.light));
  ctx.beginPath();
  ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
  for (let i = 1; i < poly.pts.length; i++) ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
  ctx.closePath();
  ctx.fillStyle = shadeColor(poly.color, 0.35 + 0.65 * d, 0.88);
  ctx.fill();
  ctx.strokeStyle = shadeColor(poly.color, 0.6 + 0.4 * d, 1);
  ctx.lineWidth = 0.8;
  ctx.stroke();
};
Renderer3D.prototype.drawCurve3D = function (c) {
  const ctx = this.ctx;
  ctx.save();
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (const p of c.points) {
    const pr = this.camera.project(p, this.w, this.h);
    if (!pr) { started = false; continue; }
    if (!started) { ctx.moveTo(pr.x, pr.y); started = true; }
    else ctx.lineTo(pr.x, pr.y);
  }
  ctx.stroke();
  ctx.restore();
};
Renderer3D.prototype.axisLength = function () {
  const s = Math.min(this.w, this.h) / (2 * this.distanceVal());
  return 4.2 / (s / this.w * 2); // 目标约覆盖视口的固定比例
};
Renderer3D.prototype.distanceVal = function () { return this.camera.distance; };
Renderer3D.prototype.drawAxes = function () {
  const ctx = this.ctx, w = this.w, h = this.h;
  const R = 4;
  const O = this.camera.project([0, 0, 0], w, h);
  const axisDefs = [
    { v: [R, 0, 0], c: '#e11d48', label: 'x' },
    { v: [0, R, 0], c: '#16a34a', label: 'y' },
    { v: [0, 0, R], c: '#3b6ef5', label: 'z' },
  ];
  for (const a of axisDefs) {
    const P = this.camera.project(a.v, w, h);
    if (!O || !P) continue;
    ctx.strokeStyle = a.c; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(O.x, O.y); ctx.lineTo(P.x, P.y); ctx.stroke();
    ctx.fillStyle = a.c; ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.fillText(a.label, P.x + 4, P.y - 4);
  }
  if (O) {
    ctx.fillStyle = '#8a93a3'; ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText('O', O.x + 4, O.y + 12);
  }
};
Renderer3D.prototype.drawGrid = function () {
  const ctx = this.ctx, w = this.w, h = this.h;
  const R = 4, N = 8, step = 2 * R / N;
  ctx.strokeStyle = '#eef1f5'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -N / 2; k <= N / 2; k++) {
    const c1 = this.camera.project([-R, k * step, 0], w, h);
    const c2 = this.camera.project([R, k * step, 0], w, h);
    if (c1 && c2) { ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); }
    const c3 = this.camera.project([k * step, -R, 0], w, h);
    const c4 = this.camera.project([k * step, R, 0], w, h);
    if (c3 && c4) { ctx.moveTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y); }
  }
  ctx.stroke();
};
Renderer3D.prototype.bind = function () {
  const c = this.canvas;
  let dragMode = 'rotate'; // 单指：桌面右键/shift 平移，触摸默认旋转
  const pos = e => {
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const panTarget = (dx, dy) => {
    const b = this.camera.basis();
    const s = this.camera.distance / (Math.min(this.w, this.h) / 2);
    this.camera.target.x -= (dx * b.r.x - dy * b.u.x) * s * 0.4;
    this.camera.target.y -= (dx * b.r.y - dy * b.u.y) * s * 0.4;
    this.camera.target.z -= (dx * b.r.z - dy * b.u.z) * s * 0.4;
  };
  const gt = new GestureTracker({
    onDrag: (dx, dy) => {
      if (dragMode === 'pan') panTarget(dx, dy);
      else { this.camera.azimuth -= dx * 0.008; this.camera.elevation += dy * 0.008; this.camera.clamp(); }
      this.render();
    },
    onPinch: (cx, cy, ratio) => {
      this.camera.distance /= ratio;
      this.camera.clamp();
      this.render();
    },
    onPinchPan: (dx, dy) => { panTarget(dx, dy); this.render(); },
  });
  c.addEventListener('pointerdown', e => {
    if (!this.active) return;
    dragMode = (e.pointerType === 'mouse' && (e.shiftKey || e.button === 2)) ? 'pan' : 'rotate';
    try { c.setPointerCapture(e.pointerId); } catch (err) {}
    gt.down(e.pointerId, pos(e).x, pos(e).y);
    e.preventDefault();
  });
  c.addEventListener('pointermove', e => {
    if (!this.active) return;
    const pt = pos(e);
    gt.move(e.pointerId, pt.x, pt.y);
  });
  c.addEventListener('pointerup', e => { if (this.active) gt.up(e.pointerId); });
  c.addEventListener('pointercancel', e => { if (this.active) gt.cancel(e.pointerId); });
  c.addEventListener('wheel', e => {
    if (!this.active) return;
    e.preventDefault();
    this.camera.distance *= (e.deltaY > 0 ? 1.1 : 0.9);
    this.camera.clamp();
    this.render();
  });
  c.addEventListener('contextmenu', e => e.preventDefault());
};

var RENDER3D = {
  Camera3D, Renderer3D,
  sphereMesh, cylinderMesh, coneMesh, cuboidMesh,
  revolutionMesh, extrusionMesh, bivariateMesh, intersectionCurve,
  buildShape3d, resolveAxis, shadeColor, v3norm,
};

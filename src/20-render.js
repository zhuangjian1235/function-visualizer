/* ============================================================
 * 20-render.js — 渲染层
 *  viewport（平移/缩放/纵横比锁）· ticks（1-2-5 + π模式）
 *  sampler（自适应采样/断路径）· plot（曲线/轴/渐近线/洞/阴影/交点）
 * ============================================================ */
'use strict';

/* ---------- Viewport ---------- */
function Viewport(cw, ch) {
  this.cw = cw; this.ch = ch;
  this.cx = 0; this.cy = 0;
  this.ppx = 50; this.ppy = 50; // 像素/单位（默认 1:1，受 dpr 影响在 plot 里处理）
  this.lockAspect = true;
  this.dpr = 1;
}
Viewport.prototype.xToPx = function (x) { return this.cw / 2 + (x - this.cx) * this.ppx; };
Viewport.prototype.yToPx = function (y) { return this.ch / 2 - (y - this.cy) * this.ppy; };
Viewport.prototype.pxToX = function (px) { return this.cx + (px - this.cw / 2) / this.ppx; };
Viewport.prototype.pxToY = function (py) { return this.cy - (py - this.ch / 2) / this.ppy; };
Viewport.prototype.zoomAt = function (px, py, factor) {
  const wx = this.pxToX(px), wy = this.pxToY(py);
  this.ppx *= factor; this.ppy *= factor;
  this.cx = wx - (px - this.cw / 2) / this.ppx;
  this.cy = wy + (py - this.ch / 2) / this.ppy;
  this.clamp();
};
Viewport.prototype.panBy = function (dx, dy) {
  this.cx -= dx / this.ppx; this.cy += dy / this.ppy;
};
Viewport.prototype.clamp = function () {
  const max = 1e6;
  this.cx = Math.max(-max, Math.min(max, this.cx));
  this.cy = Math.max(-max, Math.min(max, this.cy));
  this.ppx = Math.max(1e-4, Math.min(1e4, this.ppx));
  this.ppy = Math.max(1e-4, Math.min(1e4, this.ppy));
};
Viewport.prototype.xRange = function () { return [this.pxToX(0), this.pxToX(this.cw)]; };
Viewport.prototype.yRange = function () { return [this.pxToY(this.ch), this.pxToY(0)]; };
Viewport.prototype.setAspectLock = function (lock) {
  if (lock && this.ppx !== this.ppy) {
    const m = (this.ppx + this.ppy) / 2;
    this.ppx = m; this.ppy = m;
  }
  this.lockAspect = lock;
};
Viewport.prototype.autoFit = function (samples) {
  // samples: {x,y}[]，取 5-95 分位
  if (!samples || samples.length < 2) return;
  const xs = samples.map(s => s.x).sort((a, b) => a - b);
  const ys = samples.map(s => s.y).sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(arr.length * p)];
  let lo = q(xs, 0.05), hi = q(xs, 0.95);
  let loY = q(ys, 0.05), hiY = q(ys, 0.95);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  if (hiY - loY < 1e-6) { hiY += 1; loY -= 1; }
  const pad = 0.12;
  const wx = hi - lo, wy = hiY - loY;
  this.cx = (lo + hi) / 2; this.cy = (loY + hiY) / 2;
  const ppx = (this.cw * (1 - pad * 2)) / wx;
  const ppy = (this.ch * (1 - pad * 2)) / wy;
  if (this.lockAspect) { const m = Math.min(ppx, ppy); this.ppx = m; this.ppy = m; }
  else { this.ppx = ppx; this.ppy = ppy; }
  this.clamp();
};

/* ---------- Ticks ---------- */
function niceStep(range) {
  const raw = range / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1; else if (norm < 3.5) step = 2; else if (norm < 7.5) step = 5; else step = 10;
  return step * mag;
}
function piStep(range) {
  // 从 π/12, π/6, π/4, π/3, π/2, π, 2π 中选步长使刻度 ≤ 12 个
  const cands = [PI / 12, PI / 6, PI / 4, PI / 3, PI / 2, PI, 2 * PI];
  for (const c of cands) if (range / c <= 12) return c;
  return 2 * PI;
}
function buildTicks(vp, usePi) {
  const xr = vp.xRange(), yr = vp.yRange();
  const xt = [], yt = [];
  const sx = usePi ? piStep(xr[1] - xr[0]) : niceStep(xr[1] - xr[0]);
  const sy = niceStep(yr[1] - yr[0]);
  const startX = Math.ceil(xr[0] / sx) * sx;
  for (let x = startX; x <= xr[1] + sx * 1e-6; x += sx) xt.push(x);
  const startY = Math.ceil(yr[0] / sy) * sy;
  for (let y = startY; y <= yr[1] + sy * 1e-6; y += sy) yt.push(y);
  return { xt, yt, sx, sy };
}
function tickLabel(x, usePi) {
  if (Math.abs(x) < 1e-9) return '0';
  if (usePi) {
    const r = Rat.fromNumber(x / PI, 1000n);
    if (r.d <= 12) {
      if (r.n === 1n) return 'π';
      if (r.n === -1n) return '-π';
      if (r.d === 1n) return r.n + 'π';
      return r.n + 'π/' + r.d;
    }
  }
  return fmtNum(x, 5);
}

/* ---------- Sampler ---------- */
function hasTrig(node) {
  if (node.kind === 'piecewise') return node.cases.some(c => hasTrig(c.expr) || hasTrig(c.cond));
  let found = false;
  const walk = nd => { if (!nd || found) return; if (nd.isFunctionNode) { const nm = nd.fn.name || nd.fn; if (/^(sin|cos|tan|cot|sec|csc)$/.test(nm)) { found = true; return; } } nd.args && nd.args.forEach(walk); };
  walk(node); return found;
}
function sampleCurve(fn, vp, params) {
  // 返回 { points: [{x,y,breakAfter}], poles, holes }
  const xr = vp.xRange();
  const width = vp.cw;
  let N = Math.max(200, Math.min(2000, Math.round(width * vp.dpr)));
  const dom = MATH_.analyzeDomain(fn);
  const poleSet = new Set(dom.poles.map(p => Math.round(p * 1e8)));
  const holeSet = new Set(dom.holes.map(h => Math.round(h.x * 1e8)));

  const points = [];
  const maxYJump = 4 * vp.ch; // 像素
  let prevX = null, prevY = null, prevFinite = false;

  const push = (x, y, breakAfter) => {
    points.push({ x, y, breakAfter: !!breakAfter });
  };

  // 把极值点插入采样点，确保断点精确
  const breakX = dom.poles.slice().sort((a, b) => a - b).filter(x => x >= xr[0] && x <= xr[1]);

  const step = (xr[1] - xr[0]) / N;
  for (let i = 0; i <= N; i++) {
    const x = xr[0] + i * step;
    // 检测是否跨越极点
    let crossedPole = false;
    if (prevFinite && prevX !== null) {
      for (const p of breakX) {
        if (p > Math.min(prevX, x) && p < Math.max(prevX, x)) { crossedPole = true; break; }
      }
    }
    if (crossedPole) { prevFinite = false; prevX = null; prevY = null; }

    const y = FRONTEND.evalFn(fn, x, params);
    const finite = isFinite(y);
    if (!finite) { prevFinite = false; prevX = null; prevY = null; continue; }

    if (prevFinite && prevX !== null) {
      const dyPx = Math.abs(y - prevY) * vp.ppy;
      if (dyPx > maxYJump) {
        // 判断两点间是否确有已知奇点；若没有则视为近垂直段不切断
        let knownSingularity = false;
        for (const p of breakX) { if (p > prevX && p < x) { knownSingularity = true; break; } }
        if (!knownSingularity) {
          // 保留，但用中间细分逼近
          const midX = (prevX + x) / 2, midY = FRONTEND.evalFn(fn, midX, params);
          if (isFinite(midY)) { push(midX, midY, false); }
        } else {
          push(prevX, prevY, true); // 断路径
        }
      }
    }
    push(x, y, false);
    prevX = x; prevY = y; prevFinite = true;
  }

  // 自适应细分：相邻像素差大处加密（简化：对每个大跳段二分）
  return { points, poles: dom.poles, holes: dom.holes };
}

/* ---------- Plot ---------- */
function Plot(canvas, store) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.vp = new Viewport(1, 1);
  this.store = store;
  this.hover = null; // {x, ys:[{name,y}], locked}
  this.pinned = null;
  this.intersections = null; // [{x,y,tex,...}] 联立交点
}
Plot.prototype.resize = function () {
  const dpr = window.devicePixelRatio || 1;
  const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
  this.vp.dpr = dpr;
  this.vp.cw = w; this.vp.ch = h;
  this.canvas.width = Math.round(w * dpr);
  this.canvas.height = Math.round(h * dpr);
  this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};
Plot.prototype.render = function () {
  const ctx = this.ctx, vp = this.vp;
  const w = vp.cw, h = vp.ch;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const fns = this.store.visibleFunctions();
  const anyTrig = fns.some(f => hasTrig(f.expr));
  const ticks = buildTicks(vp, anyTrig);
  this.drawGrid(ticks, anyTrig);
  this.drawAxes();

  // 移动坐标系 overlay（坐标系变换动画/回看期间，只读演示）
  if (this.movingFrame) this.drawMovingFrame(this.movingFrame);

  // 阴影（比较 f>g）
  if (this.store.compareTarget) this.drawCompareShade();

  // 曲线（按类型分发：隐式方程 / 参数方程 / 显式函数）
  for (const fn of fns) {
    if (fn.implicit) {
      if (fn.paramSegs) this.drawParametricCurve(fn, fn.color, 2, null, 1);   // 圆锥曲线：参数方程（平滑）
      else this.drawImplicitCurve(fn, fn.color, 1);                            // 一般隐式方程：网格等值线
    } else if (fn.parametric) {
      this.drawParametricCurve(fn, fn.color, 2, [7, 5], 0.9);
    } else {
      this.drawCurve(fn);
    }
  }

  // 变换残影（历史位置）与变换后的曲线
  if (this.ghosts) for (const g of this.ghosts) this.drawGhost(g);
  if (this.transformCurve) this.drawTransformCurve(this.transformCurve);

  // 交点/钉住读数
  if (this.intersections) this.drawIntersections();
  if (this.pinned) this.drawPinned();
  else if (this.hover) this.drawHover();
};
Plot.prototype.drawGrid = function (ticks, usePi) {
  const ctx = this.ctx, vp = this.vp;
  ctx.strokeStyle = '#eef1f5'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of ticks.xt) { const px = Math.round(vp.xToPx(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, vp.ch); }
  for (const y of ticks.yt) { const py = Math.round(vp.yToPx(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(vp.cw, py); }
  ctx.stroke();
  ctx.fillStyle = '#9aa3b2'; ctx.font = '11px ' + '"Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  for (const x of ticks.xt) {
    if (Math.abs(x) < 1e-9) continue;
    ctx.fillText(tickLabel(x, usePi), vp.xToPx(x), vp.ch / 2 + (vp.cy >= 0 ? -10 : 18));
  }
  ctx.textAlign = 'left';
  for (const y of ticks.yt) {
    if (Math.abs(y) < 1e-9) continue;
    ctx.fillText(tickLabel(y, false), vp.cw / 2 + (vp.cx >= 0 ? 6 : -46), vp.yToPx(y) + 4);
  }
};
Plot.prototype.drawAxes = function () {
  const ctx = this.ctx, vp = this.vp;
  ctx.strokeStyle = '#c8ced8'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  const ax = vp.xToPx(0), ay = vp.yToPx(0);
  if (ax >= 0 && ax <= vp.cw) { ctx.moveTo(ax, 0); ctx.lineTo(ax, vp.ch); }
  if (ay >= 0 && ay <= vp.ch) { ctx.moveTo(0, ay); ctx.lineTo(vp.cw, ay); }
  ctx.stroke();
  // 原点
  ctx.fillStyle = '#8a93a3'; ctx.font = '12px "Segoe UI", sans-serif';
  if (ax >= 0 && ax <= vp.cw && ay >= 0 && ay <= vp.ch) {
    ctx.fillText('O', ax + 4, ay + 14);
  }
  // 轴箭头
  ctx.fillStyle = '#8a93a3';
  if (ay >= 0 && ay <= vp.ch) { ctx.beginPath(); ctx.moveTo(vp.cw - 2, ay); ctx.lineTo(vp.cw - 10, ay - 4); ctx.lineTo(vp.cw - 10, ay + 4); ctx.closePath(); ctx.fill(); ctx.fillText('x', vp.cw - 14, ay - 6); }
  if (ax >= 0 && ax <= vp.cw) { ctx.beginPath(); ctx.moveTo(ax, 2); ctx.lineTo(ax - 4, 10); ctx.lineTo(ax + 4, 10); ctx.closePath(); ctx.fill(); ctx.fillText('y', ax + 6, 12); }
};
/* 移动坐标系 overlay：frame = { theta(弧度), a, b }（世界坐标），只读演示、不拦截指针事件 */
Plot.prototype.drawMovingFrame = function (frame) {
  const ctx = this.ctx, vp = this.vp;
  const th = frame.theta, a = frame.a, b = frame.b;
  const cos = Math.cos(th), sin = Math.sin(th);
  const ux = cos, uy = sin;      // x' 轴方向
  const vx = -sin, vy = cos;     // y' 轴方向
  const rx = vp.cw / vp.ppx, ry = vp.ch / vp.ppy;
  const R = Math.sqrt(rx * rx + ry * ry) * 0.75;
  const xr = vp.xRange();
  const step = niceStep(xr[1] - xr[0]);
  const nLines = Math.min(40, Math.max(4, Math.ceil(R / step)));
  const line = (p1x, p1y, p2x, p2y) => { ctx.moveTo(vp.xToPx(p1x), vp.yToPx(p1y)); ctx.lineTo(vp.xToPx(p2x), vp.yToPx(p2y)); };
  ctx.save();
  // 网格（浅红虚线）
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.16)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  for (let k = -nLines; k <= nLines; k++) {
    const X = k * step;
    const ox = a + X * ux, oy = b + X * uy;
    line(ox - R * vx, oy - R * vy, ox + R * vx, oy + R * vy); // X = X0
  }
  for (let k = -nLines; k <= nLines; k++) {
    const Y = k * step;
    const ox = a + Y * vx, oy = b + Y * vy;
    line(ox - R * ux, oy - R * uy, ox + R * ux, oy + R * uy); // Y = Y0
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // 轴（醒目红）
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  line(a - R * ux, b - R * uy, a + R * ux, b + R * uy);
  line(a - R * vx, b - R * vy, a + R * vx, b + R * vy);
  ctx.stroke();
  // 标注 O' / x' / y'
  ctx.fillStyle = '#e11d48';
  ctx.font = '12px "Segoe UI", sans-serif';
  const oxp = vp.xToPx(a), oyp = vp.yToPx(b);
  if (oxp >= -20 && oxp <= vp.cw + 20 && oyp >= -20 && oyp <= vp.ch + 20) ctx.fillText("O'", oxp + 5, oyp + 15);
  const xe = R - step;
  const xep = vp.xToPx(a + xe * ux), xey = vp.yToPx(b + xe * uy);
  if (xep >= -20 && xep <= vp.cw + 20 && xey >= -20 && xey <= vp.ch + 20) ctx.fillText("x'", xep + 4, xey - 4);
  const yep = vp.xToPx(a + xe * vx), yey = vp.yToPx(b + xe * vy);
  if (yep >= -20 && yep <= vp.cw + 20 && yey >= -20 && yey <= vp.ch + 20) ctx.fillText("y'", yep + 4, yey - 4);
  ctx.restore();
};
/* 参数曲线绘制：pc = { evalX, evalY } 或 { paramSegs: [{evalX,evalY}], tRange: [t0,t1] } */
Plot.prototype.drawParametricCurve = function (pc, color, lineWidth, dash, alpha) {
  const ctx = this.ctx, vp = this.vp;
  const xr = vp.xRange();
  const t0 = (pc.tRange && Array.isArray(pc.tRange)) ? pc.tRange[0] : xr[0];
  const t1 = (pc.tRange && Array.isArray(pc.tRange)) ? pc.tRange[1] : xr[1];
  const N = 400;
  const step = (t1 - t0) / N;
  const segs = pc.paramSegs || [{ evalX: pc.evalX, evalY: pc.evalY }];
  ctx.save();
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth || 2;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  for (const seg of segs) {
    ctx.beginPath();
    let started = false, prevPx = null, prevPy = null;
    for (let i = 0; i <= N; i++) {
      const t = t0 + i * step;
      const X = seg.evalX(t), Y = seg.evalY(t);
      if (!isFinite(X) || !isFinite(Y)) { started = false; prevPx = null; prevPy = null; continue; }
      const px = vp.xToPx(X), py = vp.yToPx(Y);
      if (started && prevPx !== null) {
        const d = Math.hypot(px - prevPx, py - prevPy);
        if (d > vp.ch * 1.2) { ctx.moveTo(px, py); prevPx = px; prevPy = py; continue; }
      }
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
      prevPx = px; prevPy = py;
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
};

/* 边上零点位置：fa、fb 符号相反，返回零点在 [0,1] 的插值位置 */
function edgeT(fa, fb) { return fa / (fa - fb); }
/* 隐式方程 F(x,y)=0 网格 + 等值线绘制（一般隐式方程 / 圆锥曲线备用） */
Plot.prototype.drawImplicitCurve = function (fn, color, alpha) {
  const ctx = this.ctx, vp = this.vp;
  const F = fn.implicitFn;
  if (!F) return;
  const xr = vp.xRange(), yr = vp.yRange();
  const x0 = xr[0], x1 = xr[1], y0 = yr[0], y1 = yr[1];
  const N = 160;
  const dx = (x1 - x0) / N, dy = (y1 - y0) / N;
  const grid = new Float64Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) {
    const y = y1 - j * dy;
    for (let i = 0; i <= N; i++) {
      const x = x0 + i * dx;
      const v = F(x, y);
      grid[j * (N + 1) + i] = isFinite(v) ? v : NaN;
    }
  }
  ctx.save();
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const f00 = grid[j * (N + 1) + i], f10 = grid[j * (N + 1) + i + 1];
      const f01 = grid[(j + 1) * (N + 1) + i], f11 = grid[(j + 1) * (N + 1) + i + 1];
      if (isNaN(f00) || isNaN(f10) || isNaN(f01) || isNaN(f11)) continue;
      const e00 = f00 >= 0, e10 = f10 >= 0, e01 = f01 >= 0, e11 = f11 >= 0;
      const pts = [];
      if (e00 !== e10) pts.push([i + edgeT(f00, f10), j]);                 // 底边
      if (e10 !== e11) pts.push([i + 1, j + edgeT(f10, f11)]);             // 右边
      if (e11 !== e01) pts.push([i + edgeT(f11, f01), j + 1]);             // 顶边
      if (e01 !== e00) pts.push([i, j + edgeT(f01, f00)]);                 // 左边
      if (pts.length === 2) {
        const px1 = vp.xToPx(x0 + pts[0][0] * dx), py1 = vp.yToPx(y1 - pts[0][1] * dy);
        const px2 = vp.xToPx(x0 + pts[1][0] * dx), py2 = vp.yToPx(y1 - pts[1][1] * dy);
        ctx.moveTo(px1, py1); ctx.lineTo(px2, py2);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
};

Plot.prototype.drawCurve = function (fn) {
  const ctx = this.ctx, vp = this.vp;
  const { points, poles, holes } = sampleCurve(fn, vp, fn.params);
  ctx.strokeStyle = fn.color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (const p of points) {
    const px = vp.xToPx(p.x), py = vp.yToPx(p.y);
    if (p.breakAfter) { ctx.moveTo(px, py); started = false; continue; }
    if (!started) { ctx.moveTo(px, py); started = true; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // 洞：空心圆
  for (const hh of holes) {
    const px = vp.xToPx(hh.x), py = vp.yToPx(hh.y);
    if (px < -20 || px > vp.cw + 20) continue;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = fn.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.stroke();
  }
};
Plot.prototype.drawNodeCurve = function (node, params, color, lineWidth, dash, alpha) {
  const fn = { expr: node, params: params || {}, piecewise: false };
  const { points, holes } = sampleCurve(fn, this.vp, fn.params);
  const ctx = this.ctx, vp = this.vp;
  ctx.save();
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  for (const p of points) {
    const px = vp.xToPx(p.x), py = vp.yToPx(p.y);
    if (p.breakAfter) { ctx.moveTo(px, py); started = false; continue; }
    if (!started) { ctx.moveTo(px, py); started = true; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
};
Plot.prototype.drawTransformCurve = function (tc) {
  this.drawNodeCurve(tc.node, tc.params, tc.color, 2.5, [7, 5], 1);
};
Plot.prototype.drawGhost = function (g) {
  this.drawNodeCurve(g.node, g.params, g.color || '#aeb6c2', 1.6, null, 0.18);
};
Plot.prototype.drawCompareShade = function () {
  const target = this.store.compareTarget; // {fId, gId, fBranchIdx, gBranchIdx}
  const f = this.store.getById(target.fId), g = this.store.getById(target.gId);
  if (!f || !g || !f.visible || !g.visible) return;
  const branches = this.store.getCompareBranches();
  if (!branches) return;
  const fb = branches.f, gb = branches.g;
  const ctx = this.ctx, vp = this.vp;
  const xr = vp.xRange();
  // 在 x 上扫描，h=f支−g支>0 处填色（分支 yAt 内含定义域判断）
  const N = 800, step = (xr[1] - xr[0]) / N;
  const fillColor = hexA(f.color, 0.14);
  const segments = [];
  let cur = null;
  for (let i = 0; i <= N; i++) {
    const x = xr[0] + i * step;
    const yf = fb.yAt(x), yg = gb.yAt(x);
    const above = isFinite(yf) && isFinite(yg) && yf > yg;
    if (above) {
      if (!cur) cur = [];
      cur.push({ x, yf, yg });
    } else if (cur) {
      if (cur.length > 1) segments.push(cur);
      cur = null;
    }
  }
  if (cur && cur.length > 1) segments.push(cur);
  for (const seg of segments) {
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(vp.xToPx(seg[0].x), vp.yToPx(seg[0].yf));
    for (let i = 1; i < seg.length; i++) ctx.lineTo(vp.xToPx(seg[i].x), vp.yToPx(seg[i].yf));
    for (let i = seg.length - 1; i >= 0; i--) ctx.lineTo(vp.xToPx(seg[i].x), vp.yToPx(seg[i].yg));
    ctx.closePath();
    ctx.fill();
  }
};
Plot.prototype.drawPinned = function () {
  const ctx = this.ctx, vp = this.vp;
  const p = this.pinned; // {x, ys:[{name,color,y}]}
  const px = vp.xToPx(p.x);
  ctx.strokeStyle = '#d4dae3'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, vp.ch); ctx.stroke();
  ctx.setLineDash([]);
  for (const y of p.ys) {
    ctx.fillStyle = y.color;
    ctx.beginPath(); ctx.arc(px, vp.yToPx(y.y), 4, 0, TAU); ctx.fill();
  }
};
Plot.prototype.drawHover = function () {
  const ctx = this.ctx, vp = this.vp;
  const h = this.hover;
  const px = vp.xToPx(h.x);
  ctx.strokeStyle = '#d4dae3'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, vp.ch); ctx.stroke();
  ctx.setLineDash([]);
  for (const y of h.ys) {
    ctx.fillStyle = y.color;
    ctx.beginPath(); ctx.arc(px, vp.yToPx(y.y), 3.5, 0, TAU); ctx.fill();
  }
};
/* 联立交点标亮：高亮圆点 + x 值投影 + 坐标标注 */
Plot.prototype.drawIntersections = function () {
  const ctx = this.ctx, vp = this.vp;
  for (const p of this.intersections) {
    if (!isFinite(p.x) || !isFinite(p.y)) continue;
    const px = vp.xToPx(p.x), py = vp.yToPx(p.y);
    if (px < -40 || px > vp.cw + 40 || py < -40 || py > vp.ch + 40) continue;
    // 竖虚线投影到 x 轴
    ctx.strokeStyle = 'rgba(225,29,72,0.45)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, vp.yToPx(0)); ctx.stroke();
    ctx.setLineDash([]);
    // 高亮圆点
    ctx.fillStyle = '#e11d48';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.stroke();
    // 坐标标注（x 优先精确文本，否则数值）
    const xLabel = plainRootLabel(p.tex, p.x);
    const lab = xLabel + ', ' + fmtNum(p.y, 4);
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    const tw = ctx.measureText(lab).width;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(px + 9, py - 30, tw + 10, 19);
    ctx.fillStyle = '#e11d48';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(lab, px + 14, py - 16);
    ctx.textBaseline = 'alphabetic';
  }
};
/* 把精确根 TeX（如 \frac{\sqrt{2}}{2}）转为可读纯文本，供 canvas 标注 */
function plainRootLabel(tex, x) {
  if (!tex) return 'x=' + fmtNum(x, 4);
  const t = String(tex);
  // 常见根式/分数
  const fracSqrt = t.match(/\\frac\{\\sqrt\{(\d+)\}\}\{(\d+)\}/);
  if (fracSqrt) return '√' + fracSqrt[1] + '/' + fracSqrt[2];
  const sqrt = t.match(/\\sqrt\{(\d+)\}/);
  if (sqrt) return (t.indexOf('-') >= 0 ? '-' : '') + '√' + sqrt[1];
  const frac = t.match(/\\frac\{(-?\d+)\}\{(\d+)\}/);
  if (frac) return frac[1] + '/' + frac[2];
  // 纯整数 / 小数
  if (/^-?\d+$/.test(t)) return t;
  return fmtNum(x, 4);
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

var RENDER = { Viewport, buildTicks, tickLabel, niceStep, sampleCurve, hasTrig, Plot, hexA };

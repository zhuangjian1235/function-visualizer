/* ============================================================
 * 40-ui.js — UI 层
 *  KaTeX 封装 · 输入 · 函数列表 · 模板 · 滑块
 *  分析面板 · 推导面板 · 变换条 · 比较条 · 交互绑定
 * ============================================================ */
'use strict';

/* ---------- KaTeX 封装 ---------- */
function katexRender(el, tex, display) {
  try {
    katex.render(tex, el, { displayMode: !!display, throwOnError: false, strict: 'ignore', trust: true, output: 'htmlAndMathml' });
  } catch (e) { el.textContent = tex; }
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ---------- DOM 辅助 ---------- */
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

/* ---------- UI 主控制器 ---------- */
function UI(store, plot, renderer3d) {
  this.store = store; this.plot = plot;
  this.renderer3d = renderer3d || null;
  GLOBAL_STORE = store;
  this.el = {};
  this.build();
  this.bind();
  this.render();
}
UI.prototype.$ = function (id) { return this.el[id]; };

UI.prototype.build = function () {
  const app = document.querySelector('.app');
  // 左栏：函数管理（输入 / 模板 / 列表 / 参数）
  const left = document.querySelector('.col-left');
  left.innerHTML = '';
  this.left2d = el('div', 'left-pane');
  this.left3d = el('div', 'left-pane');
  left.appendChild(this.left2d);
  left.appendChild(this.left3d);
  this.left3d.style.display = 'none';
  const head = el('div', 'panel-head'); head.textContent = '函数'; this.left2d.appendChild(head);

  const inputWrap = el('div', 'input-wrap');
  const inputRow = el('div', 'input-row');
  const input = el('input'); input.type = 'text'; input.placeholder = STR.placeholder;
  const addBtn = el('button', null, STR.add);
  inputRow.appendChild(input); inputRow.appendChild(addBtn);
  inputWrap.appendChild(inputRow);
  const errMsg = el('div', 'err-msg'); errMsg.style.display = 'none'; inputWrap.appendChild(errMsg);
  this.left2d.appendChild(inputWrap);

  const templates = el('div', 'templates');
  this.left2d.appendChild(templates);

  const fnlist = el('div', 'fnlist');
  this.left2d.appendChild(fnlist);

  const sliders = el('div', 'sliders');
  const slidersTitle = el('div', 'sliders-title', STR.params);
  sliders.appendChild(slidersTitle);
  this.left2d.appendChild(sliders);

  // 中栏：复用 HTML 中已有的 .canvas-host 与 canvas
  const center = document.querySelector('.col-center');
  let canvasHost = center.querySelector('.canvas-host');
  let canvas = canvasHost ? canvasHost.querySelector('canvas') : null;
  if (!canvasHost) { canvasHost = el('div', 'canvas-host'); center.appendChild(canvasHost); }
  if (!canvas) { canvas = document.createElement('canvas'); canvasHost.appendChild(canvas); }
  const topbar = el('div', 'canvas-topbar');
  canvasHost.appendChild(topbar);
  const readout = el('div', 'hover-readout');
  canvasHost.appendChild(readout);

  // 右栏：图标抽屉（默认收起，画布为主）
  const right = document.querySelector('.col-right');
  this.right2d = el('div', 'right-pane');
  this.right3d = el('div', 'right-pane');
  right.appendChild(this.right2d);
  right.appendChild(this.right3d);
  this.right3d.style.display = 'none';
  this.buildDrawer(this.right2d);

  this.el = { input, addBtn, errMsg, templates, fnlist, sliders, slidersTitle, canvas, canvasHost, topbar, readout, left2d: this.left2d, left3d: this.left3d, right2d: this.right2d, right3d: this.right3d };
  this.buildTemplates();
  this.buildTopbar();
  this.build3dPanel();
  this.activeDrawer = null;
  this.mobileView = 'left';
  this.derivMode = 'explain';
  this.calcGoal = null;
  this.calcFnOverride = null;
  this.calcOrder = 1;
  this.mode = '2d';
};

/* 右栏图标抽屉：图标栏 + 5 个功能小页面 */
UI.prototype.buildDrawer = function (pane) {
  const drawer = el('div', 'drawer');
  const main = el('div', 'drawer-main');
  const rail = el('div', 'drawer-rail');
  drawer.appendChild(main);
  drawer.appendChild(rail);
  pane.appendChild(drawer);
  this.pages = {};
  this.railBtns = {};
  const defs = [
    ['ops', '⊕', '运算'],
    ['calc', '∫', '微积分'],
    ['analysis', '▤', '分析'],
    ['transform', '⇄', '变换'],
    ['history', '☰', '记录'],
  ];
  for (const [key, icon, label] of defs) {
    const p = el('div', 'drawer-page');
    p.dataset.page = key;
    main.appendChild(p);
    this.pages[key] = p;
    const b = el('button', 'rail-btn');
    b.title = label;
    b.innerHTML = '<span style="line-height:1;">' + icon + '</span><span class="rl">' + label + '</span>';
    b.onclick = () => this.toggleDrawer(key);
    rail.appendChild(b);
    this.railBtns[key] = b;
  }
  this.buildOpsPage();
  this.buildCalcPage();
  this.buildAnalysisPage();
  this.buildTransformPage();
  this.buildHistoryPage();
};

/* 运算小页面 */
UI.prototype.buildOpsPage = function () {
  const page = this.pages.ops;
  page.appendChild(el('div', 'dpage-head', '运算'));
  const grid = el('div', 'btn-grid');
  const ops = [['add', STR.opAdd], ['sub', STR.opSub], ['mul', STR.opMul], ['div', STR.opDiv], ['comp', STR.opComp]];
  for (const [op, label] of ops) { const b = el('button', null, label); b.onclick = () => this.doOp(op); grid.appendChild(b); }
  const invBtn = el('button', null, STR.opInv); invBtn.onclick = () => this.doInverse(); grid.appendChild(invBtn);
  grid.appendChild(el('div', 'g-label', '比较 / 交点'));
  const cmpBtn = el('button', null, '比较 f vs g'); cmpBtn.onclick = () => this.doCompare(); grid.appendChild(cmpBtn);
  const intBtn = el('button', null, STR.intersect); intBtn.onclick = () => this.doIntersect(); grid.appendChild(intBtn);
  page.appendChild(grid);
  this.opsResult = el('div', 'dpage-result');
  page.appendChild(this.opsResult);
};

/* 微积分小页面 */
UI.prototype.buildCalcPage = function () {
  const page = this.pages.calc;
  page.appendChild(el('div', 'dpage-head', '微积分'));
  const grid = el('div', 'btn-grid');
  const calcDefs = [
    ['continuity', STR.calcContinuity], ['derivative', STR.calcDerivative],
    ['integral', STR.calcIntegral], ['integrability', STR.calcIntegrability],
    ['implicitDerivative', STR.calcImplicitDeriv],
    ['paramDerivative', STR.calcParamDeriv],
  ];
  for (const [g, label] of calcDefs) { const b = el('button', null, label); b.onclick = () => this.doCalc(g); grid.appendChild(b); }
  const orderWrap = el('span', 'calc-order-wrap');
  orderWrap.appendChild(el('span', 'calc-order-label', STR.order));
  this.calcOrderInput = el('input', 'calc-order');
  this.calcOrderInput.type = 'text';
  this.calcOrderInput.value = '1';
  this.calcOrderInput.title = STR.orderHint;
  orderWrap.appendChild(this.calcOrderInput);
  grid.appendChild(orderWrap);
  page.appendChild(grid);
  this.calcResult = el('div', 'dpage-result');
  page.appendChild(this.calcResult);
};

/* 分析小页面：函数分析 + 区间分析 + 坐标系变换 */
UI.prototype.buildAnalysisPage = function () {
  const page = this.pages.analysis;
  page.appendChild(el('div', 'dpage-head', '分析'));
  this.analysisDynamic = el('div', 'dpage-result');
  page.appendChild(this.analysisDynamic);
  this.buildIntervalPanel(page);
  this.buildCoordPanel(page);
};

/* 变换小页面 */
UI.prototype.buildTransformPage = function () {
  const page = this.pages.transform;
  page.appendChild(el('div', 'dpage-head', '图形变换'));
  const bar = el('div', 'transform-bar');
  page.appendChild(bar);
  this.buildTransformBar(bar);
};

/* 记录小页面 */
UI.prototype.buildHistoryPage = function () {
  const page = this.pages.history;
  page.appendChild(el('div', 'dpage-head', '记录'));
  this.historyResult = el('div', 'dpage-result');
  page.appendChild(this.historyResult);
};

UI.prototype.toggleDrawer = function (key) {
  this.activeDrawer = (this.activeDrawer === key) ? null : key;
  this.render();
};
UI.prototype.openDrawer = function (key) {
  if (this.activeDrawer !== key) this.activeDrawer = key;
  this.render();
};

UI.prototype.buildTemplates = function () {
  const tpls = {
    '一次': 'a*x+b', '二次': 'a*x^2+b*x+c', '三次': 'a*x^3+b*x^2+c*x+d', '反比例': 'a/x+b',
    '指数': 'a*exp(b*x)+c', '对数': 'a*ln(b*x)+c', '正弦': 'a*sin(b*x+c)+d', '余弦': 'a*cos(b*x+c)+d',
    '绝对值': 'a*abs(x-b)+c', '根式': 'a*sqrt(x-b)+c', '分段': '{a*x+b, x>=0; -a*x+b, x<0}',
  };
  for (const k in tpls) {
    const b = el('button', 'tpl', k);
    b.title = tpls[k];
    b.onclick = () => { this.el.input.value = tpls[k]; this.submit(); this.el.input.focus(); };
    this.el.templates.appendChild(b);
  }
  // 圆锥曲线模板（隐式方程 + 参数方程）
  const conicSep = el('div', 'tpl-group', STR.conic);
  this.el.templates.appendChild(conicSep);
  const conics = [['circle', STR.conicCircle], ['ellipse', STR.conicEllipse], ['hyperbola', STR.conicHyperbola], ['parabola', STR.conicParabola]];
  for (const [type, label] of conics) {
    const b = el('button', 'tpl', label);
    b.title = '插入' + label + '模板';
    b.onclick = () => this.addConic(type);
    this.el.templates.appendChild(b);
  }
};
UI.prototype.addConic = function (type) {
  const defaults = {
    circle: { h: new Rat(0n), k: new Rat(0n), r: new Rat(2n) },
    ellipse: { h: new Rat(0n), k: new Rat(0n), a: new Rat(3n), b: new Rat(2n) },
    hyperbola: { h: new Rat(0n), k: new Rat(0n), a: new Rat(2n), b: new Rat(2n) },
    parabola: { h: new Rat(0n), k: new Rat(0n), p: new Rat(1n) },
  };
  const params = defaults[type];
  if (!params) return;
  const fn = MATH_.buildConic(type, params);
  fn.id = 'fn' + (++FN_SEQ);
  fn.color = PALETTE[(FN_SEQ + 3) % PALETTE.length];
  this.store.pushUndo();
  this.store.functions.push(fn);
  this.store.selectedId = fn.id;
  this.store.emit('add');
  this.render();
};
/* 微积分运算入口 */
UI.prototype.doCalc = function (goal) {
  const sel = this.store.selected();
  if (!sel) { alert(STR.noSelection); return; }
  if (goal === 'paramDerivative') {
    if (!sel.parametric) { alert('参数方程求导仅适用于参数曲线（由二维函数旋转生成）'); return; }
  } else if (goal === 'implicitDerivative') {
    if (!(sel.implicit && sel.conicType)) { alert('隐函数求导仅适用于圆锥曲线（圆/椭圆/双曲线/抛物线）'); return; }
  } else if (goal === 'integral' && sel.parametric) {
    // 参数方程积分：不定积分无初等原函数（Liouville），走 paramIntegral 推导
    this.calcFnOverride = null;
    this.finishCalc('paramIntegral');
    return;
  } else if (sel.parametric) {
    alert(STR.noFnAnalysis); return; // 参数方程的四则/其它微积分暂不支持
  } else if (sel.implicit && sel.conicType) {
    // 圆锥曲线：选支显式化后按 y=f(x) 分析
    this.pickBranch(sel, branchIdx => {
      const branches = MATH_.explicitBranches(sel).branches;
      const branch = branches[branchIdx];
      if (!branch || !branch.node) { alert('该分支无法显式化为 y=f(x)'); return; }
      this.calcFnOverride = this.conicBranchFn(sel, branch);
      this.finishCalc(goal);
    });
    return;
  } else if (sel.implicit) {
    alert(STR.noFnAnalysis); return;
  }
  this.calcFnOverride = null;
  this.finishCalc(goal);
};
UI.prototype.finishCalc = function (goal) {
  if (this.store.compareTarget) this.store.clearCompare();
  if (this.store.intersectionTarget) this.store.clearIntersection();
  this.calcGoal = goal;
  const n = parseInt(this.calcOrderInput && this.calcOrderInput.value, 10);
  this.calcOrder = (goal === 'derivative' || goal === 'integral') && isFinite(n) && n >= 1 ? n : 1;
  this.openDrawer('calc');
};
UI.prototype.conicBranchFn = function (sel, branch) {
  const node = branch.node;
  return {
    id: sel.id, src: node.toString(), name: branch.label, var: 'x', expr: node, piecewise: false,
    params: {}, paramOrder: [], paramRanges: {},
    color: sel.color, visible: true, isDerived: false, conicBranch: true, conicOf: sel.id,
  };
};
/* ---------- 区间分析 ---------- */
UI.prototype.buildIntervalPanel = function (right) {
  this.interval = { lo: -Infinity, loOpen: true, hi: Infinity, hiOpen: true };
  this.intervalValid = true;
  const panel = el('div', 'interval-panel');
  const head = el('div', 'interval-head');
  head.appendChild(el('span', 'interval-title', STR.intervalAnalysis));

  const tpls = el('div', 'interval-tpls');
  const tplDefs = [
    ['(-∞,+∞)', { lo: -Infinity, hi: Infinity, loOpen: true, hiOpen: true }],
    ['(a,b)', { lo: 'keep', hi: 'keep', loOpen: true, hiOpen: true }],
    ['[a,b]', { lo: 'keep', hi: 'keep', loOpen: false, hiOpen: false }],
    ['[a,b)', { lo: 'keep', hi: 'keep', loOpen: false, hiOpen: true }],
    ['(a,b]', { lo: 'keep', hi: 'keep', loOpen: true, hiOpen: false }],
    ['[a,+∞)', { lo: 'keep', hi: Infinity, loOpen: false, hiOpen: true }],
    ['(-∞,b]', { lo: -Infinity, hi: 'keep', loOpen: true, hiOpen: false }],
  ];
  for (const [label, shape] of tplDefs) {
    const b = el('button', 'iv-tpl', label);
    b.onclick = () => { this.applyIntervalTemplate(shape); };
    tpls.appendChild(b);
  }

  const row = el('div', 'interval-row');
  this.ivLoBracket = el('button', 'iv-bracket', '(');
  this.ivLo = el('input', 'iv-input');
  this.ivLo.type = 'text'; this.ivLo.placeholder = 'a / -∞';
  const btnNegInf = el('button', 'iv-inf', '-∞');
  this.ivHi = el('input', 'iv-input');
  this.ivHi.type = 'text'; this.ivHi.placeholder = 'b / +∞';
  const btnPosInf = el('button', 'iv-inf', '+∞');
  this.ivHiBracket = el('button', 'iv-bracket', ')');
  this.ivLoBracket.onclick = () => { this.interval.loOpen = !this.interval.loOpen; this.commitInterval(); };
  this.ivHiBracket.onclick = () => { this.interval.hiOpen = !this.interval.hiOpen; this.commitInterval(); };
  btnNegInf.onclick = () => { this.interval.lo = -Infinity; this.interval.loOpen = true; this.commitInterval(); };
  btnPosInf.onclick = () => { this.interval.hi = Infinity; this.interval.hiOpen = true; this.commitInterval(); };
  const applyInputs = () => this.parseIntervalInputs();
  this.ivLo.addEventListener('keydown', e => { if (e.key === 'Enter') applyInputs(); });
  this.ivHi.addEventListener('keydown', e => { if (e.key === 'Enter') applyInputs(); });
  this.ivLo.addEventListener('blur', applyInputs);
  this.ivHi.addEventListener('blur', applyInputs);

  const analyzeBtn = el('button', 'iv-act primary', STR.analysis);
  const jumpBtn = el('button', 'iv-act', STR.jump);
  analyzeBtn.onclick = () => this.parseIntervalInputs();
  jumpBtn.onclick = () => this.jumpToInterval();

  row.appendChild(this.ivLoBracket);
  row.appendChild(this.ivLo);
  row.appendChild(btnNegInf);
  row.appendChild(this.ivHi);
  row.appendChild(btnPosInf);
  row.appendChild(this.ivHiBracket);

  const actRow = el('div', 'interval-act');
  actRow.appendChild(analyzeBtn); actRow.appendChild(jumpBtn);

  this.ivResults = el('div', 'interval-results');

  panel.appendChild(head);
  panel.appendChild(tpls);
  panel.appendChild(row);
  panel.appendChild(actRow);
  panel.appendChild(this.ivResults);
  right.appendChild(panel);
  this.el.intervalPanel = panel;
  this.syncIntervalInputs();
};
UI.prototype.applyIntervalTemplate = function (shape) {
  const iv = this.interval;
  if (shape.lo === 'keep') { if (!isFinite(iv.lo)) iv.lo = -5; }
  else iv.lo = shape.lo;
  if (shape.hi === 'keep') { if (!isFinite(iv.hi)) iv.hi = 5; }
  else iv.hi = shape.hi;
  iv.loOpen = shape.loOpen;
  iv.hiOpen = shape.hiOpen;
  this.intervalValid = true;
  this.syncIntervalInputs();
  this.refreshInterval();
};
UI.prototype.syncIntervalInputs = function () {
  const iv = this.interval;
  this.ivLo.value = iv.lo === -Infinity ? '-∞' : (isFinite(iv.lo) ? fmtNum(iv.lo, 6) : '');
  this.ivHi.value = iv.hi === Infinity ? '+∞' : (isFinite(iv.hi) ? fmtNum(iv.hi, 6) : '');
  this.ivLoBracket.textContent = iv.loOpen ? '(' : '[';
  this.ivHiBracket.textContent = iv.hiOpen ? ')' : ']';
};
UI.prototype.commitInterval = function () {
  const iv = this.interval;
  let msg = '';
  if (iv.lo === Infinity || iv.hi === -Infinity) msg = '左端点不能为 +∞，右端点不能为 -∞';
  else if (iv.lo > iv.hi) msg = '左端点不能大于右端点';
  else if (iv.lo === iv.hi && iv.loOpen && iv.hiOpen) msg = '该区间为空';
  this.intervalValid = !msg;
  this.syncIntervalInputs();
  if (msg) this.markIntervalError(msg);
  else this.refreshInterval();
};
UI.prototype.parseIntervalInputs = function () {
  const lo = parseEndpoint(this.ivLo.value);
  const hi = parseEndpoint(this.ivHi.value);
  if (lo === null || hi === null) { this.intervalValid = false; this.markIntervalError('请输入合法端点（数字或 ±∞）'); return; }
  this.interval.lo = lo; this.interval.hi = hi;
  this.commitInterval();
};
UI.prototype.markIntervalError = function (msg) {
  this.ivResults.innerHTML = '';
  const e = el('div', 'empty-hint', msg);
  e.style.color = 'var(--red)';
  this.ivResults.appendChild(e);
};
UI.prototype.refreshInterval = function () {
  const body = this.ivResults;
  if (!body) return;
  body.innerHTML = '';
  if (!this.intervalValid) { body.appendChild(el('div', 'empty-hint', '请填写合法区间')); return; }
  const sel = this.store.selected();
  if (!sel) { body.appendChild(el('div', 'empty-hint', '请先选择函数')); return; }
  this.renderIntervalResults(body, sel);
};
UI.prototype.renderIntervalResults = function (body, fn) {
  const iv = this.interval;
  const res = ANALYSIS.analyzeOnInterval(fn, iv);
  const ivShow = el('div', 'iv-show');
  katexRender(ivShow, 'x \\in ' + intervalToTex(iv), false);
  body.appendChild(ivShow);

  const monoCard = el('div', 'iv-card');
  monoCard.appendChild(el('div', 'iv-key', STR.monotonicity));
  const mv = el('div', 'iv-val');
  if (res.monotonicDegenerate) mv.textContent = '无法确定单调性';
  else if (res.monotonicConst) mv.textContent = '该区间内为常数（无单调性变化）';
  else if (!res.monotonic.length) mv.textContent = '该区间内无单调性变化';
  else katexRender(mv, monotonicToTex(res.monotonic), false);
  monoCard.appendChild(mv); body.appendChild(monoCard);

  const zeroCard = el('div', 'iv-card');
  zeroCard.appendChild(el('div', 'iv-key', STR.roots));
  const zv = el('div', 'iv-val');
  if (!res.zeros.length) zv.textContent = '该区间内无零点';
  else katexRender(zv, 'x = ' + res.zeros.map(o => o.tex).join(' \\ \\text{或} \\ '), false);
  zeroCard.appendChild(zv); body.appendChild(zeroCard);

  const extCard = el('div', 'iv-card');
  extCard.appendChild(el('div', 'iv-key', STR.extrema));
  const ev = el('div', 'iv-val');
  if (!res.extrema.length) ev.textContent = '该区间内无极值';
  else katexRender(ev, res.extrema.map(e => '(' + fmtDomainValue(e.x) + ',\\ ' + fmtDomainValue(e.y) + ')\\ \\text{' + (e.type === 'max' ? '极大' : '极小') + '}').join('\\quad'), false);
  extCard.appendChild(ev); body.appendChild(extCard);

  const rCard = el('div', 'iv-card');
  rCard.appendChild(el('div', 'iv-key', STR.range));
  const rv = el('div', 'iv-val');
  if (!res.range || !res.range.parts || !res.range.parts.length) rv.textContent = '无法确定值域';
  else { const t = rangeToTex(res.range); if (t) katexRender(rv, t, false); else rv.textContent = '无法确定值域'; }
  rCard.appendChild(rv); body.appendChild(rCard);
};
UI.prototype.jumpToInterval = function () {
  this.parseIntervalInputs();
  if (!this.intervalValid) return;
  const iv = this.interval;
  const vp = this.plot.vp;
  let lo = iv.lo, hi = iv.hi;
  const W = 12;
  if (lo === -Infinity && hi === Infinity) { /* 全域：保持 x，重适配 y */ }
  else if (lo === -Infinity) lo = hi - W;
  else if (hi === Infinity) hi = lo + W;
  if (isFinite(lo) && isFinite(hi)) {
    const pad = (hi - lo) * 0.08 || 1;
    const xlo = lo - pad, xhi = hi + pad;
    vp.cx = (xlo + xhi) / 2;
    vp.ppx = (vp.cw * 0.9) / (xhi - xlo);
  }
  const fn = this.store.selected();
  const xr = vp.xRange();
  const samples = [];
  if (fn) for (let i = 0; i <= 200; i++) { const x = xr[0] + (xr[1] - xr[0]) * i / 200; const y = FRONTEND.evalFn(fn, x, fn.params); if (isFinite(y)) samples.push({ x, y }); }
  if (samples.length) {
    const ys = samples.map(s => s.y).sort((a, b) => a - b);
    let loY = ys[Math.floor(ys.length * 0.03)], hiY = ys[Math.floor(ys.length * 0.97)];
    if (hiY - loY < 1e-6) { hiY += 1; loY -= 1; }
    vp.cy = (loY + hiY) / 2;
    vp.ppy = (vp.ch * 0.9) / (hiY - loY);
  }
  if (vp.lockAspect) { const m = Math.min(vp.ppx, vp.ppy); vp.ppx = m; vp.ppy = m; }
  vp.clamp();
  this.plot.render();
};

UI.prototype.buildTopbar = function () {
  const tb = this.el.topbar;
  const zoomIn = el('button', 'btn-ico', '+'); zoomIn.onclick = () => { this.plot.vp.zoomAt(this.plot.vp.cw / 2, this.plot.vp.ch / 2, 1.25); this.plot.render(); };
  const zoomOut = el('button', 'btn-ico', '−'); zoomOut.onclick = () => { this.plot.vp.zoomAt(this.plot.vp.cw / 2, this.plot.vp.ch / 2, 0.8); this.plot.render(); };
  const fit = el('button', 'btn-ico', STR.fit); fit.onclick = () => this.autoFit();
  const aspect = el('button', 'btn-ico on', STR.aspect); aspect.onclick = () => { const lock = !this.plot.vp.lockAspect; this.plot.vp.setAspectLock(lock); aspect.classList.toggle('on', lock); this.plot.render(); };
  tb.appendChild(zoomIn); tb.appendChild(zoomOut); tb.appendChild(fit); tb.appendChild(aspect);
  const modeSeg = el('div', 'mode-seg');
  this.btn2d = el('button', 'btn-ico active', '2D');
  this.btn3d = el('button', 'btn-ico', '3D');
  this.btn2d.onclick = () => this.switchMode('2d');
  this.btn3d.onclick = () => this.switchMode('3d');
  modeSeg.appendChild(this.btn2d); modeSeg.appendChild(this.btn3d);
  tb.appendChild(modeSeg);
  const fullBtn = el('button', 'btn-ico', '⛶'); fullBtn.title = '全屏画布'; fullBtn.onclick = () => this.toggleFullscreen();
  tb.appendChild(fullBtn);
  this.chip = el('div', 'chip'); this.chip.style.display = 'none'; tb.appendChild(this.chip);
  this.aspectBtn = aspect;
  this.fullBtn = fullBtn;
};

UI.prototype.toggleFullscreen = function () {
  const host = this.el.canvasHost;
  if (!host) return;
  const on = host.classList.toggle('fullscreen');
  if (this.fullBtn) { this.fullBtn.textContent = on ? '⤢' : '⛶'; this.fullBtn.title = on ? '退出全屏' : '全屏画布'; }
  // 画布尺寸变化后立即重排重绘（ResizeObserver 也会兜底）
  if (this.mode === '3d') { if (this.renderer3d) { this.renderer3d.resize(); this.renderer3d.render(); } }
  else { this.plot.resize(); this.plot.render(); }
};
UI.prototype.buildTransformBar = function (bar) {
  this.tfbar = bar;
  // 类型选择
  const seg = el('div', 'tf-seg');
  const types = [['translate', '平移'], ['scale', '伸缩'], ['reflect', '对称'], ['inverse', '反函数'], ['none', '无']];
  this.tfTypeBtns = {};
  for (const [t, label] of types) {
    const b = el('button', t === 'none' ? 'active' : null, label);
    b.onclick = () => this.setTransformType(t);
    seg.appendChild(b);
    this.tfTypeBtns[t] = b;
  }
  bar.appendChild(seg);
  // 参数滑块
  this.tfSliders = el('div', 'tf-group');
  bar.appendChild(this.tfSliders);
  // 添加新函数（把当前变换结果固化为一条新派生函数）
  this.addFnBtn = el('button', 'tf-add-fn', STR.addDerivedFn);
  this.addFnBtn.style.display = 'none';
  bar.appendChild(this.addFnBtn);
  // 公式（无内容时隐藏，不占位）
  this.tfFormula = el('div', 'tf-formula');
  this.tfFormula.style.display = 'none';
  bar.appendChild(this.tfFormula);

  this.addFnBtn.onclick = () => this.addDerivedFunction();

  this.transformType = 'none';
  this.transformParams = { h: new Rat(0n), k: new Rat(0n), omega: new Rat(1n), A: new Rat(1n) };
  this.ghosts = [];
  this._lastTransformKey = '';
};
UI.prototype.bind = function () {
  const s = this.store, p = this.plot;
  const canvas = this.el.canvas;
  const input = this.el.input;
  const addBtn = this.el.addBtn;

  addBtn.onclick = () => this.submit();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') this.submit(); });
  // 中文输入法拦截
  let composing = false;
  input.addEventListener('compositionstart', () => composing = true);
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('input', () => { if (!composing) this.liveValidate(); });

  // 画布交互（Pointer Events：统一鼠标/触摸/触控笔）
  const canvasPos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pin = () => {
    const h = this.plot.hover;
    if (h) { this.plot.pinned = h; this.plot.render(); this.updateReadout(h, true); }
    else { this.plot.pinned = null; }
  };
  const gt = new GestureTracker({
    onDrag: (dx, dy) => { p.vp.panBy(dx, dy); p.render(); },
    onPinch: (cx, cy, ratio) => { p.vp.zoomAt(cx, cy, ratio); p.render(); },
    onPinchPan: (dx, dy) => { p.vp.panBy(dx, dy); p.render(); },
    onTap: pin,
  });
  canvas.addEventListener('pointerdown', e => {
    if (this.mode === '3d') return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const pt = canvasPos(e);
    gt.down(e.pointerId, pt.x, pt.y);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', e => {
    if (this.mode === '3d') return;
    const pt = canvasPos(e);
    if (gt.pointers.size === 0) { this.onHover(e); return; }
    gt.move(e.pointerId, pt.x, pt.y);
  });
  const end2d = e => {
    if (this.mode === '3d') return;
    gt.up(e.pointerId);
    if (gt.pointers.size === 0) canvas.classList.remove('dragging');
  };
  const cancel2d = e => {
    if (this.mode === '3d') return;
    gt.cancel(e.pointerId);
    if (gt.pointers.size === 0) canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', end2d);
  canvas.addEventListener('pointercancel', cancel2d);
  canvas.addEventListener('wheel', e => {
    if (this.mode === '3d') return;
    e.preventDefault();
    const pt = canvasPos(e);
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    p.vp.zoomAt(pt.x, pt.y, f);
    p.render();
  }, { passive: false });

  // 键盘
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); if (e.shiftKey) this.store.redo(); else this.store.undo(); this.render(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.store.redo(); this.render(); }
    // Esc 退出全屏画布
    if (e.key === 'Escape' && this.el.canvasHost && this.el.canvasHost.classList.contains('fullscreen')) {
      this.toggleFullscreen();
    }
  });

  s.on(ev => this.render());

  // 窄窗口页签（按模式动态：2D→函数/工具，3D→三维图形/隐式方程）
  this.refreshMobileTabs();
  this.setMobileView('left');
};

UI.prototype.refreshMobileTabs = function () {
  let mt = this.el.mobTabs;
  if (!mt) {
    mt = document.querySelector('.mob-tabs');
    if (!mt) { mt = el('div', 'mob-tabs'); document.querySelector('.app').appendChild(mt); }
    this.el.mobTabs = mt;
  }
  mt.innerHTML = '';
  const is3d = this.mode === '3d';
  const defs = is3d
    ? [['left', '三维图形'], ['right', '隐式方程']]
    : [['left', '函数'], ['right', '工具']];
  for (const [view, label] of defs) {
    const b = el('button', null, label);
    b.dataset.view = view;
    if (view === this.mobileView) b.classList.add('active');
    b.onclick = () => this.setMobileView(view);
    mt.appendChild(b);
  }
};

UI.prototype.setMobileView = function (view) {
  this.mobileView = view;
  const map = { left: '.col-left', right: '.col-right' };
  for (const k in map) document.querySelector(map[k]).classList.toggle('mob-show', k === view);
  // 「工具」视图强制展开抽屉，便于切换小页面
  if (view === 'right' && !this.activeDrawer) this.activeDrawer = 'calc';
  this.render();
  for (const b of this.el.mobTabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset.view === view);
};

UI.prototype.liveValidate = function () {
  const raw = this.el.input.value;
  if (!raw.trim()) { this.el.errMsg.style.display = 'none'; this.el.input.classList.remove('err'); return; }
  const r = FRONTEND.normalize(raw);
  if (!r.ok) {
    this.el.errMsg.style.display = 'block';
    this.el.errMsg.innerHTML = '⚠ ' + esc(r.error);
    this.el.input.classList.add('err');
  } else {
    // 尝试解析
    const built = FRONTEND.buildFn(r, raw);
    if (built.ok) { this.el.errMsg.style.display = 'none'; this.el.input.classList.remove('err'); }
    else {
      this.el.errMsg.style.display = 'block';
      let msg = esc(built.error);
      this.el.input.classList.add('err');
      this.el.errMsg.textContent = msg;
    }
  }
};

UI.prototype.submit = function () {
  const raw = this.el.input.value.trim();
  if (!raw) { this.showError(STR.errEmpty); return; }
  const r = FRONTEND.normalize(raw);
  if (!r.ok) { this.showError(r.error); return; }
  const built = FRONTEND.buildFn(r, raw);
  if (!built.ok) { this.showError(built.error); return; }
  this.store.addFn(built.fn, true);
  this.el.errMsg.style.display = 'none';
  this.el.input.classList.remove('err');
  this.el.input.value = '';
  this.render();
};
UI.prototype.showError = function (msg) {
  this.el.errMsg.style.display = 'block';
  this.el.errMsg.textContent = msg;
  this.el.input.classList.add('err');
};

UI.prototype.doOp = function (op) {
  const sel = this.store.selected();
  if (!sel) { alert(STR.noSelection); return; }
  if (sel.parametric) { alert(STR.noFnAnalysis); return; } // 参数方程四则/复合暂不支持
  if (sel.implicit && sel.conicType) {
    // 圆锥曲线：选支显式化后参与运算
    this.pickBranch(sel, branchIdx => {
      const branches = MATH_.explicitBranches(sel).branches;
      const branch = branches[branchIdx];
      if (!branch || !branch.node) { alert('该分支无法显式化为 y=f(x)'); return; }
      this.applyOpConicBranch(op, sel, branch);
    });
    return;
  }
  if (sel.implicit) { alert(STR.noFnAnalysis); return; }
  const res = this.store.applyOp(op);
  if (!res.ok) { alert(res.error); return; }
  this.render();
};
UI.prototype.applyOpConicBranch = function (op, sel, branch) {
  const g = this.store.functions.find(f => f.id !== sel.id && !f.isDerived) || this.store.functions.find(f => f.id !== sel.id);
  if (!g) { alert('需要两个函数'); return; }
  const label = { add: '+', sub: '-', mul: '·', div: '÷', comp: '∘' }[op];
  const node0 = branch.node;
  let node;
  if (op === 'comp') node = MATH_.composeNode(node0, g.expr);
  else node = MATH_.opNode(node0, g.expr, op);
  const src = node.toString();
  const fn = {
    id: 'fn' + (++FN_SEQ), src, name: null, var: 'x', expr: node, piecewise: false,
    params: {}, paramOrder: [], paramRanges: {},
    color: PALETTE[(FN_SEQ + 3) % PALETTE.length], visible: true,
    isDerived: true, derivedFrom: [sel.id, g.id], derivedLabel: op,
  };
  this.store.pushUndo();
  this.store.functions.push(fn);
  this.store.selectedId = fn.id;
  this.store.emit('add');
  this.render();
};
UI.prototype.doInverse = function () {
  const sel = this.store.selected();
  if (!sel) { alert('请先选中一个函数'); return; }
  if (sel.implicit || sel.parametric) { alert(STR.noFnAnalysis); return; }
  const inv = MATH_.inverseOf(sel);
  if (!inv.ok) { alert(inv.note); return; }
  // 手动构造
  const fn = {
    id: 'fn' + (++FN_SEQ), src: inv.expr.toString(), name: null, var: sel.var, expr: inv.expr, piecewise: false,
    params: {}, paramOrder: [], paramRanges: {},
    color: PALETTE[(FN_SEQ + 3) % PALETTE.length], visible: true,
    isDerived: true, derivedFrom: [sel.id], derivedLabel: 'inv',
  };
  this.store.pushUndo();
  this.store.functions.push(fn);
  this.store.selectedId = fn.id;
  this.store.emit('add');
  this.render();
};

/* 「添加新函数」：把当前变换条选中的操作（平移/伸缩/对称/反函数）固化为一条新派生函数 */
UI.prototype.addDerivedFunction = function () {
  const sel = this.store.selected();
  if (!sel) { alert('请先选中一个函数'); return; }
  if (sel.implicit || sel.parametric) { alert(STR.noFnAnalysis); return; }
  if (this.transformType === 'none') return;
  if (this.transformType === 'inverse') { this.doInverse(); return; }
  if (sel.piecewise) { alert('分段函数暂不支持变换为派生函数'); return; }
  const t = this.transformedNode();
  if (!t) { alert('当前函数无法生成该变换'); return; }
  const node = t.display || t.node;
  const src = node.toString();
  const fn = {
    id: 'fn' + (++FN_SEQ), src, name: null, var: sel.var, expr: node, piecewise: false,
    params: {}, paramOrder: [], paramRanges: {},
    color: PALETTE[(FN_SEQ + 3) % PALETTE.length], visible: true,
    isDerived: true, derivedFrom: [sel.id], derivedLabel: this.transformType,
  };
  // 变换参数（h/k/ω/A）已代入表达式，但原函数的自由参数（如 a、b）需保留
  for (const p of sel.paramOrder) {
    if (!fn.params[p]) {
      fn.params[p] = sel.params[p] || new Rat(1n);
      fn.paramOrder.push(p);
      fn.paramRanges[p] = sel.paramRanges[p] || [-5, 5, 0.1];
    }
  }
  this.store.pushUndo();
  this.store.functions.push(fn);
  this.store.selectedId = fn.id;
  this.store.emit('add');
  this.render();
};

UI.prototype.doCompare = function () {
  const sel = this.store.selected();
  if (!sel) { alert('请先选中一个函数作为 f'); return; }
  const g = this.store.functions.find(f => f.id !== sel.id);
  if (!g) { alert('需要至少两个函数'); return; }
  const proceed = fIdx => {
    this.pickBranch(g, gIdx => {
      this.store.clearIntersection();
      this.store.setCompare(sel.id, g.id, fIdx, gIdx);
      this.openDrawer('ops');
      this.render();
    });
  };
  this.pickBranch(sel, proceed);
};
/* 联立求交点：选中 f → 选分支 → 选 g → 选分支 → 联立 */
UI.prototype.doIntersect = function () {
  const sel = this.store.selected();
  if (!sel) { alert('请先选中一个函数作为 f'); return; }
  const g = this.store.functions.find(f => f.id !== sel.id);
  if (!g) { alert('需要至少两个函数'); return; }
  const proceed = fIdx => {
    this.pickBranch(g, gIdx => {
      this.store.clearCompare();
      this.store.setIntersection(sel.id, g.id, fIdx, gIdx);
      this.openDrawer('ops');
      this.render();
    });
  };
  this.pickBranch(sel, proceed);
};
/* 选分支：单支直接回调，多支弹出选择器 */
UI.prototype.pickBranch = function (fn, cb) {
  const eb = MATH_.explicitBranches(fn);
  if (eb.note) { alert(eb.note); return; }
  if (!eb.branches.length) { alert(STR.noFnAnalysis); return; }
  if (eb.branches.length === 1) { cb(0); return; }
  this.showBranchPicker(fn, eb.branches, cb);
};
UI.prototype.showBranchPicker = function (fn, branches, cb) {
  const name = fn.name || 'f';
  const overlay = el('div', 'branch-overlay');
  const box = el('div', 'branch-box');
  box.appendChild(el('div', 'branch-title', STR.chooseBranch + '（' + name + '）'));
  const list = el('div', 'branch-list');
  branches.forEach((b, i) => {
    const item = el('button', 'branch-item');
    item.appendChild(el('div', 'branch-item-label', b.label));
    const ex = el('div', 'branch-item-expr');
    katexRender(ex, b.tex || 'y=f(x)\\ \\text{（数值反解）}', false);
    item.appendChild(ex);
    item.onclick = () => { document.body.removeChild(overlay); cb(i); };
    list.appendChild(item);
  });
  box.appendChild(list);
  const cancel = el('button', 'branch-cancel', STR.branchCancel);
  cancel.onclick = () => document.body.removeChild(overlay);
  box.appendChild(cancel);
  overlay.appendChild(box);
  overlay.onclick = e => { if (e.target === overlay) document.body.removeChild(overlay); };
  document.body.appendChild(overlay);
};

UI.prototype.autoFit = function () {
  const vp = this.plot.vp;
  // 优先适配选中的函数；否则适配第一个可见函数
  let target = this.store.selected();
  if (!target) target = this.store.visibleFunctions()[0];
  const fns = target ? [target] : this.store.visibleFunctions();
  if (!fns.length) return;
  const samples = [];
  const xr = vp.xRange();
  for (const fn of fns) {
    if (fn.implicit || fn.parametric) continue;
    for (let i = 0; i <= 300; i++) {
      const x = xr[0] + (xr[1] - xr[0]) * i / 300;
      const y = FRONTEND.evalFn(fn, x, fn.params);
      if (isFinite(y)) samples.push({ x, y });
    }
  }
  vp.autoFit(samples.length ? samples : [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  this.plot.render();
};

/* ---------- 变换 ---------- */
UI.prototype.setTransformType = function (t) {
  this.transformType = t;
  for (const k in this.tfTypeBtns) this.tfTypeBtns[k].classList.toggle('active', k === t);
  if (this.addFnBtn) this.addFnBtn.style.display = (t === 'none') ? 'none' : '';
  this.buildTransformSliders();
  this.render();
};
UI.prototype.buildTransformSliders = function () {
  this.tfSliders.innerHTML = '';
  const sel = this.store.selected();
  const defs = {
    translate: [['h', -5, 5, 0.1], ['k', -5, 5, 0.1]],
    scale: [['omega', 0.2, 5, 0.1], ['A', 0.2, 5, 0.1]],
    reflect: [['axis', 'x', 'y', 'origin']],
    none: [],
  };
  const cfg = defs[this.transformType] || [];
  for (const c of cfg) {
    if (c[1] === 'x') { // 对称选项
      const seg = el('div', 'tf-seg');
      for (const o of ['x轴', 'y轴', '原点']) {
        const b = el('button', null, o);
        b.onclick = () => { this.reflectAxis = o; this.render(); };
        seg.appendChild(b);
      }
      this.tfSliders.appendChild(seg);
      continue;
    }
    const row = el('div', 'tf-slider');
    const label = el('label', null, c[0]);
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = c[1]; slider.max = c[2]; slider.step = c[3]; slider.value = this.transformParams[c[0]].toNumber();
    const val = document.createElement('input'); val.type = 'text'; val.className = 'val'; val.value = this.transformParams[c[0]].toDisplay(); val.title = '可直接输入数值';
    slider.oninput = () => {
      this.transformParams[c[0]] = Rat.fromNumber(parseFloat(slider.value));
      val.value = this.transformParams[c[0]].toDisplay();
      this.render();
    };
    slider.addEventListener('keydown', e => {
      const dir = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (!dir || !e.shiftKey) return;
      e.preventDefault();
      const step = parseFloat(c[3]) * 10;
      const v = Rat.fromNumber(Math.max(parseFloat(c[1]), Math.min(parseFloat(c[2]), parseFloat(slider.value) + dir * step)));
      this.transformParams[c[0]] = v;
      slider.value = v.toNumber();
      val.value = v.toDisplay();
      this.render();
    });
    const applyTf = () => {
      const r = parseRatValue(val.value);
      if (r) { this.transformParams[c[0]] = r; this.render(); }
      else val.value = this.transformParams[c[0]].toDisplay();
    };
    val.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyTf(); val.blur(); } });
    val.addEventListener('blur', applyTf);
    row.appendChild(label); row.appendChild(slider); row.appendChild(val);
    this.tfSliders.appendChild(row);
  }
  this.reflectAxis = 'x轴';
};
/* 当前变换参数的唯一键（用于残影去重） */
UI.prototype.transformKey = function () {
  const { h, k, omega, A } = this.transformParams;
  return [this.transformType, this.reflectAxis || '', h.n, h.d, k.n, k.d, omega.n, omega.d, A.n, A.d].join('|');
};
/* 由选中函数 + 变换参数合成变换后的节点
   图象动：y=A·f(ωx)、y=f(x-h)+k、y=±f(±x) */
UI.prototype.transformedNode = function () {
  const sel = this.store.selected();
  if (!sel || this.transformType === 'none' || this.transformType === 'inverse') return null;
  if (sel.piecewise) return null;
  const { h, k, omega, A } = this.transformParams;
  const hT = h.toTeX(), kT = k.toTeX(), oT = omega.toTeX(), aT = A.toTeX();
  let inner = 'x', prefix = '', suffix = '';
  if (this.transformType === 'translate') {
    // 图象右移 h、上移 k → x→x-h
    inner = '(x-(' + hT + '))';
    if (!k.isZero()) suffix = '+(' + kT + ')';
  } else if (this.transformType === 'scale') {
    // y=A·f(ωx)
    inner = '((' + oT + ')*x)';
    if (!A.eq(new Rat(1n))) prefix = '(' + aT + ')*';
  } else if (this.transformType === 'reflect') {
    if (this.reflectAxis === 'y轴' || this.reflectAxis === '原点') inner = '(-x)';
    if (this.reflectAxis === 'x轴' || this.reflectAxis === '原点') prefix = '-';
  }
  let composed;
  try { composed = MATH_.composeNode(sel.expr, math.parse(inner)); }
  catch (e) { return null; }
  let expr = '(' + composed.toString() + ')';
  if (prefix) expr = prefix + expr;
  if (suffix) expr = expr + suffix;
  try {
    const node = math.parse(expr);
    // 展开显示：多项式用 rationalize 展开 (x-h)^2 等，其余用 simplify
    let display = null;
    try { const r = math.rationalize(node); if (r && r.toString() !== node.toString()) display = r; } catch (e) {}
    if (!display) { try { const s = math.simplify(node, {}, math.simplify.realContext); if (s.toString() !== node.toString()) display = s; } catch (e) {} }
    return { node, display: display || node };
  } catch (e) { return null; }
};
/* 把变换结果 + 残影同步给绘图层（残影 ≤ 24） */
UI.prototype.applyTransformToPlot = function () {
  const t = this.transformedNode();
  const key = this.transformKey();
  if (t && key !== this._lastTransformKey) {
    if (this.plot.transformCurve && this.plot.transformCurve.node) {
      this.ghosts.push({ node: this.plot.transformCurve.node, params: this.plot.transformCurve.params, color: this.plot.transformCurve.color });
      if (this.ghosts.length > 24) this.ghosts.shift();
    }
    this._lastTransformKey = key;
  }
  if (!t) { this.ghosts = []; this._lastTransformKey = ''; }
  const sel = this.store.selected();
  this.plot.transformCurve = t ? { node: t.node, params: sel ? sel.params : {}, color: sel ? sel.color : '#f59e0b' } : null;
  this.plot.ghosts = this.ghosts;
};
UI.prototype.transformFormula = function () {
  const sel = this.store.selected();
  if (!sel || this.transformType === 'none') return null;
  const { h, k, omega, A } = this.transformParams;
  const f = sel.name ? sel.name + '(x)' : 'f(x)';
  if (this.transformType === 'translate') {
    // 图象右移 h、上移 k → y=f(x-h)+k（与 transformedNode 的 x-h 语义一致）
    const hs = h.sign(), ks = k.sign();
    const hTerm = hs > 0 ? '-' + h.toDisplay() : hs < 0 ? '+' + h.neg().toDisplay() : '';
    const kTerm = ks > 0 ? '+' + k.toDisplay() : ks < 0 ? '-' + k.neg().toDisplay() : '';
    return 'y=f(x' + hTerm + ')' + kTerm;
  }
  if (this.transformType === 'scale') return 'y=' + A.toDisplay() + '·f(' + omega.toDisplay() + 'x)';
  if (this.transformType === 'reflect') {
    if (this.reflectAxis === 'x轴') return 'y=-f(x)';
    if (this.reflectAxis === 'y轴') return 'y=f(-x)';
    return 'y=-f(-x)';
  }
  return '';
};
/* ---------- 悬停读数 ---------- */
UI.prototype.onHover = function (e) {
  const canvas = this.el.canvas;
  const rect = canvas.getBoundingClientRect();
  const x = this.plot.vp.pxToX(e.clientX - rect.left);
  const fns = this.store.visibleFunctions();
  const ys = [];
  for (const fn of fns) {
    if (fn.implicit || fn.parametric) continue;
    const y = FRONTEND.evalFn(fn, x, fn.params);
    if (isFinite(y)) ys.push({ name: fn.name || 'f', color: fn.color, y });
  }
  if (ys.length) { this.plot.hover = { x, ys }; this.plot.pinned = null; this.plot.render(); this.updateReadout(this.plot.hover, false); }
  else { this.plot.hover = null; this.el.readout.style.display = 'none'; }
};
UI.prototype.updateReadout = function (h, locked) {
  const rd = this.el.readout;
  const parts = ['x=' + fmtNum(h.x, 4)];
  for (const y of h.ys) parts.push((y.name || 'f') + '=' + fmtNum(y.y, 4));
  if (h.ys.length >= 2) {
    const a = h.ys[0].y, b = h.ys[1].y;
    parts.push(h.ys[0].name + (a > b ? '>' : a < b ? '<' : '=') + h.ys[1].name);
  }
  rd.textContent = parts.join('  |  ') + (locked ? '  已钉住' : '');
  rd.style.display = 'block';
};

/* ---------- 渲染 ---------- */
UI.prototype.render = function () {
  for (const f of this.store.functions) if (f.implicit) MATH_.updateConic(f);
  this.plot.intersections = this.store.intersectionTarget ? ANALYSIS.computeIntersections() : null;
  if (this.mode === '3d') {
    this.render3dList();
    this.render3dDetail();
    if (this.renderer3d) { this.renderer3d.resize(); this.renderer3d.render(); }
    return;
  }
  this.renderFunctionList();
  this.renderSliders();
  this.renderDrawerPage();
  this.renderTransformFormula();
  this.applyTransformToPlot();
  this.refreshInterval();
  this.plot.render();
};
UI.prototype.renderFunctionList = function () {
  const list = this.el.fnlist;
  list.innerHTML = '';
  if (this.store.functions.length === 0) {
    list.appendChild(el('div', 'fnlist-empty', '输入一个函数开始，例如：\nf(x)=x^2-2x-3\n或点上方模板快速插入。'));
    return;
  }
  for (const fn of this.store.functions) {
    const item = el('div', 'fn-item' + (fn.id === this.store.selectedId ? ' selected' : ''));
    const swatch = el('div', 'swatch'); swatch.style.background = fn.color;
    let nameText = fn.name || 'f';
    if (fn.implicit && fn.conicType) nameText = MATH_.CONIC[fn.conicType].label;
    else if (fn.parametric) nameText = '参数曲线';
    const name = el('div', 'fname', nameText);
    const expr = el('div', 'fexpr');
    if (fn.implicit && fn.conicType) {
      katexRender(expr, MATH_.CONIC[fn.conicType].implicitTex(fn.conicParams), false);
      expr.appendChild(el('span', 'deriv-tag', '隐式'));
    } else if (fn.parametric) {
      if (fn.pcSrcTex) katexRender(expr, fn.pcSrcTex + '\\;\\text{旋转 }' + fn.pcTheta + '^{\\circ}', false);
      else katexRender(expr, FRONTEND.nodeToTex(fn.expr), false);
      expr.appendChild(el('span', 'deriv-tag', '参数曲线'));
    } else {
      katexRender(expr, FRONTEND.nodeToTex(fn.expr), false);
      if (fn.isDerived) expr.appendChild(el('span', 'deriv-tag', '派生'));
    }
    const ops = el('div', 'ops');
    const visBtn = el('button', null, fn.visible ? '👁' : '–'); visBtn.className = 'visibility-toggle' + (fn.visible ? '' : ' off');
    visBtn.title = '显示/隐藏';
    visBtn.onclick = (e) => { e.stopPropagation(); this.store.toggleVisible(fn.id); };
    const delBtn = el('button', 'del', '×'); delBtn.title = '删除';
    delBtn.onclick = (e) => { e.stopPropagation(); this.store.removeFn(fn.id); };
    ops.appendChild(visBtn); ops.appendChild(delBtn);
    item.appendChild(swatch); item.appendChild(name); item.appendChild(expr); item.appendChild(ops);
    item.onclick = () => { this.store.select(fn.id); };
    list.appendChild(item);
  }
};
UI.prototype.renderSliders = function () {
  const cont = this.el.sliders;
  // 清空并保留标题
  cont.innerHTML = '';
  cont.appendChild(el('div', 'sliders-title', STR.params));
  const sel = this.store.selected();
  if (sel && sel.implicit && sel.conicType) {
    const def = MATH_.CONIC[sel.conicType];
    if (def && def.generalTex) {
      const g = el('div', 'slider-general');
      const line1 = el('div', 'sg-line');
      line1.appendChild(el('span', 'sg-label', STR.generalForm + '：'));
      const texEl = el('span', 'sg-tex');
      katexRender(texEl, def.generalTex, false);
      line1.appendChild(texEl);
      g.appendChild(line1);
      const line2 = el('div', 'sg-desc');
      line2.textContent = def.params.map(n => n + '：' + def.paramDesc[n]).join('　');
      g.appendChild(line2);
      cont.appendChild(g);
    }
  }
  if (!sel || sel.paramOrder.length === 0) { cont.appendChild(el('div', 'fnlist-empty', '当前函数没有自由参数。')); return; }
  for (const name of sel.paramOrder) {
    const rng = sel.paramRanges[name] || [-5, 5, 0.1];
    const row = el('div', 'slider-row');
    const pname = el('div', 'pname', name);
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = rng[0]; slider.max = rng[1]; slider.step = rng[2];
    slider.value = (sel.params[name] || new Rat(1n)).toNumber();
    // 手动输入框
    const pval = el('input', 'pval');
    pval.type = 'text';
    pval.value = (sel.params[name] || new Rat(1n)).toDisplay();
    pval.title = '可直接输入数值，如 3/2、0.5、-2';
    slider.oninput = () => {
      const v = Rat.fromNumber(parseFloat(slider.value));
      this.store.setParam(sel.id, name, v);
      pval.value = v.toDisplay();
      this.render();
    };
    slider.addEventListener('keydown', e => {
      const dir = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (!dir) return;
      // 普通方向键走原生（触发 input），这里处理 Shift ×10
      if (!e.shiftKey) return;
      e.preventDefault();
      const step = parseFloat(rng[2]) * 10;
      const v = Rat.fromNumber(Math.max(parseFloat(rng[0]), Math.min(parseFloat(rng[1]), parseFloat(slider.value) + dir * step)));
      this.store.setParam(sel.id, name, v);
      slider.value = v.toNumber();
      pval.value = v.toDisplay();
      this.render();
    });
    const applyInput = () => {
      const r = parseRatValue(pval.value);
      if (r) {
        this.store.setParam(sel.id, name, r);
        this.render();
      } else {
        pval.value = (sel.params[name] || new Rat(1n)).toDisplay();
        pval.classList.add('err');
        setTimeout(() => pval.classList.remove('err'), 600);
      }
    };
    pval.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyInput(); pval.blur(); } });
    pval.addEventListener('blur', applyInput);
    pname.ondblclick = () => {
      const a = prompt('最小值', rng[0]), b = prompt('最大值', rng[1]), s2 = prompt('步长', rng[2]);
      if (a != null && b != null && s2 != null) { sel.paramRanges[name] = [parseFloat(a), parseFloat(b), parseFloat(s2)]; this.render(); }
    };
    row.appendChild(pname); row.appendChild(slider); row.appendChild(pval);
    cont.appendChild(row);
  }
};
UI.prototype.renderDrawerPage = function () {
  const key = this.activeDrawer;
  for (const k in this.pages) this.pages[k].classList.toggle('active', k === key);
  for (const k in this.railBtns) this.railBtns[k].classList.toggle('active', k === key);
  document.querySelector('.app').classList.toggle('drawer-open', !!key);
  const sel = this.store.selected();
  if (key === 'ops') {
    this.opsResult.innerHTML = '';
    if (this.store.compareTarget || this.store.intersectionTarget) {
      if (sel) this.renderDerivation(this.opsResult, sel);
    } else {
      this.opsResult.appendChild(el('div', 'empty-hint', '选择上方运算：四则 / 复合 / 反函数生成新函数；「比较」「联立求交点」在画布上查看结果。'));
    }
  } else if (key === 'calc') {
    this.calcResult.innerHTML = '';
    if (this.calcGoal) {
      if (sel) this.renderDerivation(this.calcResult, sel);
    } else {
      this.calcResult.appendChild(el('div', 'empty-hint', '选择上方微积分运算，查看可导 / 可积判定与完整推导。'));
    }
  } else if (key === 'analysis') {
    this.analysisDynamic.innerHTML = '';
    if (!sel) { this.analysisDynamic.appendChild(el('div', 'empty-hint', STR.noSelection)); return; }
    this.renderCurveForm(this.analysisDynamic, sel);
    if (sel.implicit || sel.parametric) {
      this.analysisDynamic.appendChild(el('div', 'empty-hint', STR.noFnAnalysis));
      return;
    }
    this.renderAnalysis(this.analysisDynamic, sel);
  } else if (key === 'history') {
    this.historyResult.innerHTML = '';
    this.renderHistory(this.historyResult);
  }
};
/* 表达形式：隐式方程 F(x,y)=0 与参数方程 {x(t),y(t)} */
UI.prototype.parametricTex = function (fn) {
  const th = fn.pcTheta;
  const aS = fn.pcA.toTeX(), bS = fn.pcB.toTeX();
  return 'X(t)=(t-' + aS + ')\\cos' + th + '^{\\circ}+(f(t)-' + bS + ')\\sin' + th + '^{\\circ},\\quad Y(t)=-(t-' + aS + ')\\sin' + th + '^{\\circ}+(f(t)-' + bS + ')\\cos' + th + '^{\\circ}';
};
UI.prototype.renderCurveForm = function (body, fn) {
  const card = el('div', 'acard');
  card.appendChild(el('div', 'acard-head', STR.curveForm));
  const cb = el('div', 'acard-body');
  const addLine = (label, tex) => {
    const line = el('div', 'form-line');
    line.appendChild(el('span', 'form-label', label + '：'));
    const t = el('span', 'form-tex');
    katexRender(t, tex, false);
    line.appendChild(t);
    cb.appendChild(line);
  };
  if (fn.implicit && fn.conicType) {
    addLine(STR.implicitEq, fn.implicitTex);
    addLine(STR.paramEq, fn.paramTex);
  } else if (fn.parametric) {
    addLine(STR.paramEq, this.parametricTex(fn));
    const imp = MATH_.paramImplicit(fn);
    if (imp) addLine(STR.implicitEq, imp.tex);
  } else {
    const imp = MATH_.explicitImplicit(fn);
    addLine(STR.implicitEq, imp.tex);
  }
  card.appendChild(cb);
  body.appendChild(card);
};
UI.prototype.renderAnalysis = function (body, fn) {
  const a = ANALYSIS.analyzeFunction(fn);
  // 定义域
  const cardDomain = el('div', 'acard');
  cardDomain.appendChild(el('div', 'acard-head', STR.domain));
  const db = el('div', 'acard-body');
  const domTex = domainToTex(a.domain, fn);
  katexRender(db, domTex, false);
  if (a.domain.holes.length) {
    const hline = el('div', null, '可去间断点：' + a.domain.holes.map(h => '(' + fmtNum(h.x, 3) + ', ' + fmtNum(h.y, 3) + ')').join('、'));
    hline.style.color = '#d97706';
    db.appendChild(hline);
  }
  cardDomain.appendChild(db); body.appendChild(cardDomain);

  // 零点
  if (a.roots.roots.length) {
    const card = el('div', 'acard');
    card.appendChild(el('div', 'acard-head', STR.roots + ' · ' + completenessBadge(a.roots.completeness)));
    const cb = el('div', 'acard-body');
    const tex = a.roots.roots.map(o => o.tex).join('\\quad');
    katexRender(cb, tex, false);
    card.appendChild(cb); body.appendChild(card);
  }

  // 单调性
  const monoCard = el('div', 'acard');
  monoCard.appendChild(el('div', 'acard-head', STR.monotonicity));
  const mcb = el('div', 'acard-body');
  if (a.monotonic === null) mcb.textContent = '无法确定单调性';
  else if (a.monotonicConst) mcb.textContent = '常数函数（无单调性变化）';
  else if (!a.monotonic.length) mcb.textContent = '无单调性变化';
  else katexRender(mcb, monotonicToTex(a.monotonic), false);
  monoCard.appendChild(mcb); body.appendChild(monoCard);

  // 极值
  if (a.extrema && a.extrema.length) {
    const card = el('div', 'acard');
    card.appendChild(el('div', 'acard-head', STR.extrema));
    const cb = el('div', 'acard-body');
    const tex = a.extrema.map(e => '(' + fmtDomainValue(e.x) + ',\\ ' + fmtDomainValue(e.y) + ')\\ \\text{' + (e.type === 'max' ? '极大' : '极小') + '}').join('\\quad');
    katexRender(cb, tex, false);
    card.appendChild(cb); body.appendChild(card);
  }

  // 渐近线
  if (a.asymptotes.length) {
    const card = el('div', 'acard');
    card.appendChild(el('div', 'acard-head', STR.asymptotes));
    const cb = el('div', 'acard-body');
    const parts = a.asymptotes.map(as => as.tex + (as.type === 'vertical' ? '（垂直）' : as.type === 'slant' ? '（斜）' : '（水平）'));
    const tex = a.asymptotes.map(as => as.tex).join('\\quad');
    katexRender(cb, tex, false);
    card.appendChild(cb); body.appendChild(card);
  }

  // 值域
  if (a.range) {
    const card = el('div', 'acard');
    card.appendChild(el('div', 'acard-head', STR.range + (a.range.approx ? '（数值估计）' : '')));
    const cb = el('div', 'acard-body');
    const rt = rangeToTex(a.range);
    if (rt) katexRender(cb, rt, false);
    else cb.textContent = '无法确定';
    card.appendChild(cb); body.appendChild(card);
  }

  // 奇偶
  if (a.parity) {
    const card = el('div', 'acard');
    card.appendChild(el('div', 'acard-head', STR.parity));
    const cb = el('div', 'acard-body', a.parity);
    card.appendChild(cb); body.appendChild(card);
  }
};
/* 定义域端点：优先精确（整数/分数/π/二次根式），兜底干净小数 */
function fmtDomainValue(x) {
  if (!isFinite(x)) return x > 0 ? '+\\infty' : '-\\infty';
  if (Math.abs(x) < 1e-9) return '0';
  // 简单有理数 → 分数
  const r = Rat.fromNumber(x, 1000n);
  if (r && r.d <= 100) return r.d === 1n ? r.n.toString() : r.toTeX();
  // π 的常见倍数
  const pi = Rat.fromNumber(x / PI, 1000n);
  if (pi && pi.d <= 12 && pi.d > 1n) return '\\frac{' + pi.n + '\\pi}{' + pi.d + '}';
  if (pi && pi.d === 1n && pi.n !== 0n) return (pi.n === 1n ? '' : (pi.n === -1n ? '-' : pi.n.toString())) + '\\pi';
  // 纯二次根式 √n（n ≤ 20 非平方数）
  const sq = x * x;
  if (sq > 0) {
    const n = Math.round(sq);
    if (n <= 20 && Math.abs(sq - n) < 1e-6 && !Number.isInteger(Math.sqrt(n))) {
      return (x < 0 ? '-' : '') + '\\sqrt{' + n + '}';
    }
  }
  // 兜底：干净小数（去尾零）
  return (Math.abs(x) >= 1000 || Math.abs(x) < 1e-4 ? x.toExponential(2) : x.toFixed(4)).replace(/\.?0+$/, '');
}
function domainToTex(domain, fn) {
  if (!domain.breaks.length && !domain.holes.length) return 'x \\in \\mathbb{R}';
  const parts = [];
  for (const iv of domain.intervals) {
    const l = iv.lo === -Infinity ? '(-\\infty' : (iv.loOpen ? '(' : '[') + (iv.loTex || fmtDomainValue(iv.lo));
    const r = iv.hi === Infinity ? '+\\infty)' : (iv.hiTex || fmtDomainValue(iv.hi)) + (iv.hiOpen ? ')' : ']');
    parts.push(l + ', ' + r);
  }
  return 'x \\in ' + parts.join(' \\cup ');
}

UI.prototype.renderDerivation = function (body, fn) {
  // 判断处于比较 / 微积分 / 普通分析 状态
  let goal, opts = null;
  if (this.store.intersectionTarget) goal = 'intersection';
  else if (this.store.compareTarget) goal = 'compare';
  else if (this.calcGoal) {
    goal = this.calcGoal;
    const lo = this.interval && isFinite(this.interval.lo) ? this.interval.lo : -10;
    const hi = this.interval && isFinite(this.interval.hi) ? this.interval.hi : 10;
    opts = { order: this.calcOrder || 1, a: lo, b: hi };
  } else goal = 'analyze';
  const effFn = (this.calcGoal && this.calcFnOverride) ? this.calcFnOverride : fn;
  const deriv = ANALYSIS.buildDerivation(effFn, goal, opts);
  // 标题 + 步骤讲解/完整代数 切换
  const head = el('div', 'deriv-head');
  head.appendChild(el('span', 'deriv-title', deriv.title));
  const seg = el('div', 'deriv-mode');
  const bExplain = el('button', this.derivMode !== 'algebra' ? 'active' : null, '步骤讲解');
  const bAlgebra = el('button', this.derivMode === 'algebra' ? 'active' : null, '完整代数步骤');
  bExplain.onclick = () => { this.derivMode = 'explain'; this.render(); };
  bAlgebra.onclick = () => { this.derivMode = 'algebra'; this.render(); };
  seg.appendChild(bExplain); seg.appendChild(bAlgebra);
  head.appendChild(seg);
  body.appendChild(head);
  const showAlgebra = this.derivMode === 'algebra';
  for (const s of deriv.steps) {
    const step = el('div', 'step ' + s.tier);
    const stepHead = el('div', 'step-head');
    stepHead.appendChild(el('span', 'rule-name', s.ruleName));
    if (s.verify) stepHead.appendChild(el('span', 'badge ' + (s.verify.ok ? 'ok' : 'fail'), s.verify.ok ? STR.verified : STR.notVerified));
    step.appendChild(stepHead);
    if (showAlgebra && s.algebra && s.algebra.length) {
      const chain = el('div', 'algebra-chain');
      s.algebra.forEach((line, i) => {
        const row = el('div', 'algebra-row');
        const lead = el('span', 'algebra-lead', i === 0 ? '' : '=');
        const t = el('span', 'algebra-tex');
        katexRender(t, line, false);
        row.appendChild(lead); row.appendChild(t);
        chain.appendChild(row);
      });
      step.appendChild(chain);
      step.appendChild(el('div', 'justify', s.justification));
    } else {
      const eq = el('div', 'eq');
      katexRender(eq, s.eqTex, false);
      step.appendChild(eq);
      step.appendChild(el('div', 'justify', s.justification));
    }
    if (s.detail) {
      const toggle = el('button', 'detail-toggle', '查看详细推导');
      const detail = el('div', 'detail', typeof s.detail.payload === 'string' ? s.detail.payload : '');
      toggle.onclick = () => detail.classList.toggle('open');
      step.appendChild(toggle); step.appendChild(detail);
    }
    body.appendChild(step);
  }
  if (deriv.conclusion) {
    const concl = el('div', 'conclusion');
    if (deriv.conclusion.badges && deriv.conclusion.badges.length) {
      const tag = el('div', 'tagline');
      deriv.conclusion.badges.forEach(b => tag.appendChild(el('span', 'chip green', b)));
      concl.appendChild(tag);
    }
    const texs = Array.isArray(deriv.conclusion.tex) ? deriv.conclusion.tex : (deriv.conclusion.tex ? [deriv.conclusion.tex] : []);
    texs.forEach(t => { const d = el('div', 'concl-tex'); katexRender(d, t, false); concl.appendChild(d); });
    if (deriv.conclusion.text) concl.appendChild(el('div', 'concl-text', deriv.conclusion.text));
    body.appendChild(concl);
  }
};
UI.prototype.renderHistory = function (body) {
  if (this.store.history.length === 0) { body.appendChild(el('div', 'empty-hint', '暂无推导记录。')); return; }
  for (const h of this.store.history) {
    const item = el('div', 'acard');
    item.appendChild(el('div', 'acard-head', h.time + ' · ' + h.title));
    const cb = el('div', 'acard-body', h.text);
    item.appendChild(cb);
    body.appendChild(item);
  }
};
UI.prototype.renderTransformFormula = function () {
  const rule = this.transformFormula();
  const t = this.transformedNode();
  this.tfFormula.innerHTML = '';
  if (!rule) { this.tfFormula.style.display = 'none'; return; }
  this.tfFormula.style.display = '';
  if (t) {
    // 具体展开式（实时再展开）+ 变换规则说明
    const box = el('div', 'tf-concrete');
    const sel = this.store.selected();
    katexRender(box, 'y=' + FRONTEND.nodeToTex(t.display), false);
    this.tfFormula.appendChild(box);
    const hint = el('div', 'tf-rule', rule);
    katexRender(hint, rule, false);
    this.tfFormula.appendChild(hint);
  } else {
    katexRender(this.tfFormula, rule, false);
  }
};

/* ---------- 区间/值域/单调 排版 ---------- */
function intervalToTex(iv) {
  const l = iv.lo === -Infinity ? '-\\infty' : fmtDomainValue(iv.lo);
  const r = iv.hi === Infinity ? '+\\infty' : fmtDomainValue(iv.hi);
  return (iv.loOpen ? '(' : '[') + l + ',\\ ' + r + (iv.hiOpen ? ')' : ']');
}
function rangeToTex(range) {
  if (!range || !range.parts || !range.parts.length) return null;
  const parts = range.parts.map(p => {
    if (p.lo === p.hi) return '\\{' + (p.loTex || fmtDomainValue(p.lo)) + '\\}';
    const l = p.lo === -Infinity ? '-\\infty' : (p.loTex || fmtDomainValue(p.lo));
    const r = p.hi === Infinity ? '+\\infty' : (p.hiTex || fmtDomainValue(p.hi));
    return (p.loOpen ? '(' : '[') + l + ',\\ ' + r + (p.hiOpen ? ')' : ']');
  });
  return parts.join(' \\cup ');
}
function monotonicToTex(intervals) {
  return intervals.map(iv => {
    const l = iv.lo === -Infinity ? '-\\infty' : fmtDomainValue(iv.lo);
    const r = iv.hi === Infinity ? '+\\infty' : fmtDomainValue(iv.hi);
    const lb = iv.loOpen ? '(' : '[';
    const rb = iv.hiOpen ? ')' : ']';
    const arrow = iv.sign > 0 ? '\\nearrow' : iv.sign < 0 ? '\\searrow' : '\\rightarrow';
    return lb + l + ',\\ ' + r + rb + '\\ ' + arrow;
  }).join('\\quad');
}
function parseEndpoint(s) {
  s = String(s || '').trim().toLowerCase();
  if (s === '∞' || s === '+∞' || s === 'inf' || s === 'infinity' || s === '+inf' || s === '正无穷') return Infinity;
  if (s === '-∞' || s === '-inf' || s === '-infinity' || s === '负无穷') return -Infinity;
  const r = parseRatValue(s);
  return r ? r.toNumber() : null;
}

/* ---------- 坐标系变换（独立面板：输入参数 → 生成派生函数） ---------- */
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
UI.prototype.buildCoordPanel = function (right) {
  this.coord = { theta: 0, mode: 'ab', a: new Rat(0n), b: new Rat(0n), r: new Rat(1n), phi: 0 };
  this.coordProgress = 0;
  this.coordAnim = null;

  const panel = el('div', 'coord-panel');
  const head = el('div', 'coord-head');
  head.appendChild(el('span', 'coord-title', STR.coordTransform));
  panel.appendChild(head);
  panel.appendChild(el('div', 'coord-hint', STR.coordHint));

  const mode = el('div', 'coord-mode');
  this.cdModeAB = el('button', 'active', STR.coordModeAB);
  this.cdModeRP = el('button', null, STR.coordModeRP);
  this.cdModeAB.onclick = () => this.setCoordMode('ab');
  this.cdModeRP.onclick = () => this.setCoordMode('rp');
  mode.appendChild(this.cdModeAB); mode.appendChild(this.cdModeRP);
  panel.appendChild(mode);

  this.cdParams = el('div', 'coord-params');
  panel.appendChild(this.cdParams);

  const act = el('div', 'coord-act');
  this.cdPlayBtn = el('button', 'coord-btn', STR.coordPlay);
  this.cdGenBtn = el('button', 'coord-btn primary', STR.coordGenerate);
  this.cdPlayBtn.onclick = () => this.toggleCoordPlay();
  this.cdGenBtn.onclick = () => this.generateCoordDerived();
  act.appendChild(this.cdPlayBtn); act.appendChild(this.cdGenBtn);
  panel.appendChild(act);

  const scrubRow = el('div', 'coord-scrub-row');
  scrubRow.appendChild(el('label', null, STR.coordScrub));
  this.cdScrub = document.createElement('input'); this.cdScrub.type = 'range';
  this.cdScrub.min = 0; this.cdScrub.max = 1; this.cdScrub.step = 0.01; this.cdScrub.value = 0;
  this.cdScrub.oninput = () => { this.coordProgress = parseFloat(this.cdScrub.value); this.applyCoordFrame(); };
  scrubRow.appendChild(this.cdScrub);
  panel.appendChild(scrubRow);

  this.cdResults = el('div', 'coord-results');
  panel.appendChild(this.cdResults);

  right.appendChild(panel);
  this.el.coordPanel = panel;
  this.buildCoordParams();
};
UI.prototype.setCoordMode = function (m) {
  this.coord.mode = m;
  this.cdModeAB.classList.toggle('active', m === 'ab');
  this.cdModeRP.classList.toggle('active', m === 'rp');
  this.buildCoordParams();
};
UI.prototype.currentCoordAB = function () {
  const c = this.coord;
  if (c.mode === 'rp') {
    const phiRad = c.phi * PI / 180;
    return { a: Rat.fromNumber(c.r.toNumber() * Math.cos(phiRad)), b: Rat.fromNumber(c.r.toNumber() * Math.sin(phiRad)) };
  }
  return { a: c.a, b: c.b };
};
UI.prototype.coordChanged = function () {
  // 参数变化：动画进度归零，清空移动坐标系 overlay
  this.coordProgress = 0;
  if (this.cdScrub) this.cdScrub.value = 0;
  if (this.coordAnim) { this.coordAnim.playing = false; if (this.cdPlayBtn) this.cdPlayBtn.textContent = STR.coordPlay; }
  this.plot.movingFrame = null;
  this.plot.render();
};
UI.prototype.buildCoordParams = function () {
  const cont = this.cdParams;
  cont.innerHTML = '';
  const c = this.coord;
  cont.appendChild(this.makeCoordSliderRow(STR.coordTheta + ' θ(°)', 'theta', -180, 180, 1));
  if (c.mode === 'ab') {
    cont.appendChild(this.makeCoordRatRow('a', 'a', -10, 10, 0.1));
    cont.appendChild(this.makeCoordRatRow('b', 'b', -10, 10, 0.1));
  } else {
    cont.appendChild(this.makeCoordRatRow(STR.coordDist + ' r', 'r', 0, 10, 0.1));
    cont.appendChild(this.makeCoordSliderRow(STR.coordDir + ' φ(°)', 'phi', 0, 360, 1));
    cont.appendChild(el('div', 'coord-rp-note', 'a = r·cosφ, b = r·sinφ'));
  }
};
UI.prototype.makeCoordSliderRow = function (label, key, min, max, step) {
  const row = el('div', 'coord-row');
  row.appendChild(el('label', 'coord-label', label));
  const slider = document.createElement('input'); slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = this.coord[key];
  const val = document.createElement('input'); val.type = 'text'; val.value = String(Math.round(this.coord[key] * 100) / 100);
  slider.oninput = () => { const v = parseFloat(slider.value); this.coord[key] = v; val.value = String(Math.round(v * 100) / 100); this.coordChanged(); };
  const apply = () => { const v = parseFloat(val.value); if (isFinite(v)) { this.coord[key] = v; slider.value = v; this.coordChanged(); } else val.value = String(this.coord[key]); };
  val.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); val.blur(); } });
  val.addEventListener('blur', apply);
  row.appendChild(slider); row.appendChild(val);
  return row;
};
UI.prototype.makeCoordRatRow = function (label, key, min, max, step) {
  const row = el('div', 'coord-row');
  row.appendChild(el('label', 'coord-label', label));
  const slider = document.createElement('input'); slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = this.coord[key].toNumber();
  const val = document.createElement('input'); val.type = 'text'; val.value = this.coord[key].toDisplay();
  slider.oninput = () => { const v = Rat.fromNumber(parseFloat(slider.value)); this.coord[key] = v; val.value = v.toDisplay(); this.coordChanged(); };
  const apply = () => { const r = parseRatValue(val.value); if (r) { this.coord[key] = r; slider.value = r.toNumber(); this.coordChanged(); } else val.value = this.coord[key].toDisplay(); };
  val.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); val.blur(); } });
  val.addEventListener('blur', apply);
  row.appendChild(slider); row.appendChild(val);
  return row;
};
UI.prototype.applyCoordFrame = function () {
  const p = this.coordProgress;
  const c = this.coord;
  const { a, b } = this.currentCoordAB();
  if (p <= 1e-4) this.plot.movingFrame = null;
  else {
    this.plot.movingFrame = { theta: c.theta * PI / 180 * p, a: a.toNumber() * p, b: b.toNumber() * p };
  }
  this.plot.render();
};
UI.prototype.toggleCoordPlay = function () {
  if (this.coordAnim && this.coordAnim.playing) {
    this.coordAnim.playing = false;
    this.cdPlayBtn.textContent = STR.coordPlay;
    return;
  }
  if (this.coordProgress >= 1) this.coordProgress = 0;
  this.coordAnim = { playing: true, start: performance.now(), from: this.coordProgress };
  this.cdPlayBtn.textContent = '⏸';
  this.stepCoordAnim();
};
UI.prototype.stepCoordAnim = function () {
  const anim = this.coordAnim;
  if (!anim || !anim.playing) return;
  const dur = 1200;
  const el = Math.min(1, (performance.now() - anim.start) / dur);
  const t = anim.from + (1 - anim.from) * easeInOutCubic(el);
  this.coordProgress = t;
  if (this.cdScrub) this.cdScrub.value = t;
  this.applyCoordFrame();
  if (el < 1) requestAnimationFrame(() => this.stepCoordAnim());
  else { this.coordAnim.playing = false; this.cdPlayBtn.textContent = STR.coordPlay; }
};
UI.prototype.generateCoordDerived = function () {
  const c = this.coord;
  const { a, b } = this.currentCoordAB();
  const cfg = { thetaDeg: c.theta, a, b };
  const fns = this.store.visibleFunctions().filter(f => !f.parametric && !f.implicit);
  if (!fns.length) { this.cdResults.innerHTML = ''; this.cdResults.appendChild(el('div', 'coord-note', '没有可见函数可生成派生函数')); return; }
  const results = [];
  const newFns = [];
  for (const fn of fns) {
    const res = MATH_.coordinateTransform(fn, cfg);
    if (res.kind === 'function') {
      const params = {}, paramOrder = [];
      for (const p of fn.paramOrder) { params[p] = fn.params[p] || new Rat(1n); paramOrder.push(p); }
      const newFn = {
        id: 'fn' + (++FN_SEQ), src: res.src, name: null, var: fn.var, expr: res.node, piecewise: false,
        params, paramOrder, paramRanges: {},
        color: PALETTE[(FN_SEQ + 3) % PALETTE.length], visible: true,
        isDerived: true, derivedFrom: [fn.id], derivedLabel: 'coord',
      };
      for (const p of paramOrder) newFn.paramRanges[p] = fn.paramRanges[p] || [-5, 5, 0.1];
      newFns.push(newFn);
      results.push({ fn, kind: 'function', res, newFn });
    } else if (res.kind === 'vertical') {
      results.push({ fn, kind: 'vertical', res });
    } else if (res.kind === 'parametric') {
      // 参数曲线作为独立函数项进入列表，与普通派生函数对等（可删除/隐藏/撤销）
      const pcFn = {
        id: 'fn' + (++FN_SEQ), src: '参数曲线', name: null, var: 'x',
        expr: math.parse('0'), piecewise: false,
        params: {}, paramOrder: [], paramRanges: {},
        color: fn.color, visible: true,
        isDerived: true, derivedFrom: [fn.id], derivedLabel: 'coord',
        parametric: true,
        evalX: res.evalX, evalY: res.evalY,
        pcTheta: c.theta, pcA: a, pcB: b,
        pcSrcExpr: fn.expr.toString(),
        pcSrcParams: Object.assign({}, fn.params),
        pcSrcTex: FRONTEND.nodeToTex(fn.expr),
      };
      newFns.push(pcFn);
      results.push({ fn, kind: 'parametric', res, newFn: pcFn });
    } else {
      results.push({ fn, kind: 'unsupported', res });
    }
  }
  if (newFns.length) {
    this.store.pushUndo();
    for (const nf of newFns) this.store.functions.push(nf);
    this.store.selectedId = newFns[newFns.length - 1].id;
    this.store.emit('add');
  }
  this.plot.paramCurves = null;
  this.plot.movingFrame = null;
  this.coordProgress = 1;
  if (this.cdScrub) this.cdScrub.value = 1;
  this.renderCoordResults(results, cfg);
  this.render();
};
UI.prototype.renderCoordResults = function (results, cfg) {
  const body = this.cdResults;
  body.innerHTML = '';
  if (!results || !results.length) return;
  for (const r of results) {
    const item = el('div', 'coord-item');
    item.appendChild(el('div', 'coord-orig', (r.fn.name || 'f') + '(x) →'));
    const dv = el('div', 'coord-deriv');
    const tex = coordResultTex(r);
    if (tex) katexRender(dv, tex, false);
    item.appendChild(dv);
    let note = '';
    if (r.kind === 'vertical') note = '旋转后为竖直直线，' + STR.coordNotFn;
    else if (r.kind === 'parametric') note = STR.coordNotFn + '（以' + STR.coordParam + '绘制）';
    else if (r.kind === 'unsupported') note = r.res.note || '暂不支持';
    else if (r.kind === 'function' && r.res.m !== undefined && !r.res.exact) note = '数值近似';
    if (note) item.appendChild(el('div', 'coord-note', note));
    body.appendChild(item);
  }
};
function coordResultTex(r) {
  const res = r.res;
  if (res.kind === 'function') {
    if (res.m !== undefined) {
      // 直线派生：y = m'x + c'
      const mIsZero = (res.m instanceof Rat && res.m.isZero()) || (typeof res.m === 'number' && Math.abs(res.m) < 1e-12);
      const cIsZero = (res.c instanceof Rat && res.c.isZero()) || (typeof res.c === 'number' && Math.abs(res.c) < 1e-12);
      if (mIsZero && cIsZero) return 'y = 0';
      let tex = 'y = ';
      if (!mIsZero) {
        if (res.mTex === '1') tex += 'x';
        else if (res.mTex === '-1') tex += '-x';
        else tex += res.mTex + 'x';
      }
      if (!cIsZero) {
        const cNeg = (res.c instanceof Rat) ? res.c.sign() < 0 : res.c < 0;
        const cAbsTex = (res.c instanceof Rat) ? res.c.neg().toTeX() : fmtNum(-res.c, 6);
        if (mIsZero) tex += res.cTex;
        else tex += cNeg ? ' - ' + cAbsTex : ' + ' + res.cTex;
      }
      return tex;
    }
    return 'y = ' + FRONTEND.nodeToTex(res.display || res.node);
  }
  if (res.kind === 'vertical') return 'X = ' + fmtDomainValue(res.X0);
  if (res.kind === 'parametric') {
    const a = res.a, b = res.b, th = res.thetaDeg;
    const aS = fmtDomainValue(a), bS = fmtDomainValue(b);
    return 'X(t)=(t-' + aS + ')\\cos ' + th + '^{\\circ}+(f(t)-' + bS + ')\\sin ' + th + '^{\\circ},\\quad Y(t)=-(t-' + aS + ')\\sin ' + th + '^{\\circ}+(f(t)-' + bS + ')\\cos ' + th + '^{\\circ}';
  }
  return '';
}

var UI_ = { UI, katexRender, esc };

/* ---------- 三维图形 ---------- */
const SHAPE_PARAMS = { sphere: ['r'], cylinder: ['r', 'h'], cone: ['r', 'h'], cuboid: ['a', 'b', 'c'], cube: ['a'] };
function shapeLabel(s) {
  return {
    sphere: '球', cylinder: '圆柱', cone: '圆锥', cuboid: '长方体', cube: '正方体',
    revolution: '旋转体', extrusion: '柱面', bivariate: '二元曲面', intersection: '空间曲线',
  }[s.kind] || '三维图形';
}

UI.prototype.build3dPanel = function () {
  const left = this.left3d;
  left.innerHTML = '';
  const head = el('div', 'panel-head'); head.textContent = '三维图形'; left.appendChild(head);

  const tpl = el('div', 'templates');
  tpl.appendChild(el('div', 'tpl-group', '基本体模板'));
  const defs = [
    ['sphere', '球'], ['cylinder', '圆柱'], ['cone', '圆锥'], ['cuboid', '长方体'], ['cube', '正方体'],
  ];
  for (const [kind, label] of defs) {
    const b = el('button', 'tpl', label);
    b.onclick = () => this.addShapeTemplate(kind, label);
    tpl.appendChild(b);
  }
  left.appendChild(tpl);

  const gen = el('div', 'templates');
  gen.appendChild(el('div', 'tpl-group', '由二维函数生成'));
  const genBtns = [
    ['旋转（绕轴）', () => this.addShapeRevolution()],
    ['平移（柱面）', () => this.addShapeExtrusion()],
    ['组合·和 z=f+g', () => this.addShapeBivariate('sum')],
    ['组合·积 z=f·g', () => this.addShapeBivariate('prod')],
    ['交线（两柱面）', () => this.addShapeIntersection()],
  ];
  for (const [label, fn] of genBtns) {
    const b = el('button', 'tpl', label);
    b.onclick = fn;
    gen.appendChild(b);
  }
  left.appendChild(gen);

  this.shapeList = el('div', 'fnlist');
  left.appendChild(this.shapeList);

  const right = this.right3d;
  right.innerHTML = '';
  const rhead = el('div', 'panel-head'); rhead.textContent = '隐式方程组'; right.appendChild(rhead);
  this.shapeDetail = el('div', 'shape-detail');
  right.appendChild(this.shapeDetail);
};

UI.prototype.switchMode = function (mode) {
  if (this.mode === mode) return;
  this.mode = mode;
  const is3d = mode === '3d';
  this.left2d.style.display = is3d ? 'none' : '';
  this.left3d.style.display = is3d ? '' : 'none';
  this.right2d.style.display = is3d ? 'none' : '';
  this.right3d.style.display = is3d ? '' : 'none';
  if (this.tfbar) this.tfbar.style.display = is3d ? 'none' : '';
  if (this.btn2d) this.btn2d.classList.toggle('active', !is3d);
  if (this.btn3d) this.btn3d.classList.toggle('active', is3d);
  if (this.renderer3d) this.renderer3d.active = is3d;
  if (is3d) { this.store.clearCompare(); this.store.clearIntersection(); }
  // 移动端底部页签随模式重排，并复位到左栏视图
  this.mobileView = 'left';
  this.refreshMobileTabs();
  this.setMobileView('left');
  this.render();
};

UI.prototype.getSourceFns = function (n) {
  const fns = this.store.functions.filter(f => !f.implicit && !f.parametric);
  const sel = this.store.selected();
  const out = [];
  if (sel && !sel.implicit && !sel.parametric) out.push(sel);
  for (const f of fns) if (!out.includes(f)) out.push(f);
  if (out.length < n) { alert('需要至少 ' + n + ' 个显式函数（y=f(x)）作为源，请先在 2D 界面输入。'); return null; }
  return out.slice(0, n);
};

UI.prototype.makeShape3d = function (kind, params, srcFnId, srcFnId2, axis, combine, range, name) {
  return {
    id: this.store.newShapeId(),
    kind, name: name || null,
    color: PALETTE[(this.store.shapes3d.length + 4) % PALETTE.length],
    visible: true,
    params: params || {}, srcFnId: srcFnId || null, srcFnId2: srcFnId2 || null,
    axis: axis || null, combine: combine || null, range: range || null,
    mesh: null, implicitLines: [],
  };
};

UI.prototype.addShapeTemplate = function (kind, label) {
  const defaults = {
    sphere: { r: new Rat(2n) },
    cylinder: { r: new Rat(3n, 2n), h: new Rat(3n) },
    cone: { r: new Rat(3n, 2n), h: new Rat(3n) },
    cuboid: { a: new Rat(3n), b: new Rat(2n), c: new Rat(3n, 2n) },
    cube: { a: new Rat(2n) },
  };
  const shape = this.makeShape3d(kind, defaults[kind], null, null, null, null, null, label);
  this.store.addShape3d(shape);
  this.render();
};

UI.prototype.addShapeRevolution = function () {
  const src = this.getSourceFns(1);
  if (!src) return;
  this.showRevolutionPicker(src[0]);
};
UI.prototype.doRevolution = function (fn, axis) {
  const shape = this.makeShape3d('revolution', {}, fn.id, null, axis, null, [-3, 3], fn.name || 'f(x)');
  this.store.addShape3d(shape);
  this.render();
};
UI.prototype.showRevolutionPicker = function (fn) {
  const overlay = el('div', 'branch-overlay');
  const box = el('div', 'branch-box');
  box.appendChild(el('div', 'branch-title', '绕轴旋转：' + (fn.name || 'f(x)')));
  const list = el('div', 'branch-list');
  const mk = (label, axis) => {
    const b = el('button', 'branch-item');
    b.appendChild(el('div', 'branch-item-label', label));
    b.onclick = () => { document.body.removeChild(overlay); this.doRevolution(fn, axis); };
    list.appendChild(b);
  };
  mk('绕 x 轴', 'x');
  mk('绕 y 轴', 'y');
  box.appendChild(list);

  const ca = el('div', 'custom-axis');
  ca.appendChild(el('div', 'branch-item-label', '自定轴：P₀(x₀,y₀,z₀) + 方向 v(vx,vy,vz)'));
  const mkRow = (label, arr) => {
    const row = el('div', 'custom-axis-row');
    row.appendChild(el('span', 'custom-axis-lbl', label));
    arr.forEach(inp => { inp.type = 'text'; inp.style.width = '46px'; row.appendChild(inp); });
    return row;
  };
  const p0 = [el('input'), el('input'), el('input')];
  const v = [el('input'), el('input'), el('input')];
  p0[0].value = '0'; p0[1].value = '0'; p0[2].value = '0';
  v[0].value = '0'; v[1].value = '0'; v[2].value = '1';
  ca.appendChild(mkRow('P₀ = (', p0));
  ca.appendChild(mkRow('v = (', v));
  const go = el('button', 'branch-item');
  go.appendChild(el('div', 'branch-item-label', '生成（自定轴）'));
  go.onclick = () => {
    const parse = arr => arr.map(i => parseRatValue(i.value));
    const pp = parse(p0), vv = parse(v);
    if (!pp.every(Boolean) || !vv.every(Boolean) || vv.every(r => r.isZero())) { alert('请输入有效坐标与方向向量'); return; }
    document.body.removeChild(overlay);
    this.doRevolution(fn, { p0: pp, v: vv });
  };
  ca.appendChild(go);
  box.appendChild(ca);

  const cancel = el('button', 'branch-cancel', STR.branchCancel);
  cancel.onclick = () => document.body.removeChild(overlay);
  box.appendChild(cancel);
  overlay.appendChild(box);
  overlay.onclick = e => { if (e.target === overlay) document.body.removeChild(overlay); };
  document.body.appendChild(overlay);
};

UI.prototype.addShapeExtrusion = function () {
  const src = this.getSourceFns(1);
  if (!src) return;
  const shape = this.makeShape3d('extrusion', {}, src[0].id, null, null, null, [-3, 3], src[0].name || 'f(x)');
  this.store.addShape3d(shape);
  this.render();
};
UI.prototype.addShapeBivariate = function (combine) {
  const src = this.getSourceFns(2);
  if (!src) return;
  const shape = this.makeShape3d('bivariate', {}, src[0].id, src[1].id, null, combine, [-3, 3], null);
  this.store.addShape3d(shape);
  this.render();
};
UI.prototype.addShapeIntersection = function () {
  const src = this.getSourceFns(2);
  if (!src) return;
  const shape = this.makeShape3d('intersection', {}, src[0].id, src[1].id, null, null, [-3, 3], null);
  this.store.addShape3d(shape);
  this.render();
};

UI.prototype.render3dList = function () {
  const list = this.shapeList;
  if (!list) return;
  list.innerHTML = '';
  if (this.store.shapes3d.length === 0) {
    list.appendChild(el('div', 'fnlist-empty', '点上方模板或「由二维函数生成」创建三维图形。'));
    return;
  }
  for (const s of this.store.shapes3d) {
    const item = el('div', 'fn-item' + (s.id === this.store.selectedShapeId ? ' selected' : ''));
    const swatch = el('div', 'swatch'); swatch.style.background = s.color;
    const name = el('div', 'fname', shapeLabel(s));
    const expr = el('div', 'fexpr', s.buildNote || '');
    const ops = el('div', 'ops');
    const visBtn = el('button', null, s.visible ? '👁' : '–'); visBtn.className = 'visibility-toggle' + (s.visible ? '' : ' off');
    visBtn.title = '显示/隐藏';
    visBtn.onclick = e => { e.stopPropagation(); this.store.toggleShapeVisible(s.id); };
    const delBtn = el('button', 'del', '×'); delBtn.title = '删除';
    delBtn.onclick = e => { e.stopPropagation(); this.store.removeShape3d(s.id); };
    ops.appendChild(visBtn); ops.appendChild(delBtn);
    item.appendChild(swatch); item.appendChild(name); item.appendChild(expr); item.appendChild(ops);
    item.onclick = () => { this.store.selectShape(s.id); };
    list.appendChild(item);
    this.renderShapeParams(list, s);
  }
};
UI.prototype.renderShapeParams = function (cont, s) {
  const keys = SHAPE_PARAMS[s.kind];
  if (!keys || !s.params) return;
  const row = el('div', 'shape-params');
  for (const k of keys) {
    const wrap = el('div', 'shape-param');
    wrap.appendChild(el('span', 'shape-param-label', k));
    const inp = el('input');
    inp.type = 'text';
    inp.value = s.params[k] ? s.params[k].toDisplay() : '';
    const apply = () => {
      const r = parseRatValue(inp.value);
      if (r) { s.params[k] = r; this.store.rebuildShape(s); this.render(); }
      else inp.value = s.params[k].toDisplay();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); inp.blur(); } });
    inp.addEventListener('blur', apply);
    wrap.appendChild(inp);
    row.appendChild(wrap);
  }
  cont.appendChild(row);
};
UI.prototype.render3dDetail = function () {
  const d = this.shapeDetail;
  if (!d) return;
  d.innerHTML = '';
  const sel = this.store.selectedShape3d();
  if (!sel) { d.appendChild(el('div', 'empty-hint', '在左侧选择或创建一个三维图形后，这里显示其隐式方程组。')); return; }
  const card = el('div', 'acard');
  card.appendChild(el('div', 'acard-head', shapeLabel(sel)));
  const cb = el('div', 'acard-body');
  (sel.implicitLines || []).forEach(t => {
    const line = el('div', 'form-line');
    const tEl = el('span', 'form-tex');
    katexRender(tEl, t, false);
    line.appendChild(tEl);
    cb.appendChild(line);
  });
  if (!(sel.implicitLines || []).length) cb.appendChild(el('div', 'empty-hint', '该图形暂无隐式方程组。'));
  card.appendChild(cb);
  d.appendChild(card);
  if (sel.buildNote) d.appendChild(el('div', 'empty-hint', sel.buildNote));
};

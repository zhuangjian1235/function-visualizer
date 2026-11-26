/* ============================================================
 * 30-store.js — 状态管理 + 撤销/重做 + 运算 + 比较
 * 快照存「源字符串 + 参数表」，恢复时重新解析（math.js 节点不可克隆）
 * ============================================================ */
'use strict';

function Store() {
  this.functions = [];   // fn 对象数组
  this.selectedId = null;
  this.compareTarget = null; // {fId, gId}
  this.intersectionTarget = null; // {fId, gId, fBranchIdx, gBranchIdx}
  this.shapes3d = [];    // 三维图形对象数组
  this.selectedShapeId = null;
  this._shapeSeq = 0;
  this.undoStack = [];
  this.redoStack = [];
  this.history = [];     // 最近推导记录
  this.maxUndo = 80;
  this.listeners = [];
}
Store.prototype.on = function (cb) { this.listeners.push(cb); };
Store.prototype.emit = function (ev) { this.listeners.forEach(cb => cb(ev)); };

Store.prototype.snapshot = function () {
  return {
    functions: this.functions.map(f => {
      if (f.implicit && f.conicType) {
        return {
          id: f.id, src: f.src, name: f.name, color: f.color,
          visible: f.visible, isDerived: f.isDerived, derivedFrom: f.derivedFrom, derivedLabel: f.derivedLabel,
          implicit: true,
          conicType: f.conicType,
          conicParams: Object.fromEntries(Object.entries(f.conicParams).map(([k, v]) => [k, [v.n.toString(), v.d.toString()]])),
        };
      }
      if (f.parametric) {
        return {
          id: f.id, src: f.src, name: f.name, color: f.color,
          visible: f.visible, isDerived: f.isDerived, derivedFrom: f.derivedFrom, derivedLabel: f.derivedLabel,
          parametric: true,
          pcTheta: f.pcTheta,
          pcA: [f.pcA.n.toString(), f.pcA.d.toString()],
          pcB: [f.pcB.n.toString(), f.pcB.d.toString()],
          pcSrcExpr: f.pcSrcExpr,
          pcSrcParams: Object.fromEntries(Object.entries(f.pcSrcParams).map(([k, v]) => [k, [v.n.toString(), v.d.toString()]])),
          pcSrcTex: f.pcSrcTex || '',
        };
      }
      return {
        id: f.id, src: f.src, name: f.name, var: f.var, color: f.color,
        visible: f.visible, isDerived: f.isDerived, derivedFrom: f.derivedFrom, derivedLabel: f.derivedLabel,
        params: Object.fromEntries(Object.entries(f.params).map(([k, v]) => [k, [v.n.toString(), v.d.toString()]])),
        paramRanges: JSON.parse(JSON.stringify(f.paramRanges)),
      };
    }),
    selectedId: this.selectedId, compareTarget: this.compareTarget, intersectionTarget: this.intersectionTarget,
    shapes3d: this.shapes3d.map(s => {
      const axis = (typeof s.axis === 'string') ? s.axis : (s.axis ? {
        p0: s.axis.p0.map(r => [r.n.toString(), r.d.toString()]),
        v: s.axis.v.map(r => [r.n.toString(), r.d.toString()]),
      } : null);
      return {
        id: s.id, kind: s.kind, name: s.name, color: s.color, visible: s.visible,
        params: Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, [v.n.toString(), v.d.toString()]])),
        srcFnId: s.srcFnId || null, srcFnId2: s.srcFnId2 || null,
        axis, combine: s.combine || null, range: s.range ? s.range.slice() : null,
      };
    }),
    selectedShapeId: this.selectedShapeId,
  };
};
Store.prototype.restore = function (snap) {
  this.functions = snap.functions.map(s => {
    if (s.implicit && s.conicType) {
      const params = {};
      for (const k in (s.conicParams || {})) params[k] = new Rat(BigInt(s.conicParams[k][0]), BigInt(s.conicParams[k][1]));
      const fn = MATH_.buildConic(s.conicType, params);
      if (!fn) return null;
      fn.id = s.id; fn.color = s.color; fn.visible = s.visible;
      fn.isDerived = s.isDerived; fn.derivedFrom = s.derivedFrom; fn.derivedLabel = s.derivedLabel;
      return fn;
    }
    if (s.parametric) {
      const srcParams = {};
      for (const k in (s.pcSrcParams || {})) srcParams[k] = new Rat(BigInt(s.pcSrcParams[k][0]), BigInt(s.pcSrcParams[k][1]));
      const aRat = new Rat(BigInt(s.pcA[0]), BigInt(s.pcA[1]));
      const bRat = new Rat(BigInt(s.pcB[0]), BigInt(s.pcB[1]));
      const tmp = { expr: math.parse(s.pcSrcExpr), params: srcParams, piecewise: false };
      const pr = MATH_.paramEquations(tmp, s.pcTheta, aRat, bRat);
      return {
        id: s.id, src: s.src, name: s.name, var: 'x',
        expr: math.parse('0'), piecewise: false,
        params: {}, paramOrder: [], paramRanges: {},
        color: s.color, visible: s.visible,
        isDerived: s.isDerived, derivedFrom: s.derivedFrom, derivedLabel: s.derivedLabel,
        parametric: true,
        evalX: pr.evalX, evalY: pr.evalY,
        pcTheta: s.pcTheta, pcA: aRat, pcB: bRat,
        pcSrcExpr: s.pcSrcExpr, pcSrcParams: srcParams,
      };
    }
    const built = FRONTEND.buildFn(FRONTEND.normalize(s.src), s.src, { name: s.name, color: s.color, isDerived: s.isDerived, derivedFrom: s.derivedFrom, derivedLabel: s.derivedLabel });
    if (!built.ok) return null;
    const fn = built.fn;
    fn.id = s.id; fn.visible = s.visible;
    fn.params = {}; fn.paramRanges = s.paramRanges || {};
    for (const k in s.params) fn.params[k] = new Rat(BigInt(s.params[k][0]), BigInt(s.params[k][1]));
    return fn;
  }).filter(Boolean);
  this.selectedId = snap.selectedId;
  this.compareTarget = snap.compareTarget;
  this.intersectionTarget = snap.intersectionTarget;
  this.selectedShapeId = snap.selectedShapeId;
  this.shapes3d = (snap.shapes3d || []).map(s => {
    const params = {};
    for (const k in s.params) params[k] = new Rat(BigInt(s.params[k][0]), BigInt(s.params[k][1]));
    const axis = (typeof s.axis === 'string') ? s.axis : (s.axis ? {
      p0: s.axis.p0.map(a => new Rat(BigInt(a[0]), BigInt(a[1]))),
      v: s.axis.v.map(a => new Rat(BigInt(a[0]), BigInt(a[1]))),
    } : null);
    const shape = {
      id: s.id, kind: s.kind, name: s.name, color: s.color, visible: s.visible,
      params, srcFnId: s.srcFnId, srcFnId2: s.srcFnId2, axis, combine: s.combine,
      range: s.range, mesh: null, implicitLines: [],
    };
    this.rebuildShape(shape);
    return shape;
  });
};
Store.prototype.pushUndo = function () {
  this.undoStack.push(this.snapshot());
  if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  this.redoStack = [];
};
Store.prototype.undo = function () {
  if (this.undoStack.length === 0) return false;
  this.redoStack.push(this.snapshot());
  this.restore(this.undoStack.pop());
  return true;
};
Store.prototype.redo = function () {
  if (this.redoStack.length === 0) return false;
  this.undoStack.push(this.snapshot());
  this.restore(this.redoStack.pop());
  return true;
};

Store.prototype.getById = function (id) { return this.functions.find(f => f.id === id) || null; };
Store.prototype.visibleFunctions = function () { return this.functions.filter(f => f.visible); };
Store.prototype.selected = function () { return this.getById(this.selectedId) || null; };
Store.prototype.addFn = function (fn, select) {
  this.pushUndo();
  this.functions.push(fn);
  if (select || this.functions.length === 1) this.selectedId = fn.id;
  this.emit('add');
};
Store.prototype.removeFn = function (id) {
  this.pushUndo();
  const i = this.functions.findIndex(f => f.id === id);
  if (i >= 0) this.functions.splice(i, 1);
  if (this.selectedId === id) this.selectedId = this.functions.length ? this.functions[this.functions.length - 1].id : null;
  if (this.compareTarget && (this.compareTarget.fId === id || this.compareTarget.gId === id)) this.compareTarget = null;
  if (this.intersectionTarget && (this.intersectionTarget.fId === id || this.intersectionTarget.gId === id)) this.intersectionTarget = null;
  this.emit('remove');
};
Store.prototype.toggleVisible = function (id) {
  const f = this.getById(id); if (!f) return;
  this.pushUndo(); f.visible = !f.visible; this.emit('toggle');
};
Store.prototype.setParam = function (id, name, rat) {
  const f = this.getById(id); if (!f || !f.params[name]) return;
  f.params[name] = rat;
  this.emit('param');
};
Store.prototype.select = function (id) { this.selectedId = id; this.emit('select'); };

/* ---------- 三维图形 ---------- */
Store.prototype.newShapeId = function () { return 's3d' + (++this._shapeSeq) + '_' + Date.now().toString(36); };
Store.prototype.getShapeById = function (id) { return this.shapes3d.find(s => s.id === id) || null; };
Store.prototype.selectedShape3d = function () { return this.getShapeById(this.selectedShapeId) || null; };
Store.prototype.rebuildShape = function (shape) {
  const f = shape.srcFnId ? this.getById(shape.srcFnId) : null;
  const g = shape.srcFnId2 ? this.getById(shape.srcFnId2) : null;
  const res = RENDER3D.buildShape3d(shape.kind, shape.params, f, g, shape.axis, shape.combine, shape.range, shape.name);
  if (res.mesh) shape.mesh = res.mesh;
  if (res.implicitLines) shape.implicitLines = res.implicitLines;
  if (res.buildNote) shape.buildNote = res.buildNote;
  return shape;
};
Store.prototype.addShape3d = function (shape) {
  this.pushUndo();
  this.rebuildShape(shape);
  this.shapes3d.push(shape);
  this.selectedShapeId = shape.id;
  this.emit('shape');
};
Store.prototype.removeShape3d = function (id) {
  this.pushUndo();
  const i = this.shapes3d.findIndex(s => s.id === id);
  if (i >= 0) this.shapes3d.splice(i, 1);
  if (this.selectedShapeId === id) this.selectedShapeId = this.shapes3d.length ? this.shapes3d[this.shapes3d.length - 1].id : null;
  this.emit('shape');
};
Store.prototype.toggleShapeVisible = function (id) {
  const s = this.getShapeById(id); if (!s) return;
  this.pushUndo(); s.visible = !s.visible; this.emit('shape');
};
Store.prototype.selectShape = function (id) { this.selectedShapeId = id; this.emit('shape'); };

/* ---------- 运算 ---------- */
Store.prototype.applyOp = function (op) {
  const sel = this.selected();
  if (!sel || this.functions.length < 2) return { ok: false, error: '需要至少两个函数（先选中 f，再与列表中另一个 g 运算）' };
  // 找另一个：选中的除外，取第一个
  const g = this.functions.find(f => f.id !== sel.id && !f.isDerived) || this.functions.find(f => f.id !== sel.id);
  if (!g) return { ok: false, error: '需要两个函数' };
  const label = { add: '+', sub: '-', mul: '·', div: '÷', comp: '∘' }[op];
  let node, domNote = null;
  if (op === 'comp') node = MATH_.composeNode(sel.expr, g.expr);
  else node = MATH_.opNode(sel.expr, g.expr, op);

  const src = node.toString();
  const fn = makeDerived(node, sel, g, op, label, src);
  this.pushUndo();
  this.functions.push(fn);
  this.selectedId = fn.id;
  this.emit('add');
  return { ok: true, fn };
};
function makeDerived(node, f, g, op, label, src) {
  const params = {};
  for (const p of f.paramOrder) params[p] = f.params[p] || new Rat(1n);
  for (const p of g.paramOrder) if (!params[p]) params[p] = g.params[p] || new Rat(1n);
  const fn = {
    id: 'fn' + (++FN_SEQ), src, name: null, var: f.var, expr: node, piecewise: false,
    params, paramOrder: Object.keys(params), paramRanges: {},
    color: PALETTE[(FN_SEQ + 3) % PALETTE.length], visible: true,
    isDerived: true, derivedFrom: [f.id, g.id], derivedLabel: op,
  };
  for (const p of fn.paramOrder) fn.paramRanges[p] = [-5, 5, 0.1];
  return fn;
}

/* ---------- 比较 ---------- */
Store.prototype.setCompare = function (fId, gId, fBranchIdx, gBranchIdx) {
  this.compareTarget = { fId, gId, fBranchIdx: fBranchIdx || 0, gBranchIdx: gBranchIdx || 0 };
  this.emit('compare');
};
Store.prototype.clearCompare = function () { this.compareTarget = null; this.emit('compare'); };

/* ---------- 联立求交点 ---------- */
Store.prototype.setIntersection = function (fId, gId, fBranchIdx, gBranchIdx) {
  this.intersectionTarget = { fId, gId, fBranchIdx: fBranchIdx || 0, gBranchIdx: gBranchIdx || 0 };
  this.emit('intersection');
};
Store.prototype.clearIntersection = function () { this.intersectionTarget = null; this.emit('intersection'); };
/* 返回两支（branch）对象，供渲染标亮与推导共用 */
Store.prototype.getIntersectionBranches = function () {
  const t = this.intersectionTarget;
  if (!t) return null;
  const f = this.getById(t.fId), g = this.getById(t.gId);
  if (!f || !g) return null;
  const fb = (MATH_.explicitBranches(f).branches[t.fBranchIdx || 0]) || null;
  const gb = (MATH_.explicitBranches(g).branches[t.gBranchIdx || 0]) || null;
  if (!fb || !gb) return null;
  return { f: fb, g: gb, fName: f.name || 'f', gName: g.name || 'g', fColor: f.color, gColor: g.color };
};
/* 返回两支（branch）对象，供渲染阴影与推导共用 */
Store.prototype.getCompareBranches = function () {
  const t = this.compareTarget;
  if (!t) return null;
  const f = this.getById(t.fId), g = this.getById(t.gId);
  if (!f || !g) return null;
  const fb = (MATH_.explicitBranches(f).branches[t.fBranchIdx || 0]) || null;
  const gb = (MATH_.explicitBranches(g).branches[t.gBranchIdx || 0]) || null;
  if (!fb || !gb) return null;
  return { f: fb, g: gb, fName: f.name || 'f', gName: g.name || 'g', fColor: f.color, gColor: g.color };
};

/* ---------- 历史记录 ---------- */
Store.prototype.logHistory = function (entry) {
  this.history.unshift(entry);
  if (this.history.length > 12) this.history.pop();
  this.emit('history');
};

var STORE = { Store };

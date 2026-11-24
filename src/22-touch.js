/* ============================================================
 * 22-touch.js — 触屏手势状态机（Pointer Events 通用）
 * 纯逻辑、不碰 DOM：bind 层把指针事件转成纯数据喂进来，
 * 状态机识别「单指拖动 / 双指捏合 / 双指整体平移 / 点按」，
 * 通过回调输出动作，供 2D/3D 画布复用，并可单测。
 * ============================================================ */
'use strict';

function noop() {}

/* ---------- 纯函数（可单测） ---------- */
function touchDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function touchCenter(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function touchPinchRatio(d0, d1) { return d1 / Math.max(1e-6, d0); }
function touchMovedBeyond(p0, p1, threshold) { return Math.hypot(p1.x - p0.x, p1.y - p0.y) > threshold; }

/* ---------- 手势状态机 ---------- */
function GestureTracker(opts) {
  opts = opts || {};
  this.onDrag = opts.onDrag || noop;           // (dx, dy) 单指拖动
  this.onPinch = opts.onPinch || noop;         // (cx, cy, ratio) 双指捏合（增量）
  this.onPinchPan = opts.onPinchPan || noop;   // (dx, dy) 双指整体平移
  this.onTap = opts.onTap || noop;             // (x, y) 点按
  this.tapThreshold = (opts.tapThreshold != null) ? opts.tapThreshold : 6;
  this.pinchDeadZone = (opts.pinchDeadZone != null) ? opts.pinchDeadZone : 0.01;
  this.pointers = new Map();   // pointerId -> {x, y, startX, startY}
  this.mode = 'idle';          // idle | single | pinch
  this._pinchBase = 0;         // 上一次两指距离
  this._pinchCx = 0; this._pinchCy = 0;
}
GestureTracker.prototype.down = function (id, x, y) {
  if (this.pointers.size >= 2) return; // 忽略第 3 指及以后
  this.pointers.set(id, { x: x, y: y, startX: x, startY: y });
  if (this.pointers.size === 1) {
    this.mode = 'single';
  } else {
    this.mode = 'pinch';
    const arr = Array.from(this.pointers.values());
    this._pinchBase = touchDistance(arr[0], arr[1]);
    const c = touchCenter(arr[0], arr[1]);
    this._pinchCx = c.x; this._pinchCy = c.y;
  }
};
GestureTracker.prototype.move = function (id, x, y) {
  const p = this.pointers.get(id);
  if (!p) return;
  const prevX = p.x, prevY = p.y;
  p.x = x; p.y = y;
  if (this.mode === 'single' && this.pointers.size === 1) {
    this.onDrag(x - prevX, y - prevY);
  } else if (this.mode === 'pinch' && this.pointers.size === 2) {
    const arr = Array.from(this.pointers.values());
    const d = touchDistance(arr[0], arr[1]);
    const c = touchCenter(arr[0], arr[1]);
    const ratio = touchPinchRatio(this._pinchBase, d);
    if (Math.abs(ratio - 1) > this.pinchDeadZone) {
      this.onPinch(this._pinchCx, this._pinchCy, ratio);
    }
    const dcx = c.x - this._pinchCx, dcy = c.y - this._pinchCy;
    if (Math.abs(dcx) + Math.abs(dcy) > 0.5) {
      this.onPinchPan(dcx, dcy);
    }
    this._pinchBase = d;
    this._pinchCx = c.x; this._pinchCy = c.y;
  }
};
GestureTracker.prototype.up = function (id) { this._release(id, true); };
GestureTracker.prototype.cancel = function (id) { this._release(id, false); };
GestureTracker.prototype._release = function (id, allowTap) {
  const p = this.pointers.get(id);
  const wasPinch = this.mode === 'pinch';
  this.pointers.delete(id);
  if (this.pointers.size === 0) {
    if (allowTap && !wasPinch && p && Math.hypot(p.x - p.startX, p.y - p.startY) < this.tapThreshold) {
      this.onTap(p.x, p.y);
    }
    this.mode = 'idle';
  } else if (this.pointers.size === 1) {
    // 从 pinch 回到 single：把剩余指针重置为新起点，避免视口/相机跳变
    const rem = Array.from(this.pointers.values())[0];
    rem.startX = rem.x; rem.startY = rem.y;
    this.mode = 'single';
  }
};

var TOUCH = { GestureTracker, touchDistance, touchCenter, touchPinchRatio, touchMovedBeyond };

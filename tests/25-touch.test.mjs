import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('触屏手势纯函数', () => {
  it('touchDistance 两点距离', () => {
    closeTo(TOUCH.touchDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, 1e-9);
  });
  it('touchCenter 中点', () => {
    const c = TOUCH.touchCenter({ x: 0, y: 0 }, { x: 10, y: 4 });
    closeTo(c.x, 5, 1e-9); closeTo(c.y, 2, 1e-9);
  });
  it('touchPinchRatio 缩放因子', () => {
    closeTo(TOUCH.touchPinchRatio(10, 20), 2, 1e-9);
    closeTo(TOUCH.touchPinchRatio(20, 5), 0.25, 1e-9);
  });
  it('touchMovedBeyond 位移阈值', () => {
    ok(TOUCH.touchMovedBeyond({ x: 0, y: 0 }, { x: 10, y: 0 }, 6));
    ok(!TOUCH.touchMovedBeyond({ x: 0, y: 0 }, { x: 3, y: 0 }, 6));
  });
});

describe('GestureTracker 手势状态机', () => {
  it('单指拖动触发 onDrag', () => {
    const drags = [];
    const gt = new TOUCH.GestureTracker({ onDrag: (dx, dy) => drags.push([dx, dy]) });
    gt.down(1, 10, 10);
    gt.move(1, 15, 12);
    gt.move(1, 18, 20);
    eq(drags.length, 2);
    closeTo(drags[0][0], 5, 1e-9); closeTo(drags[0][1], 2, 1e-9);
    closeTo(drags[1][0], 3, 1e-9); closeTo(drags[1][1], 8, 1e-9);
  });
  it('点按（位移小于阈值）触发 onTap', () => {
    let tapped = 0;
    const gt = new TOUCH.GestureTracker({ onTap: () => tapped++ });
    gt.down(1, 10, 10);
    gt.move(1, 12, 11); // 位移 < 6
    gt.up(1);
    eq(tapped, 1);
  });
  it('拖动超过阈值不触发 onTap', () => {
    let tapped = 0;
    const gt = new TOUCH.GestureTracker({ onTap: () => tapped++, onDrag: () => {} });
    gt.down(1, 10, 10);
    gt.move(1, 30, 30); // 位移 > 6
    gt.up(1);
    eq(tapped, 0);
  });
  it('双指捏合触发 onPinch（增量缩放因子）', () => {
    const ratios = [];
    const gt = new TOUCH.GestureTracker({ onPinch: (cx, cy, ratio) => ratios.push(ratio) });
    gt.down(1, 0, 0);
    gt.down(2, 10, 0);   // 初始距离 10
    gt.move(1, -5, 0);   // 距离 15 → 15/10 = 1.5
    gt.move(1, -10, 0);  // 距离 20 → 20/15 = 1.333
    ok(ratios.length >= 1);
    closeTo(ratios[0], 1.5, 1e-6);
  });
  it('双指→单指重置起点，避免视口跳变', () => {
    const drags = [];
    const gt = new TOUCH.GestureTracker({ onDrag: (dx, dy) => drags.push([dx, dy]) });
    gt.down(1, 0, 0);
    gt.down(2, 10, 0);
    gt.up(2);           // 回到单指，指针 1 起点重置
    gt.move(1, 3, 0);   // 从重置点 (0,0) 移到 (3,0)
    eq(drags.length, 1);
    closeTo(drags[0][0], 3, 1e-9);
  });
  it('cancel 不触发 onTap', () => {
    let tapped = 0;
    const gt = new TOUCH.GestureTracker({ onTap: () => tapped++ });
    gt.down(1, 10, 10);
    gt.cancel(1);
    eq(tapped, 0);
  });
});

/* ============================================================
 * 99-main.js — 装配
 * ============================================================ */
'use strict';

function initApp() {
  const store = new Store();
  const canvas = document.querySelector('.canvas-host canvas');
  const plot = new Plot(canvas, store);
  const renderer3d = new Renderer3D(canvas, store);
  const ui = new UI(store, plot, renderer3d);

  // 初始示例函数
  const f1 = FRONTEND.buildFn(FRONTEND.normalize('f(x)=x^2-2x-3'), 'f(x)=x^2-2x-3');
  const f2 = FRONTEND.buildFn(FRONTEND.normalize('g(x)=2x+1'), 'g(x)=2x+1');
  if (f1.ok) store.functions.push(f1.fn);
  if (f2.ok) store.functions.push(f2.fn);
  if (f2.ok) store.selectedId = f2.fn.id;

  function resize() {
    if (ui.mode === '3d') { renderer3d.resize(); renderer3d.render(); }
    else { plot.resize(); plot.render(); }
  }
  window.addEventListener('resize', resize);
  resize();
  ui.render();
  // 响应画布容器尺寸变化（变换条折叠、面板重排等），保证坐标系自适应填满
  if (window.ResizeObserver && canvas.parentElement) {
    new ResizeObserver(() => resize()).observe(canvas.parentElement);
  }

  // 自动适配
  setTimeout(() => { ui.autoFit(); }, 50);

  window.__app = { store, plot, renderer3d, ui };
  return { store, plot, renderer3d, ui };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
  else initApp();
}

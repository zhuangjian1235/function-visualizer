/* ============================================================
 * tools/bundle.mjs — 打包器（零依赖，仅开发机运行）
 * 产出 dist/函数可视化8.html：单文件自包含，file:// 双击可用
 *  - 按拓扑序拼接 src/*.js（剥离 import/export）
 *  - 内联 math.js / KaTeX JS（IIFE 包裹）
 *  - 内联 CSS，@font-face 的 woff2 替换为 base64 data URI
 *  - 内联两份第三方许可
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SRC_ORDER = [
  '00-util.js', '10-frontend.js', '11-math.js',
  '20-render.js', '21-render3d.js', '22-touch.js', '30-store.js', '31-analysis.js', '40-ui.js', '99-main.js',
];

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

/* 1. 读取源码，剥离 import/export */
const bodies = [];
const exportNames = new Map();
for (const f of SRC_ORDER) {
  let code = read('src/' + f);
  // 去除 import/export 语句
  code = code.replace(/^\s*import\s+.*?;\s*$/gm, '');
  code = code.replace(/^\s*export\s+/gm, '');
  // 收集导出名检查唯一性
  const m = code.matchAll(/^(?:var|const|let|function)\s+([A-Za-z_$][\w$]*)\s*=/gm);
  bodies.push({ file: f, code });
}
// 简单检查：顶层 var 名冲突（全项目导出名唯一）
const seen = new Map();
for (const b of bodies) {
  const re = /^(?:var|const|let|function)\s+([A-Za-z_$][\w$]*)\b/gm;
  let m;
  while ((m = re.exec(b.code))) {
    const name = m[1];
    if (['const', 'let', 'function'].includes(b.code.slice(0, m.index).split('\n').pop().trim().split(/\s+/)[0])) { /* skip */ }
    if (seen.has(name) && seen.get(name) !== b.file) {
      console.error(`❌ 导出名冲突: "${name}" 出现在 ${seen.get(name)} 和 ${b.file}`);
      process.exit(1);
    }
    seen.set(name, b.file);
  }
}
console.log('✓ 导出名检查通过（无冲突）');

const srcBody = bodies.map(b => '/* ==== ' + b.file + ' ==== */\n' + b.code).join('\n\n');

/* 2. 内联 vendor JS（IIFE） */
const mathjs = read('vendor/mathjs/math.js');
const katexJs = read('vendor/katex/katex.min.js');

/* 3. CSS：内联 app.css + katex.min.css（字体替换 base64） */
const appCss = read('styles/app.css');
let katexCss = read('vendor/katex/katex.min.css');

// 替换 @font-face 里的 woff2 路径为 base64 data URI，并删除 woff/ttf 引用（只留 woff2）
const fontDir = path.join(ROOT, 'vendor/katex/fonts');
katexCss = katexCss.replace(/url\(fonts\/([A-Za-z0-9_-]+\.woff2)\)/g, (match, fname) => {
  const fp = path.join(fontDir, fname);
  if (!fs.existsSync(fp)) { console.warn('⚠ 缺少字体 ' + fname); return match; }
  const buf = fs.readFileSync(fp);
  const b64 = buf.toString('base64');
  return 'url(data:font/woff2;base64,' + b64 + ')';
});
// 删除 woff / ttf 的 src（连同前导逗号与 format(...)）
katexCss = katexCss.replace(/,url\(fonts\/[A-Za-z0-9_-]+\.(?:woff|ttf)\)\s*format\([^)]*\)/g, '');
console.log('✓ 字体已内联为 base64 data URI（仅 woff2）');

/* 4. 许可 */
const mathjsLicense = read('vendor/mathjs/LICENSE');
const katexLicense = read('vendor/katex/LICENSE');

/* 5. 组装 HTML */
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>函数可视化8</title>
<!--
  第三方许可：
  1. math.js 15.2.0 (Apache-2.0)
  ${mathjsLicense.split('\n').map(l => '  ' + l).join('\n')}
  2. KaTeX 0.16.22 (MIT)
  ${katexLicense.split('\n').map(l => '  ' + l).join('\n')}
-->
<style>
${appCss}
</style>
<style>
${katexCss}
</style>
</head>
<body>
<div class="app">
  <div class="col-left panel"></div>
  <div class="col-center panel">
    <div class="canvas-host"><canvas></canvas></div>
  </div>
  <div class="col-right panel"></div>
  <div class="col-transform"></div>
</div>
<script>
(function(){
${mathjs}
})();
</script>
<script>
(function(){
${katexJs}
})();
</script>
<script>
"use strict";
${srcBody}
</script>
</body>
</html>`;

/* 6. 写出 */
const distDir = path.join(ROOT, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outFile = path.join(distDir, '函数可视化8.html');
fs.writeFileSync(outFile, html, 'utf8');

// 第三方许可 txt
const licTxt = `第三方软件许可声明\n==================\n\n1. math.js 15.2.0 — Apache License 2.0\n来源: https://mathjs.org\n\n${mathjsLicense}\n\n==================\n\n2. KaTeX 0.16.22 — MIT License\n来源: https://katex.org\n\n${katexLicense}\n`;
fs.writeFileSync(path.join(distDir, '第三方许可.txt'), licTxt, 'utf8');

const size = fs.statSync(outFile).size;
console.log('✓ 已生成 dist/函数可视化8.html（' + (size / 1024 / 1024).toFixed(2) + ' MB）');
console.log('✓ 已生成 dist/第三方许可.txt');

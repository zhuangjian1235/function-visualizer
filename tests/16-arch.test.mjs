import { describe, it, ok, eq } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('架构硬约束', () => {
  it('自研数学层（11-math.js）不含 DOM/canvas/katex', () => {
    const code = read('src/11-math.js');
    ok(!/document|canvas|katex/i.test(code), '11-math.js 应无 DOM/canvas/katex');
    const front = read('src/10-frontend.js');
    ok(!/document|canvas|katex/i.test(front), '10-frontend.js 应无 DOM/canvas/katex');
  });
  it('禁用 eval / new Function', () => {
    for (const f of ['00-util.js', '10-frontend.js', '11-math.js', '20-render.js', '21-render3d.js', '30-store.js', '31-analysis.js', '40-ui.js']) {
      const code = read('src/' + f);
      ok(!/\beval\s*\(/.test(code) && !/new\s+Function\s*\(/.test(code), f + ' 不应含 eval/new Function');
    }
  });
  it('禁用 fetch/XHR/Worker/动态 import/localStorage', () => {
    for (const f of ['10-frontend.js', '11-math.js', '20-render.js', '21-render3d.js', '30-store.js', '31-analysis.js', '40-ui.js']) {
      const code = read('src/' + f);
      ok(!/fetch\s*\(|XMLHttpRequest|new\s+Worker|import\s*\(|localStorage/.test(code), f + ' 不应含禁用 API');
    }
  });
  it('全项目顶层导出名唯一（单文件拼接前提）', () => {
    const seen = new Map();
    const files = ['00-util.js', '10-frontend.js', '11-math.js', '20-render.js', '21-render3d.js', '30-store.js', '31-analysis.js', '40-ui.js'];
    for (const f of files) {
      const code = read('src/' + f);
      const re = /^var\s+([A-Za-z_$][\w$]*)\s*=/gm;
      let m;
      while ((m = re.exec(code))) {
        const name = m[1];
        if (seen.has(name) && seen.get(name) !== f) {
          ok(false, `导出名冲突 "${name}" 在 ${seen.get(name)} 和 ${f}`);
        }
        seen.set(name, f);
      }
    }
    ok(true);
  });
  it('交付物 dist/函数可视化6.html 无 import/export 残留', () => {
    const html = read('dist/函数可视化6.html');
    ok(!/^\s*(import|export)\s+/m.test(html), '单文件内不应有 import/export');
  });
});

import { describe, it, eq, ok } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('打包器自证', () => {
  it('dist/函数可视化8.html 存在', () => {
    ok(fs.existsSync(path.join(ROOT, 'dist/函数可视化8.html')));
  });
  it('无 import/export 残留', () => {
    const html = read('dist/函数可视化8.html');
    ok(!/^\s*(import|export)\s+/m.test(html), '不应有顶层 import/export');
  });
  it('含 base64 字体 data URI（无 url(fonts/…) 未替换）', () => {
    const html = read('dist/函数可视化8.html');
    ok(html.includes('data:font/woff2;base64'), '应含 base64 字体');
    ok(!/url\(fonts\//.test(html), '不应有未替换的 url(fonts/…)');
  });
  it('两份第三方许可全文都在', () => {
    const html = read('dist/函数可视化8.html');
    ok(html.includes('Apache License'), '应含 Apache-2.0');
    ok(html.includes('The MIT License'), '应含 MIT');
  });
  it('第三方许可.txt 同步生成', () => {
    const txt = read('dist/第三方许可.txt');
    ok(txt.includes('Apache License') && txt.includes('MIT'), '许可 txt 应含两份许可');
  });
});

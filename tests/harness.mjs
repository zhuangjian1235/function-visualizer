/* ============================================================
 * tests/harness.mjs — 测试 DSL + 源码加载器
 * 把 vendor 与 src/*.js 加载到全局（vm），供 Node 环境测试
 * 提供 describe/it/eq/deepEq/closeTo/ok/throws + B 构建 DSL
 * ============================================================ */
import { createRequire } from 'node:module';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(path.join(ROOT, 'package.json'));

/* 加载 vendor */
if (!globalThis.math) globalThis.math = require(path.join(ROOT, 'vendor/mathjs/math.js'));

/* 加载源码（plain script → 全局作用域） */
const SRC = [
  '00-util.js', '10-frontend.js', '11-math.js',
  '20-render.js', '21-render3d.js', '22-touch.js', '30-store.js', '31-analysis.js', '40-ui.js', '99-main.js',
];
for (const f of SRC) {
  const p = path.join(ROOT, 'src', f);
  if (!fs.existsSync(p)) continue;
  const code = fs.readFileSync(p, 'utf8');
  vm.runInThisContext(code, { filename: f });
}

/* ---------- 收集器 ---------- */
const suites = [];
let current = null;
export function describe(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}
export function it(name, fn) {
  if (!current) throw new Error('it() 必须在 describe() 内调用');
  current.tests.push({ name, fn });
}

/* ---------- 断言 ---------- */
function fail(msg) { throw new Error(msg); }
function serialize(x) {
  if (typeof x === 'bigint') return x + 'n';
  if (x && typeof x === 'object' && typeof x.n === 'bigint' && typeof x.d === 'bigint') return x.n + '/' + x.d;
  if (Array.isArray(x)) return x.map(serialize);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = serialize(x[k]); return o; }
  return x;
}
export function ok(v, msg) { if (!v) fail(msg || '断言失败'); }
export function eq(a, b, msg) {
  if (a !== b) fail((msg || '') + ` — 期望 ${JSON.stringify(serialize(b))}，实际 ${JSON.stringify(serialize(a))}`);
}
export function closeTo(a, b, tol, msg) {
  if (tol === undefined) { msg = tol; tol = 1e-9; }
  if (typeof a !== 'number' || typeof b !== 'number' || Math.abs(a - b) > tol) {
    fail((msg || '') + ` — 期望 ≈${b}，实际 ${a}（tol=${tol}）`);
  }
}
export function deepEq(a, b, msg) {
  if (JSON.stringify(serialize(a)) !== JSON.stringify(serialize(b))) {
    fail((msg || '') + ` — 期望 ${JSON.stringify(serialize(b))}，实际 ${JSON.stringify(serialize(a))}`);
  }
}
export function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) fail((msg || '') + ' — 期望抛错但未抛');
}

/* ---------- B 构建 DSL ---------- */
export const B = {
  x: () => math.parse('x'),
  n: (v) => math.parse(String(v)),
  mul: (...a) => math.parse(a.map(x => '(' + (x.toString ? x.toString() : x) + ')').join('*')),
  add: (...a) => math.parse(a.map(x => '(' + (x.toString ? x.toString() : x) + ')').join('+')),
  sub: (a, b) => math.parse('(' + a.toString() + ')-(' + b.toString() + ')'),
  div: (a, b) => math.parse('(' + a.toString() + ')/(' + b.toString() + ')'),
  pow: (a, b) => math.parse('(' + a.toString() + ')^' + b),
};

/* 便捷：解析并构建函数条目 */
export function fnOf(src) {
  const r = FRONTEND.normalize(src);
  if (!r.ok) throw new Error('归一化失败: ' + src);
  const built = FRONTEND.buildFn(r, src);
  if (!built.ok) throw new Error('解析失败: ' + src + ' -> ' + built.error);
  return built.fn;
}
globalThis.fnOf = fnOf;

/* ---------- 运行器 ---------- */
export async function run() {
  // 动态加载所有 test 文件
  const testDir = path.join(__dirname);
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.mjs')).sort();
  for (const f of files) await import(path.join(testDir, f).replace(/\\/g, '/') && 'file://' + path.join(testDir, f).replace(/\\/g, '/'));

  let passed = 0, failed = 0;
  const failures = [];
  for (const suite of suites) {
    for (const t of suite.tests) {
      try { t.fn(); passed++; }
      catch (e) { failed++; failures.push(`✗ [${suite.name}] ${t.name}\n    ${e.message}`); }
    }
  }
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✔ 通过 ${passed}，✗ 失败 ${failed}，共 ${passed + failed} 项`);
  if (failures.length) {
    console.log('\n' + failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('全部通过 ✅');
  }
  return { passed, failed };
}
export { suites };

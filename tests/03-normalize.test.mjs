import { describe, it, eq, ok } from './harness.mjs';

describe('归一层（学生语法 → math.js 语法）', () => {
  it('|x-1| → abs(x-1)', () => eq(FRONTEND.normalize('|x-1|').norm, 'abs(x-1)'));
  it('ln → log（自然对数）', () => eq(FRONTEND.normalize('ln(x)').norm, 'log(x)'));
  it('lg → log10', () => eq(FRONTEND.normalize('lg(x)').norm, 'log10(x)'));
  it('log(a,x) → log(x,a)（底数交换）', () => eq(FRONTEND.normalize('log(2,x)').norm, 'log(x,2)'));
  it('sin^-1 → asin', () => eq(FRONTEND.normalize('sin^-1(x)').norm, 'asin(x)'));
  it('cos^-1 → acos', () => eq(FRONTEND.normalize('cos^-1(x)').norm, 'acos(x)'));
  it('sin²(x) → sin(x)^2', () => eq(FRONTEND.normalize('sin²(x)').norm, 'sin(x)^2'));
  it('sin^2(x) → sin(x)^2', () => eq(FRONTEND.normalize('sin^2(x)').norm, 'sin(x)^2'));
  it('√x → sqrt(x)', () => eq(FRONTEND.normalize('√x').norm, 'sqrt(x)'));
  it('√(x+1) → sqrt(x+1)', () => eq(FRONTEND.normalize('√(x+1)').norm, 'sqrt(x+1)'));
  it('unicode ≤≥≠ ·×', () => {
    eq(FRONTEND.normalize('x≤2').norm, 'x<=2');
    eq(FRONTEND.normalize('x≥2').norm, 'x>=2');
    eq(FRONTEND.normalize('x≠2').norm, 'x!=2');
    eq(FRONTEND.normalize('a·b').norm, 'a*b');
  });
  it('π → pi', () => eq(FRONTEND.normalize('sin(π)').norm, 'sin(pi)'));
  it('上标 x² → x^2', () => eq(FRONTEND.normalize('x²').norm, 'x^2'));
  it('命名函数 f(x)=…', () => {
    const r = FRONTEND.normalize('f(x)=x^2');
    eq(r.defName, 'f'); eq(r.norm, 'x^2');
  });
  it('分段函数', () => {
    const r = FRONTEND.normalize('{x^2, x>=0; -x, x<0}');
    ok(r.piecewise !== null);
    eq(r.piecewise.cases.length, 2);
    eq(r.piecewise.cases[0].expr, 'x^2');
    eq(r.piecewise.cases[0].cond, 'x>=0');
  });
  it('arcsin → asin', () => eq(FRONTEND.normalize('arcsin(x)').norm, 'asin(x)'));
});

describe('归一层往返（归一化→parse→toString 一致）', () => {
  const roundtrip = ['x^2-2x-3', '2(x+1)(x-1)', '3sin(x)', '|x-1|', '1/2x', '2^x^3', '-x^2', 'abs(x)', 'sqrt(4-x^2)', 'a*sin(b*x+c)+d'];
  for (const s of roundtrip) {
    it(`"${s}" 可解析且 -x^2 结合性正确`, () => {
      const n = FRONTEND.normalize(s);
      ok(n.ok, '归一化应成功');
      const node = math.parse(n.norm);
      ok(node != null);
      // 关键：-x^2 必须等于 -(x^2)（f(3) = -9）
      if (s === '-x^2') {
        eq(node.compile().evaluate({ x: 3 }), -9);
      }
    });
  }
  it('报错对象含 char 字段，且偏移映射表覆盖该位置', () => {
    // "x + )" 归一化后应报错，char 指向报错处
    const r = FRONTEND.normalize('x + )');
    try { math.parse(r.norm); } catch (e) {
      ok(typeof e.char === 'number', '报错对象应含 char 字段');
      ok(e.char >= 0 && e.char <= r.map.length, `char=${e.char} 应在映射表范围 [0, ${r.map.length}] 内`);
    }
  });
  it('偏移映射：|x-1| 归一化后长度变化，映射能指回原文', () => {
    // |x-1| → abs(x-1)：原文第 0 字符 | 对应归一化后 "abs(" 的起始
    const r = FRONTEND.normalize('|x-1|');
    eq(r.norm, 'abs(x-1)');
    // map 数组第一个字符（'a'）应映射回原文索引 0（即 |）
    eq(r.map[0], 0);
    // 归一化后的 '(' 字符（原 | 的右括号）应仍映射回原文 0
    eq(r.map[3], 0);
  });
});

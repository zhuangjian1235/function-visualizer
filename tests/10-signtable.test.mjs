import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('符号表（穿根法）', () => {
  it('x²−4x−4 → + − +', () => {
    const st = MATH_.signTable(fnOf('x^2-4x-4'), [-20, 20]);
    eq(st.intervals.length, 3);
    eq(st.intervals[0].sign, 1);
    eq(st.intervals[1].sign, -1);
    eq(st.intervals[2].sign, 1);
  });
  it('(x−1)² 在 1 处不反号（重根）', () => {
    const st = MATH_.signTable(fnOf('(x-1)^2'), [-20, 20]);
    eq(st.intervals.length, 2);
    eq(st.intervals[0].sign, 1);
    eq(st.intervals[1].sign, 1);
  });
  it('(x−1)(x+2)/(x−3) → 4 段，极点 x=3 排除', () => {
    const fn = fnOf('(x-1)*(x+2)/(x-3)');
    const st = MATH_.signTable(fn, [-20, 20]);
    eq(st.intervals.length, 4);
    ok(st.crits.some(c => c.kind === 'pole' && Math.abs(c.x - 3) < 1e-6), '极点 x=3');
    ok(st.crits.some(c => c.kind === 'root' && Math.abs(c.x - 1) < 1e-6));
    ok(st.crits.some(c => c.kind === 'root' && Math.abs(c.x + 2) < 1e-6));
  });
  it('x²−5x+6 → + − +（根 2,3）', () => {
    const st = MATH_.signTable(fnOf('x^2-5x+6'), [-20, 20]);
    eq(st.intervals.map(i => i.sign).join(','), '1,-1,1');
  });
});

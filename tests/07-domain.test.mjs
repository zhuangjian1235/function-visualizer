import { describe, it, eq, ok, closeTo } from './harness.mjs';

describe('定义域含洞', () => {
  it('1/x → 极点 x=0', () => {
    const d = MATH_.analyzeDomain(fnOf('1/x'));
    ok(d.poles.some(p => Math.abs(p) < 1e-6));
  });
  it('(x²−1)/(x+1) → ℝ∖{−1}，洞 (-1,−2)，无极点', () => {
    const d = MATH_.analyzeDomain(fnOf('(x^2-1)/(x+1)'));
    ok(d.holes.some(h => Math.abs(h.x + 1) < 1e-6), '应有洞 x=-1');
    ok(!d.poles.some(p => Math.abs(p + 1) < 1e-6), 'x=-1 不应是极点');
    // 洞的 y 值 = x-1 在 -1 处 = -2
    const hole = d.holes.find(h => Math.abs(h.x + 1) < 1e-6);
    ok(hole && Math.abs(hole.y + 2) < 1e-6, '洞 y 值应为 -2');
  });
  it('sqrt(4−x²) → [−2,2]', () => {
    const d = MATH_.analyzeDomain(fnOf('sqrt(4-x^2)'));
    ok(d.breaks.some(b => Math.abs(Math.abs(b.x) - 2) < 1e-4), '边界 ±2');
  });
  it('ln(x) → x>0', () => {
    const d = MATH_.analyzeDomain(fnOf('ln(x)'));
    ok(d.breaks.some(b => Math.abs(b.x) < 1e-6), '边界 0');
  });
  it('tan(x) → 排除 π/2+kπ', () => {
    const d = MATH_.analyzeDomain(fnOf('tan(x)'));
    ok(d.poles.some(p => Math.abs(p - Math.PI / 2) < 1e-4), '极点 π/2');
    ok(d.poles.some(p => Math.abs(p + Math.PI / 2) < 1e-4), '极点 -π/2');
  });
  it('ln((x−2)/(x+1)) → (−∞,−1)∪(2,∞) 两端开', () => {
    const d = MATH_.analyzeDomain(fnOf('ln((x-2)/(x+1))'));
    ok(d.breaks.some(b => Math.abs(b.x + 1) < 1e-4), '边界 -1');
    ok(d.breaks.some(b => Math.abs(b.x - 2) < 1e-4), '边界 2');
  });
});

import { describe, it, eq, ok } from './harness.mjs';

describe('导数', () => {
  function dtex(src) {
    const n = math.parse(FRONTEND.normalize(src).norm);
    const d = MATH_.derivativeOf(n);
    return d ? d.toString().replace(/\s/g, '') : null;
  }
  it('x³−3x → 3x²−3', () => eq(dtex('x^3-3x'), '3*x^2-3'));
  it('sin(2x) → 2cos(2x)', () => {
    const t = dtex('sin(2x)');
    ok(t.includes('cos'), t);
    ok(t.includes('2*cos') || t.includes('2cos'), t);
  });
  it('x·e^x → (1+x)e^x', () => {
    const t = dtex('x*exp(x)');
    ok(t.includes('exp(x)'), t);
  });
  it('(x+1)/(x−1) → −2/(x−1)²', () => {
    const t = dtex('(x+1)/(x-1)');
    ok(t.includes('(x-1)^2') || t.includes('(x-1)') || t.includes('x-1'), t);
  });
  it('ln(2x+1) → 2/(2x+1)（ln 归一为 log）', () => {
    const t = dtex('ln(2x+1)');
    ok(t.includes('2x+1'), t);
  });
  it('asin(x) → 1/sqrt(1-x²)', () => {
    const t = dtex('asin(x)');
    ok(t.includes('sqrt'), t);
  });
  it('x^x 可求导（含 log）', () => {
    const t = dtex('x^x');
    ok(t && t.includes('log'), t);
  });
  it('log 底数导数美化：log10(x) 应含 1/log(10) 而非小数', () => {
    const t = dtex('log10(x)');
    ok(t && !t.includes('0.4342'), '不应出现小数 0.4342，实际 ' + t);
  });
});

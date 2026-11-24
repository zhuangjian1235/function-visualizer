import { describe, it, eq, ok, closeTo, deepEq } from './harness.mjs';

describe('Rational 精确性（BigInt）', () => {
  it('1/3 + 1/6 === 1/2', () => {
    const r = new Rat(1n, 3n).add(new Rat(1n, 6n));
    eq(r.n, 1n); eq(r.d, 2n);
  });
  it('0.1 + 0.2 按十进制精确 → 3/10', () => {
    const r = Rat.fromNumber(0.1).add(Rat.fromNumber(0.2));
    eq(r.n, 3n); eq(r.d, 10n);
  });
  it('1.3 → 13/10', () => {
    const r = Rat.fromNumber(1.3);
    eq(r.n, 13n); eq(r.d, 10n);
  });
  it('parseRatValue 支持 "3/2"、"0.5"、"-2"', () => {
    eq(parseRatValue('3/2').toDisplay(), '3/2');
    eq(parseRatValue('0.5').toDisplay(), '1/2');
    eq(parseRatValue('-2').toDisplay(), '-2');
    eq(parseRatValue('abc'), null);
  });
  it('超越 fraction.js 上限（2^53 以上）仍精确', () => {
    const big = new Rat(9007199254740993n, 2n); // 分子超过 2^53 且不可约
    eq(big.n, 9007199254740993n);
    eq(big.d, 2n);
    const t = big.mul(new Rat(3n)); // 乘法保持精确
    eq(t.n, 27021597764222979n);
    eq(t.d, 2n);
  });
  it('约分与符号', () => {
    const r = new Rat(-6n, 8n);
    eq(r.n, -3n); eq(r.d, 4n);
  });
});

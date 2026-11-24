import { describe, it, ok, eq } from './harness.mjs';

/* 块 E：可微 / 可导 / 可积判定融入求导与积分功能 */
function hasStep(d, needle) {
  return d.steps.some(s => (s.ruleName || '').indexOf(needle) >= 0);
}

describe('无初等原函数判定 · matchNonElementary', () => {
  it('识别 e^(x²)（OperatorNode ^ 形态）', () => {
    const ne = MATH_.matchNonElementary(math.parse('e^(x^2)'));
    ok(ne && ne.indexOf('无初等原函数') >= 0, '应识别 e^(x^2): ' + ne);
  });
  it('识别 exp(x²)（FunctionNode 形态）', () => {
    const ne = MATH_.matchNonElementary(math.parse('exp(x^2)'));
    ok(ne && ne.indexOf('无初等原函数') >= 0, '应识别 exp(x^2)');
  });
  it('识别 sin(x²)、sin(x)/x、e^x/x', () => {
    ok(MATH_.matchNonElementary(math.parse('sin(x^2)')) !== null, 'sin(x^2) 应识别');
    ok(MATH_.matchNonElementary(math.parse('sin(x)/x')) !== null, 'sin(x)/x 应识别');
    ok(MATH_.matchNonElementary(math.parse('e^x/x')) !== null, 'e^x/x 应识别');
  });
  it('e^x 与 e^(2x) 有初等原函数，不应误判', () => {
    ok(MATH_.matchNonElementary(math.parse('e^x')) === null, 'e^x 有初等原函数');
    ok(MATH_.matchNonElementary(math.parse('e^(2*x)')) === null, 'e^(2x) 有初等原函数');
  });
});

describe('求导功能 · 可导性判定前置', () => {
  it('abs(x) 求导 → 判定存在不可导点', () => {
    const d = buildDerivation(fnOf('abs(x)'), 'derivative', {});
    ok(hasStep(d, '可导性判定：存在不可导点'), '应有不可导判定步骤');
    ok(d.conclusion && d.conclusion.text.indexOf('不可导') >= 0, '结论应说明不可导: ' + d.conclusion.text);
  });
  it('x² 求导 → 判定处处可导', () => {
    const d = buildDerivation(fnOf('x^2'), 'derivative', {});
    ok(hasStep(d, '可导性判定：处处可导'), '应有用处可导判定步骤');
    ok(d.conclusion && d.conclusion.text.indexOf('处处可导') >= 0, '结论应说明处处可导: ' + d.conclusion.text);
  });
  it('求导 goal 融入可微性判定（可微 ⟺ 可导）', () => {
    const d = buildDerivation(fnOf('x^2'), 'derivative', {});
    ok(hasStep(d, '可微性判定'), '应有可微性判定步骤');
    ok(d.conclusion && d.conclusion.text.indexOf('可微') >= 0, '结论应说明可微: ' + d.conclusion.text);
  });
});

describe('定积分（独立保留的按钮）', () => {
  it('integrability goal 标题为「定积分」并给出定积分值', () => {
    const d = buildDerivation(fnOf('x^2'), 'integrability', { a: 0, b: 1 });
    eq(d.title, '定积分');
    ok(d.conclusion && d.conclusion.text.indexOf('\\frac{1}{3}') >= 0, '定积分值应为 1/3: ' + d.conclusion.text);
  });
  it('区间含极点 → 判定不可积', () => {
    const d = buildDerivation(fnOf('1/x'), 'integrability', { a: -1, b: 1 });
    ok(d.conclusion && d.conclusion.text.indexOf('不可积') >= 0, '结论应说明不可积: ' + d.conclusion.text);
  });
});

describe('积分功能 · 可积性判定前置', () => {
  it('1/x 积分 → 判定含无穷间断点（连续子区间可积）', () => {
    const d = buildDerivation(fnOf('1/x'), 'integral', {});
    ok(hasStep(d, '可积性判定：定义域含无穷间断点'), '应有含极点判定步骤');
    ok(d.conclusion && d.conclusion.text.indexOf('连续子区间') >= 0, '结论应说明连续子区间可积: ' + d.conclusion.text);
  });
  it('x² 积分 → 判定连续可积并给出求原函数证明', () => {
    const d = buildDerivation(fnOf('x^2'), 'integral', {});
    ok(hasStep(d, '可积性判定：连续 ⇒ 可积'), '应有连续可积判定步骤');
    ok(hasStep(d, '求原函数'), '应有求原函数步骤');
    ok(hasStep(d, "验证 F'=f"), "应有验证 F'=f 步骤");
  });
  it('e^(x²) 积分 → 可积但无初等原函数', () => {
    const d = buildDerivation(fnOf('e^(x^2)'), 'integral', {});
    ok(d.conclusion && d.conclusion.text.indexOf('无初等原函数') >= 0, '结论应声明无初等原函数: ' + d.conclusion.text);
  });
  it('exp(x²) 积分 → 可积但无初等原函数', () => {
    const d = buildDerivation(fnOf('exp(x^2)'), 'integral', {});
    ok(d.conclusion && d.conclusion.text.indexOf('无初等原函数') >= 0, '结论应声明无初等原函数: ' + d.conclusion.text);
  });
});

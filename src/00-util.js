/* ============================================================
 * 00-util.js  —  工具：Rational(BigInt) / 数值格式化 / LRU / 常量
 * ============================================================ */

'use strict';

/* ---------- Rational：BigInt 精确分数（唯一权威） ---------- */
function Rat(n, d) {
  if (typeof n === 'bigint') { this.n = n; this.d = (typeof d === 'bigint' ? d : 1n); }
  else if (typeof n === 'number' && d === undefined) { return Rat.fromNumber(n); }
  else if (typeof n === 'number') { return Rat.fromNumber(n / d); }
  else throw new Error('bad Rat');
  this.reduce();
}
Rat.prototype.reduce = function () {
  if (this.d === 0n) throw new Error('div by zero');
  if (this.d < 0n) { this.n = -this.n; this.d = -this.d; }
  const g = gcd(this.n < 0n ? -this.n : this.n, this.d);
  this.n /= g; this.d /= g;
  return this;
};
function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

Rat.fromNumber = function (x, maxDen = 1000000n) {
  if (!isFinite(x)) throw new Error('non-finite');
  if (Number.isInteger(x)) return new Rat(BigInt(x), 1n);
  const s = x.toString();
  if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) {
    // 科学计数：还原成十进制字符串
    const m = s.match(/^(-?)(\d+)\.?(\d*)e([+-]?\d+)$/i);
    const sign = m[1] === '-' ? -1 : 1;
    let digits = m[2] + m[3];
    let exp = parseInt(m[4], 10) - m[3].length;
    if (exp >= 0) digits += '0'.repeat(exp);
    else {
      const p = digits.length + exp;
      if (p <= 0) digits = '0.' + '0'.repeat(-p) + digits;
      else digits = digits.slice(0, p) + '.' + digits.slice(p);
    }
    return Rat.fromDecimal((sign < 0 ? '-' : '') + digits);
  }
  // 小数：按十进制精确解析
  const m = s.match(/^(-?)(\d+)\.(\d+)$/);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const whole = m[2], frac = m[3];
    const d = 10n ** BigInt(frac.length);
    const n = BigInt(whole) * d + BigInt(frac);
    return new Rat(sign < 0 ? -n : n, d);
  }
  return new Rat(BigInt(Math.round(x)), 1n);
};
Rat.fromDecimal = function (s) {
  s = s.trim();
  const neg = s[0] === '-'; if (neg) s = s.slice(1);
  const m = s.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error('bad decimal: ' + s);
  const whole = m[1] || '0', frac = m[2] || '';
  const d = 10n ** BigInt(frac.length);
  const n = BigInt(whole) * d + (frac ? BigInt(frac) : 0n);
  return new Rat(neg ? -n : n, d);
};
Rat.prototype.add = function (o) { return new Rat(this.n * o.d + o.n * this.d, this.d * o.d); };
Rat.prototype.sub = function (o) { return new Rat(this.n * o.d - o.n * this.d, this.d * o.d); };
Rat.prototype.mul = function (o) { return new Rat(this.n * o.n, this.d * o.d); };
Rat.prototype.div = function (o) { return new Rat(this.n * o.d, this.d * o.n); };
Rat.prototype.neg = function () { return new Rat(-this.n, this.d); };
Rat.prototype.abs = function () { return new Rat(this.n < 0n ? -this.n : this.n, this.d); };
Rat.prototype.cmp = function (o) { const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; };
Rat.prototype.eq = function (o) { return this.n === o.n && this.d === o.d; };
Rat.prototype.isZero = function () { return this.n === 0n; };
Rat.prototype.isInt = function () { return this.d === 1n; };
Rat.prototype.toNumber = function () { return Number(this.n) / Number(this.d); };
Rat.prototype.sign = function () { return this.n < 0n ? -1 : this.n > 0n ? 1 : 0; };
Rat.prototype.toTeX = function () {
  if (this.d === 1n) return this.n.toString();
  return '\\frac{' + this.n + '}{' + this.d + '}';
};
Rat.prototype.toDecimalString = function (prec = 10) {
  if (this.d === 1n) return this.n.toString();
  return this.toNumber().toFixed(prec).replace(/0+$/, '').replace(/\.$/, '');
};
Rat.prototype.toDisplay = function () {
  // 教学友好：整数→整数；1/2→分数；其它→小数（4 位）
  if (this.d === 1n) return this.n.toString();
  if (this.d <= 1000n) return this.n + '/' + this.d;
  return this.toNumber().toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};
Rat.prototype.clone = function () { return new Rat(this.n, this.d); };

/* ---------- 数值格式化 ---------- */
function fmtNum(x, prec = 6) {
  if (x === Infinity) return '+∞';
  if (x === -Infinity) return '-∞';
  if (isNaN(x)) return 'NaN';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a < 1e-12) return '0';
  if (a >= 1e9 || a < 1e-4) return x.toExponential(3);
  // 尝试作为简单分数显示（分母 ≤ 100 且误差极小）
  const f = mathFractionApprox(x);
  if (f) return f;
  let s = x.toPrecision(prec);
  s = s.replace(/\.?0+$/, '');
  if (s === '-0') s = '0';
  return s;
}
/* 端点显示：数值求根的残差（相对区间尺度可忽略）归零，避免积分限出现 -2.5e-11 这类噪声 */
function fmtEdge(v, ref) {
  const eps = Math.max(Math.abs(ref) || 0, 1) * 1e-8;
  return fmtNum(Math.abs(v) < eps ? 0 : v, 4);
}
function mathFractionApprox(x) {
  // 简单小数/分数近似：返回 "3/2" 或 null
  const r = Rat.fromNumber(x, 100000n);
  if (r.d <= 100n && r.d !== 1n) return r.n + '/' + r.d;
  return null;
}

/* ---------- LRU 缓存 ---------- */
function LRU(cap) {
  this.cap = cap; this.map = new Map();
}
LRU.prototype.get = function (k) {
  if (!this.map.has(k)) return undefined;
  const v = this.map.get(k); this.map.delete(k); this.map.set(k, v); return v;
};
LRU.prototype.set = function (k, v) {
  if (this.map.has(k)) this.map.delete(k);
  this.map.set(k, v);
  if (this.map.size > this.cap) this.map.delete(this.map.keys().next().value);
};
LRU.prototype.has = function (k) { return this.map.has(k); };

/* ---------- 常量与配色 ---------- */
const PALETTE = ['#3b6ef5', '#e11d48', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const PI = Math.PI;
const TAU = Math.PI * 2;

/* ---------- 字符串（集中管理用户可见中文） ---------- */
const STR = {
  appTitle: '函数可视化',
  placeholder: '输入函数，如 f(x)=x^2-2x-3 或 |x-1|',
  add: '添加',
  errEmpty: '请输入函数表达式',
  errParse: '解析失败',
  templates: '模板',
  functions: '函数',
  params: '参数',
  operations: '运算',
  opAdd: 'f+g', opSub: 'f−g', opMul: 'f·g', opDiv: 'f÷g', opComp: 'f∘g', opInv: '反函数',
  addDerivedFn: '添加新函数',
  analysis: '分析', derivation: '推导', history: '记录',
  intervalAnalysis: '区间分析', jump: '跳转',
  noSelection: '在左侧选择或输入一个函数后，这里会显示分析结果。',
  domain: '定义域', monotonicity: '单调性', extrema: '极值', asymptotes: '渐近线',
  roots: '零点', range: '值域', parity: '奇偶性', holes: '可去间断点',
  compareTitle: '比较 f 与 g',
  transform: '变换',
  translate: '平移', scale: '伸缩', reflect: '对称', inverse: '反函数', none: '无',
  undo: '撤销', redo: '重做',
  zoomIn: '放大', zoomOut: '缩小', fit: '适应', aspect: '纵横比锁',
  verified: '已验证等价', notVerified: '未通过验证',
  exact: '精确解·完整', window: '数值解·限于区间', periodic: '周期解·已给通式', partial: '部分解',
  coordTransform: '坐标系变换', coordTheta: '旋转角', coordOrigin: '原点偏移', coordDist: '距离', coordDir: '方向角',
  coordModeAB: '原点坐标', coordModeRP: '距离+方向角',
  coordPlay: '播放', coordScrub: '回看', coordGenerate: '生成派生函数',
  coordNotFn: '不再是函数', coordParam: '参数曲线', coordHint: '输入旋转角与平移量，生成各函数在坐标系运动后的派生函数',
  implicitEq: '隐式方程', paramEq: '参数方程', curveForm: '表达形式',
  conic: '圆锥曲线', conicCircle: '圆', conicEllipse: '椭圆', conicHyperbola: '双曲线', conicParabola: '抛物线',
  generalForm: '一般式',
  noFnAnalysis: '该曲线不是 y=f(x) 函数，无函数分析',
  chooseBranch: '选择比较分支',
  branchCancel: '取消',
  compareBadge: '比较大小',
  intersect: '联立求交点',
  calc: '微积分',
  calcContinuity: '连续', calcDerivative: '求导',
  calcIntegrability: '定积分', calcIntegral: '积分', calcImplicitDeriv: '隐函数求导', calcParamDeriv: '参数方程求导',
  order: '阶数', orderHint: '求导阶数 / 积分重数 n（对「求导」「积分」生效，默认 1）',
};

/* 把若干小工具挂到全局命名空间（单文件拼接后同一作用域） */
function parseRatValue(str) {
  // 支持 "3"、"3/2"、"0.1"、"-2.5" 等形式；失败返回 null
  str = String(str).trim();
  if (!str) return null;
  try {
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length !== 2) return null;
      const n = BigInt(parts[0].trim()), d = BigInt(parts[1].trim());
      if (d === 0n) return null;
      return new Rat(n, d);
    }
    return Rat.fromDecimal(str);
  } catch (e) { return null; }
}

var UTIL = { Rat, fmtNum, fmtEdge, LRU, PALETTE, PI, TAU, STR, gcd, parseRatValue };

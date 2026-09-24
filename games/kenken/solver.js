'use strict';

// KenKen 풀이. 두 가지에 쓴다 — 굽는 자리에서 판이 찍지 않고 끝까지 풀리는지 보고
// (`solve`), 힌트가 지금 판에서 사람이 다음으로 확정할 수 있는 칸을 짚는다(`next`).
//
// **찍지 않는다.** 규칙은 참인 것만 이끌어 내므로 끝까지 풀리면 답이 하나뿐이다.
//
// 칸마다 들어갈 수 있는 숫자를 비트로 들고(1 << d), 규칙으로 줄여 간다.
//   1. 확정된 칸의 숫자는 같은 행·열의 다른 칸에서 빠진다.
//   2. 행이나 열에서 어떤 숫자가 들어갈 칸이 하나뿐이면 그 칸이다.
//   3. 케이지: 케이지 칸들의 후보로 만들 수 있는 조합 중 셈이 맞는 것만 남긴다.
//   4. 가정(어려움만): 한 칸에 한 숫자를 넣어 보고 1~3을 돌려 모순이 나면 그 숫자는 빠진다.
// 이유는 문장이 아니라 자료로 돌려준다(`why: { code, ... }`). 문장은 화면이 엮는다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.KenKenRules;

const bit = (d) => 1 << d;

function popcount(mask) {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
}

function onlyDigit(mask) {
  for (let d = 1; d < 16; d++) if (mask === bit(d)) return d;
  return 0;
}

const cache = new Map();

function context(puzzle) {
  const n = puzzle.size;
  let peers = cache.get(n);
  if (!peers) {
    peers = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const list = [];
      for (let k = 0; k < n; k++) {
        if (k !== c) list.push(r * n + k);
        if (k !== r) list.push(k * n + c);
      }
      peers.push(list);
    }
    cache.set(n, peers);
  }
  const lines = [];
  for (let k = 0; k < n; k++) {
    lines.push(Array.from({ length: n }, (_, c) => k * n + c));
    lines.push(Array.from({ length: n }, (_, r) => r * n + k));
  }
  return { puzzle, n, peers, lines, all: (bit(n + 1) - 1) & ~1 };
}

// 칸마다 후보. 채운 칸은 그 숫자 하나다.
function start(ctx, values) {
  const dom = new Uint16Array(ctx.n * ctx.n).fill(ctx.all);
  if (values) values.forEach((v, i) => { if (v) dom[i] = bit(v); });
  return dom;
}

// 케이지 칸들이 가질 수 있는 숫자. 셈이 맞는 조합을 모두 훑어 칸마다 쓰인 숫자를 모은다.
// 케이지 안에서 같은 행·열에 놓인 두 칸은 같은 숫자일 수 없다.
function cageMasks(ctx, cage, dom) {
  const { n } = ctx;
  const cells = cage.cells;
  const k = cells.length;
  const out = new Uint16Array(k);
  const pick = new Int32Array(k);
  const clash = cells.map((a, x) => cells.map((b, y) => y < x && (
    Math.floor(a / n) === Math.floor(b / n) || a % n === b % n)));

  (function rec(x, acc) {
    if (x === k) {
      if (!R.holds(cage.op, cage.target, Array.from(pick))) return;
      for (let y = 0; y < k; y++) out[y] |= bit(pick[y]);
      return;
    }
    for (let d = 1; d <= n; d++) {
      if (!(dom[cells[x]] & bit(d))) continue;
      let ok = true;
      for (let y = 0; y < x; y++) if (clash[x][y] && pick[y] === d) { ok = false; break; }
      if (!ok) continue;
      // 덧셈·곱셈은 중간 값이 목표를 넘으면(나누어떨어지지 않으면) 더 볼 것이 없다.
      let next = acc;
      if (cage.op === '+') { next = acc + d; if (next > cage.target) continue; }
      if (cage.op === '*') { next = acc * d; if (cage.target % next) continue; }
      pick[x] = d;
      rec(x + 1, next);
    }
  })(0, cage.op === '*' ? 1 : 0);
  return out;
}

// 규칙 1~3을 한 번씩 돌려 이끌어 낸 것 하나. 새로 확정된 칸이 생기면 그 칸과 까닭을,
// 후보만 줄었으면 { narrowed: true }를, 아무것도 없으면 null을, 모순이면 'bad'를 돌려준다.
// `fixed`는 이미 확정으로 친 칸 — 새로 확정된 칸을 가리는 데 쓴다.
function step(ctx, dom, fixed) {
  const { n, peers, lines, puzzle } = ctx;
  const cells = n * n;
  const newly = (code) => {
    for (let i = 0; i < cells; i++) {
      if (!fixed[i] && popcount(dom[i]) === 1) return { cell: i, digit: onlyDigit(dom[i]), why: { code } };
    }
    return null;
  };

  // 1. 확정된 칸의 숫자를 이웃에서 뺀다.
  let narrowed = false;
  for (let i = 0; i < cells; i++) {
    if (popcount(dom[i]) !== 1) continue;
    for (const j of peers[i]) {
      if (dom[j] & dom[i]) {
        dom[j] &= ~dom[i];
        if (!dom[j]) return 'bad';
        narrowed = true;
      }
    }
  }
  let found = newly('single');
  if (found) return found;

  // 2. 줄에서 숫자가 들어갈 칸이 하나뿐.
  for (const line of lines) {
    for (let d = 1; d <= n; d++) {
      const spots = line.filter((i) => dom[i] & bit(d));
      if (!spots.length) return 'bad';
      if (spots.length === 1 && dom[spots[0]] !== bit(d)) {
        dom[spots[0]] = bit(d);
        if (!fixed[spots[0]]) return { cell: spots[0], digit: d, why: { code: 'hidden' } };
        narrowed = true;
      }
    }
  }

  // 3. 케이지.
  for (const cage of puzzle.cages) {
    const masks = cageMasks(ctx, cage, dom);
    cage.cells.forEach((i, x) => {
      const next = dom[i] & masks[x];
      if (next !== dom[i]) { dom[i] = next; narrowed = true; }
    });
    if (cage.cells.some((i) => !dom[i])) return 'bad';
  }
  found = newly('cage');
  if (found) return found;

  return narrowed ? { narrowed: true } : null;
}

// 더 나올 것이 없을 때까지 돌린다. 모순이면 false.
function settle(ctx, dom) {
  const fixed = new Uint8Array(ctx.n * ctx.n);
  for (;;) {
    const found = step(ctx, dom, fixed);
    if (found === 'bad') return false;
    if (!found) return true;
    if (found.cell !== undefined) fixed[found.cell] = 1;
  }
}

// 가정 하나: 후보 하나를 넣어 보고 모순이 나면 뺀다. 뺀 것이 있으면 true.
function trial(ctx, dom) {
  for (let i = 0; i < ctx.n * ctx.n; i++) {
    if (popcount(dom[i]) < 2) continue;
    for (let d = 1; d <= ctx.n; d++) {
      if (!(dom[i] & bit(d))) continue;
      const copy = dom.slice();
      copy[i] = bit(d);
      if (!settle(ctx, copy)) {
        dom[i] &= ~bit(d);
        return true;
      }
    }
  }
  return false;
}

const done = (dom) => dom.every((m) => popcount(m) === 1);

function valuesOf(dom) {
  return Array.from(dom, (m) => (popcount(m) === 1 ? onlyDigit(m) : 0));
}

// 판을 끝까지 푼다. `trial`이 없으면 가정 없이 규칙만 쓴다.
// 결과: { solved, values, trials } — trials는 가정을 몇 번 썼는지.
function solve(puzzle, options = {}) {
  const ctx = context(puzzle);
  const dom = start(ctx, options.values);
  let trials = 0;
  for (;;) {
    if (!settle(ctx, dom)) return { solved: false, values: valuesOf(dom), trials, broken: true };
    if (done(dom) || !options.trial) break;
    // 가정을 이보다 많이 써야 하는 판은 굽는 자리에서 어차피 버린다. 끝까지 풀면 8×8 한
    // 판에 몇 초씩 든다.
    if (options.maxTrials !== undefined && trials >= options.maxTrials) break;
    if (!trial(ctx, dom)) break;
    trials++;
  }
  const values = valuesOf(dom);
  const solved = done(dom) && R.inspect(puzzle, values).solved;
  return { solved, values, trials };
}

// 지금 판에서 다음으로 확정할 수 있는 칸 하나: { cell, digit, why }. 넘겨받는 판에는 틀린
// 숫자가 없어야 한다(화면이 힌트 전에 짚어 낸다).
function next(puzzle, values, options = {}) {
  const ctx = context(puzzle);
  const dom = start(ctx, values);
  const fixed = Uint8Array.from(values, (v) => (v ? 1 : 0));
  let tried = false;
  for (let guard = 0; guard < 10000; guard++) {
    const found = step(ctx, dom, fixed);
    if (found === 'bad') return null;
    if (found && found.cell !== undefined) {
      if (tried) found.why = { code: 'trial' };
      return found;
    }
    if (found) continue;
    if (!options.trial || !trial(ctx, dom)) return null;
    tried = true;
  }
  return null;
}

const api = { bit, popcount, context, start, cageMasks, solve, next };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.KenKenSolver = api;

})();

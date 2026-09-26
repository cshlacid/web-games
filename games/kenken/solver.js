'use strict';

// KenKen 풀이. 두 가지에 쓴다 — 굽는 자리에서 판이 찍지 않고 끝까지 풀리는지 보고
// (`solve`), 힌트가 지금 판에서 사람이 새로 알 수 있는 것을 짚는다(`hint`).
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

// 사람이 머리로 따라갈 수 있는 가정의 길이. 넣어 보고 두 걸음(`step` 두 번) 안에 막히는
// 것까지만 논리로 친다. 그보다 긴 가정이 필요한 판은 "경우의 수를 다 따져 봐야 하는"
// 판이라 굽지 않는다.
const SHORT_TRIAL = 2;

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
// `fixed`는 이미 확정으로 친 칸 — 새로 확정된 칸을 가리는 데 쓴다. `info`를 넘기면 모순이 난
// 칸들을 `info.cells`에 적는다(힌트가 판에서 밝힌다).
function step(ctx, dom, fixed, info) {
  const bad = (where) => { if (info) info.cells = where; return 'bad'; };
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
        if (!dom[j]) return bad([i, j]);
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
      if (!spots.length) return bad(line);
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
    if (cage.cells.some((i) => !dom[i])) return bad(cage.cells);
  }
  found = newly('cage');
  if (found) return found;

  return narrowed ? { narrowed: true } : null;
}

// 더 나올 것이 없을 때까지 돌린다. 모순이면 false.
// `info`는 힌트의 가정만 넘긴다 — 모순이면 `step`을 몇 번 돌려 막혔는지(`info.steps`)와 막힌
// 곳(`info.cells`)을 적고, `info.limit`번 안에 막히지 않으면 거기서 그만둔다(true). 이미 더
// 빨리 막히는 칸을 찾았으면 그보다 오래 가 볼 까닭이 없다. 굽는 자리와 `solve`는 넘기지 않으므로
// 끝까지 돌리는 동작 그대로다.
function settle(ctx, dom, info) {
  const fixed = new Uint8Array(ctx.n * ctx.n);
  for (let steps = 1; ; steps++) {
    if (info && steps > info.limit) return true;
    const found = step(ctx, dom, fixed, info);
    if (found === 'bad') { if (info) info.steps = steps; return false; }
    if (!found) return true;
    if (found.cell !== undefined) fixed[found.cell] = 1;
  }
}

// 가정 하나: 후보 하나를 넣어 보고 모순이 나면 뺀다. 뺀 것이 있으면 true.
function trial(ctx, dom, limit) {
  for (let i = 0; i < ctx.n * ctx.n; i++) {
    if (popcount(dom[i]) < 2) continue;
    for (let d = 1; d <= ctx.n; d++) {
      if (!(dom[i] & bit(d))) continue;
      const copy = dom.slice();
      copy[i] = bit(d);
      if (!settle(ctx, copy, limit === Infinity ? undefined : { limit })) {
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

// 판을 끝까지 푼다. `trial`이 없으면 가정 없이 규칙만 쓴다. 가정은 짧은 것(SHORT_TRIAL
// 걸음 안에 막히는 것)만 쓰고, 정답을 얻으려는 화면만 `limit: Infinity`로 끝까지 간다.
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
    if (!trial(ctx, dom, options.limit ?? SHORT_TRIAL)) break;
    trials++;
  }
  const values = valuesOf(dom);
  const solved = done(dom) && R.inspect(puzzle, values).solved;
  return { solved, values, trials };
}

// 힌트 한 걸음. 넣은 숫자와 연필 표시를 지금까지 알아낸 것으로 보고, 거기서 새로 알 수 있는
// 것 하나를 돌려준다. 쉬운 까닭부터 본다.
//   칸이 확정되면  { cell, digit, why }
//   후보만 줄면    { marks: [{ cell, mask }], why } — 연필 표시를 이 값으로 바꾼다
// 연필 표시가 없는 칸은 모든 숫자가 후보다. 넘겨받는 판에는 틀린 숫자도, 정답을 빠뜨린 연필
// 표시도 없어야 한다(화면이 힌트 전에 짚어 낸다) — 그래야 줄여 가도 정답이 남는다.
function hint(puzzle, values, marks) {
  const ctx = context(puzzle);
  const { n, lines } = ctx;
  const cells = n * n;
  const empty = (i) => !values[i];

  // 지금 알고 있는 후보. 같은 줄에 넣은 숫자는 연필 표시에 남아 있어도 뺀다.
  const dom = new Uint16Array(cells);
  for (let i = 0; i < cells; i++) {
    if (values[i]) { dom[i] = bit(values[i]); continue; }
    dom[i] = (marks && marks[i]) || ctx.all;
    for (const j of ctx.peers[i]) if (values[j]) dom[i] &= ~bit(values[j]);
  }

  // 1. 후보가 하나뿐인 칸.
  for (let i = 0; i < cells; i++) {
    if (empty(i) && popcount(dom[i]) === 1) return { cell: i, digit: onlyDigit(dom[i]), why: { code: 'single' } };
  }

  // 2. 줄에서 숫자가 들어갈 칸이 하나뿐.
  for (const line of lines) {
    for (let d = 1; d <= n; d++) {
      if (line.some((i) => values[i] === d)) continue;
      const spots = line.filter((i) => dom[i] & bit(d));
      if (spots.length === 1) return { cell: spots[0], digit: d, why: { code: 'hidden' } };
    }
  }

  // 3. 케이지. 확정되는 칸이 있으면 그것을, 없으면 후보가 준 칸을 돌려준다.
  let narrowed = null;
  for (const cage of puzzle.cages) {
    const masks = cageMasks(ctx, cage, dom);
    const changed = [];
    for (let x = 0; x < cage.cells.length; x++) {
      const i = cage.cells[x];
      const next = dom[i] & masks[x];
      if (!empty(i) || next === dom[i]) continue;
      if (popcount(next) === 1) return { cell: i, digit: onlyDigit(next), why: { code: 'cage' } };
      changed.push({ cell: i, mask: next });
    }
    if (changed.length && !narrowed) narrowed = { marks: changed, why: { code: 'cageMarks' } };
  }
  if (narrowed) return narrowed;

  // 4. 가정: 한 칸에 한 숫자를 넣어 보고 모순이 나면 그 숫자는 빠진다. **가장 적은 걸음 안에
  //    막히는 칸과 숫자**를 고른다 — 처음 걸린 것을 주면 규칙을 스무 번 넘게 돌려야 막히는
  //    것이 나와, 사람이 머리로 따라갈 수 없다. 한 걸음 만에 막히면 더 보지 않는다.
  let best = null;
  for (let i = 0; i < cells && !(best && best.steps === 1); i++) {
    if (!empty(i) || popcount(dom[i]) < 2) continue;
    for (let d = 1; d <= n; d++) {
      if (!(dom[i] & bit(d))) continue;
      const copy = dom.slice();
      copy[i] = bit(d);
      const info = { limit: best ? best.steps - 1 : Infinity };
      if (settle(ctx, copy, info)) continue;
      best = { cell: i, digit: d, steps: info.steps, cells: info.cells };
      if (best.steps === 1) break;
    }
  }
  if (!best) return null;
  const { cell: i, digit: d, steps } = best;
  const rest = dom[i] & ~bit(d);
  if (popcount(rest) === 1) return { cell: i, digit: onlyDigit(rest), why: { code: 'trial', tried: d, steps, cells: best.cells } };
  return { marks: [{ cell: i, mask: rest }], why: { code: 'trialMarks', digit: d, steps, cells: best.cells } };
}

const api = { SHORT_TRIAL, bit, popcount, context, start, cageMasks, settle, solve, hint };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.KenKenSolver = api;

})();

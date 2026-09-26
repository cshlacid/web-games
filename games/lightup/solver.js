'use strict';

// Light Up 풀이. 두 가지에 쓴다 — 굽는 자리에서 숫자를 지워도 판이 여전히 끝까지 풀리는지
// 보고(`solve`), 힌트가 지금 판에서 사람이 다음으로 알아낼 수 있는 칸을 짚는다(`next`).
//
// **찍지 않는다.** 규칙은 참인 것만 이끌어 내므로 끝까지 풀리면 답이 하나뿐이다.
//
// 흰 칸의 상태는 셋이다: 모름, 전구, 전구 아님.
// 이유는 문장이 아니라 자료로 돌려준다(`why: { code, ... }`). 문장은 화면이 엮는다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.LightUpRules;

const UNKNOWN = 0;
const BULB = 1;
const NONE = 2;

// 사람이 머리로 따라갈 수 있는 가정의 길이. 놓아 보고 두 걸음 안에 막히는 것까지만
// 논리로 친다. 그보다 긴 가정이 필요한 판은 "경우의 수를 다 따져 봐야 하는" 판이라
// 굽지 않는다.
const SHORT_TRIAL = 2;

function context(puzzle) {
  return { puzzle, cells: puzzle.cells, geo: R.geometry(puzzle) };
}

function start(ctx) {
  return new Uint8Array(ctx.geo.n);
}

// 한 판에서 이끌어 낼 수 있는 것 하나. 사람이 먼저 보는 순서대로 본다. 없으면 null,
// 모순이면 'bad'.
function deduce(ctx, state) {
  const { cells, geo } = ctx;
  const lit = new Uint8Array(geo.n);
  for (let i = 0; i < geo.n; i++) {
    if (cells[i] !== R.OPEN || state[i] !== BULB) continue;
    lit[i] = 1;
    for (const j of geo.sight[i]) {
      if (state[j] === BULB) return 'bad';
      lit[j] = 1;
    }
  }

  // 1. 숫자 벽. 전구가 숫자만큼 찼으면 나머지 이웃은 전구가 아니고, 남은 자리가 모자란
  //    수와 같으면 모두 전구다.
  for (let i = 0; i < geo.n; i++) {
    const k = cells[i];
    if (k < 0) continue;
    const around = geo.near[i].filter((j) => cells[j] === R.OPEN);
    const bulbs = around.filter((j) => state[j] === BULB).length;
    const open = around.filter((j) => state[j] === UNKNOWN);
    if (bulbs > k || bulbs + open.length < k) return 'bad';
    if (!open.length) continue;
    if (bulbs === k) return { cells: open, value: NONE, why: { code: 'numberFull', cell: i, clue: k } };
    if (bulbs + open.length === k) return { cells: open, value: BULB, why: { code: 'numberNeed', cell: i, clue: k } };
  }

  // 2. 빛을 받은 칸에는 전구를 놓을 수 없다 — 놓으면 그 빛을 낸 전구와 서로 비춘다.
  for (let i = 0; i < geo.n; i++) {
    if (cells[i] === R.OPEN && state[i] === UNKNOWN && lit[i]) {
      return { cells: [i], value: NONE, why: { code: 'seen', cell: i } };
    }
  }

  // 3. 빛을 받을 길이 하나뿐인 칸. 어두운 칸은 제자리나 보이는 칸 중 어딘가에 전구가
  //    있어야 한다.
  for (let i = 0; i < geo.n; i++) {
    if (cells[i] !== R.OPEN || lit[i]) continue;
    const sources = [i, ...geo.sight[i]].filter((j) => state[j] === UNKNOWN);
    if (!sources.length) return 'bad';
    if (sources.length === 1) return { cells: sources, value: BULB, why: { code: 'onlyLight', cell: i } };
  }

  return null;
}

function write(state, found) {
  for (const i of found.cells) {
    if (state[i] === found.value) continue;
    if (state[i] !== UNKNOWN) return false;
    state[i] = found.value;
  }
  return true;
}

function settle(ctx, state) {
  for (;;) {
    const found = deduce(ctx, state);
    if (found === 'bad') return false;
    if (!found) return true;
    if (!write(state, found)) return false;
  }
}

// 규칙을 몇 번 써서 모순이 나는지. limit 안에 모순이 안 나면 0.
function refute(ctx, state, limit) {
  for (let steps = 1; steps <= limit; steps++) {
    const found = deduce(ctx, state);
    if (found === 'bad') return steps;
    if (!found) return 0;
    if (!write(state, found)) return steps;
  }
  return 0;
}

// 가정 하나: 한 칸에 전구를 놓아(또는 비워) 보고 규칙을 돌려 모순이 나면 반대다.
// **가장 빨리 막히는 것을 고른다.** 처음 걸린 칸을 주면 열 걸음 넘게 따라가야 막히는
// 것이 나와 사람이 머리로 따라갈 수 없다. limit보다 길게 가야 막히는 것은 없는 셈 친다.
function trial(ctx, state, limit = Infinity) {
  let best = null;
  for (let i = 0; i < ctx.geo.n; i++) {
    if (ctx.cells[i] !== R.OPEN || state[i] !== UNKNOWN) continue;
    for (const [guess, other, code] of [[BULB, NONE, 'trialNone'], [NONE, BULB, 'trialBulb']]) {
      const copy = state.slice();
      copy[i] = guess;
      const steps = refute(ctx, copy, best ? best.why.steps - 1 : limit);
      if (steps) best = { cells: [i], value: other, why: { code, cell: i, steps } };
      if (best && best.why.steps === 1) return best;
    }
  }
  return best;
}

// 판이 다 풀렸는지. 빛을 받은 칸은 규칙 2가 모두 "전구 아님"으로 정하므로, 끝난 판에는
// 모르는 칸이 남지 않는다.
function finished(ctx, state) {
  const marks = Array.from(state, (v) => (v === BULB ? R.BULB : R.EMPTY));
  return R.inspect(ctx.puzzle, marks).solved;
}

// 판을 끝까지 푼다. `trial`이 없으면 가정 없이 규칙만 쓴다. 가정은 짧은 것(SHORT_TRIAL
// 걸음 안에 막히는 것)만 쓰고, 정답을 얻으려는 화면만 `limit: Infinity`로 끝까지 간다.
// 결과: { solved, state, trials } — trials는 가정을 몇 번 썼는지.
function solve(puzzle, options = {}) {
  const ctx = context(puzzle);
  const state = options.state ? Uint8Array.from(options.state) : start(ctx);
  let trials = 0;
  for (;;) {
    if (!settle(ctx, state)) return { solved: false, state, trials, broken: true };
    if (finished(ctx, state) || !options.trial) break;
    const found = trial(ctx, state, options.limit ?? SHORT_TRIAL);
    if (!found) break;
    trials++;
    write(state, found);
  }
  return { solved: finished(ctx, state), state, trials };
}

// 지금 판에서 알아낼 수 있는 것 하나. 넘겨받는 판에는 틀린 칸이 없어야 한다(화면이 힌트
// 전에 걷어 낸다).
function next(puzzle, state, options = {}) {
  const ctx = context(puzzle);
  const found = deduce(ctx, state);
  if (found && found !== 'bad') return found;
  if (options.trial && !finished(ctx, state)) return trial(ctx, state, options.limit ?? Infinity);
  return null;
}

const api = { UNKNOWN, BULB, NONE, SHORT_TRIAL, context, start, solve, next };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.LightUpSolver = api;

})();

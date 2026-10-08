'use strict';

// 범인 찾기 풀이. 세 가지에 쓴다 — 굽는 자리에서 사람이 논리로 끝까지 밝힐 수 있는지 보고
// (`deduce`), 화면이 고른 정체가 단서로 정해지는지 가리고(`decided`), 힌트가 한 걸음을 짚는다
// (`hint`).
//
// 상태는 비트 둘이다: known(정체가 정해진 사람), crim(그중 범인). 쓰는 단서는 밝혀진 사람의
// 것뿐이다 — 논리로 정해졌어도 밝히기 전에는 그 사람의 단서를 모른다.
//   1. 단서 하나: 단서가 닿는 사람 중 아직 모르는 사람의 정체를 모두 늘어놓아 보고, 단서가
//      참인 경우에서 늘 같은 정체인 사람을 정한다. 한 번에 단서를 하나씩 다 보는 것이 한 걸음.
//   2. 가정(보통·어려움): 한 사람의 정체를 정해 놓고 두 걸음(`SHORT_TRIAL`) 안에 모순이 나면
//      반대다.
// 이유는 문장이 아니라 자료로 돌려준다(`why: { code, ... }`). 문장은 화면이 엮는다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.WhodunitRules;

const SHORT_TRIAL = 2;

// 단서 하나로 정해지는 사람. 모순이면 null.
function apply(clue, known, crim) {
  const open = R.bits(clue.scope & ~known);
  if (!open.length) return R.holds(clue, crim) ? { known, crim } : null;
  let always = R.FULL;
  let ever = 0;
  let any = false;
  for (let x = 0; x < 1 << open.length; x++) {
    let c = crim;
    for (let k = 0; k < open.length; k++) if (x & (1 << k)) c |= 1 << open[k];
    if (!R.holds(clue, c)) continue;
    any = true;
    always &= c;
    ever |= c;
  }
  if (!any) return null;
  const openMask = R.maskOf(open);
  const toCrim = always & openMask;
  const toInno = openMask & ~ever;
  return { known: known | toCrim | toInno, crim: crim | toCrim };
}

// 한 걸음: 단서를 하나씩 다 본다. 앞 단서가 정한 것을 뒤 단서가 이어받는다.
function round(clues, state) {
  let { known, crim } = state;
  for (const clue of clues) {
    const next = apply(clue, known, crim);
    if (!next) return null;
    ({ known, crim } = next);
  }
  return { known, crim };
}

function settle(clues, state, steps = Infinity) {
  let s = state;
  for (let k = 0; k < steps; k++) {
    const next = round(clues, s);
    if (!next) return null;
    if (next.known === s.known) return next;
    s = next;
  }
  return s;
}

// 가정 한 번: 가장 빨리 모순이 나는 사람과 정체를 찾아 반대로 정한다.
function trial(clues, state) {
  const open = R.bits(R.FULL & ~state.known);
  for (let steps = 1; steps <= SHORT_TRIAL; steps++) {
    for (const i of open) {
      for (const v of [1, 0]) {
        const guess = { known: state.known | (1 << i), crim: v ? state.crim | (1 << i) : state.crim };
        if (!settle(clues, guess, steps)) {
          return { cell: i, value: 1 - v, steps };
        }
      }
    }
  }
  return null;
}

const cluesOf = (puzzle, revealed) => R.bits(revealed).map((i) => puzzle.clues[i]);

// 밝힌 사람들의 단서로 논리로 정해지는 사람 전부. 가정을 몇 번 썼는지도 센다.
function deduce(puzzle, revealed, options = {}) {
  const clues = cluesOf(puzzle, revealed);
  let state = settle(clues, { known: revealed, crim: puzzle.truth & revealed });
  let trials = 0;
  while (state && options.trial && state.known !== R.FULL) {
    const t = trial(clues, state);
    if (!t) break;
    trials++;
    const known = state.known | (1 << t.cell);
    state = settle(clues, { known, crim: t.value ? state.crim | (1 << t.cell) : state.crim });
  }
  return { known: state ? state.known : revealed, crim: state ? state.crim : 0, trials };
}

// 단서들을 모두 만족하는 정체가 하나라도 있는가(밝힌 사람과 가정한 사람은 정해 둔 채로).
// 단서가 닿지 않는 사람은 무엇이든 되므로 뒤지지 않는다.
function consistent(clues, known, crim) {
  const scope = clues.reduce((m, c) => m | c.scope, 0);
  const vars = R.bits(scope & ~known);
  return (function rec(k, kn, cr) {
    if (!clues.every((clue) => R.possible(clue, kn, cr))) return false;
    if (k === vars.length) return true;
    const bit = 1 << vars[k];
    return rec(k + 1, kn | bit, cr) || rec(k + 1, kn | bit, cr | bit);
  })(0, known, crim);
}

// 화면에서 고른 정체가 단서로 정해지는가. 'yes'(맞고 정해짐), 'no'(정해졌는데 반대),
// 'open'(아직 둘 다 될 수 있음). 사람의 논리가 풀이기보다 깊어도 받아 주려고, 여기는 걸음 수를
// 따지지 않고 끝까지 뒤진다.
function decided(puzzle, revealed, cell, value) {
  const clues = cluesOf(puzzle, revealed);
  const crim = puzzle.truth & revealed;
  const bit = 1 << cell;
  const other = consistent(clues, revealed | bit, value ? crim : crim | bit);
  const truth = (puzzle.truth >> cell) & 1;
  if (!other) return value === truth ? 'yes' : 'no';
  return value === truth ? 'open' : (consistent(clues, revealed | bit, value ? crim | bit : crim) ? 'open' : 'no');
}

// 힌트 한 걸음. 밝힌 사람의 단서 하나로 정해지는 사람을 먼저, 없으면 가장 짧은 가정.
//   { cell, value, why: { code: 'clue', from } | { code: 'trial', assume } | { code: 'deep' } }
function hint(puzzle, revealed) {
  const state = { known: revealed, crim: puzzle.truth & revealed };
  for (const from of R.bits(revealed)) {
    const next = apply(puzzle.clues[from], state.known, state.crim);
    const fresh = next ? next.known & ~state.known : 0;
    if (fresh) {
      const cell = R.bits(fresh)[0];
      return { cell, value: (next.crim >> cell) & 1, why: { code: 'clue', from } };
    }
  }
  const t = trial(cluesOf(puzzle, revealed), state);
  if (t) return { cell: t.cell, value: t.value, why: { code: 'trial', assume: 1 - t.value } };
  for (const cell of R.bits(R.FULL & ~revealed)) {
    const value = (puzzle.truth >> cell) & 1;
    if (decided(puzzle, revealed, cell, value) === 'yes') return { cell, value, why: { code: 'deep' } };
  }
  return null;
}

const api = { SHORT_TRIAL, apply, settle, deduce, consistent, decided, hint };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.WhodunitSolver = api;

})();

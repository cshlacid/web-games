'use strict';

// 브라우저에서는 클래식 스크립트가 전역 렉시컬 스코프를 공유한다. 파일마다
// 최상위에 같은 이름을 선언하면 다른 파일과 충돌해 페이지 전체가 죽는다
// (solver.js와 generator.js가 둘 다 const R을 두고 있었다). IIFE로 가둔다.
(function () {

const R = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./rules.js')
  : window.DoppelRules;

// 사람이 쓰는 추론만 하는 솔버. 여기서는 절대 분기하지 않는다 — 생성기가 이
// 솔버로 "힌트만으로 풀리는가"를 판정하므로, 추측이 한 줄이라도 섞이면 그
// 보장이 무너진다. 완전 탐색은 rules.js의 solve/countSolutions에만 둔다.
//
// 추론의 중심은 하나다: 한 줄에서 아직 가능한 배치들을 모아, 각 칸이 가질 수
// 있는 값의 합집합을 구한다. 아래 기법들은 대부분 그것의 값싼 특수형이고,
// 난이도를 가르기 위해 따로 이름을 붙였다.

const BLOCK_BIT = 1;
const bitOf = (value) => (value === R.BLOCK ? BLOCK_BIT : 1 << value);

function popcount(mask) {
  let n = 0;
  while (mask) { mask &= mask - 1; n++; }
  return n;
}

function valuesOf(mask, digits) {
  const out = [];
  if (mask & BLOCK_BIT) out.push(R.BLOCK);
  for (let d = 1; d <= digits; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

function createState(n, rowClues, colClues) {
  const digits = R.digitCount(n);
  const full = BLOCK_BIT | (((1 << digits) - 1) << 1);
  const lines = [];
  for (let i = 0; i < n; i++) {
    lines.push({ kind: 'row', index: i, clue: rowClues[i], cells: Array.from({ length: n }, (_, c) => i * n + c) });
  }
  for (let i = 0; i < n; i++) {
    lines.push({ kind: 'col', index: i, clue: colClues[i], cells: Array.from({ length: n }, (_, r) => r * n + i) });
  }
  return {
    n, digits, rowClues, colClues, lines,
    cands: new Uint16Array(n * n).fill(full),
    broken: false,
  };
}

function cloneState(state) {
  return { ...state, cands: state.cands.slice() };
}

/** 확정된 값(후보가 하나뿐인 칸)만 모은 격자. 미정은 UNKNOWN. */
function gridOf(state) {
  const grid = new Int8Array(state.n * state.n).fill(R.UNKNOWN);
  for (let i = 0; i < grid.length; i++) {
    const mask = state.cands[i];
    if (popcount(mask) !== 1) continue;
    grid[i] = (mask & BLOCK_BIT) ? R.BLOCK : Math.log2(mask);
  }
  return grid;
}

const isSolved = (state) => !state.broken && state.cands.every((m) => popcount(m) === 1);

function restrict(state, cell, mask) {
  const next = state.cands[cell] & mask;
  if (next === state.cands[cell]) return false;
  state.cands[cell] = next;
  if (next === 0) state.broken = true;
  return true;
}

/** 이 줄에서 아직 가능한 배치들. 모든 기법의 바탕이다. */
function viableArrangements(state, line) {
  const out = [];
  for (const arrangement of R.arrangementsForClue(state.n, line.clue)) {
    let ok = true;
    for (let p = 0; p < state.n && ok; p++) {
      if (!(state.cands[line.cells[p]] & bitOf(arrangement[p]))) ok = false;
    }
    if (ok) out.push(arrangement);
  }
  return out;
}

// 설명에 어느 줄인지가 빠지면 사용자가 화면에서 근거를 되짚을 수 없다.
const lineName = (line) => `${line.kind === 'row' ? '가로' : '세로'} ${line.index + 1}줄(합 ${line.clue})`;

// --- 기법들. 무언가 바뀌면 그 사실을 설명과 함께 돌려준다. ---

/** 후보가 하나뿐인 칸은 그 값으로 확정된다. 화면상으로는 이미 확정이라 설명거리가 없다. */
function nakedSingle(state) {
  for (let i = 0; i < state.cands.length; i++) {
    if (state.cands[i] === 0) { state.broken = true; return null; }
  }
  return null; // 확정 자체는 후보 마스크로 표현되므로 따로 할 일이 없다
}

/** 확정된 숫자는 같은 줄의 다른 칸에 올 수 없다. 가장 기본적인 소거. */
function eliminate(state) {
  for (const line of state.lines) {
    for (const cell of line.cells) {
      const mask = state.cands[cell];
      if (mask & BLOCK_BIT) continue;
      if (popcount(mask) !== 1) continue;
      let changed = false;
      for (const other of line.cells) {
        if (other === cell) continue;
        changed = restrict(state, other, ~mask) || changed;
      }
      if (changed) {
        const digit = Math.log2(mask);
        return { line, cell, detail: `${lineName(line)}에 이미 ${digit}이 있으니 같은 줄의 다른 칸에는 ${digit}이 올 수 없습니다.` };
      }
    }
  }
  return null;
}

/**
 * 검은 칸 두 자리를 어디에 둘 수 있는지부터 따진다. 사이가 k칸이면 그 합은
 * 가장 작은 숫자 k개의 합과 가장 큰 숫자 k개의 합 사이여야 하므로, 단서만으로도
 * 불가능한 자리 조합이 걸러진다. 사람이 "단서 3이면 사이가 한두 칸"이라고
 * 먼저 따지는 것과 같은 추론이다.
 *
 * "검은 칸 후보가 두 곳만 남으면 둘 다 검은 칸"이라는 별도 기법을 두었다가
 * 지웠다. 후보가 둘이면 가능한 쌍도 하나뿐이라 여기서 그대로 확정된다.
 */
function blockPairs(state) {
  const digits = state.digits;
  const minSum = (k) => (k * (k + 1)) / 2;
  const maxSum = (k) => {
    let sum = 0;
    for (let d = digits; d > digits - k; d--) sum += d;
    return sum;
  };

  for (const line of state.lines) {
    const canBlock = [];
    for (let p = 0; p < state.n; p++) {
      if (state.cands[line.cells[p]] & BLOCK_BIT) canBlock.push(p);
    }

    const feasible = [];
    for (let a = 0; a < canBlock.length; a++) {
      for (let b = a + 1; b < canBlock.length; b++) {
        const between = canBlock[b] - canBlock[a] - 1;
        if (line.clue < minSum(between) || line.clue > maxSum(between)) continue;
        feasible.push([canBlock[a], canBlock[b]]);
      }
    }
    if (feasible.length === 0) {
      state.broken = true;
      return { line, detail: '이 줄에는 검은 칸을 놓을 자리가 남아 있지 않습니다.' };
    }

    const possible = new Set();
    for (const [i, j] of feasible) { possible.add(i); possible.add(j); }

    let changed = false;
    for (let p = 0; p < state.n; p++) {
      if (!possible.has(p)) changed = restrict(state, line.cells[p], ~BLOCK_BIT) || changed;
    }
    if (feasible.length === 1) {
      for (const p of feasible[0]) changed = restrict(state, line.cells[p], BLOCK_BIT) || changed;
    }

    if (changed) {
      const detail = feasible.length === 1
        ? `${lineName(line)}에서 단서를 만족시킬 수 있는 검은 칸 자리는 한 쌍뿐입니다.`
        : `${lineName(line)}에서는 검은 칸 사이에 올 수 있는 칸 수가 단서로 제한되어, 검은 칸을 놓을 수 없는 자리가 걸러집니다.`;
      return { line, detail };
    }
  }
  return null;
}

/** 단서가 그 줄의 숫자 총합이면 검은 칸은 양 끝일 수밖에 없다. */
function maxClue(state) {
  const total = R.lineTotal(state.n);
  for (const line of state.lines) {
    if (line.clue !== total) continue;
    const first = line.cells[0];
    const last = line.cells[state.n - 1];
    let changed = restrict(state, first, BLOCK_BIT);
    changed = restrict(state, last, BLOCK_BIT) || changed;
    for (let p = 1; p < state.n - 1; p++) {
      changed = restrict(state, line.cells[p], ~BLOCK_BIT) || changed;
    }
    if (changed) {
      return { line, detail: `${lineName(line)}의 단서는 그 줄의 숫자를 모두 더한 값이라, 검은 칸은 양 끝일 수밖에 없습니다.` };
    }
  }
  return null;
}

/** 검은 칸 두 개가 이미 정해진 줄에서는 나머지가 모두 숫자다. */
function blocksPlaced(state) {
  for (const line of state.lines) {
    const settled = line.cells.filter((c) => state.cands[c] === BLOCK_BIT);
    if (settled.length !== 2) continue;
    let changed = false;
    for (const cell of line.cells) {
      if (state.cands[cell] === BLOCK_BIT) continue;
      changed = restrict(state, cell, ~BLOCK_BIT) || changed;
    }
    if (changed) {
      return { line, detail: `${lineName(line)}의 검은 칸 두 개가 이미 정해졌으니 나머지 칸은 모두 숫자입니다.` };
    }
  }
  return null;
}

/** 한 줄에서 어떤 숫자가 들어갈 수 있는 칸이 하나뿐이면 그 칸이 그 숫자다. */
function hiddenSingle(state) {
  for (const line of state.lines) {
    for (let d = 1; d <= state.digits; d++) {
      const bit = 1 << d;
      const spots = line.cells.filter((c) => state.cands[c] & bit);
      if (spots.length !== 1) continue;
      if (state.cands[spots[0]] === bit) continue;
      if (restrict(state, spots[0], bit)) {
        return { line, cell: spots[0], detail: `${lineName(line)}에서 ${d}이 들어갈 수 있는 칸이 여기뿐입니다.` };
      }
    }
  }
  return null;
}

/**
 * 검은 칸 두 자리가 정해진 줄에서, 사이에 들어갈 숫자 조합을 따진다.
 * 앱이 "조합"이라고 부르며 보여주는 추론이 이것이다.
 */
function combinations(state) {
  for (const line of state.lines) {
    const blocks = [];
    for (let p = 0; p < state.n; p++) if (state.cands[line.cells[p]] === BLOCK_BIT) blocks.push(p);
    if (blocks.length !== 2) continue;

    const inside = [];
    const outside = [];
    for (let p = 0; p < state.n; p++) {
      if (p === blocks[0] || p === blocks[1]) continue;
      (p > blocks[0] && p < blocks[1] ? inside : outside).push(line.cells[p]);
    }

    // 사이 칸 수에 맞으면서 합이 단서가 되는 숫자 조합을 모은다.
    let insideUnion = 0;
    let outsideUnion = 0;
    let found = 0;
    const pick = (start, left, sum, chosen) => {
      if (left === 0) {
        if (sum !== line.clue) return;
        found++;
        let mask = 0;
        for (const d of chosen) mask |= 1 << d;
        insideUnion |= mask;
        for (let d = 1; d <= state.digits; d++) if (!(mask & (1 << d))) outsideUnion |= 1 << d;
        return;
      }
      for (let d = start; d <= state.digits; d++) {
        if (sum + d > line.clue) break;
        chosen.push(d);
        pick(d + 1, left - 1, sum + d, chosen);
        chosen.pop();
      }
    };
    pick(1, inside.length, 0, []);

    if (found === 0) { state.broken = true; return { line, detail: '이 줄은 단서를 만족시킬 수 없습니다.' }; }

    let changed = false;
    for (const cell of inside) changed = restrict(state, cell, insideUnion) || changed;
    for (const cell of outside) changed = restrict(state, cell, outsideUnion | BLOCK_BIT) || changed;
    if (changed) {
      const detail = found === 1
        ? `${lineName(line)}은 검은 칸 사이 ${inside.length}칸의 합이 ${line.clue}이 되어야 하는데, 그런 조합은 하나뿐입니다.`
        : `${lineName(line)}은 검은 칸 사이 ${inside.length}칸의 합이 ${line.clue}이 되어야 하고, 그런 조합 ${found}가지 어디에도 없는 숫자는 사이에 올 수 없습니다.`;
      return { line, detail };
    }
  }
  return null;
}

/**
 * 이 줄에서 아직 가능한 배치를 모두 모아, 칸마다 가질 수 있는 값의 합집합으로
 * 후보를 좁힌다. 위의 기법들이 못 잡는 것까지 잡는 가장 강한 단계다.
 */
function lineArrangements(state) {
  for (const line of state.lines) {
    const viable = viableArrangements(state, line);
    if (viable.length === 0) { state.broken = true; return { line, detail: '이 줄에 가능한 배치가 남아 있지 않습니다.' }; }

    const union = new Array(state.n).fill(0);
    for (const arrangement of viable) {
      for (let p = 0; p < state.n; p++) union[p] |= bitOf(arrangement[p]);
    }
    let changed = false;
    for (let p = 0; p < state.n; p++) changed = restrict(state, line.cells[p], union[p]) || changed;
    if (changed) {
      return {
        line,
        detail: `${lineName(line)}에서 단서를 만족시키는 배치가 아직 ${viable.length}가지 남았는데, 그 배치들과 지금까지 좁혀 둔 후보를 함께 보면 놓을 수 없는 값이 걸러집니다.`,
      };
    }
  }
  return null;
}

// 앞쪽이 사람 눈에 쉬운 기법이다. 채점은 "끝까지 푸는 데 필요했던 가장 어려운
// 기법"으로 하므로, 매번 앞에서부터 다시 시도해야 각 단계에서 실제로 필요했던
// 최소한의 추론이 기록된다.
const TECHNIQUES = [
  { name: 'eliminate', label: '같은 줄 소거', run: eliminate },
  { name: 'maxClue', label: '최대 단서', run: maxClue },
  { name: 'blockPairs', label: '검은 칸 자리 따지기', run: blockPairs },
  { name: 'blocksPlaced', label: '검은 칸 확정', run: blocksPlaced },
  { name: 'hiddenSingle', label: '숨은 단수', run: hiddenSingle },
  { name: 'combinations', label: '조합 따지기', run: combinations },
  { name: 'lineArrangements', label: '배치 좁히기', run: lineArrangements },
];

const TECHNIQUE_NAMES = TECHNIQUES.map((t) => t.name);

function solveLogically(n, rowClues, colClues, allowed = TECHNIQUE_NAMES) {
  const state = createState(n, rowClues, colClues);
  const techniques = TECHNIQUES.filter((t) => allowed.includes(t.name));
  const used = new Set();

  while (!state.broken) {
    nakedSingle(state);
    if (state.broken) break;
    let progressed = false;
    for (const technique of techniques) {
      if (!technique.run(state)) continue;
      used.add(technique.name);
      progressed = true;
      break;
    }
    if (!progressed) break;
  }

  return { solved: isSolved(state), broken: state.broken, used, state, grid: gridOf(state) };
}

/**
 * 난이도 채점. 이 퍼즐에서 "배치 좁히기"는 고급 기법이 아니라 기본 기법이라,
 * 어떤 기법이 필요했는지보다 그 기법이 몇 번 필요했는지가 체감 난이도에 가깝다.
 * 한 번도 필요 없었다면 나머지 값싼 추론만으로 풀린 판이다.
 */
function grade(n, rowClues, colClues) {
  const state = createState(n, rowClues, colClues);
  let arrangementCalls = 0;
  let hardest = null;

  while (!state.broken) {
    let progressed = false;
    for (const technique of TECHNIQUES) {
      if (!technique.run(state)) continue;
      if (technique.name === 'lineArrangements') arrangementCalls++;
      if (hardest === null || TECHNIQUE_NAMES.indexOf(technique.name) > TECHNIQUE_NAMES.indexOf(hardest)) {
        hardest = technique.name;
      }
      progressed = true;
      break;
    }
    if (!progressed) break;
  }

  return { solved: isSolved(state), arrangementCalls, hardest, grid: gridOf(state) };
}

/** 끝까지 푸는 데 필요했던 가장 어려운 기법. 논리만으로 못 풀면 null. */
function hardestTechnique(n, rowClues, colClues, allowed = TECHNIQUE_NAMES) {
  const result = solveLogically(n, rowClues, colClues, allowed);
  if (!result.solved) return null;
  let hardest = null;
  for (const name of TECHNIQUE_NAMES) if (result.used.has(name)) hardest = name;
  return hardest;
}

/**
 * 지금 판에서 논리적으로 확정할 수 있는 다음 한 칸과 그 근거.
 * 힌트가 "정답을 슬쩍 보여주는 것"이 아니라 "무엇을 근거로 어디를 채울 수
 * 있는지"가 되게 하려는 것이다.
 */
function nextStep(n, rowClues, colClues, placed, allowed = TECHNIQUE_NAMES) {
  const state = createState(n, rowClues, colClues);
  for (let i = 0; i < placed.length; i++) {
    if (placed[i] !== R.UNKNOWN) restrict(state, i, bitOf(placed[i]));
  }
  if (state.broken) return null;

  const techniques = TECHNIQUES.filter((t) => allowed.includes(t.name));
  const before = gridOf(state);

  while (!state.broken) {
    let outcome = null;
    let technique = null;
    for (const candidate of techniques) {
      outcome = candidate.run(state);
      if (outcome) { technique = candidate; break; }
    }
    if (!outcome || state.broken) return null;

    const after = gridOf(state);
    for (let i = 0; i < after.length; i++) {
      if (before[i] === R.UNKNOWN && after[i] !== R.UNKNOWN) {
        // 기법 설명만으로는 "그래서 이 칸이 왜 그 값인가"가 연결되지 않는다.
        // 근거와 결론을 한 문장으로 이어 준다.
        const label = after[i] === R.BLOCK ? '검은 칸' : after[i];
        return {
          cell: i,
          value: after[i],
          technique: technique.name,
          label: technique.label,
          detail: `${outcome.detail} 그래서 이 칸에 남는 것은 ${label}뿐입니다.`,
        };
      }
    }
  }
  return null;
}

/** 단서에 맞는 숫자 조합들. 앱의 조합 패널처럼 사람에게 보여주기 위한 것. */
function clueCombinations(n, clue) {
  const digits = R.digitCount(n);
  const groups = [];
  for (let size = 0; size <= digits; size++) {
    const sets = [];
    const pick = (start, left, sum, chosen) => {
      if (left === 0) { if (sum === clue) sets.push([...chosen]); return; }
      for (let d = start; d <= digits; d++) {
        if (sum + d > clue) break;
        chosen.push(d);
        pick(d + 1, left - 1, sum + d, chosen);
        chosen.pop();
      }
    };
    pick(1, size, 0, []);
    if (sets.length) groups.push({ between: size, sets });
  }
  return groups;
}

const Solver = {
  BLOCK_BIT, bitOf, popcount, valuesOf,
  TECHNIQUES, TECHNIQUE_NAMES,
  createState, cloneState, gridOf, isSolved, viableArrangements,
  solveLogically, hardestTechnique, grade, nextStep, clueCombinations,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.DoppelSolver = Solver;

})();

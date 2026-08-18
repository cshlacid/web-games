'use strict';

// 스도쿠 규칙과 논리 기법. 여기서는 절대 추측하지 않는다 — 후보를 좁히는 추론만
// 한다. 생성기가 "힌트만으로 풀리는 판"인지 판정할 때 이 솔버를 기준으로 삼기
// 때문에, 여기에 분기 탐색이 섞이는 순간 그 보장이 무너진다.

const CELLS = 81;
const ALL = 0x1ff; // 후보 1~9를 비트로 담는다

const bitOf = (digit) => 1 << (digit - 1);
const digitOf = (mask) => 32 - Math.clz32(mask);

function popcount(mask) {
  let n = 0;
  while (mask) { mask &= mask - 1; n++; }
  return n;
}

const ROWS = [], COLS = [], BOXES = [];
for (let i = 0; i < 9; i++) { ROWS.push([]); COLS.push([]); BOXES.push([]); }
for (let i = 0; i < CELLS; i++) {
  const r = (i / 9) | 0, c = i % 9;
  ROWS[r].push(i);
  COLS[c].push(i);
  BOXES[((r / 3) | 0) * 3 + ((c / 3) | 0)].push(i);
}
const LINES = [...ROWS, ...COLS];
const UNITS = [...ROWS, ...COLS, ...BOXES];

const PEERS = [];
for (let i = 0; i < CELLS; i++) {
  const peers = new Set();
  for (const unit of UNITS) {
    if (!unit.includes(i)) continue;
    for (const j of unit) if (j !== i) peers.add(j);
  }
  PEERS.push([...peers]);
}

function emptyState() {
  return { values: new Int8Array(CELLS), cands: new Uint16Array(CELLS).fill(ALL), broken: false };
}

function cloneState(state) {
  return { values: state.values.slice(), cands: state.cands.slice(), broken: state.broken };
}

function eliminate(state, index, digit) {
  const mask = bitOf(digit);
  if (!(state.cands[index] & mask)) return false;
  state.cands[index] &= ~mask;
  if (!state.cands[index] && !state.values[index]) state.broken = true;
  return true;
}

function assign(state, index, digit) {
  if (state.values[index]) return state.values[index] === digit;
  if (!(state.cands[index] & bitOf(digit))) { state.broken = true; return false; }
  state.values[index] = digit;
  state.cands[index] = 0;
  for (const peer of PEERS[index]) {
    if (state.values[peer] === digit) { state.broken = true; return false; }
    eliminate(state, peer, digit);
  }
  return !state.broken;
}

/** 문자열('.' 또는 0이 빈 칸)을 상태로. 단서끼리 이미 충돌하면 broken이 된다. */
function fromString(text) {
  const state = emptyState();
  const chars = [...text];
  for (let i = 0; i < CELLS; i++) {
    const ch = chars[i];
    if (ch >= '1' && ch <= '9') assign(state, i, Number(ch));
  }
  return state;
}

function toString(state) {
  let out = '';
  for (let i = 0; i < CELLS; i++) out += state.values[i] || '.';
  return out;
}

const isComplete = (state) => !state.broken && state.values.every((v) => v > 0);

// --- 기법들. 각각 무언가 바뀌었으면 true를 돌려준다. ---

function nakedSingle(state) {
  for (let i = 0; i < CELLS; i++) {
    if (state.values[i]) continue;
    if (popcount(state.cands[i]) === 1) return assign(state, i, digitOf(state.cands[i]));
  }
  return false;
}

function hiddenSingle(state) {
  for (const unit of UNITS) {
    for (let digit = 1; digit <= 9; digit++) {
      const mask = bitOf(digit);
      let spot = -1, count = 0, placed = false;
      for (const i of unit) {
        if (state.values[i] === digit) { placed = true; break; }
        if (!state.values[i] && (state.cands[i] & mask)) { spot = i; count++; }
      }
      if (placed || count !== 1) continue;
      return assign(state, spot, digit);
    }
  }
  return false;
}

function combinations(items, size) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === size) { out.push([...acc]); return; }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

/** n칸의 후보 합집합이 정확히 n개면, 그 후보들은 같은 단위의 다른 칸에 못 온다. */
function nakedSubset(state, size) {
  for (const unit of UNITS) {
    const open = unit.filter((i) => !state.values[i]);
    if (open.length <= size) continue;
    for (const combo of combinations(open, size)) {
      let union = 0;
      for (const i of combo) union |= state.cands[i];
      if (popcount(union) !== size) continue;
      let changed = false;
      for (const i of open) {
        if (combo.includes(i)) continue;
        for (let digit = 1; digit <= 9; digit++) {
          if (union & bitOf(digit)) changed = eliminate(state, i, digit) || changed;
        }
      }
      if (changed) return true;
    }
  }
  return false;
}

/** n개의 숫자가 정확히 n칸에만 들어갈 수 있으면, 그 칸들엔 다른 숫자가 못 온다. */
function hiddenSubset(state, size) {
  for (const unit of UNITS) {
    const open = unit.filter((i) => !state.values[i]);
    if (open.length <= size) continue;
    const digits = [];
    for (let digit = 1; digit <= 9; digit++) {
      const spots = open.filter((i) => state.cands[i] & bitOf(digit));
      if (spots.length >= 2 && spots.length <= size) digits.push(digit);
    }
    for (const combo of combinations(digits, size)) {
      const spots = new Set();
      let mask = 0;
      for (const digit of combo) {
        mask |= bitOf(digit);
        for (const i of open) if (state.cands[i] & bitOf(digit)) spots.add(i);
      }
      if (spots.size !== size) continue;
      let changed = false;
      for (const i of spots) {
        for (let digit = 1; digit <= 9; digit++) {
          if (!(mask & bitOf(digit))) changed = eliminate(state, i, digit) || changed;
        }
      }
      if (changed) return true;
    }
  }
  return false;
}

/** 박스 안에서 어떤 숫자의 자리가 한 줄에 몰려 있으면, 그 줄의 나머지에선 뺀다. */
function pointing(state) {
  for (const box of BOXES) {
    for (let digit = 1; digit <= 9; digit++) {
      const mask = bitOf(digit);
      const spots = box.filter((i) => !state.values[i] && (state.cands[i] & mask));
      if (spots.length < 2) continue;
      const sameRow = spots.every((i) => ((i / 9) | 0) === ((spots[0] / 9) | 0));
      const sameCol = spots.every((i) => i % 9 === spots[0] % 9);
      if (!sameRow && !sameCol) continue;
      const line = sameRow ? ROWS[(spots[0] / 9) | 0] : COLS[spots[0] % 9];
      let changed = false;
      for (const i of line) {
        if (box.includes(i) || state.values[i]) continue;
        changed = eliminate(state, i, digit) || changed;
      }
      if (changed) return true;
    }
  }
  return false;
}

/** 한 줄에서 어떤 숫자의 자리가 한 박스에 몰려 있으면, 그 박스의 나머지에선 뺀다. */
function claiming(state) {
  for (const line of LINES) {
    for (let digit = 1; digit <= 9; digit++) {
      const mask = bitOf(digit);
      const spots = line.filter((i) => !state.values[i] && (state.cands[i] & mask));
      if (spots.length < 2) continue;
      const boxOf = (i) => (((i / 9) | 0) / 3 | 0) * 3 + ((i % 9) / 3 | 0);
      if (!spots.every((i) => boxOf(i) === boxOf(spots[0]))) continue;
      let changed = false;
      for (const i of BOXES[boxOf(spots[0])]) {
        if (line.includes(i) || state.values[i]) continue;
        changed = eliminate(state, i, digit) || changed;
      }
      if (changed) return true;
    }
  }
  return false;
}

/** 두 줄에서 같은 숫자의 자리가 같은 두 칼럼 두 개뿐이면, 그 칼럼의 나머지에선 뺀다. */
function xWing(state) {
  for (const [lines, crossOf, crossLines] of [
    [ROWS, (i) => i % 9, COLS],
    [COLS, (i) => (i / 9) | 0, ROWS],
  ]) {
    for (let digit = 1; digit <= 9; digit++) {
      const mask = bitOf(digit);
      const spotsPerLine = lines.map((line) =>
        line.filter((i) => !state.values[i] && (state.cands[i] & mask)));
      for (let a = 0; a < 9; a++) {
        if (spotsPerLine[a].length !== 2) continue;
        for (let b = a + 1; b < 9; b++) {
          if (spotsPerLine[b].length !== 2) continue;
          const crossA = spotsPerLine[a].map(crossOf);
          const crossB = spotsPerLine[b].map(crossOf);
          if (crossA[0] !== crossB[0] || crossA[1] !== crossB[1]) continue;
          let changed = false;
          for (const cross of crossA) {
            for (const i of crossLines[cross]) {
              if (state.values[i]) continue;
              if (spotsPerLine[a].includes(i) || spotsPerLine[b].includes(i)) continue;
              changed = eliminate(state, i, digit) || changed;
            }
          }
          if (changed) return true;
        }
      }
    }
  }
  return false;
}

// 순서가 곧 난이도 등급이다. 앞쪽이 쉬운 기법이고, 채점은 "끝까지 푸는 데 필요했던
// 가장 어려운 기법"으로 한다.
const TECHNIQUES = [
  { name: 'nakedSingle', run: nakedSingle },
  { name: 'hiddenSingle', run: hiddenSingle },
  { name: 'pointing', run: pointing },
  { name: 'claiming', run: claiming },
  { name: 'nakedPair', run: (s) => nakedSubset(s, 2) },
  { name: 'hiddenPair', run: (s) => hiddenSubset(s, 2) },
  { name: 'nakedTriple', run: (s) => nakedSubset(s, 3) },
  { name: 'hiddenTriple', run: (s) => hiddenSubset(s, 3) },
  { name: 'xWing', run: xWing },
];

const TECHNIQUE_NAMES = TECHNIQUES.map((t) => t.name);

/**
 * 허용된 기법만으로 끝까지 풀어 본다. 매번 가장 쉬운 기법부터 다시 시도하므로,
 * 기록에 남는 기법은 그 단계에서 실제로 필요했던 최소한의 것이다.
 */
function solveLogically(puzzle, allowed = TECHNIQUE_NAMES) {
  const state = typeof puzzle === 'string' ? fromString(puzzle) : cloneState(puzzle);
  const techniques = TECHNIQUES.filter((t) => allowed.includes(t.name));
  const used = new Set();

  while (!state.broken) {
    let progressed = false;
    for (const technique of techniques) {
      if (!technique.run(state)) continue;
      used.add(technique.name);
      progressed = true;
      break;
    }
    if (!progressed) break;
  }

  return { solved: isComplete(state), broken: state.broken, used, state };
}

/** 끝까지 푸는 데 필요했던 가장 어려운 기법. 논리만으로 못 풀면 null. */
function hardestTechnique(puzzle, allowed = TECHNIQUE_NAMES) {
  const result = solveLogically(puzzle, allowed);
  if (!result.solved) return null;
  let hardest = null;
  for (const name of TECHNIQUE_NAMES) if (result.used.has(name)) hardest = name;
  return hardest;
}

/**
 * 해가 몇 개인지 최대 limit개까지 센다. 이쪽은 추측(분기 탐색)을 쓴다 — 사람이
 * 푸는 방법이 아니라 검증용이다.
 */
function countSolutions(puzzle, limit = 2) {
  const state = typeof puzzle === 'string' ? fromString(puzzle) : cloneState(puzzle);
  if (state.broken) return 0;
  let found = 0;

  const search = (current) => {
    if (found >= limit) return;
    let target = -1, best = 10;
    for (let i = 0; i < CELLS; i++) {
      if (current.values[i]) continue;
      const n = popcount(current.cands[i]);
      if (n === 0) return;
      if (n < best) { best = n; target = i; }
      if (n === 1) break;
    }
    if (target === -1) { found++; return; }
    for (let digit = 1; digit <= 9; digit++) {
      if (!(current.cands[target] & bitOf(digit))) continue;
      const next = cloneState(current);
      if (assign(next, target, digit)) search(next);
      if (found >= limit) return;
    }
  };

  search(state);
  return found;
}

const Solver = {
  CELLS, ALL, ROWS, COLS, BOXES, UNITS, PEERS,
  TECHNIQUES, TECHNIQUE_NAMES,
  emptyState, cloneState, fromString, toString, isComplete,
  assign, eliminate, popcount, bitOf, digitOf,
  solveLogically, hardestTechnique, countSolutions,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.SudokuSolver = Solver;

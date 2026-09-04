'use strict';

(function () {

// 판을 완전 탐색으로 푼다. Zip의 해밀턴 경로와 달리 여기서는 탐색 폭이 작다 —
// **행마다 왕관이 정확히 하나**라는 규칙이 곧 "행을 하나씩 내려가며 열을 고른다"는
// 탐색 순서를 주기 때문에, 9×9라도 가지가 9^9가 아니라 순열 근처까지 줄어든다.
// 그래서 zip처럼 예산을 두고 도중에 접을 필요가 없다.
//
// 인접 금지는 **바로 윗행하고만** 따지면 된다. 두 행이 2 이상 떨어져 있으면
// 세로 거리만으로 이미 안 닿는다.

function solve(puzzle, options = {}) {
  const limit = options.limit || 2;
  const size = puzzle.size;
  const regions = puzzle.regions;
  const solutions = [];
  const pick = new Int32Array(size);
  let count = 0;

  function row(r, usedCols, usedRegions, prevCol) {
    if (count >= limit) return;
    if (r === size) {
      count++;
      if (solutions.length < limit) solutions.push(Array.from(pick));
      return;
    }
    for (let c = 0; c < size; c++) {
      if (usedCols & (1 << c)) continue;
      if (prevCol >= 0 && Math.abs(c - prevCol) <= 1) continue;
      const region = regions[r * size + c];
      if (usedRegions & (1 << region)) continue;
      pick[r] = c;
      row(r + 1, usedCols | (1 << c), usedRegions | (1 << region), c);
      if (count >= limit) return;
    }
  }

  row(0, 0, 0, -1);
  return { count, solutions };
}

function unique(puzzle) {
  return solve(puzzle, { limit: 2 }).count === 1;
}

// 정답이 될 배치 하나를 무작위로 뽑는다. 영역이 아직 없으므로 열과 인접만 본다.
// 열 순서를 섞어서 훑기 때문에 같은 크기라도 매번 다른 배치가 나온다.
function randomArrangement(size, rng) {
  const pick = new Int32Array(size);
  const order = [];
  for (let c = 0; c < size; c++) order.push(c);

  function shuffled() {
    const list = order.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function row(r, usedCols, prevCol) {
    if (r === size) return true;
    for (const c of shuffled()) {
      if (usedCols & (1 << c)) continue;
      if (prevCol >= 0 && Math.abs(c - prevCol) <= 1) continue;
      pick[r] = c;
      if (row(r + 1, usedCols | (1 << c), c)) return true;
    }
    return false;
  }

  return row(0, 0, -1) ? Array.from(pick) : null;
}

// 사람이 쓰는 규칙만으로 푼다. 완전 탐색이 "답이 하나뿐인가"를 본다면 이쪽은
// "찍지 않고 풀리는가"를 본다 — 생성기가 이 판정을 통과한 판만 내보내므로
// 마지막에 두 칸을 놓고 찍어야 하는 판은 나오지 않는다.
//
// 화면의 힌트도 여기서 나온다. `order`는 이 풀이가 왕관을 확정한 순서라, 사람이
// 다음에 알아낼 수 있는 자리가 곧 그 순서의 앞쪽이다. 정답에서 아무 자리나
// 집어 주면 "왜 거기인지 알 수 없는 힌트"가 된다.
function logicSolve(puzzle) {
  const size = puzzle.size;
  const n = size * size;
  const regions = puzzle.regions;
  const cand = new Uint8Array(n).fill(1);
  const crowned = new Uint8Array(n);
  const done = { row: new Uint8Array(size), col: new Uint8Array(size), reg: new Uint8Array(size) };
  const order = [];

  const group = {
    row: (k) => { const a = []; for (let c = 0; c < size; c++) a.push(k * size + c); return a; },
    col: (k) => { const a = []; for (let r = 0; r < size; r++) a.push(r * size + k); return a; },
    reg: (k) => { const a = []; for (let i = 0; i < n; i++) if (regions[i] === k) a.push(i); return a; },
  };

  const open = (kind, k) => group[kind](k).filter((i) => cand[i] && !crowned[i]);

  function place(cell) {
    const r = Math.floor(cell / size);
    const c = cell % size;
    const g = regions[cell];
    crowned[cell] = 1;
    order.push(cell);
    done.row[r] = done.col[c] = done.reg[g] = 1;
    for (let i = 0; i < n; i++) {
      if (i === cell || !cand[i]) continue;
      const ri = Math.floor(i / size);
      const ci = i % size;
      if (ri === r || ci === c || regions[i] === g
        || (Math.abs(ri - r) <= 1 && Math.abs(ci - c) <= 1)) cand[i] = 0;
    }
  }

  let changed = true;
  while (changed && order.length < size) {
    changed = false;

    // 후보가 하나뿐인 행·열·영역. 사람이 가장 먼저 보는 자리다.
    for (const kind of ['row', 'col', 'reg']) {
      for (let k = 0; k < size; k++) {
        if (done[kind][k]) continue;
        const cells = open(kind, k);
        if (!cells.length) return { solved: false, order, dead: true };
        if (cells.length === 1) { place(cells[0]); changed = true; }
      }
    }
    if (changed) continue;

    // 줄과 영역이 서로를 가둘 때. 영역의 후보가 한 행에 몰려 있으면 그 행의
    // 왕관은 반드시 그 영역 안에 있으므로 행의 나머지를 지운다. 반대로 한 행의
    // 후보가 한 영역뿐이면 그 영역의 왕관도 그 행에 있어야 한다.
    for (let k = 0; k < size; k++) {
      if (!done.reg[k]) {
        const cells = open('reg', k);
        const rows = new Set(cells.map((i) => Math.floor(i / size)));
        const cols = new Set(cells.map((i) => i % size));
        if (rows.size === 1) {
          for (const i of group.row([...rows][0])) {
            if (cand[i] && regions[i] !== k) { cand[i] = 0; changed = true; }
          }
        }
        if (cols.size === 1) {
          for (const i of group.col([...cols][0])) {
            if (cand[i] && regions[i] !== k) { cand[i] = 0; changed = true; }
          }
        }
      }
      for (const kind of ['row', 'col']) {
        if (done[kind][k]) continue;
        const cells = open(kind, k);
        const regs = new Set(cells.map((i) => regions[i]));
        if (regs.size !== 1) continue;
        const keep = kind === 'row'
          ? (i) => Math.floor(i / size) === k
          : (i) => i % size === k;
        for (const i of group.reg([...regs][0])) {
          if (cand[i] && !keep(i)) { cand[i] = 0; changed = true; }
        }
      }
    }
  }

  return { solved: order.length === size, order };
}

const Solver = { solve, unique, randomArrangement, logicSolve };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.QueensSolver = Solver;

})();

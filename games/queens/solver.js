'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.QueensRules;

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

// --- 왕관이 둘인 판 ---
//
// 하나인 판의 함수는 그대로 두고 옆에 따로 둔다. 하나인 판은 비트 하나로 행을 고르는
// 빠른 길이 있고, 그 판들의 생성 결과(같은 씨앗 → 같은 판)를 흔들 이유가 없다.

const combosCache = new Map();

// 한 행에 놓을 수 있는 열 k개의 조합. 서로 붙은 열은 처음부터 뺀다.
function rowCombos(size, k) {
  const key = `${size}:${k}`;
  if (combosCache.has(key)) return combosCache.get(key);
  const out = [];
  const picked = [];
  (function rec(start) {
    if (picked.length === k) {
      out.push({ cols: picked.slice(), mask: picked.reduce((m, c) => m | (1 << c), 0) });
      return;
    }
    for (let c = start; c < size; c++) {
      if (picked.length && c - picked[picked.length - 1] <= 1) continue;
      picked.push(c);
      rec(c + 1);
      picked.pop();
    }
  })(0);
  combosCache.set(key, out);
  return out;
}

// 완전 탐색. 하나인 판처럼 행을 내려가며 고르되, 한 번에 열 k개의 조합을 고른다.
// 가지치기 둘이 없으면 10×10에서 멈춘 것처럼 느리다 — 영역은 마지막으로 걸친 행에서
// 다 찼는지 보고, 열은 남은 행으로 채울 수 있는지 본다(세로로 붙을 수 없으니 남은
// 행의 절반까지만 더 받는다).
function solveMulti(puzzle, options = {}) {
  const limit = options.limit || 2;
  const { size, regions } = puzzle;
  const k = puzzle.stars;
  const combos = rowCombos(size, k);
  const colCount = new Int32Array(size);
  const regCount = new Int32Array(size);
  const regLast = new Int32Array(size).fill(-1);
  for (let i = 0; i < size * size; i++) {
    regLast[regions[i]] = Math.max(regLast[regions[i]], Math.floor(i / size));
  }
  const solutions = [];
  const pick = [];
  let count = 0;

  function row(r, prevMask) {
    if (count >= limit) return;
    if (r === size) {
      count++;
      if (solutions.length < limit) solutions.push(pick.map((cols) => cols.slice()));
      return;
    }
    for (const combo of combos) {
      if (prevMask & (combo.mask | (combo.mask << 1) | (combo.mask >> 1))) continue;
      if (combo.cols.some((c) => colCount[c] >= k)) continue;
      for (const c of combo.cols) { colCount[c]++; regCount[regions[r * size + c]]++; }
      let fine = combo.cols.every((c) => regCount[regions[r * size + c]] <= k);
      for (let g = 0; g < size && fine; g++) if (regLast[g] === r && regCount[g] !== k) fine = false;
      const left = Math.ceil((size - 1 - r) / 2);
      for (let c = 0; c < size && fine; c++) if (k - colCount[c] > left) fine = false;
      if (fine) {
        pick[r] = combo.cols;
        row(r + 1, combo.mask);
      }
      for (const c of combo.cols) { colCount[c]--; regCount[regions[r * size + c]]--; }
      if (count >= limit) return;
    }
  }

  row(0, 0);
  return { count, solutions };
}

// 정답이 될 배치. 열마다 k개가 남은 행으로 채워지는 자리만 골라 내려간다. 되짚기가
// 길어지면 접고 처음부터 다시 뽑는 편이 빠르다.
function randomArrangementMulti(size, k, rng) {
  const combos = rowCombos(size, k);
  const colCount = new Int32Array(size);
  const pick = [];
  let steps = 0;

  function row(r, prevMask) {
    if (++steps > 20000) return false;
    if (r === size) return true;
    const order = combos.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const combo of order) {
      if (prevMask & (combo.mask | (combo.mask << 1) | (combo.mask >> 1))) continue;
      if (combo.cols.some((c) => colCount[c] >= k)) continue;
      for (const c of combo.cols) colCount[c]++;
      const left = Math.ceil((size - 1 - r) / 2);
      let fine = true;
      for (let c = 0; c < size && fine; c++) if (k - colCount[c] > left) fine = false;
      if (fine) {
        pick[r] = combo.cols;
        if (row(r + 1, combo.mask)) return true;
      }
      for (const c of combo.cols) colCount[c]--;
    }
    return false;
  }

  return row(0, 0) ? pick.map((cols) => cols.slice()) : null;
}

function combinations(list, j) {
  const out = [];
  const acc = [];
  (function rec(start) {
    if (acc.length === j) { out.push(acc.slice()); return; }
    for (let i = start; i < list.length; i++) { acc.push(list[i]); rec(i + 1); acc.pop(); }
  })(0);
  return out;
}

// 사람이 쓰는 규칙으로 푼다. 규칙은 넷이고, 앞의 것부터 본다.
//   1. 줄·영역이 다 찼으면 나머지를 지우고, 남은 후보가 필요한 수와 같으면 다 놓는다.
//   2. 둘이 더 필요한 줄에서, 어떤 칸에 놓으면 나머지 후보가 모두 그 칸과 닿는다면
//      그 칸은 아니다 — 둘째를 놓을 자리가 없다.
//   3. 가두기: 영역 몇 개의 후보가 그만큼의 왕관이 필요한 줄들 안에 다 들어 있으면,
//      그 줄들의 나머지 칸은 지운다. 줄과 영역을 바꿔도 같다. 하나인 판의 "영역이 한
//      행에 몰렸다"를 여러 개로 넓힌 것이고, 셋까지 묶는다.
//   4. 가정: 한 칸에 놓아 보고 1~3을 돌려 모순이 나면 그 칸은 아니다.
// 둘인 판은 1~3만으로는 거의 끝나지 않는다(시험한 서른 판 중 한 판도). 4까지 쓰면
// 8×8은 열에 아홉, 10×10은 절반쯤 풀린다.
const MAX_GROUP = 3;

function logicSolveMulti(puzzle) {
  const { size, regions } = puzzle;
  const k = puzzle.stars;
  const n = size * size;
  const units = [];
  for (let r = 0; r < size; r++) units.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) units.push(Array.from({ length: size }, (_, r) => r * size + c));
  for (let g = 0; g < size; g++) {
    const cells = [];
    for (let i = 0; i < n; i++) if (regions[i] === g) cells.push(i);
    units.push(cells);
  }
  const rows = units.slice(0, size);
  const cols = units.slice(size, 2 * size);
  const regs = units.slice(2 * size);
  const rowOf = (i) => Math.floor(i / size);
  const colOf = (i) => i % size;
  const regOf = (i) => regions[i];
  // 가두기의 네 방향: [묶는 쪽, 받는 쪽, 칸 → 받는 쪽 번호]
  const pens = [[regs, rows, rowOf], [regs, cols, colOf], [rows, regs, regOf], [cols, regs, regOf]];

  function place(st, cell) {
    if (!st.cand[cell]) return false;
    st.star[cell] = 1;
    st.cand[cell] = 0;
    st.count++;
    if (st.order) st.order.push(cell);
    const r = rowOf(cell);
    const c = colOf(cell);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < size && cc < size) st.cand[rr * size + cc] = 0;
      }
    }
    return true;
  }

  const need = (st, unit) => k - unit.reduce((s, i) => s + st.star[i], 0);
  const open = (st, unit) => unit.filter((i) => st.cand[i]);

  // 규칙 1~3을 더 나올 것이 없을 때까지. 모순이면 false.
  function settle(st) {
    for (;;) {
      let changed = false;
      for (const unit of units) {
        const nd = need(st, unit);
        const op = open(st, unit);
        if (nd < 0 || op.length < nd) return false;
        if (nd === 0 && op.length) {
          for (const i of op) st.cand[i] = 0;
          changed = true;
        } else if (nd > 0 && op.length === nd) {
          for (const i of op) if (!place(st, i)) return false;
          changed = true;
        } else if (nd >= 2) {
          for (const i of op) {
            const apart = op.filter((j) => j !== i && !R.adjacent(size, i, j)).length;
            if (apart < nd - 1) { st.cand[i] = 0; changed = true; }
          }
        }
      }
      if (changed) continue;

      for (const [from, to, key] of pens) {
        const live = from.filter((unit) => need(st, unit) > 0);
        for (let j = 1; j <= Math.min(MAX_GROUP, live.length) && !changed; j++) {
          for (const group of combinations(live, j)) {
            const cells = group.flatMap((unit) => open(st, unit));
            const targets = [...new Set(cells.map(key))].map((x) => to[x]);
            const wanted = group.reduce((s, unit) => s + need(st, unit), 0);
            const room = targets.reduce((s, unit) => s + need(st, unit), 0);
            if (wanted > room) return false;
            if (wanted !== room) continue;
            const inside = new Set(cells);
            for (const unit of targets) {
              for (const i of open(st, unit)) if (!inside.has(i)) { st.cand[i] = 0; changed = true; }
            }
            if (changed) break;
          }
        }
        if (changed) break;
      }
      if (!changed) return true;
    }
  }

  const st = { cand: new Uint8Array(n).fill(1), star: new Uint8Array(n), count: 0, order: [] };
  let trials = 0;
  for (;;) {
    if (!settle(st)) return { solved: false, order: st.order, trials, dead: true };
    if (st.count === size * k) break;
    let cut = false;
    for (let i = 0; i < n && !cut; i++) {
      if (!st.cand[i]) continue;
      const copy = { cand: st.cand.slice(), star: st.star.slice(), count: st.count, order: null };
      if (!place(copy, i) || !settle(copy)) {
        st.cand[i] = 0;
        trials++;
        cut = true;
      }
    }
    if (!cut) break;
  }
  return { solved: st.count === size * k, order: st.order, trials };
}

const Solver = {
  solve: (puzzle, options) => ((puzzle.stars || 1) > 1 ? solveMulti(puzzle, options) : solve(puzzle, options)),
  unique: (puzzle) => ((puzzle.stars || 1) > 1 ? solveMulti(puzzle, { limit: 2 }).count === 1 : unique(puzzle)),
  randomArrangement,
  logicSolve: (puzzle) => ((puzzle.stars || 1) > 1 ? logicSolveMulti(puzzle) : logicSolve(puzzle)),
  rowCombos, solveMulti, randomArrangementMulti, logicSolveMulti, MAX_GROUP,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.QueensSolver = Solver;

})();

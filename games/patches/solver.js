'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.PatchesRules;

// 판을 완전 탐색으로 푼다. 탐색 순서는 "아직 안 덮인 칸 하나를 골라 그 칸을 덮을
// 수 있는 조각을 다 시도한다"이다. 어느 칸이든 반드시 무엇인가에 덮여야 하므로
// 이 선택은 해를 빠뜨리지 않는다.
//
// 두 가지로 좁힌다. **단서마다 놓일 수 있는 직사각형을 미리 다 구해 둔다** —
// 칸 수와 모양이 정해진 단서는 후보가 몇 개뿐이라 여기서 대부분이 걸러진다.
// 그리고 **후보가 가장 적은 칸부터 고른다** — 후보가 하나뿐인 칸이 있으면 거기가
// 곧 확정이고, 하나도 없는 칸이 있으면 그 가지는 그 자리에서 접힌다.

function rectsForClue(size, clueAt, index, clue) {
  const cr = Math.floor(clue.cell / size);
  const cc = clue.cell % size;
  const out = [];
  for (let r = 0; r <= cr; r++) {
    for (let h = cr - r + 1; r + h <= size; h++) {
      for (let c = 0; c <= cc; c++) {
        for (let w = cc - c + 1; c + w <= size; w++) {
          if (clue.area !== null && w * h !== clue.area) continue;
          if (clue.shape !== null && R.shapeOf(w, h) !== clue.shape) continue;
          let alone = true;
          for (let y = r; y < r + h && alone; y++) {
            for (let x = c; x < c + w; x++) {
              const at = clueAt[y * size + x];
              if (at !== -1 && at !== index) { alone = false; break; }
            }
          }
          if (alone) out.push({ r, c, w, h });
        }
      }
    }
  }
  return out;
}

function prepare(puzzle) {
  const size = puzzle.size;
  const n = size * size;
  const clueAt = new Int32Array(n).fill(-1);
  puzzle.clues.forEach((clue, i) => { clueAt[clue.cell] = i; });

  const rects = puzzle.clues.map((clue, i) => rectsForClue(size, clueAt, i, clue));
  // 조각이 덮는 칸을 미리 펼쳐 둔다. 겹치는지 보는 일이 탐색의 안쪽 고리다.
  const spans = rects.map((list) => list.map((rect) => R.cells(size, rect)));

  const byCell = Array.from({ length: n }, () => []);
  spans.forEach((list, ci) => {
    list.forEach((span, ri) => {
      for (const cell of span) byCell[cell].push([ci, ri]);
    });
  });

  return { size, n, rects, spans, byCell };
}

function solve(puzzle, options = {}) {
  const limit = options.limit || 2;
  const { n, rects, spans, byCell } = prepare(puzzle);
  const count = puzzle.clues.length;
  const cover = new Int32Array(n).fill(-1);
  const used = new Uint8Array(count);
  const chosen = new Array(count);
  const solutions = [];
  let found = 0;

  function open(span) {
    for (const cell of span) if (cover[cell] !== -1) return false;
    return true;
  }

  function step(covered) {
    if (found >= limit) return;
    if (covered === n) {
      found++;
      if (solutions.length < limit) solutions.push(chosen.map((rect) => ({ ...rect })));
      return;
    }

    let bestList = null;
    for (let cell = 0; cell < n; cell++) {
      if (cover[cell] !== -1) continue;
      const list = byCell[cell].filter(([ci, ri]) => !used[ci] && open(spans[ci][ri]));
      if (!list.length) return;
      if (!bestList || list.length < bestList.length) bestList = list;
      if (list.length === 1) break;
    }

    for (const [ci, ri] of bestList) {
      const span = spans[ci][ri];
      if (!open(span)) continue;
      used[ci] = 1;
      chosen[ci] = rects[ci][ri];
      for (const cell of span) cover[cell] = ci;
      step(covered + span.length);
      for (const cell of span) cover[cell] = -1;
      used[ci] = 0;
      if (found >= limit) return;
    }
  }

  step(0);
  return { count: found, solutions };
}

function unique(puzzle) {
  return solve(puzzle, { limit: 2 }).count === 1;
}

// 사람이 쓰는 규칙만으로 푼다. 완전 탐색이 "답이 하나뿐인가"를 본다면 이쪽은
// "찍지 않고 풀리는가"를 본다 — 생성기가 이 판정을 통과한 판만 내보내므로 마지막에
// 두 자리를 놓고 찍어야 하는 판은 나오지 않는다.
//
// 화면의 힌트도 여기서 나온다. `order`는 이 풀이가 조각을 확정한 순서라, 사람이
// 다음에 알아낼 수 있는 조각이 곧 그 순서의 앞쪽이다.
//
// 쓰는 규칙은 넷이고 모두 시카쿠를 손으로 풀 때 쓰는 것들이다.
//   - 어떤 칸을 덮을 수 있는 조각이 하나뿐이면 그 조각이 답이다
//   - 어떤 단서가 가질 수 있는 조각이 하나뿐이면 그 조각이 답이다
//   - 어떤 칸을 덮을 수 있는 조각이 전부 한 단서의 것이면 그 칸은 그 단서 차지다
//   - 한 단서의 남은 조각이 모두 덮는 칸도 그 단서 차지다
// 뒤의 둘은 조각을 놓지는 않지만 남의 후보를 지워, 앞의 둘이 걸리게 만든다.
function logicSolve(puzzle) {
  const { n, rects, spans } = prepare(puzzle);
  const count = puzzle.clues.length;
  const cover = new Int32Array(n).fill(-1);
  const owned = new Int32Array(n).fill(-1);
  const placed = new Uint8Array(count);
  const order = [];

  puzzle.clues.forEach((clue, i) => { owned[clue.cell] = i; });

  let alive = spans.map((list) => list.map((_, ri) => ri));

  const usable = (ci, ri) => spans[ci][ri].every((cell) =>
    cover[cell] === -1 && (owned[cell] === -1 || owned[cell] === ci));

  function put(ci, ri) {
    for (const cell of spans[ci][ri]) { cover[cell] = ci; owned[cell] = ci; }
    placed[ci] = 1;
    order.push(rects[ci][ri]);
  }

  let changed = true;
  while (changed && order.length < count) {
    changed = false;
    for (let ci = 0; ci < count; ci++) {
      if (!placed[ci]) alive[ci] = alive[ci].filter((ri) => usable(ci, ri));
    }

    for (let ci = 0; ci < count; ci++) {
      if (placed[ci]) continue;
      if (!alive[ci].length) return { solved: false, order, dead: true };
      if (alive[ci].length === 1) { put(ci, alive[ci][0]); changed = true; }
    }
    if (changed) continue;

    // 칸마다 그 칸을 덮을 수 있는 후보를 모은다.
    const byCellNow = Array.from({ length: n }, () => []);
    for (let ci = 0; ci < count; ci++) {
      if (placed[ci]) continue;
      for (const ri of alive[ci]) {
        for (const cell of spans[ci][ri]) byCellNow[cell].push([ci, ri]);
      }
    }

    for (let cell = 0; cell < n; cell++) {
      if (cover[cell] !== -1) continue;
      const list = byCellNow[cell];
      if (!list.length) return { solved: false, order, dead: true };
      if (list.length === 1) { put(list[0][0], list[0][1]); changed = true; continue; }
      const owners = new Set(list.map(([ci]) => ci));
      if (owners.size === 1 && owned[cell] === -1) {
        owned[cell] = [...owners][0];
        changed = true;
      }
    }
    if (changed) continue;

    // 한 단서의 남은 조각이 모두 덮는 칸.
    for (let ci = 0; ci < count; ci++) {
      if (placed[ci] || !alive[ci].length) continue;
      const shared = spans[ci][alive[ci][0]].filter((cell) =>
        alive[ci].every((ri) => spans[ci][ri].includes(cell)));
      for (const cell of shared) {
        if (owned[cell] === -1) { owned[cell] = ci; changed = true; }
      }
    }
  }

  return { solved: order.length === count, order };
}

const Solver = { rectsForClue, prepare, solve, unique, logicSolve };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.PatchesSolver = Solver;

})();

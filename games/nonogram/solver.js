'use strict';

// 풀이기. 사람이 푸는 수순 — **한 줄만 보고 확실한 칸을 채우기** — 를 그대로 쓴다.
// 그래서 같은 코드가 "찍지 않고 논리로 풀리는가"의 판정도 된다(`logicSolve`).
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.NonoRules;

// 이 줄에서 힌트를 만족하는 모든 배치를 훑어, **어느 배치에서나 칠해지는 칸**과
// **어느 배치에서나 비는 칸**만 가려낸다. 배치를 다 만들어 두지 않고 훑으면서 표시만
// 모으므로 열다섯 칸짜리 줄도 한순간에 끝난다.
function narrow(clues, known) {
  const len = known.length;
  const canFill = new Array(len).fill(false);
  const canEmpty = new Array(len).fill(false);
  let found = 0;

  const line = new Array(len).fill(R.EMPTY);
  const blocks = clues[0] === 0 ? [] : clues;

  // at: 지금 채우기 시작할 자리, bi: 놓을 덩어리 번호
  function walk(at, bi) {
    if (bi === blocks.length) {
      for (let i = at; i < len; i++) {
        if (known[i] === R.FILL) return;
        line[i] = R.EMPTY;
      }
      found++;
      for (let i = 0; i < len; i++) {
        if (line[i] === R.FILL) canFill[i] = true;
        else canEmpty[i] = true;
      }
      return;
    }

    const size = blocks[bi];
    const rest = blocks.slice(bi + 1).reduce((n, b) => n + b + 1, 0);
    for (let start = at; start + size + rest <= len; start++) {
      // 덩어리 앞은 비어 있어야 한다.
      let ok = true;
      for (let i = at; i < start; i++) {
        if (known[i] === R.FILL) { ok = false; break; }
        line[i] = R.EMPTY;
      }
      if (!ok) break;   // 칠해진 칸을 지나쳤으면 더 뒤로 갈 수 없다
      for (let i = start; i < start + size; i++) {
        if (known[i] === R.MARK) { ok = false; break; }
        line[i] = R.FILL;
      }
      if (!ok) continue;
      // 덩어리 뒤에는 한 칸을 띄운다.
      const after = start + size;
      if (after < len) {
        if (known[after] === R.FILL) continue;
        line[after] = R.EMPTY;
      }
      walk(after + 1, bi + 1);
    }
  }

  walk(0, 0);
  if (!found) return null;

  const out = known.slice();
  for (let i = 0; i < len; i++) {
    if (canFill[i] && !canEmpty[i]) out[i] = R.FILL;
    else if (canEmpty[i] && !canFill[i]) out[i] = R.MARK;
  }
  return out;
}

function setRow(cells, w, r, line) {
  for (let c = 0; c < w; c++) cells[r * w + c] = line[c];
}

function setCol(cells, w, h, c, line) {
  for (let r = 0; r < h; r++) cells[r * w + c] = line[r];
}

// 줄 좁히기를 더 나아가지 않을 때까지 되풀이한다. 다 채워지면 논리만으로 풀린 판이다.
function logicSolve(puzzle, from) {
  const cells = from ? from.slice() : R.newState(puzzle);
  let moved = true;
  while (moved) {
    moved = false;
    for (let r = 0; r < puzzle.h; r++) {
      const before = R.rowOf(cells, puzzle.w, r);
      const after = narrow(puzzle.rows[r], before);
      if (!after) return null;
      if (after.some((n, i) => n !== before[i])) { setRow(cells, puzzle.w, r, after); moved = true; }
    }
    for (let c = 0; c < puzzle.w; c++) {
      const before = R.colOf(cells, puzzle.w, puzzle.h, c);
      const after = narrow(puzzle.cols[c], before);
      if (!after) return null;
      if (after.some((n, i) => n !== before[i])) { setCol(cells, puzzle.w, puzzle.h, c, after); moved = true; }
      moved = moved || false;
    }
  }
  return cells;
}

const solved = (puzzle, cells) => cells && cells.every((n) => n !== R.EMPTY);

// 논리만으로 끝까지 풀리는가. **여기를 통과한 판은 답도 하나뿐이다** — 줄 좁히기는
// 모든 답에 공통인 칸만 채우므로, 전부 채워졌다면 답이 갈릴 자리가 없었다는 뜻이다.
function logicOnly(puzzle) {
  return solved(puzzle, logicSolve(puzzle));
}

// 힌트 한 칸. 사람이 지금까지 채운 것에서 이어서 좁혀, 아직 모르는 칸 하나를 알려 준다.
function nextCell(puzzle, cells) {
  // 사람이 잘못 칠한 칸이 섞여 있으면 좁히기가 막힌다. 아는 것만 넘긴다.
  const known = cells.map((n, i) => (n !== R.EMPTY && n !== (puzzle.answer[i] ? R.FILL : R.MARK)
    ? R.EMPTY : n));
  const after = logicSolve(puzzle, known);
  if (!after) return null;
  for (let i = 0; i < after.length; i++) {
    if (cells[i] === R.EMPTY && after[i] !== R.EMPTY) return { at: i, state: after[i] };
  }
  // 좁히기가 더 못 나가면 정답에서 한 칸 집는다(있어서는 안 되지만 막히지는 않게).
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === R.EMPTY) return { at: i, state: puzzle.answer[i] ? R.FILL : R.MARK };
  }
  return null;
}

const Solver = { narrow, logicSolve, logicOnly, nextCell };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.NonoSolver = Solver;

})();

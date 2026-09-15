'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.TangoRules;

// 푸는 쪽은 둘이다.
//
// `solve`는 완전 탐색이다. 답이 몇 개인지 세는 것이 일이라 사람이 쓰지 않는
// 방법까지 쓴다. 테스트에서 대조용으로만 쓴다.
//
// `logicSolve`는 **사람이 쓰는 규칙만** 쓴다. 생성기가 판을 내보낼지 말지 이걸로
// 가른다. 답이 하나뿐인 판 중에도 마지막에 두 자리를 놓고 찍어야 하는 것이 섞여
// 있어서, 유일해만 보고 내보내면 찍는 판이 나온다.

function fits(b, marks, cell, value) {
  const size = b.size;
  const half = size / 2;
  const r = Math.floor(cell / size);
  const c = cell % size;

  // 이 칸은 아직 비어 있으므로 세어 둔 것에 한 개를 더한 값이 놓았을 때의 수다.
  let sameRow = 0;
  for (let x = 0; x < size; x++) if (marks[r * size + x] === value) sameRow++;
  if (sameRow + 1 > half) return false;
  let sameCol = 0;
  for (let y = 0; y < size; y++) if (marks[y * size + c] === value) sameCol++;
  if (sameCol + 1 > half) return false;

  // 앞으로 채울 칸은 아직 비어 있으므로 뒤쪽만 본다. 셋이 모이는 순간은 언제나
  // 그 셋 중 마지막 칸을 놓을 때다.
  if (c >= 2 && marks[cell - 1] === value && marks[cell - 2] === value) return false;
  if (r >= 2 && marks[cell - size] === value && marks[cell - size * 2] === value) return false;

  for (const at of b.linksAt[cell]) {
    const link = b.links[at];
    const mate = link.a === cell ? link.b : link.a;
    const held = marks[mate];
    if (held === R.EMPTY) continue;
    if ((held === value) !== link.same) return false;
  }
  return true;
}

function solve(puzzle, options = {}) {
  const limit = options.limit || 2;
  const b = R.board(puzzle);
  const marks = Uint8Array.from(b.given);
  const found = [];

  function walk(cell) {
    if (found.length >= limit) return;
    if (cell >= b.n) { found.push(Array.from(marks)); return; }
    // **미리 놓인 칸도 확인한다.** 그냥 건너뛰면 그 칸이 마지막에 오는 셋 연달아를
    // 아무도 보지 않는다 — 규칙을 어긴 배치를 답으로 세다가 유일해 판정이
    // 어긋났다.
    const fixed = b.given[cell];
    if (fixed !== R.EMPTY) {
      marks[cell] = R.EMPTY;
      const ok = fits(b, marks, cell, fixed);
      marks[cell] = fixed;
      if (ok) walk(cell + 1);
      return;
    }
    for (const value of [R.SUN, R.MOON]) {
      if (!fits(b, marks, cell, value)) continue;
      marks[cell] = value;
      walk(cell + 1);
      marks[cell] = R.EMPTY;
      if (found.length >= limit) return;
    }
  }

  walk(0);
  return { count: found.length, solutions: found };
}

// 한 줄에 들어갈 수 있는 배치를 모두 세운다. 여섯 칸이면 스무 가지 남짓이라
// 사람도 종이에 적어 볼 수 있는 양이다 — 그래서 이것도 사람 규칙으로 친다.
function lineOptions(b, marks, cells) {
  const size = b.size;
  const half = size / 2;
  // 이 줄 안에서 양 끝이 다 잡히는 링크만 쓸 수 있다. 줄을 가로지르는 링크는
  // 한쪽 끝이 밖에 있어 이 줄만 보고는 판단할 수 없다.
  const at = new Map();
  cells.forEach((cell, i) => at.set(cell, i));
  const inside = [];
  for (const link of b.links) {
    if (at.has(link.a) && at.has(link.b)) inside.push([at.get(link.a), at.get(link.b), link.same]);
  }

  const out = [];
  const draft = new Array(size);
  function walk(i, suns, moons) {
    if (suns > half || moons > half) return;
    if (i === size) { out.push(draft.slice()); return; }
    for (const value of [R.SUN, R.MOON]) {
      const placed = marks[cells[i]];
      if (placed !== R.EMPTY && placed !== value) continue;
      if (i >= 2 && draft[i - 1] === value && draft[i - 2] === value) continue;
      let ok = true;
      for (const [x, y, same] of inside) {
        if (x !== i && y !== i) continue;
        const mate = x === i ? y : x;
        if (mate > i) continue;
        if ((draft[mate] === value) !== same) { ok = false; break; }
      }
      if (!ok) continue;
      draft[i] = value;
      walk(i + 1, suns + (value === R.SUN ? 1 : 0), moons + (value === R.MOON ? 1 : 0));
    }
  }
  walk(0, 0, 0);
  return out;
}

function logicSolve(puzzle) {
  const b = R.board(puzzle);
  const marks = Uint8Array.from(b.given);
  const size = b.size;
  const half = size / 2;
  // 미리 놓인 칸은 순서에 넣지 않는다. 힌트는 **사람이 다음으로 알아낼 수 있는
  // 칸**을 짚어야 하고, 처음부터 놓여 있던 칸은 알아낼 것이 없다.
  const order = [];
  let broken = false;

  function put(cell, value) {
    if (marks[cell] === value) return false;
    if (marks[cell] !== R.EMPTY) { broken = true; return false; }
    marks[cell] = value;
    order.push(cell);
    return true;
  }

  // ① 묶인 칸: 한쪽이 정해지면 다른 쪽도 정해진다.
  function byLinks() {
    let moved = false;
    for (const link of b.links) {
      const a = marks[link.a];
      const c = marks[link.b];
      if (a === R.EMPTY && c === R.EMPTY) continue;
      if (a !== R.EMPTY && c === R.EMPTY) moved = put(link.b, link.same ? a : R.other(a)) || moved;
      else if (c !== R.EMPTY && a === R.EMPTY) moved = put(link.a, link.same ? c : R.other(c)) || moved;
    }
    return moved;
  }

  // ② 셋 연달아 금지: 같은 것 둘 옆, 같은 것 둘 사이.
  function byTriple() {
    let moved = false;
    for (let line = 0; line < R.lineCount(size); line++) {
      const cells = R.lineCells(size, line);
      for (let i = 0; i + 2 < size; i++) {
        const v = [marks[cells[i]], marks[cells[i + 1]], marks[cells[i + 2]]];
        const empties = v.filter((x) => x === R.EMPTY).length;
        if (empties !== 1) continue;
        const known = v.filter((x) => x !== R.EMPTY);
        if (known[0] !== known[1]) continue;
        const at = v.indexOf(R.EMPTY);
        moved = put(cells[i + at], R.other(known[0])) || moved;
      }
    }
    return moved;
  }

  // ③ 반씩: 한쪽이 절반을 채우면 남은 칸은 전부 반대다.
  function byBalance() {
    let moved = false;
    for (let line = 0; line < R.lineCount(size); line++) {
      const cells = R.lineCells(size, line);
      let suns = 0;
      let moons = 0;
      for (const cell of cells) {
        if (marks[cell] === R.SUN) suns++;
        else if (marks[cell] === R.MOON) moons++;
      }
      if (suns !== half && moons !== half) continue;
      const rest = suns === half ? R.MOON : R.SUN;
      for (const cell of cells) if (marks[cell] === R.EMPTY) moved = put(cell, rest) || moved;
    }
    return moved;
  }

  // ④ 줄을 통째로 따져 본다. 위의 셋으로 더 갈 수 없을 때만 쓴다 — 쉬운 규칙을
  //    먼저 써야 힌트가 짚는 순서도 사람이 밟는 순서에 가까워진다.
  function byLineScan() {
    let moved = false;
    for (let line = 0; line < R.lineCount(size); line++) {
      const cells = R.lineCells(size, line);
      const options = lineOptions(b, marks, cells);
      if (options.length === 0) { broken = true; return false; }
      for (let i = 0; i < size; i++) {
        if (marks[cells[i]] !== R.EMPTY) continue;
        const first = options[0][i];
        if (options.every((option) => option[i] === first)) moved = put(cells[i], first) || moved;
      }
    }
    return moved;
  }

  for (;;) {
    if (broken) break;
    if (byLinks()) continue;
    if (byTriple()) continue;
    if (byBalance()) continue;
    if (byLineScan()) continue;
    break;
  }

  const state = { marks };
  const solved = !broken && R.filled(b, state) && R.conflicts(b, state).size === 0;
  return { solved, marks: Array.from(marks), order };
}

const Solver = { solve, logicSolve, lineOptions };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.TangoSolver = Solver;

})();

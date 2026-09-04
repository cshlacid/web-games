'use strict';

// 브라우저에서 클래식 스크립트는 전역 렉시컬 스코프를 공유한다. 파일마다 최상위에
// 같은 이름을 두면 충돌해 페이지가 통째로 죽으므로 파일을 IIFE로 가둔다.
(function () {

// Queens의 규칙 모델. 판 하나는
//   { size, regions: [칸마다 영역 번호 0..size-1], solution: [행마다 왕관의 열] }
// 이고, 푸는 것은 행·열·영역마다 왕관을 정확히 하나씩, 서로 닿지 않게 놓는 일이다.
// 칸은 r * size + c 로 번호를 매긴다.
//
// 칸의 상태는 셋이다. X는 사람이 직접 찍는 배제 표시일 뿐 판정에 쓰이지 않는다 —
// 원작과 같다. X를 규칙에 넣으면 "메모를 잘못 찍어서 못 푸는 판"이 생긴다.
const EMPTY = 0;
const MARK = 1;
const CROWN = 2;

function board(puzzle) {
  const size = puzzle.size;
  const n = size * size;
  const regions = Int32Array.from(puzzle.regions);
  const regionCells = Array.from({ length: size }, () => []);
  for (let cell = 0; cell < n; cell++) regionCells[regions[cell]].push(cell);
  return { size, n, regions, regionCells, solution: puzzle.solution };
}

function newState(b) {
  return { marks: new Uint8Array(b.n), crowns: 0 };
}

function reset(b, state) {
  state.marks.fill(EMPTY);
  state.crowns = 0;
  return state;
}

function set(b, state, cell, value) {
  const before = state.marks[cell];
  if (before === value) return before;
  if (before === CROWN) state.crowns--;
  if (value === CROWN) state.crowns++;
  state.marks[cell] = value;
  return before;
}

// 빈칸 → X → 왕관 → 빈칸. 원작의 순환이다.
function cycle(b, state, cell) {
  const next = (state.marks[cell] + 1) % 3;
  set(b, state, cell, next);
  return next;
}

function adjacent(size, a, b2) {
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b2 / size));
  const dc = Math.abs((a % size) - (b2 % size));
  return dr <= 1 && dc <= 1;
}

// 규칙을 어기고 있는 왕관들. 어느 왕관이 잘못됐는지 가릴 수 없으므로 충돌에
// 관여한 쪽을 모두 돌려준다 — 화면은 이걸 그대로 붉게 칠한다.
function conflicts(b, state) {
  const size = b.size;
  const placed = [];
  for (let cell = 0; cell < b.n; cell++) {
    if (state.marks[cell] === CROWN) placed.push(cell);
  }
  const bad = new Set();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const c = placed[j];
      const sameRow = Math.floor(a / size) === Math.floor(c / size);
      const sameCol = a % size === c % size;
      const sameRegion = b.regions[a] === b.regions[c];
      if (sameRow || sameCol || sameRegion || adjacent(size, a, c)) {
        bad.add(a);
        bad.add(c);
      }
    }
  }
  return [...bad].sort((x, y) => x - y);
}

// 왕관이 size개이고 충돌이 없으면 행·열·영역마다 정확히 하나씩이다 — 비둘기집이라
// 따로 셀 필요가 없다.
function isDone(b, state) {
  return state.crowns === b.size && conflicts(b, state).length === 0;
}

// 왕관 자리 목록 하나를 통째로 검사한다. 화면 밖(테스트·솔버 검증)에서 쓴다.
function validate(puzzle, cells) {
  const b = board(puzzle);
  const state = reset(b, newState(b));
  for (const cell of cells) set(b, state, cell, CROWN);
  return { bad: conflicts(b, state), done: isDone(b, state) };
}

// 영역 하나가 끊기지 않고 이어져 있는가. 끊긴 영역은 원작에 없고, 화면에서
// 영역 경계를 그으면 같은 색 덩어리가 둘로 보여 판이 잘못된 것처럼 읽힌다.
function connected(size, cells) {
  if (!cells.length) return false;
  const inSet = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const cell = stack.pop();
    const r = Math.floor(cell / size);
    const c = cell % size;
    const near = [];
    if (r > 0) near.push(cell - size);
    if (r < size - 1) near.push(cell + size);
    if (c > 0) near.push(cell - 1);
    if (c < size - 1) near.push(cell + 1);
    for (const other of near) {
      if (inSet.has(other) && !seen.has(other)) { seen.add(other); stack.push(other); }
    }
  }
  return seen.size === cells.length;
}

// 판이 규칙을 담을 수 있는 모양인지. 생성기가 뱉은 것을 테스트에서 거른다.
function wellFormed(puzzle) {
  const size = puzzle.size;
  const n = size * size;
  if (!Array.isArray(puzzle.regions) && !ArrayBuffer.isView(puzzle.regions)) return false;
  if (puzzle.regions.length !== n) return false;
  const cells = Array.from({ length: size }, () => []);
  for (let cell = 0; cell < n; cell++) {
    const id = puzzle.regions[cell];
    if (!Number.isInteger(id) || id < 0 || id >= size) return false;
    cells[id].push(cell);
  }
  return cells.every((group) => connected(size, group));
}

const Rules = {
  EMPTY, MARK, CROWN,
  board, newState, reset, set, cycle, adjacent, conflicts, isDone, validate,
  connected, wellFormed,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.QueensRules = Rules;

})();

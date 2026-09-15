'use strict';

// 브라우저에서 클래식 스크립트는 전역 렉시컬 스코프를 공유한다. 파일마다 최상위에
// 같은 이름을 두면 충돌해 페이지가 통째로 죽으므로 파일을 IIFE로 가둔다.
(function () {

// Tango의 규칙 모델. 판 하나는
//   { size, given: [{cell, value}], links: [{a, b, same}], solution: [칸마다 해/달] }
// 이고, 푸는 것은 모든 칸을 해나 달로 채우되
//   ① 한 줄에 해와 달이 반씩,
//   ② 같은 것이 셋 연달아 오지 않게,
//   ③ `=`로 묶인 두 칸은 같게, `×`로 묶인 두 칸은 다르게
// 놓는 일이다. 칸은 r * size + c 로 번호를 매긴다.
//
// **링크는 이웃한 두 칸 사이에만 놓인다.** 가로로 붙었거나 세로로 붙은 짝이다.
// 판을 그릴 때 두 칸 사이의 금에 표시를 그리므로 떨어진 짝은 그릴 자리가 없다.
const EMPTY = 0;
const SUN = 1;
const MOON = 2;

function other(value) { return value === SUN ? MOON : SUN; }

function board(puzzle) {
  const size = puzzle.size;
  const n = size * size;
  const given = new Uint8Array(n);
  for (const spot of puzzle.given) given[spot.cell] = spot.value;
  // 칸 하나가 걸린 링크를 바로 찾을 수 있어야 한다. 솔버가 칸을 확정할 때마다
  // 그 칸에 걸린 링크를 전부 훑기 때문이다.
  const linksAt = Array.from({ length: n }, () => []);
  puzzle.links.forEach((link, i) => {
    linksAt[link.a].push(i);
    linksAt[link.b].push(i);
  });
  return { size, n, given, links: puzzle.links, linksAt, solution: puzzle.solution };
}

function newState(b) {
  return reset(b, { marks: new Uint8Array(b.n) });
}

// 미리 놓인 칸은 지워지지 않는다. 비우는 것은 사람이 놓은 것까지다.
function reset(b, state) {
  state.marks.set(b.given);
  return state;
}

function locked(b, cell) { return b.given[cell] !== EMPTY; }

function set(b, state, cell, value) {
  if (locked(b, cell)) return state.marks[cell];
  const before = state.marks[cell];
  state.marks[cell] = value;
  return before;
}

// 빈칸 → 해 → 달 → 빈칸. 원작의 순환이다.
function cycle(b, state, cell) {
  if (locked(b, cell)) return state.marks[cell];
  const next = (state.marks[cell] + 1) % 3;
  set(b, state, cell, next);
  return next;
}

// 줄은 행 size개 다음에 열 size개다. 행과 열에 같은 규칙이 걸리므로 둘을 한
// 번호로 묶어 두면 규칙을 한 번만 쓰면 된다.
function lineCells(size, index) {
  const out = [];
  if (index < size) {
    for (let c = 0; c < size; c++) out.push(index * size + c);
  } else {
    const c = index - size;
    for (let r = 0; r < size; r++) out.push(r * size + c);
  }
  return out;
}

function lineCount(size) { return size * 2; }

// 규칙을 어기고 있는 칸들. 어느 쪽이 잘못됐는지 가릴 수 없으므로 어김에 관여한
// 칸을 모두 돌려준다 — 화면은 이걸 그대로 붉게 칠한다.
function conflicts(b, state) {
  const bad = new Set();
  const marks = state.marks;
  const half = b.size / 2;

  for (let line = 0; line < lineCount(b.size); line++) {
    const cells = lineCells(b.size, line);
    let suns = 0;
    let moons = 0;
    for (const cell of cells) {
      if (marks[cell] === SUN) suns++;
      else if (marks[cell] === MOON) moons++;
    }
    // 반을 넘긴 쪽은 이미 틀렸다. 다 채우기 전에도 알 수 있다.
    if (suns > half || moons > half) {
      const over = suns > half ? SUN : MOON;
      for (const cell of cells) if (marks[cell] === over) bad.add(cell);
    }
    for (let i = 0; i + 2 < cells.length; i++) {
      const v = marks[cells[i]];
      if (v !== EMPTY && v === marks[cells[i + 1]] && v === marks[cells[i + 2]]) {
        bad.add(cells[i]); bad.add(cells[i + 1]); bad.add(cells[i + 2]);
      }
    }
  }

  for (const link of b.links) {
    const a = marks[link.a];
    const c = marks[link.b];
    if (a === EMPTY || c === EMPTY) continue;
    if ((a === c) !== link.same) { bad.add(link.a); bad.add(link.b); }
  }

  return bad;
}

function filled(b, state) {
  for (let cell = 0; cell < b.n; cell++) if (state.marks[cell] === EMPTY) return false;
  return true;
}

function isDone(b, state) {
  return filled(b, state) && conflicts(b, state).size === 0;
}

// 값 배열 하나를 통째로 검사한다. 화면 밖(테스트·솔버 검증)에서 쓴다.
function validate(puzzle, values) {
  const b = board(puzzle);
  const state = { marks: Uint8Array.from(values) };
  return { bad: [...conflicts(b, state)].sort((x, y) => x - y), done: isDone(b, state) };
}

// 판이 규칙을 담을 수 있는 모양인지. 생성기가 뱉은 것을 테스트에서 거른다.
function wellFormed(puzzle) {
  const size = puzzle.size;
  if (size % 2 !== 0) return false;
  if (!puzzle.solution || puzzle.solution.length !== size * size) return false;
  if (!puzzle.solution.every((v) => v === SUN || v === MOON)) return false;
  if (!validate(puzzle, puzzle.solution).done) return false;
  // 미리 놓인 칸과 링크는 정답과 어긋날 수 없다. 어긋나면 풀 수 없는 판이 된다.
  for (const spot of puzzle.given) {
    if (puzzle.solution[spot.cell] !== spot.value) return false;
  }
  for (const link of puzzle.links) {
    const near = Math.abs(link.a - link.b);
    if (near !== 1 && near !== size) return false;
    if (near === 1 && Math.floor(link.a / size) !== Math.floor(link.b / size)) return false;
    if ((puzzle.solution[link.a] === puzzle.solution[link.b]) !== link.same) return false;
  }
  return true;
}

const Rules = {
  EMPTY, SUN, MOON,
  other, board, newState, reset, locked, set, cycle,
  lineCells, lineCount, conflicts, filled, isDone, validate, wellFormed,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.TangoRules = Rules;

})();

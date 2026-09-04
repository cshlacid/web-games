'use strict';

// 브라우저에서 클래식 스크립트는 전역 렉시컬 스코프를 공유한다. 파일마다 최상위에
// 같은 이름을 두면 충돌해 페이지가 통째로 죽으므로 파일을 IIFE로 가둔다.
(function () {

// Patches의 규칙 모델. 판 하나는
//   { size, clues: [{ cell, area, shape }...], solution: [{ r, c, w, h }...] }
// 이고, 푸는 것은 격자를 겹치지 않는 직사각형으로 남김없이 나누되 각 직사각형이
// 단서를 정확히 하나 품고 그 단서가 말하는 칸 수와 모양에 맞추는 일이다.
// 칸은 r * size + c 로 번호를 매긴다.
//
// **단서는 아는 것만 말한다.** `area`가 null이면 칸 수를 알려 주지 않고, `shape`가
// null이면 모양을 알려 주지 않는다. 둘 다 null인 단서는 "여기 조각이 하나 있다"만
// 말하는 자유 단서다. 원작이 그렇고, 생성기도 뺄 수 있는 만큼 빼서 이 모양을
// 만든다.
const SQUARE = 'square';
const WIDE = 'wide';
const TALL = 'tall';

function shapeOf(w, h) { return w === h ? SQUARE : w > h ? WIDE : TALL; }

function board(puzzle) {
  const size = puzzle.size;
  const n = size * size;
  const clueAt = new Int32Array(n).fill(-1);
  puzzle.clues.forEach((clue, i) => { clueAt[clue.cell] = i; });
  return { size, n, clues: puzzle.clues, clueAt, solution: puzzle.solution };
}

function newState() { return { patches: [], cover: null }; }

function reset(b, state) {
  state.patches = [];
  state.cover = new Int32Array(b.n).fill(-1);
  return state;
}

function cells(size, rect) {
  const out = [];
  for (let y = rect.r; y < rect.r + rect.h; y++) {
    for (let x = rect.c; x < rect.c + rect.w; x++) out.push(y * size + x);
  }
  return out;
}

function recover(b, state) {
  state.cover.fill(-1);
  state.patches.forEach((rect, i) => {
    for (const cell of cells(b.size, rect)) state.cover[cell] = i;
  });
  return state;
}

function inside(b, rect) {
  return rect.r >= 0 && rect.c >= 0 && rect.w >= 1 && rect.h >= 1
    && rect.r + rect.h <= b.size && rect.c + rect.w <= b.size;
}

// 새 조각을 놓는다. 겹치는 조각은 지운다 — 그리다 마음이 바뀌었을 때 먼저 지우고
// 다시 그리게 하면 손이 두 번 간다. 지운 조각 수를 돌려준다.
function add(b, state, rect) {
  if (!inside(b, rect)) return -1;
  const taken = new Set(cells(b.size, rect));
  const before = state.patches.length;
  state.patches = state.patches.filter((other) =>
    !cells(b.size, other).some((cell) => taken.has(cell)));
  state.patches.push(rect);
  recover(b, state);
  return before - (state.patches.length - 1);
}

function removeAt(b, state, cell) {
  const at = state.cover[cell];
  if (at === -1) return false;
  state.patches.splice(at, 1);
  recover(b, state);
  return true;
}

function cluesIn(b, rect) {
  return cells(b.size, rect).map((cell) => b.clueAt[cell]).filter((at) => at !== -1);
}

// 규칙을 어긴 이유. 화면은 이걸 그대로 붉게 칠하고 무엇이 틀렸는지 말해 준다.
// 어긴 조각도 일단 놓게 두는 것은, 그리는 중에 크기를 가늠하는 것이 이 게임의
// 절반이기 때문이다 — 못 놓게 막으면 가늠할 방법이 사라진다.
function faultOf(b, rect) {
  const found = cluesIn(b, rect);
  if (found.length === 0) return 'empty';
  if (found.length > 1) return 'many';
  const clue = b.clues[found[0]];
  if (clue.area !== null && rect.w * rect.h !== clue.area) return 'area';
  if (clue.shape !== null && shapeOf(rect.w, rect.h) !== clue.shape) return 'shape';
  return null;
}

function faults(b, state) {
  return state.patches.map((rect) => faultOf(b, rect));
}

function isDone(b, state) {
  for (let cell = 0; cell < b.n; cell++) if (state.cover[cell] === -1) return false;
  return state.patches.every((rect) => faultOf(b, rect) === null);
}

// 조각 목록 하나를 통째로 검사한다. 화면 밖(테스트·솔버 검증)에서 쓴다.
function validate(puzzle, rects) {
  const b = board(puzzle);
  const state = reset(b, newState());
  for (const rect of rects) add(b, state, rect);
  return { faults: faults(b, state), done: isDone(b, state) };
}

// 이웃한 조각끼리 다른 색이 되게 칠한다. 색은 화면에만 쓰이지만 판의 짜임에서
// 나오는 값이라 여기에 둔다 — 조각을 그릴 때마다 색을 다시 고르면 같은 판이
// 볼 때마다 달라 보인다.
function colorize(puzzle, palette) {
  const size = puzzle.size;
  const owner = new Int32Array(size * size).fill(-1);
  puzzle.solution.forEach((rect, i) => {
    for (const cell of cells(size, rect)) owner[cell] = i;
  });

  const near = puzzle.solution.map(() => new Set());
  for (let cell = 0; cell < size * size; cell++) {
    const r = Math.floor(cell / size);
    const c = cell % size;
    if (c < size - 1 && owner[cell] !== owner[cell + 1]) {
      near[owner[cell]].add(owner[cell + 1]);
      near[owner[cell + 1]].add(owner[cell]);
    }
    if (r < size - 1 && owner[cell] !== owner[cell + size]) {
      near[owner[cell]].add(owner[cell + size]);
      near[owner[cell + size]].add(owner[cell]);
    }
  }

  // 이웃이 많은 조각부터 칠한다. 까다로운 쪽을 먼저 정해야 색이 적게 든다.
  const order = puzzle.solution
    .map((rect, i) => i)
    .sort((a, b2) => near[b2].size - near[a].size);

  const colors = new Array(puzzle.solution.length).fill(-1);
  for (const i of order) {
    const taken = new Set([...near[i]].map((other) => colors[other]));
    // 빈 색 중 가장 앞엣것을 집으면 판 전체가 앞의 서너 색으로만 칠해진다.
    // 조각마다 다른 자리에서 찾기 시작해 아홉 색이 고루 나오게 한다.
    let pick = -1;
    for (let step = 0; step < palette; step++) {
      const candidate = (i * 4 + step) % palette;
      if (!taken.has(candidate)) { pick = candidate; break; }
    }
    // 이웃이 아홉 가지 색을 다 쓰고 있는 조각. 색이 겹치는 편이 안 칠하는 것보다 낫다.
    colors[i] = pick === -1 ? i % palette : pick;
  }
  return colors;
}

// 판이 규칙을 담을 수 있는 모양인지. 생성기가 뱉은 것을 테스트에서 거른다.
function wellFormed(puzzle) {
  const size = puzzle.size;
  if (!puzzle.solution || puzzle.solution.length !== puzzle.clues.length) return false;
  const b = board(puzzle);
  const seen = new Int32Array(size * size).fill(-1);
  for (let i = 0; i < puzzle.solution.length; i++) {
    const rect = puzzle.solution[i];
    if (!inside(b, rect)) return false;
    for (const cell of cells(size, rect)) {
      if (seen[cell] !== -1) return false;
      seen[cell] = i;
    }
    const found = cluesIn(b, rect);
    if (found.length !== 1) return false;
    const clue = puzzle.clues[found[0]];
    if (clue.area !== null && clue.area !== rect.w * rect.h) return false;
    if (clue.shape !== null && clue.shape !== shapeOf(rect.w, rect.h)) return false;
  }
  return seen.every((at) => at !== -1);
}

const Rules = {
  SQUARE, WIDE, TALL,
  shapeOf, board, newState, reset, cells, inside, recover, add, removeAt,
  cluesIn, faultOf, faults, isDone, validate, colorize, wellFormed,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.PatchesRules = Rules;

})();

'use strict';

// 브라우저에서 클래식 스크립트는 전역 렉시컬 스코프를 공유한다. 파일마다 최상위에
// 같은 이름을 두면 충돌해 페이지가 통째로 죽으므로 파일을 IIFE로 가둔다.
(function () {

// 사자성어 찾기의 규칙 모델. 판 하나는
//   { size, cells: [칸마다 음절, 벽은 ''], solution: [{ word, path: [칸 넷] }] }
// 이고, 푸는 것은 **벽이 아닌 모든 칸을 정확히 한 번씩** 쓰면서 네 칸짜리 길로
// 사자성어를 만들어 나가는 일이다. 칸은 r * size + c 로 번호를 매긴다.
//
// **길은 상하좌우로만 꺾인다.** 대각선을 열면 한 판에서 만들 수 있는 길이 몇 배로
// 늘어 유일해가 거의 나오지 않는다.
const LENGTH = 4;

function board(puzzle, words) {
  const size = puzzle.size;
  const n = size * size;
  const cells = puzzle.cells.slice();
  const walls = new Set();
  for (let cell = 0; cell < n; cell++) if (!cells[cell]) walls.add(cell);
  return { size, n, cells, walls, dict: new Set(words), solution: puzzle.solution };
}

function newState(b) {
  return reset(b, { found: [], cover: new Int32Array(b.n) });
}

function reset(b, state) {
  state.found = [];
  state.cover = new Int32Array(b.n).fill(-1);
  return state;
}

function neighbours(size, cell) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

function free(b, state, cell) {
  return !b.walls.has(cell) && state.cover[cell] === -1;
}

// 긋는 중인 길에 칸 하나를 더 이을 수 있는지. 화면이 손가락을 따라가며 묻는다.
function canExtend(b, state, path, cell) {
  if (path.length >= LENGTH) return false;
  if (!free(b, state, cell)) return false;
  if (path.includes(cell)) return false;
  if (!path.length) return true;
  return neighbours(b.size, path[path.length - 1]).includes(cell);
}

function wordOf(b, path) {
  return path.map((cell) => b.cells[cell]).join('');
}

// 길을 성어로 굳힌다. 안 되는 이유를 말로 하지 않고 코드로 돌려주는 것은, 그
// 문장이 언어를 타기 때문이다 — 화면이 사전에서 문장을 꺼낸다.
function commit(b, state, path) {
  if (path.length !== LENGTH) return { ok: false, why: 'short' };
  if (path.some((cell) => !free(b, state, cell))) return { ok: false, why: 'taken' };
  const word = wordOf(b, path);
  if (!b.dict.has(word)) return { ok: false, why: 'unknown' };
  // **같은 성어를 두 판에 두 번 쓰지 않는다.** 판을 만들 때 유일해를 이 규칙
  // 아래에서 셌으므로, 여기서 풀어 주면 "다 덮었는데 정답이 아닌" 판이 생긴다.
  if (state.found.some((entry) => entry.word === word)) return { ok: false, why: 'again' };

  const at = state.found.length;
  state.found.push({ word, path: path.slice() });
  for (const cell of path) state.cover[cell] = at;
  return { ok: true, word };
}

function removeAt(b, state, cell) {
  const at = state.cover[cell];
  if (at === -1) return null;
  const [gone] = state.found.splice(at, 1);
  state.cover.fill(-1);
  state.found.forEach((entry, i) => {
    for (const inside of entry.path) state.cover[inside] = i;
  });
  return gone.word;
}

function isDone(b, state) {
  for (let cell = 0; cell < b.n; cell++) {
    if (!b.walls.has(cell) && state.cover[cell] === -1) return false;
  }
  return true;
}

// 길 목록 하나를 통째로 검사한다. 화면 밖(테스트·생성기 검증)에서 쓴다.
function validate(puzzle, words, paths) {
  const b = board(puzzle, words);
  const state = newState(b);
  const whys = [];
  for (const path of paths) {
    const result = commit(b, state, path);
    if (!result.ok) whys.push(result.why);
  }
  return { whys, done: isDone(b, state) };
}

// 판이 규칙을 담을 수 있는 모양인지. 생성기가 뱉은 것을 테스트에서 거른다.
function wellFormed(puzzle, words) {
  const size = puzzle.size;
  if (!puzzle.cells || puzzle.cells.length !== size * size) return false;
  if (!puzzle.solution || !puzzle.solution.length) return false;
  const seen = new Set();
  for (const entry of puzzle.solution) {
    if (entry.path.length !== LENGTH) return false;
    if (!words.includes(entry.word)) return false;
    if (seen.has(entry.word)) return false;
    seen.add(entry.word);
    for (let i = 0; i < LENGTH; i++) {
      if (puzzle.cells[entry.path[i]] !== entry.word[i]) return false;
      if (i > 0 && !neighbours(size, entry.path[i - 1]).includes(entry.path[i])) return false;
    }
  }
  return validate(puzzle, words, puzzle.solution.map((entry) => entry.path)).done;
}

const Rules = {
  LENGTH,
  board, newState, reset, neighbours, free, canExtend, wordOf,
  commit, removeAt, isDone, validate, wellFormed,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.IdiomsRules = Rules;

})();

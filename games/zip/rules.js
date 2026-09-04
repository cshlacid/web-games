'use strict';

// 브라우저에서 클래식 스크립트는 전역 렉시컬 스코프를 공유한다. 파일마다 최상위에
// 같은 이름을 두면 충돌해 페이지가 통째로 죽으므로 파일을 IIFE로 가둔다.
(function () {

// Zip의 규칙 모델. 판 하나는
//   { size, hints: [1이 있는 칸, 2가 있는 칸, ...], walls: [간선...] }
// 이고, 푸는 것은 1번 칸에서 출발해 모든 칸을 한 번씩 지나면서 숫자를 오름차순으로
// 밟는 경로 하나를 긋는 일이다. 칸은 r * size + c 로 번호를 매긴다.

// 칸 사이의 간선 하나를 수 하나로 접는다. 두 칸 번호를 정렬해 붙이므로 어느
// 방향에서 물어도 같은 값이 나오고, 벽을 Set 하나로 다룰 수 있다.
function edgeKey(a, b) { return a < b ? a * 4096 + b : b * 4096 + a; }

// 규칙 판정에 쓰는 형태로 판을 펼친다. 간선 목록과 숫자 배치를 미리 만들어 두는
// 것은 솔버가 같은 판을 수십만 번 두드리기 때문이다.
function board(puzzle) {
  const size = puzzle.size;
  const n = size * size;
  const walls = new Set(puzzle.walls || []);
  const order = new Int32Array(n);
  puzzle.hints.forEach((cell, i) => { order[cell] = i + 1; });

  const links = [];
  for (let cell = 0; cell < n; cell++) {
    const r = Math.floor(cell / size);
    const c = cell % size;
    const near = [];
    if (r > 0) near.push(cell - size);
    if (r < size - 1) near.push(cell + size);
    if (c > 0) near.push(cell - 1);
    if (c < size - 1) near.push(cell + 1);
    links.push(near.filter((other) => !walls.has(edgeKey(cell, other))));
  }

  return { size, n, walls, order, links, hints: puzzle.hints };
}

// 그리는 중인 경로. visited와 next를 따로 들고 다니는 것은 한 칸 늘릴 때마다
// 경로 전체를 훑지 않으려는 것이다.
function newState() {
  return { path: [], visited: null, next: 1 };
}

function reset(b, state) {
  state.path = [];
  state.visited = new Uint8Array(b.n);
  state.next = 1;
  return state;
}

function linked(b, a, c) { return b.links[a].includes(c); }

function canPush(b, state, cell) {
  if (cell < 0 || cell >= b.n || state.visited[cell]) return false;
  // 출발은 반드시 1번 칸이다.
  if (state.path.length === 0) return b.order[cell] === 1;
  if (!linked(b, state.path[state.path.length - 1], cell)) return false;
  const num = b.order[cell];
  return num === 0 || num === state.next;
}

function push(b, state, cell) {
  if (!canPush(b, state, cell)) return false;
  state.path.push(cell);
  state.visited[cell] = 1;
  if (b.order[cell] === state.next) state.next++;
  return true;
}

function pop(b, state) {
  const cell = state.path.pop();
  if (cell === undefined) return -1;
  state.visited[cell] = 0;
  if (b.order[cell] && b.order[cell] === state.next - 1) state.next--;
  return cell;
}

function isDone(b, state) {
  return state.path.length === b.n && state.next > b.hints.length;
}

// 경로 하나를 통째로 검사한다. 화면 밖(테스트·솔버 검증)에서 쓴다.
function validate(puzzle, path) {
  const b = board(puzzle);
  const state = reset(b, newState());
  for (const cell of path) {
    if (!push(b, state, cell)) return { ok: false, done: false, at: state.path.length };
  }
  return { ok: true, done: isDone(b, state), at: path.length };
}

// 판이 규칙을 담을 수 있는 모양인지. 생성기가 뱉은 것을 테스트에서 거른다.
function wellFormed(puzzle) {
  const n = puzzle.size * puzzle.size;
  if (puzzle.hints.length < 2) return false;
  const seen = new Set();
  for (const cell of puzzle.hints) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= n || seen.has(cell)) return false;
    seen.add(cell);
  }
  return true;
}

const Rules = {
  edgeKey, board, newState, reset, linked, canPush, push, pop, isDone, validate, wellFormed,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.ZipRules = Rules;

})();

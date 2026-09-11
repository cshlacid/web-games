'use strict';

// 러시아워의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// **차는 제 줄에서만 움직인다.** 가로 차는 한 줄 안에서 좌우로, 세로 차는 한 칸 안에서
// 위아래로만 간다. 그래서 차 하나의 상태는 숫자 하나(`pos`)로 적히고, 판 전체가 숫자
// 배열 하나가 된다 — 되짚기와 최단 수 찾기가 이 표현 위에서 돈다.
(function () {

const SIZE = 6;
// 빠져나가는 줄. 셋째 줄(0부터 세어 2)은 러시아워의 판과 같다.
const EXIT_ROW = 2;

// 차 하나: { len, horizontal, line, pos }
//   line — 가로 차는 몇째 줄, 세로 차는 몇째 칸
//   pos  — 가로 차는 왼쪽 끝의 x, 세로 차는 위쪽 끝의 y
// 0번 차가 내보내야 하는 차다.
const stateOf = (cars) => cars.map((car) => car.pos);

function cellsOf(car, pos) {
  const at = pos === undefined ? car.pos : pos;
  const out = [];
  for (let i = 0; i < car.len; i++) {
    out.push(car.horizontal ? { x: at + i, y: car.line } : { x: car.line, y: at + i });
  }
  return out;
}

// 어느 칸을 어느 차가 차지했는가. -1은 빈 칸이다.
function grid(puzzle, state) {
  const out = new Array(SIZE * SIZE).fill(-1);
  puzzle.cars.forEach((car, id) => {
    for (const cell of cellsOf(car, state[id])) out[cell.y * SIZE + cell.x] = id;
  });
  return out;
}

// 차가 갈 수 있는 자리들. **한 번에 몇 칸을 가든 한 수로 센다** — 러시아워의 셈법이고,
// 한 칸씩 세면 "돌려서 빼내는 요령"보다 "칸 수"가 난이도를 정하게 된다.
function movesOf(puzzle, state, id, from) {
  const car = puzzle.cars[id];
  // 판은 한 번만 만들어 돌려 쓴다. 차마다 다시 만들면 자리 하나를 펼치는 데 차 수의
  // 제곱만큼 걸려, 넓이 우선 훑기가 열 배 느려진다.
  const board = from || grid(puzzle, state);
  const out = [];
  const free = (x, y) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
    const who = board[y * SIZE + x];
    return who === -1 || who === id;
  };

  for (const step of [-1, 1]) {
    let pos = state[id];
    for (;;) {
      const next = pos + step;
      if (next < 0 || next + car.len > SIZE) break;
      const edge = car.horizontal
        ? { x: step > 0 ? next + car.len - 1 : next, y: car.line }
        : { x: car.line, y: step > 0 ? next + car.len - 1 : next };
      if (!free(edge.x, edge.y)) break;
      pos = next;
      out.push({ id, pos });
    }
  }
  return out;
}

function moves(puzzle, state) {
  const board = grid(puzzle, state);
  const out = [];
  for (let id = 0; id < puzzle.cars.length; id++) {
    for (const one of movesOf(puzzle, state, id, board)) out.push(one);
  }
  return out;
}

function canMove(puzzle, state, id, pos) {
  return movesOf(puzzle, state, id).some((one) => one.pos === pos);
}

function move(puzzle, state, id, pos) {
  if (!canMove(puzzle, state, id, pos)) return null;
  const out = state.slice();
  out[id] = pos;
  return out;
}

// 다 풀렸는가. 0번 차의 오른쪽 끝이 벽에 닿으면 그대로 빠져나간다.
function isDone(puzzle, state) {
  return state[0] + puzzle.cars[0].len === SIZE;
}

// 판 하나를 가리키는 문자열. 되짚기에서 본 자리를 다시 보지 않으려고 쓴다.
const key = (state) => state.join(',');

function wellFormed(puzzle) {
  if (!puzzle || !puzzle.cars || !puzzle.cars.length) return false;
  const target = puzzle.cars[0];
  if (!target.horizontal || target.line !== EXIT_ROW) return false;
  const seen = new Array(SIZE * SIZE).fill(false);
  for (const car of puzzle.cars) {
    if (car.len < 2 || car.len > 3) return false;
    if (car.pos < 0 || car.pos + car.len > SIZE) return false;
    if (car.line < 0 || car.line >= SIZE) return false;
    for (const cell of cellsOf(car)) {
      const at = cell.y * SIZE + cell.x;
      if (seen[at]) return false;
      seen[at] = true;
    }
  }
  return true;
}

const Rules = {
  SIZE, EXIT_ROW,
  stateOf, cellsOf, grid, movesOf, moves, canMove, move, isDone, key, wellFormed,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.RushRules = Rules;

})();

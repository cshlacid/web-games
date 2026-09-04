'use strict';

// 실행: node games/zip/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`);
  }
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 솔버의 가지치기가 답을 잘라내지 않는지 보려면 비교 대상이 있어야 한다. 여기서
// 가지치기 없는 완전 탐색을 따로 두고 4×4 판에서 개수를 맞춰 본다 — 느리지만
// 규칙만 그대로 따르므로 틀릴 구석이 없다.
function bruteCount(puzzle) {
  const b = R.board(puzzle);
  const state = R.reset(b, R.newState());
  let count = 0;
  function walk() {
    if (state.path.length === b.n) { if (R.isDone(b, state)) count++; return; }
    for (const nb of b.links[state.path[state.path.length - 1]]) {
      if (!R.push(b, state, nb)) continue;
      walk();
      R.pop(b, state);
    }
  }
  if (!R.push(b, state, puzzle.hints[0])) return 0;
  walk();
  return count;
}

// --- 완전 탐색과 대조 ---
{
  const rng = rngFrom(7);
  let boards = 0;
  let same = 0;
  let withSolutions = 0;
  for (let i = 0; i < 30; i++) {
    const size = 4;
    const cells = [...Array(size * size).keys()];
    for (let k = cells.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [cells[k], cells[j]] = [cells[j], cells[k]];
    }
    const hints = cells.slice(0, 3);
    const walls = [];
    for (let cell = 0; cell < size * size; cell++) {
      const r = Math.floor(cell / size);
      const c = cell % size;
      if (c < size - 1 && rng() < 0.08) walls.push(R.edgeKey(cell, cell + 1));
      if (r < size - 1 && rng() < 0.08) walls.push(R.edgeKey(cell, cell + size));
    }
    const puzzle = { size, hints, walls };
    const brute = bruteCount(puzzle);
    const fast = S.countSolutions(puzzle, { limit: Infinity, budget: 5000000 });
    boards++;
    if (!fast.aborted && fast.count === brute) same++;
    if (brute > 0) withSolutions++;
  }
  check('가지치기가 답을 잘라내지 않는다', same, boards);
  // 전부 해가 없는 판만 뽑혔다면 위 비교는 아무것도 확인하지 못한 셈이다.
  check('해가 있는 판도 섞여 있었다', withSolutions > 0, true);
}

// --- 찾은 답은 규칙을 지킨다 ---
{
  const puzzle = { size: 4, hints: [0, 15], walls: [] };
  const solution = S.solve(puzzle);
  check('답을 하나 찾는다', R.validate(puzzle, solution), { ok: true, done: true, at: 16 });
}

// --- 벽 ---
{
  // 1번 칸을 벽 둘로 가두면 어디로도 나갈 수 없다.
  const boxed = { size: 3, hints: [0, 8], walls: [R.edgeKey(0, 1), R.edgeKey(0, 3)] };
  check('갇힌 시작점에서는 답이 없다', S.countSolutions(boxed).count, 0);
}

// --- 예산 ---
{
  const wide = { size: 8, hints: [0, 63], walls: [] };
  const res = S.countSolutions(wide, { limit: Infinity, budget: 200 });
  check('예산을 넘기면 세기를 접는다', res.aborted, true);
}

// --- 무작위 경로 ---
{
  const rng = rngFrom(3);
  for (const size of [5, 6, 7, 8]) {
    const path = S.randomFullPath(size, rng);
    const ok = path && path.length === size * size
      && R.validate({ size, hints: [path[0]], walls: [] }, path).done;
    check(`${size}×${size} 경로가 격자를 전부 덮는다`, ok, true);
  }
}

// 홀수 격자는 시작 칸의 색이 맞지 않으면 해가 아예 없다. 색을 고르지 않고 뽑으면
// 절반은 헛돌다 빈손으로 끝난다.
{
  const rng = rngFrom(11);
  let starts = 0;
  for (let i = 0; i < 20; i++) {
    const path = S.randomFullPath(7, rng);
    if (path && (Math.floor(path[0] / 7) + (path[0] % 7)) % 2 === 0) starts++;
  }
  check('홀수 격자는 많은 쪽 색에서 출발한다', starts, 20);
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/patches/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const G = require('./generator.js');

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

const rng = G.mulberry32(20260904);

// 솔버는 "아직 안 덮인 칸 하나를 골라 그 칸을 덮을 후보만 본다"는 지름길을 쓴다.
// 그 지름길이 해를 빠뜨리지 않는지 보려면 같은 지름길을 쓰지 않는 대조가 필요하다.
// 여기서는 단서마다 조각을 하나씩 고르는 모든 조합을 그대로 세어 맞춰 본다.
function bruteCount(puzzle, limit) {
  const size = puzzle.size;
  const lists = puzzle.clues.map((clue, i) => {
    const clueAt = new Int32Array(size * size).fill(-1);
    puzzle.clues.forEach((other, j) => { clueAt[other.cell] = j; });
    return S.rectsForClue(size, clueAt, i, clue);
  });

  const used = new Int32Array(size * size).fill(0);
  let count = 0;
  function step(i, covered) {
    if (count >= limit) return;
    if (i === lists.length) { if (covered === size * size) count++; return; }
    for (const rect of lists[i]) {
      const span = R.cells(size, rect);
      if (span.some((cell) => used[cell])) continue;
      for (const cell of span) used[cell] = 1;
      step(i + 1, covered + span.length);
      for (const cell of span) used[cell] = 0;
      if (count >= limit) return;
    }
  }
  step(0, 0);
  return count;
}

// 대조에 쓸 작은 판. 4×4를 아무렇게나 나누고 단서를 흩뿌린다.
function scatter(size) {
  const rects = G.partition(size, rng);
  const clues = rects.map((rect) => {
    const spots = R.cells(size, rect);
    const cell = spots[Math.floor(rng() * spots.length)];
    // 일부러 정보를 들쭉날쭉하게 준다 — 자유 단서가 섞여야 후보가 많아진다.
    const roll = rng();
    return {
      cell,
      area: roll < 0.5 ? rect.w * rect.h : null,
      shape: roll > 0.3 ? R.shapeOf(rect.w, rect.h) : null,
    };
  });
  return { size, clues, solution: rects };
}

let mismatched = 0;
let logicWrong = 0;
for (let i = 0; i < 120; i++) {
  const puzzle = scatter(6);
  const mine = S.solve(puzzle, { limit: 4 }).count;
  if (mine !== bruteCount(puzzle, 4)) mismatched++;
  // 논리 풀이가 끝까지 갔다면 그 판은 반드시 해가 하나다. 규칙을 하나라도 잘못
  // 적으면 해가 여럿인 판을 "풀었다"고 말하게 되는데, 그게 가장 위험한 오류다.
  if (S.logicSolve(puzzle).solved && mine !== 1) logicWrong++;
}
check('완전 탐색과 대조가 일치한다', mismatched, 0);
check('논리만으로 풀린 판은 해가 하나다', logicWrong, 0);

// --- 해가 나온 자리 검증 ---
let checkedPlacement = false;
for (let i = 0; i < 200 && !checkedPlacement; i++) {
  const puzzle = scatter(6);
  const res = S.solve(puzzle, { limit: 1 });
  if (!res.count) continue;
  check('솔버가 내놓은 조각은 규칙을 지킨다', R.validate(puzzle, res.solutions[0]).done, true);
  checkedPlacement = true;
}
check('검증할 해를 찾았다', checkedPlacement, true);

// --- 단서가 좁히는 폭 ---
const clueAt = new Int32Array(16).fill(-1);
clueAt[5] = 0;
check('칸 수를 알면 후보가 몇 개뿐이다',
  S.rectsForClue(4, clueAt, 0, { cell: 5, area: 4, shape: R.SQUARE }).length, 4);
check('모양만 알면 후보가 늘어난다',
  S.rectsForClue(4, clueAt, 0, { cell: 5, area: null, shape: R.SQUARE }).length > 4, true);
check('자유 단서는 그 칸을 품는 모든 직사각형',
  S.rectsForClue(4, clueAt, 0, { cell: 5, area: null, shape: null }).length, 2 * 3 * 2 * 3);

// --- 해가 없는 판 ---
// 2×2 격자에 3칸짜리 단서 하나. 3칸 직사각형이 들어갈 자리가 없다.
check('답이 없는 판은 0을 돌려준다',
  S.solve({ size: 2, clues: [{ cell: 0, area: 3, shape: null }], solution: [] }, { limit: 2 }).count, 0);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

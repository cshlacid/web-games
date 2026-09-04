'use strict';

// 실행: node games/queens/solver.test.js
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

// 솔버는 "행마다 왕관이 하나"라는 규칙을 탐색 순서로 삼아 행을 내려가며 훑는다.
// 그 지름길이 해를 빠뜨리지 않는지 보려면 같은 지름길을 쓰지 않는 대조가 필요하다.
// 여기서는 영역마다 칸을 하나씩 고르는 모든 조합을 그대로 세어 맞춰 본다.
function bruteCount(puzzle, limit) {
  const size = puzzle.size;
  const byRegion = Array.from({ length: size }, () => []);
  puzzle.regions.forEach((id, cell) => byRegion[id].push(cell));

  let count = 0;
  const picked = [];
  function step(id) {
    if (count >= limit) return;
    if (id === size) { count++; return; }
    for (const cell of byRegion[id]) {
      const clash = picked.some((other) => {
        const sameRow = Math.floor(other / size) === Math.floor(cell / size);
        const sameCol = other % size === cell % size;
        return sameRow || sameCol || R.adjacent(size, other, cell);
      });
      if (clash) continue;
      picked.push(cell);
      step(id + 1);
      picked.pop();
      if (count >= limit) return;
    }
  }
  step(0);
  return count;
}

// 대조에는 영역이 이어져 있을 필요가 없다. 솔버는 영역 번호만 보므로 아무렇게나
// 흩뿌린 배치가 오히려 더 다양한 판을 만들어 준다.
function scatter(size) {
  const regions = new Int32Array(size * size);
  for (let i = 0; i < regions.length; i++) regions[i] = Math.floor(rng() * size);
  for (let id = 0; id < size; id++) regions[Math.floor(rng() * regions.length)] = id;
  return { size, regions: Array.from(regions) };
}

let mismatched = 0;
let logicWrong = 0;
for (let i = 0; i < 400; i++) {
  const puzzle = scatter(5);
  const mine = S.solve(puzzle, { limit: 8 }).count;
  if (mine !== bruteCount(puzzle, 8)) mismatched++;
  // 논리 풀이가 끝까지 갔다면 그 판은 반드시 해가 하나다. 규칙을 하나라도 잘못
  // 적으면 해가 여럿인 판을 "풀었다"고 말하게 되는데, 그게 가장 위험한 오류다.
  const logic = S.logicSolve(puzzle);
  if (logic.solved && mine !== 1) logicWrong++;
}
check('완전 탐색과 대조가 일치한다', mismatched, 0);
check('논리만으로 풀린 판은 해가 하나다', logicWrong, 0);

// --- 해가 나온 자리 검증 ---
let checkedPlacement = false;
for (let i = 0; i < 200 && !checkedPlacement; i++) {
  const puzzle = scatter(5);
  const res = S.solve(puzzle, { limit: 1 });
  if (!res.count) continue;
  const cells = res.solutions[0].map((c, r) => r * 5 + c);
  check('솔버가 내놓은 배치는 규칙을 지킨다', R.validate(puzzle, cells).done, true);
  checkedPlacement = true;
}
check('검증할 해를 찾았다', checkedPlacement, true);

// --- 해가 없는 판 ---
// 영역을 세로 띠로 두면 영역 제약이 열 제약과 같아져, 인접 금지 때문에 3×3은
// 답이 없다. 가운데 열에 왕관을 놓을 자리가 남지 않는다.
check('답이 없는 판은 0을 돌려준다',
  S.solve({ size: 3, regions: [0, 1, 2, 0, 1, 2, 0, 1, 2] }, { limit: 2 }).count, 0);

// --- 무작위 배치 ---
const spread = [];
for (let i = 0; i < 200; i++) {
  const size = 8;
  const pick = S.randomArrangement(size, rng);
  const cols = new Set(pick);
  const touching = pick.some((c, r) => r > 0 && Math.abs(c - pick[r - 1]) <= 1);
  spread.push(cols.size === size && !touching);
}
check('무작위 배치는 열이 겹치지도 위아래로 닿지도 않는다', spread.every(Boolean), true);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

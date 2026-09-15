'use strict';

// 실행: node games/tango/solver.test.js
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

// --- 한 줄에 들어갈 수 있는 배치 ---

{
  const b = R.board({ size: 6, given: [], links: [], solution: new Array(36).fill(R.SUN) });
  const empty = new Uint8Array(36);
  const options = S.lineOptions(b, empty, R.lineCells(6, 0));
  // 여섯 칸에 해 셋·달 셋을 놓는 배치는 스무 가지고, 그중 같은 것이 셋 연달아
  // 오는 여섯 가지가 빠진다.
  check('빈 줄의 배치 수', options.length, 14);
  check('모두 반씩이다', options.every((o) => o.filter((v) => v === R.SUN).length === 3), true);
  check('셋 연달아가 없다',
    options.some((o) => o.some((v, i) => i + 2 < 6 && v === o[i + 1] && v === o[i + 2])), false);
}

{
  // 묶음이 줄 안에 있으면 배치가 줄어든다.
  const puzzle = { size: 6, given: [], links: [{ a: 0, b: 1, same: true }], solution: new Array(36).fill(R.SUN) };
  const b = R.board(puzzle);
  const options = S.lineOptions(b, new Uint8Array(36), R.lineCells(6, 0));
  check('묶인 두 칸은 늘 같다', options.every((o) => o[0] === o[1]), true);
}

// --- 완전 탐색 ---

{
  // 단서가 하나도 없는 6×6에는 배치가 많다. 세다가 한도에서 끊는지 본다.
  const bare = { size: 6, given: [], links: [], solution: new Array(36).fill(R.SUN) };
  check('한도에서 끊는다', S.solve(bare, { limit: 3 }).count, 3);
}

// --- 사람 규칙과 완전 탐색이 같은 답에 닿는가 ---

let mismatch = 0;
let notLogical = 0;
let notUnique = 0;
let orderBroken = 0;

for (const size of G.SIZES) {
  for (let i = 0; i < 8; i++) {
    const puzzle = G.generate(size, { seed: size * 31 + i });
    const logic = S.logicSolve(puzzle);
    if (!logic.solved) { notLogical++; continue; }

    const full = S.solve(puzzle, { limit: 2 });
    if (full.count !== 1) notUnique++;
    if (JSON.stringify(full.solutions[0]) !== JSON.stringify(logic.marks)) mismatch++;

    // 힌트가 이 순서를 그대로 쓴다. 순서에 든 칸은 아직 안 놓인 칸이어야 하고,
    // 값은 정답과 같아야 한다.
    const given = new Set(puzzle.given.map((spot) => spot.cell));
    if (logic.order.length !== size * size - given.size
      || logic.order.some((cell) => given.has(cell))
      || new Set(logic.order).size !== logic.order.length) {
      orderBroken++;
    }
  }
}

check('사람 규칙만으로 끝까지 간다', notLogical, 0);
check('답이 하나뿐이다', notUnique, 0);
check('사람 규칙이 찾은 답과 완전 탐색의 답이 같다', mismatch, 0);
check('힌트 순서가 아직 안 놓인 칸만 담는다', orderBroken, 0);

// --- 어긋난 판 ---

{
  // 같은 줄의 세 칸을 모두 해로 못 박으면 놓을 자리가 없다.
  const broken = {
    size: 6,
    given: [{ cell: 0, value: R.SUN }, { cell: 1, value: R.SUN }, { cell: 2, value: R.SUN }],
    links: [],
    solution: new Array(36).fill(R.SUN),
  };
  check('풀 수 없는 판은 답이 없다', S.solve(broken, { limit: 1 }).count, 0);
  check('풀 수 없는 판은 사람 규칙으로도 못 푼다', S.logicSolve(broken).solved, false);
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

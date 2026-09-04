'use strict';

// 실행: node games/queens/generator.test.js
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

// 크기마다 몇 판씩 뽑아 생성기가 약속한 것을 전부 확인한다. 판 하나가 밀리초
// 단위라 이 정도는 매번 돌려도 부담이 없다.
const ROUNDS = { 7: 12, 8: 8, 9: 5 };

const problems = {
  shape: 0, uncovered: 0, oversized: 0, notUnique: 0,
  solutionBroken: 0, notLogical: 0, orderBroken: 0,
};

for (const size of G.SIZES) {
  for (let i = 0; i < ROUNDS[size]; i++) {
    const puzzle = G.generate(size, { seed: size * 1000 + i });
    if (!puzzle) { problems.shape++; continue; }

    if (!R.wellFormed(puzzle)) problems.shape++;

    const counts = new Array(size).fill(0);
    for (const id of puzzle.regions) counts[id]++;
    if (counts.some((c) => c === 0)) problems.uncovered++;
    if (counts.some((c) => c > G.MAX_REGION[size])) problems.oversized++;

    if (S.solve(puzzle, { limit: 2 }).count !== 1) problems.notUnique++;

    const cells = puzzle.solution.map((c, r) => r * size + c);
    if (!R.validate(puzzle, cells).done) problems.solutionBroken++;

    const logic = S.logicSolve(puzzle);
    if (!logic.solved) problems.notLogical++;
    // 힌트가 이 순서를 그대로 쓴다. 순서에 든 칸이 정답 자리가 아니면 힌트가
    // 틀린 자리를 짚는다.
    if (puzzle.order.length !== size
      || puzzle.order.some((cell) => !cells.includes(cell))) problems.orderBroken++;
  }
}

check('영역 모양이 온전하다', problems.shape, 0);
check('빈 영역이 없다', problems.uncovered, 0);
check('영역 크기가 상한을 넘지 않는다', problems.oversized, 0);
check('모든 판이 유일해다', problems.notUnique, 0);
check('생성기가 들고 있는 정답이 실제로 답이다', problems.solutionBroken, 0);
check('찍지 않고 논리만으로 풀린다', problems.notLogical, 0);
check('힌트 순서가 정답 자리만 담는다', problems.orderBroken, 0);

// --- 씨앗 ---
const a = G.generate(8, { seed: 7 });
const b = G.generate(8, { seed: 7 });
check('같은 씨앗은 같은 판', a.regions, b.regions);
check('다른 씨앗은 다른 판', G.generate(8, { seed: 8 }).regions.join() === a.regions.join(), false);

check('지원하지 않는 크기는 거절한다', (() => {
  try { G.generate(5); return false; } catch { return true; }
})(), true);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

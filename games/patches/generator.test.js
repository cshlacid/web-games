'use strict';

// 실행: node games/patches/generator.test.js
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

// 판 하나가 밀리초 단위라 크기마다 넉넉히 뽑아 봐도 부담이 없다.
const ROUNDS = 15;

const problems = {
  none: 0, shape: 0, notUnique: 0, notLogical: 0,
  oversized: 0, tooFew: 0, orderBroken: 0, clueOutside: 0,
};

for (const size of G.SIZES) {
  for (let i = 0; i < ROUNDS; i++) {
    const puzzle = G.generate(size, { seed: size * 1000 + i });
    if (!puzzle) { problems.none++; continue; }

    if (!R.wellFormed(puzzle)) problems.shape++;
    if (S.solve(puzzle, { limit: 2 }).count !== 1) problems.notUnique++;

    const logic = S.logicSolve(puzzle);
    if (!logic.solved) problems.notLogical++;

    for (const rect of puzzle.solution) {
      if (rect.w > G.MAX_SIDE || rect.h > G.MAX_SIDE || rect.w * rect.h > G.MAX_AREA) {
        problems.oversized++;
      }
    }
    if (puzzle.solution.length < size + 2) problems.tooFew++;

    // 단서는 제 조각 안에 있어야 한다. 힌트가 조각을 짚을 때 이걸 믿는다.
    puzzle.clues.forEach((clue, k) => {
      if (!R.cells(size, puzzle.solution[k]).includes(clue.cell)) problems.clueOutside++;
    });

    // 힌트가 이 순서를 그대로 쓴다. 순서에 든 조각이 정답 조각이 아니면 힌트가
    // 틀린 자리를 짚는다.
    const answer = new Set(puzzle.solution.map((r) => `${r.r},${r.c},${r.w},${r.h}`));
    if (puzzle.order.length !== puzzle.solution.length
      || puzzle.order.some((r) => !answer.has(`${r.r},${r.c},${r.w},${r.h}`))) {
      problems.orderBroken++;
    }
  }
}

check('모든 크기에서 판이 나온다', problems.none, 0);
check('조각이 격자를 남김없이 나눈다', problems.shape, 0);
check('모든 판이 유일해다', problems.notUnique, 0);
check('찍지 않고 논리만으로 풀린다', problems.notLogical, 0);
check('조각이 상한을 넘지 않는다', problems.oversized, 0);
check('조각이 너무 적은 판은 없다', problems.tooFew, 0);
check('단서가 제 조각 안에 있다', problems.clueOutside, 0);
check('힌트 순서가 정답 조각만 담는다', problems.orderBroken, 0);

// --- 단서가 실제로 줄어드는가 ---
// 다 보여 주는 판은 읽기만 하면 끝난다. 생성기가 뺄 수 있는 만큼 뺐는지 본다.
let told = 0;
let total = 0;
for (const size of G.SIZES) {
  for (let i = 0; i < ROUNDS; i++) {
    const puzzle = G.generate(size, { seed: size * 77 + i });
    for (const clue of puzzle.clues) {
      total += 2;
      if (clue.area !== null) told++;
      if (clue.shape !== null) told++;
    }
  }
}
check('단서의 절반 넘게 걷어 낸다', told / total < 0.5, true);

// --- 씨앗 ---
const a = G.generate(7, { seed: 7 });
const b = G.generate(7, { seed: 7 });
check('같은 씨앗은 같은 판', a.clues, b.clues);
check('다른 씨앗은 다른 판',
  JSON.stringify(G.generate(7, { seed: 8 }).clues) === JSON.stringify(a.clues), false);

check('지원하지 않는 크기는 거절한다', (() => {
  try { G.generate(5); return false; } catch { return true; }
})(), true);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

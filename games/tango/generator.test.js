'use strict';

// 실행: node games/tango/generator.test.js
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
const ROUNDS = 12;

const problems = {
  none: 0, shape: 0, notUnique: 0, notLogical: 0, orderBroken: 0,
  farLink: 0, noGiven: 0, tooMany: 0,
};

let givens = 0;
let links = 0;
let boards = 0;

for (const size of G.SIZES) {
  for (let i = 0; i < ROUNDS; i++) {
    const puzzle = G.generate(size, { seed: size * 500 + i });
    if (!puzzle) { problems.none++; continue; }
    boards++;
    givens += puzzle.given.length;
    links += puzzle.links.length;

    if (!R.wellFormed(puzzle)) problems.shape++;
    if (S.solve(puzzle, { limit: 2 }).count !== 1) problems.notUnique++;
    if (!S.logicSolve(puzzle).solved) problems.notLogical++;

    // 묶음은 이웃한 두 칸 사이에만 놓인다. 떨어진 짝은 화면에 그릴 자리가 없다.
    for (const link of puzzle.links) {
      const gap = Math.abs(link.a - link.b);
      const sameRow = Math.floor(link.a / size) === Math.floor(link.b / size);
      if (!((gap === 1 && sameRow) || gap === size)) problems.farLink++;
    }

    // 놓인 칸이 하나도 없으면 어디서 시작할지 보이지 않는다.
    if (puzzle.given.length === 0) problems.noGiven++;
    // 단서가 칸 수의 절반을 넘으면 읽기만 하면 끝나는 판이다.
    if (puzzle.given.length + puzzle.links.length > size * size / 2) problems.tooMany++;

    const given = new Set(puzzle.given.map((spot) => spot.cell));
    if (puzzle.order.length !== size * size - given.size
      || puzzle.order.some((cell) => given.has(cell))) {
      problems.orderBroken++;
    }
  }
}

check('모든 크기에서 판이 나온다', problems.none, 0);
check('판이 제 모양이다', problems.shape, 0);
check('모든 판이 유일해다', problems.notUnique, 0);
check('찍지 않고 논리만으로 풀린다', problems.notLogical, 0);
check('묶음은 이웃한 칸 사이에만 있다', problems.farLink, 0);
check('놓인 칸이 하나는 있다', problems.noGiven, 0);
check('단서가 너무 많지 않다', problems.tooMany, 0);
check('힌트 순서가 안 놓인 칸을 모두 담는다', problems.orderBroken, 0);

// --- 단서가 실제로 줄어드는가 ---
// 다 보여 주는 판은 읽기만 하면 끝난다. 생성기가 뺄 수 있는 만큼 뺐는지 본다.
check('놓인 칸이 판의 15%를 넘지 않는다', givens / boards < 6 * 6 * 0.15 + 8 * 8 * 0.15, true);
// 묶음만 남고 놓인 칸이 사라지거나 그 반대가 되면 원작의 모양이 아니다.
check('놓인 칸과 묶음이 둘 다 남는다', givens > 0 && links > 0, true);

// --- 씨앗 ---
const a = G.generate(6, { seed: 9 });
const b = G.generate(6, { seed: 9 });
check('같은 씨앗은 같은 판', [a.given, a.links], [b.given, b.links]);
check('다른 씨앗은 다른 판',
  JSON.stringify(G.generate(6, { seed: 10 }).solution) === JSON.stringify(a.solution), false);

check('지원하지 않는 크기는 거절한다', (() => {
  try { G.generate(7); return false; } catch { return true; }
})(), true);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

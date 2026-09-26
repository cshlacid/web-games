'use strict';

// 실행: node games/idioms/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const G = require('./generator.js');
const Words = require('./words.js');
const W = Words.pick('ko');

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

// --- 길 후보 ---

check('4×4의 네 칸짜리 길', S.allPaths(4, new Set()).length, 232);
check('5×5의 네 칸짜리 길', S.allPaths(5, new Set()).length, 456);
check('벽이 있으면 길이 줄어든다',
  S.allPaths(4, new Set([0, 1, 2, 3])).length < 232, true);
check('길은 모두 네 칸', S.allPaths(4, new Set()).every((path) => path.length === 4), true);
check('길은 이어져 있다', S.allPaths(4, new Set()).every((path) =>
  path.every((cell, i) => i === 0 || R.neighbours(4, path[i - 1]).includes(cell))), true);

// --- 덮는 방법 세기 ---

{
  // 네 줄에 성어를 곧게 눕힌 판. 세로로도 성어가 되는 자리가 없으면 답은 하나다.
  const puzzle = {
    size: 4,
    cells: ['일', '석', '이', '조', '고', '진', '감', '래', '동', '문', '서', '답', '우', '여', '곡', '절'],
    solution: [],
  };
  const seen = S.count(puzzle, W.WORDS, { limit: 3 });
  check('곧게 눕힌 판의 답', seen.count, 1);
  check('찾은 답이 네 성어', seen.solution.map((entry) => entry.word).sort(),
    ['고진감래', '동문서답', '우여곡절', '일석이조']);
}

{
  // 같은 성어 둘을 위아래로 놓으면 가로로 두 가지, 세로로는 안 되므로 답이 하나
  // 늘어난다 — 덮는 방법을 세는 쪽이 길의 방향과 순서를 가리는지 본다.
  const puzzle = {
    size: 4,
    cells: ['일', '석', '이', '조', '동', '문', '서', '답', '고', '진', '감', '래', '우', '여', '곡', '절'],
    solution: [],
  };
  check('덮을 수 있다', S.count(puzzle, W.WORDS, { limit: 2 }).count >= 1, true);
}

{
  // 사전에 없는 글자로 채우면 덮을 방법이 없다.
  const puzzle = { size: 4, cells: new Array(16).fill('뷁'), solution: [] };
  check('덮을 수 없는 판', S.count(puzzle, W.WORDS, { limit: 2 }).count, 0);
}

{
  // 한도를 아주 낮게 주면 다 세기 전에 멈춘다. 생성기는 이걸 보고 그 판을 버린다 —
  // 덜 센 판을 "답이 하나뿐"으로 잘못 읽으면 답이 둘인 판이 나간다.
  const puzzle = G.generate(5, { seed: 7 });
  check('한도를 넘기면 넘겼다고 말한다',
    S.count(puzzle, W.WORDS, { limit: 2, budget: 3 }).over, true);
}

// --- 생성기가 만든 판 ---

let notUnique = 0;
let notSame = 0;
for (const size of G.SIZES) {
  for (let i = 0; i < 6; i++) {
    const puzzle = G.generate(size, { seed: size * 91 + i });
    const seen = S.count(puzzle, W.WORDS, { limit: 2 });
    if (seen.count !== 1) notUnique++;
    // 솔버가 찾은 답이 생성기가 눕힌 성어와 같은 묶음이어야 한다.
    const mine = puzzle.solution.map((entry) => entry.word).sort().join(' ');
    const found = seen.solution.map((entry) => entry.word).sort().join(' ');
    if (mine !== found) notSame++;
  }
}
check('생성기 판은 답이 하나뿐', notUnique, 0);
check('솔버가 찾은 답이 생성기가 눕힌 것과 같다', notSame, 0);

// --- 힌트 ---

// 힌트만 눌러 가도 끝까지 가고, 짚는 성어는 늘 정답 안에 있다.
let hintStuck = 0;
let hintWrong = 0;
let hintNoWhy = 0;
for (const size of G.SIZES) {
  for (let i = 0; i < 6; i++) {
    const puzzle = G.generate(size, { seed: size * 37 + i });
    const b = R.board(puzzle, W.WORDS);
    const state = R.newState(b);
    const answer = new Set(puzzle.solution.map((entry) => entry.word + entry.path.join()));
    while (!R.isDone(b, state)) {
      const step = S.next(b, state);
      if (!step) { hintStuck++; break; }
      if (!answer.has(step.word + step.path.join())) hintWrong++;
      if (!step.why || !step.path.includes(step.why.cell)) hintNoWhy++;
      R.commit(b, state, step.path);
    }
  }
}
check('힌트는 지금 판만으로 끝까지 간다', hintStuck, 0);
check('힌트는 정답에 있는 성어만 짚는다', hintWrong, 0);
check('힌트는 근거가 된 칸을 함께 준다', hintNoWhy, 0);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

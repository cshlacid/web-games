'use strict';

// 실행: node games/hashi/generator.test.js
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

const SIZES = [9, 11, 13];

// 판 하나가 아니라 여러 판을 본다. 씨드에 따라서만 나는 실패는 한 판으로는 안 보인다.
const made = [];
for (const size of SIZES) {
  for (let seed = 1; seed <= 20; seed++) made.push({ size, ...G.generate(seed, size) });
}

check('모든 씨드에서 판이 나온다', made.every((m) => m.puzzle && m.answer), true);
check('판의 모양이 규칙에 맞는다', made.every((m) => R.wellFormed(m.puzzle)), true);

check('섬 수가 크기에 맞는다', made.every((m) => {
  const want = G.SIZES[m.size].islands;
  return m.puzzle.islands.length >= want * 0.8 && m.puzzle.islands.length <= want;
}), true);

check('섬끼리 붙어 있지 않다', made.every(({ puzzle }) =>
  puzzle.islands.every((a) => puzzle.islands.every((b) =>
    (a === b) || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1))), true);

check('판 안에 들어온다', made.every(({ puzzle }) =>
  puzzle.islands.every((a) => a.x >= 0 && a.y >= 0 && a.x < puzzle.w && a.y < puzzle.h)), true);

check('답이 하나뿐이다', made.every((m) => S.count(R.board(m.puzzle), 2) === 1), true);
check('찍지 않고 논리로 풀린다', made.every((m) => !!S.logicSolve(R.board(m.puzzle))), true);

check('함께 준 답이 실제로 완성이다', made.every((m) => {
  const b = R.board(m.puzzle);
  return R.isDone(b, m.answer);
}), true);

check('놓을 자리가 답보다 많다(고를 것이 있다)', made.every((m) => {
  const b = R.board(m.puzzle);
  return b.links.length > m.answer.filter((n) => n > 0).length * 0.5;
}), true);

check('같은 씨드는 같은 판',
  JSON.stringify(G.generate(5, 11).puzzle), JSON.stringify(G.generate(5, 11).puzzle));
check('다른 씨드는 다른 판',
  JSON.stringify(G.generate(5, 11).puzzle) === JSON.stringify(G.generate(6, 11).puzzle), false);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

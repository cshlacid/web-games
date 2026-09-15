'use strict';

// 실행: node games/nonogram/generator.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const P = require('./pictures.js');
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

// --- 그림 ---
// 그림을 더할 때 여기서 걸린다. 크기가 어긋나거나 찍어야 풀리는 그림은 들이지 않는다.
for (const size of Object.keys(P.PICTURES).map(Number)) {
  const list = P.PICTURES[size];
  check(`${size}칸 그림이 있다`, list.length > 0, true);
  check(`${size}칸 그림의 크기가 맞는다`, list.every((pic) =>
    pic.rows.length === size && pic.rows.every((row) => row.length === size)), true);
  check(`${size}칸 그림은 모두 논리로 풀린다`, list.every((pic) =>
    S.logicOnly(R.puzzleFrom(P.cellsOf(pic.rows), size, size, pic.name))), true);
  check(`${size}칸 그림에 빈 그림은 없다`, list.every((pic) => {
    const filled = P.cellsOf(pic.rows).filter(Boolean).length;
    return filled > size && filled < size * size;
  }), true);
  check(`${size}칸 그림 이름이 겹치지 않는다`,
    new Set(list.map((pic) => pic.name)).size, list.length);
}

// --- 만들기 ---
const made = [];
for (const size of G.SIZES) {
  for (let seed = 1; seed <= 12; seed++) made.push({ size, puzzle: G.generate(seed * 7919, size) });
}

check('모든 씨드에서 판이 나온다', made.every((one) => one.puzzle), true);
check('크기가 맞는다', made.every(({ size, puzzle }) =>
  puzzle.w === size && puzzle.h === size && puzzle.answer.length === size * size), true);
check('힌트 줄 수가 맞는다', made.every(({ size, puzzle }) =>
  puzzle.rows.length === size && puzzle.cols.length === size), true);
check('모두 논리로만 풀린다', made.every(({ puzzle }) => S.logicOnly(puzzle)), true);
check('힌트가 정답에서 나온 것이다', made.every(({ size, puzzle }) => {
  const again = R.cluesFrom(puzzle.answer, size, size);
  return JSON.stringify(again.rows) === JSON.stringify(puzzle.rows)
    && JSON.stringify(again.cols) === JSON.stringify(puzzle.cols);
}), true);

check('그림이 있는 크기는 이름이 붙는다', made
  .filter(({ size }) => P.PICTURES[size])
  .every(({ puzzle }) => puzzle.name.length > 0), true);
check('그림이 없는 크기는 무작위로 만든다', made
  .filter(({ size }) => !P.PICTURES[size])
  .every(({ puzzle }) => puzzle.name === ''), true);

check('같은 씨드는 같은 판',
  JSON.stringify(G.generate(42, 10)), JSON.stringify(G.generate(42, 10)));
check('방금 나온 그림은 건너뛴다', (() => {
  const first = G.generate(42, 10);
  const second = G.generate(42, 10, first.name);
  return second.name !== first.name;
})(), true);

check('큰 판도 텅 비거나 꽉 차지 않는다', made
  .filter(({ size }) => size === 15)
  .every(({ puzzle }) => {
    const filled = puzzle.answer.filter(Boolean).length;
    return filled > 30 && filled < 15 * 15 - 15;
  }), true);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

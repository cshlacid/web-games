'use strict';

// 실행: node games/rushhour/generator.test.js
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

const RANGE = { easy: [6, 12], normal: [13, 21], hard: [22, 60] };
const levels = Object.keys(G.PUZZLES).sort();

check('난이도가 셋', levels, ['easy', 'hard', 'normal']);

for (const level of levels) {
  const list = G.PUZZLES[level];
  check(`${level} 판이 넉넉하다`, list.length >= 30, true);
  check(`${level} 판이 겹치지 않는다`, new Set(list.map((one) => one[0])).size, list.length);
  check(`${level} 최단 수가 난이도 구간 안에 있다`, list.every((one) =>
    one[1] >= RANGE[level][0] && one[1] <= RANGE[level][1]), true);
  check(`${level} 판이 모두 올바르다`, list.every((one) =>
    R.wellFormed({ cars: G.decode(one[0]) })), true);
  check(`${level} 빨간 차가 처음부터 나가 있지는 않다`, list.every((one) =>
    !R.isDone({ cars: G.decode(one[0]) }, R.stateOf(G.decode(one[0])))), true);
}

// **적힌 최단 수를 실제로 풀어 다시 잰다.** 자료를 손으로 고치면 여기서 걸린다.
// 판 하나에 수십 밀리초가 들어 걸러서 보되, 난이도마다 열 장 넘게 본다.
for (const level of levels) {
  const list = G.PUZZLES[level];
  const step = level === 'hard' ? 3 : 2;
  let wrong = null;
  let looked = 0;
  for (let i = 0; i < list.length; i += step) {
    looked++;
    const puzzle = { cars: G.decode(list[i][0]) };
    const moves = S.minMoves(puzzle);
    if (moves !== list[i][1]) { wrong = `${i}번 판: ${moves} ≠ ${list[i][1]}`; break; }
  }
  check(`${level} 적힌 최단 수가 맞는다 (${looked}장)`, wrong, null);
}

// --- 고르기 ---
{
  const first = G.pick(42, 'normal');
  check('고른 판에 차와 최단 수가 있다',
    [first.cars.length > 0, first.moves > 0, first.level], [true, true, 'normal']);
  check('같은 씨드는 같은 판', G.pick(42, 'normal').id, first.id);
  check('방금 푼 판은 건너뛴다', G.pick(42, 'normal', first.id).id !== first.id, true);
  check('없는 난이도는 쉬움으로', G.pick(42, '없음').cars.length > 0, true);
}

check('글자 넷이 차 하나', G.decode('2h20 3v41'), [
  { len: 2, horizontal: true, line: 2, pos: 0 },
  { len: 3, horizontal: false, line: 4, pos: 1 },
]);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

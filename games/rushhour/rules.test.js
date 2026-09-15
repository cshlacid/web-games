'use strict';

// 실행: node games/rushhour/rules.test.js
const R = require('./rules.js');

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

// 빨간 차 하나와 앞을 막는 세로 차 하나.
const simple = {
  cars: [
    { len: 2, horizontal: true, line: 2, pos: 1 },
    { len: 3, horizontal: false, line: 3, pos: 0 },
  ],
};

check('처음 자리를 읽는다', R.stateOf(simple.cars), [1, 0]);
check('가로 차가 덮는 칸', R.cellsOf(simple.cars[0]), [{ x: 1, y: 2 }, { x: 2, y: 2 }]);
check('세로 차가 덮는 칸', R.cellsOf(simple.cars[1]).map((c) => c.y), [0, 1, 2]);

check('올바른 판', R.wellFormed(simple), true);
check('빨간 차가 빠져나가는 줄에 없으면 틀린 판', R.wellFormed({
  cars: [{ len: 2, horizontal: true, line: 1, pos: 0 }],
}), false);
check('빨간 차가 세로면 틀린 판', R.wellFormed({
  cars: [{ len: 2, horizontal: false, line: 2, pos: 0 }],
}), false);
check('차가 겹치면 틀린 판', R.wellFormed({
  cars: [
    { len: 2, horizontal: true, line: 2, pos: 1 },
    { len: 2, horizontal: false, line: 2, pos: 1 },
  ],
}), false);
check('판 밖으로 나가면 틀린 판', R.wellFormed({
  cars: [{ len: 2, horizontal: true, line: 2, pos: 5 }],
}), false);

// 막힌 쪽으로는 못 가고, 트인 쪽으로만 간다.
{
  const state = R.stateOf(simple.cars);
  check('막히면 그쪽으로는 못 간다', R.movesOf(simple, state, 0).map((one) => one.pos), [0]);
  check('막는 차는 위아래로 움직인다',
    R.movesOf(simple, state, 1).map((one) => one.pos), [1, 2, 3]);
  check('갈 수 없는 자리는 거절한다', R.move(simple, state, 0, 3), null);
  check('갈 수 있는 자리로는 옮긴다', R.move(simple, state, 0, 0), [0, 0]);
  check('옮겨도 원래 자리는 그대로', state, [1, 0]);
}

// 한 번에 몇 칸을 가든 한 수다 — 자리마다 하나씩 돌려준다.
{
  const open = { cars: [{ len: 2, horizontal: true, line: 2, pos: 0 }] };
  check('빈 줄에서는 끝까지 갈 수 있다',
    R.movesOf(open, [0], 0).map((one) => one.pos), [1, 2, 3, 4]);
}

check('오른쪽 끝에 닿으면 끝', R.isDone(simple, [4, 0]), true);
check('한 칸 모자라면 아직', R.isDone(simple, [3, 0]), false);

// 판을 가리키는 문자열
check('같은 자리는 같은 문자열', R.key([1, 2, 3]), R.key([1, 2, 3]));
check('다른 자리는 다른 문자열', R.key([1, 2, 3]) === R.key([1, 2, 4]), false);

// 칸 표. 빈 칸은 -1, 나머지는 차 번호다.
{
  const board = R.grid(simple, [1, 0]);
  check('차가 선 칸에는 번호가 있다', [board[2 * 6 + 1], board[2 * 6 + 2]], [0, 0]);
  check('빈 칸은 -1', board[0], -1);
  check('세로 차도 세 칸을 차지한다',
    [board[3], board[6 + 3], board[12 + 3]], [1, 1, 1]);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

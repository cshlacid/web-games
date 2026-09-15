'use strict';

// 실행: node games/rushhour/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');

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

// 한 수면 끝나는 판.
const oneMove = { cars: [{ len: 2, horizontal: true, line: 2, pos: 0 }] };
check('이미 끝난 판은 0수', S.minMoves({ cars: [{ len: 2, horizontal: true, line: 2, pos: 4 }] }), 0);
check('빈 줄은 한 수', S.minMoves(oneMove), 1);
check('풀이도 한 수', S.solve(oneMove), [{ id: 0, pos: 4 }]);

// 막는 차를 치우고 나가는 판.
const blocked = {
  cars: [
    { len: 2, horizontal: true, line: 2, pos: 0 },
    { len: 2, horizontal: false, line: 4, pos: 2 },
  ],
};
check('막는 차를 치우고 나간다', S.minMoves(blocked), 2);
{
  const path = S.solve(blocked);
  check('풀이는 두 수', path.length, 2);
  check('먼저 막는 차를 옮긴다', path[0].id, 1);
  check('마지막에 빨간 차가 나간다', path[path.length - 1].id, 0);
}

// 풀 수 없는 판 — 벽에 붙은 트럭이 길을 영영 막는다.
{
  const stuck = {
    cars: [
      { len: 2, horizontal: true, line: 2, pos: 0 },
      { len: 3, horizontal: false, line: 5, pos: 0 },
      { len: 3, horizontal: false, line: 5, pos: 3 },
    ],
  };
  check('못 푸는 판은 null', S.minMoves(stuck), null);
  check('풀이도 null', S.solve(stuck), null);
}

// 힌트는 지금 자리에서 다시 계산한다.
{
  const state = R.stateOf(blocked.cars);
  const first = S.nextMove(blocked, state);
  check('힌트는 최단 풀이의 첫 수', first, S.solve(blocked)[0]);

  // 사람이 엉뚱하게 옮겨 놓아도 그 자리에서 답을 준다.
  const messy = R.move(blocked, state, 1, 4);
  check('엉뚱한 자리에서도 힌트가 나온다', S.nextMove(blocked, messy) !== null, true);
  check('다 푼 자리에는 힌트가 없다', S.nextMove(blocked, [4, 4]), null);
}

// 퍼져 나가기: 다 푼 자리에서 시작하면 거리가 곧 되돌아가는 수다.
{
  const solved = { cars: [{ len: 2, horizontal: true, line: 2, pos: 4 }] };
  const out = S.sweep(solved, [4]);
  // 한 수로 어디까지든 가므로 왼쪽 자리는 모두 한 걸음이다.
  check('몇 칸을 가든 한 걸음', [out.dist.get('3'), out.dist.get('0')], [1, 1]);
  check('가장 먼 층을 들고 있다', out.deepest.length > 0, true);
}

// 울타리는 층 단위로 본다 — 한 층을 펼치는 도중에 멈추면 그 층의 거리가 반쪽만 채워진다.
{
  const roomy = {
    cars: [
      { len: 2, horizontal: true, line: 2, pos: 4 },
      { len: 3, horizontal: false, line: 0, pos: 0 },
      { len: 2, horizontal: false, line: 1, pos: 3 },
      { len: 2, horizontal: true, line: 5, pos: 0 },
    ],
  };
  const start = R.stateOf(roomy.cars);
  const full = S.sweep(roomy, start);
  check('덩어리가 제법 크다', full.dist.size > 100, true);
  check('울타리에 닿으면 일찍 멈춘다', S.sweep(roomy, start, 40).dist.size < full.dist.size, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

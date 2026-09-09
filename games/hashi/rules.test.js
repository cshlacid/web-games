'use strict';

// 실행: node games/hashi/rules.test.js
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

// 섬 넷을 네모로 놓은 판. 가로 두 짝, 세로 두 짝이 나온다.
const square = R.board({
  w: 5,
  h: 5,
  islands: [
    { x: 0, y: 0, need: 2 }, { x: 4, y: 0, need: 2 },
    { x: 0, y: 4, need: 2 }, { x: 4, y: 4, need: 2 },
  ],
});

check('이웃한 섬끼리만 짝이 된다', square.links.length, 4);
check('섬마다 닿는 자리는 둘', square.linksOf.map((l) => l.length), [2, 2, 2, 2]);

{
  // 가운데 섬이 끼면 그 너머와는 이어지지 않는다.
  const row = R.board({
    w: 7, h: 1,
    islands: [{ x: 0, y: 0, need: 1 }, { x: 3, y: 0, need: 2 }, { x: 6, y: 0, need: 1 }],
  });
  check('건너뛴 짝은 없다', row.links.map((l) => [l.a, l.b]), [[0, 1], [1, 2]]);
}

{
  // 붙어 있는 두 섬은 다리가 지날 칸이 없다.
  const tight = R.board({ w: 3, h: 1, islands: [{ x: 0, y: 0, need: 1 }, { x: 1, y: 0, need: 1 }] });
  check('붙어 있는 섬은 잇지 않는다', tight.links.length, 0);
}

// --- 놓기 ---
{
  const state = R.newState(square);
  check('빈 판에는 다리가 없다', R.degree(square, state, 0), 0);
  check('한 개 놓는다', R.set(square, state, 0, 1), true);
  check('두 개까지 놓는다', R.set(square, state, 0, 2), true);
  check('셋은 못 놓는다', R.canSet(square, state, 0, 3), false);
  check('숫자를 넘기면 못 놓는다', R.canSet(square, state, 1, 1), false);

  R.set(square, state, 0, 0);
  check('지우면 다시 놓을 수 있다', R.canSet(square, state, 1, 2), true);
}

// --- 교차 ---
{
  //   .A.
  //   BxC   가로 B-C와 세로 A-D가 가운데 칸에서 만난다.
  //   .D.
  const cross = R.board({
    w: 3, h: 3,
    islands: [
      { x: 1, y: 0, need: 1 }, { x: 0, y: 1, need: 1 },
      { x: 2, y: 1, need: 1 }, { x: 1, y: 2, need: 1 },
    ],
  });
  check('교차하는 자리를 서로 알고 있다', cross.crossing.map((c) => c.length), [1, 1]);

  const state = R.newState(cross);
  R.set(cross, state, 0, 1);
  check('한쪽을 놓으면 다른 쪽은 막힌다', R.canSet(cross, state, 1, 1), false);
  R.set(cross, state, 0, 0);
  check('치우면 다시 열린다', R.canSet(cross, state, 1, 1), true);
}

// --- 눌러서 돌리기 ---
{
  const line = R.board({ w: 4, h: 1, islands: [{ x: 0, y: 0, need: 2 }, { x: 3, y: 0, need: 2 }] });
  const state = R.newState(line);
  check('0에서 눌러 1', R.cycle(line, state, 0), 1);
  check('1에서 눌러 2', R.cycle(line, state, 0), 2);
  check('2에서 눌러 0', R.cycle(line, state, 0), 0);
}

{
  const one = R.board({ w: 4, h: 1, islands: [{ x: 0, y: 0, need: 1 }, { x: 3, y: 0, need: 1 }] });
  const state = R.newState(one);
  R.cycle(one, state, 0);
  check('숫자가 1이면 2를 건너뛰고 지워진다', R.cycle(one, state, 0), 0);
}

// --- 완성 판정 ---
{
  const state = R.newState(square);
  for (const li of [0, 1, 2, 3]) R.set(square, state, li, 1);
  check('숫자를 다 맞추고 이어지면 완성', R.isDone(square, state), true);
}

{
  // 두 짝이 각자 닫히면 숫자는 맞아도 한 덩어리가 아니다.
  const pairs = R.board({
    w: 4, h: 4,
    islands: [
      { x: 0, y: 0, need: 1 }, { x: 3, y: 0, need: 1 },
      { x: 0, y: 3, need: 1 }, { x: 3, y: 3, need: 1 },
    ],
  });
  const state = R.newState(pairs);
  for (const li of pairs.links.map((l) => l.id)) {
    if (pairs.links[li].horizontal) R.set(pairs, state, li, 1);
  }
  check('숫자만 맞고 끊겨 있으면 완성이 아니다',
    [R.satisfied(pairs, state), R.connected(pairs, state), R.isDone(pairs, state)],
    [true, false, false]);
}

// --- 판 검사 ---
{
  check('닿을 수 있는 것보다 큰 숫자는 판이 아니다',
    R.wellFormed({ w: 4, h: 1, islands: [{ x: 0, y: 0, need: 3 }, { x: 3, y: 0, need: 3 }] }), false);
  check('겹쳐 놓은 섬은 판이 아니다',
    R.wellFormed({ w: 4, h: 1, islands: [{ x: 0, y: 0, need: 1 }, { x: 0, y: 0, need: 1 }] }), false);
  check('제대로 된 판은 통과',
    R.wellFormed({ w: 4, h: 1, islands: [{ x: 0, y: 0, need: 2 }, { x: 3, y: 0, need: 2 }] }), true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/lightup/rules.test.js
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

const B = R.BULB;
const _ = R.EMPTY;
const x = R.CROSS;

{
  const p = R.parse(1, 3, '.#2');
  check('판 읽기', Array.from(p.cells), [R.OPEN, R.WALL, 2]);
  check('판 적기', R.encode(p.cells), '.#2');
}

// 3×3, 가운데가 숫자 벽 2.
//   . . .
//   . 2 .
//   . . .
{
  const p = R.parse(3, 3, '....2....');
  const geo = R.geometry(p);
  check('벽이 빛을 막는다', geo.sight[1].sort(), [0, 2]);
  check('모서리 칸이 보는 칸', geo.sight[0].sort(), [1, 2, 3, 6]);

  // 위 가운데와 아래 가운데에 전구 — 둘은 벽을 사이에 두고 마주 보지 않는다.
  const marks = [_, B, _, _, _, _, _, B, _];
  const state = R.inspect(p, marks);
  check('벽 너머는 비추지 않는다', state.clash, []);
  check('숫자 2가 찼다', state.done, [4]);
  check('양옆 가운데 칸은 어둡다', [state.lit[3], state.lit[5]], [0, 0]);
  check('어두운 칸이 있으면 안 풀린 판', state.solved, false);
}

{
  // 같은 줄에서 마주 보는 두 전구.
  const p = R.parse(1, 3, '...');
  check('서로 비추는 전구', R.inspect(p, [B, _, B]).clash, [0, 2]);
  check('X는 판정에 쓰지 않는다', R.inspect(p, [x, B, x]).solved, true);
}

{
  // 숫자보다 많은 전구.
  const p = R.parse(1, 3, '.1.');
  const state = R.inspect(p, [B, _, B]);
  check('넘친 숫자', state.over, [1]);
  check('넘치면 안 풀린 판', state.solved, false);
  check('숫자가 맞으면 풀린 판', R.inspect(R.parse(1, 3, '.1#'), [B, _, _]).solved, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

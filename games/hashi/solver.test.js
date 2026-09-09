'use strict';

// 실행: node games/hashi/solver.test.js
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

// --- 좁히기 ---
{
  const b = R.board({ w: 4, h: 1, islands: [{ x: 0, y: 0, need: 2 }, { x: 3, y: 0, need: 2 }] });
  const d = S.bounds(b);
  check('갈 곳이 하나뿐이면 그만큼 확정된다', [S.propagate(b, d), d.lo[0], d.hi[0]], [true, 2, 2]);
}

{
  //  A . . B      A와 B는 숫자가 1이라 서로 이으면 둘만 닫힌다.
  //  . . . .      정답은 A-C, B-D, C-D 셋.
  //  . . . .
  //  C . . D
  const b = R.board({
    w: 4, h: 4,
    islands: [
      { x: 0, y: 0, need: 1 }, { x: 3, y: 0, need: 1 },
      { x: 0, y: 3, need: 2 }, { x: 3, y: 3, need: 2 },
    ],
  });
  const top = b.links.find((l) => l.a === 0 && l.b === 1);
  const d = S.bounds(b);
  S.propagate(b, d);
  check('1과 1은 서로 잇지 않는다', d.hi[top.id], 0);
  check('답은 하나', S.count(b, 3), 1);
}

{
  // 숫자를 채울 방법이 아예 없는 판.
  const b = R.board({ w: 4, h: 1, islands: [{ x: 0, y: 0, need: 2 }, { x: 3, y: 0, need: 1 }] });
  check('맞출 수 없는 판은 답이 없다', S.count(b, 3), 0);
}

{
  // 숫자는 맞출 수 있지만 두 짝으로 갈라져 이어지지 않는 판.
  const b = R.board({
    w: 4, h: 4,
    islands: [
      { x: 0, y: 0, need: 1 }, { x: 3, y: 0, need: 1 },
      { x: 0, y: 3, need: 1 }, { x: 3, y: 3, need: 1 },
    ],
  });
  check('끊긴 배치는 답으로 세지 않는다', S.count(b, 3), 0);
}

// --- 생성된 판으로 ---
{
  const made = G.generate(7, 11);
  const b = R.board(made.puzzle);
  const byLogic = S.logicSolve(b);
  const bySearch = S.solve(b);
  check('생성된 판은 논리만으로 풀린다', !!byLogic, true);
  check('좁히기와 되짚기의 답이 같다', byLogic, bySearch);
  check('생성기가 함께 준 답과도 같다', byLogic, made.answer);
  check('그 답은 완성 판정을 통과한다', R.isDone(b, byLogic), true);
  check('답은 하나뿐', S.count(b, 3), 1);
}

{
  // 숫자 하나를 줄이면 답이 사라지거나 여럿이 된다 — 어느 쪽이든 하나는 아니다.
  const made = G.generate(3, 9);
  const broken = JSON.parse(JSON.stringify(made.puzzle));
  broken.islands[0].need = Math.max(1, broken.islands[0].need - 1);
  const b = R.board(broken);
  check('숫자를 흔들면 유일해가 깨진다', S.count(b, 3) === 1, false);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

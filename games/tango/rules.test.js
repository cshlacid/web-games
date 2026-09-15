'use strict';

// 실행: node games/tango/rules.test.js
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

// 규칙을 지키는 6×6 판 하나. 줄마다 해 셋·달 셋이고 같은 것이 셋 연달아 오지 않는다.
const SOLUTION = [
  1, 2, 1, 1, 2, 2,
  1, 1, 2, 1, 2, 2,
  2, 2, 1, 2, 1, 1,
  2, 1, 2, 2, 1, 1,
  1, 1, 2, 1, 2, 2,
  2, 2, 1, 2, 1, 1,
];

function puzzle(given = [], links = []) {
  return { size: 6, given, links, solution: SOLUTION };
}

// --- 줄 ---

check('행은 앞의 여섯 줄', R.lineCells(6, 0), [0, 1, 2, 3, 4, 5]);
check('열은 뒤의 여섯 줄', R.lineCells(6, 6), [0, 6, 12, 18, 24, 30]);
check('줄 수는 행과 열을 더한 것', R.lineCount(6), 12);

// --- 칸 바꾸기 ---

{
  const b = R.board(puzzle([{ cell: 0, value: R.SUN }]));
  const state = R.newState(b);
  check('미리 놓인 칸은 처음부터 채워져 있다', state.marks[0], R.SUN);
  check('미리 놓인 칸은 잠긴다', R.locked(b, 0), true);
  R.cycle(b, state, 0);
  check('잠긴 칸은 눌러도 그대로', state.marks[0], R.SUN);

  check('빈칸 다음은 해', R.cycle(b, state, 1), R.SUN);
  check('해 다음은 달', R.cycle(b, state, 1), R.MOON);
  check('달 다음은 빈칸', R.cycle(b, state, 1), R.EMPTY);

  R.set(b, state, 2, R.MOON);
  R.reset(b, state);
  check('비우면 미리 놓인 칸만 남는다', Array.from(state.marks.slice(0, 3)), [R.SUN, 0, 0]);
}

// --- 어김 ---

check('셋 연달아는 그 셋이 걸린다',
  R.validate(puzzle(), [
    1, 1, 1, 2, 2, 2,
    2, 2, 1, 1, 2, 1,
    1, 2, 2, 1, 1, 2,
    2, 1, 1, 2, 2, 1,
    1, 2, 2, 1, 1, 2,
    2, 1, 2, 2, 1, 1,
  ]).bad.slice(0, 6), [0, 1, 2, 3, 4, 5]);

check('한쪽이 반을 넘기면 그 칸들이 걸린다',
  R.validate(puzzle(), [
    1, 2, 1, 2, 1, 1,
    2, 1, 2, 1, 2, 2,
    1, 2, 1, 2, 1, 1,
    2, 1, 2, 1, 2, 2,
    1, 2, 1, 2, 1, 1,
    2, 1, 2, 1, 2, 2,
  ]).bad.includes(0), true);

check('정답은 아무것도 걸리지 않는다', R.validate(puzzle(), SOLUTION), { bad: [], done: true });

{
  // 0번과 1번은 정답에서 해·달로 다르다. 같다고 묶으면 정답이 그 묶음을 어긴다.
  const wrong = puzzle([], [{ a: 0, b: 1, same: true }]);
  check('묶음을 어기면 두 칸이 다 걸린다', R.validate(wrong, SOLUTION).bad, [0, 1]);
  const right = puzzle([], [{ a: 0, b: 1, same: false }]);
  check('맞는 묶음은 걸리지 않는다', R.validate(right, SOLUTION).bad, []);
}

{
  const b = R.board(puzzle());
  const state = R.newState(b);
  check('빈 판은 끝나지 않았다', R.isDone(b, state), false);
  SOLUTION.forEach((value, cell) => R.set(b, state, cell, value));
  check('다 채우면 끝난다', R.isDone(b, state), true);
  R.set(b, state, 0, R.EMPTY);
  check('한 칸만 비어도 끝나지 않았다', R.isDone(b, state), false);
}

// --- 판 모양 ---

check('정답과 맞는 판은 제 모양', R.wellFormed(puzzle(
  [{ cell: 0, value: R.SUN }], [{ a: 0, b: 1, same: false }])), true);
check('놓인 칸이 정답과 다르면 제 모양이 아니다',
  R.wellFormed(puzzle([{ cell: 0, value: R.MOON }])), false);
check('묶음이 정답과 다르면 제 모양이 아니다',
  R.wellFormed(puzzle([], [{ a: 0, b: 1, same: true }])), false);
check('떨어진 두 칸은 묶을 수 없다',
  R.wellFormed(puzzle([], [{ a: 0, b: 2, same: true }])), false);
check('줄이 바뀌는 자리는 가로로 이웃이 아니다',
  R.wellFormed(puzzle([], [{ a: 5, b: 6, same: SOLUTION[5] === SOLUTION[6] }])), false);
check('홀수 판은 만들 수 없다',
  R.wellFormed({ size: 5, given: [], links: [], solution: new Array(25).fill(1) }), false);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

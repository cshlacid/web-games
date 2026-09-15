'use strict';

// 실행: node games/nonogram/rules.test.js
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

const grid = (rows) => [].concat(...rows.map((row) => row.split('').map((ch) => (ch === '#' ? 1 : 0))));

check('이어진 칸을 센다', R.cluesOf([1, 1, 0, 1, 0]), [2, 1]);
check('빈 줄은 0', R.cluesOf([0, 0, 0]), [0]);
check('꽉 찬 줄', R.cluesOf([1, 1, 1]), [3]);
check('아님 표시는 빈 칸으로 센다', R.cluesOf([1, 2, 1]), [1, 1]);

{
  const answer = grid(['#.#', '###', '..#']);
  const puzzle = R.puzzleFrom(answer, 3, 3, '시험');
  check('가로 힌트', puzzle.rows, [[1, 1], [3], [1]]);
  check('세로 힌트', puzzle.cols, [[2], [1], [3]]);
  check('이름을 들고 있다', puzzle.name, '시험');

  const cells = R.newState(puzzle);
  check('처음에는 모두 비어 있다', cells.every((n) => n === R.EMPTY), true);
  check('빈 판은 끝이 아니다', R.isDone(puzzle, cells), false);

  const done = answer.map((n) => (n ? R.FILL : R.EMPTY));
  check('정답이면 끝', R.isDone(puzzle, done), true);

  // 아님 표시를 아무리 채워도 판정은 달라지지 않는다.
  const marked = answer.map((n) => (n ? R.FILL : R.MARK));
  check('아님 표시는 판정에 끼어들지 않는다', R.isDone(puzzle, marked), true);

  const wrong = done.slice();
  wrong[2] = R.EMPTY;
  wrong[6] = R.FILL;
  check('힌트가 어긋나면 끝이 아니다', R.isDone(puzzle, wrong), false);
  check('정답에 없는데 칠한 칸을 찾는다', R.wrongCells(puzzle, wrong), [6]);
  check('맞게 칠한 판에는 틀린 칸이 없다', R.wrongCells(puzzle, done), []);
}

// 답이 여럿인 판도 힌트만 맞으면 끝으로 친다 — 생성기가 그런 판을 내보내지 않는다.
{
  const puzzle = R.puzzleFrom(grid(['#.', '.#']), 2, 2, '');
  const other = grid(['.#', '#.']).map((n) => (n ? R.FILL : R.EMPTY));
  check('힌트를 만족하는 다른 배치도 끝', R.isDone(puzzle, other), true);
}

{
  const puzzle = R.puzzleFrom(grid(['##.', '...', '.##']), 3, 3, '');
  const cells = R.newState(puzzle);
  cells[0] = R.FILL;
  cells[1] = R.FILL;
  check('한 줄만 맞을 수도 있다', [
    R.rowDone(puzzle, cells, 0),
    R.rowDone(puzzle, cells, 2),
    R.colDone(puzzle, cells, 0),
  ], [true, false, true]);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

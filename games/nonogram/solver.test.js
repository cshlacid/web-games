'use strict';

// 실행: node games/nonogram/solver.test.js
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

const grid = (rows) => [].concat(...rows.map((row) => row.split('').map((ch) => (ch === '#' ? 1 : 0))));
const blank = (n) => new Array(n).fill(R.EMPTY);
// 0 모름 · 1 칠함 · 2 아님
const show = (line) => line.map((n) => '.#x'[n]).join('');

// 다섯 칸에 넷짜리 덩어리 하나 — 어디에 놓아도 가운데 셋은 칠해진다.
check('가운데가 겹치는 칸', show(S.narrow([4], blank(5))), '.###.');
check('꽉 차면 전부 정해진다', show(S.narrow([5], blank(5))), '#####');
check('빈 줄은 전부 아님', show(S.narrow([0], blank(5))), 'xxxxx');
check('여유가 없으면 한 줄로 정해진다', show(S.narrow([2, 2], blank(5))), '##x##');
check('넉넉하면 아무것도 못 정한다', show(S.narrow([1], blank(5))), '.....');

// 이미 아는 칸이 있으면 거기서 더 좁힌다.
{
  const known = blank(5);
  known[0] = R.FILL;
  check('칠한 칸에서 이어 좁힌다', show(S.narrow([2], known)), '##xxx');
}
{
  // 일곱 칸 가운데를 막으면 셋짜리는 양 끝으로만 갈 수 있다 — 칠할 칸은 못 정해도
  // 막힌 칸은 그대로 아님으로 남는다.
  const known = blank(7);
  known[3] = R.MARK;
  check('아님 표시도 좁히기에 쓰인다', show(S.narrow([3], known)), '...x...');
}

// 다섯 칸에서 가운데를 막으면 셋짜리가 들어갈 자리가 없다.
check('놓을 자리가 없으면 null',
  S.narrow([3], [R.EMPTY, R.EMPTY, R.MARK, R.EMPTY, R.EMPTY]), null);
check('전부 아님이면 null', S.narrow([3], [R.MARK, R.MARK, R.MARK, R.MARK, R.MARK]), null);

// --- 판 풀기 ---
{
  const puzzle = R.puzzleFrom(grid(['.#.#.', '#####', '#####', '.###.', '..#..']), 5, 5, '하트');
  const cells = S.logicSolve(puzzle);
  check('논리만으로 다 채운다', cells.every((n) => n !== R.EMPTY), true);
  check('푼 결과가 정답과 같다',
    cells.map((n) => (n === R.FILL ? 1 : 0)), puzzle.answer);
  check('논리로 풀리는 판이라고 답한다', S.logicOnly(puzzle), true);
}

// 답이 둘인 판은 논리로 끝까지 가지 못한다(대각선 두 가지).
{
  const puzzle = R.puzzleFrom(grid(['#.', '.#']), 2, 2, '');
  check('답이 갈리는 판은 못 푼다', S.logicOnly(puzzle), false);
}

// --- 힌트 ---
{
  const puzzle = R.puzzleFrom(grid(['##.', '.##', '#..']), 3, 3, '');
  const cells = R.newState(puzzle);
  const hint = S.nextCell(puzzle, cells);
  check('힌트는 모르는 칸을 알려 준다', cells[hint.at], R.EMPTY);
  check('힌트가 정답과 맞는다',
    hint.state === R.FILL ? puzzle.answer[hint.at] === 1 : puzzle.answer[hint.at] === 0, true);

  // 잘못 칠한 칸이 섞여 있어도 힌트는 나온다.
  const messy = R.newState(puzzle);
  messy[2] = R.FILL;
  check('틀린 칸이 있어도 막히지 않는다', S.nextCell(puzzle, messy) !== null, true);

  const full = puzzle.answer.map((n) => (n ? R.FILL : R.MARK));
  check('다 푼 판에는 힌트가 없다', S.nextCell(puzzle, full), null);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

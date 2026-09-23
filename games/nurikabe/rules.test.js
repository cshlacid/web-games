'use strict';

// 실행: node games/nurikabe/rules.test.js
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

const S = R.SEA;
const _ = R.EMPTY;
const o = R.DOT;

{
  check('판 읽기', Array.from(R.parse(1, 3, '2..').clues), [2, 0, 0]);
  check('판 적기', R.encode(Int8Array.from([2, 0, 0])), '2..');
  check('이웃 표', R.neighborsTable(2, 3)[4], [1, 3, 5]);
  check('2×2 묶음 수', R.squares(3, 3).length, 4);
}

// 3×3: 가운데 줄이 바다, 위아래로 섬 셋씩.
//   3 . .       섬 섬 섬
//   . . .   →   바 바 바
//   . . 3       섬 섬 섬
{
  const puzzle = R.parse(3, 3, '3.......3');
  const answer = [_, _, _, S, S, S, _, _, _];
  check('맞는 판은 풀린 판', R.inspect(puzzle, answer).solved, true);
  check('점은 섬으로 본다', R.inspect(puzzle, [o, o, o, S, S, S, _, o, _]).solved, true);
  check('닫힌 섬의 숫자는 다 맞은 것', R.inspect(puzzle, answer).done, [0, 8]);

  const small = [_, S, S, S, S, S, _, _, _];
  const state = R.inspect(puzzle, small);
  check('섬이 모자라면 안 풀린 판', state.solved, false);
  check('닫혔는데 칸 수가 틀리면 틀린 숫자', state.wrong, [0]);
  check('2×2 바다', state.pools, [1, 2, 4, 5]);
}

{
  // 가운데 줄로 이어진 바다와, 그 위아래의 1짜리 섬 둘.
  const puzzle = R.parse(3, 3, '.1.....1.');
  const marks = [S, _, S, S, S, S, S, _, S];
  check('이어진 바다는 풀린 판', R.inspect(puzzle, marks).solved, true);
  const cut = R.parse(1, 3, '.1.');
  check('끊긴 바다는 안 풀린 판', R.inspect(cut, [S, _, S]).solved, false);
}

{
  // 숫자 둘이 한 섬에 든 판.
  const puzzle = R.parse(1, 3, '1.1');
  check('숫자 둘이 한 섬이면 안 풀린 판', R.inspect(puzzle, [_, _, _]).solved, false);
  check('숫자 칸은 바다로 칠해도 섬이다', R.inspect(R.parse(1, 2, '1.'), [S, S]).solved, true);
}

{
  // 처음 판은 판 전체가 숫자 여럿을 품은 섬 하나다. 아직 칠하는 중이니 틀렸다고 하지 않는다.
  const puzzle = R.parse(3, 3, '3.......3');
  check('처음 판에는 틀린 숫자가 없다', R.inspect(puzzle, new Array(9).fill(_)).wrong, []);
  // 점만으로 이어 채운 덩어리에 숫자가 둘이면 더 나눌 수 없다.
  const joined = R.parse(1, 3, '1.1');
  check('점으로 이은 숫자 둘은 틀렸다', R.inspect(joined, [_, o, _]).wrong, [0, 2]);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

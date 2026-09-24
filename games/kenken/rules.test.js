'use strict';

// 실행: node games/kenken/rules.test.js
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

check('덧셈', R.holds('+', 6, [1, 2, 3]), true);
check('곱셈', R.holds('*', 6, [1, 2, 3]), true);
check('뺄셈은 순서를 가리지 않는다', [R.holds('-', 2, [1, 3]), R.holds('-', 2, [3, 1])], [true, true]);
check('나눗셈은 순서를 가리지 않는다', [R.holds('/', 3, [2, 6]), R.holds('/', 3, [6, 2])], [true, true]);
check('나누어떨어지지 않으면 아니다', R.holds('/', 2, [3, 5]), false);
check('한 칸짜리', [R.holds('=', 4, [4]), R.holds('=', 4, [3])], [true, false]);

// 2×2: 윗줄 [1 2]는 한 케이지(+3), 아랫줄은 칸마다 한 칸짜리.
const code = '0012|+3,=2,=1';
const p = R.parse(2, code);
check('케이지 수', p.cages.length, 3);
check('케이지 칸', p.cages.map((c) => c.cells), [[0, 1], [2], [3]]);
check('연산과 목표', p.cages.map((c) => c.op + c.target), ['+3', '=2', '=1']);
check('다시 적으면 같은 글자', R.encode(p), code);

check('빈 판', R.inspect(p, [0, 0, 0, 0]), { dup: [], wrong: [], done: [], solved: false });
check('줄에서 겹치는 숫자', R.inspect(p, [1, 1, 0, 0]).dup, [0, 1]);
check('셈이 틀린 케이지', R.inspect(p, [1, 1, 0, 0]).wrong, [0]);
check('덜 찬 케이지는 판정하지 않는다', R.inspect(p, [1, 0, 0, 0]).wrong, []);
check('다 푼 판', R.inspect(p, [1, 2, 2, 1]), { dup: [], wrong: [], done: [0, 1, 2], solved: true });
// 셈은 맞아도 줄이 겹치면 끝이 아니다.
check('줄이 겹치면 풀린 것이 아니다', R.inspect(R.parse(2, '0011|+3,+3'), [1, 2, 1, 2]).solved, false);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

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

{
  // 3×3 윗줄 두 칸 +4: 같은 줄이라 2·2는 안 된다.
  const q = R.parse(3, '001222222|+4,=3,+12');
  check('조합: 같은 줄은 겹치지 않는다', R.combos(q, 0, new Array(9).fill(0)), [{ digits: [1, 3], live: true }]);
  // ㄱ자 세 칸 ×4(4×4): 1·1·4는 두 1이 대각선이면 되고, 1·2·2도 된다.
  const r = R.parse(4, '0011011122222222|*4,+10,+30');
  const all = R.combos(r, 0, new Array(16).fill(0)).map((c) => c.digits.join(''));
  check('조합: 대각선에는 같은 숫자가 온다', all, ['114', '122']);
  const values = new Array(16).fill(0);
  values[0] = 4;
  check('조합: 넣은 숫자와 맞지 않으면 흐린다',
    R.combos(r, 0, values).map((c) => c.live), [true, false]);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

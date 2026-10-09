'use strict';

// 실행: node games/whodunit/rules.test.js
const R = require('./rules.js');

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) passed++;
  else { failed++; console.log(`실패: ${name}`); }
}

const puzzle = { jobs: Array.from({ length: R.N }, (_, i) => i % 3) };
const size = (kind, arg) => R.popcount(R.setMask({ kind, arg }, puzzle));

check('모서리의 이웃은 셋', size('N', 0) === 3);
check('가장자리의 이웃은 다섯', size('N', 4) === 5);
check('안쪽의 이웃은 여덟', size('N', 5) === 8);
check('행은 넷, 열은 다섯', size('R', 2) === 4 && size('C', 1) === 5);
check('위·아래·왼쪽·오른쪽', size('A', 9) === 2 && size('B', 9) === 2 && size('L', 9) === 1 && size('G', 9) === 2);
check('가장자리 열넷, 모서리 넷', size('E') === 14 && size('K') === 4);
check('직업', size('J', 0) === 7);
check('직업이 낀 무리', R.popcount(R.setMask({ kind: 'R', arg: 0, job: 1 }, puzzle)) === 1
  && R.popcount(R.setMask({ kind: 'C', arg: 0, job: 0 }, puzzle)) === 2);

for (const code of ['=N5c2', '>R1R3i', '~C0C2c', '%R4i1', '&C3c', '=Ec5', '=J2i0', '=G12c1', '=R2j1c1', '^N5j0i', '>R0j2R1j2c']) {
  check(`단서 글자 ${code}`, R.encodeClue(R.parseClue(code)) === code);
}

// 0·1·5번이 범인: 0행은 범인 둘, 1행은 범인 하나.
const crim = R.maskOf([0, 1, 5]);
const clue = (code) => R.attach(R.parseClue(code), puzzle);
check('셈', R.holds(clue('=R0c2'), crim) && R.holds(clue('=R0i2'), crim) && !R.holds(clue('=R0c1'), crim));
check('이웃', R.holds(clue('=N4c3'), crim));
check('비교', R.holds(clue('>R0R1c'), crim) && !R.holds(clue('>R1R0c'), crim) && R.holds(clue('~R2R3c'), crim));
check('홀짝', R.holds(clue('%R1c1'), crim) && R.holds(clue('%R0c0'), crim));
check('범인과 무고 비교', R.holds(clue('^R0c'), R.maskOf([0, 1, 2])) && !R.holds(clue('^R0c'), crim) && R.holds(clue('^R1i'), crim));
{
  const c = clue('^R0c');
  check('비교: 남은 사람으로 넘길 수 있다', R.possible(c, R.maskOf([0]), 0));
  check('비교: 같아지면 못 넘긴다', !R.possible(c, R.maskOf([0, 1]), 0));
  check('비교: 남은 사람으로 못 넘긴다', !R.possible(c, R.maskOf([0, 1, 2]), R.maskOf([0])));
}
check('이어짐', R.holds(clue('&R0c'), crim) && !R.holds(clue('&C1c'), R.maskOf([1, 9])) && R.holds(clue('&C1c'), R.maskOf([1, 5])));

// 일부만 정해졌을 때.
{
  const c = clue('=R0c2');
  check('아직 될 수 있다', R.possible(c, R.maskOf([0]), R.maskOf([0])));
  check('이미 넘쳤다', !R.possible(c, R.maskOf([0, 1, 2]), R.maskOf([0, 1, 2])));
  check('남은 사람으로 못 채운다', !R.possible(c, R.maskOf([0, 1, 2]), 0));
}

const code = '0123456789abcdefghij|01234567012345670123|10000011111101011010|4|' + Array(20).fill('=N5c2').join(';');
check('판 자료를 다시 적으면 같은 글자', R.encode(R.parse(code)) === code);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

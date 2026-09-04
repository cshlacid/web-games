'use strict';

// 실행: node games/queens/rules.test.js
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

// 4×4 판 하나. 영역은 가로 띠 넷이라 행 제약과 영역 제약이 같아진다 — 규칙
// 하나하나를 따로 보기에 편한 모양이다.
const stripes = { size: 4, regions: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3] };

// --- 칸 상태 순환 ---
const b = R.board(stripes);
const s = R.reset(b, R.newState(b));
check('빈칸에서 X로', R.cycle(b, s, 0), R.MARK);
check('X에서 왕관으로', R.cycle(b, s, 0), R.CROWN);
check('왕관에서 빈칸으로', R.cycle(b, s, 0), R.EMPTY);
check('빈칸으로 돌아오면 왕관 수도 줄어든다', s.crowns, 0);

// --- 충돌 판정 ---
check('떨어져 있으면 충돌이 아니다', R.validate(stripes, [0, 6]).bad, []);
check('같은 열은 충돌', R.validate(stripes, [0, 8]).bad, [0, 8]);
check('같은 행은 충돌', R.validate(stripes, [0, 2]).bad, [0, 2]);
check('대각으로 닿으면 충돌', R.validate(stripes, [0, 5]).bad, [0, 5]);
check('대각이라도 한 칸 건너면 괜찮다', R.validate(stripes, [0, 9]).bad, []);
check('충돌에 낀 왕관을 모두 돌려준다', R.validate(stripes, [0, 2, 8]).bad, [0, 2, 8]);

// 같은 영역인데 행도 열도 다르고 닿지도 않는 경우. 영역 제약만 걸린다.
const blob = { size: 4, regions: [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3] };
check('같은 영역이면 떨어져 있어도 충돌', R.validate(blob, [0, 5]).bad, [0, 5]);

// --- 완성 판정 ---
// 가로 띠 넷에 4×4라면 열이 겹치지 않고 위아래로 닿지도 않는 배치가 있다.
check('행·열·영역이 하나씩이고 닿지 않으면 완성',
  R.validate(stripes, [1, 7, 8, 14]).done, true);
check('왕관이 모자라면 완성이 아니다', R.validate(stripes, [1, 7, 8]).done, false);

// --- 영역 모양 ---
check('이어진 영역', R.connected(4, [0, 1, 5]), true);
check('끊어진 영역', R.connected(4, [0, 2]), false);
check('대각으로만 붙은 영역은 끊어진 것', R.connected(4, [0, 5]), false);

check('띠 넷은 제대로 된 판', R.wellFormed(stripes), true);
check('영역 번호가 격자 밖이면 판이 아니다',
  R.wellFormed({ size: 4, regions: [4, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3] }), false);
check('끊어진 영역이 있으면 판이 아니다',
  R.wellFormed({ size: 4, regions: [0, 1, 1, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3] }), false);
check('칸 수가 맞지 않으면 판이 아니다', R.wellFormed({ size: 4, regions: [0, 1, 2, 3] }), false);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

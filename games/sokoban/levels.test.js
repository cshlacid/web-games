'use strict';

// 실행: node games/sokoban/levels.test.js
//
// 판 자료를 손으로 고치다 글자 하나를 잘못 넣으면 화면에서는 판이 조용히 망가진다
// (상자가 벽 밖에 놓이거나 목표가 하나 모자라 끝나지 않는 판). 여기서 먼저 걸러 낸다.
const R = require('./rules.js');
const { LEVELS } = require('./levels.js');

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) passed++;
  else { failed++; console.log(`실패: ${name}`); }
}

check('155판', LEVELS.length === 155);

LEVELS.forEach((text, index) => {
  const no = index + 1;
  const people = (text.match(/[@+]/g) || []).length;
  check(`${no}번: 사람은 하나`, people === 1);
  check(`${no}번: 모르는 글자가 없다`, /^[ #.$*@+|]+$/.test(text));

  for (const shown of [text, R.upright(text)]) {
    const level = R.parse(shown);
    const goals = level.goals.reduce((sum, v) => sum + v, 0);
    check(`${no}번: 상자와 목표 수가 같다`, level.start.boxes.length === goals && goals > 0);
    // 155번은 벽에 갇힌 칸에 목표 위 상자를 장식으로 박아 두었다. 사람이 닿지 못하는
    // 상자는 이미 목표 위에 있어야 판이 풀린다.
    check(`${no}번: 닿지 못하는 상자는 목표 위에 있다`,
      level.start.boxes.every((at) => level.floor[at] || level.goals[at]));
    check(`${no}번: 닿지 못하는 목표에는 상자가 있다`,
      level.goals.every((v, at) => !v || level.floor[at] || level.start.boxes.includes(at)));
    check(`${no}번: 처음부터 끝난 판이 아니다`, !R.isDone(level, level.start));

    // 바닥이 테두리에 닿으면 벽이 트인 판이다. 사람이 판 밖으로 걸어 나간다.
    let closed = true;
    level.floor.forEach((v, at) => {
      const x = at % level.w;
      const y = Math.floor(at / level.w);
      if (v && (x === 0 || y === 0 || x === level.w - 1 || y === level.h - 1)) closed = false;
    });
    check(`${no}번: 벽이 닫혀 있다`, closed);
  }

  // 세운 판이 너무 넓게 남지 않는다. 폰 폭에서 칸이 손가락만큼은 되어야 한다.
  const grid = R.rows(R.upright(text));
  check(`${no}번: 세운 판의 폭이 ${R.WIDE}칸을 넘으면 높이보다 좁다`,
    grid[0].length <= R.WIDE || grid[0].length <= grid.length);
});

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

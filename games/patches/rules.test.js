'use strict';

// 실행: node games/patches/rules.test.js
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

// 3×3을 가로 띠 셋으로 나눈 판. 규칙 하나하나를 따로 보기에 편한 모양이다.
const stripes = {
  size: 3,
  clues: [
    { cell: 0, area: 3, shape: R.WIDE },
    { cell: 4, area: 3, shape: R.WIDE },
    { cell: 8, area: 3, shape: R.WIDE },
  ],
  solution: [{ r: 0, c: 0, w: 3, h: 1 }, { r: 1, c: 0, w: 3, h: 1 }, { r: 2, c: 0, w: 3, h: 1 }],
};

// --- 모양 ---
check('가로로 길면 wide', R.shapeOf(3, 1), R.WIDE);
check('세로로 길면 tall', R.shapeOf(1, 3), R.TALL);
check('같으면 square', R.shapeOf(2, 2), R.SQUARE);

// --- 조각이 덮는 칸 ---
check('2×2가 덮는 칸', R.cells(3, { r: 0, c: 0, w: 2, h: 2 }), [0, 1, 3, 4]);

// --- 어긋난 조각 ---
const b = R.board(stripes);
check('단서에 맞는 조각은 어긋나지 않는다', R.faultOf(b, { r: 0, c: 0, w: 3, h: 1 }), null);
check('단서가 없는 조각', R.faultOf(b, { r: 1, c: 0, w: 1, h: 1 }), 'empty');
check('단서를 둘 품은 조각', R.faultOf(b, { r: 0, c: 0, w: 3, h: 2 }), 'many');

// 칸 수만 어긋나는 경우와 모양만 어긋나는 경우를 갈라 본다.
const one = { size: 3, clues: [{ cell: 0, area: 3, shape: null }], solution: [] };
check('칸 수가 다르면 area', R.faultOf(R.board(one), { r: 0, c: 0, w: 2, h: 1 }), 'area');
const onlyShape = { size: 3, clues: [{ cell: 0, area: null, shape: R.TALL }], solution: [] };
check('모양이 다르면 shape', R.faultOf(R.board(onlyShape), { r: 0, c: 0, w: 2, h: 1 }), 'shape');
check('자유 단서는 아무 모양이나 받는다',
  R.faultOf(R.board({ size: 3, clues: [{ cell: 0, area: null, shape: null }], solution: [] }),
    { r: 0, c: 0, w: 2, h: 1 }), null);

// --- 조각 놓기와 겹침 ---
const s = R.reset(b, R.newState());
R.add(b, s, { r: 0, c: 0, w: 3, h: 1 });
check('놓은 조각이 칸을 덮는다', [...s.cover.slice(0, 3)], [0, 0, 0]);
// 겹치게 그리면 먼저 있던 조각이 지워진다. 지우고 다시 그리게 하면 손이 두 번 간다.
check('겹쳐 그리면 먼저 것이 지워진다', R.add(b, s, { r: 0, c: 0, w: 1, h: 2 }), 1);
check('지워진 자리는 비어 있다', s.cover[1], -1);
check('판 밖으로는 못 놓는다', R.add(b, s, { r: 2, c: 2, w: 2, h: 1 }), -1);

R.reset(b, s);
R.add(b, s, { r: 0, c: 0, w: 3, h: 1 });
check('덮인 칸을 누르면 그 조각이 지워진다', R.removeAt(b, s, 1), true);
check('빈 칸에는 지울 것이 없다', R.removeAt(b, s, 1), false);

// --- 완성 판정 ---
check('띠 셋을 다 그리면 완성',
  R.validate(stripes, stripes.solution).done, true);
check('한 줄이 비면 완성이 아니다',
  R.validate(stripes, stripes.solution.slice(0, 2)).done, false);
check('다 덮어도 어긋난 조각이 있으면 완성이 아니다',
  R.validate(stripes, [{ r: 0, c: 0, w: 3, h: 2 }, { r: 2, c: 0, w: 3, h: 1 }]).done, false);

// --- 색 ---
const colors = R.colorize(stripes, 9);
check('이웃한 조각은 다른 색', colors[0] === colors[1] || colors[1] === colors[2], false);
check('색은 팔레트 안에 있다', colors.every((c) => c >= 0 && c < 9), true);

// --- 판 모양 ---
check('띠 셋은 제대로 된 판', R.wellFormed(stripes), true);
check('칸이 남으면 판이 아니다',
  R.wellFormed({ ...stripes, clues: stripes.clues.slice(0, 2), solution: stripes.solution.slice(0, 2) }),
  false);
check('단서와 칸 수가 어긋나면 판이 아니다',
  R.wellFormed({ ...stripes, clues: [{ cell: 0, area: 2, shape: null }, ...stripes.clues.slice(1)] }),
  false);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

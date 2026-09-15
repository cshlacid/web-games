'use strict';

// 실행: node games/defense/art.test.js
//
// 그림 자료 검사. **`art.js`는 node에서만 돌고 `sprites.js`는 브라우저에서만 돈다.**
// 둘이 같은 차례를 각자 적고 있어 한쪽만 고치면 어긋나는데, 화면에서는 그것이
// "칸마다 아랫줄이 비친다"나 "영웅이 안 보인다"로 나타나 원인을 찾기 어렵다.
const fs = require('fs');
const path = require('path');
const D = require('./data.js');
const ART = require('./art.js');
const SP = require('./sprites.js');

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

check('시트와 그림 자료의 차례가 같다', SP.SHEET.order, ART.ORDER);
check('칸 크기가 같다', SP.SHEET.cell, ART.CELL);
check('열 수가 같다', SP.SHEET.cols, ART.COLS);

const everyone = [...Object.keys(D.UNITS), ...Object.keys(D.FOES)];
check('모든 캐릭터와 적에게 그림이 있다',
  everyone.filter((k) => !SP.SHEET.order.includes(k)), []);
check('모든 캐릭터와 적에게 도형이 있다',
  everyone.filter((k) => !ART.FIGURES[k]), []);
check('시트에 자료 없는 칸이 없다',
  SP.SHEET.order.filter((k) => !D.UNITS[k] && !D.FOES[k]), []);
check('사격선 색이 모두 있다', SP.SHEET.order.filter((k) => !SP.TINT[k]), []);

check('영웅 셋도 시트에 있다', D.HERO_KEYS.filter((k) => !SP.SHEET.order.includes(k)), []);
check('차례에 겹치는 것이 없다', new Set(SP.SHEET.order).size, SP.SHEET.order.length);

// 칸 자리를 자료대로 뽑는가.
const last = SP.SHEET.order.length - 1;
check('첫 칸은 왼쪽 위', SP.slot(SP.SHEET.order[0]), { sx: 0, sy: 0, s: SP.SHEET.cell });
check('마지막 칸 자리', SP.slot(SP.SHEET.order[last]), {
  sx: (last % SP.SHEET.cols) * SP.SHEET.cell,
  sy: Math.floor(last / SP.SHEET.cols) * SP.SHEET.cell,
  s: SP.SHEET.cell,
});
check('없는 이름은 자리가 없다', SP.slot('없는놈'), null);

// **구워 둔 시트가 자료와 맞는가.** 그림을 고치고 굽는 것을 잊으면 여기서 걸린다.
const png = fs.readFileSync(path.join(__dirname, SP.SHEET.src));
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
const rows = Math.ceil(SP.SHEET.order.length / SP.SHEET.cols);
check('시트 그림의 크기가 자료와 맞는다', [width, height],
  [SP.SHEET.cols * SP.SHEET.cell, rows * SP.SHEET.cell]);
check('시트가 지나치게 크지 않다', png.length < 700 * 1024, true);

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);

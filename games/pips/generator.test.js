'use strict';

// 실행: node games/pips/generator.test.js
//
// 구워 둔 판을 모두 다시 푼다. 자료를 손으로 고치면 여기서 걸린다.
const R = require('./rules.js');
const S = require('./solver.js');
const B = require('./bake.js');
const G = require('./generator.js');

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) passed++;
  else { failed++; console.log(`실패: ${name}`); }
}

for (const level of Object.keys(B.LEVELS)) {
  const spec = B.LEVELS[level];
  const list = G.PUZZLES[level];
  check(`${level}: ${spec.count}판`, list && list.length === spec.count);
  check(`${level}: 겹치는 판이 없다`, new Set(list).size === list.length);

  list.forEach((code, id) => {
    const name = `${level} ${id}번`;
    const p = R.parse(code);
    check(`${name}: 다시 적으면 같은 글자`, R.encode(p) === code);
    check(`${name}: 상자 크기`, p.w <= spec.box && p.h <= spec.box);
    check(`${name}: 도미노 수`, p.tiles.length >= spec.tiles[0] && p.tiles.length <= spec.tiles[1]
      && p.pos.length === p.tiles.length * 2);
    check(`${name}: 같은 도미노가 없다`,
      new Set(p.tiles.map(([x, y]) => `${Math.min(x, y)}${Math.max(x, y)}`)).size === p.tiles.length);
    const result = S.solve(p, { trial: spec.maxTrials > 0, maxTrials: spec.maxTrials });
    check(`${name}: 찍지 않고 풀린다`, result.solved);
    check(`${name}: 가정 수가 난이도에 맞다`, result.trials <= spec.maxTrials);
  });
}

{
  const first = G.pick('easy', -1, () => 0);
  check('같은 판을 잇달아 내지 않는다', G.pick('easy', first.id, () => 0).id !== first.id);
  check('고른 판', first.tiles.length >= 5 && first.pos.length === first.tiles.length * 2);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

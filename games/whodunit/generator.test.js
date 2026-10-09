'use strict';

// 실행: node games/whodunit/generator.test.js
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

function play(p, trial) {
  let revealed = 1 << p.start;
  for (;;) {
    const d = S.deduce(p, revealed, { trial });
    if (d.known === revealed) return revealed;
    revealed = d.known;
  }
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
    check(`${name}: 이름은 목록 순서대로`, p.names.every((n, k) => n < B.NAME_POOL && (k === 0 || n > p.names[k - 1])));
    check(`${name}: 단서는 모두 참`, p.clues.every((clue) => R.holds(clue, p.truth)));
    check(`${name}: 같은 단서가 없다`, new Set(p.clues.map(R.encodeClue)).size === R.N);
    check(`${name}: 난이도에 없는 단서가 없다`, p.clues.every((clue) => (clue.type === '=' || spec.extra.includes(clue.type))
      && (spec.types.includes('JX') || clue.sets.every((set) => set.job === undefined))));
    check(`${name}: 끝까지 밝혀진다`, play(p, spec.trial) === R.FULL);
  });
}

{
  const first = G.pick('easy', -1, () => 0);
  check('같은 판을 잇달아 내지 않는다', G.pick('easy', first.id, () => 0).id !== first.id);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

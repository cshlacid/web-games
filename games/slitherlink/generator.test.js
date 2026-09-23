'use strict';

// 실행: node games/slitherlink/generator.test.js
//
// 구워 둔 판을 모두 다시 푼다. 자료를 손으로 고치면 여기서 걸린다. 어려움 예순 판을
// 가정까지 써서 푸느라 몇 초 걸린다.
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
  const set = G.PUZZLES[level];
  check(`${level}: 크기`, set && set.size === spec.size);
  check(`${level}: ${spec.count}판`, set.list.length === spec.count);
  check(`${level}: 겹치는 판이 없다`, new Set(set.list).size === set.list.length);

  set.list.forEach((code, id) => {
    const name = `${level} ${id}번`;
    check(`${name}: 글자 수`, code.length === spec.size * spec.size && /^[0-3.]+$/.test(code));
    check(`${name}: 숫자가 너무 많지 않다`, code.replace(/\./g, '').length <= code.length * B.MAX_CLUES);
    const puzzle = R.parse(spec.size, spec.size, code);
    // 쉬움·보통은 가정 없이, 어려움은 가정을 써서 끝까지 풀려야 한다.
    const result = S.solve(puzzle, { trial: spec.trial });
    check(`${name}: 풀린다`, result.solved);
    if (level === 'hard') check(`${name}: 가정이 든다`, result.trials > 0);
  });
}

{
  // 방금 푼 판은 건너뛴다.
  const first = G.pick('easy', -1, () => 0);
  const next = G.pick('easy', first.id, () => 0);
  check('같은 판을 잇달아 내지 않는다', first.id !== next.id);
  check('고른 판의 크기', next.rows === 5 && next.cols === 5 && next.clues.length === 25);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

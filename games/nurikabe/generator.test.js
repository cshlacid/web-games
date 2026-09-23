'use strict';

// 실행: node games/nurikabe/generator.test.js
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
  const set = G.PUZZLES[level];
  check(`${level}: 크기`, set && set.size === spec.size);
  check(`${level}: ${spec.count}판`, set.list.length === spec.count);
  check(`${level}: 겹치는 판이 없다`, new Set(set.list).size === set.list.length);

  set.list.forEach((code, id) => {
    const name = `${level} ${id}번`;
    check(`${name}: 글자`, code.length === spec.size * spec.size && /^[1-9.]+$/.test(code));
    const puzzle = R.parse(spec.size, spec.size, code);
    check(`${name}: 섬은 ${spec.maxIsland}칸까지`, puzzle.clues.every((k) => k <= spec.maxIsland));
    const result = S.solve(puzzle, { trial: true });
    check(`${name}: 찍지 않고 풀린다`, result.solved);
    check(`${name}: 가정 수가 난이도에 맞다`,
      result.trials <= spec.maxTrials && result.trials >= (spec.minTrials || 0));
  });
}

{
  const first = G.pick('easy', -1, () => 0);
  check('같은 판을 잇달아 내지 않는다', G.pick('easy', first.id, () => 0).id !== first.id);
  check('고른 판의 크기', first.rows === 6 && first.cols === 6 && first.clues.length === 36);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

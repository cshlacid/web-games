'use strict';

// 실행: node games/slitherlink/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const B = require('./bake.js');

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

const lines = (edges) => Array.from(edges, (v) => (v === R.LINE ? 1 : 0)).join('');

{
  // 0은 네 변이 모두 X다.
  const puzzle = R.parse(2, 2, '0...');
  const geo = R.geometry(2, 2);
  const step = S.next(puzzle, new Uint8Array(geo.edgeCount));
  check('0 칸의 이유', step.why, { code: 'cellFull', cell: 0, clue: 0 });
  check('0 칸의 네 변은 X', [step.value, step.edges.length], [R.CROSS, 4]);
}

{
  // 3 둘레에 선 셋이 이미 있으면 나머지 하나는 X.
  const geo = R.geometry(1, 1);
  const edges = new Uint8Array(geo.edgeCount);
  edges[0] = R.LINE;
  edges[1] = R.LINE;
  edges[2] = R.LINE;
  const step = S.next(R.parse(1, 1, '3'), edges);
  check('찬 칸은 나머지가 X', [step.why.code, step.edges, step.value], ['cellFull', [3], R.CROSS]);
}

{
  // 한 선이 들어온 점에 길이 하나 남았으면 그리로 이어진다.
  const geo = R.geometry(2, 2);
  const edges = new Uint8Array(geo.edgeCount);
  const v = geo.vid(0, 0);
  edges[geo.hid(0, 0)] = R.LINE;
  const step = S.next(R.parse(2, 2, '....'), edges);
  check('모서리 점은 이어진다', [step.why.code, step.why.vertex, step.edges], ['vertexContinue', v, [geo.vtid(0, 0)]]);
}

{
  // 숫자 없는 판은 답이 여럿이라 풀렸다고 하면 안 된다.
  check('숫자 없는 판은 안 풀린다', S.solve(R.parse(3, 3, '.........')).solved, false);
  // 1×1에 3은 어떤 고리로도 맞출 수 없다.
  check('모순인 판', S.solve(R.parse(1, 1, '3')).solved, false);
}

{
  // 구운 판처럼 만든 판: 규칙만으로 끝까지 풀리고, 그 답이 만든 고리와 같다.
  for (const [level, seeds] of [['easy', 20], ['normal', 10]]) {
    let same = 0;
    let hinted = 0;
    let tried = 0;
    for (let seed = 1; tried < seeds; seed++) {
      const one = B.make(level, seed);
      if (!B.accept(level, one)) continue;
      tried++;
      const size = B.LEVELS[level].size;
      const puzzle = R.parse(size, size, one.code);
      const result = S.solve(puzzle);
      if (result.solved && lines(result.edges) === lines(one.answer)) same++;

      // 힌트를 차례로 받아 끝까지 가면 같은 답에 닿는다. 힌트가 막히면 안 된다.
      const edges = new Uint8Array(result.edges.length);
      for (let guard = 0; guard < 2000; guard++) {
        const step = S.next(puzzle, edges);
        if (!step) break;
        for (const e of step.edges) edges[e] = step.value;
      }
      if (lines(edges) === lines(one.answer)) hinted++;
    }
    check(`${level}: 풀이가 만든 고리와 같다`, same, seeds);
    check(`${level}: 힌트만으로 끝까지 간다`, hinted, seeds);
  }
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

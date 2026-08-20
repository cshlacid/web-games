'use strict';

// 미리 만들어 둘 판을 굽는다. 결과는 puzzles.js에 붙여 넣는 형태로 나온다.
//
// 실행: node games/doppelblock/bake.js <크기> <개수> [씨앗]
//
// 이 게임의 판은 무작위 정답을 뽑아 단서를 읽고 논리로 풀리는지 매겨 본 뒤
// 아니면 버리는 식으로 만든다. 크기가 커지면 합격률이 자릿수로 떨어져서
// (8×8은 0.04%) 브라우저에서 기다릴 수 없게 되는데, 그 크기만 여기서 굽는다.
//
// 오래 걸리므로 코어마다 씨앗을 달리해 여러 개를 동시에 돌리고 합치면 된다.
// 같은 판이 두 번 들어가지 않도록 단서로 걸러내지만, 그 걸러내기는 한
// 프로세스 안에서만 유효하다 — 합칠 때 다시 한 번 봐야 한다.

const R = require('./rules.js');
const S = require('./solver.js');
const G = require('./generator.js');

const n = Number(process.argv[2]);
const target = Number(process.argv[3]);
const seed = process.argv[4] === undefined ? (Date.now() & 0x7fffffff) : Number(process.argv[4]);

if (!Number.isInteger(n) || n < 4 || !Number.isInteger(target) || target < 1) {
  console.error('사용: node games/doppelblock/bake.js <크기> <개수> [씨앗]');
  process.exit(1);
}

// 7×7은 맞물림까지 필요한 판만 받는다 — 그 조합만 실시간으로 못 뽑는다.
// 8×8은 논리로 풀리기만 하면 받는다. 3만 판을 매겨 봐도 맞물림이 결정타가
// 되는 8×8은 나오지 않아서, 그것까지 요구하면 영영 안 끝난다.
const wanted = (level) => (n === 7 ? level === 'hard' : level !== null);

R.arrangementsBySize(n);
const rng = G.mulberry32(seed);
const seen = new Set();
const found = [];
const start = Date.now();
let tries = 0;
let lastLog = 0;

while (found.length < target) {
  const solution = R.randomSolution(n, rng);
  const { rowClues, colClues } = R.cluesOf(n, solution);
  tries++;

  const level = G.levelOf(S.grade(n, rowClues, colClues));
  if (wanted(level)) {
    const key = `${rowClues}|${colClues}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push(`  [[${rowClues}], [${colClues}]],`);
    }
  }

  if (Date.now() - lastLog > 30000) {
    lastLog = Date.now();
    const secs = Math.round((Date.now() - start) / 1000);
    console.error(`${n}×${n} 씨앗 ${seed}: ${found.length}/${target}판, 시도 ${tries}, ${secs}초`);
  }
}

console.error(`${n}×${n} 씨앗 ${seed}: 완료 ${found.length}판, 시도 ${tries}, ${Math.round((Date.now() - start) / 1000)}초`);
console.log(found.join('\n'));

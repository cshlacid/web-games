'use strict';

// 실행: node games/nurikabe/solver.test.js
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

const fresh = (puzzle) => S.start(S.context(puzzle));

{
  const puzzle = R.parse(3, 3, '....1....');
  const step = S.next(puzzle, fresh(puzzle));
  check('1은 곧 다 찬 섬', [step.why.code, step.value, step.cells.sort()], ['islandDone', S.SEA, [1, 3, 5, 7]]);
}
{
  const puzzle = R.parse(1, 3, '2.2');
  const step = S.next(puzzle, fresh(puzzle));
  check('두 섬 사이는 바다', [step.why.code, step.cells], ['twoIslands', [1]]);
}
{
  const puzzle = R.parse(3, 3, '2........');
  const step = S.next(puzzle, fresh(puzzle));
  check('닿을 수 없는 칸은 바다', [step.why.code, step.cells, step.value], ['unreachable', [2], S.SEA]);
}
{
  const puzzle = R.parse(3, 3, '.........');
  const cells = fresh(puzzle);
  cells[0] = S.SEA; cells[1] = S.SEA; cells[3] = S.SEA;
  // 숫자 없는 판이라 닿을 수 없는 칸이 먼저 걸리지 않도록, 2×2 규칙만 따로 본다.
  const step = S.next(R.parse(3, 3, '........9'), cells);
  check('2×2의 넷째 칸은 섬', [step.why.code, step.cells, step.value], ['pool', [4], S.LAND]);
}

// 해의 수를 끝까지 센다. 규칙으로 좁힌 뒤 모르는 칸 하나를 섬·바다로 나눠 내려간다.
function count(puzzle, limit) {
  let found = 0;
  (function rec(cells) {
    if (found >= limit) return;
    const r = S.solve(puzzle, { cells });
    if (r.broken) return;
    const u = r.cells.indexOf(S.UNKNOWN);
    if (u < 0) { if (r.solved) found++; return; }
    for (const v of [S.LAND, S.SEA]) {
      const next = r.cells.slice();
      next[u] = v;
      rec(next);
      if (found >= limit) return;
    }
  })(fresh(puzzle));
  return found;
}

{
  // 가정까지 써서 끝까지 푼 판은 답이 하나여야 한다. 규칙이 틀리면 답이 여럿인 판을
  // "풀었다"고 말하게 되는데, 그게 가장 위험한 오류다.
  // 고치기 전의 판(답이 여럿인 것이 대부분이다)으로 본다.
  let claimed = 0;
  let wrong = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const next = B.rng(seed);
    const shape = B.carve(B.LEVELS.easy, next);
    if (!shape) continue;
    const clues = new Int8Array(36);
    for (const cells of shape.islands) clues[cells[Math.floor(next() * cells.length)]] = cells.length;
    const puzzle = { rows: 6, cols: 6, clues };
    if (!S.solve(puzzle, { trial: true }).solved) continue;
    claimed++;
    if (count(puzzle, 2) !== 1) wrong++;
  }
  check('풀었다고 한 판이 여럿 있다', claimed > 5, true);
  check('풀었다고 한 판은 모두 답이 하나다', wrong, 0);
}

{
  // 구운 판처럼 만든 판: 힌트만 받아 가도 끝까지 가서 만든 답에 닿는다.
  let tried = 0;
  let reached = 0;
  for (let seed = 1; tried < 8 && seed < 200; seed++) {
    const one = B.make('easy', seed);
    if (!one) continue;
    tried++;
    const puzzle = R.parse(6, 6, one.code);
    const cells = fresh(puzzle);
    for (let guard = 0; guard < 200; guard++) {
      const step = S.next(puzzle, cells, { trial: true });
      if (!step) break;
      for (const i of step.cells) cells[i] = step.value;
    }
    if (cells.every((v, i) => (v === S.SEA) === !!one.sea[i])) reached++;
  }
  check('힌트만으로 만든 답에 닿는다', [tried, reached], [8, 8]);
}

{
  // 구워 둔 어려움 판: 힌트만으로 끝까지 가고, 가정은 모두 짧으며 가장 빨리 막히는 것이다.
  global.window = global.window || {};
  const P = require('./puzzles.js');
  const set = (P.PUZZLES || P).hard;
  let long = 0;
  let deeper = 0;
  let solved = 0;
  const take = 4;
  for (const code of set.list.slice(0, take)) {
    const puzzle = R.parse(set.size, set.size, code);
    const cells = fresh(puzzle);
    for (let guard = 0; guard < 400; guard++) {
      const step = S.next(puzzle, cells, { trial: true });
      if (!step) break;
      if (step.why.steps > S.SHORT_TRIAL) long++;
      if (step.why.steps && S.next(puzzle, cells, { trial: true, limit: step.why.steps - 1 })) deeper++;
      for (const i of step.cells) cells[i] = step.value;
    }
    if (!cells.includes(S.UNKNOWN)) solved++;
  }
  check('어려움: 힌트만으로 끝까지 간다', solved, take);
  check('어려움: 힌트의 가정은 모두 짧다', long, 0);
  check('어려움: 가정은 가장 빨리 막히는 것이다', deeper, 0);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

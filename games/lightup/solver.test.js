'use strict';

// 실행: node games/lightup/solver.test.js
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
  const p = R.parse(3, 3, '....4....');
  const step = S.next(p, fresh(p));
  check('4 둘레는 모두 전구', [step.why.code, step.value, step.cells.sort()], ['numberNeed', S.BULB, [1, 3, 5, 7]]);
}
{
  const p = R.parse(3, 3, '....0....');
  const step = S.next(p, fresh(p));
  check('0 둘레에는 전구가 없다', [step.why.code, step.value, step.cells.sort()], ['numberFull', S.NONE, [1, 3, 5, 7]]);
}
{
  const p = R.parse(1, 3, '...');
  const state = fresh(p);
  state[0] = S.BULB;
  const step = S.next(p, state);
  check('빛을 받은 칸에는 전구가 없다', [step.why.code, step.cells], ['seen', [1]]);
}
{
  // 칸 0은 제자리 말고는 밝힐 자리가 없다(오른쪽은 벽, 아래 칸은 전구가 아님).
  const p = R.parse(2, 2, '.#..');
  const state = fresh(p);
  state[2] = S.NONE;
  const step = S.next(p, state);
  check('밝힐 자리가 하나뿐인 칸', [step.why.code, step.cells, step.value], ['onlyLight', [0], S.BULB]);
}

// 해의 수를 끝까지 센다. 규칙으로 좁힌 뒤 모르는 칸 하나를 전구·빈칸으로 나눠 내려간다.
function count(puzzle, limit) {
  let found = 0;
  (function rec(state) {
    if (found >= limit) return;
    const r = S.solve(puzzle, { state });
    if (r.broken) return;
    if (r.solved) { found++; return; }
    let u = -1;
    for (let i = 0; i < r.state.length; i++) {
      if (puzzle.cells[i] === R.OPEN && r.state[i] === S.UNKNOWN) { u = i; break; }
    }
    if (u < 0) return;
    for (const v of [S.BULB, S.NONE]) {
      const next = r.state.slice();
      next[u] = v;
      rec(next);
      if (found >= limit) return;
    }
  })(fresh(puzzle));
  return found;
}

{
  // 가정까지 써서 끝까지 푼 판은 답이 하나여야 한다. 규칙이 틀리면 답이 여럿인 판을
  // "풀었다"고 말하게 되는데, 그게 가장 위험한 오류다. 구운 판에서 숫자를 더 지운 판(답이
  // 여럿인 것이 섞인다)으로 본다.
  const next = B.rng(11);
  let claimed = 0;
  let wrong = 0;
  let multiple = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const one = B.make('easy', seed);
    if (!one) continue;
    const puzzle = R.parse(7, 7, one.code);
    // 구운 판은 숫자를 더 지울 수 없을 만큼 지운 판이라, 하나만 더 지워도 답이 여럿이 된다.
    const numbered = [];
    puzzle.cells.forEach((v, i) => { if (v >= 0) numbered.push(i); });
    if (numbered.length && next() < 0.5) puzzle.cells[numbered[Math.floor(next() * numbered.length)]] = R.WALL;
    const found = count(puzzle, 2);
    if (found > 1) multiple++;
    if (!S.solve(puzzle, { trial: true }).solved) continue;
    claimed++;
    if (found !== 1) wrong++;
  }
  check('답이 여럿인 판도 섞였다', multiple > 5, true);
  check('풀었다고 한 판이 여럿 있다', claimed > 5, true);
  check('풀었다고 한 판은 모두 답이 하나다', wrong, 0);
}

{
  // 구운 판처럼 만든 판: 힌트만 받아 가도 끝까지 가서 만든 답에 닿는다.
  let tried = 0;
  let reached = 0;
  for (let seed = 1; tried < 8 && seed < 200; seed++) {
    const one = B.make('hard', seed);
    if (!one) continue;
    tried++;
    const puzzle = R.parse(10, 10, one.code);
    const state = fresh(puzzle);
    for (let guard = 0; guard < 300; guard++) {
      const step = S.next(puzzle, state, { trial: true });
      if (!step) break;
      for (const i of step.cells) state[i] = step.value;
    }
    if (state.every((v, i) => (v === S.BULB) === !!one.bulbs[i])) reached++;
  }
  check('힌트만으로 만든 답에 닿는다', [tried, reached], [8, 8]);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

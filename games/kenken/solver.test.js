'use strict';

// 실행: node games/kenken/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const G = require('./generator.js');

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

const digits = (mask) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => mask & S.bit(d));

{
  // 4×4 윗줄 두 칸이 +3이면 1과 2뿐이다.
  const p = R.parse(4, `0012${'3'.repeat(12)}|+3,=3,=4,+30`);
  const ctx = S.context(p);
  const masks = S.cageMasks(ctx, p.cages[0], S.start(ctx));
  check('케이지 조합으로 후보를 줄인다', [digits(masks[0]), digits(masks[1])], [[1, 2], [1, 2]]);
}
{
  // 같은 줄의 두 칸짜리 ×4는 1·4뿐이다(2·2는 같은 줄이라 안 된다).
  const p = R.parse(4, `0012${'3'.repeat(12)}|*4,=2,=3,+30`);
  const ctx = S.context(p);
  const masks = S.cageMasks(ctx, p.cages[0], S.start(ctx));
  check('같은 줄의 두 칸은 같은 숫자가 아니다', digits(masks[0]), [1, 4]);
}
{
  const p = R.parse(4, `0${'1'.repeat(15)}|=3,+37`);
  const step = S.next(p, new Array(16).fill(0));
  check('한 칸짜리 케이지', [step.cell, step.digit, step.why.code], [0, 3, 'cage']);
}
{
  // 윗줄에 1·2·3이 있으면 남은 칸은 4다.
  const p = R.parse(4, `0123${'4'.repeat(12)}|=1,=2,=3,=4,+30`);
  const values = [1, 2, 3, 0, ...new Array(12).fill(0)];
  const step = S.next(p, values);
  check('줄에 남은 숫자가 하나', [step.cell, step.digit], [3, 4]);
}

// 답을 끝까지 센다. 풀이기가 풀었다고 한 판은 답이 하나여야 한다.
function countSolutions(puzzle, limit) {
  const n = puzzle.size;
  const values = new Array(n * n).fill(0);
  let count = 0;
  (function rec(i) {
    if (count >= limit) return;
    if (i === n * n) { count++; return; }
    const r = Math.floor(i / n);
    const c = i % n;
    const cage = puzzle.cages[puzzle.cageOf[i]];
    const last = Math.max(...cage.cells) === i;
    for (let d = 1; d <= n; d++) {
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        if (values[r * n + k] === d || values[k * n + c] === d) ok = false;
      }
      if (!ok) continue;
      values[i] = d;
      const got = cage.cells.map((j) => values[j]);
      const fits = last ? R.holds(cage.op, cage.target, got)
        : !(cage.op === '+' && got.reduce((s, v) => s + v, 0) >= cage.target)
          && !(cage.op === '*' && cage.target % got.reduce((s, v) => s * (v || 1), 1));
      if (fits) rec(i + 1);
      values[i] = 0;
    }
  })(0);
  return count;
}

for (const [level, take] of [['easy', 60], ['normal', 20], ['hard', 3]]) {
  const set = G.PUZZLES[level];
  let unique = 0;
  for (let id = 0; id < take; id++) {
    if (countSolutions(R.parse(set.size, set.list[id]), 2) === 1) unique++;
  }
  check(`${level}: 풀린 판은 답이 하나`, unique, take);
}

// 빈 판에서 힌트만 따라가도 답에 닿는다.
for (const [level, take] of [['easy', 10], ['normal', 5], ['hard', 3]]) {
  const set = G.PUZZLES[level];
  let reached = 0;
  for (let id = 0; id < take; id++) {
    const puzzle = R.parse(set.size, set.list[id]);
    const answer = S.solve(puzzle, { trial: true }).values;
    const values = new Array(set.size * set.size).fill(0);
    let ok = true;
    for (let guard = 0; guard < values.length && ok; guard++) {
      const step = S.next(puzzle, values, { trial: true });
      if (!step || answer[step.cell] !== step.digit || values[step.cell]) ok = false;
      else values[step.cell] = step.digit;
    }
    if (ok && R.inspect(puzzle, values).solved) reached++;
  }
  check(`${level}: 힌트만으로 끝까지`, reached, take);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

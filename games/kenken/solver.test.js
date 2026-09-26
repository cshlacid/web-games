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
  const step = S.hint(p, new Array(16).fill(0));
  check('한 칸짜리 케이지', [step.cell, step.digit, step.why.code], [0, 3, 'cage']);
}
{
  // 윗줄에 1·2·3이 있으면 남은 칸은 4다.
  const p = R.parse(4, `0123${'4'.repeat(12)}|=1,=2,=3,=4,+30`);
  const values = [1, 2, 3, 0, ...new Array(12).fill(0)];
  const step = S.hint(p, values);
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

{
  // 3×3: 윗줄 두 칸 +3은 1·2뿐이다. 확정되는 칸이 없으니 연필 후보만 준다.
  const p = R.parse(3, '001221333|+3,+5,+4,+6');
  const values = new Array(9).fill(0);
  const marks = new Array(9).fill(0);
  const step = S.hint(p, values, marks);
  check('케이지로 연필 후보를 줄인다', [step.why.code, step.marks], ['cageMarks', [{ cell: 0, mask: 6 }, { cell: 1, mask: 6 }]]);
  marks[0] = 6;
  marks[1] = 6;
  // 적어 둔 후보를 알아낸 것으로 친다: 윗줄의 3은 이제 오른쪽 끝에만 들어간다.
  const after = S.hint(p, values, marks);
  check('적어 둔 후보에서 이어 간다', [after.cell, after.digit, after.why.code], [2, 3, 'hidden']);
}

// 빈 판에서 힌트만 따라가도 답에 닿는다. 걸음마다 정답이 후보에 남아 있어야 한다.
for (const [level, take] of [['easy', 10], ['normal', 5], ['hard', 3]]) {
  const set = G.PUZZLES[level];
  let reached = 0;
  let narrowing = 0;
  for (let id = 0; id < take; id++) {
    const puzzle = R.parse(set.size, set.list[id]);
    const answer = S.solve(puzzle, { trial: true }).values;
    const values = new Array(set.size * set.size).fill(0);
    const marks = new Array(set.size * set.size).fill(0);
    let ok = true;
    for (let guard = 0; guard < 2000 && ok && !R.inspect(puzzle, values).solved; guard++) {
      const step = S.hint(puzzle, values, marks);
      if (!step) { ok = false; break; }
      if (step.marks) {
        narrowing++;
        for (const { cell, mask } of step.marks) {
          if (!(mask & S.bit(answer[cell])) || values[cell]) ok = false;
          marks[cell] = mask;
        }
      } else if (answer[step.cell] !== step.digit || values[step.cell]) {
        ok = false;
      } else {
        values[step.cell] = step.digit;
      }
    }
    if (ok && R.inspect(puzzle, values).solved) reached++;
  }
  check(`${level}: 힌트만으로 끝까지`, reached, take);
  check(`${level}: 연필 후보를 줄이는 힌트가 나온다`, narrowing > 0, true);
}

// 빈 판과 일부를 채운 판에서 힌트만으로 끝까지 가고, 가정은 가장 빨리 막히는 칸을 고르며
// 모두 짧다(SHORT_TRIAL 안).
// 가정 힌트가 나올 때마다 모든 칸·숫자를 끝까지 돌려 본 걸음 수의 최솟값과 맞춘다.
{
  const set = G.PUZZLES.hard;
  let reached = 0;
  let trials = 0;
  let shortest = 0;
  let single = 0;
  let worst = 0;
  let long = 0;
  const take = 8;
  for (let id = 0; id < take; id++) {
    const puzzle = R.parse(set.size, set.list[id]);
    const n = set.size;
    const answer = S.solve(puzzle, { trial: true }).values;
    // 절반은 빈 판에서, 절반은 몇 칸을 채운 판에서 시작한다.
    const values = answer.map((v, i) => (id % 2 && i % 5 === id % 5 ? v : 0));
    const marks = new Array(n * n).fill(0);
    let ok = true;
    for (let guard = 0; guard < 2000 && ok && !R.inspect(puzzle, values).solved; guard++) {
      const t0 = process.hrtime.bigint();
      const step = S.hint(puzzle, values, marks);
      worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
      if (!step) { ok = false; break; }
      if (step.why.code === 'trial' || step.why.code === 'trialMarks') {
        trials++;
        if (step.why.steps > S.SHORT_TRIAL) long++;
        if (!step.marks || step.marks.length === 1) single++;
        // 지금 판의 후보에서 모든 가정을 끝까지 돌린 최솟값.
        const ctx = S.context(puzzle);
        const dom = new Uint16Array(n * n);
        for (let i = 0; i < n * n; i++) {
          if (values[i]) { dom[i] = S.bit(values[i]); continue; }
          dom[i] = marks[i] || ctx.all;
          for (const j of ctx.peers[i]) if (values[j]) dom[i] &= ~S.bit(values[j]);
        }
        let min = Infinity;
        for (let i = 0; i < n * n; i++) {
          if (values[i] || S.popcount(dom[i]) < 2) continue;
          for (let d = 1; d <= n; d++) {
            if (!(dom[i] & S.bit(d))) continue;
            const copy = dom.slice();
            copy[i] = S.bit(d);
            const info = { limit: Infinity };
            if (!S.settle(ctx, copy, info)) min = Math.min(min, info.steps);
          }
        }
        if (step.why.steps === min && step.why.cells.length) shortest++;
      }
      if (step.marks) {
        for (const { cell, mask } of step.marks) {
          if (!(mask & S.bit(answer[cell])) || values[cell]) ok = false;
          marks[cell] = mask;
        }
      } else if (answer[step.cell] !== step.digit || values[step.cell]) {
        ok = false;
      } else {
        values[step.cell] = step.digit;
      }
    }
    if (ok && R.inspect(puzzle, values).solved) reached++;
  }
  check('일부 채운 8×8: 힌트만으로 끝까지', reached, take);
  check('가정 힌트가 나온다', trials > 0, true);
  check('가정은 가장 적은 걸음 안에 막히는 것을 고른다', shortest, trials);
  check('가정 힌트는 칸 하나만 고친다', single, trials);
  check('가정은 모두 짧다', long, 0);
  console.log(`  가정 ${trials}번, 힌트 한 번 최악 ${worst.toFixed(1)}ms`);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

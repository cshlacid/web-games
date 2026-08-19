'use strict';

// 실행: node games/doppelblock/generator.test.js
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

// --- 크기별로 고를 수 있는 난이도 ---
// 4×4는 숫자가 1과 2뿐이라 어려움을 만들 여지가 없다.
check('4×4에는 어려움이 없다', G.levelsFor(4), ['easy', 'medium']);
check('5×5에는 세 등급이 다 있다', G.levelsFor(5), ['easy', 'medium', 'hard']);

let threw = false;
try { G.generate(4, 'hard'); } catch { threw = true; }
check('없는 난이도를 고르면 막는다', threw, true);

threw = false;
try { G.generate(9, 'easy'); } catch { threw = true; }
check('지원하지 않는 크기를 막는다', threw, true);

// --- 만들어진 판이 조건을 지키는가 ---
for (const n of G.SIZES) {
  for (const level of G.levelsFor(n)) {
    const count = n === 6 ? 6 : 12;
    let invalid = 0;
    let notLogical = 0;
    let wrongAnswer = 0;
    let notUnique = 0;
    let offGrade = 0;
    let missing = 0;

    for (let i = 0; i < count; i++) {
      const made = G.generate(n, level, { seed: i * 7919 + 17 });
      if (!made) { missing++; continue; }

      if (R.validate(n, made.solution, made.rowClues, made.colClues)) invalid++;

      const report = S.grade(n, made.rowClues, made.colClues);
      if (!report.solved) notLogical++;
      else if (String(report.grid) !== String(made.solution)) wrongAnswer++;

      // 논리로 풀리면 유일해가 따라온다는 성질을 완전 탐색으로 다시 확인한다.
      if (R.countSolutions(n, made.rowClues, made.colClues, 2) !== 1) notUnique++;

      if (!G.LEVELS[level].accept(report, n)) offGrade++;
    }

    check(`${n}×${n} ${level}: 판을 만들어낸다`, missing, 0);
    check(`${n}×${n} ${level}: 정답이 규칙을 지킨다`, invalid, 0);
    check(`${n}×${n} ${level}: 힌트만으로 끝까지 풀린다`, notLogical, 0);
    check(`${n}×${n} ${level}: 논리로 낸 답이 정답과 같다`, wrongAnswer, 0);
    check(`${n}×${n} ${level}: 해가 유일하다`, notUnique, 0);
    check(`${n}×${n} ${level}: 요청한 등급에 맞는다`, offGrade, 0);
  }
}

// --- 쉬움의 정의 ---
// 쉬움은 "배치 좁히기가 한 번도 필요 없는 판"이다. 값싼 추론만으로 끝나야 한다.
for (const n of G.SIZES) {
  let needsArrangements = 0;
  let notCheapSolvable = 0;
  for (let i = 0; i < (n === 6 ? 4 : 8); i++) {
    const made = G.generate(n, 'easy', { seed: i * 31337 + 5 });
    if (made.arrangementCalls !== 0) needsArrangements++;
    if (!S.solveLogically(n, made.rowClues, made.colClues, G.CHEAP).solved) notCheapSolvable++;
  }
  check(`${n}×${n} 쉬움: 배치 좁히기가 필요 없다`, needsArrangements, 0);
  check(`${n}×${n} 쉬움: 값싼 기법만으로 풀린다`, notCheapSolvable, 0);
}

// --- 등급 사이가 겹치지 않는가 ---
const mediumCalls = [];
const hardCalls = [];
for (let i = 0; i < 10; i++) {
  mediumCalls.push(G.generate(5, 'medium', { seed: i * 977 + 1 }).arrangementCalls);
  hardCalls.push(G.generate(5, 'hard', { seed: i * 977 + 1 }).arrangementCalls);
}
check('5×5 보통은 배치 좁히기가 필요하다', mediumCalls.every((c) => c > 0), true);
check('5×5 어려움은 보통보다 더 많이 필요하다',
  Math.min(...hardCalls) > Math.max(...mediumCalls), true);

// --- 재현성 ---
check('씨앗이 같으면 같은 판',
  G.generate(5, 'medium', { seed: 42 }).rowClues,
  G.generate(5, 'medium', { seed: 42 }).rowClues);
check('씨앗이 다르면 대체로 다른 판',
  String(G.generate(5, 'medium', { seed: 1 }).solution)
    !== String(G.generate(5, 'medium', { seed: 2 }).solution), true);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

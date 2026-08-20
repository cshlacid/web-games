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

// --- 난이도가 무엇으로 정해지는가 ---
// 크기가 아니라 "끝까지 푸는 데 필요했던 가장 어려운 기법"이다.
check('배치 좁히기가 필요 없으면 쉬움',
  G.levelOf({ solved: true, hardest: 'combinations' }), 'easy');
check('배치 좁히기까지면 보통',
  G.levelOf({ solved: true, hardest: 'lineArrangements' }), 'medium');
check('맞물림까지면 어려움',
  G.levelOf({ solved: true, hardest: 'crossLines' }), 'hard');
check('논리로 못 풀면 등급이 없다', G.levelOf({ solved: false, hardest: 'eliminate' }), null);

// --- 크기는 난이도가 고른다 ---
// 없는 조합이 있다. 4×4는 숫자가 1과 2뿐이라 맞물림까지 갈 판이 없고,
// 7×7은 반대로 배치 좁히기 없이 끝나는 판이 없다.
check('쉬움에 7×7은 없다', G.SIZES_BY_LEVEL.easy.includes(7), false);
check('어려움에 4×4는 없다', G.SIZES_BY_LEVEL.hard.includes(4), false);
// 8×8은 논리 깊이로는 보통이지만 크기 자체가 벽이라 어려움에 둔다.
check('8×8은 어려움에만 있다',
  G.LEVEL_NAMES.filter((l) => G.SIZES_BY_LEVEL[l].includes(8)), ['hard']);
check('고를 수 있는 크기는 난이도별 크기의 합집합', G.SIZES,
  [...new Set(G.LEVEL_NAMES.flatMap((l) => G.SIZES_BY_LEVEL[l]))].sort());

let threw = false;
try { G.generate('impossible'); } catch { threw = true; }
check('없는 난이도를 막는다', threw, true);

threw = false;
try { G.generate('hard', { n: 4 }); } catch { threw = true; }
check('그 난이도에 없는 크기를 막는다', threw, true);

// 크기를 지정하지 않으면 난이도가 허용하는 크기 안에서 무작위로 나와야 한다.
for (const level of G.LEVEL_NAMES) {
  const seen = new Set();
  let outside = 0;
  for (let i = 0; i < 24; i++) {
    const made = G.generate(level, { seed: i * 8191 + 3 });
    seen.add(made.n);
    if (!G.SIZES_BY_LEVEL[level].includes(made.n)) outside++;
  }
  check(`${level}: 허용된 크기만 나온다`, outside, 0);
  // 크기가 하나로 굳으면 무작위 선택이 동작하지 않는다는 뜻이다.
  check(`${level}: 크기가 한 가지로 굳지 않는다`, seen.size > 1, true);
}

// --- 만들어진 판이 조건을 지키는가 ---
for (const level of G.LEVEL_NAMES) {
  for (const n of G.SIZES_BY_LEVEL[level]) {
    const count = level === 'hard' ? 2 : (n >= 6 ? 3 : 6);
    let invalid = 0;
    let notLogical = 0;
    let wrongAnswer = 0;
    let notUnique = 0;
    let offGrade = 0;
    let missing = 0;

    for (let i = 0; i < count; i++) {
      const made = G.generate(level, { n, seed: i * 7919 + 17 });
      if (!made) { missing++; continue; }

      if (R.validate(n, made.solution, made.rowClues, made.colClues)) invalid++;

      const report = S.grade(n, made.rowClues, made.colClues);
      if (!report.solved) notLogical++;
      else if (String(report.grid) !== String(made.solution)) wrongAnswer++;

      // 논리로 풀리면 유일해가 따라온다는 성질을 완전 탐색으로 다시 확인한다.
      // 7×7은 완전 탐색이 너무 느려 이 대조를 건너뛴다.
      if (n < 7 && R.countSolutions(n, made.rowClues, made.colClues, 2) !== 1) notUnique++;

      // 미리 구워 둔 판은 등급을 논리 깊이로 매기지 않는다. 8×8은 필요한
      // 논리가 보통과 같은데도 어려움에 두기 때문이다.
      if (!made.baked && G.levelOf(report) !== level) offGrade++;
    }

    check(`${n}×${n} ${level}: 판을 만들어낸다`, missing, 0);
    check(`${n}×${n} ${level}: 정답이 규칙을 지킨다`, invalid, 0);
    check(`${n}×${n} ${level}: 힌트만으로 끝까지 풀린다`, notLogical, 0);
    check(`${n}×${n} ${level}: 논리로 낸 답이 정답과 같다`, wrongAnswer, 0);
    check(`${n}×${n} ${level}: 해가 유일하다`, notUnique, 0);
    check(`${n}×${n} ${level}: 요청한 등급에 맞는다`, offGrade, 0);
  }
}

// --- 등급의 정의가 실제로 지켜지는가 ---
// 쉬움은 값싼 기법만으로 끝나야 한다. 이것이 깨지면 등급 구분이 이름뿐이 된다.
{
  let notCheapSolvable = 0;
  for (const n of G.SIZES_BY_LEVEL.easy) {
    for (let i = 0; i < 4; i++) {
      const made = G.generate('easy', { n, seed: i * 31337 + 5 });
      if (!S.solveLogically(n, made.rowClues, made.colClues, G.CHEAP).solved) notCheapSolvable++;
    }
  }
  check('쉬움: 값싼 기법만으로 풀린다', notCheapSolvable, 0);
}

// 그 자리에서 만드는 어려움은 맞물림을 빼면 못 풀려야 한다. 그래야 "맞물림까지
// 필요하다"는 말이 참이 된다. 미리 구워 둔 크기는 여기서 빼는데, 8×8은 논리
// 깊이가 아니라 크기 때문에 어려움이라 이 조건을 만족하지 않기 때문이다.
// 구워 둔 목록은 바로 위에서 따로 검사한다.
{
  const without = S.TECHNIQUE_NAMES.filter((t) => t !== 'crossLines');
  let solvableWithout = 0;
  for (const n of G.SIZES_BY_LEVEL.hard.filter((size) => !G.BAKED[size])) {
    for (let i = 0; i < 2; i++) {
      const made = G.generate('hard', { n, seed: i * 6151 + 11 });
      if (S.solveLogically(n, made.rowClues, made.colClues, without).solved) solvableWithout++;
    }
  }
  check('어려움: 맞물림을 빼면 못 푼다', solvableWithout, 0);
}

// --- 미리 구워 둔 판 ---
// 여기 담긴 판이 논리로 안 풀리면 "모든 판은 단서만으로 풀린다"는 약속이
// 조용히 깨진다. 목록이 통째로 검사 대상이라 기법을 고칠 때 바로 걸린다.
for (const size of Object.keys(G.BAKED).map(Number)) {
  const list = G.BAKED[size];
  check(`${size}×${size} 목록이 비어 있지 않다`, list.length > 0, true);

  let badShape = 0;
  let notLogical = 0;
  let invalid = 0;
  let notHard = 0;
  for (const [rowClues, colClues] of list) {
    if (rowClues.length !== size || colClues.length !== size) { badShape++; continue; }
    const result = S.solveLogically(size, rowClues, colClues);
    if (!result.solved) { notLogical++; continue; }
    if (R.validate(size, result.grid, rowClues, colClues)) invalid++;
    // 7×7은 맞물림까지 필요한 판만 구웠다. 그 조건 때문에 구운 것이므로,
    // 조건이 깨졌으면 실시간으로 뽑아도 되는 판이 섞여 있다는 뜻이다.
    if (size === 7 && !result.used.has('crossLines')) notHard++;
  }
  check(`${size}×${size} 단서 개수가 크기와 맞는다`, badShape, 0);
  check(`${size}×${size} 목록이 전부 논리로 풀린다`, notLogical, 0);
  check(`${size}×${size} 되찾은 정답이 단서와 맞는다`, invalid, 0);
  if (size === 7) check('7×7 목록은 전부 맞물림이 필요하다', notHard, 0);

  const keys = new Set(list.map(([r, c]) => `${r}|${c}`));
  check(`${size}×${size} 목록에 같은 판이 없다`, keys.size, list.length);
}

// 구워 둔 크기를 고르면 목록에서 꺼내 오고, 정답까지 딸려 와야 한다.
for (const size of Object.keys(G.BAKED).map(Number)) {
  const made = G.generate('hard', { n: size, seed: 4242 });
  check(`${size}×${size}: 목록에서 꺼내 온다`, Boolean(made && made.baked), true);
  check(`${size}×${size}: 정답이 규칙을 지킨다`,
    R.validate(size, made.solution, made.rowClues, made.colClues), null);
  check(`${size}×${size}: 씨앗이 같으면 같은 판`,
    G.generate('hard', { n: size, seed: 4242 }).rowClues, made.rowClues);
}

// --- 재현성 ---
check('씨앗이 같으면 같은 판',
  G.generate('medium', { seed: 42 }).rowClues,
  G.generate('medium', { seed: 42 }).rowClues);
check('씨앗이 같으면 크기도 같다',
  G.generate('medium', { seed: 42 }).n,
  G.generate('medium', { seed: 42 }).n);
check('씨앗이 다르면 대체로 다른 판',
  String(G.generate('medium', { seed: 1, n: 5 }).solution)
    !== String(G.generate('medium', { seed: 2, n: 5 }).solution), true);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/idioms/generator.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const G = require('./generator.js');
const Words = require('./words.js');
const W = Words.pick('ko');

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

const ROUNDS = 10;

const problems = {
  none: 0, shape: 0, notUnique: 0, wallCount: 0, sameWord: 0, offDict: 0, unreachable: 0,
};

for (const size of G.SIZES) {
  for (let i = 0; i < ROUNDS; i++) {
    const puzzle = G.generate(size, { seed: size * 400 + i });
    if (!puzzle) { problems.none++; continue; }

    if (!R.wellFormed(puzzle, W.WORDS)) problems.shape++;
    if (S.count(puzzle, W.WORDS, { limit: 2 }).count !== 1) problems.notUnique++;

    // 벽은 성어가 차지하고 남은 칸이다. 그 수는 크기에서 정해진다.
    const walls = puzzle.cells.filter((cell) => !cell).length;
    if (walls !== size * size - G.COUNT[size] * R.LENGTH) problems.wallCount++;

    const words = puzzle.solution.map((entry) => entry.word);
    if (new Set(words).size !== words.length) problems.sameWord++;
    if (words.some((word) => !W.WORDS.includes(word))) problems.offDict++;

    // 벽이 아닌 칸은 모두 어느 성어엔가 들어가야 한다. 남으면 풀 수 없는 판이다.
    const covered = new Set();
    for (const entry of puzzle.solution) for (const cell of entry.path) covered.add(cell);
    for (let cell = 0; cell < size * size; cell++) {
      if (puzzle.cells[cell] && !covered.has(cell)) problems.unreachable++;
    }
  }
}

check('모든 크기에서 판이 나온다', problems.none, 0);
check('판이 제 모양이다', problems.shape, 0);
check('모든 판이 유일해다', problems.notUnique, 0);
check('벽 수가 크기에서 정해진 대로다', problems.wallCount, 0);
check('한 판에 같은 성어가 두 번 오지 않는다', problems.sameWord, 0);
check('사전에 없는 성어를 쓰지 않는다', problems.offDict, 0);
check('덮이지 않는 칸이 없다', problems.unreachable, 0);

// --- 씨앗 ---
const a = G.generate(4, { seed: 11 });
const b = G.generate(4, { seed: 11 });
check('같은 씨앗은 같은 판', a.cells, b.cells);
check('다른 씨앗은 다른 판',
  JSON.stringify(G.generate(4, { seed: 12 }).cells) === JSON.stringify(a.cells), false);

check('지원하지 않는 크기는 거절한다', (() => {
  try { G.generate(8); return false; } catch { return true; }
})(), true);

// --- 언어마다 그 나라 성어로 판이 나오는가 ---
const byLang = {};
for (const lang of Words.LANGS) {
  const set = Words.pick(lang);
  let bad = 0;
  for (const size of G.SIZES) {
    const puzzle = G.generate(size, { seed: 31, words: set.WORDS });
    if (!puzzle) { bad++; continue; }
    if (!R.wellFormed(puzzle, set.WORDS)) bad++;
    if (S.count(puzzle, set.WORDS, { limit: 2 }).count !== 1) bad++;
  }
  byLang[lang] = bad;
}
check('네 언어 모두에서 유일해 판이 나온다', byLang,
  Object.fromEntries(Words.LANGS.map((lang) => [lang, 0])));

// --- 판마다 다른 성어가 나오는가 ---
// 사전이 커도 생성기가 앞쪽 몇 개만 집으면 판이 늘 비슷해 보인다.
const seenWords = new Set();
for (let i = 0; i < 12; i++) {
  for (const entry of G.generate(5, { seed: 900 + i }).solution) seenWords.add(entry.word);
}
check('열두 판에 서른 개 넘는 성어가 나온다', seenWords.size > 30, true);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

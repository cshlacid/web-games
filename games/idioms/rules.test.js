'use strict';

// 실행: node games/idioms/rules.test.js
const R = require('./rules.js');
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

// 네 줄에 성어를 하나씩 곧게 눕힌 4×4. 규칙만 보는 자리라 판이 예쁠 필요는 없다.
const PUZZLE = {
  size: 4,
  cells: ['일', '석', '이', '조', '고', '진', '감', '래', '동', '문', '서', '답', '우', '여', '곡', '절'],
  solution: [
    { word: '일석이조', path: [0, 1, 2, 3] },
    { word: '고진감래', path: [4, 5, 6, 7] },
    { word: '동문서답', path: [8, 9, 10, 11] },
    { word: '우여곡절', path: [12, 13, 14, 15] },
  ],
};

// --- 이웃 ---

check('모서리 칸의 이웃은 둘', R.neighbours(4, 0), [4, 1]);
check('가운데 칸의 이웃은 넷', R.neighbours(4, 5).sort((a, b) => a - b), [1, 4, 6, 9]);

// --- 길 잇기 ---

{
  const b = R.board(PUZZLE, W.WORDS);
  const state = R.newState(b);
  check('빈 길에는 아무 칸이나 놓을 수 있다', R.canExtend(b, state, [], 5), true);
  check('붙어 있으면 이을 수 있다', R.canExtend(b, state, [0], 1), true);
  check('대각선으로는 못 잇는다', R.canExtend(b, state, [0], 5), false);
  check('떨어진 칸으로는 못 잇는다', R.canExtend(b, state, [0], 2), false);
  check('지나온 칸은 다시 못 밟는다', R.canExtend(b, state, [0, 1], 0), false);
  check('네 칸을 넘길 수 없다', R.canExtend(b, state, [0, 1, 2, 3], 7), false);
}

// --- 굳히기 ---

{
  const b = R.board(PUZZLE, W.WORDS);
  const state = R.newState(b);
  check('네 칸이 안 되면 굳지 않는다', R.commit(b, state, [0, 1, 2]), { ok: false, why: 'short' });
  check('사전에 없으면 굳지 않는다', R.commit(b, state, [0, 4, 8, 12]), { ok: false, why: 'unknown' });
  check('성어면 굳는다', R.commit(b, state, [0, 1, 2, 3]), { ok: true, word: '일석이조' });
  check('굳은 칸은 다시 쓸 수 없다', R.commit(b, state, [3, 2, 1, 0]).why, 'taken');
  check('덮인 칸 수', state.cover.filter((at) => at !== -1).length, 4);
}

{
  // 같은 성어를 두 번 쓰지 못한다. 판을 만들 때 유일해를 이 규칙 아래에서 셌다.
  const twice = {
    size: 4,
    cells: ['일', '석', '이', '조', '일', '석', '이', '조', '동', '문', '서', '답', '우', '여', '곡', '절'],
    solution: [],
  };
  const b = R.board(twice, W.WORDS);
  const state = R.newState(b);
  R.commit(b, state, [0, 1, 2, 3]);
  check('같은 성어는 한 판에 한 번', R.commit(b, state, [4, 5, 6, 7]).why, 'again');
}

// --- 지우기 ---

{
  const b = R.board(PUZZLE, W.WORDS);
  const state = R.newState(b);
  R.commit(b, state, [0, 1, 2, 3]);
  R.commit(b, state, [4, 5, 6, 7]);
  check('톡 누른 자리의 성어가 지워진다', R.removeAt(b, state, 1), '일석이조');
  check('지운 뒤 남은 성어', state.found.map((entry) => entry.word), ['고진감래']);
  check('남은 성어의 덮개가 다시 맞는다', Array.from(state.cover.slice(4, 8)), [0, 0, 0, 0]);
  check('빈 자리를 누르면 아무 일도 없다', R.removeAt(b, state, 0), null);
}

// --- 끝남 ---

{
  const b = R.board(PUZZLE, W.WORDS);
  const state = R.newState(b);
  check('빈 판은 끝나지 않았다', R.isDone(b, state), false);
  for (const entry of PUZZLE.solution) R.commit(b, state, entry.path);
  check('다 덮으면 끝난다', R.isDone(b, state), true);
}

check('정답을 그대로 넣으면 다 덮인다',
  R.validate(PUZZLE, W.WORDS, PUZZLE.solution.map((entry) => entry.path)),
  { whys: [], done: true });

// --- 판 모양 ---

check('제 모양인 판', R.wellFormed(PUZZLE, W.WORDS), true);
check('칸의 글자가 성어와 다르면 제 모양이 아니다',
  R.wellFormed({ ...PUZZLE, cells: ['이', ...PUZZLE.cells.slice(1)] }, W.WORDS), false);
check('길이 끊기면 제 모양이 아니다',
  R.wellFormed({ ...PUZZLE, solution: [{ word: '일석이조', path: [0, 1, 2, 7] }] }, W.WORDS), false);

// --- 사전 ---
// 네 언어를 모두 본다. 한 언어만 보면 나중에 더한 사전에서 세 글자짜리가 섞여도
// 테스트가 통과한다 — 이 게임은 한 성어가 네 칸이라는 데 기대어 판을 만든다.

const problems = { short: 0, dup: 0, noMean: 0 };
for (const lang of Words.LANGS) {
  const set = Words.pick(lang);
  problems.short += set.WORDS.filter((word) => [...word].length !== R.LENGTH).length;
  problems.dup += set.WORDS.length - new Set(set.WORDS).size;
  problems.noMean += set.WORDS.filter((word) => !set.MEANING[word]).length;
}
check('모든 언어에서 성어가 네 글자', problems.short, 0);
check('모든 언어에서 중복이 없다', problems.dup, 0);
check('모든 언어에서 뜻이 달려 있다', problems.noMean, 0);
check('네 글자 성어가 없는 언어는 한국어로 간다', Words.pick('en').WORDS[0], Words.pick('ko').WORDS[0]);
// 언어끼리 성어가 겹치지 않아야 한다는 규칙은 없지만, 글자가 달라 실제로 겹치지
// 않는다 — 판을 나눠 쓸 수 없는 이유가 이것이다.
check('한국어와 일본어 사전이 겹치지 않는다',
  Words.pick('ko').WORDS.some((word) => Words.pick('ja').WORDS.includes(word)), false);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

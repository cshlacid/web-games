'use strict';

// 실행: node games/yacht/ai.test.js
const R = require('./rules.js');
const A = require('./ai.js');

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

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 상황을 손으로 꾸민다. 굴림 횟수와 눈을 직접 넣어 무엇을 고르는지 본다.
function at(dice, rollsLeft, sheet = {}) {
  const game = R.newGame(2);
  game.dice = dice.slice();
  game.rollsLeft = rollsLeft;
  game.sheets[1] = { ...sheet };
  return game;
}

// --- 적을 칸 고르기 ---
check('야추가 뜨면 야추에 적는다',
  A.bestWrite(at([4, 4, 4, 4, 4], 0), 1, [4, 4, 4, 4, 4], true).key, 'yacht');
check('닷 줄이면 L.스트레이트',
  A.bestWrite(at([1, 2, 3, 4, 5], 0), 1, [1, 2, 3, 4, 5], true).key, 'large');

// 야추 칸이 이미 찼으면 다른 칸으로 간다.
check('찬 칸은 고르지 않는다',
  A.bestWrite(at([4, 4, 4, 4, 4], 0, { yacht: 50 }), 1, [4, 4, 4, 4, 4], true).key !== 'yacht',
  true);

// 어디에 적어도 0점이면 값싼 칸을 버린다. 야추 칸은 기대가 낮아 버리는 값이 싸고,
// 풀하우스는 아직 만들 수 있어 아깝다.
{
  const sheet = {};
  for (const cat of R.CATEGORIES) {
    if (!['yacht', 'full', 'large'].includes(cat.key)) sheet[cat.key] = 0;
  }
  const game = at([1, 2, 3, 5, 6], 0, sheet);
  check('버릴 때는 값싼 칸부터', A.bestWrite(game, 1, game.dice, true).key, 'yacht');
}

// 보너스를 노리는 쪽이 위 칸을 더 높게 친다.
{
  const game = at([5, 5, 5, 2, 1], 0);
  const withBonus = A.writeValue(game, 1, 'fives', game.dice, true);
  const plain = A.writeValue(game, 1, 'fives', game.dice, false);
  check('보너스를 보면 위 칸 값이 오른다', withBonus > plain - A.WORTH.fives * 0.55 - 0.001, true);
}

// --- 무엇을 할지 ---
check('굴리기 전에는 굴린다', A.decide(at([0, 0, 0, 0, 0], 3), rng(1)), { roll: true });
check('마지막 굴림 뒤에는 적는다',
  Object.keys(A.decide(at([1, 2, 3, 4, 6], 0), rng(1))), ['write']);

// 이미 야추가 떴는데 더 굴릴 이유가 없다.
check('좋은 눈은 더 굴리지 않는다',
  Object.keys(A.decide(at([6, 6, 6, 6, 6], 1), rng(7), { level: 'hard' })), ['write']);

// 넷이 같으면 나머지 하나만 다시 굴린다.
{
  const move = A.decide(at([5, 5, 5, 5, 2], 2, { yacht: undefined }), rng(11), { level: 'hard' });
  check('야추를 노려 넷을 잡는다', move.keep, [true, true, true, true, false]);
}

// --- 한 차례 ---
{
  const game = R.newGame(2);
  const acts = A.playTurn(game, rng(3), { level: 'normal' });
  check('한 차례는 적기로 끝난다', Boolean(acts[acts.length - 1].write), true);
  check('세 번까지만 굴린다', acts.filter((one) => one.roll).length <= 3, true);
  check('차례가 넘어간다', game.turn, 2);
}

// --- 난이도 사다리 ---
// 자리 하나를 난이도별 판단기에 맡기고 열두 판을 끝까지 둔다. 점수 폭이 넓은 놀이라
// 표본을 넉넉히 잡는다.
function average(level, games) {
  let sum = 0;
  for (let seed = 1; seed <= games; seed++) {
    const game = R.newGame(2);
    const next = rng(seed * 7919 + 13);
    while (!game.done) A.playTurn(game, next, { level });
    sum += R.total(game, 1);
  }
  return sum / games;
}

{
  const easy = average('easy', 40);
  const normal = average('normal', 30);
  const hard = average('hard', 16);
  check('어려울수록 점수가 높다', easy < normal && normal < hard + 12, true);
  check('쉬움도 백 점은 넘긴다', easy > 100, true);
  check('어려움은 백오십 점을 넘긴다', hard > 150, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

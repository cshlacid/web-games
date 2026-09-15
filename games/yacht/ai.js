'use strict';

// 상대. 규칙을 직접 건드리지 않고 "이번에 무엇을 할지"만 돌려준다 — 잡을 주사위냐,
// 적을 칸이냐. 그래서 상황을 손으로 꾸며 놓고 무엇을 고르는지 그대로 볼 수 있다.
//
// **다시 굴릴 값어치는 실제로 굴려 보고 잰다.** 야추에서 "무엇을 잡을까"는 남은 굴림의
// 기댓값 문제인데, 식으로 적으면 칸마다 다른 규칙을 다 담아야 한다. 서른두 가지 잡는
// 법을 각각 몇 판씩 굴려 보고 평균이 가장 높은 것을 고르면 같은 답에 훨씬 짧게 닿는다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.YachtRules;

// 난이도. 손잡이는 둘이다.
//  samples — 잡는 법 하나를 몇 판 굴려 보는가. 적으면 우연이 판단을 흔든다.
//  smart   — 보너스와 칸의 값어치를 함께 보는가. 끄면 눈앞의 점수만 본다.
const LEVELS = {
  easy: { samples: 3, smart: false },
  normal: { samples: 14, smart: true },
  hard: { samples: 60, smart: true },
};

// 칸마다의 대략적인 값어치. **싼값에 버리지 않게 하는 자리다** — 야추 칸에 5점을 적는
// 것과 초이스에 5점을 적는 것은 값이 다르다. 정확한 기댓값일 필요는 없고 칸끼리의
// 차례만 맞으면 된다.
const WORTH = {
  ones: 2, twos: 4, threes: 6, fours: 8, fives: 10, sixes: 12,
  choice: 22, four: 13, full: 16, small: 11, large: 8, yacht: 6,
};

const CAT = {};
for (const cat of R.CATEGORIES) CAT[cat.key] = cat;

// 이 눈으로 이 칸에 적을 때의 값. 점수 그대로가 아니라 "적어도 좋은가"를 잰다.
function writeValue(game, player, key, dice, smart) {
  const got = R.scoreOf(key, dice);
  if (!smart) return got;

  let value = got;
  const cat = CAT[key];
  if (cat.upper && R.upperSum(game, player) < R.BONUS_AT) {
    // 보너스는 눈마다 셋이 기준이다. 넘기면 덤, 못 미치면 그만큼 빚이 된다.
    value += (got - cat.face * 3) * 1.2;
  }
  value -= WORTH[key] * 0.55;
  return value;
}

function bestWrite(game, player, dice, smart) {
  let best = null;
  let bestValue = -Infinity;
  for (const key of R.open(game, player)) {
    const value = writeValue(game, player, key, dice, smart);
    if (value > bestValue) { bestValue = value; best = key; }
  }
  return { key: best, value: bestValue };
}

// 서른두 가지 잡는 법. 다섯 칸이라 비트로 세는 것이 가장 짧다.
function keepMasks() {
  const out = [];
  for (let mask = 0; mask < 32; mask++) {
    out.push([0, 1, 2, 3, 4].map((i) => Boolean(mask & (1 << i))));
  }
  return out;
}

const MASKS = keepMasks();

// 잡는 법 하나의 값어치. 잡지 않은 주사위를 굴려 보고 그때 적을 수 있는 가장 좋은 칸의
// 값을 평균 낸다. **남은 굴림이 둘이어도 한 번만 굴려 본다** — 두 번을 제대로 세면
// 서른두 갈래가 다시 서른두 갈래로 갈라지는데, 그렇게 늘린 만큼 수가 좋아지지 않았다.
function planValue(game, player, dice, keep, samples, smart, next) {
  let sum = 0;
  for (let n = 0; n < samples; n++) {
    const rolled = dice.map((die, i) => (keep[i] ? die : 1 + Math.floor(next() * 6)));
    sum += bestWrite(game, player, rolled, smart).value;
  }
  return sum / samples;
}

// 이번에 무엇을 할지. `{ roll: true }` · `{ keep: [...] }` · `{ write: key }` 중 하나다.
function decide(game, next, opts = {}) {
  if (game.done) return null;
  const level = LEVELS[opts.level] || LEVELS.normal;
  const samples = opts.samples === undefined ? level.samples : opts.samples;
  const smart = opts.smart === undefined ? level.smart : opts.smart;
  const player = game.turn;

  if (game.rollsLeft === R.ROLLS) return { roll: true };

  const now = bestWrite(game, player, game.dice, smart);
  if (game.rollsLeft === 0) return { write: now.key };

  let bestKeep = null;
  let bestValue = -Infinity;
  for (const keep of MASKS) {
    const value = planValue(game, player, game.dice, keep, samples, smart, next);
    if (value > bestValue) { bestValue = value; bestKeep = keep; }
  }

  // 더 굴려도 나아지지 않으면 지금 적는다. 남은 굴림을 아끼는 것이 아니라, 굴릴수록
  // 손해인 판(이미 야추가 떴다든가)에서 굴리지 않기 위한 자리다.
  if (now.value >= bestValue) return { write: now.key };
  return { keep: bestKeep };
}

// 한 차례를 통째로 둔다. 화면은 한 걸음씩 보여 줘야 해서 쓰지 않고, 자가대국과
// 테스트에서 쓴다.
function playTurn(game, next, opts = {}) {
  const acts = [];
  for (let step = 0; step < 8; step++) {
    const move = decide(game, next, opts);
    if (!move) break;
    if (move.roll) { R.roll(game, next); acts.push({ roll: game.dice.slice() }); continue; }
    if (move.keep) {
      game.keep = move.keep.slice();
      R.roll(game, next);
      acts.push({ keep: move.keep.slice(), roll: game.dice.slice() });
      continue;
    }
    acts.push({ write: R.pick(game, move.write) });
    break;
  }
  return acts;
}

const AI = { LEVELS, WORTH, writeValue, bestWrite, planValue, decide, playTurn };

if (typeof module !== 'undefined' && module.exports) module.exports = AI;
if (typeof window !== 'undefined') window.YachtAI = AI;

})();

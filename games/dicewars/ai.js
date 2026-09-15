'use strict';

// 상대. 규칙을 직접 건드리지 않고 "이번에 칠 곳"만 돌려준다(칠 곳이 없으면 null =
// 차례 끝). 그래서 상황을 손으로 꾸며 놓고 무엇을 고르는지 그대로 볼 수 있다.
//
// **판단의 뼈대는 확률 표 하나다.** 이 게임에서 사람이 보는 것도 그것뿐이라, 판단기가
// 다른 것을 보고 두면 사람 눈에는 이유 없이 이기고 지는 것처럼 보인다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.DiceRules;
const O = typeof require === 'function' ? require('./odds.js') : window.DiceOdds;

// 난이도. 차례를 나눠 두므로 손 속도가 실력을 가르지 않는다. 손잡이는 셋이다.
//  edge  — 이 확률을 넘겨야 친다.
//  pick  — 넘긴 수 중에서 **가장 좋은 것을 고르는가, 아무거나 고르는가**.
//  moves — 한 차례에 칠 수 있는 횟수(0이면 제한 없음).
//
// **문턱만으로는 세기가 갈리지 않는다.** 문턱을 0.5에서 0.65로 올려 봐도 고르는 수가
// 그대로였다 — 가장 좋은 수는 어차피 확률이 높아 문턱에 걸리지 않고, 문턱은 나쁜 수를
// 후보에 넣을지만 정하기 때문이다(승률 65%로 네 값이 똑같이 나왔다). 실제로 갈리는
// 것은 고른 뒤의 질이라, 약한 쪽은 후보 중에서 아무거나 집게 했다.
const LEVELS = {
  easy: { edge: 0.42, pick: 'random', moves: 3 },
  normal: { edge: 0.55, pick: 'random', moves: 0 },
  hard: { edge: 0.5, pick: 'best', moves: 0 },
};

// 이 수를 두면 내 가장 큰 덩어리가 얼마나 커지는가. **보급이 덩어리 크기로 정해지므로
// 넓게 흩어지는 것보다 이어 붙이는 쪽이 이득이고, 판단기도 그 값을 봐야 한다.**
function groupGain(game, player, move) {
  const before = R.largestGroup(game, player);
  const target = game.territories[move.to];
  const owner = target.owner;
  const dice = target.dice;
  target.owner = player;
  target.dice = Math.max(1, move.dice - 1);
  const after = R.largestGroup(game, player);
  target.owner = owner;
  target.dice = dice;
  return after - before;
}

// 이 수가 상대의 가장 큰 덩어리를 얼마나 쪼개는가. 보급이 덩어리로 정해지므로
// 상대의 덩어리를 끊는 것은 그 자체로 이득이다 — 뺏은 땅보다 이쪽이 클 때도 있다.
function foeLoss(game, player, move) {
  const target = game.territories[move.to];
  const foe = target.owner;
  const before = R.largestGroup(game, foe);
  const dice = target.dice;
  target.owner = player;
  target.dice = Math.max(1, move.dice - 1);
  const after = R.largestGroup(game, foe);
  target.owner = foe;
  target.dice = dice;
  return before - after;
}

function score(game, player, move) {
  const win = O.odds(move.dice, move.against);
  // 얻는 것: 영토 하나 + 붙는 덩어리 + 끊어 낸 상대의 덩어리 + 덜어낸 주사위.
  const value = 1
    + groupGain(game, player, move) * 0.8
    + foeLoss(game, player, move) * 0.6
    + move.against * 0.25;
  // 잃는 것: 져도 친 곳은 하나로 줄어든다. 큰 무더기로 무리하게 치지 않게 하는 자리다.
  const cost = (move.dice - 1) * 0.35;
  return win * value - (1 - win) * cost;
}

// 이번에 칠 곳 하나. 확률이 문턱을 넘는 수를 모으고, 세기에 따라 그중 가장 좋은 것을
// 고르거나 아무거나 집는다.
function decide(game, player, opts = {}) {
  if (game.over || game.turn !== player) return null;
  const level = LEVELS[opts.level] || LEVELS.normal;
  const edge = opts.edge === undefined ? level.edge : opts.edge;
  const pick = opts.pick || level.pick;
  const limit = opts.moves === undefined ? level.moves : opts.moves;
  if (limit && (opts.done || 0) >= limit) return null;

  const open = [];
  for (const move of R.moves(game, player)) {
    if (O.odds(move.dice, move.against) < edge) continue;
    const value = score(game, player, move);
    if (value <= 0) continue;
    open.push({ move, value });
  }
  if (!open.length) return null;

  // 아무거나 집는 쪽도 굴림이 필요하다. 굴림을 받지 못했으면(테스트에서) 가장 좋은
  // 것을 고른다 — 그래야 같은 상황에서 같은 답이 나온다.
  if (pick === 'random' && opts.next) {
    return open[Math.floor(opts.next() * open.length)].move;
  }
  return open.reduce((a, b) => (b.value > a.value ? b : a)).move;
}

// 한 차례를 통째로 둔다. 화면은 한 수씩 보여 줘야 해서 쓰지 않고, 자가대국과
// 테스트에서 쓴다.
function playTurn(game, player, next, opts = {}) {
  const acts = [];
  for (let done = 0; done < 100; done++) {
    const move = decide(game, player, { ...opts, done, next: opts.next || next });
    if (!move) break;
    const result = R.attack(game, move.from, move.to, player, next);
    if (!result) break;
    acts.push(result);
    if (game.over) return acts;
  }
  R.endTurn(game, next);
  return acts;
}

const AI = { LEVELS, groupGain, foeLoss, score, decide, playTurn };

if (typeof module !== 'undefined' && module.exports) module.exports = AI;
if (typeof window !== 'undefined') window.DiceAI = AI;

})();

'use strict';

// 주사위 영토전의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// **주사위 굴림은 밖에서 넣어 준다**(`next`). 규칙 안에서 `Math.random`을 부르면
// 같은 판을 다시 돌려 볼 수 없어, 이상한 판정이 나왔을 때 확인할 방법이 없다.
(function () {

const MAX_DICE = 8;
// 남는 주사위를 쌓아 두는 한도. 여덟이 찬 영토뿐이라 못 받은 몫은 다음 차례로
// 넘어가는데, 한도가 없으면 판이 끝날 때까지 쌓여 한 번에 쏟아진다.
const MAX_STOCK = 24;

function createGame(map) {
  return {
    seed: map.seed,
    players: map.players,
    turn: 1,
    territories: map.territories.map((t) => ({
      id: t.id,
      owner: t.owner,
      dice: t.dice,
      neighbors: t.neighbors.slice(),
    })),
    stock: Object.fromEntries(
      Array.from({ length: map.players }, (_, i) => [i + 1, 0]),
    ),
    over: null,
  };
}

function held(game, player) {
  return game.territories.filter((t) => t.owner === player);
}

function alive(game, player) {
  return held(game, player).length > 0;
}

// 칠 수 있는가. 주사위가 하나뿐인 영토는 칠 수 없다 — 이겨도 옮길 것이 없다.
function canAttack(game, fromId, toId, player) {
  const from = game.territories[fromId];
  const to = game.territories[toId];
  if (!from || !to || game.over) return false;
  if (from.owner !== player || to.owner === player) return false;
  if (from.dice < 2) return false;
  return from.neighbors.includes(toId);
}

function roll(next, dice) {
  const out = [];
  for (let i = 0; i < dice; i++) out.push(1 + Math.floor(next() * 6));
  return out;
}

const sum = (list) => list.reduce((a, b) => a + b, 0);

// 친다. **같으면 지키는 쪽이 이긴다** — 이 규칙 하나가 원작에서 수비를 유리하게
// 만드는 자리이고, 확률 표도 그 기준으로 계산돼 있다.
function attack(game, fromId, toId, player, next) {
  if (!canAttack(game, fromId, toId, player)) return null;
  const from = game.territories[fromId];
  const to = game.territories[toId];

  const attackRoll = roll(next, from.dice);
  const defendRoll = roll(next, to.dice);
  const win = sum(attackRoll) > sum(defendRoll);

  const moved = from.dice - 1;
  if (win) {
    to.owner = from.owner;
    to.dice = moved;
  }
  from.dice = 1;

  const result = {
    from: fromId,
    to: toId,
    attackRoll,
    defendRoll,
    attackSum: sum(attackRoll),
    defendSum: sum(defendRoll),
    win,
    moved: win ? moved : 0,
  };
  judge(game);
  return result;
}

// 이어져 있는 내 영토 덩어리 중 가장 큰 것의 크기. 차례를 끝낼 때 받는 주사위 수다.
// **영토 수가 아니라 덩어리 크기**라, 넓게 흩어지는 것보다 이어 붙이는 편이 이득이다.
function largestGroup(game, player) {
  const mine = new Set(held(game, player).map((t) => t.id));
  const seen = new Set();
  let best = 0;
  for (const start of mine) {
    if (seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    for (let i = 0; i < group.length; i++) {
      for (const near of game.territories[group[i]].neighbors) {
        if (!mine.has(near) || seen.has(near)) continue;
        seen.add(near);
        group.push(near);
      }
    }
    best = Math.max(best, group.length);
  }
  return best;
}

// 받은 주사위를 내 영토에 하나씩 무작위로 얹는다. 여덟이 찬 곳은 건너뛰고, 다 찼으면
// 남는 만큼을 쌓아 둔다.
function reinforce(game, player, next) {
  const gain = largestGroup(game, player) + game.stock[player];
  let left = gain;
  const mine = held(game, player);
  while (left > 0) {
    const open = mine.filter((t) => t.dice < MAX_DICE);
    if (!open.length) break;
    open[Math.floor(next() * open.length)].dice++;
    left--;
  }
  game.stock[player] = Math.min(MAX_STOCK, left);
  return { player, gain, left: game.stock[player] };
}

function nextPlayer(game) {
  for (let step = 1; step <= game.players; step++) {
    const who = ((game.turn - 1 + step) % game.players) + 1;
    if (alive(game, who)) return who;
  }
  return game.turn;
}

function endTurn(game, next) {
  if (game.over) return null;
  const gained = reinforce(game, game.turn, next);
  game.turn = nextPlayer(game);
  judge(game);
  return gained;
}

function judge(game) {
  const living = [];
  for (let player = 1; player <= game.players; player++) {
    if (alive(game, player)) living.push(player);
  }
  if (living.length === 1) game.over = { winner: living[0] };
  return game.over;
}

// 지금 차례인 사람이 칠 수 있는 모든 수. 화면도 판단기도 이 목록만 보면 된다.
function moves(game, player) {
  const out = [];
  for (const from of held(game, player)) {
    if (from.dice < 2) continue;
    for (const toId of from.neighbors) {
      if (game.territories[toId].owner === player) continue;
      out.push({ from: from.id, to: toId, dice: from.dice, against: game.territories[toId].dice });
    }
  }
  return out;
}

const Rules = {
  MAX_DICE, MAX_STOCK,
  createGame, held, alive, canAttack, attack, largestGroup, reinforce, endTurn, judge, moves,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.DiceRules = Rules;

})();

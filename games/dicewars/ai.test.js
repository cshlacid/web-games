'use strict';

// 실행: node games/dicewars/ai.test.js
const R = require('./rules.js');
const M = require('./mapgen.js');
const A = require('./ai.js');
const O = require('./odds.js');

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

function line(owners, dice) {
  const territories = owners.map((owner, id) => ({
    id, owner, dice: dice[id],
    neighbors: [id - 1, id + 1].filter((n) => n >= 0 && n < owners.length),
    cells: [id],
  }));
  return R.createGame({ seed: 1, players: 2, territories });
}

// --- 무엇을 고르는가 ---
{
  // 왼쪽은 8대1(거의 확실), 오른쪽은 2대6(가망 없음).
  const game = line([8, 1, 2, 6].map((_, i) => (i === 0 || i === 2 ? 1 : 2)), [8, 1, 2, 6]);
  const move = A.decide(game, 1, { level: 'hard' });
  check('이길 수 있는 쪽을 고른다', [move.from, move.to], [0, 1]);
}

{
  const game = line([1, 2], [2, 6]);
  check('가망 없는 수뿐이면 차례를 끝낸다', A.decide(game, 1, { level: 'hard' }), null);
  check('문턱을 낮춰도 값이 남지 않으면 두지 않는다',
    A.decide(game, 1, { edge: 0, pick: 'best' }), null);
}

{
  const game = line([1, 2, 1, 2], [6, 1, 6, 1]);
  // 둘 다 6대1이지만, 왼쪽을 먹으면 내 덩어리가 이어지지 않고 오른쪽도 마찬가지다.
  // 어느 쪽이든 규칙에 맞는 수여야 한다.
  const move = A.decide(game, 1, { level: 'hard' });
  check('돌려준 수는 규칙에 맞는다', R.canAttack(game, move.from, move.to, 1), true);
}

{
  const game = line([1, 2, 2, 2], [8, 1, 1, 1]);
  check('한 차례 횟수를 지킨다', A.decide(game, 1, { level: 'easy', done: 3 }), null);
  check('제한이 없으면 계속 둔다', !!A.decide(game, 1, { level: 'hard', done: 30 }), true);
}

{
  // 남의 차례에는 두지 않는다.
  const game = line([1, 2], [4, 1]);
  game.turn = 2;
  check('제 차례가 아니면 두지 않는다', A.decide(game, 1, { level: 'hard' }), null);
}

// --- 덩어리를 보는가 ---
{
  //  내 것(4) · 남의 것(1) · 내 것(1) — 가운데를 먹으면 셋이 한 덩어리가 된다.
  const game = line([1, 2, 1, 2], [4, 1, 1, 1]);
  const move = { from: 0, to: 1, dice: 4, against: 1 };
  check('이으면 덩어리가 커지는 것을 안다', A.groupGain(game, 1, move), 2);
  check('상대의 덩어리가 쪼개지는 것도 본다', A.foeLoss(game, 1, move) >= 0, true);
}

// --- 난이도 사다리 ---
// 사람 자리에 가장 센 판단기를 세우고 상대만 바꾼다. 사람은 이보다 느슨하게 두므로
// 여기 나오는 승률은 사람이 겪을 승률의 위쪽 어림이다.
function play(level, seed, players, limit = 250) {
  const game = R.createGame(M.generate(seed, players));
  const next = rng(seed * 7919 + 1);
  let turns = 0;
  while (!game.over && turns < limit) {
    const who = game.turn;
    A.playTurn(game, who, next, who === 1 ? { level: 'hard' } : { level });
    turns++;
  }
  return { winner: game.over ? game.over.winner : 0, turns };
}

function rate(level, players) {
  let win = 0;
  let n = 0;
  let unfinished = 0;
  let turns = 0;
  // 서른 판으로는 보통과 어려움의 순서가 뒤집히는 날이 있었다. 둘의 차이가 한 자릿수
  // 퍼센트라 표본이 그만큼 필요하다.
  for (let seed = 1; seed <= 60; seed++) {
    const r = play(level, seed, players);
    n++;
    turns += r.turns;
    if (r.winner === 1) win++;
    if (!r.winner) unfinished++;
  }
  return { win: win / n, turns: turns / n, unfinished };
}

{
  const easy = rate('easy', 3);
  const normal = rate('normal', 3);
  const hard = rate('hard', 3);
  check('쉬울수록 이기기 쉽다', easy.win > normal.win && normal.win >= hard.win, true);
  check('쉬움은 거의 이긴다', easy.win > 0.85, true);
  check('어려움은 반반에 가깝다', hard.win < 0.75, true);
  check('판이 제 시간에 끝난다',
    [easy.unfinished, normal.unfinished, hard.unfinished].every((n) => n <= 2), true);
  check('한 판이 스무 차례 안팎', normal.turns > 8 && normal.turns < 80, true);
}

{
  // 인원이 늘수록 첫 차례의 이점이 줄어든다 — 2인은 먼저 치는 쪽이 크게 유리하다.
  const two = rate('hard', 2);
  const four = rate('hard', 4);
  check('사람이 늘면 첫 차례 이점이 준다', two.win > four.win, true);
}

// --- 실제 지도에서 규칙을 어기지 않는가 ---
{
  const game = R.createGame(M.generate(5, 4));
  const next = rng(99);
  let bad = 0;
  for (let turn = 0; turn < 40 && !game.over; turn++) {
    const who = game.turn;
    for (let i = 0; i < 100; i++) {
      const move = A.decide(game, who, { level: 'normal', done: i, next });
      if (!move) break;
      if (!R.canAttack(game, move.from, move.to, who)) { bad++; break; }
      R.attack(game, move.from, move.to, who, next);
      if (game.over) break;
    }
    if (!game.over) R.endTurn(game, next);
  }
  check('규칙에 어긋난 수를 두지 않는다', bad, 0);
  check('주사위는 늘 1에서 8 사이',
    game.territories.every((t) => t.dice >= 1 && t.dice <= R.MAX_DICE), true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

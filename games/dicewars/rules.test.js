'use strict';

// 실행: node games/dicewars/rules.test.js
const R = require('./rules.js');
const M = require('./mapgen.js');
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

// 주사위 눈을 정해 놓고 부른다. 규칙이 굴림을 밖에서 받으므로 이렇게 짤 수 있다.
function fixed(values) {
  let i = 0;
  return () => ((values[i++ % values.length] - 1) + 0.5) / 6;
}

// 영토 넷을 한 줄로 놓은 판. 0-1-2-3 순서로 맞닿아 있다.
function line(owners, dice) {
  const territories = owners.map((owner, id) => ({
    id, owner, dice: dice[id],
    neighbors: [id - 1, id + 1].filter((n) => n >= 0 && n < owners.length),
    cells: [id],
  }));
  return R.createGame({ seed: 1, players: 2, territories });
}

// --- 칠 수 있는가 ---
{
  const game = line([1, 2, 2, 1], [3, 2, 1, 1]);
  check('이웃한 남의 영토를 친다', R.canAttack(game, 0, 1, 1), true);
  check('내 영토는 못 친다', R.canAttack(game, 0, 0, 1), false);
  check('닿지 않은 곳은 못 친다', R.canAttack(game, 0, 2, 1), false);
  check('주사위 하나로는 못 친다', R.canAttack(game, 3, 2, 1), false);
  check('남의 차례에 남의 영토로는 못 친다', R.canAttack(game, 1, 0, 1), false);
}

// --- 굴림과 판정 ---
{
  const game = line([1, 2], [3, 2]);
  // 공격 6,6,6 = 18 / 방어 1,1 = 2
  const win = R.attack(game, 0, 1, 1, fixed([6, 6, 6, 1, 1]));
  check('이기면 그 영토를 갖는다', [game.territories[1].owner, game.territories[1].dice], [1, 2]);
  check('친 곳에는 하나만 남는다', game.territories[0].dice, 1);
  check('굴림과 합을 그대로 알려 준다',
    [win.attackRoll, win.defendRoll, win.attackSum, win.defendSum, win.win],
    [[6, 6, 6], [1, 1], 18, 2, true]);
}

{
  const game = line([1, 2], [3, 2]);
  // 공격 1,1,1 = 3 / 방어 6,6 = 12
  const lose = R.attack(game, 0, 1, 1, fixed([1, 1, 1, 6, 6]));
  check('지면 주인이 그대로다', game.territories[1].owner, 2);
  check('져도 친 곳은 하나로 준다', game.territories[0].dice, 1);
  check('진 결과도 그대로 알려 준다', [lose.win, lose.moved], [false, 0]);
}

{
  const game = line([1, 2], [2, 2]);
  // 합이 같으면 지키는 쪽이 이긴다: 공격 3,4=7 / 방어 3,4=7
  R.attack(game, 0, 1, 1, fixed([3, 4, 3, 4]));
  check('합이 같으면 지키는 쪽이 이긴다', game.territories[1].owner, 2);
}

// --- 덩어리와 보급 ---
{
  const game = line([1, 1, 2, 1], [1, 1, 1, 1]);
  check('가장 큰 덩어리만 센다', R.largestGroup(game, 1), 2);
  check('상대의 덩어리도 센다', R.largestGroup(game, 2), 1);
}

{
  const game = line([1, 1, 2, 2], [1, 1, 1, 1]);
  const gained = R.reinforce(game, 1, fixed([1]));
  const mine = game.territories.filter((t) => t.owner === 1).reduce((n, t) => n + t.dice, 0);
  check('덩어리 크기만큼 받는다', gained.gain, 2);
  check('받은 만큼 얹힌다', mine, 4);
}

{
  // 내 영토가 하나뿐이고 이미 여덟이면 받을 자리가 없어 쌓인다.
  const game = line([1, 2, 2, 2], [8, 1, 1, 1]);
  const gained = R.reinforce(game, 1, fixed([1]));
  check('놓을 자리가 없으면 쌓아 둔다', [gained.gain, game.stock[1]], [1, 1]);
  const again = R.reinforce(game, 1, fixed([1]));
  check('쌓인 것은 다음 차례에 더해진다', again.gain, 2);
}

// --- 차례와 승패 ---
{
  const game = line([1, 1, 2, 2], [2, 2, 2, 2]);
  R.endTurn(game, fixed([1]));
  check('차례가 넘어간다', game.turn, 2);
  R.endTurn(game, fixed([1]));
  check('한 바퀴 돌면 돌아온다', game.turn, 1);
}

{
  const game = line([1, 1, 1, 2], [4, 1, 4, 1]);
  R.attack(game, 2, 3, 1, fixed([6, 6, 6, 6, 1]));
  check('상대를 다 없애면 끝난다', game.over, { winner: 1 });
  check('끝난 뒤에는 더 칠 수 없다', R.canAttack(game, 0, 1, 1), false);
}

{
  const game = line([1, 2, 2, 2], [2, 2, 2, 2]);
  game.territories[0].owner = 2;
  R.endTurn(game, fixed([1]));
  check('사라진 사람은 차례를 건너뛴다', game.over, { winner: 2 });
}

// --- 둘 수 있는 수 목록 ---
{
  const game = line([1, 2, 1, 2], [3, 2, 1, 2]);
  check('칠 수 있는 수만 나온다', R.moves(game, 1), [{ from: 0, to: 1, dice: 3, against: 2 }]);
}

// --- 확률 표 ---
{
  check('1대1은 15/36', O.odds(1, 1).toFixed(4), (15 / 36).toFixed(4));
  check('많을수록 유리하다', O.odds(4, 2) > O.odds(3, 2) && O.odds(3, 2) > O.odds(2, 2), true);
  check('같은 수면 절반보다 낮다(같으면 지키는 쪽 승)', O.odds(4, 4) < 0.5, true);
  // 하나로 여덟을 치면 눈이 아무리 좋아도 6, 상대는 최소 8이라 이길 수가 없다.
  check('하나로 여덟은 이길 수 없다', O.odds(1, 8), 0);
  check('여덟으로 하나를 쳐도 확실하지는 않다', O.odds(8, 1) < 1, true);
}

// --- 실제 지도로 ---
{
  const map = M.generate(11, 3);
  const game = R.createGame(map);
  check('만든 지도로 판이 선다', [game.players, game.territories.length], [3, 24]);
  check('처음에는 아무도 안 죽었다', [1, 2, 3].every((p) => R.alive(game, p)), true);
  check('첫 차례에 둘 수 있는 수가 있다', R.moves(game, 1).length > 0, true);
  check('이웃 관계는 서로 맞물린다', game.territories.every((t) =>
    t.neighbors.every((n) => game.territories[n].neighbors.includes(t.id))), true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

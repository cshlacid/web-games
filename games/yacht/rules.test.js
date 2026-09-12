'use strict';

// 실행: node games/yacht/rules.test.js
const R = require('./rules.js');

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

// 굴림을 미리 적어 두고 순서대로 꺼내 쓴다. 규칙이 어떤 눈을 받았는지 그대로 보인다.
function feed(list) {
  let i = 0;
  return () => {
    const value = list[i % list.length];
    i++;
    return (value - 1) / 6 + 0.01;
  };
}

// --- 위 칸 ---
check('1의 눈은 개수만큼', R.scoreOf('ones', [1, 1, 3, 1, 5]), 3);
check('6의 눈은 개수 곱하기 여섯', R.scoreOf('sixes', [6, 6, 2, 6, 6]), 24);
check('없으면 0', R.scoreOf('fours', [1, 2, 3, 5, 6]), 0);

// --- 아래 칸 ---
check('초이스는 다섯 눈의 합', R.scoreOf('choice', [1, 2, 3, 4, 5]), 15);
check('4다이스는 넷이 같으면 전체 합', R.scoreOf('four', [5, 5, 5, 5, 1]), 21);
check('4다이스는 다섯이 같아도 된다', R.scoreOf('four', [2, 2, 2, 2, 2]), 10);
check('4다이스는 셋뿐이면 0', R.scoreOf('four', [5, 5, 5, 1, 2]), 0);
check('풀하우스는 셋 더하기 둘', R.scoreOf('full', [3, 3, 3, 2, 2]), 13);
check('풀하우스는 다섯이 같아도 인정', R.scoreOf('full', [4, 4, 4, 4, 4]), 20);
check('넷 더하기 하나는 풀하우스가 아니다', R.scoreOf('full', [2, 2, 2, 2, 3]), 0);
check('셋뿐이면 풀하우스가 아니다', R.scoreOf('full', [6, 6, 6, 1, 2]), 0);
check('S.스트레이트는 15점', R.scoreOf('small', [1, 2, 3, 4, 6]), 15);
check('S.스트레이트는 겹쳐도 된다', R.scoreOf('small', [3, 4, 5, 6, 6]), 15);
check('셋 줄은 S.스트레이트가 아니다', R.scoreOf('small', [1, 2, 3, 5, 5]), 0);
check('L.스트레이트는 30점', R.scoreOf('large', [2, 3, 4, 5, 6]), 30);
check('L.스트레이트에 못 미치면 0', R.scoreOf('large', [1, 2, 3, 4, 6]), 0);
check('야추는 50점', R.scoreOf('yacht', [3, 3, 3, 3, 3]), 50);
check('넷만 같으면 야추가 아니다', R.scoreOf('yacht', [3, 3, 3, 3, 1]), 0);
check('없는 칸은 0', R.scoreOf('없음', [1, 1, 1, 1, 1]), 0);

check('이어지는 길이를 센다', [
  R.runLength([1, 2, 3, 4, 5]),
  R.runLength([1, 1, 2, 5, 6]),
  R.runLength([2, 4, 6, 1, 3]),
], [5, 2, 4]);

// --- 판 진행 ---
{
  const game = R.newGame(2);
  check('처음에는 세 번 굴릴 수 있다', game.rollsLeft, 3);
  check('사람은 1번 자리', game.turn, 1);
  check('굴리기 전에는 잡을 수 없다', R.toggleKeep(game, 0), false);

  R.roll(game, feed([1, 2, 3, 4, 5]));
  check('굴리면 다섯 눈이 정해진다', game.dice, [1, 2, 3, 4, 5]);
  check('굴린 횟수가 준다', game.rollsLeft, 2);

  R.toggleKeep(game, 0);
  R.toggleKeep(game, 1);
  R.roll(game, feed([6, 6, 6, 6, 6]));
  check('잡아 둔 것은 그대로', game.dice.slice(0, 2), [1, 2]);
  check('나머지만 다시 굴린다', game.dice.slice(2), [6, 6, 6]);

  R.toggleKeep(game, 0);
  check('잡은 것을 놓을 수도 있다', game.keep[0], false);
}

{
  const game = R.newGame(2);
  check('굴리지 않고는 적을 수 없다', R.pick(game, 'choice'), null);
  R.roll(game, feed([2, 2, 2, 2, 2]));
  check('적으면 점수가 들어간다', R.pick(game, 'yacht').score, 50);
  check('적으면 차례가 넘어간다', [game.turn, game.rollsLeft], [2, 3]);
  check('넘어간 자리에는 같은 칸이 비어 있다', R.pick(game, 'yacht'), null);
  check('주사위는 비워진다', game.dice, [0, 0, 0, 0, 0]);
  check('적은 자리만 한 칸이 찼다',
    [R.open(game, 1).length, R.open(game, 2).length], [11, 12]);
  check('한 바퀴를 돌아야 다음 판', game.round, 1);
}

// 차례가 한 바퀴 돌면 판이 올라간다.
{
  const game = R.newGame(3);
  for (let i = 0; i < 3; i++) {
    R.roll(game, feed([1, 1, 1, 1, 1]));
    R.pick(game, 'ones');
  }
  check('세 자리가 모두 적으면 다음 판', [game.turn, game.round], [1, 2]);
  check('자리마다 제 점수판에 적힌다',
    [1, 2, 3].map((p) => R.sheetOf(game, p).ones), [5, 5, 5]);
}

// 보너스: 위 칸 합이 63 이상이면 35점이 붙는다.
{
  const game = R.newGame(2);
  for (const [key, value] of [['ones', 3], ['twos', 6], ['threes', 9],
    ['fours', 12], ['fives', 15], ['sixes', 18]]) game.sheets[1][key] = value;
  check('위 칸 합', R.upperSum(game, 1), 63);
  check('보너스가 붙는다', R.bonus(game, 1), 35);
  check('총점에도 들어간다', R.total(game, 1), 98);
  check('남의 점수판은 그대로', R.total(game, 2), 0);

  game.sheets[1].sixes = 12;
  check('한 끗 모자라면 보너스가 없다', R.bonus(game, 1), 0);
}

// 등수. 같은 점수면 자리 번호가 앞선 쪽이 앞에 선다.
{
  const game = R.newGame(3);
  game.sheets[1].choice = 20;
  game.sheets[2].choice = 30;
  game.sheets[3].choice = 30;
  check('점수 순으로 세운다', R.standings(game).map((one) => one.player), [2, 3, 1]);
}

// 모두가 열두 칸을 채우면 끝난다. 자리 수와 무관하게 차례 수는 같다.
for (const players of [2, 3, 4]) {
  const game = R.newGame(players);
  const next = feed([1, 1, 1, 1, 1]);
  let turns = 0;
  while (!game.done && turns < 100) {
    R.roll(game, next);
    R.pick(game, R.open(game)[0]);
    turns++;
  }
  check(`${players}인은 열두 판씩 돈다`, [turns, game.done], [12 * players, true]);
  check(`${players}인 끝난 뒤에는 굴릴 수 없다`, R.roll(game, next), null);
  check(`${players}인 끝난 뒤에는 적을 수 없다`, R.pick(game, 'choice'), null);
  check(`${players}인 모든 자리가 다 채웠다`,
    Array.from({ length: players }, (_, i) => R.open(game, i + 1).length),
    new Array(players).fill(0));
}

check('인원은 둘에서 넷 사이로 잡힌다',
  [R.newGame(1).players, R.newGame(9).players, R.newGame().players], [2, 4, 2]);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

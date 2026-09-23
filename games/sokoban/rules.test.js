'use strict';

// 실행: node games/sokoban/rules.test.js
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

// 가로 7칸. 사람 → 상자 → 빈칸 → 목표 순으로 한 줄에 놓였다.
//   #######
//   #@$ . #
//   #######
const line = R.parse('#######|#@$ . #|#######');
const at = (x, y) => y * line.w + x;

{
  check('크기', [line.w, line.h], [7, 3]);
  check('사람 자리', line.start.player, at(1, 1));
  check('상자 자리', line.start.boxes, [at(2, 1)]);
  check('목표', line.goals[at(4, 1)], 1);
  check('안쪽 바닥', [line.floor[at(5, 1)], line.floor[at(0, 0)]], [1, 0]);
}

{
  const one = R.step(line, line.start, 'right');
  check('밀면 사람과 상자가 한 칸씩 간다', [one.state.player, one.state.boxes], [at(2, 1), [at(3, 1)]]);
  check('민 상자의 번호', one.box, 0);
  check('원래 상태는 그대로', line.start.boxes, [at(2, 1)]);

  const two = R.step(line, one.state, 'right');
  check('목표에 올리면 끝', R.isDone(line, two.state), true);
  check('처음에는 안 끝났다', R.isDone(line, line.start), false);

  const back = R.step(line, two.state, 'left');
  check('상자를 끌 수는 없다 — 사람만 물러선다', [back.state.boxes, back.box], [[at(4, 1)], -1]);
}

{
  check('벽으로는 못 간다', R.step(line, line.start, 'left'), null);
  check('위도 벽이다', R.step(line, line.start, 'up'), null);

  // 상자 너머가 벽이면 못 민다.
  const wall = R.parse('#####|#@$#|#####');
  check('벽에 붙은 상자는 못 민다', R.step(wall, wall.start, 'right'), null);

  // 상자 둘을 한꺼번에 밀 수 없다.
  const pair = R.parse('#######|#@$$ ..#|#######');
  check('상자 둘은 못 민다', R.step(pair, pair.start, 'right'), null);
}

{
  //   #####
  //   #@  #
  //   # # #
  //   #$  #
  //   #.  #
  //   #####
  const room = R.parse('#####|#@  #|# # #|#$  #|#.  #|#####');
  const cell = (x, y) => y * room.w + x;
  check('상자를 돌아가는 길', R.path(room, room.start, cell(1, 4)),
    ['right', 'right', 'down', 'down', 'down', 'left', 'left']);
  check('제자리는 빈 길', R.path(room, room.start, room.start.player), []);
  check('상자 칸으로는 걷지 않는다', R.path(room, room.start, cell(1, 3)), null);
  check('벽으로는 걷지 않는다', R.path(room, room.start, cell(2, 2)), null);
  check('붙은 칸의 방향', R.dirBetween(room, cell(1, 1), cell(1, 2)), 'down');
  check('떨어진 칸은 방향이 없다', R.dirBetween(room, cell(1, 1), cell(3, 1)), null);
}

{
  // 막힌 곳 너머의 빈칸은 걸어서 갈 수 없다.
  const shut = R.parse('#######|#@#   #|#######');
  check('벽 너머는 못 간다', R.path(shut, shut.start, 4 + shut.w), null);
}

{
  const text = '####|# .#|#  ###|#*@  #|#  $ #|#  ###|####';
  const turned = R.rotate(text);
  check('돌리면 가로세로가 바뀐다', [R.rows(turned).length, R.rows(turned)[0].length], [6, 7]);
  check('네 번 돌리면 제자리', R.rotate(R.rotate(R.rotate(turned))), text);
  const a = R.parse(text);
  const b = R.parse(turned);
  check('돌려도 상자·목표 수는 같다',
    [b.start.boxes.length, b.goals.reduce((s, v) => s + v, 0)],
    [a.start.boxes.length, a.goals.reduce((s, v) => s + v, 0)]);

  // 시계 방향으로 돌렸으니 원래의 "오른쪽"은 이제 "아래"다.
  const wide = '#######|#@$ . #|#######';
  const tall = R.parse(R.rotate(wide));
  let state = tall.start;
  state = R.step(tall, state, 'down').state;
  state = R.step(tall, state, 'down').state;
  check('돌린 판에서도 풀린다', R.isDone(tall, state), true);
}

{
  check('좁은 판은 그대로', R.upright('#####|#@$.#|#####'), '#####|#@$.#|#####');
  const wide = '##############|#@$         .#|##############';
  check('가로로 긴 판은 세운다', R.rows(R.upright(wide)).length, 14);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

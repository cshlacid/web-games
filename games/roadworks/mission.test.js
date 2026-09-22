'use strict';

// 실행: node games/roadworks/mission.test.js
const M = require('./mission.js');
const T = require('./traffic.js');
const Net = require('./network.js');
const Gen = require('./mapgen.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

const seeded = (seed) => Gen.mulberry32(seed);
const bare = (seed) => Gen.city({ seed, land: { buildings: 0, hills: 0, lakes: 0, river: false } });

// 초 단위로 돌린다. 미션도 함께 재운다.
function run(world, game, secs) {
  for (let i = 0; i < secs * 60; i++) {
    T.tick(world, 1 / 60);
    M.step(world, game, 1 / 60);
  }
}

// 관문에서 관문까지 곧은 길 하나. 걸리는 시간을 손으로 셀 수 있다.
function corridor(len) {
  return Net.build(
    [{ id: 'W', kind: 'gate', x: 0, y: 100 }, { id: 'E', kind: 'gate', x: len, y: 100 }],
    [{ a: 'W', b: 'E', lanes: [-1, 1] }],
  );
}

// --- 만들어지는가 ---

{
  const game = M.create();
  check('처음에는 미션이 없다', [game.active, game.over], [null, null]);
  check('첫 미션까지 참이 있다', game.wait > 0, true);
}

{
  const world = T.create(corridor(900), { rng: seeded(1), spawnRate: 0 });
  const game = M.create({ grace: 0 });
  run(world, game, 1);
  const m = game.active;
  check('미션이 붙는다', !!m, true);
  check('관문에서 관문까지', [m.from, m.to].sort(), ['E', 'W']);
  check('미션 차가 판 위에 있다', world.vehicles.indexOf(m.car) >= 0, true);
  check('미션 차에 표가 있다', m.car.mission, true);
  check('그 차의 목적지가 미션의 목적지', m.car.goal, m.to);

  // **제한 시간은 길이에서 나온다.** 자유 주행으로 걸리는 시간의 몇 배다.
  check('제한 시간', m.limit, Math.round((m.len / M.PACE) * M.SLACK));
  check('길이는 길에서 잰다', Math.abs(m.len - 900) < 5, true);
  check('삯도 길이에서 나온다', m.reward, Math.round(m.len * M.REWARD));
}

// --- 닿으면 삯, 늦으면 끝 ---

{
  // 뻥 뚫린 길이라 넉넉히 닿는다.
  const world = T.create(corridor(900), { rng: seeded(2), spawnRate: 0, money: 100 });
  const game = M.create({ grace: 0 });
  run(world, game, 1);
  const m = game.active;
  const reward = m.reward;
  // 닿는 순간까지만 돌린다. 알림은 몇 초 뒤 스스로 내려간다.
  for (let i = 0; i < m.limit * 60 && !game.done; i++) {
    T.tick(world, 1 / 60);
    M.step(world, game, 1 / 60);
  }
  check('시간 안에 닿는다', game.done, 1);
  check('게임이 끝나지 않는다', game.over, null);
  check('삯이 들어온다', game.earned, reward);
  check('예산에도 들어온다', world.money > 100 + reward - 1, true);
  check('닿으면 알림이 남는다', game.last.kind, 'done');
  check('다음 미션까지 참이 있다', game.wait, M.GAP);
  // 알림은 스스로 내려간다.
  run(world, game, 6);
  check('알림이 내려간다', game.last, null);
}

{
  // **늦으면 게임이 끝난다.** 차를 넣자마자 시계를 다 써 버려 확인한다.
  const world = T.create(corridor(900), { rng: seeded(3), spawnRate: 0 });
  const game = M.create({ grace: 0 });
  run(world, game, 1);
  game.active.left = 0.5;
  run(world, game, 1);
  check('늦으면 끝난다', !!game.over, true);
  check('끝난 까닭', game.over.kind, 'late');
  check('끝나면 미션도 내려간다', game.active, null);

  // 끝난 뒤에는 시계가 돌지 않는다.
  const was = game.clock;
  run(world, game, 5);
  check('끝난 뒤에는 멈춘다', game.clock, was);
}

{
  // **길이 바뀌어 차가 지워진 것은 지는 것이 아니다.** 플레이어가 놓은 공사에 미션
  // 차가 휩쓸리는 일이 있는데, 그것으로 게임이 끝나면 공사가 겁나는 일이 된다.
  const world = T.create(corridor(900), { rng: seeded(4), spawnRate: 0 });
  const game = M.create({ grace: 0 });
  run(world, game, 1);
  T.despawn(world, game.active.car, false);
  run(world, game, 0.1);
  check('휩쓸린 차는 지는 것이 아니다', game.over, null);
  check('미션만 내려간다', game.active, null);
  check('취소로 남는다', game.last.kind, 'lost');
}

// --- 맵 위에서 ---

{
  const net = bare(1);
  const world = T.create(net, { rng: seeded(1), spawnRate: 1.5 });
  const game = M.create();
  run(world, game, 420);
  check('맵 위에서도 돈다', game.done > 0 || !!game.active || !!game.over, true);
  check('미션은 한 번에 하나뿐',
    world.vehicles.filter((v) => v.mission).length <= 1, true);

  // 멀리 떨어진 관문을 고른다 — 코앞의 심부름은 아무것도 묻지 않는다.
  const trip = M.pickTrip(world);
  check('충분히 먼 짝을 고른다', trip.len > (net.world.w + net.world.h) * 0.5, true);
}

{
  // 판이 막히면 늦는다. 미션이 무엇을 묻는지가 여기에 있다.
  const net = bare(2);
  const world = T.create(net, { rng: seeded(2), spawnRate: 3.6 });
  const game = M.create();
  run(world, game, 600);
  check('막힌 판에서는 끝난다', !!game.over, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

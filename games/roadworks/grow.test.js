'use strict';

// 실행: node games/roadworks/grow.test.js
const G = require('./grow.js');
const T = require('./traffic.js');
const Gen = require('./mapgen.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

function run(world, grow, secs) {
  for (let i = 0; i < secs * 60; i++) {
    T.tick(world, 1 / 60);
    G.step(world, grow, 1 / 60);
  }
}

// --- 통행량이 는다 ---

{
  const grow = G.create();
  check('처음 통행량', grow.rate, G.START);
  check('시간이 지나면 는다', G.rateAt(600) > G.rateAt(0), true);
  check('끝없이 늘지는 않는다', G.rateAt(1e6), G.CAP);
  check('기울기', Math.round(G.rateAt(1000) * 1000) / 1000,
    Math.round(Math.min(G.CAP, G.START + 1000 * G.PER_SEC) * 1000) / 1000);
}

{
  const net = Gen.city({ seed: 2 });
  const world = T.create(net, { rng: Gen.mulberry32(2), spawnRate: G.START });
  const grow = G.create();
  run(world, grow, 1);
  check('판의 통행량을 정한다', world.spawnRate, grow.rate);
  const was = world.spawnRate;
  run(world, grow, 180);
  check('시간이 지나면 판도 바빠진다', world.spawnRate > was, true);
}

// --- 건물이 는다 ---

{
  const net = Gen.city({ seed: 2 });
  const world = T.create(net, { rng: Gen.mulberry32(2), spawnRate: 0 });
  const grow = G.create();
  const was = net.land.buildings.length;
  run(world, grow, G.SPROUT_EVERY + 1);
  check('건물이 들어선다', net.land.buildings.length > was, true);
  check('센 수와 실제가 맞는다', net.land.buildings.length, was + grow.built);

  // **너무 빽빽해지면 멈춘다.** 길을 놓을 자리가 없어지면 게임이 막힌다.
  net.land.buildings.length = 0;
  for (let i = 0; i < G.room(net); i++) net.land.buildings.push({ kind: 'building', x: -99, y: -99, w: 1, h: 1 });
  const full = net.land.buildings.length;
  run(world, grow, G.SPROUT_EVERY * 3);
  check('빽빽하면 더 세우지 않는다', net.land.buildings.length, full);
}

{
  // 판 전체. **가만히 두면 결국 막힌다** — 그래야 계속 손을 댄다.
  const net = Gen.city({ seed: 1 });
  const world = T.create(net, { rng: Gen.mulberry32(1), spawnRate: G.START });
  const grow = G.create();
  run(world, grow, 120);
  const early = T.stats(world).speed;
  check('처음에는 잘 흐른다', early > 20, true);
  run(world, grow, 600);
  check('가만히 두면 느려진다', T.stats(world).speed < early, true);
  check('그 사이 도시가 자랐다', net.land.buildings.length > 40, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

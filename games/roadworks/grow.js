'use strict';

// 도시가 자란다. **판이 가만히 있으면 잘 짜 둔 길은 언제까지나 잘 짜인 길이다** —
// 통행이 늘고 건물이 들어서야 어제의 답이 오늘 모자라게 되고, 그래야 계속 손을 댄다.
//
// 자라는 것은 둘이다.
// - **통행량**: 천천히 올라간다. 처음의 열십자 하나로 견디는 양에서 시작해, 길을
//   늘리지 않으면 반드시 막히는 데까지 간다.
// - **건물**: 길가에 하나씩 들어선다. 플레이어가 새로 놓은 길가에도 들어서므로,
//   길을 놓으면 그 둘레가 도시가 된다.
(function (root) {

const Land = (typeof require !== 'undefined') ? require('./terrain.js') : root.RoadTerrain;

// 처음 통행량. **열십자 하나로 넉넉히 흐르는 양이다** — 시작하자마자 막혀 있으면
// 무엇을 고쳐야 하는지 읽을 수가 없다.
const START = 0.35;
// 초마다 이만큼 는다. 십 분쯤에 1.5(길을 꽤 놓아야 견디는 양)에 닿는 기울기다.
const PER_SEC = 0.0019;
// 끝없이 늘지는 않는다. 여기에 닿으면 판이 버티는지가 전부가 된다.
const CAP = 4;

const SPROUT_EVERY = 25;   // 건물이 들어서는 간격(초)
const SPROUT_N = 2;        // 한 번에 몇 채
// 건물이 너무 빽빽해지면 길을 놓을 자리가 없어진다. 판 넓이에 맞춰 여기서 멈춘다.
const ROOM_PER = 7000;

function create(opts) {
  const o = opts || {};
  return {
    clock: 0,
    rate: o.start == null ? START : o.start,
    sprout: SPROUT_EVERY,
    built: 0,
  };
}

// 지금의 통행량. 시간이 지날수록 는다.
function rateAt(clock, start) {
  return Math.min(CAP, (start == null ? START : start) + clock * PER_SEC);
}

function room(net) {
  return Math.round((net.world.w * net.world.h) / ROOM_PER);
}

function step(world, grow, dt) {
  grow.clock += dt;
  grow.rate = rateAt(grow.clock, grow.start);
  world.spawnRate = grow.rate;

  grow.sprout -= dt;
  if (grow.sprout > 0) return grow;
  grow.sprout = SPROUT_EVERY;
  const land = world.net.land;
  if (!land || land.buildings.length >= room(world.net)) return grow;
  grow.built += Land.sprout(world.net, land, world.rng, SPROUT_N);
  return grow;
}

const api = { create, step, rateAt, room, START, PER_SEC, CAP, SPROUT_EVERY, SPROUT_N };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadGrow = api;

})(typeof window !== 'undefined' ? window : globalThis);

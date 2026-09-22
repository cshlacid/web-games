'use strict';

// 미션. **시계가 멈추지 않는 판에 이기고 지는 조건을 준다.**
//
// 하나씩만 돈다. 차 한 대를 골라 관문에서 관문까지 시간 안에 보내는 일이고, 늦으면
// 그 자리에서 게임이 끝난다. **여럿을 동시에 걸지 않는 것은 실패가 곧 끝이기 때문이다**
// — 서너 개가 함께 돌면 어느 하나가 막히는 것만으로 끝나, 판을 고칠 틈이 없다.
//
// 상태는 이 모듈이 들고 화면은 읽기만 한다. 그래야 node로 성패를 확인할 수 있다.
(function (root) {

const Net = (typeof require !== 'undefined') ? require('./network.js') : root.RoadNet;
const Traffic = (typeof require !== 'undefined') ? require('./traffic.js') : root.RoadTraffic;

const GRACE = 22;    // 첫 미션까지. 판을 둘러보고 손볼 참을 준다
const GAP = 18;      // 미션 사이
const RETRY = 1.5;   // 자리를 못 잡았을 때 다시 해 보기까지
const PACE = 26;     // 막히지 않았을 때의 대략적인 속도(단위/초)
// **자유 주행 시간의 몇 배를 주는가.** 1에 가까우면 아무리 뚫려 있어도 못 닿고,
// 너무 크면 판이 막혀도 그냥 닿아 미션이 아무것도 묻지 않는다.
const SLACK = 1.7;
const REWARD = 0.18;  // 길이당 삯
const TRIES = 40;    // 멀리 떨어진 관문 짝을 찾는 시도

function create(opts) {
  const o = opts || {};
  return {
    clock: 0,
    wait: o.grace == null ? GRACE : o.grace,
    active: null,
    done: 0,
    earned: 0,
    last: null,      // 방금 끝난 미션. 화면이 잠깐 보여 준다
    over: null,      // 채워지면 게임이 끝난 것이다
  };
}

// 길이. 제한 시간도 삯도 여기서 나온다.
function routeLen(net, fromId, toId) {
  const path = Net.route(net, fromId, toId);
  if (!path || !path.length) return 0;
  let len = 0;
  for (const step of path) len += step.seg.length;
  return len;
}

// **멀리 떨어진 두 관문을 고른다.** 코앞의 심부름은 시간이 남아돌아 아무것도 묻지
// 않는다. 가장 먼 짝을 찾아 헤매지는 않고, 충분히 먼 것이 나오면 거기서 멈춘다.
function pickTrip(world) {
  const net = world.net;
  const gates = Net.gates(net);
  if (gates.length < 2) return null;
  // **먼 것의 잣대는 관문이 퍼진 넓이다.** `net.world`에 기대면 손으로 세운 판에서
  // 터지고, 맵이 커질 때 따라오지도 않는다.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of gates) {
    x0 = Math.min(x0, g.x); y0 = Math.min(y0, g.y);
    x1 = Math.max(x1, g.x); y1 = Math.max(y1, g.y);
  }
  const far = (x1 - x0 + y1 - y0) * 0.9;
  let best = null;
  for (let i = 0; i < TRIES; i++) {
    const from = gates[Math.floor(world.rng() * gates.length)];
    const to = gates[Math.floor(world.rng() * gates.length)];
    if (from.id === to.id) continue;
    const len = routeLen(net, from.id, to.id);
    if (!len) continue;
    if (!best || len > best.len) best = { from, to, len };
    if (best.len >= far) break;
  }
  return best;
}

function open(world, game) {
  const trip = pickTrip(world);
  if (!trip) return null;
  // 관문에 차가 밀려 있으면 이번에는 넣지 못한다. 그때는 곧 다시 해 본다.
  const car = Traffic.spawn(world, { from: trip.from.id, to: trip.to.id });
  if (!car) return null;
  car.mission = true;

  const limit = Math.max(25, Math.round((trip.len / PACE) * SLACK));
  game.active = {
    car,
    from: trip.from.id,
    to: trip.to.id,
    len: Math.round(trip.len),
    limit,
    left: limit,
    reward: Math.round(trip.len * REWARD),
  };
  return game.active;
}

function step(world, game, dt) {
  if (game.over) return game;
  game.clock += dt;
  if (game.last) {
    game.last.show -= dt;
    if (game.last.show <= 0) game.last = null;
  }

  const m = game.active;
  if (!m) {
    game.wait -= dt;
    if (game.wait <= 0) game.wait = open(world, game) ? 0 : RETRY;
    return game;
  }

  m.left -= dt;
  if (m.car.gone) {
    game.active = null;
    if (m.car.gone.counted) {
      game.done++;
      game.earned += m.reward;
      world.money += m.reward;
      game.last = { kind: 'done', reward: m.reward, left: Math.max(0, Math.ceil(m.left)), show: 5 };
      game.wait = GAP;
    } else {
      // **길이 바뀌어 차가 지워진 것은 지는 것이 아니다.** 플레이어가 놓은 공사에
      // 미션 차가 휩쓸리는 일이 있는데, 그것으로 게임이 끝나면 공사가 겁나는 일이 된다.
      game.last = { kind: 'lost', show: 5 };
      game.wait = RETRY;
    }
    return game;
  }

  if (m.left <= 0) {
    game.active = null;
    game.over = { kind: 'late', done: game.done, earned: game.earned, at: game.clock };
    m.car.mission = false;
  }
  return game;
}

const api = {
  create, step, open, pickTrip, routeLen,
  GRACE, GAP, PACE, SLACK, REWARD,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadMission = api;

})(typeof window !== 'undefined' ? window : globalThis);

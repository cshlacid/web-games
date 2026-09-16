'use strict';

// 수요. **승객은 가장 가까운 역이 아니라 목적지까지 가장 싼 길을 고른다.**
//
// 그래서 한 수요가 우리 망을 쓰는지는 거리 하나로 정해지지 않는다. 걷는 시간,
// 기다리는 시간, 타고 가는 시간을 다 더한 값(일반화 비용)을 지상 교통과 견주어야
// 정해지고, 그 한 수식이 역·노선·열차·직선화를 전부 수입에 연결한다.
//
// 화면을 모른다 — node에서 그대로 돈다.
(function () {

const Geom = (typeof module !== 'undefined' && module.exports)
  ? require('./geom.js')
  : window.MetroGeom;
const City = (typeof module !== 'undefined' && module.exports)
  ? require('./citygen.js')
  : window.MetroCity;

const WALK_SPEED = 1.35;    // m/s
const WALK_WEIGHT = 1.45;   // 걷는 1분은 타고 가는 1분보다 싫다
const R_WALK = 800;         // 이보다 먼 역은 후보로도 보지 않는다
// 지상 교통은 문 앞에서 문 앞까지를 잰다. 속도만 두면 비교가 불공평하다 — 차를
// 타는 쪽에도 주차하고 걸어 나오고 신호에 걸리는 시간이 있고, 그것을 빼면 짧은
// 거리에서는 지하철이 절대 이길 수 없다.
const SURFACE_SPEED = 4.2;   // m/s (약 15km/h). 신호와 막힘을 포함한 문 앞에서 문 앞까지
// 역까지 가는 길이 걷기만 있는 것은 아니다. **버스를 타고 역까지 갈 수 있고, 내려서
// 목적지까지도 버스를 탈 수 있다.** 기다리는 몫이 붙어 가까운 거리는 걷는 편이 낫고,
// 먼 거리는 버스가 낫다 — 그 갈림이 대략 사백 미터쯤이다.
const BUS_SPEED = 4.2;       // 지상 교통과 같은 속도
const BUS_WEIGHT = 1.2;      // 앉아 가니 걷는 것보다는 낫다
const BUS_ACCESS = 330;      // 정류장까지 걷고 기다리는 몫(초)
const R_ACCESS = 3000;       // 버스로도 이만큼까지만. 그보다 멀면 그냥 버스로 간다
// 차를 타는 쪽에도 세워 두고 걸어 나오고 신호에 걸리는 시간이 있다. 이 값이
// 작으면 짧은 거리에서 지하철이 절대 이길 수 없고, 그러면 게임이 성립하지 않는다.
const SURFACE_ACCESS = 420;  // 초
// **짧은 거리는 지하철이 이길 수 없다.** 3km를 가는데 양쪽에서 300m씩 걸으면 그
// 걷는 시간만으로 차를 타는 것과 비슷해진다 — 현실이 그렇고, 그래서 생성 자체를
// 지하철이 이길 만한 거리로 묶는다.
const MIN_DIST = 2200;
const MAX_WAITING = 8;      // 동시에 화면에 뜨는 못 잡은 수요
const MAX_TOTAL = 30;
const PATIENCE = 16 * 60;   // 게임 초. 이 안에 못 잡으면 사라진다
const SPAWN_EVERY = 70;     // 게임 초마다 하나씩 생긴다
const SERVED = 0.6;         // 이 이상이면 잡은 것으로 보고 지도에서 걷는다
const TRANSFER = 100;       // 갈아타는 데 드는 초. 계단과 통로와 번거로움
const TRAIN_CAPACITY = 700; // 열차 한 대가 한 번에 실어 나르는 사람
// 억 / (사람 × km × 게임분). 망이 어중간할 때도 돈이 조금은 들어와야 다음 한 수를
// 둘 수 있다. 진짜 균형은 아직 잡지 않았다.
const FARE = 0.00012;

const walkCost = (d) => d / WALK_SPEED * WALK_WEIGHT;
const busCost = (d) => BUS_ACCESS + d / BUS_SPEED * BUS_WEIGHT;

// 역까지 오가는 값. 걷는 것과 버스 중 싼 쪽을 고른다.
function accessCost(d) {
  if (d > R_ACCESS) return Infinity;
  return Math.min(d <= R_WALK ? walkCost(d) : Infinity, busCost(d));
}

// 지상 교통과 견준 이용률. **경계에서 뚝 끊기면** 역을 조금 옮겼을 뿐인데 수입이
// 0과 100을 오간다. 부드러운 계단으로 잇는다.
function share(cost, ref) {
  if (!Number.isFinite(cost) || ref <= 0) return 0;
  const r = cost / ref;
  if (r <= 0.7) return 1;
  if (r >= 1.5) return 0;
  const k = (1.5 - r) / 0.8;
  return k * k * (3 - 2 * k);
}

const ANCHOR_R = 500;       // 역세권으로 보는 거리
const BOTH_ENDS = 0.7;      // 역이 둘 이상이면 이 확률로 양쪽 끝을 다 역세권에서 뽑는다

// 수요 하나. **건물이 빽빽한 곳에서 더 자주, 더 크게 생긴다** — 그래서 노선이 키운
// 동네가 다음 수요를 부르고, 그것이 다시 그 동네를 키운다.
//
// **한쪽 끝은 대개 이미 역이 있는 동네에서 뽑는다.** 도시 전체에 고르게 뿌리면
// 망에서 멀리 떨어진, 손쓸 수 없는 수요가 화면을 채워 할 일 목록이 아니라 잡음이
// 된다. 역이 하나도 없을 때만 아무 데서나 생긴다 — 그때는 그 호가 "역을 어디
// 놓을지"를 가리키는 표시다.
function spawn(city, rng, anchors = []) {
  const standing = city.buildings;
  const anyBuilding = () => {
    for (let i = 0; i < 400; i++) {
      const b = standing[Math.floor(rng() * standing.length)];
      if (b && b.level > 0 && rng() < b.level / 4 + 0.25) return b;
    }
    return null;
  };
  const nearStation = () => {
    if (!anchors.length) return null;
    const s = anchors[Math.floor(rng() * anchors.length)];
    const list = City.buildingsNear(city, s.x, s.y, ANCHOR_R);
    return list.length ? list[Math.floor(rng() * list.length)] : null;
  };
  const pick = (anchored) => (anchored ? nearStation() || anyBuilding() : anyBuilding());

  for (let tries = 0; tries < 60; tries++) {
    // 역이 둘 이상이면 대개 **양쪽 끝을 다 역세권에서** 뽑는다. 한쪽만 붙여 두면
    // 반대쪽이 도시 어딘가에 떨어져 손쓸 수 없는 수요가 되고, 그런 것이 화면을
    // 채우면 할 일 목록이 아니라 잡음이 된다. 나머지 셋 중 하나는 한쪽을 비워 둬
    // "저기까지 이으면 딴다"가 되게 한다.
    const both = anchors.length > 1 && rng() < BOTH_ENDS;
    const a = pick(anchors.length > 0);
    const b = pick(both);
    if (!a || !b) break;
    const from = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const to = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const span = Geom.dist(from.x, from.y, to.x, to.y);
    if (span < MIN_DIST) continue;
    return {
      a: from, b: to, km: span / 1000,
      people: Math.round(40 + (a.level + b.level) * 45 + rng() * 70),
      born: 0, usage: 0, via: null,
    };
  }
  return null;
}

// 한 수요가 쓸 수 있는 가장 싼 길. **갈아타는 것까지 따진다.**
//
// 운행 하나하나를 노드로 펼치고(운행 × 정차역) 다익스트라를 돌린다. 같은 운행 안에서
// 옮겨 가는 것은 주행시간, 같은 역에서 다른 운행으로 옮겨 타는 것은 환승 벌점에 그
// 운행의 대기시간을 더한 값이다.
//
// **환승 횟수에 상한을 두지 않는다.** 한 번 갈아탈 때마다 벌점과 대기가 붙으므로
// 두 번 세 번 갈아타는 길은 알아서 비싸진다. 상한은 규칙을 하나 더 만들 뿐이다.
//
// `services`는 운행 하나하나다: 역 목록, 어디에 서는지, 배차간격, 두 정차역 사이
// 소요시간을 돌려주는 함수, 그리고 분당 수송력.
function evaluate(od, services) {
  const nodes = [];
  const atStation = new Map();
  const bySvc = [];
  for (let si = 0; si < services.length; si++) {
    const svc = services[si];
    bySvc.push([]);
    for (let i = 0; i < svc.stations.length; i++) {
      if (!svc.stopAt[i]) continue;
      const station = svc.stations[i];
      const id = nodes.push({ svc, si, i, station }) - 1;
      bySvc[si].push(id);
      if (!atStation.has(station)) atStation.set(station, []);
      atStation.get(station).push(id);
    }
  }
  if (!nodes.length) {
    return { cost: Infinity, ref: surfaceCost(od), usage: 0, via: null };
  }

  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const walkIn = new Array(nodes.length).fill(0);

  for (let id = 0; id < nodes.length; id++) {
    const w = Geom.dist(od.a.x, od.a.y, nodes[id].station.x, nodes[id].station.y);
    const access = accessCost(w);
    if (!Number.isFinite(access)) continue;
    const cost = access + nodes[id].svc.headway / 2;
    if (cost < dist[id]) { dist[id] = cost; walkIn[id] = w; }
  }

  // 노드가 수백 개뿐이라 우선순위 큐 없이 훑는다. 힙을 들이면 코드만 길어진다.
  const done = new Array(nodes.length).fill(false);
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let id = 0; id < nodes.length; id++) {
      if (!done[id] && dist[id] < best) { best = dist[id]; u = id; }
    }
    if (u < 0) break;
    done[u] = true;
    const node = nodes[u];

    for (const v of bySvc[node.si]) {
      if (v === u) continue;
      const ride = node.svc.ride(node.i, nodes[v].i);
      if (ride == null) continue;
      const cost = dist[u] + ride;
      if (cost < dist[v]) { dist[v] = cost; prev[v] = u; }
    }
    for (const v of atStation.get(node.station)) {
      if (nodes[v].si === node.si) continue;
      const cost = dist[u] + TRANSFER + nodes[v].svc.headway / 2;
      if (cost < dist[v]) { dist[v] = cost; prev[v] = u; }
    }
  }

  let best = Infinity;
  let end = -1;
  let walkOut = 0;
  for (let id = 0; id < nodes.length; id++) {
    if (!Number.isFinite(dist[id])) continue;
    const w = Geom.dist(od.b.x, od.b.y, nodes[id].station.x, nodes[id].station.y);
    const access = accessCost(w);
    if (!Number.isFinite(access)) continue;
    const cost = dist[id] + access;
    if (cost < best) { best = cost; end = id; walkOut = w; }
  }

  const ref = surfaceCost(od);
  if (end < 0) return { cost: Infinity, ref, usage: 0, via: null };

  // 지나온 길을 되짚어 어느 운행을 어디서 어디까지 탔는지로 접는다. 수송량을
  // 재려면 "이 구간에 몇 명이 탔는가"를 알아야 하고, 그건 이 토막에서 나온다.
  const chain = [];
  for (let id = end; id >= 0; id = prev[id]) chain.push(id);
  chain.reverse();
  const legs = [];
  const stations = [];
  for (const id of chain) {
    const n = nodes[id];
    stations.push(n.station);
    const last = legs[legs.length - 1];
    if (last && last.si === n.si) last.to = n.i;
    else legs.push({ svc: n.svc, si: n.si, from: n.i, to: n.i });
  }
  const via = {
    legs: legs.filter((leg) => leg.from !== leg.to),
    stations, walkA: walkIn[chain[0]], walkB: walkOut,
    // 버스를 탔는지. 걸어서 갈 수 있는 거리를 넘었으면 버스를 탄 것이다.
    busA: walkIn[chain[0]] > R_WALK,
    busB: walkOut > R_WALK,
    transfers: Math.max(0, legs.length - 1),
  };
  return { cost: best, ref, usage: share(best, ref), via };
}

function surfaceCost(od) {
  return Geom.dist(od.a.x, od.a.y, od.b.x, od.b.y) / SURFACE_SPEED + SURFACE_ACCESS;
}

// **수송량 한도.** 이용률을 비용만으로 정하면 한 노선에 아무리 몰려도 다 타는 것이
// 되어, 열차를 늘릴 이유가 기다리는 시간뿐이다. 구간마다 실린 사람을 세어 수송력을
// 넘으면 넘친 만큼 이용률을 깎는다 — 못 탄 사람은 지상으로 간다.
//
// 깎으면 부하가 줄어 다시 계산이 달라지므로 두 번 돌린다. 한 번이면 과하게 깎이고,
// 여러 번 돌려 봐야 게임에서 읽히는 차이가 없다.
function assign(demands, services) {
  for (const od of demands) {
    const got = evaluate(od, services);
    od.cost = got.cost;
    od.ref = got.ref;
    od.base = got.usage;
    od.usage = got.usage;
    od.via = got.via;
  }

  const factor = new Array(services.length).fill(1);
  const apply = () => {
    for (const od of demands) {
      let f = 1;
      if (od.via) for (const leg of od.via.legs) f = Math.min(f, factor[leg.si]);
      od.usage = od.base * f;
    }
  };

  // **압력은 아무도 깎기 전의 부하다.** 깎고 난 부하를 보여 주면 언제나 정원에 딱
  // 맞게 나와서, 얼마나 넘치는지가 화면에서 사라진다.
  apply();
  for (const svc of services) {
    svc.pressure = svc.capacity > 0 ? loadOf(svc, demands) / svc.capacity : 0;
  }

  // 넘치는 만큼 깎기를 되풀이한다. 깎으면 부하가 줄고, 한 운행이 줄면 그것을 함께
  // 쓰던 다른 운행의 사정도 바뀐다. **줄이기만 하므로 되돌아오지 않는다** — 매번
  // 다시 재서 비율을 새로 잡으면 깎았다 풀었다를 되풀이한다.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    services.forEach((svc, si) => {
      const load = loadOf(svc, demands);
      if (load > svc.capacity && load > 0) { factor[si] *= svc.capacity / load; changed = true; }
    });
    if (!changed) break;
    apply();
  }

  for (const svc of services) { svc.load = loadOf(svc, demands); svc.crowd = svc.pressure; }

  // **잡았는지는 혼잡이 아니라 길로 따진다.** 혼잡까지 섞어 버리면 길을 아무리 잘
  // 놓아도 붐비는 동안은 "못 잡은 수요"로 남아 지도가 영영 지워지지 않고, 두 가지
  // 다른 문제(길이 나쁘다 / 다 태우지 못한다)가 한 숫자에 뭉개진다. 지도의 호는
  // 길이 모자란 곳을 가리키고, 노선 패널의 혼잡이 못 태우는 몫을 가리킨다.
  for (const od of demands) od.served = od.base >= SERVED;
  return demands;
}

// 한 운행에서 가장 붐비는 구간에 실린 사람. 정원을 넘는지는 평균이 아니라 **가장
// 붐비는 한 구간**이 정한다 — 그 구간에서 못 타면 그 길은 성립하지 않는다.
function loadOf(svc, demands) {
  const order = [];
  for (let i = 0; i < svc.stations.length; i++) if (svc.stopAt[i]) order.push(i);
  const pos = new Map(order.map((i, k) => [i, k]));
  if (order.length < 2) return 0;
  const loads = new Array(order.length - 1).fill(0);

  for (const od of demands) {
    if (!od.via || !od.usage) continue;
    for (const leg of od.via.legs) {
      if (leg.svc !== svc) continue;
      const p = pos.get(leg.from);
      const q = pos.get(leg.to);
      if (p == null || q == null) continue;
      const flow = od.people * od.usage;
      const lo = Math.min(p, q);
      const hi = Math.max(p, q);
      for (let k = lo; k < hi; k++) loads[k] += flow;
    }
  }
  return loads.reduce((a, b) => Math.max(a, b), 0);
}

// 한쪽 끝이 역에 얼마나 닿았는가. 못 잡은 수요를 그릴 때 **어느 쪽을 이으면 되는지**를
// 끝마다 달리 그리려고 쓴다. 2는 걸어갈 수 있는 거리, 1은 버스로 닿는 거리, 0은 멀다.
function reach(point, stations) {
  let best = 0;
  for (const s of stations) {
    const d = Geom.dist(point.x, point.y, s.x, s.y);
    if (d <= R_WALK) return 2;
    if (d <= R_ACCESS) best = 1;
  }
  return best;
}

// 난이도가 요금을 탄다. 어려울수록 같은 승객이 덜 벌어 준다.
function income(od, minutes, scale = 1) {
  return od.people * od.km * FARE * od.usage * minutes * scale;
}

const Demand = {
  WALK_SPEED, WALK_WEIGHT, R_WALK, SURFACE_SPEED, SURFACE_ACCESS, MIN_DIST,
  MAX_WAITING, MAX_TOTAL, PATIENCE, SPAWN_EVERY, SERVED, FARE, ANCHOR_R, BOTH_ENDS,
  TRANSFER, TRAIN_CAPACITY, BUS_SPEED, BUS_WEIGHT, BUS_ACCESS, R_ACCESS,
  share, spawn, evaluate, assign, loadOf, surfaceCost, accessCost, reach, income,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Demand;
if (typeof window !== 'undefined') window.MetroDemand = Demand;

})();

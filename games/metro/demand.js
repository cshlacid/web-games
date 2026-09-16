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
// 억 / (사람 × km × 게임분). 망이 어중간할 때도 돈이 조금은 들어와야 다음 한 수를
// 둘 수 있다. 진짜 균형은 아직 잡지 않았다.
// 인원을 6분의 1로 줄이면서 한 번 같은 배로 올렸다가 도로 내렸다. 정원이 더는 발목을
// 잡지 않아 **이용률이 그만큼 올라갔기 때문**이다 — 인원 × 이용률이 도로 제자리다.
const FARE = 0.00011;

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
      // **수요 한 쌍이 노선 하나를 다 먹지 않을 만큼.** 전에는 한 쌍이 130~470명/분이라
      // 열차 여덟 대짜리 노선(382명/분)을 **한 쌍이 혼자 채웠다** — 그래서 첫 열차부터
      // 가득 찬 채였고, 열차를 사도 칸이 차 있는 것은 그대로였다. 지금은 22~76명/분이라
      // 여덟 대면 열 쌍쯤을 실어 나른다.
      people: Math.round(8 + (a.level + b.level) * 7 + rng() * 12),
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
    const peak = peakOf(svc, demands);
    svc.pressure = svc.capacity > 0 ? peak.load / svc.capacity : 0;
    svc.peak = peak;   // 화면이 이 구간을 굵게 덧그어 "여기가 막혔다"를 짚는다
    // **역에 서는 줄도 깎기 전의 그림이다.** 깎고 나면 못 탄 사람은 지상으로 가 버려
    // 줄이 0이 된다 — 그러면 "얼마나 못 태우고 있는가"가 화면에서 사라진다.
    svc.press = flowOf(svc, demands, true);
  }

  // 넘치는 만큼 깎기를 되풀이한다. 깎으면 부하가 줄고, 한 운행이 줄면 그것을 함께
  // 쓰던 다른 운행의 사정도 바뀐다. **줄이기만 하므로 되돌아오지 않는다** — 매번
  // 다시 재서 비율을 새로 잡으면 깎았다 풀었다를 되풀이한다.
  //
  // **깎는 비율은 "정원 ÷ 가장 무거운 구간"이 아니라 "실제로 탄 사람 ÷ 타려던 사람"이다.**
  // 앞엣것은 한 구간만 보므로, 붐비는 구간을 지나지 않는 승객까지 같이 깎였다.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    services.forEach((svc, si) => {
      const flow = flowOf(svc, demands);
      if (!flow) return;
      const stuck = sum(flow.left) + (flow.leftBack ? sum(flow.leftBack) : 0);
      if (stuck <= 0) return;
      const wanted = sum(flow.occ) > 0 || stuck > 0 ? boardedOf(svc, demands) : 0;
      if (wanted <= 0) return;
      const got = Math.max(0, wanted - stuck);
      factor[si] *= got / wanted;
      changed = true;
    });
    if (!changed) break;
    apply();
  }

  for (const svc of services) {
    svc.load = loadOf(svc, demands);
    svc.crowd = svc.pressure;
    // 열차가 실제로 싣고 가는 인원과 역마다 남은 줄. 화면이 이것으로 열차를 채우고
    // 역에 숫자를 붙인다.
    svc.flow = flowOf(svc, demands);
  }

  // **잡았는지는 혼잡이 아니라 길로 따진다.** 혼잡까지 섞어 버리면 길을 아무리 잘
  // 놓아도 붐비는 동안은 "못 잡은 수요"로 남아 지도가 영영 지워지지 않고, 두 가지
  // 다른 문제(길이 나쁘다 / 다 태우지 못한다)가 한 숫자에 뭉개진다. 지도의 호는
  // 길이 모자란 곳을 가리키고, 노선 패널의 혼잡이 못 태우는 몫을 가리킨다.
  for (const od of demands) od.served = od.base >= SERVED;
  return demands;
}

function loadOf(svc, demands) { return peakOf(svc, demands).load; }

// 한 운행에서 가장 붐비는 구간에 실린 사람과 **그 구간이 어디인지**. 정원을 넘는지는
// 평균이 아니라 **가장 붐비는 한 구간**이 정한다 — 그 구간에서 못 타면 그 길은
// 성립하지 않는다. 어디인지까지 돌려주는 것은, 혼잡률만 숫자로 띄우면 "970%"를 보고도
// 무엇을 고쳐야 하는지 알 수가 없기 때문이다.
function peakOf(svc, demands) {
  const order = [];
  for (let i = 0; i < svc.stations.length; i++) if (svc.stopAt[i]) order.push(i);
  const pos = new Map(order.map((i, k) => [i, k]));
  if (order.length < 2) return { load: 0, at: -1, from: -1, to: -1 };

  // **순환선은 마지막 역에서 첫 역으로 돌아오는 구간도 센다.** 이웃한 쌍만 세던 때는
  // 그 한 구간이 빠져, 한 바퀴 도는 노선에서 정작 가장 붐비는 자리를 놓칠 수 있었다.
  const loop = !!(svc.line && svc.line.loop);
  const n = loop ? order.length : order.length - 1;

  // **오는 쪽과 가는 쪽을 따로 센다.** 한 배열에 합치면 A→B 가는 열차가 B→A 손님까지
  // 실은 것으로 잡혀 혼잡이 두 배 가까이 부풀고, **종점에 닿은 열차가 비지 않는다** —
  // 내린 사람 몫이 그대로 남아 있기 때문이다. 수송력(`정원 × 60 ÷ 배차간격`)도 원래
  // 한 방향치라, 나누어야 둘이 같은 단위가 된다. 순환선은 한 방향뿐이라 앞쪽만 쓴다.
  const loads = new Array(n).fill(0);
  const back = loop ? null : new Array(n).fill(0);

  for (const od of demands) {
    if (!od.via || !od.usage) continue;
    for (const leg of od.via.legs) {
      if (leg.svc !== svc) continue;
      const p = pos.get(leg.from);
      const q = pos.get(leg.to);
      if (p == null || q == null) continue;
      const flow = od.people * od.usage;
      // 순환선은 한 방향뿐이라 지나쳤으면 한 바퀴를 돌아 온다 — `rideTime`과 같은 셈이다.
      if (loop) { for (let k = p; k !== q; k = (k + 1) % n) loads[k] += flow; continue; }
      const side = p < q ? loads : back;
      for (let k = Math.min(p, q); k < Math.max(p, q); k++) side[k] += flow;
    }
  }

  let at = 0;
  let dir = 1;
  let load = 0;
  for (let k = 0; k < n; k++) {
    if (loads[k] > load) { load = loads[k]; at = k; dir = 1; }
    if (back && back[k] > load) { load = back[k]; at = k; dir = -1; }
  }
  // 구간마다의 부하를 통째로 돌려준다. 화면이 **열차가 지금 지나는 구간**의 부하로
  // 그 열차를 채워 그린다 — 혼잡을 노선 하나의 숫자로만 두면 어느 열차가 터지는지가
  // 안 보인다.
  return { load, at, dir, loads, back, from: order[at], to: order[(at + 1) % order.length] };
}

// **승객은 역에서만 타고 내린다.** 여태는 구간마다의 통행량을 그대로 "재차 인원"으로
// 썼는데, 그러면 정원을 넘는 값이 열차 안에 그려지고(실제로는 못 탄 사람이 승강장에
// 남는다) **종점에 닿아도 열차가 비지 않는다.** 여기서는 정차역을 차례로 돌며 내리고
// 태운다 — 태우는 것은 **빈자리만큼**이고, 남은 사람은 그 역에 줄로 남는다.
//
//   역 i에서:  재차 −= 내리는 사람
//             탈 수 있는 만큼 = min(타려는 사람, 정원 − 재차)
//             줄 = 타려는 사람 − 탄 사람
//
// 단위는 분당 인원이다. 정원도 `정원 × 60 ÷ 배차간격`이라 같은 단위이고, 그래서
// 나눗셈 하나로 "그 열차가 얼마나 찼는가"가 나온다.
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// 그 운행에 타려는 사람 전부(깎기 전이 아니라 지금 이용률 기준).
function boardedOf(svc, demands) {
  let total = 0;
  for (const od of demands) {
    if (!od.via || !od.usage) continue;
    for (const leg of od.via.legs) if (leg.svc === svc) total += od.people * od.usage;
  }
  return total;
}

function flowOf(svc, demands, useBase = false) {
  const order = [];
  for (let i = 0; i < svc.stations.length; i++) if (svc.stopAt[i]) order.push(i);
  const pos = new Map(order.map((i, k) => [i, k]));
  const stops = order.length;
  if (stops < 2) return null;

  const loop = !!(svc.line && svc.line.loop);
  const empty = () => ({ board: new Array(stops).fill(0), alight: new Array(stops).fill(0) });
  const fwd = empty();
  const rev = loop ? null : empty();

  for (const od of demands) {
    if (!od.via || !(useBase ? od.base : od.usage)) continue;
    for (const leg of od.via.legs) {
      if (leg.svc !== svc) continue;
      const p = pos.get(leg.from);
      const q = pos.get(leg.to);
      if (p == null || q == null) continue;
      const flow = od.people * (useBase ? od.base : od.usage);
      // 순환선은 한 방향뿐이라 지나쳤으면 한 바퀴를 돌아 온다.
      const side = loop || p < q ? fwd : rev;
      side.board[p] += flow;
      side.alight[q] += flow;
    }
  }

  const cap = svc.capacity > 0 ? svc.capacity : Infinity;

  // 정차역을 차례로 돌며 내리고 태운다. `seq`는 도는 차례이고, 왕복선은 종점에서
  // 모두 내리므로 한 바퀴면 끝이지만 순환선은 돌고 돌아 제자리로 오므로 몇 바퀴를
  // 돌려 값이 자리를 잡게 한다.
  const walk = (side, seq, laps) => {
    const occ = new Array(seq.length - 1).fill(0);
    const left = new Array(stops).fill(0);
    // 역마다 "타려는 사람"과 "내린 뒤 남은 빈자리". 줄이 쌓이고 빠지는 셈이 이 둘로
    // 떨어진다 — 빈자리가 타려는 사람보다 많으면 그만큼 줄이 줄어든다.
    const want = new Array(stops).fill(0);
    const room = new Array(stops).fill(0);
    let carry = 0;
    for (let lap = 0; lap < laps; lap++) {
      left.fill(0);
      for (let k = 0; k + 1 < seq.length; k++) {
        const i = seq[k];
        // 깎인 뒤에는 실제로 탄 사람보다 내릴 사람이 많게 잡힐 수 있다. 0에서 막는다.
        carry = Math.max(0, carry - side.alight[i]);
        const free = Math.max(0, cap - carry);
        const got = Math.min(side.board[i], free);
        carry += got;
        want[i] = side.board[i];
        room[i] = free;
        left[i] = side.board[i] - got;
        occ[k] = carry;
      }
      if (!loop) carry = 0;   // 종점에서는 남김없이 내린다
    }
    return { occ, left, want, room };
  };

  const upTo = (n) => Array.from({ length: n }, (_, k) => k);
  const ahead = walk(fwd, loop ? [...upTo(stops), 0] : upTo(stops), loop ? 3 : 1);
  const behind = rev ? walk(rev, upTo(stops).reverse(), 1) : null;

  // 뒤로 도는 쪽의 구간 번호는 앞쪽과 반대라 뒤집어 맞춰 둔다 — 화면이 같은 번호로 읽는다.
  const backOcc = behind ? behind.occ.slice().reverse() : null;
  return {
    occ: ahead.occ, back: backOcc,
    left: ahead.left, leftBack: behind ? behind.left : null,
    // 방향을 합쳐 역마다 하나로 본다. 승강장은 한 곳이고, 어느 쪽으로 가려는
    // 사람이든 같은 자리에서 기다린다.
    want: ahead.want.map((n, k) => n + (behind ? behind.want[k] : 0)),
    room: ahead.room.map((n, k) => n + (behind ? behind.room[k] : 0)),
    order, cap,
  };
}

// 계기판에 올릴 사람 수. **셋으로 남김없이 갈린다** — 지금 타는 사람, 타려는데 자리가
// 없는 사람, 길이 없거나 나빠서 지상으로 가는 사람. 건수로만 두면 "몇 건"과 "몇 명"이
// 한 줄에 섞여 서로 견줄 수가 없었다.
//
//   people = people·usage  +  people·(base − usage)  +  people·(1 − base)
//              탐               못 탐                    안 탐
function tally(demands) {
  let riding = 0;
  let missed = 0;
  let away = 0;
  for (const od of demands) {
    const base = od.base || 0;
    const usage = od.usage || 0;
    riding += od.people * usage;
    missed += od.people * Math.max(0, base - usage);
    away += od.people * Math.max(0, 1 - base);
  }
  return { riding, missed, away };
}

// 계기판에 올릴 사람 수. **셋으로 남김없이 갈린다** — 지금 타는 사람, 타려는데 자리가
// 없는 사람, 길이 없거나 나빠서 지상으로 가는 사람. 건수로만 두면 "몇 건"과 "몇 명"이
// 한 줄에 섞여 서로 견줄 수가 없었다.
//
//   people = people·usage  +  people·(base − usage)  +  people·(1 − base)
//              탐               못 탐                    안 탐
function tally(demands) {
  let riding = 0;
  let missed = 0;
  let away = 0;
  for (const od of demands) {
    const base = od.base || 0;
    const usage = od.usage || 0;
    riding += od.people * usage;
    missed += od.people * Math.max(0, base - usage);
    away += od.people * Math.max(0, 1 - base);
  }
  return { riding, missed, away };
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
  peakOf, tally, flowOf,
  WALK_SPEED, WALK_WEIGHT, R_WALK, SURFACE_SPEED, SURFACE_ACCESS, MIN_DIST,
  MAX_WAITING, MAX_TOTAL, PATIENCE, SPAWN_EVERY, SERVED, FARE, ANCHOR_R, BOTH_ENDS,
  TRANSFER, BUS_SPEED, BUS_WEIGHT, BUS_ACCESS, R_ACCESS,
  share, spawn, evaluate, assign, loadOf, surfaceCost, accessCost, reach, income,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Demand;
if (typeof window !== 'undefined') window.MetroDemand = Demand;

})();

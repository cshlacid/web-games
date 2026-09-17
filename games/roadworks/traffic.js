'use strict';

// 실시간으로 도는 차들. 화면을 만지지 않으므로 node로 그대로 돌려볼 수 있다.
//
// **차 한 대 한 대를 민다.** 앞 판에서는 링크마다 통행량을 배분해 색만 칠했는데,
// 그때는 판이 한 수씩 끊겼기 때문에 그래도 됐다. 지금은 시간이 계속 흐르고 차가
// 보여야 하므로 차마다 자리와 속도를 들고 간다.
//
// 따라가기는 IDM(Intelligent Driver Model)이다. 자유 주행 항과 앞차 항이 곱이 아니라
// 합으로 들어가 **막히면 부드럽게 서고 풀리면 부드럽게 나간다** — 앞차와의 거리만
// 보고 속도를 정하는 방식은 정체가 풀릴 때 전부 동시에 튀어나가 우스꽝스럽다.
//
// 차의 자리는 (차로, 그 차로 위의 거리 s)다. 차로가 제 진행 방향으로 향한 길을
// 들고 있어서 s는 늘 0에서 길이까지 늘기만 한다.
(function (root) {

const Net = (typeof require !== 'undefined') ? require('./network.js') : root.RoadNet;

// 차종. len·w는 화면 단위(차로 폭이 10이다), v0는 바라는 속도, a·b는 가속과 감속.
// weight는 뽑힐 확률이다.
// **실물 비례보다 조금 크게 그린다.** 차로 폭(10)에 실제 비율대로 맞추면 폰에서
// 차 한 대가 점이 되어 무엇이 지나가는지 보이지 않는다.
const KINDS = [
  { id: 'car', len: 17, w: 7.4, v0: 34, a: 16, b: 20, weight: 44 },
  { id: 'taxi', len: 17, w: 7.4, v0: 38, a: 18, b: 22, weight: 13 },
  { id: 'bus', len: 33, w: 9, v0: 25, a: 8, b: 13, weight: 8 },
  { id: 'truck', len: 26, w: 8.8, v0: 23, a: 7.5, b: 12, weight: 11 },
  { id: 'moto', len: 10, w: 4.2, v0: 41, a: 23, b: 26, weight: 24 },
];

const S0 = 5;          // 멈춰 섰을 때 앞차와 두는 거리
const HEADWAY = 1.1;   // 앞차까지 두는 시간(초)
const STEP = 1 / 60;   // 물리 한 걸음. 프레임이 길어도 이 크기로 쪼개 돈다
const MAX_STEPS = 6;   // 탭이 잠들었다 깨어났을 때 한 프레임에 따라잡을 한도

// 교차로를 하나씩 지나게 한다. 신호는 아직 없고, 먼저 닿은 차가 자리를 잡고
// 빠져나갈 때까지 뒤차가 기다린다.
const CLAIM_AHEAD = 26;   // 이만큼 남았을 때 교차로 자리를 잡는다
const CLAIM_LIMIT = 7;    // 이만큼 기다렸으면 그냥 간다 — 서로 물려 멎는 것을 막는다

function pickKind(rng) {
  const total = KINDS.reduce((sum, k) => sum + k.weight, 0);
  let roll = rng() * total;
  for (const kind of KINDS) {
    roll -= kind.weight;
    if (roll <= 0) return kind;
  }
  return KINDS[0];
}

function create(net, options) {
  const opts = options || {};
  return {
    net,
    rng: opts.rng || Math.random,
    vehicles: [],
    claims: new Map(),   // 교차로 id → 지금 지나는 차의 id
    lanes: new Map(),    // 차로 열쇠 → s 순으로 늘어놓은 차들
    time: 0,
    nextId: 1,
    spawnRate: opts.spawnRate == null ? 2.6 : opts.spawnRate,  // 초당 진입 대수
    spawnDebt: 0,
    maxVehicles: opts.maxVehicles == null ? 260 : opts.maxVehicles,
    arrived: 0,
  };
}

const laneKey = (lane) => `${lane.seg}:${lane.index}`;

function bucket(world) {
  world.lanes.clear();
  for (const v of world.vehicles) {
    const key = laneKey(v.lane);
    let list = world.lanes.get(key);
    if (!list) { list = []; world.lanes.set(key, list); }
    list.push(v);
  }
  for (const list of world.lanes.values()) list.sort((p, q) => p.s - q.s);
}

function listOn(world, lane) {
  return world.lanes.get(laneKey(lane)) || [];
}

// --- 넣고 빼기 ---

// options로 드나들 관문을 집어 줄 수 있다. 판 위에서는 아무 데서나 들어오지만,
// 테스트에서는 어느 길을 지날지 정해 둬야 볼 것을 본다.
function spawn(world, options) {
  const { net, rng } = world;
  const opts = options || {};
  const gates = Net.gates(net);
  if (gates.length < 2) return null;

  const from = opts.from ? Net.node(net, opts.from) : gates[Math.floor(rng() * gates.length)];
  let to = opts.to ? Net.node(net, opts.to) : gates[Math.floor(rng() * gates.length)];
  if (!from || !to) return null;
  if (to.id === from.id) to = gates[(gates.indexOf(to) + 1) % gates.length];

  const path = Net.route(net, from.id, to.id);
  if (!path || !path.length) return null;

  const first = Net.segment(net, path[0].seg.id);
  const group = Net.lanesOf(first, path[0].dir);
  if (!group.length) return null;
  const lane = group[Math.floor(rng() * group.length)];

  const kind = pickKind(rng);
  // 앞이 비어 있을 때만 넣는다. 관문에 차가 밀려 있으면 이번 몫은 버린다 — 겹쳐
  // 넣으면 그 자리에서 서로를 밀고 나간다.
  //
  // **차로별 목록이 아니라 차 전부를 훑는다.** 그 목록은 걸음마다 새로 짜는데,
  // 넣는 일은 그 사이에도 불릴 수 있어 한 걸음 묵은 자리를 보게 된다.
  let room = Infinity;
  for (const other of world.vehicles) {
    if (other.lane === lane) room = Math.min(room, other.s);
  }
  if (room < kind.len + S0 + 8) return null;

  const vehicle = {
    id: world.nextId++,
    kind,
    route: path,
    step: 0,
    lane,
    rank: lane.rank,
    s: 0,
    v: kind.v0 * 0.65,
    claim: null,
    waiting: 0,
  };
  world.vehicles.push(vehicle);
  return vehicle;
}

function despawn(world, vehicle) {
  if (vehicle.claim != null && world.claims.get(vehicle.claim) === vehicle.id) {
    world.claims.delete(vehicle.claim);
  }
  const at = world.vehicles.indexOf(vehicle);
  if (at >= 0) world.vehicles.splice(at, 1);
  world.arrived++;
}

// --- 한 걸음 ---

function step(world, dt) {
  const slices = Math.min(MAX_STEPS, Math.max(1, Math.round(dt / STEP)));
  const slice = Math.min(dt, STEP * slices) / slices;
  for (let i = 0; i < slices; i++) tick(world, slice);
}

function tick(world, dt) {
  world.time += dt;

  world.spawnDebt += world.spawnRate * dt;
  while (world.spawnDebt >= 1) {
    world.spawnDebt -= 1;
    if (world.vehicles.length < world.maxVehicles) spawn(world);
  }

  bucket(world);

  for (const v of world.vehicles) {
    const front = ahead(world, v);
    let accel = idm(v, front.gap, front.dv);
    if (front.stop) accel = Math.min(accel, -v.kind.b * 0.9);
    v.v = Math.max(0, v.v + accel * dt);
    v.s += v.v * dt;
    v.waiting = v.v < 1 ? v.waiting + dt : 0;
  }

  // 앞으로 민 뒤에 구간을 넘긴다. 미는 도중에 차로를 갈아 끼우면 같은 프레임에서
  // 남들이 보는 차로 목록과 어긋난다.
  for (const v of world.vehicles.slice()) advance(world, v);
}

function idm(v, gap, dv) {
  const kind = v.kind;
  const free = 1 - Math.pow(v.v / kind.v0, 4);
  if (gap === Infinity) return kind.a * free;
  const want = S0 + Math.max(0, v.v * HEADWAY + (v.v * dv) / (2 * Math.sqrt(kind.a * kind.b)));
  const room = Math.max(gap, 0.5);
  return kind.a * (free - Math.pow(want / room, 2));
}

// 앞에 무엇이 있는가 — 같은 차로의 앞차, 없으면 다음 차로의 맨 뒤차, 그리고 아직
// 못 들어간 교차로.
function ahead(world, v) {
  const list = listOn(world, v.lane);
  const at = list.indexOf(v);
  for (let i = at + 1; i < list.length; i++) {
    const other = list[i];
    return { gap: other.s - other.kind.len - v.s, dv: v.v - other.v, stop: false };
  }

  let gap = v.lane.path.total - v.s;
  const node = Net.node(world.net, v.lane.to);

  // 교차로를 아직 못 잡았으면 정지선 앞에서 선다.
  if (blocked(world, v, node, gap)) return { gap: Math.max(gap - 2, 0.5), dv: v.v, stop: gap < 4 };

  const lane = nextHolder(world, v);
  if (lane === undefined) return { gap, dv: v.v, stop: gap < 4 };
  if (!lane) return { gap: Infinity, dv: 0, stop: false };
  const first = listOn(world, lane)[0];
  if (!first) return { gap: Infinity, dv: 0, stop: false };
  return { gap: gap + first.s - first.kind.len, dv: v.v - first.v, stop: false };
}

// 교차로 자리 잡기. 갈림이 없는 이음매(지나는 길이 하나뿐인 점)에서는 기다릴
// 이유가 없다.
function blocked(world, v, node, gap) {
  if (!node || node.kind === 'gate' || node.segs.length < 3) return false;
  if (v.claim === node.id) return false;
  if (gap > CLAIM_AHEAD) return false;
  const holder = world.claims.get(node.id);
  if (holder == null || holder === v.id) {
    world.claims.set(node.id, v.id);
    v.claim = node.id;
    return false;
  }
  // 서로 물려 아무도 못 가는 자리를 풀어 준다. 신호가 생기기 전까지의 안전장치다.
  if (v.waiting > CLAIM_LIMIT) {
    world.claims.set(node.id, v.id);
    v.claim = node.id;
    return false;
  }
  return true;
}

// 다음에 탈 길. 실제 차로 다음에는 **교차로를 도는 짧은 곡선**이 오고, 그 곡선
// 다음에 비로소 다음 구간의 차로가 온다. 길이 끝났으면 null, 갈 차로가 없으면
// undefined다 — 앞쪽이 비어 있는 것과 막다른 것을 갈라야 한다.
function nextHolder(world, v) {
  if (v.lane.isLink) return v.lane.next;
  const next = v.route[v.step + 1];
  if (!next) return null;
  const lane = Net.pickLane(Net.segment(world.net, next.seg.id), next.dir, v.rank);
  if (!lane) return undefined;
  return Net.link(v.lane, lane) || lane;
}

function advance(world, v) {
  const total = v.lane.path.total;
  if (v.s < total) {
    // 교차로를 빠져나왔으면 자리를 비운다.
    if (v.claim != null && !v.lane.isLink && v.s > v.kind.len) release(world, v);
    return;
  }

  const holder = nextHolder(world, v);
  if (!holder) { despawn(world, v); return; }

  v.s -= total;
  // 잇는 곡선은 같은 발걸음 안에 있다. 실제 차로에 올라설 때만 경로를 한 칸 민다.
  if (!holder.isLink) v.step += 1;
  v.lane = holder;
  v.rank = holder.rank;
}

function release(world, v) {
  if (world.claims.get(v.claim) === v.id) world.claims.delete(v.claim);
  v.claim = null;
}

// 차의 화면 위 자리 — **앞머리**다. 몸통은 그 뒤로 그린다.
//
// 가운데를 돌려주면 구간을 막 넘어선 차(s가 0에 가까운 차)의 가운데가 앞 구간
// 뒤쪽에 있어야 하는데, 그 길은 이미 지나온 길이라 자리를 찾을 수 없다. 길 밖으로
// 나가는 대신 끝점으로 접히면서 **차 반 대 길이만큼 툭 튄다** — 버스에서 17단위였다.
// 앞머리를 기준으로 두면 그럴 자리가 없다.
function place(v) {
  const Geom = (typeof require !== 'undefined') ? require('./geom.js') : root.RoadGeom;
  return Geom.at(v.lane.path, v.s);
}

function stats(world) {
  const counts = {};
  let speed = 0;
  for (const v of world.vehicles) {
    counts[v.kind.id] = (counts[v.kind.id] || 0) + 1;
    speed += v.v;
  }
  return {
    total: world.vehicles.length,
    counts,
    speed: world.vehicles.length ? speed / world.vehicles.length : 0,
    arrived: world.arrived,
  };
}

const api = {
  create, step, tick, spawn, despawn, place, stats, idm, ahead, advance, nextHolder,
  KINDS, S0, HEADWAY, STEP, CLAIM_AHEAD,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadTraffic = api;

})(typeof window !== 'undefined' ? window : globalThis);

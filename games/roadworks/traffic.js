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
const Geom = (typeof require !== 'undefined') ? require('./geom.js') : root.RoadGeom;

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

// 아무것도 놓이지 않은 교차로는 하나씩 지난다. 먼저 닿은 차가 자리를 잡고 빠져나갈
// 때까지 뒤차가 기다린다.
const CLAIM_AHEAD = 26;   // 이만큼 남았을 때 교차로 자리를 잡는다
const CLAIM_LIMIT = 7;    // 이만큼 기다렸으면 그냥 간다 — 서로 물려 멎는 것을 막는다

// 신호등. 마주 보는 두 갈래에 함께 녹색을 주고, 황색을 거쳐 다른 짝으로 넘긴다.
const GREEN = 7;
const AMBER = 1.3;
// **기다리는 차가 없으면 일찍 넘긴다.** 갈래가 넷이면 한 바퀴가 길어, 빈 길에 녹색을
// 다 주면 신호가 없느니만 못해진다. 다만 열자마자 닫으면 막 출발한 차가 갇히므로
// 이만큼은 준다.
const MIN_GREEN = 1.6;
// 정지선에서 이만큼 안쪽에 있는 차를 "기다리는 차"로 센다.
const WAIT_ZONE = 70;
// 좌회전이 마주 오는 차를 살피는 거리. 이 안에 오는 차가 있으면 틈을 기다린다.
const ONCOMING = 72;

// 회전교차로. 도는 차가 내 들어가는 자리에 이 시간 안에 닿을 것 같으면 기다린다.
// **도는 차에게 양보한다**는 규칙이 이 값으로 나타난다 — 거리가 아니라 시간으로 재야
// 빠르게 도는 차 앞으로 끼어들지 않는다.
const RING_GAP = 1.9;
// 양보선에서 이만큼 앞에 선다. 도는 길이 그 선 위를 지나므로 코를 맞대면 겹친다.
const RING_STANDOFF = 8;

// 사람. 차가 34쯤으로 달리니 사람은 한참 느리다.
const WALK_SPEED = 7.5;
// 횡단보도 한 곳에 사람이 생기는 잦기(초당).
const WALK_RATE = 0.16;
// 신호가 없는 교차로에서는 이 거리 안에 오는 차가 없어야 건너기 시작한다.
const WALK_LOOK = 55;

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
    signals: new Map(),  // 교차로 id → { phase, timer, amber }
    ring: new Map(),     // 회전교차로 id → 지금 돌고 있는 차들의 각
    demand: new Map(),   // 신호 교차로 id → 갈래마다 기다리는 차 수
    walkers: [],         // 횡단보도를 건너는 사람들
    walkDebt: 0,
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
  world.ring.clear();
  world.demand.clear();
  for (const v of world.vehicles) {
    const key = laneKey(v.lane);
    let list = world.lanes.get(key);
    if (!list) { list = []; world.lanes.set(key, list); }
    list.push(v);

    // 회전교차로를 돌고 있는 차는 각으로도 적어 둔다. 들어가려는 차가 양보할지를
    // 이 목록으로 정한다.
    if (v.lane.ring) {
      const at = place(v);
      let ring = world.ring.get(v.lane.node);
      if (!ring) { ring = []; world.ring.set(v.lane.node, ring); }
      ring.push({ v, angle: Math.atan2(at.y - v.lane.cy, at.x - v.lane.cx) });
    }

    // 신호 교차로로 다가가는 차를 갈래별로 센다. 비어 있는 갈래를 건너뛰는 데 쓴다.
    if (!v.lane.isLink && v.lane.path.total - v.s < WAIT_ZONE) {
      const node = Net.node(world.net, v.lane.to);
      if (node && node.control === 'signal') {
        let counts = world.demand.get(node.id);
        if (!counts) { counts = []; world.demand.set(node.id, counts); }
        const phase = Net.phaseOf(node, v.lane);
        counts[phase] = (counts[phase] || 0) + 1;
      }
    }
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
  // 첫 구간에서도 끝에서 할 이동을 허락하는 차로를 골라야 한다.
  const after = path[1];
  const need = after
    ? Net.movement(net, first, path[0].dir, Net.segment(net, after.seg.id), after.dir)
    : null;
  const fit = need ? group.filter((l) => l.allow.indexOf(need) >= 0) : group;
  const pool = fit.length ? fit : group;
  const lane = pool[Math.floor(rng() * pool.length)];

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
  stepSignals(world, dt);

  world.spawnDebt += world.spawnRate * dt;
  while (world.spawnDebt >= 1) {
    world.spawnDebt -= 1;
    if (world.vehicles.length < world.maxVehicles) spawn(world);
  }

  bucket(world);
  stepWalkers(world, dt);

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

// --- 사람 ---

// 횡단보도의 가로선. 교차로 바깥을 가로지르고, 양 끝은 길 밖 인도까지 조금 넘어간다.
function crossLine(net, node, seg) {
  const from = Net.crossingAt(node);
  const along = seg.a === node.id ? from : seg.center.total - from;
  const at = Geom.at(seg.center, Math.max(1, Math.min(seg.center.total - 1, along)));
  return { at, span: seg.width / 2 + 5 };
}

function spawnWalker(world) {
  const { net, rng } = world;
  const spots = [];
  for (const node of net.nodes) {
    if (!node.crossing) continue;
    for (const id of node.segs) spots.push({ node, seg: Net.segment(net, id) });
  }
  if (!spots.length) return null;
  const pick = spots[Math.floor(rng() * spots.length)];
  const dir = rng() < 0.5 ? 1 : -1;
  const { span } = crossLine(net, pick.node, pick.seg);
  const walker = {
    id: world.nextId++,
    node: pick.node.id,
    seg: pick.seg.id,
    u: -dir * span,
    dir,
    span,
    walking: false,
  };
  world.walkers.push(walker);
  return walker;
}

// 건너기 시작해도 되는가. **한번 발을 들이면 차가 서 준다** — 서로 기다리다 아무도
// 못 가는 자리가 생기지 않게, 사람은 들어서기 전에만 살핀다.
function walkerClear(world, walker) {
  const node = Net.node(world.net, walker.node);
  const seg = Net.segment(world.net, walker.seg);
  if (!node || !seg) return false;

  if (node.control === 'signal') {
    // 그 갈래에 빨간 불이 들어와 있을 때 건넌다.
    const sig = signalOf(world, node);
    const arriving = seg.lanes.filter((l) => l.to === node.id);
    if (!arriving.length) return true;
    return arriving.every((l) => Net.phaseOf(node, l) !== sig.phase) || sig.amber;
  }

  // 신호가 없으면 차가 뜸할 때 건넌다.
  const from = Net.crossingAt(node);
  for (const v of world.vehicles) {
    if (v.lane.isLink) continue;
    if (v.lane.seg !== seg.id) continue;
    const toCross = v.lane.to === node.id
      ? (v.lane.path.total - from) - v.s      // 교차로 쪽으로 오는 차
      : from - v.s;                           // 교차로에서 나가는 차
    if (toCross > -6 && toCross < WALK_LOOK) return false;
  }
  return true;
}

function stepWalkers(world, dt) {
  world.walkDebt += crossings(world) * WALK_RATE * dt;
  while (world.walkDebt >= 1) {
    world.walkDebt -= 1;
    spawnWalker(world);
  }

  for (const walker of world.walkers.slice()) {
    if (!walker.walking) {
      if (!walkerClear(world, walker)) continue;
      walker.walking = true;
    }
    walker.u += walker.dir * WALK_SPEED * dt;
    if (Math.abs(walker.u) > walker.span) {
      const at = world.walkers.indexOf(walker);
      if (at >= 0) world.walkers.splice(at, 1);
    }
  }
}

function crossings(world) {
  let count = 0;
  for (const node of world.net.nodes) if (node.crossing) count += node.segs.length;
  return count;
}

// 그 갈래의 횡단보도를 지금 사람이 밟고 있는가.
function walkerOn(world, nodeId, segId, width) {
  for (const walker of world.walkers) {
    if (!walker.walking || walker.node !== nodeId || walker.seg !== segId) continue;
    if (Math.abs(walker.u) < width / 2 + 2) return true;
  }
  return false;
}

// 사람의 화면 위 자리. 렌더러가 프레임마다 부른다.
function walkerSpot(net, walker) {
  const node = Net.node(net, walker.node);
  const seg = Net.segment(net, walker.seg);
  const { at } = crossLine(net, node, seg);
  const side = Geom.right({ x: at.dx, y: at.dy });
  return { x: at.x + side.x * walker.u, y: at.y + side.y * walker.u };
}

function idm(v, gap, dv) {
  const kind = v.kind;
  const free = 1 - Math.pow(v.v / kind.v0, 4);
  if (gap === Infinity) return kind.a * free;
  const want = S0 + Math.max(0, v.v * HEADWAY + (v.v * dv) / (2 * Math.sqrt(kind.a * kind.b)));
  const room = Math.max(gap, 0.5);
  return kind.a * (free - Math.pow(want / room, 2));
}

// 지금 타고 있는 길에서 내려야 하는 자리. 연결 곡선이 교차로 앞뒤를 갈음하므로,
// 교차로로 들어가는 차는 **차로 끝이 아니라 정지선에서** 내린다.
function endOf(v, holder) {
  if (v.lane.isLink || !holder || !holder.isLink) return v.lane.path.total;
  return v.lane.path.total - holder.trimIn;
}

// 앞에 무엇이 있는가 — 같은 차로의 앞차, 없으면 다음 길의 맨 뒤차, 그리고 아직
// 들어가면 안 되는 교차로.
function ahead(world, v) {
  const list = listOn(world, v.lane);
  const at = list.indexOf(v);
  for (let i = at + 1; i < list.length; i++) {
    const other = list[i];
    return { gap: other.s - other.kind.len - v.s, dv: v.v - other.v, stop: false };
  }

  const holder = nextHolder(world, v);
  const gap = endOf(v, holder) - v.s;
  const node = Net.node(world.net, v.lane.to);

  if (blocked(world, v, node, gap, holder)) {
    // **회전교차로에서는 조금 더 물러나 선다.** 양보선이 도는 길 바로 위라, 거기에
    // 코를 들이밀고 서면 지나가는 차와 겹친다.
    const standoff = node.control === 'circle' ? RING_STANDOFF : 2;
    return { gap: Math.max(gap - standoff, 0.5), dv: v.v, stop: gap < 4 };
  }

  const onward = (() => {
    if (holder === undefined) return { gap, dv: v.v, stop: gap < 4 };
    if (!holder) return { gap: Infinity, dv: 0, stop: false };

    // **갈라져 나간 이웃 곡선의 차도 앞차다.** 같은 차로에서 나가는 길이 여럿이면
    // 차로 목록이 갈려, 바로 앞에서 다른 쪽으로 꺾어 나간 차를 못 본 채 따라 들어간다.
    let best = null;
    const links = holder.isLink && v.lane.links ? [...v.lane.links.values()] : [holder];
    for (const path of links) {
      if (!path) continue;
      const first = listOn(world, path)[0];
      if (!first) continue;
      const base = v.lane.isLink && !path.isLink ? v.lane.trimOut : 0;
      const room = gap + (first.s - base) - first.kind.len;
      if (!best || room < best.gap) best = { gap: room, dv: v.v - first.v, stop: false };
    }
    return best || { gap: Infinity, dv: 0, stop: false };
  })();

  // **회전교차로 안에서는 도는 차끼리도 앞뒤가 있다.** 들어온 갈래가 달라 차로
  // 목록이 갈리므로, 같은 원 위에 있는 차는 각으로 찾아야 서로를 본다.
  let best = onward;
  for (const other of [ringAhead(world, v), crossAhead(world, v, node, gap)]) {
    if (other && other.gap < best.gap) best = other;
  }
  return best;
}

// 횡단보도를 밟고 있는 사람. **들어가는 쪽과 나가는 쪽 둘 다 본다** — 교차로를 돌아
// 나가는 차도 그 갈래의 횡단보도를 지난다.
function crossAhead(world, v, node, gap) {
  if (v.lane.isLink) {
    const at = Net.node(world.net, v.lane.node);
    if (!at || !at.crossing) return null;
    const lane = v.lane.next;
    const seg = Net.segment(world.net, lane.seg);
    if (!walkerOn(world, at.id, seg.id, seg.width)) return null;
    // 잇는 곡선이 끝나는 자리에서 횡단보도까지는 조금 더 간다.
    const left = v.lane.path.total - v.s + (Net.crossingAt(at) - Net.reach(at));
    return { gap: Math.max(left - 2, 0.5), dv: v.v, stop: left < 4 };
  }
  if (!node || !node.crossing) return null;
  const seg = Net.segment(world.net, v.lane.seg);
  if (!walkerOn(world, node.id, seg.id, seg.width)) return null;
  const left = (v.lane.path.total - Net.crossingAt(node)) - v.s;
  if (left < -2) return null;   // 이미 지난 차는 그냥 간다
  return { gap: Math.max(left - 2, 0.5), dv: v.v, stop: left < 4 };
}

function ringAhead(world, v) {
  if (!v.lane.ring) return null;
  const ring = world.ring.get(v.lane.node);
  if (!ring || ring.length < 2) return null;
  const me = place(v);
  const mine = Math.atan2(me.y - v.lane.cy, me.x - v.lane.cx);
  const radius = Math.hypot(me.x - v.lane.cx, me.y - v.lane.cy) || 1;
  const TAU = Math.PI * 2;

  let best = null;
  for (const item of ring) {
    if (item.v === v) continue;
    // 도는 쪽이 각이 줄어드는 쪽이라, 앞차는 각이 나보다 작다.
    let turn = (mine - item.angle) % TAU;
    if (turn < 0) turn += TAU;
    const gap = turn * radius - item.v.kind.len;
    if (!best || gap < best.gap) best = { gap, dv: v.v - item.v.v, stop: false };
  }
  return best;
}

// 교차로 앞에서 서야 하는가. 갈림이 없는 이음매(지나는 길이 하나뿐인 점)에서는
// 기다릴 이유가 없고, 이미 교차로 안에 든 차도 멈추지 않는다.
//
// 세 가지 다스림이 저마다 다른 방식으로 **교차로 안에서 엇갈릴 짝을 없앤다** —
// 아무것도 없으면 한 대씩, 신호등은 한 갈래씩, 회전교차로는 한 방향으로만 돌게.
function blocked(world, v, node, gap, holder) {
  if (!node || node.kind === 'gate' || node.segs.length < 3) return false;
  if (v.lane.isLink) return false;
  if (node.control === 'signal') return redLight(world, v, node, gap, holder);
  if (node.control === 'circle') return mustYield(world, v, node, gap, holder);
  return holdNode(world, v, node, gap);
}

// 아무것도 놓이지 않은 교차로: 한 대씩.
function holdNode(world, v, node, gap) {
  if (v.claim === node.id) return false;
  if (gap > CLAIM_AHEAD) return false;
  const holder = world.claims.get(node.id);
  if (holder == null || holder === v.id) {
    world.claims.set(node.id, v.id);
    v.claim = node.id;
    return false;
  }
  // 서로 물려 아무도 못 가는 자리를 풀어 준다. 신호가 없을 때의 안전장치다.
  if (v.waiting > CLAIM_LIMIT) {
    world.claims.set(node.id, v.id);
    v.claim = node.id;
    return false;
  }
  return true;
}

function signalOf(world, node) {
  let sig = world.signals.get(node.id);
  if (!sig) {
    sig = { phase: 0, timer: 0, amber: false };
    world.signals.set(node.id, sig);
  }
  return sig;
}

function stepSignals(world, dt) {
  for (const node of world.net.nodes) {
    if (node.control !== 'signal') {
      if (world.signals.has(node.id)) world.signals.delete(node.id);
      continue;
    }
    const sig = signalOf(world, node);
    const counts = world.demand.get(node.id) || [];
    sig.timer += dt;
    const done = sig.timer >= GREEN
      || (sig.timer >= MIN_GREEN && !counts[sig.phase] && waitingElsewhere(counts, sig.phase));
    if (!sig.amber && done) {
      sig.amber = true;
      sig.timer = 0;
    } else if (sig.amber && sig.timer >= AMBER) {
      sig.amber = false;
      sig.phase = nextPhase(node, counts, sig.phase);
      sig.timer = 0;
    }
  }
}

function waitingElsewhere(counts, phase) {
  for (let i = 0; i < counts.length; i++) if (i !== phase && counts[i]) return true;
  return false;
}

// 다음 녹색은 **기다리는 차가 있는 갈래**로 넘긴다. 아무도 없으면 그냥 다음 차례다.
function nextPhase(node, counts, phase) {
  const total = Net.phaseCount(node);
  for (let step = 1; step <= total; step++) {
    const next = (phase + step) % total;
    if (counts[next]) return next;
  }
  return (phase + 1) % total;
}

function redLight(world, v, node, gap, holder) {
  const sig = signalOf(world, node);
  if (Net.phaseOf(node, v.lane) !== sig.phase) return true;
  if (sig.amber) {
    // 황색에는 **설 수 있는 차만** 선다. 코앞에서 급정거시키면 뒤차가 받는다.
    return gap > v.v * 0.7 + 1;
  }
  // 녹색이라도 좌회전은 마주 오는 차 앞을 가로지른다. 틈이 날 때까지 기다린다.
  if (holder && holder.side === 'left' && oncoming(world, v, node)) return true;
  return false;
}

// 같은 신호에 열린 맞은편 차들이 오고 있는가.
//
// **마주 오는 좌회전끼리는 번호로 순서를 매긴다.** 서로를 기다리게 두면 둘 다 녹색이
// 끝날 때까지 못 가고, 다음 녹색에도 같은 자리에서 다시 마주 본다. 그렇다고 서로를
// 못 본 척하면 교차로 한가운데서 길이 엇갈린다.
function oncoming(world, v, node) {
  const mine = Net.phaseOf(node, v.lane);
  for (const other of world.vehicles) {
    if (other === v) continue;
    const inside = other.lane.isLink && other.lane.node === node.id;
    const nearing = !other.lane.isLink && other.lane.to === node.id
      && other.lane.path.total - other.s < ONCOMING && other.v > 2;
    if (!inside && !nearing) continue;

    const lane = inside ? laneInto(world, other) : other.lane;
    if (!lane || lane.seg === v.lane.seg) continue;
    if (Net.phaseOf(node, lane) !== mine) continue;

    if (!inside) {
      const next = nextHolder(world, other);
      // 아직 들어오지 않은 맞은편 좌회전은 번호가 앞선 쪽이 먼저 간다.
      if (next && next.isLink && next.side === 'left' && other.id > v.id) continue;
    }
    return true;
  }
  return false;
}

// 교차로 안에 있는 차가 어느 갈래에서 들어왔는지. 지나온 차로는 경로에 남아 있다.
function laneInto(world, v) {
  const step = v.route[v.step];
  if (!step) return null;
  return Net.pickLane(Net.segment(world.net, step.seg.id), step.dir, v.rank);
}

// 회전교차로: 돌고 있는 차에게 양보한다. 내가 들어설 자리에 그 차가 몇 초 뒤에
// 닿는지를 재고, 그 사이에 끼어들지 않는다 — 도는 쪽이 각이 줄어드는 쪽이라 내
// 자리보다 각이 큰 차가 곧 내 앞을 지날 차다.
function mustYield(world, v, node, gap, holder) {
  if (gap > CLAIM_AHEAD) return false;
  // 이미 양보선을 넘었으면 들어간다. 여기서 세우면 도는 길 한가운데에 선다.
  if (gap < RING_STANDOFF - 2) return false;
  const ring = world.ring.get(node.id);
  if (!ring || !ring.length) return false;
  if (!holder || !holder.path) return false;

  const spot = holder.path.points[0];
  const entry = Math.atan2(spot.y - node.y, spot.x - node.x);
  const radius = Math.hypot(spot.x - node.x, spot.y - node.y) || 1;
  const TAU = Math.PI * 2;
  for (const item of ring) {
    let turn = (item.angle - entry) % TAU;
    if (turn < 0) turn += TAU;
    // 곧 내 앞을 지날 차. 시간으로 재야 빠르게 도는 차 앞으로 끼어들지 않는다.
    if (turn * radius / Math.max(item.v.v, 3) < RING_GAP) return true;
    // **막 지나간 차의 뒤도 본다.** 앞이 비었는지만 보면 코앞을 지나간 차 뒤에
    // 붙어 들어가 그 자리에서 급정거한다.
    const lead = (TAU - turn) * radius;
    if (lead < item.v.kind.len + S0 + 6) return true;
  }
  return false;
}

// 다음에 탈 길. 실제 차로 다음에는 **교차로를 도는 짧은 곡선**이 오고, 그 곡선
// 다음에 비로소 다음 구간의 차로가 온다. 길이 끝났으면 null, 갈 차로가 없으면
// undefined다 — 앞쪽이 비어 있는 것과 막다른 것을 갈라야 한다.
function nextHolder(world, v) {
  if (v.lane.isLink) return v.lane.next;
  const next = v.route[v.step + 1];
  if (!next) return null;
  const seg = Net.segment(world.net, next.seg.id);
  // **들어설 때 차로를 정한다.** 차로 변경이 없으므로, 그 구간 끝에서 할 이동을
  // 허락하는 차로로 들어가야 좌회전 차로를 따로 둔 뜻이 산다.
  const after = v.route[v.step + 2];
  const need = after
    ? Net.movement(world.net, seg, next.dir, Net.segment(world.net, after.seg.id), after.dir)
    : null;
  const lane = Net.pickLane(seg, next.dir, v.rank, need);
  if (!lane) return undefined;
  return Net.link(v.lane, lane, Net.node(world.net, v.lane.to)) || lane;
}

function advance(world, v) {
  const holder = nextHolder(world, v);
  const limit = endOf(v, holder);
  if (v.s < limit) {
    // 교차로를 빠져나왔으면 자리를 비운다.
    if (v.claim != null && !v.lane.isLink && v.s > v.kind.len) release(world, v);
    return;
  }
  if (!holder) { despawn(world, v); return; }

  const over = v.s - limit;
  if (holder.isLink) {
    // 잇는 곡선은 같은 발걸음 안에 있다. 경로는 아직 밀지 않는다.
    v.s = over;
  } else {
    v.s = over + (v.lane.isLink ? v.lane.trimOut : 0);
    v.step += 1;
    v.rank = holder.rank;
  }
  v.lane = holder;
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
  signalOf, stepSignals, blocked, ringAhead, crossAhead,
  spawnWalker, stepWalkers, walkerSpot, walkerOn, crossLine,
  WALK_SPEED, WALK_RATE,
  KINDS, S0, HEADWAY, STEP, CLAIM_AHEAD, GREEN, AMBER, RING_GAP,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadTraffic = api;

})(typeof window !== 'undefined' ? window : globalThis);

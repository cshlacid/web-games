'use strict';

// 실행: node games/roadworks/traffic.test.js
const T = require('./traffic.js');
const Net = require('./network.js');
const Gen = require('./mapgen.js');
const Land = require('./terrain.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

function near(name, actual, expected, slack) {
  if (Math.abs(actual - expected) <= slack) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${actual}\n  기대 ${expected} ±${slack}`); }
}

// 장애물 없는 맵. 길을 놓는 것만 보는 테스트는 건물에 막히지 말아야 한다 —
// 막히는 것 자체는 따로 본다.
const bare = (seed) => Gen.city({ seed, land: { buildings: 0, hills: 0, lakes: 0, river: false } });

// 초 단위로 돌린다. `step`은 한 프레임치로 잘리므로 긴 시간은 나눠 넣어야 한다.
const run = (world, secs) => { for (let i = 0; i < secs * 60; i++) T.tick(world, 1 / 60); };

// 씨앗을 고정한 난수. 같은 판이 매번 같게 돌아야 무엇이 깨졌는지 알 수 있다.
const seeded = (seed) => Gen.mulberry32(seed);

// 속도 v로 나란히 달릴 때 두는 간격에 여유를 조금 더한 값.
const S0plus = (v) => T.S0 + v * T.HEADWAY + 8;

// 관문에서 관문까지 곧은 길 하나.
function corridor(lanes) {
  return Net.build(
    [{ id: 'W', kind: 'gate', x: 0, y: 100 }, { id: 'E', kind: 'gate', x: 900, y: 100 }],
    [{ a: 'W', b: 'E', lanes: lanes || [-1, 1] }],
  );
}

// --- 넣고 빼기 ---

{
  const world = T.create(corridor(), { rng: seeded(3), spawnRate: 0 });
  const v = T.spawn(world);
  check('차가 들어온다', world.vehicles.length, 1);
  check('관문에서 출발한다', v.s, 0);
  check('가는 길이 있다', v.route.length > 0, true);
  check('제 진행 방향 차로에 탄다', v.lane.dir === v.route[0].dir, true);
  check('차종은 다섯 중 하나', T.KINDS.some((k) => k.id === v.kind.id), true);

  // 관문에 차가 밀려 있으면 그 몫은 버린다. 겹쳐 넣으면 서로를 밀고 나간다.
  const before = world.vehicles.length;
  let refused = 0;
  for (let i = 0; i < 20; i++) if (!T.spawn(world)) refused++;
  check('입구가 막히면 넣지 않는다', refused > 0, true);
  check('그래도 몇 대는 들어왔다', world.vehicles.length > before, true);
}

{
  // 끝까지 가면 사라지고 도착으로 센다.
  const world = T.create(corridor(), { rng: seeded(5), spawnRate: 0 });
  const v = T.spawn(world);
  for (let i = 0; i < 60 * 60 && world.vehicles.length; i++) T.tick(world, 1 / 60);
  check('반대편 관문에서 나간다', world.vehicles.length, 0);
  check('도착으로 센다', world.arrived, 1);
  void v;
}

// --- 달리기 ---

{
  const world = T.create(corridor(), { rng: seeded(11), spawnRate: 0 });
  const v = T.spawn(world);
  const start = v.s;
  for (let i = 0; i < 60; i++) T.tick(world, 1 / 60);
  check('앞으로 간다', v.s > start, true);
  // 버스와 트럭은 가속이 느려 1초로는 다 못 붙인다. 넉넉히 두고 본다.
  for (let i = 0; i < 60 * 4; i++) T.tick(world, 1 / 60);
  check('혼자면 바라는 속도까지 올라간다', v.v > v.kind.v0 * 0.95, true);
  check('바라는 속도를 넘지는 않는다', v.v <= v.kind.v0 * 1.02, true);
}

{
  // 뒤차가 앞차를 따라붙되 부딪히지는 않는다.
  const world = T.create(corridor([1]), { rng: seeded(2), spawnRate: 0 });
  const lead = T.spawn(world, { from: 'W', to: 'E' });
  lead.kind = T.KINDS.find((k) => k.id === 'truck');
  lead.s = 120;
  lead.v = 8;
  const back = T.spawn(world, { from: 'W', to: 'E' });
  back.kind = T.KINDS.find((k) => k.id === 'car');
  back.v = 34;

  let closest = Infinity;
  for (let i = 0; i < 60 * 30 && world.vehicles.includes(back); i++) {
    T.tick(world, 1 / 60);
    if (world.vehicles.includes(lead)) {
      closest = Math.min(closest, lead.s - lead.kind.len - back.s);
    }
  }
  check('앞차를 뚫고 가지 않는다', closest > 0, true);
  // 나란히 달릴 때의 간격은 최소 간격 + 속도 × 차두시간이다. 트럭 속도(23)에서
  // 5 + 23 × 1.1 ≈ 30이 되므로 그 언저리까지는 붙어야 "따라간다"고 할 수 있다.
  check('바싹 붙기는 한다', closest < S0plus(23), true);
}

{
  // 막혀 서 있는 앞차 뒤에서는 선다.
  const world = T.create(corridor([1]), { rng: seeded(4), spawnRate: 0 });
  const stopped = T.spawn(world, { from: 'W', to: 'E' });
  stopped.s = 200;
  stopped.v = 0;
  const back = T.spawn(world, { from: 'W', to: 'E' });
  back.v = 30;
  for (let i = 0; i < 60 * 20; i++) {
    stopped.v = 0;   // 앞차를 계속 세워 둔다
    stopped.s = 200;
    T.tick(world, 1 / 60);
  }
  check('뒤차도 선다', back.v < 0.5, true);
  near('멈춰 선 거리는 최소 간격쯤', 200 - stopped.kind.len - back.s, T.S0, 3);
}

// --- 교차로 ---

{
  //     N
  //     |
  // W --X-- E      네 갈래 교차로. 서→동과 북→남이 한 점에서 만난다.
  //     |
  //     S
  const net = Net.build(
    [{ id: 'X', kind: 'junction', x: 200, y: 200 },
      { id: 'W', kind: 'gate', x: 0, y: 200 }, { id: 'E', kind: 'gate', x: 400, y: 200 },
      { id: 'N', kind: 'gate', x: 200, y: 0 }, { id: 'S', kind: 'gate', x: 200, y: 400 }],
    [{ a: 'W', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'E', lanes: [-1, 1] },
      { a: 'N', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'S', lanes: [-1, 1] }],
  );
  const world = T.create(net, { rng: seeded(9), spawnRate: 0 });

  const west = T.spawn(world);
  west.route = Net.route(net, 'W', 'E');
  west.step = 0;
  west.lane = Net.pickLane(Net.segment(net, west.route[0].seg.id), west.route[0].dir, 0);
  west.s = 150;

  const north = T.spawn(world);
  north.route = Net.route(net, 'N', 'S');
  north.step = 0;
  north.lane = Net.pickLane(Net.segment(net, north.route[0].seg.id), north.route[0].dir, 0);
  north.s = 150;

  // 둘 다 교차로를 향해 달린다. 먼저 자리를 잡은 쪽이 지나고 다른 쪽은 기다린다.
  let both = false;
  for (let i = 0; i < 60 * 40 && world.vehicles.length; i++) {
    T.tick(world, 1 / 60);
    const holders = new Set([...world.claims.values()]);
    if (holders.size > 1) both = true;
  }
  check('한 번에 한 대만 교차로에 든다', both, false);
  check('둘 다 지나간다', world.arrived, 2);
}

// --- 신호등 ---

// 네 갈래 교차로. 서→동과 북→남이 한 점에서 만난다.
function crossing() {
  return Net.build(
    [{ id: 'X', kind: 'junction', x: 300, y: 300 },
      { id: 'W', kind: 'gate', x: 0, y: 300 }, { id: 'E', kind: 'gate', x: 600, y: 300 },
      { id: 'N', kind: 'gate', x: 300, y: 0 }, { id: 'S', kind: 'gate', x: 300, y: 600 }],
    [{ a: 'W', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'E', lanes: [-1, 1] },
      { a: 'N', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'S', lanes: [-1, 1] }],
  );
}

{
  const net = crossing();
  Net.setControl(net, 'X', 'signal');
  const world = T.create(net, { rng: seeded(12), spawnRate: 0 });
  const sig = T.signalOf(world, Net.node(net, 'X'));

  const west = T.spawn(world, { from: 'W', to: 'E' });
  const north = T.spawn(world, { from: 'N', to: 'S' });
  check('두 대가 들어왔다', world.vehicles.length, 2);

  const node = Net.node(net, 'X');
  let crossed = false;
  for (let i = 0; i < 60 * 90 && world.vehicles.length; i++) {
    T.tick(world, 1 / 60);
    const inside = world.vehicles.filter((v) => v.lane.isLink);
    // 서로 다른 무리의 차가 같은 순간에 교차로 안에 있으면 안 된다.
    const groups = new Set(inside.map((v) => Net.phaseOf(node, laneOf(net, v))));
    if (groups.size > 1) crossed = true;
  }
  check('가로지르는 두 무리가 겹쳐 들지 않는다', crossed, false);
  check('둘 다 지나간다', world.arrived, 2);
  void west; void north; void sig;
}

// 교차로 안에 있는 차가 들어온 차로.
function laneOf(net, v) {
  const step = v.route[v.step];
  return Net.pickLane(Net.segment(net, step.seg.id), step.dir, v.rank);
}

{
  // 빨간 불에서는 정지선 앞에 선다.
  const net = crossing();
  Net.setControl(net, 'X', 'signal');
  const world = T.create(net, { rng: seeded(16), spawnRate: 0 });
  const node = Net.node(net, 'X');
  const v = T.spawn(world, { from: 'W', to: 'E' });
  const mine = Net.phaseOf(node, v.lane);

  let entered = false;
  for (let i = 0; i < 60 * 30; i++) {
    // 이 차의 무리에는 계속 빨간 불을 준다.
    const sig = T.signalOf(world, node);
    sig.phase = 1 - mine;
    sig.amber = false;
    sig.timer = 0;
    T.tick(world, 1 / 60);
    if (v.lane.isLink) entered = true;
  }
  check('빨간 불에는 교차로에 들지 않는다', entered, false);
  check('멈춰 선다', v.v < 0.3, true);
  check('정지선 앞에 선다', v.lane.path.total - v.s > 4, true);
}

{
  // 신호는 스스로 돈다 — 녹색, 황색, 그리고 다른 무리로.
  const net = crossing();
  Net.setControl(net, 'X', 'signal');
  const world = T.create(net, { rng: seeded(13), spawnRate: 0 });
  const node = Net.node(net, 'X');
  const seenPhase = new Set();
  let sawAmber = false;
  for (let i = 0; i < 60 * (T.GREEN + T.AMBER) * 2.2; i++) {
    T.tick(world, 1 / 60);
    const sig = T.signalOf(world, node);
    seenPhase.add(sig.phase);
    if (sig.amber) sawAmber = true;
  }
  check('두 무리가 번갈아 열린다', seenPhase.size, 2);
  check('황색을 거친다', sawAmber, true);

  // 신호를 거두면 시계도 사라진다.
  Net.setControl(net, 'X', 'none');
  T.tick(world, 1 / 60);
  check('신호를 거두면 시계도 지운다', world.signals.has('X'), false);
}

// --- 회전교차로 ---

{
  const net = crossing();
  Net.setControl(net, 'X', 'circle');
  const world = T.create(net, { rng: seeded(14), spawnRate: 0 });

  // 서쪽 차가 먼저 교차로에 들고, 북쪽 차가 뒤따라 닿는다.
  const west = T.spawn(world, { from: 'W', to: 'E' });
  west.s = 250;
  const north = T.spawn(world, { from: 'N', to: 'S' });
  north.s = 205;

  let yielded = false;
  let ringStopped = false;
  let closest = Infinity;
  for (let i = 0; i < 60 * 90 && world.vehicles.length; i++) {
    T.tick(world, 1 / 60);
    const inside = world.vehicles.filter((v) => v.lane.ring);
    for (const v of inside) if (v.v < 0.3) ringStopped = true;
    if (inside.length && world.vehicles.some((v) => !v.lane.isLink && v.v < 0.5)) yielded = true;
    if (world.vehicles.length === 2) {
      const [a, b] = world.vehicles.map((v) => T.place(v));
      closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  check('돌고 있는 차에게 양보한다', yielded, true);
  check('도는 차는 서지 않는다', ringStopped, false);
  check('부딪히지 않는다', closest > 6, true);
  check('둘 다 지나간다', world.arrived, 2);
}

{
  // 줄지어 들어와도 회전교차로 안에서 부딪히지 않는다.
  const net = crossing();
  Net.setControl(net, 'X', 'circle');
  const world = T.create(net, { rng: seeded(15), spawnRate: 2.4 });
  let closest = Infinity;
  for (let i = 0; i < 60 * 90; i++) {
    T.tick(world, 1 / 60);
    const near = world.vehicles.filter((v) => v.lane.isLink || v.lane.path.total - v.s < 40);
    for (let a = 0; a < near.length; a++) {
      for (let b = a + 1; b < near.length; b++) {
        const p = T.place(near[a]);
        const q = T.place(near[b]);
        closest = Math.min(closest, Math.hypot(p.x - q.x, p.y - q.y));
      }
    }
  }
  check('붐벼도 교차로에서 부딪히지 않는다', closest > 4, true);
  check('그래도 지나간다', world.arrived > 20, true);
}

{
  // 돌아가는 도중에 다스림을 바꿔도 차가 사라지거나 튀지 않는다.
  const net = Gen.city({ seed: 40 });
  const world = T.create(net, { rng: seeded(40), spawnRate: 3 });
  // 도시를 가로지르는 데 시간이 걸리므로, 차가 이미 빠져나가고 있을 때 바꿔 본다.
  for (let i = 0; i < 60 * 60; i++) T.tick(world, 1 / 60);
  const before = world.vehicles.length;
  const gone = world.arrived;
  for (const node of net.nodes) if (Net.canControl(node)) Net.setControl(net, node.id, 'circle');
  let jump = 0;
  const seen = new Map();
  for (let i = 0; i < 60 * 30; i++) {
    T.tick(world, 1 / 60);
    for (const v of world.vehicles) {
      const at = T.place(v);
      const was = seen.get(v.id);
      if (was) jump = Math.max(jump, Math.hypot(at.x - was.x, at.y - was.y));
      seen.set(v.id, at);
    }
    for (const id of [...seen.keys()]) {
      if (!world.vehicles.some((v) => v.id === id)) seen.delete(id);
    }
  }
  check('달리던 차가 그대로 있다', world.vehicles.length > before / 3, true);
  check('바꾼 뒤에도 튀지 않는다', jump < 1.2, true);
  check('바뀐 교차로로도 빠져나간다', world.arrived - gone > 5, true);
}

// --- 차로가 허락하는 이동 ---

{
  //     N
  //     |
  // W --X-- E      서에서 들어와 북으로 나가려면 좌회전이다.
  //     |
  //     S
  const net = crossing();
  const west = net.segs[0];
  const world = T.create(net, { rng: seeded(21), spawnRate: 0 });

  const v = T.spawn(world, { from: 'W', to: 'N' });
  check('좌회전 길을 잡는다', v.route.length, 2);
  // 들어선 차로가 좌회전을 허락해야 한다.
  check('좌회전할 수 있는 차로에 탄다', v.lane.allow.indexOf('left') >= 0, true);

  // 좌회전을 막으면 그 길로는 가지 못한다.
  Net.setAllow(Net.lanesOf(west, 1)[0], ['through', 'right']);
  check('막으면 길이 없다', Net.route(net, 'W', 'N'), null);
}

{
  // 네 차로짜리 길에서는 **끝에서 할 이동에 맞는 차로로 들어선다**. 차로 변경이
  // 없으므로 들어설 때 고르지 않으면 좌회전 차로를 따로 둔 뜻이 없다.
  const net = Net.build(
    [{ id: 'X', kind: 'junction', x: 300, y: 300 }, { id: 'Y', kind: 'junction', x: 300, y: 120 },
      { id: 'W', kind: 'gate', x: 0, y: 300 }, { id: 'E', kind: 'gate', x: 600, y: 300 },
      { id: 'N', kind: 'gate', x: 300, y: 0 }, { id: 'L', kind: 'gate', x: 60, y: 120 },
      { id: 'S', kind: 'gate', x: 300, y: 600 }],
    [{ a: 'W', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'E', lanes: [-1, 1] },
      { a: 'X', b: 'Y', lanes: [-1, -1, 1, 1] }, { a: 'Y', b: 'N', lanes: [-1, 1] },
      { a: 'Y', b: 'L', lanes: [-1, 1] }, { a: 'X', b: 'S', lanes: [-1, 1] }],
  );
  const world = T.create(net, { rng: seeded(22), spawnRate: 0 });

  const left = T.spawn(world, { from: 'W', to: 'L' });     // Y에서 좌회전
  const ahead = T.spawn(world, { from: 'S', to: 'N' });    // Y에서 직진
  for (let i = 0; i < 60 * 20 && (left.step < 2 || ahead.step < 2); i++) T.tick(world, 1 / 60);
  check('좌회전할 차는 좌회전 차로로', left.lane.allow.indexOf('left') >= 0, true);
  check('직진할 차는 직진 차로로', ahead.lane.allow.indexOf('through') >= 0, true);
}

// --- 횡단보도와 사람 ---

// 그 갈래를 건너는 사람 하나를 손으로 세운다.
function walkerOn(world, net, nodeId, segId, dir) {
  const node = Net.node(net, nodeId);
  const seg = Net.segment(net, segId);
  const line = T.crossLine(net, node, seg);
  const walker = {
    id: 9000, node: nodeId, seg: segId, u: -dir * line.span, dir, span: line.span, walking: false,
  };
  world.walkers.push(walker);
  return walker;
}

{
  const net = crossing();
  Net.setControl(net, 'X', 'signal');
  Net.setCrossing(net, 'X', true);
  const world = T.create(net, { rng: seeded(31), spawnRate: 0 });
  const node = Net.node(net, 'X');
  const seg = net.segs[0];                       // 서쪽 갈래
  const lane = seg.lanes.find((l) => l.to === 'X');
  const walker = walkerOn(world, net, 'X', seg.id, 1);

  // 그 갈래에 녹색이 들어와 있으면 기다린다.
  const sig = T.signalOf(world, node);
  sig.phase = Net.phaseOf(node, lane);
  sig.amber = false;
  for (let i = 0; i < 60 * 3; i++) { sig.timer = 0; T.tick(world, 1 / 60); }
  check('파란 불이면 기다린다', walker.walking, false);

  // 빨간 불로 바꾸면 건넌다.
  sig.phase = 1 - Net.phaseOf(node, lane);
  for (let i = 0; i < 60 * 2; i++) { sig.timer = 0; T.tick(world, 1 / 60); }
  check('빨간 불이면 건넌다', walker.walking, true);
  check('앞으로 나아간다', walker.u > -walker.span, true);
}

{
  // 사람이 횡단보도에 있으면 차가 선다.
  const net = crossing();
  Net.setCrossing(net, 'X', true);
  const world = T.create(net, { rng: seeded(32), spawnRate: 0 });
  const seg = net.segs[0];
  const v = T.spawn(world, { from: 'W', to: 'E' });
  const walker = walkerOn(world, net, 'X', seg.id, 1);
  walker.walking = true;
  walker.u = 0;                                   // 길 한가운데

  let entered = false;
  for (let i = 0; i < 60 * 20; i++) {
    walker.u = 0;                                 // 그 자리에 붙들어 둔다
    T.tick(world, 1 / 60);
    if (v.lane.isLink) entered = true;
  }
  check('사람이 건너는 동안 교차로에 들지 않는다', entered, false);
  check('멈춰 선다', v.v < 0.5, true);
  check('횡단보도 앞에 선다',
    (v.lane.path.total - Net.crossingAt(Net.node(net, 'X'))) - v.s > 0, true);

  // 다 건너면 다시 간다.
  world.walkers.length = 0;
  for (let i = 0; i < 60 * 20; i++) T.tick(world, 1 / 60);
  check('다 건너면 다시 나간다', world.arrived, 1);
}

{
  // 신호가 없는 교차로에서는 차가 뜸할 때 건넌다.
  const net = crossing();
  Net.setCrossing(net, 'X', true);
  const world = T.create(net, { rng: seeded(33), spawnRate: 0 });
  const seg = net.segs[0];
  const walker = walkerOn(world, net, 'X', seg.id, 1);
  const v = T.spawn(world, { from: 'W', to: 'E' });
  v.s = seg.lanes.find((l) => l.to === 'X').path.total - 60;   // 횡단보도 코앞

  T.tick(world, 1 / 60);
  check('차가 오면 기다린다', walker.walking, false);
  for (let i = 0; i < 60 * 12; i++) T.tick(world, 1 / 60);
  check('차가 지나가면 건넌다', walker.walking, true);
}

{
  // 4현시에서는 한 갈래만 열린다.
  const net = crossing();
  Net.setControl(net, 'X', 'signal');
  Net.setPlan(net, 'X', 'split');
  const node = Net.node(net, 'X');
  check('네 갈래면 4현시', Net.phaseCount(node), 4);

  const world = T.create(net, { rng: seeded(34), spawnRate: 3 });
  let together = false;
  const seen = new Set();
  for (let i = 0; i < 60 * 120; i++) {
    T.tick(world, 1 / 60);
    seen.add(T.signalOf(world, node).phase);
    const groups = new Set(world.vehicles.filter((v) => v.lane.isLink)
      .map((v) => Net.phaseOf(node, laneOf(net, v))));
    if (groups.size > 1) together = true;
  }
  check('네 현시가 모두 돌아온다', seen.size, 4);
  check('한 번에 한 갈래만 든다', together, false);
  check('그래도 빠져나간다', world.arrived > 15, true);
}

// --- 만든 맵 위에서 ---

{
  // 게임이 실제로 쓰는 진입 속도로 맵 위를 오래 굴려 본다.
  const net = Gen.city({ seed: 21 });
  const world = T.create(net, { rng: seeded(21), spawnRate: 1.1 });
  for (let i = 0; i < 60 * 120; i++) T.tick(world, 1 / 60);

  const s = T.stats(world);
  check('차가 돌아다닌다', s.total > 10, true);
  check('관문으로 빠져나간 차가 있다', s.arrived > 20, true);
  check('차종이 여럿 섞인다', Object.keys(s.counts).length >= 3, true);
  check('평균 속도가 남아 있다', s.speed > 2, true);
  check('한도를 넘지 않는다', s.total <= world.maxVehicles, true);

  // **서로 물려 아무도 못 가는 자리가 없다.** 아무것도 놓이지 않은 교차로는 한 대씩
  // 지나므로 줄은 서지만, 한 대가 한참을 꼼짝 못 하면 그것은 줄이 아니라 맞물림이다.
  const stuck = world.vehicles.filter((v) => v.waiting > 45);
  check('오래 갇힌 차가 없다', stuck.length, 0);

  // 같은 차로 안에서 앞뒤가 겹치면 안 된다.
  const lanes = new Map();
  for (const v of world.vehicles) {
    const key = `${v.lane.seg}:${v.lane.index}`;
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push(v);
  }
  let overlap = 0;
  for (const list of lanes.values()) {
    list.sort((p, q) => p.s - q.s);
    for (let i = 1; i < list.length; i++) {
      if (list[i].s - list[i].kind.len < list[i - 1].s - 0.6) overlap++;
    }
  }
  check('같은 차로에서 겹치지 않는다', overlap, 0);

  check('길 밖으로 나간 차가 없다',
    world.vehicles.every((v) => v.s >= 0 && v.s <= v.lane.path.total + 1), true);
  check('뒤로 가는 차가 없다', world.vehicles.every((v) => v.v >= 0), true);
}

{
  // **교차로에서 순간이동하지 않는다.** 차로는 중심선에서 옆으로 밀려 있어, 잇는
  // 곡선 없이 갈아 끼우면 교차로 한가운데서 한 차로 폭만큼 튄다.
  const Geom = require('./geom.js');
  const net = Gen.city({ seed: 33 });
  const world = T.create(net, { rng: seeded(33), spawnRate: 3 });
  const seen = new Map();
  let jump = 0;
  for (let i = 0; i < 60 * 60; i++) {
    T.tick(world, 1 / 60);
    for (const v of world.vehicles) {
      const at = T.place(v);
      const was = seen.get(v.id);
      if (was) jump = Math.max(jump, Math.hypot(at.x - was.x, at.y - was.y));
      seen.set(v.id, at);
    }
    for (const id of [...seen.keys()]) {
      if (!world.vehicles.some((v) => v.id === id)) seen.delete(id);
    }
  }
  // 한 걸음에 갈 수 있는 거리는 가장 빠른 차의 속도 ÷ 60쯤이다.
  check('한 걸음에 튀지 않는다', jump < 1.2, true);
  void Geom;
}

{
  // 프레임이 길어도 같은 만큼만 간다. 탭이 잠들었다 깨어나면 dt가 몇 초씩 들어온다.
  const world = T.create(corridor([1]), { rng: seeded(6), spawnRate: 0 });
  const v = T.spawn(world, { from: 'W', to: 'E' });
  T.step(world, 5);
  check('한 프레임에 맵을 가로지르지 않는다', v.s < 60, true);
}

// --- 돈과 공사 ---

{
  const world = T.create(corridor(), { rng: seeded(11), spawnRate: 0, money: 100 });
  const seg = world.net.segs[0];
  check('값은 길이에 비례한다', T.laneCost(seg), Math.round(seg.length * 0.55));

  // 시외로 빠져나간 차가 삯을 남긴다. 이것이 유일한 수입이라 판이 막히면 공사를
  // 할 수 없다.
  T.spawn(world, { from: 'W', to: 'E' });
  const was = world.money;
  run(world, 60);
  check('빠져나간 차가 있다', world.arrived > 0, true);
  check('빠져나간 만큼 벌었다', world.money - was, world.arrived * T.FARE);
}

{
  const short = Net.build(
    [{ id: 'W', kind: 'gate', x: 0, y: 100 }, { id: 'E', kind: 'gate', x: 40, y: 100 }],
    [{ a: 'W', b: 'E', lanes: [-1, 1] }],
  );
  check('짧은 길에도 아래값이 있다', T.laneCost(short.segs[0]), T.LANE_MIN);
}

{
  const world = T.create(corridor(), { rng: seeded(12), spawnRate: 0, money: 10 });
  const seg = world.net.segs[0];
  const poor = T.buyLane(world, seg, 1);
  check('돈이 모자라면 못 산다', poor.ok, false);
  check('모자란 까닭', poor.why, 'money');
  check('값을 치르지 않았다', world.money, 10);
  check('차로도 그대로', seg.lanes.length, 2);

  world.money = 9000;
  check('사면 차로가 는다', T.buyLane(world, seg, 1).ok && seg.lanes.length, 3);
  check('쓴 만큼 줄었다', world.money, 9000 - world.spent);
  while (seg.lanes.length < Net.MAX_LANES) T.buyLane(world, seg, 1);
  const full = T.buyLane(world, seg, 1);
  check('한도가 끝이다', [full.ok, full.why, seg.lanes.length], [false, 'full', Net.MAX_LANES]);
}

{
  // **공사 중이던 차는 새 차로의 같은 자리로 옮겨 탄다.** 차로를 새로 만들므로
  // 들고 있던 차로가 통째로 사라진다 — 옮기지 않으면 없는 길 위를 달린다.
  const world = T.create(corridor([-1, 1]), { rng: seeded(13), spawnRate: 0, money: 9000 });
  const seg = world.net.segs[0];
  const v = T.spawn(world, { from: 'W', to: 'E' });
  run(world, 6);
  const at = T.place(v);
  const s = v.s;
  T.buyLane(world, seg, 1);
  check('차가 남아 있다', world.vehicles.length, 1);
  check('새 차로에 탔다', seg.lanes.indexOf(v.lane) >= 0, true);
  near('자리를 지킨다', v.s, s, 1);
  const moved = T.place(v);
  // 차로가 늘면 길이 넓어져 옆으로는 밀리지만, 앞뒤로 튀면 안 된다.
  near('앞뒤로 튀지 않는다', Math.hypot(moved.x - at.x, moved.y - at.y), 0, 12);
}

{
  // 일방통행이 되면 거꾸로 가던 차는 갈 데가 없다. 그 차는 삯을 남기지 않는다.
  const world = T.create(corridor([-1, 1]), { rng: seeded(14), spawnRate: 0 });
  const seg = world.net.segs[0];
  const back = T.spawn(world, { from: 'E', to: 'W' });
  run(world, 4);
  const was = world.money;
  T.flipLane(world, seg, seg.lanes.indexOf(back.lane));
  check('갈 데가 없어진 차는 사라진다', world.vehicles.indexOf(back), -1);
  check('사라진 차는 삯을 남기지 않는다', [world.money, world.arrived], [was, 0]);
}

{
  // **길이 막히면 돌아간다.** 좌회전 차로를 없애듯 구간을 일방통행으로 만들어도
  // 이미 그 길로 가려던 차가 멈춰 서면 안 된다.
  const net = Net.build(
    [{ id: 'W', kind: 'gate', x: 0, y: 200 }, { id: 'M', kind: 'joint', x: 200, y: 200 },
      { id: 'N', kind: 'joint', x: 200, y: 0 }, { id: 'E', kind: 'gate', x: 400, y: 200 },
      { id: 'U', kind: 'joint', x: 400, y: 0 }],
    [{ a: 'W', b: 'M', lanes: [-1, 1] }, { a: 'M', b: 'E', lanes: [-1, 1] },
      { a: 'M', b: 'N', lanes: [-1, 1] }, { a: 'N', b: 'U', lanes: [-1, 1] },
      { a: 'U', b: 'E', lanes: [-1, 1] }],
  );
  const world = T.create(net, { rng: seeded(15), spawnRate: 0 });
  const v = T.spawn(world, { from: 'W', to: 'E' });
  run(world, 3);
  const mid = net.segs[1];
  T.flipLane(world, mid, mid.lanes.findIndex((l) => l.dir > 0));
  run(world, 90);
  check('돌아서라도 닿는다', world.arrived, 1);
}

// --- 새 길 놓기 ---

// 나란한 두 길. 이어 붙이기 전에는 서로 오갈 수 없다.
function ladder() {
  return Net.build(
    [{ id: 'W1', kind: 'gate', x: 0, y: 0 }, { id: 'E1', kind: 'gate', x: 400, y: 0 },
      { id: 'W2', kind: 'gate', x: 0, y: 180 }, { id: 'E2', kind: 'gate', x: 400, y: 180 }],
    [{ a: 'W1', b: 'E1', lanes: [-1, 1] }, { a: 'W2', b: 'E2', lanes: [-1, 1] }],
  );
}

{
  const world = T.create(ladder(), { rng: seeded(21), spawnRate: 0, money: 9000 });
  const [top, bottom] = world.net.segs;
  const from = { seg: top.id, s: 200 };
  const to = { seg: bottom.id, s: 200 };

  const able = T.canBuild(world, from, to);
  check('놓을 수 있다', able.ok, true);
  check('값은 길이에 비례한다', able.cost, Math.round(able.len * T.ROAD_COST));

  const made = T.buildRoad(world, from, to);
  check('놓였다', made.ok, true);
  check('값을 치렀다', [world.money, world.spent], [9000 - made.cost, made.cost]);
  check('새 길은 1차로', made.seg.lanes.length, 1);
  check('두 길이 갈려 다섯이 된다', world.net.segs.length, 5);
  check('새로 난 길로 오갈 수 있다', !!Net.route(world.net, 'W1', 'E2'), true);
}

{
  const world = T.create(ladder(), { rng: seeded(22), spawnRate: 0, money: 40 });
  const [top, bottom] = world.net.segs;
  const poor = T.buildRoad(world, { seg: top.id, s: 200 }, { seg: bottom.id, s: 200 });
  check('돈이 모자라면 못 놓는다', [poor.ok, poor.why], [false, 'money']);
  check('판도 그대로', world.net.segs.length, 2);

  world.money = 9000;
  const same = T.buildRoad(world, { seg: top.id, s: 100 }, { seg: top.id, s: 300 });
  check('같은 길의 두 자리는 잇지 않는다', [same.ok, same.why], [false, 'same']);

  check('같은 점끼리도 잇지 않는다', T.buildRoad(world, { node: 'W1' }, { node: 'W1' }).ok, false);

  // **관문에는 붙이지 않는다.** 신호도 회전교차로도 놓을 수 없는 자리라, 거기에
  // 갈림을 만들면 아무도 가르지 않는 교차로가 생긴다. 구간 끝에 가까운 자리는
  // 가르지 않고 그 끝 점을 쓰므로, 관문 코앞도 같이 막는다.
  const atGate = T.buildRoad(world, { seg: top.id, s: 200 }, { node: 'W2' });
  check('관문 자체', [atGate.ok, atGate.why], [false, 'gate']);
  const nearGate = T.buildRoad(world, { seg: top.id, s: 200 }, { seg: bottom.id, s: 4 });
  check('관문 코앞', [nearGate.ok, nearGate.why], [false, 'gate']);
  check('막힌 뒤에도 판은 그대로', world.net.segs.length, 2);

  // 너무 짧으면 양 끝의 교차로가 겹쳐 길이 보이지도 않는다.
  const stub = T.buildRoad(world, { seg: top.id, s: 200 }, { seg: bottom.id, s: 210 });
  void stub;
}

{
  // 짧은 길은 거절한다. 나란한 두 길을 아주 가깝게 두고 재 본다.
  const net = Net.build(
    [{ id: 'W1', kind: 'gate', x: 0, y: 0 }, { id: 'E1', kind: 'gate', x: 400, y: 0 },
      { id: 'W2', kind: 'gate', x: 0, y: 30 }, { id: 'E2', kind: 'gate', x: 400, y: 30 }],
    [{ a: 'W1', b: 'E1', lanes: [-1, 1] }, { a: 'W2', b: 'E2', lanes: [-1, 1] }],
  );
  const world = T.create(net, { rng: seeded(24), spawnRate: 0, money: 9000 });
  const from = { seg: net.segs[0].id, s: 200 };
  const to = { seg: net.segs[1].id, s: 200 };
  check('너무 짧으면 못 놓는다', T.canBuild(world, from, to).why, 'short');
  // 손잡이로 굽히면 길어져 놓을 수 있다.
  check('굽히면 놓을 수 있다', T.canBuild(world, from, to, { x: 200, y: 120 }).ok, true);
}

{
  // **놓는 순간 그 위를 달리던 차가 튀지 않는다.** 길이 갈리면 차가 들고 있던 차로가
  // 통째로 사라지므로, 두 토막 중 맞는 쪽의 같은 자리로 옮겨 태워야 한다.
  const world = T.create(ladder(), { rng: seeded(23), spawnRate: 0, money: 9000 });
  const [top, bottom] = world.net.segs;
  for (const [from, to] of [['W1', 'E1'], ['E1', 'W1'], ['W2', 'E2']]) T.spawn(world, { from, to });
  run(world, 8);
  const was = new Map(world.vehicles.map((v) => [v.id, T.place(v)]));
  const count = world.vehicles.length;

  T.buildRoad(world, { seg: top.id, s: 200 }, { seg: bottom.id, s: 200 });
  check('차가 사라지지 않는다', world.vehicles.length, count);
  let jump = 0;
  for (const v of world.vehicles) {
    const at = T.place(v);
    const before = was.get(v.id);
    jump = Math.max(jump, Math.hypot(at.x - before.x, at.y - before.y));
  }
  near('제자리에 남는다', jump, 0, 2);
  check('갈린 길 위에 탔다',
    world.vehicles.every((v) => world.net.segs.indexOf(Net.segment(world.net, v.lane.seg)) >= 0), true);

  // 갈라진 뒤에도 가던 데까지 간다.
  run(world, 60);
  check('모두 도착한다', world.arrived, count);
}

{
  // 맵 위에서 길을 놓고 한참 돌려도 터지지 않아야 한다. 길이 갈리면 경로에 적힌
  // 구간이 통째로 사라지므로, 남은 길을 모두 다시 잡아 주지 않으면 여기서 터진다.
  const net = bare(5);
  const world = T.create(net, { rng: seeded(5), spawnRate: 2.5, money: 9000 });
  run(world, 40);
  const before = world.vehicles.length;
  const a = net.segs[2];
  const b = net.segs[8];
  const made = T.buildRoad(world, { seg: a.id, s: a.length * 0.45 }, { seg: b.id, s: b.length * 0.55 });
  check('맵 위에서도 놓인다', made.ok, true);
  check('놓는다고 차가 사라지지 않는다', world.vehicles.length, before);

  const goal = world.arrived;
  run(world, 90);
  check('놓은 뒤에도 차가 계속 빠져나간다', world.arrived > goal, true);
  check('길 밖으로 나간 차가 없다',
    world.vehicles.every((v) => v.s >= -1 && v.s <= v.lane.path.total + 1), true);
}

{
  // **넘치도록 밀어 넣어도 굳지는 않는다.** 다스리지 않은 교차로가 스물 몇 개인
  // 넓은 판에서는 진입이 많으면 줄이 길어지는데, 그때도 차는 계속 빠져나가야 한다 —
  // 멎어 버리면 돈이 들어오지 않아 풀 방법까지 함께 사라진다.
  const net = Gen.city({ seed: 21 });
  const world = T.create(net, { rng: seeded(21), spawnRate: 3.2 });
  for (let i = 0; i < 60 * 120; i++) T.tick(world, 1 / 60);
  const was = world.arrived;
  for (let i = 0; i < 60 * 60; i++) T.tick(world, 1 / 60);
  check('막혀도 계속 빠져나간다', world.arrived - was > 20, true);
}

{
  // **가로지르는 길을 놓아도 그 위의 차가 그대로 남는다.** 지나가며 가로지르는 길에도
  // 점을 내므로 한 구간이 두 번 갈리는 일이 있고, 한 번 옮긴 토막이 또 갈려 있다.
  const net = Net.build(
    [{ id: 'W1', kind: 'gate', x: 0, y: 0 }, { id: 'E1', kind: 'gate', x: 600, y: 0 },
      { id: 'W2', kind: 'gate', x: 0, y: 200 }, { id: 'E2', kind: 'gate', x: 600, y: 200 },
      { id: 'W3', kind: 'gate', x: 0, y: 400 }, { id: 'E3', kind: 'gate', x: 600, y: 400 }],
    [{ a: 'W1', b: 'E1', lanes: [-1, 1] }, { a: 'W2', b: 'E2', lanes: [-1, 1] },
      { a: 'W3', b: 'E3', lanes: [-1, 1] }],
  );
  const world = T.create(net, { rng: seeded(31), spawnRate: 0, money: 9000 });
  for (const [from, to] of [['W1', 'E1'], ['E2', 'W2'], ['W3', 'E3'], ['W2', 'E2']]) {
    T.spawn(world, { from, to });
  }
  run(world, 8);
  const count = world.vehicles.length;
  const was = new Map(world.vehicles.map((v) => [v.id, T.place(v)]));

  const made = T.buildRoad(world, { seg: net.segs[0].id, s: 300 }, { seg: net.segs[2].id, s: 300 });
  check('가로지르는 길이 놓인다', made.ok, true);
  check('차가 사라지지 않는다', world.vehicles.length, count);
  let jump = 0;
  for (const v of world.vehicles) {
    const at = T.place(v);
    jump = Math.max(jump, Math.hypot(at.x - was.get(v.id).x, at.y - was.get(v.id).y));
  }
  near('제자리에 남는다', jump, 0, 2);
  check('살아 있는 차로에 탔다',
    world.vehicles.every((v) => !!Net.segment(net, v.lane.seg)), true);

  run(world, 120);
  check('모두 도착한다', world.arrived, count);
}

// --- 땅이 값을 매긴다 ---

// 나란한 두 길 사이에 장애물 하나를 놓을 수 있는 판.
function withLand(land) {
  const net = Net.build(
    [{ id: 'W1', kind: 'gate', x: 0, y: 0 }, { id: 'E1', kind: 'gate', x: 600, y: 0 },
      { id: 'W2', kind: 'gate', x: 0, y: 300 }, { id: 'E2', kind: 'gate', x: 600, y: 300 }],
    [{ a: 'W1', b: 'E1', lanes: [-1, 1] }, { a: 'W2', b: 'E2', lanes: [-1, 1] }],
  );
  net.land = { buildings: [], hills: [], water: [], ...land };
  return net;
}

const across = (net) => [{ seg: net.segs[0].id, s: 300 }, { seg: net.segs[1].id, s: 300 }];

{
  const plain = withLand({});
  const world = T.create(plain, { rng: seeded(41), spawnRate: 0, money: 1e6 });
  const [from, to] = across(plain);
  const flat = T.canBuild(world, from, to);
  check('빈 땅에는 얹히는 값이 없다', flat.cost, Math.round(flat.len * T.ROAD_COST));
  check('지나는 땅이 없다', [flat.span.wall, flat.span.tunnel, flat.span.bridge], [0, 0, 0]);

  // **건물 위로는 지나갈 수 없다.** 헐 수 없는 것이 이 게임의 전제다.
  const walled = withLand({ buildings: [{ kind: 'building', x: 280, y: 130, w: 40, h: 40 }] });
  const w2 = T.create(walled, { rng: seeded(41), spawnRate: 0, money: 1e6 });
  const blocked = T.canBuild(w2, ...across(walled));
  check('건물에 막힌다', [blocked.ok, blocked.why], [false, 'building']);
  check('판은 그대로', T.buildRoad(w2, ...across(walled)).ok, false);
  check('구간이 늘지 않았다', walled.segs.length, 2);

  // 산은 터널을 뚫고 지난다 — 지날 수는 있고 비싸다.
  const hilly = withLand({ hills: [{ kind: 'hill', x: 300, y: 150, r: 50 }] });
  const w3 = T.create(hilly, { rng: seeded(41), spawnRate: 0, money: 1e6 });
  const tunnel = T.canBuild(w3, ...across(hilly));
  check('산은 지날 수 있다', tunnel.ok, true);
  near('산을 지나는 길이', tunnel.span.tunnel, 100, 6);
  check('터널 값이 얹힌다',
    tunnel.cost, Math.round(tunnel.len * T.ROAD_COST + tunnel.span.tunnel * T.TUNNEL_COST));
  check('빈 땅보다 비싸다', tunnel.cost > flat.cost, true);

  // 물은 다리를 놓고 지난다.
  const wet = withLand({ water: [{ kind: 'lake', x: 300, y: 150, r: 50 }] });
  const w4 = T.create(wet, { rng: seeded(41), spawnRate: 0, money: 1e6 });
  const bridge = T.canBuild(w4, ...across(wet));
  check('물은 지날 수 있다', bridge.ok, true);
  check('다리 값이 얹힌다',
    bridge.cost, Math.round(bridge.len * T.ROAD_COST + bridge.span.bridge * T.BRIDGE_COST));
  // **터널이 다리보다 비싸다.** 돌아갈지 뚫을지를 고르게 하려면 뚫는 쪽이 눈에 띄게
  // 비싸야 한다.
  check('같은 길이면 터널이 더 비싸다', tunnel.cost > bridge.cost, true);

  // 값을 치르고 놓으면 그만큼 준다.
  const was = w3.money;
  const made = T.buildRoad(w3, ...across(hilly));
  check('터널 길을 놓는다', made.ok, true);
  check('얹힌 값까지 치른다', was - w3.money, made.cost);
}

{
  // 손잡이로 굽혀 건물을 비켜 가면 놓을 수 있다.
  const net = withLand({ buildings: [{ kind: 'building', x: 280, y: 130, w: 40, h: 40 }] });
  const world = T.create(net, { rng: seeded(42), spawnRate: 0, money: 1e6 });
  const [from, to] = across(net);
  check('곧게 가면 막힌다', T.canBuild(world, from, to).why, 'building');
  check('굽히면 비켜 간다', T.canBuild(world, from, to, { x: 150, y: 150 }).ok, true);
}

// --- 건물에서 나고 건물로 든다 ---

// 관문 둘 사이의 곧은 길 하나와, 그 옆에 선 건물 하나.
function block() {
  const net = Net.build(
    [{ id: 'W', kind: 'gate', x: 0, y: 100 }, { id: 'M', kind: 'junction', x: 500, y: 100 },
      { id: 'E', kind: 'gate', x: 1000, y: 100 }],
    [{ a: 'W', b: 'M', lanes: [-1, 1] }, { a: 'M', b: 'E', lanes: [-1, 1] }],
  );
  net.land = { buildings: [{ kind: 'building', x: 230, y: 130, w: 30, h: 30 }], hills: [], water: [] };
  return net;
}

{
  const net = block();
  const door = Land.doorOf(net, net.land.buildings[0]);
  check('건물이 길에 닿는다', !!door, true);
  check('닿는 구간', door.seg.id, net.segs[0].id);
  near('닿는 자리', door.s, 245, 6);
}

{
  // **건물에서 나온다.** 관문이 아니라 길 한가운데에서 태어난다.
  const net = block();
  const door = Land.doorOf(net, net.land.buildings[0]);
  const world = T.create(net, { rng: seeded(51), spawnRate: 0 });
  const v = T.spawn(world, { door: { seg: door.seg.id, s: door.s }, to: 'E' });
  check('나온다', !!v, true);
  check('관문이 아니라 길 위에서 난다', v.s > 1, true);
  check('첫 걸음이 그 구간', v.route[0].seg.id, door.seg.id);
  const at = T.place(v);
  near('건물 곁에서 난다', Math.hypot(at.x - 245, at.y - 100), 0, 14);

  run(world, 120);
  check('나온 차도 관문으로 빠져나간다', world.arrived, 1);
}

{
  // **건물로 든다.** 구간 끝이 아니라 그 한가운데에서 멈춘다.
  const net = block();
  const door = Land.doorOf(net, net.land.buildings[0]);
  const world = T.create(net, { rng: seeded(52), spawnRate: 0 });
  const v = T.spawn(world, { from: 'E', stop: { seg: door.seg.id, s: door.s } });
  check('든다', !!v, true);
  check('멈출 자리를 들고 간다', v.stop.seg, door.seg.id);
  // 그 구간을 실제로 달려 지나가는 쪽을 목적지로 삼아야 한다.
  check('그 구간으로 들어가는 길을 잡는다',
    v.route[v.route.length - 1].seg.id, door.seg.id);

  run(world, 120);
  check('건물 앞에서 도착으로 센다', world.arrived, 1);
  check('차가 사라졌다', world.vehicles.length, 0);
}

{
  // 닿기 전에는 도착이 아니다.
  const net = block();
  const door = Land.doorOf(net, net.land.buildings[0]);
  const world = T.create(net, { rng: seeded(53), spawnRate: 0 });
  const v = T.spawn(world, { from: 'E', stop: { seg: door.seg.id, s: door.s } });
  run(world, 3);
  check('아직 달리는 중', [world.arrived, T.arrived(world, v)], [0, false]);
}

{
  // 맵 위에서 섞어 돌린다. **관문만 오가는 차만 있으면 도시가 그저 길목이다.**
  const net = Gen.city({ seed: 6 });
  const world = T.create(net, { rng: seeded(6), spawnRate: 1.2 });
  let doors = 0;
  let stops = 0;
  for (let i = 0; i < 300; i++) {
    const trip = T.randomTrip(world);
    if (trip.door) doors++;
    if (trip.stop) stops++;
  }
  check('건물에서 나는 통행이 섞인다', doors > 60 && doors < 260, true);
  check('건물로 드는 통행이 섞인다', stops > 60 && stops < 260, true);

  run(world, 240);
  check('도시 안을 도는 차가 있다', world.vehicles.some((v) => v.stop), true);
  check('그래도 빠져나간다', world.arrived > 20, true);
  check('길 밖으로 나간 차가 없다',
    world.vehicles.every((v) => v.s >= -1 && v.s <= v.lane.path.total + 1), true);
}

{
  // **판 가장자리로 빼는 길.** 거기에 관문이 새로 나므로 "관문에는 붙이지 않는다"에
  // 걸리지 않는다.
  const net = bare(5);
  const world = T.create(net, { rng: seeded(61), spawnRate: 0, money: 1e6 });
  // 관문에 닿지 않는 구간을 고른다 — 관문 코앞에서 시작하면 거기에 붙는 것이 된다.
  const seg = net.segs.find((x) => Net.node(net, x.a).kind !== 'gate'
    && Net.node(net, x.b).kind !== 'gate' && x.length > 120);
  const from = { seg: seg.id, s: seg.length / 2 };
  const able = T.canBuild(world, from, { edge: { x: -40, y: 900 } });
  check('가장자리로는 놓을 수 있다', able.ok, true);

  const gates = Net.gates(net).length;
  const made = T.buildRoad(world, from, { edge: { x: -40, y: 900 } });
  check('놓인다', made.ok, true);
  check('관문이 는다', Net.gates(net).length, gates + 1);

  // 새 관문으로도 차가 빠져나간다.
  const born = Net.gates(net).find((g) => g.id[0] === 'e');
  const v = T.spawn(world, { from: 'gE0', to: born.id });
  check('그 관문을 목적지로 삼는다', !!v, true);
  run(world, 300);
  check('거기로 빠져나간다', world.arrived > 0, true);

  // 가장자리끼리는 잇지 않는다 — 도시에 닿지 않는 길이 된다.
  check('가장자리끼리는 거절',
    T.canBuild(world, { edge: { x: -40, y: 300 } }, { edge: { x: -40, y: 1500 } }).why, 'same');
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

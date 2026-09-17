'use strict';

// 실행: node games/roadworks/traffic.test.js
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

function near(name, actual, expected, slack) {
  if (Math.abs(actual - expected) <= slack) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${actual}\n  기대 ${expected} ±${slack}`); }
}

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

// --- 만든 맵 위에서 ---

{
  const net = Gen.city({ seed: 21 });
  const world = T.create(net, { rng: seeded(21), spawnRate: 3.2 });
  for (let i = 0; i < 60 * 120; i++) T.tick(world, 1 / 60);

  const s = T.stats(world);
  check('차가 돌아다닌다', s.total > 10, true);
  check('관문으로 빠져나간 차가 있다', s.arrived > 20, true);
  check('차종이 여럿 섞인다', Object.keys(s.counts).length >= 3, true);
  check('평균 속도가 남아 있다', s.speed > 2, true);
  check('한도를 넘지 않는다', s.total <= world.maxVehicles, true);

  const stuck = world.vehicles.filter((v) => v.waiting > 30);
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

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

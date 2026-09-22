'use strict';

// 실행: node games/roadworks/network.test.js
const Net = require('./network.js');
const Gen = require('./mapgen.js');
const Geom = require('./geom.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

function near(name, actual, expected, slack = 0.5) {
  if (Math.abs(actual - expected) <= slack) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${actual}\n  기대 ${expected} ±${slack}`); }
}

// 꺾은선 위에서 점까지의 가장 가까운 거리.
function distTo(path, spot) {
  let best = Infinity;
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1];
    const b = path.points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((spot.x - a.x) * dx + (spot.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(spot.x - (a.x + dx * t), spot.y - (a.y + dy * t)));
  }
  return best;
}

// 동쪽으로 뻗은 곧은 길 하나.
function straight(lanes) {
  return Net.build(
    [{ id: 'A', kind: 'gate', x: 0, y: 100 }, { id: 'B', kind: 'gate', x: 200, y: 100 }],
    [{ a: 'A', b: 'B', lanes }],
  );
}

// --- 차로 ---

{
  const net = straight([-1, 1]);
  const seg = net.segs[0];
  check('차로 수', seg.lanes.length, 2);
  check('가운데를 기준으로 좌우로 벌린다', seg.lanes.map((l) => l.offset), [-5, 5]);
  check('길 폭', seg.width, 20);

  // 우측 통행: A→B 차로는 오른쪽(화면 아래)에, B→A 차로는 왼쪽에 있다.
  const forward = seg.lanes.find((l) => l.dir > 0);
  const backward = seg.lanes.find((l) => l.dir < 0);
  near('정방향 차로는 중심선 아래', forward.path.points[0].y, 105);
  near('역방향 차로는 중심선 위', backward.path.points[0].y, 95);

  // 차로는 제 진행 방향으로 향한 길을 들고 있다 — s가 줄어드는 차가 없어야 한다.
  near('정방향은 서쪽에서 시작', forward.path.points[0].x, 0);
  near('역방향은 동쪽에서 시작', backward.path.points[0].x, 200);
  check('드나드는 점', [forward.from, forward.to, backward.from, backward.to], ['A', 'B', 'B', 'A']);
}

{
  const net = straight([-1, -1, 1, 1]);
  const seg = net.segs[0];
  check('네 차로의 자리', seg.lanes.map((l) => l.offset), [-15, -5, 5, 15]);
  // 오른쪽에서 몇 번째인지. 정방향은 오프셋이 클수록, 역방향은 작을수록 오른쪽이다.
  check('정방향 순위', seg.lanes.filter((l) => l.dir > 0).map((l) => [l.offset, l.rank]),
    [[5, 1], [15, 0]]);
  // 역방향 차가 보는 오른쪽은 중심선에서 더 먼 쪽이다 — 서쪽으로 갈 때의 오른쪽은
  // 북쪽이고, 오프셋은 A→B(동쪽)의 오른쪽을 양으로 재기 때문이다.
  check('역방향 순위', seg.lanes.filter((l) => l.dir < 0).map((l) => [l.offset, l.rank]),
    [[-15, 0], [-5, 1]]);

  check('바깥 차로를 고르면 그대로', Net.pickLane(seg, 1, 1).offset, 5);
  check('없는 순위는 안쪽으로 접는다', Net.pickLane(seg, 1, 9).offset, 5);
  check('역방향의 바깥 차로', Net.pickLane(seg, -1, 0).offset, -15);
  check('역방향의 안쪽 차로', Net.pickLane(seg, -1, 1).offset, -5);
}

{
  const net = straight([1, 1]);
  check('일방통행이면 반대 차로가 없다', Net.lanesOf(net.segs[0], -1).length, 0);
  check('그쪽으로는 고를 차로도 없다', Net.pickLane(net.segs[0], -1, 0), null);
}

{
  // 차로를 갈아 끼우는 것이 판 위의 조작이 된다. 다시 이어 주는 것까지 확인한다.
  const net = straight([-1, 1]);
  Net.setLanes(net, net.segs[0], [-1, -1, 1]);
  Net.relink(net);
  check('차로가 늘면 폭도 는다', net.segs[0].width, 30);
  check('A에서 나가는 차로는 하나', Net.node(net, 'A').out.length, 1);
  check('A로 들어오는 차로는 둘', Net.node(net, 'A').in.length, 2);
}

// --- 길 찾기 ---

{
  //  A --- B --- C
  //        |
  //        D
  const net = Net.build(
    [{ id: 'A', kind: 'gate', x: 0, y: 0 }, { id: 'B', kind: 'junction', x: 100, y: 0 },
      { id: 'C', kind: 'gate', x: 260, y: 0 }, { id: 'D', kind: 'gate', x: 100, y: 90 }],
    [{ a: 'A', b: 'B', lanes: [-1, 1] }, { a: 'B', b: 'C', lanes: [-1, 1] },
      { a: 'B', b: 'D', lanes: [-1, 1] }],
  );
  const path = Net.route(net, 'A', 'D');
  check('두 구간을 지난다', path.length, 2);
  check('가는 방향', path.map((p) => p.dir), [1, 1]);
  check('되돌아오는 길은 방향이 반대', Net.route(net, 'D', 'A').map((p) => p.dir), [-1, -1]);
  check('제자리면 빈 길', Net.route(net, 'A', 'A'), []);
  check('관문만 셋', Net.gates(net).map((g) => g.id), ['A', 'C', 'D']);

  // 일방통행으로 막으면 그쪽으로는 못 간다.
  Net.setLanes(net, net.segs[2], [1, 1]);
  Net.relink(net);
  check('나가는 길은 남아 있다', Net.route(net, 'A', 'D').length, 2);
  check('거슬러 오는 길은 없다', Net.route(net, 'D', 'A'), null);
}

// --- 차로가 허락하는 이동 ---

{
  const seg = straight([-1, -1, 1, 1]).segs[0];
  const fwd = Net.lanesOf(seg, 1);
  // 오른쪽 끝은 직진과 우회전, 왼쪽 끝은 직진과 좌회전, 가운데는 직진만.
  check('기본 허용', fwd.map((l) => [l.rank, l.allow.join('+')]).sort(),
    [[0, 'through+right'], [1, 'through+left']]);

  const one = straight([1]).segs[0];
  check('한 차로뿐이면 다 할 수 있다', one.lanes[0].allow, ['left', 'through', 'right']);

  const three = straight([-1, 1, 1, 1]).segs[0];
  check('가운데 차로는 직진만',
    Net.lanesOf(three, 1).find((l) => l.rank === 1).allow, ['through']);

  const lane = one.lanes[0];
  Net.setAllow(lane, ['left', 'uturn', 'nonsense']);
  check('모르는 이동은 버린다', lane.allow, ['left', 'uturn']);
  Net.setAllow(lane, []);
  check('아무것도 못 가는 차로는 두지 않는다', lane.allow, ['through']);
}

{
  //     N
  //     |
  // W --X-- E
  //     |
  //     S
  const net = Net.build(
    [{ id: 'X', kind: 'junction', x: 200, y: 200 },
      { id: 'W', kind: 'gate', x: 0, y: 200 }, { id: 'E', kind: 'gate', x: 400, y: 200 },
      { id: 'N', kind: 'gate', x: 200, y: 0 }, { id: 'S', kind: 'gate', x: 200, y: 400 }],
    [{ a: 'W', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'E', lanes: [-1, 1] },
      { a: 'N', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'S', lanes: [-1, 1] }],
  );
  const west = net.segs[0];
  const east = net.segs[1];
  const north = net.segs[2];
  const south = net.segs[3];

  // 서쪽에서 들어와 동쪽으로 나가면 직진, 남쪽으로 나가면 우회전(우측 통행이라
  // 화면에서는 아래쪽), 북쪽으로 나가면 좌회전이다.
  check('직진', Net.movement(net, west, 1, east, 1), 'through');
  check('우회전', Net.movement(net, west, 1, south, 1), 'right');
  check('좌회전', Net.movement(net, west, 1, north, -1), 'left');
  check('같은 구간으로 되돌아가면 유턴', Net.movement(net, west, 1, west, -1), 'uturn');

  check('좌회전 차로가 있으면 좌회전할 수 있다',
    Net.movementAllowed(net, west, 1, north, -1), true);
  // 한 차로뿐인 길에서 좌회전을 빼면 그 이동이 막힌다.
  Net.setAllow(Net.lanesOf(west, 1)[0], ['through', 'right']);
  check('빼면 막힌다', Net.movementAllowed(net, west, 1, north, -1), false);
  check('유턴도 기본으로는 막혀 있다', Net.movementAllowed(net, west, 1, west, -1), false);
}

{
  // 좌회전을 막으면 **길 찾기가 돌아간다**. 십자 옆에 우회로를 하나 둔다.
  //
  //  N --- P
  //  |     |
  //  X --- Q      X에서 N으로 가는 길은 곧장(좌회전)이거나 P를 돌아가는 길이다.
  const net = Net.build(
    [{ id: 'X', kind: 'junction', x: 200, y: 200 }, { id: 'N', kind: 'gate', x: 200, y: 40 },
      { id: 'W', kind: 'gate', x: 0, y: 200 }, { id: 'Q', kind: 'junction', x: 340, y: 200 },
      { id: 'P', kind: 'junction', x: 340, y: 40 }],
    [{ a: 'W', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'N', lanes: [-1, 1] },
      { a: 'X', b: 'Q', lanes: [-1, 1] }, { a: 'Q', b: 'P', lanes: [-1, 1] },
      { a: 'P', b: 'N', lanes: [-1, 1] }],
  );
  check('곧장 간다', Net.route(net, 'W', 'N').length, 2);
  Net.setAllow(Net.lanesOf(net.segs[0], 1)[0], ['through', 'right']);
  const around = Net.route(net, 'W', 'N');
  check('좌회전을 막으면 돌아간다', around.length, 4);
  check('그래도 닿는다', around[around.length - 1].seg.id, 4);
}

// --- 이어진 길의 굽이 ---

{
  // **한 줄기를 이루는 구간들은 지나는 점에서 접선을 나눠 쓴다.** 구간마다 따로
  // 굽히면 같은 길인데도 교차로를 지날 때마다 꺾인다.
  const chain = {
    lanes: [-1, 1],
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 30 }, { id: 'c', x: 210, y: -20 }],
  };
  const segs = Gen.weave(chain);
  check('점 셋이면 구간 둘', segs.length, 2);

  const unit = (x, y) => { const len = Math.hypot(x, y) || 1; return [x / len, y / len]; };
  const leaving = unit(chain.nodes[1].x - segs[0].c2.x, chain.nodes[1].y - segs[0].c2.y);
  const entering = unit(segs[1].c1.x - chain.nodes[1].x, segs[1].c1.y - chain.nodes[1].y);
  check('나가는 접선과 들어오는 접선이 같다',
    [Math.round(leaving[0] * 1000), Math.round(leaving[1] * 1000)],
    [Math.round(entering[0] * 1000), Math.round(entering[1] * 1000)]);

  // 세 점이 한 줄 위에 있으면 굽을 이유가 없다.
  const flat = Gen.weave({ lanes: [1], nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }, { id: 'c', x: 200, y: 0 }] });
  check('곧은 줄기는 곧게 둔다', flat.every((g) => Math.abs(g.c1.y) < 0.001 && Math.abs(g.c2.y) < 0.001), true);
}

// --- 교차로 다스리기 ---

{
  // W --X-- E 와 X --- S. X만 갈림이 있다.
  const net = Net.build(
    [{ id: 'X', kind: 'junction', x: 200, y: 200 }, { id: 'B', kind: 'junction', x: 200, y: 320 },
      { id: 'W', kind: 'gate', x: 0, y: 200 }, { id: 'E', kind: 'gate', x: 400, y: 200 },
      { id: 'S', kind: 'gate', x: 200, y: 400 }],
    [{ a: 'W', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'E', lanes: [-1, 1] },
      { a: 'X', b: 'B', lanes: [-1, 1] }, { a: 'B', b: 'S', lanes: [-1, 1] }],
  );

  check('기본은 아무것도 없는 상태', Net.node(net, 'X').control, 'none');
  check('갈림이 있는 자리에만 놓는다', [Net.canControl(Net.node(net, 'X')),
    Net.canControl(Net.node(net, 'B')), Net.canControl(Net.node(net, 'W'))], [true, false, false]);

  Net.cycleControl(net, 'X');
  check('한 번 누르면 신호등', Net.node(net, 'X').control, 'signal');
  Net.cycleControl(net, 'X');
  check('또 누르면 회전교차로', Net.node(net, 'X').control, 'circle');
  Net.cycleControl(net, 'X');
  check('또 누르면 없음으로 돌아온다', Net.node(net, 'X').control, 'none');

  // 현시 구성. 마주 보는 쪽끼리 묶으면 2현시, 한 갈래씩 열면 갈래 수만큼이다.
  Net.setControl(net, 'X', 'signal');
  check('기본은 2현시', [Net.node(net, 'X').plan, Net.phaseCount(Net.node(net, 'X'))], ['paired', 2]);
  Net.setPlan(net, 'X', 'split');
  check('한 갈래씩이면 갈래 수만큼', Net.phaseCount(Net.node(net, 'X')), 3);
  check('모르는 구성은 받지 않는다', Net.setPlan(net, 'X', 'zigzag'), null);
  Net.setPlan(net, 'X', 'paired');

  // 횡단보도는 교차로 단위다.
  check('횡단보도는 기본으로 없다', Net.node(net, 'X').crossing, false);
  Net.setCrossing(net, 'X', true);
  check('놓을 수 있다', Net.node(net, 'X').crossing, true);
  check('교차로 바깥을 가로지른다', Net.crossingAt(Net.node(net, 'X')) > Net.node(net, 'X').radius, true);
  Net.setCrossing(net, 'X', false);
  Net.setControl(net, 'X', 'none');

  check('길이 꺾이기만 하는 자리에는 못 놓는다', Net.setControl(net, 'B', 'signal'), null);
  check('관문에도 못 놓는다', Net.setControl(net, 'W', 'signal'), null);
  check('모르는 이름은 받지 않는다', Net.setControl(net, 'X', 'rotary'), null);

  // 신호가 한 번에 열어 주는 무리: 마주 오는 둘은 한 무리, 옆에서 오는 것은 다른 무리.
  const fromWest = Net.lanesOf(net.segs[0], 1)[0];     // 서 → X
  const fromEast = Net.lanesOf(net.segs[1], -1)[0];    // 동 → X
  const fromSouth = Net.lanesOf(net.segs[2], -1)[0];   // 남 → X
  check('마주 오는 둘은 같은 무리',
    Net.phaseOf(Net.node(net, 'X'), fromWest), Net.phaseOf(Net.node(net, 'X'), fromEast));
  check('가로지르는 쪽은 다른 무리',
    Net.phaseOf(Net.node(net, 'X'), fromWest) === Net.phaseOf(Net.node(net, 'X'), fromSouth), false);
}

{
  // 회전교차로를 놓으면 교차로를 도는 길이 섬을 감고 돈다.
  const net = Net.build(
    [{ id: 'X', kind: 'junction', x: 200, y: 200 },
      { id: 'W', kind: 'gate', x: 0, y: 200 }, { id: 'E', kind: 'gate', x: 400, y: 200 },
      { id: 'N', kind: 'gate', x: 200, y: 0 }, { id: 'S', kind: 'gate', x: 200, y: 400 }],
    [{ a: 'W', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'E', lanes: [-1, 1] },
      { a: 'N', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'S', lanes: [-1, 1] }],
  );
  const at = Net.node(net, 'X');
  const west = Net.lanesOf(net.segs[0], 1)[0];      // 서 → X
  const east = Net.lanesOf(net.segs[1], 1)[0];      // X → 동
  // 곧게 지나가는 길목에도 연결 곡선이 있다 — 교차로 안을 그 곡선이 갈음하기
  // 때문이다. 다만 굽지 않는다.
  const straightLink = Net.link(west, east, at);
  check('곧게 지나는 길목은 곧게 잇는다',
    straightLink.path.points.every((p) => Math.abs(p.y - 205) < 0.001), true);
  check('교차로 앞뒤를 갈음한다', [straightLink.trimIn, straightLink.trimOut], [10, 10]);

  Net.setControl(net, 'X', 'circle');
  const around = Net.link(west, east, at);
  check('회전교차로에서는 곧게 지나는 길목도 돈다', around != null && around.ring, true);
  check('섬을 비켜 간다', around.path.total > 40, true);

  // **도는 쪽이 맞는가.** 우측 통행은 섬을 왼쪽에 두고 돈다 — 화면 좌표에서는
  // 각이 줄어드는 쪽이고, 서쪽에서 들어와 동쪽으로 나가면 섬의 남쪽을 지난다.
  let below = false;
  for (const p of around.path.points) if (p.y > at.y + 8) below = true;
  check('서에서 동으로 갈 때 섬의 남쪽으로 돈다', below, true);
  check('섬은 도는 길보다 안쪽에 있다', Net.islandRadius(at) < Net.reach(at), true);
  check('회전교차로는 더 멀리서 시작한다', Net.reach(at) > at.radius, true);
}

// --- 차로 사이의 선 ---

{
  const two = straight([-1, 1]).segs[0];
  check('두 차로 사이는 중앙선 하나', Net.boundaries(two), [{ offset: 0, kind: 'middle' }]);

  const four = straight([-1, -1, 1, 1]).segs[0];
  check('네 차로는 차선·중앙선·차선', Net.boundaries(four),
    [{ offset: -10, kind: 'dash' }, { offset: 0, kind: 'middle' }, { offset: 10, kind: 'dash' }]);

  // 한쪽이 두 차로인 길은 중앙선이 가운데가 아니다. 실제 도로도 그렇다.
  const three = straight([-1, 1, 1]).segs[0];
  check('세 차로는 중앙선이 치우친다', Net.boundaries(three),
    [{ offset: -5, kind: 'middle' }, { offset: 5, kind: 'dash' }]);

  check('일방통행에는 중앙선이 없다',
    Net.boundaries(straight([1, 1, 1]).segs[0]).every((l) => l.kind === 'dash'), true);
  check('한 차로짜리는 그을 선이 없다', Net.boundaries(straight([1]).segs[0]).length, 0);
}

// --- 교차로를 잇는 곡선 ---

{
  //  W --- X --- E 와 X --- S. X에서 오른쪽으로 꺾는 길목을 본다.
  const net = Net.build(
    [{ id: 'X', kind: 'junction', x: 200, y: 200 },
      { id: 'W', kind: 'gate', x: 0, y: 200 }, { id: 'E', kind: 'gate', x: 400, y: 200 },
      { id: 'S', kind: 'gate', x: 200, y: 400 }],
    [{ a: 'W', b: 'X', lanes: [-1, 1] }, { a: 'X', b: 'E', lanes: [-1, 1] },
      { a: 'X', b: 'S', lanes: [-1, 1] }],
  );
  const inbound = Net.lanesOf(net.segs[0], 1)[0];      // 서 → X
  const south = Net.lanesOf(net.segs[2], 1)[0];        // X → 남
  const conn = Net.link(inbound, south);

  const head = inbound.path.points[inbound.path.points.length - 1];
  const tail = south.path.points[0];
  check('들어온 차로의 끝에서 시작한다',
    [Math.round(conn.path.points[0].x), Math.round(conn.path.points[0].y)],
    [Math.round(head.x), Math.round(head.y)]);
  check('나갈 차로의 머리에서 끝난다',
    [Math.round(conn.path.points[conn.path.points.length - 1].x),
      Math.round(conn.path.points[conn.path.points.length - 1].y)],
    [Math.round(tail.x), Math.round(tail.y)]);
  check('길이가 있다', conn.path.total > 5, true);
  check('다음 차로를 들고 있다', conn.next === south, true);
  check('같은 길목은 만들어 둔 것을 다시 쓴다', Net.link(inbound, south) === conn, true);

  // 곧게 지나가는 길목은 양 끝이 거의 같은 자리라 이을 것이 없다.
  const east = Net.lanesOf(net.segs[1], 1)[0];
  check('이을 것이 없으면 만들지 않는다', Net.link(inbound, east), null);
}

// --- 만든 맵 ---

{
  const net = Gen.city({ seed: 7 });
  // 큰길은 가로 둘·세로 둘이고 관문은 그 끝마다 하나씩이다.
  check('관문은 큰길 끝마다', Net.gates(net).length, 8);
  // **처음에는 길이 적다.** 격자 자리는 대부분 비어 있고 플레이어가 채운다.
  const spots = Gen.COLS * Gen.ROWS;
  check('격자 자리가 넉넉하다', spots >= 60, true);
  check('시작 도로가 격자보다 적다', net.segs.length < spots, true);
  check('네 갈래 교차로가 있다',
    net.nodes.some((n) => n.kind !== 'gate' && n.segs.length === 4), true);

  const curved = net.segs.filter((s) => {
    const a = Net.node(net, s.a);
    const b = Net.node(net, s.b);
    // 제어점이 직선 위에 있으면 곧은 길이다.
    const cross = (s.c1.x - a.x) * (b.y - a.y) - (s.c1.y - a.y) * (b.x - a.x);
    return Math.abs(cross) > 1;
  });
  check('굽은 길이 있다', curved.length > 0, true);

  // 어느 관문에서든 다른 모든 관문으로 갈 수 있어야 한다. 한 곳이라도 끊기면 그
  // 맵에서는 차가 갇힌다.
  const gates = Net.gates(net);
  let reachable = true;
  for (const from of gates) {
    for (const to of gates) {
      if (from.id === to.id) continue;
      if (!Net.route(net, from.id, to.id)) reachable = false;
    }
  }
  check('관문끼리 모두 이어진다', reachable, true);

  check('차로는 1부터 한도까지',
    net.segs.every((s) => s.lanes.length >= 1 && s.lanes.length <= Net.MAX_LANES), true);

  // **우측 통행이 맵 전체에서 지켜진다.** 오프셋은 A→B의 오른쪽을 양으로 재므로,
  // 정방향 차로는 전부 역방향 차로보다 오른쪽에 있어야 한다. 가운데(0)를 기준으로
  // 보면 안 된다 — 세 차로짜리 길은 중앙선이 치우쳐 있어 가운데 차로의 오프셋이
  // 0이면서 정방향이다.
  const sideOk = net.segs.every((s) => {
    const back = s.lanes.filter((l) => l.dir < 0).map((l) => l.offset);
    const fwd = s.lanes.filter((l) => l.dir > 0).map((l) => l.offset);
    if (!back.length || !fwd.length) return true;
    return Math.max(...back) < Math.min(...fwd);
  });
  check('역방향 차로가 모두 정방향 차로의 왼쪽에 있다', sideOk, true);
  check('네 차로짜리 큰길이 있다', net.segs.some((s) => s.lanes.length === 4), true);
  check('같은 씨앗은 같은 맵', Gen.city({ seed: 7 }).segs.length, net.segs.length);
}

// --- 차로 바꾸기 ---

{
  const net = straight([-1, -1, 1]);
  const seg = net.segs[0];
  const back = Net.pickLane(seg, -1, 0);
  Net.setAllow(back, ['left']);

  Net.addLane(net, seg, 1);
  check('차로가 늘었다', seg.lanes.length, 4);
  check('늘린 차로는 그 방향에 붙는다', seg.lanes.filter((l) => l.dir > 0).length, 2);
  // 방향이 뒤섞이면 차로가 중앙선을 넘나든다. 넣은 자리와 상관없이 정렬해 둔다.
  check('역방향이 왼쪽에 모인다', seg.lanes.map((l) => l.dir), [-1, -1, 1, 1]);
  check('건드리지 않은 차로의 허용 이동은 그대로', Net.pickLane(seg, -1, 0).allow, ['left']);

  // 한도까지 채우면 더는 붙지 않는다. 숫자는 `MAX_LANES`가 정한다.
  while (seg.lanes.length < Net.MAX_LANES) Net.addLane(net, seg, 1);
  check('한도를 넘기지 않는다', Net.addLane(net, seg, 1), null);
  check('한도까지는 는다', seg.lanes.length, Net.MAX_LANES);
}

{
  // 한쪽 차로를 모두 뒤집으면 일방통행이 된다.
  const net = straight([-1, 1]);
  const seg = net.segs[0];
  Net.flipLane(net, seg, 0);
  check('뒤집은 뒤의 방향', seg.lanes.map((l) => l.dir), [1, 1]);
  check('일방통행에는 중앙선이 없다',
    Net.boundaries(seg).some((b) => b.kind === 'center'), false);

  // **길목 캐시를 비워야 한다.** 그 곡선은 옛 차로를 들고 있어, 두면 사라진 차로로
  // 갈아타게 된다.
  const other = Net.build(
    [{ id: 'A', kind: 'gate', x: 0, y: 100 }, { id: 'B', kind: 'joint', x: 200, y: 100 },
      { id: 'C', kind: 'gate', x: 400, y: 100 }],
    [{ a: 'A', b: 'B', lanes: [-1, 1] }, { a: 'B', b: 'C', lanes: [-1, 1] }],
  );
  const into = Net.pickLane(other.segs[0], 1, 0);
  Net.link(into, Net.pickLane(other.segs[1], 1, 0), Net.node(other, 'B'));
  check('길목을 만들어 두었다', into.links.size, 1);
  Net.flipLane(other, other.segs[1], 0);
  check('바뀐 구간으로 들어가는 길목은 버려진다', into.links, null);
}

{
  // 일방통행이 된 길로는 길을 찾지 못하고 돌아가야 한다.
  const net = Net.build(
    [{ id: 'W', kind: 'gate', x: 0, y: 100 }, { id: 'M', kind: 'joint', x: 200, y: 100 },
      { id: 'E', kind: 'gate', x: 400, y: 100 }],
    [{ a: 'W', b: 'M', lanes: [-1, 1] }, { a: 'M', b: 'E', lanes: [-1, 1] }],
  );
  check('처음에는 돌아올 수 있다', !!Net.route(net, 'E', 'W'), true);
  Net.flipLane(net, net.segs[1], 0);
  check('일방통행이 되면 그 길로는 못 온다', Net.route(net, 'E', 'W'), null);
}

// --- 길 가르기와 새 길 ---

{
  const net = straight([-1, 1]);
  const was = net.segs[0];
  const spots = [];
  for (let d = 10; d < was.length - 10; d += 10) spots.push(Geom.at(was.center, d));

  const cut = Net.splitSeg(net, was, was.length * 0.4);
  check('둘로 갈린다', [net.segs.length, cut.segs.length], [2, 2]);
  check('가른 자리에 점이 난다', cut.at.kind, 'joint');
  check('두 토막을 합치면 길이가 같다',
    Math.abs(cut.segs[0].length + cut.segs[1].length - was.length) < 0.5, true);
  check('차로 방향은 그대로', cut.segs[0].lanes.map((l) => l.dir), [-1, 1]);
  check('양쪽 점에 붙는다',
    [Net.node(net, 'A').segs.length, cut.at.segs.length, Net.node(net, 'B').segs.length],
    [1, 2, 1]);

  // **갈라도 길이 있던 자리를 그대로 지난다.** 점을 다시 꿰어 만들면 갈라진 자리에서
  // 어긋나, 그 위를 달리던 차가 옆으로 튄다.
  let off = 0;
  for (const spot of spots) {
    let best = Infinity;
    for (const seg of cut.segs) best = Math.min(best, distTo(seg.center, spot));
    off = Math.max(off, best);
  }
  near('가른 길이 원래 자리를 지난다', off, 0, 0.05);

  // 갈라도 길은 이어져 있어야 한다.
  check('갈라도 오갈 수 있다', [!!Net.route(net, 'A', 'B'), !!Net.route(net, 'B', 'A')], [true, true]);
}

{
  // 끝에 너무 가까우면 가르지 않고 그 끝을 쓴다. 길이가 0에 가까운 토막에는 차로를
  // 깔 수 없다.
  const net = straight([-1, 1]);
  const head = Net.splitSeg(net, net.segs[0], 2);
  check('앞 끝에서는 그 점을 쓴다', [head.at.id, net.segs.length], ['A', 1]);
  const tailNet = straight([-1, 1]);
  const tail = Net.splitSeg(tailNet, tailNet.segs[0], tailNet.segs[0].length - 2);
  check('뒤 끝에서도 그 점을 쓴다', [tail.at.id, tailNet.segs.length], ['B', 1]);
}

{
  // 나란한 두 길을 이어 본다. 한복판에서 한복판으로.
  const net = Net.build(
    [{ id: 'W1', kind: 'gate', x: 0, y: 0 }, { id: 'E1', kind: 'gate', x: 300, y: 0 },
      { id: 'W2', kind: 'gate', x: 0, y: 200 }, { id: 'E2', kind: 'gate', x: 300, y: 200 }],
    [{ a: 'W1', b: 'E1', lanes: [-1, 1] }, { a: 'W2', b: 'E2', lanes: [-1, 1] }],
  );
  check('처음에는 갈 수 없다', Net.route(net, 'W1', 'W2'), null);

  const made = Net.connect(net, { seg: net.segs[0], s: 150 }, { seg: net.segs[1], s: 150 });
  check('길이 넷으로 갈리고 하나가 더 놓인다', net.segs.length, 5);
  check('새 길은 1차로', made.seg.lanes.length, 1);
  check('새 길의 양 끝이 교차로가 된다',
    made.at.map((n) => Net.canControl(n)), [true, true]);
  check('이어 놓으면 갈 수 있다', !!Net.route(net, 'W1', 'W2'), true);

  // 1차로는 한 방향뿐이라 거꾸로는 못 간다. 늘려야 오간다.
  check('1차로는 일방통행', Net.route(net, 'W2', 'W1'), null);
  Net.addLane(net, made.seg, -1);
  check('차로를 늘리면 오간다', !!Net.route(net, 'W2', 'W1'), true);
}

{
  // 손잡이를 쥐고 굽힌 길은 그 자리를 지나야 한다.
  const net = Net.build(
    [{ id: 'A', kind: 'gate', x: 0, y: 0 }, { id: 'B', kind: 'gate', x: 200, y: 0 }],
    [],
  );
  const handle = { x: 100, y: 80 };
  const made = Net.connect(net, { node: 'A' }, { node: 'B' }, handle);
  near('굽힌 길이 손잡이 가까이 지난다', distTo(made.seg.center, handle), 40, 2);
  const flat = Net.connect(net, { node: 'A' }, { node: 'B' });
  near('손잡이가 없으면 곧다', distTo(flat.seg.center, { x: 100, y: 0 }), 0, 0.01);

  check('같은 점끼리는 잇지 않는다', Net.connect(net, { node: 'A' }, { node: 'A' }), null);
}

{
  // **가르는 자리는 길 폭을 탄다.** 교차로 원이 길 폭의 절반이라, 넓은 길에서 짧은
  // 토막을 내면 양 끝의 원 둘이 그 토막을 통째로 덮어 길이 사라진다.
  const wide = straight([-1, -1, -1, -1, 1, 1, 1, 1]);
  check('여덟 차로', [wide.segs[0].lanes.length, wide.segs[0].width], [8, 80]);
  check('넓은 길은 더 멀리서 가른다', Net.stubOf(wide.segs[0]) > Net.stubOf(straight([-1, 1]).segs[0]), true);
  const cut = Net.splitSeg(wide, wide.segs[0], 40);
  check('원에 덮일 자리는 가르지 않는다', [cut.at.id, wide.segs.length], ['A', 1]);
  const ok = Net.splitSeg(wide, wide.segs[0], wide.segs[0].length / 2);
  check('가운데는 가른다', ok.segs.length, 2);
}

// --- 엇갈릴 짝이 있어야 교차로다 ---

// 동서로 뻗은 큰길 가운데에 남쪽으로 가지 하나.
function tee(stemLanes) {
  return Net.build(
    [{ id: 'W', kind: 'gate', x: 0, y: 100 }, { id: 'M', kind: 'junction', x: 300, y: 100 },
      { id: 'E', kind: 'gate', x: 700, y: 100 }, { id: 'S', kind: 'gate', x: 300, y: 400 }],
    [{ a: 'W', b: 'M', lanes: [-1, 1] }, { a: 'M', b: 'E', lanes: [-1, 1] },
      { a: 'M', b: 'S', lanes: stemLanes }],
  );
}

{
  // 길이 꺾이기만 하는 이음매는 가로지를 짝이 없다. **마주 보는 직진 둘은 서로를
  // 건너지 않는다** — 우측 통행이라 서로의 오른쪽으로 지나기 때문이고, 그 비킴을
  // 넣지 않으면 한 점에서 만나 엇갈리는 것으로 잡힌다.
  const bend = Net.build(
    [{ id: 'A', kind: 'gate', x: 0, y: 0 }, { id: 'B', kind: 'junction', x: 200, y: 0 },
      { id: 'C', kind: 'gate', x: 200, y: 200 }],
    [{ a: 'A', b: 'B', lanes: [-1, 1] }, { a: 'B', b: 'C', lanes: [-1, 1] }],
  );
  check('이음매는 교차로가 아니다',
    [Net.node(bend, 'B').conflict, Net.canControl(Net.node(bend, 'B'))], [false, false]);
}

{
  const net = tee([-1, 1]);
  check('양방향 가지는 교차로다', Net.canControl(Net.node(net, 'M')), true);
}

{
  // **가지가 나가는 일방통행이어도 마주편의 좌회전이 남아 있으면 교차로다** —
  // 그 좌회전이 마주 오는 직진을 가로지른다.
  const net = tee([1]);
  const M = Net.node(net, 'M');
  check('나가는 일방 가지', M.conflict, true);

  // 그 좌회전을 끄면 가로지를 짝이 사라진다. 남는 것은 직진 둘과 우회전 하나뿐이다.
  const east = Net.segment(net, 1);
  for (const lane of east.lanes.filter((l) => l.dir < 0)) {
    Net.setAllow(lane, ['through', 'right'], net);
  }
  check('마주편 좌회전을 끄면 교차로가 아니다', [M.conflict, Net.canControl(M)], [false, false]);
}

{
  // 들어오는 일방 가지도 마찬가지다. 우회전만 남기면 합류일 뿐 가로지르지 않는다.
  const net = tee([-1]);
  const M = Net.node(net, 'M');
  check('들어오는 일방 가지', M.conflict, true);
  for (const lane of Net.segment(net, 2).lanes) Net.setAllow(lane, ['right'], net);
  check('우회전만 남기면 교차로가 아니다', M.conflict, false);
}

{
  // **교차로가 아니게 되면 놓여 있던 신호도 거둔다.** 아무것도 갈라 줄 것이 없는데
  // 차만 세우게 된다.
  const net = tee([-1]);
  const M = Net.node(net, 'M');
  Net.setControl(net, 'M', 'signal');
  check('신호를 놓았다', M.control, 'signal');
  for (const lane of Net.segment(net, 2).lanes) Net.setAllow(lane, ['right'], net);
  check('엇갈림이 사라지면 신호도 사라진다', M.control, 'none');
  check('다시 놓을 수도 없다', Net.setControl(net, 'M', 'signal'), null);
}

{
  // 네 갈래는 좌회전을 다 꺼도 직진끼리 가로지른다.
  const net = Net.build(
    [{ id: 'W', kind: 'gate', x: 0, y: 200 }, { id: 'M', kind: 'junction', x: 200, y: 200 },
      { id: 'E', kind: 'gate', x: 400, y: 200 }, { id: 'N', kind: 'gate', x: 200, y: 0 },
      { id: 'S', kind: 'gate', x: 200, y: 400 }],
    [{ a: 'W', b: 'M', lanes: [-1, 1] }, { a: 'M', b: 'E', lanes: [-1, 1] },
      { a: 'N', b: 'M', lanes: [-1, 1] }, { a: 'M', b: 'S', lanes: [-1, 1] }],
  );
  for (const seg of net.segs) for (const lane of seg.lanes) Net.setAllow(lane, ['through'], net);
  check('직진끼리도 가로지른다', Net.node(net, 'M').conflict, true);
}

{
  // 만든 맵에서는 갈래가 셋 이상인 자리가 곧 교차로다.
  const net = Gen.city({ seed: 7 });
  const junctions = net.nodes.filter((n) => n.kind !== 'gate' && n.segs.length >= 3);
  check('맵의 갈림은 모두 교차로', junctions.every((n) => Net.canControl(n)), true);
  const bends = net.nodes.filter((n) => n.kind !== 'gate' && n.segs.length === 2);
  check('맵의 이음매는 모두 교차로가 아니다', bends.some((n) => Net.canControl(n)), false);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

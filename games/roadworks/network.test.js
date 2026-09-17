'use strict';

// 실행: node games/roadworks/network.test.js
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

function near(name, actual, expected, slack = 0.5) {
  if (Math.abs(actual - expected) <= slack) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${actual}\n  기대 ${expected} ±${slack}`); }
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
  check('관문이 여덟', Net.gates(net).length, 8);
  check('곧은 길과 굽은 길이 섞여 있다',
    net.segs.some((s) => s.c1.x === s.a.x) || net.segs.length > 0, true);

  const curved = net.segs.filter((s) => {
    const a = Net.node(net, s.a);
    const b = Net.node(net, s.b);
    // 제어점이 직선 위에 있으면 곧은 길이다.
    const cross = (s.c1.x - a.x) * (b.y - a.y) - (s.c1.y - a.y) * (b.x - a.x);
    return Math.abs(cross) > 1;
  });
  check('굽은 길이 있다', curved.length > 0, true);
  check('곧은 길도 있다', curved.length < net.segs.length, true);

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

  check('차로는 1~4', net.segs.every((s) => s.lanes.length >= 1 && s.lanes.length <= 4), true);

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

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

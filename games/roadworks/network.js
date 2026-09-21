'use strict';

// 도로망 자료. 점(교차로·도시 출입구)과 구간(곡선 하나), 그리고 구간마다의 차로.
//
// **차로는 저마다 제 진행 방향으로 향한 길을 들고 있다.** 중심선 하나만 두고 달릴
// 때마다 부호를 뒤집는 방법도 있지만, 그러면 "구간을 거슬러 가는 차"의 거리 s가
// 줄어드는 값이 되어 앞차 찾기·교차로 진입 판정이 전부 두 갈래로 갈린다. 차로를
// 만들 때 한 번 뒤집어 두면 s는 언제나 0에서 길이까지 늘기만 한다.
//
// **우측 통행은 차로의 자리로 정해진다.** 중심선에서 오른쪽(A→B 기준)으로 민 차로가
// A→B 방향을, 왼쪽으로 민 차로가 B→A 방향을 맡는다. 역방향 차로는 B에서 보면
// 오른쪽이다.
(function (root) {

const Geom = (typeof require !== 'undefined') ? require('./geom.js') : root.RoadGeom;

const LANE_W = 10;      // 차로 하나의 폭
const MAX_LANES = 4;

// 교차로를 어떻게 다스리는가. **기본은 아무것도 없는 상태다** — 먼저 닿은 차가
// 하나씩 지난다. 플레이어가 신호등이나 회전교차로를 놓는다.
const CONTROLS = ['none', 'signal', 'circle'];

// 신호 현시를 어떻게 짤 것인가. **마주 보는 쪽끼리 묶으면 2현시**, 한 갈래씩 열면
// 갈래 수만큼(세 갈래면 3현시, 네 갈래면 4현시)이다.
const PLANS = ['paired', 'split'];

// 차로가 허락하는 이동. 도로 바닥에 그려지는 화살표가 이 목록이다.
const MOVES = ['left', 'through', 'right', 'uturn'];

const TURN = 0.55;   // 이만큼 꺾이면 직진이 아니라 좌·우회전으로 본다

// 화면 좌표는 y가 아래로 가므로 각이 커지는 쪽이 오른쪽이다.
function sideOf(fromDx, fromDy, toDx, toDy) {
  const TAU = Math.PI * 2;
  let d = Math.atan2(toDy, toDx) - Math.atan2(fromDy, fromDx);
  d = ((d % TAU) + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d > TURN) return 'right';
  if (d < -TURN) return 'left';
  return 'through';
}



// segments: [{ a, b, c1?, c2?, lanes: [+1|-1, ...] }] — a·b는 노드 id.
// 제어점이 없으면 곧은 길이다.
function build(nodes, segments) {
  const net = {
    nodes: nodes.map((n) => ({
      control: 'none', plan: 'paired', crossing: false, ...n, out: [], in: [], segs: [],
    })),
    segs: [],
    laneWidth: LANE_W,
  };
  const byId = new Map(net.nodes.map((n) => [n.id, n]));

  segments.forEach((raw, index) => {
    const a = byId.get(raw.a);
    const b = byId.get(raw.b);
    const c1 = raw.c1 || { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
    const c2 = raw.c2 || { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 };
    const center = Geom.makePath(Geom.sampleCubic(a, c1, c2, b));
    const seg = {
      id: raw.id != null ? raw.id : index,
      a: a.id,
      b: b.id,
      c1,
      c2,
      center,
      length: center.total,
      lanes: [],
    };
    setLanes(net, seg, raw.lanes);
    net.segs.push(seg);
    a.segs.push(seg.id);
    b.segs.push(seg.id);
  });

  relink(net);
  return net;
}

// 차로 배열을 갈아 끼운다. 판 위에서 차로를 늘리거나 방향을 바꾸는 것이 전부 이
// 함수 하나를 지난다.
function setLanes(net, seg, dirs, quiet) {
  const count = Math.max(1, Math.min(MAX_LANES, dirs.length));
  const list = dirs.slice(0, count);
  seg.lanes = list.map((dir, i) => {
    // 왼쪽 끝 차로가 0번. 가운데를 기준으로 좌우로 벌린다.
    const offset = (i - (count - 1) / 2) * LANE_W;
    const shifted = Geom.offsetPath(seg.center, offset);
    return {
      seg: seg.id,
      index: i,
      dir,
      offset,
      path: dir > 0 ? shifted : Geom.reversePath(shifted),
      from: dir > 0 ? seg.a : seg.b,
      to: dir > 0 ? seg.b : seg.a,
      rank: 0,
      allow: null,
    };
  });
  // 제 방향 무리 안에서 오른쪽부터 0, 1, 2… 바깥 차로로 갈아탈 때 이 순위를 맞춘다.
  for (const dir of [1, -1]) {
    const group = seg.lanes.filter((l) => l.dir === dir);
    // A→B는 오프셋이 클수록 오른쪽, B→A는 작을수록 오른쪽이다.
    group.sort((p, q) => (dir > 0 ? q.offset - p.offset : p.offset - q.offset));
    group.forEach((lane, i) => { lane.rank = i; });
    // 허락하는 이동의 기본값. **오른쪽 끝은 직진과 우회전, 왼쪽 끝은 직진과 좌회전**,
    // 가운데는 직진만이다. 한 차로뿐이면 다 할 수 있어야 그 방향이 막히지 않는다.
    group.forEach((lane) => {
      if (lane.allow) return;
      if (group.length === 1) lane.allow = ['left', 'through', 'right'];
      else if (lane.rank === 0) lane.allow = ['through', 'right'];
      else if (lane.rank === group.length - 1) lane.allow = ['through', 'left'];
      else lane.allow = ['through'];
    });
  }
  seg.width = count * LANE_W;
  void quiet;
  return seg;
}

// **차로 구성을 바꾼다.** 방향을 뒤집거나 차로를 늘리는 조작이 모두 이 함수를 지난다.
//
// 넘긴 방향 배열은 **왼쪽이 역방향, 오른쪽이 정방향이 되도록 다시 세운다.** 우측
// 통행에서는 마주 오는 차로가 서로의 왼쪽에 있어야 하므로, 섞인 채로 두면 차가
// 역주행하는 자리로 그려진다. 그래서 플레이어가 고르는 것은 차로의 자리가 아니라
// **어느 방향이 몇 개인가**다.
//
// 허락하는 이동은 방향 무리 안의 순위를 따라 옮겨 준다 — 차로를 하나 늘렸다고 손으로
// 켜 둔 좌회전이 사라지면 안 된다.
function reshape(net, seg, dirs) {
  const keep = new Map();
  for (const dir of [1, -1]) {
    keep.set(dir, lanesOf(seg, dir).slice().sort((p, q) => p.rank - q.rank).map((l) => l.allow));
  }

  const sorted = dirs.slice().sort((p, q) => p - q);
  setLanes(net, seg, sorted, true);

  for (const dir of [1, -1]) {
    const was = keep.get(dir) || [];
    for (const lane of lanesOf(seg, dir)) {
      if (was[lane.rank]) lane.allow = was[lane.rank].slice();
    }
  }

  // 이 구간으로 들어오는 길목은 새 차로를 가리켜야 한다. 만들어 둔 연결 곡선은 옛
  // 차로를 들고 있으므로 양 끝에서 버린다.
  clearLinks(net, seg.a);
  clearLinks(net, seg.b);
  relink(net);
  return seg;
}

function clearLinks(net, nodeId) {
  for (const other of net.segs) {
    for (const lane of other.lanes) {
      if (lane.to === nodeId) lane.links = null;
    }
  }
}

// 한 차로의 방향을 뒤집는다. 되돌려 준 것은 바뀌기 전의 차로 구성이다.
function flipLane(net, seg, index) {
  const lane = seg.lanes[index];
  if (!lane) return null;
  const dirs = seg.lanes.map((l, i) => (i === index ? -l.dir : l.dir));
  reshape(net, seg, dirs);
  return seg;
}

// 그 방향에 차로를 하나 더한다.
function addLane(net, seg, dir) {
  if (seg.lanes.length >= MAX_LANES) return null;
  reshape(net, seg, seg.lanes.map((l) => l.dir).concat([dir > 0 ? 1 : -1]));
  return seg;
}

// 차로가 허락하는 이동을 갈아 끼운다. 판 위에서 화살표를 고치는 것이 이 함수다.
function setAllow(lane, moves) {
  const list = MOVES.filter((m) => moves.indexOf(m) >= 0);
  // 아무것도 못 가는 차로는 둘 수 없다 — 그 차로에 들어온 차가 갇힌다.
  lane.allow = list.length ? list : ['through'];
  return lane;
}

// 한 구간에서 다른 구간으로 넘어가는 것이 어떤 이동인가. 같은 구간으로 되돌아가면
// 유턴이고, 나머지는 교차로에 닿는 방향과 떠나는 방향의 각으로 가른다.
function movement(net, from, fromDir, to, toDir) {
  if (from.id === to.id) return 'uturn';
  const arrive = headingAt(from, fromDir, true);
  const leave = headingAt(to, toDir, false);
  return sideOf(arrive.x, arrive.y, leave.x, leave.y);
}

// 구간을 그 방향으로 지날 때의 진행 방향. end가 참이면 교차로에 닿는 쪽, 거짓이면
// 교차로를 떠나는 쪽이다.
function headingAt(seg, dir, end) {
  const path = seg.center;
  const at = (dir > 0) === end ? path.dir.length - 1 : 0;
  const d = path.dir[at];
  return dir > 0 ? d : { x: -d.x, y: -d.y };
}

// 그 이동을 할 수 있는 차로가 하나라도 있는가.
function movementAllowed(net, from, fromDir, to, toDir) {
  const move = movement(net, from, fromDir, to, toDir);
  return lanesOf(from, fromDir).some((l) => l.allow.indexOf(move) >= 0);
}

function relink(net) {
  for (const node of net.nodes) {
    node.out = [];
    node.in = [];
  }
  const byId = new Map(net.nodes.map((n) => [n.id, n]));
  for (const seg of net.segs) {
    for (const lane of seg.lanes) {
      byId.get(lane.from).out.push(lane);
      byId.get(lane.to).in.push(lane);
    }
  }
  // 교차로의 크기. 맞닿은 길 중 가장 넓은 것의 절반이다 — 정지선도 교차로를 도는
  // 길도 이 반지름에서 시작한다.
  for (const node of net.nodes) {
    let radius = 0;
    for (const id of node.segs) radius = Math.max(radius, segment(net, id).width / 2);
    node.radius = radius;
  }
  for (const node of net.nodes) assignPhases(node);
  return net;
}

// 교차로를 도는 길이 시작되는 거리. **회전교차로는 더 멀리서 시작한다** — 섬을
// 두르고 돌아야 하므로 길 폭만큼의 자리로는 모자란다.
function reach(at) {
  if (!at) return 0;
  return at.control === 'circle' ? at.radius * 1.6 + 5 : at.radius;
}

// 신호가 한 번에 열어 주는 무리. **맞은편에서 오는 차는 같은 무리다** — 도착 방위를
// 180도로 접어 비교하면 마주 오는 두 갈래가 한 무리로 묶인다. 길이 굽어 있어도
// 교차로에 닿는 순간의 방향으로 재므로 격자가 아닌 곳에서도 갈린다.
//
// 이렇게 짝지으면 한 갈래씩 여는 것보다 한 바퀴가 짧아 기다림이 준다. 대신 마주 오는
// 차 앞을 가로지르는 **좌회전만 따로 틈을 기다린다**(traffic.js). 교차로 안에서
// 엇갈릴 짝은 그 하나뿐이라, 거기만 막으면 부딪힐 자리가 없다.
function assignPhases(node) {
  node.phase = new Map();
  node.phases = 0;
  if (!node.in.length) return;

  // **한 갈래씩 여는 구성.** 갈래 수가 곧 현시 수다(세 갈래면 3현시). 교차로 안에서
  // 엇갈릴 짝이 아예 없어 좌회전이 기다릴 일도 없지만, 한 바퀴가 길다.
  if (node.plan === 'split') {
    const order = [];
    for (const lane of node.in) {
      if (order.indexOf(lane.seg) < 0) order.push(lane.seg);
      node.phase.set(`${lane.seg}:${lane.index}`, order.indexOf(lane.seg));
    }
    node.phases = order.length;
    return;
  }

  // **마주 보는 쪽끼리 묶는 2현시.** 도착 방위를 180도로 접어 비교하면 마주 오는 두
  // 갈래가 한 무리로 묶인다. 길이 굽어 있어도 교차로에 닿는 순간의 방향으로 재므로
  // 격자가 아닌 곳에서도 갈린다. 엇갈리는 것은 좌회전 하나뿐이라 그것만 따로
  // 틈을 기다리게 한다(traffic.js).
  const bearing = (lane) => {
    const d = lane.path.dir[lane.path.dir.length - 1];
    return Math.atan2(d.y, d.x);
  };
  const ref = bearing(node.in[0]);
  let two = false;
  for (const lane of node.in) {
    let gap = Math.abs(bearing(lane) - ref) % Math.PI;
    if (gap > Math.PI / 2) gap = Math.PI - gap;
    const phase = gap < Math.PI / 4 ? 0 : 1;
    if (phase === 1) two = true;
    node.phase.set(`${lane.seg}:${lane.index}`, phase);
  }
  node.phases = two ? 2 : 1;
}

function phaseOf(node, lane) {
  if (!node.phase) return 0;
  const hit = node.phase.get(`${lane.seg}:${lane.index}`);
  return hit == null ? 0 : hit;
}

function phaseCount(node) {
  return Math.max(1, node.phases || 1);
}

// 갈림이 있는 자리에만 놓을 수 있다. 길이 그저 꺾이기만 하는 이음매에 신호를 세우면
// 아무것도 갈라 주지 않으면서 차만 세운다.
function canControl(node) {
  return node.kind !== 'gate' && node.segs.length >= 3;
}

function setControl(net, nodeId, mode) {
  const at = node(net, nodeId);
  if (!at || !canControl(at) || CONTROLS.indexOf(mode) < 0) return null;
  at.control = mode;
  // 회전교차로는 교차로를 도는 길 자체가 달라진다. 만들어 둔 연결 곡선을 버린다.
  for (const seg of net.segs) {
    for (const lane of seg.lanes) {
      if (lane.to === nodeId) lane.links = null;
    }
  }
  return at;
}

// 다음 다스림으로 돌린다. 없음 → 신호등 → 회전교차로 → 없음.
function cycleControl(net, nodeId) {
  const at = node(net, nodeId);
  if (!at) return null;
  const next = CONTROLS[(CONTROLS.indexOf(at.control) + 1) % CONTROLS.length];
  return setControl(net, nodeId, next);
}

function setPlan(net, nodeId, plan) {
  const at = node(net, nodeId);
  if (!at || !canControl(at) || PLANS.indexOf(plan) < 0) return null;
  at.plan = plan;
  assignPhases(at);
  return at;
}

// 횡단보도는 교차로 단위로 놓는다. 갈래마다 하나씩, 교차로 바로 바깥을 가로지른다.
function setCrossing(net, nodeId, on) {
  const at = node(net, nodeId);
  if (!at || at.kind === 'gate') return null;
  at.crossing = !!on;
  return at;
}

// 횡단보도가 놓이는 자리. 교차로 중심에서 이만큼 떨어진 곳을 가로지른다.
function crossingAt(at) {
  return reach(at) + 7;
}

function node(net, id) {
  return net.nodes.find((n) => n.id === id);
}

function segment(net, id) {
  return net.segs.find((s) => s.id === id);
}

function lanesOf(seg, dir) {
  return seg.lanes.filter((l) => l.dir === dir);
}

// 다음 구간에서 어느 차로로 들어갈지.
//
// **차로 변경이 없으므로 들어설 때 골라야 한다.** 이 구간 끝에서 할 이동(need)을
// 허락하는 차로 중에서 고르고, 그중에서는 **오른쪽에서 몇 번째였는지를 지킨다** —
// 늘 오른쪽 끝으로 붙이면 4차로에서 합류할 때마다 모든 차가 한 줄로 몰린다.
function pickLane(seg, dir, rank, need) {
  const group = lanesOf(seg, dir);
  if (!group.length) return null;
  const fit = need ? group.filter((l) => l.allow.indexOf(need) >= 0) : group;
  const pool = fit.length ? fit : group;
  let best = pool[0];
  for (const lane of pool) {
    if (Math.abs(lane.rank - (rank || 0)) < Math.abs(best.rank - (rank || 0))) best = lane;
  }
  return best;
}

// 노드에서 노드까지 가장 짧은 길. 돌려주는 것은 [{ seg, dir }]다 — 차로는 달리면서
// 고르고, 여기서는 어느 구간을 어느 쪽으로 지나는지만 정한다.
//
// **자리는 노드가 아니라 (구간, 방향)이다.** 노드로만 풀면 "이 교차로에서 좌회전할 수
// 있는가"를 물을 수 없다 — 어느 구간에서 들어왔는지를 알아야 이동을 가릴 수 있기
// 때문이다. 차로가 허락하지 않는 이동은 아예 건너지 않으므로, 좌회전 차로를 없애면
// 그 길로 가려던 차가 **다른 길로 돌아간다**.
function route(net, fromId, toId) {
  if (fromId === toId) return [];
  const from = node(net, fromId);
  if (!from) return null;

  const key = (segId, dir) => `${segId}:${dir}`;
  const dist = new Map();
  const prev = new Map();
  const seen = new Set();

  for (const lane of from.out) {
    const seg = segment(net, lane.seg);
    const id = key(seg.id, lane.dir);
    if (dist.has(id)) continue;
    dist.set(id, seg.length);
    prev.set(id, null);
  }

  for (;;) {
    let at = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!seen.has(id) && d < best) { best = d; at = id; }
    }
    if (at == null) return null;
    const cut = at.lastIndexOf(':');
    const seg = segment(net, isNaN(Number(at.slice(0, cut))) ? at.slice(0, cut) : Number(at.slice(0, cut)));
    const dir = Number(at.slice(cut + 1));
    const landing = dir > 0 ? seg.b : seg.a;
    if (landing === toId) return unwindRoute(net, prev, at);
    seen.add(at);

    for (const lane of node(net, landing).out) {
      const next = segment(net, lane.seg);
      if (!movementAllowed(net, seg, dir, next, lane.dir)) continue;
      const id = key(next.id, lane.dir);
      const cost = best + next.length;
      if (cost < (dist.has(id) ? dist.get(id) : Infinity)) {
        dist.set(id, cost);
        prev.set(id, at);
      }
    }
  }
}

function unwindRoute(net, prev, last) {
  const out = [];
  let at = last;
  while (at != null) {
    const cut = at.lastIndexOf(':');
    const raw = at.slice(0, cut);
    const seg = segment(net, isNaN(Number(raw)) ? raw : Number(raw));
    out.unshift({ seg, dir: Number(at.slice(cut + 1)) });
    at = prev.get(at);
  }
  return out;
}

// 차로와 차로 사이의 선. 방향이 바뀌는 자리는 중앙선, 같은 방향끼리는 차선이다.
// **화면이 아니라 여기서 가른다** — 어느 선이 중앙선인지는 차로 방향이 정하는 것이고,
// 그 판단을 캔버스 쪽에 두면 node로 확인할 수 없다.
function boundaries(seg) {
  const n = seg.lanes.length;
  const out = [];
  for (let i = 1; i < n; i++) {
    out.push({
      offset: (i - n / 2) * LANE_W,
      kind: seg.lanes[i - 1].dir === seg.lanes[i].dir ? 'dash' : 'middle',
    });
  }
  return out;
}

// **차로와 차로를 잇는 짧은 곡선.** 차로는 중심선에서 옆으로 밀려 있어, 앞 구간
// 차로의 끝과 다음 구간 차로의 머리가 교차로 안에서 한 차로 폭만큼 떨어져 있다.
// 그냥 갈아 끼우면 차가 교차로 한가운데서 옆으로 순간이동한다. 양쪽 끝의 방향을
// 그대로 이어받는 3차 베지어를 놓아 그 사이를 돌게 한다.
//
// 만들어 두고 차로에 붙여 둔다 — 같은 길목을 지나는 차가 매 프레임 같은 곡선을 다시
// 만들면 교차로마다 곡선을 새로 깎게 된다. `setLanes`가 차로를 새로 만들므로 차로를
// 고치면 이 곡선도 함께 버려진다.
function link(fromLane, toLane, at) {
  if (!fromLane.links) fromLane.links = new Map();
  const key = `${toLane.seg}:${toLane.index}`;
  if (fromLane.links.has(key)) return fromLane.links.get(key);

  // **연결 곡선은 교차로 앞뒤의 차로를 갈음한다.** 차로는 교차로 한가운데까지
  // 그어져 있는데, 거기까지 달리고 나서 꺾으면 교차로 복판에서 각이 진다. 정지선
  // 자리에서 내려 반대편 정지선 자리로 이어 준다.
  const span = reach(at);
  const trimIn = Math.min(span, fromLane.path.total * 0.45);
  const trimOut = Math.min(span, toLane.path.total * 0.45);
  const head = Geom.at(fromLane.path, fromLane.path.total - trimIn);
  const tail = Geom.at(toLane.path, trimOut);
  const gap = Math.hypot(tail.x - head.x, tail.y - head.y);

  const circling = at && at.control === 'circle';
  // 두 끝이 사실상 같은 자리면 이을 것이 없다. 회전교차로는 곧게 지나가는 길목도
  // 섬을 돌아야 하므로 예외다.
  if (gap < 0.6 && !circling) { fromLane.links.set(key, null); return null; }

  const bow = Math.max(4, gap * 0.45);
  const path = circling
    ? ringPath(at, head, tail)
    : Geom.makePath(Geom.sampleCubic(
      head,
      { x: head.x + head.dx * bow, y: head.y + head.dy * bow },
      { x: tail.x - tail.dx * bow, y: tail.y - tail.dy * bow },
      tail,
      5,
    ));
  const conn = {
    isLink: true,
    seg: `k${fromLane.seg}.${fromLane.index}`,
    index: key,
    path,
    from: fromLane.to,
    to: fromLane.to,
    dir: toLane.dir,
    rank: toLane.rank,
    next: toLane,
    node: fromLane.to,
    ring: !!circling,
    trimIn,
    trimOut,
    // 어느 쪽으로 꺾는 길목인가. 화면 좌표에서 오른쪽은 각이 커지는 쪽이므로, 각이
    // 줄어드는 쪽이 좌회전이다. 마주 오는 차를 가로지르는 것은 좌회전뿐이다.
    side: sideOf(head.dx, head.dy, tail.dx, tail.dy),
    // 도는 길은 이 점을 중심으로 돈다. 프레임마다 점을 다시 찾지 않도록 적어 둔다.
    cx: at ? at.x : 0,
    cy: at ? at.y : 0,
  };
  fromLane.links.set(key, conn);
  return conn;
}

// 회전교차로를 도는 길. 들어온 자리에서 나갈 자리까지 섬을 감고 돈다.
//
// **도는 쪽은 각이 줄어드는 쪽이다.** 우측 통행에서는 섬을 왼쪽에 두고 도는데,
// 화면 좌표는 y가 아래로 가므로 그 방향이 각의 감소로 나타난다. 이 부호를 뒤집으면
// 차가 역주행으로 돈다.
function ringPath(at, head, tail) {
  const a0 = Math.atan2(head.y - at.y, head.x - at.x);
  const a1 = Math.atan2(tail.y - at.y, tail.x - at.x);
  const r0 = Math.hypot(head.x - at.x, head.y - at.y);
  const r1 = Math.hypot(tail.x - at.x, tail.y - at.y);
  let sweep = a0 - a1;
  // 나가는 자리가 들어온 자리보다 앞서 있으면 한 바퀴를 더 돈다. 곧게 지나가는
  // 길목이라도 섬을 비켜 갈 수는 없다.
  while (sweep <= 0.25) sweep += Math.PI * 2;

  const steps = Math.max(5, Math.ceil(sweep / 0.22));
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const ang = a0 - sweep * t;
    const rad = r0 + (r1 - r0) * t;
    pts.push({ x: at.x + Math.cos(ang) * rad, y: at.y + Math.sin(ang) * rad });
  }
  return Geom.makePath(pts);
}

// 회전교차로의 섬 반지름. 도는 길이 지나는 자리보다 안쪽이어야 한다.
function islandRadius(at) {
  return Math.max(4, reach(at) * 0.45);
}

function gates(net) {
  return net.nodes.filter((n) => n.kind === 'gate');
}

const api = {
  build, setLanes, relink, node, segment, lanesOf, pickLane, boundaries, link, route, gates,
  setControl, cycleControl, canControl, phaseOf, phaseCount, islandRadius, reach, ringPath,
  setPlan, setCrossing, crossingAt, setAllow, movement, movementAllowed, sideOf,
  reshape, flipLane, addLane, clearLinks,
  LANE_W, MAX_LANES, CONTROLS, PLANS, MOVES,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadNet = api;

})(typeof window !== 'undefined' ? window : globalThis);

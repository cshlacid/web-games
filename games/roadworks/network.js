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

// segments: [{ a, b, c1?, c2?, lanes: [+1|-1, ...] }] — a·b는 노드 id.
// 제어점이 없으면 곧은 길이다.
function build(nodes, segments) {
  const net = {
    nodes: nodes.map((n) => ({ ...n, out: [], in: [], segs: [] })),
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
function setLanes(net, seg, dirs) {
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
    };
  });
  // 제 방향 무리 안에서 오른쪽부터 0, 1, 2… 바깥 차로로 갈아탈 때 이 순위를 맞춘다.
  for (const dir of [1, -1]) {
    const group = seg.lanes.filter((l) => l.dir === dir);
    // A→B는 오프셋이 클수록 오른쪽, B→A는 작을수록 오른쪽이다.
    group.sort((p, q) => (dir > 0 ? q.offset - p.offset : p.offset - q.offset));
    group.forEach((lane, i) => { lane.rank = i; });
  }
  seg.width = count * LANE_W;
  return seg;
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
  return net;
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

// 다음 구간에서 어느 차로로 들어갈지. **오른쪽에서 몇 번째였는지를 지킨다** — 늘
// 오른쪽 끝으로 붙이면 4차로에서 합류할 때마다 모든 차가 한 줄로 몰린다.
function pickLane(seg, dir, rank) {
  const group = lanesOf(seg, dir);
  if (!group.length) return null;
  const want = Math.min(rank || 0, group.length - 1);
  return group.find((l) => l.rank === want) || group[0];
}

// 노드에서 노드까지 가장 짧은 길. 돌려주는 것은 [{ seg, dir }]다 — 차로는 달리면서
// 고르고, 여기서는 어느 구간을 어느 쪽으로 지나는지만 정한다.
function route(net, fromId, toId) {
  if (fromId === toId) return [];
  const dist = new Map();
  const prev = new Map();
  const seen = new Set();
  for (const n of net.nodes) dist.set(n.id, Infinity);
  dist.set(fromId, 0);

  for (;;) {
    let at = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!seen.has(id) && d < best) { best = d; at = id; }
    }
    if (at == null) return null;
    if (at === toId) break;
    seen.add(at);
    for (const lane of node(net, at).out) {
      const seg = segment(net, lane.seg);
      const cost = best + seg.length;
      if (cost < dist.get(lane.to)) {
        dist.set(lane.to, cost);
        prev.set(lane.to, { from: at, seg, dir: lane.dir });
      }
    }
  }

  const out = [];
  let at = toId;
  while (at !== fromId) {
    const step = prev.get(at);
    if (!step) return null;
    out.unshift({ seg: step.seg, dir: step.dir });
    at = step.from;
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
function link(fromLane, toLane) {
  if (!fromLane.links) fromLane.links = new Map();
  const key = `${toLane.seg}:${toLane.index}`;
  if (fromLane.links.has(key)) return fromLane.links.get(key);

  const head = fromLane.path.points[fromLane.path.points.length - 1];
  const headDir = fromLane.path.dir[fromLane.path.dir.length - 1];
  const tail = toLane.path.points[0];
  const tailDir = toLane.path.dir[0];
  const span = Math.hypot(tail.x - head.x, tail.y - head.y);

  // 두 끝이 사실상 같은 자리면 이을 것이 없다.
  if (span < 0.6) { fromLane.links.set(key, null); return null; }

  const reach = Math.max(4, span * 0.45);
  const path = Geom.makePath(Geom.sampleCubic(
    head,
    { x: head.x + headDir.x * reach, y: head.y + headDir.y * reach },
    { x: tail.x - tailDir.x * reach, y: tail.y - tailDir.y * reach },
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
  };
  fromLane.links.set(key, conn);
  return conn;
}

function gates(net) {
  return net.nodes.filter((n) => n.kind === 'gate');
}

const api = { build, setLanes, relink, node, segment, lanesOf, pickLane, boundaries, link, route, gates, LANE_W, MAX_LANES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadNet = api;

})(typeof window !== 'undefined' ? window : globalThis);

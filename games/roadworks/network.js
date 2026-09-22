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
// 한 길에 둘 수 있는 차로 수. **넓히는 것이 정체를 푸는 수단이라 여유를 둔다** —
// 넷에서 멈추면 큰길은 처음부터 다 찬 상태로 시작해 손댈 데가 없다. 폭은 차로 수에
// 그대로 비례하므로(여덟이면 80) 넓힌 길은 격자에서 눈에 띄게 굵다.
const MAX_LANES = 8;
// 이보다 짧은 토막은 내지 않는다. 차로를 깔아도 교차로 원 둘이 겹쳐 길이 사라진다.
const MIN_STUB = 26;

// 구간을 가를 때 끝에서 이만큼 안쪽이어야 정말로 가른다. **길 폭을 탄다** — 교차로
// 원이 길 폭의 절반이라, 넓은 길에서 짧은 토막을 내면 양 끝의 원 둘이 그 토막을
// 통째로 덮어 길이 사라진다. 여덟 차로면 폭이 80이고 원이 40씩이다.
function stubOf(seg) {
  return Math.max(MIN_STUB, seg.width * 1.2);
}

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
    nextSeg: 0,
    nextNode: 0,
  };
  segments.forEach((raw, index) => {
    addSeg(net, { ...raw, id: raw.id != null ? raw.id : index });
  });
  relink(net);
  return net;
}

// 구간 하나를 만들어 붙인다. 판을 처음 세울 때도, 플레이어가 길을 놓을 때도 같은
// 길을 지난다 — 새로 놓은 길만 다르게 만들어지면 그쪽에서만 나는 탈이 생긴다.
//
// **`relink`는 부르지 않는다.** 여러 구간을 잇달아 손보는 자리(길 가르기)가 있어,
// 한 번에 몰아 부르는 편이 낫다.
function addSeg(net, raw) {
  const a = node(net, raw.a);
  const b = node(net, raw.b);
  if (!a || !b) return null;
  const c1 = raw.c1 || { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
  const c2 = raw.c2 || { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 };
  const center = Geom.makePath(Geom.sampleCubic(a, c1, c2, b));
  const seg = {
    id: raw.id != null ? raw.id : `s${net.nextSeg++}`,
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
  return seg;
}

function removeSeg(net, seg) {
  const i = net.segs.indexOf(seg);
  if (i < 0) return null;
  net.segs.splice(i, 1);
  for (const at of net.nodes) {
    const k = at.segs.indexOf(seg.id);
    if (k >= 0) at.segs.splice(k, 1);
  }
  clearLinks(net, seg.a);
  clearLinks(net, seg.b);
  return seg;
}

// **길 한복판에 점을 낸다.** 드래그로 놓는 길은 아무 데서나 뻗어 나가므로, 그 자리에
// 교차로가 없으면 있던 길을 둘로 갈라야 한다.
//
// 가르는 자리는 **베지어를 t에서 정확히 쪼개** 얻는다(`Geom.splitCubic`). 두 토막이
// 원래 곡선과 같은 자리를 지나므로 이미 그 위를 달리던 차가 옆으로 튀지 않고, 갈라진
// 점에서 접선도 그대로 이어져 굽이가 끊기지 않는다.
//
// 돌려주는 것은 { at, segs: [앞토막, 뒤토막] }. 끝에 너무 가까우면 가르지 않고 그 끝
// 점을 그대로 돌려준다 — 길이가 0에 가까운 토막은 차로를 깔 수도 없다.
function splitSeg(net, seg, s) {
  const a = node(net, seg.a);
  const b = node(net, seg.b);
  const t = Geom.tOf(seg.center, s);
  const stub = stubOf(seg);
  if (s < stub) return { at: a, segs: [seg] };
  if (seg.length - s < stub) return { at: b, segs: [seg] };

  const cut = Geom.splitCubic(a, seg.c1, seg.c2, b, t);
  const at = {
    id: `j${net.nextNode++}`,
    kind: 'joint',
    x: cut.at.x,
    y: cut.at.y,
    control: 'none',
    plan: 'paired',
    crossing: false,
    out: [],
    in: [],
    segs: [],
  };
  net.nodes.push(at);

  const dirs = seg.lanes.map((l) => l.dir);
  const allow = new Map();
  for (const dir of [1, -1]) {
    allow.set(dir, lanesOf(seg, dir).slice().sort((p, q) => p.rank - q.rank).map((l) => l.allow));
  }
  removeSeg(net, seg);
  const head = addSeg(net, { a: a.id, b: at.id, c1: cut.left[1], c2: cut.left[2], lanes: dirs });
  const tail = addSeg(net, { a: at.id, b: b.id, c1: cut.right[1], c2: cut.right[2], lanes: dirs });

  // 갈라도 **바깥 끝에서의 허용 이동은 그대로 간다.** 새로 난 점 쪽은 갈림이 없어
  // 어차피 직진뿐이라 기본값이 맞다.
  for (const dir of [1, -1]) {
    const was = allow.get(dir) || [];
    const far = dir > 0 ? tail : head;
    for (const lane of lanesOf(far, dir)) {
      if (was[lane.rank]) lane.allow = was[lane.rank].slice();
    }
  }
  relink(net);
  // 그 위를 달리던 차를 옮겨 태우려면 **어느 구간이 어디서 갈렸는지**를 알아야 한다.
  return { at, segs: [head, tail], was: seg, q: s / seg.length };
}

// **두 자리를 잇는 새 길.** 자리는 점이거나 "구간 위의 거리"다 — 구간 위라면 그 길을
// 먼저 가른다. 굽이는 손잡이 하나로 정한다(2차 베지어를 3차로 옮겨 적는다): 잡아
// 끄는 점이 하나뿐이라야 손가락으로 굽힐 수 있다.
//
// 돌려주는 것은 { seg, at: [시작점, 끝점], split: 가른 수 }.
function connect(net, from, to, handle, lanes) {
  const splits = [];
  // 가장자리에 낸 관문. 길을 놓지 못하고 돌아설 때는 도로 거둔다 — 아무것도 닿지
  // 않은 관문이 판에 남으면 차가 거기서 나서 그 자리에 갇힌다.
  const born = [];
  const fail = () => { for (const made of born) dropNode(net, made); return null; };

  const a = anchor(net, from, splits, born);
  if (!a) return fail();
  const b = anchor(net, to, splits, born);
  if (!b) return fail();
  if (a.id === b.id) return fail();

  // **지나가며 가로지르는 길에도 점을 낸다.** 그러지 않으면 두 길이 점 없이 겹쳐,
  // 차가 서로를 통과하고 신호를 놓을 자리도 없는 도로가 생긴다.
  const bow = bend(a, b, handle);
  let curve = [a, bow.c1, bow.c2, b];
  const marks = crossMarks(net, curve, a, b);

  const segs = [];
  let head = a;
  let base = 0;   // 지금까지 잘라 낸 만큼. 남은 곡선에서의 t로 옮기는 데 쓴다.
  for (const mark of marks) {
    // **표식이 가리키는 그 길을 가른다.** 가까이 지나는 다른 길을 집으면 정작
    // 가로지른 길은 점 없이 남는다. 앞의 표식이 이미 그 길을 갈랐으면 사라졌으므로,
    // 그때만 자리로 다시 찾는다.
    const still = segment(net, mark.seg);
    const hit = still ? { seg: still, s: mark.at } : segmentNear(net, mark, [head.id]);
    if (!hit) continue;
    const t = (mark.t - base) / (1 - base);
    if (!(t > 0.001 && t < 0.999)) continue;

    const cut = splitSeg(net, hit.seg, hit.s);
    if (cut.was) splits.push(cut);
    if (cut.at.id === head.id) continue;

    const piece = Geom.splitCubic(curve[0], curve[1], curve[2], curve[3], t);
    // **너무 짧은 토막은 만들지 않고 점만 앞으로 옮긴다.** 양 끝 교차로 원에 덮여
    // 보이지도 않으면서 차를 두 번 세우는 구간이 되기 때문이다. 거기서는 새 길이
    // 조금 앞에서 시작하는 것으로 친다.
    if (Math.hypot(cut.at.x - head.x, cut.at.y - head.y) >= MIN_PIECE) {
      const seg = addSeg(net, {
        a: head.id, b: cut.at.id, c1: piece.left[1], c2: piece.left[2], lanes: lanes || [1],
      });
      if (seg) segs.push(seg);
    }
    curve = piece.right;
    base = mark.t;
    head = cut.at;
  }

  // 마지막 토막도 같은 잣대로 본다 — 끝점 코앞에서 가로질렀으면 거기가 끝이다.
  if (head.id !== b.id
    && (!segs.length || Math.hypot(b.x - head.x, b.y - head.y) >= MIN_PIECE)) {
    const last = addSeg(net, {
      a: head.id, b: b.id, c1: curve[1], c2: curve[2], lanes: lanes || [1],
    });
    if (last) segs.push(last);
  }
  if (!segs.length) return fail();
  relink(net);
  return { seg: segs[0], segs, at: [a, b], splits };
}

// 새 길을 토막 내는 가장 짧은 길이. 이보다 짧은 토막은 만들지 않는다.
const MIN_PIECE = 24;

// 놓을 곡선이 기존 길의 가운데선을 가로지르는 자리들. 곡선을 따라 앞에서부터 차례로
// 돌려준다.
function crossMarks(net, curve, a, b) {
  const path = Geom.makePath(Geom.sampleCubic(curve[0], curve[1], curve[2], curve[3], 5));
  const out = [];
  for (const seg of net.segs) {
    const mine = [];
    for (const hit of meets(path, seg.center)) {
      // **양 끝에서의 맞닿음만 걸러 낸다.** 새 길은 붙일 길 위에서 시작하고 끝나므로
      // 그 점에서 두 가운데선이 정확히 만난다 — 그것은 가로지르는 것이 아니다.
      // 넉넉히 잡아 걸렀더니 끝점 가까이에서 다른 길을 가로지르는 것까지 놓쳤다.
      if (Math.hypot(hit.x - a.x, hit.y - a.y) < 2) continue;
      if (Math.hypot(hit.x - b.x, hit.y - b.y) < 2) continue;
      // **같은 길을 코앞에서 두 번 스친 것만 하나로 본다.** 자리로만 걸렀더니 가까이
      // 지나는 두 길을 가로지를 때 한쪽이 점을 못 받았다.
      if (mine.some((p) => Math.hypot(p.x - hit.x, p.y - hit.y) < 6)) continue;
      mine.push(hit);
      out.push({ ...hit, seg: seg.id });
    }
  }
  out.sort((p, q) => p.t - q.t);
  return out;
}

// 두 꺾은선이 만나는 자리. t는 첫 번째 꺾은선 위에서 얼마나 왔는지(0~1)다.
function meets(one, other) {
  const out = [];
  const n = one.points.length - 1;
  for (let i = 1; i <= n; i++) {
    const a1 = one.points[i - 1];
    const a2 = one.points[i];
    for (let j = 1; j < other.points.length; j++) {
      const b1 = other.points[j - 1];
      const b2 = other.points[j];
      const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
      if (Math.abs(d) < 1e-9) continue;
      const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
      const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
      // **반만 열어 둔다.** 곧은 길이 반듯한 자리에서 만나면 만나는 점이 두 꺾은선의
      // 꼭짓점과 정확히 겹치는데, 양끝을 다 닫으면 그 자리가 앞 토막에서는 t=1,
      // 뒤 토막에서는 t=0이라 어느 쪽에도 걸리지 않는다. 한쪽만 열어 두면 꼭 한 번
      // 잡히고 두 번 세지도 않는다.
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      out.push({
        t: (i - 1 + t) / n,
        // 만나는 자리가 상대 길의 어디쯤인지. 그 길을 가를 때 바로 쓴다.
        at: other.cum[j - 1] + Math.hypot(b2.x - b1.x, b2.y - b1.y) * u,
        x: a1.x + (a2.x - a1.x) * t,
        y: a1.y + (a2.y - a1.y) * t,
      });
    }
  }
  return out;
}

// 그 자리를 지나는 길. 가른 뒤에는 구간이 바뀌므로 자리로 다시 찾는다.
function segmentNear(net, spot, skipIds) {
  let best = null;
  for (const seg of net.segs) {
    if (skipIds && (skipIds.indexOf(seg.a) >= 0 || skipIds.indexOf(seg.b) >= 0)) continue;
    let near = { d: Infinity, s: 0 };
    const pts = seg.center.points;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((spot.x - p.x) * dx + (spot.y - p.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(spot.x - (p.x + dx * t), spot.y - (p.y + dy * t));
      if (d < near.d) near = { d, s: seg.center.cum[i - 1] + Math.sqrt(len2) * t };
    }
    if (near.d > 2) continue;
    if (!best || near.d < best.d) best = { seg, d: near.d, s: near.s };
  }
  return best;
}

// 관문을 판 끝보다 조금 안쪽에 둔다. 차가 사라지는 자리가 보여야 한다.
const EDGE_IN = 6;
// 판 끝에서 이만큼 안쪽까지를 "가장자리"로 본다. 여기에 길을 대면 시외로 빠진다.
const EDGE_BAND = 52;

// 그 자리가 판 가장자리인가. 맞으면 거기에 놓일 관문의 자리를 돌려준다. **네 변 중
// 가장 가까운 쪽으로 붙인다** — 모서리 근처에서는 어느 쪽이든 하나를 골라야 한다.
function edgeSpot(net, x, y, band) {
  const { w, h } = net.world;
  const reach = band == null ? EDGE_BAND : band;
  const cx = Math.max(0, Math.min(w, x));
  const cy = Math.max(0, Math.min(h, y));
  const gaps = [cx, w - cx, cy, h - cy];
  const near = Math.min(...gaps);
  // 판 밖으로 끌어낸 것도 가장자리로 본다.
  const out = x < 0 || y < 0 || x > w || y > h;
  if (!out && near > reach) return null;
  const k = gaps.indexOf(near);
  if (k === 0) return { x: EDGE_IN, y: cy };
  if (k === 1) return { x: w - EDGE_IN, y: cy };
  if (k === 2) return { x: cx, y: EDGE_IN };
  return { x: cx, y: h - EDGE_IN };
}

// 가장자리에 관문을 하나 낸다. **도시 밖으로 빠지는 길은 여기서 태어난다.**
function addGate(net, x, y) {
  const at = edgeSpot(net, x, y, Infinity);
  const node = {
    id: `e${net.nextNode++}`,
    kind: 'gate',
    control: 'none',
    plan: 'paired',
    crossing: false,
    x: at.x,
    y: at.y,
    out: [],
    in: [],
    segs: [],
  };
  net.nodes.push(node);
  return node;
}

function dropNode(net, node) {
  const at = net.nodes.indexOf(node);
  if (at >= 0) net.nodes.splice(at, 1);
}

// 자리를 점으로 바꾼다. { node: id }면 그 점, { seg, s }면 그 구간을 가른 자리,
// { edge }면 판 가장자리에 새로 내는 관문.
function anchor(net, spot, splits, born) {
  if (spot.edge) {
    const made = addGate(net, spot.edge.x, spot.edge.y);
    if (born) born.push(made);
    return made;
  }
  if (spot.node != null) return node(net, spot.node);
  const seg = typeof spot.seg === 'object' ? spot.seg : segment(net, spot.seg);
  if (!seg) return null;
  const cut = splitSeg(net, seg, spot.s);
  if (cut.was && splits) splits.push(cut);
  return cut.at;
}

// 손잡이 하나를 지나는 곡선의 제어점. **2차 베지어(a, 손잡이, b)를 3차로 옮겨
// 적은 것이다** — 제어점 둘을 따로 잡게 하면 손가락으로는 다룰 수 없고, 손잡이
// 하나면 끄는 대로 굽는다. 손잡이가 없으면 곧은 길이다.
function bend(a, b, handle) {
  const h = handle || { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    c1: { x: a.x + (h.x - a.x) * 2 / 3, y: a.y + (h.y - a.y) * 2 / 3 },
    c2: { x: b.x + (h.x - b.x) * 2 / 3, y: b.y + (h.y - b.y) * 2 / 3 },
  };
}

// **놓기 전의 길.** 그리는 쪽과 값을 매기는 쪽이 같은 곡선을 봐야 미리 보여 준 값과
// 치르는 값이 어긋나지 않는다. 판은 건드리지 않는다.
function draftPath(net, from, to, handle) {
  const a = spotOf(net, from);
  const b = spotOf(net, to);
  if (!a || !b) return null;
  const c = bend(a, b, handle);
  return Geom.makePath(Geom.sampleCubic(a, c.c1, c.c2, b));
}

// 자리의 좌표. 판을 가르지 않고 어디인지만 본다.
function spotOf(net, spot) {
  if (!spot) return null;
  if (spot.edge) return edgeSpot(net, spot.edge.x, spot.edge.y, Infinity);
  if (spot.node != null) {
    const at = node(net, spot.node);
    return at && { x: at.x, y: at.y };
  }
  const seg = typeof spot.seg === 'object' ? spot.seg : segment(net, spot.seg);
  if (!seg) return null;
  const at = Geom.at(seg.center, spot.s);
  return { x: at.x, y: at.y };
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
// net을 함께 받으면 그 차로가 닿는 교차로의 엇갈림을 다시 잰다 — 좌회전을 끄면
// 가로지를 짝이 사라져 교차로가 아니게 되는 자리가 있다.
function setAllow(lane, moves, net) {
  const list = MOVES.filter((m) => moves.indexOf(m) >= 0);
  // 아무것도 못 가는 차로는 둘 수 없다 — 그 차로에 들어온 차가 갇힌다.
  lane.allow = list.length ? list : ['through'];
  if (net) {
    const at = node(net, lane.to);
    if (at) {
      at.conflict = hasCrossing(net, at);
      if (!canControl(at)) at.control = 'none';
    }
  }
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
  // **엇갈릴 짝이 있는지는 여기서 한 번만 잰다.** 화면이 프레임마다 묻는 값이라
  // 그때마다 이동을 모두 훑을 수는 없다. 차로 구성과 허용 이동이 바뀌면 판이
  // 다시 이어지므로(`reshape`) 여기가 그 자리다.
  for (const node of net.nodes) {
    node.conflict = hasCrossing(net, node);
    // 엇갈림이 사라진 자리에 놓여 있던 신호는 거둔다. 아무것도 갈라 줄 것이 없는데
    // 차만 세우게 된다.
    if (!canControl(node)) node.control = 'none';
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

// **엇갈릴 짝이 있는 자리에만 놓을 수 있다.** 갈래가 셋이라고 다 교차로인 것은
// 아니다 — 지나는 길이 서로 가로지르지 않으면 아무것도 갈라 줄 것이 없고, 거기에
// 신호를 세우면 차만 세운다. 길이 꺾이기만 하는 이음매도 이 잣대에 저절로 걸린다.
function canControl(node) {
  return node.kind !== 'gate' && !!node.conflict;
}

// 갈래의 방위. 교차로에서 그 구간 쪽을 본 방향이다.
function approachAngle(net, node, segId) {
  const seg = segment(net, segId);
  if (!seg) return null;
  const out = seg.a === node.id;
  const at = Geom.at(seg.center, out ? 0 : seg.center.total);
  return out ? Math.atan2(at.dy, at.dx) : Math.atan2(-at.dy, -at.dx);
}

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;

// **들고 나는 자리는 갈래의 방위에서 조금 비켜 있다.** 우측 통행이라 들어오는 차는
// 제 갈래의 오른쪽으로 닿고 나가는 차는 나갈 갈래의 오른쪽으로 떠나는데, 화면
// 좌표에서 그 오른쪽은 각이 커지는 쪽이다. 그래서 **들어오는 자리는 방위보다 조금
// 작고 나가는 자리는 조금 크다.** 이 비킴이 없으면 마주 보는 직진 둘이 한 점에서
// 만나 서로 엇갈리는 것으로 잡힌다.
const SIDE = 0.08;

// 두 이동이 교차로 안에서 가로지르는가. 원 위의 두 현이 서로를 건너는지를 본다 —
// 끝을 나눠 쓰는 둘(같은 데서 갈라지거나 같은 데로 합치는 둘)은 가로지르는 것이
// 아니므로 먼저 걸러 낸다.
function chordCross(p, q) {
  if (p.from === q.from || p.to === q.to) return false;
  const inside = (a, b, x) => norm(x - a) < norm(b - a);
  return inside(p.a, p.b, q.a) !== inside(p.a, p.b, q.b);
}

// 이 교차로에서 허락된 이동들 가운데 서로 가로지르는 짝이 있는가.
function hasCrossing(net, node) {
  if (node.kind === 'gate' || node.segs.length < 2) return false;
  const angle = new Map();
  for (const id of node.segs) {
    const a = approachAngle(net, node, id);
    if (a != null) angle.set(id, a);
  }

  // 차로가 아니라 **(구간, 방향)**을 센다. 한 갈래에 차로가 여덟이면 차로끼리
  // 짝지어 훑는 것만으로 수백 번이 되는데, 가로지르는지는 차로가 아니라 어느
  // 갈래에서 어느 갈래로 가는가로 정해진다.
  const ways = (lanes) => {
    const out = [];
    for (const lane of lanes) {
      if (!out.some((w) => w.seg === lane.seg && w.dir === lane.dir)) {
        out.push({ seg: lane.seg, dir: lane.dir });
      }
    }
    return out;
  };

  const moves = [];
  for (const into of ways(node.in)) {
    for (const away of ways(node.out)) {
      const from = segment(net, into.seg);
      const to = segment(net, away.seg);
      if (!from || !to) continue;
      if (!movementAllowed(net, from, into.dir, to, away.dir)) continue;
      const ain = angle.get(into.seg);
      const aout = angle.get(away.seg);
      if (ain == null || aout == null) continue;
      moves.push({
        from: into.seg, to: away.seg,
        a: norm(ain - SIDE), b: norm(aout + SIDE),
      });
    }
  }

  for (let i = 0; i < moves.length; i++) {
    for (let j = i + 1; j < moves.length; j++) {
      if (chordCross(moves[i], moves[j])) return true;
    }
  }
  return false;
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
// 늘 오른쪽 끝으로 붙이면 넓은 길에서 합류할 때마다 모든 차가 한 줄로 몰린다.
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
  setControl, cycleControl, canControl, hasCrossing, phaseOf, phaseCount, islandRadius, reach, ringPath,
  setPlan, setCrossing, crossingAt, setAllow, movement, movementAllowed, sideOf,
  reshape, flipLane, addLane, clearLinks, addSeg, removeSeg, splitSeg, connect, bend, draftPath, spotOf, crossMarks,
  edgeSpot, addGate,
  stubOf,
  LANE_W, MAX_LANES, MIN_STUB, EDGE_BAND, EDGE_IN, CONTROLS, PLANS, MOVES,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadNet = api;

})(typeof window !== 'undefined' ? window : globalThis);

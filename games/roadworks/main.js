'use strict';

// 화면. 판은 캔버스 한 장이고, 규칙은 traffic.js·network.js·mapgen.js가 들고 있다.
//
// **여기만 캔버스다.** 저장소의 다른 게임은 인라인 SVG로 그리는데, 그 규칙은 저장소에
// 바이너리 애셋을 들이지 않으려는 것이고 캔버스도 그 점에서는 같다(그림을 코드로
// 그린다). 차 이백 대가 매 프레임 움직이는 화면에서 SVG는 요소 이백 개의 transform을
// 프레임마다 갈아 끼우게 되고, 곡선 도로의 가장자리·차선·정지선까지 요소로 두면
// 수백 개가 더 붙는다. 캔버스는 한 번의 그리기로 끝난다.
(function () {

const Geom = window.RoadGeom;
const Net = window.RoadNet;
const Gen = window.RoadMapGen;
const Traffic = window.RoadTraffic;
const Sound = window.RoadSound;
const t = (key, vars) => window.SharedI18n.t(key, vars);

const el = {
  canvas: document.getElementById('board'),
  wrap: document.getElementById('board-wrap'),
  app: document.querySelector('.app'),
  count: document.getElementById('stat-count'),
  speed: document.getElementById('stat-speed'),
  gone: document.getElementById('stat-gone'),
  money: document.getElementById('stat-money'),
  play: document.getElementById('play'),
  rates: document.getElementById('rates'),
  fresh: document.getElementById('fresh'),
  help: document.getElementById('help'),
  helpOpen: document.getElementById('help-open'),
  helpClose: document.getElementById('help-close'),
  toggleBgm: document.getElementById('toggle-bgm'),
  toggleSfx: document.getElementById('toggle-sfx'),
  panel: document.getElementById('panel'),
  panelBody: document.getElementById('panel-body'),
};

const ctx = el.canvas.getContext('2d');

// 화면 색. 어두운 테마에서 갈리는 값만 둘로 둔다.
const SKIN = {
  light: {
    ground: '#e9ecef', asphalt: '#7d8794', kerb: '#69737f',
    dash: '#e8ecf1', middle: '#e7c94f', gate: '#59636f',
    island: '#9fbf96', stop: '#eef1f4',
    red: '#d4483b', amber: '#e0a52c', green: '#49a55f',
    mark: '#e8ecf1', zebra: '#eef1f4', walker: '#3c4650', pick: '#3b6ea5',
    body: ['#d05b4e', '#4a7fc1', '#e4e7ea', '#59636f', '#5aa06a', '#b8722e'],
    taxi: '#eeb92a', bus: '#3f8f86', truck: '#cfd4da', moto: '#3c4650',
  },
  dark: {
    ground: '#171a1e', asphalt: '#3b434c', kerb: '#2a3138',
    dash: '#7c8794', middle: '#a98f31', gate: '#8b96a2',
    island: '#41603f', stop: '#aeb7c0',
    red: '#c04336', amber: '#c9932a', green: '#3f9153',
    mark: '#8994a1', zebra: '#aeb7c0', walker: '#cfd7de', pick: '#79a7d8',
    body: ['#b8544a', '#4a76ad', '#c9ced4', '#6b7682', '#4f8d60', '#a3672c'],
    taxi: '#d8a726', bus: '#3a807a', truck: '#9aa2ab', moto: '#2b3138',
  },
};

let skin = SKIN.light;
let net = null;
let world = null;
let deco = new Map();      // 구간 id → 차선·가장자리 꺾은선
let view = { scale: 1, dx: 0, dy: 0 };
let running = true;
let rate = 1;
let last = 0;
let seed = 1;
let picked = null;   // 고른 교차로나 길
let draft = null;    // 놓기를 기다리는 새 길
let drag = null;     // 지금 끌고 있는 것

// --- 판 만들기 ---

function fresh(nextSeed) {
  seed = nextSeed == null ? Math.floor(Math.random() * 1e9) : nextSeed;
  net = Gen.city({ seed });
  world = Traffic.create(net, { spawnRate: 1.7 });
  picked = null;
  draft = null;
  drag = null;
  buildDeco();
  layout();
  paintPanel();
  window.__net = net;
  window.__world = world;
  // 빈 도시에서 시작하면 한참을 기다려야 차가 보인다. 몇 초치를 미리 돌려 둔다.
  for (let i = 0; i < 60 * 16; i++) Traffic.tick(world, 1 / 60);
}

// 도로를 그리는 데 쓰는 선들. 차로가 바뀔 때만 다시 만든다 — 프레임마다 오프셋을
// 다시 재면 곡선 백 개를 매번 훑게 된다.
function buildDeco() {
  deco = new Map();
  for (const seg of net.segs) {
    const n = seg.lanes.length;
    const half = (n / 2) * Net.LANE_W;
    const item = {
      edges: [Geom.offsetPath(seg.center, -half), Geom.offsetPath(seg.center, half)],
      dashes: [],
      middles: [],
    };
    for (const line of Net.boundaries(seg)) {
      const path = Geom.offsetPath(seg.center, line.offset);
      if (line.kind === 'dash') item.dashes.push(path);
      else item.middles.push(path);
    }
    deco.set(seg.id, item);
  }
}

// --- 배치 ---

function layout() {
  const width = el.app.clientWidth;
  const room = Math.max(260, window.innerHeight - 250);
  const scale = Math.min(width / net.world.w, room / net.world.h);
  const w = Math.round(net.world.w * scale);
  const h = Math.round(net.world.h * scale);
  const dpr = window.devicePixelRatio || 1;

  el.canvas.width = Math.round(w * dpr);
  el.canvas.height = Math.round(h * dpr);
  el.canvas.style.width = `${w}px`;
  el.canvas.style.height = `${h}px`;
  el.wrap.style.width = `${w}px`;
  view = { scale: scale * dpr, dx: 0, dy: 0 };
  window.SharedSnap.snap(el.canvas);
}

function readSkin() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  skin = dark ? SKIN.dark : SKIN.light;
}

// --- 그리기 ---

function trace(path) {
  ctx.beginPath();
  ctx.moveTo(path.points[0].x, path.points[0].y);
  for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
}

function drawRoads() {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';

  // 아스팔트와 갓길. 구간을 먼저 다 깔고 교차로를 덮어야 이음매가 메워진다.
  for (const seg of net.segs) {
    trace(seg.center);
    ctx.strokeStyle = skin.kerb;
    ctx.lineWidth = seg.width + 2.5;
    ctx.stroke();
  }
  for (const seg of net.segs) {
    trace(seg.center);
    ctx.strokeStyle = skin.asphalt;
    ctx.lineWidth = seg.width;
    ctx.stroke();
  }

  // 교차로. 맞닿은 길 중 가장 넓은 것에 맞춰 원으로 덮는다. 회전교차로는 섬을
  // 두를 자리가 있어야 하므로 더 넓다.
  //
  // **갈림이 없는 이음매에는 그리지 않는다.** 길이 그저 꺾이기만 하는 자리까지
  // 원으로 덮으면 없는 교차로가 길가에 불룩하게 튀어나와, 신호를 놓을 수 있는 자리와
  // 그럴 수 없는 자리가 화면에서 구별되지 않는다. 거기는 두 구간의 접선이 이어져
  // 있어 덮지 않아도 이음매가 보이지 않는다.
  for (const node of net.nodes) {
    if (!Net.canControl(node)) continue;
    const radius = node.control === 'circle' ? Net.reach(node) + 3 : node.radius;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 1.2, 0, Math.PI * 2);
    ctx.fillStyle = skin.kerb;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = skin.asphalt;
    ctx.fill();
  }

  // 차선과 중앙선. 교차로 안에서는 끊어야 하므로 그쪽 끝을 조금 잘라 그린다.
  // **갈림이 없는 이음매에서는 자르지 않는다** — 덮을 교차로가 없어 선만 끊긴다.
  for (const seg of net.segs) {
    const item = deco.get(seg.id);
    const cut = seg.width / 2 + 3;
    const head = Net.canControl(Net.node(net, seg.a)) ? cut : 0;
    const tail = Net.canControl(Net.node(net, seg.b)) ? cut : 0;
    for (const path of item.dashes) {
      strokeTrimmed(path, head, tail, { color: skin.dash, width: 0.9, dash: [7, 9], alpha: 0.75 });
    }
    for (const path of item.middles) {
      strokeTrimmed(path, head, tail, { color: skin.middle, width: 1.4, alpha: 0.9 });
    }
  }
}

// 양 끝을 잘라 그린다. 교차로 원 안까지 차선을 그으면 교차로가 격자무늬가 된다.
function strokeTrimmed(path, headTrim, tailTrim, style) {
  const from = Math.min(headTrim, path.total / 2 - 1);
  const to = path.total - Math.min(tailTrim, path.total / 2 - 1);
  if (to <= from) return;
  ctx.beginPath();
  const steps = Math.max(2, Math.ceil((to - from) / 4));
  for (let i = 0; i <= steps; i++) {
    const p = Geom.at(path, from + ((to - from) * i) / steps);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.save();
  ctx.globalAlpha = style.alpha == null ? 1 : style.alpha;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  if (style.dash) ctx.setLineDash(style.dash);
  ctx.stroke();
  ctx.restore();
}

// 차로가 허락하는 이동을 도로 바닥에 그린다. 교차로에 닿기 조금 전, 차가 차로를
// 고르고 나서 볼 자리에 둔다.
function drawLaneMarks() {
  for (const seg of net.segs) {
    for (const lane of seg.lanes) {
      const node = Net.node(net, lane.to);
      if (!node || !Net.canControl(node)) continue;
      const back = Net.reach(node) + 16;
      if (lane.path.total < back + 22) continue;
      const at = Geom.at(lane.path, lane.path.total - back);
      const angle = Math.atan2(at.dy, at.dx);
      drawLaneGlyph(at.x, at.y, Math.atan2(at.dy, at.dx), lane.allow);
    }
  }
}

// 바닥 화살표. **한 차로에 하나의 자루에서 갈래를 뻗는다** — 허락하는 이동마다 화살표를
// 따로 그려 나란히 놓아 보았더니 폭 10짜리 차로에 셋이 겹쳐 긁힌 자국처럼 보였다.
// 실제 노면 표시도 자루 하나에 촉을 여럿 단다. 진행 방향이 +x가 되도록 돌려 놓고 그린다.
function drawLaneGlyph(x, y, angle, moves) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = skin.mark;
  ctx.fillStyle = skin.mark;
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.9;

  const tip = (tx, ty, dir) => {
    const w = 2.6;
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(dir) * 4.2, ty + Math.sin(dir) * 4.2);
    ctx.lineTo(tx + Math.cos(dir + 2.4) * w, ty + Math.sin(dir + 2.4) * w);
    ctx.lineTo(tx + Math.cos(dir - 2.4) * w, ty + Math.sin(dir - 2.4) * w);
    ctx.closePath();
    ctx.fill();
  };

  // 자루. 갈래는 모두 이 끝에서 뻗는다.
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();

  for (const move of moves) {
    if (move === 'through') {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      tip(4, 0, 0);
    } else if (move === 'right' || move === 'left') {
      const s = move === 'right' ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(3.4, 0, 3.4, s * 4.2);
      ctx.stroke();
      tip(3.4, s * 4.2, s * Math.PI / 2);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(5, 0, 5, -3);
      ctx.quadraticCurveTo(5, -5.6, 1.6, -5.6);
      ctx.stroke();
      tip(1.6, -5.6, Math.PI);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// 횡단보도. 길을 가로지르는 줄무늬다.
function drawCrossings() {
  for (const node of net.nodes) {
    if (!node.crossing) continue;
    for (const id of node.segs) {
      const seg = Net.segment(net, id);
      const line = Traffic.crossLine(net, node, seg);
      const along = { x: line.at.dx, y: line.at.dy };
      const side = Geom.right(along);
      const half = seg.width / 2;
      ctx.fillStyle = skin.zebra;
      ctx.globalAlpha = 0.85;
      for (let u = -half + 1.2; u < half - 1; u += 4.4) {
        const cx = line.at.x + side.x * u;
        const cy = line.at.y + side.y * u;
        ctx.beginPath();
        ctx.moveTo(cx - along.x * 3 - side.x * 1.1, cy - along.y * 3 - side.y * 1.1);
        ctx.lineTo(cx + along.x * 3 - side.x * 1.1, cy + along.y * 3 - side.y * 1.1);
        ctx.lineTo(cx + along.x * 3 + side.x * 1.1, cy + along.y * 3 + side.y * 1.1);
        ctx.lineTo(cx - along.x * 3 + side.x * 1.1, cy - along.y * 3 + side.y * 1.1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawWalkers() {
  ctx.fillStyle = skin.walker;
  for (const walker of world.walkers) {
    const at = Traffic.walkerSpot(net, walker);
    ctx.beginPath();
    ctx.arc(at.x, at.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 고른 교차로나 길을 짚어 준다.
function drawPick() {
  if (!picked) return;
  ctx.strokeStyle = skin.pick;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  if (picked.kind === 'node') {
    ctx.beginPath();
    ctx.arc(picked.node.x, picked.node.y, Net.reach(picked.node) + 7, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // 길은 가운데를 따라 가늘게 짚는다. 길 전체를 굵게 덧그렸더니 줄무늬가 도로를
    // 덮어 무엇이 그려져 있는지 보이지 않았다.
    trace(picked.seg.center);
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// 놓기를 기다리는 길과, 지금 끌고 있는 선. **차 위에 그린다** — 이것은 판 위의
// 길이 아니라 손이 그리는 중인 선이라, 차에 가려지면 어디로 긋고 있는지 보이지 않는다.
function drawDraft() {
  if (drag && drag.kind === 'line' && drag.moved && drag.from) {
    ctx.strokeStyle = skin.pick;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(drag.from.x, drag.from.y);
    ctx.lineTo(drag.cur.x, drag.cur.y);
    ctx.stroke();
    ctx.setLineDash([]);
    dot(drag.from.x, drag.from.y, 4);
    if (drag.to) dot(drag.to.x, drag.to.y, 5);
  }

  if (!draft || !draft.path) return;
  const ok = draft.able.ok;
  // 놓이면 어떤 폭인지 그대로 보여 준다. 실선으로 그으면 이미 놓인 길처럼 보인다.
  ctx.save();
  ctx.globalAlpha = 0.35;
  trace(draft.path);
  ctx.strokeStyle = ok ? skin.asphalt : skin.red;
  ctx.lineWidth = Net.LANE_W;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  trace(draft.path);
  ctx.strokeStyle = ok ? skin.pick : skin.red;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 1차로는 한 방향뿐이다. 어느 쪽으로 가는 길인지 촉으로 보인다.
  const tipAt = Geom.at(draft.path, draft.path.total - 6);
  ctx.save();
  ctx.translate(tipAt.x, tipAt.y);
  ctx.rotate(Math.atan2(tipAt.dy, tipAt.dx));
  ctx.fillStyle = ok ? skin.pick : skin.red;
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-3, 3.4);
  ctx.lineTo(-3, -3.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = ok ? skin.pick : skin.red;
  dot(draft.from.x, draft.from.y, 4);
  dot(draft.to.x, draft.to.y, 4);

  // 손잡이. **잡을 것이 있다는 게 보여야 굽힐 생각을 한다.**
  ctx.beginPath();
  ctx.arc(draft.handle.x, draft.handle.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = skin.ground;
  ctx.fill();
  ctx.strokeStyle = ok ? skin.pick : skin.red;
  ctx.lineWidth = 2.4;
  ctx.stroke();
}

function dot(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = skin.pick;
  ctx.fill();
}

// 교차로에 놓인 것. 회전교차로는 섬으로, 신호등은 갈래마다의 등으로 보인다.
function drawControls() {
  for (const node of net.nodes) {
    if (node.control === 'circle') drawIsland(node);
    else if (node.control === 'signal') drawSignal(node);
  }
}

function drawIsland(node) {
  const r = Net.islandRadius(node);
  ctx.beginPath();
  ctx.arc(node.x, node.y, r + 1.4, 0, Math.PI * 2);
  ctx.fillStyle = skin.kerb;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = skin.island;
  ctx.fill();
}

function drawSignal(node) {
  const sig = world.signals.get(node.id);
  const phase = sig ? sig.phase : 0;
  const amber = sig ? sig.amber : false;
  const seen = new Set();
  for (const lane of node.in) {
    if (seen.has(lane.seg)) continue;
    seen.add(lane.seg);
    // 갈래마다 오른쪽 끝 차로 옆에 등을 하나 세운다. 실제로도 등은 오른쪽에 있다.
    const edge = node.in.filter((l) => l.seg === lane.seg)
      .reduce((best, l) => (l.rank < best.rank ? l : best));
    const at = Geom.at(edge.path, Math.max(0, edge.path.total - Net.reach(node) - 2));
    const side = Geom.right({ x: at.dx, y: at.dy });
    const mine = Net.phaseOf(node, edge);
    const lit = mine !== phase ? skin.red : (amber ? skin.amber : skin.green);

    // 정지선은 **그 갈래의 차로들만** 가로지른다. 길 전체를 그으면 마주 오는 차로까지
    // 덮어 어느 쪽이 서는 선인지 알 수 없다.
    const seg = Net.segment(net, lane.seg);
    const group = seg.lanes.filter((l) => l.to === node.id).length;
    const half = Net.LANE_W / 2;
    const span = group * Net.LANE_W - half;
    ctx.beginPath();
    ctx.moveTo(at.x + side.x * half, at.y + side.y * half);
    ctx.lineTo(at.x - side.x * span, at.y - side.y * span);
    ctx.strokeStyle = skin.stop;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 등은 길 밖 갓길에 세운다. 오른쪽 끝 차로에서 길 가장자리까지의 거리에 조금 더.
    const out = seg.width / 2 - Math.abs(edge.offset) + 4;
    ctx.beginPath();
    ctx.arc(at.x + side.x * out, at.y + side.y * out, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = lit;
    ctx.fill();
  }
}

// 관문. 도시 밖으로 이어지는 입구라 길을 가로지르는 턱으로 표시한다.
function drawGates() {
  for (const node of net.nodes) {
    if (node.kind !== 'gate') continue;
    const seg = Net.segment(net, node.segs[0]);
    if (!seg) continue;
    const towardEnd = seg.b === node.id;
    const p = Geom.at(seg.center, towardEnd ? seg.center.total : 0);
    const n = Geom.right({ x: p.dx, y: p.dy });
    const half = seg.width / 2 + 2;
    ctx.beginPath();
    ctx.moveTo(p.x - n.x * half, p.y - n.y * half);
    ctx.lineTo(p.x + n.x * half, p.y + n.y * half);
    ctx.strokeStyle = skin.gate;
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function bodyColor(v) {
  if (v.kind.id === 'taxi') return skin.taxi;
  if (v.kind.id === 'bus') return skin.bus;
  if (v.kind.id === 'truck') return skin.truck;
  if (v.kind.id === 'moto') return skin.moto;
  return skin.body[v.id % skin.body.length];
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawVehicles() {
  for (const v of world.vehicles) {
    const at = Traffic.place(v);
    const len = v.kind.len;
    const wide = v.kind.w;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(Math.atan2(at.dy, at.dx));

    // 자리는 앞머리다. 몸통은 그 뒤로 그린다.
    ctx.fillStyle = bodyColor(v);
    roundRect(-len, -wide / 2, len, wide, v.kind.id === 'moto' ? 1.4 : 2);
    ctx.fill();

    // 앞 유리. 어느 쪽이 앞인지 보이면 차가 도는 모습이 읽힌다.
    if (v.kind.id !== 'moto') {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = skin.ground;
      const cabin = v.kind.id === 'bus' || v.kind.id === 'truck' ? len * 0.2 : len * 0.26;
      roundRect(-cabin - 1, -wide / 2 + 0.9, cabin, wide - 1.8, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = skin.ground;
  ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.dx, view.dy);
  drawRoads();
  drawLaneMarks();
  drawCrossings();
  drawControls();
  drawGates();
  drawPick();
  drawVehicles();
  drawWalkers();
  drawDraft();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  void dpr;
}

// --- 시계 ---

function frame(now) {
  const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
  last = now;
  if (running && dt > 0) Traffic.step(world, dt * rate);
  draw();
  paintStats();
  requestAnimationFrame(frame);
}

function paintStats() {
  const s = Traffic.stats(world);
  el.count.textContent = String(s.total);
  el.speed.textContent = String(Math.round(s.speed));
  el.gone.textContent = String(s.arrived);
  el.money.textContent = String(s.money);
  // 돈은 차가 빠져나갈 때마다 늘어난다. 패널을 열어 둔 채로 값이 찰 수 있으므로
  // 공사 단추의 열고 닫힘만 프레임마다 맞춰 준다.
  if (picked && picked.kind === 'seg') {
    const add = el.panel.querySelector('[data-add]');
    if (add) add.disabled = !canAdd(picked.seg);
  }
  if (draft) {
    const able = Traffic.canBuild(world, spotArg(draft.from), spotArg(draft.to), draft.handle);
    if (able.ok !== draft.able.ok) { draft.able = able; paintPanel(); }
  }
}

// --- 고르기와 패널 ---

// 판 위의 자리를 맵 좌표로 옮긴다. 캔버스는 기기 픽셀로 그리지만 손가락은 CSS
// 픽셀로 온다.
function spotOf(event) {
  const box = el.canvas.getBoundingClientRect();
  const scale = box.width / net.world.w;
  return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
}

function junctionAt(spot) {
  let best = null;
  for (const node of net.nodes) {
    if (!Net.canControl(node)) continue;
    const d = Math.hypot(node.x - spot.x, node.y - spot.y);
    // 손가락이 두꺼우므로 교차로보다 넉넉히 잡는다.
    if (d > Net.reach(node) + 16) continue;
    if (!best || d < best.d) best = { node, d };
  }
  return best && best.node;
}

// 꺾은선 위에서 점에 가장 가까운 자리. **거리만이 아니라 "그 길의 어디쯤"까지**
// 돌려준다 — 새 길은 아무 데서나 뻗어 나가므로 누른 자리를 길 위의 거리로 알아야
// 그 자리에서 길을 가를 수 있다.
function nearestOn(path, spot) {
  let best = { d: Infinity, s: 0 };
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1];
    const b = path.points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((spot.x - a.x) * dx + (spot.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(spot.x - (a.x + dx * t), spot.y - (a.y + dy * t));
    if (d < best.d) best = { d, s: path.cum[i - 1] + Math.sqrt(len2) * t };
  }
  return best;
}

function roadAt(spot) {
  let best = null;
  for (const seg of net.segs) {
    const hit = nearestOn(seg.center, spot);
    if (hit.d > seg.width / 2 + 6) continue;
    if (!best || hit.d < best.d) best = { seg, d: hit.d, s: hit.s };
  }
  return best;
}

// 누른 자리가 무엇인가. 고르는 것도 길을 뻗는 것도 이 하나를 쓴다 — 짚어 주는 자리와
// 길이 붙는 자리가 갈리면 손가락이 짚은 곳과 다른 데서 길이 나간다.
function anchorAt(spot) {
  const hit = roadAt(spot);
  const node = junctionAt(spot);

  // **길의 가운데를 짚었으면 교차로가 아니라 길이다.** 교차로를 손가락 굵기만큼
  // 넉넉히 잡다 보니 **짧은 구간은 통째로 교차로에 먹혀 고를 수가 없었다** — 길을
  // 가르면 그런 토막이 생기고, 처음 판에도 길이 66짜리 구간이 그랬다. 교차로에 닿는
  // 구간은 그 자리의 비율이 0이나 1 언저리이므로, **가운데 절반을 짚은 것은 언제나
  // 길이다.** 반지름을 줄이는 길도 있지만 그러면 폰에서 교차로를 짚기 어려워진다.
  const middle = hit && hit.s > hit.seg.length * 0.25 && hit.s < hit.seg.length * 0.75;
  if (node && !middle) return { kind: 'node', node, x: node.x, y: node.y };
  if (!hit) return node ? { kind: 'node', node, x: node.x, y: node.y } : null;
  const at = Geom.at(hit.seg.center, hit.s);
  return { kind: 'seg', seg: hit.seg, s: hit.s, lane: 0, x: at.x, y: at.y };
}

// traffic에 넘기는 말. 화면은 구간 객체를 들고 있지만 규칙 쪽은 id로 받는다.
function spotArg(a) {
  return a.kind === 'node' ? { node: a.node.id } : { seg: a.seg.id, s: a.s };
}

// --- 손가락 ---

// **click을 쓰지 않는다.** 판은 끌어서 길을 놓는 자리라 `touch-action: none`이고,
// 그 자리에서는 `shared/base.js`가 touchend를 취소해 click이 나지 않는다.
// 고르기는 "거의 움직이지 않은 손가락"으로 가른다.
const DRAG_SLOP = 7;

el.canvas.addEventListener('pointerdown', (event) => {
  const spot = spotOf(event);
  el.canvas.setPointerCapture(event.pointerId);

  // 놓기를 기다리는 길이 있으면 손잡이만 받는다. 그래야 굽히다가 딴 데를 눌러
  // 하던 것이 날아가지 않는다.
  if (draft) {
    const grab = Math.hypot(draft.handle.x - spot.x, draft.handle.y - spot.y);
    drag = grab < 18 ? { kind: 'handle' } : null;
    return;
  }
  drag = { kind: 'line', from: anchorAt(spot), start: spot, cur: spot, moved: false };
});

el.canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const spot = spotOf(event);
  if (drag.kind === 'handle') {
    draft.handle = spot;
    refreshDraft();
    return;
  }
  drag.cur = spot;
  if (Math.hypot(spot.x - drag.start.x, spot.y - drag.start.y) > DRAG_SLOP) drag.moved = true;
  if (drag.moved) drag.to = anchorAt(spot);
});

el.canvas.addEventListener('pointerup', () => {
  const it = drag;
  drag = null;
  if (!it) return;
  if (it.kind === 'handle') { Sound.play('place'); return; }

  // 거의 움직이지 않았으면 고르기다.
  if (!it.moved) {
    picked = it.from;
    Sound.play(picked ? 'pick' : 'clear');
    paintPanel();
    return;
  }
  if (!it.from || !it.to) { Sound.play('clear'); return; }
  startDraft(it.from, it.to);
});

el.canvas.addEventListener('pointercancel', () => { drag = null; });

// --- 새 길 ---

function startDraft(from, to) {
  const handle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const able = Traffic.canBuild(world, spotArg(from), spotArg(to), handle);
  // 같은 길의 두 자리나 같은 점끼리는 굽혀도 놓을 수 없다. 값을 보여 줄 것도 없다.
  if (!able.ok && (able.why === 'same' || able.why === 'spot' || able.why === 'gate')) {
    Sound.play('clear');
    return;
  }
  picked = null;
  draft = { from, to, handle };
  refreshDraft();
  Sound.play('pick');
}

// 손잡이를 옮길 때마다 곡선과 값을 다시 잰다. **그리는 쪽과 값을 매기는 쪽이 같은
// 곡선을 본다** — `Net.draftPath`가 그 하나다.
function refreshDraft() {
  draft.able = Traffic.canBuild(world, spotArg(draft.from), spotArg(draft.to), draft.handle);
  draft.path = Net.draftPath(net, spotArg(draft.from), spotArg(draft.to), draft.handle);
  paintPanel();
}

// --- 패널 ---

function chip(attr, value, label, on, extra) {
  return `<button class="chip${extra || ''}" type="button" ${attr}="${value}"`
    + ` aria-pressed="${on}">${label}</button>`;
}

function junctionPanel(node) {
  const rows = [];
  rows.push(`<p class="panel-title">${t('road.junction')}</p>`);
  rows.push('<div class="chips">'
    + Net.CONTROLS.map((mode) => chip('data-control', mode, t(CONTROL_KEY[mode]), node.control === mode)).join('')
    + '</div>');

  if (node.control === 'signal') {
    rows.push('<div class="chips">'
      + chip('data-plan', 'paired', t('road.phase2'), node.plan === 'paired')
      + chip('data-plan', 'split', t('road.phaseN', { n: node.segs.length }), node.plan === 'split')
      + '</div>');
  }

  rows.push(`<div class="chips">${chip('data-cross', 'toggle', t('road.crosswalk'), node.crossing)}</div>`);
  return rows.join('');
}

function roadPanel(seg, index) {
  const lane = seg.lanes[index] || seg.lanes[0];
  const rows = [];
  rows.push(`<p class="panel-title">${t('road.lanesOf', { n: seg.lanes.length })}</p>`);

  // 차로 고르기. 길 위에 놓인 순서 그대로 늘어놓고, 거슬러 가는 차로는 화살표를
  // 뒤집어 어느 쪽으로 가는 차로인지 보이게 한다.
  rows.push('<div class="chips lanes">' + seg.lanes.map((l, i) => {
    const arrows = l.allow.map((m) => `<span data-road-icon="${m}"></span>`).join('');
    const flip = l.dir > 0 ? '' : ' flip';
    return `<button class="chip lane${flip}" type="button" data-lane="${i}"`
      + ` aria-pressed="${l === lane}"><span class="lane-arrows">${arrows}</span></button>`;
  }).join('') + '</div>');

  rows.push('<div class="chips">' + Net.MOVES.map((move) => chip(
    'data-move', move, `<span data-road-icon="${move}"></span>`,
    lane.allow.indexOf(move) >= 0, ' icon',
  )).join('') + '</div>');

  // 방향 바꾸기는 선만 다시 긋는 일이라 값이 없고, 차로를 늘리는 것은 공사라 값이 있다.
  const cost = Traffic.laneCost(seg);
  rows.push('<div class="chips">'
    + `<button class="chip" type="button" data-flip="1">${t('road.flip')}</button>`
    + `<button class="chip" type="button" data-add="1"${canAdd(seg) ? '' : ' disabled'}>`
    + `${t('road.addLane')}<b class="cost">${cost}</b></button>`
    + '</div>');

  // **왜 못 늘리는지 적는다.** 흐려진 단추만으로는 차로가 다 찬 것인지 돈이 모자란
  // 것인지 알 수 없어, 고장 난 것처럼 보인다.
  if (!canAdd(seg)) {
    const why = seg.lanes.length >= Net.MAX_LANES ? 'road.laneFull' : 'road.tooDear';
    rows.push(`<p class="panel-note dim">${t(why)}</p>`);
  }
  return rows.join('');
}

function canAdd(seg) {
  return seg.lanes.length < Net.MAX_LANES && world.money >= Traffic.laneCost(seg);
}

// 놓기를 기다리는 길. **값을 보여 주고 확정할지 물어본다** — 돈이 드는 일이라
// 손가락을 떼는 순간 지어 버리면 잘못 그은 선을 되돌릴 길이 없다.
function draftPanel() {
  const able = draft.able;
  const rows = [`<p class="panel-title">${t('road.newRoad')}</p>`];
  const why = able.ok ? 'road.draftHint'
    : (able.why === 'short' ? 'road.tooShort' : 'road.tooDear');
  rows.push(`<p class="panel-note">${t(why)}</p>`);
  rows.push('<div class="chips">'
    + `<button class="chip go" type="button" data-build="1"${able.ok ? '' : ' disabled'}>`
    + `${t('road.build')}<b class="cost">${able.cost}</b></button>`
    + `<button class="chip" type="button" data-cancel="1">${t('road.cancel')}</button>`
    + '</div>');
  return rows.join('');
}

function paintPanel() {
  if (!draft && !picked) {
    el.panel.hidden = true;
    return;
  }
  el.panel.hidden = false;
  if (draft) el.panelBody.innerHTML = draftPanel();
  else {
    el.panelBody.innerHTML = picked.kind === 'node'
      ? junctionPanel(picked.node)
      : roadPanel(picked.seg, picked.lane);
  }
  window.RoadIcons.paint(el.panelBody);
}

const CONTROL_KEY = { none: 'road.ctrlNone', signal: 'road.ctrlSignal', circle: 'road.ctrlCircle' };

el.panel.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const d = button.dataset;

  if (draft) {
    if (d.build) {
      const made = Traffic.buildRoad(world, spotArg(draft.from), spotArg(draft.to), draft.handle);
      // 굽히다 보면 양 끝이 같은 점으로 접히는 자리가 있다. 그때는 아무것도 짓지
      // 않고 그리던 것을 남겨 둔다 — 여기서 지우면 다시 그어야 한다.
      if (!made.ok) { Sound.play('clear'); return; }
      draft = null;
      buildDeco();
      // 놓자마자 그 길을 고른 상태로 둔다. 1차로라 차로부터 늘리게 되는 일이 많다.
      picked = { kind: 'seg', seg: made.seg, lane: 0 };
    } else if (d.cancel || d.close != null) {
      draft = null;
    } else return;
    Sound.play(d.build ? 'place' : 'clear');
    paintPanel();
    return;
  }

  if (!picked) return;

  if (d.control) Net.setControl(net, picked.node.id, d.control);
  else if (d.plan) Net.setPlan(net, picked.node.id, d.plan);
  else if (d.cross) Net.setCrossing(net, picked.node.id, !picked.node.crossing);
  else if (d.lane) picked.lane = Number(d.lane);
  else if (d.flip) {
    Traffic.flipLane(world, picked.seg, picked.lane);
    buildDeco();
    picked.lane = Math.min(picked.lane, picked.seg.lanes.length - 1);
  } else if (d.add) {
    const dir = picked.seg.lanes[picked.lane].dir;
    if (!Traffic.buyLane(world, picked.seg, dir).ok) return;
    buildDeco();
  }
  else if (d.move) {
    const lane = picked.seg.lanes[picked.lane];
    const next = lane.allow.indexOf(d.move) >= 0
      ? lane.allow.filter((m) => m !== d.move)
      : lane.allow.concat([d.move]);
    Net.setAllow(lane, next);
  } else if (d.close != null) {
    picked = null;
  }


  Sound.play('place');
  paintPanel();
});

// --- 배선 ---

el.play.addEventListener('click', () => {
  running = !running;
  el.play.setAttribute('aria-pressed', String(running));
  el.play.querySelector('.play-label').textContent = t(running ? 'road.pause' : 'road.play');
  Sound.play('click');
});

el.rates.addEventListener('click', (event) => {
  const button = event.target.closest('[data-rate]');
  if (!button) return;
  rate = Number(button.dataset.rate);
  for (const other of el.rates.querySelectorAll('[data-rate]')) {
    other.setAttribute('aria-pressed', String(Number(other.dataset.rate) === rate));
  }
  Sound.play('click');
});

el.fresh.addEventListener('click', () => {
  Sound.play('click');
  fresh();
});

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

function bindSoundToggle(node, key, apply) {
  node.setAttribute('aria-pressed', String(Sound.prefs[key]));
  node.addEventListener('click', () => {
    const on = !Sound.prefs[key];
    node.setAttribute('aria-pressed', String(on));
    apply(on);
    Sound.play('click');
  });
}

bindSoundToggle(el.toggleBgm, 'bgm', (on) => Sound.setBgm(on));
bindSoundToggle(el.toggleSfx, 'sfx', (on) => Sound.setSfx(on));

window.addEventListener('resize', layout);
if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readSkin);

// 화면 밖에서 판을 들여다볼 수 있게 한 줄 열어 둔다. 헤드리스 브라우저로 눌러 보고
// 재 보는 데 쓴다.
// 브라우저에서 확인할 때 판 안을 들여다보는 통로. node 테스트가 닿지 않는 것은
// 손가락 조작뿐이라, 헤드리스 브라우저에서 이것으로 상태를 읽는다.
window.__draft = () => draft;
window.__picked = () => picked;
window.__net = null;

readSkin();
fresh();
requestAnimationFrame(frame);

})();

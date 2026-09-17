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

// --- 판 만들기 ---

function fresh(nextSeed) {
  seed = nextSeed == null ? Math.floor(Math.random() * 1e9) : nextSeed;
  net = Gen.city({ seed });
  world = Traffic.create(net, { spawnRate: 1.7 });
  picked = null;
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
  for (const node of net.nodes) {
    if (node.kind === 'gate') continue;
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

  // 차선과 중앙선. 교차로 안에서는 끊어야 하므로 양 끝을 조금 잘라 그린다.
  for (const seg of net.segs) {
    const item = deco.get(seg.id);
    const trim = seg.width / 2 + 3;
    for (const path of item.dashes) {
      strokeTrimmed(path, trim, { color: skin.dash, width: 0.9, dash: [7, 9], alpha: 0.75 });
    }
    for (const path of item.middles) {
      strokeTrimmed(path, trim, { color: skin.middle, width: 1.4, alpha: 0.9 });
    }
  }
}

// 양 끝을 잘라 그린다. 교차로 원 안까지 차선을 그으면 교차로가 격자무늬가 된다.
function strokeTrimmed(path, trim, style) {
  const from = Math.min(trim, path.total / 2 - 1);
  const to = path.total - from;
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

// 꺾은선 위에서 점에 가장 가까운 거리. 길을 눌렀는지 보려면 이것이 필요하다.
function distToPath(path, spot) {
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

function roadAt(spot) {
  let best = null;
  for (const seg of net.segs) {
    const d = distToPath(seg.center, spot);
    if (d > seg.width / 2 + 6) continue;
    if (!best || d < best.d) best = { seg, d };
  }
  return best && best.seg;
}

function pickAt(event) {
  const spot = spotOf(event);
  const node = junctionAt(spot);
  if (node) return { kind: 'node', node };
  const seg = roadAt(spot);
  if (seg) return { kind: 'seg', seg, lane: 0 };
  return null;
}

el.canvas.addEventListener('click', (event) => {
  const hit = pickAt(event);
  picked = hit;
  Sound.play(hit ? 'pick' : 'clear');
  paintPanel();
});

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
  return rows.join('');
}

function paintPanel() {
  if (!picked) {
    el.panel.hidden = true;
    return;
  }
  el.panel.hidden = false;
  el.panelBody.innerHTML = picked.kind === 'node'
    ? junctionPanel(picked.node)
    : roadPanel(picked.seg, picked.lane);
  window.RoadIcons.paint(el.panelBody);
}

const CONTROL_KEY = { none: 'road.ctrlNone', signal: 'road.ctrlSignal', circle: 'road.ctrlCircle' };

el.panel.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || !picked) return;
  const d = button.dataset;

  if (d.control) Net.setControl(net, picked.node.id, d.control);
  else if (d.plan) Net.setPlan(net, picked.node.id, d.plan);
  else if (d.cross) Net.setCrossing(net, picked.node.id, !picked.node.crossing);
  else if (d.lane) picked.lane = Number(d.lane);
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
window.__net = null;

readSkin();
fresh();
requestAnimationFrame(frame);

})();

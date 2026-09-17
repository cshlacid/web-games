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
};

const ctx = el.canvas.getContext('2d');

// 화면 색. 어두운 테마에서 갈리는 값만 둘로 둔다.
const SKIN = {
  light: {
    ground: '#e9ecef', asphalt: '#7d8794', kerb: '#69737f',
    dash: '#e8ecf1', middle: '#e7c94f', gate: '#59636f',
    body: ['#d05b4e', '#4a7fc1', '#e4e7ea', '#59636f', '#5aa06a', '#b8722e'],
    taxi: '#eeb92a', bus: '#3f8f86', truck: '#cfd4da', moto: '#3c4650',
  },
  dark: {
    ground: '#171a1e', asphalt: '#3b434c', kerb: '#2a3138',
    dash: '#7c8794', middle: '#a98f31', gate: '#8b96a2',
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

// --- 판 만들기 ---

function fresh(nextSeed) {
  seed = nextSeed == null ? Math.floor(Math.random() * 1e9) : nextSeed;
  net = Gen.city({ seed });
  world = Traffic.create(net, { spawnRate: 4.5 });
  buildDeco();
  layout();
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

  // 교차로. 맞닿은 길 중 가장 넓은 것에 맞춰 원으로 덮는다.
  for (const node of net.nodes) {
    if (node.kind === 'gate') continue;
    let radius = 0;
    for (const id of node.segs) radius = Math.max(radius, Net.segment(net, id).width / 2);
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
  drawGates();
  drawVehicles();
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

readSkin();
fresh();
requestAnimationFrame(frame);

})();

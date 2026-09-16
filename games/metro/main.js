'use strict';

// 화면과 조작. 규칙과 계산은 citygen.js·route.js·lines.js에 있고 여기서는 그리기만 한다.
(function () {

const City = window.MetroCity;
const Route = window.MetroRoute;
const Lines = window.MetroLines;
const Demand = window.MetroDemand;
const Geom = window.MetroGeom;
const Sound = window.MetroSound;
const NS = 'http://www.w3.org/2000/svg';
const VIEW = City.VIEW;

const MAX_MIDS = 3;
const LEVEL_KEY = 'web-games.metro.level';
const LINE_COLORS = 5;

// 돈. 수요가 아직 없어서 수입은 "자란 건물 수 × 얼마"로 대신한다.
const START_BUDGET = 480;
const STATION_COST = 14;
const REFUND = 0.5;
const GROW_RADIUS = 520;
// 실제 1초에 게임이 몇 초 가는가. **보통을 20으로 둔 것은 가감속과 정차를 눈으로
// 보기 위해서다** — 60배로는 역에 서는 25초가 0.4초라 아예 안 보인다.
const SPEEDS = [0, 20, 60];
const GROW_WORK = 7000;   // 이만큼 실어 나르면 한 채가 자란다
const GROW_FLASH = 3;     // 자란 자리를 짚어 두는 시간(실제 초)

const GRAB_PX = 22;
const HIT_PX = 26;
const SNAP_PX = 15;
const TAP_PX = 7;
const DOUBLE_MS = 320;

const ART = {
  station: 62, stationRing: 18,
  draft: 34, built: 40, slowHalo: 24,
  handle: 46, handleRing: 14,
  label: 78, train: 30,
};

const GROUND = ['road', 'empty', 'building', 'hill', 'water'];

const el = {};
for (const id of ['map', 'status', 'readout', 'actions', 'budget', 'clock', 'pause', 'newCity',
  'levels', 'modes', 'tools', 'flow', 'vCaught', 'vWaiting', 'vIncome',
  'linepanel', 'lineList', 'dropLine', 'patternList', 'stops', 'trainCount', 'trainMinus',
  'trainPlus', 'plan', 'crowd', 'addPattern', 'undo', 'cancel', 'remove', 'confirm',
  'help', 'helpOpen', 'helpClose', 'toggleBgm', 'toggleSfx']) {
  el[id] = document.getElementById(id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
}
const layer = {};
for (const name of ['water', 'hills', 'roads', 'buildings', 'grown', 'demand', 'lines',
  'trains', 'draft', 'stations', 'handles']) {
  layer[name] = document.getElementById(`layer-${name}`);
}
const value = {
  cost: document.getElementById('v-cost'),
  time: document.getElementById('v-time'),
  length: document.getElementById('v-length'),
  speed: document.getElementById('v-speed'),
};
const mix = {};
const lenOut = {};
for (const kind of GROUND) {
  mix[kind] = document.getElementById(`mix-${kind}`);
  lenOut[kind] = document.getElementById(`len-${kind}`);
}

let city = null;
let seed = Math.floor(Math.random() * 9999) + 1;
let level = 1;
try {
  const saved = Number(localStorage.getItem(LEVEL_KEY));
  if (Number.isInteger(saved) && saved >= 0 && saved < City.LEVELS.length) level = saved;
} catch { /* 저장된 값이 없거나 접근 불가: 기본값 */ }

const cam = { x: 0, y: 0 };
let mode = 'run';        // run | build | lines
let budget = START_BUDGET;
let lines = [];
let grown = [];          // { id, at } — 방금 자란 자리
let drag = null;
let lastTap = { index: -1, at: 0 };
let history = [];

let pending = null;      // 기본 모드: { kind:'new'|'extend', line, from }
let draft = null;        // 경로 편집 중
let ghost = null;        // 건설 모드의 임시 역
let marked = null;       // 건설 모드에서 고른 기존 역
let sel = { line: 0, pattern: 0 };

// 시뮬레이션
let clock = 6 * 3600;    // 게임 초. 아침 여섯 시에 시작한다
let speed = 1;   // SPEEDS의 자리
let demands = [];
let services = [];       // 수요가 보는 운행 목록
let runs = [];           // 화면이 보는 열차 목록 { line, table, trains, headway }
let growWork = 0;
let nextSpawn = 0;
let income = 0;          // 억/게임분
let simRng = City.mulberry32(1);
let frameAt = 0;

const t = (key) => SharedI18n.t(key);
const fill = (key, n) => t(key).replace('{n}', n);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r1 = (v) => Math.round(v * 10) / 10;

// --- 도시 ---

function makeCity(nextSeed, nextLevel) {
  seed = nextSeed;
  level = nextLevel;
  try { localStorage.setItem(LEVEL_KEY, String(level)); } catch { /* 무시 */ }
  city = City.create(seed, level);
  Lines.reset();
  budget = START_BUDGET;
  lines = [];
  grown = [];
  pending = null;
  draft = null;
  ghost = null;
  marked = null;
  history = [];
  drag = null;
  mode = 'run';
  sel = { line: 0, pattern: 0 };
  clock = 6 * 3600;
  demands = [];
  growWork = 0;
  nextSpawn = 0;
  income = 0;
  simRng = City.mulberry32(seed * 7919 + 13);
  syncNetwork();
  setCam(city.core.x - VIEW.w / 2, city.core.y - VIEW.h / 2);
  drawCity();
  renderGrown();
  refresh();
}

function svg(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function polyD(pts) {
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += `L${r1(pts[i].x)} ${r1(pts[i].y)}`;
  return d;
}

const ground = (x, y) => City.classify(city, x, y);

// 도시는 씨앗이 바뀔 때만 그린다. 그리고 **조각 하나에 요소 하나씩 두지 않는다** —
// 건물이 천 채가 넘는데 팬 한 번마다 그 전부를 다시 칠해야 한다.
function drawCity() {
  clear(layer.water);
  clear(layer.hills);
  clear(layer.roads);

  for (const body of city.water) {
    layer.water.appendChild(svg('path', {
      d: polyD(body.pts), fill: 'none', stroke: 'var(--water)', 'stroke-width': body.w,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  }

  // 산은 불투명한 원을 겹쳐 합집합처럼 보이게 한다. 반투명으로 두면 겹친 자리만
  // 진해져 원 여러 개인 것이 그대로 드러난다.
  for (const pass of [{ r: 1, color: 'var(--hill)' }, { r: 0.58, color: 'var(--hill-2)' }]) {
    const group = svg('g', { fill: pass.color });
    for (const hill of city.hills) {
      group.appendChild(svg('circle', { cx: hill.x, cy: hill.y, r: hill.r * pass.r }));
    }
    layer.hills.appendChild(group);
  }

  const byWidth = new Map();
  for (const road of city.roads) {
    if (!byWidth.has(road.w)) byWidth.set(road.w, []);
    byWidth.get(road.w).push(road);
  }
  const widths = [...byWidth.keys()].sort((a, b) => b - a);

  // 길은 두 번 긋는다 — 넓고 어두운 것 위에 좁고 밝은 것. 한 번만 그으면 이웃한
  // 길끼리 경계가 없어 블록이 아니라 한 덩어리로 보인다. 골목은 큰길보다 어둡게
  // 칠한다 — 구시가지는 화면의 절반 가까이가 길이라 전부 흰색이면 흰 잡음이 된다.
  for (const pass of [{ edge: true }, { edge: false }]) {
    for (const w of widths) {
      const alley = w <= City.ROAD_W.alley;
      layer.roads.appendChild(svg('path', {
        d: byWidth.get(w).map((r) => polyD(r.pts)).join(''),
        fill: 'none',
        stroke: pass.edge ? 'var(--road-edge)' : (alley ? 'var(--alley)' : 'var(--road)'),
        'stroke-width': w + (pass.edge ? (alley ? 4 : 6) : 0),
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }));
    }
  }

  drawBuildings();
}

// 건물은 자랄 때마다 다시 그리므로 따로 뗐다. **색은 종류가 아니라 층수가 정한다** —
// 지금 화면에서 읽어야 하는 것은 "이 동네가 얼마나 찼는가"다.
function drawBuildings() {
  clear(layer.buildings);
  const byLevel = new Map();
  for (const b of city.buildings) {
    if (b.level < 1) continue;
    if (!byLevel.has(b.level)) byLevel.set(b.level, []);
    byLevel.get(b.level).push(b);
  }
  for (const [lv, list] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    layer.buildings.appendChild(svg('path', {
      d: list.map((b) => `M${r1(b.x)} ${r1(b.y)}h${r1(b.w)}v${r1(b.h)}h${r1(-b.w)}z`).join(''),
      fill: `var(--lv${Math.min(lv, 4)})`,
    }));
  }
}

// --- 카메라 ---

function setCam(x, y) {
  cam.x = clamp(x, 0, city.world.w - VIEW.w);
  cam.y = clamp(y, 0, city.world.h - VIEW.h);
  el.map.setAttribute('viewBox', `${r1(cam.x)} ${r1(cam.y)} ${VIEW.w} ${VIEW.h}`);
}

function centerOn(x, y) { setCam(x - VIEW.w / 2, y - VIEW.h / 2); }

function inView(p, margin = 0) {
  return p.x > cam.x + margin && p.x < cam.x + VIEW.w - margin
    && p.y > cam.y + margin && p.y < cam.y + VIEW.h - margin;
}

// --- 노선 ---

const lineColor = (line) => `var(--line${(line.color % LINE_COLORS) + 1})`;
const lineName = (line) => fill('metro.lineName', lines.indexOf(line) + 1);

function endpointsOf(station) {
  const out = [];
  for (const line of lines) {
    if (line.loop) continue;
    const last = line.stations[line.stations.length - 1];
    if (last === station || line.stations[0] === station) out.push(line);
  }
  return out;
}

// 연장은 늘 **끝에 붙인다.** 첫 역을 골랐으면 역 순서를 뒤집어 그 역을 끝으로
// 만든다 — 양쪽으로 자라는 노선을 자료로 따로 다루면 정차 계획과 방향이 두 배로
// 복잡해지는데, 뒤집기 한 번이면 같은 길로 돌아온다.
function orientForExtend(line, station) {
  if (line.stations[line.stations.length - 1] === station) return;
  line.stations.reverse();
  line.mids.reverse();
  for (const seg of line.mids) seg.reverse();
  for (const p of line.patterns) p.stops.reverse();
}

function rebuildLine(line) { return Lines.rebuild(line, ground); }

function connectedStations() {
  const set = new Set();
  for (const line of lines) for (const s of line.stations) set.add(s);
  return [...set];
}

// --- 망과 수요 ---

// 노선이나 열차가 바뀔 때마다 **운행 목록을 다시 만든다.** 수요가 보는 것은 노선이
// 아니라 운행(노선 × 패턴)이고, 화면이 보는 것도 그것이다. 매 프레임 다시 만들면
// 시간표를 다시 푸는 꼴이라 바뀔 때만 만든다.
function syncNetwork() {
  services = [];
  runs = [];
  for (const line of lines) {
    if (!line.path) continue;
    for (const pattern of line.patterns) {
      const table = Lines.timetable(line, pattern);
      if (!table) continue;
      const plan = Lines.plan(line, pattern);
      if (pattern.trains > 0) {
        runs.push({ line, table, trains: pattern.trains, headway: plan.headway });
        services.push({
          line, pattern,
          stations: line.stations,
          stopAt: pattern.stops,
          headway: plan.headway,
          // 분당 수송력. 열차 한 대가 배차간격마다 한 번씩 지나가므로 대수는 여기
          // 배차간격 안에 이미 들어 있다.
          capacity: Demand.TRAIN_CAPACITY * 60 / plan.headway,
          ride: (i, j) => Lines.rideTime(table, i, j),
        });
      }
    }
  }
  evaluateDemands();
}

function evaluateDemands() {
  // **한 수요씩 따로 풀 수 없다.** 수송량 한도 때문에 한 운행에 누가 얼마나 탔는지가
  // 다른 수요의 이용률을 바꾼다. 그래서 전부 한꺼번에 배정한다.
  Demand.assign(demands, services);
  income = 0;
  for (const od of demands) income += Demand.income(od, 1, city.fare);
  renderDemands();
}

function waitingCount() { return demands.filter((od) => !od.served).length; }

function tick(dt) {
  clock += dt;
  const minutes = dt / 60;

  nextSpawn -= dt;
  if (nextSpawn <= 0) {
    nextSpawn = Demand.SPAWN_EVERY;
    if (waitingCount() < Demand.MAX_WAITING && demands.length < Demand.MAX_TOTAL) {
      const od = Demand.spawn(city, simRng, city.stations);
      if (od) {
        od.born = clock;
        demands.push(od);
        evaluateDemands();
      }
    }
  }

  // 못 잡은 수요는 기다리다 사라진다. 잡은 수요는 남아 이용객이 된다.
  const before = demands.length;
  demands = demands.filter((od) => od.served || clock - od.born < Demand.PATIENCE);
  if (demands.length !== before) evaluateDemands();

  // 실어 나른 만큼 도시가 자란다. **수요를 처리한 자리가 자란다**는 규칙이 이제
  // 대리물이 아니라 진짜다 — 실제로 탄 사람 수가 그대로 성장의 재료다.
  let work = 0;
  const centers = [];
  for (const od of demands) {
    if (!od.usage || !od.via) continue;
    budget += Demand.income(od, minutes, city.fare);
    work += od.people * od.usage * minutes;
    for (const s of od.via.stations) centers.push(s);
  }
  growWork += work;
  while (growWork >= GROW_WORK && centers.length) {
    growWork -= GROW_WORK;
    const ids = City.grow(city, centers, GROW_RADIUS, 1);
    if (!ids.length) { growWork = 0; break; }
    for (const id of ids) grown.push({ id, at: frameAt });
    drawBuildings();
  }
}

function running() {
  return SPEEDS[speed] > 0 && !draft && !ghost && !marked && lines.length > 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = frameAt ? Math.min(0.12, (now - frameAt) / 1000) : 0;
  frameAt = now;

  const fade = grown.length && grown.some((g) => now - g.at > GROW_FLASH * 1000);
  if (fade) { grown = grown.filter((g) => now - g.at <= GROW_FLASH * 1000); renderGrown(); }

  if (!running() || dt <= 0) return;
  tick(dt * SPEEDS[speed]);
  renderTrains();
  renderMeters();
}

// --- 경로 편집 ---

function startDraft(kind, line, from, to) {
  draft = { kind, line, from, to, mids: [] };
  pending = null;
  history = [];
  centerOn((from.x + to.x) / 2, (from.y + to.y) / 2);
  recompute();
  Sound.play('select');
  refresh();
}

function recompute() {
  if (!draft) return;
  const pts = [
    { x: draft.from.x, y: draft.from.y, stop: true },
    ...draft.mids,
    { x: draft.to.x, y: draft.to.y, stop: true },
  ];
  draft.path = Route.build(pts);
  draft.prof = draft.path.ok ? Route.profile(draft.path) : null;
  draft.cost = draft.path.ok ? Route.cost(draft.path, ground) : null;
  draft.why = draft.path.ok ? null : draft.path.reason;

  // 이음매는 새 구간만으로는 알 수 없다. **기존 노선까지 붙여 통째로 지어 봐야**
  // 마지막 역에서의 꺾임이 허용 범위 안인지 나온다.
  if (draft.path.ok && draft.kind === 'extend') {
    const trial = Lines.withExtension(draft.line, draft.to, draft.mids);
    const built = Lines.rebuild(trial);
    if (!built.ok) { draft.why = built.reason; draft.trialFail = true; }
    else draft.trialFail = false;
  }
}

function draftOk() { return draft && draft.path.ok && !draft.trialFail; }

function pushHistory() {
  if (!draft) return;
  history.push(JSON.stringify(draft.mids));
  if (history.length > 40) history.shift();
}

// --- 그리기 ---

function refresh() {
  renderLines();
  renderTrains();
  renderDemands();
  renderDraft();
  renderStations();
  renderModes();
  renderLevels();
  renderTools();
  renderPanel();
  renderLinePanel();
  renderMeters();
  renderStatus();
}

function renderLines() {
  clear(layer.lines);
  for (const line of lines) {
    if (!line.path) continue;
    const chosen = mode === 'lines' && lines[sel.line] === line;
    layer.lines.appendChild(svg('path', {
      d: Route.svgPath(line.path.pts), fill: 'none', stroke: lineColor(line),
      'stroke-width': chosen ? ART.built * 1.35 : ART.built,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      opacity: mode === 'lines' && !chosen ? 0.45 : 1,
    }));
  }
}

// 열차는 시간표를 따라 돈다. 한 운행의 열차들은 주기를 배차간격만큼씩 나눠 가지므로,
// 시각에 그 간격을 더해 넣으면 저절로 고르게 퍼진다.
function renderTrains() {
  clear(layer.trains);
  for (const run of runs) {
    const group = svg('g', { stroke: lineColor(run.line), 'stroke-width': 10 });
    for (let k = 0; k < run.trains; k++) {
      const at = Lines.at(run.line, run.table, clock + k * run.headway);
      group.appendChild(svg('circle', {
        cx: r1(at.x), cy: r1(at.y), r: ART.train,
        // 서 있는 열차는 속을 채운다. 이것이 없으면 정차 시간도 가감속도 숫자로만
        // 남고, 화면에서는 그냥 점이 미끄러지는 것으로 보인다.
        fill: at.halted ? lineColor(run.line) : 'var(--station-fill)',
      }));
    }
    layer.trains.appendChild(group);
  }
}

// 못 잡은 수요만 그린다. 잡은 것까지 그리면 화면이 금세 실타래가 되고, 정작
// 읽어야 하는 것은 **아직 못 잡은 돈**이다.
//
// 호의 길이가 곧 요금이라(요금은 직선거리 비례) 긴 호가 값진 수요다. 두께는 인원.
// 양 끝은 따로 그린다 — 그쪽이 역에 닿았는지를 끝마다 달리 표시하면 "이 수요는
// 저쪽만 이으면 딴다"가 그림에 적힌다.
function renderDemands() {
  clear(layer.demand);
  if (mode === 'lines') return;
  for (const od of demands) {
    if (od.served) continue;
    const dx = od.b.x - od.a.x;
    const dy = od.b.y - od.a.y;
    const cx = (od.a.x + od.b.x) / 2 - dy * 0.13;
    const cy = (od.a.y + od.b.y) / 2 + dx * 0.13;
    const width = 9 + od.people / 16;
    layer.demand.appendChild(svg('path', {
      d: `M${r1(od.a.x)} ${r1(od.a.y)}Q${r1(cx)} ${r1(cy)} ${r1(od.b.x)} ${r1(od.b.y)}`,
      fill: 'none', stroke: 'var(--demand)', 'stroke-width': width,
      'stroke-linecap': 'round', 'stroke-dasharray': `${width * 2.2} ${width * 2}`,
      opacity: 0.45 + od.usage * 0.45,
    }));
    for (const end of [od.a, od.b]) {
      // 2는 걸어갈 수 있는 거리, 1은 버스로 닿는 거리, 0은 멀다.
      const near = Demand.reach(end, city.stations);
      layer.demand.appendChild(svg('circle', {
        cx: r1(end.x), cy: r1(end.y), r: 34,
        fill: near === 2 ? 'var(--demand)' : 'var(--ground)',
        stroke: 'var(--demand)', 'stroke-width': near === 0 ? 8 : 12,
        'stroke-dasharray': near === 1 ? '22 16' : '',
      }));
    }
  }
}

function slowRuns(path) {
  const runs = [];
  let run = null;
  const full = Route.LIMITS.V_MAX * 0.98;
  for (let i = 0; i < path.nodeLim.length; i++) {
    if (path.nodeLim[i] < full) {
      if (run) { run.to = i; run.lim = Math.min(run.lim, path.nodeLim[i]); }
      else { run = { from: i, to: i, lim: path.nodeLim[i] }; runs.push(run); }
    } else run = null;
  }
  return runs.filter((r) => r.to > r.from);
}

function renderDraft() {
  clear(layer.draft);
  clear(layer.handles);

  if (ghost) {
    layer.draft.appendChild(svg('circle', {
      cx: ghost.x, cy: ghost.y, r: ART.station * 1.9, fill: 'none',
      stroke: ghost.why ? 'var(--under)' : 'var(--metro)', 'stroke-width': 10,
      'stroke-dasharray': '40 30', opacity: 0.8,
    }));
    layer.draft.appendChild(svg('circle', {
      cx: ghost.x, cy: ghost.y, r: ART.station, fill: 'var(--station-fill)',
      stroke: ghost.why ? 'var(--under)' : 'var(--metro)', 'stroke-width': ART.stationRing,
    }));
    return;
  }

  if (!draft) return;
  const pts = [draft.from, ...draft.mids, draft.to];

  if (!draftOk()) {
    // 지을 수 없는 경로는 찍은 점을 그대로 잇는 점선으로 보여 준다. 다듬어진 선이
    // 아예 없으므로 그릴 것이 이것뿐이고, 어느 자리가 문제인지도 함께 짚는다.
    layer.draft.appendChild(svg('path', {
      d: Route.svgPath(pts), fill: 'none', stroke: 'var(--under)',
      'stroke-width': ART.draft, 'stroke-dasharray': `${ART.draft} ${ART.draft * 1.2}`,
      'stroke-linecap': 'round', opacity: 0.8,
    }));
    const bad = draft.trialFail ? draft.from
      : (draft.path.at != null ? pts[draft.path.at] : null);
    if (bad) {
      layer.draft.appendChild(svg('circle', {
        cx: bad.x, cy: bad.y, r: ART.handle * 2.2, fill: 'none',
        stroke: 'var(--under)', 'stroke-width': ART.handleRing * 1.6,
      }));
    }
    renderHandles();
    return;
  }

  const runs = slowRuns(draft.path);
  for (const run of runs) {
    layer.draft.appendChild(svg('path', {
      d: Route.svgPath(draft.path.pts, run.from, run.to), fill: 'none',
      stroke: 'var(--slow)', 'stroke-width': ART.draft + ART.slowHalo,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  }
  layer.draft.appendChild(svg('path', {
    d: Route.svgPath(draft.path.pts), fill: 'none', stroke: 'var(--metro)',
    'stroke-width': ART.draft, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));

  // 비싼 땅은 본선 위에 그 땅의 색으로 덮는다. 돈이 새는 자리라 먼저 보여야 한다.
  const byKind = new Map();
  for (const run of draft.cost.runs) {
    if (!byKind.has(run.kind)) byKind.set(run.kind, []);
    byKind.get(run.kind).push(run);
  }
  for (const [kind, list] of byKind) {
    layer.draft.appendChild(svg('path', {
      d: list.map((run) => Route.svgPath(draft.path.pts, run.from, run.to)).join(''),
      fill: 'none', stroke: `var(--cut-${kind})`, 'stroke-width': ART.draft, 'stroke-linecap': 'butt',
    }));
  }

  for (const run of runs) {
    const at = draft.path.pts[Math.floor((run.from + run.to) / 2)];
    const label = svg('text', {
      x: at.x, y: at.y - ART.draft, fill: 'var(--slow)', 'font-size': ART.label,
      'font-weight': 800, 'text-anchor': 'middle', 'paint-order': 'stroke',
      stroke: 'var(--ground)', 'stroke-width': 14, 'stroke-linejoin': 'round',
    });
    label.textContent = `${Math.round(run.lim * 3.6)}km/h`;
    layer.draft.appendChild(label);
  }
  renderHandles();
}

function renderHandles() {
  if (!draft) return;
  for (const m of draft.mids) {
    if (m.snapped) {
      layer.handles.appendChild(svg('circle', {
        cx: m.x, cy: m.y, r: ART.handle * 1.7, fill: 'none',
        stroke: 'var(--metro)', 'stroke-width': 8, opacity: 0.55,
      }));
    }
    layer.handles.appendChild(svg('circle', {
      cx: m.x, cy: m.y, r: ART.handle, fill: 'var(--station-fill)',
      stroke: 'var(--metro)', 'stroke-width': ART.handleRing,
    }));
  }
}

function renderStations() {
  clear(layer.stations);
  const active = new Set([
    pending && pending.from, draft && draft.from, draft && draft.to,
  ].filter(Boolean));
  const live = new Set(connectedStations());

  // 역 건설 중에만 자라는 범위를 보여 준다. 늘 켜 두면 원끼리 겹쳐 지도가 안
  // 보이고, 정작 필요한 순간은 다음 역을 어디 놓을지 고를 때뿐이다.
  if (mode === 'build') {
    const group = svg('g', { fill: 'var(--reach)', opacity: 0.5 });
    for (const s of city.stations) {
      if (!inView(s, -GROW_RADIUS)) continue;
      group.appendChild(svg('circle', { cx: s.x, cy: s.y, r: GROW_RADIUS }));
    }
    if (ghost && !ghost.why) {
      group.appendChild(svg('circle', { cx: ghost.x, cy: ghost.y, r: GROW_RADIUS }));
    }
    layer.stations.appendChild(group);
  }

  const onLine = new Map();
  for (const line of lines) for (const s of line.stations) onLine.set(s, line);

  for (const s of city.stations) {
    if (!inView(s, -ART.station * 2)) continue;
    const line = onLine.get(s);
    layer.stations.appendChild(svg('circle', {
      cx: s.x, cy: s.y, r: ART.station,
      fill: live.has(s) ? (line ? lineColor(line) : 'var(--metro)') : 'var(--station-fill)',
      stroke: active.has(s) ? 'var(--metro)' : 'var(--station-ring)',
      'stroke-width': active.has(s) ? ART.stationRing * 1.5 : ART.stationRing,
    }));
  }

  // 고른 역이 화면 밖으로 나가면 가장자리에 표시를 남긴다. 지도가 화면보다
  // 넓어서, 팬으로 옮긴 순간 무엇을 고른 채인지 알 길이 없어진다.
  const pad = ART.station * 1.4;
  for (const s of active) {
    if (inView(s, pad)) continue;
    layer.stations.appendChild(svg('circle', {
      cx: clamp(s.x, cam.x + pad, cam.x + VIEW.w - pad),
      cy: clamp(s.y, cam.y + pad, cam.y + VIEW.h - pad),
      r: ART.station * 0.6, fill: 'var(--metro)', opacity: 0.55,
    }));
  }
}

// 방금 자란 자리를 짚어 준다. 숫자만 알려 주면 플레이어는 자기가 무엇을 바꿨는지
// 보지 못한다. 다음에 무언가를 건드리면 지운다.
function renderGrown() {
  clear(layer.grown);
  if (!grown.length) return;
  layer.grown.appendChild(svg('path', {
    d: grown.map((g) => {
      const b = city.buildings[g.id];
      return `M${r1(b.x)} ${r1(b.y)}h${r1(b.w)}v${r1(b.h)}h${r1(-b.w)}z`;
    }).join(''),
    fill: 'none', stroke: 'var(--metro)', 'stroke-width': 9, opacity: 0.9,
  }));
}



// --- 고르개 ---

function picker(node, items, onPick) {
  clear(node);
  for (const item of items) {
    const button = document.createElement('button');
    button.className = 'pick';
    button.type = 'button';
    if (item.icon) {
      const slot = document.createElement('span');
      slot.dataset.icon = item.icon;
      button.appendChild(slot);
    }
    if (item.label) button.appendChild(document.createTextNode(item.label));
    button.setAttribute('aria-pressed', String(!!item.on));
    if (item.dim) button.classList.add('dim');
    button.addEventListener('click', () => onPick(item));
    node.appendChild(button);
  }
  if (window.SharedIcons) SharedIcons.paint(node);
}

function renderModes() {
  picker(el.modes, [
    { id: 'run', label: t('metro.modeRun'), on: mode === 'run' },
    { id: 'build', label: t('metro.modeBuild'), on: mode === 'build' },
    { id: 'lines', label: t('metro.modeLines'), on: mode === 'lines' },
  ], (item) => {
    if (item.id === mode) return;
    mode = item.id;
    pending = null;
    draft = null;
    ghost = null;
    marked = null;
    history = [];
    Sound.play('select');
    refresh();
  });
}

// 도구줄은 모드마다 다른 것을 담는다. 건설 모드에서는 무엇을 지을지, 기본 모드에서
// 역을 고른 다음에는 새 노선인지 연장인지.
function renderTools() {
  if (mode === 'build') {
    picker(el.tools, [{ id: 'station', label: t('metro.toolStation'), on: true }], () => {});
    el.tools.hidden = false;
    return;
  }
  if (mode === 'run' && pending && pending.choices) {
    picker(el.tools, pending.choices.map((c) => ({
      ...c, on: pending.kind === c.kind && pending.line === c.line,
    })), (item) => {
      pending.kind = item.kind;
      pending.line = item.line;
      Sound.play('select');
      refresh();
    });
    el.tools.hidden = false;
    return;
  }
  clear(el.tools);
  el.tools.hidden = true;
}

// --- 숫자 ---

function money(v) { return `${v.toFixed(1)}${t('metro.unitMoney')}`; }
function metres(v) { return v < 1000 ? `${Math.round(v)}m` : `${(v / 1000).toFixed(2)}km`; }

function mmss(sec) {
  // 초를 먼저 반올림한다. 분을 먼저 떼면 119.6초가 "1:60"으로 나온다.
  if (!Number.isFinite(sec)) return '–';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  return `${m}:${String(total - m * 60).padStart(2, '0')}`;
}

// 예산·시계·수요는 매 프레임 갱신된다. 패널 전체를 다시 그리면 그때마다 단추가
// 새로 만들어져 누르던 것이 손 밑에서 사라진다.
function renderMeters() {
  el.budget.textContent = money(budget);
  const hh = Math.floor(clock / 3600) % 24;
  const mm = Math.floor(clock / 60) % 60;
  el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  el.clock.classList.toggle('held', !running());
  el.pause.textContent = t(['metro.speedStop', 'metro.speedSlow', 'metro.speedFast'][speed]);
  el.pause.setAttribute('aria-pressed', String(speed > 0));
  el.vCaught.textContent = String(demands.length - waitingCount());
  el.vWaiting.textContent = String(waitingCount());
  el.vIncome.textContent = income.toFixed(1);
}

function renderPanel() {

  if (ghost || marked) {
    el.readout.hidden = true;
    el.actions.hidden = false;
    el.undo.hidden = true;
    el.remove.hidden = !marked;
    el.confirm.hidden = !!marked;
    el.confirm.disabled = !ghost || !!ghost.why || budget < STATION_COST;
    el.remove.disabled = !!marked && lines.some((line) => line.stations.includes(marked));
    return;
  }
  el.undo.hidden = false;
  el.remove.hidden = true;
  el.confirm.hidden = false;

  const live = draftOk();
  el.readout.hidden = !draft;
  el.actions.hidden = !draft;
  el.confirm.disabled = !live || draft.cost.cost > budget;
  el.undo.disabled = !draft || history.length === 0;
  if (!draft) return;

  if (!live) {
    for (const k in value) value[k].textContent = '–';
    for (const kind of GROUND) { mix[kind].style.flexGrow = '0'; lenOut[kind].textContent = '–'; }
    return;
  }

  value.cost.textContent = money(draft.cost.cost);
  value.time.textContent = mmss(draft.prof.time);
  value.length.textContent = metres(draft.path.length);
  // 이 노선의 발목을 잡는 속도. 최고 속도는 곧은 구간이 늘 최고속에 닿아 언제나
  // 같은 값이 나오고, 평균 속도는 길이가 늘면 같이 올라 곡선의 손해가 묻힌다.
  value.speed.textContent = `${Math.round(Math.min(...draft.path.nodeLim) * 3.6)}km/h`;

  for (const kind of GROUND) {
    mix[kind].style.flexGrow = String(draft.cost.lengths[kind]);
    lenOut[kind].textContent = metres(draft.cost.lengths[kind]);
  }
}

// --- 노선 관리 ---

const patternName = (line, i) => (i === 0 ? t('metro.local')
  : line.patterns.length > 2 ? `${t('metro.express')}${i}` : t('metro.express'));

function renderLinePanel() {
  el.linepanel.hidden = mode !== 'lines';
  if (mode !== 'lines') return;

  sel.line = clamp(sel.line, 0, Math.max(0, lines.length - 1));
  const line = lines[sel.line];
  picker(el.lineList, lines.map((l, i) => ({
    id: i, label: l.loop ? `${lineName(l)} ${t('metro.loop')}` : lineName(l), on: i === sel.line,
  })), (item) => { sel.line = item.id; sel.pattern = 0; Sound.play('select'); refresh(); });

  el.dropLine.disabled = !line;
  if (!line) {
    clear(el.patternList);
    clear(el.stops);
    el.plan.textContent = '';
    el.trainCount.textContent = '0';
    return;
  }

  sel.pattern = clamp(sel.pattern, 0, line.patterns.length - 1);
  const items = line.patterns.map((p, i) => ({
    id: i, label: `${patternName(line, i)} ×${p.trains}`, on: i === sel.pattern,
  }));
  picker(el.patternList, items, (item) => { sel.pattern = item.id; Sound.play('select'); refresh(); });
  el.addPattern.disabled = line.patterns.length >= Lines.MAX_PATTERNS || line.stations.length < 3;

  const pattern = line.patterns[sel.pattern];
  clear(el.stops);
  line.stations.forEach((s, i) => {
    const button = document.createElement('button');
    button.className = 'stop';
    button.type = 'button';
    button.textContent = String(i + 1);
    button.setAttribute('aria-pressed', String(!!pattern.stops[i]));
    button.disabled = !Lines.canToggle(line, i);
    button.addEventListener('click', () => {
      pattern.stops[i] = !pattern.stops[i];
      Sound.play(pattern.stops[i] ? 'place' : 'erase');
      syncNetwork();
      refresh();
    });
    el.stops.appendChild(button);
  });

  el.trainCount.textContent = String(pattern.trains);
  el.trainMinus.disabled = pattern.trains <= 0;
  el.trainPlus.disabled = pattern.trains >= Lines.MAX_TRAINS || budget < Lines.TRAIN_COST;

  const p = Lines.plan(line, pattern);
  const svc = services.find((x) => x.line === line && x.pattern === pattern);
  const crowd = svc ? Math.round(svc.crowd * 100) : 0;
  el.plan.textContent = p
    ? `${t('metro.cycle')} ${mmss(p.cycle)} · ${t('metro.headway')} ${mmss(p.headway)}`
    : '';
  // 혼잡률은 **깎기 전의 부하**다. 100%를 넘으면 그만큼이 못 타고 지상으로 간다.
  el.crowd.textContent = svc ? `${t('metro.crowd')} ${crowd}%` : '';
  el.crowd.classList.toggle('over', crowd > 100);
}

// --- 상태줄 ---

function renderStatus(key, warn = false, n = null) {
  if (key) {
    el.status.textContent = n == null ? t(key) : fill(key, n);
    el.status.classList.toggle('warn', warn);
    return;
  }
  let text = '';
  let bad = false;
  if (ghost) { text = ghost.why ? t(`metro.bad.${ghost.why}`) : t('metro.ghostHint'); bad = !!ghost.why; }
  else if (marked) {
    const used = lines.some((line) => line.stations.includes(marked));
    text = used ? t('metro.inUse') : t('metro.removeHint');
    bad = used;
  }
  else if (draft) {
    text = draftOk() ? t('metro.editHint') : t(`metro.bad.${draft.why}`);
    bad = !draftOk();
  } else if (mode === 'build') text = t('metro.placeHint');
  else if (mode === 'lines') text = lines.length ? t('metro.lineHint') : t('metro.noLines');
  else if (pending) text = t('metro.pickTarget');
  else text = city.stations.length < 2 ? t('metro.needStations') : t('metro.pickStation');
  el.status.textContent = text;
  el.status.classList.toggle('warn', bad);
}

// --- 조작 ---

function toWorld(event) {
  const rect = el.map.getBoundingClientRect();
  const scale = VIEW.w / rect.width;
  return {
    x: cam.x + (event.clientX - rect.left) * scale,
    y: cam.y + (event.clientY - rect.top) * scale,
    scale,
  };
}

function grabHandle(w) {
  let hit = -1;
  let best = HIT_PX * w.scale;
  draft.mids.forEach((m, i) => {
    const d = Geom.dist(w.x, w.y, m.x, m.y);
    if (d < best) { best = d; hit = i; }
  });
  return hit;
}

// **편집은 자기 것 위에서 시작한 끌기만 가져간다.** 손잡이와 그은 선, 그리고 임시
// 역이 편집의 것이고 나머지는 전부 팬이다. 이 경계가 없으면 지도를 옮기려다
// 노선이 휘고, 노선을 휘려다 지도가 밀린다.
function onDown(event) {
  const w = toWorld(event);

  if (ghost && Geom.dist(w.x, w.y, ghost.x, ghost.y) < HIT_PX * 1.6 * w.scale) {
    drag = { kind: 'ghost' };
    el.map.setPointerCapture(event.pointerId);
    return;
  }

  if (draft) {
    const hit = grabHandle(w);
    if (hit >= 0) {
      const now = performance.now();
      if (lastTap.index === hit && now - lastTap.at < DOUBLE_MS) {
        pushHistory();
        draft.mids.splice(hit, 1);
        lastTap = { index: -1, at: 0 };
        Sound.play('erase');
        recompute();
        refresh();
        return;
      }
      lastTap = { index: hit, at: now };
      pushHistory();
      drag = { kind: 'mid', index: hit, snapped: !!draft.mids[hit].snapped };
      el.map.setPointerCapture(event.pointerId);
      return;
    }

    // 선을 잡는다. 판정은 다듬어진 곡선이 아니라 찍은 점들의 꺾은선으로 한다 —
    // 새 점을 몇 번째 자리에 끼울지가 그 꺾은선에서만 나온다.
    const ctrl = [draft.from, ...draft.mids, draft.to];
    const near = Geom.nearestOnPolyline(w.x, w.y, ctrl);
    if (near.d < GRAB_PX * w.scale) {
      if (draft.mids.length >= MAX_MIDS) {
        renderStatus('metro.maxMids', true);
        Sound.play('deny');
        return;
      }
      pushHistory();
      const index = near.index - 1;
      draft.mids.splice(index, 0, { x: near.x, y: near.y });
      drag = { kind: 'mid', index, snapped: false };
      lastTap = { index, at: performance.now() };
      el.map.setPointerCapture(event.pointerId);
      Sound.play('place');
      recompute();
      refresh();
      return;
    }
  }

  // 그 밖은 전부 팬이다. 손을 뗐을 때 거의 움직이지 않았으면 두드린 것으로 본다 —
  // 누르는 순간에 가르려 하면 무언가를 짚고 지도를 미는 동작이 통째로 막힌다.
  const station = draft ? null
    : city.stations.find((s) => Geom.dist(w.x, w.y, s.x, s.y) < HIT_PX * 1.3 * w.scale);
  drag = {
    kind: 'pan', station, moved: 0, at: { x: w.x, y: w.y },
    camX: cam.x, camY: cam.y, sx: event.clientX, sy: event.clientY,
  };
  el.map.setPointerCapture(event.pointerId);
}

function onMove(event) {
  if (!drag) return;
  const w = toWorld(event);

  if (drag.kind === 'pan') {
    const dx = event.clientX - drag.sx;
    const dy = event.clientY - drag.sy;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    setCam(drag.camX - dx * w.scale, drag.camY - dy * w.scale);
    renderStations();
    return;
  }

  const point = { x: clamp(w.x, 0, city.world.w), y: clamp(w.y, 0, city.world.h) };

  if (drag.kind === 'ghost') {
    moveGhost(point.x, point.y);
    return;
  }

  const snap = City.snapToRoad(city, point.x, point.y, SNAP_PX * w.scale);
  if (snap) { point.x = snap.x; point.y = snap.y; point.snapped = true; }
  if (!!point.snapped !== drag.snapped) {
    drag.snapped = !!point.snapped;
    if (drag.snapped) Sound.play('snap');   // 화면의 고리는 손가락에 가려 안 보인다
  }

  draft.mids[drag.index] = point;
  recompute();
  refresh();
}

function onUp(event) {
  if (!drag) return;
  if (el.map.hasPointerCapture(event.pointerId)) el.map.releasePointerCapture(event.pointerId);
  const done = drag;
  drag = null;
  if (done.kind !== 'pan' || done.moved > TAP_PX) return;

  if (mode === 'build') tapBuild(done);
  else {
    // **노선 모드에서도 역을 눌러 잇는다.** 정차역을 만지다 "여기서 한 정거장 더"가
    // 떠오르는 것이 자연스러운데, 그때마다 모드를 옮겨 다니게 하면 흐름이 끊긴다.
    if (mode === 'lines' && done.station) selectLineOf(done.station);
    tapRun(done.station);
  }
}

// --- 건설 모드 ---

function moveGhost(x, y) {
  ghost = { x, y, why: City.canPlaceStation(city, x, y) };
  renderDraft();
  renderStations();
  renderPanel();
  renderStatus();
}

// **두드린다고 바로 없어지지 않는다.** 역 하나가 몇십억이고 그 둘레의 동네가
// 거기 달려 있는데, 손가락이 스친 것으로 사라지면 되돌릴 방법이 없다. 고르고,
// 무엇을 고른 건지 보고, 철거를 눌러야 없어진다.
function tapBuild(done) {
  if (done.station) {
    ghost = null;
    marked = marked === done.station ? null : done.station;
    Sound.play('select');
    refresh();
    return;
  }
  marked = null;
  Sound.play('place');
  moveGhost(done.at.x, done.at.y);
}

function removeStation() {
  if (!marked) return;
  if (lines.some((line) => line.stations.includes(marked))) { Sound.play('deny'); return; }
  city.stations.splice(city.stations.indexOf(marked), 1);
  budget += STATION_COST * REFUND;
  marked = null;
  Sound.play('erase');
  syncNetwork();
  refresh();
  renderStatus('metro.removed');
}

// --- 기본 모드 ---

function tapRun(station) {
  if (!station) return;
  if (city.stations.length < 2) { renderStatus('metro.needStations', true); return; }

  if (!pending) {
    const ends = endpointsOf(station);
    const choices = [
      ...ends.map((line) => ({ kind: 'extend', line, label: fill('metro.extend', lines.indexOf(line) + 1) })),
      { kind: 'new', line: null, label: t('metro.newLine') },
    ];
    pending = { from: station, choices, kind: choices[0].kind, line: choices[0].line };
    Sound.play('select');
    refresh();
    return;
  }

  if (station === pending.from) { pending = null; Sound.play('erase'); refresh(); return; }

  if (pending.kind === 'extend') {
    const why = Lines.whyNot(pending.line, station);
    if (why) { renderStatus(`metro.bad.${why}`, true); Sound.play('deny'); return; }
    orientForExtend(pending.line, pending.from);
    startDraft('extend', pending.line, pending.line.stations[pending.line.stations.length - 1], station);
    return;
  }
  startDraft('new', null, pending.from, station);
}

function selectLineOf(station) {
  const i = lines.findIndex((line) => line.stations.includes(station));
  if (i < 0 || i === sel.line) return;
  sel = { line: i, pattern: 0 };
}

// --- 확정 ---

function afterBuild(cost) {
  budget -= cost;
  Sound.play('build');
  syncNetwork();
  refresh();
  renderStatus('metro.built');
}

function confirm() {
  if (ghost) {
    if (ghost.why || budget < STATION_COST) return;
    City.addStation(city, ghost.x, ghost.y);
    budget -= STATION_COST;
    ghost = null;
    Sound.play('place');
    syncNetwork();
    refresh();
    renderStatus('metro.stationBuilt');
    return;
  }
  if (!draftOk() || draft.cost.cost > budget) return;

  const cost = draft.cost.cost;
  if (draft.kind === 'new') {
    const line = Lines.create(draft.from, draft.to, draft.mids);
    line.color = lines.length % LINE_COLORS;
    line.spent = cost;
    rebuildLine(line);
    lines.push(line);
  } else {
    const next = Lines.withExtension(draft.line, draft.to, draft.mids);
    Object.assign(draft.line, next);
    draft.line.spent = (draft.line.spent || 0) + cost;
    rebuildLine(draft.line);
  }
  draft = null;
  pending = null;
  history = [];
  afterBuild(cost);
}

el.map.addEventListener('pointerdown', onDown);
el.map.addEventListener('pointermove', onMove);
el.map.addEventListener('pointerup', onUp);
el.map.addEventListener('pointercancel', onUp);

// 판이 touch-action: none이라 판 안에서는 click이 나지 않는다. 단추를 전부 판
// 밖에 둔 이유가 이것이다.
el.confirm.addEventListener('click', confirm);

el.cancel.addEventListener('click', () => {
  draft = null;
  pending = null;
  ghost = null;
  marked = null;
  history = [];
  Sound.play('erase');
  refresh();
});

el.undo.addEventListener('click', () => {
  if (!draft || history.length === 0) return;
  draft.mids = JSON.parse(history.pop());
  Sound.play('erase');
  recompute();
  refresh();
});

// 노선을 통째로 없앤다. 역과 같은 규율이다 — 고르고, 무엇을 고른 건지 보고, 단추를
// 눌러야 사라진다. 들인 값과 열차값의 절반을 돌려준다.
el.dropLine.addEventListener('click', () => {
  const line = lines[sel.line];
  if (!line) return;
  const back = ((line.spent || 0) + Lines.trainsOf(line) * Lines.TRAIN_COST) * REFUND;
  lines.splice(sel.line, 1);
  lines.forEach((l, i) => { l.color = i % LINE_COLORS; });
  budget += back;
  sel = { line: 0, pattern: 0 };
  Sound.play('erase');
  syncNetwork();
  refresh();
  renderStatus('metro.lineGone');
});

el.addPattern.addEventListener('click', () => {
  const line = lines[sel.line];
  if (!line || line.patterns.length >= Lines.MAX_PATTERNS) return;
  line.patterns.push(Lines.expressPattern(line));
  sel.pattern = line.patterns.length - 1;
  Sound.play('select');
  syncNetwork();
  refresh();
});

function setTrains(delta) {
  const line = lines[sel.line];
  if (!line) return;
  const pattern = line.patterns[sel.pattern];
  const next = clamp(pattern.trains + delta, 0, Lines.MAX_TRAINS);
  if (next === pattern.trains) return;
  if (delta > 0) {
    if (budget < Lines.TRAIN_COST) { renderStatus('metro.noMoney', true); Sound.play('deny'); return; }
    budget -= Lines.TRAIN_COST;
  } else budget += Lines.TRAIN_COST * REFUND;
  pattern.trains = next;
  Sound.play(delta > 0 ? 'place' : 'erase');
  syncNetwork();
  refresh();
}

el.trainPlus.addEventListener('click', () => setTrains(1));
el.trainMinus.addEventListener('click', () => setTrains(-1));

el.remove.addEventListener('click', removeStation);

// 배속은 단추 하나를 돌려 쓴다. 멈춤·보통·빠름 셋뿐이라 고르개를 따로 두면
// 머리줄이 그만큼 좁아지는데, 얻는 것이 없다.
el.pause.addEventListener('click', () => {
  speed = (speed + 1) % SPEEDS.length;
  Sound.play('select');
  renderMeters();
});

el.newCity.addEventListener('click', () => {
  Sound.play('select');
  makeCity(seed + 1, level);
});

function renderLevels() {
  picker(el.levels, City.LEVELS.map((s, i) => ({ id: i, label: t(`metro.${s.id}`), on: i === level })),
    (item) => {
      if (item.id === level) return;
      Sound.play('select');
      makeCity(seed + 1, item.id);
    });
}

// HTML에 박아 둔 아이콘(열차 수 단추)을 한 번 그린다. picker가 만드는 것은 그때그때
// 그리지만, 처음부터 있던 것은 아무도 손대지 않아 빈 동그라미로 남아 있었다.
if (window.SharedIcons) SharedIcons.paint();

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

function bindSoundToggle(node, key, apply) {
  node.setAttribute('aria-pressed', String(Sound.prefs[key]));
  node.addEventListener('click', () => {
    const on = !Sound.prefs[key];
    node.setAttribute('aria-pressed', String(on));
    apply(on);
    Sound.play('select');
  });
}

bindSoundToggle(el.toggleBgm, 'bgm', (on) => Sound.setBgm(on));
bindSoundToggle(el.toggleSfx, 'sfx', (on) => Sound.setSfx(on));

makeCity(seed, level);
requestAnimationFrame(frame);

})();

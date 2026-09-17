'use strict';

// 화면과 조작. 규칙과 계산은 citygen.js·route.js·lines.js에 있고 여기서는 그리기만 한다.
(function () {

const City = window.MetroCity;
const Route = window.MetroRoute;
const Lines = window.MetroLines;
const Demand = window.MetroDemand;
const Geom = window.MetroGeom;
const Sound = window.MetroSound;
const Save = window.MetroSave;
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
  // 열차는 네모다. 선로를 따라 눕혀 그리고, 안을 채운 길이가 그 열차가 실은 몫이다.
  // 네모 하나가 한 량이라 **붙은 네모의 수가 곧 편성 길이**다 — 길이를 셀 수 있으면
  // 어느 열차에 량을 더 붙였는지 판 위에서 바로 읽힌다.
  carL: 62, carH: 52, carRing: 8, carGap: 4,
};

// 이 거리 안에서 선 밑에 놓은 역은 그 노선에 끼어든다. 역 반지름의 두 배쯤이라
// 역 동그라미가 선에 겹쳐 보이면 끼어든다고 보면 맞는다.
const JOIN_SNAP = 120;

const GROUND = ['road', 'empty', 'building', 'hill', 'water'];

const el = {};
for (const id of ['map', 'status', 'readout', 'actions', 'budget', 'clock', 'pause', 'newCity',
  'wide', 'levels', 'modes', 'tools', 'flow', 'vCaught', 'vWaiting', 'vMissed', 'missedBox', 'vIncome',
  'linepanel', 'lineList', 'dropLine', 'patternList', 'stops', 'trainCount', 'trainMinus',
  'trainPlus', 'trainLabel', 'plan', 'crowd', 'trainpanel', 'tpName', 'tpWhere',
  'tpClose', 'tpBar', 'tpFill', 'tpLoad', 'tpCap', 'tpMinus', 'tpCars', 'tpPlus', 'tpCarnote', 'backRow', 'backMinus', 'backCount',
  'backPlus', 'backPlan', 'backCrowd', 'addPattern', 'undo', 'cancel', 'remove', 'confirm',
  'help', 'helpOpen', 'helpClose', 'toggleBgm', 'toggleSfx']) {
  el[id] = document.getElementById(id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
}
const layer = {};
for (const name of ['water', 'hills', 'roads', 'buildings', 'grown', 'demand', 'lines',
  'draft', 'stations', 'trains', 'handles']) {
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

// **배율은 우리가 viewBox로 낸다.** 브라우저 확대는 `shared/base.js`가 문서 전체에서
// 막고 있고(손가락 둘의 `touchmove`와 웹킷 gesture를 취소한다) 그 규칙은 실기기 보고로
// 정해진 자리라 건드리지 않는다. 대신 **손가락 둘의 자리를 우리가 읽어** 배율을 바꾼다 —
// 브라우저는 여전히 확대하지 않으므로 그 규칙에 닿지 않는다.
//
// 한때는 "보통"과 "전체" 두 단계뿐이었다. 지도가 창의 아홉 배라 한 화면씩 밀어서는
// 반대편까지 가는 데 여러 번 끌어야 해서 넣은 것인데, **그 사이가 없다는 것이 문제였다** —
// 역 몇 개를 한눈에 놓고 선을 긋고 싶은 배율이 어디에도 없었다.
const ZOOM_MIN = Math.min(VIEW.w / City.WORLD.w, VIEW.h / City.WORLD.h);   // 도시 전체
const ZOOM_MAX = 3;
let zoom = 1;
let zoomBack = 1;        // 전체로 들어가기 전의 배율. 나올 때 그 자리로 돌아간다
const span = () => ({ w: VIEW.w / zoom, h: VIEW.h / zoom });

// **가장 멀리 나간 상태가 곧 전체 보기다.** 거기서는 판이 삼분의 일이라 몇 미터를
// 다투는 조작이 정확할 수 없어 짓거나 끌 수 없고, 누른 자리로 내려간다.
const atFit = () => zoom <= ZOOM_MIN * 1.001;

// 역·선·열차는 **화면에서 같은 굵기로 남는다.** 도로와 건물은 지도의 일부라 배율을
// 그대로 타는 것이 맞지만 우리가 놓은 것은 아니다 — 어디에 무엇이 있는지 보려고 배율을
// 바꾸는 것이므로, 표시는 작아지지도 커지지도 않아야 한다. `1 / zoom`이 정확히 그 값이고,
// 멀리 나갔을 때만 천장을 둔다(전체 보기에서 점이 너무 굵어진다).
const K = () => Math.min(1 / zoom, 2.6);
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
// 역 → **지금 승강장에 서 있는 사람**. 비율이 아니라 쌓인 양이다 — 열차가 와서 태우면
// 줄어들고, 못 태우면 늘어난다. 한 시점의 비율로 두었더니 열차가 서도 숫자가 꿈쩍하지
// 않아 "태웠는데 안 줄어든다"로 보였다.
let waiting = new Map();
// 열차가 보여 주는 재차 인원은 **역을 지날 때만** 바뀐다. 수요는 몇 초마다 다시
// 풀리므로 그때마다 값을 새로 읽으면, 달리는 중에 사람이 타고 내리는 것처럼 보인다.
let carLoads = new Map();
// 판 위에서 고른 열차. 그 운행과 몇 번째 열차인지만 들고 있고, 자리와 재차 인원은
// 매 프레임 시간표에서 다시 읽는다 — 열차는 멈춰 있지 않으므로 값을 붙들어 두면 낡는다.
let picked = null;
// 순환선마다 역 순서를 뒤집은 짝. 망이 바뀔 때 한 번만 짓는다 — 화면을 그릴 때마다
// 다시 지으면 `Route.build`가 매번 도는데, 바뀐 것이 없으면 같은 답이 나온다.
let mirrors = new Map();
let runs = [];           // 화면이 보는 열차 목록 { line, table, trains, headway }
let growWork = 0;
let nextSpawn = 0;
let income = 0;          // 억/게임분
let simRng = City.mulberry32(1);
let frameAt = 0;

const t = (key) => SharedI18n.t(key);
const fill = (key, n) => t(key).replace('{n}', n);
// 천 명을 넘으면 `2.4k`로 줄인다. 계기판도 역 배지도 같은 규칙이라야 두 숫자를 견준다.
const short = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));
const people = (n) => short(n) + t('metro.unitPeople');
// 계기판은 흐름(명/분)이고 열차 안은 지금 타고 있는 사람이다. 단위를 갈라 둔다.
const heads = (n) => short(n) + t('metro.unitHeads');
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
  zoom = 1;
  zoomBack = 1;
  sel = { line: 0, pattern: 0 };
  clock = 6 * 3600;
  demands = [];
  waiting = new Map();
  carLoads = new Map();
  picked = null;
  growWork = 0;
  nextSpawn = 0;
  income = 0;
  simRng = City.mulberry32(seed * 7919 + 13);
  syncNetwork();
  setCam(city.core.x - VIEW.w / 2, city.core.y - VIEW.h / 2);
  drawCity();
  renderGrown();
  refresh();
  // **새 도시는 곧바로 덮어쓴다.** 두지 않으면 다음 담기 전에 새로고침했을 때 버린
  // 판이 되살아난다.
  saveGame(true);
}

// --- 이어 하기 ---
//
// **새로고침해도 하던 판이 그대로 이어진다.** 폰에서 주소창을 잘못 건드리거나 홈 화면
// 앱이 뒤로 밀렸다가 돌아오면 페이지가 다시 뜨는데, 그때마다 몇십 분 굴린 판이 사라지면
// 게임을 붙잡고 있을 수가 없다.
//
// **담는 것은 씨앗과 그 뒤에 달라진 것뿐이다**(`save.js`). 무엇을 담고 어떻게 되살리는지는
// 거기에 있고, 여기서는 **언제 담고 언제 버리는지**만 정한다.
let saveAt = 0;
let dirty = false;
const SAVE_EVERY = 2000;   // ms. 시계가 계속 가므로 주기로도 담는다

// 바뀐 것이 있을 때만 담는다. 멈춰 둔 판에서도 2초마다 20KB를 쓰는 것은 얻는 것 없이
// 저장소만 두드리는 일이다.
const touch = () => { dirty = true; };

function saveGame(force = false) {
  if (!city) return;
  const now = Date.now();
  if (!force && (!dirty || now - saveAt < SAVE_EVERY)) return;
  saveAt = now;
  dirty = false;
  try {
    localStorage.setItem(Save.KEY, JSON.stringify(Save.snapshot({
      city, level, lines, budget, clock, speed, growWork, nextSpawn, demands, waiting, cam, zoom,
    })));
  } catch { /* 사파리 비공개 모드 등: 담지 못해도 판은 굴러간다 */ }
}

// 되살린 판으로 갈아 끼운다. 되살리지 못하면 false — 부르는 쪽이 새 도시를 만든다.
function loadGame() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(Save.KEY)); } catch { return false; }
  let got = null;
  try { got = Save.restore(data); } catch { got = null; }
  if (!got) return false;

  city = got.city;
  seed = city.seed;
  level = got.level;
  lines = got.lines;
  budget = got.budget;
  clock = got.clock;
  speed = clamp(got.speed, 0, SPEEDS.length - 1);
  growWork = got.growWork;
  nextSpawn = got.nextSpawn;
  demands = got.demands;
  waiting = got.waiting;
  grown = [];
  pending = null; draft = null; ghost = null; marked = null; picked = null;
  history = []; drag = null;
  mode = 'run';
  zoom = clamp(got.zoom || 1, ZOOM_MIN, ZOOM_MAX);
  zoomBack = Math.max(1, zoom);
  sel = { line: 0, pattern: 0 };
  carLoads = new Map();
  // **난수만 씨앗에서 다시 시작한다.** mulberry32는 셈한 횟수를 밖으로 내주지 않는데,
  // 다음 수요가 어디서 생기는지는 이어 하는 느낌과 아무 상관이 없다. 자라는 쪽은
  // `city.growSeed`가 자료에 그대로 있어 담은 자리에서 이어진다.
  simRng = City.mulberry32(seed * 7919 + 13);
  income = 0;

  syncNetwork();
  if (got.cam) setCam(got.cam.x, got.cam.y);
  else setCam(city.core.x - VIEW.w / 2, city.core.y - VIEW.h / 2);
  drawCity();
  renderGrown();
  refresh();
  return true;
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

  // 산을 뚫는 구간. 길 위에 산 색을 점선으로 덧그어 "산 밑으로 지난다"를 만든다.
  const tunnels = () => {
    if (!city.tunnels || !city.tunnels.length) return;
    layer.roads.appendChild(svg('path', {
      d: city.tunnels.map(polyD).join(''), fill: 'none', stroke: 'var(--hill)',
      'stroke-width': City.ROAD_W.arterial + 6, 'stroke-dasharray': '46 30',
      'stroke-linecap': 'butt',
    }));
  };

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
  tunnels();

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
  const v = span();
  cam.x = clamp(x, 0, city.world.w - v.w);
  cam.y = clamp(y, 0, city.world.h - v.h);
  el.map.setAttribute('viewBox', `${r1(cam.x)} ${r1(cam.y)} ${v.w} ${v.h}`);
}

function centerOn(x, y) { setCam(x - span().w / 2, y - span().h / 2); }

function inView(p, margin = 0) {
  const v = span();
  return p.x > cam.x + margin && p.x < cam.x + v.w - margin
    && p.y > cam.y + margin && p.y < cam.y + v.h - margin;
}

// 전체 보기로 들고 난다. **나올 때는 보던 자리가 아니라 지금 보는 자리로 간다** —
// 들어갈 때 자리로 돌아오면 반대편을 보려고 연 것이 헛일이 된다. 배율만 되돌린다.
function setFit(on, at = null) {
  if (on === atFit()) return;
  const focus = at || { x: cam.x + span().w / 2, y: cam.y + span().h / 2 };
  if (on) {
    zoomBack = Math.max(1, zoom);
    // 전체 보기는 판을 고르는 화면이라, 만들다 만 것을 들고 들어가지 않는다.
    pending = null; draft = null; ghost = null; marked = null; history = [];
    zoom = ZOOM_MIN;
  } else zoom = zoomBack;
  centerOn(focus.x, focus.y);
  Sound.play('select');
  refresh();
}

// 판 위의 한 점(화면 좌표)이 가리키는 지도 좌표.
function worldAtClient(cx, cy) {
  const rect = el.map.getBoundingClientRect();
  const v = span();
  return {
    x: cam.x + (cx - rect.left) / rect.width * v.w,
    y: cam.y + (cy - rect.top) / rect.height * v.h,
  };
}

// **그 자리의 땅을 손가락(또는 화살표) 밑에 붙들어 둔 채 배율만 바꾼다.** 붙들지 않고
// 중심을 기준으로 키우면 키울 때마다 보던 곳이 화면 밖으로 밀려나, 확대하고 다시 끌어
// 찾는 일을 되풀이하게 된다.
function zoomTo(next, cx, cy, hold = null) {
  if (!city) return;
  const want = clamp(next, ZOOM_MIN, ZOOM_MAX);
  if (Math.abs(want - zoom) < 1e-5) return;
  const at = hold || worldAtClient(cx, cy);
  const was = atFit();
  const rect = el.map.getBoundingClientRect();
  zoom = want;
  const v = span();
  setCam(at.x - (cx - rect.left) / rect.width * v.w,
    at.y - (cy - rect.top) / rect.height * v.h);
  // **판만 다시 그린다.** `refresh()`는 패널의 단추를 새로 만드는데, 배율은 손가락이
  // 움직이는 내내 바뀌므로 누르던 단추가 손 밑에서 사라진다(루트 규칙).
  renderLines();
  renderTrains();
  renderDemands();
  renderDraft();
  renderStations();
  // 전체 보기에 닿았는지는 계기판이 들고 있다(단추의 눌림 표시). 판을 새로 만들지
  // 않는 함수라 배율이 바뀌는 내내 불러도 된다.
  if (was !== atFit()) renderMeters();
  touch();
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
// 두드린 자리에 열차가 있는가. 그린 자리를 그대로 다시 재는 것이라, 보이는 칸을
// 누르면 잡힌다.
function trainAt(w) {
  const reach = HIT_PX * 1.4 * w.scale;
  let best = null;
  let near = reach;
  for (const run of runs) {
    const pattern = run.svc && run.svc.pattern;
    for (let k = 0; k < run.trains; k++) {
      const at = Lines.at(run.line, run.table, clock + k * run.headway);
      // 중심까지의 거리에서 편성 반길이를 빼 둔다. 다섯 량은 한 량의 다섯 배로 길어서
      // 중심만 재면 눈에 보이는 꼬리를 눌러도 안 잡힌다.
      const d = Geom.dist(w.x, w.y, at.x, at.y) - consistLength(pattern, run.dir, k) / 2;
      if (d < near) { near = d; best = { key: run.key, k }; }
    }
  }
  return best;
}

// 고른 열차가 아직 판 위에 있는가. 노선을 고치거나 열차를 줄이면 사라진다.
function pickedRun() {
  if (!picked) return null;
  const run = runs.find((r) => r.key === picked.key);
  if (!run || picked.k >= run.trains) return null;
  return run;
}

// 한 방향치를 목록에 올린다. **순환선의 역방향은 역 순서를 뒤집은 또 하나의 노선**이라
// (`Lines.reverse`), 시간표도 수요도 혼잡도 정방향과 똑같은 코드로 돈다. 여기서
// 넘기는 `track`이 그 뒤집힌 노선이고, `line`은 화면이 가리키는 원래 노선이다.
function addService(line, track, pattern, dir, reversed) {
  if (reversed.trains <= 0) return;
  const table = Lines.timetable(track, reversed);
  if (!table) return;
  const plan = Lines.plan(track, reversed);
  const svc = {
    line, pattern, dir,
    stations: track.stations,
    stopAt: reversed.stops,
    headway: plan.headway,
    capacity: Lines.capacityOf(reversed, plan.cycle),
    ride: (i, j) => Lines.rideTime(table, i, j),
    // 막힌 구간을 판 위에 짚으려면 그 방향의 경로와 정차 자리가 있어야 한다.
    path: track.path,
    marks: track.anchors.filter((a) => reversed.stops[a.station]),
  };
  services.push(svc);
  // 열차를 그릴 때 그 운행의 부하를 봐야 하므로 같은 객체를 들려 보낸다.
  runs.push({
    line: track, table, trains: reversed.trains, headway: plan.headway, dir, svc,
    key: `${lines.indexOf(line)}:${line.patterns.indexOf(pattern)}:${dir}`,
  });
}

function syncNetwork() {
  services = [];
  runs = [];
  carLoads = new Map();
  mirrors = new Map();
  for (const line of lines) {
    if (!line.path) continue;
    let back = null;
    if (line.loop) {
      back = Lines.reverse(line);
      if (rebuildLine(back).ok) mirrors.set(line, back); else back = null;
    }
    line.patterns.forEach((pattern, i) => {
      addService(line, line, pattern, 1, pattern);
      if (back) addService(line, back, pattern, -1, back.patterns[i]);
    });
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
  renderStations();
}

function waitingCount() { return demands.filter((od) => !od.served).length; }

// 사람 수는 여기까지만 의미가 있다. 이보다 작은 값은 0으로 본다.
const EPS_HEAD = 1e-6;

// **승강장에는 사람이 계속 모인다.** 타려는 사람이 분당 얼마인지는 수요가 알려 주고,
// 오래 기다린 사람은 포기하고 지상으로 가므로(`PATIENCE`) 줄이 끝없이 자라지는 않는다 —
// 그 시간 상수가 사실상 줄의 천장이다. **빠지는 것은 열차가 설 때뿐이다**(`boardTrains`).
function queue(minutes) {
  if (minutes <= 0) return;
  const want = new Map();
  for (const svc of services) {
    if (!svc.press) continue;
    svc.press.order.forEach((si, k) => {
      const station = svc.stations[si];
      if (station) want.set(station, (want.get(station) || 0) + svc.press.want[k]);
    });
  }

  const fade = minutes / (Demand.PATIENCE / 60);
  const next = new Map();
  for (const station of city.stations) {
    const now = waiting.get(station) || 0;
    const value = Math.max(0, now + (want.get(station) || 0) * minutes - now * fade);
    // **한 명이 안 되는 값도 들고 있는다.** 한때 `>= 1`인 것만 남겼는데, 한 프레임에
    // 모이는 사람은 `분당 인원 × 한 프레임`이라 초당 60프레임에서는 1보다 작다.
    // 그것을 버리면 다음 프레임이 다시 0에서 시작해 **줄이 영영 1을 못 넘는다** —
    // 셈은 처음부터 맞았는데 화면에 아무 역도 안 뜨던 이유가 이것이었다.
    // 몇 명부터 적을지는 그리는 쪽이 정한다.
    if (value > EPS_HEAD) next.set(station, value);
  }
  waiting = next;
}

// **열차가 역을 지날 때 줄이 빠진다.** 시간에 비례해 조금씩 빼면 승강장 숫자가 그저
// 흐르기만 해서, 열차가 서는 것과 줄이 주는 것이 이어지지 않는다 — "태웠는데 왜 안
// 줄지"가 여기서 났다. 지나온 역이 바뀌는 순간에만 태운다.
//
// 열차가 보여 줄 재차 인원도 같은 순간에 갈아 끼운다. 수요는 몇 초마다 다시 풀리므로
// 매번 새로 읽으면 **달리는 중에 사람이 타고 내리는 것처럼** 보인다.
function boardTrains() {
  for (const run of runs) {
    const svc = run.svc;
    if (!svc || !svc.press || !svc.flow) continue;
    for (let k = 0; k < run.trains; k++) {
      const at = Lines.at(run.line, run.table, clock + k * run.headway);
      const seg = segmentOf(svc, at.s);
      const key = `${run.key}:${k}`;
      const held = carLoads.get(key);
      if (held && held.seg === seg && held.dir === at.dir) continue;
      carLoads.set(key, { seg, dir: at.dir, ratio: loadAt(svc, at.s, at.dir) });
      if (!held) continue;   // 첫 프레임에는 지나온 역이 없다

      // 뒤로 가는 열차가 구간 seg에 들어섰다는 것은 seg+1번 역을 떠났다는 뜻이다.
      const stop = at.dir < 0 ? seg + 1 : seg;
      const station = svc.stations[svc.press.order[stop]];
      if (!station) continue;
      // 한 대가 그 역에서 내주는 자리. 분당 빈자리에 배차간격을 곱한 것이다.
      const seats = (svc.press.room[stop] || 0) * run.headway / 60;
      const now = waiting.get(station) || 0;
      const rest = Math.max(0, now - seats);
      if (rest <= EPS_HEAD) waiting.delete(station); else waiting.set(station, rest);
    }
  }
}

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

  boardTrains();
  queue(minutes);

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

  saveGame();
  if (!running() || dt <= 0) return;
  tick(dt * SPEEDS[speed]);
  touch();
  renderTrains();
  // 승강장의 줄이 시계와 함께 오르내린다. 역이 수십 개라 매 프레임 다시 그려도 된다.
  renderStations();
  renderTrainPanel();
  renderMeters();
}

// --- 경로 편집 ---

// **연장은 잠긴 토막을 들고 시작한다.** 역에서 나가는 짧은 구간은 들어오던 방향
// 그대로이고, 플레이어가 끌지도 지우지도 못한다 — 열차가 역에서 꺾을 수 없다는 사실이
// 판에 그대로 나온다. 미리 놓아 주기만 하던 때는 두 번 두드려 지우면 직각이 도로
// 돌아왔다. 순환선을 닫을 때는 반대쪽에도 하나 붙는다(`Lines.stubs`).
function startDraft(kind, line, from, to) {
  const mids = kind === 'extend' ? Lines.stubs(line, to) : [];
  draft = {
    kind, line, from, to, mids,
    // 잠긴 것은 앞뒤에만 있다. 새 점은 그 사이에만 끼고, 몇 개까지 쓸 수 있는지도
    // 잠긴 것을 빼고 센다 — 강제된 것이 플레이어 몫을 갉아먹으면 안 된다.
    lockHead: mids.length ? 1 : 0,
    lockTail: mids.length > 1 ? 1 : 0,
  };
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
  touch();
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
  renderTrainPanel();
  renderMeters();
  renderStatus();
}

// 노선 패널의 혼잡률은 **한 구간**의 이야기인데, 숫자만 띄우면 970%를 보고도 어디를
// 고쳐야 하는지 알 수가 없다. 그 구간을 판 위에 굵게 덧그어 짚어 준다.
function renderJam() {
  const line = lines[sel.line];
  if (mode !== 'lines' || !line || !line.path) return;
  const pattern = line.patterns[sel.pattern];
  // 순환선은 방향마다 제 선로라 막히는 자리도 따로다. 둘 다 짚는다.
  for (const svc of services) {
    if (svc.line !== line || svc.pattern !== pattern) continue;
    if (!svc.peak || svc.peak.at < 0 || svc.crowd <= 1) continue;
    const a = svc.marks[svc.peak.at];
    const b = svc.marks[svc.peak.at + 1];
    if (!a || !b || a.at < 0 || b.at < 0) continue;
    layer.lines.appendChild(svg('path', {
      d: Route.svgPath(svc.path.pts.slice(a.at, b.at + 1)), fill: 'none',
      stroke: 'var(--jam)', 'stroke-width': ART.built * 2.2 * K(),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.55,
    }));
  }
}

function renderLines() {
  clear(layer.lines);
  renderJam();
  for (const line of lines) {
    if (!line.path) continue;
    const chosen = mode === 'lines' && lines[sel.line] === line;
    layer.lines.appendChild(svg('path', {
      d: Route.svgPath(line.path.pts), fill: 'none', stroke: lineColor(line),
      'stroke-width': (chosen ? ART.built * 1.35 : ART.built) * K(),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      opacity: mode === 'lines' && !chosen ? 0.45 : 1,
    }));
  }
}

// 열차는 시간표를 따라 돈다. 한 운행의 열차들은 주기를 배차간격만큼씩 나눠 가지므로,
// 시각에 그 간격을 더해 넣으면 저절로 고르게 퍼진다.
// 열차가 지금 지나는 구간에 실린 몫. 구간은 정차역과 정차역 사이이고, 그 경계는
// 시간표가 쓰는 정차 자리(`marks`)와 같다.
function loadAt(svc, s, dir) {
  if (!svc || !svc.flow || !svc.capacity) return 0;
  const k = segmentOf(svc, s);
  // **실제로 타고 있는 사람이다.** 구간 통행량이 아니라 역마다 내리고 태우며 걸어서
  // 나온 값이라(`Demand.flowOf`) 정원을 넘지 않고, 종점에서 다 내리면 0이 된다.
  // 오는 쪽과 가는 쪽이 달라 방향까지 받는다.
  const side = dir < 0 && svc.flow.back ? svc.flow.back : svc.flow.occ;
  const load = side[k];
  return load == null ? 0 : load / svc.capacity;
}

// **재차 인원은 역을 지날 때만 갈아 끼운다.** 수요는 몇 초마다 다시 풀려서 그때마다
// 값을 새로 읽으면 달리는 중에 숫자가 슬금슬금 바뀌고, 그것이 **달리면서 사람이 타고
// 내리는 것처럼** 보인다. 실제로 값이 바뀌는 자리는 역뿐이라(재 보니 달리는 동안 0번),
// 마지막으로 지난 역이 같으면 들고 있던 값을 그대로 쓴다.
function carLoad(run, k, at) {
  const held = carLoads.get(`${run.key}:${k}`);
  if (held) return held.ratio;
  return loadAt(run.svc, at.s, at.dir);
}

function segmentOf(svc, s) {
  if (!svc || !svc.marks) return 0;
  let k = 0;
  for (let i = 0; i + 1 < svc.marks.length; i++) {
    if (s >= svc.path.s[svc.marks[i].at]) k = i;
  }
  return k;
}

// **열차를 네모로 그리고 안을 실은 만큼 채운다.** 점으로 두면 "몇 대가 도는가"밖에
// 못 읽는데, 정작 알아야 하는 것은 **그 열차가 터지고 있는가**다. 노선 패널의 혼잡률은
// 노선 하나에 숫자 하나라 어느 구간의 열차가 밀리는지를 가리지 못한다.
function renderTrains() {
  clear(layer.trains);
  for (const run of runs) {
    const color = lineColor(run.line);
    const pattern = run.svc && run.svc.pattern;
    for (let k = 0; k < run.trains; k++) {
      const at = Lines.at(run.line, run.table, clock + k * run.headway);
      const ratio = carLoad(run, k, at);
      const n = Lines.carsAt(pattern, run.dir, k);
      const len = ART.carL * K();
      const h = ART.carH * K();
      const gap = ART.carGap * K();
      const ring = ART.carRing * K();
      // **가득 찬 열차는 색이 바뀐다.** 재차 인원은 정원을 넘지 못하므로(넘칠 사람은
      // 역에 줄로 남는다) 넘침을 길이로 낼 수가 없다. 색이 그 자리를 맡는다 —
      // 붉은 칸은 "여기서 더 탈 수 없다"는 뜻이고, 그 옆 역에 줄이 서 있다.
      const over = ratio >= 0.995;
      const total = n * len + (n - 1) * gap;
      const car = svg('g', {
        transform: `translate(${r1(at.x)} ${r1(at.y)}) rotate(${r1(at.ang * 180 / Math.PI)})`,
      });
      for (let i = 0; i < n; i++) {
        // 0번이 맨 앞 칸이다. **채우기도 앞 칸부터**라 어디까지 찼는지가 진행 방향으로
        // 읽히고, 량을 붙이면 뒤로 길어진다.
        const x = total / 2 - len - i * (len + gap);
        // 이음매. 칸 사이를 비워 두면 따로 노는 열차 여러 대로 보인다.
        if (i > 0) {
          car.appendChild(svg('rect', {
            x: r1(x + len), y: -h * 0.12, width: r1(gap) + 1, height: h * 0.24,
            fill: over ? 'var(--jam)' : color,
          }));
        }
        car.appendChild(svg('rect', {
          x: r1(x), y: -h / 2, width: r1(len), height: h, rx: h * 0.18,
          fill: 'var(--station-fill)', stroke: over ? 'var(--jam)' : color,
          // 서 있는 열차는 테를 두껍게 한다. 안을 채우는 자리를 부하가 가져갔으므로
          // 정차는 테로 낸다.
          'stroke-width': at.halted ? ring * 1.9 : ring,
        }));
        const f = Math.max(0, Math.min(1, ratio * n - i));
        if (f > 0.02) {
          const inner = len - ring * 2;
          car.appendChild(svg('rect', {
            x: r1(x + ring), y: -(h - ring * 2) / 2,
            width: r1(inner * f), height: h - ring * 2, rx: (h - ring * 2) * 0.22,
            fill: over ? 'var(--jam)' : color,
          }));
        }
      }
      layer.trains.appendChild(car);
    }
  }
}

// 그 편성이 판 위에서 차지하는 길이. 그리는 쪽과 두드림을 재는 쪽이 같은 값을 써야
// 보이는 대로 잡힌다.
function consistLength(pattern, dir, k) {
  const n = Lines.carsAt(pattern, dir, k);
  return (n * ART.carL + (n - 1) * ART.carGap) * K();
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
    // 끼어들 노선을 통째로 덧그린다. 어느 선에 붙는지가 문장으로만 있으면, 선이
    // 여럿 지나는 자리에서 어느 것을 집은 건지 손으로 확인할 방법이 없다.
    for (const line of ghost.joins) {
      if (!line.path) continue;
      layer.draft.appendChild(svg('path', {
        d: Route.svgPath(line.path.pts), fill: 'none', stroke: lineColor(line),
        'stroke-width': ART.built * 2.4, 'stroke-linecap': 'round',
        'stroke-linejoin': 'round', opacity: 0.35,
      }));
    }
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
    // 잠긴 토막은 **잡을 수 없다는 것이 보여야 한다.** 같은 손잡이로 그리면 끌리지
    // 않는 것이 고장으로 읽힌다 — 작고 속이 찬 점은 "여기 점이 있다"까지만 말한다.
    if (m.lock) {
      layer.handles.appendChild(svg('circle', {
        cx: m.x, cy: m.y, r: ART.handle * 0.5, fill: 'var(--metro)', opacity: 0.45,
      }));
      continue;
    }
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

// 타려다 못 탄 사람이 있는 역. 줄 배지의 색이 여기서 갈린다 — 줄이 서 있는 것과
// 열차가 못 태우는 것은 다른 상태다. 깎기 전 값을 보는 것은 `press`를 쓰는 다른
// 자리와 같은 이유다(깎고 나면 못 탄 사람이 지상으로 가 0이 된다).
function jammedStations() {
  const set = new Set();
  for (const svc of services) {
    const p = svc.press;
    if (!p) continue;
    p.order.forEach((si, k) => {
      const over = (p.left[k] || 0) + (p.leftBack ? (p.leftBack[k] || 0) : 0);
      if (over > 0.5 && svc.stations[si]) set.add(svc.stations[si]);
    });
  }
  return set;
}

function renderStations() {
  clear(layer.stations);
  const active = new Set([
    pending && pending.from, draft && draft.from, draft && draft.to,
  ].filter(Boolean));
  const live = new Set(connectedStations());
  const jammed = jammedStations();

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
      cx: s.x, cy: s.y, r: ART.station * K(),
      fill: live.has(s) ? (line ? lineColor(line) : 'var(--metro)') : 'var(--station-fill)',
      stroke: active.has(s) ? 'var(--metro)' : 'var(--station-ring)',
      'stroke-width': (active.has(s) ? ART.stationRing * 1.5 : ART.stationRing) * K(),
    }));
  }

  // **역마다 지금 열차를 기다리는 사람을 적는다.** 밀린 역만이 아니라 잘 도는 역에도
  // 뜬다 — 열차가 오기 전까지는 어디서나 사람이 모이고, 그 오르내림이 곧 "이 역에
  // 얼마 만에 열차가 오는가"다. 한 명이 안 되는 역만 비운다(0으로 적힐 숫자를 달면
  // 판이 숫자밭이 된다).
  //
  // **색이 정상과 밀린 것을 가른다.** 전에는 밀린 역에만 떠서 전부 `--jam`이었는데,
  // 모든 역에 뜨는 지금 그 색을 그대로 두면 판이 통째로 경고로 보인다. 타려다 못 탄
  // 사람이 있는 역만 붉다.
  for (const [station, count] of waiting) {
    if (count < 1 || !inView(station, -ART.station * 3)) continue;
    const jam = jammed.has(station);
    const text = short(count);
    // **동그라미가 아니라 알약이다.** 원에 네 글자를 넣으면 글자가 테를 뚫고 나간다 —
    // 글자 수에 따라 가로로 늘어나야 어떤 숫자든 안에 들어간다.
    // 배지도 화면에서 같은 크기로 남는다. 다만 표시만큼 굵어지지는 않게 천장을 낮췄다 —
    // 전체 보기에서 숫자가 역보다 커 보이면 판이 숫자밭이 된다.
    const bk = Math.min(K(), 1.35);
    const h = ART.station * 1.55 * bk;
    const w = Math.max(h, h * 0.58 * text.length + h * 0.5);
    const x = station.x + ART.station * 1.5 * bk + (w - h) / 2;
    const y = station.y - ART.station * 1.5 * bk;
    layer.stations.appendChild(svg('rect', {
      x: r1(x - w / 2), y: r1(y - h / 2), width: r1(w), height: r1(h), rx: h / 2,
      fill: jam ? 'var(--jam)' : 'var(--wait)', stroke: 'var(--ground)',
      'stroke-width': r1(h * 0.16),
    }));
    const label = svg('text', {
      x: r1(x), y: r1(y), fill: jam ? 'var(--on-jam)' : 'var(--on-wait)',
      'font-size': r1(h * 0.64), 'font-weight': 800,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    label.textContent = text;
    layer.stations.appendChild(label);
  }

  // 고른 역이 화면 밖으로 나가면 가장자리에 표시를 남긴다. 지도가 화면보다
  // 넓어서, 팬으로 옮긴 순간 무엇을 고른 채인지 알 길이 없어진다.
  const pad = ART.station * 1.4;
  for (const s of active) {
    if (inView(s, pad)) continue;
    layer.stations.appendChild(svg('circle', {
      cx: clamp(s.x, cam.x + pad, cam.x + span().w - pad),
      cy: clamp(s.y, cam.y + pad, cam.y + span().h - pad),
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
  el.wide.setAttribute('aria-pressed', String(atFit()));
  // **셋 다 사람 수이고, 남김없이 갈린다** — 타는 사람 + 못 타는 사람 + 안 타는 사람.
  // 건수로 두었더니 "몇 건"과 "몇 명"이 한 줄에 섞여 서로 견줄 수가 없었다. 단위는
  // 숫자에 붙여 쓰되 조각을 빈칸으로 잇지 않는다(루트 규칙) — 일본어·중국어는 사이를
  // 띄우지 않으므로 사전이 정하게 둔다.
  const heads = Demand.tally(demands);
  el.vCaught.textContent = people(heads.riding);
  el.vWaiting.textContent = people(heads.away);
  el.missedBox.hidden = heads.missed < 1;
  el.vMissed.textContent = people(heads.missed);
  // **수입도 흐름이다.** `분당 수입 0.1`로 두었더니 옆의 명/분과 달리 단위가 값에
  // 안 붙어, 같은 줄에서 혼자 읽는 법이 달랐다.
  el.vIncome.textContent = money(income) + t('metro.unitPerMin');
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

// 고른 열차 하나를 들여다본다. **자리와 재차 인원은 매 프레임 다시 읽는다** — 열차는
// 멈춰 있지 않으므로 값을 붙들어 두면 낡는다. 다만 **단추를 새로 만들지는 않는다**.
// 다시 그리면 누르던 단추가 손 밑에서 사라진다(루트 규칙).
function renderTrainPanel() {
  const run = pickedRun();
  el.trainpanel.hidden = !run;
  if (!run) return;

  const svc = run.svc;
  const line = svc.line;
  const pattern = svc.pattern;
  const at = Lines.at(run.line, run.table, clock + picked.k * run.headway);
  const ratio = carLoad(run, picked.k, at);
  const count = Lines.carsAt(pattern, run.dir, picked.k);
  const seats = count * Lines.CAR_CAPACITY;

  const way = line.loop ? ` · ${t(run.dir < 0 ? 'metro.backward' : 'metro.forward')}` : '';
  // **몇 번째 열차인지 적는다.** 량은 이제 열차마다 따로 붙으므로, 어느 열차를 보고
  // 있는지가 적혀 있지 않으면 어디에 량을 붙였는지 알 수 없다.
  el.tpName.textContent = `${lineName(line)} · ${patternName(line, line.patterns.indexOf(pattern))}${way}`
    + ` · ${fill('metro.trainNo', picked.k + 1)}`;

  // 지금 어디쯤인가. 선 자리는 그 역이고, 달리는 중이면 다음 역이다.
  const stop = at.dir < 0 ? segmentOf(svc, at.s) + 1 : segmentOf(svc, at.s);
  const ahead = at.dir < 0 ? stop - 1 : stop + 1;
  const which = at.halted ? stop : ahead;
  const idx = svc.press && svc.press.order[clamp(which, 0, (svc.press.order.length || 1) - 1)];
  const number = line.stations.indexOf(svc.stations[idx]) + 1;
  el.tpWhere.textContent = number > 0
    ? fill(at.halted ? 'metro.atStation' : 'metro.toStation', number)
    : (at.halted ? t('metro.atStop') : '');

  const full = ratio >= 0.995;
  el.tpFill.style.width = `${Math.round(Math.min(1, ratio) * 100)}%`;
  el.tpBar.classList.toggle('over', full);
  el.tpLoad.textContent = heads(ratio * seats);
  el.tpCap.textContent = `/ ${heads(seats)} · ${Math.round(ratio * 100)}%`;

  el.tpCars.textContent = String(count);
  el.tpMinus.disabled = count <= Lines.CARS.min;
  el.tpPlus.disabled = count >= Lines.CARS.max || budget < Lines.CAR_COST;
  el.tpCarnote.textContent = count >= Lines.CARS.max
    ? fill('metro.carMax', Lines.CARS.max)
    : money(Lines.CAR_COST);
}

// **량은 고른 열차 하나에만 붙는다.** 운행 전체에 한 번에 붙이면 "이 열차가 터진다"를
// 보고 눌러도 다른 열차까지 같이 길어져, 판 위에서 고른 것과 바뀌는 것이 어긋난다.
// 편성이 길고 짧아도 시간표는 그대로다 — 배차는 대수와 주기가 정하고, 량수는 그
// 주기에 실려 가는 자리 수만 바꾼다.
function setCars(delta) {
  const run = pickedRun();
  if (!run) return;
  const pattern = run.svc.pattern;
  const now = Lines.carsAt(pattern, run.dir, picked.k);
  const next = clamp(now + delta, Lines.CARS.min, Lines.CARS.max);
  if (next === now) return;
  if (delta > 0) {
    if (budget < Lines.CAR_COST) { renderStatus('metro.noMoney', true); Sound.play('deny'); return; }
    budget -= Lines.CAR_COST;
  } else budget += Lines.CAR_COST * REFUND;
  Lines.setCarAt(pattern, run.dir, picked.k, next);
  Sound.play(delta > 0 ? 'place' : 'erase');
  syncNetwork();
  refresh();
}

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
    id: i,
    label: line.loop
      ? `${patternName(line, i)} ×${p.trains}/${p.back || 0}`
      : `${patternName(line, i)} ×${p.trains}`,
    on: i === sel.pattern,
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
    button.disabled = !Lines.canToggle(line, i, pattern);
    button.addEventListener('click', () => {
      pattern.stops[i] = !pattern.stops[i];
      Sound.play(pattern.stops[i] ? 'place' : 'erase');
      syncNetwork();
      refresh();
    });
    el.stops.appendChild(button);
  });

  // **순환선은 방향마다 열차를 따로 둔다.** 한 방향으로만 돌면 반대편으로 가려는
  // 승객이 한 바퀴를 다 돌아야 하고, 그 승객까지 같은 선로에 실려 한쪽만 터진다.
  // 마주 오는 열차가 한 선로에 있을 수 없으므로 두 방향은 제 선로를 쓴다 —
  // 배차도 혼잡도 줄마다 따로 난다.
  const back = mirrors.get(line) || null;
  el.trainLabel.textContent = t(line.loop ? 'metro.forward' : 'metro.trains');
  el.backRow.hidden = !line.loop;

  fillTrainRow({
    line, track: line, pattern, dir: 1, count: pattern.trains,
    els: { minus: el.trainMinus, value: el.trainCount, plus: el.trainPlus,
      plan: el.plan, crowd: el.crowd },
  });
  if (line.loop) {
    fillTrainRow({
      line, track: back, pattern: back && back.patterns[sel.pattern], dir: -1,
      count: pattern.back || 0,
      els: { minus: el.backMinus, value: el.backCount, plus: el.backPlus,
        plan: el.backPlan, crowd: el.backCrowd },
    });
  }
}

// 한 방향치 줄을 채운다. 정방향과 역방향이 같은 값을 같은 자리에서 읽게 하려고 하나로
// 모았다 — 따로 쓰면 한쪽만 고치는 일이 난다.
function fillTrainRow({ line, track, pattern, dir, count, els }) {
  els.value.textContent = String(count);
  els.minus.disabled = count <= 0;
  els.plus.disabled = count >= Lines.MAX_TRAINS || budget < Lines.TRAIN_COST;

  const ready = track && track.path && pattern;
  const p = ready ? Lines.plan(track, pattern) : null;
  const svc = services.find((x) => x.line === line
    && x.pattern === line.patterns[sel.pattern] && x.dir === dir);
  const crowd = svc ? Math.round(svc.crowd * 100) : 0;
  // **선로 한계에 닿았으면 그렇게 적는다.** 열차를 더 넣어도 배차가 줄지 않는데,
  // 화면에 그 말이 없으면 혼잡을 보고 열차부터 더 사게 된다 — 돈만 나간다.
  const held = ready && Lines.holdFactor(track, pattern) > 1.001;
  els.plan.textContent = p && count > 0
    ? `${t('metro.cycle')} ${mmss(p.cycle)} · ${t('metro.headway')} ${mmss(p.headway)}`
      + (held ? ` (${t('metro.tracked')})` : '')
    : '';
  els.plus.disabled = els.plus.disabled || held;
  // 혼잡률은 **깎기 전의 부하**다. 100%를 넘으면 그만큼이 못 타고 지상으로 간다.
  els.crowd.textContent = svc ? `${t('metro.crowd')} ${crowd}%` : '';
  els.crowd.classList.toggle('over', crowd > 100);
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
  if (ghost) {
    text = ghost.why ? t(`metro.bad.${ghost.why}`)
      : ghost.joins.length ? fill('metro.ghostJoin', ghost.joins.map((l) => lines.indexOf(l) + 1).join('·'))
      : t('metro.ghostHint');
    bad = !!ghost.why;
  }
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
  const scale = span().w / rect.width;
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
    if (m.lock) return;
    const d = Geom.dist(w.x, w.y, m.x, m.y);
    if (d < best) { best = d; hit = i; }
  });
  return hit;
}

// 잠긴 점을 짚었는가. 그냥 지나치면 그 자리에서 **새 점이 생겨** 토막이 꺾인다 —
// 잠근 점 위를 누르는 것은 십중팔구 그 점을 만지려는 것이다.
function grabLocked(w) {
  let hit = -1;
  let best = HIT_PX * w.scale;
  draft.mids.forEach((m, i) => {
    if (!m.lock) return;
    const d = Geom.dist(w.x, w.y, m.x, m.y);
    if (d < best) { best = d; hit = i; }
  });
  return hit;
}

// 새 점을 끼울 수 있는 자리인가. 잠긴 토막 위에서 잡으면 그 토막을 꺾는 점이 생겨
// 잠근 뜻이 없어진다.
function freeSpan() {
  return { lo: draft.lockHead || 0, hi: draft.mids.length - (draft.lockTail || 0) };
}

// **편집은 자기 것 위에서 시작한 끌기만 가져간다.** 손잡이와 그은 선, 그리고 임시
// 역이 편집의 것이고 나머지는 전부 팬이다. 이 경계가 없으면 지도를 옮기려다
// 노선이 휘고, 노선을 휘려다 지도가 밀린다.
// 판 위에 올라와 있는 손가락들. **둘이 되는 순간 집기로 넘어간다** — 한 손가락으로
// 하던 끌기는 그 자리에서 놓아 준다. 손가락 좌표를 우리가 읽는 것이라 브라우저의 확대와는
// 상관이 없고, `shared/base.js`가 막아 둔 것도 그대로다.
const pointers = new Map();
let pinch = null;

function pinchPair() {
  const [a, b] = [...pointers.values()];
  if (!a || !b) return null;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return d > 0 ? { d, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}

function startPinch() {
  const at = pinchPair();
  if (!at) return;
  drag = null;   // 집는 중에는 끌지 않는다. 지금까지 끈 것은 그대로 둔다
  pinch = { d0: at.d, zoom0: zoom, hold: worldAtClient(at.x, at.y) };
}

// 집는 동안에는 **처음 잡은 땅이 두 손가락 가운데에 붙어 다닌다.** 그래서 벌리고 오므리는
// 것만이 아니라 두 손가락을 함께 옮기는 것으로 지도가 따라온다.
function movePinch() {
  const at = pinchPair();
  if (!at || !pinch) return;
  zoomTo(pinch.zoom0 * (at.d / pinch.d0), at.x, at.y, pinch.hold);
}

function onDown(event) {
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2) { startPinch(); return; }
  if (pinch) return;
  const w = toWorld(event);

  // 전체 보기에서는 편집이 없다. 판이 삼분의 일이라 몇 미터를 다투는 조작이
  // 정확할 수 없고, 여기서 하는 일은 어디로 갈지 고르는 것 하나다.
  if (atFit()) {
    drag = {
      kind: 'pan', station: null, moved: 0, at: { x: w.x, y: w.y },
      camX: cam.x, camY: cam.y, sx: event.clientX, sy: event.clientY,
    };
    el.map.setPointerCapture(event.pointerId);
    return;
  }

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

    if (grabLocked(w) >= 0) {
      renderStatus('metro.lockedLeg', true);
      Sound.play('deny');
      return;
    }

    // 선을 잡는다. 판정은 다듬어진 곡선이 아니라 찍은 점들의 꺾은선으로 한다 —
    // 새 점을 몇 번째 자리에 끼울지가 그 꺾은선에서만 나온다.
    const ctrl = [draft.from, ...draft.mids, draft.to];
    const near = Geom.nearestOnPolyline(w.x, w.y, ctrl);
    if (near.d < GRAB_PX * w.scale) {
      const free = freeSpan();
      const index = near.index - 1;
      // 잠긴 토막 위에서 잡으면 그 토막이 꺾여 잠근 뜻이 없어진다.
      if (index < free.lo || index > free.hi) {
        renderStatus('metro.lockedLeg', true);
        Sound.play('deny');
        return;
      }
      if (draft.mids.length - free.lo - (draft.lockTail || 0) >= MAX_MIDS) {
        renderStatus('metro.maxMids', true);
        Sound.play('deny');
        return;
      }
      pushHistory();
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
    kind: 'pan', station, train: draft ? null : trainAt(w), moved: 0, at: { x: w.x, y: w.y },
    camX: cam.x, camY: cam.y, sx: event.clientX, sy: event.clientY,
  };
  el.map.setPointerCapture(event.pointerId);
}

function onMove(event) {
  if (pointers.has(event.pointerId)) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (pinch) { movePinch(); return; }
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
  pointers.delete(event.pointerId);
  if (pinch) {
    // 손가락이 하나 남아도 집기를 이어 가지 않는다. 남은 손가락으로 지도가 확 튀는 것보다
    // 한 번 놓았다 다시 잡는 편이 예측된다.
    if (pointers.size < 2) pinch = null;
    drag = null;
    return;
  }
  if (!drag) return;
  if (el.map.hasPointerCapture(event.pointerId)) el.map.releasePointerCapture(event.pointerId);
  const done = drag;
  drag = null;
  if (done.kind !== 'pan' || done.moved > TAP_PX) return;

  // 전체 보기에서 누른 자리로 내려간다. 단추로 나오면 들어갈 때 보던 자리로
  // 돌아와, 반대편을 보려고 연 것이 헛일이 된다.
  if (atFit()) { setFit(false, done.at); return; }

  // **열차가 역보다 먼저다.** 역에 선 열차를 누르면 그 열차를 보고 싶은 것이지
  // 노선을 잇고 싶은 것이 아니다 — 잇는 것은 열차가 없는 쪽 역에서 하면 된다.
  if (done.train) { picked = done.train; Sound.play('select'); refresh(); return; }
  if (picked) { picked = null; refresh(); }

  if (mode === 'build') tapBuild(done);
  else {
    // **노선 모드에서도 역을 눌러 잇는다.** 정차역을 만지다 "여기서 한 정거장 더"가
    // 떠오르는 것이 자연스러운데, 그때마다 모드를 옮겨 다니게 하면 흐름이 끊긴다.
    if (mode === 'lines' && done.station) selectLineOf(done.station);
    tapRun(done.station);
  }
}

// --- 건설 모드 ---

// 이미 지나가는 노선 아래에 놓은 역은 그 노선에 끼워 넣는다. 끼워 넣은 사본을 실제로
// 지어 봐서 통과한 것만 센다 — 역이 끼면 양옆 곡선의 팔이 짧아져 반경이 모자랄 수 있고,
// 그때는 끼우지 않고 그냥 역만 놓는다.
function joinsFor(x, y) {
  const out = [];
  for (const line of lines) {
    const ins = Lines.withInsertion(line, { x, y }, JOIN_SNAP);
    if (!ins || !Lines.rebuild(ins.line, null).ok) continue;
    out.push(line);
  }
  return out;
}

function moveGhost(x, y) {
  const why = City.canPlaceStation(city, x, y);
  ghost = { x, y, why, joins: why ? [] : joinsFor(x, y) };
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
    const station = City.addStation(city, ghost.x, ghost.y);
    budget -= STATION_COST;
    // **선로는 이미 그 위를 지나고 있으므로 다시 뚫을 것이 없다** — 역값만 받는다.
    const joined = [];
    for (const line of ghost.joins) {
      const at = lines.indexOf(line);
      const ins = Lines.withInsertion(line, station, JOIN_SNAP);
      if (at < 0 || !ins || !rebuildLine(ins.line).ok) continue;
      lines[at] = ins.line;
      joined.push(at + 1);
    }
    ghost = null;
    Sound.play('place');
    syncNetwork();
    refresh();
    if (joined.length) renderStatus('metro.stationJoined', false, joined.join('·'));
    else renderStatus('metro.stationBuilt');
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

// **마우스 휠(과 트랙패드)로도 배율을 바꾼다.** 폰에는 손가락 둘이 있지만 데스크톱에는
// 없다. 화살표가 가리키는 땅을 붙들어 둔 채 키우고 줄인다.
//
// `deltaMode`가 기기마다 달라(픽셀·줄·쪽) 그대로 쓰면 어떤 기기에서는 한 번에 끝까지
// 간다. 픽셀로 맞춘 뒤 지수로 먹이는 것은 **배율이 곱으로 움직여야** 같은 손짓이 어느
// 배율에서나 같은 만큼 바꾸기 때문이다.
const WHEEL_RATE = 0.0016;

el.map.addEventListener('wheel', (event) => {
  event.preventDefault();
  const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  zoomTo(zoom * Math.exp(-event.deltaY * step * WHEEL_RATE), event.clientX, event.clientY);
}, { passive: false });

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

function setTrains(delta, dir = 1) {
  const line = lines[sel.line];
  if (!line) return;
  const pattern = line.patterns[sel.pattern];
  const key = dir < 0 ? 'back' : 'trains';
  const now = pattern[key] || 0;
  const next = clamp(now + delta, 0, Lines.MAX_TRAINS);
  if (next === now) return;
  if (delta > 0) {
    if (budget < Lines.TRAIN_COST) { renderStatus('metro.noMoney', true); Sound.play('deny'); return; }
    budget -= Lines.TRAIN_COST;
  } else {
    budget += Lines.TRAIN_COST * REFUND;
    // 줄어든 자리의 량도 함께 판다. 남겨 두면 다시 열차를 넣었을 때 사지도 않은
    // 긴 편성이 딸려 온다.
    for (let k = next; k < now; k++) {
      budget += (Lines.carsAt(pattern, dir, k) - Lines.CARS.base) * Lines.CAR_COST * REFUND;
      Lines.setCarAt(pattern, dir, k, Lines.CARS.base);
    }
  }
  pattern[key] = next;
  Sound.play(delta > 0 ? 'place' : 'erase');
  syncNetwork();
  refresh();
}

el.trainPlus.addEventListener('click', () => setTrains(1));
el.trainMinus.addEventListener('click', () => setTrains(-1));
el.tpPlus.addEventListener('click', () => setCars(1));
el.tpMinus.addEventListener('click', () => setCars(-1));
el.tpClose.addEventListener('click', () => { picked = null; Sound.play('select'); refresh(); });

el.backPlus.addEventListener('click', () => setTrains(1, -1));
el.backMinus.addEventListener('click', () => setTrains(-1, -1));

el.remove.addEventListener('click', removeStation);

// 배속은 단추 하나를 돌려 쓴다. 멈춤·보통·빠름 셋뿐이라 고르개를 따로 두면
// 머리줄이 그만큼 좁아지는데, 얻는 것이 없다.
el.wide.addEventListener('click', () => setFit(!atFit()));

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

// **탭을 떠날 때는 주기를 기다리지 않는다.** 폰에서 앱을 바꾸거나 화면을 끄면 그대로
// 회수될 수 있어, 마지막 몇 초가 아니라 판 전체가 날아간다. `pagehide`와 `visibilitychange`
// 둘 다 듣는 것은 기기마다 나는 쪽이 다르기 때문이다.
window.addEventListener('pagehide', () => saveGame(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });

// 하던 판이 있으면 그것으로 시작한다.
if (!loadGame()) makeCity(seed, level);
requestAnimationFrame(frame);

})();

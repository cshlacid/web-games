'use strict';

// 화면과 조작. 규칙과 계산은 citygen.js·route.js에 있고 여기서는 그리기만 한다.
(function () {

const City = window.MetroCity;
const Route = window.MetroRoute;
const Geom = window.MetroGeom;
const Sound = window.MetroSound;
const NS = 'http://www.w3.org/2000/svg';
const VIEW = City.VIEW;

const MAX_MIDS = 3;
const LEVEL_KEY = 'web-games.metro.level';

// 손가락 판정은 화면 픽셀로 잡고 지도 좌표로 환산해 쓴다. 지도가 화면 폭에 맞춰
// 늘어나므로 지도 좌표로 적어 두면 큰 화면에서 판정이 좁아진다.
const GRAB_PX = 22;    // 선을 잡는 거리
const HIT_PX = 26;     // 손잡이·역을 집는 거리
const SNAP_PX = 15;    // 도로 자석이 당기는 거리
const TAP_PX = 7;      // 이만큼 안 움직였으면 끌기가 아니라 두드림으로 본다
const DOUBLE_MS = 320; // 두 번 두드림으로 볼 간격

// 그림 크기는 지도 좌표(=미터)로 적는다. 한 화면에 VIEW.w만큼 들어오므로 폰에서
// 대략 1px ≈ 6m다.
const ART = {
  station: 62, stationRing: 18,
  draft: 34, built: 40, slowHalo: 24,
  handle: 46, handleRing: 14,
  label: 78,
};

const el = {};
for (const id of ['map', 'status', 'readout', 'actions', 'spent', 'newCity', 'levels',
  'undo', 'cancel', 'confirm', 'help', 'helpOpen', 'helpClose', 'toggleBgm', 'toggleSfx']) {
  el[id] = document.getElementById(id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
}
const layer = {};
for (const name of ['roads', 'buildings', 'lines', 'draft', 'stations', 'handles']) {
  layer[name] = document.getElementById(`layer-${name}`);
}
const value = {
  cost: document.getElementById('v-cost'),
  time: document.getElementById('v-time'),
  length: document.getElementById('v-length'),
  speed: document.getElementById('v-speed'),
};
const mix = {
  road: document.getElementById('mix-road'),
  empty: document.getElementById('mix-empty'),
  building: document.getElementById('mix-building'),
};
const lenOut = {
  road: document.getElementById('len-road'),
  empty: document.getElementById('len-empty'),
  building: document.getElementById('len-building'),
};

let city = null;
let seed = Math.floor(Math.random() * 9999) + 1;
let level = 1;
try {
  const saved = Number(localStorage.getItem(LEVEL_KEY));
  if (Number.isInteger(saved) && saved >= 0 && saved < City.LEVELS.length) level = saved;
} catch { /* 저장된 값이 없거나 접근 불가: 기본값 */ }

const cam = { x: 0, y: 0 };
let built = [];
let spent = 0;
let first = null;   // 처음 고른 역
let edit = null;    // { from, to, mids }
let drag = null;
let lastTap = { index: -1, at: 0 };
let history = [];

const t = (key) => SharedI18n.t(key);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r1 = (v) => Math.round(v * 10) / 10;

// --- 도시 ---

function makeCity(nextSeed, nextLevel) {
  seed = nextSeed;
  level = nextLevel;
  try { localStorage.setItem(LEVEL_KEY, String(level)); } catch { /* 무시 */ }
  city = City.create(seed, level);
  built = [];
  spent = 0;
  first = null;
  edit = null;
  history = [];
  drag = null;
  setCam(city.core.x - VIEW.w / 2, city.core.y - VIEW.h / 2);
  drawCity();
  renderLevels();
  renderAll();
  setStatus('metro.pickFirst');
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

// 도시는 씨앗이 바뀔 때만 그린다. 그리고 **조각 하나에 요소 하나씩 두지 않는다** —
// 건물이 이천 채인데 팬 한 번마다 그 전부를 다시 칠해야 한다. 같은 색·같은 굵기끼리
// 한 `path`로 묶으면 도시 전체가 예닐곱 개로 줄어든다.
function drawCity() {
  clear(layer.roads);
  clear(layer.buildings);

  const byWidth = new Map();
  for (const road of city.roads) {
    if (!byWidth.has(road.w)) byWidth.set(road.w, []);
    byWidth.get(road.w).push(road);
  }
  const widths = [...byWidth.keys()].sort((a, b) => b - a);

  // 길은 두 번 긋는다 — 넓고 어두운 것 위에 좁고 밝은 것. 한 번만 그으면 이웃한
  // 길끼리 경계가 없어 블록이 아니라 한 덩어리로 보인다. 테두리를 먼저 다 깔고
  // 속을 덮어야 가는 길의 테두리가 굵은 길을 가로지르지 않는다.
  //
  // **골목은 큰길보다 어둡게 칠한다.** 구시가지는 길이 촘촘해 화면의 절반 가까이가
  // 길인데, 그것을 전부 흰색으로 두면 건물이 아니라 흰 잡음으로 보인다.
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

  const byKind = { home: [], shop: [], office: [] };
  for (const b of city.buildings) byKind[b.kind].push(b);
  for (const kind of ['home', 'shop', 'office']) {
    layer.buildings.appendChild(svg('path', {
      d: byKind[kind].map((b) => `M${r1(b.x)} ${r1(b.y)}h${r1(b.w)}v${r1(b.h)}h${r1(-b.w)}z`).join(''),
      fill: `var(--${kind})`,
    }));
  }
}

// --- 카메라 ---
// 도시가 화면보다 네 배 넓다. 창을 옮기는 것이 팬이고, 확대는 없다 —
// shared/base.js가 손가락 둘 이상의 touchmove를 문서 전체에서 취소하기 때문에
// 자체 핀치 줌을 짜도 이벤트가 오지 않는다.
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

// --- 편집 상태 ---

function recompute() {
  if (!edit) return;
  const pts = [edit.from, ...edit.mids, edit.to];
  edit.path = Route.build(pts);
  edit.prof = edit.path.ok ? Route.profile(edit.path) : null;
  edit.cost = edit.path.ok ? Route.cost(edit.path, (x, y) => City.classify(city, x, y)) : null;
}

function startEdit(from, to) {
  edit = { from, to, mids: [] };
  first = null;
  history = [];
  // 두 역이 한 화면에 안 들어올 수 있다. 가운데로 옮겨 두면 적어도 어느 쪽으로
  // 이어지는지는 보인다.
  centerOn((from.x + to.x) / 2, (from.y + to.y) / 2);
  recompute();
  renderAll();
  setStatus('metro.editHint');
  Sound.play('select');
}

function pushHistory() {
  if (!edit) return;
  history.push(JSON.stringify(edit.mids));
  if (history.length > 40) history.shift();
}

// --- 그리기 ---

function renderAll() {
  renderLines();
  renderDraft();
  renderStations();
  renderHandles();
  renderPanel();
}

function renderLines() {
  clear(layer.lines);
  if (built.length === 0) return;
  layer.lines.appendChild(svg('path', {
    d: built.map((line) => line.d).join(''), fill: 'none', stroke: 'var(--metro)',
    'stroke-width': ART.built, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));
}

// 제한속도가 걸린 토막을 이어 붙인다. 점마다 따로 칠하면 같은 곡선이 여러 조각으로
// 끊겨 보이고, 숫자도 조각 수만큼 찍힌다.
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
  if (!edit) return;

  if (!edit.path.ok) {
    // 지을 수 없는 경로는 찍은 점을 그대로 잇는 점선으로 보여 준다. 다듬어진 선이
    // 아예 없으므로 그릴 것이 이것뿐이고, 어느 모서리가 문제인지도 함께 짚는다.
    const pts = [edit.from, ...edit.mids, edit.to];
    layer.draft.appendChild(svg('path', {
      d: Route.svgPath(pts), fill: 'none', stroke: 'var(--under)',
      'stroke-width': ART.draft, 'stroke-dasharray': `${ART.draft} ${ART.draft * 1.2}`,
      'stroke-linecap': 'round', opacity: 0.8,
    }));
    if (edit.path.at != null) {
      const bad = pts[edit.path.at];
      layer.draft.appendChild(svg('circle', {
        cx: bad.x, cy: bad.y, r: ART.handle * 2.2, fill: 'none',
        stroke: 'var(--under)', 'stroke-width': ART.handleRing * 1.6,
      }));
    }
    return;
  }

  const runs = slowRuns(edit.path);

  // 느린 구간은 본선 **아래** 더 굵게 깔아 테두리처럼 보이게 한다. 위에 덮으면
  // 노선 색이 가려져 어느 노선인지 읽히지 않는다.
  for (const run of runs) {
    layer.draft.appendChild(svg('path', {
      d: Route.svgPath(edit.path.pts, run.from, run.to), fill: 'none',
      stroke: 'var(--slow)', 'stroke-width': ART.draft + ART.slowHalo,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  }

  layer.draft.appendChild(svg('path', {
    d: Route.svgPath(edit.path.pts), fill: 'none', stroke: 'var(--metro)',
    'stroke-width': ART.draft, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));

  // 건물 밑은 본선 위에 덮는다. 돈이 새는 자리라 가장 먼저 보여야 한다.
  if (edit.cost.runs.length) {
    layer.draft.appendChild(svg('path', {
      d: edit.cost.runs.map((run) => Route.svgPath(edit.path.pts, run.from, run.to)).join(''),
      fill: 'none', stroke: 'var(--under)', 'stroke-width': ART.draft, 'stroke-linecap': 'butt',
    }));
  }

  for (const run of runs) {
    const at = edit.path.pts[Math.floor((run.from + run.to) / 2)];
    const label = svg('text', {
      x: at.x, y: at.y - ART.draft, fill: 'var(--slow)', 'font-size': ART.label,
      'font-weight': 800, 'text-anchor': 'middle', 'paint-order': 'stroke',
      stroke: 'var(--ground)', 'stroke-width': 14, 'stroke-linejoin': 'round',
    });
    label.textContent = `${Math.round(run.lim * 3.6)}km/h`;
    layer.draft.appendChild(label);
  }
}

function renderStations() {
  clear(layer.stations);
  const active = new Set([first, edit && edit.from, edit && edit.to].filter(Boolean));

  for (const s of city.stations) {
    if (!inView(s, -ART.station * 2)) continue;   // 화면 밖은 그리지 않는다
    layer.stations.appendChild(svg('circle', {
      cx: s.x, cy: s.y, r: ART.station, fill: 'var(--station-fill)',
      stroke: active.has(s) ? 'var(--metro)' : 'var(--station-ring)',
      'stroke-width': active.has(s) ? ART.stationRing * 1.5 : ART.stationRing,
    }));
  }

  // **고른 역이 화면 밖으로 나가면 가장자리에 표시를 남긴다.** 지도가 화면보다
  // 넓어지면서, 한 역을 고르고 팬으로 옮긴 순간 무엇을 고른 채인지 알 길이
  // 없어졌다. 가장자리로 밀어 붙인 점 하나가 그 자리를 가리킨다.
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

function renderHandles() {
  clear(layer.handles);
  if (!edit) return;
  for (const m of edit.mids) {
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

function renderLevels() {
  clear(el.levels);
  City.LEVELS.forEach((spec, i) => {
    const button = document.createElement('button');
    button.className = 'pick';
    button.type = 'button';
    button.textContent = t(`metro.${spec.id}`);
    button.setAttribute('aria-pressed', String(i === level));
    button.addEventListener('click', () => {
      if (i === level) return;
      Sound.play('select');
      makeCity(seed + 1, i);
    });
    el.levels.appendChild(button);
  });
}

// --- 숫자 ---

function money(v) { return `${v.toFixed(1)}${t('metro.unitMoney')}`; }

function metres(v) {
  return v < 1000 ? `${Math.round(v)}m` : `${(v / 1000).toFixed(2)}km`;
}

function clock(sec) {
  // 초를 먼저 반올림한다. 분을 먼저 떼면 119.6초가 "1:60"으로 나온다.
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  return `${m}:${String(total - m * 60).padStart(2, '0')}`;
}

function renderPanel() {
  el.spent.textContent = money(spent);
  const live = edit && edit.path.ok;
  el.readout.hidden = !edit;
  el.actions.hidden = !edit;
  el.confirm.disabled = !live;
  el.undo.disabled = !edit || history.length === 0;
  if (!edit) return;

  if (!live) {
    for (const k in value) value[k].textContent = '–';
    for (const k in mix) mix[k].style.flexGrow = '0';
    for (const k in lenOut) lenOut[k].textContent = '–';
    return;
  }

  value.cost.textContent = money(edit.cost.cost);
  value.time.textContent = clock(edit.prof.time);
  value.length.textContent = metres(edit.path.length);
  // 이 노선의 발목을 잡는 속도. 최고 속도는 곧은 구간이 늘 최고속에 닿아 언제나
  // 같은 값이 나오고, 평균 속도는 길이가 늘면 같이 올라 곡선의 손해가 묻힌다.
  // 가장 엄한 제한 하나만 플레이어가 끄는 대로 정직하게 움직인다.
  value.speed.textContent = `${Math.round(Math.min(...edit.path.nodeLim) * 3.6)}km/h`;

  for (const kind of ['road', 'empty', 'building']) {
    mix[kind].style.flexGrow = String(edit.cost.lengths[kind]);
    lenOut[kind].textContent = metres(edit.cost.lengths[kind]);
  }
}

function setStatus(key, warn = false) {
  el.status.textContent = key ? t(key) : '';
  el.status.classList.toggle('warn', warn);
}

// --- 조작 ---

// 손가락 좌표를 지도 좌표로. 지도는 viewBox와 같은 비율로 못 박혀 있어(style.css)
// 여백이 없으므로 비율 하나와 카메라 위치로 곧장 환산된다.
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
  edit.mids.forEach((m, i) => {
    const d = Geom.dist(w.x, w.y, m.x, m.y);
    if (d < best) { best = d; hit = i; }
  });
  return hit;
}

// **편집은 자기 것 위에서 시작한 끌기만 가져간다.** 손잡이와 그은 선이 편집의
// 것이고, 나머지는 전부 팬이다. 이 경계가 없으면 지도를 옮기려다 노선이 휘고,
// 노선을 휘려다 지도가 밀린다.
function onDown(event) {
  const w = toWorld(event);

  if (edit) {
    const hit = grabHandle(w);
    if (hit >= 0) {
      const now = performance.now();
      if (lastTap.index === hit && now - lastTap.at < DOUBLE_MS) {
        pushHistory();
        edit.mids.splice(hit, 1);
        lastTap = { index: -1, at: 0 };
        Sound.play('erase');
        recompute();
        renderAll();
        setStatus('metro.editHint');
        return;
      }
      lastTap = { index: hit, at: now };
      pushHistory();
      drag = { kind: 'mid', index: hit, snapped: !!edit.mids[hit].snapped };
      el.map.setPointerCapture(event.pointerId);
      return;
    }

    // 선을 잡는다. 판정은 다듬어진 곡선이 아니라 찍은 점들의 꺾은선으로 한다 —
    // 새 점을 **몇 번째 자리에 끼울지**가 그 꺾은선에서만 나온다. 둘의 차이는
    // 모서리에서만 생기고 그나마 잡는 거리 안쪽이다.
    const ctrl = [edit.from, ...edit.mids, edit.to];
    const near = Geom.nearestOnPolyline(w.x, w.y, ctrl);
    if (near.d < GRAB_PX * w.scale) {
      if (edit.mids.length >= MAX_MIDS) {
        setStatus('metro.maxMids', true);
        Sound.play('deny');
        return;
      }
      pushHistory();
      const index = near.index - 1;
      edit.mids.splice(index, 0, { x: near.x, y: near.y });
      drag = { kind: 'mid', index, snapped: false };
      lastTap = { index, at: performance.now() };
      el.map.setPointerCapture(event.pointerId);
      Sound.play('place');
      recompute();
      renderAll();
      setStatus('metro.editHint');
      return;
    }
  }

  // 그 밖은 전부 팬이다. 손을 뗐을 때 거의 움직이지 않았고 역 위에서 시작했으면
  // 두드린 것으로 본다 — 끌기와 두드림을 누르는 순간에 가르려 하면, 역을 짚고
  // 지도를 미는 동작이 통째로 막힌다.
  const station = edit ? null
    : city.stations.find((s) => Geom.dist(w.x, w.y, s.x, s.y) < HIT_PX * 1.3 * w.scale);
  drag = {
    kind: 'pan', station, moved: 0,
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

  const point = {
    x: clamp(w.x, 0, city.world.w),
    y: clamp(w.y, 0, city.world.h),
  };
  const snap = City.snapToRoad(city, point.x, point.y, SNAP_PX * w.scale);
  if (snap) { point.x = snap.x; point.y = snap.y; point.snapped = true; }

  // 자석이 걸리는 순간만 소리로 알린다. 화면의 고리는 손가락에 가려 안 보인다.
  if (!!point.snapped !== drag.snapped) {
    drag.snapped = !!point.snapped;
    if (drag.snapped) Sound.play('snap');
  }

  edit.mids[drag.index] = point;
  recompute();
  renderAll();
  setStatus(edit.path.ok ? 'metro.editHint' : 'metro.sharp', !edit.path.ok);
}

function onUp(event) {
  if (!drag) return;
  if (el.map.hasPointerCapture(event.pointerId)) el.map.releasePointerCapture(event.pointerId);
  const done = drag;
  drag = null;

  if (done.kind !== 'pan' || done.moved > TAP_PX || !done.station) return;

  const station = done.station;
  if (!first) {
    first = station;
    Sound.play('select');
    renderAll();
    setStatus('metro.pickSecond');
  } else if (station === first) {
    first = null;
    renderAll();
    setStatus('metro.pickFirst');
  } else {
    startEdit(first, station);
  }
}

el.map.addEventListener('pointerdown', onDown);
el.map.addEventListener('pointermove', onMove);
el.map.addEventListener('pointerup', onUp);
el.map.addEventListener('pointercancel', onUp);

// --- 단추 ---
// 판이 touch-action: none이라 판 안에서는 click이 나지 않는다. 단추를 전부 판
// 밖에 둔 이유가 이것이다.

el.confirm.addEventListener('click', () => {
  if (!edit || !edit.path.ok) return;
  built.push({ d: Route.svgPath(edit.path.pts), cost: edit.cost.cost, time: edit.prof.time });
  spent += edit.cost.cost;
  edit = null;
  first = null;
  history = [];
  Sound.play('build');
  renderAll();
  setStatus('metro.built');
});

el.cancel.addEventListener('click', () => {
  edit = null;
  first = null;
  history = [];
  Sound.play('erase');
  renderAll();
  setStatus('metro.pickFirst');
});

el.undo.addEventListener('click', () => {
  if (!edit || history.length === 0) return;
  edit.mids = JSON.parse(history.pop());
  Sound.play('erase');
  recompute();
  renderAll();
  setStatus(edit.path.ok ? 'metro.editHint' : 'metro.sharp', !edit.path.ok);
});

el.newCity.addEventListener('click', () => {
  Sound.play('select');
  makeCity(seed + 1, level);
});

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

})();

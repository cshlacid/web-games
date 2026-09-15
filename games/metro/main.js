'use strict';

// 화면과 조작. 규칙과 계산은 citygen.js·route.js에 있고 여기서는 그리기만 한다.
(function () {

const City = window.MetroCity;
const Route = window.MetroRoute;
const Geom = window.MetroGeom;
const Sound = window.MetroSound;
const NS = 'http://www.w3.org/2000/svg';

const MAX_MIDS = 3;

// 손가락 판정은 화면 픽셀로 잡고 지도 좌표로 환산해 쓴다. 지도가 화면 폭에 맞춰
// 늘어나므로 지도 좌표로 적어 두면 큰 화면에서 판정이 좁아진다.
const GRAB_PX = 22;    // 선을 잡는 거리
const HIT_PX = 26;     // 손잡이·역을 집는 거리
const SNAP_PX = 15;    // 도로 자석이 당기는 거리
const DOUBLE_MS = 320; // 두 번 두드림으로 볼 간격

// 그림 크기는 지도 좌표(=미터)로 적는다. 폰에서 지도 폭이 대략 390px이므로
// 1px ≈ 6m로 어림하면 된다.
const ART = {
  station: 62, stationRing: 18,
  draft: 34, built: 40, slowHalo: 24,
  handle: 46, handleRing: 14,
  label: 78,
};

const el = {};
for (const id of ['map', 'status', 'readout', 'actions', 'spent', 'newCity',
  'undo', 'cancel', 'confirm', 'mix', 'help', 'helpOpen', 'helpClose',
  'toggleBgm', 'toggleSfx']) {
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
let built = [];
let spent = 0;
let first = null;   // 처음 고른 역
let edit = null;    // { from, to, mids }
let drag = null;
let lastTap = { index: -1, at: 0 };
let history = [];

const t = (key) => SharedI18n.t(key);

// --- 도시 ---

function makeCity(next) {
  seed = next;
  city = City.create(seed);
  el.map.setAttribute('viewBox', `0 0 ${city.world.w} ${city.world.h}`);
  built = [];
  spent = 0;
  first = null;
  edit = null;
  history = [];
  drawCity();
  renderAll();
  setStatus('metro.pickFirst');
}

function svg(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// 도시는 한 번만 그린다. 오백 채 남짓이라 매 프레임 건드리면 끄는 동안 손이 걸린다.
function drawCity() {
  clear(layer.roads);
  clear(layer.buildings);

  // 길은 두 번 긋는다 — 넓고 어두운 것 위에 좁고 밝은 것. 한 번만 그으면 이웃한
  // 길끼리 경계가 없어 블록이 아니라 한 덩어리로 보인다.
  for (const pass of [{ pad: 6, color: 'var(--road-edge)' }, { pad: 0, color: 'var(--road)' }]) {
    const group = svg('g', { stroke: pass.color, 'stroke-linecap': 'butt' });
    for (const r of city.roads) {
      group.appendChild(svg('line', {
        x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, 'stroke-width': r.w + pass.pad,
      }));
    }
    layer.roads.appendChild(group);
  }

  const byKind = { home: [], shop: [], office: [] };
  for (const b of city.buildings) byKind[b.kind].push(b);
  for (const kind of ['home', 'shop', 'office']) {
    const group = svg('g', { fill: `var(--${kind})` });
    for (const b of byKind[kind]) {
      group.appendChild(svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 3 }));
    }
    layer.buildings.appendChild(group);
  }
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
  const group = svg('g', {
    fill: 'none', stroke: 'var(--metro)', 'stroke-width': ART.built,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  for (const line of built) group.appendChild(svg('path', { d: line.d }));
  layer.lines.appendChild(group);
}

// 제한속도가 걸린 토막을 이어 붙인다. 점마다 따로 칠하면 같은 곡선이 여러 조각으로
// 끊겨 보이고, 숫자도 조각 수만큼 찍힌다.
function slowRuns(path) {
  const runs = [];
  let run = null;
  const full = Route.LIMITS.V_MAX * 0.98;
  for (let i = 0; i < path.nodeLim.length; i++) {
    if (path.nodeLim[i] < full) {
      if (run) run.to = i;
      else { run = { from: i, to: i, lim: path.nodeLim[i] }; runs.push(run); }
      run.lim = Math.min(run.lim, path.nodeLim[i]);
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

  const d = Route.svgPath(edit.path.pts);

  // 느린 구간은 본선 **아래** 더 굵게 깔아 테두리처럼 보이게 한다. 위에 덮으면
  // 노선 색이 가려져 어느 노선인지 읽히지 않는다.
  for (const run of slowRuns(edit.path)) {
    layer.draft.appendChild(svg('path', {
      d: Route.svgPath(edit.path.pts, run.from, run.to), fill: 'none',
      stroke: 'var(--slow)', 'stroke-width': ART.draft + ART.slowHalo,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  }

  layer.draft.appendChild(svg('path', {
    d, fill: 'none', stroke: 'var(--metro)', 'stroke-width': ART.draft,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));

  // 건물 밑은 본선 위에 덮는다. 돈이 새는 자리라 가장 먼저 보여야 한다.
  for (const run of edit.cost.runs) {
    layer.draft.appendChild(svg('path', {
      d: Route.svgPath(edit.path.pts, run.from, run.to), fill: 'none',
      stroke: 'var(--under)', 'stroke-width': ART.draft,
      'stroke-linecap': 'butt',
    }));
  }

  for (const run of slowRuns(edit.path)) {
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
  for (const s of city.stations) {
    const active = s === first || (edit && (s === edit.from || s === edit.to));
    layer.stations.appendChild(svg('circle', {
      cx: s.x, cy: s.y, r: ART.station, fill: 'var(--station-fill)',
      stroke: active ? 'var(--metro)' : 'var(--station-ring)',
      'stroke-width': active ? ART.stationRing * 1.5 : ART.stationRing,
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

// --- 숫자 ---

function money(v) { return `${v.toFixed(1)}${t('metro.unitMoney')}`; }

function metres(v) {
  return v < 1000 ? `${Math.round(v)}m` : `${(v / 1000).toFixed(2)}km`;
}

function clock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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
// 여백이 없으므로 비율 하나로 곧장 환산된다.
function toWorld(event) {
  const rect = el.map.getBoundingClientRect();
  const scale = city.world.w / rect.width;
  return {
    x: (event.clientX - rect.left) * scale,
    y: (event.clientY - rect.top) * scale,
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
      drag = { index: hit, snapped: !!edit.mids[hit].snapped };
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
      drag = { index, snapped: false };
      lastTap = { index, at: performance.now() };
      el.map.setPointerCapture(event.pointerId);
      Sound.play('place');
      recompute();
      renderAll();
      setStatus('metro.editHint');
    }
    return;
  }

  const station = city.stations.find((s) => Geom.dist(w.x, w.y, s.x, s.y) < HIT_PX * 1.3 * w.scale);
  if (!station) return;

  if (!first) {
    first = station;
    Sound.play('select');
    renderAll();
    setStatus('metro.pickSecond');
    return;
  }
  if (station === first) {
    first = null;
    renderAll();
    setStatus('metro.pickFirst');
    return;
  }
  startEdit(first, station);
}

function onMove(event) {
  if (!drag || !edit) return;
  const w = toWorld(event);
  const point = {
    x: Math.max(0, Math.min(city.world.w, w.x)),
    y: Math.max(0, Math.min(city.world.h, w.y)),
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
  drag = null;
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
  makeCity(seed + 1);
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

makeCity(seed);

})();

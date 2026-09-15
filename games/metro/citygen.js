'use strict';

// 도시 한 장을 씨앗 하나와 난이도 하나에서 만든다.
//
// **타일이 아니라 연속 좌표다.** 격자로 두면 건설 판정은 쉬워지지만 방향이 여덟
// 개뿐이라 곡률이라는 개념이 성립하지 않는다. 이 게임은 곡률이 중심이라 벡터로 간다.
(function () {

const Geom = (typeof module !== 'undefined' && module.exports)
  ? require('./geom.js')
  : window.MetroGeom;

// 한 화면에 보이는 창(VIEW)보다 도시(WORLD)가 넉넉히 크다. 차이만큼 팬으로 돈다.
const VIEW = { w: 2400, h: 2700 };
const WORLD = { w: 4800, h: 5400 };

const GRID = 90;             // 공간 색인 칸 크기. 골목이 촘촘한 구시가지에서
                             // 후보가 쏟아지지 않을 만큼 잘게 끊는다
const MAX_BUILDINGS = 2600;  // 안전망. 보통 천오백 채 안팎에서 저절로 멎는다

const ROAD_W = { arterial: 36, avenue: 32, planned: 20, suburb: 18, alley: 13 };

// 구역의 성격. **이 표가 이 게임의 난이도 지형이다.**
//
// 구시가지는 길이 굽고 좁은 데다 건물이 빽빽해서, 도로를 따라가면 느리고 곧게
// 뚫으면 비싸다 — 양쪽이 다 나쁜 자리다. 계획도시는 그 반대로 둘 다 좋다. 나중에
// 수요를 건물 밀도에 비례해 깔면 **돈이 되는 곳이 짓기 어려운 곳**이 되어, 지형
// 자체가 난이도를 만든다.
const DISTRICT = {
  old:     { gap: 80,  jitter: 30, w: ROAD_W.alley,   size: [18, 34], clear: 6,  fill: 0.52 },
  planned: { gap: 155, jitter: 0,  w: ROAD_W.planned, size: [50, 88], clear: 12, fill: 0.46, regular: true },
  suburb:  { gap: 250, jitter: 12, w: ROAD_W.suburb,  size: [36, 64], clear: 10, fill: 0.17 },
};

// 난이도는 구역의 넓이 배합과 건물 밀도로 낸다. 규칙을 바꾸지 않고 지형만 바꾸는
// 것이라, 쉬운 판에서 익힌 감각이 어려운 판에서도 그대로 통한다.
const LEVELS = [
  { id: 'easy',   oldR: 620,  town: [2200, 1900], density: 0.74 },
  { id: 'normal', oldR: 1150, town: [1700, 1450], density: 1.0 },
  { id: 'hard',   oldR: 1750, town: [1100, 950],  density: 1.3 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// --- 공간 색인 ---
// 도로도 건물도 수천 개라 매번 전부 훑을 수 없다. 경로를 끌 때마다 사백 번쯤
// "여기가 어떤 땅인가"를 묻게 되는데, 그 한 번이 전수 검사면 손이 걸린다.

function makeIndex(world, cell) {
  const cols = Math.ceil(world.w / cell);
  const rows = Math.ceil(world.h / cell);
  return { cell, cols, rows, bins: Array.from({ length: cols * rows }, () => []) };
}

function insert(ix, id, minX, minY, maxX, maxY) {
  const c0 = clamp(Math.floor(minX / ix.cell), 0, ix.cols - 1);
  const c1 = clamp(Math.floor(maxX / ix.cell), 0, ix.cols - 1);
  const r0 = clamp(Math.floor(minY / ix.cell), 0, ix.rows - 1);
  const r1 = clamp(Math.floor(maxY / ix.cell), 0, ix.rows - 1);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) ix.bins[r * ix.cols + c].push(id);
}

// 같은 것이 여러 칸에 들어 있어 중복이 섞여 나온다. 받는 쪽이 전부 "가장 가까운
// 것"이나 "하나라도 걸리나"를 묻는 계산이라 중복이 답을 바꾸지 않아 그냥 둔다.
function query(ix, x, y, pad = 0) {
  const c0 = clamp(Math.floor((x - pad) / ix.cell), 0, ix.cols - 1);
  const c1 = clamp(Math.floor((x + pad) / ix.cell), 0, ix.cols - 1);
  const r0 = clamp(Math.floor((y - pad) / ix.cell), 0, ix.rows - 1);
  const r1 = clamp(Math.floor((y + pad) / ix.cell), 0, ix.rows - 1);
  const out = [];
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const bin = ix.bins[r * ix.cols + c];
    for (let i = 0; i < bin.length; i++) out.push(bin[i]);
  }
  return out;
}

// --- 도형 ---

function segSegHit(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b);
  const d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// 선분과 사각형 사이의 최단 거리. 겹칠 때 0을 돌려줘야 하므로 교차 판정을 먼저
// 한다 — 모서리 거리만 재면 사각형을 가로지르는 선분이 "멀다"고 나온다.
function segRectDistance(seg, r) {
  const a = { x: seg.x1, y: seg.y1 };
  const b = { x: seg.x2, y: seg.y2 };
  if (Geom.pointInRect(a.x, a.y, r) || Geom.pointInRect(b.x, b.y, r)) return 0;
  const corners = [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
  for (let i = 0; i < 4; i++) if (segSegHit(a, b, corners[i], corners[(i + 1) % 4])) return 0;
  let best = Infinity;
  for (const c of corners) best = Math.min(best, Geom.nearestOnSegment(c.x, c.y, a.x, a.y, b.x, b.y).d);
  for (const p of [a, b]) {
    const cx = clamp(p.x, r.x, r.x + r.w);
    const cy = clamp(p.y, r.y, r.y + r.h);
    best = Math.min(best, Math.hypot(p.x - cx, p.y - cy));
  }
  return best;
}

function overlaps(a, b, gap) {
  return a.x - gap < b.x + b.w && a.x + a.w + gap > b.x
    && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y;
}

// --- 구역 ---

// 구시가지의 경계는 원이 아니다. 딱 떨어지는 원으로 두면 화면에서 동그란 얼룩으로
// 보여 지형이 아니라 무늬가 된다. 각도에 따라 반지름을 흔들어 둔다.
function coreRadius(core, x, y) {
  const a = Math.atan2(y - core.y, x - core.x);
  return core.r * (0.84 + 0.17 * Math.sin(a * 3 + core.phase) + 0.1 * Math.sin(a * 5 - core.phase * 1.7));
}

function districtAt(city, x, y) {
  const o = city.core;
  if (Math.hypot(x - o.x, y - o.y) < coreRadius(o, x, y)) return 'old';
  const t = city.town;
  if (x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h) return 'planned';
  return 'suburb';
}

// --- 만들기 ---

function axisLines(center, span, gap, rng) {
  const lines = [center];
  for (const dir of [-1, 1]) {
    let at = center;
    for (;;) {
      at += dir * (gap + (rng() - 0.5) * gap * 0.35);
      if (at < gap * 0.4 || at > span - gap * 0.4) break;
      lines.push(at);
    }
  }
  return lines.sort((p, q) => p - q);
}

// 한 줄기의 길. jitter가 0이면 곧은 선분 하나, 크면 굽이치는 꺾은선이 된다.
// **구시가지가 계획도시와 갈리는 곳이 이 한 값이다.**
function street(from, to, jitter, rng) {
  if (jitter === 0) return [from, to];
  const len = Geom.dist(from.x, from.y, to.x, to.y);
  const steps = Math.max(2, Math.round(len / 120));
  const nx = -(to.y - from.y) / len;
  const ny = (to.x - from.x) / len;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    // 양 끝은 큰길에 닿아야 하므로 흔들지 않는다. 가운데로 갈수록 크게 흔들린다.
    const sway = Math.sin(k * Math.PI) * (rng() - 0.5) * 2 * jitter;
    pts.push({
      x: from.x + (to.x - from.x) * k + nx * sway,
      y: from.y + (to.y - from.y) * k + ny * sway,
    });
  }
  return pts;
}

function create(seed = 1, level = 1) {
  const spec = LEVELS[clamp(level, 0, LEVELS.length - 1)];
  const rng = mulberry32((seed * 2654435761) ^ (spec.id.length * 40503));
  const cx = WORLD.w / 2;
  const cy = WORLD.h / 2;

  const core = { x: cx + (rng() - 0.5) * 500, y: cy + (rng() - 0.5) * 500, r: spec.oldR, phase: rng() * Math.PI * 2 };
  const town = {
    w: spec.town[0], h: spec.town[1],
    x: 0, y: 0,
  };
  // 계획도시는 구시가지를 비켜 한쪽에 붙는다 — 현실의 신도시가 그렇다.
  const away = rng() * Math.PI * 2;
  town.x = clamp(core.x + Math.cos(away) * (core.r + town.w * 0.62) - town.w / 2, 120, WORLD.w - town.w - 120);
  town.y = clamp(core.y + Math.sin(away) * (core.r + town.h * 0.62) - town.h / 2, 120, WORLD.h - town.h - 120);

  const city = { seed, level: spec.id, world: WORLD, view: VIEW, core, town, roads: [] };

  // 1) 간선. 지도 전체를 가로지르는 곧은 격자다. 구역이 어떻든 이 뼈대는 같아서
  //    도시가 하나로 이어지고, 역이 설 자리도 여기서 나온다.
  const xs = axisLines(cx, WORLD.w, 600, rng);
  const ys = axisLines(cy, WORLD.h, 600, rng);
  for (const x of xs) city.roads.push({ pts: [{ x, y: 0 }, { x, y: WORLD.h }], w: ROAD_W.arterial, kind: 'arterial' });
  for (const y of ys) city.roads.push({ pts: [{ x: 0, y }, { x: WORLD.w, y }], w: ROAD_W.arterial, kind: 'arterial' });

  // 2) 대로 둘. 격자만 있으면 노선이 전부 ㄱ자로 꺾여 휜 선로를 그릴 자리가 없다.
  for (let k = 0; k < 2; k++) {
    const ang = Math.PI / 4 + (rng() * 0.5 - 0.25) + k * Math.PI / 2;
    const len = Math.hypot(WORLD.w, WORLD.h);
    city.roads.push({
      pts: [
        { x: cx - Math.cos(ang) * len, y: cy - Math.sin(ang) * len },
        { x: cx + Math.cos(ang) * len, y: cy + Math.sin(ang) * len },
      ],
      w: ROAD_W.avenue, kind: 'avenue',
    });
  }

  // 3) 국지도로. 간선 블록마다 그 자리의 구역 성격대로 깐다.
  const blocks = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const b = { x: xs[i], y: ys[j], w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j] };
      b.kind = districtAt(city, b.x + b.w / 2, b.y + b.h / 2);
      blocks.push(b);
      const d = DISTRICT[b.kind];
      b.cuts = { x: [], y: [] };   // 계획도시가 건물을 이 자리에 맞춰 세운다
      for (const axis of ['x', 'y']) {
        const span = axis === 'x' ? b.w : b.h;
        const count = Math.floor(span / d.gap) - 1;
        for (let k = 1; k <= count; k++) {
          // 계획도시는 간격까지 고르다. 길의 모양만 곧고 간격이 흔들리면 화면에서는
          // 그냥 성긴 구시가지로 보인다.
          const t = (k / (count + 1)) * span + (d.regular ? 0 : (rng() - 0.5) * d.gap * 0.3);
          const from = axis === 'x' ? { x: b.x + t, y: b.y } : { x: b.x, y: b.y + t };
          const to = axis === 'x' ? { x: b.x + t, y: b.y + b.h } : { x: b.x + b.w, y: b.y + t };
          b.cuts[axis].push(t);
          city.roads.push({ pts: street(from, to, d.jitter, rng), w: d.w, kind: b.kind });
        }
      }
    }
  }

  // 도로를 선분으로 펴서 색인한다. 반지름만큼 넓혀 넣어야 "중심선에서 w/2 안쪽"
  // 질문이 자기 칸만 보고 답해진다.
  city.segments = [];
  const roadIndex = makeIndex(WORLD, GRID);
  for (const road of city.roads) {
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1];
      const b = road.pts[i];
      const seg = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: road.w };
      const id = city.segments.push(seg) - 1;
      const pad = road.w / 2 + 2;
      insert(roadIndex, id,
        Math.min(a.x, b.x) - pad, Math.min(a.y, b.y) - pad,
        Math.max(a.x, b.x) + pad, Math.max(a.y, b.y) + pad);
    }
  }
  city.roadIndex = roadIndex;

  // 4) 건물. **기각 표집으로 뿌리는 것이 기본이다** — 구시가지의 길은 굽어서 블록이
  //    사각형이 아니고, 칸에 맞춰 놓으면 굽은 길 위에 건물이 올라앉는다.
  city.buildings = [];
  const buildIndex = makeIndex(WORLD, GRID);
  const maxD = Math.hypot(cx, cy);

  function place(lot, d, kindOfBlock) {
    if (city.buildings.length >= MAX_BUILDINGS) return false;
    if (lot.w < 16 || lot.h < 16) return false;

    const mx = lot.x + lot.w / 2;
    const my = lot.y + lot.h / 2;
    const reach = Math.hypot(lot.w, lot.h) / 2;

    for (const id of query(roadIndex, mx, my, reach + 40)) {
      const seg = city.segments[id];
      const need = seg.w / 2 + d.clear;
      // 값싼 거름망을 먼저 놓는다. 중심에서 선분까지의 거리가 대각선 반쪽보다도 멀면
      // 사각형 어느 구석도 닿을 수 없다. 이것 없이 후보마다 선분–사각형 거리를 다
      // 재면 어려움 한 판을 만드는 데 0.4초가 넘게 든다.
      if (Geom.nearestOnSegment(mx, my, seg.x1, seg.y1, seg.x2, seg.y2).d > reach + need) continue;
      if (segRectDistance(seg, lot) < need) return false;
    }
    for (const id of query(buildIndex, mx, my, reach + d.clear)) {
      if (overlaps(lot, city.buildings[id], d.clear * 0.6)) return false;
    }

    // 도심일수록 업무·상업, 외곽일수록 주거. 지금은 쓰지 않지만 시간대 수요
    // (아침엔 주거 → 업무)를 붙일 때 생성기를 다시 짜지 않으려고 미리 넣어 둔다.
    const r = rng();
    lot.kind = kindOfBlock === 'suburb'
      ? (r < 0.12 ? 'shop' : 'home')
      : (r < 0.36 ? 'office' : (r < 0.68 ? 'shop' : 'home'));
    const id = city.buildings.push(lot) - 1;
    insert(buildIndex, id, lot.x, lot.y, lot.x + lot.w, lot.y + lot.h);
    return true;
  }

  // 계획도시만 길이 나눈 칸에 맞춰 세운다. **여기서 무작위로 뿌리면 화면에서
  // 계획도시가 그냥 성긴 구시가지로 보인다** — 길이 곧다는 것만으로는 눈에 띄지
  // 않고, 건물이 줄을 맞춰야 "계획해서 지은 동네"로 읽힌다.
  function fillRegular(b, d) {
    const edges = (cuts, span) => [0, ...cuts.slice().sort((p, q) => p - q), span];
    const ex = edges(b.cuts.x, b.w);
    const ey = edges(b.cuts.y, b.h);
    for (let i = 0; i + 1 < ex.length; i++) {
      for (let j = 0; j + 1 < ey.length; j++) {
        // 칸의 가장자리가 블록의 가장자리면 그쪽은 간선도로라 더 물려야 한다.
        const left = (i === 0 ? ROAD_W.arterial : d.w) / 2 + d.clear;
        const right = (i + 2 === ex.length ? ROAD_W.arterial : d.w) / 2 + d.clear;
        const top = (j === 0 ? ROAD_W.arterial : d.w) / 2 + d.clear;
        const bottom = (j + 2 === ey.length ? ROAD_W.arterial : d.w) / 2 + d.clear;
        const cell = {
          x: b.x + ex[i] + left, y: b.y + ey[j] + top,
          w: ex[i + 1] - ex[i] - left - right, h: ey[j + 1] - ey[j] - top - bottom,
        };
        if (cell.w < 20 || cell.h < 20) continue;

        // 칸이 크면 두 줄 두 칸으로 나눈다. 한 칸을 통째로 채우면 건물 하나가
        // 블록만 해져서 지하철이 피해 갈 자리가 아예 없어진다.
        const cols = cell.w > 104 ? 2 : 1;
        const rows = cell.h > 104 ? 2 : 1;
        const inner = 11;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (rng() < 0.12) continue;   // 빈 터를 조금 남긴다
            place({
              x: cell.x + (cell.w / cols) * c + (c ? inner / 2 : 0),
              y: cell.y + (cell.h / rows) * r + (r ? inner / 2 : 0),
              w: cell.w / cols - (cols > 1 ? inner / 2 : 0),
              h: cell.h / rows - (rows > 1 ? inner / 2 : 0),
            }, d, b.kind);
          }
        }
      }
    }
  }

  for (const b of blocks) {
    const d = DISTRICT[b.kind];
    if (d.regular) { fillRegular(b, d); continue; }

    // 외곽은 도시에서 멀어질수록 더 성기다. 같은 비율로 깔면 지도 끝까지 똑같이
    // 생긴 동네가 이어져 어디쯤 와 있는지 알 수가 없다.
    const away = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) / maxD;
    const fade = b.kind === 'suburb' ? clamp(1.3 - away * 1.7, 0.16, 1) : 1;

    // 목표 채수는 "블록 넓이 × 채움 비율 ÷ 한 채 넓이"다.
    const lotArea = ((d.size[0] + d.size[1]) / 2) ** 2;
    const target = Math.round(b.w * b.h * d.fill * fade * spec.density / lotArea);

    // **시도 횟수에 상한을 둔다.** 기각 표집은 빽빽해질수록 실패가 늘어 목표를 좇다
    // 보면 시간이 폭발한다(어려움에서 한 판에 0.5초를 넘겼다). 상한에 걸려 목표에
    // 못 미치는 것은 손해가 아니라 이득이다 — 빽빽한 구역일수록 덜 채워져 건물
    // 사이에 숨 쉴 자리가 남는다.
    let tries = Math.min(target * 6, 420);
    let placed = 0;
    while (placed < target && tries-- > 0) {
      const w = d.size[0] + rng() * (d.size[1] - d.size[0]);
      const h = d.size[0] + rng() * (d.size[1] - d.size[0]);
      if (place({ x: b.x + rng() * (b.w - w), y: b.y + rng() * (b.h - h), w, h }, d, b.kind)) placed++;
    }
  }

  city.buildIndex = buildIndex;
  city.blocks = blocks;

  // 5) 역 후보는 간선끼리 만나는 자리에서 고른다. 도로 위라는 조건이 저절로
  //    지켜지고, 건물은 길에서 물려 놓았으니 건물 위에 놓일 일도 없다.
  const spots = [];
  for (const x of xs) for (const y of ys) {
    if (x < 300 || x > WORLD.w - 300 || y < 300 || y > WORLD.h - 300) continue;
    spots.push({ x, y, k: rng() });
  }
  spots.sort((p, q) => p.k - q.k);

  city.stations = [];
  for (const s of spots) {
    if (city.stations.length >= 14) break;
    if (city.stations.every((t) => Geom.dist(s.x, s.y, t.x, t.y) > 850)) {
      city.stations.push({ id: `s${city.stations.length}`, x: s.x, y: s.y });
    }
  }

  return city;
}

function classify(city, x, y) {
  for (const id of query(city.roadIndex, x, y)) {
    const s = city.segments[id];
    if (Geom.nearestOnSegment(x, y, s.x1, s.y1, s.x2, s.y2).d <= s.w / 2) return 'road';
  }
  for (const id of query(city.buildIndex, x, y)) {
    if (Geom.pointInRect(x, y, city.buildings[id])) return 'building';
  }
  return 'empty';
}

// 가장 가까운 도로 중심선 위의 자리. 없으면 null. 중간점을 끌 때의 자석이다.
function snapToRoad(city, x, y, radius) {
  let best = null;
  for (const id of query(city.roadIndex, x, y, radius)) {
    const s = city.segments[id];
    const near = Geom.nearestOnSegment(x, y, s.x1, s.y1, s.x2, s.y2);
    if (near.d <= radius && (!best || near.d < best.d)) best = { x: near.x, y: near.y, d: near.d };
  }
  return best;
}

const CityGen = {
  VIEW, WORLD, GRID, MAX_BUILDINGS, ROAD_W, DISTRICT, LEVELS,
  create, classify, snapToRoad, districtAt, segRectDistance, mulberry32,
};

if (typeof module !== 'undefined' && module.exports) module.exports = CityGen;
if (typeof window !== 'undefined') window.MetroCity = CityGen;

})();

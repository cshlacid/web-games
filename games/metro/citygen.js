'use strict';

// 도시 한 장을 씨앗 하나와 난이도 하나에서 만든다. 지형·도로·건물까지.
//
// **타일이 아니라 연속 좌표다.** 격자로 두면 건설 판정은 쉬워지지만 방향이 여덟
// 개뿐이라 곡률이라는 개념이 성립하지 않는다. 이 게임은 곡률이 중심이라 벡터로 간다.
//
// **역은 여기서 만들지 않는다.** 플레이어가 직접 놓는다.
(function () {

const Geom = (typeof module !== 'undefined' && module.exports)
  ? require('./geom.js')
  : window.MetroGeom;

// 한 화면에 보이는 창(VIEW)보다 도시(WORLD)가 넉넉히 크다. 차이만큼 팬으로 돈다.
//
// **창의 세 배씩, 넓이로 아홉 배다.** 두 배(넓이 넷)로 시작했는데 역을 열댓 개 놓고
// 노선을 둘 긋고 나면 더 갈 데가 없었다 — 망이 도시를 다 덮어 버려 "다음에 어디를
// 이을까"가 남지 않는다. 걷는 거리도 역 간격도 사람의 크기(800m, 2.2km)에 묶여 있어
// **지도만 키우면 필요한 역 수가 그만큼 는다.**
const VIEW = { w: 2400, h: 2700 };
const WORLD = { w: 7200, h: 8100 };

const GRID = 90;             // 공간 색인 칸 크기
const MAX_BUILDINGS = 9000;  // 안전망. 보통 그 아래에서 저절로 멎는다 — 걸리면 한쪽이 통째로 빈다

const ROAD_W = { arterial: 36, avenue: 32, planned: 20, suburb: 18, alley: 13 };

// 건물이 자랄 수 있는 끝. **종류가 정하는 상한이다** — 주거는 얼마 못 가고 업무는
// 높이 간다. 지금은 화면에서 진하기로만 보이지만, 수요가 들어오면 그 자리가
// 낼 수 있는 통행량의 상한이 된다.
const CAP = { home: 2, shop: 3, office: 4 };

// 구역의 성격. **이 표가 이 게임의 난이도 지형이다.**
//
// 구시가지는 길이 굽고 좁은 데다 건물이 빽빽해서, 도로를 따라가면 느리고 곧게
// 뚫으면 비싸다 — 양쪽이 다 나쁜 자리다. 계획도시는 그 반대로 둘 다 좋다.
const DISTRICT = {
  old:     { gap: 80,  w: ROAD_W.alley,   size: [18, 34], clear: 6,  fill: 0.52, organic: true },
  planned: { gap: 155, w: ROAD_W.planned, size: [50, 88], clear: 12, fill: 0.46, regular: true },
  suburb:  { gap: 250, w: ROAD_W.suburb,  size: [36, 64], clear: 10, fill: 0.17, jitter: 12 },
};

// 난이도는 구역의 넓이 배합과 건물·지형으로 낸다. 규칙을 바꾸지 않고 지형만 바꾸는
// 것이라, 쉬운 판에서 익힌 감각이 어려운 판에서도 그대로 통한다.
// `fare`는 난이도가 요금에 거는 배수다. 어려울수록 같은 승객이 덜 벌어 주고, 그래서
// 같은 망을 깔아도 돈이 늦게 모인다. **규칙이 아니라 숫자만 바꾸는 손잡이라** 쉬운
// 판에서 익힌 감각이 어려운 판에서도 그대로 통한다.
const LEVELS = [
  { id: 'easy',   oldR: 950,  town: [3300, 2850], density: 0.78, hills: 3, sea: 0.3,  fare: 1 },
  { id: 'normal', oldR: 1750, town: [2550, 2200], density: 1.0,  hills: 5, sea: 0.55, fare: 0.66 },
  { id: 'hard',   oldR: 2650, town: [1650, 1450], density: 1.25, hills: 7, sea: 0.85, fare: 0.45 },
];

// 처음에는 도시가 듬성듬성하다. 후보의 이만큼만 서 있고 나머지는 빈 터로 남아,
// 노선이 닿는 곳부터 하나씩 들어선다.
const START_FILL = 0.42;

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

function indexPolylines(lines, world) {
  const segments = [];
  const ix = makeIndex(world, GRID);
  for (const line of lines) {
    for (let i = 1; i < line.pts.length; i++) {
      const a = line.pts[i - 1];
      const b = line.pts[i];
      const id = segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: line.w }) - 1;
      const pad = line.w / 2 + 2;
      insert(ix, id,
        Math.min(a.x, b.x) - pad, Math.min(a.y, b.y) - pad,
        Math.max(a.x, b.x) + pad, Math.max(a.y, b.y) + pad);
    }
  }
  return { segments, index: ix };
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

// 꺾은선에서 막힌 구간을 잘라 내고 통과하는 토막만 남긴다. 길이 물이나 산을
// 관통하지 않게 하는 데 쓴다.
// `blocked`에 그 토막이 향하는 쪽도 함께 넘긴다. **물 위를 지나도 되는지가 자리가
// 아니라 각도로 갈리기 때문이다** — 강을 가로지르는 다리는 되지만 강을 따라 흐르는
// 도로는 안 된다.
function clipPolyline(pts, blocked, step = 22) {
  const parts = [];
  let run = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dir = Geom.normalize(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(Geom.dist(a.x, a.y, b.x, b.y) / step));
    for (let k = 0; k <= n; k++) {
      if (i > 1 && k === 0) continue;   // 이음매를 두 번 세지 않는다
      const p = { x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n) };
      if (blocked(p.x, p.y, dir.x, dir.y)) { run = null; continue; }
      if (!run) { run = [p]; parts.push(run); } else run.push(p);
    }
  }
  return parts.filter((part) => part.length > 1);
}

// --- 지형 ---

function wander(from, to, swing, rng, steps = 9) {
  const len = Geom.dist(from.x, from.y, to.x, to.y);
  const nx = -(to.y - from.y) / len;
  const ny = (to.x - from.x) / len;
  const pts = [];
  let drift = 0;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    drift += (rng() - 0.5) * swing;
    drift *= 0.82;                       // 되돌아오게 눌러 준다. 안 그러면 한쪽으로만 샌다
    const sway = Math.sin(k * Math.PI) * swing * 0.9 + drift;
    pts.push({ x: from.x + (to.x - from.x) * k + nx * sway, y: from.y + (to.y - from.y) * k + ny * sway });
  }
  return pts;
}

function makeTerrain(city, spec, rng) {
  const { w, h } = city.world;
  city.water = [];
  city.hills = [];
  city.sea = null;

  // 바다는 "아주 넓은 강"으로 둔다. 해안선을 따로 다루면 판정이 하나 더 느는데,
  // 지하철에게는 물이면 다 같은 물이라 얻는 것이 없다.
  if (rng() < spec.sea) {
    const side = Math.floor(rng() * 4);
    const band = 1500;
    const out = band / 2 - (420 + rng() * 380);   // 지도 안으로 들어오는 깊이
    const line = side === 0 ? wander({ x: -200, y: out }, { x: w + 200, y: out }, 190, rng)
      : side === 1 ? wander({ x: -200, y: h - out }, { x: w + 200, y: h - out }, 190, rng)
      : side === 2 ? wander({ x: out, y: -200 }, { x: out, y: h + 200 }, 190, rng)
      : wander({ x: w - out, y: -200 }, { x: w - out, y: h + 200 }, 190, rng);
    city.sea = { pts: line, w: band, kind: 'sea' };
    city.water.push(city.sea);
  }

  // 강은 지도를 가로지른다. 바다가 있으면 대개 그쪽으로 흘러 나간다.
  {
    const vertical = rng() < 0.5;
    const from = vertical ? { x: w * (0.2 + rng() * 0.6), y: -150 } : { x: -150, y: h * (0.2 + rng() * 0.6) };
    const to = vertical ? { x: w * (0.2 + rng() * 0.6), y: h + 150 } : { x: w + 150, y: h * (0.2 + rng() * 0.6) };
    city.water.push({ pts: wander(from, to, 320, rng, 11), w: 110 + rng() * 110, kind: 'river' });
  }

  // 산은 원 몇 개를 사슬처럼 이어 만든다. 다각형을 제대로 다루는 대신 원의 합집합으로
  // 두면 판정이 거리 비교 한 줄이고, 불투명하게 겹쳐 그리면 화면에서도 한 덩어리로 보인다.
  for (let k = 0; k < spec.hills; k++) {
    const ang = rng() * Math.PI * 2;
    // 지도가 넓어지면서 도심 둘레에만 몰면 바깥이 통째로 밋밋해진다. 짧은 변에
    // 비례해 흩는다.
    const away = city.core.r + 500 + rng() * Math.min(w, h) * 0.42;
    let at = {
      x: clamp(city.core.x + Math.cos(ang) * away, 300, w - 300),
      y: clamp(city.core.y + Math.sin(ang) * away, 300, h - 300),
    };
    let dir = rng() * Math.PI * 2;
    const lumps = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < lumps; i++) {
      const r = 190 + rng() * 190;
      // 물에 잠긴 봉우리는 섬처럼 보여 어색하다. 물을 먼저 깔아 두고 여기서 거른다.
      if (!isWaterLines(city.water, at.x, at.y)) city.hills.push({ x: at.x, y: at.y, r });
      dir += (rng() - 0.5) * 1.1;
      at = { x: at.x + Math.cos(dir) * r * 0.85, y: at.y + Math.sin(dir) * r * 0.85 };
      if (at.x < 200 || at.x > w - 200 || at.y < 200 || at.y > h - 200) break;
    }
  }

  const packed = indexPolylines(city.water, city.world);
  city.waterSegments = packed.segments;
  city.waterIndex = packed.index;
}

// 색인을 만들기 전, 지형을 깔던 중에 쓰는 느린 판정. 물줄기가 둘뿐이라 훑어도 된다.
function isWaterLines(bodies, x, y) {
  for (const body of bodies) {
    for (let i = 1; i < body.pts.length; i++) {
      const a = body.pts[i - 1];
      const b = body.pts[i];
      if (Geom.nearestOnSegment(x, y, a.x, a.y, b.x, b.y).d <= body.w / 2) return true;
    }
  }
  return false;
}

function isWater(city, x, y) {
  for (const id of query(city.waterIndex, x, y)) {
    const s = city.waterSegments[id];
    if (Geom.nearestOnSegment(x, y, s.x1, s.y1, s.x2, s.y2).d <= s.w / 2) return true;
  }
  return false;
}

// 바다만 따로 본다. **다리는 강에만 놓는다** — 열린 바다를 가로지르는 간선도로는
// 어디로도 가지 않는 다리라 화면에서 곧장 잘못 그린 것으로 보인다.
function isSea(city, x, y) {
  return city.sea ? isWaterLines([city.sea], x, y) : false;
}

// 그 자리 물줄기가 흐르는 쪽. 가장 가까운 물 선분의 방향이다.
function waterDir(city, x, y) {
  let best = Infinity;
  let dir = null;
  for (const id of query(city.waterIndex, x, y)) {
    const s = city.waterSegments[id];
    const near = Geom.nearestOnSegment(x, y, s.x1, s.y1, s.x2, s.y2);
    if (near.d < best) { best = near.d; dir = Geom.normalize(s.x2 - s.x1, s.y2 - s.y1); }
  }
  return dir;
}

// **도로는 강과 나란히 놓이지 않는다. 건널 때는 언제나 가로지른다.** 물 위의 토막을
// 자리로만 살려 두었더니 강줄기를 따라 물속을 한참 흐르는 간선이 나왔는데, 다리로도
// 도로로도 보이지 않는다. 물길과 이룬 각이 이만큼은 되어야 다리로 친다.
const CROSS_MIN = 55 * Math.PI / 180;
const CROSS_DOT = Math.cos(CROSS_MIN);

function crossesWater(city, x, y, dx, dy) {
  const w = waterDir(city, x, y);
  if (!w) return true;
  return Math.abs(dx * w.x + dy * w.y) <= CROSS_DOT;
}

function isHill(city, x, y) {
  for (const hill of city.hills) {
    if ((x - hill.x) ** 2 + (y - hill.y) ** 2 <= hill.r * hill.r) return true;
  }
  return false;
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

// --- 길 ---

// 대각선 대로 한 줄. 격자만 있으면 노선이 전부 ㄱ자로 꺾여 휜 선로를 그릴 자리가 없다.
//
// **지도를 관통하는 직선으로 두면 안 된다.** 전에는 둘 다 한가운데를 지나서 거기서
// 간선 둘과 겹쳐 한 점에 여덟 갈래가 났다 — 현실에 없는 교차로이고, 어느 판에서나
// 도심에 같은 별 모양이 생겨 판마다 다른 도시라는 인상도 거기서 무너졌다.
//
// 그래서 **몇 블록만 가로지르는 토막**이고, **간선이 사거리로 만나는 자리를 비켜
// 간다.** 그러면 대로가 지나는 곳은 간선 한 줄과 만나는 네거리이거나, 간선이 끊긴
// 삼거리에 얹힌 **다섯 갈래가 최대**다. 관통하는 직선으로는 이 조건을 맞출 수 없다 —
// 교차점이 백 개가 넘어 어디로 그어도 몇 개는 스친다.
//
// 값은 위에서 정해진다. 45°로 600 간격 격자를 지나면 교차점에서 가장 멀리 떨어져야
// 212다 — 그보다 큰 값을 쓰면 **어떤 자리도 통과하지 못해 대로가 영영 안 나온다**
// (230으로 두었다가 백이십 판 내리 하나도 안 나왔다). 110은 간선 폭(36)의 세 배쯤이라
// 화면에서 교차로를 비켜 지나는 것으로 읽히고, 무작위 자리의 5%가 통과한다.
const JUNCTION_CLEAR = 110;

function boulevard(xs, ys, rng) {
  for (let tries = 0; tries < 400; tries++) {
    const ang = Math.PI / 4 + (rng() - 0.5) * 0.7 + (rng() < 0.5 ? 0 : Math.PI / 2);
    const at = { x: WORLD.w * (0.15 + rng() * 0.7), y: WORLD.h * (0.15 + rng() * 0.7) };
    const half = 1300 + rng() * 1500;
    const dir = { x: Math.cos(ang), y: Math.sin(ang) };
    const a = { x: at.x - dir.x * half, y: at.y - dir.y * half };
    const b = { x: at.x + dir.x * half, y: at.y + dir.y * half };
    if (!clearOfJunctions(a, b, xs, ys)) continue;
    return { a, b, pts: [a, b] };
  }
  return null;
}

// 토막이 지나는 동안 간선 교차점에 바싹 붙지 않는가. 토막 밖의 교차점은 상관없다.
function clearOfJunctions(a, b, xs, ys) {
  for (const x of xs) {
    for (const y of ys) {
      if (Geom.nearestOnSegment(x, y, a.x, a.y, b.x, b.y).d < JUNCTION_CLEAR) return false;
    }
  }
  return true;
}

// 대로 둘이 서로 만나는 자리도 간선 위여서는 안 된다 — 거기가 여섯 갈래가 된다.
function crossClearOfLines(p, q, xs, ys) {
  const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y };
  const s2 = { x: q.b.x - q.a.x, y: q.b.y - q.a.y };
  const det = r.x * s2.y - r.y * s2.x;
  if (Math.abs(det) < 1e-6) return true;
  const t = ((q.a.x - p.a.x) * s2.y - (q.a.y - p.a.y) * s2.x) / det;
  const u = ((q.a.x - p.a.x) * r.y - (q.a.y - p.a.y) * r.x) / det;
  if (t < 0 || t > 1 || u < 0 || u > 1) return true;   // 토막 안에서 만나지 않는다
  const hit = { x: p.a.x + r.x * t, y: p.a.y + r.y * t };
  for (const x of xs) if (Math.abs(hit.x - x) < JUNCTION_CLEAR) return false;
  for (const y of ys) if (Math.abs(hit.y - y) < JUNCTION_CLEAR) return false;
  return true;
}

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

// 간선 한 줄. 곧게 관통하기만 하면 교차점이 전부 사거리라 어느 길로 가나 같다.
// **어긋나게 하거나 중간에서 끊으면 삼거리가 생기고**, 그제야 "이쪽으로는 끝까지
// 가는데 저쪽은 아니다"가 길마다 다른 성질이 된다.
// 어긋난 간선이 옆 간선과 이만큼은 떨어져 있어야 한다.
const SIBLING_CLEAR = 280;

function arterial(fixed, span, cross, rng, vertical, siblings = []) {
  const at = (v, t) => (vertical ? { x: v, y: t } : { x: t, y: v });
  // 자를 수 있는 자리는 가장자리에서 한 칸씩 물린 교차선들이다. 끝에서 자르면
  // 그냥 짧은 길이고, 한가운데를 자르면 도시가 반으로 갈린다.
  const inner = cross.filter((t) => t > span * 0.16 && t < span * 0.84);
  let from = 0;
  let to = span;

  // ① 한쪽 끝을 교차선에서 멈춘다. 거기가 T자다. **자르는 자리는 바깥 삼분의 일로
  //    묶는다** — 한가운데를 자르면 그 줄이 토막만 남아 도시의 한쪽이 통째로 비어 보인다.
  if (rng() < 0.32) {
    const head = inner.filter((t) => t < span * 0.36);
    const tail = inner.filter((t) => t > span * 0.64);
    if (rng() < 0.5) { if (head.length) from = head[Math.floor(rng() * head.length)]; }
    else if (tail.length) to = tail[Math.floor(rng() * tail.length)];
  }

  // ② 한 교차선에서 옆으로 어긋난다. 사거리 하나가 삼거리 둘로 갈린다.
  const mids = inner.filter((t) => t > from + span * 0.12 && t < to - span * 0.12);
  if (mids.length && rng() < 0.42) {
    const bend = mids[Math.floor(rng() * mids.length)];
    const shift = (rng() < 0.5 ? -1 : 1) * (150 + rng() * 170);
    const other = clamp(fixed + shift, 120, span === WORLD.w ? WORLD.h - 120 : WORLD.w - 120);
    // **어긋난 자리가 옆 간선에 붙으면 안 된다.** 두 줄이 이백도 안 되게 나란히
    // 서면 그 둘이 교차선과 만나는 자리가 한 교차로로 뭉쳐 여섯 갈래가 된다.
    // 붙을 자리면 어긋나지 않고 곧게 간다.
    const near = siblings.some((v) => v !== fixed && Math.abs(v - other) < SIBLING_CLEAR);
    if (!near) return [at(fixed, from), at(fixed, bend), at(other, bend), at(other, to)];
  }
  return [at(fixed, from), at(fixed, to)];
}

function straightish(from, to, jitter, rng) {
  if (!jitter) return [from, to];
  const len = Geom.dist(from.x, from.y, to.x, to.y);
  const steps = Math.max(2, Math.round(len / 120));
  const nx = -(to.y - from.y) / len;
  const ny = (to.x - from.x) / len;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    // 양 끝은 큰길에 닿아야 하므로 흔들지 않는다.
    const sway = Math.sin(k * Math.PI) * (rng() - 0.5) * 2 * jitter;
    pts.push({ x: from.x + (to.x - from.x) * k + nx * sway, y: from.y + (to.y - from.y) * k + ny * sway });
  }
  return pts;
}

// 구시가지의 골목은 **자라서** 생긴다.
//
// 블록을 가로지르는 줄을 몇 개 긋는 방식으로는 아무리 굽혀도 격자가 남는다. 격자에서는
// 노선을 그을 때 고민할 것이 없다 — 어느 길을 타도 비슷하기 때문이다. 경계에서 씨를
// 뿌려 안쪽으로 뻗게 하고 도중에 갈라지거나 멈추게 하면 **삼거리와 Y자와 막다른 길**이
// 나오고, 그제야 "이 골목은 저기까지밖에 안 간다"가 판단거리가 된다.
function organicBlock(b, d, rng, emit) {
  const step = d.gap * 0.78;
  const cell = step;
  const bins = new Map();
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;

  function remember(p) {
    const k = key(p.x, p.y);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(p);
  }
  function nearby(x, y, r) {
    const c = Math.floor(x / cell);
    const q = Math.floor(y / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = bins.get(`${c + i},${q + j}`);
      if (!arr) continue;
      for (const p of arr) if (Geom.dist(p.x, p.y, x, y) < r) return p;
    }
    return null;
  }

  const queue = [];
  const seeds = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < seeds; i++) {
    const side = Math.floor(rng() * 4);
    const t = 0.1 + rng() * 0.8;
    const at = side === 0 ? { x: b.x + b.w * t, y: b.y }
      : side === 1 ? { x: b.x + b.w * t, y: b.y + b.h }
      : side === 2 ? { x: b.x, y: b.y + b.h * t }
      : { x: b.x + b.w, y: b.y + b.h * t };
    const dir = side === 0 ? Math.PI / 2 : side === 1 ? -Math.PI / 2 : side === 2 ? 0 : Math.PI;
    queue.push({ at, dir, life: 5 + Math.floor(rng() * 7) });
  }

  let guard = 0;
  while (queue.length && guard++ < 90) {
    const branch = queue.shift();
    const pts = [branch.at];
    let cur = branch.at;
    let dir = branch.dir;
    for (let k = 0; k < branch.life; k++) {
      dir += (rng() - 0.5) * 0.8;
      const next = { x: cur.x + Math.cos(dir) * step, y: cur.y + Math.sin(dir) * step };

      if (next.x < b.x + 6 || next.x > b.x + b.w - 6 || next.y < b.y + 6 || next.y > b.y + b.h - 6) {
        // 블록 경계에 닿으면 큰길에 붙이고 끝낸다. 여기가 삼거리가 된다.
        pts.push({ x: clamp(next.x, b.x, b.x + b.w), y: clamp(next.y, b.y, b.y + b.h) });
        break;
      }
      const join = nearby(next.x, next.y, step * 0.6);
      if (join) { pts.push(join); break; }   // 있던 골목에 붙는다 — 삼거리

      pts.push(next);
      remember(next);
      cur = next;
      if (rng() < 0.22 && queue.length < 12) {
        queue.push({
          at: next,
          dir: dir + (rng() < 0.5 ? 1 : -1) * (0.65 + rng() * 0.7),
          life: 3 + Math.floor(rng() * 5),
        });
      }
    }
    if (pts.length > 1) emit(pts);
  }
}

// --- 만들기 ---

function create(seed = 1, level = 1) {
  const spec = LEVELS[clamp(level, 0, LEVELS.length - 1)];
  const rng = mulberry32((seed * 2654435761) ^ (spec.id.length * 40503));
  const cx = WORLD.w / 2;
  const cy = WORLD.h / 2;

  const core = { x: cx + (rng() - 0.5) * 500, y: cy + (rng() - 0.5) * 500, r: spec.oldR, phase: rng() * Math.PI * 2 };
  const town = { w: spec.town[0], h: spec.town[1], x: 0, y: 0 };
  // 계획도시는 구시가지를 비켜 한쪽에 붙는다 — 현실의 신도시가 그렇다.
  const away = rng() * Math.PI * 2;
  town.x = clamp(core.x + Math.cos(away) * (core.r + town.w * 0.62) - town.w / 2, 120, WORLD.w - town.w - 120);
  town.y = clamp(core.y + Math.sin(away) * (core.r + town.h * 0.62) - town.h / 2, 120, WORLD.h - town.h - 120);

  const city = {
    seed, level: spec.id, fare: spec.fare, world: WORLD, view: VIEW, core, town,
    roads: [], stations: [], growSeed: (seed * 2246822519) >>> 0,
  };

  makeTerrain(city, spec, rng);
  const wet = (x, y) => isWater(city, x, y);
  const rocky = (x, y) => isHill(city, x, y);

  // 1) 간선. 지도 전체를 가로지르는 곧은 격자다. 구역이 어떻든 이 뼈대는 같아서
  //    도시가 하나로 이어진다.
  //
  //    **간선만 강을 건넌다.** 물 위의 토막을 잘라 내지 않고 다리로 둔다 — 도시에
  //    다리가 하나도 없으면 강 건너가 딴 세상으로 보인다. 지하철에게는 그래도 강
  //    밑이라 값은 그대로 비싸다. 산은 간선도 피한다.
  const xs = axisLines(cx, WORLD.w, 600, rng);
  const ys = axisLines(cy, WORLD.h, 600, rng);
  const arterials = [];
  // 어긋난 줄이 새로 차지한 자리도 그다음 줄에게는 이웃이다. 원래 자리만 보고 비키면
  // **어긋난 것끼리 바싹 붙어** 다시 여섯 갈래가 난다.
  const takenX = xs.slice();
  for (const x of xs) {
    const pts = arterial(x, WORLD.h, ys, rng, true, takenX);
    if (pts.length === 4) takenX.push(pts[2].x);
    arterials.push(pts);
  }
  const takenY = ys.slice();
  for (const y of ys) {
    const pts = arterial(y, WORLD.w, xs, rng, false, takenY);
    if (pts.length === 4) takenY.push(pts[2].y);
    arterials.push(pts);
  }
  // **대로는 대부분의 판에 없다.** 늘 둘씩 깔았더니 어느 판에서나 도심에 같은 별
  // 모양이 생겨, 판마다 다른 도시라는 인상이 거기서 무너졌다.
  const want = rng() < 0.62 ? 0 : rng() < 0.78 ? 1 : 2;
  const laid = [];
  for (let k = 0; k < want; k++) {
    // 어긋난 간선이 새로 차지한 자리(`takenX`/`takenY`)까지 넣어야 한다. 원래 격자만
    // 보고 비켰더니 어긋난 줄의 사거리를 그대로 관통해 여섯 갈래가 났다.
    const road = boulevard(takenX, takenY, rng);
    if (!road) continue;
    if (laid.some((other) => !crossClearOfLines(road, other, takenX, takenY))) continue;
    laid.push(road);
    arterials.push(road.pts);
  }
  city.boulevards = laid.length;

  // **간선은 산을 뚫는다.** 터널이다 — 산 하나가 도시를 둘로 가르면 그 너머가 딴
  // 세상이 되고, 어차피 지하철도 산 밑으로 간다(값만 비싸다). 막는 것은 바다와,
  // **강과 나란히 놓이는 토막**뿐이다.
  const stopsArterial = (x, y, dx, dy) =>
    isSea(city, x, y) || (isWater(city, x, y) && !crossesWater(city, x, y, dx, dy));
  // 산을 지나는 토막은 따로도 적어 둔다. 길은 그대로 이어지되 **화면에서 그 구간을
  // 산 색으로 덧그어** 산 밑으로 지나는 것으로 보이게 한다 — 덧긋지 않으면 산마루를
  // 타고 넘는 길로 읽힌다.
  city.tunnels = [];
  for (const pts of arterials) {
    for (const part of clipPolyline(pts, stopsArterial)) {
      city.roads.push({ pts: part, w: ROAD_W.arterial, kind: 'arterial' });
      for (const dug of clipPolyline(part, (x, y) => !rocky(x, y))) city.tunnels.push(dug);
    }
  }

  // 2) 국지도로. 간선 블록마다 그 자리의 구역 성격대로 깐다.
  //
  // **블록은 간선 사이가 아니라 지도 끝까지다.** 간선끼리의 칸만 쓰면 바깥쪽 간선과
  // 지도 끝 사이(240~940)가 어느 블록에도 안 들어가, 넓이의 삼분의 일인 가장자리 띠에
  // 건물이 3%밖에 없었다. 지도 끝을 경계로 한 줄씩 더 두면 그 띠도 여느 블록처럼 찬다.
  const bx = [0, ...xs, WORLD.w];
  const by = [0, ...ys, WORLD.h];
  const blocks = [];
  for (let i = 0; i + 1 < bx.length; i++) {
    for (let j = 0; j + 1 < by.length; j++) {
      const b = { x: bx[i], y: by[j], w: bx[i + 1] - bx[i], h: by[j + 1] - by[j] };
      b.kind = districtAt(city, b.x + b.w / 2, b.y + b.h / 2);
      blocks.push(b);
      const d = DISTRICT[b.kind];
      b.cuts = { x: [], y: [] };   // 계획도시가 건물을 이 자리에 맞춰 세운다

      const lay = (pts) => {
        for (const part of clipPolyline(pts, (x, y) => wet(x, y) || rocky(x, y))) {
          city.roads.push({ pts: part, w: d.w, kind: b.kind });
        }
      };

      if (d.organic) { organicBlock(b, d, rng, lay); continue; }

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
          lay(straightish(from, to, d.jitter, rng));
        }
      }
    }
  }

  const packed = indexPolylines(city.roads, WORLD);
  city.segments = packed.segments;
  city.roadIndex = packed.index;

  // 3) 건물. **기각 표집으로 뿌리는 것이 기본이다** — 구시가지의 길은 굽고 갈라져서
  //    블록이 사각형이 아니고, 칸에 맞춰 놓으면 골목 위에 건물이 올라앉는다.
  city.buildings = [];
  const buildIndex = makeIndex(WORLD, GRID);
  const maxD = Math.hypot(cx, cy);

  function place(lot, d, blockKind) {
    if (city.buildings.length >= MAX_BUILDINGS) return false;
    if (lot.w < 16 || lot.h < 16) return false;

    const mx = lot.x + lot.w / 2;
    const my = lot.y + lot.h / 2;
    const reach = Math.hypot(lot.w, lot.h) / 2;
    if (wet(mx, my) || rocky(mx, my)) return false;

    for (const id of query(city.roadIndex, mx, my, reach + 40)) {
      const seg = city.segments[id];
      const need = seg.w / 2 + d.clear;
      // 값싼 거름망을 먼저 놓는다. 중심에서 선분까지의 거리가 사각형 대각선의
      // 절반보다도 멀면 어느 구석도 닿을 수 없다. 이것 없이 후보마다 선분–사각형
      // 거리를 다 재면 어려움 한 판을 만드는 데 0.4초가 넘게 든다.
      if (Geom.nearestOnSegment(mx, my, seg.x1, seg.y1, seg.x2, seg.y2).d > reach + need) continue;
      if (segRectDistance(seg, lot) < need) return false;
    }
    for (const id of query(buildIndex, mx, my, reach + d.clear)) {
      if (overlaps(lot, city.buildings[id], d.clear * 0.6)) return false;
    }

    // 도심일수록 업무·상업, 외곽일수록 주거. 종류가 자랄 수 있는 끝을 정한다.
    const r = rng();
    lot.kind = blockKind === 'suburb'
      ? (r < 0.12 ? 'shop' : 'home')
      : (r < 0.36 ? 'office' : (r < 0.68 ? 'shop' : 'home'));
    lot.cap = Math.max(1, CAP[lot.kind] - (blockKind === 'suburb' ? 1 : 0));
    lot.level = rng() < START_FILL ? 1 : 0;   // 0은 아직 빈 터다
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
        const left = (i === 0 ? ROAD_W.arterial : d.w) / 2 + d.clear;
        const right = (i + 2 === ex.length ? ROAD_W.arterial : d.w) / 2 + d.clear;
        const top = (j === 0 ? ROAD_W.arterial : d.w) / 2 + d.clear;
        const bottom = (j + 2 === ey.length ? ROAD_W.arterial : d.w) / 2 + d.clear;
        const cell = {
          x: b.x + ex[i] + left, y: b.y + ey[j] + top,
          w: ex[i + 1] - ex[i] - left - right, h: ey[j + 1] - ey[j] - top - bottom,
        };
        if (cell.w < 20 || cell.h < 20) continue;

        // 칸이 크면 두 줄 두 칸으로 나눈다. 통째로 채우면 건물 하나가 블록만 해져서
        // 지하철이 피해 갈 자리가 없어진다.
        const cols = cell.w > 104 ? 2 : 1;
        const rows = cell.h > 104 ? 2 : 1;
        const inner = 11;
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
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

  for (const b of blocks) {
    const d = DISTRICT[b.kind];
    if (d.regular) { fillRegular(b, d); continue; }

    // 외곽은 도시에서 멀어질수록 더 성기다. 같은 비율로 깔면 지도 끝까지 똑같이
    // 생긴 동네가 이어져 어디쯤 와 있는지 알 수가 없다.
    //
    // **다만 바닥을 너무 낮게 두면 안 된다.** 기울기 1.7에 바닥 0.16이던 때는 지도가
    // 넓어지면서 바깥 절반이 사실상 빈 들판이 됐다 — 성긴 것과 없는 것은 다르다.
    // 멀수록 성기다는 것은 그대로 두고 바닥만 두 배로 올린다.
    const off = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) / maxD;
    const fade = b.kind === 'suburb' ? clamp(1.25 - off, 0.34, 1) : 1;
    const lotArea = ((d.size[0] + d.size[1]) / 2) ** 2;
    const target = Math.round(b.w * b.h * d.fill * fade * spec.density / lotArea);

    // **시도 횟수에 상한을 둔다.** 기각 표집은 빽빽해질수록 실패가 늘어 목표를 좇다
    // 보면 시간이 폭발한다. 상한에 걸려 목표에 못 미치는 것은 손해가 아니라 이득이다.
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
  return city;
}

// --- 땅 가르기 ---

// 다섯 갈래. 물과 산이 도로·건물보다 먼저인 것은 값이 가장 크기 때문이고, 실제로
// 겹칠 일은 다리뿐이다 — 다리 밑은 지하철에게 그냥 강이다.
function classify(city, x, y) {
  if (isWater(city, x, y)) return 'water';
  if (isHill(city, x, y)) return 'hill';
  for (const id of query(city.roadIndex, x, y)) {
    const s = city.segments[id];
    if (Geom.nearestOnSegment(x, y, s.x1, s.y1, s.x2, s.y2).d <= s.w / 2) return 'road';
  }
  for (const id of query(city.buildIndex, x, y)) {
    const b = city.buildings[id];
    if (b.level > 0 && Geom.pointInRect(x, y, b)) return 'building';
  }
  return 'empty';
}

// 어떤 자리 둘레에 서 있는 건물들. 수요가 "역세권에서 생긴다"를 쓰려면 필요하다.
function buildingsNear(city, x, y, radius) {
  const out = [];
  const seen = new Set();
  for (const id of query(city.buildIndex, x, y, radius)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const b = city.buildings[id];
    if (b.level < 1) continue;
    if (Geom.dist(b.x + b.w / 2, b.y + b.h / 2, x, y) <= radius) out.push(b);
  }
  return out;
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

// --- 역 ---

const STATION_GAP = 340;   // 역끼리 이만큼은 떨어져야 한다

// 왜 못 놓는지를 문장이 아니라 열쇠로 돌려준다. 이 파일이 한 언어에 묶이면 node
// 테스트가 브라우저 전역(사전)을 부르게 된다.
function canPlaceStation(city, x, y) {
  if (x < 60 || y < 60 || x > city.world.w - 60 || y > city.world.h - 60) return 'outside';
  const ground = classify(city, x, y);
  if (ground === 'water') return 'water';
  if (ground === 'hill') return 'hill';
  if (ground === 'building') return 'building';
  for (const s of city.stations) {
    if (Geom.dist(x, y, s.x, s.y) < STATION_GAP) return 'close';
  }
  return null;
}

function addStation(city, x, y) {
  const why = canPlaceStation(city, x, y);
  if (why) return null;
  const station = { id: `s${city.stations.length}${Math.round(x)}`, x, y };
  city.stations.push(station);
  return station;
}

// --- 도시가 자란다 ---

// **수요를 처리한 자리가 자란다.** 지금은 수요가 없어서 "노선에 이어진 역의 도보권"을
// 그 대리로 쓴다. 수요가 들어오면 조건만 갈아 끼우면 되고, 자라는 쪽 구조는 그대로다.
//
// 자란다는 것은 빈 터에 건물이 들어서거나(0 → 1) 있던 건물이 높아지는(1 → cap) 것
// 둘 다다. 상한은 종류가 정한다 — 주거 동네는 아무리 잘해도 도심이 되지 않는다.
function grow(city, centers, radius, budget) {
  if (!centers.length) return [];
  const rng = mulberry32(city.growSeed = (city.growSeed * 1664525 + 1013904223) >>> 0);
  const near = new Set();
  for (const c of centers) {
    for (const id of query(city.buildIndex, c.x, c.y, radius)) {
      const b = city.buildings[id];
      if (b.level >= b.cap) continue;
      if (Geom.dist(b.x + b.w / 2, b.y + b.h / 2, c.x, c.y) <= radius) near.add(id);
    }
  }
  const pool = [...near];
  const grown = [];
  // 무작위로 고르되 뽑은 자리를 뒤에서 당겨 메운다. 셔플 한 번보다 싸고, 예산이
  // 후보보다 적을 때 앞쪽만 자라는 쏠림이 없다.
  for (let n = pool.length; n > 0 && grown.length < budget; n--) {
    const pick = Math.floor(rng() * n);
    const id = pool[pick];
    pool[pick] = pool[n - 1];
    city.buildings[id].level++;
    grown.push(id);
  }
  // 어디가 자랐는지 화면이 짚어 줄 수 있게 자리를 돌려준다. 숫자만 알려 주면
  // 플레이어는 자기가 무엇을 바꿨는지 보지 못한다.
  return grown;
}

const CityGen = {
  VIEW, WORLD, GRID, MAX_BUILDINGS, ROAD_W, DISTRICT, LEVELS, CAP, STATION_GAP, START_FILL,
  waterDir, crossesWater, CROSS_MIN, JUNCTION_CLEAR, boulevard,
  create, classify, snapToRoad, districtAt, canPlaceStation, addStation, grow, buildingsNear,
  isWater, isSea, isHill, segRectDistance, clipPolyline, arterial, mulberry32,
};

if (typeof module !== 'undefined' && module.exports) module.exports = CityGen;
if (typeof window !== 'undefined') window.MetroCity = CityGen;

})();

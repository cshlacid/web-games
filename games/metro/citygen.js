'use strict';

// 도시 한 장을 씨앗 하나에서 만든다. 도로·건물·역 후보까지.
//
// **타일이 아니라 연속 좌표다.** 격자로 두면 건설 판정은 쉬워지지만 방향이 여덟
// 개뿐이라 곡률이라는 개념이 성립하지 않는다. 이 게임은 곡률이 중심이라 벡터로 간다.
(function () {

const Geom = (typeof module !== 'undefined' && module.exports)
  ? require('./geom.js')
  : window.MetroGeom;

const WORLD = { w: 2400, h: 2700 };
const MAX_BUILDINGS = 700;   // SVG 노드 수의 안전망. 보통 300채 남짓에서 저절로 멎는다
const GRID = 120;            // 건물 색인 칸 크기

const ROAD_W = { major: 34, minor: 22, avenue: 30 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 중심에서 멀어질수록 길 사이가 벌어진다. 도심은 촘촘하고 외곽은 성기다는 말을
// 간격 하나로 적은 것이다.
function axisLines(center, span, rng) {
  const lines = [center];
  for (const dir of [-1, 1]) {
    let at = center;
    for (;;) {
      const d = Math.abs(at - center);
      const gap = 190 + d * 0.22;
      at += dir * (gap + (rng() - 0.5) * 50);
      if (at < 60 || at > span - 60) break;
      lines.push(at);
    }
  }
  return lines.sort((p, q) => p - q);
}

function segSegHit(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// 선분과 사각형 사이의 최단 거리. 건물이 대각선 대로를 침범하지 않았는지 보는 데 쓴다.
// 겹칠 때는 0을 돌려줘야 하므로 교차 판정을 먼저 한다 — 모서리 거리만 재면 사각형을
// 가로지르는 선분이 "멀다"고 나온다.
function segRectDistance(seg, r) {
  const corners = [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
  if (Geom.pointInRect(seg.x1, seg.y1, r) || Geom.pointInRect(seg.x2, seg.y2, r)) return 0;
  const a = { x: seg.x1, y: seg.y1 };
  const b = { x: seg.x2, y: seg.y2 };
  for (let i = 0; i < 4; i++) {
    if (segSegHit(a, b, corners[i], corners[(i + 1) % 4])) return 0;
  }
  let best = Infinity;
  for (const c of corners) {
    best = Math.min(best, Geom.nearestOnSegment(c.x, c.y, a.x, a.y, b.x, b.y).d);
  }
  for (const p of [a, b]) {
    const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
    best = Math.min(best, Math.hypot(p.x - cx, p.y - cy));
  }
  return best;
}

function pickKind(rng, nearness) {
  // 도심일수록 업무·상업, 외곽일수록 주거. 지금은 쓰지 않지만 시간대 수요(아침엔
  // 주거 → 업무)를 붙일 때 생성기를 다시 짜지 않으려고 미리 넣어 둔다.
  const r = rng();
  if (nearness > 0.65) return r < 0.5 ? 'office' : (r < 0.85 ? 'shop' : 'home');
  if (nearness > 0.35) return r < 0.3 ? 'office' : (r < 0.6 ? 'shop' : 'home');
  return r < 0.12 ? 'shop' : 'home';
}

function create(seed = 1) {
  const rng = mulberry32(seed * 2654435761);
  const cx = WORLD.w / 2;
  const cy = WORLD.h / 2;
  const maxD = Math.hypot(cx, cy);

  const xs = axisLines(cx, WORLD.w, rng);
  const ys = axisLines(cy, WORLD.h, rng);

  const roads = [];
  const majorX = [];
  const majorY = [];
  xs.forEach((x, i) => {
    const major = i % 3 === xs.length % 3;
    roads.push({ x1: x, y1: 0, x2: x, y2: WORLD.h, w: major ? ROAD_W.major : ROAD_W.minor });
    if (major) majorX.push(x);
  });
  ys.forEach((y, i) => {
    const major = i % 3 === ys.length % 3;
    roads.push({ x1: 0, y1: y, x2: WORLD.w, y2: y, w: major ? ROAD_W.major : ROAD_W.minor });
    if (major) majorY.push(y);
  });

  // 대각선 대로 둘. 격자만 있으면 노선이 전부 ㄱ자로 꺾여, 휜 선로를 그릴 자리가
  // 아예 생기지 않는다.
  const avenues = [];
  for (let k = 0; k < 2; k++) {
    const ang = (rng() * 0.6 + 0.2 + k * Math.PI / 2) * (k === 0 ? 1 : -1) + Math.PI / 4;
    const len = maxD * 2;
    const seg = {
      x1: cx - Math.cos(ang) * len, y1: cy - Math.sin(ang) * len,
      x2: cx + Math.cos(ang) * len, y2: cy + Math.sin(ang) * len,
      w: ROAD_W.avenue,
    };
    roads.push(seg);
    avenues.push(seg);
  }

  const buildings = [];
  for (let i = 0; i + 1 < xs.length && buildings.length < MAX_BUILDINGS; i++) {
    for (let j = 0; j + 1 < ys.length && buildings.length < MAX_BUILDINGS; j++) {
      const pad = ROAD_W.major / 2 + 10;
      const bx = xs[i] + pad;
      const by = ys[j] + pad;
      const bw = xs[i + 1] - xs[i] - pad * 2;
      const bh = ys[j + 1] - ys[j] - pad * 2;
      if (bw < 60 || bh < 60) continue;

      const nearness = 1 - Math.hypot(bx + bw / 2 - cx, by + bh / 2 - cy) / maxD;
      const density = Math.max(0.06, Math.min(0.95, (nearness - 0.28) * 2.0));
      const cols = Math.max(1, Math.round(bw / 62));
      const rows = Math.max(1, Math.round(bh / 62));

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng() > density) continue;
          if (buildings.length >= MAX_BUILDINGS) break;
          const gap = 3 + rng() * 4;
          const lot = {
            x: bx + (bw / cols) * c + gap,
            y: by + (bh / rows) * r + gap,
            w: bw / cols - gap * 2,
            h: bh / rows - gap * 2,
          };
          if (lot.w < 20 || lot.h < 20) continue;
          if (avenues.some((av) => segRectDistance(av, lot) < av.w / 2 + 6)) continue;
          lot.kind = pickKind(rng, nearness);
          buildings.push(lot);
        }
      }
    }
  }

  // 건물 색인. 경로를 따라 수백 번 "여기가 건물인가"를 묻게 되는데, 그때마다
  // 사백 채를 훑으면 끄는 동안 손이 걸린다.
  const cols = Math.ceil(WORLD.w / GRID);
  const rows = Math.ceil(WORLD.h / GRID);
  const index = Array.from({ length: cols * rows }, () => []);
  buildings.forEach((b, id) => {
    const c0 = Math.max(0, Math.floor(b.x / GRID));
    const c1 = Math.min(cols - 1, Math.floor((b.x + b.w) / GRID));
    const r0 = Math.max(0, Math.floor(b.y / GRID));
    const r1 = Math.min(rows - 1, Math.floor((b.y + b.h) / GRID));
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) index[r * cols + c].push(id);
  });

  // 역 후보는 큰길끼리 만나는 자리에서 고른다. 도로 위라는 조건이 저절로 지켜지고,
  // 건물은 길에서 물려 두었으니 건물 위에 놓일 일도 없다.
  const spots = [];
  for (const x of majorX) for (const y of majorY) {
    if (x < 200 || x > WORLD.w - 200 || y < 200 || y > WORLD.h - 200) continue;
    spots.push({ x, y, k: rng() });
  }
  spots.sort((p, q) => p.k - q.k);

  const stations = [];
  for (const s of spots) {
    if (stations.length >= 7) break;
    if (stations.every((t) => Geom.dist(s.x, s.y, t.x, t.y) > 520)) {
      stations.push({ id: `s${stations.length}`, x: s.x, y: s.y });
    }
  }

  return { seed, world: WORLD, roads, avenues, buildings, index, cols, rows, stations };
}

function classify(city, x, y) {
  for (const r of city.roads) {
    if (Geom.nearestOnSegment(x, y, r.x1, r.y1, r.x2, r.y2).d <= r.w / 2) return 'road';
  }
  const c = Math.floor(x / GRID);
  const r = Math.floor(y / GRID);
  if (c >= 0 && r >= 0 && c < city.cols && r < city.rows) {
    for (const id of city.index[r * city.cols + c]) {
      if (Geom.pointInRect(x, y, city.buildings[id])) return 'building';
    }
  }
  return 'empty';
}

// 가장 가까운 도로 중심선 위의 자리. 없으면 null. 중간점을 끌 때의 자석이다.
function snapToRoad(city, x, y, radius) {
  let best = null;
  for (const r of city.roads) {
    const near = Geom.nearestOnSegment(x, y, r.x1, r.y1, r.x2, r.y2);
    if (near.d <= radius && (!best || near.d < best.d)) best = { x: near.x, y: near.y, d: near.d };
  }
  return best;
}

const CityGen = { WORLD, GRID, MAX_BUILDINGS, ROAD_W, create, classify, snapToRoad, segRectDistance, mulberry32 };

if (typeof module !== 'undefined' && module.exports) module.exports = CityGen;
if (typeof window !== 'undefined') window.MetroCity = CityGen;

})();

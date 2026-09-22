'use strict';

// 도로가 없는 자리를 채우는 것들. **비어 있던 판이 도시로 보이게 하는 동시에, 길을
// 아무 데나 긋지 못하게 하는 제약이다.**
//
// 셋뿐이고 셋이 서로 다른 값을 매긴다.
// - **건물**: 네모. 길이 지날 수 없다. 헐 수 없는 것이 이 게임의 전제다.
// - **산**: 원. 터널을 뚫고 지난다 — 지날 수는 있고 비싸다.
// - **물(강·호수)**: 다리를 놓고 지난다 — 역시 지날 수는 있고 비싸다.
//
// **모양을 네모와 원과 띠로만 두었다.** 길이 그 안을 얼마나 지나는지를 프레임마다
// 재야 하는데(값을 매기려면 필요하다), 복잡한 다각형은 그 계산이 곧 병목이 된다.
// 화면에서도 이 셋이면 무엇인지 알아보는 데 모자라지 않다.
(function (root) {

const Geom = (typeof require !== 'undefined') ? require('./geom.js') : root.RoadGeom;

// 길에서 이만큼은 떨어뜨려 놓는다. 길가에 딱 붙으면 인도도 없이 벽이 선 꼴이다.
const ROAD_PAD = 9;
// 길이 그 안을 지나는지 잴 때의 걸음. 차 한 대가 10~17단위라 이 정도면 충분하다.
const STEP = 3;

function make(kind, shape) {
  return { kind, ...shape };
}

// --- 들어 있는가 ---

function inRect(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function inCircle(c, x, y) {
  const dx = x - c.x;
  const dy = y - c.y;
  return dx * dx + dy * dy <= c.r * c.r;
}

// 띠(강)는 가운데선에서의 거리로 잰다.
function inBand(band, x, y) {
  const half = band.w / 2;
  if (x < band.box.x - half || x > band.box.x + band.box.w + half) return false;
  if (y < band.box.y - half || y > band.box.y + band.box.h + half) return false;
  const pts = band.path.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ox = x - (a.x + dx * t);
    const oy = y - (a.y + dy * t);
    if (ox * ox + oy * oy <= half * half) return true;
  }
  return false;
}

function holds(item, x, y) {
  if (item.kind === 'building') return inRect(item, x, y);
  if (item.kind === 'river') return inBand(item, x, y);
  return inCircle(item, x, y);
}

// 그 자리가 무엇인가. 건물이 가장 세고(지날 수 없다), 물과 산은 지날 수는 있다.
function at(land, x, y) {
  if (!land) return null;
  for (const item of land.buildings) if (inRect(item, x, y)) return 'building';
  for (const item of land.water) if (holds(item, x, y)) return 'water';
  for (const item of land.hills) if (inCircle(item, x, y)) return 'hill';
  return null;
}

// --- 길이 무엇을 지나는가 ---

// 꺾은선이 장애물 안을 얼마나 지나는지. 값을 매기는 데도, 놓을 수 있는지 가리는 데도
// 이 하나를 쓴다 — 둘이 따로 재면 보여 준 값과 치르는 값이 어긋난다.
function spanOf(land, path) {
  const out = { total: path.total, wall: 0, tunnel: 0, bridge: 0 };
  if (!land) return out;
  const steps = Math.max(1, Math.ceil(path.total / STEP));
  const step = path.total / steps;
  for (let i = 0; i < steps; i++) {
    const p = Geom.at(path, (i + 0.5) * step);
    const kind = at(land, p.x, p.y);
    if (kind === 'building') out.wall += step;
    else if (kind === 'water') out.bridge += step;
    else if (kind === 'hill') out.tunnel += step;
  }
  return out;
}

// --- 만들기 ---

// 길에서 충분히 떨어졌는가. 새로 놓는 장애물이 이미 있는 길을 덮으면 안 된다 —
// **강만 예외다**(강은 판을 가로지르고 그 자리의 길은 이미 다리를 놓은 것으로 본다).
function offRoads(net, x, y, pad) {
  for (const seg of net.segs) {
    const keep = seg.width / 2 + pad;
    const pts = seg.center.points;
    if (x < seg.center.box.x - keep || x > seg.center.box.x + seg.center.box.w + keep) continue;
    if (y < seg.center.box.y - keep || y > seg.center.box.y + seg.center.box.h + keep) continue;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ox = x - (a.x + dx * t);
      const oy = y - (a.y + dy * t);
      if (ox * ox + oy * oy < keep * keep) return false;
    }
  }
  return true;
}

// 네모의 네 귀와 가장자리 몇 곳을 훑어 길에서 떨어졌는지 본다. 가운데만 보면 큰
// 건물이 길을 물고 앉는다.
function rectClear(net, land, r, pad) {
  for (let x = r.x; x <= r.x + r.w; x += Math.min(12, r.w)) {
    for (let y = r.y; y <= r.y + r.h; y += Math.min(12, r.h)) {
      if (!offRoads(net, x, y, pad)) return false;
      if (at(land, x, y)) return false;
    }
  }
  return true;
}

function circleClear(net, land, c, pad) {
  if (!offRoads(net, c.x, c.y, pad + c.r)) return false;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    if (at(land, c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r)) return false;
  }
  return !at(land, c.x, c.y);
}

// 카트뮬-롬으로 점들을 부드럽게 잇는다. 강이 꺾은선이면 수로처럼 보인다.
function smooth(pts, step) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    const part = Geom.sampleCubic(p1, c1, c2, p2, step || 14);
    for (const p of (i ? part.slice(1) : part)) out.push(p);
  }
  return out;
}

function boxOf(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// **강은 판을 가로지른다.** 길을 피하지 않는다 — 이미 놓인 길이 지나는 자리는 다리가
// 놓여 있는 것으로 본다. 새로 놓는 길만 다리 값을 치른다.
function river(net, rng) {
  const { w, h } = net.world;
  const down = rng() < 0.5;
  const span = down ? h : w;
  const steps = 5;
  const pts = [];
  let drift = 0.25 + rng() * 0.5;
  for (let i = 0; i <= steps; i++) {
    drift = Math.max(0.12, Math.min(0.88, drift + (rng() - 0.5) * 0.28));
    const along = (i / steps) * span;
    // 양 끝은 판 밖으로 조금 내밀어 가장자리에서 끊긴 것처럼 보이지 않게 한다.
    const out = i === 0 ? -30 : (i === steps ? span + 30 : along);
    pts.push(down ? { x: drift * w, y: out } : { x: out, y: drift * h });
  }
  const path = Geom.makePath(smooth(pts, 16));
  return make('river', { path, w: 26 + Math.round(rng() * 16), box: path.box });
}

function generate(net, rng, opts) {
  const o = opts || {};
  const { w, h } = net.world;
  const land = { buildings: [], hills: [], water: [] };

  if (o.river !== false) land.water.push(river(net, rng));

  // 호수와 산. 판을 훑으며 들어갈 자리를 찾는다.
  const blobs = (kind, count, min, max, into) => {
    let left = count * 40;   // 자리를 못 찾아도 언젠가는 끝난다
    let made = 0;
    while (made < count && left-- > 0) {
      const c = {
        x: 40 + rng() * (w - 80),
        y: 40 + rng() * (h - 80),
        r: min + rng() * (max - min),
      };
      if (!circleClear(net, land, c, 10)) continue;
      into.push(make(kind, c));
      made++;
    }
  };
  // **수는 판 넓이를 탄다.** 개수를 고정해 두면 맵을 넓힐 때 도시가 듬성해져, 같은
  // 게임이 아니라 그저 넓기만 한 판이 된다. 나누는 값은 지금 판의 빽빽함이다.
  const area = w * h;
  const some = (fixed, per) => (fixed == null ? Math.max(1, Math.round(area / per)) : fixed);
  blobs('lake', some(o.lakes, 592000), 26, 52, land.water);
  blobs('hill', some(o.hills, 355000), 30, 62, land.hills);

  // 건물. 길이 남긴 빈 자리를 채운다.
  const want = some(o.buildings, 11800);
  let left = want * 12;
  while (land.buildings.length < want && left-- > 0) {
    const bw = 16 + rng() * 30;
    const bh = 16 + rng() * 30;
    const r = { x: 12 + rng() * (w - 24 - bw), y: 12 + rng() * (h - 24 - bh), w: bw, h: bh };
    if (!rectClear(net, land, r, ROAD_PAD)) continue;
    land.buildings.push(make('building', r));
  }
  return land;
}

const api = {
  generate, spanOf, at, offRoads, smooth, boxOf, river,
  inRect, inCircle, inBand, holds,
  ROAD_PAD, STEP,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadTerrain = api;

})(typeof window !== 'undefined' ? window : globalThis);

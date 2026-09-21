'use strict';

// 자와 컴퍼스. 도로가 곡선이라 필요한 것은 셋뿐이다 — 베지어를 꺾은선으로 펴고,
// 그 꺾은선을 옆으로 밀어 차로를 만들고, 그 위의 거리 s로 자리를 찾는 것.
//
// **곡선의 오프셋은 정확히 구하지 않는다.** 베지어를 평행 이동한 곡선은 베지어가
// 아니라서 닫힌 식이 없다. 대신 중심선을 촘촘히 펴 놓고 점마다 법선 방향으로 민다 —
// 차 한 대가 5~10단위인 이 게임에서는 눈으로도 계산으로도 차이가 없고, 차가 달리는
// 자리는 어차피 "꺾은선 위의 거리"로 다룬다.
//
// 화면 좌표라 y가 아래로 간다. 그래서 진행 방향 (dx, dy)의 **오른쪽**은 (-dy, dx)다 —
// 동쪽(1,0)을 넣으면 남쪽(0,1)이 나온다. 우측 통행이 이 부호 하나에 달려 있다.
(function (root) {

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

// 곡선이 굽을수록 조각을 늘린다. 조각 수를 고정하면 긴 곡선은 각지고 짧은 곡선은
// 쓸데없이 촘촘하다.
function sampleCubic(p0, p1, p2, p3, step) {
  const rough = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    + Math.hypot(p2.x - p1.x, p2.y - p1.y)
    + Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const n = Math.max(6, Math.min(96, Math.ceil(rough / (step || 12))));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(cubic(p0, p1, p2, p3, i / n));
  return out;
}

// 꺾은선에 누적 거리와 점마다의 방향·오른쪽 법선을 붙여 둔다. 차가 달릴 때마다 다시
// 재면 프레임마다 도로 전체를 훑게 된다.
function makePath(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const dir = [];
  for (let i = 0; i < points.length; i++) {
    // 끝점은 한쪽 이웃만, 가운데는 양 이웃을 이어 방향을 잡는다. 이웃 하나만 쓰면
    // 꺾이는 자리에서 법선이 툭 튀어 차로 폭이 들쭉날쭉해진다.
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    dir.push({ x: (b.x - a.x) / len, y: (b.y - a.y) / len });
  }
  return { points, cum, dir, total: cum[cum.length - 1] };
}

function right(d) {
  return { x: -d.y, y: d.x };
}

// 중심선을 오른쪽으로 d만큼 민 길. d가 음수면 왼쪽이다.
function offsetPath(path, d) {
  const moved = path.points.map((p, i) => {
    const n = right(path.dir[i]);
    return { x: p.x + n.x * d, y: p.y + n.y * d };
  });
  // 민 뒤에는 길이가 달라진다(안쪽은 짧고 바깥쪽은 길다). 누적 거리를 다시 잰다.
  return makePath(moved);
}

function reversePath(path) {
  return makePath(path.points.slice().reverse());
}

// 길 위에서 거리 s인 자리. 앞뒤로 벗어난 값도 끝점으로 접어 돌려준다 — 차가 구간을
// 넘어가는 그 한 프레임에 여기서 터지면 안 된다.
function at(path, s) {
  const { points, cum, dir } = path;
  if (s <= 0) return { x: points[0].x, y: points[0].y, dx: dir[0].x, dy: dir[0].y };
  const last = points.length - 1;
  if (s >= path.total) {
    return { x: points[last].x, y: points[last].y, dx: dir[last].x, dy: dir[last].y };
  }
  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / span;
  const a = points[lo];
  const b = points[hi];
  const da = dir[lo];
  const db = dir[hi];
  const dx = da.x + (db.x - da.x) * t;
  const dy = da.y + (db.y - da.y) * t;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    dx: dx / len,
    dy: dy / len,
  };
}

// **베지어를 t에서 둘로 가른다**(드 카스텔조). 길 한복판에서 새 길이 뻗어 나갈 때
// 그 자리에 점을 내야 하는데, 잘린 두 토막이 원래 곡선과 **정확히 같은 자리를 지나야**
// 한다. 점 몇 개를 다시 꿰어 새 곡선을 만들면 갈라진 자리에서 길이 미세하게 어긋나
// 이미 그 위를 달리던 차가 옆으로 튄다.
function splitCubic(p0, p1, p2, p3, t) {
  const mix = (u, v) => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
  const a = mix(p0, p1);
  const b = mix(p1, p2);
  const c = mix(p2, p3);
  const d = mix(a, b);
  const e = mix(b, c);
  const m = mix(d, e);
  return { at: m, left: [p0, a, d, m], right: [m, e, c, p3] };
}

// 길 위의 거리 s가 베지어의 어느 t인가. **`sampleCubic`이 t를 고르게 떠 놓기 때문에**
// 점 번호가 곧 t다 — 거리로는 고르지 않지만(굽은 데가 촘촘하다) 찾는 것은 t다.
function tOf(path, s) {
  const n = path.points.length - 1;
  if (!(s > 0)) return 0;
  if (s >= path.total) return 1;
  const { cum } = path;
  let lo = 0;
  let hi = n;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  return (lo + (s - cum[lo]) / span) / n;
}

const api = {
  cubic, sampleCubic, makePath, offsetPath, reversePath, right, at, splitCubic, tOf,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadGeom = api;

})(typeof window !== 'undefined' ? window : globalThis);

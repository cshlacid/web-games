'use strict';

// 찍은 점들을 실제로 열차가 달릴 수 있는 선로로 바꾸고, 그 선로의 건설비와
// 소요시간을 구한다. 화면을 전혀 모른다 — node에서 그대로 돌아간다.
(function () {

const Geom = (typeof module !== 'undefined' && module.exports)
  ? require('./geom.js')
  : window.MetroGeom;

// 미터와 초. 화면 좌표와 같은 단위를 쓴다(1 world unit = 1 m).
const LIMITS = {
  V_MAX: 22,     // 최고 속도 (m/s, 약 79km/h)
  ACCEL: 1.0,    // 가속 (m/s²)
  DECEL: 1.1,    // 감속. 가속보다 조금 세다 — 실제 전동차가 그렇다
  A_LAT: 0.8,    // 승차감이 견디는 횡가속도. 곡선 제한속도가 여기서 나온다
  R_MAX: 900,    // 이보다 완만하게는 다듬지 않는다. 605m부터 이미 최고속이라 의미가 없다
  R_MIN: 120,    // 최소 곡선반경. 이보다 급하면 건설 불가
  DS: 6,         // 샘플 간격 (m)
};

// 100m당이 아니라 1m당 억 단위. 건물 밑이 도로 밑의 네 배를 조금 넘는다 —
// 이 배수가 "곧게 뚫을까 돌아갈까"의 값이라 숫자를 바꿀 때 제일 먼저 보는 곳이다.
const UNIT_COST = { road: 0.008, empty: 0.013, building: 0.035 };

// 거의 일직선인 모서리는 호를 끼우지 않는다. 끼워도 눈에 안 보이는데 t가 0에
// 가까워 수치가 불안정해진다.
const STRAIGHT = 0.02;  // rad

// 모서리 하나를 원호로 다듬는다.
//
// 반경은 **가능한 한 크게** 잡는다. 크면 빠르기 때문이고, 그래서 플레이어가 점을
// 넉넉히 벌려 놓는 것이 곧 보상이 된다. 다만 이웃한 모서리와 호가 겹치면 안 되므로
// 양팔에서 각각 45%까지만 쓴다(45+45 < 100).
function fillet(a, c, b, limits) {
  const u = Geom.normalize(a.x - c.x, a.y - c.y);
  const v = Geom.normalize(b.x - c.x, b.y - c.y);
  if (u.len === 0 || v.len === 0) return { ok: false, reason: 'degenerate' };

  let cosT = u.x * v.x + u.y * v.y;
  if (cosT > 1) cosT = 1; else if (cosT < -1) cosT = -1;
  const theta = Math.acos(cosT);            // 두 팔 사이의 각
  if (Math.PI - theta < STRAIGHT) return { ok: true, straight: true };
  if (theta < STRAIGHT) return { ok: false, reason: 'doubled' };

  const half = theta / 2;
  const tanHalf = Math.tan(half);
  const tMax = 0.45 * Math.min(u.len, v.len);
  const r = Math.min(limits.R_MAX, tMax * tanHalf);
  if (r < limits.R_MIN) return { ok: false, reason: 'sharp', r };

  const t = r / tanHalf;
  const w = Geom.normalize(u.x + v.x, u.y + v.y);
  const o = { x: c.x + w.x * (r / Math.sin(half)), y: c.y + w.y * (r / Math.sin(half)) };
  const t1 = { x: c.x + u.x * t, y: c.y + u.y * t };
  const t2 = { x: c.x + v.x * t, y: c.y + v.y * t };
  const a0 = Math.atan2(t1.y - o.y, t1.x - o.x);
  const delta = Geom.wrapAngle(Math.atan2(t2.y - o.y, t2.x - o.x) - a0);

  return {
    ok: true, straight: false, r, t, o, t1, t2, a0, delta,
    vlim: Math.min(limits.V_MAX, Math.sqrt(limits.A_LAT * r)),
  };
}

// 찍은 점들 → 샘플 배열. 직선과 원호를 같은 점 목록으로 떨어뜨린다.
//
// **그린 선과 잰 값이 같은 자료에서 나오게 하려는 것이다.** 화면은 SVG 호 명령으로
// 긋고 계산은 따로 하면, 둘이 어긋났을 때 "보이는 것과 다른 값"이 나오는데 그건
// 찾기 어려운 종류의 버그다.
function build(points, limits = LIMITS) {
  const lim = limits;
  if (points.length < 2) return { ok: false, reason: 'short' };

  const corners = [];
  for (let i = 1; i < points.length - 1; i++) {
    const f = fillet(points[i - 1], points[i], points[i + 1], lim);
    corners.push(f);
    if (!f.ok) return { ok: false, reason: f.reason, at: i, corners };
  }

  const pts = [];
  const segLim = [];

  function lineTo(from, to, vlim) {
    const len = Geom.dist(from.x, from.y, to.x, to.y);
    const n = Math.max(1, Math.ceil(len / lim.DS));
    for (let k = 1; k <= n; k++) {
      pts.push({ x: from.x + (to.x - from.x) * (k / n), y: from.y + (to.y - from.y) * (k / n) });
      segLim.push(vlim);
    }
  }

  function arcTo(c, vlim) {
    const n = Math.max(2, Math.ceil(Math.abs(c.delta) * c.r / lim.DS));
    for (let k = 1; k <= n; k++) {
      const ang = c.a0 + c.delta * (k / n);
      pts.push({ x: c.o.x + Math.cos(ang) * c.r, y: c.o.y + Math.sin(ang) * c.r });
      segLim.push(vlim);
    }
  }

  pts.push({ x: points[0].x, y: points[0].y });
  let from = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const c = corners[i - 1];
    if (c.straight) continue;          // 다듬을 것이 없으면 다음 점까지 한 번에 간다
    lineTo(from, c.t1, lim.V_MAX);
    arcTo(c, c.vlim);
    from = c.t2;
  }
  lineTo(from, points[points.length - 1], lim.V_MAX);

  // 마디마다의 제한이 아니라 **점마다의 제한**으로 바꾼다. 한 점은 앞뒤 두 마디에
  // 걸쳐 있으니 둘 중 엄한 쪽을 따른다.
  const nodeLim = new Array(pts.length);
  const s = new Array(pts.length);
  s[0] = 0;
  for (let i = 0; i < pts.length; i++) {
    const before = i > 0 ? segLim[i - 1] : Infinity;
    const after = i < segLim.length ? segLim[i] : Infinity;
    nodeLim[i] = Math.min(before, after);
    if (i > 0) s[i] = s[i - 1] + Geom.dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  }

  return { ok: true, corners, pts, segLim, nodeLim, s, length: s[pts.length - 1] };
}

// 전진·후진 스윕. 역에서 서 있다가 출발해 다음 역에서 선다.
//
// 전진만 하면 다음 역 앞에서 감속할 자리를 남기지 않아 열차가 역을 지나쳐 버린다.
// 후진 스윕이 "여기서부터는 이미 줄이고 있어야 한다"를 거꾸로 심는다.
function profile(path, limits = LIMITS) {
  const { pts, nodeLim, s } = path;
  const n = pts.length;
  const v = new Array(n);

  v[0] = 0;
  for (let i = 0; i + 1 < n; i++) {
    const ds = s[i + 1] - s[i];
    v[i + 1] = Math.min(nodeLim[i + 1], Math.sqrt(v[i] * v[i] + 2 * limits.ACCEL * ds));
  }

  v[n - 1] = 0;
  for (let i = n - 2; i >= 0; i--) {
    const ds = s[i + 1] - s[i];
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * limits.DECEL * ds));
  }

  let time = 0;
  let peak = 0;
  for (let i = 0; i + 1 < n; i++) {
    const ds = s[i + 1] - s[i];
    const sum = v[i] + v[i + 1];
    if (sum > 0) time += 2 * ds / sum;
    if (v[i] > peak) peak = v[i];
  }
  return { v, time, peak };
}

// 지나가는 땅을 세 갈래로 나눠 길이를 재고 값을 매긴다.
//
// `classify`를 밖에서 받는 것은 이 파일이 도시를 모르게 하려는 것이다. 테스트에서는
// 건물 한 채짜리 가짜 도시를 넘긴다.
function cost(path, classify, unit = UNIT_COST) {
  const { pts, s } = path;
  const lengths = { road: 0, empty: 0, building: 0 };
  const runs = [];
  let run = null;

  for (let i = 0; i + 1 < pts.length; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    const kind = classify(mx, my);
    lengths[kind] += s[i + 1] - s[i];

    // 건물 밑으로 지나는 토막을 이어 붙여 둔다. 화면이 그 부분만 붉게 덧그린다.
    if (kind === 'building') {
      if (run && run.to === i) run.to = i + 1;
      else { run = { from: i, to: i + 1 }; runs.push(run); }
    }
  }

  const total = lengths.road * unit.road + lengths.empty * unit.empty + lengths.building * unit.building;
  return { lengths, runs, cost: total };
}

// 샘플 그대로를 SVG 경로로 만든다. 호 명령을 쓰지 않는 이유는 build()에 적어 두었다.
function svgPath(pts, from = 0, to = -1) {
  const last = to < 0 ? pts.length - 1 : to;
  let d = `M ${pts[from].x.toFixed(1)} ${pts[from].y.toFixed(1)}`;
  for (let i = from + 1; i <= last; i++) d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  return d;
}

const Route = { LIMITS, UNIT_COST, fillet, build, profile, cost, svgPath };

if (typeof module !== 'undefined' && module.exports) module.exports = Route;
if (typeof window !== 'undefined') window.MetroRoute = Route;

})();

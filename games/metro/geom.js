'use strict';

// 자와 컴퍼스. 도시 생성기와 경로 계산이 함께 쓰는 것만 둔다.
//
// 여기 있는 함수는 전부 순수 함수다 — 브라우저 없이 node로 규칙을 검증하려면
// 도형 계산이 DOM을 모르는 곳에 있어야 한다.
(function () {

const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// 점에서 선분까지의 최단 거리와 그 발. 도로 스냅과 "이 점이 도로 위인가" 판정이
// 같은 계산을 쓰므로 발의 좌표까지 함께 돌려준다.
function nearestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { x, y, t, d: Math.hypot(px - x, py - y) };
}

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// 각도 차이를 (-π, π]로 접는다. 원호를 그릴 때 **짧은 쪽으로 돌기 위해** 필요하다 —
// 접지 않고 a1 - a0을 그대로 쓰면 어떤 모서리에서 열십자로 감아 도는 호가 나온다.
function wrapAngle(a) {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  else if (x <= -Math.PI) x += TAU;
  return x;
}

function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
}

// 점들을 잇는 꺾은선의 길이. 샘플 배열에도 그대로 쓴다.
function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }
  return total;
}

// 꺾은선 위에서 점에 가장 가까운 자리. 어느 마디(i-1 ~ i)인지까지 돌려준다 —
// 선을 잡아 끌 때 새 중간점을 **몇 번째 자리에 끼울지**가 이 값으로 정해진다.
function nearestOnPolyline(px, py, points) {
  let best = { d: Infinity, x: 0, y: 0, index: 0, t: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const near = nearestOnSegment(px, py, a.x, a.y, b.x, b.y);
    if (near.d < best.d) best = { d: near.d, x: near.x, y: near.y, index: i, t: near.t };
  }
  return best;
}

const Geom = { TAU, dist, nearestOnSegment, pointInRect, wrapAngle, normalize, polylineLength, nearestOnPolyline };

if (typeof module !== 'undefined' && module.exports) module.exports = Geom;
if (typeof window !== 'undefined') window.MetroGeom = Geom;

})();

'use strict';

// 실행: node games/roadworks/geom.test.js
const G = require('./geom.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

function near(name, actual, expected, slack = 0.01) {
  if (Math.abs(actual - expected) <= slack) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${actual}\n  기대 ${expected} ±${slack}`); }
}

const P = (x, y) => ({ x, y });

// --- 베지어 ---

{
  const a = P(0, 0);
  const b = P(100, 0);
  check('t=0은 시작점', G.cubic(a, P(30, 40), P(70, 40), b, 0), a);
  check('t=1은 끝점', G.cubic(a, P(30, 40), P(70, 40), b, 1), b);
  const mid = G.cubic(a, P(0, 60), P(100, 60), b, 0.5);
  near('가운데는 제어점 쪽으로 당겨진다', mid.y, 45);
  near('좌우 대칭이면 가운데도 가운데', mid.x, 50);
}

{
  const pts = G.sampleCubic(P(0, 0), P(10, 0), P(20, 0), P(30, 0));
  check('곧은 길도 양 끝을 담는다', [pts[0], pts[pts.length - 1]], [P(0, 0), P(30, 0)]);
  check('짧은 길은 조각이 적다', pts.length <= 10, true);
  const long = G.sampleCubic(P(0, 0), P(200, 0), P(400, 0), P(600, 0));
  check('긴 길은 조각이 는다', long.length > pts.length, true);
}

// --- 꺾은선 ---

{
  const path = G.makePath([P(0, 0), P(30, 0), P(30, 40)]);
  near('누적 거리가 길이다', path.total, 70);
  const mid = G.at(path, 30);
  check('모서리 자리', [Math.round(mid.x), Math.round(mid.y)], [30, 0]);
  const on = G.at(path, 50);
  check('두 번째 마디 위', [Math.round(on.x), Math.round(on.y)], [30, 20]);
  // 모서리의 방향은 양 이웃을 이어 잡으므로 꺾이는 자리 부근에서는 비스듬하다.
  // 그래서 모서리에서 충분히 떨어진 자리로 본다.
  near('마디 끝에서는 방향이 아래쪽', G.at(path, 68).dy, 1, 0.02);
  check('모서리 부근은 방향이 섞인다', on.dy < 0.98, true);

  const before = G.at(path, -20);
  check('앞으로 벗어나면 시작점', [before.x, before.y], [0, 0]);
  const after = G.at(path, 999);
  check('뒤로 벗어나면 끝점', [after.x, after.y], [30, 40]);
}

// --- 오른쪽과 차로 ---

{
  // 화면 좌표는 y가 아래로 간다. 동쪽으로 갈 때의 오른쪽은 남쪽이다 — 우측 통행이
  // 이 부호에 달려 있다.
  check('동쪽의 오른쪽은 남쪽', G.right({ x: 1, y: 0 }), { x: 0, y: 1 });
  check('북쪽의 오른쪽은 동쪽', G.right({ x: 0, y: -1 }), { x: 1, y: 0 });

  const road = G.makePath(G.sampleCubic(P(0, 100), P(100, 100), P(200, 100), P(300, 100)));
  const rightLane = G.offsetPath(road, 5);
  const leftLane = G.offsetPath(road, -5);
  near('오른쪽 차로는 아래로 밀린다', rightLane.points[0].y, 105);
  near('왼쪽 차로는 위로 밀린다', leftLane.points[0].y, 95);
  near('곧은 길은 밀어도 길이가 같다', rightLane.total, road.total, 0.5);
}

{
  // 굽은 길에서는 안쪽이 짧고 바깥쪽이 길다. 차로마다 길이를 다시 재는 이유다.
  const bend = G.makePath(G.sampleCubic(P(0, 0), P(0, 80), P(80, 120), P(160, 120)));
  const inner = G.offsetPath(bend, -6);
  const outer = G.offsetPath(bend, 6);
  check('안쪽 차로가 더 짧다', inner.total < outer.total, true);
}

{
  const path = G.makePath([P(0, 0), P(100, 0)]);
  const back = G.reversePath(path);
  check('뒤집으면 시작과 끝이 바뀐다', [back.points[0], back.points[back.points.length - 1]],
    [P(100, 0), P(0, 0)]);
  near('길이는 그대로', back.total, path.total);
  near('방향도 뒤집힌다', back.dir[0].x, -1);
}

// --- 가르기 ---

{
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 40, y: 120 };
  const p2 = { x: 160, y: 120 };
  const p3 = { x: 200, y: 0 };
  const cut = G.splitCubic(p0, p1, p2, p3, 0.35);

  check('가른 자리가 그 t의 점', [Math.round(cut.at.x), Math.round(cut.at.y)],
    [Math.round(G.cubic(p0, p1, p2, p3, 0.35).x), Math.round(G.cubic(p0, p1, p2, p3, 0.35).y)]);
  check('앞뒤가 맞닿는다', [cut.left[3], cut.right[0]], [cut.at, cut.at]);

  // **두 토막을 이으면 원래 곡선과 같은 자리를 지난다.** 이것이 깨지면 갈라진 길
  // 위를 달리던 차가 그 자리에서 옆으로 튄다.
  let off = 0;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const want = G.cubic(p0, p1, p2, p3, t);
    const got = t <= 0.35
      ? G.cubic(cut.left[0], cut.left[1], cut.left[2], cut.left[3], t / 0.35)
      : G.cubic(cut.right[0], cut.right[1], cut.right[2], cut.right[3], (t - 0.35) / 0.65);
    off = Math.max(off, Math.hypot(want.x - got.x, want.y - got.y));
  }
  near('가른 곡선이 원래 곡선과 겹친다', off, 0, 1e-9);
}

{
  // 거리에서 t로. `sampleCubic`이 t를 고르게 떠 놓아 점 번호가 곧 t다.
  const path = G.makePath(G.sampleCubic(
    { x: 0, y: 0 }, { x: 40, y: 120 }, { x: 160, y: 120 }, { x: 200, y: 0 },
  ));
  check('양 끝', [G.tOf(path, -5), G.tOf(path, path.total + 5)], [0, 1]);
  const t = G.tOf(path, path.total / 2);
  const want = G.at(path, path.total / 2);
  const got = G.cubic({ x: 0, y: 0 }, { x: 40, y: 120 }, { x: 160, y: 120 }, { x: 200, y: 0 }, t);
  near('가운데 거리의 t가 그 자리를 가리킨다', Math.hypot(want.x - got.x, want.y - got.y), 0, 0.2);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

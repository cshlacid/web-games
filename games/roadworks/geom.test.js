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

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

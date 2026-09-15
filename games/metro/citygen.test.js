'use strict';

// 실행: node games/metro/citygen.test.js
const C = require('./citygen.js');
const Geom = require('./geom.js');

let passed = 0;
let failed = 0;

function ok(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.log(`실패: ${name}${extra ? `\n  ${extra}` : ''}`); }
}

const SEEDS = [1, 2, 7, 23, 99];

// --- 재현성 ---
{
  const a = C.create(7);
  const b = C.create(7);
  ok('같은 씨앗이면 같은 도시',
    JSON.stringify(a.buildings) === JSON.stringify(b.buildings)
    && JSON.stringify(a.stations) === JSON.stringify(b.stations));
  ok('다른 씨앗이면 다른 도시',
    JSON.stringify(C.create(8).buildings) !== JSON.stringify(a.buildings));
}

// --- 규격 ---
for (const seed of SEEDS) {
  const city = C.create(seed);

  ok(`씨앗 ${seed}: 건물 수가 상한 안이다`,
    city.buildings.length > 220 && city.buildings.length <= C.MAX_BUILDINGS,
    `${city.buildings.length}채`);

  ok(`씨앗 ${seed}: 역이 넉넉히 나온다`, city.stations.length >= 5, `${city.stations.length}개`);

  // 역은 도로 위에만. 건물 위에 놓이면 규칙 위반이다.
  const offRoad = city.stations.filter((s) => C.classify(city, s.x, s.y) !== 'road');
  ok(`씨앗 ${seed}: 역은 모두 도로 위`, offRoad.length === 0, JSON.stringify(offRoad));

  // 너무 붙은 역이 있으면 경로를 편집할 자리가 안 나온다.
  let tooClose = 0;
  for (let i = 0; i < city.stations.length; i++) {
    for (let j = i + 1; j < city.stations.length; j++) {
      if (Geom.dist(city.stations[i].x, city.stations[i].y,
                    city.stations[j].x, city.stations[j].y) <= 520) tooClose++;
    }
  }
  ok(`씨앗 ${seed}: 역끼리 충분히 떨어져 있다`, tooClose === 0, `${tooClose}쌍`);

  // 건물이 길 위에 올라앉으면 "역은 도로나 빈 땅에만"이라는 규칙이 무너진다.
  let onRoad = 0;
  for (const b of city.buildings) {
    for (const r of city.roads) {
      if (C.segRectDistance(r, b) < r.w / 2) { onRoad++; break; }
    }
  }
  ok(`씨앗 ${seed}: 건물이 도로를 침범하지 않는다`, onRoad === 0, `${onRoad}채`);

  // 도심이 외곽보다 빽빽해야 도심–외곽 장거리 수요가 값지다는 구조가 선다.
  const cx = city.world.w / 2;
  const cy = city.world.h / 2;
  const inner = city.buildings.filter((b) => Geom.dist(b.x, b.y, cx, cy) < 600).length;
  const outer = city.buildings.filter((b) => Geom.dist(b.x, b.y, cx, cy) > 1100).length;
  ok(`씨앗 ${seed}: 도심이 외곽보다 빽빽하다`, inner > outer, `안 ${inner} / 밖 ${outer}`);
}

// --- 땅 가르기 ---
{
  const city = C.create(3);
  const b = city.buildings[0];
  ok('건물 한가운데는 건물', C.classify(city, b.x + b.w / 2, b.y + b.h / 2) === 'building');

  const r = city.roads[0];
  ok('도로 중심선 위는 도로',
    C.classify(city, (r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2) === 'road');

  const kinds = new Set(city.buildings.map((x) => x.kind));
  ok('건물 종류가 세 갈래로 나온다', kinds.size === 3, [...kinds].join(','));
}

// --- 도로 자석 ---
{
  const city = C.create(5);
  const r = city.roads[0];
  const on = { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 };
  const near = C.snapToRoad(city, on.x + 18, on.y, 40);
  ok('가까우면 도로에 붙는다', near !== null && near.d <= 18.001, JSON.stringify(near));

  // 도로에서 충분히 먼 자리를 찾아 자석이 풀리는지 본다.
  let far = null;
  for (let x = 0; x < city.world.w && !far; x += 7) {
    for (let y = 0; y < city.world.h && !far; y += 7) {
      if (!C.snapToRoad(city, x, y, 60)) far = { x, y };
    }
  }
  ok('멀면 자유롭게 놓인다', far !== null && C.snapToRoad(city, far.x, far.y, 60) === null);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

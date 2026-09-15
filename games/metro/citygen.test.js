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

// 색인을 거치지 않고 전부 훑는 판정. 빠른 쪽이 이것과 같은 답을 내는지 보는 데만 쓴다.
function slowClassify(city, x, y) {
  for (const s of city.segments) {
    if (Geom.nearestOnSegment(x, y, s.x1, s.y1, s.x2, s.y2).d <= s.w / 2) return 'road';
  }
  for (const b of city.buildings) if (Geom.pointInRect(x, y, b)) return 'building';
  return 'empty';
}

// --- 재현성 ---
{
  ok('같은 씨앗·난이도면 같은 도시',
    JSON.stringify(C.create(7, 1).buildings) === JSON.stringify(C.create(7, 1).buildings));
  ok('씨앗이 다르면 다른 도시',
    JSON.stringify(C.create(8, 1).buildings) !== JSON.stringify(C.create(7, 1).buildings));
  ok('난이도가 다르면 다른 도시',
    JSON.stringify(C.create(7, 2).buildings) !== JSON.stringify(C.create(7, 1).buildings));
}

// --- 창과 도시 ---
{
  const city = C.create(1, 1);
  ok('도시가 한 화면보다 넓다', city.world.w > city.view.w && city.world.h > city.view.h,
    `${city.world.w}×${city.world.h} vs ${city.view.w}×${city.view.h}`);
  ok('도시와 창의 비율이 같다',
    Math.abs(city.world.w / city.world.h - city.view.w / city.view.h) < 1e-9);
}

// --- 규격 ---
for (const level of [0, 1, 2]) {
  const name = C.LEVELS[level].id;
  for (const seed of SEEDS) {
    const city = C.create(seed, level);

    ok(`${name}/${seed}: 건물 수가 상한 안이다`,
      city.buildings.length > 300 && city.buildings.length < C.MAX_BUILDINGS,
      `${city.buildings.length}채`);

    ok(`${name}/${seed}: 역이 넉넉히 나온다`, city.stations.length >= 10, `${city.stations.length}개`);

    // 역은 도로 위에만. 건물 위에 놓이면 규칙 위반이다.
    const offRoad = city.stations.filter((s) => C.classify(city, s.x, s.y) !== 'road');
    ok(`${name}/${seed}: 역은 모두 도로 위`, offRoad.length === 0, JSON.stringify(offRoad));

    let tooClose = 0;
    for (let i = 0; i < city.stations.length; i++) {
      for (let j = i + 1; j < city.stations.length; j++) {
        if (Geom.dist(city.stations[i].x, city.stations[i].y,
                      city.stations[j].x, city.stations[j].y) <= 850) tooClose++;
      }
    }
    ok(`${name}/${seed}: 역끼리 충분히 떨어져 있다`, tooClose === 0, `${tooClose}쌍`);

    // 건물이 길 위에 올라앉으면 "역은 도로나 빈 땅에만"이라는 규칙이 무너진다.
    // 굽은 골목은 블록이 사각형이 아니라, 기각 표집이 제대로 걸렀는지 여기서 본다.
    let onRoad = 0;
    for (const b of city.buildings) {
      for (const s of city.segments) {
        if (C.segRectDistance(s, b) < s.w / 2) { onRoad++; break; }
      }
    }
    ok(`${name}/${seed}: 건물이 도로를 침범하지 않는다`, onRoad === 0, `${onRoad}채`);
  }
}

// --- 색인이 전수 검사와 같은 답을 내는가 ---
// 도로도 건물도 수천 개라 색인 없이는 끌 때마다 손이 걸린다. 색인은 넣기도 찾기도
// 어긋나기 쉬운데, 어긋나면 "도로 위인데 빈 땅으로 계산되는" 식으로 조용히 값만
// 틀린다. 그래서 무작위 점으로 두 답을 대조한다.
{
  const city = C.create(3, 2);
  const rng = C.mulberry32(12345);
  let diff = 0;
  let counts = { road: 0, building: 0, empty: 0 };
  for (let i = 0; i < 4000; i++) {
    const x = rng() * city.world.w;
    const y = rng() * city.world.h;
    const fast = C.classify(city, x, y);
    counts[fast]++;
    if (fast !== slowClassify(city, x, y)) diff++;
  }
  ok('색인을 쓴 판정이 전수 검사와 같다', diff === 0, `${diff}곳 다름`);
  ok('세 갈래가 다 나온다', counts.road > 0 && counts.building > 0 && counts.empty > 0,
    JSON.stringify(counts));
}

// --- 난이도가 지형을 바꾸는가 ---
{
  const share = (level) => {
    let old = 0;
    let total = 0;
    for (const seed of SEEDS) {
      const city = C.create(seed, level);
      for (const b of city.blocks) { total++; if (b.kind === 'old') old++; }
    }
    return old / total;
  };
  const easy = share(0);
  const normal = share(1);
  const hard = share(2);
  ok('어려울수록 구시가지가 넓다', easy < normal && normal < hard,
    `${easy.toFixed(2)} < ${normal.toFixed(2)} < ${hard.toFixed(2)}`);

  const count = (level) => SEEDS.reduce((sum, seed) => sum + C.create(seed, level).buildings.length, 0);
  ok('어려울수록 건물이 많다', count(0) < count(1) && count(1) < count(2),
    `${count(0)} < ${count(1)} < ${count(2)}`);

  // 골목이 굽는 것이 구시가지를 계획도시와 가르는 한 가지다. 계획도시의 길은 곧다.
  const city = C.create(2, 2);
  const bent = city.roads.filter((r) => r.kind === 'old' && r.pts.length > 2).length;
  const straightPlanned = city.roads.filter((r) => r.kind === 'planned' && r.pts.length !== 2).length;
  ok('구시가지 골목은 꺾은선이다', bent > 20, `${bent}개`);
  ok('계획도시 길은 곧다', straightPlanned === 0, `${straightPlanned}개가 굽음`);
}

// --- 땅 가르기와 도로 자석 ---
{
  const city = C.create(3, 1);
  const b = city.buildings[0];
  ok('건물 한가운데는 건물', C.classify(city, b.x + b.w / 2, b.y + b.h / 2) === 'building');

  const s = city.segments[0];
  ok('도로 중심선 위는 도로',
    C.classify(city, (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2) === 'road');

  const kinds = new Set(city.buildings.map((x) => x.kind));
  ok('건물 종류가 세 갈래로 나온다', kinds.size === 3, [...kinds].join(','));

  const on = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
  const near = C.snapToRoad(city, on.x + 18, on.y, 40);
  ok('가까우면 도로에 붙는다', near !== null && near.d <= 18.001, JSON.stringify(near));

  let far = null;
  for (let i = 0; i < 20000 && !far; i++) {
    const x = (i * 37) % city.world.w;
    const y = (i * 91) % city.world.h;
    if (!C.snapToRoad(city, x, y, 60)) far = { x, y };
  }
  ok('멀면 자유롭게 놓인다', far !== null && C.snapToRoad(city, far.x, far.y, 60) === null);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

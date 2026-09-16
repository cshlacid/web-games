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
  for (const s of city.waterSegments) {
    if (Geom.nearestOnSegment(x, y, s.x1, s.y1, s.x2, s.y2).d <= s.w / 2) return 'water';
  }
  for (const h of city.hills) if (Math.hypot(x - h.x, y - h.y) <= h.r) return 'hill';
  for (const s of city.segments) {
    if (Geom.nearestOnSegment(x, y, s.x1, s.y1, s.x2, s.y2).d <= s.w / 2) return 'road';
  }
  for (const b of city.buildings) if (b.level > 0 && Geom.pointInRect(x, y, b)) return 'building';
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

    ok(`${name}/${seed}: 건물 후보가 넉넉하다`,
      city.buildings.length > 300 && city.buildings.length < C.MAX_BUILDINGS,
      `${city.buildings.length}채`);

    // 처음에는 듬성듬성해야 한다. 자랄 여지가 없으면 노선을 놓는 보람이 없다.
    const standing = city.buildings.filter((b) => b.level > 0).length;
    ok(`${name}/${seed}: 처음에는 후보의 일부만 서 있다`,
      standing > 0 && standing < city.buildings.length * 0.55,
      `${standing}/${city.buildings.length}`);

    ok(`${name}/${seed}: 역은 하나도 없이 시작한다`, city.stations.length === 0);

    // 건물이 길 위에 올라앉으면 "역은 도로나 빈 땅에만"이라는 규칙이 무너진다.
    // 굽은 골목은 블록이 사각형이 아니라, 기각 표집이 제대로 걸렀는지 여기서 본다.
    let onRoad = 0;
    for (const b of city.buildings) {
      for (const s of city.segments) {
        if (C.segRectDistance(s, b) < s.w / 2) { onRoad++; break; }
      }
    }
    ok(`${name}/${seed}: 건물이 도로를 침범하지 않는다`, onRoad === 0, `${onRoad}채`);

    // 물이나 산 위의 건물은 지을 수 없다.
    const drowned = city.buildings.filter((b) =>
      C.isWater(city, b.x + b.w / 2, b.y + b.h / 2) || C.isHill(city, b.x + b.w / 2, b.y + b.h / 2)).length;
    ok(`${name}/${seed}: 건물이 물·산 위에 없다`, drowned === 0, `${drowned}채`);

    // 산을 관통하는 길은 없다. 물은 간선만 다리로 건넌다.
    let inHill = 0;
    let localOnWater = 0;
    for (const road of city.roads) {
      for (let i = 1; i < road.pts.length; i++) {
        const mx = (road.pts[i - 1].x + road.pts[i].x) / 2;
        const my = (road.pts[i - 1].y + road.pts[i].y) / 2;
        if (C.isHill(city, mx, my)) inHill++;
        if (road.kind !== 'arterial' && C.isWater(city, mx, my)) localOnWater++;
      }
    }
    ok(`${name}/${seed}: 길이 산을 관통하지 않는다`, inHill === 0, `${inHill}토막`);
    ok(`${name}/${seed}: 국지도로가 물 위에 없다`, localOnWater === 0, `${localOnWater}토막`);
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

// --- 지형 ---
{
  for (const level of [0, 1, 2]) {
    let water = 0;
    let hills = 0;
    for (const seed of SEEDS) {
      const city = C.create(seed, level);
      water += city.water.length;
      hills += city.hills.length;
    }
    ok(`${C.LEVELS[level].id}: 강이 늘 하나는 있다`, water >= SEEDS.length, `${water}줄기`);
    ok(`${C.LEVELS[level].id}: 산이 있다`, hills > 0, `${hills}덩이`);
  }

  // 물에 잠긴 봉우리는 섬처럼 보인다. 바다를 가로지르는 간선은 어디로도 가지
  // 않는 다리라 잘못 그린 것으로 보인다. 강 위의 다리는 그대로 둔다.
  let sunk = 0;
  let onSea = 0;
  let bridges = 0;
  for (const level of [0, 1, 2]) for (const seed of SEEDS) {
    const city = C.create(seed, level);
    sunk += city.hills.filter((h) => C.isWater(city, h.x, h.y)).length;
    for (const road of city.roads) {
      if (road.kind !== 'arterial') continue;
      for (let i = 1; i < road.pts.length; i++) {
        const mx = (road.pts[i - 1].x + road.pts[i].x) / 2;
        const my = (road.pts[i - 1].y + road.pts[i].y) / 2;
        if (C.isSea(city, mx, my)) onSea++;
        else if (C.isWater(city, mx, my)) bridges++;
      }
    }
  }
  ok('봉우리가 물에 잠기지 않는다', sunk === 0, `${sunk}덩이`);
  ok('간선이 바다를 가로지르지 않는다', onSea === 0, `${onSea}토막`);
  ok('강에는 다리가 놓인다', bridges > 0, `${bridges}토막`);

  const city = C.create(4, 2);
  const kinds = new Set();
  const rng = C.mulberry32(777);
  for (let i = 0; i < 6000; i++) {
    kinds.add(C.classify(city, rng() * city.world.w, rng() * city.world.h));
  }
  ok('다섯 갈래가 다 나온다', kinds.size === 5, [...kinds].join(','));
}

// --- 간선에도 삼거리가 있다 ---
// 곧게 관통하기만 하면 교차점이 전부 사거리라 어느 길로 가나 같다. 어긋나거나
// 중간에서 끊기는 간선이 있어야 길마다 성질이 갈린다.
{
  const rng = C.mulberry32(4242);
  const cross = [];
  for (let t = 600; t < 5400; t += 600) cross.push(t);
  let bent = 0;
  let cutShort = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const pts = C.arterial(2400, 5400, cross, rng, true);
    if (pts.length === 4) bent++;
    const from = Math.min(pts[0].y, pts[pts.length - 1].y);
    const to = Math.max(pts[0].y, pts[pts.length - 1].y);
    if (from > 1 || to < 5399) cutShort++;
  }
  ok('어긋나는 간선이 제법 나온다', bent > N * 0.2 && bent < N * 0.7, `${bent}/${N}`);
  ok('중간에서 끊기는 간선도 나온다', cutShort > N * 0.15 && cutShort < N * 0.5, `${cutShort}/${N}`);

  // 끊긴 간선이 도시를 반으로 가르면 안 된다 — 자를 자리는 가장자리 쪽으로 물려 둔다.
  let middleCut = 0;
  for (let i = 0; i < N; i++) {
    const pts = C.arterial(2400, 5400, cross, rng, true);
    const from = Math.min(pts[0].y, pts[pts.length - 1].y);
    const to = Math.max(pts[0].y, pts[pts.length - 1].y);
    if (from > 5400 * 0.45 || to < 5400 * 0.55) middleCut++;
  }
  ok('한가운데서 자르지는 않는다', middleCut === 0, `${middleCut}줄`);
}

// --- 격자가 아닌 구시가지 ---
// 격자에서는 노선을 그을 때 고민할 것이 없다. 어느 길을 타도 비슷하기 때문이다.
// 각도가 축(0°·90°)에서 얼마나 벗어나는지로 "격자인가"를 잰다.
{
  const skew = (city, kind) => {
    let off = 0;
    let all = 0;
    for (const road of city.roads) {
      if (road.kind !== kind) continue;
      for (let i = 1; i < road.pts.length; i++) {
        const a = Math.abs(Math.atan2(road.pts[i].y - road.pts[i - 1].y, road.pts[i].x - road.pts[i - 1].x));
        const fold = Math.min(a, Math.abs(Math.PI / 2 - a), Math.abs(Math.PI - a));
        all++;
        if (fold > 0.26) off++;   // 15°
      }
    }
    return all ? off / all : null;
  };

  let oldSkew = 0;
  let plannedSkew = 0;
  let oldSeen = 0;
  let plannedSeen = 0;
  for (const seed of SEEDS) {
    const city = C.create(seed, 2);
    const o = skew(city, 'old');
    if (o != null) { oldSkew += o; oldSeen++; }
    const p = skew(city, 'planned');
    if (p != null) { plannedSkew += p; plannedSeen++; }
  }
  ok('구시가지 골목은 축을 벗어난다', oldSeen > 0 && oldSkew / oldSeen > 0.5,
    `${(oldSkew / Math.max(1, oldSeen)).toFixed(2)}`);
  if (plannedSeen) {
    ok('계획도시 길은 축에 붙어 있다', plannedSkew / plannedSeen < 0.02,
      `${(plannedSkew / plannedSeen).toFixed(2)}`);
  }
}

// --- 역은 플레이어가 놓는다 ---
{
  const city = C.create(6, 1);
  const rng = C.mulberry32(31);

  const find = (want) => {
    for (let i = 0; i < 20000; i++) {
      const x = 200 + rng() * (city.world.w - 400);
      const y = 200 + rng() * (city.world.h - 400);
      if (C.classify(city, x, y) === want) return { x, y };
    }
    return null;
  };

  for (const [ground, why] of [['water', 'water'], ['hill', 'hill'], ['building', 'building']]) {
    const at = find(ground);
    ok(`${ground} 위에는 역을 놓을 수 없다`, at && C.canPlaceStation(city, at.x, at.y) === why,
      at ? C.canPlaceStation(city, at.x, at.y) : '자리를 못 찾음');
    if (at) ok(`${ground} 위에서는 addStation이 아무것도 안 만든다`, C.addStation(city, at.x, at.y) === null);
  }

  ok('지도 밖은 거절한다', C.canPlaceStation(city, 5, 5) === 'outside');

  const spot = find('empty');
  ok('빈 땅에는 놓을 수 있다', spot && C.canPlaceStation(city, spot.x, spot.y) === null);
  const made = C.addStation(city, spot.x, spot.y);
  ok('놓으면 역 목록에 들어간다', made && city.stations.length === 1);
  ok('바로 옆에는 또 못 놓는다',
    C.canPlaceStation(city, spot.x + C.STATION_GAP * 0.5, spot.y) === 'close');
  ok('충분히 떨어지면 다시 볼 일 없다',
    C.canPlaceStation(city, spot.x + C.STATION_GAP * 1.2, spot.y) !== 'close');
}

// --- 도시가 자란다 ---
{
  const city = C.create(6, 1);
  const before = city.buildings.reduce((sum, b) => sum + b.level, 0);
  const center = { x: city.core.x, y: city.core.y };

  const grown = C.grow(city, [center], 520, 12);
  ok('예산만큼만 자란다', grown.length === 12, `${grown.length}곳`);
  ok('어디가 자랐는지 돌려준다',
    grown.every((id) => city.buildings[id] && city.buildings[id].level >= 1));
  ok('자란 만큼 층수 합이 는다',
    city.buildings.reduce((sum, b) => sum + b.level, 0) === before + 12);

  let far = 0;
  let over = 0;
  for (const b of city.buildings) {
    if (b.level > b.cap) over++;
    if (Geom.dist(b.x + b.w / 2, b.y + b.h / 2, center.x, center.y) > 520 + 1 && b.level > 1) far++;
  }
  ok('상한을 넘지 않는다', over === 0, `${over}채`);
  ok('반경 밖은 자라지 않는다', far === 0, `${far}채`);

  // 오래 굴려도 상한에서 멎는다. 안 멎으면 도시가 무한히 자란다.
  for (let i = 0; i < 400; i++) C.grow(city, [center], 520, 40);
  const stuck = city.buildings.filter((b) =>
    Geom.dist(b.x + b.w / 2, b.y + b.h / 2, center.x, center.y) <= 520 && b.level < b.cap).length;
  ok('끝까지 굴리면 반경 안이 모두 상한에 닿는다', stuck === 0, `${stuck}채 남음`);
  ok('상한을 넘긴 건물이 없다', city.buildings.every((b) => b.level <= b.cap));

  // 같은 도시에서 같은 순서로 부르면 같은 결과가 나와야 한다.
  const a = C.create(9, 1);
  const b = C.create(9, 1);
  C.grow(a, [{ x: a.core.x, y: a.core.y }], 600, 25);
  C.grow(b, [{ x: b.core.x, y: b.core.y }], 600, 25);
  ok('성장도 재현된다',
    JSON.stringify(a.buildings.map((x) => x.level)) === JSON.stringify(b.buildings.map((x) => x.level)));
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

  const lumps = (level) => SEEDS.reduce((sum, seed) => sum + C.create(seed, level).hills.length, 0);
  ok('어려울수록 요금이 짜다',
    C.LEVELS[0].fare > C.LEVELS[1].fare && C.LEVELS[1].fare > C.LEVELS[2].fare,
    C.LEVELS.map((l) => l.fare).join(' > '));
  ok('난이도의 요금 배수가 도시에 실려 나온다',
    [0, 1, 2].every((lv) => C.create(1, lv).fare === C.LEVELS[lv].fare));

  ok('어려울수록 산이 많다', lumps(0) < lumps(1) && lumps(1) < lumps(2),
    `${lumps(0)} < ${lumps(1)} < ${lumps(2)}`);

  const city = C.create(2, 2);
  const bent = city.roads.filter((r) => r.kind === 'old' && r.pts.length > 2).length;
  ok('구시가지 골목은 꺾은선이다', bent > 20, `${bent}개`);
}

// --- 땅 가르기와 도로 자석 ---
{
  const city = C.create(3, 1);
  // 서 있는 건물을 골라야 한다. 아직 level이 0인 후보는 빈 터라 'empty'로 나온다.
  const b = city.buildings.find((x) => x.level > 0);
  ok('서 있는 건물 한가운데는 건물', C.classify(city, b.x + b.w / 2, b.y + b.h / 2) === 'building');
  const plot = city.buildings.find((x) => x.level === 0);
  ok('아직 안 선 자리는 빈 땅', plot && C.classify(city, plot.x + plot.w / 2, plot.y + plot.h / 2) !== 'building');

  const s = city.segments[0];
  ok('도로 중심선 위는 도로',
    C.classify(city, (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2) === 'road');

  const kinds = new Set(city.buildings.map((x) => x.kind));
  ok('건물 종류가 세 갈래로 나온다', kinds.size === 3, [...kinds].join(','));
  ok('종류가 자랄 수 있는 끝을 정한다',
    city.buildings.every((b) => b.cap >= 1 && b.cap <= C.CAP[b.kind]));

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

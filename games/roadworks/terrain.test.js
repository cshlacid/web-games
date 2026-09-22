'use strict';

// 실행: node games/roadworks/terrain.test.js
const Land = require('./terrain.js');
const Geom = require('./geom.js');
const Net = require('./network.js');
const Gen = require('./mapgen.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

function near(name, actual, expected, slack) {
  if (Math.abs(actual - expected) <= slack) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${actual}\n  기대 ${expected} ±${slack}`); }
}

// 동쪽으로 뻗은 곧은 길 하나짜리 꺾은선.
function line(x0, x1, y) {
  return Geom.makePath([{ x: x0, y }, { x: (x0 + x1) / 2, y }, { x: x1, y }]);
}

// --- 들어 있는가 ---

{
  const r = { x: 10, y: 20, w: 30, h: 40 };
  check('네모 안', [Land.inRect(r, 25, 40), Land.inRect(r, 10, 20), Land.inRect(r, 41, 40)],
    [true, true, false]);

  const c = { x: 100, y: 100, r: 20 };
  check('원 안', [Land.inCircle(c, 100, 119), Land.inCircle(c, 100, 121)], [true, false]);

  // 띠(강)는 가운데선에서의 거리로 잰다.
  const band = { path: line(0, 200, 50), w: 20, box: line(0, 200, 50).box };
  check('띠 안', [Land.inBand(band, 100, 55), Land.inBand(band, 100, 65)], [true, false]);
}

// --- 길이 무엇을 지나는가 ---

{
  const land = {
    buildings: [{ kind: 'building', x: 40, y: 40, w: 20, h: 20 }],
    hills: [{ kind: 'hill', x: 150, y: 50, r: 20 }],
    water: [{ kind: 'lake', x: 250, y: 50, r: 15 }],
  };
  const span = Land.spanOf(land, line(0, 300, 50));
  near('건물을 지나는 길이', span.wall, 20, 3);
  near('산을 지나는 길이', span.tunnel, 40, 3);
  near('물을 지나는 길이', span.bridge, 30, 3);
  check('전체 길이', Math.round(span.total), 300);

  // 비켜 가면 아무것도 지나지 않는다.
  const away = Land.spanOf(land, line(0, 300, 200));
  check('비켜 가면 0', [away.wall, away.tunnel, away.bridge], [0, 0, 0]);
  check('장애물이 없으면 0', Land.spanOf(null, line(0, 300, 50)).wall, 0);
}

{
  // 어느 자리가 무엇인가. **건물이 가장 세다** — 겹쳐 있어도 지날 수 없는 쪽이 이긴다.
  const land = {
    buildings: [{ kind: 'building', x: 0, y: 0, w: 10, h: 10 }],
    hills: [{ kind: 'hill', x: 5, y: 5, r: 30 }],
    water: [],
  };
  check('건물이 먼저', Land.at(land, 5, 5), 'building');
  check('그 밖은 산', Land.at(land, 5, 25), 'hill');
  check('아무것도 없는 자리', Land.at(land, 200, 200), null);
}

// --- 만든 판 ---

{
  const net = Gen.city({ seed: 3 });
  const land = net.land;
  check('맵에 장애물이 붙어 온다', !!land, true);
  check('건물이 있다', land.buildings.length > 50, true);
  check('산이 있다', land.hills.length > 0, true);
  check('강이 있다', land.water.some((w) => w.kind === 'river'), true);
  check('호수가 있다', land.water.some((w) => w.kind === 'lake'), true);

  // **건물과 산은 길 위에 앉지 않는다.** 길 위에 건물이 생기면 그 길이 끊긴다.
  let onRoad = 0;
  for (const b of land.buildings) {
    for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h],
      [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h / 2]]) {
      if (!Land.offRoads(net, x, y, 0)) onRoad++;
    }
  }
  check('건물이 길을 물지 않는다', onRoad, 0);
  check('산이 길을 덮지 않는다',
    land.hills.every((hill) => Land.offRoads(net, hill.x, hill.y, hill.r * 0.7)), true);

  // **강만 길을 가로지른다.** 이미 놓인 길이 지나는 자리는 다리가 놓인 것으로 본다.
  const river = land.water.find((w) => w.kind === 'river');
  let crossed = 0;
  for (const seg of net.segs) if (Land.spanOf({ buildings: [], hills: [], water: [river] }, seg.center).bridge > 0) crossed++;
  check('강이 길을 가로지른다', crossed > 0, true);

  check('같은 씨앗은 같은 땅',
    Gen.city({ seed: 3 }).land.buildings.length, land.buildings.length);
  check('씨앗이 다르면 다른 땅',
    Gen.city({ seed: 4 }).land.buildings[0].x !== land.buildings[0].x, true);
}

{
  // 장애물을 끄고 만들 수 있다. 길만 보는 테스트가 건물에 막히지 않아야 한다.
  const net = Gen.city({ seed: 3, land: { buildings: 0, hills: 0, lakes: 0, river: false } });
  check('빈 땅으로도 만든다',
    [net.land.buildings.length, net.land.hills.length, net.land.water.length], [0, 0, 0]);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

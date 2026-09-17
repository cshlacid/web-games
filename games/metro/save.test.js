'use strict';

// 실행: node games/metro/save.test.js
const City = require('./citygen.js');
const Lines = require('./lines.js');
const Save = require('./save.js');

let passed = 0;
let failed = 0;

function ok(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.log(`실패: ${name}${extra ? `\n  ${extra}` : ''}`); }
}

// 놓을 수 있는 자리를 찾아 역을 놓는다. 물·산·건물 위에는 못 놓으므로 둘레를 훑는다.
function put(city, x, y) {
  for (let r = 0; r < 1600; r += 40) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const s = City.addStation(city, x + Math.cos(ang) * r, y + Math.sin(ang) * r);
      if (s) return s;
    }
  }
  throw new Error('역을 놓을 자리가 없다');
}

// 한 판을 꾸민다. 역 셋에 노선 하나, 그중 한 역은 두 노선이 함께 쓴다.
function board() {
  const city = City.create(4242, 1);
  const g = (x, y) => City.classify(city, x, y);
  const a = put(city, city.core.x - 2400, city.core.y);
  const b = put(city, city.core.x, city.core.y);
  const c = put(city, city.core.x, city.core.y + 2400);
  const one = Lines.withExtension(Lines.create(a, b), c);
  one.color = 0;
  one.spent = 37.5;
  Lines.rebuild(one, g);
  return { city, stations: [a, b, c], lines: [one] };
}

const full = (b, extra = {}) => ({
  city: b.city, level: 1, lines: b.lines, budget: 123.5, clock: 30000, speed: 2,
  growWork: 4.25, nextSpawn: 12, demands: [], waiting: new Map(), cam: { x: 100, y: 200 }, zoom: 1.7,
  ...extra,
});

// --- 담고 되살리기 ---
{
  const b = board();
  b.lines[0].patterns[0].trains = 4;
  Lines.setCarAt(b.lines[0].patterns[0], 1, 2, 5);
  b.city.buildings[0].level = b.city.buildings[0].cap;
  b.city.growSeed = 987654321;

  const waiting = new Map([[b.stations[1], 412.5]]);
  const demands = [{ a: { x: 10, y: 20 }, b: { x: 30, y: 40 }, km: 2.2, people: 40, born: 99,
    usage: 0.7, via: {}, served: true }];
  const raw = Save.snapshot(full(b, { waiting, demands }));

  // 자료로만 오가야 한다 — 글자로 바꿨다 되돌려도 같은 것이 나와야 브라우저에서 쓴다.
  const got = Save.restore(JSON.parse(JSON.stringify(raw)));
  ok('되살아난다', !!got);
  if (got) {
    ok('씨앗과 난이도가 같다', got.city.seed === 4242 && got.level === 1);
    ok('건물 수가 같다', got.city.buildings.length === b.city.buildings.length);
    ok('자란 층수가 남는다', got.city.buildings[0].level === b.city.buildings[0].cap,
      String(got.city.buildings[0].level));
    ok('자라는 씨앗도 담긴다', got.city.growSeed === 987654321);
    ok('역이 그대로다', got.city.stations.length === 3
      && got.city.stations[0].id === b.stations[0].id);
    ok('노선이 선다', got.lines.length === 1 && !!got.lines[0].path);
    ok('노선 값이 남는다', got.lines[0].spent === 37.5 && got.lines[0].color === 0);
    ok('열차 수가 남는다', got.lines[0].patterns[0].trains === 4);
    ok('열차마다의 량도 남는다',
      Lines.carsAt(got.lines[0].patterns[0], 1, 2) === 5
      && Lines.carsAt(got.lines[0].patterns[0], 1, 0) === Lines.CARS.base);
    ok('예산과 시계가 남는다', got.budget === 123.5 && got.clock === 30000 && got.speed === 2);
    ok('자란 몫과 다음 수요 시각이 남는다', got.growWork === 4.25 && got.nextSpawn === 12);
    ok('줄이 남는다', got.waiting.get(got.city.stations[1]) === 413,
      String(got.waiting.get(got.city.stations[1])));
    ok('카메라 자리가 남는다', got.cam.x === 100 && got.cam.y === 200);
    ok('배율도 남는다', got.zoom === 1.7, String(got.zoom));
    // 배율 없이 담긴 예전 판도 열려야 한다.
    const old = JSON.parse(JSON.stringify(raw));
    delete old.zoom;
    ok('배율이 없던 판은 보통 배율로 연다', Save.restore(old).zoom === 1);

    // 길과 이용률은 담지 않는다 — 되살린 뒤 한 번 풀면 같은 값이 나온다.
    ok('수요는 자리와 인원만 남는다', got.demands.length === 1
      && got.demands[0].people === 40 && got.demands[0].via === null
      && got.demands[0].usage === 0);

    // **노선이 쓰는 역은 도시의 역과 같은 객체다.** 사본이 되면 환승이 갈라진다.
    ok('노선의 역이 도시의 역과 같은 객체다',
      got.lines[0].stations[0] === got.city.stations[0]
      && got.lines[0].stations[2] === got.city.stations[2]);

    // 다음에 그을 노선이 되살린 번호와 겹치면 안 된다.
    const next = Lines.create(got.city.stations[0], got.city.stations[1]);
    ok('노선 번호가 이어진다', next.id > got.lines[0].id,
      `${next.id} vs ${got.lines[0].id}`);
  }
}

// --- 환승역은 한 객체를 함께 쓴다 ---
{
  const b = board();
  const d = put(b.city, b.city.core.x + 2400, b.city.core.y);
  const two = Lines.create(b.stations[1], d);   // 1번 역을 두 노선이 함께 쓴다
  two.color = 1;
  Lines.rebuild(two, (x, y) => City.classify(b.city, x, y));
  b.lines.push(two);

  const got = Save.restore(JSON.parse(JSON.stringify(Save.snapshot(full(b)))));
  ok('두 노선이 되살아난다', !!got && got.lines.length === 2);
  if (got) {
    ok('환승역은 되살려도 한 객체다',
      got.lines[0].stations[1] === got.lines[1].stations[0]);
  }
}

// --- 어긋난 자료는 되살리지 않는다 ---
{
  const b = board();
  const good = Save.snapshot(full(b));

  ok('판이 다르면 안 되살린다', Save.restore({ ...good, v: good.v + 1 }) === null);
  ok('빈 것은 안 되살린다', Save.restore(null) === null);
  ok('씨앗이 없으면 안 되살린다', Save.restore({ ...good, seed: 'x' }) === null);
  ok('난이도가 자리 번호가 아니면 안 되살린다', Save.restore({ ...good, level: 'normal' }) === null);

  // 같은 씨앗에서 건물 수가 다르면 생성기가 바뀐 것이다 — 그 자료로는 역이 어디 앉을지
  // 알 수 없다.
  ok('건물 수가 다르면 안 되살린다',
    Save.restore({ ...good, levels: good.levels.slice(0, -1) }) === null);

  // 없는 역을 가리키는 노선.
  const broken = JSON.parse(JSON.stringify(good));
  broken.lines[0].st[1] = 99;
  ok('없는 역을 가리키면 안 되살린다', Save.restore(broken) === null);

  // 못 짓는 노선(같은 자리를 되짚는다).
  const sharp = JSON.parse(JSON.stringify(good));
  sharp.lines[0].mids[0] = [{ x: good.stations[0].x, y: good.stations[0].y }];
  ok('못 짓는 노선이 있으면 안 되살린다', Save.restore(sharp) === null);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

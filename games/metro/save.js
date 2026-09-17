'use strict';

// 판 하나를 글자로 담고 되돌린다. **화면을 모른다** — node에서 그대로 돈다.
//
// 도시 전체를 담지 않는다. **도시는 씨앗 하나에서 결정적으로 만들어지므로**
// (`citygen.test.js`가 그 재현성을 본다) 씨앗과 난이도만 담으면 길도 건물도 지형도
// 똑같이 되살아난다. 담아야 하는 것은 **그 뒤에 달라진 것**뿐이다 — 자란 건물의 층수,
// 플레이어가 놓은 역, 그은 노선, 그리고 시계.
(function () {

const City = (typeof module !== 'undefined' && module.exports)
  ? require('./citygen.js')
  : window.MetroCity;
const Lines = (typeof module !== 'undefined' && module.exports)
  ? require('./lines.js')
  : window.MetroLines;

const KEY = 'web-games.metro.save';

// **생성기를 바꾸면 이 값을 올린다.** 같은 씨앗에서 다른 도시가 나오면 담아 둔 역이
// 물 위에 앉고 노선이 엉뚱한 땅을 지난다. 판이 날아가는 것이 이상한 판보다 낫다.
const VERSION = 1;

const r1 = (v) => Math.round(v * 10) / 10;
const pt = (p) => ({ x: r1(p.x), y: r1(p.y) });

function packPattern(p) {
  return {
    stops: p.stops.slice(),
    trains: p.trains || 0,
    back: p.back || 0,
    cars: Array.isArray(p.cars) ? p.cars.slice() : [],
    backCars: Array.isArray(p.backCars) ? p.backCars.slice() : [],
  };
}

function snapshot(g) {
  const city = g.city;
  const at = new Map(city.stations.map((s, i) => [s, i]));
  return {
    v: VERSION,
    seed: city.seed,
    // **난이도는 이름이 아니라 자리 번호다.** `city.level`은 `'normal'` 같은 이름이라
    // `City.create`에 도로 넣을 수가 없다.
    level: g.level,
    growSeed: city.growSeed,
    // **층수는 자리마다 한 글자다.** 씨앗이 같으면 건물 목록도 차례까지 같으므로 자리만
    // 맞으면 되고, 기본값과의 차이를 따로 셀 이유가 없다 — 구천 채라야 9KB다.
    levels: city.buildings.map((b) => b.level).join(''),
    stations: city.stations.map((s) => ({ id: s.id, x: r1(s.x), y: r1(s.y) })),
    lines: g.lines.map((line) => ({
      id: line.id,
      color: line.color,
      spent: line.spent || 0,
      loop: !!line.loop,
      // 역은 번호로 적는다. 객체를 그대로 담으면 되살릴 때 노선마다 다른 사본이 생겨
      // **환승역이 갈라진다** — 두 노선이 같은 역을 쓰는 것은 같은 객체를 쓴다는 뜻이다.
      st: line.stations.map((s) => at.get(s)),
      mids: line.mids.map((seg) => seg.map(pt)),
      patterns: line.patterns.map(packPattern),
    })),
    budget: g.budget,
    clock: g.clock,
    speed: g.speed,
    growWork: g.growWork,
    nextSpawn: g.nextSpawn,
    // 길과 이용률은 담지 않는다. 되살린 뒤 한 번 풀면 같은 값이 나온다.
    demands: g.demands.map((od) => ({
      a: pt(od.a), b: pt(od.b), km: od.km, people: od.people, born: od.born,
    })),
    waiting: [...g.waiting]
      .map(([s, n]) => [at.get(s), Math.round(n)])
      .filter(([i]) => i != null),
    cam: g.cam ? pt(g.cam) : null,
    // 보던 자리와 배율. 없으면 보통 배율로 시작한다 — 예전 판이 이 값 없이 담겼다.
    zoom: g.zoom || 1,
  };
}

// 되살린다. 조금이라도 어긋나면 **null을 돌려준다** — 반쯤 되살린 판은 새 판보다 나쁘다.
function restore(data) {
  if (!data || data.v !== VERSION) return null;
  if (!Number.isFinite(data.seed) || !Array.isArray(data.stations) || !Array.isArray(data.lines)) {
    return null;
  }

  if (!Number.isInteger(data.level) || data.level < 0 || data.level >= City.LEVELS.length) return null;
  const city = City.create(data.seed, data.level);
  // 건물 수가 다르면 같은 씨앗에서 다른 도시가 나온 것이다 — 생성기가 바뀌었다.
  if (typeof data.levels !== 'string' || data.levels.length !== city.buildings.length) return null;
  for (let i = 0; i < city.buildings.length; i++) {
    const lv = data.levels.charCodeAt(i) - 48;
    if (lv >= 0 && lv <= city.buildings[i].cap) city.buildings[i].level = lv;
  }
  if (Number.isFinite(data.growSeed)) city.growSeed = data.growSeed >>> 0;
  city.stations = data.stations.map((s) => ({ id: s.id, x: s.x, y: s.y }));

  const ground = (x, y) => City.classify(city, x, y);
  const lines = [];
  let maxId = 0;
  for (const raw of data.lines) {
    const stations = (raw.st || []).map((i) => city.stations[i]);
    if (stations.length < 2 || stations.some((s) => !s)) return null;
    const line = {
      id: raw.id, color: raw.color || 0, spent: raw.spent || 0, loop: !!raw.loop,
      stations,
      mids: (raw.mids || []).map((seg) => seg.map(pt)),
      patterns: (raw.patterns || []).map(packPattern),
    };
    if (!line.patterns.length) return null;
    // **지어 보고 통과한 것만 쓴다.** 담을 때 되던 노선이라도 규칙이 바뀌었으면 지금은
    // 못 지을 수 있고, 경로 없는 노선은 시간표도 수요도 세울 수 없다.
    if (!Lines.rebuild(line, ground).ok) return null;
    if (line.id > maxId) maxId = line.id;
    lines.push(line);
  }
  // 다음에 그을 노선이 되살린 번호와 겹치지 않게 한다.
  Lines.reset(maxId + 1);

  const waiting = new Map();
  for (const [i, n] of data.waiting || []) {
    const station = city.stations[i];
    if (station && n > 0) waiting.set(station, n);
  }

  return {
    city,
    level: data.level,
    lines,
    budget: Number.isFinite(data.budget) ? data.budget : 0,
    clock: Number.isFinite(data.clock) ? data.clock : 6 * 3600,
    speed: Number.isFinite(data.speed) ? data.speed : 1,
    growWork: data.growWork || 0,
    nextSpawn: data.nextSpawn || 0,
    demands: (data.demands || []).map((od) => ({
      a: pt(od.a), b: pt(od.b), km: od.km, people: od.people, born: od.born || 0,
      usage: 0, base: 0, via: null, served: false,
    })),
    waiting,
    cam: data.cam || null,
    zoom: Number.isFinite(data.zoom) && data.zoom > 0 ? data.zoom : 1,
  };
}

const Save = { KEY, VERSION, snapshot, restore };

if (typeof module !== 'undefined' && module.exports) module.exports = Save;
if (typeof window !== 'undefined') window.MetroSave = Save;

})();

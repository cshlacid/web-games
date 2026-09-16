'use strict';

// 수요. **승객은 가장 가까운 역이 아니라 목적지까지 가장 싼 길을 고른다.**
//
// 그래서 한 수요가 우리 망을 쓰는지는 거리 하나로 정해지지 않는다. 걷는 시간,
// 기다리는 시간, 타고 가는 시간을 다 더한 값(일반화 비용)을 지상 교통과 견주어야
// 정해지고, 그 한 수식이 역·노선·열차·직선화를 전부 수입에 연결한다.
//
// 화면을 모른다 — node에서 그대로 돈다.
(function () {

const Geom = (typeof module !== 'undefined' && module.exports)
  ? require('./geom.js')
  : window.MetroGeom;
const City = (typeof module !== 'undefined' && module.exports)
  ? require('./citygen.js')
  : window.MetroCity;

const WALK_SPEED = 1.35;    // m/s
const WALK_WEIGHT = 1.45;   // 걷는 1분은 타고 가는 1분보다 싫다
const R_WALK = 800;         // 이보다 먼 역은 후보로도 보지 않는다
// 지상 교통은 문 앞에서 문 앞까지를 잰다. 속도만 두면 비교가 불공평하다 — 차를
// 타는 쪽에도 주차하고 걸어 나오고 신호에 걸리는 시간이 있고, 그것을 빼면 짧은
// 거리에서는 지하철이 절대 이길 수 없다.
const SURFACE_SPEED = 4.2;   // m/s (약 15km/h). 신호와 막힘을 포함한 문 앞에서 문 앞까지
// 차를 타는 쪽에도 세워 두고 걸어 나오고 신호에 걸리는 시간이 있다. 이 값이
// 작으면 짧은 거리에서 지하철이 절대 이길 수 없고, 그러면 게임이 성립하지 않는다.
const SURFACE_ACCESS = 420;  // 초
// **짧은 거리는 지하철이 이길 수 없다.** 3km를 가는데 양쪽에서 300m씩 걸으면 그
// 걷는 시간만으로 차를 타는 것과 비슷해진다 — 현실이 그렇고, 그래서 생성 자체를
// 지하철이 이길 만한 거리로 묶는다.
const MIN_DIST = 2200;
const MAX_WAITING = 8;      // 동시에 화면에 뜨는 못 잡은 수요
const MAX_TOTAL = 30;
const PATIENCE = 16 * 60;   // 게임 초. 이 안에 못 잡으면 사라진다
const SPAWN_EVERY = 70;     // 게임 초마다 하나씩 생긴다
const SERVED = 0.7;         // 이 이상이면 잡은 것으로 보고 지도에서 걷는다
// 억 / (사람 × km × 게임분). 망이 어중간할 때도 돈이 조금은 들어와야 다음 한 수를
// 둘 수 있다. 진짜 균형은 아직 잡지 않았다.
const FARE = 0.00025;

// 지상 교통과 견준 이용률. **경계에서 뚝 끊기면** 역을 조금 옮겼을 뿐인데 수입이
// 0과 100을 오간다. 부드러운 계단으로 잇는다.
function share(cost, ref) {
  if (!Number.isFinite(cost) || ref <= 0) return 0;
  const r = cost / ref;
  if (r <= 0.7) return 1;
  if (r >= 1.5) return 0;
  const k = (1.5 - r) / 0.8;
  return k * k * (3 - 2 * k);
}

const ANCHOR_R = 500;       // 역세권으로 보는 거리
const BOTH_ENDS = 0.7;      // 역이 둘 이상이면 이 확률로 양쪽 끝을 다 역세권에서 뽑는다

// 수요 하나. **건물이 빽빽한 곳에서 더 자주, 더 크게 생긴다** — 그래서 노선이 키운
// 동네가 다음 수요를 부르고, 그것이 다시 그 동네를 키운다.
//
// **한쪽 끝은 대개 이미 역이 있는 동네에서 뽑는다.** 도시 전체에 고르게 뿌리면
// 망에서 멀리 떨어진, 손쓸 수 없는 수요가 화면을 채워 할 일 목록이 아니라 잡음이
// 된다. 역이 하나도 없을 때만 아무 데서나 생긴다 — 그때는 그 호가 "역을 어디
// 놓을지"를 가리키는 표시다.
function spawn(city, rng, anchors = []) {
  const standing = city.buildings;
  const anyBuilding = () => {
    for (let i = 0; i < 400; i++) {
      const b = standing[Math.floor(rng() * standing.length)];
      if (b && b.level > 0 && rng() < b.level / 4 + 0.25) return b;
    }
    return null;
  };
  const nearStation = () => {
    if (!anchors.length) return null;
    const s = anchors[Math.floor(rng() * anchors.length)];
    const list = City.buildingsNear(city, s.x, s.y, ANCHOR_R);
    return list.length ? list[Math.floor(rng() * list.length)] : null;
  };
  const pick = (anchored) => (anchored ? nearStation() || anyBuilding() : anyBuilding());

  for (let tries = 0; tries < 60; tries++) {
    // 역이 둘 이상이면 대개 **양쪽 끝을 다 역세권에서** 뽑는다. 한쪽만 붙여 두면
    // 반대쪽이 도시 어딘가에 떨어져 손쓸 수 없는 수요가 되고, 그런 것이 화면을
    // 채우면 할 일 목록이 아니라 잡음이 된다. 나머지 셋 중 하나는 한쪽을 비워 둬
    // "저기까지 이으면 딴다"가 되게 한다.
    const both = anchors.length > 1 && rng() < BOTH_ENDS;
    const a = pick(anchors.length > 0);
    const b = pick(both);
    if (!a || !b) break;
    const from = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const to = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const span = Geom.dist(from.x, from.y, to.x, to.y);
    if (span < MIN_DIST) continue;
    return {
      a: from, b: to, km: span / 1000,
      people: Math.round(40 + (a.level + b.level) * 45 + rng() * 70),
      born: 0, usage: 0, via: null,
    };
  }
  return null;
}

// 한 수요가 쓸 수 있는 가장 싼 길. **환승은 아직 보지 않는다** — 한 번에 가는
// 운행만 따진다. 환승을 넣으면 경로 탐색이 되고, 그건 다음 층의 일이다.
//
// `services`는 운행 하나하나다: 역 목록, 어디에 서는지, 배차간격, 그리고 두 정차역
// 사이 소요시간을 돌려주는 함수.
function evaluate(od, services) {
  let best = Infinity;
  let via = null;

  for (const svc of services) {
    for (let i = 0; i < svc.stations.length; i++) {
      if (!svc.stopAt[i]) continue;
      const walkA = Geom.dist(od.a.x, od.a.y, svc.stations[i].x, svc.stations[i].y);
      if (walkA > R_WALK) continue;
      for (let j = 0; j < svc.stations.length; j++) {
        if (i === j || !svc.stopAt[j]) continue;
        const walkB = Geom.dist(od.b.x, od.b.y, svc.stations[j].x, svc.stations[j].y);
        if (walkB > R_WALK) continue;
        const ride = svc.ride(i, j);
        if (ride == null) continue;
        const cost = (walkA + walkB) / WALK_SPEED * WALK_WEIGHT + svc.headway / 2 + ride;
        if (cost < best) { best = cost; via = { svc, i, j, walkA, walkB }; }
      }
    }
  }

  const ref = Geom.dist(od.a.x, od.a.y, od.b.x, od.b.y) / SURFACE_SPEED + SURFACE_ACCESS;
  return { cost: best, ref, usage: share(best, ref), via };
}

// 한쪽 끝이라도 역 가까이 있는가. 못 잡은 수요를 그릴 때 **어느 쪽을 이으면 되는지**를
// 끝마다 달리 그리려고 쓴다.
function reach(point, stations) {
  for (const s of stations) if (Geom.dist(point.x, point.y, s.x, s.y) <= R_WALK) return true;
  return false;
}

function income(od, minutes) {
  return od.people * od.km * FARE * od.usage * minutes;
}

const Demand = {
  WALK_SPEED, WALK_WEIGHT, R_WALK, SURFACE_SPEED, SURFACE_ACCESS, MIN_DIST,
  MAX_WAITING, MAX_TOTAL, PATIENCE, SPAWN_EVERY, SERVED, FARE, ANCHOR_R, BOTH_ENDS,
  share, spawn, evaluate, reach, income,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Demand;
if (typeof window !== 'undefined') window.MetroDemand = Demand;

})();

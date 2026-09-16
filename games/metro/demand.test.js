'use strict';

// 실행: node games/metro/demand.test.js
const D = require('./demand.js');
const C = require('./citygen.js');
const L = require('./lines.js');

let passed = 0;
let failed = 0;

function ok(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.log(`실패: ${name}${extra ? `\n  ${extra}` : ''}`); }
}

const sumOf = (arr) => arr.reduce((a, b) => a + b, 0);

// --- 이용률 곡선 ---
{
  const ref = 600;
  ok('훨씬 빠르면 다 탄다', D.share(ref * 0.5, ref) === 1);
  ok('훨씬 느리면 아무도 안 탄다', D.share(ref * 2, ref) === 0);
  const mid = D.share(ref, ref);
  ok('비슷하면 절반쯤 탄다', mid > 0.2 && mid < 0.8, String(mid));
  ok('갈 길이 없으면 0', D.share(Infinity, ref) === 0);

  // 단조롭게 줄어야 한다. 중간에 오르내리면 "조금 빨라졌는데 손님이 줄었다"가 난다.
  let bumps = 0;
  let prev = 1;
  for (let r = 0.4; r < 2; r += 0.02) {
    const v = D.share(ref * r, ref);
    if (v > prev + 1e-9) bumps++;
    prev = v;
  }
  ok('빨라질수록 더 탄다', bumps === 0, `${bumps}번 뒤집힘`);
}

// --- 가장 싼 길 고르기 ---
{
  const line = (stations, headway, per) => ({
    stations,
    stopAt: stations.map(() => true),
    headway,
    capacity: 1e9,
    ride: (i, j) => Math.abs(i - j) * per,
  });

  const od = { a: { x: 0, y: 100 }, b: { x: 6000, y: 100 }, km: 6, people: 100 };
  const near = line([{ x: 100, y: 0 }, { x: 5900, y: 0 }], 300, 520);
  const r1 = D.evaluate(od, [near]);
  ok('가까운 역이 있으면 탄다', r1.usage > 0.5, JSON.stringify(r1.usage));

  // 같은 노선인데 배차만 벌어지면 덜 탄다.
  const rare = line([{ x: 100, y: 0 }, { x: 5900, y: 0 }], 1800, 520);
  ok('배차가 벌어지면 덜 탄다', D.evaluate(od, [rare]).usage < r1.usage);

  // 걸어갈 수 없어도 버스로 닿으면 쓴다. 다만 값이 비싸 덜 탄다.
  const busRide = line([{ x: 100, y: 1500 }, { x: 5900, y: 1500 }], 300, 520);
  const byBus = D.evaluate(od, [busRide]);
  ok('걸어갈 수 없어도 버스로 역까지 간다', byBus.via !== null && byBus.via.busA && byBus.via.busB,
    JSON.stringify(byBus.via && { busA: byBus.via.busA, busB: byBus.via.busB }));
  ok('버스를 타고 가면 더 비싸다', byBus.cost > r1.cost, `${Math.round(byBus.cost)} vs ${Math.round(r1.cost)}`);

  // 버스로도 못 닿을 만큼 멀면 후보에서 빠진다.
  const far = line([{ x: 100, y: 6000 }, { x: 5900, y: 6000 }], 300, 520);
  ok('버스로도 못 닿는 역은 안 쓴다', D.evaluate(od, [far]).via === null);

  // 조금 더 걸어도 훨씬 빠른 쪽을 고른다 — 가장 가까운 역이 답이 아니다.
  const slowClose = line([{ x: 50, y: 0 }, { x: 5950, y: 0 }], 300, 2400);
  const fastFar = line([{ x: 400, y: 400 }, { x: 5600, y: 400 }], 300, 380);
  const both = D.evaluate(od, [slowClose, fastFar]);
  ok('더 걷더라도 빠른 쪽을 고른다', both.via && both.via.legs[0].svc === fastFar,
    JSON.stringify({ cost: Math.round(both.cost) }));

  // 안 서는 역은 못 쓴다.
  const express = { ...near, stopAt: [true, false] };
  ok('안 서는 역으로는 못 간다', D.evaluate(od, [express]).via === null);
}

// --- 갈아타기 ---
{
  const hub = { x: 3000, y: 0 };
  const line = (stations, headway, per) => ({
    stations, stopAt: stations.map(() => true), headway, capacity: 1e9,
    ride: (i, j) => Math.abs(i - j) * per,
  });

  const west = line([{ x: 200, y: 0 }, hub], 300, 600);
  const east = line([hub, { x: 6200, y: 0 }], 300, 640);
  const od = { a: { x: 150, y: 120 }, b: { x: 6150, y: 120 }, km: 6, people: 100 };

  ok('한 노선만으로는 못 간다', D.evaluate(od, [west]).via === null);
  const both = D.evaluate(od, [west, east]);
  ok('역을 공유하면 갈아타서 간다', both.via !== null && both.via.transfers === 1,
    JSON.stringify(both.via && { transfers: both.via.transfers, legs: both.via.legs.length }));
  ok('탄 구간이 둘로 나뉜다', both.via && both.via.legs.length === 2);
  ok('갈아타도 탈 만하다', both.usage > 0, String(both.usage));

  // 갈아타는 데는 대가가 있다. 같은 길을 직통으로 가는 운행이 있으면 그쪽을 고른다.
  const through = line([{ x: 200, y: 0 }, hub, { x: 6200, y: 0 }], 300, 620);
  const mixed = D.evaluate(od, [west, east, through]);
  ok('직통이 있으면 갈아타지 않는다', mixed.via && mixed.via.transfers === 0,
    JSON.stringify(mixed.via && mixed.via.transfers));
  ok('직통이 더 싸다', mixed.cost < both.cost, `${Math.round(mixed.cost)} vs ${Math.round(both.cost)}`);
  ok('환승 벌점만큼 차이가 난다', both.cost - mixed.cost > D.TRANSFER * 0.5);

  // 만나는 역이 없으면 갈아탈 수 없다.
  const apart = line([{ x: 3400, y: 0 }, { x: 6200, y: 0 }], 300, 640);
  ok('만나지 않는 노선끼리는 못 갈아탄다', D.evaluate(od, [west, apart]).via === null);
}

// --- 수송량 한도 ---
{
  const hub = [{ x: 0, y: 0 }, { x: 3000, y: 0 }];
  const make = (capacity) => ({
    stations: hub, stopAt: [true, true], headway: 300, capacity,
    ride: () => 420,
  });
  const riders = () => [0, 1, 2].map((k) => ({
    a: { x: 100, y: 80 + k }, b: { x: 2900, y: 80 + k }, km: 2.9, people: 200,
  }));

  const roomy = [make(1e9)];
  const packed = [make(200)];
  const a = D.assign(riders(), roomy);
  const b = D.assign(riders(), packed);

  ok('넉넉하면 비용대로 탄다', a.every((od) => od.usage === od.base));
  ok('좁으면 못 탄 사람이 생긴다', b.every((od) => od.usage < od.base),
    JSON.stringify(b.map((od) => [od.base.toFixed(2), od.usage.toFixed(2)])));
  ok('혼잡률이 1을 넘는다', packed[0].crowd > 1, String(packed[0].crowd));
  ok('넉넉한 쪽은 붐비지 않는다', roomy[0].crowd < 1, String(roomy[0].crowd));

  // 열차를 늘리면(=배차가 좁아지면) 수송력이 늘어 다시 탄다.
  const doubled = [{ ...make(200), capacity: 400 }];
  const c = D.assign(riders(), doubled);
  ok('수송력을 늘리면 더 탄다',
    c[0].usage > b[0].usage, `${b[0].usage.toFixed(2)} → ${c[0].usage.toFixed(2)}`);

  // 가장 붐비는 구간이 정원을 정한다. 끝에서 끝까지 가는 수요와 절반만 가는 수요가
  // 섞이면, 겹치는 구간이 그 노선의 한도를 정한다.
  const three = {
    stations: [{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 3000, y: 0 }],
    stopAt: [true, true, true], headway: 300, capacity: 1e9, ride: () => 400,
  };
  const flows = [
    { via: { legs: [{ svc: three, si: 0, from: 0, to: 1 }] }, people: 100, usage: 1 },
    { via: { legs: [{ svc: three, si: 0, from: 0, to: 2 }] }, people: 100, usage: 1 },
  ];
  ok('겹치는 구간에 둘이 함께 실린다', D.loadOf(three, flows) === 200,
    String(D.loadOf(three, flows)));
}

// 수요 한 쌍이 노선 하나를 다 먹으면 안 된다. 전에는 한 쌍이 130~470명/분이라 열차
// 여덟 대짜리 노선(382명/분)을 한 쌍이 혼자 채웠고, 그래서 **첫 열차부터 가득 찬 채**였다.
{
  const city = C.create(7, 1);
  const rng = C.mulberry32(21);
  let max = 0;
  let n = 0;
  let sum = 0;
  for (let i = 0; i < 400; i++) {
    const od = D.spawn(city, rng);
    if (!od) continue;
    n++;
    sum += od.people;
    if (od.people > max) max = od.people;
  }
  // 열차 여덟 대짜리 노선의 수송력이 380명/분 남짓이다.
  ok('한 쌍이 노선 하나를 다 먹지 않는다', max < 100, `가장 큰 쌍 ${max}명/분`);
  ok('그래도 쓸 만한 크기다', sum / n > 15, `평균 ${(sum / n).toFixed(0)}명/분`);
}

// --- 수요가 생기는 자리 ---
{
  const city = C.create(5, 1);
  const rng = C.mulberry32(11);
  let made = 0;
  let short = 0;
  let onEmpty = 0;
  for (let i = 0; i < 300; i++) {
    const od = D.spawn(city, rng);
    if (!od) continue;
    made++;
    if (od.km * 1000 < D.MIN_DIST) short++;
    if (C.classify(city, od.a.x, od.a.y) !== 'building') onEmpty++;
  }
  ok('수요가 만들어진다', made > 250, `${made}/300`);
  ok('너무 가까운 쌍은 없다', short === 0, `${short}건`);
  ok('건물에서 생긴다', onEmpty === 0, `${onEmpty}건`);

  // **자란 동네가 더 큰 수요를 부른다.** 이 되먹임이 이 게임의 심장이라, 도시를
  // 키운 뒤 같은 방식으로 뽑아 인원이 실제로 느는지 본다.
  const average = (c, seed) => {
    const r = C.mulberry32(seed);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 500; i++) { const od = D.spawn(c, r); if (od) { sum += od.people; n++; } }
    return sum / n;
  };
  //
  // 중심 수를 도시 크기에 맞춰 잡는다. 고정 마흔 개로 두었더니 지도를 키운 뒤
  // 자란 동네가 도시 전체에서 차지하는 몫이 줄어, 되먹임은 그대로인데 평균이
  // 5%를 못 넘겼다(164 → 172).
  const before = average(city, 77);
  const standing = city.buildings.filter((b) => b.level > 0);
  const centers = standing.slice(0, Math.round(standing.length * 0.1))
    .map((b) => ({ x: b.x, y: b.y }));
  for (let i = 0; i < 60; i++) C.grow(city, centers, 900, 40);
  const after = average(city, 77);
  ok('도시가 자라면 수요도 커진다', after > before * 1.05, `${before.toFixed(0)} → ${after.toFixed(0)}`);
}

// --- 실제 노선에 붙여 본다 ---
{
  const st = (x, y) => ({ id: `${x},${y}`, x, y });
  let line = L.create(st(0, 0), st(2400, 0));
  line = L.withExtension(line, st(4800, 0));
  line.patterns[0].trains = 3;
  L.rebuild(line, () => 'empty');
  const table = L.timetable(line, line.patterns[0]);
  const plan = L.plan(line, line.patterns[0]);

  const svc = {
    stations: line.stations,
    stopAt: line.patterns[0].stops,
    headway: plan.headway,
    capacity: 1e9,
    ride: (i, j) => L.rideTime(table, i, j),
  };

  const od = { a: { x: 60, y: 60 }, b: { x: 4740, y: 60 }, km: 4.68, people: 150 };
  const got = D.evaluate(od, [svc]);
  ok('노선 곁의 수요를 잡는다', got.usage > 0.5,
    JSON.stringify({ cost: Math.round(got.cost), ref: Math.round(got.ref), usage: got.usage.toFixed(2) }));

  // 같은 수요라도 역이 멀면 안 탄다 — 가까이 놓는 것이 곧 수입이다.
  const away = { ...od, a: { x: 60, y: 1500 }, b: { x: 4740, y: 1500 } };
  ok('역에서 멀어지면 덜 탄다', D.evaluate(away, [svc]).usage < got.usage,
    `${D.evaluate(away, [svc]).usage} vs ${got.usage}`);

  // 열차를 늘리면 기다리는 시간이 줄어 더 탄다.
  line.patterns[0].trains = 8;
  const many = { ...svc, headway: L.plan(line, line.patterns[0]).headway };
  ok('열차를 늘리면 더 탄다', D.evaluate(od, [many]).usage >= got.usage,
    `${D.evaluate(od, [many]).usage} vs ${got.usage}`);

  ok('수입은 인원·거리·이용률에 비례한다',
    Math.abs(D.income({ ...od, usage: 0.5 }, 2) - od.people * od.km * D.FARE * 0.5 * 2) < 1e-12);
  ok('안 타면 수입이 없다', D.income({ ...od, usage: 0 }, 5) === 0);
}

// --- 역까지 가는 값 ---
{
  ok('가까우면 걷는 편이 싸다', D.accessCost(200) < D.BUS_ACCESS);
  ok('멀면 버스가 싸다', D.accessCost(D.R_WALK) < 200 / D.WALK_SPEED * D.WALK_WEIGHT * 4);
  ok('걷기와 버스 중 싼 쪽을 고른다',
    D.accessCost(760) <= 760 / D.WALK_SPEED * D.WALK_WEIGHT + 1e-9);
  ok('멀수록 비싸다', D.accessCost(1500) > D.accessCost(700));
  ok('너무 멀면 못 간다', !Number.isFinite(D.accessCost(D.R_ACCESS + 1)));

  // 갈림목을 지나면 버스가 이긴다.
  let flip = 0;
  for (let d = 100; d < D.R_WALK; d += 20) {
    if (D.accessCost(d) < d / D.WALK_SPEED * D.WALK_WEIGHT - 1e-9) { flip = d; break; }
  }
  ok('어느 거리부터는 버스를 탄다', flip > 250 && flip < 700, `${flip}m`);
}

// --- 어디가 막혔고 어디에 줄이 서는가 ---
// 혼잡률은 **한 구간**의 이야기인데 숫자 하나로만 띄우면 970%를 보고도 무엇을 고쳐야
// 하는지 알 수가 없다. 막힌 구간과 역마다의 대기 인원을 함께 돌려준다.
{
  const stations = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 6000, y: 0 }, { x: 9000, y: 0 }];
  const svc = {
    stations, stopAt: [true, true, true, true], headway: 300, capacity: 150,
    ride: (i, j) => Math.abs(i - j) * 420,
  };
  // 가운데 구간(1→2)만 겹치게 태운다.
  const riders = [
    { a: { x: 100, y: 60 }, b: { x: 5900, y: 60 }, km: 5.8, people: 200 },
    { a: { x: 3100, y: 60 }, b: { x: 8900, y: 60 }, km: 5.8, people: 200 },
  ];
  D.assign(riders, [svc]);
  ok('가장 붐비는 구간을 짚는다', svc.peak.from === 1 && svc.peak.to === 2,
    `${svc.peak.from}→${svc.peak.to}`);
  ok('막힌 구간의 부하가 정원을 넘는다', svc.peak.load > svc.capacity,
    `${svc.peak.load.toFixed(0)} vs ${svc.capacity}`);

  // 구간마다의 부하를 통째로 돌려준다. 화면이 열차가 지금 지나는 구간의 부하로
  // 그 열차를 채워 그린다 — 노선 하나의 숫자로만 두면 어느 열차가 터지는지가 안 보인다.
  ok('구간마다의 부하가 다 있다', svc.peak.loads.length === 3,
    JSON.stringify(svc.peak.loads.map((n) => Math.round(n))));
  ok('가운데 구간이 가장 무겁다',
    svc.peak.loads[1] > svc.peak.loads[0] && svc.peak.loads[1] > svc.peak.loads[2],
    JSON.stringify(svc.peak.loads.map((n) => Math.round(n))));

  // 줄은 **타려다 못 탄 그 역에** 선다. 1번 역에서 타려는 사람은 0번에서 온 열차가
  // 이미 차 있어 못 탄다.
  ok('못 탄 사람이 그 역에 남는다', svc.press.left[1] > 0,
    JSON.stringify(svc.press.left.map((n) => Math.round(n))));
  ok('아무도 안 타는 역에는 줄이 없다', svc.press.left[3] === 0);

  // 넉넉하면 줄이 서지 않는다.
  const easy = { ...svc, capacity: 1e9 };
  const same = [
    { a: { x: 100, y: 60 }, b: { x: 5900, y: 60 }, km: 5.8, people: 200 },
    { a: { x: 3100, y: 60 }, b: { x: 8900, y: 60 }, km: 5.8, people: 200 },
  ];
  D.assign(same, [easy]);
  ok('넉넉하면 줄이 없다', easy.press.left.every((n) => n < 0.001),
    JSON.stringify(easy.press.left));
}

// --- 타고 내리는 대로 열차가 차고 빈다 ---
// 여태는 구간 통행량을 그대로 재차 인원으로 썼는데, 그러면 정원을 넘는 값이 열차 안에
// 그려지고 종점에 닿아도 열차가 비지 않았다.
{
  const stations = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 6000, y: 0 }];
  const make = (capacity) => ({
    stations, stopAt: [true, true, true], headway: 300, capacity,
    ride: (i, j) => Math.abs(i - j) * 420,
  });
  // 0→1 과 1→2 만 탄다. 1번 역에서 다 내리고 다시 다 탄다.
  const hop = () => [
    { a: { x: 80, y: 40 }, b: { x: 2900, y: 40 }, km: 2.8, people: 300 },
    { a: { x: 3100, y: 40 }, b: { x: 5900, y: 40 }, km: 2.8, people: 300 },
  ];

  const roomy = make(1e9);
  D.assign(hop(), [roomy]);
  const f = roomy.flow;
  ok('구간마다 재차 인원이 있다', f.occ.length === 2, JSON.stringify(f.occ));
  // 1번 역에서 안 내렸다면 두 번째 구간이 두 배가 된다. 그렇지 않은 것이 요점이다.
  ok('내린 만큼 비고 탄 만큼 찬다',
    f.occ[0] > 0 && f.occ[1] < f.occ[0] * 1.2,
    JSON.stringify(f.occ.map((n) => Math.round(n))));
  ok('넉넉하면 아무도 안 남는다', f.left.every((n) => n < 0.001), JSON.stringify(f.left));

  // 정원이 좁으면 **열차는 정원까지만 차고** 나머지는 그 역에 남는다.
  const tight = make(100);
  D.assign(hop(), [tight]);
  ok('재차 인원이 정원을 넘지 않는다',
    tight.flow.occ.every((n) => n <= tight.capacity + 0.001),
    JSON.stringify(tight.flow.occ.map((n) => Math.round(n))));
  ok('못 탄 사람이 남는다', sumOf(tight.flow.left) > 0,
    JSON.stringify(tight.flow.left.map((n) => Math.round(n))));

  // 종점까지 가는 손님만 있으면 **종점 앞 구간이 가득이고 돌아가는 쪽은 빈다.**
  const thru = make(1e9);
  D.assign([{ a: { x: 80, y: 40 }, b: { x: 5900, y: 40 }, km: 5.8, people: 300 }], [thru]);
  ok('가는 쪽은 내내 실려 있다',
    thru.flow.occ.every((n) => n > 0), JSON.stringify(thru.flow.occ.map((n) => Math.round(n))));
  ok('돌아오는 쪽은 비어 있다',
    thru.flow.back.every((n) => n === 0), JSON.stringify(thru.flow.back));
}

// 오는 쪽과 가는 쪽을 따로 센다. 한 배열에 합치면 A→B 가는 열차가 B→A 손님까지
// 실은 것으로 잡혀 혼잡이 두 배 가까이 부풀고, 종점에 닿은 열차가 비지 않는다.
{
  const stations = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 6000, y: 0 }];
  const make = () => ({
    stations, stopAt: [true, true, true], headway: 300, capacity: 500,
    ride: (i, j) => Math.abs(i - j) * 420,
  });
  const oneWay = () => [{ a: { x: 80, y: 50 }, b: { x: 5900, y: 50 }, km: 5.8, people: 400 }];
  const twoWay = () => [
    { a: { x: 80, y: 50 }, b: { x: 5900, y: 50 }, km: 5.8, people: 400 },
    { a: { x: 5900, y: 120 }, b: { x: 80, y: 120 }, km: 5.8, people: 400 },
  ];

  const one = make();
  D.assign(oneWay(), [one]);
  ok('한쪽으로만 가면 오는 쪽은 비어 있다',
    one.peak.loads.every((n) => n > 0) && one.peak.back.every((n) => n === 0),
    `${JSON.stringify(one.peak.loads)} / ${JSON.stringify(one.peak.back)}`);
  ok('막힌 방향을 짚는다', one.peak.dir === 1);

  const two = make();
  D.assign(twoWay(), [two]);
  ok('양쪽으로 가면 방향마다 반씩이다',
    Math.abs(two.peak.loads[0] - two.peak.back[0]) < 2,
    `${two.peak.loads[0].toFixed(0)} / ${two.peak.back[0].toFixed(0)}`);
  // 합쳐 세던 때는 이 값이 두 배(1.6)라 정원을 넘은 것으로 잡혔다. 수송력은 원래
  // 한 방향치이므로 그쪽이 틀렸다.
  ok('합쳐 세지 않는다', two.crowd < 1 && two.crowd > 0.7, String(two.crowd));

  // 순환선은 한 방향뿐이라 오는 쪽 배열이 없다.
  const ring = {
    line: { loop: true },
    stations: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }],
    stopAt: [true, true, true], headway: 300, capacity: 1e9, ride: () => 400,
  };
  D.assign([{ a: { x: 80, y: 50 }, b: { x: 2900, y: 50 }, km: 2.8, people: 200 }], [ring]);
  ok('순환선에는 오는 쪽이 없다', ring.peak.back === null);
}

// 순환선은 마지막 역에서 첫 역으로 돌아오는 구간도 센다. 이웃한 쌍만 세던 때는 그
// 한 구간이 빠져, 한 바퀴 도는 노선에서 정작 가장 붐비는 자리를 놓쳤다.
{
  const ring = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 }];
  const svc = {
    line: { loop: true },
    stations: ring, stopAt: [true, true, true, true], headway: 300, capacity: 1e9,
    ride: () => 500,
  };
  // 3번 역에서 0번 역으로 — 순환선에서는 닫는 구간을 지난다.
  const riders = [{ a: { x: 100, y: 2900 }, b: { x: 100, y: 100 }, km: 2.8, people: 300 }];
  D.assign(riders, [svc]);
  ok('순환선의 닫는 구간도 센다', svc.peak.from === 3 && svc.peak.to === 0,
    `${svc.peak.from}→${svc.peak.to} 부하 ${svc.peak.load.toFixed(0)}`);
}

// 정원이 좁으면 열차는 정원까지만 싣고 나머지는 **그 역에 줄로 남는다**. 계기판의
// `못 탐`과 역에 선 줄의 합이 어긋나면 화면이 스스로 모순된다.
{
  const stations = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 6000, y: 0 }, { x: 9000, y: 0 }];
  const svc = {
    stations, stopAt: [true, true, true, true], headway: 300, capacity: 150,
    ride: (i, j) => Math.abs(i - j) * 420,
  };
  const riders = [
    { a: { x: 100, y: 60 }, b: { x: 5900, y: 60 }, km: 5.8, people: 200 },
    { a: { x: 3100, y: 60 }, b: { x: 8900, y: 60 }, km: 5.8, people: 200 },
  ];
  D.assign(riders, [svc]);

  ok('열차는 정원까지만 싣는다',
    svc.flow.occ.every((n) => n <= svc.capacity + 0.001),
    JSON.stringify(svc.flow.occ.map((n) => Math.round(n))));

  const stuck = sumOf(svc.press.left) + sumOf(svc.press.leftBack);
  ok('못 탄 사람이 그 역에 남는다', stuck > 0,
    JSON.stringify(svc.press.left.map((n) => Math.round(n))));
  ok('못 타는 몫이 계기판의 못 탐과 같다',
    Math.abs(stuck - D.tally(riders).missed) < 1,
    `${Math.round(stuck)} vs ${Math.round(D.tally(riders).missed)}`);

  // 승강장의 줄이 쌓이고 빠지는 셈은 이 둘로 떨어진다 — 타려는 사람과 빈자리.
  ok('타려는 사람과 빈자리를 역마다 돌려준다',
    svc.press.want.length === 4 && svc.press.room.length === 4);
  ok('빈자리가 모자란 역이 있다',
    svc.press.want.some((n, k) => n > svc.press.room[k]),
    JSON.stringify([svc.press.want.map(Math.round), svc.press.room.map(Math.round)]));
}

// --- 계기판의 사람 수 ---
// 건수로만 두면 "몇 건"과 "몇 명"이 한 줄에 섞여 서로 견줄 수가 없다. 셋이 남김없이
// 갈려야 "못 탐은 열차, 안 탐은 노선"이라는 읽기가 성립한다.
{
  const ds = [
    { people: 100, base: 1, usage: 0.4 },    // 길은 좋은데 60%가 못 탐
    { people: 200, base: 0.5, usage: 0.5 },  // 절반만 쓸 만한 길
    { people: 50, base: 0, usage: 0 },       // 길이 아예 없음
  ];
  const t = D.tally(ds);
  ok('타는 사람', Math.abs(t.riding - 140) < 0.001, String(t.riding));
  ok('못 타는 사람', Math.abs(t.missed - 60) < 0.001, String(t.missed));
  ok('안 타는 사람', Math.abs(t.away - 150) < 0.001, String(t.away));
  ok('셋을 더하면 전체 인원이다',
    Math.abs(t.riding + t.missed + t.away - 350) < 0.001,
    String(t.riding + t.missed + t.away));

  // 아무것도 안 깔린 판에서는 전부 "안 탐"이다.
  const bare = D.tally([{ people: 80, base: 0, usage: 0 }]);
  ok('망이 없으면 전부 안 탐', bare.riding === 0 && bare.missed === 0 && bare.away === 80);
}

// --- 어느 쪽 끝이 닿았는가 ---
{
  const stations = [{ x: 0, y: 0 }];
  ok('걸어갈 수 있으면 2', D.reach({ x: 300, y: 0 }, stations) === 2);
  ok('버스로 닿으면 1', D.reach({ x: D.R_WALK + 200, y: 0 }, stations) === 1);
  ok('그보다 멀면 0', D.reach({ x: D.R_ACCESS + 200, y: 0 }, stations) === 0);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

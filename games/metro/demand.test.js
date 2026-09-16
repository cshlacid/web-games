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
    ride: (i, j) => Math.abs(i - j) * per,
  });

  const od = { a: { x: 0, y: 100 }, b: { x: 6000, y: 100 }, km: 6, people: 100 };
  const near = line([{ x: 100, y: 0 }, { x: 5900, y: 0 }], 300, 520);
  const r1 = D.evaluate(od, [near]);
  ok('가까운 역이 있으면 탄다', r1.usage > 0.5, JSON.stringify(r1.usage));

  // 같은 노선인데 배차만 벌어지면 덜 탄다.
  const rare = line([{ x: 100, y: 0 }, { x: 5900, y: 0 }], 1800, 520);
  ok('배차가 벌어지면 덜 탄다', D.evaluate(od, [rare]).usage < r1.usage);

  // 역이 멀면 후보에서 빠진다.
  const far = line([{ x: 100, y: 3000 }, { x: 5900, y: 3000 }], 300, 520);
  ok('걸어갈 수 없는 역은 안 쓴다', D.evaluate(od, [far]).via === null);

  // 조금 더 걸어도 훨씬 빠른 쪽을 고른다 — 가장 가까운 역이 답이 아니다.
  const slowClose = line([{ x: 50, y: 0 }, { x: 5950, y: 0 }], 300, 2400);
  const fastFar = line([{ x: 400, y: 400 }, { x: 5600, y: 400 }], 300, 380);
  const both = D.evaluate(od, [slowClose, fastFar]);
  ok('더 걷더라도 빠른 쪽을 고른다', both.via && both.via.svc === fastFar,
    JSON.stringify({ cost: both.cost }));

  // 안 서는 역은 못 쓴다.
  const express = { ...near, stopAt: [true, false] };
  ok('안 서는 역으로는 못 간다', D.evaluate(od, [express]).via === null);
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
  const before = average(city, 77);
  const centers = city.buildings.filter((b) => b.level > 0).slice(0, 40)
    .map((b) => ({ x: b.x, y: b.y }));
  for (let i = 0; i < 40; i++) C.grow(city, centers, 900, 40);
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

// --- 어느 쪽 끝이 닿았는가 ---
{
  const stations = [{ x: 0, y: 0 }];
  ok('가까우면 닿았다', D.reach({ x: 300, y: 0 }, stations));
  ok('멀면 안 닿았다', !D.reach({ x: D.R_WALK + 50, y: 0 }, stations));
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

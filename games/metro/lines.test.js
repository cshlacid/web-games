'use strict';

// 실행: node games/metro/lines.test.js
const L = require('./lines.js');
const R = require('./route.js');

let passed = 0;
let failed = 0;

function ok(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.log(`실패: ${name}${extra ? `\n  ${extra}` : ''}`); }
}

function near(name, actual, expected, tol) {
  ok(name, Math.abs(actual - expected) <= tol, `결과 ${actual}, 기대 ${expected} ±${tol}`);
}

const st = (x, y) => ({ id: `${x},${y}`, x, y });
const ground = () => 'empty';

// --- 노선 만들기와 연장 ---
{
  const a = st(0, 0);
  const b = st(1200, 0);
  const c = st(2400, 0);
  const line = L.create(a, b);
  ok('새 노선은 역 둘로 선다', line.stations.length === 2 && !line.loop);
  ok('기본 패턴 하나가 붙는다', line.patterns.length === 1 && line.patterns[0].trains === 1);

  const built = L.rebuild(line, ground);
  ok('경로가 선다', built.ok);
  near('길이는 두 역 사이 거리', line.path.length, 1200, 1);
  ok('역이 경로 위 어디인지 안다', line.anchors.length === 2 && line.anchors[0].at === 0);

  const longer = L.withExtension(line, c);
  ok('연장해도 원본은 그대로', line.stations.length === 2);
  ok('사본은 역 셋', longer.stations.length === 3);
  ok('패턴의 정차역도 함께 는다', longer.patterns[0].stops.length === 3);
  ok('연장한 경로가 선다', L.rebuild(longer, ground).ok);
  near('길이도 이어진다', longer.path.length, 2400, 1);
}

// --- 굴곡 허용 범위 ---
{
  const a = st(0, 0);
  const b = st(1200, 0);
  const line = L.create(a, b);
  L.rebuild(line, ground);

  // 완만하게 꺾이는 쪽은 이어진다.
  const gentle = L.rebuild(L.withExtension(line, st(2300, 400)), ground);
  ok('완만한 연장은 통한다', gentle.ok, gentle.reason);

  // 역에서 거의 되돌아가는 각도는 막힌다.
  const sharp = L.rebuild(L.withExtension(line, st(1100, 90)), ground);
  ok('역에서 급하게 꺾으면 못 잇는다', !sharp.ok && sharp.reason === 'stationTurn', sharp.reason);

  ok('같은 역으로는 못 잇는다', L.whyNot(line, b) === 'same');
  ok('역 둘짜리 노선은 아직 못 닫는다', L.whyNot(line, a) === 'tooShort');
}

// --- 순환선 ---
{
  const a = st(0, 0);
  const b = st(1400, 0);
  const c = st(700, 1300);
  let line = L.create(a, b);
  line = L.withExtension(line, c);
  ok('세 역이 되면 닫을 수 있다', L.whyNot(line, a) === null);

  const loop = L.withExtension(line, a);
  ok('첫 역으로 이으면 순환선이 된다', loop.loop && loop.stations.length === 3);
  ok('순환선은 더 못 잇는다', L.whyNot(loop, st(9, 9)) === 'closed');

  const built = L.rebuild(loop, ground);
  ok('순환선 경로가 선다', built.ok, built.reason);
  ok('닫힌 만큼 제어점이 하나 더 있다', L.controlPoints(loop).filter((p) => p.stop).length === 4);
}

// --- 왕복과 순환의 주기 ---
{
  const line = L.create(st(0, 0), st(1500, 0));
  L.rebuild(line, ground);
  const p = L.plan(line, line.patterns[0]);

  ok('왕복은 한쪽 시간의 두 배보다 길다', p.cycle > p.oneWay * 2, `${p.cycle} vs ${p.oneWay}`);
  near('정차 시간이 역 수만큼 두 번 든다', p.cycle - p.oneWay * 2, 2 * 2 * L.DWELL, 0.01);
  near('길이도 왕복이다', p.length, 3000, 2);
  near('열차 한 대면 배차간격이 곧 주기', p.headway, p.cycle, 1e-9);

  line.patterns[0].trains = 3;
  near('열차를 늘리면 배차간격이 그만큼 준다', L.plan(line, line.patterns[0]).headway, p.cycle / 3, 1e-9);

  line.patterns[0].trains = 0;
  ok('열차가 없으면 배차간격이 없다', L.plan(line, line.patterns[0]).headway === Infinity);
}

// --- 급행이 실제로 빠른가 ---
{
  // 1km 간격으로 역 다섯을 일직선에 놓는다.
  let line = L.create(st(0, 0), st(1000, 0));
  for (const x of [2000, 3000, 4000]) line = L.withExtension(line, st(x, 0));
  L.rebuild(line, ground);

  const local = line.patterns[0];
  const express = L.expressPattern(line);
  ok('급행은 양 끝만 서고 시작한다',
    express.stops.filter(Boolean).length === 2 && express.stops[0] && express.stops[4]);

  const a = L.plan(line, local);
  const b = L.plan(line, express);
  ok('급행이 한쪽 주행에서 더 빠르다', b.oneWay < a.oneWay, `${b.oneWay} vs ${a.oneWay}`);
  ok('급행이 주기에서도 더 빠르다', b.cycle < a.cycle, `${b.cycle} vs ${a.cycle}`);

  // 아낀 시간의 절반 이상은 정차 시간이 아니라 **가감속을 덜 한 것**이어야 한다.
  // 그래야 "역을 많이 세우면 느려진다"가 정차 시간만의 이야기가 아니게 된다.
  const dwellSaved = (a.stops - b.stops) * L.DWELL;
  ok('주행 자체가 빨라진 몫이 있다', a.oneWay - b.oneWay > 1,
    `주행에서 ${(a.oneWay - b.oneWay).toFixed(1)}초, 정차에서 ${dwellSaved}초`);

  // 중간 역 하나만 다시 켜면 그만큼 느려진다.
  const half = { ...express, stops: express.stops.slice() };
  half.stops[2] = true;
  const c = L.plan(line, half);
  ok('세우는 역을 늘리면 다시 느려진다', c.oneWay > b.oneWay && c.oneWay < a.oneWay,
    `${b.oneWay} < ${c.oneWay} < ${a.oneWay}`);
}

// --- 정차역 토글의 경계 ---
{
  let line = L.create(st(0, 0), st(1000, 0));
  line = L.withExtension(line, st(2000, 0));
  ok('종착역은 끌 수 없다', !L.canToggle(line, 0) && !L.canToggle(line, 2));
  ok('중간 역은 끌 수 있다', L.canToggle(line, 1));

  const loop = L.withExtension(L.withExtension(line, st(1000, 900)), line.stations[0]);
  ok('순환선은 첫 역만 고정', loop.loop && !L.canToggle(loop, 0) && L.canToggle(loop, 1));
}

// --- 열차 수 세기 ---
{
  const line = L.create(st(0, 0), st(1000, 0));
  line.patterns.push(L.expressPattern(line));
  line.patterns[0].trains = 2;
  line.patterns[1].trains = 3;
  ok('노선의 열차는 패턴별 합이다', L.trainsOf(line) === 5);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

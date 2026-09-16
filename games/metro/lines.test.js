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
  ok('막히지 않으면 hold는 1', p.hold === 1);
  near('길이도 왕복이다', p.length, 3000, 2);
  near('열차 한 대면 배차간격이 곧 주기', p.headway, p.cycle, 1e-9);

  line.patterns[0].trains = 2;
  near('열차를 늘리면 배차간격이 그만큼 준다', L.plan(line, line.patterns[0]).headway, p.cycle / 2, 1e-9);

  // 더 늘리면 선로가 감당하지 못해 바닥에 걸린다.
  line.patterns[0].trains = 4;
  near('배차간격은 최소 간격 아래로 안 내려간다', L.plan(line, line.patterns[0]).headway, L.MIN_GAP, 0.5);

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

// --- 시간표와 열차 위치 ---
{
  let line = L.create(st(0, 0), st(1000, 0));
  for (const x of [2000, 3000]) line = L.withExtension(line, st(x, 0));
  L.rebuild(line, ground);
  const pattern = line.patterns[0];
  const table = L.timetable(line, pattern);
  const p = L.plan(line, pattern);

  near('시간표의 주기가 계산한 주기와 같다', table.cycle, p.cycle, 0.01);
  ok('정차역마다 도착·출발이 있다', table.stops.length === 4
    && table.stops.every((s) => s.depart - s.arrive === L.DWELL));
  ok('정차역 번호가 붙어 있다',
    JSON.stringify(table.stops.map((s) => s.station)) === '[0,1,2,3]');

  // 열차는 시작에서 출발해 반쯤에 끝까지 갔다가 돌아온다.
  const start = L.at(line, table, 0);
  const middle = L.at(line, table, table.half);
  const back = L.at(line, table, table.cycle - 0.001);
  near('처음에는 첫 역에 있다', start.x, 0, 1);
  near('반 바퀴에서는 끝 역에 있다', middle.x, 3000, 2);
  near('한 바퀴를 돌면 첫 역으로 돌아온다', back.x, 0, 2);

  // 어느 시각에도 노선 위를 벗어나지 않는다.
  let off = 0;
  for (let k = 0; k < 400; k++) {
    const q = L.at(line, table, table.cycle * k / 400);
    if (q.x < -2 || q.x > 3002 || Math.abs(q.y) > 2) off++;
  }
  ok('열차가 노선 위를 벗어나지 않는다', off === 0, `${off}번`);

  // 역과 역 사이 시간. 멀수록 오래 걸린다.
  const t01 = L.rideTime(table, 0, 1);
  const t03 = L.rideTime(table, 0, 3);
  ok('먼 역까지가 더 오래 걸린다', t03 > t01 * 2, `${t01} vs ${t03}`);
  near('되돌아가는 방향도 같은 시간', L.rideTime(table, 3, 0), t03, 0.01);
  ok('같은 역끼리는 없다', L.rideTime(table, 1, 1) === null);

  // 급행은 같은 두 역 사이를 더 빨리 간다.
  const ex = L.expressPattern(line);
  const fast = L.timetable(line, ex);
  ok('급행이 종점까지 더 빠르다', L.rideTime(fast, 0, 3) < t03,
    `${L.rideTime(fast, 0, 3)} vs ${t03}`);
  ok('급행이 안 서는 역은 탈 수 없다', L.rideTime(fast, 0, 1) === null);
}

// --- 순환선의 시간표 ---
{
  let line = L.create(st(0, 0), st(1400, 0));
  line = L.withExtension(line, st(1400, 1400));
  line = L.withExtension(line, st(0, 1400));
  line = L.withExtension(line, line.stations[0]);
  L.rebuild(line, ground);
  const table = L.timetable(line, line.patterns[0]);

  ok('순환선은 첫 역에서 한 번만 선다', table.stops.length === 4,
    JSON.stringify(table.stops.map((s) => s.station)));
  near('주기가 계산한 값과 같다', table.cycle, L.plan(line, line.patterns[0]).cycle, 0.01);

  // 한 방향으로만 도니 지나친 역은 한 바퀴를 돌아야 한다.
  const ahead = L.rideTime(table, 0, 1);
  const behind = L.rideTime(table, 1, 0);
  ok('순환선은 방향에 따라 시간이 다르다', behind > ahead, `${ahead} vs ${behind}`);
  near('앞뒤를 합치면 한 바퀴', ahead + behind, table.cycle - L.DWELL * 2, 0.5);
}

// --- 선로가 하나뿐이다 ---
{
  // 1km 간격 역 여섯.
  let line = L.create(st(0, 0), st(1000, 0));
  for (const x of [2000, 3000, 4000, 5000]) line = L.withExtension(line, st(x, 0));
  L.rebuild(line, ground);
  const local = line.patterns[0];

  local.trains = 1;
  ok('한 대뿐이면 막을 것이 없다', L.trackFactor(line) === 1);
  local.trains = 4;
  ok('여유가 있으면 그대로', L.trackFactor(line) === 1);

  // 열차를 계속 늘리면 어느 지점부터 서로를 막는다.
  local.trains = 14;
  const packed = L.trackFactor(line);
  ok('너무 촘촘하면 다 같이 느려진다', packed > 1, String(packed));

  // **그래서 배차간격은 최소 간격 아래로 내려가지 않는다.** 열차를 더 사도
  // 소용없어지는 지점이 있다는 것이 이 규칙의 값이다.
  const tight = L.plan(line, local).headway;
  local.trains = 24;
  const tighter = L.plan(line, local).headway;
  ok('배차간격에 바닥이 있다', tighter >= L.MIN_GAP * 0.99, `${tighter.toFixed(0)}초`);
  ok('더 사도 거의 안 좁아진다', tighter > tight * 0.9, `${tight.toFixed(0)} → ${tighter.toFixed(0)}`);
}

// --- 급행은 역에서만 완행을 추월한다 ---
{
  let line = L.create(st(0, 0), st(1000, 0));
  for (const x of [2000, 3000, 4000, 5000]) line = L.withExtension(line, st(x, 0));
  L.rebuild(line, ground);
  const local = line.patterns[0];
  const express = L.expressPattern(line);
  line.patterns.push(express);

  local.trains = 0;
  ok('완행이 안 다니면 막을 것이 없다', L.overtakeFactor(line, express) === 1);

  // 완행이 잦아질수록 지나칠 틈이 줄어든다. 통과역 수만큼만 지나칠 수 있으므로
  // 아낄 수 있는 시간에 상한이 생긴다.
  const at = (n) => { local.trains = n; return L.overtakeFactor(line, express); };
  ok('완행이 잦을수록 급행이 더 막힌다', at(60) >= at(30) && at(30) >= at(4),
    `${at(4).toFixed(2)} ≤ ${at(30).toFixed(2)} ≤ ${at(60).toFixed(2)}`);
  ok('막혀도 완행보다 빠르거나 같다',
    L.runTime(line, express) * at(60) <= L.runTime(line, local) + 1e-6);
  ok('제약은 늦추기만 한다', at(4) >= 1 && at(60) >= 1);
  local.trains = 4;
  ok('완행 자신은 이 제약을 받지 않는다', L.overtakeFactor(line, local) === 1);

  // 통과역이 많을수록 지나칠 기회가 많아 덜 막힌다.
  const half = { ...express, stops: express.stops.slice(), trains: 1 };
  half.stops[2] = true;
  half.stops[3] = true;
  line.patterns.push(half);
  local.trains = 60;
  // 비율이 아니라 실제 걸리는 시간으로 견준다 — 비율은 저마다 제 자유 주행시간을
  // 기준으로 하므로 패턴끼리 견줄 수 없다.
  const heldExpress = L.runTime(line, express) * L.overtakeFactor(line, express);
  const heldHalf = L.runTime(line, half) * L.overtakeFactor(line, half);
  ok('통과역이 많은 쪽이 더 빠르다', heldExpress < heldHalf,
    `${heldExpress.toFixed(0)}초 vs ${heldHalf.toFixed(0)}초`);
}

// --- 막힌 만큼 시간표도 늘어난다 ---
{
  let line = L.create(st(0, 0), st(1000, 0));
  for (const x of [2000, 3000, 4000]) line = L.withExtension(line, st(x, 0));
  L.rebuild(line, ground);
  const local = line.patterns[0];

  local.trains = 2;
  const free = L.plan(line, local);
  local.trains = 20;
  const held = L.plan(line, local);
  ok('막히면 주기가 길어진다', held.cycle > free.cycle, `${free.cycle.toFixed(0)} → ${held.cycle.toFixed(0)}`);
  ok('막힌 만큼이 plan에 적혀 나온다', held.hold > 1 && free.hold === 1);

  // 화면의 열차가 계산과 다른 속도로 돌면 안 된다.
  const table = L.timetable(line, local);
  ok('시간표의 주기가 plan과 같다', Math.abs(table.cycle - held.cycle) < 0.01,
    `${table.cycle.toFixed(1)} vs ${held.cycle.toFixed(1)}`);
}

// --- 열차가 역에 선다 ---
{
  let line = L.create(st(0, 0), st(1500, 0));
  line = L.withExtension(line, st(3000, 0));
  L.rebuild(line, ground);
  const table = L.timetable(line, line.patterns[0]);

  // 가운데 역에 서 있는 동안을 찾아본다.
  const mid = table.stops.find((x) => x.station === 1);
  const during = L.at(line, table, (mid.arrive + mid.depart) / 2);
  const moving = L.at(line, table, mid.depart + 20);
  ok('역에 선 동안은 멈춤으로 표시된다', during.halted === true);
  ok('달릴 때는 아니다', moving.halted === false);
  near('서 있는 자리는 그 역', during.x, 1500, 2);
}

// --- 정차역 토글과 구간 운행 ---
// **어느 역이든 끌 수 있고 둘만 남으면 된다.** 전에는 양 끝을 잠가 두어 바깥 몇
// 정거장만 빼고 도는 구간 운행을 만들 수가 없었다.
{
  let line = L.create(st(0, 0), st(2000, 0));
  for (const p of [st(4000, 0), st(6000, 0), st(8000, 0)]) line = L.withExtension(line, p);
  L.rebuild(line, ground);
  const p0 = line.patterns[0];

  ok('종착역도 끌 수 있다', L.canToggle(line, 0, p0) && L.canToggle(line, 4, p0));
  const whole = L.spanOf(line, p0);
  ok('다 켜 두면 경로 전체다',
    whole.from === 0 && whole.to === line.path.pts.length - 1, JSON.stringify(whole));

  const full = L.runTime(line, p0);
  p0.stops[0] = false;
  p0.stops[4] = false;
  const span = L.spanOf(line, p0);
  ok('켜 둔 첫 역과 마지막 역이 종착역이 된다',
    span.from === line.anchors[1].at && span.to === line.anchors[3].at, JSON.stringify(span));
  ok('바깥으로는 가지 않으니 더 짧다', L.runTime(line, p0) < full * 0.7,
    `${L.runTime(line, p0).toFixed(0)}초 vs ${full.toFixed(0)}초`);

  const table = L.timetable(line, p0);
  ok('표가 그 구간만 담는다',
    Math.abs(Math.min(...table.marks.map((m) => m.s)) - line.path.s[span.from]) < 1
    && Math.abs(Math.max(...table.marks.map((m) => m.s)) - line.path.s[span.to]) < 1);
  ok('종착역 밖으로는 열차가 안 간다',
    [0, 0.25, 0.5, 0.75].every((f) => L.at(line, table, table.cycle * f).x >= 1999));

  // 둘만 남으면 더 끄지 못한다.
  p0.stops[2] = false;
  ok('둘이 남으면 잠긴다', !L.canToggle(line, 1, p0) && !L.canToggle(line, 3, p0));
  ok('꺼진 것은 언제든 켤 수 있다', L.canToggle(line, 0, p0) && L.canToggle(line, 2, p0));

  // 순환선은 한 바퀴가 곧 주기라 잘라 낼 자리가 없다.
  let loop = L.withExtension(L.create(st(0, 0), st(2000, 0)), st(2000, 2000));
  loop = L.withExtension(loop, loop.stations[0]);
  L.rebuild(loop, ground);
  loop.patterns[0].stops[0] = false;
  const ring = L.spanOf(loop, loop.patterns[0]);
  ok('순환선은 경로 전체를 쓴다',
    ring.from === 0 && ring.to === loop.path.pts.length - 1, JSON.stringify(ring));
}

// --- 열차 수 세기 ---
{
  const line = L.create(st(0, 0), st(1000, 0));
  line.patterns.push(L.expressPattern(line));
  line.patterns[0].trains = 2;
  line.patterns[1].trains = 3;
  ok('노선의 열차는 패턴별 합이다', L.trainsOf(line) === 5);
}

// --- 노선 중간에 역 끼우기 ---
{
  const a = st(0, 0);
  const b = st(2000, 0);
  const c = st(4000, 0);
  const line = L.withExtension(L.create(a, b), c);
  L.rebuild(line, ground);

  const mid = st(1000, 20);
  const ins = L.withInsertion(line, mid, 120);
  ok('선 밑의 역은 끼울 자리를 찾는다', !!ins && ins.seg === 0);
  ok('원본은 그대로다', line.stations.length === 3);
  ok('역이 순서대로 들어간다', ins.line.stations.map((s) => s.x).join(',') === '0,1000,2000,4000');
  ok('정차역도 함께 늘어난다', ins.line.patterns[0].stops.length === 4
    && ins.line.patterns[0].stops.every(Boolean));
  ok('끼운 노선이 지어진다', L.rebuild(ins.line, ground).ok);

  ok('선에서 먼 역은 끼우지 않는다', L.withInsertion(line, st(1000, 900), 120) === null);
  ok('이미 노선에 있는 역은 끼우지 않는다', L.withInsertion(line, b, 120) === null);

  const two = L.withInsertion(ins.line, st(3000, 0), 120);
  ok('두 번째도 제자리에 들어간다',
    !!two && two.line.stations.map((s) => s.x).join(',') === '0,1000,2000,3000,4000');
}

// 중간점이 있는 마디에 끼우면 중간점이 앞뒤로 갈린다. 한쪽에 몰면 선이 역을
// 지나쳤다가 되돌아온다.
{
  const line = L.create(st(0, 0), st(2000, 0), [{ x: 600, y: 600 }, { x: 1400, y: 600 }]);
  L.rebuild(line, ground);
  const ins = L.withInsertion(line, st(1000, 610), 150);
  ok('중간점이 앞뒤로 갈린다',
    !!ins && ins.line.mids.map((m) => m.length).join(',') === '1,1',
    ins ? ins.line.mids.map((m) => m.length).join(',') : '못 끼움');
  ok('갈린 중간점의 순서가 유지된다',
    ins.line.mids[0][0].x === 600 && ins.line.mids[1][0].x === 1400);
}

// 순환선은 마지막 마디가 0번 역으로 돌아온다. 거기에 끼우면 배열 끝에 붙는다.
{
  const a = st(0, 0);
  let line = L.withExtension(L.create(a, st(2400, 0)), st(2400, 2400));
  line = L.withExtension(line, a);
  L.rebuild(line, ground);
  ok('순환선이 섰다', line.loop && line.anchors.length === 4);
  const ins = L.withInsertion(line, st(1200, 1200), 150);
  ok('순환선의 닫는 마디에 끼운다', !!ins && ins.seg === 2);
  ok('끝에 붙고 중간점 칸도 하나 는다',
    ins.line.stations.length === 4 && ins.line.mids.length === 4);
  ok('여전히 순환선이다', ins.line.loop);
}

// 급행이 통과하던 구간에 역이 생겨도 급행은 서지 않는다.
{
  const line = L.withExtension(L.create(st(0, 0), st(2000, 0)), st(4000, 0));
  L.rebuild(line, ground);
  line.patterns.push({ stops: [true, false, true], trains: 1, dir: 1 });
  const ins = L.withInsertion(line, st(1000, 0), 120);
  ok('완행은 새 역에 선다', ins.line.patterns[0].stops.join(',') === 'true,true,true,true');
  ok('급행은 서지 않는다', ins.line.patterns[1].stops.join(',') === 'true,false,false,true');
}

// 끼울 곳을 못 찾는 경우
{
  const line = L.create(st(0, 0), st(2000, 0));
  ok('경로가 없으면 끼우지 않는다', L.withInsertion(line, st(1000, 0), 120) === null);
}

// --- 순환선의 역방향 ---
// 한 방향으로만 돌면 반대편으로 가려는 승객이 한 바퀴를 다 돌아야 하고, 그 승객까지
// 같은 선로에 실려 한쪽만 터진다. 마주 오는 열차가 한 선로에 있을 수 없으므로 두
// 방향은 제 선로를 쓴다 — 자료로는 **역 순서를 뒤집은 또 하나의 순환선**이다.
{
  const a = st(0, 0);
  const b = st(2400, 0);
  const c = st(2400, 2400);
  const d = st(0, 2400);
  let line = L.create(a, b);
  for (const s of [c, d, a]) line = L.withExtension(line, s);
  L.rebuild(line, ground);
  ok('순환선이 섰다', line.loop && line.stations.length === 4);

  ok('왕복 노선에는 역방향이 없다', L.reverse(L.create(a, b)) === null);

  line.patterns[0].trains = 4;
  line.patterns[0].back = 2;
  const back = L.reverse(line);
  L.rebuild(back, ground);

  ok('0번 역이 그대로 맨 앞이다', back.order[0] === 0 && back.stations[0] === a);
  ok('나머지 역이 뒤집힌다', back.order.join(',') === '0,3,2,1');
  ok('중간점 칸 수가 같다', back.mids.length === line.mids.length);
  ok('길이가 같다', Math.abs(back.path.length - line.path.length) < 1);
  ok('역방향 열차는 back에서 온다', back.patterns[0].trains === 2 && back.patterns[0].back === 0);

  ok('산 열차는 양쪽을 다 센다', L.trainsOf(line) === 6, String(L.trainsOf(line)));
  ok('선로 위 열차는 제 방향만 센다',
    L.trackTrains(line) === 4 && L.trackTrains(back) === 2);

  // 방향마다 제 선로이므로 배차도 따로 난다.
  const pf = L.plan(line, line.patterns[0]);
  const pr = L.plan(back, back.patterns[0]);
  near('주기는 같다', pr.cycle, pf.cycle, 30);
  near('배차는 대수만큼 갈린다', pr.headway, pf.headway * 2, 30);

  // 반대편 역은 도는 쪽에 따라 걸리는 시간이 다르다. 한 정거장 옆은 한쪽으로는
  // 금방이고 반대로는 한 바퀴다.
  const tf = L.timetable(line, line.patterns[0]);
  const tr = L.timetable(back, back.patterns[0]);
  const at = (i) => back.order.indexOf(i);
  ok('이웃 역은 정방향이 훨씬 빠르다', L.rideTime(tf, 0, 1) < L.rideTime(tr, 0, at(1)) / 2,
    `${L.rideTime(tf, 0, 1).toFixed(0)}초 vs ${L.rideTime(tr, 0, at(1)).toFixed(0)}초`);
  near('반대편 역은 어느 쪽으로 가나 비슷하다',
    L.rideTime(tr, 0, at(2)), L.rideTime(tf, 0, 2), 40);

  // 선로가 따로이므로 한쪽에 열차를 몰아도 반대쪽 간격은 그대로다.
  line.patterns[0].trains = 12;
  const many = L.reverse(line);
  L.rebuild(many, ground);
  ok('정방향만 선로 한계에 걸린다',
    L.holdFactor(line, line.patterns[0]) > 1 && L.holdFactor(many, many.patterns[0]) === 1,
    `${L.holdFactor(line, line.patterns[0]).toFixed(2)} / ${L.holdFactor(many, many.patterns[0]).toFixed(2)}`);
}

// --- 편성 량수 ---
// 열차를 더 사면 배차가 좁아지지만 선로 간격(`MIN_GAP`)에서 막힌다. 그때 남는 길이
// **한 대를 길게 만드는 것**이다 — 실어 나르는 양만 늘고 배차는 그대로다.
{
  const line = L.withExtension(L.create(st(0, 0), st(2400, 0)), st(4800, 0));
  L.rebuild(line, ground);
  const p = line.patterns[0];

  ok('기본 편성이 붙어 있다', L.carsOf(p) === L.CARS.base, String(L.carsOf(p)));
  ok('없으면 기본값으로 본다', L.carsOf({}) === L.CARS.base);
  ok('한 량은 두 량보다 적을 수 없고 다섯 량을 넘지 않는다',
    L.CARS.min === 2 && L.CARS.max === 5);

  const head = 300;
  const base = L.capacityOf(p, head);
  near('기본 편성의 수송력', base, L.CARS.base * L.CAR_CAPACITY * 60 / head, 0.001);
  ok('량을 늘리면 그만큼 는다',
    Math.abs(L.capacityOf({ cars: 5 }, head) / base - 5 / L.CARS.base) < 1e-9,
    `${Math.round(L.capacityOf({ cars: 5 }, head))} vs ${Math.round(base)}`);
  ok('배차가 좁아져도 량과는 따로다',
    L.capacityOf(p, head / 2) === base * 2);
  ok('배차가 없으면 0', L.capacityOf(p, Infinity) === 0);

  // 량은 배차를 바꾸지 않는다 — 기다리는 시간은 그대로다.
  const before = L.plan(line, p).headway;
  p.cars = 5;
  ok('량을 늘려도 배차는 그대로다', L.plan(line, p).headway === before);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/roadworks/traffic.test.js
const T = require('./traffic.js');
const L = require('./levels.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`);
  }
}

function near(name, actual, expected, slack = 0.01) {
  if (Math.abs(actual - expected) <= slack) passed++;
  else {
    failed++;
    console.log(`실패: ${name}\n  결과 ${actual}\n  기대 ${expected} ±${slack}`);
  }
}

// rows로 작은 판을 짓는다. levels.js의 글자와 같다.
function net(rows) {
  return L.build({ w: rows[0].length, h: rows.length, rows });
}

const at = (n, x, y) => y * n.w + x;

// --- 판 읽기 ---

{
  const n = net([
    'H=W',
    '...',
  ]);
  check('집의 출입구는 맞닿은 도로', T.access(n, 0), [1]);
  check('맞닿은 도로가 없으면 출입구도 없다', T.access(n, at(n, 0, 1)), []);
  check('곧은 길은 교차로가 아니다', T.isCrossing(n, 1), false);
}

{
  const n = net([
    '.=.',
    '===',
    '.=.',
  ]);
  check('가로세로가 만나면 교차로', T.isCrossing(n, at(n, 1, 1)), true);
  check('끝 칸은 교차로가 아니다', T.isCrossing(n, at(n, 0, 1)), false);
}

// --- 비용 ---

{
  const n = net(['H===W']);
  const flow = new Float64Array(n.tiles.length * 2);
  near('빈 도로는 자유 흐름', T.enterCost(n, flow, 1, T.AXIS_H), T.T0);

  flow[1 * 2 + T.AXIS_H] = T.LANE_CAP;
  // v/c = 1이면 BPR은 1 + α = 1.15배
  near('용량을 꽉 채우면 1.15배', T.enterCost(n, flow, 1, T.AXIS_H), T.T0 * (1 + T.ALPHA));

  flow[1 * 2 + T.AXIS_H] = T.LANE_CAP * 2;
  // β=4라 용량의 두 배에서는 2^4 = 16배가 붙는다. 용량 근처에서 급히 꺾이는 모양.
  near('용량의 두 배면 급히 꺾인다', T.enterCost(n, flow, 1, T.AXIS_H), T.T0 * (1 + T.ALPHA * 16));
}

{
  const n = net(['H===W']);
  n.tiles[1].lanes = 2;
  check('차로를 늘리면 용량이 는다', T.capacity(n.tiles[1], T.AXIS_H), T.LANE_CAP * 2);
  n.tiles[1].lanes = 1;
  n.tiles[1].signal = 0.65;
  check('신호는 녹색을 나눠 준다', [
    T.capacity(n.tiles[1], T.AXIS_H),
    T.capacity(n.tiles[1], T.AXIS_V),
  ], [T.LANE_CAP * 0.65, T.LANE_CAP * 0.35]);
}

{
  // 신호 없는 교차로에서는 교차 교통이 그대로 지체가 된다.
  const n = net([
    '.=.',
    '===',
    '.=.',
  ]);
  const i = at(n, 1, 1);
  const tile = n.tiles[i];
  const flow = new Float64Array(n.tiles.length * 2);
  flow[i * 2 + T.AXIS_V] = T.LANE_CAP / 2;
  const alone = T.enterCost(n, flow, i, T.AXIS_H);
  flow[i * 2 + T.AXIS_V] = T.LANE_CAP;
  const crowded = T.enterCost(n, flow, i, T.AXIS_H);
  check('교차 교통이 늘면 지나갈 차가 없어도 더 지체된다', crowded > alone, true);
  near('막힌 정도는 두 방향을 합쳐서 잰다',
    T.pressure(tile, 0, T.LANE_CAP, T.AXIS_H, true), 1 / T.UNSIG);
  check('갈라지기만 하는 모퉁이는 다투지 않는다',
    T.conflictable(n, at(n, 0, 1)), false);

  // 같은 양이라면 신호를 세운 쪽이 낫다. 녹색을 나눠 용량이 줄어도, 서로 빈틈을
  // 기다리며 버리는 몫이 사라지기 때문이다.
  flow[i * 2 + T.AXIS_H] = T.LANE_CAP * 0.5;
  flow[i * 2 + T.AXIS_V] = T.LANE_CAP * 0.5;
  const raw = T.enterCost(n, flow, i, T.AXIS_H);
  tile.signal = 0.5;
  check('붐비는 교차로는 신호가 낫다', T.enterCost(n, flow, i, T.AXIS_H) < raw, true);
  tile.signal = null;
}

// --- 배분 ---

{
  const n = net(['H===W']);
  const out = T.assign(n, [{ id: 0, from: 0, to: 4, volume: 10 }]);
  near('한산하면 체감이 자유 흐름과 같다', out.trips[0].ratio, 1);
  near('지나는 칸마다 같은 양이 흐른다', out.load[1], 10);
  near('건물 칸에는 흐름이 없다', out.load[0], 0);
}

{
  // 길이 하나뿐일 때와 둘일 때. **도로를 놓으면 운전자가 갈아탄다**는 것이 이
  // 모델을 쓰는 이유다.
  const one = net([
    '.....',
    'H===W',
    '.....',
  ]);
  const demand = [{ id: 0, from: at(one, 0, 1), to: at(one, 4, 1), volume: 150 }];
  const before = T.assign(one, demand);
  check('좁은 길은 넘친다', before.ratio[at(one, 2, 1)] > 2, true);

  // 우회로는 **직장까지 따로 닿아야** 한다. 원래 길의 마지막 칸에서 다시 합치면
  // 거기서 같은 정체를 만나 아무도 갈아타지 않는다.
  const two = net([
    '.====',
    'H===W',
    '.....',
  ]);
  const after = T.assign(two, demand);
  check('우회로가 생기면 나뉜다', after.load[at(two, 2, 0)] > 20, true);
  check('원래 길의 부하가 준다', after.load[at(two, 2, 1)] < before.load[at(one, 2, 1)], true);
  check('체감 통행시간도 준다', after.trips[0].time < before.trips[0].time, true);
}

{
  // 흐름이 한쪽으로 기울면 녹색도 그쪽으로 기울어야 한다. 조정 단추가 할 일이다.
  const wide = net([
    '..H..',
    '..=..',
    'H===W',
    '..=..',
    '..W..',
  ]);
  const cross = at(wide, 2, 2);
  const demand = [
    { id: 0, from: at(wide, 0, 2), to: at(wide, 4, 2), volume: 40 },
    { id: 1, from: at(wide, 2, 0), to: at(wide, 2, 4), volume: 10 },
  ];
  wide.tiles[cross].signal = 0.5;
  const even = T.assign(wide, demand);
  wide.tiles[cross].signal = 0.8;
  const tuned = T.assign(wide, demand);
  check('많은 쪽에 녹색을 더 주면 나아진다',
    tuned.trips[0].time < even.trips[0].time, true);
}

{
  const n = net([
    'H..',
    '...',
    '..W',
  ]);
  check('길이 없으면 닿지 않는다', T.assign(n, [{ id: 0, from: 0, to: 8, volume: 5 }]).trips[0].ratio, null);
}

// --- 실제 판 ---

{
  const city = L.build(L.CITY);
  const out = T.assign(city, L.demands(L.CITY));
  check('시작 판은 모든 통근이 닿는다', out.trips.every((t) => Number.isFinite(t.time)), true);
  check('가운데 교차로가 가장 붐빈다',
    out.load.indexOf(Math.max(...out.load)), 4 * city.w + 4);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 판을 구워 `puzzles.js`의 속을 찍어 낸다. **실시간으로 만들기에는 너무 오래 걸려**
// (어려운 판 하나에 배치를 수십 번 버린다) 미리 만들어 자료로 둔다.
//
// 실행: node games/rushhour/bake.js > /tmp/body.txt
//       (찍힌 것을 puzzles.js의 PUZZLES 안에 붙인다)
//
// **다 푼 자리에서 넓이 우선으로 퍼져 나가 가장 먼 자리를 판으로 삼는다.** 아무렇게나
// 차를 놓고 풀리는지 보는 방식은 쉬운 판만 나오고, 거꾸로 가면 어떤 자리에 멈추든
// 풀리는 판인 것이 공짜로 보장된다. 멈춘 자리의 최단 수는 앞으로 훑어 다시 재서
// 참값을 적는다 — 거꾸로 잰 거리는 다른 "다 푼 자리"로 더 빨리 가는 길이 있을 수 있어
// 위쪽 어림이기 때문이다.
const R = require('./rules.js');
const S = require('./solver.js');

// 난이도마다 차 수와 트럭 수, 노리는 최단 수. 차가 많을수록 서로를 막아 수가 길어진다.
const SPECS = {
  easy: [{ cars: 8, trucks: 2, low: 6, high: 12 }],
  normal: [{ cars: 11, trucks: 3, low: 13, high: 21 }],
  // 어려움은 배치를 섞어 뽑는다. 열셋에 트럭 다섯이 가장 잘 나왔다(280초에 13장).
  hard: [
    { cars: 12, trucks: 4, low: 22, high: 60 },
    { cars: 13, trucks: 4, low: 22, high: 60 },
    { cars: 13, trucks: 5, low: 22, high: 60 },
    { cars: 14, trucks: 5, low: 22, high: 60 },
  ],
};

// 한 배치에서 훑어 볼 자리 수. 덩어리를 끝까지 보면 헐거운 배치에서 수만 개로 불어
// 판 하나에 몇 초가 걸린다.
const CAP = 20000;
const WANT = { easy: 40, normal: 40, hard: 40 };
const BUDGET = { easy: 40000, normal: 120000, hard: 300000 };

function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 차를 겹치지 않게 흩는다. 빨간 차는 빠져나가는 줄에 벽까지 붙여 둔다 — 여기서는 다 푼
// 자리 하나만 있으면 되고, 판으로 쓸 자리는 퍼져 나가며 고른다.
function scatter(next, spec) {
  const cars = [{ len: 2, horizontal: true, line: R.EXIT_ROW, pos: R.SIZE - 2 }];
  const taken = new Array(R.SIZE * R.SIZE).fill(false);
  for (const cell of R.cellsOf(cars[0])) taken[cell.y * R.SIZE + cell.x] = true;

  let trucks = spec.trucks;
  let guard = 0;
  while (cars.length < spec.cars && guard++ < 600) {
    const len = trucks > 0 && next() < 0.45 ? 3 : 2;
    const horizontal = next() < 0.5;
    const line = Math.floor(next() * R.SIZE);
    const pos = Math.floor(next() * (R.SIZE - len + 1));
    // 빠져나가는 줄에 가로 차를 더 두면 빨간 차가 영영 못 나간다.
    if (horizontal && line === R.EXIT_ROW) continue;

    const car = { len, horizontal, line, pos };
    const cells = R.cellsOf(car);
    if (cells.some((cell) => taken[cell.y * R.SIZE + cell.x])) continue;
    for (const cell of cells) taken[cell.y * R.SIZE + cell.x] = true;
    cars.push(car);
    if (len === 3) trucks--;
  }
  return cars;
}

const encode = (cars) => cars
  .map((car) => `${car.len}${car.horizontal ? 'h' : 'v'}${car.line}${car.pos}`).join(' ');

function bake(level) {
  const specs = SPECS[level];
  const seen = new Set();
  const list = [];
  const started = Date.now();
  let seed = 1;

  while (list.length < WANT[level] && Date.now() - started < BUDGET[level]) {
    const spec = specs[seed % specs.length];
    const next = rng(seed++ * 2654435761);
    const cars = scatter(next, spec);
    const puzzle = { cars };
    if (!R.wellFormed(puzzle)) continue;

    const swept = S.sweep(puzzle, R.stateOf(cars), CAP);
    for (const state of swept.deepest.slice(0, 10)) {
      const moves = S.minMoves(puzzle, state);
      if (moves === null || moves < spec.low || moves > spec.high) continue;
      const code = encode(cars.map((car, i) => ({ ...car, pos: state[i] })));
      if (seen.has(code)) continue;
      seen.add(code);
      list.push({ code, moves });
      break;
    }
  }
  list.sort((a, b) => a.moves - b.moves);
  return list;
}

const lines = [];
for (const level of ['easy', 'normal', 'hard']) {
  const list = bake(level);
  process.stderr.write(`${level} ${list.length}개\n`);
  lines.push(`  ${level}: [`);
  for (const one of list) lines.push(`    ['${one.code}', ${one.moves}],`);
  lines.push('  ],');
}
console.log(lines.join('\n'));

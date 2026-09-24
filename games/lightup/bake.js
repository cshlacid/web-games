'use strict';

// 판을 굽는다. 사이트는 이 파일을 부르지 않는다 — 구운 결과(`puzzles.js`)만 싣는다.
//
//   node games/lightup/bake.js > games/lightup/puzzles.js
//
// **정답 전구부터 놓고 숫자를 지운다.**
//   1. 벽을 흩는다. 가운데를 두고 점대칭으로 놓는다 — 이 퍼즐의 오랜 관례이고, 대칭이
//      아니면 판이 어수선해 보인다.
//   2. 어두운 칸 하나를 골라 전구를 놓기를 판이 다 밝을 때까지 되풀이한다. 어두운 칸은
//      어느 전구에게도 보이지 않으니 서로 비추는 전구가 생기지 않는다.
//   3. 모든 벽에 맞닿은 전구 수를 적는다.
//   4. 숫자를 다 둔 채로 푼다. 막히면 풀이기가 정하지 못한 칸 하나를 (점대칭 짝과 함께)
//      숫자 벽으로 바꾸고 다시 푼다. 정답 전구가 아니고, 벽이 되어도 정답 전구만으로 판이
//      다 밝은 칸만 바꾼다. 벽 없는 넓은 빈 곳에서는 전구 자리가 여럿 나오는데, 숫자를 다
//      둬도 7×7 스무 판 중 열여덟이 그래서 안 풀렸다.
//   5. 무작위 순서로 숫자를 하나씩 지워 보고, 풀이기가 여전히 끝까지 풀면 지운 채로 둔다.
// 풀이기는 찍지 않으므로 끝까지 풀리는 판은 답이 하나뿐이다(solver.js 머리말).
(function () {

const R = require('./rules.js');
const S = require('./solver.js');

// 난이도마다 크기, 벽 비율, 가정을 몇 번까지 써도 되는지.
const LEVELS = {
  easy: { size: 7, walls: 0.2, maxTrials: 0, count: 60 },
  normal: { size: 10, walls: 0.2, maxTrials: 0, count: 60 },
  hard: { size: 10, walls: 0.18, maxTrials: Infinity, minTrials: 1, count: 60 },
};

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

function shuffle(list, next) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// 판 하나를 고치는 횟수. 이보다 오래 걸리면 벽부터 다시 흩는다.
const REPAIRS = 40;

// 막힌 칸 하나를 짝과 함께 숫자 벽으로 바꾼다. 바꿨으면 true.
function repair(puzzle, bulbs, stuck, count) {
  const { cells } = puzzle;
  const n = cells.length;
  for (const x of stuck) {
    const pair = [...new Set([x, n - 1 - x])].filter((i) => cells[i] === R.OPEN);
    if (pair.some((i) => bulbs[i])) continue;
    for (const i of pair) cells[i] = R.WALL;
    const geo = R.geometry(puzzle);
    const lit = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!bulbs[i]) continue;
      lit[i] = 1;
      for (const j of geo.sight[i]) lit[j] = 1;
    }
    let dark = false;
    for (let i = 0; i < n; i++) if (cells[i] === R.OPEN && !lit[i]) dark = true;
    if (dark) {
      for (const i of pair) cells[i] = R.OPEN;
      continue;
    }
    for (const i of pair) cells[i] = count(i, geo);
    return true;
  }
  return false;
}

function make(level, seed) {
  const spec = LEVELS[level];
  const { size } = spec;
  const n = size * size;
  const next = rng(seed);

  const cells = new Int8Array(n).fill(R.OPEN);
  for (let i = 0; i < n; i++) {
    const twin = n - 1 - i;
    if (twin < i) continue;
    if (next() < spec.walls) { cells[i] = R.WALL; cells[twin] = R.WALL; }
  }
  const puzzle = { rows: size, cols: size, cells };
  const geo = R.geometry(puzzle);

  const bulbs = new Uint8Array(n);
  const lit = new Uint8Array(n);
  for (const i of shuffle([...Array(n).keys()], next)) {
    if (cells[i] !== R.OPEN || lit[i]) continue;
    bulbs[i] = 1;
    lit[i] = 1;
    for (const j of geo.sight[i]) lit[j] = 1;
  }

  const count = (i, g) => g.near[i].filter((j) => bulbs[j]).length;
  for (let i = 0; i < n; i++) if (cells[i] === R.WALL) cells[i] = count(i, geo);

  const trial = spec.maxTrials > 0;
  let solvedFull = false;
  for (let round = 0; round < REPAIRS && !solvedFull; round++) {
    const result = S.solve(puzzle, { trial });
    if (result.solved) { solvedFull = true; break; }
    const stuck = [];
    result.state.forEach((v, i) => { if (cells[i] === R.OPEN && v === S.UNKNOWN) stuck.push(i); });
    if (!repair(puzzle, bulbs, shuffle(stuck, next), count)) return null;
  }
  if (!solvedFull) return null;

  for (const i of shuffle([...Array(n).keys()], next)) {
    if (cells[i] < 0) continue;
    const kept = cells[i];
    cells[i] = R.WALL;
    if (!S.solve(puzzle, { trial }).solved) cells[i] = kept;
  }
  const result = S.solve(puzzle, { trial });
  if (!result.solved) return null;
  if (result.trials > spec.maxTrials || result.trials < (spec.minTrials || 0)) return null;
  return { code: R.encode(cells), trials: result.trials, bulbs };
}

function bake(level, count, startSeed) {
  const list = [];
  for (let seed = startSeed; list.length < count; seed++) {
    const one = make(level, seed);
    if (!one || list.includes(one.code)) continue;
    list.push(one.code);
  }
  return list;
}

module.exports = { LEVELS, REPAIRS, rng, repair, make, bake };

if (require.main === module) {
  const out = {};
  const started = Date.now();
  for (const level of Object.keys(LEVELS)) {
    out[level] = bake(level, LEVELS[level].count, 1);
    process.stderr.write(`${level}: ${out[level].length}판 (${((Date.now() - started) / 1000).toFixed(1)}초)\n`);
  }
  const body = Object.keys(out).map((level) => {
    const rows = out[level].map((code) => `      '${code}',`).join('\n');
    return `  ${level}: {\n    size: ${LEVELS[level].size},\n    list: [\n${rows}\n    ],\n  },`;
  }).join('\n');
  process.stdout.write(`'use strict';

// 구워 둔 판. 손으로 고치지 않는다 — \`node games/lightup/bake.js\`로 다시 굽는다.
// 판 하나는 칸마다 \`.\` 흰 칸, \`#\` 숫자 없는 벽, \`0\`~\`4\` 숫자 벽을 한 줄로 적은 것이다.
(function () {

const PUZZLES = {
${body}
};

const api = { PUZZLES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.LightUpPuzzles = api;

})();
`);
}

})();

'use strict';

// 판을 굽는다. 사이트는 이 파일을 부르지 않는다 — 구운 결과(`puzzles.js`)만 싣는다.
//
//   node games/nurikabe/bake.js > games/nurikabe/puzzles.js
//
// **정답부터 만들고 숫자를 단 뒤, 막히는 자리를 고친다.**
//   1. 칸 하나에서 바다를 한 칸씩 넓힌다. 한 곳에서 번지므로 바다는 늘 이어져 있고,
//      2×2로 뭉치게 되는 칸은 건너뛴다.
//   2. 바다가 아닌 칸의 덩어리가 섬이다. 섬마다 칸 하나를 골라 섬의 칸 수를 적는다.
//   3. 찍지 않는 풀이기로 푼다. 끝까지 가면 판으로 쓴다(답이 하나뿐이다 — solver.js 머리말).
//   4. 막히면 풀이기가 정하지 못한 칸 하나를 골라 판을 고치고 3으로 돌아간다.
//      - 정답에서 섬인 칸이면 그 섬의 숫자를 그 칸으로 옮긴다. 숫자 칸은 늘 섬이라
//        그 칸이 바다인 다른 답이 사라진다.
//      - 바다인 칸이면 그 칸을 이웃한 섬에 붙이거나(섬 하나에만 닿을 때), 둘레가 다
//        바다면 숫자 1짜리 섬으로 만든다. 바다가 끊기지 않을 때만 한다.
// 무작위로 만든 판은 답이 여럿인 것이 대부분이다 — 8×8 서른 판 중 스물아홉이 그랬다.
// 숫자 자리를 바꿔 다시 보는 것만으로는 거의 건지지 못했다.
(function () {

const R = require('./rules.js');
const S = require('./solver.js');

// 난이도마다 크기, 가장 큰 섬, 가정을 몇 번까지 써도 되는지.
//
// **가정은 모든 난이도에 허락한다.** 섬·바다 규칙(solver.js의 1~6)만으로는 8×8이 서른 판
// 중 한 판도 끝나지 않았다. 가정 한 겹("여기를 섬으로 두면 모순")을 허락하면 6×6은 열에
// 넷, 8×8은 열에 넷쯤 건진다. 그래서 난이도는 크기로 가르고, 쉬움은 가정을 세 번까지만,
// 어려움은 가정이 한 번은 드는 판만 쓴다.
const LEVELS = {
  easy: { size: 6, maxIsland: 5, maxTrials: 3, count: 60 },
  normal: { size: 8, maxIsland: 7, maxTrials: Infinity, count: 60 },
  hard: { size: 10, maxIsland: 9, maxTrials: Infinity, minTrials: 1, count: 60 },
};

// 판 하나를 고치는 횟수. 이보다 오래 걸리면 바다부터 다시 만든다.
const REPAIRS = 60;

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

// 칸 i를 바다로 바꾸면 2×2 바다가 생기는지.
function makesPool(size, sea, i) {
  const r = Math.floor(i / size);
  const c = i % size;
  for (const [dr, dc] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
    const r0 = r + dr;
    const c0 = c + dc;
    if (r0 < 0 || c0 < 0 || r0 >= size - 1 || c0 >= size - 1) continue;
    const a = r0 * size + c0;
    const block = [a, a + 1, a + size, a + size + 1];
    if (block.every((x) => x === i || sea[x])) return true;
  }
  return false;
}

// 정답 바다. 섬이 가장 큰 섬보다 크면 그 섬 안으로 바다를 더 들인다 — 넓히는 자리를 섬
// 크기와 상관없이 고르면 커다란 섬 하나가 판의 절반을 차지한다.
function carve(spec, next) {
  const { size, maxIsland } = spec;
  const n = size * size;
  const near = R.neighborsTable(size, size);
  const sea = new Uint8Array(n);
  sea[Math.floor(next() * n)] = 1;
  const target = n * (0.52 + next() * 0.1);
  let count = 1;

  for (let guard = 0; guard < n * 8; guard++) {
    const puzzle = { rows: size, cols: size };
    const land = R.groups(puzzle, (i) => !sea[i]);
    const big = land.list.some((cells) => cells.length > maxIsland);
    if (count >= target && !big) break;

    const options = [];
    for (let i = 0; i < n; i++) {
      if (sea[i] || !near[i].some((j) => sea[j]) || makesPool(size, sea, i)) continue;
      const island = land.list[land.id[i]].length;
      // 큰 섬에 든 칸을 더 자주 고른다.
      options.push({ i, weight: island > maxIsland ? 6 : 1 });
    }
    if (!options.length) break;
    let pick = next() * options.reduce((s, o) => s + o.weight, 0);
    let chosen = options[0].i;
    for (const o of options) { pick -= o.weight; if (pick <= 0) { chosen = o.i; break; } }
    sea[chosen] = 1;
    count++;
  }

  const land = R.groups({ rows: size, cols: size }, (i) => !sea[i]);
  if (land.list.some((cells) => cells.length > maxIsland)) return null;
  return { sea, islands: land.list };
}

// 바다 칸 하나를 뺐을 때 남은 바다가 이어져 있는지.
function seaStaysWhole(size, sea, without) {
  const rest = { rows: size, cols: size };
  return R.groups(rest, (i) => sea[i] && i !== without).list.length <= 1;
}

// 섬마다 숫자 하나. 이미 숫자가 있는 섬은 그 자리를 두고 칸 수만 고친다.
function relabel(size, sea, clues, next) {
  const land = R.groups({ rows: size, cols: size }, (i) => !sea[i]);
  const out = new Int8Array(size * size);
  for (const cells of land.list) {
    const kept = cells.filter((i) => clues[i]);
    const at = kept.length ? kept[Math.floor(next() * kept.length)] : cells[Math.floor(next() * cells.length)];
    out[at] = cells.length;
  }
  return { clues: out, islands: land.list };
}

// 막힌 칸 하나로 판을 고친다. 고쳤으면 true.
function repair(spec, sea, clues, stuck, next) {
  const { size, maxIsland } = spec;
  const near = R.neighborsTable(size, size);
  const land = R.groups({ rows: size, cols: size }, (i) => !sea[i]);
  // 바다 칸을 먼저 고친다. 숫자 옮기기는 판의 모양을 그대로 두어 같은 자리를 맴돌기
  // 쉽다 — 먼저 두었더니 8×8에서 예순 번을 고쳐도 막힌 칸 수가 줄지 않았다.
  for (const x of stuck) {
    if (!sea[x]) continue;
    const touching = new Set(near[x].filter((j) => !sea[j]).map((j) => land.id[j]));
    if (touching.size > 1) continue;
    if (touching.size === 1 && land.list[[...touching][0]].length + 1 > maxIsland) continue;
    if (!seaStaysWhole(size, sea, x)) continue;
    sea[x] = 0;
    return true;
  }
  for (const x of stuck) {
    if (sea[x]) continue;
    const cells = land.list[land.id[x]];
    for (const i of cells) clues[i] = 0;
    clues[x] = cells.length;
    return true;
  }
  return false;
}

function make(level, seed) {
  const spec = LEVELS[level];
  const next = rng(seed);
  const shape = carve(spec, next);
  if (!shape) return null;
  const { size } = spec;
  const sea = shape.sea;
  let { clues } = relabel(size, sea, new Int8Array(size * size), next);

  for (let round = 0; round <= REPAIRS; round++) {
    const puzzle = { rows: size, cols: size, clues };
    const result = S.solve(puzzle, { trial: true });
    if (result.solved) {
      if (result.trials > spec.maxTrials || result.trials < (spec.minTrials || 0)) return null;
      return { code: R.encode(clues), trials: result.trials, sea, rounds: round };
    }
    const stuck = [];
    result.cells.forEach((v, i) => { if (v === S.UNKNOWN) stuck.push(i); });
    for (let i = stuck.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [stuck[i], stuck[j]] = [stuck[j], stuck[i]];
    }
    if (!repair(spec, sea, clues, stuck, next)) return null;
    clues = relabel(size, sea, clues, next).clues;
  }
  return null;
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

module.exports = { LEVELS, REPAIRS, rng, makesPool, carve, relabel, repair, make, bake };

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

// 구워 둔 판. 손으로 고치지 않는다 — \`node games/nurikabe/bake.js\`로 다시 굽는다.
// 판 하나는 칸마다 숫자 1~9나 \`.\`(숫자 없음)를 한 줄로 적은 것이다.
(function () {

const PUZZLES = {
${body}
};

const api = { PUZZLES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.NurikabePuzzles = api;

})();
`);
}

})();

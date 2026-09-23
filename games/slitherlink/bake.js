'use strict';

// 판을 굽는다. 사이트는 이 파일을 부르지 않는다 — 구운 결과(`puzzles.js`)만 싣는다.
//
//   node games/slitherlink/bake.js > games/slitherlink/puzzles.js
//
// **정답 고리부터 만들고 숫자를 지운다.**
//   1. 칸을 한 칸씩 키워 구멍 없는 덩어리를 만든다. 그 둘레가 곧 정답 고리다.
//   2. 모든 칸에 둘레의 선 수를 적는다.
//   3. 무작위 순서로 숫자를 하나씩 지워 보고, 풀이기가 여전히 끝까지 풀면 지운 채로 둔다.
// 풀이기는 찍지 않으므로 끝까지 풀리는 판은 답이 하나뿐이다(solver.js 머리말).
//
// 10×10 어려움은 판 하나에 가정을 수백 번 돌려 몇 초가 걸린다. 폰에서 "새 판"마다 그만큼
// 기다리게 할 수 없어 미리 굽는다(저장소 규칙의 그 경우다).
(function () {

const R = require('./rules.js');
const S = require('./solver.js');

// 난이도마다 크기와, 풀이기가 가정을 써도 되는지.
const LEVELS = {
  easy: { size: 5, trial: false, count: 60 },
  normal: { size: 7, trial: false, count: 60 },
  hard: { size: 10, trial: true, count: 60 },
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

function neighbors(size, cell) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

// 바깥 칸이 모두 판 가장자리와 이어져 있는지. 막힌 바깥 칸이 있으면 덩어리에 구멍이
// 생겨 둘레가 고리 둘이 된다.
function noHole(size, inside) {
  const seen = new Uint8Array(size * size);
  const stack = [];
  for (let cell = 0; cell < size * size; cell++) {
    const r = Math.floor(cell / size);
    const c = cell % size;
    const edge = r === 0 || c === 0 || r === size - 1 || c === size - 1;
    if (edge && !inside[cell]) { seen[cell] = 1; stack.push(cell); }
  }
  while (stack.length) {
    const cell = stack.pop();
    for (const n of neighbors(size, cell)) {
      if (!inside[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
    }
  }
  for (let cell = 0; cell < size * size; cell++) if (!inside[cell] && !seen[cell]) return false;
  return true;
}

// 한 점에서 대각선으로만 맞닿은 두 칸이 있으면 둘레가 그 점에서 스스로를 스친다(선
// 넷이 한 점에 모인다). 새로 넣은 칸의 네 모서리만 보면 된다.
function noPinch(size, inside, cell) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const at = (y, x) => (y >= 0 && x >= 0 && y < size && x < size ? inside[y * size + x] : 0);
  for (const [dy, dx] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const diag = at(r + dy, c + dx);
    const side1 = at(r + dy, c);
    const side2 = at(r, c + dx);
    if (diag && !side1 && !side2) return false;
  }
  return true;
}

// 정답이 될 덩어리. 이웃이 하나뿐인 칸을 더 자주 골라 가지를 뻗게 한다 — 고르게
// 고르면 둥근 덩어리가 되어 고리가 단조롭고 숫자 3이 드물다.
function grow(size, next) {
  const n = size * size;
  const inside = new Uint8Array(n);
  const target = Math.floor(n * (0.45 + next() * 0.15));
  inside[Math.floor(next() * n)] = 1;
  let count = 1;
  let stale = 0;
  while (count < target && stale < n * 4) {
    const frontier = [];
    for (let cell = 0; cell < n; cell++) {
      if (inside[cell]) continue;
      const touching = neighbors(size, cell).filter((x) => inside[x]).length;
      if (touching) frontier.push({ cell, weight: touching === 1 ? 4 : 1 });
    }
    let total = frontier.reduce((sum, one) => sum + one.weight, 0);
    let pick = next() * total;
    let chosen = frontier[0].cell;
    for (const one of frontier) {
      pick -= one.weight;
      if (pick <= 0) { chosen = one.cell; break; }
    }
    inside[chosen] = 1;
    if (noPinch(size, inside, chosen) && noHole(size, inside)) {
      count++;
      stale = 0;
    } else {
      inside[chosen] = 0;
      stale++;
    }
  }
  return inside;
}

function make(level, seed) {
  const spec = LEVELS[level];
  const size = spec.size;
  const next = rng(seed);
  const geo = R.geometry(size, size);
  const inside = grow(size, next);
  const answer = R.outline(geo, inside);
  const counts = R.clueCounts(geo, answer);
  const clues = Int8Array.from(counts);
  const puzzle = { rows: size, cols: size, clues };

  const order = Array.from({ length: size * size }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const cell of order) {
    const kept = clues[cell];
    clues[cell] = -1;
    if (!S.solve(puzzle, { trial: spec.trial }).solved) clues[cell] = kept;
  }
  const result = S.solve(puzzle, { trial: spec.trial });
  return { code: R.encode(clues), solved: result.solved, trials: result.trials, answer };
}

// 숫자가 이보다 많이 남은 판은 버린다. 고리 모양이 규칙과 안 맞으면 숫자를 거의 못
// 지워 칸이 숫자로 뒤덮인 판이 나온다 — 숫자를 다 둔 채로도 규칙만으로는 안 풀리는
// 고리가 있어서다(5×5 스무 판 중 둘이 그랬다).
const MAX_CLUES = 0.6;

// 판으로 쓸 수 있는지. 어려움은 가정이 한 번도 들지 않는 판도 버린다 — 크기만 크고
// 쉬운 판이 섞이면 어려움을 고른 사람에게 싱겁다.
function accept(level, one) {
  if (!one.solved) return false;
  if (one.code.replace(/\./g, '').length > one.code.length * MAX_CLUES) return false;
  return level !== 'hard' || one.trials > 0;
}

function bake(level, count, startSeed) {
  const list = [];
  let seed = startSeed;
  while (list.length < count) {
    const one = make(level, seed++);
    if (!accept(level, one)) continue;
    if (list.includes(one.code)) continue;
    list.push(one.code);
  }
  return list;
}

module.exports = { LEVELS, MAX_CLUES, accept, rng, grow, noHole, noPinch, make, bake };

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

// 구워 둔 판. 손으로 고치지 않는다 — \`node games/slitherlink/bake.js\`로 다시 굽는다.
// 판 하나는 칸마다 숫자 0~3이나 \`.\`(숫자 없음)를 한 줄로 적은 것이다.
(function () {

const PUZZLES = {
${body}
};

const api = { PUZZLES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SlitherPuzzles = api;

})();
`);
}

})();

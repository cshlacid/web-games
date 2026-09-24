'use strict';

// 판을 굽는다. 사이트는 이 파일을 부르지 않는다 — 구운 결과(`puzzles.js`)만 싣는다.
//
//   node games/kenken/bake.js > games/kenken/puzzles.js
//
// **정답부터 만들고 케이지를 씌운다.**
//   1. 무작위 라틴 방진(행·열마다 1~n이 한 번씩)을 정답으로 삼는다.
//   2. 판을 한두 칸에서 네 칸까지의 케이지로 나눈다.
//   3. 케이지마다 연산을 고르고 정답으로 목표 수를 셈한다.
//   4. 찍지 않는 풀이기가 끝까지 풀면 판으로 쓴다(답이 하나뿐이다 — solver.js 머리말).
//      막히면 막힌 칸이 든 케이지를 둘로 쪼개거나 연산을 바꿔 보고 다시 푼다.
(function () {

const R = require('./rules.js');
const S = require('./solver.js');

// 난이도마다 크기, 쓰는 연산, 가정을 몇 번까지 써도 되는지.
const LEVELS = {
  easy: { size: 4, ops: ['+', '-', '*'], maxTrials: 0, count: 60 },
  normal: { size: 6, ops: ['+', '-', '*', '/'], maxTrials: 0, count: 60 },
  hard: { size: 8, ops: ['+', '-', '*', '/'], maxTrials: 15, count: 60 },
};
// 어려움을 "가정이 드는 판"으로 좁히지 않는다. 8×8은 절반쯤이 가정 없이 풀렸다 — 그 판들을
// 버리면 굽는 데 곱절이 들고, 8×8은 크기만으로도 충분히 어렵다. 거꾸로 가정이 열다섯 번을
// 넘는 판(쉰여덟 번 드는 판도 있었다)은 사람이 풀 판이 아니라 버린다.

// 한 칸짜리 케이지를 이만큼만 남긴다. 한 칸짜리는 숫자를 거저 주는 칸인데, 나누다 남은
// 자투리와 고치다 떼어 낸 칸이 모두 한 칸짜리가 되어 4×4에 셋씩 생겼다.
const MAX_SINGLES = { 4: 1, 6: 2, 8: 3 };

// 판 하나를 고치는 횟수.
const REPAIRS = 30;

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

// 무작위 라틴 방진. 행을 하나씩 채우되 열에 이미 쓴 숫자를 피하고, 막히면 처음부터.
// 순환 방진을 섞는 쉬운 길은 모양이 한정돼(행이 서로 밀린 꼴) 판이 비슷해진다.
function latin(n, next) {
  for (;;) {
    const grid = [];
    const used = Array.from({ length: n }, () => new Set());
    let ok = true;
    for (let r = 0; r < n && ok; r++) {
      const row = [];
      const taken = new Set();
      (function fill(c) {
        if (c === n) return true;
        for (const d of shuffle(Array.from({ length: n }, (_, k) => k + 1), next)) {
          if (taken.has(d) || used[c].has(d)) continue;
          row[c] = d; taken.add(d);
          if (fill(c + 1)) return true;
          taken.delete(d);
        }
        return false;
      })(0) ? null : (ok = false);
      if (!ok) break;
      row.forEach((d, c) => used[c].add(d));
      grid.push(...row);
    }
    if (ok) return grid;
  }
}

function neighbors(n, i) {
  const r = Math.floor(i / n);
  const c = i % n;
  const out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

// 케이지 크기. 한 칸짜리는 숫자를 거저 주는 셈이라 드물게, 두세 칸을 가장 흔하게 둔다.
function cageSize(next) {
  const x = next();
  return x < 0.08 ? 1 : x < 0.5 ? 2 : x < 0.85 ? 3 : 4;
}

function partition(n, next) {
  const cageOf = new Int32Array(n * n).fill(-1);
  let id = 0;
  for (const start of shuffle(Array.from({ length: n * n }, (_, i) => i), next)) {
    if (cageOf[start] >= 0) continue;
    const want = cageSize(next);
    const cells = [start];
    cageOf[start] = id;
    while (cells.length < want) {
      const options = [];
      for (const i of cells) for (const j of neighbors(n, i)) if (cageOf[j] < 0) options.push(j);
      if (!options.length) break;
      const pick = options[Math.floor(next() * options.length)];
      cageOf[pick] = id;
      cells.push(pick);
    }
    id++;
  }
  return cageOf;
}

// 한 칸짜리 케이지를 옆 케이지(네 칸 미만)에 붙여 MAX_SINGLES까지 줄인다.
function absorbSingles(n, cageOf, next) {
  const count = () => {
    const sizes = new Map();
    for (const id of cageOf) sizes.set(id, (sizes.get(id) || 0) + 1);
    return sizes;
  };
  let sizes = count();
  const singles = shuffle([...cageOf.keys()].filter((i) => sizes.get(cageOf[i]) === 1), next);
  let left = singles.length;
  for (const i of singles) {
    if (left <= MAX_SINGLES[n]) break;
    const into = shuffle(neighbors(n, i), next).find((j) => sizes.get(cageOf[j]) < 4);
    if (into === undefined) continue;
    sizes.set(cageOf[into], sizes.get(cageOf[into]) + 1);
    sizes.delete(cageOf[i]);
    cageOf[i] = cageOf[into];
    left--;
  }
  const remap = new Map();
  for (let i = 0; i < cageOf.length; i++) {
    if (!remap.has(cageOf[i])) remap.set(cageOf[i], remap.size);
    cageOf[i] = remap.get(cageOf[i]);
  }
  return cageOf;
}

// 케이지의 연산. 두 칸이면 뺄셈·나눗셈도 고를 수 있고(나눗셈은 나누어떨어질 때만), 세 칸
// 이상이면 덧셈과 곱셈뿐이다. 곱이 너무 크면 덧셈으로 — 곱이 네 자리가 넘으면 칸에 안 들어간다.
function operate(cells, answer, ops, next) {
  const values = cells.map((i) => answer[i]);
  if (values.length === 1) return { op: '=', target: values[0] };
  const choices = ops.filter((op) => {
    if (values.length > 2 && (op === '-' || op === '/')) return false;
    if (op === '/') return Math.max(...values) % Math.min(...values) === 0;
    if (op === '*') return values.reduce((s, v) => s * v, 1) < 1000;
    return true;
  });
  const op = choices[Math.floor(next() * choices.length)];
  const target = op === '+' ? values.reduce((s, v) => s + v, 0)
    : op === '*' ? values.reduce((s, v) => s * v, 1)
      : op === '-' ? Math.abs(values[0] - values[1])
        : Math.max(...values) / Math.min(...values);
  return { op, target };
}

function build(n, cageOf, answer, ops, next) {
  const cages = [];
  cageOf.forEach((id, i) => { (cages[id] = cages[id] || []).push(i); });
  return { size: n, cageOf, cages: cages.map((cells) => ({ ...operate(cells, answer, ops, next), cells })) };
}

// 막힌 칸이 든 케이지를 고친다. 둘 이상이면 한 칸을 떼어 옆 케이지에 붙이거나 따로 세우고,
// 한 칸짜리면 옆 케이지와 합친다. 연산은 다시 고른다.
function repair(puzzle, answer, stuck, ops, next) {
  const n = puzzle.size;
  const cageOf = puzzle.cageOf;
  for (const x of stuck) {
    const id = cageOf[x];
    const others = neighbors(n, x).filter((j) => cageOf[j] !== id);
    const mates = puzzle.cages[id].cells.filter((i) => i !== x);
    // 떼어 낸 뒤에도 케이지가 이어져 있어야 한다.
    const connected = (() => {
      if (!mates.length) return true;
      const seen = new Set([mates[0]]);
      const stack = [mates[0]];
      while (stack.length) {
        const i = stack.pop();
        for (const j of neighbors(n, i)) if (mates.includes(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
      return seen.size === mates.length;
    })();
    if (!connected) continue;
    // 옆 케이지에 붙이는 것을 먼저 한다. 따로 세우면 한 칸짜리가 되어 숫자를 거저 준다.
    const target = others.find((j) => puzzle.cages[cageOf[j]].cells.length < 4);
    if (target !== undefined) {
      cageOf[x] = cageOf[target];
    } else if (mates.length) {
      cageOf[x] = Math.max(...cageOf) + 1;
    } else {
      continue;
    }
    // 번호를 다시 매기고 연산을 다시 고른다.
    const remap = new Map();
    for (let i = 0; i < cageOf.length; i++) {
      if (!remap.has(cageOf[i])) remap.set(cageOf[i], remap.size);
      cageOf[i] = remap.get(cageOf[i]);
    }
    return build(n, cageOf, answer, ops, next);
  }
  return null;
}

function make(level, seed) {
  const spec = LEVELS[level];
  const n = spec.size;
  const next = rng(seed);
  const answer = latin(n, next);
  let puzzle = build(n, absorbSingles(n, partition(n, next), next), answer, spec.ops, next);
  const trial = spec.maxTrials > 0;
  for (let round = 0; round <= REPAIRS; round++) {
    const result = S.solve(puzzle, { trial, maxTrials: spec.maxTrials });
    if (result.solved) {
      const singles = puzzle.cages.filter((cage) => cage.cells.length === 1).length;
      if (singles > MAX_SINGLES[n]) return null;
      return { code: R.encode(puzzle), trials: result.trials, answer, rounds: round };
    }
    const stuck = shuffle(result.values.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0), next);
    puzzle = repair(puzzle, answer, stuck, spec.ops, next);
    if (!puzzle) return null;
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

module.exports = { LEVELS, REPAIRS, MAX_SINGLES, rng, latin, partition, absorbSingles, operate, build, repair, make, bake };

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

// 구워 둔 판. 손으로 고치지 않는다 — \`node games/kenken/bake.js\`로 다시 굽는다.
// 판 하나는 칸마다 케이지 번호 글자, \`|\`, 케이지마다 연산과 목표 수를 \`,\`로 이은 것이다.
(function () {

const PUZZLES = {
${body}
};

const api = { PUZZLES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.KenKenPuzzles = api;

})();
`);
}

})();

'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.TangoRules;
const S = (typeof require !== 'undefined') ? require('./solver.js') : window.TangoSolver;

// 판을 만드는 순서는 푸는 순서의 반대다. 다 채워진 판을 먼저 뽑고, 거기서 단서를
// 깎아 낸다. 정답에서 거꾸로 만들기 때문에 풀리지 않는 판이 나올 수 없다.
//
// 남는 문제는 "얼마나 알려 줄 것인가"다. 다 보여 주면 읽기만 하면 끝나므로 **다
// 보여 준 판에서 하나씩 빼 본다** — 빼도 논리로 풀리면 그 단서는 없어도 됐던
// 것이다.

// 줄마다 해와 달이 반씩이라야 하므로 홀수 판은 만들 수 없다.
const SIZES = [6, 8];

const ATTEMPTS = 60;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// 다 채워진 판 하나. 칸을 왼쪽 위부터 차례로 놓되 놓을 때마다 규칙을 보므로,
// 끝까지 가면 그 자체로 규칙을 지키는 판이다.
function fullGrid(size, rng) {
  const n = size * size;
  const half = size / 2;
  const marks = new Uint8Array(n);
  const rowCount = [new Int32Array(size), new Int32Array(size)];
  const colCount = [new Int32Array(size), new Int32Array(size)];

  function walk(cell) {
    if (cell === n) return true;
    const r = Math.floor(cell / size);
    const c = cell % size;
    for (const value of shuffle([R.SUN, R.MOON], rng)) {
      const at = value - 1;
      if (rowCount[at][r] === half || colCount[at][c] === half) continue;
      if (c >= 2 && marks[cell - 1] === value && marks[cell - 2] === value) continue;
      if (r >= 2 && marks[cell - size] === value && marks[cell - size * 2] === value) continue;
      marks[cell] = value;
      rowCount[at][r]++; colCount[at][c]++;
      if (walk(cell + 1)) return true;
      marks[cell] = R.EMPTY;
      rowCount[at][r]--; colCount[at][c]--;
    }
    return false;
  }

  return walk(0) ? Array.from(marks) : null;
}

function neighbours(size) {
  const out = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = r * size + c;
      if (c + 1 < size) out.push([cell, cell + 1]);
      if (r + 1 < size) out.push([cell, cell + size]);
    }
  }
  return out;
}

function build(size, solution, given, links) {
  return {
    size,
    given: given.map((spot) => ({ ...spot })),
    links: links.map((link) => ({ ...link })),
    solution: solution.slice(),
  };
}

function generate(size, options = {}) {
  if (!SIZES.includes(size)) throw new Error(`지원하지 않는 크기: ${size}`);
  const rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const solution = fullGrid(size, rng);
    if (!solution) continue;

    // 다 보여 주는 판에서 시작한다. 모든 칸을 놓고 이웃한 모든 짝을 묶어 둔다.
    let given = solution.map((value, cell) => ({ cell, value }));
    let links = neighbours(size).map(([a, b]) => ({ a, b, same: solution[a] === solution[b] }));

    // **놓인 칸과 묶음을 섞어서 뺀다.** 한쪽을 먼저 시험하면 그쪽이 통째로 사라진다
    // — 묶음을 먼저 빼면 표가 하나도 남지 않아 그냥 이진 퍼즐이 되고(6×6에서 놓인
    // 칸 9.1개, 표 0개), 놓인 칸을 먼저 빼면 놓인 칸이 딱 하나만 남아 어디서
    // 시작할지 보이지 않는다(1개, 표 8.6개). 섞으면 놓인 칸 서넛에 표 예닐곱이
    // 남아 원작과 비슷한 모양이 된다.
    const trials = shuffle([
      ...links.map((link, i) => ['link', i]),
      ...given.map((spot, i) => ['given', i]),
    ], rng);
    const dropped = { link: new Set(), given: new Set() };
    const current = () => build(
      size, solution,
      given.filter((spot, i) => !dropped.given.has(i)),
      links.filter((link, i) => !dropped.link.has(i)));

    for (const [kind, i] of trials) {
      dropped[kind].add(i);
      if (!S.logicSolve(current()).solved) dropped[kind].delete(i);
    }

    given = given.filter((spot, i) => !dropped.given.has(i));
    links = links.filter((link, i) => !dropped.link.has(i));

    const puzzle = build(size, solution, given, links);
    const logic = S.logicSolve(puzzle);
    if (!logic.solved) continue;
    puzzle.order = logic.order;
    return puzzle;
  }
  return null;
}

const Generator = { SIZES, ATTEMPTS, generate, mulberry32, fullGrid, neighbours };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.TangoGenerator = Generator;

})();

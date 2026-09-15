'use strict';

// 판을 만든다. **정답에서 거꾸로 만든다** — 섬을 하나 놓고 거기서 다리를 뻗어 새 섬을
// 세우기를 되풀이하면, 만들어지는 동안 이미 모두 이어져 있고 교차도 없다. 숫자는
// 마지막에 각 섬에 닿은 다리 수를 세어 적기만 하면 된다.
//
// 숫자를 먼저 뿌리고 풀리는지 보는 방식은 대부분 풀 수 없는 판이 나와 버려진다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.HashiRules;
const S = typeof require === 'function' ? require('./solver.js') : window.HashiSolver;

// 칸의 쓰임. 다리가 지나간 칸은 그 방향까지 기억해야 나중에 같은 줄로 다시 뻗을 때
// 겹치는 것을 막을 수 있다.
const EMPTY = 0;
const ISLAND = 1;
const BRIDGE = 2;

const SIZES = {
  9: { w: 9, h: 9, islands: 12 },
  11: { w: 11, h: 11, islands: 18 },
  13: { w: 13, h: 13, islands: 26 },
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

function shuffled(next, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// 섬 사이의 간격. 1이면 다리가 지날 칸이 없고, 너무 멀면 판이 성기게 비어 보인다.
const GAPS = [2, 3, 4];

function grow(next, spec) {
  const { w, h } = spec;
  const cell = new Array(w * h).fill(EMPTY);
  const at = (x, y) => cell[y * w + x];
  const put = (x, y, v) => { cell[y * w + x] = v; };

  const islands = [];
  const bridges = [];

  // 섬을 놓을 수 있는가. 다른 섬과 나란히 붙어 있으면 그 사이에 다리를 그릴 자리가
  // 없어 규칙에서도 짝이 되지 않는다.
  function canPlaceIsland(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h || at(x, y) !== EMPTY) return false;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (at(nx, ny) === ISLAND) return false;
    }
    return true;
  }

  function addIsland(x, y) {
    put(x, y, ISLAND);
    islands.push({ x, y });
    return islands.length - 1;
  }

  addIsland(1 + Math.floor(next() * (w - 2)), 1 + Math.floor(next() * (h - 2)));

  let guard = 0;
  while (islands.length < spec.islands && guard++ < 4000) {
    const from = islands[Math.floor(next() * islands.length)];
    let placed = false;
    for (const [dx, dy] of shuffled(next, DIRS)) {
      for (const gap of shuffled(next, GAPS)) {
        const tx = from.x + dx * (gap + 1);
        const ty = from.y + dy * (gap + 1);
        if (!canPlaceIsland(tx, ty)) continue;
        let clear = true;
        for (let i = 1; i <= gap; i++) {
          if (at(from.x + dx * i, from.y + dy * i) !== EMPTY) { clear = false; break; }
        }
        if (!clear) continue;

        const a = islands.indexOf(from);
        const b = addIsland(tx, ty);
        for (let i = 1; i <= gap; i++) put(from.x + dx * i, from.y + dy * i, BRIDGE);
        bridges.push({ a, b, n: next() < 0.45 ? 2 : 1 });
        placed = true;
        break;
      }
      if (placed) break;
    }
  }

  return { islands, bridges, at };
}

// 이미 놓인 섬끼리 한 줄에 마주 보고 있고 사이가 비어 있으면 다리를 더 놓는다.
// 나무 모양으로만 두면 갈래가 없어 풀이가 한 줄로 흘러 심심하다.
function addLoops(next, spec, grown) {
  const { islands, bridges, at } = grown;
  const linked = new Set(bridges.map((br) => `${Math.min(br.a, br.b)}-${Math.max(br.a, br.b)}`));

  for (const [ai, a] of islands.entries()) {
    for (const [bi, b] of islands.entries()) {
      if (bi <= ai) continue;
      if (a.x !== b.x && a.y !== b.y) continue;
      const key = `${ai}-${bi}`;
      if (linked.has(key)) continue;
      if (next() < 0.55) continue;

      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (steps < 2) continue;
      let clear = true;
      for (let i = 1; i < steps; i++) {
        if (at(a.x + dx * i, a.y + dy * i) !== 0) { clear = false; break; }
      }
      if (!clear) continue;

      bridges.push({ a: ai, b: bi, n: next() < 0.4 ? 2 : 1 });
      linked.add(key);
      // 칸을 막아 뒤에 오는 다리가 이 위를 지나지 못하게 한다.
      for (let i = 1; i < steps; i++) grown.mark(a.x + dx * i, a.y + dy * i);
    }
  }
}

function build(seed, spec) {
  const next = rng(seed);
  const { w, h } = spec;
  const cell = new Array(w * h).fill(EMPTY);
  const grown = grow(next, spec);

  // 위에서 만든 격자를 다시 세워 고리 잇기에 넘긴다(그쪽에서 칸을 더 막는다).
  for (const a of grown.islands) cell[a.y * w + a.x] = ISLAND;
  for (const br of grown.bridges) {
    const a = grown.islands[br.a];
    const b = grown.islands[br.b];
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (let i = 1; i < steps; i++) cell[(a.y + dy * i) * w + (a.x + dx * i)] = BRIDGE;
  }

  addLoops(next, spec, {
    islands: grown.islands,
    bridges: grown.bridges,
    at: (x, y) => cell[y * w + x],
    mark: (x, y) => { cell[y * w + x] = BRIDGE; },
  });

  if (grown.islands.length < spec.islands * 0.8) return null;

  const need = grown.islands.map(() => 0);
  for (const br of grown.bridges) {
    need[br.a] += br.n;
    need[br.b] += br.n;
  }
  if (need.some((n) => n < 1 || n > 8)) return null;

  return {
    w,
    h,
    seed,
    islands: grown.islands.map((a, i) => ({ x: a.x, y: a.y, need: need[i] })),
  };
}

// 씨드를 받아 쓸 만한 판이 나올 때까지 번호를 올린다. 통과 조건은 둘 — 답이 하나뿐,
// 그리고 찍지 않고 논리로만 끝까지 간다.
function generate(seed, size) {
  const spec = SIZES[size] || SIZES[11];
  for (let i = 0; i < 400; i++) {
    const puzzle = build((seed + i * 0x9e3779b9) >>> 0, spec);
    if (!puzzle || !R.wellFormed(puzzle)) continue;
    const b = R.board(puzzle);
    if (S.count(b, 2) !== 1) continue;
    const answer = S.logicSolve(b);
    if (!answer) continue;
    return { puzzle, answer };
  }
  return null;
}

const Generator = { SIZES, rng, build, generate };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.HashiGenerator = Generator;

})();

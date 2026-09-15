'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.IdiomsRules;

// 이 게임에는 "사람 규칙으로 푼다"가 따로 없다. 아는 성어를 격자에서 찾아내는 것이
// 곧 푸는 일이라, 솔버가 하는 일은 하나뿐이다 — **판을 덮는 방법이 몇 가지인가.**
// 생성기가 이걸로 유일해를 가린다.
//
// 격자를 네 칸짜리 길로 남김없이 나누는 문제라 정확 덮개(exact cover)와 같은
// 모양이다. 길 후보를 미리 뽑아 두고 **아직 안 덮인 첫 칸**을 덮는 길만 시도한다 —
// 순서를 고정해야 같은 배치를 여러 번 세지 않는다.

// 격자에서 네 칸짜리 자기회피 길을 모두 뽑는다. 4×4에 232개, 5×5에 456개라
// 미리 뽑아 두고 써도 부담이 없다.
function allPaths(size, walls) {
  const n = size * size;
  const out = [];
  const path = [];
  function walk(cell) {
    path.push(cell);
    if (path.length === R.LENGTH) { out.push(path.slice()); path.pop(); return; }
    for (const next of R.neighbours(size, cell)) {
      if (walls.has(next) || path.includes(next)) continue;
      walk(next);
    }
    path.pop();
  }
  for (let cell = 0; cell < n; cell++) if (!walls.has(cell)) walk(cell);
  return out;
}

// 판을 덮는 방법을 한도까지 센다. `limit: 2`면 "하나뿐인가"만 알면 되므로 둘째를
// 찾는 순간 멈춘다.
function count(puzzle, words, options = {}) {
  const limit = options.limit || 2;
  const budget = options.budget || 400000;
  const b = R.board(puzzle, words);
  const size = b.size;

  // 사전에 있는 길만 남긴다. 여기서 대부분이 걸러져 탐색이 작아진다.
  const byCell = new Map();
  for (const path of allPaths(size, b.walls)) {
    const word = R.wordOf(b, path);
    if (!b.dict.has(word)) continue;
    for (const cell of path) {
      if (!byCell.has(cell)) byCell.set(cell, []);
      byCell.get(cell).push(path);
    }
  }

  const taken = new Uint8Array(b.n);
  const used = new Set();
  const first = [];
  let found = 0;
  let steps = 0;
  let over = false;

  function walk(picked) {
    if (found >= limit) return;
    if (++steps > budget) { over = true; return; }
    let at = -1;
    for (let cell = 0; cell < b.n; cell++) {
      if (!b.walls.has(cell) && !taken[cell]) { at = cell; break; }
    }
    if (at === -1) {
      found++;
      if (found === 1) first.push(...picked.map((entry) => ({ ...entry })));
      return;
    }
    for (const path of (byCell.get(at) || [])) {
      if (path.some((cell) => taken[cell])) continue;
      const word = R.wordOf(b, path);
      if (used.has(word)) continue;
      for (const cell of path) taken[cell] = 1;
      used.add(word);
      picked.push({ word, path });
      walk(picked);
      picked.pop();
      used.delete(word);
      for (const cell of path) taken[cell] = 0;
      if (found >= limit || over) return;
    }
  }

  walk([]);
  return { count: found, over, solution: first };
}

const Solver = { allPaths, count };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.IdiomsSolver = Solver;

})();

'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.IdiomsRules;
const S = (typeof require !== 'undefined') ? require('./solver.js') : window.IdiomsSolver;
const W = (typeof require !== 'undefined') ? require('./words.js') : window.IdiomsWords;

// 판을 만드는 순서는 푸는 순서의 반대다. **성어를 먼저 격자에 눕히고, 남은 칸을
// 벽으로 삼는다.** 벽을 먼저 흩뿌리면 남은 칸이 네 칸짜리 길로 딱 떨어지지 않는
// 모양이 되어 배치가 통째로 막힌다 — 재 보니 5×5에서 열에 한 번도 못 채웠다.
//
// 다 눕힌 뒤에는 **사전 전체로 다시 세어 본다.** 내가 놓은 것 말고 다른 성어들로도
// 같은 격자를 덮을 수 있으면 답이 둘이라 버린다.

const SIZES = [4, 5];

// 크기마다 성어를 몇 개 넣는지. 한 성어가 네 칸이므로 4×4는 벽 없이 딱 맞고,
// 5×5는 다섯 칸이 벽으로 남는다.
const COUNT = { 4: 4, 5: 5 };

const ATTEMPTS = 40;
const STEPS = 60000;

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

// 성어 count개를 격자에 겹치지 않게 눕힌다.
function place(size, count, rng, paths) {
  const n = size * size;
  const cells = new Array(n).fill('');
  const used = new Set();
  const laid = [];
  // 남는 칸이 없으면 **아직 빈 첫 칸을 반드시 덮어야** 한다. 그 칸을 건너뛰고
  // 나아가면 끝에 가서 홀로 남아 되짚기만 길어진다. 남는 칸이 있는 판에서는
  // 첫 칸이 벽이 될 수도 있으므로 이 조임을 걸지 않는다.
  const tight = n === count * R.LENGTH;
  const words = shuffle(W.WORDS.slice(), rng);
  const order = shuffle(paths.slice(), rng);
  let steps = 0;

  function walk(done) {
    if (++steps > STEPS) return false;
    if (done === count) return true;
    let anchor = -1;
    if (tight) {
      for (let cell = 0; cell < n; cell++) if (!cells[cell]) { anchor = cell; break; }
    }
    for (const path of order) {
      if (anchor !== -1 && !path.includes(anchor)) continue;
      if (path.some((cell) => cells[cell])) continue;
      for (const word of words) {
        if (used.has(word)) continue;
        path.forEach((cell, i) => { cells[cell] = word[i]; });
        used.add(word);
        laid.push({ word, path: path.slice() });
        if (walk(done + 1)) return true;
        laid.pop();
        used.delete(word);
        for (const cell of path) cells[cell] = '';
      }
    }
    return false;
  }

  return walk(0) ? { cells, solution: laid } : null;
}

function generate(size, options = {}) {
  if (!SIZES.includes(size)) throw new Error(`지원하지 않는 크기: ${size}`);
  const rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);
  const paths = S.allPaths(size, new Set());

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const laid = place(size, COUNT[size], rng, paths);
    if (!laid) continue;
    const puzzle = { size, cells: laid.cells, solution: laid.solution };
    const seen = S.count(puzzle, W.WORDS, { limit: 2 });
    if (seen.over || seen.count !== 1) continue;
    return puzzle;
  }
  return null;
}

const Generator = { SIZES, COUNT, ATTEMPTS, STEPS, generate, mulberry32, place };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.IdiomsGenerator = Generator;

})();

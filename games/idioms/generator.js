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

const SIZES = [4, 5, 6, 7, 8];

// 크기마다 성어를 몇 개 넣는지. 한 성어가 네 칸이므로 4×4는 벽 없이 딱 맞고,
// 나머지는 남는 칸이 벽이 된다(5×5 다섯, 6×6 여덟, 7×7 열세, 8×8 열여섯 칸).
//
// **칸이 남는 만큼 다 채우지 않는다.** 성어가 많아질수록 벽이 줄고, 벽이 줄수록
// 다른 성어들로도 덮을 수 있는 길이 늘어 유일해가 드물어진다. 배치 자체도 급격히
// 어려워진다. 열다섯~서른 번씩 재 본 값이다.
//   6×6  일곱 개 → 다 배치·판당 1밀리초  / 여덟 개 → 절반만 배치·242밀리초
//   7×7  아홉 개 → 다 배치·판당 1밀리초  / 열한 개 → 다섯에 하나·694밀리초
//   8×8  열두 개 → 다 배치·판당 1밀리초  / 열세 개 → 다 배치되지만 중앙값 1.1초
// 7×7에 열 개, 8×8에 열세 개까지도 되지만 `generate`로 끝까지 재 보면 꼬리가
// 길다 — 7×7 열 개는 열에 하나가 1.6초, 8×8 열세 개는 서른 번 중 열여섯 번이
// 0.5초를 넘겼다(일본어 사전). 지금 값은 서른 번 중 가장 느린 판도 5밀리초다.
const COUNT = { 4: 4, 5: 5, 6: 7, 7: 9, 8: 12 };

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

// 성어 count개를 격자에 겹치지 않게 눕힌다. 쓸 사전은 부르는 쪽이 준다 — 이
// 파일은 어느 언어의 성어인지 알 필요가 없다.
function place(size, count, rng, paths, words) {
  const n = size * size;
  const cells = new Array(n).fill('');
  const used = new Set();
  const laid = [];
  // 남는 칸이 없으면 **아직 빈 첫 칸을 반드시 덮어야** 한다. 그 칸을 건너뛰고
  // 나아가면 끝에 가서 홀로 남아 되짚기만 길어진다. 남는 칸이 있는 판에서는
  // 첫 칸이 벽이 될 수도 있으므로 이 조임을 걸지 않는다.
  const tight = n === count * R.LENGTH;
  const pool = shuffle(words.slice(), rng);
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
      for (const word of pool) {
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
  // 사전은 화면이 고른 언어의 것이다. 안 주면 한국어로 간다 — 테스트와 node에서
  // 부를 때 언어를 매번 적지 않아도 되게 한다.
  const words = options.words || W.pick('ko').WORDS;
  const paths = S.allPaths(size, new Set());

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const laid = place(size, COUNT[size], rng, paths, words);
    if (!laid) continue;
    const puzzle = { size, cells: laid.cells, solution: laid.solution };
    const seen = S.count(puzzle, words, { limit: 2 });
    if (seen.over || seen.count !== 1) continue;
    return puzzle;
  }
  return null;
}

const Generator = { SIZES, COUNT, ATTEMPTS, STEPS, generate, mulberry32, place };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.IdiomsGenerator = Generator;

})();

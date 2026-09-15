'use strict';

// 판 만들기. 작은 판과 보통 판은 손으로 그린 그림에서 가져오고, 큰 판만 무작위로
// 만든다. **어느 쪽이든 논리로만 풀리는 판만 내보낸다** — 찍어야 하는 판이 한 번
// 나오면 그 뒤로는 판을 믿지 못한다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.NonoRules;
const S = typeof require === 'function' ? require('./solver.js') : window.NonoSolver;
const P = typeof require === 'function' ? require('./pictures.js') : window.NonoPictures;

// 무작위 판에서 처음 칠하는 칸의 비율. 다듬기를 거치면 이 값 그대로 남지 않는다.
const DENSITY = 0.52;
// 이웃을 보고 다수 쪽으로 맞추기를 몇 번 하는가. **이것이 없으면 판이 소금 뿌린 듯
// 흩어져 힌트가 `1 1 2 1 1`처럼 길어진다** — 힌트가 길면 그만큼 판 옆자리를 잡아먹어
// 칸이 작아지고, 무엇보다 그림처럼 보이지 않는다. 두 번 돌리면 열다섯 칸 판의 힌트가
// 한 줄에 평균 넷에서 둘로 줄었다.
const SMOOTH = 2;
const SIZES = [5, 10, 15];

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

// 그림이 있는 크기는 그림에서 고른다. 같은 그림이 잇달아 나오지 않게 `skip`을 받는다.
function fromPicture(seed, size, skip) {
  const list = (P.PICTURES[size] || []).filter((pic) => pic.name !== skip);
  if (!list.length) return null;
  const next = rng(seed);
  const order = list.map((pic) => ({ pic, key: next() }))
    .sort((a, b) => a.key - b.key);
  for (const { pic } of order) {
    const puzzle = R.puzzleFrom(P.cellsOf(pic.rows), size, size, pic.name);
    if (S.logicOnly(puzzle)) return puzzle;
  }
  return null;
}

// 자기와 위아래 양옆을 보고 많은 쪽을 따른다. 덩어리가 뭉치고 외톨이 칸이 사라진다.
function smooth(cells, size, passes) {
  let now = cells.slice();
  for (let pass = 0; pass < passes; pass++) {
    const next = now.slice();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let on = 0;
        let all = 0;
        for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          all++;
          on += now[rr * size + cc];
        }
        next[r * size + c] = on * 2 > all ? 1 : 0;
      }
    }
    now = next;
  }
  return now;
}

function randomPuzzle(seed, size) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const next = rng((seed + attempt * 0x9e3779b9) >>> 0);
    const raw = [];
    for (let i = 0; i < size * size; i++) raw.push(next() < DENSITY ? 1 : 0);
    const cells = smooth(raw, size, SMOOTH);
    // 텅 빈 판이나 꽉 찬 판은 풀 것이 없다.
    const filled = cells.filter(Boolean).length;
    if (filled < size * 2 || filled > size * size - size) continue;
    const puzzle = R.puzzleFrom(cells, size, size, '');
    if (S.logicOnly(puzzle)) return puzzle;
  }
  return null;
}

function generate(seed, size, skip) {
  return fromPicture(seed, size, skip) || randomPuzzle(seed, size);
}

const api = { SIZES, DENSITY, SMOOTH, rng, smooth, fromPicture, randomPuzzle, generate };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.NonoGenerator = api;

})();

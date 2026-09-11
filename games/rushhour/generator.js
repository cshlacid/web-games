'use strict';

// 판 고르기. 판은 `puzzles.js`에 미리 구워 두었고(굽는 법은 `bake.js`), 여기서는 하나를
// 골라 차 목록으로 풀어 놓기만 한다.
(function () {

const P = typeof require === 'function' ? require('./puzzles.js') : window.RushPuzzles;

// 차 하나는 네 글자다: 길이 · 방향(h/v) · 줄 · 자리.
function decode(code) {
  return code.split(' ').map((word) => ({
    len: Number(word[0]),
    horizontal: word[1] === 'h',
    line: Number(word[2]),
    pos: Number(word[3]),
  }));
}

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

// 판 하나. 방금 푼 판은 건너뛴다 — 마흔 장뿐이라 같은 판이 잇달아 나오면 새로 받은
// 느낌이 들지 않는다.
function pick(seed, level, skip) {
  const list = P.PUZZLES[level] || P.PUZZLES.easy;
  const next = rng(seed);
  const order = list.map((one, id) => ({ one, id, key: next() }))
    .sort((a, b) => a.key - b.key);
  const found = order.find((entry) => entry.id !== skip) || order[0];
  return {
    id: found.id,
    level,
    cars: decode(found.one[0]),
    moves: found.one[1],
  };
}

const api = { PUZZLES: P.PUZZLES, decode, rng, pick };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RushGenerator = api;

})();

'use strict';

// 판 고르기. 판은 `puzzles.js`에 미리 구워 두었고(굽는 법은 `bake.js`), 여기서는 하나를
// 골라 풀어 놓기만 한다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.SlitherRules;
const P = typeof require === 'function' ? require('./puzzles.js') : window.SlitherPuzzles;

// 판 하나. 방금 푼 판은 건너뛴다 — 예순 장뿐이라 같은 판이 잇달아 나오면 새로 받은
// 느낌이 들지 않는다.
function pick(level, skip, random = Math.random) {
  const set = P.PUZZLES[level] || P.PUZZLES.easy;
  let id = Math.floor(random() * set.list.length);
  if (id === skip && set.list.length > 1) id = (id + 1) % set.list.length;
  return { id, level, ...R.parse(set.size, set.size, set.list[id]) };
}

const api = { PUZZLES: P.PUZZLES, pick };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SlitherGenerator = api;

})();

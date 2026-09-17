'use strict';

// 판 자료. **건물은 부술 수 없으므로 판의 생김새가 곧 문제다** — 어디에 도로를 놓을
// 수 있는지, 어디로는 못 가는지가 전부 여기서 정해진다.
//
// 글자: `.` 빈 땅(도로를 놓을 수 있다), `#` 건물, `H` 집, `W` 직장, `=` 이미 있는 도로.
//
// 이 도시는 십자로 짰다. 큰길이 가로 한 줄과 세로 한 줄뿐이라 **두 흐름이 가운데
// 한 교차로에서 만난다** — 남북 통근과 동서 통근이 서로를 막는다. 흐름이 한 방향만
// 있으면 신호는 손해일 뿐이므로(녹색을 나누면 용량이 준다), 신호가 값을 하려면
// 교차하는 흐름이 있어야 한다.
//
// 가운데를 비껴가는 길은 전부 빈 땅에서 만들어야 한다. 이를테면 D4 옆 D4/F4 한
// 칸씩을 놓으면 교차가 두 곳으로 갈린다 — 이 판에서 가장 싼 수다.
(function (root) {

const CITY = {
  id: 'city',
  w: 9,
  h: 9,
  rows: [
    '...H=H...',
    '..#.=.#..',
    '....=....',
    'H#..=..#W',
    '=========',
    'H#..=..#W',
    '....=....',
    '..#.=.#..',
    '...W=W...',
  ],
  // 집 칸 → 직장 칸. 남북 두 짝과 동서 두 짝이 굵고, 대각으로 엇갈리는 통근이
  // 가늘게 섞인다. 엇갈리는 쪽이 있어야 가운데 교차로에 양쪽 흐름이 다 모인다.
  pairs: [
    { from: [3, 0], to: [3, 8], volume: 15 },
    { from: [5, 0], to: [5, 8], volume: 8 },
    { from: [0, 3], to: [8, 3], volume: 9 },
    { from: [0, 5], to: [8, 5], volume: 5 },
    { from: [3, 0], to: [8, 5], volume: 6 },
    { from: [0, 3], to: [5, 8], volume: 4 },
  ],
};

const KIND = { '.': 'land', '#': 'block', H: 'home', W: 'work', '=': 'road' };

// 글자판을 칸 배열로 편다. 도로는 1차로에 신호 없이 시작한다.
function build(level) {
  const tiles = [];
  for (const row of level.rows) {
    for (const ch of row) {
      const kind = KIND[ch];
      tiles.push({ kind, lanes: kind === 'road' ? 1 : 0, signal: null });
    }
  }
  return { w: level.w, h: level.h, tiles };
}

function demands(level) {
  return level.pairs.map((p, i) => ({
    id: i,
    from: p.from[1] * level.w + p.from[0],
    to: p.to[1] * level.w + p.to[0],
    volume: p.volume,
  }));
}

const api = { CITY, LEVELS: [CITY], build, demands, KIND };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadLevels = api;

})(typeof window !== 'undefined' ? window : globalThis);

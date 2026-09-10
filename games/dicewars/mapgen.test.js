'use strict';

// 실행: node games/dicewars/mapgen.test.js
const M = require('./mapgen.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`);
  }
}

const made = [];
for (const players of [2, 3, 4]) {
  for (let seed = 1; seed <= 20; seed++) made.push({ players, map: M.generate(seed, players) });
}

check('모든 씨드에서 지도가 나온다', made.every((m) => m.map), true);

check('영토 수가 인원의 배수', made.every(({ players, map }) =>
  map.territories.length === M.SETUPS[players].territories
  && map.territories.length % players === 0), true);

check('칸이 남김없이 나뉜다', made.every(({ map }) =>
  map.territories.reduce((n, t) => n + t.cells.length, 0) === map.w * map.h), true);

check('영토마다 칸이 하나 이상', made.every(({ map }) =>
  map.territories.every((t) => t.cells.length > 0)), true);

check('영토는 끊기지 않는다', made.every(({ map }) => {
  const owner = new Array(map.w * map.h).fill(-1);
  map.territories.forEach((t) => t.cells.forEach((c) => { owner[c] = t.id; }));
  return map.territories.every((t) => {
    const seen = new Set([t.cells[0]]);
    const queue = [t.cells[0]];
    while (queue.length) {
      const cell = queue.pop();
      for (const near of map.cells[cell].links) {
        if (owner[near] !== t.id || seen.has(near)) continue;
        seen.add(near);
        queue.push(near);
      }
    }
    return seen.size === t.cells.length;
  });
}), true);

check('이웃 관계는 서로 맞물린다', made.every(({ map }) =>
  map.territories.every((t) => t.neighbors.every((n) =>
    map.territories[n].neighbors.includes(t.id)))), true);

check('외톨이 영토는 없다', made.every(({ map }) =>
  map.territories.every((t) => t.neighbors.length > 0)), true);

check('영토를 고르게 나눈다', made.every(({ players, map }) => {
  const per = new Array(players + 1).fill(0);
  for (const t of map.territories) per[t.owner]++;
  const mine = per.slice(1);
  return Math.max(...mine) === Math.min(...mine);
}), true);

check('주사위도 고르게 나눈다', made.every(({ players, map }) => {
  const per = new Array(players + 1).fill(0);
  for (const t of map.territories) per[t.owner] += t.dice;
  const mine = per.slice(1);
  return Math.max(...mine) - Math.min(...mine) <= 1;
}), true);

check('주사위는 1에서 8 사이', made.every(({ map }) =>
  map.territories.every((t) => t.dice >= 1 && t.dice <= M.MAX_DICE)), true);

check('같은 씨드는 같은 지도',
  JSON.stringify(M.generate(7, 3)), JSON.stringify(M.generate(7, 3)));
check('다른 씨드는 다른 지도',
  JSON.stringify(M.generate(7, 3)) === JSON.stringify(M.generate(8, 3)), false);

// 육각 이웃은 줄마다 어긋난다 — 짝수 줄과 홀수 줄이 서로를 제대로 가리키는지 본다.
{
  const w = 5;
  const h = 5;
  let ok = true;
  for (let r = 0; r < h; r++) {
    for (let q = 0; q < w; q++) {
      for (const near of M.neighborsOf(q, r, w, h)) {
        const nq = near % w;
        const nr = Math.floor(near / w);
        if (!M.neighborsOf(nq, nr, w, h).includes(r * w + q)) ok = false;
      }
    }
  }
  check('칸의 이웃도 서로 맞물린다', ok, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

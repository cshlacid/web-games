'use strict';

// 실행: node games/eufloria/mapgen.test.js
const M = require('./mapgen.js');
const L = require('./logic.js');

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

const SIZES = [9, 12, 15];

// 판 하나가 아니라 여러 판을 본다. 실패가 특정 씨앗에서만 나는 종류라 한 판만 보면
// 통과해 버린다.
const maps = [];
for (const count of SIZES) {
  for (let seed = 1; seed <= 60; seed++) maps.push({ count, map: M.generate(seed, count) });
}

check('모든 씨앗에서 지도가 나온다', maps.every((m) => m.map), true);
check('요청한 수만큼 만든다', maps.every((m) => m.map.asteroids.length === m.count), true);
check('사거리 안에서 다 이어진다', maps.every((m) => M.connected(m.map.asteroids)), true);

check('소행성끼리 겹치지 않는다', maps.every(({ map }) =>
  map.asteroids.every((a) => map.asteroids.every((b) =>
    a.id === b.id || L.dist(a, b) >= M.MIN_GAP))), true);

check('판 안에 들어온다', maps.every(({ map }) =>
  map.asteroids.every((a) => a.x > 0 && a.x < M.W && a.y > 0 && a.y < M.H)), true);

check('시작 자리는 서로 다르다', maps.every((m) => m.map.start.player !== m.map.start.enemy), true);

check('시작 자리는 사거리 밖이다', maps.every(({ map }) =>
  !L.inRange(map.asteroids[map.start.player], map.asteroids[map.start.enemy])), true);

check('양쪽 다 나무 한 그루와 씨앗 열로 시작한다', maps.every(({ map }) => {
  const p = map.asteroids[map.start.player];
  const e = map.asteroids[map.start.enemy];
  return p.owner === 1 && e.owner === 2
    && p.seeds === L.SEEDS_PER_TREE && e.seeds === L.SEEDS_PER_TREE
    && JSON.stringify(p.stats) === JSON.stringify(e.stats);
}), true);

check('같은 씨앗은 같은 지도', JSON.stringify(M.generate(7, 12)), JSON.stringify(M.generate(7, 12)));
check('다른 씨앗은 다른 지도',
  JSON.stringify(M.generate(7, 12)) === JSON.stringify(M.generate(8, 12)), false);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

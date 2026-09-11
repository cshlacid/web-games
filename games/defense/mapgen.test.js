'use strict';

// 실행: node games/defense/mapgen.test.js
const M = require('./mapgen.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

check('판 크기', [M.W, M.H], [8, 11]);

const one = M.build(1);
check('같은 스테이지는 같은 판', M.build(1), one);
check('스테이지가 다르면 판도 다르다', JSON.stringify(M.build(2)) === JSON.stringify(one), false);
check('입구는 맨 윗줄, 출구는 맨 아랫줄', [one.entry.y, one.exit.y], [0, M.H - 1]);

// 스테이지가 아무리 올라가도 규격을 벗어나지 않는가. 무한히 이어지는 게임이라
// 200번째 판도 1번째와 같은 검사를 통과해야 한다.
let bad = 0;
// 성격마다 벽 수가 제 범위 안에 드는가. 범위가 겹치면 판이 안 갈린다.
const seen = {};
for (let s = 1; s <= 400; s++) {
  const m = M.build(s);
  if (!M.wellFormed(m)) bad++;
  const n = m.walls.filter(Boolean).length;
  const box = seen[m.shape] || (seen[m.shape] = { lo: Infinity, hi: 0, n: 0 });
  box.lo = Math.min(box.lo, n);
  box.hi = Math.max(box.hi, n);
  box.n++;
}
check('400판 모두 규격을 지킨다', bad, 0);
check('성격 셋이 모두 나온다', M.SHAPES.map((v) => v.id).filter((id) => seen[id]).length, 3);
check('벽 수가 제 범위 안에 든다',
  M.SHAPES.every((v) => seen[v.id].lo >= v.walls[0] && seen[v.id].hi <= v.walls[1]), true);
// 성격끼리 벽 수가 겹치지 않아야 판을 보고 무엇인지 알 수 있다.
check('들판과 미로는 겹치지 않는다', seen.plain.hi < seen.maze.lo, true);
// 벌판이 가장 흔하다. 극단이 기본값처럼 느껴지면 성격이 없어진다.
check('벌판이 가장 흔하다', seen.rough.n > seen.plain.n && seen.rough.n > seen.maze.n, true);
check('성격은 씨드로 고정이다', [M.build(7).shape, M.build(7).shape], [M.build(7).shape, M.build(7).shape]);
check('성격이 틀리면 틀린 판', M.wellFormed({ ...M.build(1), shape: 'nope' }), false);

check('올바른 판', M.wellFormed(one), true);
check('입구가 벽이면 틀린 판', M.wellFormed({
  ...one, walls: one.walls.map((v, i) => (i === M.idx(one.entry.x, 0) ? 1 : v)),
}), false);
check('입구가 윗줄이 아니면 틀린 판', M.wellFormed({ ...one, entry: { x: 0, y: 1 } }), false);
check('크기가 다르면 틀린 판', M.wellFormed({ ...one, w: 9 }), false);

// 빈 칸이 하나로 이어지는지 보는 검사 자체. 적도 나도 쓸 일 없는 구석이
// 생기지 않는 것이 생성기의 유일한 제약이라, 이 검사가 틀리면 전부 틀린다.
const W = M.W;
const island = new Array(W * M.H).fill(0);
island[M.idx(1, 1)] = 0;
for (const [x, y] of [[0, 1], [1, 0], [2, 1], [1, 2]]) island[M.idx(x, y)] = 1;
check('둘러싸인 빈 칸이 있으면 이어진 판이 아니다', M.whole(island), false);
check('벽이 하나도 없으면 이어진 판', M.whole(new Array(W * M.H).fill(0)), true);

check('씨앗이 같으면 난수도 같다',
  [M.createRng(7)(), M.createRng(7)()].every((v, i, a) => v === a[0]), true);

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);

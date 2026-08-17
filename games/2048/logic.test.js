'use strict';

// 브라우저 없이 규칙만 검증한다. 실행: node games/2048/logic.test.js
const L = require('./logic.js');

let ids = 0;
const grid = (rows) => rows.map((row) => row.map((v) => (v ? { id: ++ids, value: v } : null)));
const values = (g) => g.map((row) => row.map((t) => (t ? t.value : 0)));

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

const row = (rows) => grid([rows, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);

let r = L.move(row([2, 2, 0, 0]), 'left');
check('2,2 -> 4', values(r.grid)[0], [4, 0, 0, 0]);
check('병합 점수', r.gained, 4);

// 한 번의 이동에서 같은 타일이 두 번 합쳐지면 안 된다.
check('2,2,2 왼쪽', values(L.move(row([2, 2, 2, 0]), 'left').grid)[0], [4, 2, 0, 0]);
check('2,2,2 오른쪽', values(L.move(row([0, 2, 2, 2]), 'right').grid)[0], [0, 0, 2, 4]);
check('2,2,2,2 -> 4,4', values(L.move(row([2, 2, 2, 2]), 'left').grid)[0], [4, 4, 0, 0]);
check('4,2,2 -> 4,4', values(L.move(row([4, 2, 2, 0]), 'left').grid)[0], [4, 4, 0, 0]);
check('연쇄 병합 금지', values(L.move(row([2, 2, 4, 0]), 'left').grid)[0], [4, 4, 0, 0]);

r = L.move(row([0, 0, 0, 2]), 'left');
check('이동만 해도 moved', r.moved, true);
check('이동만 하면 점수 없음', r.gained, 0);
check('막힌 줄은 moved=false', L.move(row([2, 4, 8, 16]), 'left').moved, false);

const column = grid([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]]);
check('위로 병합', values(L.move(column, 'up').grid).map((line) => line[0]), [4, 8, 0, 0]);
check('아래로 병합', values(L.move(column, 'down').grid).map((line) => line[0]), [0, 0, 4, 8]);

// 렌더러가 이동 애니메이션을 그리려면 흡수된 타일의 목적지를 알아야 한다.
r = L.move(row([2, 2, 0, 0]), 'left');
check('흡수 타일 1개', r.absorbed.length, 1);
check('흡수 타일 목적지', r.absorbed[0].to, { r: 0, c: 0 });
check('생존 타일 id 유지', r.movements[0].id, r.mergedIds[0]);

const locked = grid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
check('꽉 차고 병합 불가', L.canMove(locked), false);
check('꽉 찼어도 병합 가능', L.canMove(grid([[2, 2, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]])), true);
check('빈 칸이 있으면 이동 가능', L.canMove(grid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]])), true);

check('2048 도달', L.hasWon(row([2048, 0, 0, 0])), true);
check('2048 미도달', L.hasWon(row([1024, 0, 0, 0])), false);

const fresh = L.createGrid();
L.spawn(fresh, 1);
L.spawn(fresh, 2);
const spawned = fresh.flat().filter(Boolean);
check('타일 2개 생성', spawned.length, 2);
check('생성 값은 2 또는 4', spawned.every((t) => t.value === 2 || t.value === 4), true);
check('꽉 찬 격자에는 생성 안 됨', L.spawn(locked, 99), null);

// move가 입력을 바꾸면 렌더러가 이전 상태와 비교할 수 없게 된다.
const original = row([2, 2, 0, 0]);
const before = JSON.stringify(values(original));
L.move(original, 'left');
check('move는 원본을 바꾸지 않는다', JSON.stringify(values(original)), before);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

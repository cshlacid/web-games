'use strict';

// 실행: node games/pips/rules.test.js
const R = require('./rules.js');

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) passed++;
  else { failed++; console.log(`실패: ${name}`); }
}

// 2×3 판, 오른쪽 위는 구멍:  [0 0 .] / [1 # 2]  → 칸 0,1 / 2,3,4
//   구역 0: 합 5(칸 0·1), 구역 1: 같음(칸 2), 구역 2: 2보다 큼(칸 4)
const code = '3x2|00.1#2|0532|5,=,>2';
const p = R.parse(code);
check('칸 수', p.pos.length === 5);
check('구멍', p.index[2] === -1 && p.index[3] === 2);
check('구역', p.regions.length === 3 && p.regions[0].kind === 'sum' && p.regions[0].target === 5
  && p.regions[1].kind === 'eq' && p.regions[2].kind === 'gt' && p.regions[2].target === 2);
check('구역 칸', p.regions[0].cells.join() === '0,1' && p.regions[2].cells.join() === '4');
check('조건 없는 칸', p.regionOf[3] === -1);
check('도미노', p.tiles.length === 2 && p.tiles[0].join() === '0,5' && p.tiles[1].join() === '3,2');
check('이웃', p.adj[0].join() === '1,2' && p.adj[4].join() === '3');
check('다시 적으면 같은 글자', R.encode(p) === code);

check('이웃한 빈 두 칸에 놓을 수 있다', R.fits(p, [null, null], 0, 1));
check('이웃이 아니면 못 놓는다', !R.fits(p, [null, null], 0, 4));
check('덮인 칸에는 못 놓는다', !R.fits(p, [{ a: 0, b: 1 }, null], 1, 3));
check('자기 자리는 비켜 본다', R.fits(p, [{ a: 0, b: 1 }, null], 1, 0, 0));

{
  const placed = [{ a: 0, b: 1 }, null];
  const seen = R.inspect(p, placed);
  check('눈', seen.values[0] === 0 && seen.values[1] === 5 && seen.values[2] === -1);
  check('다 채운 구역은 done', seen.done.includes(0) && !seen.solved);
}
{
  // 칸 2가 비어 다 덮지 못한 판이지만, 판정은 놓인 것만 본다.
  const seen = R.inspect(p, [{ a: 1, b: 0 }, { a: 3, b: 4 }]);
  check('합이 맞으면 뒤집어도 done', seen.done.includes(0));
  check('2보다 크지 않으면 wrong', seen.wrong.includes(2));
}

const region = (kind, target, n) => ({ kind, target, cells: Array.from({ length: n }, (_, k) => k) });
check('같음: 갈리면 바로 wrong', R.regionState(region('eq', 0, 3), Int8Array.from([2, 3, -1])) === 'wrong');
check('같음: 아직 모르면 null', R.regionState(region('eq', 0, 3), Int8Array.from([2, 2, -1])) === null);
check('다름: 겹치면 wrong', R.regionState(region('ne', 0, 3), Int8Array.from([4, 4, -1])) === 'wrong');
check('합: 넘치면 바로 wrong', R.regionState(region('sum', 5, 3), Int8Array.from([4, 2, -1])) === 'wrong');
check('합: 모자라도 다 채우기 전에는 null', R.regionState(region('sum', 9, 3), Int8Array.from([1, 1, -1])) === null);
check('작다: 같으면 wrong', R.regionState(region('lt', 4, 2), Int8Array.from([4, -1])) === 'wrong');
check('크다: 다 채워야 가린다', R.regionState(region('gt', 9, 2), Int8Array.from([1, -1])) === null);
check('크다: 다 채우고 맞으면 done', R.regionState(region('gt', 9, 2), Int8Array.from([5, 6])) === 'done');

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

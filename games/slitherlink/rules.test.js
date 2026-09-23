'use strict';

// 실행: node games/slitherlink/rules.test.js
const R = require('./rules.js');

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

{
  const geo = R.geometry(2, 3);
  check('변 수', geo.edgeCount, 3 * 3 + 2 * 4);
  check('점 수', geo.vertexCount, 12);
  check('칸 (1,2)의 네 변', geo.cellEdges[5], [geo.hid(1, 2), geo.hid(2, 2), geo.vtid(1, 2), geo.vtid(1, 3)]);
  check('가로변의 두 점', geo.edgeVerts[geo.hid(1, 0)], [geo.vid(1, 0), geo.vid(1, 1)]);
  check('세로변의 두 점', geo.edgeVerts[geo.vtid(0, 3)], [geo.vid(0, 3), geo.vid(1, 3)]);
  check('가장자리 변은 칸이 하나', geo.edgeCells[geo.hid(0, 1)], [1]);
  check('안쪽 변은 칸이 둘', geo.edgeCells[geo.vtid(1, 1)], [3, 4]);
  check('모서리 점의 변은 둘', geo.vertexEdges[geo.vid(0, 0)].length, 2);
  check('안쪽 점의 변은 넷', geo.vertexEdges[geo.vid(1, 1)].length, 4);
  check('같은 크기는 같은 표', R.geometry(2, 3) === geo, true);
}

{
  check('판 읽기', Array.from(R.parse(1, 3, '3.0').clues), [3, -1, 0]);
  check('판 적기', R.encode(Int8Array.from([3, -1, 0])), '3.0');
}

// 2×2 판에서 왼쪽 위 칸 하나를 두른 고리.
{
  const geo = R.geometry(2, 2);
  const inside = Uint8Array.from([1, 0, 0, 0]);
  const loop = R.outline(geo, inside);
  check('둘레의 선 수', loop.reduce((s, v) => s + v, 0), 4);
  check('칸마다 선 수', R.clueCounts(geo, loop), [4, 1, 1, 0]);

  const puzzle = R.parse(2, 2, '.1..');
  check('맞는 고리는 풀린 판', R.inspect(puzzle, loop).solved, true);

  const wrong = R.parse(2, 2, '.2..');
  check('숫자가 안 맞으면 안 풀린 판', R.inspect(wrong, loop).solved, false);

  const open = loop.slice();
  open[geo.hid(0, 0)] = R.EMPTY;
  check('끊긴 고리는 안 풀린 판', R.inspect(puzzle, open).solved, false);

  // 두 칸을 따로 두른 고리 둘. 숫자는 맞지만 고리가 하나가 아니다.
  const two = R.outline(R.geometry(1, 3), Uint8Array.from([1, 0, 1]));
  check('고리가 둘이면 안 풀린 판', R.inspect(R.parse(1, 3, '...'), two).solved, false);
  check('덩어리 수', R.components(R.geometry(1, 3), two), 2);
}

{
  // 숫자를 넘치게 그은 칸과 갈림길이 된 점.
  const geo = R.geometry(2, 2);
  const edges = new Uint8Array(geo.edgeCount);
  edges[geo.hid(1, 0)] = R.LINE;
  edges[geo.hid(1, 1)] = R.LINE;
  edges[geo.vtid(0, 1)] = R.LINE;
  const state = R.inspect(R.parse(2, 2, '1...'), edges);
  check('넘친 숫자', state.over, [0]);
  check('갈림길 점', state.branch, [geo.vid(1, 1)]);
  check('X는 선으로 치지 않는다', R.inspect(R.parse(2, 2, '0...'), Uint8Array.from(edges.map(() => R.CROSS))).done, [0]);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

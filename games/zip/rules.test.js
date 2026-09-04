'use strict';

// 실행: node games/zip/rules.test.js
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

// --- 간선 ---
check('간선은 방향을 타지 않는다', R.edgeKey(3, 7), R.edgeKey(7, 3));
check('다른 짝은 다른 간선', R.edgeKey(0, 1) === R.edgeKey(0, 4), false);

// --- 이웃과 벽 ---
const plain = R.board({ size: 3, hints: [0, 8], walls: [] });
check('모서리 칸의 이웃은 둘', plain.links[0].sort(), [1, 3]);
check('가운데 칸의 이웃은 넷', plain.links[4].sort(), [1, 3, 5, 7]);

const walled = R.board({ size: 3, hints: [0, 8], walls: [R.edgeKey(0, 1)] });
check('벽은 양쪽에서 다 막힌다', [walled.links[0], walled.links[1].sort()], [[3], [2, 4]]);

// --- 경로 진행 ---
const b = R.board({ size: 3, hints: [0, 4, 8], walls: [] });
const s = R.reset(b, R.newState());

check('1번 칸이 아니면 시작할 수 없다', R.canPush(b, s, 1), false);
check('1번 칸에서 시작한다', R.push(b, s, 0), true);
check('떨어진 칸으로는 못 간다', R.canPush(b, s, 5), false);
check('지나온 칸은 다시 못 밟는다', R.canPush(b, s, 0), false);

R.push(b, s, 1);
check('순서가 맞는 숫자는 밟는다', R.push(b, s, 4), true);
check('숫자를 밟으면 다음 숫자를 기다린다', s.next, 3);
R.pop(b, s);
check('되돌리면 기다리던 숫자도 되돌아간다', s.next, 2);

// 숫자를 건너뛸 수 없다. 여기서는 3이 가운데(4번 칸), 2가 구석(8번 칸)에 있다.
const skip = R.board({ size: 3, hints: [0, 8, 4], walls: [] });
const t = R.reset(skip, R.newState());
R.push(skip, t, 0);
R.push(skip, t, 1);
check('2번을 밟기 전에는 3번에 들어갈 수 없다', R.canPush(skip, t, 4), false);

// --- 완료 판정 ---
const full = { size: 3, hints: [0, 4, 8], walls: [] };
check('모든 칸을 순서대로 지나면 완성',
  R.validate(full, [0, 1, 2, 5, 4, 3, 6, 7, 8]), { ok: true, done: true, at: 9 });
check('칸이 남으면 완성이 아니다',
  R.validate(full, [0, 1, 2, 5, 4]), { ok: true, done: false, at: 5 });
check('규칙을 어기면 어디서 어긋났는지 알려준다',
  R.validate(full, [0, 1, 2, 5, 8]), { ok: false, done: false, at: 4 });

// 마지막 숫자가 경로 끝일 필요는 없다 — 규칙은 "순서대로 밟고 전부 채운다"까지다.
const midEnd = { size: 3, hints: [0, 4], walls: [] };
check('마지막 숫자를 지나 계속 그려도 완성이다',
  R.validate(midEnd, [0, 1, 2, 5, 4, 3, 6, 7, 8]).done, true);

// --- 벽이 있는 판 ---
const blocked = { size: 3, hints: [0, 8], walls: [R.edgeKey(1, 2)] };
check('벽을 넘는 경로는 거절된다', R.validate(blocked, [0, 1, 2]).ok, false);
check('벽을 돌아가는 경로는 통과한다',
  R.validate(blocked, [0, 3, 6, 7, 4, 1]).ok, true);

// --- 판 모양 ---
check('숫자가 하나뿐인 판은 판이 아니다', R.wellFormed({ size: 3, hints: [0], walls: [] }), false);
check('같은 칸에 숫자가 둘일 수 없다', R.wellFormed({ size: 3, hints: [0, 0], walls: [] }), false);
check('격자 밖 칸은 숫자가 될 수 없다', R.wellFormed({ size: 3, hints: [0, 9], walls: [] }), false);

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

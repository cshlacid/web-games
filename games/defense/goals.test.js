'use strict';

// 실행: node games/defense/goals.test.js
const G = require('./goals.js');

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

const one = G.goalOf(1);
check('같은 스테이지는 같은 목표', G.goalOf(1), one);
check('목표에는 이름과 설명이 있다', [typeof one.name, typeof one.note], ['string', 'string']);

// 스테이지가 아무리 올라가도 목표가 만들어지는가, 그리고 한쪽으로 쏠리지 않는가.
const seen = {};
for (let s = 1; s <= 400; s++) {
  const g = G.goalOf(s);
  if (!G.byId(g.id)) { failed++; console.log('실패: 없는 목표', g.id); }
  seen[g.id] = (seen[g.id] || 0) + 1;
}
check('모든 목표가 나온다', Object.keys(seen).length, G.GOALS.length);
check('한 목표가 절반을 넘지 않는다', Math.max(...Object.values(seen)) < 200, true);

const stats = (over) => Object.assign({
  livesLost: 0, time: 100, placed: 3, kinds: { archer: 2 }, upgrades: 0,
  goldLeft: 300, bossFrom: 100, bossAt: 110,
}, over || {});

const at = (id, arg) => ({ id, arg });
check('무결점 — 잃지 않으면 통과', G.met(at('flawless'), stats()), true);
check('무결점 — 하나라도 잃으면 실패', G.met(at('flawless'), stats({ livesLost: 1 })), false);
check('속공 — 시간 안이면 통과', G.met(at('swift', 150), stats({ time: 149 })), true);
check('속공 — 넘기면 실패', G.met(at('swift', 150), stats({ time: 151 })), false);
check('검소 — 인원 이하면 통과', G.met(at('thrifty', 4), stats({ placed: 4 })), true);
check('검소 — 넘기면 실패', G.met(at('thrifty', 4), stats({ placed: 5 })), false);
check('한 우물 — 한 종류면 통과', G.met(at('purist'), stats()), true);
check('한 우물 — 둘이면 실패', G.met(at('purist'), stats({ kinds: { archer: 1, spear: 1 } })), false);
check('알뜰 — 남기면 통과', G.met(at('saver', 200), stats()), true);
check('알뜰 — 모자라면 실패', G.met(at('saver', 400), stats()), false);
check('맨손 — 안 올리면 통과', G.met(at('barehand'), stats()), true);
check('맨손 — 올리면 실패', G.met(at('barehand'), stats({ upgrades: 1 })), false);
check('참수 — 빨리 잡으면 통과', G.met(at('behead', 16), stats()), true);
check('참수 — 늦으면 실패', G.met(at('behead', 16), stats({ bossAt: 130 })), false);
check('참수 — 못 잡았으면 실패', G.met(at('behead', 16), stats({ bossAt: null })), false);

check('없는 목표는 통과하지 않는다', G.met({ id: 'nope' }, stats()), false);
check('통계가 없으면 통과하지 않는다', G.met(at('flawless'), null), false);

check('어려운 목표는 카드가 한 장 더', G.bonusOf({ hard: true }).cards > G.bonusOf({ hard: false }).cards, true);

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);

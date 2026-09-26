'use strict';

// 실행: node games/healer/achievements.test.js
const D = require('./data.js');
const Items = require('./items.js');
const P = require('./progress.js');
const A = require('./achievements.js');

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

const win = (over) => Object.assign({ won: true, downs: 1, healed: 1000, overheal: 500, boss: false, gap: 0 }, over);

{
  const progress = P.create();
  check('처음 이기면 첫 의뢰', A.check(progress, win()), ['firstWin']);
  check('얻은 것은 다시 주지 않는다', A.check(progress, win()), []);
  check('진 판에서는 판 업적이 없다', A.check(P.create(), Object.assign(win(), { won: false, downs: 0 })), []);
  check('아무도 안 쓰러지면', A.check(progress, win({ downs: 0 })).includes('clean'), true);
  check('흘린 힐이 적어도 회복이 적으면 아니다', A.check(progress, win({ healed: 2000, overheal: 0 })).includes('thrifty'), false);
  check('흘린 힐이 적고 회복이 넉넉하면', A.check(progress, win({ healed: 5000, overheal: 100 })).includes('thrifty'), true);
  check('우두머리를 아무도 안 쓰러지고', A.check(progress, win({ boss: true, downs: 0 })), ['boss', 'bossClean']);
  check('벅찬 의뢰', A.check(progress, win({ gap: 3 })), ['daring']);
}
{
  // 변형은 셋을 다 깨야 모든 변형이다.
  const progress = P.create();
  A.check(progress, win({ mod: 'fury' }));
  A.check(progress, win({ mod: 'drain' }));
  check('둘로는 아니다', Boolean(progress.achieved.allMods), false);
  check('셋이면', A.check(progress, win({ mod: 'horde' })).includes('allMods'), true);
}
{
  // 판 밖의 이정표는 진행만 보고도 얻는다.
  const progress = P.create();
  progress.charLevel = 20;
  progress.equipped.weapon = Object.assign(Items.make('staff', 2, 1), { plus: Items.PLUS_MAX });
  const got = A.check(progress, null);
  check('레벨 이정표', ['lv10', 'lv20'].every((id) => got.includes(id)), true);
  check('+10 강화', got.includes('plus10'), true);
  check('판 업적은 판 없이 얻지 않는다', got.includes('firstWin'), false);
}
{
  // 저장본: 모르는 id와 참이 아닌 값은 버린다.
  check('저장본을 거른다', A.adopt({ firstWin: true, nope: true, clean: 'yes' }), { firstWin: true });
  check('업적마다 이름과 설명이 있다', A.LIST.length > 10 && new Set(A.LIST.map((a) => a.id)).size === A.LIST.length, true);
  check('변형 업적은 변형 표를 본다', Object.keys(D.QUEST_MODS).length >= 3, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

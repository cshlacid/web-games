'use strict';

// 실행: node games/archmage/meta.test.js
const M = require('./meta.js');

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

check('처음은 1서클', M.fresh().circle, 1);
check('깨진 저장본은 처음으로', M.parse('{oops').circle, 1);
check('서클은 범위 안으로', M.parse('{"circle":42}').circle, 9);

check('처음은 첫 번째 밤', M.fresh().night, 1);
check('서클에 묶인 옛 저장본은 첫 번째 밤부터', M.parse('{"v":1,"circle":3,"cleared":{"1":true}}').night, 1);

{
  const save = M.fresh();
  const lost = { circle: 1, night: 1, boss: false, won: false, t: 100, kills: 240, formed: ['fire1', 'fire1-wind1'] };
  const r = M.settle(save, lost);
  check('져도 마나를 번다', r.gained > 0, true);
  check('새 마법이 기록된다', r.found, ['fire1', 'fire1-wind1']);
  check('회차가 는다', save.runs, 1);
  check('지면 다음 밤이 열리지 않는다', save.night, 1);
  const again = M.settle(save, lost);
  check('이미 기록한 마법은 다시 세지 않는다', again.found, []);
  const won = M.settle(save, { circle: 1, night: 1, boss: false, won: true, t: 180, kills: 500, formed: [] });
  check('넘기면 다음 밤이 열린다', [won.opened, save.night], [true, 2]);
  M.settle(save, { circle: 1, night: 1, boss: false, won: true, t: 180, kills: 500, formed: [] });
  check('지난 밤을 다시 넘겨도 더 열리지 않는다', save.night, 2);
  save.mana = 1000;
  check('보스를 잡지 않으면 돌파할 수 없다', M.breakCheck(save).why, 'boss');
  M.settle(save, { circle: 1, night: 5, boss: true, won: true, t: 250, kills: 900, formed: [] });
  check('보스의 밤을 넘기면 보스를 센다', M.bossCount(save), 1);
  check('보스를 넘긴 밤 다음이 열린다', save.night, 6);
  save.mana = 10;
  check('마나가 모자라면 돌파할 수 없다', M.breakCheck(save).why, 'mana');
  save.mana = 100;
  check('돌파', M.breakthrough(save), true);
  check('서클이 오른다', save.circle, 2);
  check('마나를 낸다', save.mana, 100 - M.BREAK_COST[1]);
  check('최고 기록은 밤마다', save.best[5], 250);
  save.mana = 1e6;
  check('2서클 돌파에는 보스 둘', M.breakCheck(save).why, 'boss');
}

{
  const save = M.fresh();
  save.grimoire = { fire1: { run: 1 }, 'fire1-wind1': { run: 1 }, fire3: { run: 2 } };
  check('마도서는 그 서클까지에서 센다', M.grimoireCount(save, 2), { found: 2, total: 14, specialFound: 1, special: 10 });
  check('서클이 오르면 분모가 는다', M.grimoireCount(save, 3), { found: 3, total: 34, specialFound: 2, special: 18 });
}

{
  const save = M.fresh();
  save.circle = 9;
  save.mana = 1e6;
  check('9서클이 끝', M.breakCheck(save).why, 'max');
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

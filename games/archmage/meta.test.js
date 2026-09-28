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

{
  const save = M.fresh();
  const lost = { circle: 1, won: false, t: 180, kills: 240, formed: ['fire1', 'fire1-wind1'] };
  const r = M.settle(save, lost);
  check('져도 마나를 번다', r.gained > 0, true);
  check('새 마법이 기록된다', r.found, ['fire1', 'fire1-wind1']);
  check('회차가 는다', save.runs, 1);
  const again = M.settle(save, lost);
  check('이미 기록한 마법은 다시 세지 않는다', again.found, []);
  check('이기지 않으면 돌파할 수 없다', M.breakCheck(save).why, 'clear');
  M.settle(save, { circle: 1, won: true, t: 320, kills: 500, formed: [] });
  check('이기면 그 서클의 밤을 넘긴 것', save.cleared[1], true);
  save.mana = 10;
  check('마나가 모자라면 돌파할 수 없다', M.breakCheck(save).why, 'mana');
  save.mana = 100;
  check('돌파', M.breakthrough(save), true);
  check('서클이 오른다', save.circle, 2);
  check('마나를 낸다', save.mana, 100 - M.BREAK_COST[1]);
  check('최고 기록', save.best[1], 320);
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
  save.cleared[9] = true;
  save.mana = 1e6;
  check('9서클이 끝', M.breakCheck(save).why, 'max');
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

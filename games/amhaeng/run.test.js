'use strict';

// 실행: node games/amhaeng/run.test.js
const R = require('./run.js');
const D = require('./data.js');

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) passed++;
  else { failed++; console.log(`실패: ${name}`); }
}

const won = (hp) => ({ over: 'win', hero: { hp } });

{
  const run = R.create(7);
  check('처음 패', run.tiles.map((t) => t.id).join() === D.START_TILES.join());
  const spec = R.enter(run);
  check('첫 자리는 싸움', spec && run.phase === 'fight' && spec.waves === D.REGIONS[0].nodes[0].waves);
  R.finishFight(run, won(5));
  check('이기면 엽전과 쉼', run.coins === D.PAY.fight && run.hp === 5 + D.REST && run.node === 1 && run.phase === 'map');
}
{
  const run = R.create(7);
  R.enter(run);
  R.finishFight(run, { over: 'lose', hero: { hp: 0 } });
  check('지면 끝', run.phase === 'over');
}
{
  // 주막.
  const run = R.create(3);
  run.node = 2;
  R.enter(run);
  check('주막에 새 패 둘', run.phase === 'inn' && run.offers.length === 2);
  run.coins = 20;
  run.hp = 3;
  check('국밥', R.buy(run, 'soup') && run.hp === 3 + D.INN.soup.heal && run.coins === 20 - D.INN.soup.cost);
  check('대장간', R.buy(run, 'forge', 0) && run.tiles[0].lv === 1);
  const id = run.offers[0];
  check('새 패', R.buy(run, 'tile', id) && run.tiles.some((t) => t.id === id) && !run.offers.includes(id));
  check('돈이 모자라면 못 산다', !(run.coins < D.INN.tonic.cost) || !R.buy(run, 'tonic'));
  R.leaveInn(run);
  check('떠나면 다음 자리', run.node === 3 && run.phase === 'map');
}
{
  // 우두머리 뒤 보상, 고을 넘어가기.
  const run = R.create(5);
  run.node = 4;
  R.enter(run);
  R.finishFight(run, won(4));
  check('첫 우두머리 뒤에는 고르기', run.phase === 'reward' && run.offers.length === 3);
  check('마패가 나올 수 있다', run.offers.every((id) => D.TILES[id]));
  R.takeReward(run, run.offers[0]);
  check('다음 고을로', run.region === 1 && run.node === 0 && run.tiles.length === 3);
}
{
  // 마지막 우두머리를 넘기면 끝.
  const run = R.create(5);
  run.region = 2;
  run.node = 4;
  R.enter(run);
  R.finishFight(run, won(4));
  check('여정을 마친다', run.phase === 'won');
}
{
  // 서낭당.
  const run = R.create(9);
  run.region = 1;
  run.node = 1;
  R.enter(run);
  check('복 셋', run.phase === 'shrine' && run.offers.length === 3);
  const id = run.offers[1];
  check('복 받기', R.takeBlessing(run, id) && run.blessings.includes(id) && run.node === 2);
}
{
  // 같은 씨앗이면 같은 물건.
  const a = R.create(11); a.node = 2; R.enter(a);
  const b = R.create(11); b.node = 2; R.enter(b);
  check('씨앗이 같으면 같은 물건', a.offers.join() === b.offers.join());
}
{
  // 저장본 읽기: 이상한 값은 버린다. 싸움 도중이면 지도로.
  const run = R.adopt({ rng: 4, region: 1, node: 2, hp: 99, maxHp: 9, coins: -3, tiles: [{ id: 'sword', lv: 7 }, { id: 'nope' }, { id: 'sword' }], blessings: ['robe', 'robe', 'x'], phase: 'fight' });
  check('저장본 고르기', run.hp === 9 && run.coins === 0 && run.tiles.length === 1 && run.tiles[0].lv === 2
    && run.blessings.join() === 'robe' && run.phase === 'map');
  check('망가진 저장본', R.adopt(null) === null && R.adopt({ region: 9 }) === null);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

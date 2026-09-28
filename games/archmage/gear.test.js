'use strict';

// 실행: node games/archmage/gear.test.js
const G = require('./gear.js');
const M = require('./meta.js');
const { rng } = require('./sim.js');

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

// --- 능력과 강화 ---
{
  const staff = { slot: 'staff', rarity: 2, level: 1, el: 'fire' };
  check('등급 1레벨 값', G.statValue(staff), 0.22);
  check('레벨마다 10%씩', +G.statValue(Object.assign({}, staff, { level: 11 })).toFixed(3), 0.44);
  check('지팡이 원소', G.elementValue(staff), 0.15);
  check('등급마다 최대 레벨', G.MAX_LEVEL, [10, 20, 30, 40, 50]);
  check('최대 레벨이면 못 올린다', G.canUpgrade({ slot: 'ring', rarity: 0, level: 10 }), false);
  check('강화 비용은 레벨이 오를수록 는다', G.upgradeCost({ rarity: 0, level: 5 }) > G.upgradeCost({ rarity: 0, level: 1 }), true);
}

// --- 가방·장착·강화·판매 ---
{
  const save = M.fresh();
  const a = G.give(save, { slot: 'robe', rarity: 1, level: 1 });
  check('받으면 번호가 붙는다', a.uid, 1);
  check('끼운다', G.equip(save, a.uid), true);
  check('낀 것의 능력을 모은다', G.loadout(save).hp, 35);
  save.gold = 0;
  check('금화가 모자라면 못 올린다', G.upgrade(save, a.uid), false);
  save.gold = 1000;
  check('올린다', [G.upgrade(save, a.uid), a.level], [true, 2]);
  check('낀 것은 못 판다', G.sell(save, a.uid), 0);
  G.unequip(save, 'robe');
  const gold = save.gold;
  const price = G.sell(save, a.uid);
  check('팔면 금화가 는다', [price > 0, save.gold === gold + price, save.items.length], [true, true, 0]);
}

// --- 합성 ---
{
  const save = M.fresh();
  const a = G.give(save, { slot: 'ring', rarity: 0, level: 4 });
  G.give(save, { slot: 'ring', rarity: 0, level: 1 });
  G.give(save, { slot: 'ring', rarity: 0, level: 2 });
  G.give(save, { slot: 'ring', rarity: 0, level: 1 });
  G.give(save, { slot: 'boots', rarity: 0, level: 1 });
  G.equip(save, a.uid);
  const made = G.mergeAll(save);
  check('같은 부위·등급 셋이 하나로', made.map((it) => [it.slot, it.rarity]), [['ring', 1]]);
  check('레벨은 가장 높은 것을 잇는다', made[0].level, 4);
  check('끼고 있던 것이 섞이면 결과를 다시 끼운다', save.equipped.ring, made[0].uid);
  check('남는 것은 가방에', save.items.length, 3);
}
{
  const save = M.fresh();
  for (let i = 0; i < 9; i++) G.give(save, { slot: 'belt', rarity: 0, level: 1 });
  const made = G.mergeAll(save);
  check('아홉이면 두 번 올라 희귀 하나', save.items.map((it) => it.rarity), [2]);
  check('합성한 수', made.length, 4);
}

// --- 상자와 전리품 ---
{
  const save = M.fresh();
  const r = rng(5);
  check('금화가 모자라면 상자를 못 연다', G.openChest(save, 'basic', r), null);
  save.gold = 1000;
  const item = G.openChest(save, 'fine', r);
  check('고급 상자는 고급 이상', item.rarity >= 1 && save.gold === 400, true);
  let staffs = 0, withEl = 0;
  for (let i = 0; i < 200; i++) { const it = G.roll(r, [1, 0, 0, 0, 0]); if (it.slot === 'staff') { staffs++; if (it.el) withEl++; } }
  check('지팡이에는 원소가 붙는다', staffs > 0 && staffs === withEl, true);
}
{
  const save = M.fresh();
  const res = M.settle(save, { circle: 1, night: 5, boss: true, won: true, t: 250, kills: 900, formed: [] }, rng(3));
  check('보스의 밤을 넘기면 장비가 나온다', res.drops.length, 1);
  check('금화도 번다', res.gold > 0 && save.gold === res.gold, true);
  const lost = M.settle(save, { circle: 1, night: 6, boss: false, won: false, t: 60, kills: 100, formed: [] }, rng(4));
  check('지면 장비는 없다', lost.drops.length, 0);
}
{
  const saved = JSON.stringify(Object.assign(M.fresh(), { gold: 55, items: [{ uid: 3, slot: 'amulet', rarity: 4, level: 7 }, { slot: 'nope' }], equipped: { amulet: 3 }, nextUid: 4 }));
  const back = M.parse(saved);
  check('저장본에서 장비를 되살리고 이상한 것은 버린다', [back.gold, back.items.length, back.equipped.amulet], [55, 1, 3]);
}
{
  const save = M.fresh();
  G.equip(save, G.give(save, { slot: 'ring', rarity: 4, level: 50 }).uid);
  check('쿨타임 감소는 절반까지', G.loadout(save).cd, 0.5);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

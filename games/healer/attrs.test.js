'use strict';

// 실행: node games/healer/attrs.test.js
// 능력치 넷과 거기서 나오는 수치. 체력·마나·공격력·회복량·회피가 전부 여기서
// 나오므로, 이 파일이 깨지면 전투의 모든 숫자가 함께 흔들린다.
const D = require('./data.js');
const P = require('./progress.js');

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

const everyDef = () => [D.HERO, ...Object.values(D.COMPANIONS), ...Object.values(D.ENEMIES)];

// --- 모든 캐릭터가 능력치를 갖는다 --------------------------------------
{
  const missing = everyDef().filter((def) => {
    const attrs = def.attrs || {};
    return Object.keys(D.ATTRS).some((key) => !(attrs[key] > 0));
  }).map((def) => def.name);
  check('빠짐없이 네 능력치를 갖는다', missing, []);

  // 정의에 적힌 체력·마나는 능력치에서 나온 값과 같아야 한다. 어긋나면 화면과
  // 전투가 다른 숫자를 본다.
  const off = [];
  for (const def of everyDef()) {
    const derived = D.derive(def, D.attrsAt(def, 1, null));
    if (Math.abs(derived.hp - def.hp) > 1) off.push(`${def.name} 체력 ${derived.hp}≠${def.hp}`);
    if (Math.abs(derived.mp - def.mp) > 1) off.push(`${def.name} 마나 ${derived.mp}≠${def.mp}`);
    if (Math.abs(derived.atk - def.atk) > 0.01) off.push(`${def.name} 공격 ${derived.atk}≠${def.atk}`);
  }
  check('레벨 1에서는 정의값과 같다', off, []);
}

// --- 무엇이 무엇을 올리는가 ---------------------------------------------
{
  const base = { str: 20, agi: 10, int: 20, vit: 50 };
  const def = { id: 'x', name: '시험', atk: 40, attrs: base };
  const at = (over) => D.derive(def, Object.assign({}, base, over));

  // 체력 → 최대 체력
  check('체력이 최대 체력을 정한다', at({}).hp, 50 * D.ATTR.hpPerVit);
  check('체력이 오르면 최대 체력도', at({ vit: 100 }).hp > at({}).hp, true);
  check('다른 능력치는 최대 체력을 건드리지 않는다',
    [at({ str: 99 }).hp, at({ agi: 99 }).hp, at({ int: 99 }).hp], [at({}).hp, at({}).hp, at({}).hp]);

  // 지능 → 최대 마나
  check('지능이 최대 마나를 정한다', at({}).mp, 20 * D.ATTR.mpPerInt);
  check('지능이 오르면 최대 마나도', at({ int: 40 }).mp, 40 * D.ATTR.mpPerInt);

  // 힘 → 물리 공격력
  check('힘이 두 배면 공격력도 두 배', at({ str: 40 }).atk, 80);
  check('힘은 회복량을 올리지 않는다', at({ str: 99 }).heal, at({}).heal);

  // 지능 → 회복량. 다만 공격력만큼 가파르지는 않다.
  check('지능이 회복량을 올린다', at({ int: 40 }).heal > at({}).heal, true);
  check('회복량은 지능 비율의 일부만 받는다',
    at({ int: 40 }).heal, 1 + (2 - 1) * D.ATTR.healRatio);
  check('주문 피해는 회복량보다 덜 오른다',
    at({ int: 40 }).spell < at({ int: 40 }).heal, true);

  // 민첩 → 회피
  check('민첩이 회피를 정한다', at({}).dodge, 10 * D.ATTR.dodgePerAgi);
  check('민첩이 오르면 회피도', at({ agi: 40 }).dodge > at({}).dodge, true);
  // 상한이 없으면 높은 레벨에서 서로 못 맞히는 전투가 된다.
  check('회피에는 상한이 있다', at({ agi: 100000 }).dodge, D.ATTR.dodgeCap);

  // 마법을 쓰는 쪽은 지능이 공격력을 올린다.
  const caster = { id: 'y', name: '시전자', atk: 40, attrs: base, attackType: 'magic' };
  check('시전자는 지능이 공격력을 올린다',
    D.derive(caster, Object.assign({}, base, { int: 40 })).atk, 80);
  check('시전자는 힘이 공격력을 올리지 않는다',
    D.derive(caster, Object.assign({}, base, { str: 99 })).atk, 40);
}

// --- 레벨이 오르면 능력치가 오른다 --------------------------------------
{
  for (const def of everyDef()) {
    const low = D.attrsAt(def, 1, null);
    const high = D.attrsAt(def, 12, null);
    const stuck = Object.keys(D.ATTRS).filter((key) => high[key] <= low[key]);
    check(`${def.name}: 레벨이 오르면 능력치도 오른다`, stuck, []);
  }

  // 적은 아군보다 가파르게 자란다. 빠뜨리면 높은 레벨 의뢰가 저절로 쉬워진다.
  const scout = D.ENEMIES.scout;
  const lyle = D.COMPANIONS.lyle;
  const grow = (def, key) => D.attrsAt(def, 11, null)[key] / D.attrsAt(def, 1, null)[key];
  check('적의 체력이 더 가파르다', grow(scout, 'vit') > grow(lyle, 'vit'), true);
  check('적의 힘도 더 가파르다', grow(scout, 'str') > grow(lyle, 'str'), true);

  // 적 정의에 growth를 빠뜨리면 아군 성장률이 적용된다.
  const wrong = Object.values(D.ENEMIES).filter((def) => def.growth !== 'enemy').map((def) => def.name);
  check('적은 적 성장률을 쓴다', wrong, []);
  check('주인공은 주인공 성장률을 쓴다', D.HERO.growth, 'hero');
}

// --- 나눠 주는 점수 -----------------------------------------------------
{
  const progress = P.create();
  check('1레벨에는 점수가 없다', P.freePoints(progress), 0);
  check('넣을 것이 없으면 못 넣는다', P.spendPoint(progress, 'vit').ok, false);

  progress.charLevel = 5;
  check('레벨마다 받는다', P.freePoints(progress), 4 * D.ATTR.pointsPerLevel);

  const before = P.stats(progress);
  check('넣는다', P.spendPoint(progress, 'vit').ok, true);
  check('남은 점수가 준다', P.freePoints(progress), 4 * D.ATTR.pointsPerLevel - 1);
  check('최대 체력이 오른다', P.stats(progress).hp - before.hp, D.ATTR.hpPerVit);

  P.spendPoint(progress, 'int');
  check('지능은 마나와 회복량을 함께 올린다',
    [P.stats(progress).mp > before.mp, P.stats(progress).heal > before.heal], [true, true]);

  check('없는 능력치에는 못 넣는다', P.spendPoint(progress, '운').ok, false);

  // 다 쓰면 더 못 넣는다.
  while (P.freePoints(progress) > 0) P.spendPoint(progress, 'str');
  check('다 쓰면 그만', P.spendPoint(progress, 'str').ok, false);
  check('쓴 점수의 합이 받은 만큼', P.spentPoints(progress), P.earnedPoints(progress));

  // 레벨이 오르면 그만큼 더 받는다.
  progress.charLevel = 6;
  check('레벨이 오르면 더 받는다', P.freePoints(progress), D.ATTR.pointsPerLevel);
}

// --- 저장본을 손대도 늘지 않는다 ----------------------------------------
{
  global.localStorage = {
    data: null,
    getItem() { return this.data; },
    setItem(key, value) { this.data = value; },
    removeItem() { this.data = null; },
  };

  const cheat = P.create();
  cheat.charLevel = 3;                                  // 받은 점수는 6
  cheat.spent = { str: 500, agi: 500, int: 500, vit: 500 };
  P.save(cheat);

  const loaded = P.load();
  check('받은 것보다 많이 쓸 수 없다', P.spentPoints(loaded), P.earnedPoints(loaded));
  check('남은 점수는 0', P.freePoints(loaded), 0);

  // 음수로 적어 두면 점수가 늘어난다.
  const minus = P.create();
  minus.charLevel = 3;
  minus.spent = { str: -100, agi: 0, int: 0, vit: 0 };
  P.save(minus);
  check('음수는 0으로 본다', P.load().spent.str, 0);

  delete global.localStorage;
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

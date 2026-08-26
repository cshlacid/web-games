'use strict';

// 실행: node games/healer/shop.test.js
// 상점. 진열대는 씨앗에서 만들고 씨앗만 저장한다 — 만들어진 목록을 저장하면
// 자료를 고칠 때마다 저장본과 어긋난다(의뢰 게시판과 같은 이유).
const D = require('./data.js');
const Items = require('./items.js');
const Shop = require('./shop.js');
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

const SEEDS = [1, 9, 88, 777, 20260825];
const LEVELS = [1, 4, 9, 16, 25, 30];

// --- 진열대 -------------------------------------------------------------
{
  const stock = Shop.stock(5, 42);
  check('정해진 수만큼 진열한다', stock.gear.length, Shop.GEAR_COUNT);
  check('물약도 판다', stock.potions.length, Object.keys(D.POTIONS).length);
  check('같은 씨앗이면 같은 진열대',
    Shop.stock(5, 42).gear.map((i) => Items.name(i)), stock.gear.map((i) => Items.name(i)));
  check('씨앗이 다르면 달라진다',
    Shop.stock(5, 43).gear.map((i) => Items.name(i)).join() === stock.gear.map((i) => Items.name(i)).join(),
    false);

  // 같은 물건이 두 자리를 차지하면 진열대가 실제로는 네 칸이 된다.
  const dupes = [];
  for (const seed of SEEDS) {
    for (const level of LEVELS) {
      const ids = Shop.stock(level, seed).gear.map((item) => item.defId);
      if (new Set(ids).size !== ids.length) dupes.push(`${level}/${seed}`);
    }
  }
  check('같은 물건을 두 번 놓지 않는다', dupes, []);

  // 힐러가 쓸 물건이 하나도 없는 상점이면 들를 이유가 없다.
  const barren = [];
  for (const seed of SEEDS) {
    for (const level of LEVELS) {
      const healerGear = Shop.stock(level, seed).gear
        .filter((item) => D.GEAR[item.defId].job === 'healer');
      if (healerGear.length < 2) barren.push(`${level}/${seed}: ${healerGear.length}`);
    }
  }
  check('힐러 물건이 최소 둘은 있다', barren, []);

  check('전부 장비다',
    Shop.stock(9, 3).gear.every((item) => Items.isGear(item)), true);
}

// --- 등급은 레벨을 따라간다 ---------------------------------------------
{
  // 1레벨에게 전설을 팔면 골드를 모을 이유만 남고 의뢰를 깰 이유가 사라진다.
  const over = [];
  for (const seed of SEEDS) {
    for (const level of LEVELS) {
      const cap = Math.min(D.TIERS.length - 1, Math.floor((level - 1) / 5) + 1);
      for (const item of Shop.stock(level, seed).gear) {
        if (item.tier > cap) over.push(`${level}/${seed}: ${item.tier} > ${cap}`);
      }
    }
  }
  check('등급이 레벨을 앞지르지 않는다', over, []);

  const low = Shop.stock(1, 5).gear.reduce((max, i) => Math.max(max, i.tier), 0);
  const high = Shop.stock(25, 5).gear.reduce((max, i) => Math.max(max, i.tier), 0);
  check('레벨이 높으면 좋은 물건이 나온다', high > low, true);
}

// --- 살 수 있는가 -------------------------------------------------------
{
  const item = Shop.stock(9, 7).gear[0];
  const price = Items.price(item);
  check('돈이 있으면 산다', Shop.buyGear(price, item).ok, true);
  check('한 골드 모자라면 못 산다', Shop.buyGear(price - 1, item).ok, false);
  check('이유를 알려 준다', Shop.buyGear(0, item).reason, '골드가 모자란다');

  check('물약도 값이 있다', Shop.buyPotion(D.potionPrice('mana', 1), 'mana', 1).ok, true);
  check('모르는 물약은 못 산다', Shop.buyPotion(1e9, '엘릭서', 1).ok, false);

  check('갱신에도 값이 든다', Shop.refresh(Shop.refreshCost(1), 1).ok, true);
  check('공짜가 아니다', Shop.refresh(Shop.refreshCost(1) - 1, 1).ok, false);

  // 값이 정액이면 초반에는 의뢰 하나로 진열대를 통째로 사고 후반에는 값이 없는
  // 것이나 마찬가지가 된다. 물약도 갱신도 레벨을 따라가야 한다.
  check('물약 값이 레벨을 따라간다', D.potionPrice('mana', 20) > D.potionPrice('mana', 1), true);
  check('갱신 값도 레벨을 따라간다', Shop.refreshCost(20) > Shop.refreshCost(1), true);
  check('1레벨에서는 기준값 그대로', D.potionPrice('mana', 1), D.POTIONS.mana.price);
}

// --- 진행 상태와 함께 굴려 보기 -----------------------------------------
{
  // 규칙은 shop.js에, 상태는 progress.js에 있다. 둘이 어긋나면 골드를 내고도
  // 물건이 안 오거나 그 반대가 된다.
  const progress = P.create();
  progress.gold = 5000;
  const stock = Shop.stock(progress.charLevel, progress.shopSeed);
  const item = stock.gear[0];

  const before = progress.gold;
  const bought = P.buyGear(progress, item);
  check('상점 값과 실제로 깎이는 값이 같다', before - progress.gold, Items.price(item));
  check('인벤토리에 들어온다', progress.inventory.some((entry) => entry.uid === item.uid), true);
  check('보고된 값도 같다', bought.cost, Items.price(item));

  // 진열대를 갱신하면 값이 나가고 목록이 바뀐다.
  const goldBefore = progress.gold;
  const cost = Shop.refreshCost(progress.charLevel);
  const paid = P.spend(progress, cost);
  check('갱신 값이 나간다', [paid.ok, goldBefore - progress.gold], [true, cost]);

  // 사서 되파는 것이 이득이면 골드가 뜻을 잃는다.
  const sold = P.sell(progress, item.uid);
  check('되팔면 손해다', sold.gold < Items.price(item), true);
}

// --- 값이 의뢰 보상과 맞물리는가 ----------------------------------------
{
  // 장비 하나가 의뢰 반 판에서 두 판 사이여야 한다. 더 싸면 전리품이 나올
  // 이유가 없고, 더 비싸면 상점을 들를 이유가 없다.
  const Q = require('./quests.js');
  const off = [];
  for (const level of [1, 5, 10, 15, 20, 25]) {
    const quests = Q.generate(level, 4242);
    const gold = quests.reduce((sum, q) => sum + q.guildReward.gold, 0) / quests.length;
    const gear = Shop.stock(level, 4242).gear;
    const price = gear.reduce((sum, item) => sum + Items.price(item), 0) / gear.length;
    const ratio = price / gold;
    if (ratio < 0.2 || ratio > 2) off.push(`Lv${level}: ${ratio.toFixed(2)}판`);
  }
  check('장비 값이 의뢰 보상과 맞물린다', off, []);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

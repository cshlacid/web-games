'use strict';

// 상점. 재고는 씨앗에서 만들고 씨앗만 저장한다 — 만들어진 목록을 저장하면
// 자료를 고칠 때마다 저장본과 어긋난다(의뢰 게시판과 같은 이유).
//
// **재고 갱신은 공짜가 아니다.** 무료로 돌릴 수 있으면 원하는 옵션이 나올 때까지
// 누르는 것이 최선이 되고, 그러면 무작위 옵션이 뜻을 잃는다. 의뢰를 깨면 저절로
// 바뀌고, 그 전에 바꾸려면 값을 낸다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;
const Items = node ? require('./items.js') : root.HealerItems;

const GEAR_COUNT = 6;
const REFRESH_COST = 120;

function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[(rng() * list.length) | 0];

// 등급은 주인공 레벨을 따라가되 **희귀에서 멈춘다**(`D.SHOP_MAX_TIER`). 영웅
// 위로는 적에게서만 나온다 — 골드로 살 수 있으면 의뢰를 깰 이유가 상점 값을
// 모으는 것으로 바뀌고, 등급에 색을 입힌 뜻도 옅어진다.
function tierFor(level, rng) {
  const base = Math.min(D.SHOP_MAX_TIER, Math.floor((level - 1) / 6));
  const lucky = rng() < 0.22 && base + 1 <= D.SHOP_MAX_TIER;
  return lucky ? base + 1 : base;
}

// 진열대. 힐러가 쓸 물건이 하나도 없는 상점이 나오면 들를 이유가 없으므로
// 주인공 직업 물건을 최소 두 자리 확보한다.
function stock(level, seed) {
  const rng = createRng(seed == null ? 1 : seed);
  const all = Object.values(D.GEAR);
  const healerGear = all.filter((def) => def.job === 'healer');
  const gear = [];

  // 같은 물건이 두 자리를 차지하면 진열대가 실제로는 네 칸이 된다.
  const used = new Set();
  for (let i = 0; i < GEAR_COUNT; i++) {
    const pool = (i < 2 ? healerGear : all).filter((def) => !used.has(def.id));
    const def = pick(rng, pool.length ? pool : all);
    used.add(def.id);
    // 같은 씨앗이면 같은 진열대여야 하므로 아이템 씨앗도 여기서 뽑는다.
    gear.push(Items.make(def.id, tierFor(level, rng), (rng() * 1e9) | 0));
  }

  return {
    gear,
    potions: Object.values(D.POTIONS)
      .map((potion) => ({ id: potion.id, price: D.potionPrice(potion.id, level) })),
    refreshCost: refreshCost(level),
  };
}

// --- 사고팔기 -----------------------------------------------------------
//
// 규칙만 여기 두고 상태는 바꾸지 않는다. 골드를 깎고 인벤토리에 넣는 것은
// progress.js가 한다 — 저장되는 상태를 두 파일이 고치면 어디서 어긋났는지
// 알 수 없게 된다.

function canBuy(gold, cost) {
  return gold >= cost ? { ok: true } : { ok: false, reason: '골드가 모자란다' };
}

// 갱신 값도 레벨을 따라간다. 정액이면 후반에는 원하는 옵션이 나올 때까지
// 누르는 것이 아무 대가 없는 일이 된다.
const refreshCost = (charLevel) =>
  Math.round(REFRESH_COST * (1 + (Math.max(1, charLevel) - 1) * 0.35));

const buyGear = (gold, item) => canBuy(gold, Items.price(item));
const buyPotion = (gold, potionId, charLevel) =>
  canBuy(gold, D.potionPrice(potionId, charLevel || 1));
const refresh = (gold, charLevel) => canBuy(gold, refreshCost(charLevel || 1));

const api = { GEAR_COUNT, REFRESH_COST, refreshCost, stock, canBuy, buyGear, buyPotion, refresh, tierFor };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerShop = api;

})(typeof window !== 'undefined' ? window : globalThis);

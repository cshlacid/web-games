'use strict';

// 장비: 여섯 부위, 다섯 등급, 강화, 합성, 상자. 저장본을 읽고 고치는 순수 함수만 둔다.
//
// 뱀서류의 로비(장비·가방·강화·상점)를 본떴다. 회귀물이라 판 안에서 얻은 룬과 레벨은
// 회귀하면 사라지고, 장비만 서클·마도서와 함께 회귀를 건너 남는다 — 판 밖에서 쌓는
// 두 번째 성장이다.
(function () {
  const SLOTS = ['staff', 'robe', 'ring', 'amulet', 'belt', 'boots'];
  // 지팡이에 붙는 원소. 룬의 원소와 같다(runes.js의 ELEMENTS).
  const ELEMENTS = ['fire', 'water', 'wind', 'earth', 'thunder', 'light', 'dark'];
  const elZero = () => { const o = {}; for (const e of ELEMENTS) o[e] = 0; return o; };
  // 등급은 0(일반)부터 4(전설)까지. 등급이 높을수록 기본값도, 올릴 수 있는 레벨도 크다.
  const RARITIES = 5;
  const MAX_LEVEL = [10, 20, 30, 40, 50];

  // 부위마다 능력 하나. 값은 등급별 1레벨의 것이고, 레벨마다 그 값의 10%씩 는다.
  const STATS = {
    staff: { stat: 'dmg', base: [0.08, 0.14, 0.22, 0.32, 0.45] },
    robe: { stat: 'hp', base: [20, 35, 55, 80, 110] },
    ring: { stat: 'cd', base: [0.03, 0.05, 0.08, 0.11, 0.15] },
    amulet: { stat: 'xp', base: [0.05, 0.09, 0.14, 0.2, 0.28] },
    belt: { stat: 'regen', base: [0.4, 0.7, 1.1, 1.6, 2.2] },
    boots: { stat: 'speed', base: [0.04, 0.07, 0.1, 0.14, 0.18] },
  };
  // 지팡이에만 원소가 붙는다. 그 원소가 형태인 마법이 이만큼 더 세다 — 장비가 룬 조합과
  // 따로 놀지 않고, 어느 원소로 빌드를 짤지에 무게를 얹게 하려는 것이다.
  const STAFF_ELEMENT = [0.05, 0.1, 0.15, 0.22, 0.3];
  // 쿨타임은 아무리 모아도 절반 아래로 줄지 않는다. 룬의 시간 수식어와 겹치면 쉬지 않는다.
  const CD_CAP = 0.5;

  // 상자. 무게는 등급 0~4가 나올 몫이다.
  const CHESTS = {
    basic: { cost: 150, weights: [70, 25, 5, 0, 0] },
    fine: { cost: 600, weights: [0, 50, 35, 13, 2] },
  };

  const statValue = (item) => STATS[item.slot].base[item.rarity] * (1 + 0.1 * (item.level - 1));
  const elementValue = (item) => (item.el ? STAFF_ELEMENT[item.rarity] * (1 + 0.1 * (item.level - 1)) : 0);
  const upgradeCost = (item) => Math.round(20 * Math.pow(item.level, 1.35) * (1 + 0.5 * item.rarity));
  const canUpgrade = (item) => item.level < MAX_LEVEL[item.rarity];
  const sellPrice = (item) => Math.round(15 * Math.pow(2, item.rarity) + 5 * (item.level - 1));

  function pickWeighted(rng, weights) {
    let total = 0;
    for (const w of weights) total += w;
    let roll = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      if (roll < weights[i]) return i;
      roll -= weights[i];
    }
    return weights.length - 1;
  }

  function roll(rng, weights) {
    const slot = SLOTS[Math.floor(rng() * SLOTS.length)];
    const item = { slot, rarity: pickWeighted(rng, weights), level: 1 };
    if (slot === 'staff') item.el = ELEMENTS[Math.floor(rng() * ELEMENTS.length)];
    return item;
  }

  function give(save, item) {
    save.nextUid = (save.nextUid || 1);
    const owned = Object.assign({ uid: save.nextUid++ }, item);
    save.items.push(owned);
    return owned;
  }

  function openChest(save, kind, rng) {
    const chest = CHESTS[kind];
    if (!chest || save.gold < chest.cost) return null;
    save.gold -= chest.cost;
    return give(save, roll(rng, chest.weights));
  }

  // 밤을 넘기고 얻는 장비. 깊은 밤일수록 좋은 등급이 나온다.
  function nightDrop(night, boss, rng) {
    const d = Math.min(1, (night - 1) / 40);
    const weights = boss
      ? [30 * (1 - d), 40, 22 + 20 * d, 7 + 12 * d, 1 + 5 * d]
      : [60 * (1 - d) + 5, 30, 8 + 12 * d, 2 + 5 * d, 1 * d];
    return roll(rng, weights);
  }

  const find = (save, uid) => save.items.find((it) => it.uid === uid) || null;
  const equippedIn = (save, slot) => find(save, save.equipped[slot]);
  const isEquipped = (save, item) => save.equipped[item.slot] === item.uid;

  function equip(save, uid) {
    const item = find(save, uid);
    if (!item) return false;
    save.equipped[item.slot] = uid;
    return true;
  }

  function unequip(save, slot) {
    delete save.equipped[slot];
  }

  function upgrade(save, uid) {
    const item = find(save, uid);
    if (!item || !canUpgrade(item)) return false;
    const cost = upgradeCost(item);
    if (save.gold < cost) return false;
    save.gold -= cost;
    item.level += 1;
    return true;
  }

  function sell(save, uid) {
    const item = find(save, uid);
    if (!item || isEquipped(save, item)) return 0;
    save.items = save.items.filter((it) => it !== item);
    const price = sellPrice(item);
    save.gold += price;
    return price;
  }

  // 같은 부위·같은 등급 셋을 하나로 합쳐 한 등급 올린다(전설은 더 오르지 않는다).
  // 끼고 있는 것이 섞이면 결과를 그 자리에 다시 끼운다. 레벨은 셋 중 가장 높은 것을
  // 이어받는다 — 올려 둔 장비를 재료로 넣었다고 손해 보지 않게.
  function mergeAll(save) {
    const made = [];
    let again = true;
    while (again) {
      again = false;
      for (const slot of SLOTS) {
        for (let r = 0; r < RARITIES - 1; r++) {
          const pool = save.items.filter((it) => it.slot === slot && it.rarity === r);
          if (pool.length < 3) continue;
          // 끼고 있는 것과 레벨이 높은 것을 먼저 쓴다. 결과가 그것을 이어받는다.
          pool.sort((a, b) => (isEquipped(save, b) - isEquipped(save, a)) || b.level - a.level);
          const three = pool.slice(0, 3);
          const wasOn = three.some((it) => isEquipped(save, it));
          save.items = save.items.filter((it) => three.indexOf(it) < 0);
          const base = three[0];
          const next = give(save, {
            slot, rarity: r + 1, level: Math.min(MAX_LEVEL[r + 1], Math.max(...three.map((it) => it.level))),
          });
          if (base.el) next.el = base.el;
          if (wasOn) save.equipped[slot] = next.uid;
          made.push(next);
          again = true;
        }
      }
    }
    return made;
  }

  // 끼고 있는 장비의 능력을 모은다. 판(sim.js)은 이것만 받는다.
  function loadout(save) {
    const out = { dmg: 0, hp: 0, cd: 0, xp: 0, regen: 0, speed: 0, el: elZero() };
    for (const slot of SLOTS) {
      const item = equippedIn(save, slot);
      if (!item) continue;
      out[STATS[slot].stat] += statValue(item);
      if (item.el) out.el[item.el] += elementValue(item);
    }
    out.cd = Math.min(CD_CAP, out.cd);
    return out;
  }

  const empty = () => ({ dmg: 0, hp: 0, cd: 0, xp: 0, regen: 0, speed: 0, el: elZero() });

  const api = {
    SLOTS, RARITIES, MAX_LEVEL, STATS, CHESTS,
    statValue, elementValue, upgradeCost, canUpgrade, sellPrice,
    roll, give, openChest, nightDrop, find, equippedIn, isEquipped, equip, unequip, upgrade, sell, mergeAll, loadout, empty,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageGear = api;
})();

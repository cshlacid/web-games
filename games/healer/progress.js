'use strict';

// 주인공의 성장 상태. 레벨·경험치·장비·인벤토리·골드가 여기 있고, 저장도 여기서 한다.
//
// **규칙만 두고 화면을 모른다.** 레벨업 계산과 장착 규칙을 화면에서 하면 node로
// 확인할 수 없고, 전투 결과 화면과 캐릭터 화면 두 곳에 같은 계산이 생긴다.
//
// 상태를 제자리에서 고치는 것은 전투와 같은 이유다 — 저장하고 다시 읽는 물건이라
// 매번 새로 만들면 참조를 잃는 곳이 생긴다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;
const Items = node ? require('./items.js') : root.HealerItems;
const Roster = node ? require('./roster.js') : root.HealerRoster;

const STORAGE_KEY = 'web-games.healer.progress';
// 판이 바뀌면 저장본을 통째로 버린다. 어중간하게 읽으면 더 이상한 상태가 된다.
// 2에서 바뀐 것: 아이템에 uid와 무작위 옵션, 동료 명부, 물약 보유량.
const VERSION = 2;

function create() {
  return {
    version: VERSION,
    charLevel: 1, charExp: 0,
    jobLevel: 1, jobExp: 0,
    gold: 0,
    // 장착은 인벤토리 항목을 가리키는 것이 아니라 따로 들고 있는다. 인벤토리
    // 인덱스를 가리키면 아이템 하나가 빠질 때마다 장착이 엉뚱한 것으로 바뀐다.
    equipped: { weapon: null, armor: null, trinket: null },
    inventory: [],
    // 주인공이 들고 갈 물약. 동료는 직업에 따라 자동으로 들고 가지만(roster.js),
    // 주인공 것은 사서 채운다.
    potions: { mana: 3, health: 1 },
    roster: Roster.create(),
    questSeed: (Math.random() * 1e9) | 0,
    shopSeed: (Math.random() * 1e9) | 0,
    cleared: 0,
  };
}

// --- 경험치와 레벨 ------------------------------------------------------

// 남는 경험치는 다음 레벨로 넘긴다. 한 전투에서 두 레벨이 오를 수 있고, 그때
// 넘긴 만큼을 버리면 큰 퀘스트를 깰수록 손해가 된다.
function gainLevels(level, exp, expTo) {
  let gained = 0;
  while (level + gained < D.LEVEL.maxLevel && exp >= expTo(level + gained)) {
    exp -= expTo(level + gained);
    gained++;
  }
  if (level + gained >= D.LEVEL.maxLevel) exp = 0;
  return { level: level + gained, exp, gained };
}

function addExp(progress, charExp, jobExp) {
  const before = { char: progress.charLevel, job: progress.jobLevel };

  const char = gainLevels(progress.charLevel, progress.charExp + charExp, D.LEVEL.charExpTo);
  progress.charLevel = char.level;
  progress.charExp = char.exp;

  const job = gainLevels(progress.jobLevel, progress.jobExp + jobExp, D.LEVEL.jobExpTo);
  progress.jobLevel = job.level;
  progress.jobExp = job.exp;

  return {
    charExp, jobExp,
    charLevels: char.gained, jobLevels: job.gained,
    // 이번에 열린 스킬. 결과 화면에서 알려 주지 않으면 캐릭터 화면에 들어가
    // 직접 찾아봐야 안다.
    unlocked: Object.values(D.PLAYER_SKILLS)
      .filter((def) => def.unlock > before.job && def.unlock <= progress.jobLevel),
  };
}

// --- 스탯 ---------------------------------------------------------------

// 기본값 + 장비. 화면과 전투가 같은 함수를 봐야 캐릭터 창의 수치와 실제 전투가
// 어긋나지 않는다.
function stats(progress) {
  const base = {
    hp: D.LEVEL.heroHp(progress.charLevel),
    mp: D.LEVEL.heroMp(progress.charLevel, progress.jobLevel),
    heal: D.LEVEL.heroHeal(progress.jobLevel),
    armor: D.HERO.armor,
  };

  const bonus = Items.sum(equippedItems(progress));
  base.hp += bonus.hp || 0;
  base.mp += bonus.mp || 0;
  base.heal += bonus.heal || 0;
  base.armor += bonus.armor || 0;

  // 방어 계수가 0 아래로 내려가면 피해가 회복이 된다. 장비를 아무리 겹쳐도
  // 넘지 못하는 바닥을 둔다.
  base.armor = Math.max(0.35, base.armor);
  base.hp = Math.round(base.hp);
  base.mp = Math.round(base.mp);
  return base;
}

function equippedItems(progress) {
  return Object.values(progress.equipped).filter(Boolean);
}

// --- 인벤토리와 장착 ----------------------------------------------------

function addItem(progress, item) {
  if (D.MATERIALS[item.defId]) {
    // 재료는 들고 다닐 이유가 없다. 바로 팔아 골드로 바꾼다 — 팔기 화면을
    // 따로 만들지 않기 위한 선택이고, 그 사실을 결과 화면에 적는다.
    const gold = Items.price(item);
    progress.gold += gold;
    return { sold: true, gold };
  }
  progress.inventory.push(item);
  return { sold: false, gold: 0 };
}

// 인벤토리 항목은 uid로 찾는다. 자리 번호로 찾으면 하나 장착할 때마다 뒤의
// 번호가 밀려서, 결과 화면처럼 목록을 들고 있는 곳이 엉뚱한 것을 집는다.
function findItem(progress, itemUid) {
  return progress.inventory.findIndex((item) => item.uid === itemUid);
}

function equip(progress, itemUid) {
  const index = findItem(progress, itemUid);
  const item = progress.inventory[index];
  const def = item && D.GEAR[item.defId];
  if (!def) return { ok: false, reason: '장착할 수 없는 물건' };

  const previous = progress.equipped[def.slot];
  progress.equipped[def.slot] = item;
  progress.inventory.splice(index, 1);
  if (previous) progress.inventory.push(previous);
  return { ok: true, slot: def.slot, previous };
}

// --- 상점 ---------------------------------------------------------------

function spend(progress, cost) {
  if (progress.gold < cost) return { ok: false, reason: '골드가 모자란다' };
  progress.gold -= cost;
  return { ok: true, cost };
}

function buyGear(progress, item) {
  const paid = spend(progress, Items.price(item));
  if (!paid.ok) return paid;
  progress.inventory.push(item);
  return { ok: true, cost: paid.cost };
}

function buyPotion(progress, potionId) {
  const potion = D.POTIONS[potionId];
  if (!potion) return { ok: false, reason: '모르는 물약' };
  if ((progress.potions[potionId] || 0) >= D.POTION_MAX) {
    return { ok: false, reason: `${D.POTION_MAX}개까지만 들고 간다` };
  }
  const paid = spend(progress, potion.price);
  if (!paid.ok) return paid;
  progress.potions[potionId] = (progress.potions[potionId] || 0) + 1;
  return { ok: true, cost: paid.cost };
}

// 장착 중인 것은 팔 수 없다. 팔리면 다음 전투에 빈손으로 나가는데, 그것을
// 되돌릴 방법이 없다.
function sell(progress, itemUid) {
  const index = findItem(progress, itemUid);
  const item = progress.inventory[index];
  if (!item) return { ok: false, reason: '없는 물건' };
  const gold = Items.sellPrice(item);
  progress.inventory.splice(index, 1);
  progress.gold += gold;
  return { ok: true, gold };
}

function unequip(progress, slot) {
  const item = progress.equipped[slot];
  if (!item) return { ok: false, reason: '비어 있다' };
  progress.equipped[slot] = null;
  progress.inventory.push(item);
  return { ok: true };
}

// 같은 슬롯의 장착품과 견줘 얼마나 나은지. 전투 후 "이걸 껴야 하나"를 매번
// 계산하게 두면 아무도 계산하지 않고 아무것도 갈아 끼우지 않는다.
function compare(progress, item) {
  const def = D.GEAR[item.defId];
  if (!def) return null;
  const current = progress.equipped[def.slot];
  return {
    slot: def.slot,
    current,
    diff: Items.diff(item, current),
    upgrade: Items.isUpgrade(item, current),
  };
}

// --- 스킬 ---------------------------------------------------------------

function unlockedSkills(progress) {
  return Object.values(D.PLAYER_SKILLS).filter((def) => def.unlock <= progress.jobLevel);
}

// 등록해 둔 스킬이 아직 안 열린 것일 수 있다(저장본을 지운 뒤 등). 열린 것만 남긴다.
function validSkills(progress, skills) {
  const open = new Set(unlockedSkills(progress).map((def) => def.id));
  return skills.filter((id) => open.has(id)).slice(0, D.SKILL_MAX);
}

// --- 저장 ---------------------------------------------------------------

function save(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;  // 저장이 막힌 환경에서도 게임 자체는 돌아가야 한다
  }
}

// 저장본은 사람이 고칠 수도 있고 판이 바뀌면서 모양이 달라질 수도 있다. 믿지 않고
// 빠진 자리만 기본값으로 채운다 — 통째로 버리면 사소한 변경에 진행이 날아간다.
function load() {
  const fresh = create();
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch { /* 저장본이 깨졌다: 새로 시작한다 */ }
  if (!saved || saved.version !== VERSION) return fresh;

  const progress = Object.assign(fresh, saved);

  // 아이템은 uid를 다시 붙여 받는다. 저장본의 uid를 그대로 믿으면 겹칠 수 있고,
  // 겹치면 하나를 장착할 때 다른 하나가 사라진다.
  progress.equipped = { weapon: null, armor: null, trinket: null };
  for (const [slot, item] of Object.entries(saved.equipped || {})) {
    const adopted = Items.adopt(item);
    if (adopted && D.GEAR[adopted.defId] && D.GEAR[adopted.defId].slot === slot) {
      progress.equipped[slot] = adopted;
    }
  }
  progress.inventory = (Array.isArray(saved.inventory) ? saved.inventory : [])
    .map((item) => Items.adopt(item))
    .filter((item) => item && D.GEAR[item.defId]);

  progress.potions = {};
  for (const id of Object.keys(D.POTIONS)) {
    const saved2 = (saved.potions || {})[id];
    progress.potions[id] = Math.max(0, Math.min(D.POTION_MAX, saved2 | 0));
  }

  progress.roster = Roster.adopt(saved.roster);
  progress.charLevel = Math.max(1, Math.min(D.LEVEL.maxLevel, progress.charLevel | 0));
  progress.jobLevel = Math.max(1, Math.min(D.LEVEL.maxLevel, progress.jobLevel | 0));
  progress.gold = Math.max(0, progress.gold | 0);
  return progress;
}

function reset() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ }
  return create();
}

const api = {
  STORAGE_KEY, VERSION, create, load, save, reset,
  addExp, gainLevels, stats, equippedItems,
  addItem, findItem, equip, unequip, compare,
  spend, buyGear, buyPotion, sell,
  unlockedSkills, validSkills,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerProgress = api;

})(typeof window !== 'undefined' ? window : globalThis);

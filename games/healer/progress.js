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
// 3에서 바뀐 것: 스킬 레벨. 2에서 바뀐 것: 아이템에 uid와 무작위 옵션, 동료
// 명부, 물약 보유량.
const VERSION = 3;

function create() {
  return {
    version: VERSION,
    charLevel: 1, charExp: 0,
    jobLevel: 1, jobExp: 0,
    // 레벨이 오를 때마다 받는 점수를 어디에 넣었는지. 자동으로 오르는 몫은
    // 여기 없다 — 그쪽은 레벨에서 바로 계산된다.
    spent: { str: 0, agi: 0, int: 0, vit: 0 },
    gold: 0,
    // 장착은 인벤토리 항목을 가리키는 것이 아니라 따로 들고 있는다. 인벤토리
    // 인덱스를 가리키면 아이템 하나가 빠질 때마다 장착이 엉뚱한 것으로 바뀐다.
    equipped: { weapon: null, armor: null, trinket: null },
    inventory: [],
    // 주인공이 들고 갈 물약. 동료는 직업에 따라 자동으로 들고 가지만(roster.js),
    // 주인공 것은 사서 채운다.
    potions: { mana: 3, health: 1 },
    // 스킬마다의 레벨. 직업 레벨이 오를 때마다 받는 점수로 올린다. 안 적힌
    // 스킬은 1레벨이다 — 새 스킬이 열릴 때마다 여기 자리를 만들어 두면,
    // 자료가 바뀌었을 때 저장본에 없는 스킬과 있는 스킬이 갈린다.
    skillLevels: {},
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
// 레벨과 나눠 준 점수를 반영한 능력치. 화면과 전투가 같은 값을 봐야 캐릭터 창에
// 적힌 것과 실제 전투가 어긋나지 않는다.
function attrs(progress) {
  return D.attrsAt(D.HERO, progress.charLevel, progress.spent);
}

// 레벨당 받는 점수. 아직 쓰지 않은 것이 몇인지는 받은 것에서 쓴 것을 뺀 값이다 —
// 따로 세어 두면 저장본이 어긋났을 때 점수가 늘거나 줄어든다.
function earnedPoints(progress) {
  return (progress.charLevel - 1) * D.ATTR.pointsPerLevel;
}

function spentPoints(progress) {
  return Object.values(progress.spent).reduce((sum, n) => sum + Math.max(0, n | 0), 0);
}

const freePoints = (progress) => Math.max(0, earnedPoints(progress) - spentPoints(progress));

function spendPoint(progress, attr) {
  if (!D.ATTRS[attr]) return { ok: false, reason: '없는 능력치' };
  if (freePoints(progress) <= 0) return { ok: false, reason: '남은 점수가 없다' };
  progress.spent[attr] = (progress.spent[attr] || 0) + 1;
  return { ok: true, left: freePoints(progress) };
}

// 최종 수치는 D.withGear가 만든다. 전투도 같은 함수를 보므로 캐릭터 창에 적힌
// 것이 곧 전투에서 쓰이는 값이다 — 여기서 따로 더하던 동안에는 주인공의 장비가
// 창에만 반영되고 전투에는 들어가지 않았다.
function stats(progress) {
  const own = attrs(progress);
  const bonus = Items.sum(equippedItems(progress));
  return Object.assign({ attrs: own },
    D.withGear(D.derive(D.HERO, own), bonus, D.HERO.armor));
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
  const paid = spend(progress, D.potionPrice(potionId, progress.charLevel));
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

// --- 스킬 레벨 ----------------------------------------------------------

// 능력치 점수와 같은 셈법이다: 받은 것에서 쓴 것을 뺀다. 따로 세어 두면
// 저장본이 어긋났을 때 점수가 늘거나 줄어든다.
const skillLevel = (progress, id) =>
  D.skillLevelOf((progress.skillLevels || {})[id] || 1);

// 레벨을 반영한 스킬 정의. 화면과 전투가 같은 함수를 봐야 캐릭터 창에 적힌
// 수치와 실제로 나가는 스킬이 어긋나지 않는다.
const skillDef = (progress, id) =>
  D.skillAt(D.PLAYER_SKILLS[id], skillLevel(progress, id));

// 전투에 넘길 표. 전투는 진행 상태를 모르므로 필요한 것만 뽑아 넘긴다.
function skillLevels(progress) {
  const out = {};
  for (const id of Object.keys(D.PLAYER_SKILLS)) out[id] = skillLevel(progress, id);
  return out;
}

const earnedSkillPoints = (progress) => (progress.jobLevel - 1) * D.SKILL.pointsPerLevel;

function spentSkillPoints(progress) {
  return Object.keys(D.PLAYER_SKILLS)
    .reduce((sum, id) => sum + (skillLevel(progress, id) - 1), 0);
}

const freeSkillPoints = (progress) =>
  Math.max(0, earnedSkillPoints(progress) - spentSkillPoints(progress));

// 아직 열리지 않은 스킬은 올릴 수 없다. 열리기 전에 올려 두면 직업 레벨이
// 새 스킬을 여는 뜻이 옅어진다.
function raiseSkill(progress, id) {
  const def = D.PLAYER_SKILLS[id];
  if (!def) return { ok: false, reason: '없는 스킬' };
  if (def.unlock > progress.jobLevel) return { ok: false, reason: '아직 열리지 않았다' };
  if (skillLevel(progress, id) >= D.SKILL.max) return { ok: false, reason: '더 올릴 수 없다' };
  if (freeSkillPoints(progress) <= 0) return { ok: false, reason: '남은 점수가 없다' };
  progress.skillLevels[id] = skillLevel(progress, id) + 1;
  return { ok: true, level: progress.skillLevels[id], left: freeSkillPoints(progress) };
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

  // 쓴 점수는 받은 점수를 넘을 수 없다. 저장본을 손대면 능력치가 무한히 오른다.
  progress.spent = { str: 0, agi: 0, int: 0, vit: 0 };
  let budget = (Math.max(1, Math.min(D.LEVEL.maxLevel, saved.charLevel | 0 || 1)) - 1)
    * D.ATTR.pointsPerLevel;
  for (const key of Object.keys(D.ATTRS)) {
    const want = Math.max(0, (saved.spent || {})[key] | 0);
    const give = Math.min(want, budget);
    progress.spent[key] = give;
    budget -= give;
  }

  // 스킬 레벨도 받은 점수를 넘을 수 없다. 능력치 점수와 같은 이유로 예산을
  // 정해 앞에서부터 나눠 준다.
  progress.skillLevels = {};
  let skillBudget = (Math.max(1, Math.min(D.LEVEL.maxLevel, saved.jobLevel | 0 || 1)) - 1)
    * D.SKILL.pointsPerLevel;
  for (const id of Object.keys(D.PLAYER_SKILLS)) {
    const want = D.skillLevelOf((saved.skillLevels || {})[id] || 1) - 1;
    const give = Math.min(want, skillBudget);
    if (give > 0) progress.skillLevels[id] = give + 1;
    skillBudget -= give;
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
  addExp, gainLevels, stats, attrs, equippedItems,
  earnedPoints, spentPoints, freePoints, spendPoint,
  addItem, findItem, equip, unequip, compare,
  spend, buyGear, buyPotion, sell,
  unlockedSkills, validSkills,
  skillLevel, skillDef, skillLevels, raiseSkill,
  earnedSkillPoints, spentSkillPoints, freeSkillPoints,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerProgress = api;

})(typeof window !== 'undefined' ? window : globalThis);

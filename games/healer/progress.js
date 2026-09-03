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
// 분배 방식이 여기 저장되므로, 아는 방식인지도 여기서 본다 — 화면이 걸러 주기를
// 기다리면 저장본을 손댄 값이 그대로 전투로 넘어간다.
const Loot = node ? require('./loot.js') : root.HealerLoot;

const STORAGE_KEY = 'web-games.healer.progress';
// 판이 바뀌면 저장본을 통째로 버린다. 어중간하게 읽으면 더 이상한 상태가 된다.
// 4에서 바뀐 것: 주인공의 계열과 계열별 직업 레벨·스킬 점수, 스킬을 점수로
// 배우는 것. 3에서 바뀐 것: 스킬 레벨. 2에서 바뀐 것: 아이템에 uid와 무작위
// 옵션, 동료 명부, 물약 보유량.
const VERSION = 4;

function create() {
  return {
    version: VERSION,
    charLevel: 1, charExp: 0,
    // 지금 맡고 있는 계열과, **계열마다 따로 쌓이는 직업 레벨·경험치**. 하나로
    // 두면 계열을 바꾸는 순간 지금까지 키운 것이 사라져 아무도 바꿔 보지 않는다.
    job: D.HERO_JOB_START,
    jobs: { [D.HERO_JOB_START]: { level: 1, exp: 0 } },
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
    // **배운 스킬과 그 레벨.** 안 적힌 스킬은 아직 배우지 않은 것이다 — 직업
    // 레벨이 되면 저절로 열리던 것을 점수로 배우는 것으로 바꿨다. 계열을 가리지
    // 않고 한 표에 담는 것은 **배운 것이 계열이 달라도 남아야** 하기 때문이다.
    //
    // 첫 스킬 하나는 배운 채로 시작한다. 아무것도 없는 채로 편성 화면에 서면
    // "전투 시작"이 꺼져 있는 이유가 화면에 없다.
    learned: { touch: 1 },
    // 전투에 등록해 둔 스킬. **새로고침해도 남아야 한다** — 매번 다시 고르게 하면
    // 게시판에서 의뢰 하나 고르는 데 스킬 다섯을 다시 누르는 일이 된다.
    skills: [],
    // 보상 분배 방식도 같은 이유로 남는다. 파티가 미리 합의한다는 이 시스템의
    // 뜻이 "매번 고르는 칸"이 되면 사라진다.
    lootMethod: 'even',
    roster: Roster.create(),
    questSeed: (Math.random() * 1e9) | 0,
    shopSeed: (Math.random() * 1e9) | 0,
    cleared: 0,
  };
}

// --- 경험치와 레벨 ------------------------------------------------------

// 남는 경험치는 다음 레벨로 넘긴다. 한 전투에서 두 레벨이 오를 수 있고, 그때
// 넘긴 만큼을 버리면 큰 퀘스트를 깰수록 손해가 된다.
// **상한이 밖에서 온다.** 캐릭터 레벨과 직업 레벨의 천장이 다르고, 직업 레벨은
// 계열마다도 다르다 — 여기에 `D.LEVEL.maxLevel`을 박아 두면 계열 상한이 무시된다.
function gainLevels(level, exp, expTo, maxLevel) {
  const max = maxLevel || D.LEVEL.maxLevel;
  let gained = 0;
  while (level + gained < max && exp >= expTo(level + gained)) {
    exp -= expTo(level + gained);
    gained++;
  }
  if (level + gained >= max) exp = 0;
  return { level: level + gained, exp, gained };
}

// 계열마다의 레벨·경험치 자리. 처음 맡는 계열은 여기서 생긴다 — 만들 때 전부
// 채워 두면 자료에 계열을 더할 때마다 저장본이 어긋난다.
function jobEntry(progress, jobId) {
  const id = D.heroJob(jobId || progress.job).id;
  if (!progress.jobs) progress.jobs = {};
  if (!progress.jobs[id]) progress.jobs[id] = { level: 1, exp: 0 };
  return progress.jobs[id];
}

const jobLevel = (progress, jobId) => jobEntry(progress, jobId).level;
const jobExpOf = (progress, jobId) => jobEntry(progress, jobId).exp;

function addExp(progress, charExp, jobExp) {
  const entry = jobEntry(progress);
  const before = { char: progress.charLevel, job: entry.level };

  const char = gainLevels(progress.charLevel, progress.charExp + charExp, D.LEVEL.charExpTo);
  progress.charLevel = char.level;
  progress.charExp = char.exp;

  const job = gainLevels(entry.level, entry.exp + jobExp, D.LEVEL.jobExpTo,
    D.jobMaxLevel(progress.job));
  entry.level = job.level;
  entry.exp = job.exp;

  return {
    charExp, jobExp,
    charLevels: char.gained, jobLevels: job.gained,
    // 이번에 배울 수 있게 된 스킬. 결과 화면에서 알려 주지 않으면 캐릭터 화면에
    // 들어가 직접 찾아봐야 안다. **여는 것이 아니라 배울 수 있게 되는 것이다** —
    // 배우는 데에는 점수가 든다.
    unlocked: D.heroSkillsOf(progress.job)
      .filter((def) => def.unlock > before.job && def.unlock <= entry.level),
  };
}

// --- 계열 --------------------------------------------------------------

// **전직 조건은 자료에 있다**(`HERO_JOBS`의 `need`). 조건을 코드에 적으면 계열을
// 더할 때마다 분기가 는다.
function canChangeJob(progress, jobId) {
  const job = D.HERO_JOBS[jobId];
  if (!job) return { ok: false, reason: '없는 계열' };
  if (progress.job === jobId) return { ok: false, reason: '이미 맡고 있다' };
  const need = job.need || {};
  if (need.charLevel && progress.charLevel < need.charLevel) {
    return { ok: false, reason: `캐릭터 레벨 ${need.charLevel} 필요` };
  }
  if (need.cleared && (progress.cleared | 0) < need.cleared) {
    return { ok: false, reason: `의뢰 ${need.cleared}건 완료 필요` };
  }
  // **상위 계열은 아래 계열을 키운 사람만 간다.** 이것이 "상위"의 뜻이고,
  // 조건이 자료에 있으므로 계열을 더해도 분기가 늘지 않는다.
  for (const [id, level] of Object.entries(need.jobLevel || {})) {
    if (jobLevel(progress, id) < level) {
      return { ok: false, reason: `${D.heroJob(id).name} 레벨 ${level} 필요` };
    }
  }
  return { ok: true };
}

// 계열을 바꾼다. **배운 스킬은 그대로 두고 점수만 그 계열 것으로 돌아간다** —
// 되돌아왔을 때 처음부터 다시 배우게 하면 아무도 바꿔 보지 않는다.
function changeJob(progress, jobId) {
  const can = canChangeJob(progress, jobId);
  if (!can.ok) return can;
  progress.job = jobId;
  jobEntry(progress);
  // 등록해 둔 다섯은 앞 계열의 스킬이다. 그대로 두면 쓸 수 없는 것을 든 채로
  // 전투가 시작된다.
  progress.skills = validSkills(progress, progress.skills || []);
  return { ok: true, job: D.heroJob(jobId), level: jobLevel(progress) };
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
  // 장비가 올린 능력치는 derive **앞에** 얹는다. 결과 수치에 더하면 체력 옵션이
  // 최대 체력만 올리고 끝나는데, 능력치는 거기서 나오는 것을 전부 올려야 한다.
  const bonus = Items.sum(equippedItems(progress));
  const own = D.attrsWithGear(attrs(progress), bonus);
  return Object.assign({ attrs: own },
    D.withGear(D.derive(D.HERO, own), bonus, D.HERO.armor));
}

// 장비가 얹어 준 능력치만. 캐릭터 창이 "나눠 준 것"과 "장비가 준 것"을 갈라
// 보여 주는 데 쓴다 — 합쳐 놓으면 점수를 어디에 넣었는지 알 수 없다.
function gearAttrs(progress) {
  const bonus = Items.sum(equippedItems(progress));
  const out = {};
  for (const id of Object.keys(D.ATTRS)) out[id] = bonus[id] || 0;
  return out;
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

// 지금 계열에서 **배울 수 있게 된** 스킬. 배웠다는 뜻이 아니다.
function unlockedSkills(progress) {
  return D.heroSkillsOf(progress.job).filter((def) => def.unlock <= jobLevel(progress));
}

// 지금 계열에서 **실제로 배운** 스킬. 전투에 등록할 수 있는 것은 이것뿐이다.
function learnedSkills(progress) {
  return D.heroSkillsOf(progress.job).filter((def) => skillLevel(progress, def.id) > 0);
}

// 등록해 둔 스킬이 배우지 않은 것이거나 다른 계열의 것일 수 있다(계열을 바꿨거나
// 저장본을 손댔거나). 지금 들 수 있는 것만 남긴다.
function validSkills(progress, skills) {
  const mine = new Set(learnedSkills(progress).map((def) => def.id));
  return skills.filter((id) => mine.has(id)).slice(0, D.SKILL_MAX);
}

// --- 스킬 레벨과 점수 ---------------------------------------------------

// **0은 아직 배우지 않은 것이다.** 예전에는 안 적힌 스킬이 1레벨이었는데, 그때는
// 직업 레벨만 되면 저절로 열렸기 때문이다. 지금은 배우는 데에도 점수가 드므로
// "안 배움"과 "1레벨"을 갈라야 한다.
function skillLevel(progress, id) {
  const level = (progress.learned || {})[id] | 0;
  return level <= 0 ? 0 : Math.min(D.SKILL.max, level);
}

// 레벨을 반영한 스킬 정의. 화면과 전투가 같은 함수를 봐야 캐릭터 창에 적힌
// 수치와 실제로 나가는 스킬이 어긋나지 않는다.
const skillDef = (progress, id) =>
  D.skillAt(D.PLAYER_SKILLS[id], Math.max(1, skillLevel(progress, id)));

// 전투에 넘길 표. 전투는 진행 상태를 모르므로 필요한 것만 뽑아 넘긴다.
function skillLevels(progress) {
  const out = {};
  for (const id of Object.keys(D.PLAYER_SKILLS)) out[id] = Math.max(1, skillLevel(progress, id));
  return out;
}

// **점수는 계열마다 따로 쌓이고 따로 쓰인다.** 한 통에 담으면 사제로 쌓은 점수로
// 음유시인의 스킬을 전부 배워, 계열을 고르는 일이 "둘 다 하기"가 된다.
const earnedSkillPoints = (progress, jobId) =>
  D.SKILL.start + (jobLevel(progress, jobId) - 1) * D.SKILL.pointsPerLevel;

// 배우는 데 1, 한 칸 올릴 때마다 1. 그래서 쓴 점수는 그 계열 스킬의 레벨 합이다.
function spentSkillPoints(progress, jobId) {
  return D.heroSkillsOf(jobId || progress.job)
    .reduce((sum, def) => sum + skillLevel(progress, def.id), 0);
}

const freeSkillPoints = (progress, jobId) =>
  Math.max(0, earnedSkillPoints(progress, jobId) - spentSkillPoints(progress, jobId));

// 배우기와 올리기가 같은 점수를 쓴다. 둘을 한 함수로 묶지 않은 것은 화면이
// 단추 이름을 갈라야 하기 때문이다 — "배우기"와 "＋"는 다른 일로 보여야 한다.
function spendSkill(progress, id, learning) {
  const def = D.PLAYER_SKILLS[id];
  if (!def) return { ok: false, reason: '없는 스킬' };
  if (def.job !== progress.job) return { ok: false, reason: '다른 계열의 스킬' };
  if (def.unlock > jobLevel(progress)) return { ok: false, reason: '아직 열리지 않았다' };
  const level = skillLevel(progress, id);
  if (learning && level > 0) return { ok: false, reason: '이미 배웠다' };
  if (!learning && level <= 0) return { ok: false, reason: '아직 안 배웠다' };
  if (level >= D.SKILL.max) return { ok: false, reason: '더 올릴 수 없다' };
  if (freeSkillPoints(progress) <= 0) return { ok: false, reason: '남은 점수가 없다' };
  if (!progress.learned) progress.learned = {};
  progress.learned[id] = level + 1;
  return { ok: true, level: progress.learned[id], left: freeSkillPoints(progress) };
}

const learnSkill = (progress, id) => spendSkill(progress, id, true);
const raiseSkill = (progress, id) => spendSkill(progress, id, false);

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

  // 계열별 직업 레벨. 계열마다 상한이 다르므로 각각의 상한으로 자른다.
  // 조건을 못 채운 계열이 적혀 있으면 처음 계열로 되돌린다. 저장본을 손대서
  // 캐릭터 레벨 1짜리가 음유시인으로 앉아 있으면 전직 조건이 아무것도 아니게 된다.
  progress.job = D.HERO_JOB_START;
  if (D.HERO_JOBS[saved.job] && saved.job !== D.HERO_JOB_START) {
    progress.charLevel = Math.max(1, Math.min(D.LEVEL.maxLevel, saved.charLevel | 0 || 1));
    if (canChangeJob(progress, saved.job).ok) progress.job = saved.job;
  }
  progress.jobs = {};
  for (const id of Object.keys(D.HERO_JOBS)) {
    const kept = (saved.jobs || {})[id];
    if (!kept && id !== progress.job) continue;   // 겪지 않은 계열은 만들지 않는다
    progress.jobs[id] = {
      level: Math.max(1, Math.min(D.jobMaxLevel(id), (kept || {}).level | 0 || 1)),
      exp: Math.max(0, (kept || {}).exp | 0),
    };
  }
  jobEntry(progress);

  // 배운 스킬도 받은 점수를 넘을 수 없다. 능력치 점수와 같은 이유로 **계열마다**
  // 예산을 정해 앞에서부터 나눠 준다 — 한 통으로 세면 사제로 쌓은 점수가
  // 음유시인의 스킬을 배운 것으로 넘어간다.
  progress.learned = {};
  for (const jobId of Object.keys(D.HERO_JOBS)) {
    let budget = D.SKILL.start
      + (((progress.jobs[jobId] || {}).level || 1) - 1) * D.SKILL.pointsPerLevel;
    for (const def of D.heroSkillsOf(jobId)) {
      const want = Math.min(D.SKILL.max, Math.max(0, (saved.learned || {})[def.id] | 0));
      const give = def.unlock <= ((progress.jobs[jobId] || {}).level || 1)
        ? Math.min(want, budget) : 0;
      if (give > 0) progress.learned[def.id] = give;
      budget -= give;
    }
  }

  // 등록해 둔 스킬은 저장본에서 그대로 믿지 않는다. 자료가 바뀌어 없어진 스킬이나
  // 아직 안 열린 스킬이 섞여 있을 수 있다.
  progress.skills = validSkills(progress, Array.isArray(saved.skills) ? saved.skills : []);

  progress.lootMethod = Loot.METHODS[saved.lootMethod] ? saved.lootMethod : 'even';

  progress.roster = Roster.adopt(saved.roster);
  progress.charLevel = Math.max(1, Math.min(D.LEVEL.maxLevel, progress.charLevel | 0));
  progress.gold = Math.max(0, progress.gold | 0);
  return progress;
}

function reset() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ }
  return create();
}

const api = {
  STORAGE_KEY, VERSION, create, load, save, reset,
  addExp, gainLevels, stats, attrs, gearAttrs, equippedItems,
  earnedPoints, spentPoints, freePoints, spendPoint,
  addItem, findItem, equip, unequip, compare,
  spend, buyGear, buyPotion, sell,
  jobEntry, jobLevel, jobExpOf, canChangeJob, changeJob,
  unlockedSkills, learnedSkills, validSkills,
  skillLevel, skillDef, skillLevels, learnSkill, raiseSkill,
  earnedSkillPoints, spentSkillPoints, freeSkillPoints,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerProgress = api;

})(typeof window !== 'undefined' ? window : globalThis);

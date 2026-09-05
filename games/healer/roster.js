'use strict';

// 길드 명부. 동료는 의뢰마다 새로 만들어지는 것이 아니라 명부에 남아 자란다 —
// **같은 이름이면 같은 동료**이고, 경험치와 장비가 이어진다.
//
// 데려가지 않은 동료도 조금씩 자란다. 다른 파티에 껴서 일하고 왔다는 뜻이고,
// 이것이 없으면 한 번 정한 넷만 계속 쓰게 되어 명부가 있는 이유가 사라진다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;
const Items = node ? require('./items.js') : root.HealerItems;
const Shop = node ? require('./shop.js') : root.HealerShop;

// 처음 명부에 있는 동료 수. 여섯이던 것을 늘렸다 — 편성 목록이 격자가 되면서
// 한 화면에 더 담을 수 있게 됐고, 여섯일 때에는 고를 것이 사실상 정해져 있었다.
const START_SIZE = 9;
const MAX_SIZE = 14;    // 이 이상은 새로 들어오지 않는다 — 편성 화면이 목록 훑기가 된다

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

// 이름이 겹치면 두 동료가 한 사람처럼 보인다. 몇 번 다시 뽑고 그래도 겹치면
// 뒤에 번호를 붙인다 — 못 만드는 것보다 낫다.
function makeName(rng, taken, spec) {
  const titles = D.NAMES.title[spec] || D.NAMES.title.warrior;
  const draw = () => `${pick(rng, titles)} ${pick(rng, D.NAMES.given)}`;
  for (let i = 0; i < 20; i++) {
    const name = draw();
    if (!taken.has(name)) return name;
  }
  let n = 2;
  const base = draw();
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function makeMember(rng, taken, level, defId) {
  const def = defId ? D.COMPANIONS[defId] : pick(rng, Object.values(D.COMPANIONS));
  return {
    // 이름이 곧 신원이다. 저장본에서 돌아와도 이 이름으로 같은 동료가 이어진다.
    name: makeName(rng, taken, def.spec),
    defId: def.id,
    level: Math.max(1, level),
    exp: 0,
    // 제 몫으로 받은 골드. 동료는 인벤토리가 없으므로 이 돈은 장비를 갖추는
    // 데에만 쓰인다(`goShopping`).
    gold: 0,
    gear: { weapon: null, armor: null, trinket: null },
  };
}

// 처음 명부. 탱커와 힐러가 없으면 첫 의뢰부터 막히므로 직업을 정해 두고 뽑는다.
function create(seed) {
  const rng = createRng(seed == null ? (Math.random() * 1e9) | 0 : seed);
  const taken = new Set();
  const jobs = ['tank', 'tank', 'healer', 'healer', 'dealer', 'dealer'];   // 나머지는 딜러
  const members = [];

  for (let i = 0; i < START_SIZE; i++) {
    const job = jobs[i] || 'dealer';
    const pool = Object.values(D.COMPANIONS).filter((def) => def.job === job);
    const member = makeMember(rng, taken, 1, pick(rng, pool).id);
    taken.add(member.name);
    members.push(member);
  }
  return members;
}

const jobOf = (member) => D.COMPANIONS[member.defId].job;
const defOf = (member) => D.COMPANIONS[member.defId];

// **계열은 세 겹으로 정해진다**: 정의에 적힌 것 → 바꾼 것(`member.spec`) → 레벨이
// 올려 준 상위(`D.specAt`). 이름 짓기만은 정의에 적힌 계열을 보는데, 이름은 처음
// 만들 때 정해져 신원이 되기 때문이다 — 계열을 바꿨다고 이름 조각이 바뀌면 같은
// 동료가 다른 사람이 된다.
const baseSpecOf = (member) => member.spec || D.COMPANIONS[member.defId].spec;
const specOf = (member) => D.specAt(baseSpecOf(member), member.level);
// **계열을 바꾼 동료만 그림이 따라간다** — 궁수가 마법사가 되면 손에 든 것이
// 바뀐다. 안 바꿨으면 정의의 그림이다: 계열 이름과 그림 이름이 늘 같지는 않다.
const spriteOf = (member) =>
  (member.spec ? D.spriteFor(specOf(member)) : D.COMPANIONS[member.defId].sprite);

// 레벨에 맞춰 실제로 들고 나가는 스킬. 편성 화면이 보여 주는 것과 전투가
// 쓰는 것이 같아야 하므로 규칙을 한 곳에 둔다 — data.js의 skillsFor 하나다.
function skillsOf(member) {
  // **씨앗은 이름이다.** 같은 이름이면 같은 동료이므로, 편성 화면에서 본 넷이
  // 전투에서도 그대로 나오고 저장본에 스킬을 적어 둘 필요가 없다.
  // **배운 것은 계열을 바꿔도 손에 남는다**(`learned`).
  return D.skillsFor(specOf(member), member.level, D.skillSeed(member.name),
    null, member.learned);
}

// --- 계열 바꾸기 ---------------------------------------------------------

// 그 동료가 고를 수 있는 계열. **역할은 바뀌지 않는다** — 역할이 전투에서 하는
// 일이고 계열은 그 일을 어떤 손으로 하는가라, 탱커는 탱커인 채로 손만 바꾼다.
const specChoices = (member) => D.SPEC_CHOICES[jobOf(member)] || [];

function canChangeSpec(member, spec) {
  if (!specChoices(member).includes(spec)) return { ok: false, reason: '고를 수 없는 계열' };
  if (spec === baseSpecOf(member)) return { ok: false, reason: '이미 그 계열이다' };
  if (member.level < D.SPEC_CHANGE_LEVEL) {
    return { ok: false, reason: `레벨 ${D.SPEC_CHANGE_LEVEL} 필요` };
  }
  return { ok: true };
}

// **지금 들고 다니는 넷은 배운 것으로 남긴다.** 계열을 바꾸면 목록이 통째로
// 바뀌는데, 그때까지 쓰던 손이 한 번에 사라지면 계열을 바꾸는 것이 곧 잃는
// 일이 된다. 동료에게 스킬 점수를 따로 두지 않는 것은 관리할 화면이 하나 더
// 늘기 때문이다 — 그 계열에서 실제로 들고 나가던 것이 곧 배운 것이다.
function remember(member) {
  const known = new Set(member.learned || []);
  for (const id of skillsOf(member)) known.add(id);
  member.learned = [...known];
  return member.learned;
}

function changeSpec(member, spec) {
  const can = canChangeSpec(member, spec);
  if (!can.ok) return can;
  remember(member);
  member.spec = spec;
  return { ok: true, spec: specOf(member) };
}

// --- 성장 ---------------------------------------------------------------

function gainExp(member, exp) {
  const before = member.level;
  member.exp += Math.max(0, Math.round(exp));
  while (member.level < D.LEVEL.maxLevel && member.exp >= D.LEVEL.allyExpTo(member.level)) {
    member.exp -= D.LEVEL.allyExpTo(member.level);
    member.level++;
  }
  if (member.level >= D.LEVEL.maxLevel) member.exp = 0;
  // 레벨이 올라 새로 들게 된 것도 배운 것이다. 계열을 바꾼 뒤에도 남는다.
  if (member.level !== before) remember(member);
  return member.level - before;
}

// 전투가 끝난 뒤 명부 전체를 굴린다. 데려간 쪽은 전부, 데려가지 않은 쪽은
// 일부만 받는다 — 데려가는 것이 손해가 되면 편성을 고를 이유가 없다.
function awardExp(members, joinedNames, exp, seed) {
  const rng = createRng(seed == null ? (Math.random() * 1e9) | 0 : seed);
  const joined = new Set(joinedNames);
  const [lo, hi] = D.LEVEL.idleExpRate;
  const report = [];

  for (const member of members) {
    const here = joined.has(member.name);
    const share = here ? exp : Math.round(exp * (lo + rng() * (hi - lo)));
    const levels = gainExp(member, share);
    report.push({ name: member.name, joined: here, exp: share, levels });
  }
  return report;
}

// 의뢰 골드의 제 몫. **경험치와 같은 규칙으로 나눈다** — 데려간 동료는 몫 전부,
// 남은 동료는 다른 파티에서 번 몫만 받는다. 규칙을 둘로 두면 한쪽만 고치게 된다.
function awardGold(members, joinedNames, share, seed) {
  const rng = createRng(seed == null ? (Math.random() * 1e9) | 0 : seed);
  const joined = new Set(joinedNames);
  const [lo, hi] = D.LEVEL.idleExpRate;
  const report = [];

  for (const member of members) {
    const here = joined.has(member.name);
    const got = here ? share : Math.round(share * (lo + rng() * (hi - lo)));
    member.gold = (member.gold || 0) + got;
    report.push({ name: member.name, joined: here, gold: got });
  }
  return report;
}

// 동료가 제 돈으로 장비를 갖춘다. **상점 진열대를 같이 보지 않는다** — 동료의
// 장보기는 화면이 없어 사람이 개입할 수 없으므로, 같은 진열대를 두고 다투면
// 주인공이 사려던 물건이 말없이 사라진다. 등급 규칙(`Shop.tierFor`)만 빌려 쓴다.
//
// **지금 낀 것보다 나은 것만 산다**(`offerGear`와 같은 잣대). 아니면 돈을 모은다 —
// 몇 판 참으면 더 좋은 등급을 살 수 있는데 매번 다 써 버리면 영영 못 산다.
function goShopping(member, seed) {
  const rng = createRng(seed == null ? (Math.random() * 1e9) | 0 : seed);
  const job = jobOf(member);
  const pool = Object.values(D.GEAR).filter((def) => !def.job || def.job === job);
  if (!pool.length) return null;

  // 몇 개만 본다. 전부 훑어 가장 좋은 것을 고르게 하면 동료가 주인공보다 장을
  // 잘 보게 되고, 무작위 옵션이 뜻을 잃는다.
  for (let i = 0; i < 3; i++) {
    const def = pick(rng, pool);
    const item = Items.make(def.id, Shop.tierFor(member.level, rng), (rng() * 1e9) | 0);
    const price = Items.price(item);
    if ((member.gold || 0) < price) continue;
    const taken = offerGear(member, item);
    if (!taken.taken) continue;
    member.gold -= price;
    return { item, slot: taken.slot, price, previous: taken.previous };
  }
  return null;
}

// --- 장비 ---------------------------------------------------------------

// 동료는 인벤토리가 없다. 분배로 받은 장비가 지금 낀 것보다 나으면 갈아 끼우고,
// 아니면 알아서 처분한다 — 동료의 창고까지 관리하게 하면 화면이 하나 더 는다.
function offerGear(member, item) {
  if (!Items.isGear(item)) return { taken: false, reason: '장비가 아니다' };
  const slot = D.GEAR[item.defId].slot;
  const current = member.gear[slot];
  const better = !current || Items.score(item, jobOf(member)) > Items.score(current, jobOf(member));
  if (!better) return { taken: false, reason: '쓰던 것이 낫다' };
  member.gear[slot] = item;
  return { taken: true, slot, previous: current };
}

const gearOf = (member) => Object.values(member.gear).filter(Boolean);

// 전투에 넘길 수치. 레벨 배수는 전투 쪽(logic.js)이 곱하므로 여기서는 장비 몫만 낸다.
function bonusOf(member) {
  return Items.sum(gearOf(member));
}

// 직업에 따라 자동으로 들고 들어가는 물약. 마나를 다 쓴 사제가 남은 전투 내내
// 서 있는 것을 막는 것이 이 표의 목적이다. **인간형만 마신다** — 종족이 그것을
// 정하므로 여기서 다시 따지지 않고 data.js의 potionsFor에 맡긴다.
function potionsOf(member) {
  return D.potionsFor(defOf(member));
}

// 전투가 받을 꼴로 바꾼다. 편성 화면이 고른 것을 그대로 넘기면 전투가 명부의
// 모양까지 알아야 한다.
function toParty(member) {
  return {
    defId: member.defId,
    name: member.name,
    level: member.level,
    bonus: bonusOf(member),
    potions: potionsOf(member),
    // 바꾼 계열과 배운 것도 함께 넘긴다. 전투가 명부를 들여다보지 않으므로
    // 여기서 넘기지 않으면 편성 화면에 적힌 계열과 전장의 스킬이 갈린다.
    spec: baseSpecOf(member),
    learned: (member.learned || []).slice(),
  };
}

// --- 새 동료 ------------------------------------------------------------

// 의뢰를 깰 때마다 낮은 확률로 명부에 새 얼굴이 들어온다. 레벨은 주인공 근처로
// 맞춘다 — 1레벨이 들어오면 명부에만 있고 아무도 안 데려간다.
const JOIN_CHANCE = 0.45;

function maybeJoin(members, playerLevel, seed) {
  if (members.length >= MAX_SIZE) return null;
  const rng = createRng(seed == null ? (Math.random() * 1e9) | 0 : seed);
  if (rng() > JOIN_CHANCE) return null;

  const taken = new Set(members.map((m) => m.name));
  const level = Math.max(1, playerLevel + ((rng() * 3) | 0) - 1);
  const member = makeMember(rng, taken, level);
  members.push(member);
  return member;
}

// --- 저장본 -------------------------------------------------------------

// 명부는 저장본에서 가장 자주 깨질 자리다 — 동료 하나가 이상해도 나머지는
// 살아야 한다. 못 읽는 항목만 버린다.
function adopt(saved) {
  const members = [];
  const taken = new Set();
  for (const entry of Array.isArray(saved) ? saved : []) {
    if (!entry || !D.COMPANIONS[entry.defId] || typeof entry.name !== 'string') continue;
    if (taken.has(entry.name)) continue;
    taken.add(entry.name);

    const gear = { weapon: null, armor: null, trinket: null };
    for (const [slot, item] of Object.entries(entry.gear || {})) {
      const adopted = Items.adopt(item);
      if (adopted && D.GEAR[adopted.defId] && D.GEAR[adopted.defId].slot === slot) gear[slot] = adopted;
    }

    const member = {
      name: entry.name,
      defId: entry.defId,
      level: Math.max(1, Math.min(D.LEVEL.maxLevel, entry.level | 0 || 1)),
      exp: Math.max(0, entry.exp | 0),
      gold: Math.max(0, entry.gold | 0),
      gear,
      // 배운 것 중 아는 스킬만 남긴다. 자료가 바뀌어 없어진 것이 섞여 있으면
      // 전투가 시작할 때 빈 스킬을 들고 들어간다.
      learned: (Array.isArray(entry.learned) ? entry.learned : [])
        .filter((id) => D.UNIT_SKILLS[id]),
    };
    // 바꾼 계열도 그 역할이 고를 수 있는 것인지 다시 본다 — 저장본을 손대서
    // 탱커가 마법사가 되면 편성 화면의 "탱커 하나"가 뜻을 잃는다.
    if ((D.SPEC_CHOICES[D.COMPANIONS[entry.defId].job] || []).includes(entry.spec)) {
      member.spec = entry.spec;
    }
    members.push(member);
  }
  return members.length ? members : create();
}

const api = {
  START_SIZE, MAX_SIZE, JOIN_CHANCE,
  create, adopt, makeMember, jobOf, specOf, baseSpecOf, spriteOf, defOf, skillsOf,
  specChoices, canChangeSpec, changeSpec, remember,
  gainExp, awardExp, awardGold, goShopping, offerGear, gearOf, bonusOf, potionsOf, toParty, maybeJoin,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerRoster = api;

})(typeof window !== 'undefined' ? window : globalThis);

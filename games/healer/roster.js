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

const START_SIZE = 6;   // 처음 명부에 있는 동료 수
const MAX_SIZE = 12;    // 이 이상은 새로 들어오지 않는다 — 편성 화면이 목록 훑기가 된다

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
    gear: { weapon: null, armor: null, trinket: null },
  };
}

// 처음 명부. 탱커와 힐러가 없으면 첫 의뢰부터 막히므로 직업을 정해 두고 뽑는다.
function create(seed) {
  const rng = createRng(seed == null ? (Math.random() * 1e9) | 0 : seed);
  const taken = new Set();
  const jobs = ['tank', 'tank', 'healer', 'healer', 'dealer', 'dealer'];
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
const specOf = (member) => D.COMPANIONS[member.defId].spec;
const defOf = (member) => D.COMPANIONS[member.defId];

// 레벨에 맞춰 실제로 들고 나가는 스킬. 편성 화면이 보여 주는 것과 전투가
// 쓰는 것이 같아야 하므로 규칙을 한 곳에 둔다 — data.js의 skillsFor 하나다.
function skillsOf(member) {
  return D.skillsFor(specOf(member), member.level);
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

    members.push({
      name: entry.name,
      defId: entry.defId,
      level: Math.max(1, Math.min(D.LEVEL.maxLevel, entry.level | 0 || 1)),
      exp: Math.max(0, entry.exp | 0),
      gear,
    });
  }
  return members.length ? members : create();
}

const api = {
  START_SIZE, MAX_SIZE, JOIN_CHANCE,
  create, adopt, makeMember, jobOf, specOf, defOf, skillsOf,
  gainExp, awardExp, offerGear, gearOf, bonusOf, potionsOf, toParty, maybeJoin,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerRoster = api;

})(typeof window !== 'undefined' ? window : globalThis);

'use strict';

// 퀘스트와 동료 후보를 씨앗에서 만든다. 목록을 미리 적어 두지 않은 것은,
// 늘 같은 세 개가 걸려 있으면 게시판을 볼 이유가 없기 때문이다.
//
// **씨앗만 저장한다.** 만들어진 퀘스트를 통째로 저장하면 자료를 고칠 때마다
// 저장본과 어긋난다. 씨앗과 주인공 레벨만 있으면 언제든 같은 목록이 다시 나온다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;

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
const range = (rng, lo, hi) => lo + ((rng() * (hi - lo + 1)) | 0);

const QUEST_COUNT = 4;
const COMPANION_COUNT = 6;

// 적정 레벨이 주인공 레벨보다 조금 위아래로 흩어져야 고를 이유가 생긴다.
// 아래쪽이 좁은 것은, 쉬운 퀘스트만 반복하는 것이 최선이 되면 곤란해서다.
const LEVEL_SPREAD = [-1, 0, 0, 1, 1, 2, 3];

// 등급은 적정 레벨을 따라간다. 낮은 퀘스트에서 전설이 나오면 높은 퀘스트를 갈
// 이유가 없어진다.
function tierFor(level, rng) {
  const base = Math.min(D.TIERS.length - 1, Math.floor((level - 1) / 5));
  const lucky = rng() < 0.18 && base + 1 < D.TIERS.length;
  return lucky ? base + 1 : base;
}

// 지역은 적정 레벨이 지역의 최소 레벨 이상인 것 중에서 고른다. 1레벨 주인공에게
// 오크 야영지를 내밀면 받을 수 있는 퀘스트가 하나도 없는 게시판이 된다.
function regionsFor(level) {
  const open = Object.values(D.REGIONS).filter((region) => level >= region.minLevel);
  return open.length ? open : [D.REGIONS.mine];
}

function buildWaves(region, level, rng) {
  const count = level < 3 ? 2 : range(rng, 2, 3);
  const waves = [];
  for (let i = 0; i < count; i++) {
    // 뒤 웨이브가 더 크다. 같은 크기로 두면 첫 웨이브에서 마나를 어떻게 쓰든
    // 결과가 같아진다.
    const size = Math.min(5, 3 + i + (rng() < 0.35 ? 1 : 0));
    const healer = region.enemies.find((id) => D.ENEMIES[id].job === 'healer');
    const others = region.enemies.filter((id) => D.ENEMIES[id].job !== 'healer');

    // 힐러는 한 웨이브에 하나까지. 여럿이 서로를 살리면 파티의 화력으로는
    // 아무도 죽일 수 없는 웨이브가 나온다.
    const wave = [];
    for (let j = 0; j < size; j++) wave.push(pick(rng, others.length ? others : region.enemies));
    // 대신 하나쯤은 있어야 딜러 AI의 우선순위(적 힐러부터)가 뜻을 가진다.
    if (healer && rng() < 0.75) wave[wave.length - 1] = healer;
    waves.push(wave);
  }
  // 마지막 웨이브의 우두머리. 지역에 우두머리가 있고 적정 레벨이 충분할 때만 나온다.
  if (region.boss && level >= region.minLevel + 2) {
    waves.push([region.boss, pick(rng, region.enemies)]);
  }
  return waves;
}

function questValue(waves, level) {
  let exp = 0;
  for (const wave of waves) {
    for (const id of wave) exp += Math.round(D.ENEMIES[id].exp * (1 + 0.25 * (level - 1)));
  }
  return exp;
}

function makeQuest(rng, level, index) {
  const region = pick(rng, regionsFor(level));
  const waves = buildWaves(region, level, rng);
  const tier = tierFor(level, rng);
  const value = questValue(waves, level);

  const drops = [];
  const dropCount = 3 + ((rng() * 3) | 0);
  for (let i = 0; i < dropCount; i++) {
    const defId = pick(rng, region.drops);
    // 재료는 등급이 낮게 나와도 상관없지만 장비는 퀘스트 등급을 따른다.
    drops.push({ defId, tier: D.GEAR[defId] ? tier : Math.max(0, tier - 1) });
  }

  return {
    id: `q${index}-${region.id}-${level}`,
    region: region.id,
    scene: region.scene,
    level,
    name: `${pick(rng, region.prefix)} ${region.name} ${pick(rng, region.task)}`,
    desc: `적정 레벨 ${level}. ${waves.length}개의 무리를 상대한다.`,
    waves,
    guildReward: {
      gold: Math.round(60 + value * 1.6),
      // 길드 확정 보상에 경험치가 섞여 있는 것은, 전멸해도 아무것도 없이 끝나지
      // 않게 하려는 것이다 — 실패하면 이 몫만 절반으로 받는다.
      exp: Math.round(value * 0.45),
    },
    drops,
    exp: value,
  };
}

function generate(playerLevel, seed) {
  const rng = createRng(seed);
  const quests = [];
  for (let i = 0; i < QUEST_COUNT; i++) {
    const level = Math.max(1, playerLevel + pick(rng, LEVEL_SPREAD));
    quests.push(makeQuest(rng, level, i));
  }
  // 쉬운 것부터 보여 준다. 게시판을 훑을 때 고르는 기준이 레벨이기 때문이다.
  return quests.sort((a, b) => a.level - b.level);
}

// --- 동료 후보 ----------------------------------------------------------

// 퀘스트마다 붙일 수 있는 동료가 다르다. 여덟이 늘 다 나오면 한 번 정한 편성을
// 계속 쓰게 되고, 편성 화면이 처음 한 번만 의미를 갖는다.
//
// 탱커와 힐러가 하나씩은 반드시 있어야 한다. 없는 목록이 나오면 그 퀘스트는
// 편성을 고민하는 것이 아니라 그냥 못 깨는 퀘스트가 된다.
function companionsFor(quest, seed) {
  const rng = createRng(seed ^ 0x9e3779b9);
  const roster = Object.values(D.COMPANIONS);
  const byJob = (job) => roster.filter((def) => def.job === job);

  const chosen = [pick(rng, byJob('tank')), pick(rng, byJob('healer'))];
  const rest = roster.filter((def) => !chosen.includes(def));
  while (chosen.length < COMPANION_COUNT && rest.length) {
    chosen.push(rest.splice((rng() * rest.length) | 0, 1)[0]);
  }

  return chosen.map((def) => {
    // 레벨이 흔들려야 "이번 브란은 함성을 못 쓴다" 같은 것이 생긴다.
    const level = Math.max(1, quest.level + range(rng, -1, 1));
    return {
      defId: def.id,
      level,
      skills: def.skills.filter((id) => level >= D.UNIT_SKILLS[id].minLevel),
    };
  }).sort((a, b) => {
    const order = { tank: 0, dealer: 1, healer: 2 };
    return order[D.COMPANIONS[a.defId].job] - order[D.COMPANIONS[b.defId].job];
  });
}

const api = { generate, companionsFor, makeQuest, createRng, QUEST_COUNT, COMPANION_COUNT };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerQuests = api;

})(typeof window !== 'undefined' ? window : globalThis);

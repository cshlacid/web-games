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
// 명부에서 한 번에 보여 주는 동료 수. 목록이 그림·이름·직업만 남기고 격자로
// 바뀌면서 여섯에서 늘렸다 — 여섯일 때에는 한 번 정한 넷을 계속 쓰게 됐다.
const COMPANION_COUNT = 10;

// 적정 레벨이 주인공 레벨보다 조금 위아래로 흩어져야 고를 이유가 생긴다.
// 아래쪽이 좁은 것은, 쉬운 퀘스트만 반복하는 것이 최선이 되면 곤란해서다.
const LEVEL_SPREAD = [-1, 0, 0, 1, 1, 2, 3];

// 이 의뢰에 나오는 가장 높은 적 등급. 전리품의 등급은 쓰러뜨린 적에게서
// 굴려지므로, 게시판이 미리 말할 수 있는 것은 "무엇이 나오는가"까지다.
function rankOf(waves) {
  const order = Object.keys(D.RANKS);
  let best = order[0];
  for (const wave of waves) {
    for (const defId of wave) {
      const rank = D.rankOf(D.ENEMIES[defId]).id;
      if (order.indexOf(rank) > order.indexOf(best)) best = rank;
    }
  }
  return best;
}

// 지역은 적정 레벨이 지역의 최소 레벨 이상인 것 중에서 고른다. 1레벨 주인공에게
// 오크 야영지를 내밀면 받을 수 있는 퀘스트가 하나도 없는 게시판이 된다.
function regionsFor(level) {
  const open = Object.values(D.REGIONS).filter((region) => level >= region.minLevel);
  return open.length ? open : [D.REGIONS.mine];
}

// **머릿수가 아니라 위협의 몫으로 무리를 짠다.** 등급을 가리지 않고 세던 때에는
// 정예가 섞인 무리가 잡졸 무리보다 그냥 머릿수만큼 더 셌고, 그래서 "잡졸 넷"이
// "정예 둘"보다 위험했다. 지금은 정예 하나가 잡졸 둘 몫을 차지하므로, 정예가
// 나오면 머릿수가 줄고 하나하나가 아프다.
const THREAT = { trash: 1, elite: 2.2, boss: 6 };
// 무리 하나에 담기는 위협의 총량은 이 배수만큼이다. 잡졸 하나가 1이므로 곧
// "잡졸 몇 마리 몫"이고, 예전의 머릿수(3~5)에 곱해 쓴다. 등급을 세기 시작하자
// 정예가 든 무리의 머릿수가 줄어 전체가 헐거워졌고, 이 배수로 되돌렸다 —
// 난이도 확인의 세 승률이 등급을 나누기 전 수치로 돌아오는 자리다.
const threatOf = (id) => THREAT[D.rankOf(D.ENEMIES[id]).id] || 1;

function buildWaves(region, level, rng) {
  const count = level < 3 ? 2 : range(rng, 2, 3);
  const waves = [];
  for (let i = 0; i < count; i++) {
    // 뒤 웨이브가 더 무겁다. 같은 크기로 두면 첫 웨이브에서 마나를 어떻게 쓰든
    // 결과가 같아진다.
    const budget = (3 + i + (rng() < 0.35 ? 1 : 0)) * 1.6;
    const healer = region.enemies.find((id) => D.ENEMIES[id].job === 'healer');
    const others = region.enemies.filter((id) => D.ENEMIES[id].job !== 'healer');

    // 힐러는 한 웨이브에 하나까지. 여럿이 서로를 살리면 파티의 화력으로는
    // 아무도 죽일 수 없는 웨이브가 나온다.
    const wave = [];
    let spent = 0;
    // 다섯을 넘기지 않는 것은 전장의 세로 줄 수다(laneY). 예산이 남아도 여기서 멈춘다.
    while (spent < budget && wave.length < 5) {
      const id = pick(rng, others.length ? others : region.enemies);
      wave.push(id);
      spent += threatOf(id);
    }
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
  const value = questValue(waves, level);

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
    // 전리품 목록은 여기서 만들지 않는다. 쓰러뜨린 적에게서 굴려지므로
    // (`logic.dropsOf`) 미리 적어 두면 게시판에서 결과를 읽을 수 있게 된다.
    rank: rankOf(waves),
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

// 명부에서 이번 의뢰에 붙일 수 있는 동료를 고른다. 명부 전원을 늘 보여 주면
// 목록이 길어지기만 하고, 한 번 정한 넷을 계속 쓰게 된다.
//
// **탱커와 힐러는 반드시 하나씩 넣는다.** 없는 목록은 편성을 고민할 의뢰가
// 아니라 그냥 못 깨는 의뢰다.
function companionsFor(quest, roster, seed) {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const byJob = (job) => roster.filter((member) => D.COMPANIONS[member.defId].job === job);

  const chosen = [];
  for (const job of ['tank', 'healer']) {
    const pool = byJob(job);
    if (pool.length) chosen.push(pick(rng, pool));
  }

  const rest = roster.filter((member) => !chosen.includes(member));
  while (chosen.length < COMPANION_COUNT && rest.length) {
    chosen.push(rest.splice((rng() * rest.length) | 0, 1)[0]);
  }

  const order = { tank: 0, dealer: 1, healer: 2 };
  return chosen.sort((a, b) =>
    order[D.COMPANIONS[a.defId].job] - order[D.COMPANIONS[b.defId].job]);
}

const api = { generate, companionsFor, makeQuest, createRng, QUEST_COUNT, COMPANION_COUNT };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerQuests = api;

})(typeof window !== 'undefined' ? window : globalThis);

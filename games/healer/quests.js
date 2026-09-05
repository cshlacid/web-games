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

// 적정 레벨이 주인공 레벨보다 위아래로 흩어져야 고를 이유가 생긴다. 가운데를
// 두 번씩 적어 그쪽이 자주 나오게 하고, 양 끝은 한 번씩만 둔다.
//
// **아래쪽을 -3까지 연 것은 게시판이 한 가지 난이도로만 채워졌기 때문이다.**
// 예전에는 -1이 바닥이라, 평판이 무명인 동안 게시판 넷이 전부 내 레벨 아니면
// 하나 아래였다(재 보니 서로 다른 난이도가 넷 중 1.79뿐이었다). 화면의 "쉬움"
// 딱지는 두 레벨 아래부터인데 **그 딱지가 붙는 의뢰가 아예 생길 수 없었다.**
// 쉬운 판만 반복하는 것을 막는 일은 이제 다른 자리가 맡는다 — 보상이 레벨을
// 따라가고(`questValue`), 평판은 한참 쉬운 판에 이름값을 거의 안 주며
// (`REP_CHANGE.easyClear`), 동료는 시시한 판에서 신뢰가 깎인다(`TRUST_FEEL`).
//
// **위쪽은 평판이 자른다**(기획서 3장). 무명인 힐러에게 길드가 영웅급 의뢰를
// 내주지 않는다는 것이 이 시스템의 뜻이고, 이 게임에서 "상위 콘텐츠"라고 부를
// 수 있는 것은 의뢰의 난이도뿐이다. 자르고 나면 목록이 통째로 비는 일이
// 없도록 아래쪽과 `0`은 어느 평판에서도 남는다.
const LEVEL_SPREAD = [-3, -2, -2, -1, -1, 0, 0, 1, 1, 2, 3, 4, 5];

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
      // **게시판에 적힌 골드는 파티 전체 몫이다.** 나눠 갖게 되면서 한 사람 몫이
      // 아니라 판 전체의 값이 되었으므로, 예전 금액에 `PARTY_MAX`를 곱해 둔다 —
      // 가득 채워 나가면 주인공 몫이 예전과 같고, 적게 데려가면 제 몫이 커진다.
      gold: Math.round((60 + value * 1.6) * D.PARTY_MAX),
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

// `gap`은 평판이 허락하는 적정 레벨의 상한(주인공 레벨 대비)이다. 안 넘기면
// 자르지 않는다 — 난이도 확인처럼 평판을 모르는 자리에서 부르기 때문이다.
function spreadFor(gap) {
  if (gap == null) return LEVEL_SPREAD;
  const open = LEVEL_SPREAD.filter((n) => n <= gap);
  return open.length ? open : [0];
}

// 게시판에 이미 걸린 난이도는 피해서 뽑는다. 넷을 따로따로 뽑으면 같은 값이
// 겹쳐 **고를 것이 없는 게시판**이 나온다 — 가중치를 넓힌 것만으로는 안 됐다.
// 몇 번 다시 뽑고 그래도 안 되면 남은 값에서 고르며, 쓸 수 있는 난이도가 넷보다
// 적으면(평판이 낮을 때) 그때는 겹쳐도 둔다.
function pickLevel(rng, spread, used) {
  for (let i = 0; i < 8; i++) {
    const n = pick(rng, spread);
    if (!used.has(n)) return n;
  }
  const rest = spread.filter((n) => !used.has(n));
  return rest.length ? pick(rng, rest) : pick(rng, spread);
}

function generate(playerLevel, seed, gap) {
  const rng = createRng(seed);
  const spread = spreadFor(gap);
  const quests = [];
  const used = new Set();
  for (let i = 0; i < QUEST_COUNT; i++) {
    const off = pickLevel(rng, spread, used);
    used.add(off);
    const level = Math.max(1, playerLevel + off);
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
// `always`는 뽑기와 상관없이 목록에 서는 동료다 — 친구(신뢰도 마지막 단계)와
// 지금 데려가기로 눌러 둔 동료가 여기로 온다. **뽑기 자리를 먹지 않는다**:
// 공들여 키운 동료가 목록에 없어서 못 데려가는 것을 막는 것이 이 인자의 목적인데,
// 자리를 먹으면 친구가 늘수록 고를 수 있는 폭이 줄어 목적과 반대가 된다.
// **탱커와 힐러를 억지로 끼워 넣지 않는다.** 없는 목록은 못 깨는 의뢰라서 두던
// 규칙인데, 편성 화면에 "동료 새로 고침"이 생기면서 그 자리가 사라졌다 — 마음에
// 안 드는 목록은 사람이 다시 뽑으면 된다. 억지로 넣던 동안에는 열 자리 중 둘이
// 늘 정해져 있어, 명부를 키워도 뽑히는 폭이 그만큼 좁았다.
function companionsFor(quest, roster, seed, always) {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const fixed = (always || []).filter((member) => roster.includes(member));
  const rest = roster.filter((member) => !fixed.includes(member));

  const chosen = [];
  while (chosen.length < COMPANION_COUNT && rest.length) {
    chosen.push(rest.splice((rng() * rest.length) | 0, 1)[0]);
  }
  chosen.push(...fixed);

  const order = { tank: 0, dealer: 1, healer: 2 };
  return chosen.sort((a, b) =>
    order[D.COMPANIONS[a.defId].job] - order[D.COMPANIONS[b.defId].job]);
}

const api = { generate, companionsFor, makeQuest, createRng, spreadFor,
  QUEST_COUNT, COMPANION_COUNT, LEVEL_SPREAD };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerQuests = api;

})(typeof window !== 'undefined' ? window : globalThis);

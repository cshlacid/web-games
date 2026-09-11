'use strict';

// 판 밖에 남는 것 — 보유 캐릭터, 레벨, 편성, 아이템, 보석, 그리고 저장본.
//
// **성장률을 지는 축은 캐릭터 레벨 하나다.** 레벨 효과는 레벨당 곱이고 비용도
// 곱이라, 누적 보석 R로 얻는 힘은 R^a 꼴이 된다(a = ln(1+e)/ln(1+c)). 이런 축을
// 여럿 두면 지수가 a·k로 커져 성장이 터지는데, **캐릭터 피해는 서로 더해지지
// 곱해지지 않아** 다섯을 나눠 키워도 지수가 a 그대로다. 목숨·편성 칸·시작 골드는
// 상한이 있어 상수라 여기에 걸리지 않는다.
//
// 값들은 출발점이다. 실제 균형은 `balance.test.js`가 스테이지별 클리어율을 보고
// 잡는다.
(function () {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : window.DefenseData;
const G = node ? require('./goals.js') : window.DefenseGoals;

const KEY = 'web-games.defense.save';

const LEVEL_STEP = 1.06;                                  // 레벨 하나가 올리는 피해
// **체력도 같이 오르되 더 천천히 오른다.** 성장률을 지는 축은 피해 쪽이고, 체력은
// 곱해도 초당 피해에 들어가지 않아 균형식에 걸리지 않는다. 다만 레벨을 올렸는데
// 숫자가 하나만 움직이면 무엇이 좋아졌는지 읽히지 않아 같이 올린다.
const LEVEL_HP = 1.04;
const LEVEL_COST = (l) => Math.round(12 * Math.pow(1.15, l));
const GEM_BASE = 10;
const GEM_GROWTH = 1.31;                                  // 스테이지마다 오르는 보상
const SLOTS_BASE = 3;

// 상한이 있는 축들. 무한히 사는 것은 캐릭터 레벨뿐이다.
const PERKS = {
  lives: { name: '목숨', note: '판을 시작할 때 목숨이 하나 는다', max: 5, cost: (l) => Math.round(80 * Math.pow(2, l)) },
  slots: { name: '편성 칸', note: '판에 데려가는 사람이 하나 는다', max: 3, cost: (l) => Math.round(140 * Math.pow(2.2, l)) },
  purse: { name: '시작 골드', note: '시작 골드가 10% 는다', max: 5, cost: (l) => Math.round(60 * Math.pow(1.8, l)) },
};

const ITEM_POOL = ['bomb', 'freeze', 'purse', 'mend', 'order'];

// **보석으로도 캐릭터를 연다.** 카드가 빠르고 싼 길이지만, 목표를 못 채우는 사람이
// 막아 낼 종류를 영영 못 얻는 일이 생긴다 — 필요한 대응이 없어 갇히는 것이 이
// 게임에서 가장 나쁜 상태다. 값은 이미 연 수만큼 오른다.
const OPEN_COST = 140;
const OPEN_RAISE = 1.7;
const HERO_COST = 700;
const HERO_RAISE = 1.8;
const ITEM_NAME = { bomb: '폭탄', freeze: '얼림', purse: '보급', mend: '구호', order: '명령서' };

const blank = () => ({
  best: 0, gems: 0, levels: {}, perks: { lives: 0, slots: 0, purse: 0 },
  owned: [D.STARTER], team: [D.STARTER], hero: null, items: {}, cleared: {}, goals: {},
});

const isHero = (key) => !!(D.UNITS[key] && D.UNITS[key].hero);

// 없는 칸·낡은 칸은 기본값으로 메운다. 캐릭터나 축을 새로 더해도 옛 저장본이
// 깨지지 않아야 한다.
function patch(raw) {
  const s = blank();
  if (!raw || typeof raw !== 'object') return s;
  if (Number.isFinite(raw.best)) s.best = Math.max(0, Math.floor(raw.best));
  if (Number.isFinite(raw.gems)) s.gems = Math.max(0, Math.floor(raw.gems));
  if (raw.levels) for (const k of Object.keys(D.UNITS)) {
    if (Number.isFinite(raw.levels[k])) s.levels[k] = Math.max(0, Math.floor(raw.levels[k]));
  }
  if (raw.perks) for (const k of Object.keys(PERKS)) {
    if (Number.isFinite(raw.perks[k])) s.perks[k] = Math.min(PERKS[k].max, Math.max(0, Math.floor(raw.perks[k])));
  }
  if (Array.isArray(raw.owned)) {
    const keep = raw.owned.filter((k) => D.UNITS[k]);
    if (keep.length) s.owned = [...new Set([D.STARTER, ...keep])];
  }
  if (raw.items) for (const k of ITEM_POOL) {
    if (Number.isFinite(raw.items[k])) s.items[k] = Math.max(0, Math.floor(raw.items[k]));
  }
  for (const from of ['cleared', 'goals']) {
    if (raw[from]) for (const k of Object.keys(raw[from])) if (raw[from][k]) s[from][k] = true;
  }
  if (Array.isArray(raw.team)) {
    // 영웅은 일반 칸에 들어가지 않는다 — 자리를 따로 쓴다.
    const keep = raw.team.filter((k) => s.owned.includes(k) && !isHero(k));
    if (keep.length) s.team = keep.slice(0, SLOTS_BASE + s.perks.slots);
  }
  if (isHero(raw.hero) && s.owned.includes(raw.hero)) s.hero = raw.hero;
  return s;
}

function load() {
  try { return patch(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return blank(); }
}
function store(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* 저장 불가: 이번 판만 산다 */ }
  return save;
}

const slotsOf = (save) => SLOTS_BASE + save.perks.slots;
const levelOf = (save, key) => save.levels[key] || 0;
const levelCost = (save, key) => LEVEL_COST(levelOf(save, key));
const perkCost = (save, id) => PERKS[id].cost(save.perks[id]);

// 판에 데려가는 전부. 일반 편성에 영웅 한 칸이 더 붙는다.
const rosterOf = (save) => (save.hero ? [...save.team, save.hero] : save.team.slice());

// 영웅은 한 명만 데려간다. 같은 것을 다시 누르면 빼는 것으로 본다.
function chooseHero(save, key) {
  if (key != null && (!isHero(key) || !save.owned.includes(key))) return false;
  save.hero = save.hero === key ? null : key;
  return true;
}

// 규칙이 보는 것은 이것뿐이다.
// 잠긴 사람을 여는 값. 영웅은 따로 센다.
function unlockCost(save, key) {
  if (isHero(key)) {
    const had = save.owned.filter(isHero).length;
    return Math.round(HERO_COST * Math.pow(HERO_RAISE, had));
  }
  const had = save.owned.filter((k) => !isHero(k)).length - 1;
  return Math.round(OPEN_COST * Math.pow(OPEN_RAISE, Math.max(0, had)));
}

function buyUnit(save, key) {
  if (!D.UNITS[key] || save.owned.includes(key)) return false;
  const cost = unlockCost(save, key);
  if (save.gems < cost) return false;
  save.gems -= cost;
  return grant(save, key);
}

const lockedList = (save) => [...D.LOCKED, ...D.HERO_KEYS].filter((k) => !save.owned.includes(k));

const gainOf = (level) => ({ damage: Math.pow(LEVEL_STEP, level), hp: Math.pow(LEVEL_HP, level) });

// 레벨을 하나 더 올렸을 때의 계수. 화면이 "지금 → 올린 뒤"를 나란히 보여 줄 때 쓴다.
function modsWith(save, key, plus) {
  const m = modsOf(save);
  m.unit[key] = gainOf(levelOf(save, key) + (plus || 0));
  return m;
}

function modsOf(save) {
  const unit = {};
  for (const key of Object.keys(D.UNITS)) unit[key] = gainOf(levelOf(save, key));
  return {
    unit,
    lives: save.perks.lives,
    startGold: 1 + 0.1 * save.perks.purse,
  };
}

function buyLevel(save, key) {
  const cost = levelCost(save, key);
  if (!save.owned.includes(key) || save.gems < cost) return false;
  save.gems -= cost;
  save.levels[key] = levelOf(save, key) + 1;
  return true;
}

function buyPerk(save, id) {
  const perk = PERKS[id];
  if (!perk || save.perks[id] >= perk.max) return false;
  const cost = perkCost(save, id);
  if (save.gems < cost) return false;
  save.gems -= cost;
  save.perks[id]++;
  if (id === 'slots' && save.team.length < slotsOf(save)) fillTeam(save);
  return true;
}

// 새 캐릭터는 지금 평균 레벨로 들어온다. 0으로 주면 신참을 영영 쓰지 않는다.
function grant(save, key) {
  if (!D.UNITS[key] || save.owned.includes(key)) return false;
  const levels = save.owned.map((k) => levelOf(save, k));
  const mean = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;
  save.owned.push(key);
  save.levels[key] = mean;
  if (isHero(key)) {
    if (!save.hero) save.hero = key;
  } else if (save.team.length < slotsOf(save)) {
    save.team.push(key);
  }
  return true;
}

function fillTeam(save) {
  for (const k of save.owned) {
    if (save.team.length >= slotsOf(save)) break;
    if (isHero(k) || save.team.includes(k)) continue;
    save.team.push(k);
  }
  if (!save.hero) save.hero = save.owned.find(isHero) || null;
}

function toggleTeam(save, key) {
  if (!save.owned.includes(key) || isHero(key)) return false;
  const i = save.team.indexOf(key);
  if (i >= 0) {
    if (save.team.length <= 1) return false;   // 아무도 없이 판에 들어갈 수는 없다
    save.team.splice(i, 1);
    return true;
  }
  if (save.team.length >= slotsOf(save)) return false;
  save.team.push(key);
  return true;
}

const scale = (stage) => GEM_BASE * Math.pow(GEM_GROWTH, stage - 1);

// **진 판도 보석을 준다.** 벽에 부딪혀도 다시 하면 조금씩 유리해져 결국 넘는다.
// 클리어의 30%까지만 주어, 파밍이 전진보다 이득이 되지는 않게 한다.
function gemsFor(save, stage, run, goalDone) {
  const base = scale(stage);
  if (run.over !== 'won') return Math.max(1, Math.round(base * 0.3 * (run.wave / D.RUN.waves)));
  let gems = base * (1 + Math.max(0, run.lives) / 10);
  if (!save.cleared[stage]) gems *= 1.5;
  if (goalDone) gems *= G.bonusOf(G.goalOf(stage)).gems;
  return Math.round(gems);
}

// 목표를 채웠을 때만 나오는 3장(어려운 목표는 4장). 잠긴 캐릭터가 남아 있으면
// 한 장은 반드시 해금이라, 초반 몇 스테이지가 하나씩 배우는 구간이 된다.
function cardsFor(save, stage, count, rand) {
  const roll = rand || Math.random;
  // 잠긴 일반 캐릭터가 먼저다. 영웅은 몇 스테이지 지난 뒤에야 섞인다 — 처음
  // 몇 판에 둘을 같이 내놓으면 배울 것이 두 겹이 된다.
  const locked = D.LOCKED.filter((k) => !save.owned.includes(k));
  if (stage >= D.HERO_FROM) locked.push(...D.HERO_KEYS.filter((k) => !save.owned.includes(k)));
  const cards = [];
  for (let i = 0; i < Math.min(2, locked.length) && cards.length < count - 1; i++) {
    const key = locked.splice(Math.floor(roll() * locked.length), 1)[0];
    cards.push({
      kind: 'unlock', key, hero: isHero(key),
      name: isHero(key) ? `영웅 ${D.UNITS[key].name}` : D.UNITS[key].name,
      note: D.UNITS[key].note,
    });
  }
  const purse = Math.max(2, Math.round(scale(stage) * 0.8));
  cards.push({ kind: 'gems', amount: purse, name: `보석 ${purse}`, note: '레벨을 올리는 데 쓴다' });
  // 아무 자리에서 시작해 목록을 한 바퀴 돈다. 매번 새로 뽑아 겹치면 다시 뽑는
  // 방식은, 늘 같은 값을 주는 난수(테스트가 그렇게 넘긴다)에서 영영 끝나지 않는다.
  let spot = Math.floor(roll() * ITEM_POOL.length);
  for (let turn = 0; turn < ITEM_POOL.length && cards.length < count; turn++) {
    const id = ITEM_POOL[(spot + turn) % ITEM_POOL.length];
    cards.push({
      kind: 'items', id, count: 2,
      name: `${ITEM_NAME[id]} 2개`, note: '판 안에서 한 번씩 쓴다',
    });
  }
  return cards;
}

function takeCard(save, card) {
  if (card.kind === 'unlock') return grant(save, card.key);
  if (card.kind === 'gems') { save.gems += card.amount; return true; }
  if (card.kind === 'items') { save.items[card.id] = (save.items[card.id] || 0) + card.count; return true; }
  return false;
}

function useItem(save, id) {
  if (!save.items[id]) return false;
  save.items[id]--;
  return true;
}

// 판이 끝났을 때의 정산. 카드는 목표를 채웠을 때만 나온다.
function settle(save, stage, run, rand) {
  const goal = G.goalOf(stage);
  const goalDone = run.over === 'won' && G.met(goal, run.stats);
  // **카드는 목표를 채울 때마다 나온다.** 처음 한 번으로 묶어 봤더니, 막아 낼 종류가
  // 없어 진 사람이 그 종류를 얻을 길까지 같이 막혔다. 예전 스테이지로 돌아가 목표를
  // 채우는 것이 벽 앞에서 할 일이 된다 — 한 판이 3분이라 무한정 돌 만한 것도 아니다.
  const first = run.over === 'won' && !save.cleared[stage];
  const gems = gemsFor(save, stage, run, goalDone);
  save.gems += gems;
  if (run.over === 'won') {
    save.cleared[stage] = true;
    if (stage > save.best) save.best = stage;
  }
  const cards = goalDone ? cardsFor(save, stage, G.bonusOf(goal).cards, rand) : [];
  if (goalDone) save.goals[stage] = true;
  return { goal, goalDone, first, gems, cards };
}

const Meta = {
  KEY, PERKS, ITEM_POOL, ITEM_NAME, LEVEL_STEP, LEVEL_HP, GEM_GROWTH, SLOTS_BASE,
  blank, patch, load, store, modsOf, modsWith, gainOf, rosterOf, chooseHero, isHero,
  slotsOf, levelOf, levelCost, perkCost,
  buyLevel, buyPerk, grant, toggleTeam, fillTeam, gemsFor, cardsFor, takeCard,
  unlockCost, buyUnit, lockedList, OPEN_COST, HERO_COST,
  useItem, settle,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Meta;
if (typeof window !== 'undefined') window.DefenseMeta = Meta;

})();

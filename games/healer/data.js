'use strict';

// 게임에 나오는 모든 수치와 정의. 규칙(logic.js)·판단(ai.js)과 분리해 둔 이유는,
// 기획서가 "구체적인 수치는 아직 결정하지 않는다"고 적어 둔 항목이 많아서다.
// 수치가 정해지면 이 파일만 고치면 되고, 규칙 코드는 건드릴 일이 없다.
(function (root) {

// 전투 화면의 좌표계. 화면 픽셀이 아니라 이 격자 위에서 계산한다 — 화면 크기가
// 달라져도 사거리와 장판 반경이 같은 뜻을 유지해야 하기 때문이다.
//
// 높이를 가로의 절반 아래로 잡은 것은 실제로 쓰이는 만큼만 두기 위해서다. 딜러가
// 탱커가 잡은 적을 치러 모이므로 전투는 한 덩어리로 뭉치는데, 높이를 넉넉히 잡으면
// 화면 아래쪽이 늘 비어 있게 된다. 반경 값들은 이 높이에 맞춰 정해져 있다.
const FIELD = { w: 100, h: 46 };

// 피해 감소는 곱셈 계수다. 방어력을 빼기로 하면 공격력이 낮은 적의 피해가
// 0이 되어 탱커가 무적이 되는 구간이 생긴다.
const JOBS = {
  tank: { name: '탱커', role: '최전선에서 어그로 확보 및 방어' },
  dealer: { name: '딜러', role: '탱커가 어그로를 잡은 적 우선 공격' },
  healer: { name: '힐러', role: '탱커 체력 관리 최우선' },
};

// 레벨과 경험치. 캐릭터 레벨과 직업 레벨을 따로 두는 것은 둘이 오르는 이유가
// 다르기 때문이다 — 캐릭터 레벨은 전투를 치르면 오르고, 직업 레벨은 힐러 노릇을
// 얼마나 했는지로 오른다. 힐만 하다 전투가 끝나도 남는 것이 있어야 한다.
const LEVEL = {
  maxLevel: 30,
  charExpTo: (level) => Math.round(90 * Math.pow(level, 1.45)),
  jobExpTo: (level) => Math.round(70 * Math.pow(level, 1.4)),

  // 주인공의 기본 수치. 레벨 1에서 예전 고정값과 같아지도록 맞췄다.
  heroHp: (charLevel) => 380 + 40 * charLevel,
  heroMp: (charLevel, jobLevel) => 170 + 20 * charLevel + 10 * jobLevel,
  // 직업 레벨이 회복량을 올린다. 캐릭터 레벨이 올리지 않는 것은, 힐러로서의
  // 숙련과 모험가로서의 성장을 가르기 위해서다.
  heroHeal: (jobLevel) => 1 + 0.06 * (jobLevel - 1),

  // 적과 동료는 레벨로 곱해 쓴다. 체력이 공격력보다 가파른 것은, 그래야 전투가
  // 짧아지지 않고 힐러가 할 일이 남는다.
  enemyHp: (level) => 1 + 0.30 * (level - 1),
  enemyAtk: (level) => 1 + 0.22 * (level - 1),
  allyHp: (level) => 1 + 0.26 * (level - 1),
  allyAtk: (level) => 1 + 0.20 * (level - 1),

  // 힐 경험치. 흘린 힐은 세지 않는다 — 마나를 아껴 쓸 이유를 경험치가 무너뜨리면
  // 안 된다. 실제로 채운 만큼만 쌓인다.
  healExp: (healed) => Math.round(healed / 9),
};

// 장비. 슬롯 셋뿐이고 아이템마다 등급(tier)이 붙는다. 등급별로 이름을 따로
// 적어 두면 자료가 몇 배로 길어지므로, 정의 하나에 배수를 곱해 쓴다.
const TIERS = ['낡은', '쓸 만한', '튼튼한', '빼어난', '전설의'];

const SLOTS = {
  weapon: { id: 'weapon', name: '무기' },
  armor: { id: 'armor', name: '방어구' },
  trinket: { id: 'trinket', name: '장신구' },
};

// job은 분배에서 우선권을 가르는 데만 쓴다(기획서 16.2). 주인공은 어떤 것이든
// 장착할 수 있다 — 힐러 물건이 아니면 회복력이 안 붙을 뿐이다.
const GEAR = {
  staff:   { id: 'staff',   name: '치유의 지팡이', slot: 'weapon',  job: 'healer', icon: '🪄',
             stats: { heal: 0.10, mp: 14 } },
  rod:     { id: 'rod',     name: '불꽃의 지팡이', slot: 'weapon',  job: 'dealer', icon: '🔥',
             stats: { mp: 20 } },
  dagger:  { id: 'dagger',  name: '예리한 단검',   slot: 'weapon',  job: 'dealer', icon: '🗡',
             stats: { hp: 20 } },
  bow:     { id: 'bow',     name: '사냥꾼의 활',   slot: 'weapon',  job: 'dealer', icon: '🏹',
             stats: { hp: 15, mp: 8 } },
  robe:    { id: 'robe',    name: '사제의 로브',   slot: 'armor',   job: 'healer', icon: '👘',
             stats: { hp: 45, mp: 12, heal: 0.04 } },
  mail:    { id: 'mail',    name: '사슬 갑옷',     slot: 'armor',   job: 'tank',   icon: '🥋',
             stats: { hp: 80, armor: -0.05 } },
  shield:  { id: 'shield',  name: '참나무 방패',   slot: 'armor',   job: 'tank',   icon: '🛡',
             stats: { hp: 55, armor: -0.07 } },
  helm:    { id: 'helm',    name: '오크 투구',     slot: 'armor',   job: 'tank',   icon: '⛑',
             stats: { hp: 65, armor: -0.03 } },
  charm:   { id: 'charm',   name: '성자의 부적',   slot: 'trinket', job: 'healer', icon: '📿',
             stats: { heal: 0.07, mp: 10 } },
  chalice: { id: 'chalice', name: '치유의 성배',   slot: 'trinket', job: 'healer', icon: '🏆',
             stats: { mp: 26, heal: 0.03 } },
  crystal: { id: 'crystal', name: '마나 결정',     slot: 'trinket', job: null,     icon: '💎',
             stats: { mp: 22 } },
  band:    { id: 'band',    name: '수호의 팔찌',   slot: 'trinket', job: 'tank',   icon: '💍',
             stats: { hp: 40, armor: -0.03 } },
};

// 장비가 아닌 전리품. 팔아서 골드가 되는 것뿐이라 슬롯이 없다. 이런 것이 섞여
// 있어야 분배에서 "직업 무관" 규칙이 실제로 쓰인다.
const MATERIALS = {
  fang: { id: 'fang', name: '고블린 이빨', job: null, icon: '🦷', gold: 18 },
  pelt: { id: 'pelt', name: '거친 가죽',   job: null, icon: '🧶', gold: 26 },
  ore:  { id: 'ore',  name: '녹슨 광석',   job: null, icon: '🪨', gold: 34 },
};

// 등급이 오르면 수치가 함께 오른다. 등급 0이 기준값이다.
function gearStats(defId, tier) {
  const def = GEAR[defId];
  if (!def) return {};
  const mul = 1 + tier * 0.6;
  const out = {};
  for (const [key, value] of Object.entries(def.stats)) out[key] = value * mul;
  return out;
}

function itemDef(defId) {
  return GEAR[defId] || MATERIALS[defId] || null;
}

function itemName(item) {
  const def = itemDef(item.defId);
  if (!def) return '?';
  return GEAR[item.defId] ? `${TIERS[item.tier] || TIERS[0]} ${def.name}` : def.name;
}

// 주인공. 자동 공격이 없다 — 기획서에서 플레이어가 직접 쓰는 것은 힐러의
// 스킬뿐이고, 그 외 행동은 언급되지 않았다. 이동도 마찬가지라 제자리에 선다.
const HERO = {
  id: 'hero',
  name: '주인공',
  job: 'healer',
  sprite: 'hero',
  hp: 420, mp: 200,
  atk: 0, attackCd: Infinity, range: 0, speed: 0,
  armor: 0.9,
  threatMul: 1,
  skills: [],
};

// 동료. 같은 직업이 여럿 있는 것은 의도한 것이다 — 파티는 직업 중복을 허용한다.
//
// **skills의 순서가 곧 AI의 우선순위다**(ai.js는 앞에서부터 조건이 맞는 것을 고른다).
// 광역 도발과 대치유술을 앞에 둔 것은 조건이 까다로운 쪽을 먼저 보게 하려는 것이다 —
// 조건이 안 맞으면 그대로 다음 것으로 넘어간다.
const COMPANIONS = {
  bran:  { id: 'bran',  name: '강철의 브란', job: 'tank',   sprite: 'tank',
           hp: 1150, mp: 0,   atk: 26, attackCd: 1.6, range: 7,  speed: 17,
           armor: 0.55, threatMul: 3.5, skills: ['roar', 'taunt'],
           note: '공격이 매워 어그로를 잘 붙든다' },
  corin: { id: 'corin', name: '방패병 코린', job: 'tank',   sprite: 'tank',
           hp: 1320, mp: 0,   atk: 21, attackCd: 1.8, range: 7,  speed: 15,
           armor: 0.48, threatMul: 3.5, skills: ['roar', 'taunt'],
           note: '더 단단하지만 더 느리다' },
  lyle:  { id: 'lyle',  name: '검사 라일',   job: 'dealer', sprite: 'melee',
           hp: 640, mp: 0,   atk: 46, attackCd: 1.2, range: 7,  speed: 21,
           armor: 0.82, threatMul: 1, skills: ['cleave'],
           note: '근접. 강타로 한 번에 크게 넣는다' },
  sera:  { id: 'sera',  name: '도적 세라',   job: 'dealer', sprite: 'melee',
           hp: 560, mp: 0,   atk: 38, attackCd: 0.9, range: 7,  speed: 24,
           armor: 0.86, threatMul: 1, skills: ['cleave'],
           note: '근접. 빠르게 여러 번 때린다' },
  mira:  { id: 'mira',  name: '궁수 미라',   job: 'dealer', sprite: 'ranged',
           hp: 520, mp: 0,   atk: 42, attackCd: 1.4, range: 34, speed: 17,
           armor: 0.9,  threatMul: 1, skills: ['aimed', 'volley'],
           note: '원거리. 화살비로 적 여럿을 친다' },
  yuri:  { id: 'yuri',  name: '마법사 유리', job: 'dealer', sprite: 'ranged',
           hp: 470, mp: 0,   atk: 52, attackCd: 1.9, range: 36, speed: 15,
           armor: 0.92, threatMul: 1, skills: ['aimed', 'volley'],
           note: '원거리. 느리지만 한 방이 무겁다' },
  noa:   { id: 'noa',   name: '사제 노아',   job: 'healer', sprite: 'healer',
           hp: 560, mp: 130, atk: 18, attackCd: 2.0, range: 30, speed: 16,
           armor: 0.9,  threatMul: 1, skills: ['greaterMend', 'mend'],
           note: '마나가 많아 오래 버틴다' },
  dean:  { id: 'dean',  name: '수도사 딘',   job: 'healer', sprite: 'healer',
           hp: 620, mp: 110, atk: 24, attackCd: 1.7, range: 26, speed: 18,
           armor: 0.86, threatMul: 1, skills: ['mend'],
           note: '힐량이 작은 대신 때리기도 한다' },
};

// 동료와 적이 쓰는 스킬. 플레이어 스킬(PLAYER_SKILLS)과 표를 나눈 이유는
// 등록 화면에 섞여 나오면 안 되기 때문이다 — 전투에 등록하는 것은 주인공 것뿐이다.
//
// minLevel은 그 스킬이 열리는 동료 레벨이다. 같은 동료라도 레벨이 낮으면
// 광역 도발을 못 들고 온다 — 편성 화면에서 누구를 데려갈지 고르는 이유가 된다.
const UNIT_SKILLS = {
  taunt:  { id: 'taunt',  name: '도발', cd: 12, mp: 0, kind: 'taunt', duration: 6, minLevel: 1,
            desc: '적 하나의 어그로를 가져온다' },
  // 광역 도발. 탱커 하나로는 여러 적의 어그로를 다 잡을 수 없어 후방이 무너지는데,
  // 이 스킬이 그것을 푼다. 대신 쿨타임이 길어 아무 때나 쓸 수는 없다.
  roar:   { id: 'roar',   name: '전투 함성', cd: 22, mp: 0, kind: 'taunt-area', duration: 7,
            radius: 34, minLevel: 4, desc: '주변 적 전부의 어그로를 한 번에 가져온다' },
  cleave: { id: 'cleave', name: '강타', cd: 7,  mp: 0, kind: 'damage', mul: 2.6, minLevel: 1,
            desc: '한 번에 크게 넣는다' },
  // 원거리 딜러의 기본기. 레벨 1 동료가 스킬을 하나도 못 들고 오면 편성 화면에
  // "스킬 없음"이라고 적히는데, 그건 고를 이유가 없는 동료라는 뜻이다.
  aimed:  { id: 'aimed',  name: '조준 사격', cd: 6, mp: 0, kind: 'damage', mul: 2.2, minLevel: 1,
            desc: '한 발을 겨눠 크게 넣는다' },
  volley: { id: 'volley', name: '화살비', cd: 9, mp: 0, kind: 'damage-area', mul: 1.5, radius: 15,
            minLevel: 3, desc: '겹쳐 있는 적 여럿을 친다' },
  mend:   { id: 'mend',   name: '치유술', cd: 3.0, mp: 24, kind: 'heal', heal: 175, minLevel: 1,
            desc: '탱커 체력을 본다' },
  greaterMend: { id: 'greaterMend', name: '대치유술', cd: 6, mp: 40, kind: 'heal', heal: 340,
            minLevel: 5, desc: '크게 회복시킨다. 마나를 많이 먹는다' },
  hex:    { id: 'hex',    name: '저주', cd: 8, mp: 0, kind: 'dot', tick: 14, interval: 1,
            duration: 5, minLevel: 1, desc: '지속 피해' },
  mendEnemy: { id: 'mendEnemy', name: '주술 치유', cd: 4.5, mp: 20, kind: 'heal', heal: 140,
            minLevel: 1, desc: '같은 편을 회복시킨다' },
};

// 기획서에 나온 다섯 유형을 모두 쓴다: 개별 대상 / 범위 / 장판 / 도트 / 마나 회복.
// unlock은 이 스킬이 열리는 직업 레벨이다. 처음부터 여덟 개를 다 주면 등록 화면이
// 고르는 자리가 아니라 외우는 자리가 된다.
// targeting은 전투 화면이 무엇을 받아야 하는지다.
//   ally/enemy — 대상 하나
//   area-ally/area-enemy — 동료 초상화 또는 전투 화면의 위치 (기획서 8장)
//   self — 대상 선택 없이 즉시
const PLAYER_SKILLS = {
  touch: {
    id: 'touch', unlock: 1, name: '치유의 손길', type: '개별 대상', targeting: 'ally',
    mp: 14, cd: 2.4, heal: 130, icon: '✚',
    desc: '동료 하나의 체력을 130 회복한다.',
  },
  quick: {
    id: 'quick', unlock: 1, name: '신속한 치유', type: '개별 대상', targeting: 'ally',
    mp: 9, cd: 1.2, heal: 62, icon: '✦',
    desc: '싸고 빠르지만 회복량이 작다. 62 회복.',
  },
  regen: {
    id: 'regen', unlock: 2, name: '재생의 축복', type: '도트', targeting: 'ally',
    mp: 20, cd: 9, tick: 26, interval: 1, duration: 8, icon: '❃',
    desc: '8초 동안 1초마다 26씩 회복한다. 총 208.',
  },
  ripple: {
    id: 'ripple', unlock: 4, name: '빛의 파문', type: '범위', targeting: 'area-ally',
    mp: 30, cd: 9, heal: 76, radius: 20, icon: '◎',
    desc: '기준점 주변 아군을 한 번에 76씩 회복한다.',
  },
  sanctuary: {
    id: 'sanctuary', unlock: 6, name: '생명의 성역', type: '장판', targeting: 'area-ally',
    mp: 38, cd: 22, tick: 22, interval: 1, duration: 10, radius: 21, icon: '⬡',
    desc: '10초 동안 남는 장판. 안에 있는 아군을 1초마다 22씩 회복한다.',
  },
  focus: {
    id: 'focus', unlock: 3, name: '정신 집중', type: '마나 회복', targeting: 'self',
    mp: 0, cd: 30, mana: 70, icon: '☾',
    desc: '자신의 마나를 70 회복한다.',
  },
  flame: {
    id: 'flame', unlock: 5, name: '심판의 불꽃', type: '도트', targeting: 'enemy',
    mp: 16, cd: 10, tick: 22, interval: 1, duration: 6, icon: '✹',
    desc: '적 하나에게 6초 동안 1초마다 22의 피해. 어그로를 끌 수 있다.',
  },
  pyre: {
    id: 'pyre', unlock: 8, name: '성스러운 불길', type: '장판', targeting: 'area-enemy',
    mp: 34, cd: 20, tick: 26, interval: 1, duration: 8, radius: 18, icon: '⌘',
    desc: '8초 동안 남는 장판. 안에 있는 적에게 1초마다 26의 피해.',
  },
};

// 소모성 물약. 전투 중 마나를 회복하는 두 방법 가운데 하나다.
const POTION = { name: '마나 물약', count: 3, mana: 80, cd: 15, icon: '⚗' };

const ENEMIES = {
  scout:  { id: 'scout', exp: 14,  name: '고블린 척후병', job: 'dealer', sprite: 'goblin',
            hp: 330, mp: 0,   atk: 52, attackCd: 1.5, range: 7,  speed: 21,
            armor: 0.95, threatMul: 1, skills: [] },
  shaman: { id: 'shaman', exp: 18, name: '고블린 주술사', job: 'healer', sprite: 'shaman',
            hp: 300, mp: 130, atk: 36, attackCd: 2.2, range: 30, speed: 15,
            armor: 1, threatMul: 1, skills: ['mendEnemy'] },
  orc:    { id: 'orc', exp: 32,    name: '오크 전사',     job: 'tank',   sprite: 'orc',
            hp: 780, mp: 0,   atk: 76, attackCd: 1.8, range: 7,  speed: 16,
            armor: 0.7,  threatMul: 3, skills: [] },
  hexer:  { id: 'hexer', exp: 30,  name: '오크 주술사',   job: 'healer', sprite: 'shaman',
            hp: 480, mp: 150, atk: 48, attackCd: 2.4, range: 30, speed: 14,
            armor: 0.9,  threatMul: 1, skills: ['mendEnemy', 'hex'] },
  chief:  { id: 'chief', exp: 90,  name: '오크 우두머리', job: 'tank',   sprite: 'boss',
            hp: 1900, mp: 0,  atk: 116, attackCd: 2.0, range: 8,  speed: 14,
            armor: 0.62, threatMul: 3, skills: [] },
};

// 지역. 퀘스트는 미리 적어 두지 않고 여기서 뽑아 만든다(quests.js) — 목록이
// 늘 같으면 "오늘 무엇을 받을까"가 사라진다. 지역이 정하는 것은 어떤 적이 나오고
// 무엇이 떨어지는지, 그리고 어떤 배경에서 싸우는지다.
const REGIONS = {
  mine: {
    id: 'mine', scene: 'mine', name: '폐광',
    // 이름 조각. 지역마다 몇 개씩 두고 섞어 쓴다.
    prefix: ['버려진', '무너진', '깊은', '어두운'],
    task: ['소탕', '정리', '수색'],
    enemies: ['scout', 'shaman'],
    boss: null,
    drops: ['fang', 'fang', 'pelt', 'ore', 'staff', 'charm', 'dagger', 'crystal'],
    minLevel: 1,
  },
  outpost: {
    id: 'outpost', scene: 'outpost', name: '초소',
    prefix: ['무너진', '국경', '잊힌', '외딴'],
    task: ['탈환', '정찰', '방어'],
    enemies: ['scout', 'shaman', 'orc'],
    boss: null,
    drops: ['pelt', 'ore', 'helm', 'bow', 'robe', 'shield', 'charm', 'crystal', 'band'],
    minLevel: 3,
  },
  camp: {
    id: 'camp', scene: 'camp', name: '야영지',
    prefix: ['오크', '전초', '피비린내 나는', '연기 오르는'],
    task: ['습격', '토벌', '기습'],
    enemies: ['orc', 'hexer', 'scout'],
    boss: 'chief',
    drops: ['ore', 'pelt', 'mail', 'rod', 'chalice', 'shield', 'band', 'crystal', 'robe'],
    minLevel: 6,
  },
};

const PARTY_MAX = 5;   // 주인공을 포함한 수
const SKILL_MAX = 5;   // 전투에 등록할 수 있는 주인공 스킬 수

const api = {
  FIELD, JOBS, LEVEL, TIERS, SLOTS, GEAR, MATERIALS, REGIONS,
  HERO, COMPANIONS, UNIT_SKILLS, PLAYER_SKILLS, POTION, ENEMIES,
  PARTY_MAX, SKILL_MAX,
  gearStats, itemDef, itemName,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerData = api;

})(typeof window !== 'undefined' ? window : globalThis);

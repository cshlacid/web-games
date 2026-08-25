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
const COMPANIONS = {
  bran:  { id: 'bran',  name: '강철의 브란', job: 'tank',   sprite: 'tank',
           hp: 1150, mp: 0,   atk: 26, attackCd: 1.6, range: 7,  speed: 17,
           armor: 0.55, threatMul: 3.5, skills: ['taunt'],
           note: '도발로 어그로를 회수한다' },
  corin: { id: 'corin', name: '방패병 코린', job: 'tank',   sprite: 'tank',
           hp: 1320, mp: 0,   atk: 21, attackCd: 1.8, range: 7,  speed: 15,
           armor: 0.48, threatMul: 3.5, skills: ['taunt'],
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
           armor: 0.9,  threatMul: 1, skills: ['volley'],
           note: '원거리. 화살비로 적 여럿을 친다' },
  yuri:  { id: 'yuri',  name: '마법사 유리', job: 'dealer', sprite: 'ranged',
           hp: 470, mp: 0,   atk: 52, attackCd: 1.9, range: 36, speed: 15,
           armor: 0.92, threatMul: 1, skills: ['volley'],
           note: '원거리. 느리지만 한 방이 무겁다' },
  noa:   { id: 'noa',   name: '사제 노아',   job: 'healer', sprite: 'healer',
           hp: 560, mp: 130, atk: 18, attackCd: 2.0, range: 30, speed: 16,
           armor: 0.9,  threatMul: 1, skills: ['mend'],
           note: '탱커 체력을 본다. 마나가 떨어지면 멈춘다' },
  dean:  { id: 'dean',  name: '수도사 딘',   job: 'healer', sprite: 'healer',
           hp: 620, mp: 110, atk: 24, attackCd: 1.7, range: 26, speed: 18,
           armor: 0.86, threatMul: 1, skills: ['mend'],
           note: '힐량이 작은 대신 때리기도 한다' },
};

// 동료와 적이 쓰는 스킬. 플레이어 스킬(PLAYER_SKILLS)과 표를 나눈 이유는
// 등록 화면에 섞여 나오면 안 되기 때문이다 — 전투에 등록하는 것은 주인공 것뿐이다.
const UNIT_SKILLS = {
  taunt:  { id: 'taunt',  name: '도발', cd: 12, mp: 0, kind: 'taunt', duration: 6 },
  cleave: { id: 'cleave', name: '강타', cd: 7,  mp: 0, kind: 'damage', mul: 2.6 },
  volley: { id: 'volley', name: '화살비', cd: 9, mp: 0, kind: 'damage-area', mul: 1.5, radius: 15 },
  mend:   { id: 'mend',   name: '치유술', cd: 3.0, mp: 24, kind: 'heal', heal: 175 },
  hex:    { id: 'hex',    name: '저주', cd: 8, mp: 0, kind: 'dot', tick: 14, interval: 1, duration: 5 },
  mendEnemy: { id: 'mendEnemy', name: '주술 치유', cd: 4.5, mp: 20, kind: 'heal', heal: 140 },
};

// 기획서에 나온 다섯 유형을 모두 쓴다: 개별 대상 / 범위 / 장판 / 도트 / 마나 회복.
// targeting은 전투 화면이 무엇을 받아야 하는지다.
//   ally/enemy — 대상 하나
//   area-ally/area-enemy — 동료 초상화 또는 전투 화면의 위치 (기획서 8장)
//   self — 대상 선택 없이 즉시
const PLAYER_SKILLS = {
  touch: {
    id: 'touch', name: '치유의 손길', type: '개별 대상', targeting: 'ally',
    mp: 14, cd: 2.4, heal: 130, icon: '✚',
    desc: '동료 하나의 체력을 130 회복한다.',
  },
  quick: {
    id: 'quick', name: '신속한 치유', type: '개별 대상', targeting: 'ally',
    mp: 9, cd: 1.2, heal: 62, icon: '✦',
    desc: '싸고 빠르지만 회복량이 작다. 62 회복.',
  },
  regen: {
    id: 'regen', name: '재생의 축복', type: '도트', targeting: 'ally',
    mp: 20, cd: 9, tick: 26, interval: 1, duration: 8, icon: '❃',
    desc: '8초 동안 1초마다 26씩 회복한다. 총 208.',
  },
  ripple: {
    id: 'ripple', name: '빛의 파문', type: '범위', targeting: 'area-ally',
    mp: 30, cd: 9, heal: 76, radius: 20, icon: '◎',
    desc: '기준점 주변 아군을 한 번에 76씩 회복한다.',
  },
  sanctuary: {
    id: 'sanctuary', name: '생명의 성역', type: '장판', targeting: 'area-ally',
    mp: 38, cd: 22, tick: 22, interval: 1, duration: 10, radius: 21, icon: '⬡',
    desc: '10초 동안 남는 장판. 안에 있는 아군을 1초마다 22씩 회복한다.',
  },
  focus: {
    id: 'focus', name: '정신 집중', type: '마나 회복', targeting: 'self',
    mp: 0, cd: 30, mana: 70, icon: '☾',
    desc: '자신의 마나를 70 회복한다.',
  },
  flame: {
    id: 'flame', name: '심판의 불꽃', type: '도트', targeting: 'enemy',
    mp: 16, cd: 10, tick: 22, interval: 1, duration: 6, icon: '✹',
    desc: '적 하나에게 6초 동안 1초마다 22의 피해. 어그로를 끌 수 있다.',
  },
  pyre: {
    id: 'pyre', name: '성스러운 불길', type: '장판', targeting: 'area-enemy',
    mp: 34, cd: 20, tick: 26, interval: 1, duration: 8, radius: 18, icon: '⌘',
    desc: '8초 동안 남는 장판. 안에 있는 적에게 1초마다 26의 피해.',
  },
};

// 소모성 물약. 전투 중 마나를 회복하는 두 방법 가운데 하나다.
const POTION = { name: '마나 물약', count: 3, mana: 80, cd: 15, icon: '⚗' };

const ENEMIES = {
  scout:  { id: 'scout',  name: '고블린 척후병', job: 'dealer', sprite: 'goblin',
            hp: 330, mp: 0,   atk: 52, attackCd: 1.5, range: 7,  speed: 21,
            armor: 0.95, threatMul: 1, skills: [] },
  shaman: { id: 'shaman', name: '고블린 주술사', job: 'healer', sprite: 'shaman',
            hp: 300, mp: 130, atk: 36, attackCd: 2.2, range: 30, speed: 15,
            armor: 1, threatMul: 1, skills: ['mendEnemy'] },
  orc:    { id: 'orc',    name: '오크 전사',     job: 'tank',   sprite: 'orc',
            hp: 780, mp: 0,   atk: 76, attackCd: 1.8, range: 7,  speed: 16,
            armor: 0.7,  threatMul: 3, skills: [] },
  hexer:  { id: 'hexer',  name: '오크 주술사',   job: 'healer', sprite: 'shaman',
            hp: 480, mp: 150, atk: 48, attackCd: 2.4, range: 30, speed: 14,
            armor: 0.9,  threatMul: 1, skills: ['mendEnemy', 'hex'] },
  chief:  { id: 'chief',  name: '오크 우두머리', job: 'tank',   sprite: 'boss',
            hp: 1900, mp: 0,  atk: 116, attackCd: 2.0, range: 8,  speed: 14,
            armor: 0.62, threatMul: 3, skills: [] },
};

const ITEMS = {
  shield:  { id: 'shield',  name: '튼튼한 방패',   job: 'tank',   icon: '🛡' },
  mail:    { id: 'mail',    name: '사슬 갑옷',     job: 'tank',   icon: '🥋' },
  helm:    { id: 'helm',    name: '오크 투구',     job: 'tank',   icon: '⛑' },
  dagger:  { id: 'dagger',  name: '예리한 단검',   job: 'dealer', icon: '🗡' },
  bow:     { id: 'bow',     name: '사냥꾼의 활',   job: 'dealer', icon: '🏹' },
  rod:     { id: 'rod',     name: '불꽃의 지팡이', job: 'dealer', icon: '🔥' },
  charm:   { id: 'charm',   name: '성자의 부적',   job: 'healer', icon: '📿' },
  chalice: { id: 'chalice', name: '치유의 성배',   job: 'healer', icon: '🏆' },
  crystal: { id: 'crystal', name: '마나 결정',     job: null,     icon: '💎' },
  fang:    { id: 'fang',    name: '고블린 이빨',   job: null,     icon: '🦷' },
  pelt:    { id: 'pelt',    name: '거친 가죽',     job: null,     icon: '🧶' },
};

// 퀘스트. 보상이 둘로 나뉘어 있는 것은 기획서 15장 그대로다 —
// 길드가 주는 확정 보상과, 진행 중에 얻어서 참여자끼리 나누는 보상은 다른 것이다.
//
// scene은 전투 배경(scenes.js)이다. 지금은 퀘스트마다 하나씩이지만 따로 둔 것은
// 퀘스트가 늘어도 장소는 돌려쓸 수 있어야 하기 때문이다.
const QUESTS = [
  {
    id: 'mine',
    scene: 'mine',
    name: '폐광의 고블린',
    desc: '광부들이 갱도에 들어가지 못한다. 고블린 무리를 정리한다.',
    waves: [
      ['scout', 'scout', 'scout'],
      ['scout', 'scout', 'scout', 'shaman'],
    ],
    guildReward: { gold: 120, items: ['crystal'] },
    dropTable: ['fang', 'fang', 'pelt', 'dagger', 'charm', 'crystal'],
    dropCount: 4,
  },
  {
    id: 'outpost',
    scene: 'outpost',
    name: '무너진 초소',
    desc: '국경 초소가 끊겼다. 남아 있는 것들을 몰아낸다.',
    waves: [
      ['scout', 'scout', 'scout', 'shaman'],
      ['orc', 'scout', 'shaman'],
      ['orc', 'orc', 'shaman'],
    ],
    guildReward: { gold: 260, items: ['crystal', 'crystal'] },
    dropTable: ['pelt', 'helm', 'bow', 'charm', 'dagger', 'crystal', 'shield'],
    dropCount: 5,
  },
  {
    id: 'camp',
    scene: 'camp',
    name: '오크 야영지',
    desc: '우두머리가 무리를 모으고 있다. 흩어지기 전에 친다.',
    waves: [
      ['orc', 'orc', 'scout', 'scout'],
      ['hexer', 'shaman', 'orc'],
      ['chief', 'orc'],
    ],
    guildReward: { gold: 520, items: ['crystal', 'crystal', 'chalice'] },
    dropTable: ['helm', 'mail', 'rod', 'bow', 'chalice', 'shield', 'crystal', 'pelt'],
    dropCount: 6,
  },
];

const PARTY_MAX = 5;   // 주인공을 포함한 수
const SKILL_MAX = 5;   // 전투에 등록할 수 있는 주인공 스킬 수

const api = {
  FIELD, JOBS, HERO, COMPANIONS, UNIT_SKILLS, PLAYER_SKILLS, POTION,
  ENEMIES, ITEMS, QUESTS, PARTY_MAX, SKILL_MAX,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerData = api;

})(typeof window !== 'undefined' ? window : globalThis);

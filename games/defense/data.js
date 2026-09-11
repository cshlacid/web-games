'use strict';

// 캐릭터와 적의 자료. 규칙은 이 표만 보고 돌아간다 — 새 캐릭터를 들일 때
// `rules.js`를 건드리지 않기 위해서다.
//
// **판 안의 경제는 스테이지가 올라도 그대로다.** 고용비도 잡았을 때 받는 골드도
// 고정이고, 스테이지마다 오르는 것은 적 체력뿐이다. 둘 다 올리면 숫자만 커지고
// 판단은 똑같아진다.
(function () {

// 사거리는 칸, 발사 속도는 초당 횟수, 체력은 적이 부술 때 깎는 값이다.
//
// 값에 이론은 없다. 웨이브 열 개를 3~4분에 끝내는 것을 목표로 잡은 출발점이고,
// 실제 값은 `balance.test.js`의 자동 플레이로 맞춘다.
// **사거리는 안쪽과 바깥쪽 둘이다.** 포수는 2~5라 코앞의 적을 못 친다 — 바깥에서
// 때리는 자리와 앞을 막는 자리가 갈리는 것이 이 게임의 배치다. `min`은 사람이 읽는
// 값이고 판정에서 쓰는 안쪽 한계는 `min - 0.5`다.
//
// **모두 기본 공격과 스킬 둘을 가진다.** 기본 공격은 한 놈을 때리는 것이고, 스킬은
// 제 쿨타임이 돌아올 때 그 자리를 대신한다. **쿨타임 중에는 가만히 있지 않고 기본
// 공격을 한다** — 기다리는 동안 아무것도 못 하면 쿨타임이 긴 캐릭터는 세울 이유가
// 없어진다.
//
// `skill.mul`은 기본 공격 대비 배수다. 값에 이론은 없고 `balance.test.js`의 자동
// 플레이로 맞춘다.
const UNITS = {
  archer: {
    name: '궁수', cost: 60, damage: 9, rate: 1.1, hp: 60,
    range: { min: 1, max: 4 },
    skill: { name: '정조준', cd: 5, shape: 'single', mul: 2.4, note: '두 배가 넘게 꽂는 한 발' },
    note: '멀리서 한 놈씩',
  },
  shield: {
    name: '방패병', cost: 70, damage: 5, rate: 1.0, hp: 320,
    range: { min: 1, max: 1 },
    skill: { name: '후려치기', cd: 3.5, shape: 'single', mul: 1.2, stunFor: 1.2, note: '때려서 멈춰 세운다' },
    note: '앞을 막고 버틴다. 체력이 아주 높다',
  },
  cannon: {
    name: '포수', cost: 110, damage: 10, rate: 0.8, hp: 70,
    range: { min: 2, max: 5 },
    skill: { name: '포격', cd: 6, shape: 'splash', mul: 2.6, splash: 1.2, note: '한 발이 주변까지' },
    note: '코앞은 못 친다',
  },
  frost: {
    name: '빙결술사', cost: 90, damage: 6, rate: 0.9, hp: 55,
    range: { min: 1, max: 3 },
    skill: {
      name: '얼음 지대', cd: 9, shape: 'field', mul: 0.5,
      fieldR: 1.3, fieldDps: 9, fieldFor: 4, slow: 0.45,
      note: '바닥을 얼려 둔다. 밟는 동안 깎이고 느려진다',
    },
    note: '오래 기다리는 대신 판을 바꾼다',
  },
  spear: {
    name: '창병', cost: 90, damage: 10, rate: 0.9, hp: 110,
    range: { min: 1, max: 2 },
    skill: {
      name: '꿰뚫기', cd: 4, shape: 'line', mul: 1.4, bleedDps: 7, bleedFor: 3,
      note: '한 줄을 꿰고 출혈을 남긴다',
    },
    note: '',
  },
  healer: {
    name: '힐러', cost: 100, damage: 5, rate: 1.0, hp: 70,
    range: { min: 1, max: 3 },
    skill: { name: '치유', cd: 3.5, shape: 'heal', heal: 30, note: '가장 다친 아군을 되살린다' },
    note: '되살릴 이가 없으면 같이 싸운다',
  },
};

// 처음 열려 있는 것은 궁수 하나뿐이다. 나머지는 목표를 달성해야 들어온다 —
// 초반 대여섯 스테이지가 하나씩 배우는 구간이 된다.
const STARTER = 'archer';
const LOCKED = ['shield', 'cannon', 'frost', 'spear', 'healer'];

// 판 안에서 올리는 단계. 판이 끝나면 사라진다.
const UP = {
  max: 3,
  cost: [1.0, 1.6],   // 2단계, 3단계로 올리는 값 (고용비 배수)
  damage: 1.6,
  hp: 1.5,
  range: 0.4,         // 바깥쪽만 늘어난다. 안쪽 한계는 그대로 둔다
};

// **지속 피해는 방어를 무시한다.** 출혈과 바닥 얼음이 여기 걸린다 — 창병이
// 중장병을 맡는 자리가 이 한 줄에서 나온다. 직접 때리는 값만 방어에 깎인다.
const DOT_PIERCES = true;

// 적. hp는 그 스테이지 기준 체력에 곱하는 배수다.
//
// siege(초당 피해)와 bias(부수는 시간에 곱하는 성향)가 길찾기의 성격을 만든다.
// 공성병은 둘 다 극단이라 조금만 돌아가야 해도 뚫고 들어온다.
const FOES = {
  grunt:   { name: '보병', speed: 1.1, hp: 1, armor: 0, siege: 12, bias: 1, bounty: 8, cost: 1 },
  swarm:   { name: '무리', speed: 1.3, hp: 0.35, armor: 0, siege: 6, bias: 1, bounty: 4, cost: 0.5 },
  swift:   { name: '경보병', speed: 2.0, hp: 0.6, armor: 0, siege: 8, bias: 1.2, bounty: 7, cost: 0.9 },
  armored: { name: '중장병', speed: 0.8, hp: 1.6, armor: 6, siege: 14, bias: 1, bounty: 14, cost: 1.8 },
  breaker: { name: '공성병', speed: 0.85, hp: 1.5, armor: 2, siege: 40, bias: 0.4, bounty: 16, cost: 2 },
  mender:  { name: '치유병', speed: 1.0, hp: 1.0, armor: 0, siege: 10, bias: 1, bounty: 15, heal: 8, healRange: 1.8, cost: 1.9 },
  boss:    { name: '우두머리', speed: 0.7, hp: 12, armor: 10, siege: 60, bias: 0.7, bounty: 80, cost: 0 },
};

// 종류가 처음 나오는 스테이지. 숫자만 커지면 웨이브 10과 웨이브 80에서 하는 일이
// 같아져 무한이 지루함이 된다 — 대응이 바뀌는 자리를 여기서 만든다.
const FOE_FROM = { grunt: 1, swarm: 2, swift: 3, armored: 5, breaker: 7, mender: 10 };

// 판 하나의 뼈대.
const RUN = {
  waves: 10,
  lives: 5,
  gold: 160,
  ready: 12,      // 첫 웨이브까지
  gap: 8,         // 웨이브 사이
  refund: 0.6,    // 해고했을 때 돌려받는 비율
};

const Data = { UNITS, STARTER, LOCKED, UP, DOT_PIERCES, FOES, FOE_FROM, RUN };

if (typeof module !== 'undefined' && module.exports) module.exports = Data;
if (typeof window !== 'undefined') window.DefenseData = Data;

})();

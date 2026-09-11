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
const UNITS = {
  archer: {
    name: '궁수', cost: 60, damage: 12, range: 2.6, rate: 1.1, hp: 60, kind: 'single',
    note: '한 놈씩 빠르게. 처음부터 있는 하나',
  },
  shield: {
    name: '방패병', cost: 70, damage: 4, range: 1.2, rate: 1.0, hp: 320, kind: 'single',
    note: '길을 막고 버틴다. 공격은 거들 뿐',
  },
  cannon: {
    name: '포수', cost: 110, damage: 18, range: 2.4, rate: 0.55, hp: 70, kind: 'splash',
    splash: 1.1, note: '한 발이 주변까지. 무리에 강하다',
  },
  frost: {
    name: '빙결술사', cost: 90, damage: 4, range: 2.6, rate: 0.8, hp: 55, kind: 'slow',
    slow: 0.45, slowFor: 1.6, note: '피해 대신 시간을 번다',
  },
  spear: {
    name: '창병', cost: 90, damage: 14, range: 1.6, rate: 0.9, hp: 110, kind: 'pierce',
    note: '방어를 무시한다. 중장병 전용',
  },
  healer: {
    name: '힐러', cost: 100, damage: 0, range: 2.2, rate: 1.4, hp: 70, kind: 'heal',
    heal: 25, note: '주변 아군을 되살린다. 방패병과 짝',
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
  range: 0.3,
};

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

const Data = { UNITS, STARTER, LOCKED, UP, FOES, FOE_FROM, RUN };

if (typeof module !== 'undefined' && module.exports) module.exports = Data;
if (typeof window !== 'undefined') window.DefenseData = Data;

})();

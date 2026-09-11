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
// **모두 기본 공격과 스킬 둘을 가진다.** 기본 공격은 한 놈을 때리는 것이고(`basic`을
// 적으면 범위로도 된다), 스킬은 제 쿨타임이 돌아올 때 그 자리를 대신한다. **쿨타임 중에는 가만히 있지 않고 기본
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
      fieldR: 1.3, fieldDps: 1.3, fieldFor: 4, slow: 0.45,
      note: '바닥을 얼려 둔다. 밟는 동안 깎이고 느려진다',
    },
    note: '오래 기다리는 대신 판을 바꾼다',
  },
  spear: {
    name: '창병', cost: 90, damage: 10, rate: 0.9, hp: 110,
    range: { min: 1, max: 2 },
    skill: {
      name: '꿰뚫기', cd: 4, shape: 'line', mul: 1.4, bleedDps: 0.65, bleedFor: 3,
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

// 영웅. **한 판에 한 번만 부를 수 있다**(`hero`). 값이 비싸 첫 웨이브부터 세울 수
// 없고, 어느 웨이브에 꺼내느냐가 그 판의 판단이 된다. 편성에서 일반 다섯 칸과는
// 따로 한 칸을 차지한다.
const HEROES = {
  blade: {
    name: '검성', cost: 220, damage: 26, rate: 1.2, hp: 500, hero: true,
    range: { min: 1, max: 1 },
    skill: { name: '회전베기', cd: 5, shape: 'ring', mul: 1.6, ring: 1.7, note: '둘레를 통째로 벤다' },
    note: '길목에 서서 베고 버틴다',
  },
  arch: {
    name: '대마법사', cost: 260, damage: 28, rate: 0.55, hp: 90, hero: true,
    range: { min: 2, max: 6 },
    // **기본 공격부터 범위다.** 영웅인데 한 놈씩 때리는 초당 11이라 궁수와 다를 것이
    // 없었다. 범위는 `single`이 아니라 `area`로 들어가므로 중장병의 저항도 타지
    // 않는다 — 값이 네 배인 자리가 이것으로 설명된다.
    basic: { shape: 'splash', splash: 1.2 },
    skill: {
      name: '운석', cd: 10, shape: 'splash', mul: 3.6, splash: 2, bleedDps: 0.5, bleedFor: 3,
      note: '떨어뜨려 태운다',
    },
    note: '판 끝에서 끝까지 닿는다. 코앞은 못 친다',
  },
  saint: {
    name: '성기사', cost: 240, damage: 14, rate: 1, hp: 260, hero: true,
    range: { min: 1, max: 4 },
    skill: { name: '치유의 빛', cd: 6, shape: 'heal', heal: 110, all: true, note: '둘레의 아군을 한꺼번에' },
    note: '옆을 통째로 되살리고 같이 싸운다',
  },
};

Object.assign(UNITS, HEROES);
const HERO_KEYS = Object.keys(HEROES);
// 영웅 카드는 이 스테이지부터 나온다. 처음 몇 판은 일반 캐릭터를 하나씩 배우는
// 구간이라 그 앞에 섞으면 배울 것이 두 겹이 된다.
const HERO_FROM = 4;

// 처음 열려 있는 것은 궁수 하나뿐이다. 나머지는 목표를 달성해야 들어온다 —
// 초반 대여섯 스테이지가 하나씩 배우는 구간이 된다.
const STARTER = 'archer';
const LOCKED = ['shield', 'cannon', 'frost', 'spear', 'healer'];

// 판 안에서 올리는 단계. 판이 끝나면 사라진다.
// 판 안에서 올리는 단계. **세기만 오르는 것이 아니라 리듬도 바뀐다.**
//
// 피해만 올렸더니 빙결술사와 대마법사는 올려도 체감이 없었다 — 이들의 값은 한 방의
// 크기가 아니라 바닥을 얼려 두는 시간에 있는데, 쿨타임 9초에 유지 4초는 단계를
// 올려도 그대로였다. **쿨타임은 줄고 지속은 늘어난다**(3단계에서 쿨타임 0.72배,
// 지속 1.56배). 쿨타임이 긴 쪽이 가장 크게 득을 보는 규칙이라, 손볼 자리가 하나로
// 끝난다.
const UP = {
  max: 3,
  cost: [1.0, 1.6],   // 2단계, 3단계로 올리는 값 (고용비 배수)
  damage: 1.6,
  hp: 1.5,
  range: 0.4,         // 바깥쪽만 늘어난다. 안쪽 한계는 그대로 둔다
  cd: 0.85,           // 단계마다 스킬 쿨타임에 곱한다
  hold: 1.25,         // 단계마다 지속 시간(얼음·출혈·기절)에 곱한다
};

// 공격이 닿는 종류. `resist`는 `single`에만 걸린다 — 범위·관통·지속은 제값이
// 들어간다. **지속 피해에는 최소 1이 붙지 않는다**(직접 때리는 값에만 붙는 바닥이라,
// 그대로 두면 틱마다 1이 들어가 초당 서른이 된다).
const HIT = { single: 'single', area: 'area', dot: 'dot' };

// 적. hp는 그 스테이지 기준 체력에 곱하는 배수다.
//
// **`resist`는 "한 놈씩 때리는 공격"에만 걸리는 감소율이다.** 수치로 된 방어는
// 소용이 없었다 — 보석을 한 캐릭터에 몰면 레벨 60을 넘겨 어떤 방어값도 뚫는다.
// 그래서 막는 것을 값이 아니라 **공격의 종류**로 바꿨다. 중장병은 궁수가 아무리
// 세도 거의 안 통하고, 범위(포격·회전베기)·관통(꿰뚫기)·지속(출혈·얼음)이라야
// 제값이 들어간다. 조합이 필요해지는 자리가 여기다.
//
// siege(초당 피해)와 bias(부수는 시간에 곱하는 성향)가 길찾기의 성격을 만든다.
// 공성병은 둘 다 극단이라 조금만 돌아가야 해도 뚫고 들어온다.
const FOES = {
  grunt:   { name: '보병', speed: 1.1, hp: 1, resist: 0, siege: 12, bias: 1, bounty: 8, cost: 1 },
  swarm:   { name: '무리', speed: 1.35, hp: 0.32, resist: 0, siege: 6, bias: 1, bounty: 4, cost: 0.5 },
  swift:   { name: '경보병', speed: 2.8, hp: 0.55, resist: 0, siege: 8, bias: 1.2, bounty: 7, cost: 0.9 },
  // 한 놈씩 때리는 공격은 15%만 들어간다. 궁수를 아무리 키워도 이 벽은 안 넘는다.
  armored: { name: '중장병', speed: 0.8, hp: 1.5, resist: 0.9, siege: 14, bias: 1, bounty: 22, cost: 1.8 },
  breaker: { name: '공성병', speed: 0.85, hp: 1.4, resist: 0.35, siege: 60, bias: 0.4, bounty: 16, cost: 2 },
  // 초당 최대 체력의 6%를 되살린다. 조금씩 깎아서는 따라잡지 못한다.
  mender:  { name: '치유병', speed: 1, hp: 1, resist: 0.4, siege: 10, bias: 1, bounty: 15, heal: 0.06, healRange: 1.8, cost: 1.9 },
  boss:    { name: '우두머리', speed: 0.7, hp: 12, resist: 0.55, siege: 70, bias: 0.7, bounty: 90, cost: 0 },
};

// 종류가 처음 나오는 스테이지. 숫자만 커지면 웨이브 10과 웨이브 80에서 하는 일이
// 같아져 무한이 지루함이 된다 — 대응이 바뀌는 자리를 여기서 만든다.
const FOE_FROM = { grunt: 1, swarm: 2, swift: 3, armored: 5, breaker: 7, mender: 10 };

// **같은 종류는 판에 여섯까지만 세운다.** 값으로 막으려 해 봤지만(겹칠수록 비싸게,
// 방어를 세게, 적을 세게) 전부 칼날 위였다 — 한 종류만 키우면 레벨이 두 배로
// 올라가 어떤 수치든 결국 넘긴다. 마릿수를 못 박는 것이 유일하게 확실하다.
// 여섯이면 한 종류로는 스물두 마리 무리도 중장병 일곱도 감당이 안 되고, 다섯
// 종류를 섞으면 서른 명이라 넉넉하다.
const MOST_OF_KIND = 6;

// 그 안에서도 겹쳐 세울수록 조금씩 비싸진다. 한도에 닿기 전에도 섞는 쪽이 싸다.
const RAISE = 1.18;

// 판 하나의 뼈대.
const RUN = {
  waves: 10,
  lives: 5,
  gold: 160,
  ready: 12,      // 첫 웨이브까지
  gap: 8,         // 웨이브 사이
  refund: 0.6,    // 해고했을 때 돌려받는 비율
};

const Data = { UNITS, HEROES, HERO_KEYS, HERO_FROM, STARTER, LOCKED, UP, HIT, RAISE, MOST_OF_KIND, FOES, FOE_FROM, RUN };

if (typeof module !== 'undefined' && module.exports) module.exports = Data;
if (typeof window !== 'undefined') window.DefenseData = Data;

})();

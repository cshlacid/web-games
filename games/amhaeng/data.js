'use strict';

// 암행의 자료: 무기 패, 적, 고을(여정), 주막과 서낭당. 이름과 설명은 사전(`ah.*`)에 있고 여기는
// id와 수치만 든다.
//
// 칸은 한 줄이고 방향은 +1(오른쪽)·-1(왼쪽)이다. 무늬(`hits`)는 바라보는 쪽으로 몇 칸째를
// 치는지다 — [1]은 바로 앞, [-1, 1]은 양옆.
(function (root) {

const LANE = 7;
const QUEUE_MAX = 3;
const START_HP = 8;

// 무기 패. cd는 쓴 뒤 다시 쓸 수 있을 때까지의 차례 수.
//   hits: 치는 칸.  line: 앞쪽으로 처음 만나는 것 하나.  push: 한 칸 밀어냄(막히면 1 피해).
//   stun: 그 차례 수만큼 묶음.  dash: 앞의 적을 넘어 그 뒤 빈칸으로 가며 돌아선다.
//   all: 모든 적.
const TILES = {
  sword: { dmg: 2, cd: 2, hits: [1] },
  spear: { dmg: 1, cd: 3, hits: [1, 2] },
  bow: { dmg: 1, cd: 3, line: true },
  flail: { dmg: 1, cd: 3, hits: [-1, 1] },
  twin: { dmg: 1, cd: 3, hits: [1], times: 2 },
  kick: { dmg: 0, cd: 2, hits: [1], push: 1 },
  charm: { dmg: 0, cd: 4, line: true, stun: 2 },
  dash: { dmg: 0, cd: 3, dash: true },
  mapae: { dmg: 0, cd: 7, all: true, stun: 1 },
};

const START_TILES = ['sword', 'bow'];

// 적. 공격은 위에서부터 보고, 무늬 안에 어사가 있는 첫 공격을 고른다.
//   wind: 준비 차례 수(머리 위 숫자). 0이 되는 차례에 그 무늬를 친다 — 그 사이 비키면 헛친다.
//   pull: 맞은 어사를 제 앞으로 끌어온다.  shield: 앞에서 오는 피해를 1 줄인다.
//   blink: 닿지 않으면 걷지 않고 어사 뒤 빈칸으로 옮겨 간다.  keep: 붙으면 한 칸 물러선다.
//   both: 돌아설 필요가 없다(무늬가 양쪽).  summon: 그 차례마다 졸개를 부른다(곁에 졸개가 max 미만일 때만).
const ENEMIES = {
  bandit: { hp: 3, attacks: [{ hits: [1], dmg: 1, wind: 2 }] },
  spearman: { hp: 3, attacks: [{ hits: [1, 2], dmg: 1, wind: 2 }] },
  archer: { hp: 2, keep: true, attacks: [{ line: true, dmg: 1, wind: 2 }] },
  assassin: { hp: 2, attacks: [{ hits: [1], dmg: 2, wind: 1 }] },
  guard: { hp: 4, shield: true, attacks: [{ hits: [1], dmg: 1, wind: 2 }] },
  dokkaebi: { hp: 6, both: true, attacks: [{ hits: [-1, 1], dmg: 2, wind: 3 }] },
  gumiho: { hp: 4, blink: true, attacks: [{ hits: [1], dmg: 1, wind: 2 }] },
  mulgwisin: { hp: 3, attacks: [{ line: true, dmg: 1, wind: 2, pull: true }] },
  // 첫 우두머리. 창이 두 칸을 닿아 붙어서 베려면 한 번은 그 안에 들어가야 하므로, 준비를 셋으로 두어
  // 들어가 베고 빠질 틈을 준다. 둘이었을 때는 맞지 않고 붙을 길이 없어 한 번에 2씩 깎였다.
  chief: { hp: 8, boss: true, summon: { every: 7, kind: 'bandit', max: 1 }, attacks: [{ hits: [1, 2], dmg: 2, wind: 3 }] },
  magistrate: { hp: 12, boss: true, shield: true, summon: { every: 5, kind: 'guard', max: 2 }, attacks: [{ hits: [1], dmg: 1, wind: 1 }] },
  imugi: { hp: 18, boss: true, attacks: [{ hits: [-1], dmg: 1, wind: 1 }, { hits: [1, 2, 3], dmg: 2, wind: 3 }] },
};

// 여정: 고을 셋. 싸움은 차례에 맞춰 양 끝에서 들어오는 적의 목록이다([차례, 적]).
// 사이사이 주막(사고팔기)과 서낭당(복 하나)이 들어간다.
const REGIONS = [
  {
    id: 'pass',
    nodes: [
      { type: 'fight', waves: [[0, 'bandit'], [3, 'bandit']] },
      { type: 'fight', waves: [[0, 'spearman'], [2, 'bandit'], [6, 'archer']] },
      { type: 'inn' },
      { type: 'fight', waves: [[0, 'archer'], [0, 'bandit'], [4, 'spearman'], [8, 'bandit']] },
      { type: 'boss', waves: [[0, 'chief'], [2, 'bandit']] },
    ],
  },
  {
    id: 'town',
    nodes: [
      { type: 'fight', waves: [[0, 'guard'], [2, 'assassin'], [6, 'archer']] },
      { type: 'shrine' },
      { type: 'fight', waves: [[0, 'assassin'], [1, 'assassin'], [5, 'guard'], [8, 'spearman']] },
      { type: 'inn' },
      { type: 'boss', waves: [[0, 'magistrate'], [0, 'guard'], [4, 'assassin']] },
    ],
  },
  {
    id: 'mountain',
    nodes: [
      { type: 'fight', waves: [[0, 'dokkaebi'], [3, 'gumiho']] },
      { type: 'fight', waves: [[0, 'mulgwisin'], [1, 'gumiho'], [5, 'dokkaebi']] },
      { type: 'shrine' },
      { type: 'inn' },
      { type: 'boss', waves: [[0, 'imugi'], [6, 'gumiho'], [12, 'mulgwisin']] },
    ],
  },
];

// 싸움 뒤 엽전과 회복. 우두머리는 무기 패 하나를 더 고르게 한다. 싸움 뒤에 조금이라도 회복하지
// 않으면 첫 고을에서 깎인 체력이 끝까지 따라와, 한 번 크게 맞은 여정은 회복할 길이 엽전뿐이었다.
const PAY = { fight: 4, boss: 8 };
const REST = 1;

// 주막. 국밥은 체력, 보약은 최대 체력, 대장간은 패 하나를 벼린다(피해 +1, 없으면 cd -1).
const INN = {
  soup: { cost: 3, heal: 3 },
  tonic: { cost: 6, maxHp: 1 },
  forge: { cost: 4 },
  tile: { cost: 6 },
};

// 서낭당의 복. 셋 중 하나를 받는다.
//   pouch: 모든 패의 기다림 -1(1 아래로는 안 간다).  robe: 싸움마다 처음 받는 공격 하나를 막는다.
//   water: 싸움이 끝날 때 체력 1 회복.  sash: 쌓아 둘 수 있는 패 +1.
const BLESSINGS = ['pouch', 'robe', 'water', 'sash'];

const api = { LANE, QUEUE_MAX, START_HP, TILES, START_TILES, ENEMIES, REGIONS, PAY, REST, INN, BLESSINGS };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.AmhaengData = api;

})(typeof window !== 'undefined' ? window : globalThis);

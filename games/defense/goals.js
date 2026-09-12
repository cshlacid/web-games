'use strict';

// 스테이지마다 붙는 목표. **못 채워도 클리어는 클리어다** — 실패 조건으로 만들면
// 매 판이 시험이 되고, 한 번 삐끗한 판을 끝까지 미는 재미가 사라진다.
//
// 목표는 스테이지 씨드로 고정한다. 재도전할 때 같은 목표가 나와야 "이번엔 목표를
// 노리고"가 성립한다. 스테이지가 무한하니 목표도 계속 새로 나온다.
//
// 판정은 판이 남긴 통계만 본다. 규칙을 다시 돌릴 필요가 없어 목표 하나가 한 줄이다.
(function () {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : window.DefenseData;

// 편성에 무엇이 들었는지 보는 목표는 두지 않았다. 가진 캐릭터가 사람마다 다른데
// 목표는 스테이지로 고정이라, "궁수 없이"가 궁수밖에 없는 사람에게는 불가능해진다.
// 이름과 설명은 화면 쪽 사전에 있다 — id가 열쇠이고, arg가 문장에 끼는 값이다.
const GOALS = [
  {
    id: 'flawless', hard: true,
    test: (s) => s.livesLost === 0,
  },
  {
    id: 'swift', hard: false,
    arg: (stage, next) => 150 + Math.floor(next() * 3) * 15,
    test: (s, a) => s.time <= a,
  },
  {
    id: 'thrifty', hard: true,
    arg: (stage, next) => 4 + Math.floor(next() * 3),
    test: (s, a) => s.placed <= a,
  },
  {
    id: 'purist', hard: false,
    test: (s) => Object.keys(s.kinds).length <= 1,
  },
  {
    id: 'saver', hard: false,
    arg: (stage, next) => 120 + Math.floor(next() * 4) * 40,
    test: (s, a) => s.goldLeft >= a,
  },
  {
    id: 'barehand', hard: false,
    test: (s) => s.upgrades === 0,
  },
  {
    id: 'behead', hard: true,
    arg: (stage, next) => 16 + Math.floor(next() * 3) * 6,
    test: (s, a) => s.bossAt != null && s.bossFrom != null && (s.bossAt - s.bossFrom) <= a,
  },
];

function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function goalOf(stage) {
  const next = createRng(Math.imul(stage + 13, 0xC2B2AE35));
  const pick = GOALS[Math.floor(next() * GOALS.length)];
  const arg = pick.arg ? pick.arg(stage, next) : null;
  return { id: pick.id, hard: pick.hard, arg };
}

const byId = (id) => GOALS.find((g) => g.id === id);

function met(goal, stats) {
  const def = byId(goal.id);
  return !!def && !!stats && def.test(stats, goal.arg);
}

// 어려운 목표는 뽑을 카드를 한 장 더 주고 보석도 더 준다.
const bonusOf = (goal) => (goal.hard ? { cards: 4, gems: 1.5 } : { cards: 3, gems: 1.25 });

const Goals = { GOALS, goalOf, met, bonusOf, byId };

if (typeof module !== 'undefined' && module.exports) module.exports = Goals;
if (typeof window !== 'undefined') window.DefenseGoals = Goals;

})();

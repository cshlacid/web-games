'use strict';

const R = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./rules.js')
  : window.DoppelRules;
const S = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./solver.js')
  : window.DoppelSolver;

// 단서를 전부 주는 퍼즐이라 스도쿠처럼 단서를 빼며 조각내는 단계가 없다. 대신
// 정답을 뽑고 단서를 읽어, 조건에 맞을 때까지 다시 뽑는다. 논리로 끝까지 풀리는
// 판만 통과시키므로 유일해는 따라온다 — 추론에 분기가 없기 때문이다.

const CHEAP = S.TECHNIQUE_NAMES.filter((name) => name !== 'lineArrangements');

// 크기마다 "배치 좁히기"가 필요한 횟수의 분포가 달라서 경계도 크기별로 잡는다.
// 실측 중앙값이다: 5×5는 5회, 6×6은 8회.
//
// 4×4는 숫자가 1과 2뿐이라 판의 가짓수 자체가 적고, 배치 좁히기가 필요한 판은
// 전부 정확히 5회로 몰린다. 등급을 셋으로 나눌 여지가 없어서 어려움을 두지
// 않는다 — 있지도 않은 난이도를 고르게 하고 폴백으로 다른 판을 내주는 것보다
// 고를 수 없다고 하는 편이 정직하다.
const MEDIUM_LIMIT = { 4: Infinity, 5: 5, 6: 8 };

const LEVELS_BY_SIZE = { 4: ['easy', 'medium'], 5: ['easy', 'medium', 'hard'], 6: ['easy', 'medium', 'hard'] };

const levelsFor = (n) => LEVELS_BY_SIZE[n] || [];

const LEVELS = {
  easy: {
    label: '쉬움',
    // 배치 좁히기 없이, 값싼 추론만으로 끝까지 풀리는 판.
    accept: (report) => report.solved && report.arrangementCalls === 0,
  },
  medium: {
    label: '보통',
    accept: (report, n) => report.solved
      && report.arrangementCalls > 0
      && report.arrangementCalls <= MEDIUM_LIMIT[n],
  },
  hard: {
    label: '어려움',
    accept: (report, n) => report.solved && report.arrangementCalls > MEDIUM_LIMIT[n],
  },
};

const SIZES = [4, 5, 6];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(n = 6, level = 'easy', options = {}) {
  const config = LEVELS[level];
  if (!config) throw new Error(`알 수 없는 난이도: ${level}`);
  if (!SIZES.includes(n)) throw new Error(`지원하지 않는 크기: ${n}`);
  if (!levelsFor(n).includes(level)) throw new Error(`${n}×${n}에는 ${config.label} 난이도가 없습니다`);

  const rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);
  const attempts = options.attempts || 4000;

  let fallback = null;
  for (let i = 0; i < attempts; i++) {
    const solution = R.randomSolution(n, rng);
    const { rowClues, colClues } = R.cluesOf(n, solution);
    const report = S.grade(n, rowClues, colClues);
    if (!report.solved) continue;

    const made = {
      n,
      level,
      label: config.label,
      rowClues,
      colClues,
      solution,
      arrangementCalls: report.arrangementCalls,
      hardest: report.hardest,
    };
    if (config.accept(report, n)) return made;
    // 조건에 못 미쳐도 "힌트만으로 풀린다"는 보장은 지켜진 판이다. 판을 못
    // 내주는 것보다는 난이도가 조금 어긋난 판을 내주는 편이 낫다.
    fallback = fallback || made;
  }
  return fallback;
}

const Generator = { LEVELS, SIZES, CHEAP, MEDIUM_LIMIT, levelsFor, generate, mulberry32 };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.DoppelGenerator = Generator;

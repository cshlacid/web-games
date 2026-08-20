'use strict';

// 브라우저에서는 클래식 스크립트가 전역 렉시컬 스코프를 공유한다. 파일마다
// 최상위에 같은 이름을 선언하면 다른 파일과 충돌해 페이지 전체가 죽는다
// (solver.js와 generator.js가 둘 다 const R을 두고 있었다). IIFE로 가둔다.
(function () {

const R = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./rules.js')
  : window.DoppelRules;
const S = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./solver.js')
  : window.DoppelSolver;
const P = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./puzzles.js')
  : window.DoppelPuzzles;

// 단서를 전부 주는 퍼즐이라 스도쿠처럼 단서를 빼며 조각내는 단계가 없다. 대신
// 정답을 뽑고 단서를 읽어, 조건에 맞을 때까지 다시 뽑는다. 논리로 끝까지 풀리는
// 판만 통과시키므로 유일해는 따라온다 — 추론에 분기가 없기 때문이다.

const CHEAP = S.TECHNIQUE_NAMES.filter(
  (name) => name !== 'lineArrangements' && name !== 'crossLines');

/**
 * 난이도는 "끝까지 푸는 데 어떤 논리까지 필요했는가"로 가른다. 기법 목록은
 * 사람 눈에 쉬운 순서로 놓여 있으므로, 그중 가장 뒤엣것이 그 판의 벽이다.
 *
 * 예전에는 "배치 좁히기가 몇 번 필요했나"로 셌다. 그 수는 크기에 따라 크게
 * 달라져서 경계를 크기마다 따로 잡아야 했고, 그래서 크기와 난이도가 서로
 * 묶여 있었다. 필요한 논리로 가르면 그 경계가 크기와 무관해진다 — 크기를
 * 무작위로 고를 수 있게 된 것이 이 바꿈의 목적이다.
 */
function levelOf(report) {
  if (!report.solved) return null;
  if (report.hardest === 'crossLines') return 'hard';
  if (report.hardest === 'lineArrangements') return 'medium';
  return 'easy';
}

/**
 * 난이도마다 나올 수 있는 크기. 무작위 정답을 매겨 본 실측에서 고른 것이다.
 *
 * 4×4는 숫자가 1과 2뿐이라 맞물림까지 갈 판이 안 나오고, 7×7은 반대로 배치
 * 좁히기 없이 끝나는 판이 안 나온다. 없는 것을 고르게 할 수는 없다.
 *
 * 8×8이 어려움에 있는 이유는 다르다. 8×8은 논리 깊이로 매기면 보통이다 —
 * 3만 판을 매겨 봐도 맞물림이 결정타가 된 판이 없었다. 그런데도 어려움에
 * 두는 것은 64칸에 줄마다 숫자 여섯 개라 손으로 따질 것의 양 자체가 벽이기
 * 때문이다. 그래서 이 등급만 기준이 둘이고, 도움말에도 그렇게 적어 두었다.
 */
const SIZES_BY_LEVEL = {
  easy: [4, 5, 6],
  medium: [4, 5, 6, 7],
  hard: [5, 6, 7, 8],
};

const LEVELS = {
  easy: { label: '쉬움', note: '배치 좁히기 없이 풀립니다' },
  medium: { label: '보통', note: '배치 좁히기가 필요합니다' },
  hard: { label: '어려움', note: '맞물림까지 따지거나, 8×8을 상대합니다' },
};

const LEVEL_NAMES = ['easy', 'medium', 'hard'];

const SIZES = [...new Set(LEVEL_NAMES.flatMap((level) => SIZES_BY_LEVEL[level]))].sort();

// 난이도마다 판을 다시 뽑아야 하는 횟수가 자릿수로 다르다. 어려움은 무작위
// 판 1000개에 하나꼴이라, 쉬움과 같은 횟수를 주면 등급이 어긋난 판을 내주는
// 일이 심심찮게 생긴다.
const ATTEMPTS = { easy: 4000, medium: 4000, hard: 60000 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 미리 구워 둔 목록에서 한 판 꺼낸다. 정답은 담겨 있지 않으므로 솔버로
 * 되찾는다 — 논리로 풀리는 판만 구웠으니 이것이 성립한다.
 *
 * 못 푸는 항목을 만나면 건너뛴다. 기법을 고치다 보면 예전에 굽힌 판이 더는
 * 안 풀리게 될 수 있는데, 그때 게임이 죽는 것보다 다음 판을 내주는 편이 낫다.
 * 그런 일이 생겼는지는 테스트가 목록 전체를 풀어 보며 잡는다.
 */
function fromBaked(n, level, rng) {
  const list = P.BAKED[n] || [];
  const start = Math.floor(rng() * list.length);
  for (let k = 0; k < list.length; k++) {
    const [rowClues, colClues] = list[(start + k) % list.length];
    const result = S.solveLogically(n, rowClues, colClues);
    if (!result.solved) continue;
    let hardest = null;
    for (const name of S.TECHNIQUE_NAMES) if (result.used.has(name)) hardest = name;
    return {
      n,
      level,
      label: LEVELS[level].label,
      rowClues: [...rowClues],
      colClues: [...colClues],
      solution: result.grid,
      hardest,
      baked: true,
    };
  }
  return null;
}

/**
 * 크기는 난이도가 고른다. 고른 뒤에는 그 크기로만 다시 뽑는다 — 매번 크기를
 * 바꿔 가며 뽑으면 흔한 크기가 거의 항상 이겨서 무작위가 무색해진다.
 */
function generate(level = 'medium', options = {}) {
  if (!LEVELS[level]) throw new Error(`알 수 없는 난이도: ${level}`);
  const rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);

  const sizes = SIZES_BY_LEVEL[level];
  let n = options.n;
  if (n === undefined) n = sizes[Math.floor(rng() * sizes.length)];
  else if (!sizes.includes(n)) throw new Error(`${n}×${n}에는 ${LEVELS[level].label} 난이도가 없습니다`);

  // 목록에 있는 크기는 목록에서만 꺼낸다. 그 자리에서 뽑기에는 너무 드물어서
  // 구워 둔 것이라, 목록이 비었다고 실시간 생성으로 넘어가면 몇 분이 걸린다.
  if (P.BAKED[n]) {
    const made = fromBaked(n, level, rng);
    if (made) return made;
    const rest = sizes.filter((size) => !P.BAKED[size]);
    if (!rest.length) return null;
    return generate(level, { ...options, rng, n: rest[Math.floor(rng() * rest.length)] });
  }

  const attempts = options.attempts || ATTEMPTS[level];

  let fallback = null;
  for (let i = 0; i < attempts; i++) {
    const solution = R.randomSolution(n, rng);
    const { rowClues, colClues } = R.cluesOf(n, solution);
    const report = S.grade(n, rowClues, colClues);
    const made = levelOf(report);
    if (!made) continue;

    const puzzle = {
      n,
      level,
      label: LEVELS[level].label,
      rowClues,
      colClues,
      solution,
      hardest: report.hardest,
      baked: false,
    };
    if (made === level) return puzzle;
    // 조건에 못 미쳐도 "힌트만으로 풀린다"는 보장은 지켜진 판이다. 판을 못
    // 내주는 것보다는 난이도가 조금 어긋난 판을 내주는 편이 낫다.
    fallback = fallback || puzzle;
  }
  return fallback;
}

const Generator = { LEVELS, LEVEL_NAMES, SIZES, SIZES_BY_LEVEL, CHEAP, ATTEMPTS, BAKED: P.BAKED, levelOf, generate, mulberry32 };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.DoppelGenerator = Generator;

})();

'use strict';

const S = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./solver.js')
  : window.SudokuSolver;

// 난이도는 "허용할 기법"으로 정의한다. 단서 개수로 정하면 실제 어려움과 어긋난다
// — 단서가 적어도 쉬운 판이 있고 그 반대도 있다.
const LEVELS = {
  easy: {
    label: '쉬움',
    allowed: ['nakedSingle', 'hiddenSingle'],
    // 기법만으로 난이도를 나누면 세 등급이 다 단서 20여 개짜리가 된다. 한 수
    // 한 수가 쉬워도 빈칸이 60개면 쉬운 판이 아니다. 그래서 남길 단서의 하한을
    // 함께 둔다.
    minGivens: 36,
    // 이 등급으로 내보내려면 적어도 이만큼은 필요해야 한다. 없으면 "어려움"을
    // 골라도 단순한 판이 나올 수 있다.
    require: null,
  },
  medium: {
    label: '보통',
    allowed: ['nakedSingle', 'hiddenSingle', 'pointing', 'claiming', 'nakedPair', 'hiddenPair'],
    minGivens: 30,
    require: 'pointing',
  },
  hard: {
    label: '어려움',
    allowed: S.TECHNIQUE_NAMES,
    minGivens: 0, // 뺄 수 있는 데까지 뺀다
    require: 'nakedPair',
  },
};

// 재현 가능한 난수. 테스트에서 같은 씨앗으로 같은 판을 만들 수 있어야 한다.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 완성된 판 하나. 여기서는 추측해도 된다 — 사람이 푸는 과정이 아니다. */
function fullGrid(rng) {
  const state = S.emptyState();

  const fill = () => {
    let target = -1, best = 10;
    for (let i = 0; i < S.CELLS; i++) {
      if (state.values[i]) continue;
      const n = S.popcount(state.cands[i]);
      if (n === 0) return false;
      if (n < best) { best = n; target = i; }
    }
    if (target === -1) return true;

    const digits = [];
    for (let d = 1; d <= 9; d++) if (state.cands[target] & S.bitOf(d)) digits.push(d);
    for (const digit of shuffle(digits, rng)) {
      const snapshot = S.cloneState(state);
      if (S.assign(state, target, digit) && fill()) return true;
      state.values.set(snapshot.values);
      state.cands.set(snapshot.cands);
      state.broken = snapshot.broken;
    }
    return false;
  };

  if (!fill()) throw new Error('완성판 생성 실패');
  return S.toString(state);
}

const rank = (name) => S.TECHNIQUE_NAMES.indexOf(name);

/**
 * 단서를 하나씩 빼되, 뺀 뒤에도 허용된 기법만으로 끝까지 풀리는 동안만 뺀다.
 * 그래서 나오는 판은 전부 "주어진 힌트만으로 찍지 않고 풀 수 있는" 판이다.
 * 논리만으로 풀린다는 것은 추론에 분기가 없다는 뜻이므로 유일해도 따라온다.
 */
function carve(solution, allowed, rng, minGivens = 0) {
  const cells = [...solution];
  let givens = S.CELLS;
  for (const index of shuffle([...Array(S.CELLS).keys()], rng)) {
    if (givens <= minGivens) break;
    const saved = cells[index];
    cells[index] = '.';
    if (S.solveLogically(cells.join(''), allowed).solved) givens--;
    else cells[index] = saved;
  }
  return cells.join('');
}

function generate(level = 'easy', options = {}) {
  const config = LEVELS[level];
  if (!config) throw new Error(`알 수 없는 난이도: ${level}`);
  const rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);
  const attempts = options.attempts || 40;

  let fallback = null;
  for (let i = 0; i < attempts; i++) {
    const solution = fullGrid(rng);
    const puzzle = carve(solution, config.allowed, rng, config.minGivens);
    const hardest = S.hardestTechnique(puzzle, config.allowed);
    const result = {
      level,
      label: config.label,
      puzzle,
      solution,
      hardest,
      givens: [...puzzle].filter((ch) => ch !== '.').length,
    };
    if (!config.require || rank(hardest) >= rank(config.require)) return result;
    fallback = fallback || result;
  }
  // 요구 등급에 못 미쳐도 "힌트만으로 풀린다"는 조건은 지켜진 판이다. 판을 못
  // 내주는 것보다 조금 쉬운 판을 내주는 편이 낫다.
  return fallback;
}

const Generator = { LEVELS, generate, fullGrid, carve, mulberry32, shuffle };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.SudokuGenerator = Generator;

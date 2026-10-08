'use strict';

// 판을 굽는다. 사이트는 이 파일을 부르지 않는다 — 구운 결과(`puzzles.js`)만 싣는다.
//
//   node games/whodunit/bake.js > games/whodunit/puzzles.js
//
// **정체부터 정하고, 사람을 밝히는 차례대로 단서를 단다.**
//   1. 스무 명의 정체·이름·직업을 정한다.
//   2. 처음 밝힐 사람을 고르고, 그 사람의 단서를 단다.
//   3. 밝힌 사람들의 단서로 논리로 정해지는 사람(아직 안 밝힌) 중 하나를 다음에 밝히고, 그 사람의
//      단서를 단다. 단서는 참인 것 중에서 고르되, **달고 나서도 논리로 정해지는 안 밝힌 사람이
//      남게** 고른다. 그래서 어느 순간에도 밝힐 수 있는 사람이 있다.
//   4. 스무 명이 다 밝혀질 때까지.
// 단서가 많을수록 정해지는 것도 늘기만 하므로, 사람이 다른 차례로 밝혀도 막히지 않는다.
(function () {

const R = require('./rules.js');
const S = require('./solver.js');

// 난이도마다 쓰는 단서 갈래, 가정을 쓰는지, 한 판에 가정이 드는 걸음의 최소·최대.
//   쉬움: 이웃·줄·위아래·직업의 수만. 보통: 가장자리·모서리, 줄끼리 비교, 홀짝을 더한다.
//   어려움: 이어짐까지 더하고, 가정이 드는 자리를 일부러 남긴다.
const LEVELS = {
  easy: { types: ['N', 'RC', 'ABLG', 'J'], extra: [], trial: false, minTrials: 0, maxTrials: 0, count: 60 },
  normal: { types: ['N', 'RC', 'ABLG', 'J', 'EK'], extra: ['>', '~', '%'], trial: true, minTrials: 0, maxTrials: 2, count: 60 },
  hard: { types: ['N', 'RC', 'ABLG', 'J', 'EK'], extra: ['>', '~', '%', '&'], trial: true, minTrials: 2, maxTrials: 8, count: 60 },
};

// 이름 목록의 길이. 판마다 이 중 스물을 골라 번호 순서대로 앉힌다 — 목록이 가나다순이라
// 판 위의 이름도 가나다순으로 놓여, 단서에 나온 이름을 판에서 찾기 쉽다.
const NAME_POOL = 30;

function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (random, n) => Math.floor(random() * n);

function shuffle(random, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = int(random, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// 1. 정체·이름·직업. 범인은 일곱에서 열하나 — 너무 적거나 많으면 "다 무고"류 단서가 판을 거저 푼다.
function people(random) {
  let truth = 0;
  do {
    truth = 0;
    for (let i = 0; i < R.N; i++) if (random() < 0.45) truth |= 1 << i;
  } while (R.popcount(truth) < 7 || R.popcount(truth) > 11);
  const names = shuffle(random, Array.from({ length: NAME_POOL }, (_, k) => k)).slice(0, R.N).sort((a, b) => a - b);
  // 직업은 여섯 가지를 골라 서너 명씩. 한 명뿐인 직업은 직업 단서가 곧 그 사람 이야기라 뺀다.
  const jobIds = shuffle(random, Array.from({ length: R.JOBS }, (_, k) => k)).slice(0, 6);
  const jobs = shuffle(random, Array.from({ length: R.N }, (_, i) => jobIds[i % 6]));
  return { truth, names, jobs };
}

// 말하는 사람 p가 할 수 있는 참인 단서 전부.
function candidates(puzzle, p, spec) {
  const out = [];
  const crim = puzzle.truth;
  const add = (clue) => {
    R.attach(clue, puzzle);
    if (R.holds(clue, crim)) out.push(clue);
  };
  const sets = [];
  const has = (t) => spec.types.includes(t);
  if (has('N')) {
    for (const q of [p, ...R.bits(R.setMask({ kind: 'N', arg: p }, puzzle))]) sets.push({ kind: 'N', arg: q });
  }
  if (has('RC')) {
    for (let r = 0; r < R.H; r++) sets.push({ kind: 'R', arg: r });
    for (let c = 0; c < R.W; c++) sets.push({ kind: 'C', arg: c });
  }
  if (has('ABLG')) for (const kind of 'ABLG') sets.push({ kind, arg: p });
  if (has('J')) for (const j of new Set(puzzle.jobs)) sets.push({ kind: 'J', arg: j });
  if (has('EK')) sets.push({ kind: 'E', arg: 0 }, { kind: 'K', arg: 0 });
  const useful = sets.filter((set) => R.popcount(R.setMask(set, puzzle)) >= 1);
  for (const set of useful) {
    for (const side of 'ci') {
      const mask = R.setMask(set, puzzle);
      const n = R.popcount(mask & (side === 'c' ? crim : ~crim & R.FULL));
      add({ type: '=', sets: [set], side, n });
    }
  }
  const lines = [];
  for (let r = 0; r < R.H; r++) lines.push({ kind: 'R', arg: r });
  for (let c = 0; c < R.W; c++) lines.push({ kind: 'C', arg: c });
  if (spec.extra.includes('%')) {
    for (const set of lines) {
      for (const side of 'ci') add({ type: '%', sets: [set], side, n: R.popcount(R.setMask(set, puzzle) & (side === 'c' ? crim : ~crim & R.FULL)) % 2 });
    }
  }
  if (spec.extra.includes('>') || spec.extra.includes('~')) {
    for (const a of lines) {
      for (const b of lines) {
        if (a === b || a.kind !== b.kind) continue;
        for (const side of 'ci') {
          if (spec.extra.includes('>')) add({ type: '>', sets: [a, b], side, n: 0 });
          if (spec.extra.includes('~') && a.arg < b.arg) add({ type: '~', sets: [a, b], side, n: 0 });
        }
      }
    }
  }
  if (spec.extra.includes('&')) {
    for (const set of lines) {
      for (const side of 'ci') {
        // 둘 이상일 때만 뜻이 있다. 하나 이하면 이어졌다는 말이 거저 참이다.
        const n = R.popcount(R.setMask(set, puzzle) & (side === 'c' ? crim : ~crim & R.FULL));
        if (n >= 2) add({ type: '&', sets: [set], side, n: 0 });
      }
    }
  }
  return out;
}

// 단서를 하나 더 달았을 때 논리로 정해지는 사람.
function reach(puzzle, revealed, spec) {
  return S.deduce(puzzle, revealed, { trial: spec.trial });
}

function make(level, seed) {
  const spec = LEVELS[level];
  const random = rng(seed * 7919 + level.length);
  const puzzle = { ...people(random), start: int(random, R.N), clues: new Array(R.N).fill(null) };
  let revealed = 0;
  let known = 0;
  let speaker = puzzle.start;
  let trialSteps = 0;
  while (speaker >= 0) {
    const after = revealed | (1 << speaker);
    // 같은 단서를 두 사람이 말하면 하나는 빈말이다.
    const said = new Set(puzzle.clues.filter(Boolean).map(R.encodeClue));
    const list = shuffle(random, candidates(puzzle, speaker, spec).filter((c) => !said.has(R.encodeClue(c))));
    let pick = null;
    let fallback = null;
    let stingy = null;
    for (const clue of list) {
      puzzle.clues[speaker] = clue;
      const got = reach(puzzle, after, spec);
      const pending = got.known & ~after;
      if (after !== R.FULL && !pending) continue;
      const gain = R.popcount(got.known & ~known & ~(1 << speaker));
      // 가정을 써야만 정해지는 사람이 생기는 단서. 어려움은 이런 자리를 일부러 찾는다.
      const needsTrial = spec.trial && got.trials > 0 && (got.known & ~S.deduce(puzzle, after).known) !== 0;
      // 한 번에 많이 풀어 주는 단서는 뒤로 미룬다. 단서 하나가 서넛을 한꺼번에 정하면 판이 금방 끝난다.
      const good = gain >= 1 && gain <= 3;
      const one = { clue, got, needsTrial };
      if (level === 'hard' ? needsTrial && gain >= 1 : good) { pick = one; break; }
      if (!fallback || (good && !fallback.good)) fallback = { ...one, good };
      // 어려움은 당장 아무도 정하지 못하는 단서도 아껴 둔다. 늘 바로 하나씩 정해 주는 단서만 달면
      // 판에 정보가 넘쳐 가정이 들 자리가 생기지 않는다.
      if (level === 'hard' && gain === 0 && !stingy) stingy = one;
    }
    const chosen = pick || (stingy && random() < 0.7 ? stingy : null) || fallback;
    if (!chosen) return null;
    puzzle.clues[speaker] = chosen.clue;
    if (chosen.needsTrial) trialSteps++;
    revealed = after;
    known = chosen.got.known;
    const pending = R.bits(known & ~revealed);
    speaker = pending.length ? pending[int(random, pending.length)] : -1;
  }
  if (revealed !== R.FULL) return null;
  if (trialSteps < spec.minTrials || trialSteps > spec.maxTrials) return null;
  return { code: R.encode(puzzle), trialSteps };
}

function bake(level, count, startSeed) {
  const list = [];
  for (let seed = startSeed; list.length < count; seed++) {
    const one = make(level, seed);
    if (!one || list.includes(one.code)) continue;
    list.push(one.code);
  }
  return list;
}

module.exports = { LEVELS, NAME_POOL, rng, people, candidates, make, bake };

if (require.main === module) {
  const out = {};
  const started = Date.now();
  for (const level of Object.keys(LEVELS)) {
    out[level] = bake(level, LEVELS[level].count, 1);
    process.stderr.write(`${level}: ${out[level].length}판 (${((Date.now() - started) / 1000).toFixed(1)}초)\n`);
  }
  const body = Object.keys(out).map((level) => {
    const rows = out[level].map((code) => `    '${code}',`).join('\n');
    return `  ${level}: [\n${rows}\n  ],`;
  }).join('\n');
  process.stdout.write(`'use strict';

// 구워 둔 판. 손으로 고치지 않는다 — \`node games/whodunit/bake.js\`로 다시 굽는다.
// 판 하나의 꼴은 rules.js의 \`parse\` 머리말에 있다.
(function () {

const PUZZLES = {
${body}
};

const api = { PUZZLES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.WhodunitPuzzles = api;

})();
`);
}

})();

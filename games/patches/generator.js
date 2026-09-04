'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.PatchesRules;
const S = (typeof require !== 'undefined') ? require('./solver.js') : window.PatchesSolver;

// 판을 만드는 순서는 푸는 순서의 반대다. 격자를 직사각형으로 먼저 나누고, 조각마다
// 칸 하나를 골라 단서를 놓는다. 정답에서 거꾸로 만들기 때문에 풀리지 않는 판이
// 나올 수 없다.
//
// 남는 문제는 "얼마나 알려 줄 것인가"다. 칸 수와 모양을 전부 보여 주면 거의 다
// 유일해지만 그런 판은 읽기만 하면 끝난다. 그래서 **다 보여 준 판에서 하나씩 빼
// 본다** — 빼도 답이 하나면 그 정보는 없어도 됐던 것이다. 원작에 있는 네 가지
// 단서(숫자만·모양만·둘 다·자유)가 이 과정에서 저절로 나온다.

const SIZES = [6, 7, 8];

// 조각의 한 변과 넓이 상한. 상한이 없으면 한 조각이 판의 절반을 차지하는 판이
// 흔히 나오고, 그런 판은 조각 수가 너무 적어 금방 끝난다.
const MAX_SIDE = 4;
const MAX_AREA = 8;

// 1×1 조각은 단서가 곧 답이라 판을 채우는 재미가 없다. 넓이에 비례해 뽑아 큰
// 조각 쪽으로 기울인다 — 아예 막지는 않는다. 구석에 한 칸만 남는 자리가 있다.
const AREA_BIAS = 1.6;

const ATTEMPTS = 200;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// 아직 빈 칸 중 가장 왼쪽 위를 늘 조각의 왼쪽 위 모서리로 삼는다. 그 칸보다
// 위나 왼쪽에는 빈 칸이 없으므로 조각은 오른쪽 아래로만 뻗으면 되고, 1×1은
// 언제나 놓을 수 있어 이 방법은 반드시 격자를 다 채운다.
function partition(size, rng) {
  const n = size * size;
  const owner = new Int32Array(n).fill(-1);
  const rects = [];

  for (let cell = 0; cell < n; cell++) {
    if (owner[cell] !== -1) continue;
    const r = Math.floor(cell / size);
    const c = cell % size;

    const options = [];
    for (let w = 1; w <= MAX_SIDE && c + w <= size; w++) {
      if (owner[r * size + c + w - 1] !== -1) break;
      for (let h = 1; h <= MAX_SIDE && r + h <= size; h++) {
        if (w * h > MAX_AREA) break;
        let free = true;
        for (let y = r; y < r + h && free; y++) {
          for (let x = c; x < c + w; x++) {
            if (owner[y * size + x] !== -1) { free = false; break; }
          }
        }
        if (!free) break;
        options.push({ r, c, w, h });
      }
    }

    const weights = options.map((rect) => Math.pow(rect.w * rect.h, AREA_BIAS));
    let roll = rng() * weights.reduce((a, b) => a + b, 0);
    let pick = options[options.length - 1];
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { pick = options[i]; break; }
    }

    const id = rects.length;
    for (const inside of R.cells(size, pick)) owner[inside] = id;
    rects.push(pick);
  }

  return rects;
}

function build(size, rects, clues) {
  return { size, clues: clues.map((clue) => ({ ...clue })), solution: rects.map((r) => ({ ...r })) };
}

function generate(size, options = {}) {
  if (!SIZES.includes(size)) throw new Error(`지원하지 않는 크기: ${size}`);
  const rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rects = partition(size, rng);
    // 조각이 너무 적으면 판이 아니라 그림이 된다.
    if (rects.length < size + 2) continue;

    const clues = rects.map((rect) => {
      const spots = R.cells(size, rect);
      return {
        cell: spots[Math.floor(rng() * spots.length)],
        area: rect.w * rect.h,
        shape: R.shapeOf(rect.w, rect.h),
      };
    });

    // 판정은 유일해가 아니라 **논리로 풀리는가**로 한다. 사람 규칙만으로 끝까지
    // 가는 판은 그 자체로 답이 하나뿐이고(놓는 자리마다 다른 수가 없었으므로),
    // 유일해이기만 한 판 중에는 마지막에 두 자리를 놓고 찍어야 하는 것이 섞여
    // 있다. 실제로 유일해만 보고 깎았더니 8×8에서는 논리로 끝나는 판이 하나도
    // 나오지 않았다.
    if (!S.logicSolve(build(size, rects, clues)).solved) continue;

    // 하나씩 빼 본다. 빼도 논리로 풀리면 그 정보는 없어도 됐던 것이다.
    //
    // **숫자를 먼저 뺀다.** 둘을 섞어 빼면 숫자가 남는 쪽으로 기울어 모양 아이콘이
    // 거의 사라지는데, 그러면 시카쿠와 다를 것이 없어진다. 모양이 원작을 원작이게
    // 하는 것이므로 숫자 쪽을 먼저 시험해 모양이 남게 한다.
    const attrs = [
      ...shuffle(clues.map((clue, i) => [i, 'area']), rng),
      ...shuffle(clues.map((clue, i) => [i, 'shape']), rng),
    ];
    for (const [i, key] of attrs) {
      const saved = clues[i][key];
      clues[i][key] = null;
      if (!S.logicSolve(build(size, rects, clues)).solved) clues[i][key] = saved;
    }

    const puzzle = build(size, rects, clues);
    puzzle.order = S.logicSolve(puzzle).order;
    return puzzle;
  }
  return null;
}

const Generator = { SIZES, MAX_SIDE, MAX_AREA, AREA_BIAS, ATTEMPTS, generate, mulberry32, partition };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.PatchesGenerator = Generator;

})();

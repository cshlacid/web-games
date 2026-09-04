'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.QueensRules;
const S = (typeof require !== 'undefined') ? require('./solver.js') : window.QueensSolver;

// 판을 만드는 순서는 푸는 순서의 반대다. 먼저 정답이 될 왕관 배치를 뽑고, 그
// 왕관들을 씨앗으로 삼아 격자를 영역으로 키운다. 씨앗마다 영역이 하나씩 자라므로
// **영역은 반드시 이어져 있고 각 영역에 정답 왕관이 정확히 하나** 들어간다 —
// 풀리지 않는 판이 나올 수 없다.
//
// 남는 문제는 하나뿐이다: 다른 배치도 답이 되지 않게 하는 것. 여기서 판을 통째로
// 버리고 다시 키우면 9×9에서 만 번 넘게 헛돈다. 대신 **대안해를 하나 찾아 그것만
// 깨는 쪽으로 영역을 한 칸 고친다.** 대안해가 왕관을 놓은 칸(정답이 쓰지 않는
// 칸) 하나를 옆 영역으로 넘기면 그 배치는 한 영역에 왕관이 둘이 되어 무너지고,
// 정답은 자기 칸을 건드리지 않았으므로 그대로 남는다. 이 방법으로 9×9 한 판이
// 만 번의 재시도에서 백 밀리초 수준으로 내려왔다.

const SIZES = [7, 8, 9];

// 영역 하나가 가질 수 있는 최대 칸 수. 상한이 없으면 한 영역이 판의 절반을
// 차지하는 판이 흔히 나온다 — 보기에도 나쁘고 제약도 약하다. 반대로 너무 조이면
// 해가 여럿인 판만 나와 생성이 급격히 느려진다(9×9 기준 1.5배에서 판당 0.8초,
// 1.8배에서 0.1초). 평균 칸 수의 1.8배가 그 사이다.
const MAX_REGION = { 7: 13, 8: 14, 9: 16 };

// 대안해를 깨는 시도 횟수. 이보다 오래 걸리는 판은 붙들고 있느니 새 배치에서
// 다시 시작하는 편이 빠르다.
const REFINE_ROUNDS = 60;

const ATTEMPTS = 4000;

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

function neighbors(size, cell) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const near = [];
  if (r > 0) near.push(cell - size);
  if (r < size - 1) near.push(cell + size);
  if (c > 0) near.push(cell - 1);
  if (c < size - 1) near.push(cell + 1);
  return near;
}

// 씨앗에서 동시에 번져 나가는 무작위 성장. 후보 칸을 영역별로 고르지 않고 한
// 자루에 섞어 두고 뽑기 때문에 영역 크기가 고르지 않게 나오는데, 이게 의도한
// 것이다 — 크기를 고르게 맞추면 제약이 약해져 해가 여럿인 판만 쏟아진다.
function grow(size, seeds, rng, cap) {
  const n = size * size;
  const regions = new Int32Array(n).fill(-1);
  const counts = new Int32Array(size);
  const frontier = [];

  function spread(cell, id) {
    for (const other of neighbors(size, cell)) frontier.push([other, id]);
  }

  seeds.forEach((cell, id) => { regions[cell] = id; counts[id] = 1; spread(cell, id); });

  let left = n - seeds.length;
  while (left > 0 && frontier.length) {
    const i = Math.floor(rng() * frontier.length);
    const [cell, id] = frontier[i];
    frontier[i] = frontier[frontier.length - 1];
    frontier.pop();
    if (regions[cell] !== -1 || counts[id] >= cap) continue;
    regions[cell] = id;
    counts[id]++;
    left--;
    spread(cell, id);
  }
  // 상한에 걸린 영역들이 남은 칸을 둘러싸 버리면 빈칸이 남는다. 그런 판은 버린다.
  return left === 0 ? { regions, counts } : null;
}

// 대안해가 쓰는 칸 하나를 옆 영역으로 넘겨 그 해만 깬다.
function refine(size, grown, solution, rng, cap) {
  const { regions, counts } = grown;
  const seeds = new Set(solution.map((c, r) => r * size + c));
  const puzzle = { size, regions };

  for (let round = 0; round <= REFINE_ROUNDS; round++) {
    const found = S.solve(puzzle, { limit: 2 });
    if (found.count === 1) return true;
    const other = found.solutions.find((s) => s.some((c, r) => c !== solution[r]));
    if (!other) return false;

    const cells = shuffle(
      other.map((c, r) => r * size + c).filter((cell) => !seeds.has(cell)), rng);

    let moved = false;
    for (const cell of cells) {
      const id = regions[cell];
      // 넘기고 나서도 원래 영역이 이어져 있어야 한다. 끊어진 영역은 화면에서
      // 같은 색 덩어리가 둘로 보여 판이 잘못된 것처럼 읽힌다.
      const rest = [];
      for (let i = 0; i < size * size; i++) if (regions[i] === id && i !== cell) rest.push(i);
      if (!rest.length || !R.connected(size, rest)) continue;

      const options = shuffle([...new Set(neighbors(size, cell)
        .map((other2) => regions[other2])
        .filter((other2) => other2 !== id && counts[other2] < cap))], rng);
      if (!options.length) continue;

      counts[id]--;
      counts[options[0]]++;
      regions[cell] = options[0];
      moved = true;
      break;
    }
    if (!moved) return false;
  }
  return false;
}

function generate(size, options = {}) {
  if (!SIZES.includes(size)) throw new Error(`지원하지 않는 크기: ${size}`);
  const rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);
  const cap = options.cap || MAX_REGION[size];

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const solution = S.randomArrangement(size, rng);
    if (!solution) continue;

    const grown = grow(size, solution.map((c, r) => r * size + c), rng, cap);
    if (!grown) continue;
    if (!refine(size, grown, solution, rng, cap)) continue;

    const puzzle = { size, regions: Array.from(grown.regions), solution };
    // 찍어야 푸는 판은 내보내지 않는다. 유일해라는 것과 사람이 논리만으로 끝까지
    // 갈 수 있다는 것은 다른 이야기다.
    const logic = S.logicSolve(puzzle);
    if (!logic.solved) continue;

    puzzle.order = logic.order;
    return puzzle;
  }
  return null;
}

const Generator = { SIZES, MAX_REGION, REFINE_ROUNDS, ATTEMPTS, generate, mulberry32, grow, refine };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.QueensGenerator = Generator;

})();

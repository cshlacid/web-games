'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.ZipRules;
const S = (typeof require !== 'undefined') ? require('./solver.js') : window.ZipSolver;

// 판을 만드는 순서는 푸는 순서의 반대다. 먼저 격자를 전부 덮는 경로 하나를 뽑아
// 정답으로 놓고, 그 경로 위의 몇 자리에 숫자를 얹고, 경로가 쓰지 않은 칸 사이에
// 벽을 세운다. 정답에서 거꾸로 만들기 때문에 "풀리지 않는 판"이 나올 수 없고,
// 남는 문제는 하나뿐이다 — 다른 경로도 답이 되지 않게 숫자를 충분히 두는 것.
//
// 숫자를 처음부터 최소로 두려고 하면 해가 폭발해서 셀 수가 없다. 그래서 넉넉히
// 깔아 유일해를 확보한 뒤 하나씩 빼 보며 줄인다.

const SIZES = [5, 6, 7, 8];

// 벽 개수. 원작도 작은 판에는 벽이 거의 없고 큰 판일수록 늘어난다. 벽은 길을
// 막아 탐색을 좁히므로, 벽이 많으면 같은 크기라도 숫자가 덜 필요해진다.
const WALLS_BY_SIZE = { 5: [0, 2], 6: [1, 4], 7: [2, 6], 8: [3, 8] };

// 처음에 깔아 둘 숫자 사이의 간격(경로 위 칸 수). 좁게 깔수록 유일해를 한 번에
// 잡지만 그만큼 줄이는 데 시간이 든다.
const SEED_GAP = 5;

const ATTEMPTS = 40;

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

// 경로가 지나지 않은 간선만 벽 후보다. 경로가 밟고 지나간 자리에 벽을 세우면
// 정답이 사라진다.
function pickWalls(size, path, rng, count) {
  const used = new Set();
  for (let i = 1; i < path.length; i++) used.add(R.edgeKey(path[i - 1], path[i]));

  const candidates = [];
  for (let cell = 0; cell < size * size; cell++) {
    const r = Math.floor(cell / size);
    const c = cell % size;
    if (c < size - 1) candidates.push(R.edgeKey(cell, cell + 1));
    if (r < size - 1) candidates.push(R.edgeKey(cell, cell + size));
  }
  const free = shuffle(candidates.filter((edge) => !used.has(edge)), rng);
  return free.slice(0, count).sort((a, b) => a - b);
}

function build(size, path, positions, walls) {
  const sorted = [...positions].sort((a, b) => a - b);
  return { size, hints: sorted.map((i) => path[i]), walls, solution: path };
}

function unique(puzzle, budget) {
  const res = S.countSolutions(puzzle, { limit: 2, budget });
  return !res.aborted && res.count === 1;
}

// 숫자를 얹을 자리. 경로의 양 끝은 늘 넣는다 — 1이 어디서 시작하고 마지막 숫자가
// 어디서 끝나는지가 원작 판의 모양이고, 양 끝이 고정되면 해도 크게 줄어든다.
function seedPositions(length, rng) {
  const positions = new Set([0, length - 1]);
  for (let i = SEED_GAP; i < length - 1; i += SEED_GAP) {
    positions.add(Math.min(length - 2, i + Math.floor(rng() * 3) - 1));
  }
  return positions;
}

function generate(size, options = {}) {
  if (!SIZES.includes(size)) throw new Error(`지원하지 않는 크기: ${size}`);
  const rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);
  const budget = options.budget || S.BUDGET;
  const [wallMin, wallMax] = WALLS_BY_SIZE[size];

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const path = S.randomFullPath(size, rng);
    if (!path) continue;

    const wallCount = wallMin + Math.floor(rng() * (wallMax - wallMin + 1));
    const walls = pickWalls(size, path, rng, wallCount);

    let positions = seedPositions(path.length, rng);
    let ready = false;
    for (let round = 0; round < 8; round++) {
      if (unique(build(size, path, positions, walls), budget)) { ready = true; break; }
      const spare = shuffle([...Array(path.length).keys()].filter((i) => !positions.has(i)), rng);
      if (!spare.length) break;
      positions.add(spare[0]);
    }
    if (!ready) continue;

    // 하나씩 빼 본다. 뺐는데도 유일해면 그 숫자는 없어도 되는 숫자였다.
    for (const pos of shuffle([...positions].filter((i) => i !== 0 && i !== path.length - 1), rng)) {
      const trial = new Set(positions);
      trial.delete(pos);
      if (unique(build(size, path, trial, walls), budget)) positions = trial;
    }

    return build(size, path, positions, walls);
  }
  return null;
}

const Generator = { SIZES, WALLS_BY_SIZE, SEED_GAP, ATTEMPTS, generate, mulberry32, pickWalls };

if (typeof module !== 'undefined' && module.exports) module.exports = Generator;
if (typeof window !== 'undefined') window.ZipGenerator = Generator;

})();

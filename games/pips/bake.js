'use strict';

// 판을 굽는다. 사이트는 이 파일을 부르지 않는다 — 구운 결과(`puzzles.js`)만 싣는다.
//
//   node games/pips/bake.js > games/pips/puzzles.js
//
// **답부터 만들고 조건을 씌운다.**
//   1. 상자 안에서 도미노를 하나씩 이어 붙여 판 모양과 깔기를 함께 만든다.
//   2. 더블식스 스물여덟 장에서 겹치지 않게 골라 깔기에 얹는다 — 이것이 답이다.
//   3. 칸을 한 칸에서 네 칸까지의 구역으로 나누고, 일부는 조건 없는 칸으로 둔다. 조건은
//      답으로 셈한다.
//   4. 풀이기가 끝까지 풀면 판으로 쓴다(도미노가 가는 자리가 하나뿐이다 — solver.js 머리말).
//      막히면 막힌 칸 근처의 조건을 조인다(조건 없는 칸에 조건을 주고, 작다·크다를 합으로).
//   5. 풀리는 채로 조건을 하나씩 걷어 본다. 조건이 남아돌면 판이 거저 풀린다.
(function () {

const R = require('./rules.js');
const S = require('./solver.js');

// 난이도마다 상자 크기, 도미노 수, 구역 크기의 몫(1~4칸), 처음에 조건 없이 두는 몫, 가정을 몇
// 번까지 써도 되는지.
//
// **한 칸짜리 구역이 많다.** 합 조건은 약해서, 두세 칸짜리 합 구역만으로는 합이 같은 도미노끼리
// 자리를 바꾸거나 깔기가 달라지는 답이 수십 개씩 남는다. 그것을 하나로 모는 데 드는 것이 결국
// 한 칸짜리 조건이고, 그래서 거저 주는 칸이 되지 않게 걷을 수 있는 것은 걷고 남은 합은 작다·크다로
// 바꿔 본다(5). 보통에 가정을 몇 번 허락한 것도 같은 이유다 — 가정 없이 풀리는 6×6은 구역의
// 칠 할이 한 칸짜리 합이었다.
const LEVELS = {
  easy: { box: 5, tiles: [5, 6], sizes: [2, 4, 3, 1], blank: 0.15, maxTrials: 0, count: 60 },
  normal: { box: 6, tiles: [8, 9], sizes: [1, 4, 4, 2], blank: 0.25, maxTrials: 3, count: 60 },
  hard: { box: 7, tiles: [11, 13], sizes: [1, 3, 4, 3], blank: 0.3, maxTrials: 8, count: 60 },
};

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

function weighted(random, weights) {
  let x = random() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
  return weights.length - 1;
}

// 1. 판 모양과 깔기. 이미 놓인 칸에 많이 붙는 자리를 더 자주 골라 판이 뭉치게 한다 —
//    고르게 고르면 가지가 뻗은 판이 나와 화면에서 상자 대부분이 빈다.
function shape(random, box, count) {
  const used = new Int16Array(box * box).fill(-1);
  const pairs = [];
  const inBox = (r, c) => r >= 0 && r < box && c >= 0 && c < box;
  const touching = (g) => {
    const r = Math.floor(g / box);
    const c = g % box;
    return [[-1, 0], [1, 0], [0, -1], [0, 1]]
      .filter(([dr, dc]) => inBox(r + dr, c + dc) && used[(r + dr) * box + c + dc] >= 0).length;
  };
  // 테두리 상자를 넓히는 자리. 덜 고른다 — 안 그러면 대각선으로 길게 뻗은 판이 나온다.
  let top = box;
  let bottom = -1;
  let left = box;
  let right = -1;
  const grows = (g) => {
    const r = Math.floor(g / box);
    const c = g % box;
    return r < top || r > bottom || c < left || c > right;
  };
  const take = (g) => {
    const r = Math.floor(g / box);
    const c = g % box;
    top = Math.min(top, r); bottom = Math.max(bottom, r);
    left = Math.min(left, c); right = Math.max(right, c);
  };
  const mid = Math.floor(box / 2);
  const first = mid * box + mid - 1;
  pairs.push([first, first + 1]);
  used[first] = 0;
  used[first + 1] = 0;
  take(first);
  take(first + 1);
  while (pairs.length < count) {
    const spots = [];
    const weights = [];
    for (let g = 0; g < box * box; g++) {
      if (used[g] >= 0) continue;
      const r = Math.floor(g / box);
      const c = g % box;
      for (const h of [c + 1 < box ? g + 1 : -1, r + 1 < box ? g + box : -1]) {
        if (h < 0 || used[h] >= 0) continue;
        const near = touching(g) + touching(h);
        if (!near) continue;
        spots.push([g, h]);
        weights.push(near * near * (grows(g) || grows(h) ? 0.4 : 1));
      }
    }
    if (!spots.length) return null;
    const pair = spots[weighted(random, weights)];
    used[pair[0]] = pairs.length;
    used[pair[1]] = pairs.length;
    take(pair[0]);
    take(pair[1]);
    pairs.push(pair);
  }
  return { used, pairs };
}

// 2. 도미노를 고르고 깔기에 얹는다. 결과는 상자 칸마다의 눈.
function dominoes(random, pairs, box) {
  const set = [];
  for (let x = 0; x <= R.MAX_PIP; x++) for (let y = x; y <= R.MAX_PIP; y++) set.push([x, y]);
  shuffle(random, set);
  const pips = new Int8Array(box * box).fill(-1);
  const tiles = pairs.map(([g, h], k) => {
    const [x, y] = random() < 0.5 ? set[k] : [set[k][1], set[k][0]];
    pips[g] = x;
    pips[h] = y;
    return [x, y];
  });
  return { pips, tiles };
}

// 3. 구역 나누기. 상자 칸마다 구역 번호(-1은 조건 없는 칸).
function partition(random, used, pips, box, sizes, blank) {
  const region = new Int16Array(box * box).fill(-2);
  const cells = [];
  for (let g = 0; g < box * box; g++) if (used[g] >= 0) cells.push(g);
  shuffle(random, cells);
  const groups = [];
  const near = (g) => {
    const r = Math.floor(g / box);
    const c = g % box;
    return [r > 0 ? g - box : -1, c > 0 ? g - 1 : -1, c < box - 1 ? g + 1 : -1, r < box - 1 ? g + box : -1]
      .filter((h) => h >= 0 && used[h] >= 0);
  };
  for (const g of cells) {
    if (region[g] !== -2) continue;
    const want = weighted(random, sizes) + 1;
    const group = [g];
    region[g] = groups.length;
    while (group.length < want) {
      const free = group.flatMap(near).filter((h) => region[h] === -2);
      if (!free.length) break;
      // 같은 눈끼리 묶일 기회를 늘린다. 눈이 고르게 흩어져 있으면 '같음' 구역이 거의 안 생긴다.
      const same = free.filter((h) => pips[h] === pips[g]);
      const from = same.length && random() < 0.6 ? same : free;
      const h = from[int(random, from.length)];
      region[h] = groups.length;
      group.push(h);
    }
    groups.push(group);
  }
  const kinds = groups.map(() => (random() < blank ? null : 'loose'));
  return { region, groups, kinds };
}

// 구역 하나의 조건을 답으로 셈한다. `strict`면 합·같음·다름만 쓴다(조일 때).
function condition(random, values, strict) {
  const sum = values.reduce((s, v) => s + v, 0);
  const equal = values.length > 1 && values.every((v) => v === values[0]);
  const distinct = values.length > 2 && new Set(values).size === values.length;
  if (equal && random() < 0.8) return { kind: 'eq', target: 0 };
  if (distinct && random() < 0.35) return { kind: 'ne', target: 0 };
  if (!strict && random() < 0.2) {
    const room = 1 + int(random, 2);
    if (random() < 0.5 && sum - room >= 0) return { kind: 'gt', target: sum - room };
    return { kind: 'lt', target: sum + room };
  }
  return { kind: 'sum', target: sum };
}

// 상자 판을 쓰인 칸의 테두리 상자로 잘라 판 자료로 만든다. 조건 없는 구역은 빼고 번호를 다시 붙인다.
function build(box, used, pips, tiles, part, conds) {
  let top = box;
  let left = box;
  let bottom = 0;
  let right = 0;
  for (let g = 0; g < box * box; g++) {
    if (used[g] < 0) continue;
    const r = Math.floor(g / box);
    const c = g % box;
    top = Math.min(top, r); bottom = Math.max(bottom, r);
    left = Math.min(left, c); right = Math.max(right, c);
  }
  const w = right - left + 1;
  const h = bottom - top + 1;
  const ids = new Map();
  const specs = [];
  let grid = '';
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const g = r * box + c;
      if (used[g] < 0) { grid += '.'; continue; }
      const id = part.region[g];
      if (!conds[id]) { grid += '#'; continue; }
      if (!ids.has(id)) { ids.set(id, specs.length); specs.push(R.specOf(conds[id])); }
      grid += R.ALPHABET[ids.get(id)];
    }
  }
  return `${w}x${h}|${grid}|${tiles.map(([x, y]) => `${x}${y}`).join('')}|${specs.join(',')}`;
}

// 조건이 이미 빡빡한 구역에서 막혔으면 구역을 둘로 쪼갠다. 큰 구역부터, 두 쪽이 다 두 칸
// 이상이 되게 자르는 것부터 본다 — 아무렇게나 쪼개면 한 칸짜리 구역이 쌓여 눈을 거저 준다.
// 쪼갠 두 쪽은 각각 이어져 있어야 한다. 끊긴 구역은 화면에서 한 구역으로 읽히지 않는다.
function split(random, part, conds, stuck, box, valuesOf) {
  const ids = shuffle(random, [...new Set(stuck.map((g) => part.region[g]))])
    .filter((id) => part.groups[id].length > 1)
    .sort((x, y) => part.groups[y].length - part.groups[x].length);
  for (const id of ids) {
    const group = part.groups[id];
    const cuts = [];
    for (let m = 1; m < (1 << group.length) - 1; m++) {
      if (!(m & 1)) continue;
      const one = group.filter((_, k) => m & (1 << k));
      const two = group.filter((_, k) => !(m & (1 << k)));
      if (connected(one, box) && connected(two, box)) cuts.push([one, two]);
    }
    if (!cuts.length) continue;
    const small = (cut) => Math.min(cut[0].length, cut[1].length);
    const best = Math.max(...cuts.map(small));
    const pick = shuffle(random, cuts.filter((cut) => small(cut) === best))[0];
    part.groups[id] = pick[0];
    part.groups.push(pick[1]);
    for (const g of pick[1]) part.region[g] = part.groups.length - 1;
    conds[id] = condition(random, valuesOf(id), true);
    conds.push(condition(random, valuesOf(part.groups.length - 1), true));
    return true;
  }
  return false;
}

function connected(cells, box) {
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const todo = [cells[0]];
  while (todo.length) {
    const g = todo.pop();
    for (const h of [g - box, g + box, g % box ? g - 1 : -1, (g + 1) % box ? g + 1 : -1]) {
      if (set.has(h) && !seen.has(h)) { seen.add(h); todo.push(h); }
    }
  }
  return seen.size === cells.length;
}

function attempt(code, spec) {
  return S.solve(R.parse(code), { trial: spec.maxTrials > 0, maxTrials: spec.maxTrials });
}

function make(level, seed) {
  const spec = LEVELS[level];
  const random = rng(seed * 7919 + level.length);
  const count = spec.tiles[0] + int(random, spec.tiles[1] - spec.tiles[0] + 1);
  const made = shape(random, spec.box, count);
  if (!made) return null;
  const { used, pairs } = made;
  const { pips, tiles } = dominoes(random, pairs, spec.box);
  const part = partition(random, used, pips, spec.box, spec.sizes, spec.blank);
  const valuesOf = (id) => part.groups[id].map((g) => pips[g]);
  const conds = part.kinds.map((kind, id) => kind && condition(random, valuesOf(id), false));
  const code = () => build(spec.box, used, pips, tiles, part, conds);
  let top = spec.box;
  let left = spec.box;
  for (let g = 0; g < spec.box * spec.box; g++) {
    if (used[g] < 0) continue;
    top = Math.min(top, Math.floor(g / spec.box));
    left = Math.min(left, g % spec.box);
  }

  // 4. 풀릴 때까지 조인다. 막힌 칸이 든 구역을 고른다 — 아무 데나 조이면 이미 풀리는 자리에
  //    조건만 쌓인다.
  let result = attempt(code(), spec);
  for (let k = 0; !result.solved && k < 40; k++) {
    const puzzle = R.parse(code());
    const covered = new Set(result.placed.flatMap((p) => (p ? [p.a, p.b] : [])));
    const stuck = puzzle.pos.map((g0, c) => c).filter((c) => !covered.has(c));
    // 잘린 판의 칸 번호를 상자 칸으로 되돌린다.
    const toBox = (c) => (Math.floor(puzzle.pos[c] / puzzle.w) + top) * spec.box + (puzzle.pos[c] % puzzle.w) + left;
    const ids = [...new Set(stuck.map((c) => part.region[toBox(c)]))];
    const loose = ids.filter((id) => !conds[id] || conds[id].kind === 'lt' || conds[id].kind === 'gt');
    if (loose.length) {
      const id = loose[int(random, loose.length)];
      conds[id] = condition(random, valuesOf(id), true);
    } else if (!split(random, part, conds, stuck.map(toBox), spec.box, valuesOf)) {
      return null;
    }
    result = attempt(code(), spec);
  }
  if (!result.solved) return null;

  // 5. 풀어 보기. 조건을 걷어 보고, 안 되면 합을 작다·크다로 바꿔 보고, 그래도 풀리면 둔다.
  for (const id of shuffle(random, conds.map((_, k) => k))) {
    const before = conds[id];
    if (!before) continue;
    const sum = valuesOf(id).reduce((t, v) => t + v, 0);
    const tries = [null];
    if (before.kind === 'sum') tries.push(random() < 0.5 && sum > 0 ? { kind: 'gt', target: sum - 1 } : { kind: 'lt', target: sum + 1 });
    for (const next of tries) {
      conds[id] = next;
      if (attempt(code(), spec).solved) break;
      conds[id] = before;
    }
  }
  result = attempt(code(), spec);
  if (!result.solved) return null;
  return { code: code(), trials: result.trials };
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

module.exports = { LEVELS, rng, shape, dominoes, partition, condition, split, build, make, bake };

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

// 구워 둔 판. 손으로 고치지 않는다 — \`node games/pips/bake.js\`로 다시 굽는다.
// 판 하나의 꼴은 rules.js의 \`parse\` 머리말에 있다.
(function () {

const PUZZLES = {
${body}
};

const api = { PUZZLES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.PipsPuzzles = api;

})();
`);
}

})();

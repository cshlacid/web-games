'use strict';

// 누리카베 풀이. 두 가지에 쓴다 — 굽는 자리에서 판이 찍지 않고 끝까지 풀리는지 보고
// (`solve`), 힌트가 지금 판에서 사람이 다음으로 알아낼 수 있는 칸을 짚는다(`next`).
//
// **찍지 않는다.** 규칙은 참인 것만 이끌어 내므로 끝까지 풀리면 답이 하나뿐이다. 그래서
// 규칙이 조금이라도 틀리면 답이 여럿인 판을 "풀었다"고 믿게 된다 — 규칙마다 왜 옳은지를
// 적어 둔다.
//
// 칸의 상태는 셋이다: 모름, 바다, 땅(섬). 숫자 칸은 처음부터 땅이다.
// 이유는 문장이 아니라 자료로 돌려준다(`why: { code, ... }`). 문장은 화면이 엮는다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.NurikabeRules;

const UNKNOWN = 0;
const SEA = 1;
const LAND = 2;

function context(puzzle) {
  const { rows, cols, clues } = puzzle;
  return {
    rows, cols, clues, n: rows * cols,
    near: R.neighborsTable(rows, cols),
    squares: R.squares(rows, cols),
  };
}

function start(ctx) {
  const cells = new Uint8Array(ctx.n);
  for (let i = 0; i < ctx.n; i++) if (ctx.clues[i]) cells[i] = LAND;
  return cells;
}

// 땅 덩어리. 덩어리마다 칸, 숫자 칸, 맞닿은 모르는 칸을 센다.
function islands(ctx, cells) {
  const g = R.groups(ctx, (i) => cells[i] === LAND);
  const list = g.list.map((members) => {
    const clueCells = members.filter((i) => ctx.clues[i]);
    const exits = new Set();
    for (const i of members) for (const j of ctx.near[i]) if (cells[j] === UNKNOWN) exits.add(j);
    return { members, clueCells, need: clueCells.length === 1 ? ctx.clues[clueCells[0]] : 0, exits: [...exits] };
  });
  return { id: g.id, list };
}

// 한 판에서 이끌어 낼 수 있는 것 하나. 사람이 먼저 보는 순서대로 본다. 없으면 null,
// 모순이면 'bad'.
function deduce(ctx, cells) {
  const land = islands(ctx, cells);

  for (const isl of land.list) {
    // 숫자 둘이 한 섬에 들어갔거나, 섬이 숫자보다 커졌다.
    if (isl.clueCells.length > 1) return 'bad';
    if (isl.need && isl.members.length > isl.need) return 'bad';
  }
  for (const sq of ctx.squares) if (sq.every((i) => cells[i] === SEA)) return 'bad';

  // 1. 다 찬 섬. 섬의 칸 수가 숫자와 같으면 둘레는 모두 바다다.
  for (const isl of land.list) {
    if (isl.need && isl.members.length === isl.need && isl.exits.length) {
      return { cells: isl.exits, value: SEA, why: { code: 'islandDone', cell: isl.clueCells[0], clue: isl.need } };
    }
  }

  // 2. 숫자 있는 섬 둘에 함께 닿은 칸. 땅이 되면 두 섬이 붙어 숫자 둘이 한 섬에 든다.
  for (let i = 0; i < ctx.n; i++) {
    if (cells[i] !== UNKNOWN) continue;
    const owners = new Set();
    for (const j of ctx.near[i]) {
      if (cells[j] !== LAND) continue;
      const isl = land.list[land.id[j]];
      if (isl.clueCells.length) owners.add(land.id[j]);
    }
    if (owners.size >= 2) return { cells: [i], value: SEA, why: { code: 'twoIslands', cell: i } };
  }

  // 3. 2×2의 셋이 바다면 나머지 하나는 땅이다.
  for (const sq of ctx.squares) {
    const open = sq.filter((i) => cells[i] === UNKNOWN);
    if (open.length === 1 && sq.filter((i) => cells[i] === SEA).length === 3) {
      return { cells: open, value: LAND, why: { code: 'pool', cell: open[0] } };
    }
  }

  // 4. 어느 섬도 닿을 수 없는 칸은 바다다. 섬이 칸 X를 품으려면 섬에서 X까지 이어진 길의
  //    칸이 다 섬이 되므로, 섬의 칸 수는 적어도 (지금 칸 수 + 거리)다. 거리가 남은 칸 수를
  //    넘으면 닿지 못한다. 다른 숫자 섬에 붙은 칸은 지나갈 수 없다(붙으면 섬이 합쳐진다).
  const reach = new Uint8Array(ctx.n);
  for (let k = 0; k < land.list.length; k++) {
    const isl = land.list[k];
    if (!isl.need) continue;
    for (const i of isl.members) reach[i] = 1;
    const budget = isl.need - isl.members.length;
    if (budget <= 0) continue;
    const dist = new Int32Array(ctx.n).fill(-1);
    const queue = [];
    for (const i of isl.members) { dist[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      if (dist[i] >= budget) continue;
      for (const j of ctx.near[i]) {
        if (dist[j] >= 0 || cells[j] === SEA) continue;
        if (cells[j] === LAND && land.list[land.id[j]].clueCells.length) continue;
        const touchesOther = ctx.near[j].some((x) => cells[x] === LAND && land.id[x] !== k
          && land.list[land.id[x]].clueCells.length);
        if (touchesOther) continue;
        dist[j] = dist[i] + 1;
        reach[j] = 1;
        queue.push(j);
      }
    }
  }
  for (let i = 0; i < ctx.n; i++) {
    if (reach[i]) continue;
    if (cells[i] === UNKNOWN) return { cells: [i], value: SEA, why: { code: 'unreachable', cell: i } };
    // 숫자 없는 땅인데 어느 섬도 닿지 못한다.
    if (cells[i] === LAND) return 'bad';
  }

  // 5. 자랄 길이 하나뿐인 섬. 숫자보다 작은 섬이나 숫자 없는 땅 조각은 반드시 더 자라야
  //    하므로, 맞닿은 모르는 칸이 하나면 그 칸은 땅이다.
  for (const isl of land.list) {
    const grows = isl.need ? isl.members.length < isl.need : true;
    if (!grows) continue;
    if (!isl.exits.length) return 'bad';
    if (isl.exits.length === 1) {
      return {
        cells: isl.exits, value: LAND,
        why: { code: isl.need ? 'islandOneWay' : 'strayLand', cell: isl.exits[0], clue: isl.need },
      };
    }
  }

  // 6. 빠져나갈 길이 하나뿐인 바다. 바다는 모두 이어져야 하므로, 다른 바다가 따로 있는데
  //    이 바다 덩어리에 맞닿은 모르는 칸이 하나뿐이면 그 칸은 바다다.
  const sea = R.groups(ctx, (i) => cells[i] === SEA);
  if (sea.list.length > 1) {
    for (const members of sea.list) {
      const exits = new Set();
      for (const i of members) for (const j of ctx.near[i]) if (cells[j] === UNKNOWN) exits.add(j);
      if (!exits.size) return 'bad';
      if (exits.size === 1) {
        const [cell] = exits;
        return { cells: [cell], value: SEA, why: { code: 'seaOneWay', cell } };
      }
    }
  }

  return null;
}

function write(cells, found) {
  for (const i of found.cells) {
    if (cells[i] === found.value) continue;
    if (cells[i] !== UNKNOWN) return false;
    cells[i] = found.value;
  }
  return true;
}

// 규칙을 더 나올 것이 없을 때까지 돌린다. 모순이면 false.
function settle(ctx, cells) {
  for (;;) {
    const found = deduce(ctx, cells);
    if (found === 'bad') return false;
    if (!found) return true;
    if (!write(cells, found)) return false;
  }
}

// 가정 하나: 한 칸을 땅(또는 바다)이라 두고 규칙을 돌려 모순이 나면 반대다.
function trial(ctx, cells) {
  for (let i = 0; i < ctx.n; i++) {
    if (cells[i] !== UNKNOWN) continue;
    for (const [guess, other, code] of [[LAND, SEA, 'trialSea'], [SEA, LAND, 'trialLand']]) {
      const copy = cells.slice();
      copy[i] = guess;
      if (!settle(ctx, copy)) return { cells: [i], value: other, why: { code, cell: i } };
    }
  }
  return null;
}

// 다 정해진 판이 규칙에 맞는지. 규칙 1~6은 섬과 바다의 모양을 다 보지 않으므로 마지막에
// 한 번 더 본다.
function valid(ctx, cells) {
  const marks = Array.from(cells, (v) => (v === SEA ? R.SEA : R.EMPTY));
  return R.inspect(ctx, marks).solved;
}

// 판을 끝까지 푼다. `trial`이 없으면 가정 없이 규칙만 쓴다.
// 결과: { solved, cells, trials } — trials는 가정을 몇 번 썼는지.
function solve(puzzle, options = {}) {
  const ctx = context(puzzle);
  const cells = options.cells ? Uint8Array.from(options.cells) : start(ctx);
  let trials = 0;
  for (;;) {
    if (!settle(ctx, cells)) return { solved: false, cells, trials, broken: true };
    if (!cells.includes(UNKNOWN) || !options.trial) break;
    const found = trial(ctx, cells);
    if (!found) break;
    trials++;
    write(cells, found);
  }
  const solved = !cells.includes(UNKNOWN) && valid(ctx, cells);
  return { solved, cells, trials };
}

// 지금 판에서 알아낼 수 있는 것 하나. 넘겨받는 판에는 틀린 칸이 없어야 한다(화면이 힌트
// 전에 걷어 낸다).
function next(puzzle, cells, options = {}) {
  const ctx = context(puzzle);
  const found = deduce(ctx, cells);
  if (found && found !== 'bad') return found;
  if (options.trial) return trial(ctx, cells);
  return null;
}

const api = { UNKNOWN, SEA, LAND, start, context, solve, next };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.NurikabeSolver = api;

})();

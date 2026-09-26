'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.PatchesRules;

// 판을 완전 탐색으로 푼다. 탐색 순서는 "아직 안 덮인 칸 하나를 골라 그 칸을 덮을
// 수 있는 조각을 다 시도한다"이다. 어느 칸이든 반드시 무엇인가에 덮여야 하므로
// 이 선택은 해를 빠뜨리지 않는다.
//
// 두 가지로 좁힌다. **단서마다 놓일 수 있는 직사각형을 미리 다 구해 둔다** —
// 칸 수와 모양이 정해진 단서는 후보가 몇 개뿐이라 여기서 대부분이 걸러진다.
// 그리고 **후보가 가장 적은 칸부터 고른다** — 후보가 하나뿐인 칸이 있으면 거기가
// 곧 확정이고, 하나도 없는 칸이 있으면 그 가지는 그 자리에서 접힌다.

function rectsForClue(size, clueAt, index, clue) {
  const cr = Math.floor(clue.cell / size);
  const cc = clue.cell % size;
  const out = [];
  for (let r = 0; r <= cr; r++) {
    for (let h = cr - r + 1; r + h <= size; h++) {
      for (let c = 0; c <= cc; c++) {
        for (let w = cc - c + 1; c + w <= size; w++) {
          if (clue.area !== null && w * h !== clue.area) continue;
          if (clue.shape !== null && R.shapeOf(w, h) !== clue.shape) continue;
          let alone = true;
          for (let y = r; y < r + h && alone; y++) {
            for (let x = c; x < c + w; x++) {
              const at = clueAt[y * size + x];
              if (at !== -1 && at !== index) { alone = false; break; }
            }
          }
          if (alone) out.push({ r, c, w, h });
        }
      }
    }
  }
  return out;
}

function prepare(puzzle) {
  const size = puzzle.size;
  const n = size * size;
  const clueAt = new Int32Array(n).fill(-1);
  puzzle.clues.forEach((clue, i) => { clueAt[clue.cell] = i; });

  const rects = puzzle.clues.map((clue, i) => rectsForClue(size, clueAt, i, clue));
  // 조각이 덮는 칸을 미리 펼쳐 둔다. 겹치는지 보는 일이 탐색의 안쪽 고리다.
  const spans = rects.map((list) => list.map((rect) => R.cells(size, rect)));

  const byCell = Array.from({ length: n }, () => []);
  spans.forEach((list, ci) => {
    list.forEach((span, ri) => {
      for (const cell of span) byCell[cell].push([ci, ri]);
    });
  });

  return { size, n, rects, spans, byCell };
}

function solve(puzzle, options = {}) {
  const limit = options.limit || 2;
  const { n, rects, spans, byCell } = prepare(puzzle);
  const count = puzzle.clues.length;
  const cover = new Int32Array(n).fill(-1);
  const used = new Uint8Array(count);
  const chosen = new Array(count);
  const solutions = [];
  let found = 0;

  function open(span) {
    for (const cell of span) if (cover[cell] !== -1) return false;
    return true;
  }

  function step(covered) {
    if (found >= limit) return;
    if (covered === n) {
      found++;
      if (solutions.length < limit) solutions.push(chosen.map((rect) => ({ ...rect })));
      return;
    }

    let bestList = null;
    for (let cell = 0; cell < n; cell++) {
      if (cover[cell] !== -1) continue;
      const list = byCell[cell].filter(([ci, ri]) => !used[ci] && open(spans[ci][ri]));
      if (!list.length) return;
      if (!bestList || list.length < bestList.length) bestList = list;
      if (list.length === 1) break;
    }

    for (const [ci, ri] of bestList) {
      const span = spans[ci][ri];
      if (!open(span)) continue;
      used[ci] = 1;
      chosen[ci] = rects[ci][ri];
      for (const cell of span) cover[cell] = ci;
      step(covered + span.length);
      for (const cell of span) cover[cell] = -1;
      used[ci] = 0;
      if (found >= limit) return;
    }
  }

  step(0);
  return { count: found, solutions };
}

function unique(puzzle) {
  return solve(puzzle, { limit: 2 }).count === 1;
}

// 사람이 쓰는 규칙만으로 푼다. 완전 탐색이 "답이 하나뿐인가"를 본다면 이쪽은
// "찍지 않고 풀리는가"를 본다 — 생성기가 이 판정을 통과한 판만 내보내므로 마지막에
// 두 자리를 놓고 찍어야 하는 판은 나오지 않는다.
//
// 화면의 힌트도 여기서 나온다. `order`는 이 풀이가 조각을 확정한 순서다.
//
// 쓰는 규칙은 넷이고 모두 시카쿠를 손으로 풀 때 쓰는 것들이다.
//   - 어떤 칸을 덮을 수 있는 조각이 하나뿐이면 그 조각이 답이다
//   - 어떤 단서가 가질 수 있는 조각이 하나뿐이면 그 조각이 답이다
//   - 어떤 칸을 덮을 수 있는 조각이 전부 한 단서의 것이면 그 칸은 그 단서 차지다
//   - 한 단서의 남은 조각이 모두 덮는 칸도 그 단서 차지다
// 뒤의 둘은 조각을 놓지는 않지만 남의 후보를 지워, 앞의 둘이 걸리게 만든다.
//
// `from`(조각 목록)을 주면 빈 판 대신 그 조각들을 놓고 시작한다. 힌트가 사람이 놓은
// 조각에서 이어 좁히는 데 쓴다 — `order[0]`이 지금 판에서 가장 먼저 알 수 있는 조각이다.
function logicSolve(puzzle, from) {
  const { n, rects, spans } = prepare(puzzle);
  const count = puzzle.clues.length;
  const cover = new Int32Array(n).fill(-1);
  const owned = new Int32Array(n).fill(-1);
  const placed = new Uint8Array(count);
  const order = [];
  let done = 0;

  puzzle.clues.forEach((clue, i) => { owned[clue.cell] = i; });

  let alive = spans.map((list) => list.map((_, ri) => ri));

  const usable = (ci, ri) => spans[ci][ri].every((cell) =>
    cover[cell] === -1 && (owned[cell] === -1 || owned[cell] === ci));

  function put(ci, ri) {
    for (const cell of spans[ci][ri]) { cover[cell] = ci; owned[cell] = ci; }
    placed[ci] = 1;
    done++;
    order.push(rects[ci][ri]);
  }

  if (from) {
    const same = (a, c) => a.r === c.r && a.c === c.c && a.w === c.w && a.h === c.h;
    for (const rect of from) {
      rects.forEach((list, ci) => {
        const ri = list.findIndex((mine) => same(mine, rect));
        if (ri >= 0 && !placed[ci]) put(ci, ri);
      });
    }
    order.length = 0;
  }

  let changed = true;
  while (changed && done < count) {
    changed = false;
    for (let ci = 0; ci < count; ci++) {
      if (!placed[ci]) alive[ci] = alive[ci].filter((ri) => usable(ci, ri));
    }

    for (let ci = 0; ci < count; ci++) {
      if (placed[ci]) continue;
      if (!alive[ci].length) return { solved: false, order, dead: true };
      if (alive[ci].length === 1) { put(ci, alive[ci][0]); changed = true; }
    }
    if (changed) continue;

    // 칸마다 그 칸을 덮을 수 있는 후보를 모은다.
    const byCellNow = Array.from({ length: n }, () => []);
    for (let ci = 0; ci < count; ci++) {
      if (placed[ci]) continue;
      for (const ri of alive[ci]) {
        for (const cell of spans[ci][ri]) byCellNow[cell].push([ci, ri]);
      }
    }

    for (let cell = 0; cell < n; cell++) {
      if (cover[cell] !== -1) continue;
      const list = byCellNow[cell];
      if (!list.length) return { solved: false, order, dead: true };
      if (list.length === 1) { put(list[0][0], list[0][1]); changed = true; continue; }
      const owners = new Set(list.map(([ci]) => ci));
      if (owners.size === 1 && owned[cell] === -1) {
        owned[cell] = [...owners][0];
        changed = true;
      }
    }
    if (changed) continue;

    // 한 단서의 남은 조각이 모두 덮는 칸.
    for (let ci = 0; ci < count; ci++) {
      if (placed[ci] || !alive[ci].length) continue;
      const shared = spans[ci][alive[ci][0]].filter((cell) =>
        alive[ci].every((ri) => spans[ci][ri].includes(cell)));
      for (const cell of shared) {
        if (owned[cell] === -1) { owned[cell] = ci; changed = true; }
      }
    }
  }

  return { solved: done === count, order };
}

// 힌트 한 번. `from`(사람이 놓은 조각 중 정답인 것)에서 **한 번에 볼 수 있는 것 하나**만
// 짚는다. logicSolve의 `order[0]`을 주면 그 앞에 "이 칸은 이 단서 차지"를 몇 번이고
// 속으로 거친 조각이 나오는데, 이 게임에는 차지를 남길 표시가 없어 사람에게는 이유 없이
// 떨어진 조각으로 보인다.
//
// 쉬운 것부터 보고 처음 걸린 것에서 멈춘다.
//   1. 차지 없이 — 후보는 "놓인 조각과 겹치지 않고 다른 단서를 품지 않는" 직사각형뿐이다.
//      가질 수 있는 조각이 하나뿐인 단서(`clue`), 덮을 수 있는 조각이 하나뿐인 칸(`cell`).
//   2. 차지를 한 번만 — 어떤 단서의 차지인 칸을 구해 남의 후보에서 빼고 1을 다시 본다
//      (`owned`). 차지는 한 단서 것만 쓰는 쪽을 먼저 보고, 밝힐 칸이 가장 적은 것을
//      고른다 — 밝힌 칸 안에 단서가 하나만 있어야 "그 안의 단서 차지"로 읽힌다.
//   3. 그래도 없으면 logicSolve의 순서(`order`). 생성한 판에서는 거의 오지 않는다.
// 돌려주는 것: { rect, clue, why: { code, via? }, cells(밝힐 칸) }. 다 놓였으면 null.
function step(puzzle, from) {
  const { n, rects, spans } = prepare(puzzle);
  const count = puzzle.clues.length;
  const cover = new Int32Array(n).fill(-1);
  const placed = new Uint8Array(count);
  const same = (a, c) => a.r === c.r && a.c === c.c && a.w === c.w && a.h === c.h;
  for (const rect of from || []) {
    rects.forEach((list, ci) => {
      if (placed[ci]) return;
      const ri = list.findIndex((mine) => same(mine, rect));
      if (ri < 0) return;
      placed[ci] = 1;
      for (const cell of spans[ci][ri]) cover[cell] = ci;
    });
  }
  const open = [];
  for (let ci = 0; ci < count; ci++) if (!placed[ci]) open.push(ci);
  if (!open.length) return null;

  const alive = [];
  for (const ci of open) {
    alive[ci] = spans[ci].map((_, ri) => ri)
      .filter((ri) => spans[ci][ri].every((cell) => cover[cell] === -1));
  }

  function byCellOf(live) {
    const out = Array.from({ length: n }, () => []);
    for (const ci of open) for (const ri of live[ci]) for (const cell of spans[ci][ri]) out[cell].push([ci, ri]);
    return out;
  }

  // 조각 하나로 정해지는 자리를 찾는다. 단서 쪽을 먼저 본다 — 단서 하나만 보면 되고
  // 칸 쪽은 그 칸에 닿는 조각을 다 떠올려야 한다.
  function settle(live) {
    for (const ci of open) {
      if (live[ci].length === 1) return { via: 'clue', ci, ri: live[ci][0], at: puzzle.clues[ci].cell };
    }
    const byCell = byCellOf(live);
    for (let cell = 0; cell < n; cell++) {
      if (cover[cell] === -1 && byCell[cell].length === 1) {
        return { via: 'cell', ci: byCell[cell][0][0], ri: byCell[cell][0][1], at: cell };
      }
    }
    return null;
  }

  const pack = (hit, why, cells) => ({ rect: rects[hit.ci][hit.ri], clue: hit.ci, why, cells });

  const first = settle(alive);
  if (first) return pack(first, { code: first.via }, [first.at]);

  // 차지. 칸을 덮을 수 있는 후보가 전부 한 단서의 것이거나, 한 단서의 남은 후보가 모두
  // 덮는 칸이면 그 칸은 그 단서 차지다. 단서가 놓인 칸은 말할 것도 없으므로 뺀다.
  const byCell = byCellOf(alive);
  const owner = new Int32Array(n).fill(-1);
  for (let cell = 0; cell < n; cell++) {
    if (cover[cell] !== -1) continue;
    const owners = new Set(byCell[cell].map(([ci]) => ci));
    if (owners.size === 1) owner[cell] = [...owners][0];
  }
  for (const ci of open) {
    if (!alive[ci].length) continue;
    for (const cell of spans[ci][alive[ci][0]]) {
      if (alive[ci].every((ri) => spans[ci][ri].includes(cell))) owner[cell] = ci;
    }
  }
  for (const ci of open) owner[puzzle.clues[ci].cell] = -1;

  // `owns(ci)`가 참인 단서들의 차지로 남의 후보를 지운 뒤 1을 다시 본다. 밝히는 칸은
  // 걸린 자리의 지워진 후보가 밟고 있던 차지 칸과 그 주인 단서뿐이다.
  function tryOwned(owns) {
    const live = [];
    for (const ci of open) {
      live[ci] = alive[ci].filter((ri) => spans[ci][ri].every((cell) =>
        owner[cell] === -1 || owner[cell] === ci || !owns(owner[cell])));
    }
    const hit = settle(live);
    if (!hit) return null;
    const killed = [];
    if (hit.via === 'clue') {
      for (const ri of alive[hit.ci]) if (!live[hit.ci].includes(ri)) killed.push(spans[hit.ci][ri]);
    } else {
      for (const ci of open) {
        for (const ri of alive[ci]) {
          if (spans[ci][ri].includes(hit.at) && !live[ci].includes(ri)) killed.push(spans[ci][ri]);
        }
      }
    }
    const lit = new Set();
    const owners = new Set();
    for (const span of killed) {
      for (const cell of span) {
        if (owner[cell] !== -1 && owns(owner[cell]) && owner[cell] !== hit.ci) {
          lit.add(cell);
          owners.add(owner[cell]);
        }
      }
    }
    for (const ci of owners) lit.add(puzzle.clues[ci].cell);
    return { hit, cells: [...lit].sort((a, b) => a - b), owners: [...owners] };
  }

  let best = null;
  for (const ci of open) {
    if (!owner.includes(ci)) continue;
    const found = tryOwned((o) => o === ci);
    if (found && (!best || found.cells.length < best.cells.length)) best = found;
  }
  if (!best) best = tryOwned(() => true);
  if (best) {
    return pack(best.hit, { code: 'owned', via: best.hit.via, owners: best.owners }, [...best.cells, best.hit.at]);
  }

  const next = logicSolve(puzzle, from).order[0];
  if (!next) return null;
  const ci = rects.findIndex((list, i) => !placed[i] && list.some((mine) => same(mine, next)));
  return { rect: next, clue: ci, why: { code: 'order' }, cells: [] };
}

const Solver = { rectsForClue, prepare, solve, unique, logicSolve, step };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.PatchesSolver = Solver;

})();

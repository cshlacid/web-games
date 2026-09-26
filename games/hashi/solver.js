'use strict';

// 하시 풀이. 두 가지에 쓴다 — 판이 답 하나뿐인지 세고(생성기), 사람이 쓰는
// 수순만으로 끝까지 가는지 본다(내보낼 판 고르기).
//
// **자리마다 "적어도 몇 개, 많아야 몇 개"를 좁혀 간다**(`lo`/`hi`). 사람이 다리
// 잇기를 푸는 방식이 정확히 이것이라, 같은 코드가 "논리로 풀리는가"의 판정도 된다.
// 칸을 하나씩 정해 놓고 되짚는 방식으로 짜면 사람의 수순과 멀어져 그 판정을 따로
// 만들어야 한다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.HashiRules;
const MAX = 2;

function bounds(b) {
  return { lo: b.links.map(() => 0), hi: b.links.map(() => MAX) };
}

// 좁힐 수 있는 만큼 좁힌다. 모순이 보이면 false. `raised`를 주면 아랫값이 오른
// 자리를 오른 순서대로 적는다 — 힌트가 가장 먼저 알 수 있는 자리를 고르는 데 쓴다.
function propagate(b, d, raised) {
  const { lo, hi } = d;
  let moved = true;
  while (moved) {
    moved = false;

    // 교차: 한쪽이 놓이면 다른 쪽은 없다.
    for (const link of b.links) {
      if (lo[link.id] <= 0) continue;
      for (const other of b.crossing[link.id]) {
        if (lo[other] > 0) return false;
        if (hi[other] !== 0) { hi[other] = 0; moved = true; }
      }
    }

    for (const island of b.islands) {
      const mine = b.linksOf[island.id];
      let sumLo = 0;
      let sumHi = 0;
      for (const li of mine) { sumLo += lo[li]; sumHi += hi[li]; }
      if (sumHi < island.need || sumLo > island.need) return false;

      for (const li of mine) {
        // 나머지 자리를 다 써도 모자라면 이 자리에 그만큼은 놓여야 한다.
        const need = island.need - (sumHi - hi[li]);
        if (need > lo[li]) {
          if (need > hi[li]) return false;
          lo[li] = need; moved = true;
          if (raised) raised.push(li);
        }
        // 나머지가 이미 채운 만큼을 빼면 이 자리에 놓을 수 있는 최대가 나온다.
        const room = island.need - (sumLo - lo[li]);
        if (room < hi[li]) {
          if (room < lo[li]) return false;
          hi[li] = room; moved = true;
        }
      }
    }

    // **둘만 남기고 닫히는 다리는 놓지 않는다.** 숫자가 1인 섬 둘을 잇거나 2인 섬
    // 둘을 두 개로 이으면 그 둘만 서로 만족한 채 떨어져 나가, 나머지와 이어질 길이
    // 없어진다. 섬이 둘뿐인 판에서는 그것이 정답이므로 그때는 걸지 않는다.
    if (b.islands.length > 2) {
      for (const link of b.links) {
        const a = b.islands[link.a];
        const c = b.islands[link.b];
        if (a.need === c.need && a.need <= MAX && hi[link.id] >= a.need) {
          if (lo[link.id] >= a.need) return false;
          hi[link.id] = a.need - 1; moved = true;
        }
      }
    }
  }
  return true;
}

function decided(d) {
  return d.lo.every((v, i) => v === d.hi[i]);
}

function stateOf(d) {
  return d.lo.slice();
}

// 정해진 다리만 밟았을 때, 더 이을 여지도 없이 닫힌 덩어리가 생겼는가.
// 그런 덩어리가 섬 전부를 담고 있지 않으면 이 갈래는 버린다.
function closedTooSoon(b, d) {
  const seen = new Array(b.islands.length).fill(false);
  for (const start of b.islands) {
    if (seen[start.id]) continue;
    const group = [start.id];
    seen[start.id] = true;
    let open = false;
    for (let i = 0; i < group.length; i++) {
      const id = group[i];
      for (const li of b.linksOf[id]) {
        if (d.hi[li] > d.lo[li]) open = true;            // 아직 정해지지 않은 자리
        if (d.lo[li] <= 0) continue;
        const link = b.links[li];
        const next = link.a === id ? link.b : link.a;
        if (seen[next]) continue;
        seen[next] = true;
        group.push(next);
      }
    }
    if (!open && group.length < b.islands.length) return true;
  }
  return false;
}

// 답을 센다. limit까지만 세고 멈춘다 — 유일해인지만 알면 되기 때문이다.
function count(b, limit = 2, d = bounds(b)) {
  if (!propagate(b, d)) return 0;
  if (closedTooSoon(b, d)) return 0;

  if (decided(d)) {
    const state = stateOf(d);
    return R.isDone(b, state) ? 1 : 0;
  }

  // 여지가 가장 좁은 자리부터 고른다. 갈래가 적은 곳을 먼저 정해야 되짚기가 줄어든다.
  let pick = -1;
  let width = Infinity;
  for (const link of b.links) {
    const w = d.hi[link.id] - d.lo[link.id];
    if (w > 0 && w < width) { width = w; pick = link.id; }
  }

  let found = 0;
  for (let v = d.lo[pick]; v <= d.hi[pick]; v++) {
    const next = { lo: d.lo.slice(), hi: d.hi.slice() };
    next.lo[pick] = v;
    next.hi[pick] = v;
    found += count(b, limit - found, next);
    if (found >= limit) break;
  }
  return found;
}

function solve(b) {
  const d = bounds(b);
  if (!propagate(b, d)) return null;
  const stack = [d];
  while (stack.length) {
    const cur = stack.pop();
    if (!propagate(b, cur) || closedTooSoon(b, cur)) continue;
    if (decided(cur)) {
      const state = stateOf(cur);
      if (R.isDone(b, state)) return state;
      continue;
    }
    let pick = -1;
    let width = Infinity;
    for (const link of b.links) {
      const w = cur.hi[link.id] - cur.lo[link.id];
      if (w > 0 && w < width) { width = w; pick = link.id; }
    }
    for (let v = cur.hi[pick]; v >= cur.lo[pick]; v--) {
      const next = { lo: cur.lo.slice(), hi: cur.hi.slice() };
      next.lo[pick] = v;
      next.hi[pick] = v;
      stack.push(next);
    }
  }
  return null;
}

// **찍지 않고 풀리는가.** 좁히기만으로 전부 정해지면 참이다. 이것이 통과한 판만
// 내보낸다 — 답이 하나뿐인 판 중에도 마지막에 두 자리를 놓고 찍어야 하는 것이 섞여
// 있고, 그런 판은 다 풀고도 개운하지 않다.
function logicSolve(b) {
  const d = bounds(b);
  if (!propagate(b, d)) return null;
  if (!decided(d)) return null;
  const state = stateOf(d);
  return R.isDone(b, state) ? state : null;
}

// 힌트. **사람이 놓은 다리를 아랫값으로 삼아** 이어 좁히고, 그중 가장 먼저 더 놓아야
// 한다고 드러난 자리를 돌려준다. 정답에서 아무 자리나 골라 주면 지금 판으로는 왜
// 거기인지 알 수 없는 힌트가 된다. 놓인 다리가 정답을 넘지 않는다고 보므로, 넘는
// 것은 부르는 쪽이 먼저 걷어 낸다.
function next(b, state) {
  const d = { lo: state.slice(), hi: b.links.map(() => MAX) };
  const raised = [];
  if (!propagate(b, d, raised)) return null;
  const id = raised.find((li) => d.lo[li] > state[li]);
  return id === undefined ? null : { id, count: d.lo[id] };
}

// 힌트 한 걸음. **섬 하나만 보고** 더 놓아야 하는 다리를 찾는다. `next`는 판 전체를
// 좁힌 뒤 처음 오른 자리를 주는데, 그 사이에 다른 섬들의 윗값을 줄이는 단계가 여럿 숨어
// 있을 수 있다. 이 게임에는 "여기엔 다리 없음"을 남길 표시가 없어 그 단계를 판에 적을
// 수 없으므로, 한 걸음을 섬 하나로 볼 수 있는 범위로 좁힌다.
//
// 자리마다 놓을 수 있는 최대는 누구나 바로 아는 것만 쓴다 — 놓인 다리와 엇갈리면 0, 양쪽
// 섬의 남은 수, 둘, 그리고 같은 1끼리·2끼리는 이으면 둘만 닫힌다(섬이 셋 이상일 때). 섬의
// 남은 수가 다른 자리의 여유를 다 합쳐도 모자라면 이 자리에 그만큼 더 놓는다.
// 돌려주는 것: { id, count, island, why: { code } }. 섬 하나로 안 보이면 `next`로 넘어간다.
function step(b, state) {
  const used = b.islands.map((island) => b.linksOf[island.id].reduce((sum, li) => sum + state[li], 0));
  const hi = b.links.map((link) => {
    if (b.crossing[link.id].some((other) => state[other] > 0)) return state[link.id];
    const a = b.islands[link.a];
    const c = b.islands[link.b];
    let top = Math.min(MAX, state[link.id] + Math.min(a.need - used[a.id], c.need - used[c.id]));
    if (b.islands.length > 2 && a.need === c.need && a.need <= MAX) top = Math.min(top, a.need - 1);
    return Math.max(top, state[link.id]);
  });
  for (const island of b.islands) {
    const rest = island.need - used[island.id];
    if (rest <= 0) continue;
    const mine = b.linksOf[island.id];
    const open = mine.filter((li) => hi[li] > state[li]);
    const room = open.reduce((sum, li) => sum + hi[li] - state[li], 0);
    for (const li of open) {
      const must = rest - (room - (hi[li] - state[li]));
      if (must <= 0) continue;
      const code = open.length === 1 ? 'only' : 'short';
      return { id: li, count: state[li] + must, island: island.id, why: { code } };
    }
  }
  const deep = next(b, state);
  return deep && { ...deep, island: -1, why: { code: 'deep' } };
}

const Solver = { bounds, propagate, count, solve, logicSolve, closedTooSoon, next, step };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.HashiSolver = Solver;

})();

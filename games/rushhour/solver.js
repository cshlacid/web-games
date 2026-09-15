'use strict';

// 풀이기. 판이 좁아 **모든 자리를 넓이 우선으로 훑는 것이 가장 짧고 정확하다** — 6×6에
// 차 열 몇 대면 갈 수 있는 자리가 많아야 수만 개라, 어림짐작 없이 최단 수를 그대로 센다.
// 스물여섯 수짜리 판을 다시 재는 데 40밀리초가 걸린다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.RushRules;

// 어디까지 훑을 것인가. 6×6에 차 열 몇 대면 갈 수 있는 자리가 만 단위라 여기서 걸리는
// 일은 거의 없지만, 헐겁게 놓인 배치는 덩어리가 커질 수 있어 울타리를 둔다.
const CAP = 120000;

// 한 자리에서 넓이 우선으로 퍼져 나가며 자리마다의 거리를 적는다. `cap`에 닿으면 거기서
// 멈춘다 — 굽는 쪽은 "가장 먼 자리"만 있으면 되므로 덩어리를 끝까지 볼 이유가 없다.
// **울타리는 층 단위로 본다.** 한 층을 펼치는 도중에 멈추면 그 층의 거리가 반쪽만
// 채워져, 가장 먼 층이 실제보다 얇아진다.
function sweep(puzzle, start, cap = CAP) {
  const dist = new Map([[R.key(start), 0]]);
  const seen = new Map([[R.key(start), start]]);
  let queue = [start];
  let depth = 0;
  let deepest = [start];

  while (queue.length && dist.size < cap) {
    const next = [];
    depth++;
    for (const state of queue) {
      for (const one of R.moves(puzzle, state)) {
        const moved = state.slice();
        moved[one.id] = one.pos;
        const key = R.key(moved);
        if (dist.has(key)) continue;
        dist.set(key, depth);
        seen.set(key, moved);
        next.push(moved);
      }
    }
    if (next.length) deepest = next;
    queue = next;
  }
  return { dist, seen, depth, deepest };
}

function minMoves(puzzle, state) {
  const start = state || R.stateOf(puzzle.cars);
  const seen = new Set([R.key(start)]);
  let queue = [start];
  let depth = 0;
  if (R.isDone(puzzle, start)) return 0;
  while (queue.length) {
    const next = [];
    depth++;
    for (const one of queue) {
      for (const step of R.moves(puzzle, one)) {
        const moved = one.slice();
        moved[step.id] = step.pos;
        const key = R.key(moved);
        if (seen.has(key)) continue;
        if (R.isDone(puzzle, moved)) return depth;
        seen.add(key);
        next.push(moved);
      }
    }
    queue = next;
    if (seen.size > CAP) return null;
  }
  return null;
}

// 최단 풀이 한 벌. 되짚을 수 있게 어디서 왔는지 적어 두고 끝에서 거슬러 올라간다.
function solve(puzzle, state) {
  const start = state || R.stateOf(puzzle.cars);
  if (R.isDone(puzzle, start)) return [];
  const from = new Map([[R.key(start), null]]);
  let queue = [start];

  while (queue.length) {
    const next = [];
    for (const one of queue) {
      for (const step of R.moves(puzzle, one)) {
        const moved = one.slice();
        moved[step.id] = step.pos;
        const key = R.key(moved);
        if (from.has(key)) continue;
        from.set(key, { prev: one, step });
        if (R.isDone(puzzle, moved)) {
          const path = [];
          let at = { prev: one, step };
          let cursor = key;
          while (at) {
            path.unshift(at.step);
            cursor = R.key(at.prev);
            at = from.get(cursor);
          }
          return path;
        }
        next.push(moved);
      }
    }
    queue = next;
    if (from.size > CAP) return null;
  }
  return null;
}

// 힌트 한 수. 지금 자리에서 최단 풀이의 첫 수를 알려 준다 — 사람이 엉뚱하게 움직여
// 놓았어도 그 자리에서 다시 계산하므로 늘 맞는 수가 나온다.
function nextMove(puzzle, state) {
  const path = solve(puzzle, state);
  return path && path.length ? path[0] : null;
}

const Solver = { CAP, sweep, minMoves, solve, nextMove };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.RushSolver = Solver;

})();

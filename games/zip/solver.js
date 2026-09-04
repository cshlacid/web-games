'use strict';

(function () {

const R = (typeof require !== 'undefined') ? require('./rules.js') : window.ZipRules;

// 판을 완전 탐색으로 푼다. Zip은 "모든 칸을 한 번씩 지나는 경로"를 찾는 문제라
// 해밀턴 경로 문제이고, 가지치기 없이 두면 7×7에서도 끝나지 않는다. 그래서 한 칸
// 늘릴 때마다 남은 칸이 아직 가능한 모양인지를 두 가지로 본다.
//
// 판정에 예산(budget)을 둔 것은 생성기 때문이다. 숫자를 하나 빼 보고 유일해가
// 유지되는지 묻는 일을 수십 번 반복하는데, 개중에는 해가 폭발하는 배치가 섞여
// 있다. 그런 배치에서 답을 기다리는 대신 "모르겠다"(aborted)로 접고 그 숫자를
// 그대로 두는 편이 낫다 — 판이 조금 쉬워질 뿐 틀리지는 않는다.

const BUDGET = 400000;

function makeSearch(b) {
  const state = R.reset(b, R.newState());
  const stamp = new Int32Array(b.n);
  const stack = new Int32Array(b.n);
  let mark = 0;

  // 남은 칸들이 지금 위치에서 전부 닿는가, 그리고 길이 하나뿐인 칸이 둘 이상
  // 있지는 않은가. 뒤엣것은 경로가 그 칸에 들어갔다 나올 수 없다는 뜻이고, 길이
  // 하나만 있어도 되는 칸은 경로의 마지막 칸 하나뿐이다.
  function feasible() {
    const cur = state.path[state.path.length - 1];
    const remaining = b.n - state.path.length;
    if (remaining === 0) return true;

    mark++;
    let top = 0;
    for (const nb of b.links[cur]) {
      if (!state.visited[nb] && stamp[nb] !== mark) { stamp[nb] = mark; stack[top++] = nb; }
    }
    for (let head = 0; head < top; head++) {
      for (const nb of b.links[stack[head]]) {
        if (!state.visited[nb] && stamp[nb] !== mark) { stamp[nb] = mark; stack[top++] = nb; }
      }
    }
    if (top !== remaining) return false;

    let ends = 0;
    for (let i = 0; i < top; i++) {
      const u = stack[i];
      let avail = 0;
      for (const nb of b.links[u]) {
        if (!state.visited[nb]) avail++;
        else if (nb === cur) avail++;
      }
      if (avail === 0) return false;
      if (avail === 1 && ++ends > 1) return false;
    }
    return true;
  }

  function moves() {
    const cur = state.path[state.path.length - 1];
    const out = [];
    for (const nb of b.links[cur]) if (R.canPush(b, state, nb)) out.push(nb);
    return out;
  }

  return { state, feasible, moves };
}

// 막다른 길에 덜 걸리도록 남은 이웃이 적은 칸부터 본다(Warnsdorff).
function degree(b, state, cell) {
  let d = 0;
  for (const nb of b.links[cell]) if (!state.visited[nb]) d++;
  return d;
}

function countSolutions(puzzle, opts = {}) {
  const limit = opts.limit || 2;
  const budget = opts.budget || BUDGET;
  const b = R.board(puzzle);
  const { state, feasible, moves } = makeSearch(b);

  let nodes = 0;
  let count = 0;
  let aborted = false;
  let first = null;

  function dfs() {
    if (++nodes > budget) { aborted = true; return; }
    if (state.path.length === b.n) {
      if (R.isDone(b, state)) {
        count++;
        if (!first) first = state.path.slice();
      }
      return;
    }
    const cands = moves();
    cands.sort((x, y) => degree(b, state, x) - degree(b, state, y));
    for (const nb of cands) {
      R.push(b, state, nb);
      if (feasible()) dfs();
      R.pop(b, state);
      if (count >= limit || aborted) return;
    }
  }

  const start = puzzle.hints[0];
  if (start === undefined || !R.push(b, state, start)) return { count: 0, aborted: false, solution: null };
  if (feasible()) dfs();

  return { count, aborted, solution: first };
}

function solve(puzzle, opts = {}) {
  return countSolutions(puzzle, { ...opts, limit: 1 }).solution;
}

// 격자를 전부 덮는 경로 하나를 무작위로 뽑는다. 생성기는 이 경로를 정답으로 놓고
// 그 위에 숫자와 벽을 얹는다 — 정답에서 거꾸로 만들므로 풀리지 않는 판이 나오지
// 않는다.
function randomFullPath(size, rng, opts = {}) {
  const n = size * size;
  const budget = opts.budget || BUDGET;
  // 격자는 체스판처럼 두 색으로 갈리고 경로는 색을 번갈아 밟는다. 칸 수가 홀수인
  // 판(홀수 크기)은 많은 쪽 색이 한 칸 더 많으므로 시작도 끝도 그 색이어야 한다.
  // 적은 쪽에서 출발하면 해가 아예 없어서 탐색이 예산만 태우고 끝난다.
  let start = Math.floor(rng() * n);
  if (size % 2 === 1) {
    while ((Math.floor(start / size) + (start % size)) % 2 !== 0) start = Math.floor(rng() * n);
  }
  const b = R.board({ size, hints: [start], walls: opts.walls || [] });
  const { state, feasible, moves } = makeSearch(b);

  let nodes = 0;
  let found = null;

  function dfs() {
    if (++nodes > budget || found) return;
    if (state.path.length === b.n) { found = state.path.slice(); return; }
    const cands = moves();
    // 같은 차수끼리는 무작위로 섞어야 매번 다른 경로가 나온다.
    const keyed = cands.map((cell) => ({ cell, d: degree(b, state, cell) * 2 + rng() }));
    keyed.sort((x, y) => x.d - y.d);
    for (const { cell } of keyed) {
      R.push(b, state, cell);
      if (feasible()) dfs();
      R.pop(b, state);
      if (found) return;
    }
  }

  R.push(b, state, start);
  if (feasible()) dfs();
  return found;
}

const Solver = { BUDGET, countSolutions, solve, randomFullPath };

if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
if (typeof window !== 'undefined') window.ZipSolver = Solver;

})();

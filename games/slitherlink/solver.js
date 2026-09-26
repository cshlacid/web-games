'use strict';

// 슬리더링크 풀이. 두 가지에 쓴다 — 생성기가 숫자를 지워도 판이 여전히 풀리는지
// 보고(`solve`), 힌트가 지금 판에서 사람이 다음으로 알아낼 수 있는 변을 짚는다(`next`).
//
// **찍지 않는다.** 사람이 쓰는 규칙만으로 끝까지 가면 그 판은 답이 하나뿐이다 —
// 규칙은 참인 것만 이끌어 내므로, 모든 변이 정해졌다면 다른 답이 들어설 자리가
// 없다. 그래서 생성기가 답의 수를 따로 세지 않는다.
//
// 규칙은 넷이다.
//   칸: 숫자만큼 선이 찼으면 나머지는 X, 남은 변을 다 그어야 숫자가 차면 전부 선.
//   점: 선은 점에서 둘씩 만난다 — 둘이 찼으면 나머지는 X, 하나 닿았는데 길이 하나면
//       그리로, 아무것도 안 닿았는데 길이 하나뿐이면 막다른 길이라 X.
//   고리: 이으면 고리가 일찍 닫히는 변은 X. 고리 하나로 다 닫혔으면 남은 변은 X.
//   가정(어려움만): 한 변을 선이라 두고 위 셋을 돌려 모순이 나면 X, 반대도 같다.
//
// 이유는 문장이 아니라 자료로 돌려준다(`why: { code, ... }`). 문장은 화면이 엮는다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.SlitherRules;
const { EMPTY, LINE, CROSS } = R;

// 사람이 머리로 따라갈 수 있는 가정의 길이. 놓아 보고 두 걸음 안에 막히는 것까지만
// 논리로 친다. 그보다 긴 가정이 필요한 판은 "경우의 수를 다 따져 봐야 하는" 판이라
// 굽지 않는다.
const SHORT_TRIAL = 2;

function context(puzzle) {
  return { geo: R.geometry(puzzle.rows, puzzle.cols), clues: puzzle.clues };
}

function tally(edges, list) {
  let lines = 0;
  let open = 0;
  for (const e of list) {
    if (edges[e] === LINE) lines++;
    else if (edges[e] === EMPTY) open++;
  }
  return { lines, open };
}

function openOf(edges, list) {
  return list.filter((e) => edges[e] === EMPTY);
}

// 칸 하나에서 이끌어 낼 것. 없으면 null, 모순이면 'bad'.
function cellRule(ctx, edges, cell) {
  const k = ctx.clues[cell];
  if (k < 0) return null;
  const list = ctx.geo.cellEdges[cell];
  const { lines, open } = tally(edges, list);
  if (lines > k || lines + open < k) return 'bad';
  if (!open) return null;
  if (lines === k) return { edges: openOf(edges, list), value: CROSS, why: { code: 'cellFull', cell, clue: k } };
  if (lines + open === k) return { edges: openOf(edges, list), value: LINE, why: { code: 'cellNeed', cell, clue: k } };
  return null;
}

function vertexRule(ctx, edges, vertex) {
  const list = ctx.geo.vertexEdges[vertex];
  const { lines, open } = tally(edges, list);
  if (lines > 2 || (lines === 1 && open === 0)) return 'bad';
  if (!open) return null;
  if (lines === 2) return { edges: openOf(edges, list), value: CROSS, why: { code: 'vertexFull', vertex } };
  if (lines === 1 && open === 1) return { edges: openOf(edges, list), value: LINE, why: { code: 'vertexContinue', vertex } };
  if (lines === 0 && open === 1) return { edges: openOf(edges, list), value: CROSS, why: { code: 'vertexDead', vertex } };
  return null;
}

// 선으로 이어진 덩어리. 점마다 대표를 두고, 덩어리마다 선 수와 점 수를 센다 —
// 선 수와 점 수가 같으면 닫힌 고리다(점에서 선이 둘을 넘지 않는 한).
function groups(ctx, edges) {
  const geo = ctx.geo;
  const parent = new Int32Array(geo.vertexCount);
  for (let v = 0; v < geo.vertexCount; v++) parent[v] = v;
  const find = (v) => {
    while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
    return v;
  };
  let total = 0;
  for (let e = 0; e < geo.edgeCount; e++) {
    if (edges[e] !== LINE) continue;
    total++;
    const [a, b] = geo.edgeVerts[e];
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  const lineCount = new Map();
  const vertexCount = new Map();
  for (let e = 0; e < geo.edgeCount; e++) {
    if (edges[e] !== LINE) continue;
    const root = find(geo.edgeVerts[e][0]);
    lineCount.set(root, (lineCount.get(root) || 0) + 1);
  }
  for (let v = 0; v < geo.vertexCount; v++) {
    if (!tally(edges, geo.vertexEdges[v]).lines) continue;
    const root = find(v);
    vertexCount.set(root, (vertexCount.get(root) || 0) + 1);
  }
  return { find, total, lineCount, vertexCount };
}

// 변 하나를 더했을 때 모든 숫자가 맞는지. 마지막 한 변으로 고리를 닫아도 되는지 본다.
function cluesMetWith(ctx, edges, extra) {
  const geo = ctx.geo;
  for (let cell = 0; cell < geo.cellCount; cell++) {
    const k = ctx.clues[cell];
    if (k < 0) continue;
    let n = tally(edges, geo.cellEdges[cell]).lines;
    if (geo.edgeCells[extra].includes(cell)) n++;
    if (n !== k) return false;
  }
  return true;
}

// 고리 규칙. 결과는 이끌어 낸 것들의 배열(비었으면 없음)이거나 'bad'.
function loopRule(ctx, edges, firstOnly) {
  const geo = ctx.geo;
  const g = groups(ctx, edges);
  if (!g.total) return [];
  const out = [];

  for (const [root, lines] of g.lineCount) {
    if (lines !== g.vertexCount.get(root)) continue;
    // 닫힌 고리가 있다. 다른 선이 남아 있으면 고리가 둘이 되므로 틀린 판이다.
    if (lines !== g.total) return 'bad';
    // 고리 하나로 다 이었다. 남은 변은 전부 X이고, 숫자가 다 맞아야 한다.
    const rest = [];
    for (let e = 0; e < geo.edgeCount; e++) if (edges[e] === EMPTY) rest.push(e);
    for (let cell = 0; cell < geo.cellCount; cell++) {
      const k = ctx.clues[cell];
      if (k >= 0 && tally(edges, geo.cellEdges[cell]).lines !== k) return 'bad';
    }
    return rest.length ? [{ edges: rest, value: CROSS, why: { code: 'loopDone' } }] : [];
  }

  for (let e = 0; e < geo.edgeCount; e++) {
    if (edges[e] !== EMPTY) continue;
    const [a, b] = geo.edgeVerts[e];
    const root = g.find(a);
    if (root !== g.find(b) || !g.lineCount.has(root)) continue;
    // 두 끝이 같은 덩어리다. 이으면 고리가 닫힌다. 판의 선을 다 품은 덩어리이고
    // 닫았을 때 숫자가 다 맞으면 그 고리가 답일 수 있어 아무것도 이끌어 내지 않는다 —
    // "그러니 선이다"라고 하면 답이 여럿인 판에서 하나를 골라 놓고 풀렸다고 믿게 된다.
    // 마지막 한 변은 점 규칙이 알아서 잇는다.
    const whole = g.lineCount.get(root) === g.total;
    if (whole && cluesMetWith(ctx, edges, e)) continue;
    out.push({ edges: [e], value: CROSS, why: { code: 'loopEarly', edge: e } });
    if (firstOnly) return out;
  }
  return out;
}

// 이끌어 낸 것을 판에 적는다. 이미 반대로 정해진 변이면 모순이다.
function write(edges, found, touched) {
  for (const e of found.edges) {
    if (edges[e] === found.value) continue;
    if (edges[e] !== EMPTY) return false;
    edges[e] = found.value;
    if (touched) touched.push(e);
  }
  return true;
}

// 칸과 점 규칙을 더 나올 것이 없을 때까지 돌린다. 바뀐 변 둘레만 다시 본다.
function local(ctx, edges) {
  const geo = ctx.geo;
  const cellQueue = [];
  const vertexQueue = [];
  const cellMark = new Uint8Array(geo.cellCount);
  const vertexMark = new Uint8Array(geo.vertexCount);
  for (let c = 0; c < geo.cellCount; c++) { cellQueue.push(c); cellMark[c] = 1; }
  for (let v = 0; v < geo.vertexCount; v++) { vertexQueue.push(v); vertexMark[v] = 1; }

  const touched = [];
  const wake = () => {
    for (const e of touched) {
      for (const c of geo.edgeCells[e]) if (!cellMark[c]) { cellMark[c] = 1; cellQueue.push(c); }
      for (const v of geo.edgeVerts[e]) if (!vertexMark[v]) { vertexMark[v] = 1; vertexQueue.push(v); }
    }
    touched.length = 0;
  };

  while (cellQueue.length || vertexQueue.length) {
    if (cellQueue.length) {
      const c = cellQueue.pop();
      cellMark[c] = 0;
      const found = cellRule(ctx, edges, c);
      if (found === 'bad') return false;
      if (found && !write(edges, found, touched)) return false;
    } else {
      const v = vertexQueue.pop();
      vertexMark[v] = 0;
      const found = vertexRule(ctx, edges, v);
      if (found === 'bad') return false;
      if (found && !write(edges, found, touched)) return false;
    }
    wake();
  }
  return true;
}

// 칸·점·고리 규칙을 다 돌린다. 모순이면 false.
function settle(ctx, edges) {
  for (;;) {
    if (!local(ctx, edges)) return false;
    const found = loopRule(ctx, edges, false);
    if (found === 'bad') return false;
    if (!found.length) return true;
    for (const one of found) if (!write(edges, one, null)) return false;
  }
}

// 가정 하나. 변 e를 value로 두었을 때 모순이 나는지.
function breaks(ctx, edges, e, value) {
  const copy = edges.slice();
  copy[e] = value;
  return !settle(ctx, copy);
}

// 처음 걸린 가정. 끝까지 따라가 보는 것이라 사람의 수순이 아니고, 짧은 가정이 없을 때
// 화면이 정답을 얻거나 힌트가 막히지 않게 하는 마지막 길로만 쓴다.
function anyTrial(ctx, edges) {
  for (let e = 0; e < ctx.geo.edgeCount; e++) {
    if (edges[e] !== EMPTY) continue;
    if (breaks(ctx, edges, e, LINE)) return { edges: [e], value: CROSS, why: { code: 'trialCross', edge: e } };
    if (breaks(ctx, edges, e, CROSS)) return { edges: [e], value: LINE, why: { code: 'trialLine', edge: e } };
  }
  return null;
}

// 규칙 하나를 한 번. `settle`은 바뀐 변 둘레를 몰아서 돌려 빠르지만 몇 걸음인지 셀 수
// 없어, 가정의 길이를 잴 때는 이것을 한 번씩 부른다. 모순이면 'bad'.
function oneStep(ctx, edges) {
  for (let cell = 0; cell < ctx.geo.cellCount; cell++) {
    const found = cellRule(ctx, edges, cell);
    if (found) return found;
  }
  for (let v = 0; v < ctx.geo.vertexCount; v++) {
    const found = vertexRule(ctx, edges, v);
    if (found) return found;
  }
  const loop = loopRule(ctx, edges, true);
  if (loop === 'bad') return 'bad';
  return loop.length ? loop[0] : null;
}

// 규칙을 몇 번 써서 모순이 나는지. limit 안에 모순이 안 나면 0.
function refute(ctx, edges, limit) {
  for (let steps = 1; steps <= limit; steps++) {
    const found = oneStep(ctx, edges);
    if (found === 'bad') return steps;
    if (!found) return 0;
    if (!write(edges, found, null)) return steps;
  }
  return 0;
}

// 짧은 가정. 한 변을 선(또는 X)이라 두고 limit 걸음 안에 모순이 나면 반대다. **가장
// 빨리 막히는 것을 고른다** — 처음 걸린 변을 주면 한참 따라가야 막히는 것이 나온다.
function trialRule(ctx, edges, limit = SHORT_TRIAL) {
  let best = null;
  for (let e = 0; e < ctx.geo.edgeCount; e++) {
    if (edges[e] !== EMPTY) continue;
    for (const [guess, other, code] of [[LINE, CROSS, 'trialCross'], [CROSS, LINE, 'trialLine']]) {
      const copy = edges.slice();
      copy[e] = guess;
      const steps = refute(ctx, copy, best ? best.why.steps - 1 : limit);
      if (steps) best = { edges: [e], value: other, why: { code, edge: e, steps } };
      if (best && best.why.steps === 1) return best;
    }
  }
  return best;
}

// 판을 끝까지 푼다. `trial`이 없으면 가정 없이 규칙만 쓴다.
// 결과: { solved, edges, trials } — trials는 가정을 몇 번 썼는지(난이도를 재는 데 쓴다).
function solve(puzzle, options = {}) {
  const ctx = context(puzzle);
  const edges = options.edges ? Uint8Array.from(options.edges) : new Uint8Array(ctx.geo.edgeCount);
  let trials = 0;
  for (;;) {
    if (!settle(ctx, edges)) return { solved: false, edges, trials, broken: true };
    if (!edges.includes(EMPTY)) break;
    if (!options.trial) break;
    // 짧은 가정만 쓴다. 정답을 얻으려는 화면만 `limit: Infinity`로 끝까지 간다.
    const found = options.limit === Infinity
      ? trialRule(ctx, edges) || anyTrial(ctx, edges)
      : trialRule(ctx, edges, options.limit ?? SHORT_TRIAL);
    if (!found) break;
    trials++;
    write(edges, found, null);
  }
  const solved = !edges.includes(EMPTY) && R.inspect(puzzle, edges).solved;
  return { solved, edges, trials };
}

// 지금 판에서 알아낼 수 있는 것 하나. 사람이 먼저 보는 순서대로 — 칸, 점, 고리,
// 가정. 없으면 null.
//
// 넘겨받는 판에는 틀린 선이 없어야 한다(화면이 힌트 전에 걷어 낸다). 틀린 것이 섞여
// 있으면 엉뚱한 것을 이끌어 낼 수 있다.
function next(puzzle, edges, options = {}) {
  const ctx = context(puzzle);
  for (let cell = 0; cell < ctx.geo.cellCount; cell++) {
    const found = cellRule(ctx, edges, cell);
    if (found && found !== 'bad') return found;
  }
  for (let v = 0; v < ctx.geo.vertexCount; v++) {
    const found = vertexRule(ctx, edges, v);
    if (found && found !== 'bad') return found;
  }
  const loop = loopRule(ctx, edges, true);
  if (loop !== 'bad' && loop.length) return loop[0];
  if (options.trial) return trialRule(ctx, edges) || anyTrial(ctx, edges);
  return null;
}

const api = { SHORT_TRIAL, solve, next, settle, context };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SlitherSolver = api;

})();

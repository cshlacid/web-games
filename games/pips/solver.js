'use strict';

// Pips 풀이. 두 가지에 쓴다 — 굽는 자리에서 판이 찍지 않고 끝까지 풀리는지 보고
// (`solve`), 힌트가 지금 판에서 사람이 새로 알 수 있는 놓기 하나를 짚는다(`hint`).
//
// **찍지 않는다.** 아래 규칙은 참인 것만 이끌어 내므로 끝까지 풀리면 어느 도미노가 어느 두
// 칸에 가는지가 하나뿐이다. **방향은 하나로 정하지 않는다** — 한 구역 안에 통째로 든 도미노는
// 뒤집어도 합이 같아 둘 다 답이다. 방향까지 하나로 몰려면 그런 도미노마다 조건을 더 줘야 해서
// 판이 한 칸짜리 구역으로 뒤덮였다. 화면은 규칙으로 정답을 가리므로 어느 방향이든 맞다.
//
// 칸마다 올 수 있는 눈을 비트로 들고(1 << 눈), "도미노 t를 이웃한 두 칸 u<v에 놓는다"는 놓기
// 후보를 거기에 맞춰 거른다. 놓기마다 가능한 방향을 비트로 든다(1: 앞 눈이 u, 2: 앞 눈이 v).
//   1. 칸의 눈 후보는 그 칸을 덮을 수 있는 놓기 후보가 주는 눈으로 줄어든다.
//   2. 구역 조건(합의 최소·최대, 같음, 다름)으로 칸의 눈 후보를 줄인다.
//   3. 칸을 덮을 수 있는 놓기가 하나뿐이거나(`cell`), 도미노가 갈 자리가 하나뿐이면(`tile`)
//      그것을 놓는다.
//   4. 가정(어려움만): 놓기 하나를 해 보고 1~3을 몇 걸음 돌려 모순이 나면 그 놓기는 빠진다.
// 이유는 문장이 아니라 자료로 돌려준다(`why: { code, ... }`). 문장은 화면이 엮는다.
(function () {

const R = typeof require === 'function' ? require('./rules.js') : window.PipsRules;

const bit = (v) => 1 << v;
const ALL = (1 << (R.MAX_PIP + 1)) - 1;

// 넣어 보고 이만큼 걸음 안에 막히는 것까지만 머리로 따라갈 수 있는 가정으로 친다.
const SHORT_TRIAL = 2;

function popcount(mask) {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
}

const lowest = (mask) => 31 - Math.clz32(mask & -mask);
const highest = (mask) => 31 - Math.clz32(mask);

function context(puzzle) {
  const n = puzzle.pos.length;
  const edges = [];
  puzzle.adj.forEach((list, u) => { for (const v of list) if (u < v) edges.push([u, v]); });
  return { puzzle, n, edges, tiles: puzzle.tiles, regions: puzzle.regions, regionOf: puzzle.regionOf };
}

function start(ctx) {
  return {
    cand: new Uint8Array(ctx.n).fill(ALL),
    partner: new Int16Array(ctx.n).fill(-1),
    placed: ctx.tiles.map(() => null),
    banned: new Set(),
  };
}

function clone(st) {
  return { cand: st.cand.slice(), partner: st.partner.slice(), placed: st.placed.slice(), banned: new Set(st.banned) };
}

// 방향 o로 놓았을 때 u·v에 오는 눈.
const pipsOf = (ctx, t, o) => (o === 1 ? ctx.tiles[t] : [ctx.tiles[t][1], ctx.tiles[t][0]]);

const keyOf = (ctx, t, u, v) => (t * ctx.n + u) * ctx.n + v;

// 구역이 아직 성립할 수 있는가. `mask(c)`는 칸 c의 눈 후보.
function regionOk(region, mask) {
  const { kind, target, cells } = region;
  if (kind === 'eq') return cells.reduce((m, c) => m & mask(c), ALL) !== 0;
  if (kind === 'ne') {
    let union = 0;
    let fixed = 0;
    for (const c of cells) {
      const m = mask(c);
      union |= m;
      if (popcount(m) === 1) {
        if (fixed & m) return false;
        fixed |= m;
      }
    }
    return popcount(union) >= cells.length;
  }
  let lo = 0;
  let hi = 0;
  for (const c of cells) {
    const m = mask(c);
    if (!m) return false;
    lo += lowest(m);
    hi += highest(m);
  }
  if (kind === 'sum') return lo <= target && target <= hi;
  if (kind === 'lt') return lo < target;
  return hi > target;
}

// 도미노 t를 u·v에 놓을 때 지금 성립하는 방향(`want` 안에서).
function orients(ctx, st, t, u, v, want = 3) {
  const [x, y] = ctx.tiles[t];
  let out = 0;
  for (const o of x === y ? [1] : [1, 2]) {
    if (!(want & o)) continue;
    const [pu, pv] = pipsOf(ctx, t, o);
    if (!(st.cand[u] & bit(pu)) || !(st.cand[v] & bit(pv))) continue;
    const mask = (c) => (c === u ? bit(pu) : c === v ? bit(pv) : st.cand[c]);
    const ru = ctx.regionOf[u];
    const rv = ctx.regionOf[v];
    if (ru >= 0 && !regionOk(ctx.regions[ru], mask)) continue;
    if (rv >= 0 && rv !== ru && !regionOk(ctx.regions[rv], mask)) continue;
    out |= o;
  }
  return out;
}

function setOrient(st, ctx, t, o) {
  const p = st.placed[t];
  st.placed[t] = { u: p.u, v: p.v, o };
  st.cand[p.u] = 0;
  st.cand[p.v] = 0;
  for (const k of [1, 2]) {
    if (!(o & k)) continue;
    const [pu, pv] = pipsOf(ctx, t, k);
    st.cand[p.u] |= bit(pu);
    st.cand[p.v] |= bit(pv);
  }
}

function place(st, ctx, opt) {
  st.partner[opt.u] = opt.v;
  st.partner[opt.v] = opt.u;
  st.placed[opt.t] = { u: opt.u, v: opt.v, o: opt.o };
  setOrient(st, ctx, opt.t, opt.o);
}

// 지금 남은 놓기 후보 전부: 빈 이웃 두 칸에 성립하는 방향이 하나라도 있는 것.
function options(ctx, st) {
  const out = [];
  ctx.tiles.forEach((_, t) => {
    if (st.placed[t]) return;
    for (const [u, v] of ctx.edges) {
      if (st.partner[u] >= 0 || st.partner[v] >= 0 || st.banned.has(keyOf(ctx, t, u, v))) continue;
      const o = orients(ctx, st, t, u, v);
      if (o) out.push({ t, u, v, o });
    }
  });
  return out;
}

// 규칙 1·2를 더 줄지 않을 때까지 돌린다. 모순이면 null, 아니면 남은 놓기 후보.
function narrow(ctx, st) {
  for (;;) {
    let changed = false;
    for (let t = 0; t < ctx.tiles.length; t++) {
      const p = st.placed[t];
      if (!p || popcount(p.o) < 2) continue;
      const o = orients(ctx, st, t, p.u, p.v, p.o);
      if (!o) return null;
      if (o !== p.o) { setOrient(st, ctx, t, o); changed = true; }
    }
    const opts = options(ctx, st);
    const support = new Uint8Array(ctx.n);
    const perTile = new Int32Array(ctx.tiles.length);
    for (const { t, u, v, o } of opts) {
      for (const k of [1, 2]) {
        if (!(o & k)) continue;
        const [pu, pv] = pipsOf(ctx, t, k);
        support[u] |= bit(pu);
        support[v] |= bit(pv);
      }
      perTile[t]++;
    }
    if (st.placed.some((p, t) => !p && !perTile[t])) return null;
    for (let c = 0; c < ctx.n; c++) {
      if (st.partner[c] >= 0) continue;
      const next = st.cand[c] & support[c];
      if (!next) return null;
      if (next !== st.cand[c]) { st.cand[c] = next; changed = true; }
    }
    for (const region of ctx.regions) {
      for (const c of region.cells) {
        if (popcount(st.cand[c]) < 2) continue;
        let keep = 0;
        for (let v = 0; v <= R.MAX_PIP; v++) {
          if (!(st.cand[c] & bit(v))) continue;
          if (regionOk(region, (d) => (d === c ? bit(v) : st.cand[d]))) keep |= bit(v);
        }
        if (!keep) return null;
        if (keep !== st.cand[c]) { st.cand[c] = keep; changed = true; }
      }
    }
    if (!changed) return opts;
  }
}

// 반드시 해야 하는 놓기(규칙 3). 칸 쪽을 먼저 본다 — "이 칸은 이렇게밖에 못 덮는다"가
// "이 도미노는 여기밖에 못 간다"보다 눈으로 확인하기 쉽다.
function forced(ctx, st, opts) {
  const byCell = Array.from({ length: ctx.n }, () => []);
  const byTile = ctx.tiles.map(() => []);
  for (const opt of opts) {
    byCell[opt.u].push(opt);
    byCell[opt.v].push(opt);
    byTile[opt.t].push(opt);
  }
  const out = [];
  for (let c = 0; c < ctx.n; c++) {
    if (st.partner[c] < 0 && byCell[c].length === 1) out.push({ ...byCell[c][0], code: 'cell', cell: c });
  }
  byTile.forEach((list, t) => { if (!st.placed[t] && list.length === 1) out.push({ ...list[0], code: 'tile' }); });
  return out;
}

const done = (st) => st.placed.every(Boolean);

// 다 놓은 판에서 아직 정하지 않은 방향을 고른다. 구역 하나에 걸친 방향 둘이 서로 묶일 수
// 있어(합이 맞는 짝이 정해져 있다) 하나씩 따로 보면 안 되고 함께 맞춰 본다. 안 되면 null.
function resolve(ctx, st) {
  const open = [];
  st.placed.forEach((p, t) => { if (popcount(p.o) > 1) open.push(t); });
  const copy = clone(st);
  const ok = () => ctx.regions.every((region) => regionOk(region, (c) => copy.cand[c]));
  return (function rec(k) {
    if (k === open.length) return ok() ? copy.placed.map((p) => p.o) : null;
    const t = open[k];
    for (const o of [1, 2]) {
      setOrient(copy, ctx, t, o);
      if (!ok()) continue;
      const got = rec(k + 1);
      if (got) return got;
    }
    setOrient(copy, ctx, t, st.placed[t].o);
    return null;
  })(0);
}

// 규칙 1~3을 막힐 때까지. `steps`는 한 번에 놓을 수 있는 것을 다 놓는 걸음의 상한이다.
// 반드시 해야 하는 놓기 둘이 서로 부딪히면 그것도 모순이다.
function settle(ctx, st, steps = Infinity) {
  for (let k = 0; k < steps; k++) {
    const opts = narrow(ctx, st);
    if (!opts) return false;
    if (done(st)) return resolve(ctx, st) !== null;
    const must = forced(ctx, st, opts);
    if (!must.length) return true;
    for (const opt of must) {
      const same = st.placed[opt.t];
      if (same && same.u === opt.u && same.v === opt.v) continue;
      if (same || st.partner[opt.u] >= 0 || st.partner[opt.v] >= 0) return false;
      place(st, ctx, opt);
    }
  }
  return narrow(ctx, st) !== null;
}

// 가정 한 번: 놓아 보면 `limit` 걸음 안에 모순이 나는 놓기를 하나 찾아 뺀다. 짧은 것부터
// 찾는다 — 처음 걸린 것을 쓰면 사람이 따라갈 수 없을 만큼 긴 가정이 나온다.
function trial(ctx, st, limit = SHORT_TRIAL) {
  const opts = narrow(ctx, st);
  if (!opts) return null;
  const tiers = [];
  for (let s = 1; s <= Math.min(limit, SHORT_TRIAL + 1); s++) tiers.push(s);
  if (limit === Infinity) tiers.push(Infinity);
  for (const steps of tiers) {
    for (const opt of opts) {
      const copy = clone(st);
      place(copy, ctx, opt);
      if (!settle(ctx, copy, steps)) {
        st.banned.add(keyOf(ctx, opt.t, opt.u, opt.v));
        return opt;
      }
    }
  }
  return null;
}

// 끝까지 뒤져 답(도미노가 가는 자리)을 센다. `max`개에서 멈춘다.
function dfs(ctx, st, max, found) {
  if (found.length >= max) return;
  if (!settle(ctx, st)) return;
  if (done(st)) { found.push(st); return; }
  const opts = narrow(ctx, st);
  const count = new Int32Array(ctx.n);
  for (const { u, v } of opts) { count[u]++; count[v]++; }
  let pick = -1;
  for (let c = 0; c < ctx.n; c++) {
    if (st.partner[c] < 0 && (pick < 0 || count[c] < count[pick])) pick = c;
  }
  for (const opt of opts) {
    if (opt.u !== pick && opt.v !== pick) continue;
    const copy = clone(st);
    place(copy, ctx, opt);
    dfs(ctx, copy, max, found);
  }
}

// 풀이기의 놓기를 화면의 꼴로: 도미노의 앞 눈이 a, 뒤 눈이 b. 방향은 `orient`(없으면 첫 방향).
function output(st, orient) {
  return st.placed.map((p, t) => {
    if (!p) return null;
    const o = orient ? orient[t] : p.o & 1 ? 1 : 2;
    return o === 1 ? { a: p.u, b: p.v } : { a: p.v, b: p.u };
  });
}

// 화면이 놓아 둔 도미노를 풀이기 상태에 옮긴다.
function adopt(ctx, st, placed) {
  placed.forEach((p, t) => {
    if (!p) return;
    const u = Math.min(p.a, p.b);
    const v = Math.max(p.a, p.b);
    const [x, y] = ctx.tiles[t];
    place(st, ctx, { t, u, v, o: x === y || p.a === u ? 1 : 2 });
  });
}

function search(puzzle, max = 2, placed) {
  const ctx = context(puzzle);
  const st = start(ctx);
  if (placed) adopt(ctx, st, placed);
  const found = [];
  dfs(ctx, st, max, found);
  return found.map((one) => output(one, resolve(ctx, one)));
}

// 판을 끝까지 푼다. `trial`이 없으면 가정 없이 규칙만 쓴다. `placed`가 있으면 거기서부터.
// 결과: { solved, placed, trials } — trials는 가정을 몇 번 썼는지.
function solve(puzzle, options = {}) {
  const ctx = context(puzzle);
  const st = start(ctx);
  if (options.placed) adopt(ctx, st, options.placed);
  let trials = 0;
  for (;;) {
    if (!settle(ctx, st)) return { solved: false, placed: output(st), trials, broken: true };
    if (done(st) || !options.trial) break;
    if (options.maxTrials !== undefined && trials >= options.maxTrials) break;
    if (!trial(ctx, st, options.limit ?? SHORT_TRIAL)) break;
    trials++;
  }
  if (!done(st)) return { solved: false, placed: output(st), trials };
  const placed = output(st, resolve(ctx, st));
  return { solved: R.inspect(puzzle, placed).solved, placed, trials };
}

// 힌트 한 걸음. 놓아 둔 도미노를 알아낸 것으로 보고 새로 할 수 있는 놓기 하나를 돌려준다.
//   { t, a, b, why: { code, cell? } }
// 넘겨받는 판은 끝까지 풀릴 수 있어야 한다(화면이 먼저 틀린 놓기를 짚어 낸다).
// 방향이 둘 다 남는 놓기는 끝까지 풀리는 쪽을 고른다.
function hint(puzzle, placed) {
  const ctx = context(puzzle);
  const st = start(ctx);
  adopt(ctx, st, placed);
  let tried = false;
  for (;;) {
    const opts = narrow(ctx, st);
    if (!opts || done(st)) return null;
    const must = forced(ctx, st, opts);
    if (must.length) {
      const { t, u, v, o, code, cell } = must[0];
      let pick = o & 1 ? 1 : 2;
      if (popcount(o) > 1) {
        pick = [1, 2].find((k) => {
          const copy = clone(st);
          place(copy, ctx, { t, u, v, o: k });
          const found = [];
          dfs(ctx, copy, 1, found);
          return found.length > 0;
        }) || 1;
      }
      const [a, b] = pick === 1 ? [u, v] : [v, u];
      return { t, a, b, why: tried ? { code: 'trial' } : { code, cell } };
    }
    if (!trial(ctx, st, Infinity)) return null;
    tried = true;
  }
}

const api = { SHORT_TRIAL, bit, popcount, context, regionOk, solve, search, hint };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.PipsSolver = api;

})();

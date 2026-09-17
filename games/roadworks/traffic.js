'use strict';

// 도로망 위로 통근 수요를 흘려 어디가 얼마나 밀리는지 낸다. 화면을 만지지 않으므로
// node로 그대로 돌려볼 수 있다.
//
// **차 한 대씩 밀지 않고 링크 단위로 푼다.** 플레이어가 보는 것은 개별 차량이 아니라
// "어디가 막히는가"이고, 이 게임의 핵심은 도로를 고치면 **운전자가 경로를 바꾼다**는
// 것이다. 그래서 교통공학의 증분 배분을 쓴다 — 수요를 여러 번에 나눠 그때그때 가장
// 싼 길에 얹고, 얹을 때마다 비용을 다시 잰다. 반복하면 쓰이는 경로들의 비용이
// 비슷해지는 사용자 균형에 가까워지고, 우회로를 뚫으면 저절로 일부가 그리로 옮겨
// 간다. 차를 한 대씩 미는 모델(NaSch 같은)로는 이 갈아타기를 공짜로 얻지 못한다.
//
// 지연은 BPR 함수다: t = t0 · (1 + α(v/c)^β), α=0.15, β=4. 미국 도로국이 1964년에
// 쓰던 값 그대로이고, 용량 근처에서 급격히 꺾이는 모양이 "한 대만 더 들어와도
// 무너지는" 체감과 맞는다.
//
// **자리는 (칸, 들어온 축) 쌍이다.** 칸만으로 두면 신호가 가로·세로에 녹색을 나눠
// 주는 것을 담을 수 없다. 같은 칸이라도 동서로 지나는 차와 남북으로 지나는 차는
// 다른 용량을 나눠 받는다.
(function (root) {

const T0 = 1;          // 한 칸을 자유 흐름으로 지나는 시간
const LANE_CAP = 60;   // 차로 하나가 받는 양
const ALPHA = 0.15;
const BETA = 4;
// 신호 한 번에 잃는 시간(적색 대기와 출발 지체). 막히지 않아도 신호는 늘 조금
// 손해라, 한산한 교차로에 신호를 세우면 오히려 느려진다.
const LOST = 0.15;
// **신호 없는 교차로가 흘려보낼 수 있는 몫.** 서로 빈틈을 기다리느라 두 흐름을
// 합쳐도 한 방향만 지날 때만큼 지나가지 못한다. 신호의 값어치가 여기서 나온다 —
// 녹색을 나누면 용량은 줄지만 이 손실이 사라진다.
const UNSIG = 0.7;
const STEPS = 8;       // 수요를 몇 번에 나눠 얹을지

const AXIS_H = 0;
const AXIS_V = 1;

// --- 판 ---

function isRoad(tile) {
  return tile.kind === 'road';
}

// 칸마다 이웃 도로와 그 방향의 축. 도로를 놓을 때마다 달라지므로 배분할 때 새로 짠다.
function graphOf(net) {
  const { w, h, tiles } = net;
  const links = tiles.map(() => []);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!isRoad(tiles[i])) continue;
      if (x + 1 < w && isRoad(tiles[i + 1])) {
        links[i].push({ to: i + 1, axis: AXIS_H });
        links[i + 1].push({ to: i, axis: AXIS_H });
      }
      if (y + 1 < h && isRoad(tiles[i + w])) {
        links[i].push({ to: i + w, axis: AXIS_V });
        links[i + w].push({ to: i, axis: AXIS_V });
      }
    }
  }
  return links;
}

// 건물은 맞닿은 도로 칸 어디로든 드나든다. 건물 옆에 새 도로를 놓으면 그 자리가
// 새 출입구가 되는 것이 이 게임에서 중요하다 — 출입구를 판 만들 때 하나로 못박으면
// 그 수가 사라진다.
function access(net, index) {
  const { w, h, tiles } = net;
  const x = index % w;
  const y = (index / w) | 0;
  const out = [];
  if (x > 0 && isRoad(tiles[index - 1])) out.push(index - 1);
  if (x + 1 < w && isRoad(tiles[index + 1])) out.push(index + 1);
  if (y > 0 && isRoad(tiles[index - w])) out.push(index - w);
  if (y + 1 < h && isRoad(tiles[index + w])) out.push(index + w);
  return out;
}

// --- 비용 ---

function capacity(tile, axis) {
  const cap = LANE_CAP * tile.lanes;
  if (tile.signal == null) return cap;
  // signal은 가로에 준 녹색 비율이다. 세로는 나머지를 받는다.
  const share = axis === AXIS_H ? tile.signal : 1 - tile.signal;
  return cap * share;
}

// **흐름이 서로를 가로지르는 자리인가.** 길이 꺾이거나 갈라지기만 하는 곳은
// 해당하지 않는다 — 한 줄기가 둘로 나뉠 때는 서로를 막지 않는다. 한 축의 양쪽이
// 다 이어져 있고 다른 축으로도 길이 나 있어야, 곧장 가는 차와 건너는 차가 같은
// 바닥을 두고 다툰다.
function conflictable(net, index) {
  const { w, h, tiles } = net;
  const x = index % w;
  const y = (index / w) | 0;
  const left = x > 0 && isRoad(tiles[index - 1]);
  const right = x + 1 < w && isRoad(tiles[index + 1]);
  const up = y > 0 && isRoad(tiles[index - w]);
  const down = y + 1 < h && isRoad(tiles[index + w]);
  return (left && right && (up || down)) || (up && down && (left || right));
}

// 이 칸을 이 축으로 지나는 것이 얼마나 빡빡한가(v/c).
//
// **신호가 없는 교차로에서는 두 방향이 같은 값을 받는다.** 자기 방향에 차가 몇
// 대인지가 아니라 그 교차로에 몰린 전부가 대기를 만들기 때문이다 — 한산한 쪽에서
// 한 대가 들어와도 건너편 흐름이 끊길 때까지 기다린다. 자기 축의 흐름만으로 재면
// 그 한 대가 아무 지체 없이 지나가는 것으로 나온다.
function pressure(tile, own, cross, axis, conflicted) {
  const cap = LANE_CAP * tile.lanes;
  if (tile.signal != null) return own / capacity(tile, axis);
  if (conflicted && cross > 0) return (own + cross) / (cap * UNSIG);
  return own / cap;
}

function enterCost(net, flow, index, axis) {
  const tile = net.tiles[index];
  const own = flow[index * 2 + axis];
  const cross = flow[index * 2 + (1 - axis)];
  const tight = pressure(tile, own, cross, axis, conflictable(net, index));
  const t = T0 * (1 + ALPHA * Math.pow(tight, BETA));
  return tile.signal == null ? t : t + LOST;
}

// --- 최단 경로 ---
//
// 자리가 242개(11×11×2)뿐이라 힙은 게으른 삭제로 충분하다.

function hpush(heap, cost, state) {
  heap.push({ c: cost, s: state });
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].c <= heap[i].c) break;
    const swap = heap[p]; heap[p] = heap[i]; heap[i] = swap;
    i = p;
  }
}

function hpop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heap[l].c < heap[m].c) m = l;
      if (r < heap.length && heap[r].c < heap[m].c) m = r;
      if (m === i) break;
      const swap = heap[m]; heap[m] = heap[i]; heap[i] = swap;
      i = m;
    }
  }
  return top;
}

// 출발 건물의 출입구 여러 곳에서 동시에 출발해 도착 건물의 출입구 아무 데나 닿으면
// 끝난다. 돌려주는 것은 자리(칸·축)의 줄이다.
function search(net, links, flow, starts, goals) {
  const n = net.tiles.length;
  const dist = new Float64Array(n * 2).fill(Infinity);
  const prev = new Int32Array(n * 2).fill(-1);
  const heap = [];
  // 출입구가 겹치면(집과 직장이 같은 도로에 붙어 있으면) 길이 없는 것이 아니라
  // 지나갈 도로가 없는 것이다. 빈 줄로 접는다.
  for (const tile of starts) if (goals.has(tile)) return [tile * 2];
  for (const tile of starts) {
    // 출발 칸에서는 아직 방향이 정해지지 않았다. 두 축 모두 0으로 열어 둔다.
    for (const axis of [AXIS_H, AXIS_V]) {
      const state = tile * 2 + axis;
      if (dist[state] === 0) continue;
      dist[state] = 0;
      hpush(heap, 0, state);
    }
  }
  while (heap.length) {
    const { c, s } = hpop(heap);
    if (c > dist[s]) continue;
    const tile = s >> 1;
    if (goals.has(tile)) return unwind(prev, s);
    for (const link of links[tile]) {
      const next = link.to * 2 + link.axis;
      const cost = c + enterCost(net, flow, link.to, link.axis);
      if (cost >= dist[next]) continue;
      dist[next] = cost;
      prev[next] = s;
      hpush(heap, cost, next);
    }
  }
  return null;
}

function unwind(prev, state) {
  const path = [];
  let at = state;
  while (at >= 0) {
    path.push(at);
    at = prev[at];
  }
  path.reverse();
  return path;
}

function pathCost(net, flow, path) {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += enterCost(net, flow, path[i] >> 1, path[i] & 1);
  if (path.length > 1) sum += enterCost(net, flow, path[0] >> 1, path[1] & 1);
  return sum;
}

function addFlow(flow, path, amount) {
  for (let i = 1; i < path.length; i++) flow[path[i]] += amount;
  // 출발 칸도 지나간다. 첫 이동의 축으로 얹는다.
  if (path.length > 1) flow[(path[0] >> 1) * 2 + (path[1] & 1)] += amount;
}

// --- 배분 ---

// demands: [{ id, from, to, volume }] — from·to는 건물 칸 인덱스.
function assign(net, demands) {
  const links = graphOf(net);
  const n = net.tiles.length;
  const flow = new Float64Array(n * 2);
  const zero = new Float64Array(n * 2);

  const ends = demands.map((d) => ({
    starts: access(net, d.from),
    goals: new Set(access(net, d.to)),
  }));

  for (let step = 0; step < STEPS; step++) {
    for (let k = 0; k < demands.length; k++) {
      const { starts, goals } = ends[k];
      if (!starts.length || !goals.size) continue;
      const path = search(net, links, flow, starts, goals);
      if (path) addFlow(flow, path, demands[k].volume / STEPS);
    }
  }

  // 체감 통행시간은 **다 얹은 뒤의** 비용으로 다시 잰다. 증분마다의 값을 평균 내면
  // 도로가 비어 있던 첫 증분이 값을 낮춰 실제보다 후하게 나온다.
  const trips = demands.map((d, k) => {
    const { starts, goals } = ends[k];
    if (!starts.length || !goals.size) {
      return { id: d.id, from: d.from, to: d.to, time: Infinity, free: Infinity, ratio: Infinity, path: null };
    }
    const now = search(net, links, flow, starts, goals);
    const best = search(net, links, zero, starts, goals);
    const time = now ? pathCost(net, flow, now) : Infinity;
    const free = best ? pathCost(net, zero, best) : Infinity;
    return { id: d.id, from: d.from, to: d.to, time, free, ratio: free > 0 ? time / free : 1, path: now };
  });

  const load = new Float64Array(n);
  const ratio = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const tile = net.tiles[i];
    if (!isRoad(tile)) continue;
    const fh = flow[i * 2];
    const fv = flow[i * 2 + 1];
    const tight = conflictable(net, i);
    load[i] = fh + fv;
    // 더 나쁜 축을 따른다. 평균을 내면 한쪽으로 녹색을 몰아 준 탓에 다른 축이
    // 멎어 있는 상태가 "보통"으로 보인다.
    ratio[i] = Math.max(
      pressure(tile, fh, fv, AXIS_H, tight),
      pressure(tile, fv, fh, AXIS_V, tight),
    );
  }

  return { flow, load, ratio, trips };
}

// 신호를 세울 수 있는 자리 — 흐름이 서로를 가로지르는 곳. 길이 꺾이기만 하는
// 모퉁이에 신호를 세우면 아무것도 갈라 주지 않으면서 녹색만 반으로 나눈다.
function isCrossing(net, index) {
  return isRoad(net.tiles[index]) && conflictable(net, index);
}

const api = {
  assign, access, graphOf, isCrossing, conflictable, isRoad, capacity, pressure, enterCost,
  T0, LANE_CAP, ALPHA, BETA, LOST, UNSIG, STEPS, AXIS_H, AXIS_V,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadTraffic = api;

})(typeof window !== 'undefined' ? window : globalThis);

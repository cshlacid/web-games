'use strict';

// 한 판의 진행. 예산으로 도로를 손보고, 한 주가 지나면 통근량이 늘고, 그 결과로
// 민원이 생기거나 풀린다. 화면을 만지지 않는다.
//
// **민원은 사건이 아니라 상태다.** "이번 주에 몇 건 들어왔다"가 아니라 "아직 이
// 조건이 참이다"로 둔다. 그래야 고치면 저절로 사라지고, 방치하면 계속 쌓인다 —
// 플레이어가 고쳐야 할 것이 목록 그 자체가 된다.
(function (root) {

const T = (typeof require !== 'undefined') ? require('./traffic.js') : root.RoadTraffic;
const L = (typeof require !== 'undefined') ? require('./levels.js') : root.RoadLevels;

const COST = { road: 30, widen: 20, signal: 25, split: 5 };

const START_BUDGET = 70;
const WEEK_BUDGET = 25;
// 주마다 늘어나는 통근량. 가만히 두면 언젠가 반드시 무너지는 기울기라야 "버틴 주"가
// 점수가 된다.
const GROWTH = 0.14;

// 자유 흐름 대비 이 배수를 넘으면 지연 민원. 1.4배는 20분 길이 28분이 되는 정도다.
const DELAY_LIMIT = 1.4;
// 용량을 넘긴 칸. v/c가 1을 넘으면 그 칸은 하루 중 상당 시간 멎어 있다.
const JAM_LIMIT = 1.0;
// 한 주에 이만큼 넘게 공사하면 공사 민원이 하나 붙는다. **예산이 모였다고 한꺼번에
// 갈아엎지 못하게 하는 것이 이 값의 일이다** — 도로를 고치는 일 자체에도 값이 있어야
// 어느 주에 무엇을 할지가 선택이 된다. 다음 주에 얌전히 있으면 풀린다.
const WORKS_LIMIT = 3;

const LIMIT = 5;

// 신호가 가로축에 주는 녹색 비율. 조정 단추가 이 셋을 돌아간다.
const SPLITS = [0.5, 0.65, 0.35];

function create(level) {
  const state = {
    level,
    net: L.build(level),
    base: L.demands(level),
    week: 1,
    budget: START_BUDGET,
    complaints: [],
    solved: 0,
    spent: 0,
    works: 0,
    over: false,
    sim: null,
  };
  simulate(state);
  sync(state);
  return state;
}

function demands(state) {
  const scale = 1 + GROWTH * (state.week - 1);
  return state.base.map((d) => ({ ...d, volume: d.volume * scale }));
}

function simulate(state) {
  state.sim = T.assign(state.net, demands(state));
  return state.sim;
}

// --- 개입 ---

// 왜 안 되는지를 돌려준다. 화면이 그 이유를 그대로 말해 줄 수 있어야 한다.
function check(state, tool, index) {
  const cost = COST[tool];
  if (cost === undefined) return { ok: false, reason: 'tool', cost: 0 };
  const tile = state.net.tiles[index];
  if (!tile) return { ok: false, reason: 'spot', cost };

  let fit = 'spot';
  if (tool === 'road') fit = tile.kind === 'land' ? null : 'spot';
  else if (tool === 'widen') fit = tile.kind !== 'road' ? 'spot' : (tile.lanes >= 2 ? 'lanes' : null);
  else if (tool === 'signal') {
    if (!T.isCrossing(state.net, index)) fit = 'crossing';
    else if (tile.signal != null) fit = 'signaled';
    else fit = null;
  } else if (tool === 'split') fit = tile.signal == null ? 'nosignal' : null;

  if (fit) return { ok: false, reason: fit, cost };
  if (state.budget < cost) return { ok: false, reason: 'money', cost };
  return { ok: true, reason: null, cost };
}

function apply(state, tool, index) {
  if (state.over) return { ok: false, reason: 'over', cost: 0 };
  const verdict = check(state, tool, index);
  if (!verdict.ok) return verdict;

  const tile = state.net.tiles[index];
  if (tool === 'road') {
    tile.kind = 'road';
    tile.lanes = 1;
    // 플레이어가 놓은 도로임을 남겨 둔다. 화면이 새로 난 길을 달리 그린다.
    tile.built = true;
  } else if (tool === 'widen') {
    tile.lanes = 2;
  } else if (tool === 'signal') {
    tile.signal = SPLITS[0];
  } else if (tool === 'split') {
    const at = SPLITS.indexOf(tile.signal);
    tile.signal = SPLITS[(at + 1) % SPLITS.length];
  }

  state.budget -= verdict.cost;
  state.spent += verdict.cost;
  // 신호 시간을 다시 맞추는 것은 공사가 아니다 — 땅을 파지 않으므로 공사 민원에
  // 들어가지 않는다.
  if (tool !== 'split') {
    state.works += 1;
    state.lastWork = index;
  }
  // 고친 결과를 그 자리에서 보여 준다. 다음 주까지 기다리게 하면 무엇이 좋아졌는지
  // 알 수 없어, 도로를 놓는 일이 찍기가 된다. 압박은 민원이 맡는다.
  simulate(state);
  return verdict;
}

// --- 민원 ---

// 지금 참인 조건들. 민원 목록은 이것과 맞춰서 갱신된다.
function violations(state) {
  const { net, sim } = state;
  const out = [];

  for (const trip of sim.trips) {
    if (!(trip.ratio > DELAY_LIMIT)) continue;
    out.push({ key: `delay:${trip.id}`, type: 'delay', tile: trip.from, trip: trip.id, ratio: trip.ratio });
  }

  const pinned = new Set(state.complaints.filter((c) => c.type === 'jam').map((c) => c.tile));
  for (const tile of jams(state, pinned)) {
    out.push({ key: `jam:${tile}`, type: 'jam', tile, ratio: sim.ratio[tile] });
  }

  if (state.works > WORKS_LIMIT) {
    out.push({ key: 'works', type: 'works', tile: state.lastWork, works: state.works });
  }

  return out;
}

// **막힌 칸 하나마다 민원을 세우지 않는다.** 한 구간이 막히면 그 줄의 칸이 전부
// 넘치므로, 고쳐야 할 곳은 하나인데 민원함은 다섯 건으로 찬다. 잇닿은 칸들을 한
// 덩어리로 묶고 그중 한 칸만 세운다.
//
// **이미 민원이 붙어 있는 칸이 그 덩어리에 있으면 그 칸을 그대로 쓴다.** 늘 가장
// 나쁜 칸을 고르면 정체가 **번질 때** 대표 칸이 옮겨 가고, 그러면 옛 민원이 사라진
// 것으로 세어져 **나빠진 것이 해결로 기록된다**.
function jams(state, pinned) {
  const { net, sim } = state;
  const { w, h } = net;
  const seen = new Uint8Array(net.tiles.length);
  const bad = (i) => net.tiles[i].kind === 'road' && sim.ratio[i] > JAM_LIMIT;
  const out = [];

  for (let start = 0; start < net.tiles.length; start++) {
    if (seen[start] || !bad(start)) continue;
    let worst = start;
    let held = -1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const at = stack.pop();
      if (sim.ratio[at] > sim.ratio[worst]) worst = at;
      if (held < 0 && pinned && pinned.has(at)) held = at;
      const x = at % w;
      const y = (at / w) | 0;
      const around = [];
      if (x > 0) around.push(at - 1);
      if (x + 1 < w) around.push(at + 1);
      if (y > 0) around.push(at - w);
      if (y + 1 < h) around.push(at + w);
      for (const next of around) {
        if (seen[next] || !bad(next)) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    out.push(held >= 0 ? held : worst);
  }
  return out;
}

// 목록을 지금의 조건에 맞춘다. 사라진 것은 해결로 세고, 새로 참이 된 것만 새 민원이다.
function sync(state) {
  const now = violations(state);
  const alive = new Map(now.map((v) => [v.key, v]));
  const kept = [];
  const gone = [];

  for (const old of state.complaints) {
    const still = alive.get(old.key);
    if (still) {
      kept.push(Object.assign(old, still));
      alive.delete(old.key);
    } else {
      gone.push(old);
    }
  }

  const made = [];
  for (const fresh of alive.values()) {
    fresh.week = state.week;
    made.push(fresh);
  }

  state.complaints = kept.concat(made);
  state.solved += gone.length;
  if (state.complaints.length >= LIMIT) state.over = true;
  return { made, gone };
}

function nextWeek(state) {
  if (state.over) return null;
  state.week += 1;
  state.budget += WEEK_BUDGET;
  simulate(state);
  const report = sync(state);
  // 공사 민원은 **지난 주에 한 공사**를 두고 나온다. 새 주가 열렸으니 셈을 비운다.
  state.works = 0;
  return { week: state.week, made: report.made, gone: report.gone, over: state.over };
}

// 칸 이름. 어느 언어로도 읽히도록 좌표로 부른다.
function label(net, index) {
  const x = index % net.w;
  const y = (index / net.w) | 0;
  return String.fromCharCode(65 + x) + (y + 1);
}

const api = {
  create, apply, check, nextWeek, simulate, violations, sync, demands, label,
  COST, SPLITS, LIMIT, START_BUDGET, WEEK_BUDGET, GROWTH,
  DELAY_LIMIT, JAM_LIMIT, WORKS_LIMIT,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadGame = api;

})(typeof window !== 'undefined' ? window : globalThis);

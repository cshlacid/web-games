'use strict';

// 맵을 만든다.
//
// **도로는 구간이 아니라 이어진 한 줄기(체인)로 만든다.** 구간마다 제어점을 따로
// 흔들면 같은 길인데도 교차로를 지날 때마다 꺾여, 곧게 가던 길이 갑자기 방향을
// 튼다. 한 줄기를 이루는 점들을 카트뮬-롬으로 꿰면 **지나는 점마다 접선이 하나로
// 이어져** 굽이가 자연스럽게 흘러간다. 접선은 그 줄기의 이웃 점들로만 정하므로,
// 한 점에서 두 줄기가 만나도 서로의 굽이를 건드리지 않는다.
//
// 굽이는 점의 자리에서 나온다 — 격자를 흔들어 두면 거의 곧은 구간과 제법 굽은
// 구간이 저절로 섞인다. 제어점을 따로 흔들 이유가 없다.
//
// **처음에는 길이 적다.** 큰길 둘이 가운데에서 만나고 골목 하나가 옆으로 돈다.
// 나머지 격자 자리는 나중에 플레이어가 길을 놓을 자리로 비워 둔다.
//
// **맵의 가장자리는 다른 도시로 이어진다.** 큰길의 양 끝을 화면 밖으로 조금 내밀어
// 자르고 그 끝을 관문(gate)으로 둔다.
(function (root) {

const Net = (typeof require !== 'undefined') ? require('./network.js') : root.RoadNet;
const Land = (typeof require !== 'undefined') ? require('./terrain.js') : root.RoadTerrain;

// **격자는 도시의 뼈대가 아니라 길을 놓을 자리다.** 대부분은 비어 있고, 플레이어가
// 끌어서 채운다. 그래서 칸 수가 곧 놀 자리의 넓이다.
const COLS = 11;
const ROWS = 15;
const JITTER = 22;

// 격자 한 칸의 크기. **맵 크기가 아니라 이것을 고정한다** — 구간 길이가 차 길이(17)와
// 교차로 반지름(20~40)에 대해 얼마나 되는지가 게임의 느낌을 정하므로, 맵을 넓힐 때
// 칸을 함께 늘리면 같은 도시가 그저 확대된 것이 된다.
const STEP_X = 150;
const STEP_Y = 165;

// 큰길이 몇 줄인가. **격자 크기를 탄다** — 맵이 넓어질 때 큰길을 그대로 두면 관문에서
// 관문까지가 너무 멀고, 갈래가 없어 막혀도 돌아갈 길이 없다. 네 칸에 하나쯤이 도시를
// 알맞게 가른다.
// 큰길이 몇 줄인가. **처음에는 가로 하나·세로 하나뿐이다** — 판 위에 열십자 하나만
// 놓고 시작해 나머지는 플레이어가 놓는다. 격자를 큰길로 미리 채워 두면 할 일이 넓히는
// 것뿐이고, 어디에 길을 낼지 고르는 재미가 없다.
function mainCount() {
  return 1;
}

// 차로 구성. 왼쪽이 역방향, 오른쪽이 정방향 — 우측 통행이라 이 순서가 기본이다.
const FOUR = [-1, -1, 1, 1];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(options) {
  const opts = options || {};
  const rng = mulberry32(opts.seed == null ? 1 : opts.seed);

  const stepX = opts.stepX || STEP_X;
  const stepY = opts.stepY || STEP_Y;
  const marginX = stepX * 0.55;
  const marginY = stepY * 0.55;
  const w = opts.w || Math.round(stepX * (COLS - 1) + marginX * 2);
  const h = opts.h || Math.round(stepY * (ROWS - 1) + marginY * 2);
  const edge = 6;   // 관문을 화면 끝보다 조금 안쪽에 두어 차가 사라지는 자리가 보인다

  const spot = [];
  for (let j = 0; j < ROWS; j++) {
    spot.push([]);
    for (let i = 0; i < COLS; i++) {
      spot[j].push({
        id: `n${i}-${j}`,
        kind: 'junction',
        x: marginX + i * stepX + (rng() - 0.5) * 2 * JITTER,
        y: marginY + j * stepY + (rng() - 0.5) * 2 * JITTER,
      });
    }
  }

  // 놓일 줄을 고른다. **띠를 먼저 나누고 그 안에서 흔든다** — 그냥 뽑아 서로
  // 떨어졌는지 다시 보는 방식은 개수가 늘수록 허탕이 잦고, 운이 나쁘면 모자란 채로
  // 끝난다.
  const pickMains = (n, count) => {
    const out = [];
    const band = (n - 2) / count;
    for (let i = 0; i < count; i++) {
      const lo = 1 + Math.floor(i * band);
      const hi = Math.min(n - 2, Math.floor(1 + (i + 1) * band) - 1);
      out.push(lo + Math.floor(rng() * Math.max(1, hi - lo + 1)));
    }
    return out;
  };
  const mainRows = pickMains(ROWS, mainCount(ROWS));
  const mainCols = pickMains(COLS, mainCount(COLS));

  const gate = (id, x, y) => ({ id, kind: 'gate', x, y });

  // 한 줄기는 지나는 점들의 줄이다. 관문도 그 줄기의 끝점으로 함께 꿴다 — 따로
  // 붙이면 도시를 빠져나가는 대목에서만 길이 꺾인다.
  const chains = [];
  mainRows.forEach((row, i) => {
    chains.push({
      lanes: FOUR,
      nodes: [gate(`gW${i}`, edge, spot[row][0].y), ...spot[row],
        gate(`gE${i}`, w - edge, spot[row][COLS - 1].y)],
    });
  });
  mainCols.forEach((col, i) => {
    chains.push({
      lanes: FOUR,
      nodes: [gate(`gN${i}`, spot[0][col].x, edge), ...spot.map((row) => row[col]),
        gate(`gS${i}`, spot[ROWS - 1][col].x, h - edge)],
    });
  });
  // **골목은 두지 않는다.** 처음에는 큰길 열십자 하나뿐이고 나머지는 플레이어가 놓는다.
  //
  // 골목을 놓던 때의 규율은 적어 둔다 — **줄기는 격자 한 칸씩만 건너뛴다.** 옆 칸에서
  // 큰길 칸까지 단숨에 이었더니 사이에 낀 격자 자리를 그냥 지나쳐 큰길을 점 없이
  // 가로지르는 구간이 생겼다. 차가 서로를 통과하고 신호를 놓을 자리도 없는, 있을 수
  // 없는 도로다. 지나는 칸을 모두 줄기에 꿰면 그 자리마다 교차로가 난다.

  const nodes = [];
  const segments = [];
  const seen = new Set();
  for (const chain of chains) {
    for (const node of chain.nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      nodes.push(node);
    }
    segments.push(...weave(chain));
  }

  return { world: { w, h }, nodes, segments };
}

// 한 줄기를 구간들로 자른다. 점마다의 접선은 **그 줄기의 앞뒤 점**으로 정하고, 두
// 구간이 한 점에서 같은 접선을 나눠 쓰므로 이어진 길의 굽이가 끊기지 않는다.
// (카트뮬-롬 스플라인을 구간별 3차 베지어로 옮긴 것이다.)
function weave(chain) {
  const pts = chain.nodes;
  const tan = pts.map((p, i) => {
    const before = pts[Math.max(0, i - 1)];
    const after = pts[Math.min(pts.length - 1, i + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  });

  // **꺾이는 자리에서는 제어점을 덜 내민다.** 어디서나 같은 길이로 내밀면 직각으로
  // 꺾이는 골목이 크게 부풀어 바깥으로 활처럼 휜다. 앞뒤 방향이 많이 어긋난 점일수록
  // 짧게 잡으면 모서리가 제자리에서 돈다.
  const grip = pts.map((p, i) => {
    const before = pts[Math.max(0, i - 1)];
    const after = pts[Math.min(pts.length - 1, i + 1)];
    const inX = p.x - before.x;
    const inY = p.y - before.y;
    const outX = after.x - p.x;
    const outY = after.y - p.y;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    if (!inLen || !outLen) return 1;
    const cos = (inX * outX + inY * outY) / (inLen * outLen);
    return Math.max(0.3, (1 + cos) / 2);
  });

  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    // 제어점을 구간 길이의 1/3만큼 접선 방향으로 내민다. 더 내밀면 굽이가 부풀어
    // 이웃 도로와 닿고, 덜 내밀면 점마다 각이 진다.
    const reach = Math.hypot(b.x - a.x, b.y - a.y) / 3;
    out.push({
      a: a.id,
      b: b.id,
      lanes: chain.lanes,
      c1: { x: a.x + tan[i].x * reach * grip[i], y: a.y + tan[i].y * reach * grip[i] },
      c2: { x: b.x - tan[i + 1].x * reach * grip[i + 1], y: b.y - tan[i + 1].y * reach * grip[i + 1] },
    });
  }
  return out;
}

function city(options) {
  const opts = options || {};
  const plan = generate(opts);
  const net = Net.build(plan.nodes, plan.segments);
  net.world = plan.world;
  // **장애물은 길을 놓고 나서 채운다.** 빈 자리가 어디인지는 길이 정하기 때문이고,
  // 건물은 길 위에 앉으면 안 되기 때문이다. 씨앗은 같이 쓴다 — 같은 씨앗이면 길도
  // 장애물도 같은 판이 나와야 테스트가 같은 것을 다시 본다.
  net.land = Land.generate(net, mulberry32((opts.seed == null ? 1 : opts.seed) + 7919), opts.land);
  return net;
}

const api = { generate, city, weave, mulberry32, mainCount, COLS, ROWS, STEP_X, STEP_Y };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadMapGen = api;

})(typeof window !== 'undefined' ? window : globalThis);

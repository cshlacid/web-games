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

const COLS = 3;
const ROWS = 4;
const JITTER = 22;

// 차로 구성. 왼쪽이 역방향, 오른쪽이 정방향 — 우측 통행이라 이 순서가 기본이다.
const TWO = [-1, 1];
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
  const w = opts.w || 420;
  const h = opts.h || 660;
  const rng = mulberry32(opts.seed == null ? 1 : opts.seed);

  const marginX = w * 0.17;
  const marginY = h * 0.14;
  const stepX = (w - marginX * 2) / (COLS - 1);
  const stepY = (h - marginY * 2) / (ROWS - 1);
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

  const mainRow = 1 + Math.floor(rng() * (ROWS - 2));
  const mainCol = 1;
  const side = rng() < 0.5 ? 0 : COLS - 1;
  // 골목이 도는 줄. 큰길 바로 위나 아래다.
  const up = mainRow - 1 >= 0;
  const down = mainRow + 1 < ROWS;
  const loopRow = (up && down) ? (rng() < 0.5 ? mainRow - 1 : mainRow + 1) : (up ? mainRow - 1 : mainRow + 1);

  const gate = (id, x, y) => ({ id, kind: 'gate', x, y });
  const gW = gate('gW', edge, spot[mainRow][0].y);
  const gE = gate('gE', w - edge, spot[mainRow][COLS - 1].y);
  const gN = gate('gN', spot[0][mainCol].x, edge);
  const gS = gate('gS', spot[ROWS - 1][mainCol].x, h - edge);

  // 한 줄기는 지나는 점들의 줄이다. 관문도 그 줄기의 끝점으로 함께 꿴다 — 따로
  // 붙이면 도시를 빠져나가는 대목에서만 길이 꺾인다.
  const chains = [
    { lanes: FOUR, nodes: [gW, ...spot[mainRow], gE] },
    { lanes: FOUR, nodes: [gN, ...spot.map((row) => row[mainCol]), gS] },
    { lanes: TWO, nodes: [spot[mainRow][side], spot[loopRow][side], spot[loopRow][mainCol]] },
  ];

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
  const plan = generate(options);
  const net = Net.build(plan.nodes, plan.segments);
  net.world = plan.world;
  return net;
}

const api = { generate, city, weave, mulberry32, COLS, ROWS };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadMapGen = api;

})(typeof window !== 'undefined' ? window : globalThis);

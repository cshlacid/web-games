'use strict';

// 맵을 만든다. **곧은 길과 굽은 길이 섞여 있어야 한다** — 전부 곧으면 격자 퍼즐이
// 되고 전부 굽으면 어디가 어디인지 읽히지 않는다.
//
// 뼈대는 흔들어 놓은 격자다. 순수한 격자는 교차로가 전부 직각이라 차가 도는 모습이
// 단조롭고, 아무렇게나 뿌린 점은 도로가 서로를 가로질러 평면 그래프가 깨진다.
// 격자를 조금 흔들고 각 구간을 가운데서 조금 밀면, 교차하지 않으면서도 도시처럼
// 보인다.
//
// **맵의 가장자리는 다른 도시로 이어진다.** 바깥 줄의 교차로에서 화면 밖으로 짧은
// 길을 내고 그 끝을 관문(gate)으로 둔다. 차는 거기서 들어와 다른 관문으로 나간다.
(function (root) {

const Net = (typeof require !== 'undefined') ? require('./network.js') : root.RoadNet;

const COLS = 3;
const ROWS = 4;
const JITTER = 16;

// 굽은 길의 비율과 굽는 정도. 0.3을 넘기면 이웃 도로와 닿는다.
const CURVE_CHANCE = 0.55;
const CURVE_MIN = 0.10;
const CURVE_MAX = 0.24;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 차로 구성. 왼쪽이 역방향, 오른쪽이 정방향 — 우측 통행이라 이 순서가 기본이다.
const TWO = [-1, 1];
const THREE = [-1, 1, 1];
const FOUR = [-1, -1, 1, 1];

function generate(options) {
  const opts = options || {};
  const w = opts.w || 420;
  const h = opts.h || 660;
  const rng = mulberry32(opts.seed == null ? 1 : opts.seed);

  const marginX = w * 0.17;
  const marginY = h * 0.14;
  const stepX = (w - marginX * 2) / (COLS - 1);
  const stepY = (h - marginY * 2) / (ROWS - 1);

  const nodes = [];
  const grid = [];
  for (let j = 0; j < ROWS; j++) {
    grid.push([]);
    for (let i = 0; i < COLS; i++) {
      const id = `n${i}-${j}`;
      nodes.push({
        id,
        kind: 'junction',
        x: marginX + i * stepX + (rng() - 0.5) * 2 * JITTER,
        y: marginY + j * stepY + (rng() - 0.5) * 2 * JITTER,
      });
      grid[j].push(id);
    }
  }

  const at = (id) => nodes.find((n) => n.id === id);

  // 큰길 한 줄과 한 칸. 나머지보다 넓어서 차가 그리로 몰린다.
  const mainRow = 1 + Math.floor(rng() * (ROWS - 2));
  const mainCol = 1;

  const segments = [];
  const link = (aId, bId, lanes) => {
    const a = at(aId);
    const b = at(bId);
    segments.push(bend(a, b, lanes, rng));
  };

  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      if (i + 1 < COLS) {
        const lanes = j === mainRow ? FOUR : (rng() < 0.25 ? THREE : TWO);
        link(grid[j][i], grid[j][i + 1], lanes);
      }
      if (j + 1 < ROWS) {
        const lanes = i === mainCol ? FOUR : (rng() < 0.25 ? THREE : TWO);
        link(grid[j][i], grid[j + 1][i], lanes);
      }
    }
  }

  // 관문. 바깥 줄의 교차로에서 화면 밖으로 조금 내밀어 자른다.
  const gate = (fromId, x, y, lanes) => {
    const id = `g${nodes.length}`;
    nodes.push({ id, kind: 'gate', x, y });
    const from = at(fromId);
    segments.push(bend(from, nodes[nodes.length - 1], lanes, rng, 0.4));
    void from;
  };

  const edge = 6;   // 관문을 화면 끝보다 조금 안쪽에 두어 차가 사라지는 자리가 보인다
  gate(grid[mainRow][0], edge, at(grid[mainRow][0]).y, FOUR);
  gate(grid[mainRow][COLS - 1], w - edge, at(grid[mainRow][COLS - 1]).y, FOUR);
  gate(grid[0][mainCol], at(grid[0][mainCol]).x, edge, FOUR);
  gate(grid[ROWS - 1][mainCol], at(grid[ROWS - 1][mainCol]).x, h - edge, FOUR);
  gate(grid[0][0], at(grid[0][0]).x, edge, TWO);
  gate(grid[0][COLS - 1], at(grid[0][COLS - 1]).x, edge, TWO);
  gate(grid[ROWS - 1][0], at(grid[ROWS - 1][0]).x, h - edge, TWO);
  gate(grid[ROWS - 1][COLS - 1], at(grid[ROWS - 1][COLS - 1]).x, h - edge, TWO);

  return { world: { w, h }, nodes, segments };
}

// 두 점을 잇는 구간 하나. 제어점을 가운데서 옆으로 밀면 굽는다. `straighten`은
// 관문처럼 짧은 길을 덜 굽히려고 쓴다.
function bend(a, b, lanes, rng, straighten) {
  const seg = { a: a.id, b: b.id, lanes };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  if (rng() > CURVE_CHANCE) return seg;

  const nx = -dy / len;
  const ny = dx / len;
  const amount = (CURVE_MIN + rng() * (CURVE_MAX - CURVE_MIN)) * len * (straighten || 1);
  // 부호가 같으면 한쪽으로 휘고 다르면 S자가 된다. S자는 가끔만 — 흔하면 길이
  // 뱀처럼 보인다.
  const s1 = rng() < 0.5 ? 1 : -1;
  const s2 = rng() < 0.22 ? -s1 : s1;
  seg.c1 = { x: a.x + dx / 3 + nx * amount * s1, y: a.y + dy / 3 + ny * amount * s1 };
  seg.c2 = { x: a.x + dx * 2 / 3 + nx * amount * s2, y: a.y + dy * 2 / 3 + ny * amount * s2 };
  return seg;
}

function city(options) {
  const plan = generate(options);
  const net = Net.build(plan.nodes, plan.segments);
  net.world = plan.world;
  return net;
}

const api = { generate, city, mulberry32, COLS, ROWS };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadMapGen = api;

})(typeof window !== 'undefined' ? window : globalThis);

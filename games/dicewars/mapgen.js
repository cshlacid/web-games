'use strict';

// 지도를 만든다. 육각 칸을 묶어 영토로 만들고, 영토끼리 맞닿은 관계를 뽑아 둔다.
// 규칙은 그 뒤로 칸을 보지 않고 영토와 이웃 목록만 본다 — 칸은 화면이 쓰는 자료다.
//
// 씨드 번호 하나로 같은 지도가 다시 나온다. 이상한 판을 만나면 번호만 들고 와
// node에서 그대로 재현할 수 있다.
(function () {

// 인원별 판. 영토 수는 인원의 배수로 둔다 — 나눠 주고 남으면 누구는 한 칸 더 갖고
// 시작해서, 첫 수를 두기도 전에 기울어진다.
const SETUPS = {
  2: { w: 8, h: 10, territories: 20 },
  3: { w: 9, h: 11, territories: 24 },
  4: { w: 9, h: 12, territories: 28 },
};

// 처음 나눠 주는 주사위. 영토마다 하나씩 깔고, 그 뒤로 이만큼을 더 뿌린다.
const EXTRA_PER_TERRITORY = 1.6;
const MAX_DICE = 8;

function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(next, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 육각 격자의 이웃. 줄마다 반 칸씩 밀리는 배치(odd-r)라 홀수 줄과 짝수 줄의
// 대각선 이웃이 다르다.
function neighborsOf(q, r, w, h) {
  const odd = r % 2 === 1;
  const around = odd
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const out = [];
  for (const [dq, dr] of around) {
    const nq = q + dq;
    const nr = r + dr;
    if (nq < 0 || nr < 0 || nq >= w || nr >= h) continue;
    out.push(nr * w + nq);
  }
  return out;
}

// 씨앗을 뿌리고 번갈아 한 칸씩 넓혀 영토를 만든다. 번갈아 가는 것이 핵심이다 —
// 하나씩 끝까지 키우면 먼저 자란 영토가 판을 다 먹고 나머지는 한 칸짜리가 된다.
function grow(next, spec) {
  const { w, h, territories } = spec;
  const total = w * h;
  const owner = new Array(total).fill(-1);
  const cells = [];
  for (let r = 0; r < h; r++) {
    for (let q = 0; q < w; q++) cells.push({ q, r, links: neighborsOf(q, r, w, h) });
  }

  const seeds = shuffle(next, cells.map((_, i) => i)).slice(0, territories);
  const fronts = seeds.map((cell, id) => { owner[cell] = id; return [cell]; });

  let left = total - territories;
  while (left > 0) {
    let moved = false;
    for (let id = 0; id < territories && left > 0; id++) {
      const front = fronts[id];
      while (front.length) {
        const from = front[Math.floor(next() * front.length)];
        const open = cells[from].links.filter((c) => owner[c] === -1);
        if (!open.length) {
          front.splice(front.indexOf(from), 1);
          continue;
        }
        const pick = open[Math.floor(next() * open.length)];
        owner[pick] = id;
        front.push(pick);
        left--;
        moved = true;
        break;
      }
    }
    // 아무도 넓히지 못하면 남은 칸은 어느 영토에도 닿지 않는다(있을 수 없지만,
    // 무한히 도는 것보다 남겨 두는 편이 낫다).
    if (!moved) break;
  }

  return { cells, owner };
}

function build(seed, players) {
  const spec = SETUPS[players] || SETUPS[3];
  const next = rng(seed);
  const { cells, owner } = grow(next, spec);
  if (owner.some((v) => v === -1)) return null;

  const territories = [];
  for (let id = 0; id < spec.territories; id++) {
    territories.push({ id, cells: [], neighbors: [], owner: 0, dice: 1 });
  }
  owner.forEach((id, cell) => territories[id].cells.push(cell));
  if (territories.some((t) => !t.cells.length)) return null;

  for (const t of territories) {
    const seen = new Set();
    for (const cell of t.cells) {
      for (const near of cells[cell].links) {
        const other = owner[near];
        if (other !== t.id) seen.add(other);
      }
    }
    t.neighbors = [...seen].sort((a, b) => a - b);
  }
  // 이웃이 하나도 없는 영토가 있으면 그 판은 쓸 수 없다.
  if (territories.some((t) => !t.neighbors.length)) return null;

  // 영토를 섞어 사람 수대로 돌아가며 나눈다.
  const order = shuffle(next, territories.map((t) => t.id));
  order.forEach((id, i) => { territories[id].owner = (i % players) + 1; });

  // 주사위를 뿌린다. 사람마다 같은 수를 받고, 여덟이 넘는 영토는 건너뛴다.
  const extra = Math.round(spec.territories / players * EXTRA_PER_TERRITORY);
  for (let player = 1; player <= players; player++) {
    const mine = territories.filter((t) => t.owner === player);
    for (let i = 0; i < extra; i++) {
      const open = mine.filter((t) => t.dice < MAX_DICE);
      if (!open.length) break;
      open[Math.floor(next() * open.length)].dice++;
    }
  }

  return { seed, players, w: spec.w, h: spec.h, cells, territories };
}

function generate(seed, players) {
  for (let i = 0; i < 60; i++) {
    const map = build((seed + i * 0x9e3779b9) >>> 0, players);
    if (map) return map;
  }
  return null;
}

const MapGen = { SETUPS, MAX_DICE, rng, shuffle, neighborsOf, build, generate };

if (typeof module !== 'undefined' && module.exports) module.exports = MapGen;
if (typeof window !== 'undefined') window.DiceMap = MapGen;

})();

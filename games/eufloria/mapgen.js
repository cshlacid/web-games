'use strict';

// 지도를 만든다. 씨앗 번호 하나로 같은 지도가 다시 나오게 해서, 이상한 판을 만나면
// 번호만 들고 와 node에서 그대로 재현할 수 있게 했다.
//
// **한 판은 반드시 사거리 안에서 다 이어져 있어야 한다.** 끊긴 덩어리가 있으면 그쪽
// 소행성은 영영 만질 수 없어 이길 수도 질 수도 없다. 이어졌는지 보고 아니면 그
// 씨앗을 버리고 다음 번호로 넘어간다 — 배치를 고쳐 붙이는 것보다 다시 뽑는 쪽이
// 훨씬 짧다.
(function () {

const L = typeof require === 'function' ? require('./logic.js') : window.EufloriaLogic;

const W = 320;
const H = 460;
const MARGIN = 30;
// 소행성끼리 이만큼은 떨어뜨린다. 붙어 있으면 화면에서 두 개가 한 덩어리로 보이고,
// 사거리가 무의미해진다.
const MIN_GAP = 62;

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

function scatter(next, count) {
  const spots = [];
  // 뽑기를 무한정 돌리지 않는다. 자리가 모자라면 그 씨앗은 실패로 두고 다음 번호로
  // 넘긴다.
  for (let tries = 0; tries < 4000 && spots.length < count; tries++) {
    const x = MARGIN + next() * (W - MARGIN * 2);
    const y = MARGIN + next() * (H - MARGIN * 2);
    let ok = true;
    for (const s of spots) {
      if (Math.hypot(s.x - x, s.y - y) < MIN_GAP) { ok = false; break; }
    }
    if (ok) spots.push({ x, y });
  }
  return spots.length === count ? spots : null;
}

function connected(asteroids) {
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const a = asteroids[queue.pop()];
    for (const b of asteroids) {
      if (seen.has(b.id) || !L.inRange(a, b)) continue;
      seen.add(b.id);
      queue.push(b.id);
    }
  }
  return seen.size === asteroids.length;
}

// 시작 자리는 서로 가장 먼 두 소행성이다. 가까이서 시작하면 첫 나무를 심기도 전에
// 부딪혀 판이 3초에 끝난다.
//
// **다만 이웃이 하나뿐인 구석은 피한다.** 가장 먼 두 곳은 거의 늘 구석인데, 거기서
// 시작하면 갈 곳이 한 군데뿐이라 첫 몇 분 동안 고를 것이 없다. 이웃이 둘 이상인
// 소행성끼리 다시 재고, 그런 짝이 없을 때만 원래 값으로 돌아간다.
function farthestPair(asteroids) {
  const degree = new Map(asteroids.map((a) =>
    [a.id, asteroids.filter((b) => L.inRange(a, b)).length]));

  function pick(open) {
    let best = null;
    let far = -1;
    for (const a of open) {
      for (const b of open) {
        if (b.id <= a.id) continue;
        const d = L.dist(a, b);
        if (d > far) { far = d; best = [a.id, b.id]; }
      }
    }
    return best;
  }

  return pick(asteroids.filter((a) => degree.get(a.id) >= 2)) || pick(asteroids);
}

function build(seed, count) {
  const next = rng(seed);
  const spots = scatter(next, count);
  if (!spots) return null;

  const asteroids = spots.map((s, id) => ({
    id,
    x: s.x,
    y: s.y,
    r: 11 + Math.round(next() * 11),
    stats: {
      energy: 15 + Math.round(next() * 105),
      strength: 15 + Math.round(next() * 105),
      speed: 15 + Math.round(next() * 105),
    },
    owner: 0,
    trees: [],
    seeds: 0,
  }));

  if (!connected(asteroids)) return null;

  const [mine, theirs] = farthestPair(asteroids);
  for (const [id, owner] of [[mine, 1], [theirs, 2]]) {
    const a = asteroids[id];
    a.owner = owner;
    a.trees = ['dyson'];
    a.seeds = L.SEEDS_PER_TREE;
    // 시작 소행성은 스탯을 가운데로 맞춘다. 뽑기에 따라 한쪽이 두 배 좋은 씨앗을
    // 들고 시작하는 판이 나오면 실력과 상관없이 갈린다.
    a.stats = { energy: 60, strength: 60, speed: 60 };
    a.r = Math.max(a.r, 16);
  }

  return { seed, width: W, height: H, asteroids, start: { player: mine, enemy: theirs } };
}

// 씨앗을 하나 받아 쓸 만한 지도가 나올 때까지 번호를 올린다. 실패한 번호를 건너뛰는
// 것이 아니라 다음 번호를 쓰므로, 같은 씨앗은 늘 같은 지도가 된다.
function generate(seed, count) {
  for (let i = 0; i < 200; i++) {
    const map = build((seed + i * 0x9e3779b9) >>> 0, count);
    if (map) return map;
  }
  return null;
}

const MapGen = { W, H, MIN_GAP, rng, generate, build, connected, farthestPair };

if (typeof module !== 'undefined' && module.exports) module.exports = MapGen;
if (typeof window !== 'undefined') window.EufloriaMap = MapGen;

})();

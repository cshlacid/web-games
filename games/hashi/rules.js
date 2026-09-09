'use strict';

// 다리 잇기의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// **다리를 놓을 수 있는 자리는 판을 만들 때 미리 다 뽑아 둔다**(`board()`의 `links`).
// 다리는 가로·세로로 이웃한 두 섬만 잇고 중간에 다른 섬이 끼면 안 되므로, 놓을 수
// 있는 짝은 판이 정해지는 순간 정해진다. 매번 다시 찾으면 규칙마다 같은 훑기를
// 되풀이하게 되고, 교차 판정도 자리마다 미리 이어 두는 편이 훨씬 짧다.
(function () {

const MAX_BRIDGE = 2;

function key(x, y) {
  return `${x},${y}`;
}

// 섬 목록으로 판을 짠다. 섬은 {x, y, need}이고 need는 그 섬에 닿아야 하는 다리 수다.
function board(puzzle) {
  const islands = puzzle.islands.map((a, id) => ({ id, x: a.x, y: a.y, need: a.need }));
  const at = new Map(islands.map((a) => [key(a.x, a.y), a]));

  const links = [];
  const linksOf = islands.map(() => []);

  function scan(from, dx, dy) {
    for (let step = 1; ; step++) {
      const x = from.x + dx * step;
      const y = from.y + dy * step;
      if (x < 0 || y < 0 || x >= puzzle.w || y >= puzzle.h) return;
      const hit = at.get(key(x, y));
      if (!hit) continue;
      // 붙어 있는 두 섬은 잇지 않는다. 다리가 지날 칸이 없어 화면에서도 선이
      // 그려지지 않고, 누를 자리도 생기지 않는다.
      if (step === 1) return;
      const cells = [];
      for (let i = 1; i < step; i++) cells.push([from.x + dx * i, from.y + dy * i]);
      const id = links.length;
      links.push({ id, a: from.id, b: hit.id, horizontal: dy === 0, cells });
      linksOf[from.id].push(id);
      linksOf[hit.id].push(id);
      return;
    }
  }

  for (const a of islands) {
    scan(a, 1, 0);
    scan(a, 0, 1);
  }

  // 서로 지나가는 자리끼리 미리 이어 둔다. 가로와 세로가 같은 칸을 쓰면 교차다.
  const crossing = links.map(() => []);
  const owner = new Map();
  for (const link of links) {
    for (const [x, y] of link.cells) {
      const k = key(x, y);
      const list = owner.get(k) || [];
      for (const other of list) {
        if (other.horizontal === link.horizontal) continue;
        crossing[link.id].push(other.id);
        crossing[other.id].push(link.id);
      }
      list.push(link);
      owner.set(k, list);
    }
  }

  return { w: puzzle.w, h: puzzle.h, islands, links, linksOf, crossing };
}

function newState(b) {
  return b.links.map(() => 0);
}

function degree(b, state, islandId) {
  let n = 0;
  for (const li of b.linksOf[islandId]) n += state[li];
  return n;
}

// 이 자리에 다리를 n개 놓을 수 있는가. 규칙 셋이 전부 여기 모인다 — 섬의 숫자를
// 넘기지 않을 것, 교차하지 않을 것, 한 짝에 두 개까지.
function canSet(b, state, li, n) {
  if (n < 0 || n > MAX_BRIDGE) return false;
  const link = b.links[li];
  const delta = n - state[li];
  if (delta > 0) {
    for (const id of [link.a, link.b]) {
      if (degree(b, state, id) + delta > b.islands[id].need) return false;
    }
    for (const other of b.crossing[li]) if (state[other] > 0) return false;
  }
  return true;
}

function set(b, state, li, n) {
  if (!canSet(b, state, li, n)) return false;
  state[li] = n;
  return true;
}

// 누를 때마다 0 → 1 → 2 → 0으로 돈다. 놓을 수 없는 값은 건너뛴다 — 숫자가 1인 섬에서
// 두 개를 거쳐 가게 두면 한 번 더 눌러야 지워져 답답하다.
function cycle(b, state, li) {
  for (let step = 1; step <= MAX_BRIDGE + 1; step++) {
    const next = (state[li] + step) % (MAX_BRIDGE + 1);
    if (canSet(b, state, li, next)) { state[li] = next; return next; }
  }
  return state[li];
}

// 놓은 다리만 밟아 섬들이 한 덩어리인가.
function connected(b, state) {
  if (!b.islands.length) return true;
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const id = queue.pop();
    for (const li of b.linksOf[id]) {
      if (!state[li]) continue;
      const link = b.links[li];
      const next = link.a === id ? link.b : link.a;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === b.islands.length;
}

function satisfied(b, state) {
  return b.islands.every((a) => degree(b, state, a.id) === a.need);
}

function isDone(b, state) {
  return satisfied(b, state) && connected(b, state);
}

// 판이 말이 되는가(생성기가 내놓은 것을 받을 때 쓴다).
function wellFormed(puzzle) {
  if (!puzzle || !puzzle.islands || puzzle.islands.length < 2) return false;
  const seen = new Set();
  for (const a of puzzle.islands) {
    if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) return false;
    if (a.x < 0 || a.y < 0 || a.x >= puzzle.w || a.y >= puzzle.h) return false;
    if (!Number.isInteger(a.need) || a.need < 1 || a.need > 8) return false;
    const k = key(a.x, a.y);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  const b = board(puzzle);
  // 닿을 수 있는 다리 수보다 큰 숫자가 적힌 섬이 있으면 그 판은 풀 수 없다.
  return b.islands.every((a) => a.need <= b.linksOf[a.id].length * MAX_BRIDGE);
}

const Rules = {
  MAX_BRIDGE, board, newState, degree, canSet, set, cycle,
  connected, satisfied, isDone, wellFormed,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.HashiRules = Rules;

})();

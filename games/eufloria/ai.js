'use strict';

// 상대. 규칙을 직접 건드리지 않고 할 일 목록만 돌려준다 — 그래야 node에서 판을
// 만들어 놓고 "이 상황에서 무엇을 하는가"를 그대로 볼 수 있다.
//
// **한 번에 한 곳만 노린다.** 이웃마다 따로 판단하게 두었더니 자가대국이 끝나지
// 않았다. 나무 두 그루를 세운 소행성은 한 소행성의 생산 상한(최대 70)보다 많은
// 씨앗을 요구하는데, 각자 판단하면 아무도 그만큼 모으지 못해 양쪽이 제자리에서
// 늙는다. 그래서 목표를 하나로 정하고, 목표에서 잰 거리를 따라 뒤에서 앞으로 씨앗을
// 밀어 준 뒤, 앞줄에 충분히 쌓였을 때 한꺼번에 친다.
(function () {

const L = typeof require === 'function' ? require('./logic.js') : window.EufloriaLogic;

// 공격에 필요한 여유. 지키는 쪽이 유리하므로 같은 수로는 가지 않는다.
const EDGE = 1.3;
// 뒤에서 앞으로 밀 때의 문턱. 찔끔찔끔 보내면 오는 길에 각개격파당한다.
const MASS = 12;

// 세기. **이 판단기는 사람보다 손이 빠른 것이 아니라 쉬지 않는 것이 강점이라,
// 약하게 만드는 손잡이도 "얼마나 자주, 얼마나 서둘러"다.**
//  think   — 몇 초에 한 번 생각하는가. 뜸하면 그만큼 늦게 반응한다.
//  edge    — 칠 때 요구하는 여유. 크면 웬만해선 참고 빈 소행성만 먹는다.
//  opening — 이 시간까지는 나무만 심고 씨앗을 보내지 않는다. 사람이 판을 읽고
//            첫 나무를 세울 틈을 주는 자리다.
const LEVELS = {
  soft: { think: 2.6, edge: 1.9, opening: 20 },
  normal: { think: 1.6, edge: 1.5, opening: 8 },
  wild: { think: 1.0, edge: 1.25, opening: 0 },
};

function foe(owner) {
  return owner === 1 ? 2 : 1;
}

function neighbors(world, a) {
  return world.asteroids.filter((b) => L.inRange(a, b));
}

// 이 소행성을 뺏는 데 드는 씨앗. 정확한 값이 아니라 목표를 고르고 "지금 칠 수
// 있는가"를 가르기 위한 어림이다.
function cost(world, target, owner) {
  let n = target.seeds[foe(owner)].n;
  for (const tree of target.trees) n += tree.type === 'defense' ? 22 : 10;
  n += target.core.hp / 10;
  return n;
}

// 위협받는 자리인가. **빈 소행성이 붙어 있는 것은 위협이 아니다.** 그것까지 앞줄로
// 치면 시작하자마자 방어 나무를 세워 씨앗이 늘지 않는다.
function threatened(world, a, owner) {
  const enemy = foe(owner);
  return neighbors(world, a).some((b) => b.owner === enemy || b.seeds[enemy].n > 0);
}

// 목표에서부터 내 소행성만 밟고 잰 거리. 뒤쪽 소행성이 어느 이웃에게 씨앗을
// 넘겨야 앞으로 가는지 이것 하나로 정해진다.
function distances(world, target, owner) {
  const dist = new Map([[target.id, 0]]);
  let edge = [target];
  while (edge.length) {
    const next = [];
    for (const a of edge) {
      for (const b of neighbors(world, a)) {
        if (b.owner !== owner || dist.has(b.id)) continue;
        dist.set(b.id, dist.get(a.id) + 1);
        next.push(b);
      }
    }
    edge = next;
  }
  return dist;
}

// opts로 세기를 받는다(없으면 예전 값 그대로). hold가 켜져 있으면 나무만 심는다.
function decide(world, owner, opts = {}) {
  const edge = opts.edge || EDGE;
  const mass = opts.mass || MASS;
  const acts = [];
  const mine = world.asteroids.filter((a) => a.owner === owner);
  const busy = new Set();

  for (const a of mine) {
    if (a.trees.length >= L.maxTrees(a)) continue;
    if (a.seeds[owner].n < L.SEEDS_PER_TREE) continue;
    const hasDyson = a.trees.some((t) => t.type === 'dyson');
    // 적이 붙은 자리에만 방어 나무를 세운다. 나머지는 씨앗이 곧 힘이라 다이슨만 올린다.
    const type = !hasDyson || !threatened(world, a, owner) ? 'dyson' : 'defense';
    acts.push({ type: 'plant', id: a.id, tree: type });
    busy.add(a.id);
  }

  if (opts.hold) return acts;

  // 노릴 곳을 하나 고른다. **싼 곳이 아니라 뚫리는 곳이다.** 싼 곳만 보면 씨앗이
  // 쌓인 자리에서 갈 수 없는 목표를 골라 놓고 영영 모자란 앞줄만 쳐다본다 — 한쪽이
  // 씨앗 1129마리를 쥐고도 20분 동안 아무것도 하지 않는 판이 나왔다. 목표마다 그
  // 목표에 붙어 있는 내 씨앗을 세고, 값을 치르고 남는 쪽을 고른다.
  const candidates = [];
  for (const a of mine) {
    for (const b of neighbors(world, a)) {
      if (b.owner === owner || candidates.includes(b)) continue;
      candidates.push(b);
    }
  }
  if (!candidates.length) return acts;

  let target = null;
  let gap = -Infinity;
  let strike = [];
  for (const t of candidates) {
    const need = cost(world, t, owner);
    const front = mine.filter((a) => !busy.has(a.id) && L.inRange(a, t));
    let ready = 0;
    let room = 0;
    for (const a of front) {
      ready += a.seeds[owner].n;
      room += L.capacity(a);
    }
    // **쌓아 둘 곳을 넘겼으면 여유를 포기하고 친다.** 같은 판단기끼리 붙여 놓으면
    // 양쪽이 서로 1.3배를 기다리며 늙는데, 지키는 쪽도 같이 늘어나 그 배수가 영영
    // 오지 않는다.
    const flooded = ready > room * 2;
    const margin = ready - need * (flooded ? 1 : edge);
    if (margin > gap) { gap = margin; target = t; strike = front; }
  }

  if (gap >= 0) {
    for (const a of strike) {
      if (a.seeds[owner].n >= 1) acts.push({ type: 'send', from: a.id, to: target.id, ratio: 1 });
    }
    return acts;
  }

  const dist = distances(world, target, owner);

  // 아직 모자라면 뒤에서 앞으로 민다. 앞줄은 그대로 쌓아 둔다.
  for (const a of mine) {
    if (busy.has(a.id)) continue;
    const step = dist.get(a.id);
    if (!step || step < 2) continue;
    if (a.seeds[owner].n < mass) continue;
    const forward = neighbors(world, a)
      .filter((b) => b.owner === owner && dist.get(b.id) === step - 1)
      .sort((p, q) => p.seeds[owner].n - q.seeds[owner].n)[0];
    if (forward) acts.push({ type: 'send', from: a.id, to: forward.id, ratio: 0.75 });
  }

  return acts;
}

function apply(world, owner, acts) {
  for (const act of acts) {
    if (act.type === 'plant') L.plant(world, act.id, owner, act.tree);
    else L.send(world, act.from, act.to, owner, act.ratio);
  }
}

const AI = { EDGE, MASS, LEVELS, cost, threatened, distances, decide, apply };

if (typeof module !== 'undefined' && module.exports) module.exports = AI;
if (typeof window !== 'undefined') window.EufloriaAI = AI;

})();

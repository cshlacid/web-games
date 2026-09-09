'use strict';

// 상대. 규칙을 직접 건드리지 않고 할 일 목록만 돌려준다 — 그래야 node에서 판을
// 만들어 놓고 "이 상황에서 무엇을 하는가"를 그대로 볼 수 있다.
//
// **한 번에 한 곳만 노린다.** 이웃마다 따로 판단하게 두었더니 자가대국이 끝나지
// 않았다. 시설 두 그루를 세운 거점은 한 거점의 생산 상한(최대 70)보다 많은
// 병력을 요구하는데, 각자 판단하면 아무도 그만큼 모으지 못해 양쪽이 제자리에서
// 늙는다. 그래서 목표를 하나로 정하고, 목표에서 잰 거리를 따라 뒤에서 앞으로 병력을
// 밀어 준 뒤, 앞줄에 충분히 쌓였을 때 한꺼번에 친다.
(function () {

const L = typeof require === 'function' ? require('./logic.js') : window.ConquestLogic;

// 공격에 필요한 여유. 지키는 쪽이 유리하므로 같은 수로는 가지 않는다.
const EDGE = 1.3;
// 뒤에서 앞으로 밀 때의 문턱. 찔끔찔끔 보내면 오는 길에 각개격파당한다.
const MASS = 12;

// 난이도. **판단기는 사람보다 계산이 좋은 것이 아니라 쉬지 않고 여러 곳을 동시에
// 두드리는 것이 강점이다.** 그래서 손잡이도 판단의 질이 아니라 손의 속도를 깎는 쪽에
// 둔다 — 일부러 나쁜 수를 두게 만들면 약한 상대가 아니라 이해할 수 없는 상대가 된다.
//  think   — 몇 초에 한 번 생각하는가. 뜸하면 그만큼 늦게 반응한다.
//  edge    — 칠 때 요구하는 여유. 크면 웬만해선 참고 빈 거점만 먹는다.
//  opening — 이 시간까지는 시설만 세우고 병력을 보내지 않는다. 사람이 판을 읽고 첫
//            시설을 세울 틈을 주는 자리다.
//  moves   — 한 번 생각할 때 보낼 수 있는 부대의 수(0이면 제한 없음). 사람은 한 번에
//            한 곳을 두드리는데 판단기는 앞줄 넷에서 동시에 쏟아붓는다.
//  growth  — 생산 배수(규칙 쪽 `world.growth`). 손을 굼뜨게 하는 것만으로는 사람 손의
//            속도까지 내려오지 않아, 병력이 불어나는 속도를 직접 깎는다.
//  defense — 방어탑을 세우는가. 한 번에 한 곳만 두드리는 사람에게 방어탑가 선
//            거점은 사실상 벽이라, 쉬운 쪽에서 가장 먼저 걷어내는 것이 이것이다.
//
// 값은 사람 흉내(4.5초에 한 번, 한 번에 한 곳)와 붙여 고른 것이다 — `ai.test.js` 참고.
const LEVELS = {
  easy: { think: 4.0, edge: 2.0, opening: 45, moves: 1, growth: 0.55, turrets: false },
  normal: { think: 3.0, edge: 1.8, opening: 25, moves: 1, growth: 0.8, turrets: true },
  hard: { think: 2.6, edge: 1.6, opening: 20, moves: 2, growth: 0.9, turrets: true },
};

function foe(owner) {
  return owner === 1 ? 2 : 1;
}

function neighbors(world, a) {
  return world.nodes.filter((b) => L.inRange(a, b));
}

// 이 거점을 뺏는 데 드는 병력. 정확한 값이 아니라 목표를 고르고 "지금 칠 수
// 있는가"를 가르기 위한 어림이다.
function cost(world, target, owner) {
  let n = target.units[foe(owner)].n;
  for (const build of target.builds) n += build.type === 'turret' ? 22 : 10;
  n += target.core.hp / 10;
  return n;
}

// 위협받는 자리인가. **빈 거점이 붙어 있는 것은 위협이 아니다.** 그것까지 앞줄로
// 치면 시작하자마자 방어탑을 세워 병력이 늘지 않는다.
function threatened(world, a, owner) {
  const enemy = foe(owner);
  return neighbors(world, a).some((b) => b.owner === enemy || b.units[enemy].n > 0);
}

// 목표에서부터 내 거점만 밟고 잰 거리. 뒤쪽 거점이 어느 이웃에게 병력을
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

// opts로 세기를 받는다(없으면 예전 값 그대로). hold가 켜져 있으면 시설만 세운다.
function decide(world, owner, opts = {}) {
  const edge = opts.edge || EDGE;
  const mass = opts.mass || MASS;
  const acts = [];
  const mine = world.nodes.filter((a) => a.owner === owner);
  const busy = new Set();

  for (const a of mine) {
    if (a.builds.length >= L.maxBuilds(a)) continue;
    if (a.units[owner].n < L.UNITS_PER_BUILD) continue;
    const hasFactory = a.builds.some((t) => t.type === 'factory');
    // 적이 붙은 자리에만 방어탑을 세운다. 나머지는 병력이 곧 힘이라 생산탑만 올린다.
    // defense가 꺼져 있으면 아예 세우지 않는다 — 방어탑가 선 거점은 한 번에 한
    // 곳만 두드리는 사람에게 사실상 벽이라, 쉬운 쪽에서 먼저 걷어내는 것이 이것이다.
    const type = opts.turrets === false || !hasFactory || !threatened(world, a, owner)
      ? 'factory' : 'turret';
    acts.push({ type: 'build', id: a.id, build: type });
    busy.add(a.id);
  }

  if (opts.hold) return acts;
  const moves = opts.moves || 0;

  // 노릴 곳을 하나 고른다. **싼 곳이 아니라 뚫리는 곳이다.** 싼 곳만 보면 병력이
  // 쌓인 자리에서 갈 수 없는 목표를 골라 놓고 영영 모자란 앞줄만 쳐다본다 — 한쪽이
  // 병력 1129를 쥐고도 20분 동안 아무것도 하지 않는 판이 나왔다. 목표마다 그
  // 목표에 붙어 있는 내 병력을 세고, 값을 치르고 남는 쪽을 고른다.
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
      ready += a.units[owner].n;
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
    // 많이 든 곳부터 보낸다. 손이 한 번뿐이면 그 한 번이 가장 큰 부대여야 한다.
    const order = strike.slice().sort((p, q) => q.units[owner].n - p.units[owner].n);
    for (const a of moves ? order.slice(0, moves) : order) {
      if (a.units[owner].n >= 1) acts.push({ type: 'send', from: a.id, to: target.id, ratio: 1 });
    }
    return acts;
  }

  const dist = distances(world, target, owner);

  // 아직 모자라면 뒤에서 앞으로 민다. 앞줄은 그대로 쌓아 둔다.
  let pushed = 0;
  for (const a of mine) {
    if (moves && pushed >= moves) break;
    if (busy.has(a.id)) continue;
    const step = dist.get(a.id);
    if (!step || step < 2) continue;
    if (a.units[owner].n < mass) continue;
    const forward = neighbors(world, a)
      .filter((b) => b.owner === owner && dist.get(b.id) === step - 1)
      .sort((p, q) => p.units[owner].n - q.units[owner].n)[0];
    if (forward) { acts.push({ type: 'send', from: a.id, to: forward.id, ratio: 0.75 }); pushed++; }
  }

  return acts;
}

function apply(world, owner, acts) {
  for (const act of acts) {
    if (act.type === 'build') L.build(world, act.id, owner, act.build);
    else L.send(world, act.from, act.to, owner, act.ratio);
  }
}

const AI = { EDGE, MASS, LEVELS, cost, threatened, distances, decide, apply };

if (typeof module !== 'undefined' && module.exports) module.exports = AI;
if (typeof window !== 'undefined') window.ConquestAI = AI;

})();

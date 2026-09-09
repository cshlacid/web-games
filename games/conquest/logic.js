'use strict';

// 점령전의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// **병력을 하나씩 세지 않고 부대로 센다.** 거점마다 진영별로 `{n, str, eng, spd}`
// 더미 하나만 들고 간다. 병력마다 좌표를 굴리면 규칙을 node로 검증할 수 없을 만큼
// 화면과 얽히고, 판정도 결국 머릿수로 갈린다. 거점을 도는 점은 화면이 머릿수를 보고
// 지어낸다.
//
// 스탯은 생산된 거점의 것을 물려받고, 부대가 합쳐지면 머릿수로 가중평균한다.
// 그래서 좋은 거점에서 뽑은 병력을 약한 부대에 섞으면 평균이 내려간다 — "어느
// 거점에서 뽑았는가"가 이 한 줄로 남는다.
//
// 점령은 세 단계로 끊는다: 지키는 병력을 다 없애고 → 시설을 부수고 → 코어를 깎는다.
// 시설을 부순 뒤에야 코어로 들어가는 순서라, 단계를 나누면 판정이 단순해지고
// 화면에도 "지금 무엇을 하는 중인지"가 그대로 드러난다.
(function () {

const UNITS_PER_BUILD = 10;
// 사거리. 지도 좌표(320×460) 기준이고, 지도 생성기가 이 값으로 연결성을 본다.
// **112에서 132로 올렸다.** 112에서는 거점 하나에 이웃이 평균 둘뿐이라 판이
// 복도가 되고, 고를 것이 없으면 이 게임에는 아무것도 남지 않는다. 132에서 셋에서
// 넷이 되고, 더 올리면 아무 데나 갈 수 있어 사거리 자체가 무의미해진다.
const RANGE = 132;

const BUILD_HP = { factory: 100, turret: 140 };
const CORE_HP = { neutral: 50, owned: 100 };

// 초당 계수들. 실측 없이 고른 값이 아니라 한 판을 3~5분에 끝내는 것을 목표로 맞췄다.
const GROW = 0.6;        // 생산탑 한 그루가 낳는 병력
const FIGHT = 0.15;      // 서로 부딪힐 때 깎이는 비율
// 지키는 쪽의 이점. 같은 수로 부딪히면 지키는 쪽이 남는다.
//
// **없을 때는 공격과 수비가 완전히 대칭이었다.** 그러면 거점이 많은 쪽이 병력만 더
// 모아 어디든 뚫고, 한 번 기울면 되돌릴 자리가 방어탑밖에 없다. 판단기가 칠 때
// 1.3배를 요구하던 것도 규칙에는 없는 이점을 머릿속에서만 가정한 셈이었다.
//
// **1.25로 둔다.** 자가대국에서 60초에 밀리던 쪽이 이기는 판이 12/60에서 14/60으로
// 늘고, 판 길이(중앙값 167초)와 끝나는 비율(95%)은 그대로다. 1.35까지 올리면 사람
// 흉내의 '보통' 승률이 55%에서 43%로 떨어져 난이도가 같이 움직인다 — 수비를 세게
// 하려다 상대를 세게 만드는 셈이라 거기서 멈췄다.
const DEFEND_EDGE = 1.25;
const BUILD_DPS = 0.6;    // 병력 하나가 시설에 넣는 피해
const CORE_DPS = 0.5;    // 병력 하나가 코어에 넣는 피해
const CORE_HEAL = 8;     // 공격이 끊기면 코어가 되돌아오는 속도
const TURRET_DPS = 2.5;     // 방어탑 한 그루가 없애는 적 병력
const STARVE = 0.05;     // 한도를 넘긴 부대가 초당 줄어드는 비율
const MOVE_BASE = 24;    // 스탯 0에서의 이동 속도
const MOVE_PER = 0.32;   // 속도 스탯 1당 더해지는 이동 속도

// 집결지. 거점 하나에 목적지를 걸어 두면 생산된 병력이 알아서 흘러간다.
// **남겨 두는 수는 시설 값과 같은 10이다.** 한 명도 남기지 않으면 방어가 비어 순찰
// 한 부대에도 뺏기고, 손으로 시설을 세울 병력도 모이지 않는다.
const RALLY_KEEP = 10;
// 몇 초에 한 번 넘친 만큼 보내는가. 매 틱 보내면 초당 서른 개의 부대가 생겨 화면과
// 판정이 둘 다 무거워진다.
const RALLY_EVERY = 2;

// 스탯은 1~200이고 50이 보통이다. 계수를 1 근처에 두어야 위의 초당 값들이
// 그대로 감각과 맞는다.
const strFactor = (v) => 0.5 + v / 100;
const engFactor = (v) => 0.5 + v / 100;

function emptyStack() {
  return { n: 0, str: 0, eng: 0, spd: 0 };
}

function maxBuilds(a) {
  return a.r >= 19 ? 3 : a.r >= 14 ? 2 : 1;
}

function capacity(a) {
  let factories = 0;
  for (const build of a.builds) if (build.type === 'factory') factories++;
  return 10 + factories * 20;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inRange(a, b) {
  return a !== b && dist(a, b) <= RANGE;
}

// 부대를 합친다. 스탯은 머릿수로 가중평균한다.
function merge(stack, add) {
  const total = stack.n + add.n;
  if (total <= 0) return emptyStack();
  const w = add.n / total;
  return {
    n: total,
    str: stack.str + (add.str - stack.str) * w,
    eng: stack.eng + (add.eng - stack.eng) * w,
    spd: stack.spd + (add.spd - stack.spd) * w,
  };
}

function createWorld(map) {
  const nodes = map.nodes.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    r: a.r,
    stats: { energy: a.stats.energy, strength: a.stats.strength, speed: a.stats.speed },
    owner: a.owner || 0,
    builds: (a.builds || []).map((type) => ({ type, hp: BUILD_HP[type] })),
    units: { 1: emptyStack(), 2: emptyStack() },
    core: { hp: a.owner ? CORE_HP.owned : CORE_HP.neutral },
    rally: null,
    rallyAt: 0,
  }));

  for (const a of nodes) {
    const start = map.nodes[a.id];
    if (start.units) {
      a.units[a.owner] = {
        n: start.units,
        str: a.stats.strength,
        eng: a.stats.energy,
        spd: a.stats.speed,
      };
    }
  }

  // 진영별 생산 배수. 난이도의 뼈대다 — 판단기를 굼뜨게 만드는 것만으로는 사람 손의
  // 속도를 따라 내려오지 않아서, 상대가 병력을 얼마나 빨리 불리는지를 직접 건드린다.
  return {
    t: 0,
    seed: map.seed,
    start: map.start || null,
    growth: { 1: 1, 2: 1 },
    nodes,
    flights: [],
    over: null,
  };
}

function byId(world, id) {
  return world.nodes[id];
}

function foe(owner) {
  return owner === 1 ? 2 : 1;
}

// 보낼 수 있는가. 화면이 목적지를 고르기 전에도 같은 함수로 묻는다.
function canSend(world, fromId, toId, owner) {
  const from = byId(world, fromId);
  const to = byId(world, toId);
  if (!from || !to || from === to) return false;
  if (from.owner !== owner) return false;
  if (from.units[owner].n < 1) return false;
  return inRange(from, to);
}

function send(world, fromId, toId, owner, ratio) {
  if (!canSend(world, fromId, toId, owner)) return false;
  const from = byId(world, fromId);
  return launch(world, from, byId(world, toId), owner, Math.floor(from.units[owner].n * ratio));
}

// 실제로 부대를 띄운다. 손으로 보낼 때는 비율로, 집결지로 흘려보낼 때는 수로 정해지는데
// 그 아래는 같아서 여기로 모았다.
function launch(world, from, to, owner, n) {
  if (n < 1) return false;
  const stack = from.units[owner];
  const toId = to.id;
  const fromId = from.id;

  stack.n -= n;
  if (stack.n < 1) from.units[owner] = emptyStack();

  const d = dist(from, to);
  world.flights.push({
    owner,
    from: fromId,
    to: toId,
    n,
    str: stack.str || from.stats.strength,
    eng: stack.eng || from.stats.energy,
    spd: stack.spd || from.stats.speed,
    dist: d,
    // 속도 스탯이 이동에 걸리는 자리. 여기서 한 번만 재고 나중에는 진행도만 민다.
    speed: MOVE_BASE + (stack.spd || from.stats.speed) * MOVE_PER,
    pos: 0,
  });
  return true;
}

// 집결지를 걸거나 푼다(toId가 null이면 푼다). 사거리 밖은 걸 수 없다 — 어차피
// 보낼 수 없는 곳이다.
function setRally(world, id, toId, owner) {
  const a = byId(world, id);
  if (!a || a.owner !== owner) return false;
  if (toId === null || toId === undefined) { a.rally = null; return true; }
  const to = byId(world, toId);
  if (!to || !inRange(a, to)) return false;
  a.rally = toId;
  a.rallyAt = world.t + RALLY_EVERY;
  return true;
}

// 집결지로 넘친 병력을 흘려보낸다. 사거리 밖으로 밀려나거나(있을 수 없지만) 주인이
// 바뀌면 스스로 풀린다.
function tickRally(world, a) {
  if (a.rally === null || !a.owner) return;
  const to = byId(world, a.rally);
  if (!to || !inRange(a, to)) { a.rally = null; return; }
  // **상대에게 넘어간 곳으로는 더 보내지 않는다.** 걸어 둔 줄 모르고 두면 생산되는
  // 족족 적진으로 조금씩 흘러 들어가 각개격파당한다. 빈 거점은 그대로 두어, 걸어만
  // 두면 알아서 먹으러 가게 한다.
  if (to.owner === foe(a.owner)) { a.rally = null; return; }
  if (world.t < a.rallyAt) return;
  a.rallyAt = world.t + RALLY_EVERY;
  launch(world, a, to, a.owner, Math.floor(a.units[a.owner].n - RALLY_KEEP));
}

function canBuild(world, id, owner, type) {
  const a = byId(world, id);
  if (!a || a.owner !== owner) return false;
  if (!BUILD_HP[type]) return false;
  if (a.builds.length >= maxBuilds(a)) return false;
  return a.units[owner].n >= UNITS_PER_BUILD;
}

function build(world, id, owner, type) {
  if (!canBuild(world, id, owner, type)) return false;
  const a = byId(world, id);
  a.units[owner].n -= UNITS_PER_BUILD;
  if (a.units[owner].n < 1) a.units[owner] = emptyStack();
  a.builds.push({ type, hp: BUILD_HP[type] });
  return true;
}

// 병력을 깎는다. **0.5 아래로 내려가면 없는 것으로 친다.** 소수점 아래만 남은 부대를
// 살려 두면 거점에 0.03가 남아 점령이 영영 시작되지 않고, 판정도 끝나지 않는다.
// 깎는 자리에서만 이 바닥을 적용한다 — 틱 끝에서 일괄로 걸면 이제 막 자란 병력까지
// 매 틱 지워진다.
function hurt(a, owner, amount) {
  const stack = a.units[owner];
  stack.n -= amount;
  if (stack.n < 0.5) a.units[owner] = emptyStack();
}

// 거점 하나의 한 틱. 순서가 규칙이다 — 자라고, 부딪히고, 시설을 부수고, 코어를 깎는다.
function tickNode(world, a, dt, events) {
  const holder = a.owner;
  const attacker = holder ? foe(holder) : 0;

  if (holder) {
    const mine = a.units[holder];
    const cap = capacity(a);
    let factories = 0;
    for (const build of a.builds) if (build.type === 'factory') factories++;
    if (factories && mine.n < cap) {
      const rate = (world.growth && world.growth[holder]) || 1;
      const born = GROW * rate * factories * engFactor(a.stats.energy) * dt;
      a.units[holder] = merge(mine, {
        n: Math.min(born, cap - mine.n),
        str: a.stats.strength,
        eng: a.stats.energy,
        spd: a.stats.speed,
      });
    }
  }

  // **한도를 넘긴 부대는 줄어든다.** 생산만 막고 쌓는 것을 열어 두었더니 양쪽이 병력
  // 천 명짜리 덩어리를 하나씩 만들어 거점 하나를 무한히 주고받는 판이 나왔다.
  // 넘친 만큼만 조금씩 줄여 두면 군대의 크기가 땅의 크기에 묶이고, 쌓아 두는 것보다
  // 쓰는 쪽이 이득이 된다.
  if (holder) {
    const over = a.units[holder].n - capacity(a);
    if (over > 0) a.units[holder].n -= over * STARVE * dt;
  }

  const one = a.units[1];
  const two = a.units[2];

  // 양쪽이 다 있으면 서로 깎는다. 같은 틱의 머릿수로 서로를 재야 한쪽이 먼저
  // 줄어든 값으로 계산되는 순서 편향이 생기지 않는다.
  if (one.n > 0 && two.n > 0) {
    // 주인이 있는 거점에서만 이점이 붙는다. 빈 거점에서 마주친 둘은 양쪽 다 손님이다.
    const edgeOne = holder === 1 ? DEFEND_EDGE : 1;
    const edgeTwo = holder === 2 ? DEFEND_EDGE : 1;
    const lossOne = FIGHT * two.n * strFactor(two.str) * edgeTwo * dt;
    const lossTwo = FIGHT * one.n * strFactor(one.str) * edgeOne * dt;
    hurt(a, 1, lossOne);
    hurt(a, 2, lossTwo);
  }

  // 방어탑은 주인이 있을 때만 돈다. 지키는 병력이 없어도 계속 쏜다 — 이것이
  // 시설을 세우는 이유다.
  if (holder && a.units[attacker].n > 0) {
    let turrets = 0;
    for (const build of a.builds) if (build.type === 'turret') turrets++;
    if (turrets) {
      hurt(a, attacker, TURRET_DPS * turrets * strFactor(a.stats.strength) * dt);
    }
  }

  const invader = attacker && a.units[attacker].n > 0 && a.units[holder].n <= 0
    ? a.units[attacker]
    : null;
  const claimer = !holder && (a.units[1].n > 0) !== (a.units[2].n > 0)
    ? (a.units[1].n > 0 ? 1 : 2)
    : 0;

  if (invader) {
    // 시설을 먼저 부순다. 방어탑부터 — 그대로 두면 계속 맞는다.
    let target = null;
    for (const build of a.builds) {
      if (build.type === 'turret') { target = build; break; }
      if (!target) target = build;
    }
    if (target) {
      target.hp -= BUILD_DPS * invader.n * strFactor(invader.str) * dt;
      if (target.hp <= 0) {
        a.builds.splice(a.builds.indexOf(target), 1);
        events.push({ type: 'build-fell', id: a.id, owner: holder });
      }
    } else {
      a.core.hp -= CORE_DPS * invader.n * engFactor(invader.eng) * dt;
    }
  } else if (claimer) {
    a.core.hp -= CORE_DPS * a.units[claimer].n * engFactor(a.units[claimer].eng) * dt;
  } else if (a.core.hp < (holder ? CORE_HP.owned : CORE_HP.neutral)) {
    a.core.hp = Math.min(holder ? CORE_HP.owned : CORE_HP.neutral, a.core.hp + CORE_HEAL * dt);
  }

  if (a.core.hp <= 0) {
    const winner = invader ? attacker : claimer;
    a.owner = winner;
    a.core.hp = CORE_HP.owned;
    a.builds.length = 0;
    a.units[foe(winner)] = emptyStack();
    // 걸어 둔 집결지는 주인과 함께 사라진다. 뺏은 쪽이 앞 주인의 보급선을 물려받으면
    // 병력이 엉뚱한 곳으로 새 나간다.
    a.rally = null;
    events.push({ type: 'taken', id: a.id, owner: winner });
  }
}

function tickFlights(world, dt, events) {
  const left = [];
  for (const f of world.flights) {
    f.pos += (f.speed * dt) / f.dist;
    if (f.pos < 1) { left.push(f); continue; }
    const to = byId(world, f.to);
    to.units[f.owner] = merge(to.units[f.owner], { n: f.n, str: f.str, eng: f.eng, spd: f.spd });
    events.push({ type: 'landed', id: f.to, owner: f.owner });
  }
  world.flights = left;
}

function power(world, owner) {
  let n = 0;
  for (const a of world.nodes) n += a.units[owner].n;
  for (const f of world.flights) if (f.owner === owner) n += f.n;
  return n;
}

function holdings(world, owner) {
  let n = 0;
  for (const a of world.nodes) if (a.owner === owner) n++;
  return n;
}

// 병력도 거점도 없으면 진 것이다. 거점을 다 잃어도 날아가는 부대가 남아 있으면
// 아직 끝이 아니다 — 그 부대가 빈 거점을 물어 오면 되살아난다.
function judge(world) {
  const alive1 = holdings(world, 1) > 0 || power(world, 1) > 0;
  const alive2 = holdings(world, 2) > 0 || power(world, 2) > 0;
  if (alive1 && !alive2) return { winner: 1 };
  if (alive2 && !alive1) return { winner: 2 };
  if (!alive1 && !alive2) return { winner: 0 };
  return null;
}

function step(world, dt) {
  if (world.over) return [];
  const events = [];
  world.t += dt;
  for (const a of world.nodes) tickNode(world, a, dt, events);
  for (const a of world.nodes) tickRally(world, a);
  tickFlights(world, dt, events);
  const over = judge(world);
  if (over) {
    world.over = over;
    events.push({ type: 'over', winner: over.winner });
  }
  return events;
}

const Logic = {
  UNITS_PER_BUILD, RANGE, BUILD_HP, CORE_HP, RALLY_KEEP, RALLY_EVERY, DEFEND_EDGE,
  emptyStack, maxBuilds, capacity, dist, inRange, merge,
  createWorld, canSend, send, canBuild, build, setRally, power, holdings, judge, step,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
if (typeof window !== 'undefined') window.ConquestLogic = Logic;

})();

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
const BUILD_DPS = 0.6;    // 병력 하나가 시설에 넣는 피해
const CORE_DPS = 0.5;    // 병력 하나가 코어에 넣는 피해
const CORE_HEAL = 8;     // 공격이 끊기면 코어가 되돌아오는 속도
const TURRET_DPS = 2.5;     // 방어탑 한 그루가 없애는 적 병력
const STARVE = 0.05;     // 한도를 넘긴 부대가 초당 줄어드는 비율
const MOVE_BASE = 24;    // 스탯 0에서의 이동 속도
const MOVE_PER = 0.32;   // 속도 스탯 1당 더해지는 이동 속도

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
  const to = byId(world, toId);
  const stack = from.units[owner];
  const n = Math.floor(stack.n * ratio);
  if (n < 1) return false;

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
    const lossOne = FIGHT * two.n * strFactor(two.str) * dt;
    const lossTwo = FIGHT * one.n * strFactor(one.str) * dt;
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
  tickFlights(world, dt, events);
  const over = judge(world);
  if (over) {
    world.over = over;
    events.push({ type: 'over', winner: over.winner });
  }
  return events;
}

const Logic = {
  UNITS_PER_BUILD, RANGE, BUILD_HP, CORE_HP,
  emptyStack, maxBuilds, capacity, dist, inRange, merge,
  createWorld, canSend, send, canBuild, build, power, holdings, judge, step,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
if (typeof window !== 'undefined') window.ConquestLogic = Logic;

})();

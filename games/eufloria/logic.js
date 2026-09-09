'use strict';

// 씨앗 번지기의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// **씨앗을 한 마리씩 세지 않고 무리로 센다.** 원작은 씨앗 하나하나가 궤도를 돌지만
// 여기서는 소행성마다 진영별로 `{n, str, eng, spd}` 더미 하나만 들고 간다. 마리마다
// 좌표를 굴리면 규칙을 node로 검증할 수 없을 만큼 화면과 얽히고, 판정도 결국
// 마릿수로 갈린다. 궤도를 도는 점은 화면이 마릿수를 보고 지어낸다.
//
// 스탯은 태어난 소행성의 것을 물려받고, 무리가 합쳐지면 마릿수로 가중평균한다.
// 그래서 좋은 소행성에서 뽑은 씨앗을 섞으면 평균이 내려간다 — 원작의 "어느
// 소행성에서 뽑았는가"가 이 한 줄로 남는다.
//
// 점령은 세 단계로 끊는다: 지키는 씨앗을 다 없애고 → 나무를 부수고 → 코어를 깎는다.
// 원작도 나무를 하나 부순 뒤 코어로 파고드는 순서라, 단계를 나누면 판정이 단순해지고
// 화면에도 "지금 무엇을 하는 중인지"가 그대로 드러난다.
(function () {

const SEEDS_PER_TREE = 10;
// 사거리. 지도 좌표(320×460) 기준이고, 지도 생성기가 이 값으로 연결성을 본다.
// **112에서 132로 올렸다.** 112에서는 소행성 하나에 이웃이 평균 둘뿐이라 판이
// 복도가 되고, 고를 것이 없으면 이 게임에는 아무것도 남지 않는다. 132에서 셋에서
// 넷이 되고, 더 올리면 아무 데나 갈 수 있어 사거리 자체가 무의미해진다.
const RANGE = 132;

const TREE_HP = { dyson: 100, defense: 140 };
const CORE_HP = { neutral: 50, owned: 100 };

// 초당 계수들. 실측 없이 고른 값이 아니라 한 판을 3~5분에 끝내는 것을 목표로 맞췄다.
const GROW = 0.6;        // 다이슨 나무 한 그루가 낳는 씨앗
const FIGHT = 0.15;      // 서로 부딪힐 때 깎이는 비율
const TREE_DPS = 0.6;    // 씨앗 한 마리가 나무에 넣는 피해
const CORE_DPS = 0.5;    // 씨앗 한 마리가 코어에 넣는 피해
const CORE_HEAL = 8;     // 공격이 끊기면 코어가 되돌아오는 속도
const DEF_DPS = 2.5;     // 방어 나무 한 그루가 없애는 적 씨앗
const STARVE = 0.05;     // 정원을 넘긴 무리가 초당 굶는 비율
const MOVE_BASE = 24;    // 스탯 0에서의 이동 속도
const MOVE_PER = 0.32;   // 속도 스탯 1당 더해지는 이동 속도

// 스탯은 1~200이고 50이 보통이다. 계수를 1 근처에 두어야 위의 초당 값들이
// 그대로 감각과 맞는다.
const strFactor = (v) => 0.5 + v / 100;
const engFactor = (v) => 0.5 + v / 100;

function emptyStack() {
  return { n: 0, str: 0, eng: 0, spd: 0 };
}

function maxTrees(a) {
  return a.r >= 19 ? 3 : a.r >= 14 ? 2 : 1;
}

function capacity(a) {
  let dyson = 0;
  for (const tree of a.trees) if (tree.type === 'dyson') dyson++;
  return 10 + dyson * 20;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inRange(a, b) {
  return a !== b && dist(a, b) <= RANGE;
}

// 무리를 합친다. 스탯은 마릿수로 가중평균한다.
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
  const asteroids = map.asteroids.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    r: a.r,
    stats: { energy: a.stats.energy, strength: a.stats.strength, speed: a.stats.speed },
    owner: a.owner || 0,
    trees: (a.trees || []).map((type) => ({ type, hp: TREE_HP[type] })),
    seeds: { 1: emptyStack(), 2: emptyStack() },
    core: { hp: a.owner ? CORE_HP.owned : CORE_HP.neutral },
  }));

  for (const a of asteroids) {
    const start = map.asteroids[a.id];
    if (start.seeds) {
      a.seeds[a.owner] = {
        n: start.seeds,
        str: a.stats.strength,
        eng: a.stats.energy,
        spd: a.stats.speed,
      };
    }
  }

  // 진영별 생산 배수. 난이도의 뼈대다 — 판단기를 굼뜨게 만드는 것만으로는 사람 손의
  // 속도를 따라 내려오지 않아서, 상대가 씨앗을 얼마나 빨리 불리는지를 직접 건드린다.
  return {
    t: 0,
    seed: map.seed,
    start: map.start || null,
    growth: { 1: 1, 2: 1 },
    asteroids,
    flights: [],
    over: null,
  };
}

function byId(world, id) {
  return world.asteroids[id];
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
  if (from.seeds[owner].n < 1) return false;
  return inRange(from, to);
}

function send(world, fromId, toId, owner, ratio) {
  if (!canSend(world, fromId, toId, owner)) return false;
  const from = byId(world, fromId);
  const to = byId(world, toId);
  const stack = from.seeds[owner];
  const n = Math.floor(stack.n * ratio);
  if (n < 1) return false;

  stack.n -= n;
  if (stack.n < 1) from.seeds[owner] = emptyStack();

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

function canPlant(world, id, owner, type) {
  const a = byId(world, id);
  if (!a || a.owner !== owner) return false;
  if (!TREE_HP[type]) return false;
  if (a.trees.length >= maxTrees(a)) return false;
  return a.seeds[owner].n >= SEEDS_PER_TREE;
}

function plant(world, id, owner, type) {
  if (!canPlant(world, id, owner, type)) return false;
  const a = byId(world, id);
  a.seeds[owner].n -= SEEDS_PER_TREE;
  if (a.seeds[owner].n < 1) a.seeds[owner] = emptyStack();
  a.trees.push({ type, hp: TREE_HP[type] });
  return true;
}

// 씨앗을 깎는다. **0.5 아래로 내려가면 없는 것으로 친다.** 소수점 아래만 남은 무리를
// 살려 두면 궤도에 0.03마리가 남아 점령이 영영 시작되지 않고, 판정도 끝나지 않는다.
// 깎는 자리에서만 이 바닥을 적용한다 — 틱 끝에서 일괄로 걸면 이제 막 자란 씨앗까지
// 매 틱 지워진다.
function hurt(a, owner, amount) {
  const stack = a.seeds[owner];
  stack.n -= amount;
  if (stack.n < 0.5) a.seeds[owner] = emptyStack();
}

// 소행성 하나의 한 틱. 순서가 규칙이다 — 자라고, 부딪히고, 나무를 부수고, 코어를 깎는다.
function tickAsteroid(world, a, dt, events) {
  const holder = a.owner;
  const attacker = holder ? foe(holder) : 0;

  if (holder) {
    const mine = a.seeds[holder];
    const cap = capacity(a);
    let dyson = 0;
    for (const tree of a.trees) if (tree.type === 'dyson') dyson++;
    if (dyson && mine.n < cap) {
      const rate = (world.growth && world.growth[holder]) || 1;
      const born = GROW * rate * dyson * engFactor(a.stats.energy) * dt;
      a.seeds[holder] = merge(mine, {
        n: Math.min(born, cap - mine.n),
        str: a.stats.strength,
        eng: a.stats.energy,
        spd: a.stats.speed,
      });
    }
  }

  // **정원을 넘긴 무리는 굶는다.** 생산만 막고 쌓는 것을 열어 두었더니 양쪽이 씨앗
  // 천 마리짜리 덩어리를 하나씩 만들어 소행성 하나를 무한히 주고받는 판이 나왔다.
  // 넘친 만큼만 조금씩 줄여 두면 군대의 크기가 땅의 크기에 묶이고, 쌓아 두는 것보다
  // 쓰는 쪽이 이득이 된다.
  if (holder) {
    const over = a.seeds[holder].n - capacity(a);
    if (over > 0) a.seeds[holder].n -= over * STARVE * dt;
  }

  const one = a.seeds[1];
  const two = a.seeds[2];

  // 양쪽이 다 있으면 서로 깎는다. 같은 틱의 마릿수로 서로를 재야 한쪽이 먼저
  // 줄어든 값으로 계산되는 순서 편향이 생기지 않는다.
  if (one.n > 0 && two.n > 0) {
    const lossOne = FIGHT * two.n * strFactor(two.str) * dt;
    const lossTwo = FIGHT * one.n * strFactor(one.str) * dt;
    hurt(a, 1, lossOne);
    hurt(a, 2, lossTwo);
  }

  // 방어 나무는 주인이 있을 때만 돈다. 지키는 씨앗이 없어도 계속 쏜다 — 이것이
  // 나무를 심는 이유다.
  if (holder && a.seeds[attacker].n > 0) {
    let defense = 0;
    for (const tree of a.trees) if (tree.type === 'defense') defense++;
    if (defense) {
      hurt(a, attacker, DEF_DPS * defense * strFactor(a.stats.strength) * dt);
    }
  }

  const invader = attacker && a.seeds[attacker].n > 0 && a.seeds[holder].n <= 0
    ? a.seeds[attacker]
    : null;
  const claimer = !holder && (a.seeds[1].n > 0) !== (a.seeds[2].n > 0)
    ? (a.seeds[1].n > 0 ? 1 : 2)
    : 0;

  if (invader) {
    // 나무를 먼저 부순다. 방어 나무부터 — 그대로 두면 계속 맞는다.
    let target = null;
    for (const tree of a.trees) {
      if (tree.type === 'defense') { target = tree; break; }
      if (!target) target = tree;
    }
    if (target) {
      target.hp -= TREE_DPS * invader.n * strFactor(invader.str) * dt;
      if (target.hp <= 0) {
        a.trees.splice(a.trees.indexOf(target), 1);
        events.push({ type: 'tree-fell', id: a.id, owner: holder });
      }
    } else {
      a.core.hp -= CORE_DPS * invader.n * engFactor(invader.eng) * dt;
    }
  } else if (claimer) {
    a.core.hp -= CORE_DPS * a.seeds[claimer].n * engFactor(a.seeds[claimer].eng) * dt;
  } else if (a.core.hp < (holder ? CORE_HP.owned : CORE_HP.neutral)) {
    a.core.hp = Math.min(holder ? CORE_HP.owned : CORE_HP.neutral, a.core.hp + CORE_HEAL * dt);
  }

  if (a.core.hp <= 0) {
    const winner = invader ? attacker : claimer;
    a.owner = winner;
    a.core.hp = CORE_HP.owned;
    a.trees.length = 0;
    a.seeds[foe(winner)] = emptyStack();
    events.push({ type: 'taken', id: a.id, owner: winner });
  }
}

function tickFlights(world, dt, events) {
  const left = [];
  for (const f of world.flights) {
    f.pos += (f.speed * dt) / f.dist;
    if (f.pos < 1) { left.push(f); continue; }
    const to = byId(world, f.to);
    to.seeds[f.owner] = merge(to.seeds[f.owner], { n: f.n, str: f.str, eng: f.eng, spd: f.spd });
    events.push({ type: 'landed', id: f.to, owner: f.owner });
  }
  world.flights = left;
}

function power(world, owner) {
  let n = 0;
  for (const a of world.asteroids) n += a.seeds[owner].n;
  for (const f of world.flights) if (f.owner === owner) n += f.n;
  return n;
}

function holdings(world, owner) {
  let n = 0;
  for (const a of world.asteroids) if (a.owner === owner) n++;
  return n;
}

// 씨앗도 소행성도 없으면 진 것이다. 소행성을 다 잃어도 날아가는 무리가 남아 있으면
// 아직 끝이 아니다 — 그 무리가 빈 소행성을 물어 오면 되살아난다.
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
  for (const a of world.asteroids) tickAsteroid(world, a, dt, events);
  tickFlights(world, dt, events);
  const over = judge(world);
  if (over) {
    world.over = over;
    events.push({ type: 'over', winner: over.winner });
  }
  return events;
}

const Logic = {
  SEEDS_PER_TREE, RANGE, TREE_HP, CORE_HP,
  emptyStack, maxTrees, capacity, dist, inRange, merge,
  createWorld, canSend, send, canPlant, plant, power, holdings, judge, step,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
if (typeof window !== 'undefined') window.EufloriaLogic = Logic;

})();

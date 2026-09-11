'use strict';

// 한 판의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// **강화도 해금도 모른다. `mods` 하나만 본다.** 영구 강화와 편성이 무엇을 어떻게
// 올리든 바깥에서 계수 하나로 합쳐 넘기므로, 새 캐릭터를 들이거나 성장 표를
// 바꿔도 이 파일은 그대로다. 테스트도 mods를 손으로 꾸며 놓고 돌린다.
//
// 시간은 1/30초로 끊어 민다. 프레임 간격을 그대로 밀면 탭을 옮겼다 돌아왔을 때
// 몇 초가 한 번에 계산돼 판이 순간이동한다.
(function () {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : window.DefenseData;
const M = node ? require('./mapgen.js') : window.DefenseMap;
const P = node ? require('./paths.js') : window.DefensePaths;
const W = node ? require('./waves.js') : window.DefenseWaves;

const TICK = 1 / 30;
const MAX_DT = 0.1;
const EVENT_CAP = 300;

const at = (map, x, y) => y * map.w + x;

// mods의 계수는 0도 뜻이 있는 값이라 `|| 1`로 메우면 안 된다 — 시작 골드를 0으로
// 둔 판이 그대로 기본값으로 돌아갔다.
const mul = (mods, key) => (mods[key] == null ? 1 : mods[key]);

function statOf(key, tier, mods) {
  const d = D.UNITS[key];
  const own = (mods.unit && mods.unit[key]) || {};
  const step = tier - 1;
  return {
    damage: d.damage * Math.pow(D.UP.damage, step) * (own.damage == null ? 1 : own.damage) * mul(mods, 'damage'),
    hp: Math.round(d.hp * Math.pow(D.UP.hp, step) * (own.hp == null ? 1 : own.hp)),
    range: d.range + D.UP.range * step + (mods.range || 0),
    rate: d.rate,
  };
}

const upCost = (key, tier) => Math.round(D.UNITS[key].cost * D.UP.cost[tier - 1]);

function emit(run, event) {
  run.events.push(event);
  if (run.events.length > EVENT_CAP) run.events.shift();
}

const drain = (run) => { const e = run.events; run.events = []; return e; };

function createRun(stage, opts) {
  const o = opts || {};
  const mods = o.mods || {};
  const map = o.map || M.build(stage);
  // 테스트와 자동 플레이는 웨이브를 손으로 꾸며 넘긴다.
  const waves = o.waves || W.wavesOf(stage);
  return {
    stage, map, waves, mods,
    roster: o.roster || Object.keys(D.UNITS),
    wave: 0,
    timer: D.RUN.ready,
    pending: [],
    units: [],
    cells: new Array(map.w * map.h).fill(null),
    foes: [],
    fields: {},
    gold: Math.round(D.RUN.gold * mul(mods, 'startGold')),
    lives: D.RUN.lives + (mods.lives || 0),
    time: 0,
    carry: 0,
    over: null,
    seq: 1,
    events: [],
    heroUsed: false,
    stats: {
      livesLost: 0, goldSpent: 0, upgrades: 0, sold: 0,
      kinds: {}, placed: 0, heroUsed: false, bossAt: null, time: 0, goldLeft: 0,
    },
  };
}

// 거리장은 배치가 바뀔 때만 다시 푼다. 체력이 깎이는 대로 다시 풀면 매 틱
// 일곱 번을 풀게 되고, 적이 목표를 계속 갈아타 길이 부르르 떨린다. 그래서
// "누가 약한가"는 지금 체력이 아니라 서 있는 체력으로 본다.
function clearFields(run) { run.fields = {}; }

function fieldFor(run, foeKey) {
  if (run.fields[foeKey]) return run.fields[foeKey];
  const f = D.FOES[foeKey];
  const cells = run.cells.map((u) => (u ? { hp: u.hp } : null));
  const got = P.field(run.map, cells, { speed: f.speed, siege: f.siege, bias: f.bias });
  run.fields[foeKey] = got;
  return got;
}

// 적이 밟고 있는 칸. 칸 사이를 보간해 움직이므로 떠난 칸과 들어갈 칸을 둘 다
// 차지한 것으로 본다 — 지금 칸만 보면 반쯤 넘어간 적의 코앞에 벽이 선다.
function occupied(run, x, y) {
  return run.foes.some((e) => (e.from.x === x && e.from.y === y)
    || (e.to && e.to.x === x && e.to.y === y));
}

function canPlace(run, key, x, y) {
  if (run.over) return '판이 끝났다';
  if (!D.UNITS[key]) return '없는 캐릭터';
  if (!run.roster.includes(key)) return '편성에 없다';
  if (x < 0 || y < 0 || x >= run.map.w || y >= run.map.h) return '판 밖';
  const c = at(run.map, x, y);
  if (run.map.walls[c]) return '벽';
  if (run.cells[c]) return '이미 서 있다';
  if (occupied(run, x, y)) return '적이 밟고 있다';
  if (D.UNITS[key].hero && run.heroUsed) return '영웅은 한 판에 한 번';
  if (run.gold < D.UNITS[key].cost) return '골드가 모자라다';
  return null;
}

function place(run, key, x, y) {
  if (canPlace(run, key, x, y)) return null;
  const cost = D.UNITS[key].cost;
  const stat = statOf(key, 1, run.mods);
  const unit = { id: run.seq++, key, x, y, tier: 1, hp: stat.hp, max: stat.hp, cd: 0 };
  run.units.push(unit);
  run.cells[at(run.map, x, y)] = unit;
  run.gold -= cost;
  run.stats.goldSpent += cost;
  run.stats.placed++;
  run.stats.kinds[key] = (run.stats.kinds[key] || 0) + 1;
  if (D.UNITS[key].hero) { run.heroUsed = true; run.stats.heroUsed = true; }
  clearFields(run);
  emit(run, { type: 'place', key, x, y });
  return unit;
}

function sell(run, id) {
  const i = run.units.findIndex((u) => u.id === id);
  if (i < 0 || run.over) return false;
  const u = run.units[i];
  run.units.splice(i, 1);
  run.cells[at(run.map, u.x, u.y)] = null;
  run.gold += Math.round(D.UNITS[u.key].cost * D.RUN.refund);
  run.stats.sold++;
  clearFields(run);
  emit(run, { type: 'sell', x: u.x, y: u.y });
  return true;
}

function upgrade(run, id) {
  const u = run.units.find((e) => e.id === id);
  if (!u || run.over || u.tier >= D.UP.max) return false;
  const cost = upCost(u.key, u.tier);
  if (run.gold < cost) return false;
  run.gold -= cost;
  run.stats.goldSpent += cost;
  run.stats.upgrades++;
  const before = statOf(u.key, u.tier, run.mods).hp;
  u.tier++;
  const after = statOf(u.key, u.tier, run.mods).hp;
  // 올린 만큼은 채워 준다. 깎인 만큼은 그대로 둔다 — 올리는 것이 회복 수단이
  // 되면 방패병을 계속 올렸다 파는 쪽이 힐러보다 싸진다.
  u.hp += after - before;
  u.max = after;
  clearFields(run);
  emit(run, { type: 'upgrade', x: u.x, y: u.y, tier: u.tier });
  return true;
}

// 적 하나를 입구에 세운다.
function spawn(run, foeKey, hp) {
  const f = D.FOES[foeKey];
  const from = { x: run.map.entry.x, y: run.map.entry.y };
  const total = Math.round(hp * f.hp);
  const foe = {
    id: run.seq++, key: foeKey, hp: total, max: total,
    from, to: null, p: 0, slowT: 0, slowBy: 1,
  };
  run.foes.push(foe);
  emit(run, { type: 'spawn', key: foeKey, x: from.x, y: from.y });
}

function startWave(run) {
  run.wave++;
  const wave = run.waves[run.wave - 1];
  let at0 = 0;
  for (const g of wave.groups) {
    for (let i = 0; i < g.count; i++) {
      run.pending.push({ foe: g.foe, at: run.time + at0, hp: wave.hp });
      at0 += g.gap;
    }
    at0 += 1.5;
  }
  emit(run, { type: 'wave', index: run.wave });
}

const foeXY = (e) => (e.to
  ? { x: e.from.x + (e.to.x - e.from.x) * e.p, y: e.from.y + (e.to.y - e.from.y) * e.p }
  : { x: e.from.x, y: e.from.y });

// 출구까지 남은 시간. 누구를 먼저 쏠지 고를 때 쓴다 — 앞선 놈부터 쳐야
// 새는 것을 막는다.
function lead(run, e) {
  const f = fieldFor(run, e.key);
  return f.dist[at(run.map, e.from.x, e.from.y)];
}

function hurt(run, e, amount, pierce) {
  const f = D.FOES[e.key];
  const armor = pierce ? 0 : f.armor;
  const dealt = Math.max(1, amount - armor);
  e.hp -= dealt;
  if (e.hp <= 0) {
    e.dead = true;
    run.gold += Math.round(f.bounty * mul(run.mods, 'gold'));
    if (e.key === 'boss' && run.stats.bossAt == null) run.stats.bossAt = run.time;
    emit(run, { type: 'kill', key: e.key, ...foeXY(e) });
  }
}

function tickUnits(run) {
  for (const u of run.units) {
    u.cd -= TICK;
    if (u.cd > 0) continue;
    const d = D.UNITS[u.key];
    const stat = statOf(u.key, u.tier, run.mods);
    if (d.kind === 'heal') {
      // 가장 많이 깎인 아군 하나. 다 멀쩡하면 쉰다.
      let hurtest = null;
      for (const o of run.units) {
        if (o === u || o.hp >= o.max) continue;
        if (Math.hypot(o.x - u.x, o.y - u.y) > stat.range) continue;
        if (!hurtest || (o.max - o.hp) > (hurtest.max - hurtest.hp)) hurtest = o;
      }
      if (!hurtest) continue;
      hurtest.hp = Math.min(hurtest.max, hurtest.hp + d.heal * mul(run.mods, 'heal'));
      u.cd = 1 / stat.rate;
      emit(run, { type: 'heal', from: { x: u.x, y: u.y }, to: { x: hurtest.x, y: hurtest.y } });
      continue;
    }
    let target = null;
    let best = Infinity;
    for (const e of run.foes) {
      if (e.dead) continue;
      const p = foeXY(e);
      if (Math.hypot(p.x - u.x, p.y - u.y) > stat.range) continue;
      const far = lead(run, e);
      if (far < best) { best = far; target = e; }
    }
    if (!target) continue;
    u.cd = 1 / stat.rate;
    const spot = foeXY(target);
    hurt(run, target, stat.damage, d.kind === 'pierce');
    if (d.kind === 'splash') {
      const r = d.splash * mul(run.mods, 'splash');
      for (const e of run.foes) {
        if (e === target || e.dead) continue;
        const p = foeXY(e);
        if (Math.hypot(p.x - spot.x, p.y - spot.y) <= r) hurt(run, e, stat.damage * 0.6, false);
      }
    }
    if (d.kind === 'slow') {
      target.slowT = d.slowFor;
      target.slowBy = d.slow * mul(run.mods, 'slow');
    }
    emit(run, { type: 'shot', key: u.key, from: { x: u.x, y: u.y }, to: spot });
  }
}

function tickFoes(run) {
  for (const e of run.foes) {
    if (e.dead) continue;
    const f = D.FOES[e.key];
    if (e.slowT > 0) e.slowT -= TICK;

    if (f.heal) {
      e.healCd = (e.healCd || 0) - TICK;
      if (e.healCd <= 0) {
        e.healCd = 1;
        const me = foeXY(e);
        for (const o of run.foes) {
          if (o === e || o.dead || o.hp >= o.max) continue;
          const p = foeXY(o);
          if (Math.hypot(p.x - me.x, p.y - me.y) > f.healRange) continue;
          o.hp = Math.min(o.max, o.hp + f.heal * (o.max / 100 + 1));
        }
      }
    }

    if (!e.to) {
      const nxt = P.step(run.map, fieldFor(run, e.key), e.from.x, e.from.y);
      if (!nxt) {
        // 갈 곳이 없다. 벽으로 끊긴 판이 아니면 일어나지 않는다.
        e.dead = true;
        continue;
      }
      e.to = nxt;
      e.p = 0;
    }

    const block = run.cells[at(run.map, e.to.x, e.to.y)];
    if (block) {
      // 앞을 막고 선 이를 부순다. 부수는 동안 서 있으므로 다른 자리에서 때린다 —
      // 막는 쪽이 시간을 벌되 사람을 갈아 넣는 교환이 여기서 생긴다.
      block.hp -= f.siege * TICK;
      emit(run, { type: 'bite', x: block.x, y: block.y });
      if (block.hp <= 0) {
        run.units.splice(run.units.indexOf(block), 1);
        run.cells[at(run.map, block.x, block.y)] = null;
        clearFields(run);
        emit(run, { type: 'down', key: block.key, x: block.x, y: block.y });
      }
      continue;
    }

    const speed = f.speed * (e.slowT > 0 ? e.slowBy : 1);
    e.p += speed * TICK;
    while (e.p >= 1) {
      e.p -= 1;
      e.from = e.to;
      if (e.from.x === run.map.exit.x && e.from.y === run.map.exit.y) {
        e.dead = true;
        e.leaked = true;
        break;
      }
      e.to = P.step(run.map, fieldFor(run, e.key), e.from.x, e.from.y);
      if (!e.to) { e.p = 0; break; }
      if (run.cells[at(run.map, e.to.x, e.to.y)]) { e.p = 0; break; }
    }
  }
}

function sweep(run) {
  const left = [];
  for (const e of run.foes) {
    if (!e.dead) { left.push(e); continue; }
    if (e.leaked) {
      const lost = e.key === 'boss' ? 3 : 1;
      run.lives -= lost;
      run.stats.livesLost += lost;
      emit(run, { type: 'leak', key: e.key, lost });
    }
  }
  run.foes = left;
}

function tickOnce(run) {
  run.time += TICK;

  if (run.wave < run.waves.length && !run.pending.length && !run.foes.length) {
    run.timer -= TICK;
    if (run.timer <= 0) startWave(run);
  }
  while (run.pending.length && run.pending[0].at <= run.time) {
    const p = run.pending.shift();
    spawn(run, p.foe, p.hp);
  }

  tickUnits(run);
  tickFoes(run);
  sweep(run);

  if (!run.pending.length && !run.foes.length && run.wave > 0 && run.wave <= run.waves.length) {
    const wave = run.waves[run.wave - 1];
    if (!wave.paid) {
      wave.paid = true;
      run.gold += Math.round(wave.reward * mul(run.mods, 'gold'));
      run.timer = D.RUN.gap;
      emit(run, { type: 'cleared', index: run.wave });
    }
  }

  if (run.lives <= 0 && !run.over) finish(run, 'lost');
  else if (!run.over && run.wave >= run.waves.length && !run.pending.length && !run.foes.length) {
    finish(run, 'won');
  }
}

function finish(run, how) {
  run.over = how;
  run.stats.time = run.time;
  run.stats.goldLeft = run.gold;
  emit(run, { type: 'over', how });
}

// 화면이 부르는 자리. 밀린 시간은 버린다.
function step(run, dt) {
  if (run.over) return drain(run);
  run.carry += Math.min(MAX_DT, Math.max(0, dt));
  let guard = 0;
  while (run.carry >= TICK && !run.over && guard++ < 60) {
    run.carry -= TICK;
    tickOnce(run);
  }
  return drain(run);
}

// 판을 끝까지 밀어 본다. 자동 플레이와 테스트가 쓴다.
function run(state, seconds) {
  const limit = seconds || 600;
  while (!state.over && state.time < limit) tickOnce(state);
  return state;
}

const Rules = {
  TICK, statOf, upCost, createRun, canPlace, place, sell, upgrade,
  step, run, foeXY, occupied, fieldFor, lead, drain, spawn, startWave,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.DefenseRules = Rules;

})();

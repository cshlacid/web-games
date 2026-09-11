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

// 사거리는 안쪽과 바깥쪽 둘이다. **단계를 올려도 안쪽 한계는 그대로 둔다** —
// 포수가 코앞을 못 치는 것은 성능이 아니라 성격이다.
function statOf(key, tier, mods) {
  const d = D.UNITS[key];
  const own = (mods.unit && mods.unit[key]) || {};
  const step = tier - 1;
  return {
    damage: d.damage * Math.pow(D.UP.damage, step) * (own.damage == null ? 1 : own.damage) * mul(mods, 'damage'),
    hp: Math.round(d.hp * Math.pow(D.UP.hp, step) * (own.hp == null ? 1 : own.hp)),
    // 칸의 고리로 읽는다. 1-4는 "붙어 있는 칸부터 네 칸까지"이므로 안쪽은
    // min - 0.5, 바깥쪽은 max + 0.5다. 대각선 이웃(1.41칸)도 한 칸으로 친다.
    near: Math.max(0, d.range.min - 0.5),
    far: d.range.max + 0.5 + D.UP.range * step + (mods.range || 0),
    rate: d.rate,
    // 기본 공격은 대개 한 놈이지만, 자료에 적어 두면 범위로도 나간다.
    basic: d.basic || SINGLE,
    // 스킬은 단계에 따라 리듬이 바뀌므로 그때그때 만들어 준다. 원본을 건드리면
    // 판마다 값이 누적된다.
    skill: skillAt(d.skill, step),
  };
}

function skillAt(sk, step) {
  if (!step) return sk;
  const cd = Math.pow(D.UP.cd, step);
  const hold = Math.pow(D.UP.hold, step);
  const got = { ...sk, cd: sk.cd * cd };
  if (sk.fieldFor) got.fieldFor = sk.fieldFor * hold;
  if (sk.bleedFor) got.bleedFor = sk.bleedFor * hold;
  if (sk.stunFor) got.stunFor = sk.stunFor * hold;
  return got;
}

const SINGLE = { shape: 'single' };

const inRange = (stat, dist) => dist <= stat.far && dist >= stat.near;

const upCost = (key, tier) => Math.round(D.UNITS[key].cost * D.UP.cost[tier - 1]);

// 지금 이 종류를 하나 더 세우는 값. 이미 선 수만큼 오른다.
const standing = (run, key) => run.units.reduce((n, u) => n + (u.key === key ? 1 : 0), 0);

function costOf(run, key) {
  return Math.round(D.UNITS[key].cost * Math.pow(D.RAISE, standing(run, key)));
}

// 캐릭터 종류마다 한 줄씩. 판이 끝난 뒤 "누가 얼마나 했는가"를 여기서 읽는다.
function tally(run, key) {
  let row = run.tally[key];
  if (!row) {
    row = { dealt: 0, kills: 0, skills: 0, healed: 0, taken: 0, hired: 0, spent: 0 };
    run.tally[key] = row;
  }
  return row;
}

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
    zones: [],
    tally: {},
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
      kinds: {}, placed: 0, heroUsed: false, bossFrom: null, bossAt: null, time: 0, goldLeft: 0,
      items: 0, skills: 0,
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
  if (standing(run, key) >= D.MOST_OF_KIND) return `${D.UNITS[key].name}는 ${D.MOST_OF_KIND}명까지`;
  if (run.gold < costOf(run, key)) return '골드가 모자라다';
  return null;
}

function place(run, key, x, y) {
  if (canPlace(run, key, x, y)) return null;
  const cost = costOf(run, key);
  const stat = statOf(key, 1, run.mods);
  // 치른 값을 들고 있는다 — 해고할 때 돌려주는 몫이 그때 값이라야 앞뒤가 맞는다.
  const unit = { id: run.seq++, key, x, y, tier: 1, hp: stat.hp, max: stat.hp, cd: 0, scd: 0, paid: cost };
  run.units.push(unit);
  run.cells[at(run.map, x, y)] = unit;
  run.gold -= cost;
  run.stats.goldSpent += cost;
  run.stats.placed++;
  run.stats.kinds[key] = (run.stats.kinds[key] || 0) + 1;
  const row = tally(run, key);
  row.hired++;
  row.spent += cost;
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
  run.gold += Math.round((u.paid || D.UNITS[u.key].cost) * D.RUN.refund);
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
  tally(run, u.key).spent += cost;
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
    from, to: null, p: 0, slowT: 0, slowBy: 1, stunT: 0, bleed: null,
  };
  run.foes.push(foe);
  // 참수 목표가 재는 것은 우두머리가 나온 뒤의 시간이다.
  if (foeKey === 'boss' && run.stats.bossFrom == null) run.stats.bossFrom = run.time;
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

// `kind`가 `single`이면 그 적의 `resist`만큼 깎여 들어간다. 범위·관통·지속은
// 그대로다 — 조합을 요구하는 규칙이 이 한 줄에 있다.
//
// **지속 피해에는 최소 1이 붙지 않는다.** 최소값을 걸어 두면 틱마다 1이 들어가
// 바닥 얼음이 초당 서른을 깎았다.
function hurt(run, e, amount, kind, by) {
  const f = D.FOES[e.key];
  const cut = kind === D.HIT.single ? (f.resist || 0) : 0;
  const dealt = kind === D.HIT.dot
    ? Math.max(0, amount)
    : Math.max(1, amount * (1 - cut));
  const before = e.hp;
  e.hp -= dealt;
  // **넘치는 몫은 세지 않는다.** 안 그러면 마지막 한 방이 판 전체의 피해를
  // 가져가 리포트가 누가 일했는지가 아니라 누가 막타를 쳤는지를 말하게 된다.
  if (by) tally(run, by).dealt += Math.min(dealt, Math.max(0, before));
  if (e.hp <= 0) {
    e.dead = true;
    if (by) tally(run, by).kills++;
    run.gold += Math.round(f.bounty * mul(run.mods, 'gold'));
    if (e.key === 'boss' && run.stats.bossAt == null) run.stats.bossAt = run.time;
    emit(run, { type: 'kill', key: e.key, ...foeXY(e) });
  }
}

// 점과 선분 사이의 거리. 창이 한 줄로 꿰뚫는 판정에 쓴다.
function toLine(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len)) : 0;
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

// 바닥에 깔리는 얼음. 새로 깔지 않고 가까운 것을 되살린다 — 매 발마다 쌓으면
// 같은 자리에 수십 개가 겹쳐 초당 피해가 터진다.
function dropZone(run, x, y, skill, by, dps) {
  const near = run.zones.find((z) => Math.hypot(z.x - x, z.y - y) < 0.7);
  if (near) { near.t = skill.fieldFor; near.dps = dps; return near; }
  const zone = { x, y, r: skill.fieldR, dps, slow: skill.slow, t: skill.fieldFor, by };
  run.zones.push(zone);
  if (run.zones.length > 12) run.zones.shift();
  emit(run, { type: 'zone', x, y, r: zone.r });
  return zone;
}

function tickZones(run) {
  if (!run.zones.length) return;
  for (const z of run.zones) {
    z.t -= TICK;
    for (const e of run.foes) {
      if (e.dead) continue;
      const p = foeXY(e);
      if (Math.hypot(p.x - z.x, p.y - z.y) > z.r) continue;
      hurt(run, e, z.dps * TICK, D.HIT.dot, z.by);
      // 밟고 있는 동안만 느려진다. 나가면 곧 풀린다.
      e.slowT = 0.25;
      e.slowBy = z.slow;
    }
  }
  run.zones = run.zones.filter((z) => z.t > 0);
}

// 스킬 한 번. 기본 공격을 대신해 나가고, 모양마다 닿는 곳이 다르다.
function useSkill(run, u, stat, target, spot) {
  const sk = stat.skill;
  const power = stat.damage * (sk.mul == null ? 1 : sk.mul);
  // 지속 피해는 그 사람의 공격력에 대한 비율이다. 고정값으로 두면 레벨이 올라도
  // 그대로라, 방어를 무시하는 수단이 후반에 의미를 잃는다.
  const dot = sk.bleedDps ? { dps: stat.damage * sk.bleedDps, t: sk.bleedFor, by: u.key } : null;
  hurt(run, target, power, sk.shape === 'single' ? D.HIT.single : D.HIT.area, u.key);
  if (sk.stunFor) target.stunT = sk.stunFor;
  if (dot) target.bleed = { ...dot };

  if (sk.shape === 'ring') {
    // 목표가 아니라 **자기를 가운데로** 삼는다. 길목에 세워 두면 지나가는 것이
    // 전부 맞는다.
    for (const e of run.foes) {
      if (e === target || e.dead) continue;
      const p = foeXY(e);
      if (Math.hypot(p.x - u.x, p.y - u.y) > sk.ring) continue;
      hurt(run, e, power, D.HIT.area, u.key);
      if (dot) e.bleed = { ...dot };
    }
  } else if (sk.shape === 'line') {
    // 나와 목표를 잇는 줄 위의 것은 모두 맞는다.
    for (const e of run.foes) {
      if (e === target || e.dead) continue;
      const p = foeXY(e);
      if (toLine(p.x, p.y, u.x, u.y, spot.x, spot.y) > 0.55) continue;
      if (Math.hypot(p.x - u.x, p.y - u.y) > stat.far) continue;
      hurt(run, e, power, D.HIT.area, u.key);
      if (dot) e.bleed = { ...dot };
    }
  } else if (sk.shape === 'splash') {
    const r = sk.splash * mul(run.mods, 'splash');
    for (const e of run.foes) {
      if (e === target || e.dead) continue;
      const p = foeXY(e);
      if (Math.hypot(p.x - spot.x, p.y - spot.y) <= r) hurt(run, e, power * 0.6, D.HIT.area, u.key);
    }
  } else if (sk.shape === 'field') {
    dropZone(run, spot.x, spot.y, sk, u.key, stat.damage * sk.fieldDps);
  }
}

// 사거리 안에서 가장 많이 깎인 아군. 힐러의 스킬이 향하는 곳이다.
function hurtAlly(run, u, stat) {
  let worst = null;
  for (const o of run.units) {
    if (o === u || o.hp >= o.max) continue;
    if (!inRange(stat, Math.hypot(o.x - u.x, o.y - u.y))) continue;
    if (!worst || (o.max - o.hp) > (worst.max - worst.hp)) worst = o;
  }
  return worst;
}

function tickUnits(run) {
  for (const u of run.units) {
    u.cd -= TICK;
    u.scd -= TICK;
    if (u.cd > 0) continue;
    const stat = statOf(u.key, u.tier, run.mods);
    const sk = stat.skill;
    const ready = u.scd <= 0;

    // 힐러의 스킬만 아군을 향한다. **되살릴 이가 없으면 쿨타임을 쓰지 않고
    // 기본 공격으로 넘어간다** — 멀쩡한 판에서 치유가 헛돌면 힐러는 그 판 내내
    // 아무것도 하지 않는다.
    if (ready && sk.shape === 'heal') {
      const worst = hurtAlly(run, u, stat);
      if (worst) {
        // `all`이면 사거리 안의 다친 아군을 한꺼번에 되살린다.
        const crowd = sk.all
          ? run.units.filter((o) => o !== u && o.hp < o.max
            && inRange(stat, Math.hypot(o.x - u.x, o.y - u.y)))
          : [worst];
        let back = 0;
        for (const o of crowd) {
          const was = o.hp;
          o.hp = Math.min(o.max, o.hp + sk.heal * mul(run.mods, 'heal'));
          back += o.hp - was;
          emit(run, { type: 'heal', from: { x: u.x, y: u.y }, to: { x: o.x, y: o.y } });
        }
        u.cd = 1 / stat.rate;
        u.scd = sk.cd;
        run.stats.skills++;
        const row = tally(run, u.key);
        row.skills++;
        row.healed += back;
        continue;
      }
    }

    // 앞선 놈부터 친다. 새는 것을 막는 것이 목적이라 출구에 가까운 쪽이 먼저다.
    let target = null;
    let best = Infinity;
    for (const e of run.foes) {
      if (e.dead) continue;
      const p = foeXY(e);
      if (!inRange(stat, Math.hypot(p.x - u.x, p.y - u.y))) continue;
      const far = lead(run, e);
      if (far < best) { best = far; target = e; }
    }
    if (!target) continue;

    u.cd = 1 / stat.rate;
    const spot = foeXY(target);

    if (ready && sk.shape !== 'heal') {
      u.scd = sk.cd;
      run.stats.skills++;
      tally(run, u.key).skills++;
      useSkill(run, u, stat, target, spot);
      emit(run, { type: 'skill', key: u.key, from: { x: u.x, y: u.y }, to: spot });
    } else if (stat.basic.shape === 'splash') {
      // 기본 공격부터 범위인 자리. 범위는 한 놈씩 때리는 것이 아니라 `area`로
      // 들어가 중장병의 저항을 타지 않는다.
      hurt(run, target, stat.damage, D.HIT.area, u.key);
      const r = stat.basic.splash * mul(run.mods, 'splash');
      for (const e of run.foes) {
        if (e === target || e.dead) continue;
        const p = foeXY(e);
        if (Math.hypot(p.x - spot.x, p.y - spot.y) <= r) hurt(run, e, stat.damage * 0.6, D.HIT.area, u.key);
      }
      emit(run, { type: 'shot', key: u.key, from: { x: u.x, y: u.y }, to: spot });
    } else {
      // 쿨타임 중에는 기본 공격. 한 놈만 때린다.
      hurt(run, target, stat.damage, D.HIT.single, u.key);
      emit(run, { type: 'shot', key: u.key, from: { x: u.x, y: u.y }, to: spot });
    }
  }
}

function tickFoes(run) {
  for (const e of run.foes) {
    if (e.dead) continue;
    const f = D.FOES[e.key];
    if (e.slowT > 0) e.slowT -= TICK;
    if (e.bleed) {
      e.bleed.t -= TICK;
      hurt(run, e, e.bleed.dps * TICK, D.HIT.dot, e.bleed.by);
      if (e.bleed.t <= 0) e.bleed = null;
      if (e.dead) continue;
    }
    // 기절한 동안은 걷지도 부수지도 않는다. 방패병이 시간을 버는 자리다.
    if (e.stunT > 0) { e.stunT -= TICK; continue; }

    if (f.heal) {
      e.healCd = (e.healCd || 0) - TICK;
      if (e.healCd <= 0) {
        e.healCd = 1;
        const me = foeXY(e);
        for (const o of run.foes) {
          if (o === e || o.dead || o.hp >= o.max) continue;
          const p = foeXY(o);
          if (Math.hypot(p.x - me.x, p.y - me.y) > f.healRange) continue;
          o.hp = Math.min(o.max, o.hp + f.heal * o.max);
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
      // 몸으로 받아 낸 피해. 방패병이 한 일이 여기에만 남는다.
      const bite = Math.min(block.hp, f.siege * TICK);
      block.hp -= f.siege * TICK;
      tally(run, block.key).taken += bite;
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
  tickZones(run);
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

// 1회용 아이템. 벽에 부딪힌 스테이지를 넘는 수단이라, 막혔을 때 할 일이 파밍이
// 아니라 판단이 된다. 아이템을 가지고 있는지는 meta.js가 세고 여기서는 효과만 낸다.
const ITEMS = {
  bomb: { name: '폭탄', note: '모든 적의 체력을 35% 깎는다' },
  freeze: { name: '얼림', note: '3초 동안 모두 멈춘다' },
  purse: { name: '보급', note: '골드 120' },
  mend: { name: '구호', note: '목숨 하나를 되돌린다' },
  order: { name: '명령서', note: '한 사람을 빈 칸으로 옮긴다' },
};

function useItem(run, id, target) {
  if (run.over || !ITEMS[id]) return false;
  if (id === 'bomb') {
    if (!run.foes.length) return false;
    for (const e of run.foes) if (!e.dead) hurt(run, e, e.max * 0.35, D.HIT.dot);
    sweep(run);
  } else if (id === 'freeze') {
    if (!run.foes.length) return false;
    for (const e of run.foes) { e.slowT = 3; e.slowBy = 0; }
  } else if (id === 'purse') {
    run.gold += 120;
  } else if (id === 'mend') {
    run.lives += 1;
  } else if (id === 'order') {
    // 옮기는 것도 세우는 것과 같은 자리 규칙을 탄다 — 적이 밟은 칸은 안 된다.
    const u = target && run.units.find((e) => e.id === target.id);
    if (!u) return false;
    const c = at(run.map, target.x, target.y);
    if (run.map.walls[c] || run.cells[c] || occupied(run, target.x, target.y)) return false;
    run.cells[at(run.map, u.x, u.y)] = null;
    u.x = target.x;
    u.y = target.y;
    run.cells[c] = u;
    // 옮긴 직후에는 잠깐 싸우지 못한다. 아니면 위험할 때마다 옮겨 붙이는 것이
    // 늘 최선이 된다.
    u.cd = 1.2;
    clearFields(run);
  }
  run.stats.items++;
  emit(run, { type: 'item', id });
  return true;
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
  TICK, ITEMS, statOf, upCost, createRun, canPlace, place, sell, upgrade, useItem,
  step, run, foeXY, occupied, fieldFor, lead, drain, spawn, startWave, inRange, toLine, tally, costOf, standing,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.DefenseRules = Rules;

})();

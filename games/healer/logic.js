'use strict';

// 전투 규칙. DOM을 만지지 않으므로 node로 그대로 돌려 볼 수 있다.
//
// 다른 게임의 로직과 달리 상태를 새로 만들지 않고 제자리에서 고친다. 실시간
// 전투라 초당 30번 돌고, 그때마다 유닛·장판·도트를 통째로 복사하면 얻는 것 없이
// 쓰레기만 만든다. 대신 난수를 씨앗으로 고정해 두어 재현성은 지켰다 — 같은 씨앗과
// 같은 조작이면 같은 전투가 나오고, 테스트가 그것에 기댄다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;
const AI = node ? require('./ai.js') : root.HealerAI;

const dist = AI.dist;
const alive = AI.alive;
const byUid = AI.byUid;

const HERO_UID = 'hero';
const TICK = 1 / 30;          // 시뮬레이션 한 걸음
const WAVE_GAP = 2.5;         // 웨이브 사이 간격(초)
const EVENT_CAP = 400;        // 화면이 안 가져가도 무한히 쌓이지 않게

function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emit(state, event) {
  state.events.push(event);
  if (state.events.length > EVENT_CAP) state.events.splice(0, state.events.length - EVENT_CAP);
}

function drainEvents(state) {
  const events = state.events;
  state.events = [];
  return events;
}

// --- 유닛 만들기 -------------------------------------------------------

function makeUnit(def, side, uid, x, y) {
  return {
    uid, defId: def.id, name: def.name, job: def.job, sprite: def.sprite, side,
    x, y,
    hp: def.hp, maxHp: def.hp,
    mp: def.mp, maxMp: def.mp,
    atk: def.atk, armor: def.armor, range: def.range, speed: def.speed,
    attackCd: def.attackCd, nextAttackAt: 0,
    threatMul: def.threatMul,
    skills: (def.skills || []).map((id) => ({ id, readyAt: 0 })),
    targetUid: null, tauntUid: null, tauntUntil: 0,
    dead: false,
  };
}

// 아군 배치. 직업에 따라 앞뒤를 나눠 세운다 — 다들 같은 자리에서 출발하면
// 첫 몇 초 동안 힐러가 최전선에 서 있게 된다.
const ALLY_LANE = { tank: 32, dealer: 22, healer: 12 };

function placeAllies(state, defs) {
  const rows = defs.length;
  defs.forEach((def, i) => {
    const x = def.id === D.HERO.id ? 7 : ALLY_LANE[def.job];
    const y = rows === 1 ? D.FIELD.h / 2 : 10 + (i * (D.FIELD.h - 20)) / (rows - 1);
    state.units.push(makeUnit(def, 'ally', def.id === D.HERO.id ? HERO_UID : `a${i}`, x, y));
  });
}

function spawnWave(state, index) {
  const wave = state.quest.waves[index];
  state.waveIndex = index;
  wave.forEach((defId, i) => {
    const def = D.ENEMIES[defId];
    const x = D.FIELD.w - 10 - (i % 2) * 9;
    const y = wave.length === 1
      ? D.FIELD.h / 2
      : 10 + (i * (D.FIELD.h - 20)) / (wave.length - 1);
    const unit = makeUnit(def, 'enemy', `e${index}_${i}`, x, y);
    state.units.push(unit);
    state.threat[unit.uid] = {};
  });
  emit(state, { type: 'wave', index, total: state.quest.waves.length,
    text: `${index + 1}번째 무리 (${state.quest.waves.length} 중)` });
}

function createBattle(config) {
  const quest = typeof config.quest === 'string'
    ? D.QUESTS.find((q) => q.id === config.quest)
    : config.quest;
  const party = (config.party || []).map((id) => D.COMPANIONS[id]).filter(Boolean);
  const skills = (config.skills || []).filter((id) => D.PLAYER_SKILLS[id]).slice(0, D.SKILL_MAX);

  const state = {
    quest, rng: createRng(config.seed == null ? 1 : config.seed),
    t: 0, waveIndex: -1, nextWaveAt: 0,
    units: [], zones: [], dots: [], threat: {},
    skills: skills.map((id) => ({ id, readyAt: 0 })),
    potions: D.POTION.count, potionReadyAt: 0,
    status: 'fighting', events: [], nextZoneId: 1,
    stats: { healed: 0, overheal: 0, damage: 0, casts: 0, deaths: 0 },
  };

  placeAllies(state, [D.HERO, ...party.slice(0, D.PARTY_MAX - 1)]);
  spawnWave(state, 0);
  return state;
}

const hero = (state) => byUid(state, HERO_UID);

// --- 피해와 회복 -------------------------------------------------------

function addThreat(state, source, target, amount) {
  if (!source || target.side !== 'enemy') return;
  const table = state.threat[target.uid] || (state.threat[target.uid] = {});
  table[source.uid] = (table[source.uid] || 0) + amount * source.threatMul;
}

function applyDamage(state, source, target, raw) {
  if (target.dead) return 0;
  const amount = Math.max(1, Math.round(raw * target.armor));
  target.hp = Math.max(0, target.hp - amount);
  addThreat(state, source, target, amount);
  state.stats.damage += source && source.side === 'ally' ? amount : 0;
  emit(state, { type: 'damage', uid: target.uid, amount });
  if (target.hp === 0) kill(state, target);
  return amount;
}

function applyHeal(state, source, target, raw) {
  if (target.dead) return 0;
  const amount = Math.min(raw, target.maxHp - target.hp);
  target.hp += amount;
  if (source && source.uid === HERO_UID) {
    state.stats.healed += amount;
    state.stats.overheal += raw - amount;
  }
  emit(state, { type: 'heal', uid: target.uid, amount, over: raw - amount });
  return amount;
}

function kill(state, unit) {
  unit.dead = true;
  state.stats.deaths += unit.side === 'ally' ? 1 : 0;
  // 죽은 유닛에게 걸린 장판·도트는 남겨 두면 부활 없는 이 게임에서 영원히 헛돈다.
  state.dots = state.dots.filter((dot) => dot.targetUid !== unit.uid);
  emit(state, { type: 'death', uid: unit.uid, side: unit.side, text: `${unit.name} 쓰러짐` });
}

// 같은 스킬을 다시 걸면 쌓지 않고 새로 고친다. 쌓기로 하면 도트 하나로
// 무한히 강해지는데, 기획서에 중첩 규칙이 없으므로 약한 쪽을 택했다.
function addDot(state, source, target, def, kind) {
  const key = `${def.id}:${target.uid}`;
  const existing = state.dots.find((dot) => dot.key === key);
  const dot = existing || { key, targetUid: target.uid };
  dot.sourceUid = source ? source.uid : null;
  dot.kind = kind;
  dot.amount = def.tick;
  dot.interval = def.interval;
  dot.endsAt = state.t + def.duration;
  dot.nextAt = state.t + def.interval;
  if (!existing) state.dots.push(dot);
}

function addZone(state, source, def, x, y, kind) {
  state.zones.push({
    id: state.nextZoneId++, sourceUid: source ? source.uid : null, kind,
    x, y, radius: def.radius, amount: def.tick, interval: def.interval,
    endsAt: state.t + def.duration, nextAt: state.t + def.interval,
    bornAt: state.t, skillId: def.id,
  });
}

function updateDots(state) {
  for (const dot of state.dots) {
    const target = byUid(state, dot.targetUid);
    if (!target || target.dead) continue;
    while (dot.nextAt <= state.t && dot.nextAt <= dot.endsAt + 1e-6) {
      const source = dot.sourceUid ? byUid(state, dot.sourceUid) : null;
      if (dot.kind === 'heal') applyHeal(state, source, target, dot.amount);
      else applyDamage(state, source, target, dot.amount);
      dot.nextAt += dot.interval;
    }
  }
  state.dots = state.dots.filter((dot) => dot.nextAt <= dot.endsAt + 1e-6);
}

function updateZones(state) {
  for (const zone of state.zones) {
    while (zone.nextAt <= state.t && zone.nextAt <= zone.endsAt + 1e-6) {
      const side = zone.kind === 'heal' ? 'ally' : 'enemy';
      const source = zone.sourceUid ? byUid(state, zone.sourceUid) : null;
      for (const unit of alive(state, side)) {
        if (dist(unit, zone) > zone.radius) continue;
        if (zone.kind === 'heal') applyHeal(state, source, unit, zone.amount);
        else applyDamage(state, source, unit, zone.amount);
      }
      zone.nextAt += zone.interval;
    }
  }
  state.zones = state.zones.filter((zone) => zone.nextAt <= zone.endsAt + 1e-6);
}

// --- 동료·적 행동 실행 -------------------------------------------------

function runUnitSkill(state, unit, choice) {
  const def = D.UNIT_SKILLS[choice.id];
  const slot = unit.skills.find((s) => s.id === choice.id);
  const target = byUid(state, choice.targetUid);
  if (!def || !slot || !target || target.dead) return;

  slot.readyAt = state.t + def.cd;
  unit.mp -= def.mp;
  emit(state, { type: 'cast', uid: unit.uid, name: def.name,
    text: `${unit.name}: ${def.name}` });

  if (def.kind === 'taunt') {
    target.tauntUid = unit.uid;
    target.tauntUntil = state.t + def.duration;
    target.targetUid = unit.uid;
    // 도발이 풀린 뒤에도 곧바로 다시 놓치지 않도록 위협도 자체를 올려 둔다.
    const table = state.threat[target.uid] || (state.threat[target.uid] = {});
    const top = Math.max(0, ...Object.values(table));
    table[unit.uid] = top + 400;
    return;
  }
  if (def.kind === 'heal') { applyHeal(state, unit, target, def.heal); return; }
  if (def.kind === 'dot') { addDot(state, unit, target, def, 'damage'); return; }
  if (def.kind === 'damage') { applyDamage(state, unit, target, unit.atk * def.mul); return; }
  if (def.kind === 'damage-area') {
    for (const foe of alive(state, AI.opposite(unit.side))) {
      if (dist(foe, target) <= def.radius) applyDamage(state, unit, foe, unit.atk * def.mul);
    }
  }
}

function moveToward(unit, point, dt) {
  const dx = point.x - unit.x;
  const dy = point.y - unit.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.4) return;
  const step = Math.min(d, unit.speed * dt);
  unit.x += (dx / d) * step;
  unit.y += (dy / d) * step;
}

// 서로 겹쳐 서면 화면에서 유닛을 구분할 수 없고, 장판을 어디에 깔지 고르는
// 의미도 사라진다. 매 틱 조금씩 밀어내는 것으로 충분하다.
//
// **같은 편끼리만 밀어낸다.** 양쪽을 다 밀었더니 근접 사거리보다 밀어내는 거리가
// 넓어서, 붙으려는 근접 유닛과 밀어내는 힘이 매 틱 싸우며 사거리 밖에서 진동했다.
//
// **미는 방향은 세로로 기울인다.** 가로 거리가 곧 사거리라서 가로로 밀면 붙었다
// 떨어졌다를 반복한다. 세로로 밀면 사거리를 거의 건드리지 않으면서 대열이
// 화면 높이만큼 퍼진다 — 다 같은 줄에 서 있으면 범위 스킬을 어디에 쓰든 똑같아진다.
const SPACING = 10;
const PUSH_X = 0.3;

function separateSide(state, side) {
  const list = alive(state, side);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a.speed && !b.speed) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= SPACING || d === 0) continue;
      const push = (SPACING - d) / 2;
      // 정확히 겹쳐 있으면 방향이 없다. 세로로 갈라 놓아야 다음 틱에 방향이 생긴다.
      const ux = (dx / d) * PUSH_X;
      const uy = dy === 0 ? 1 : dy / d;
      if (a.speed) { a.x -= ux * push; a.y -= uy * push; }
      if (b.speed) { b.x += ux * push; b.y += uy * push; }
    }
  }
}

function separate(state) {
  separateSide(state, 'ally');
  separateSide(state, 'enemy');
  for (const unit of state.units) {
    if (unit.dead) continue;
    unit.x = Math.min(D.FIELD.w - 4, Math.max(4, unit.x));
    unit.y = Math.min(D.FIELD.h - 5, Math.max(5, unit.y));
  }
}

// --- 플레이어 조작 -----------------------------------------------------

function skillSlot(state, skillId) {
  return state.skills.find((s) => s.id === skillId) || null;
}

function resolveTarget(state, def, target) {
  if (def.targeting === 'self') return { unit: hero(state), x: hero(state).x, y: hero(state).y };

  if (target && target.uid) {
    const unit = byUid(state, target.uid);
    if (!unit || unit.dead) return null;
    const wantSide = def.targeting === 'enemy' || def.targeting === 'area-enemy' ? 'enemy' : 'ally';
    if (unit.side !== wantSide) return null;
    return { unit, x: unit.x, y: unit.y };
  }

  // 위치 지정은 범위·장판만 받는다. 개별 대상 스킬은 기준점이 아니라 대상이 필요하다.
  if (def.targeting === 'area-ally' || def.targeting === 'area-enemy') {
    if (typeof target?.x !== 'number' || typeof target?.y !== 'number') return null;
    return { unit: null, x: target.x, y: target.y };
  }
  return null;
}

function castSkill(state, skillId, target) {
  if (state.status !== 'fighting') return { ok: false, reason: '전투가 끝났다' };
  const def = D.PLAYER_SKILLS[skillId];
  const slot = skillSlot(state, skillId);
  if (!def || !slot) return { ok: false, reason: '등록되지 않은 스킬' };
  if (state.t < slot.readyAt) return { ok: false, reason: '쿨타임' };

  const caster = hero(state);
  if (caster.dead) return { ok: false, reason: '쓰러졌다' };
  if (caster.mp < def.mp) return { ok: false, reason: '마나 부족' };

  const spot = resolveTarget(state, def, target);
  if (!spot) return { ok: false, reason: '대상이 올바르지 않다' };

  slot.readyAt = state.t + def.cd;
  caster.mp -= def.mp;
  state.stats.casts++;
  emit(state, { type: 'cast', uid: caster.uid, skillId, name: def.name,
    x: spot.x, y: spot.y, radius: def.radius || 0, text: `${def.name}` });

  if (def.mana) caster.mp = Math.min(caster.maxMp, caster.mp + def.mana);
  else if (def.targeting === 'ally' && def.heal) applyHeal(state, caster, spot.unit, def.heal);
  else if (def.targeting === 'ally') addDot(state, caster, spot.unit, def, 'heal');
  else if (def.targeting === 'enemy') addDot(state, caster, spot.unit, def, 'damage');
  else if (def.targeting === 'area-ally' && def.heal) {
    for (const unit of alive(state, 'ally')) {
      if (dist(unit, spot) <= def.radius) applyHeal(state, caster, unit, def.heal);
    }
  } else if (def.targeting === 'area-ally') addZone(state, caster, def, spot.x, spot.y, 'heal');
  else if (def.targeting === 'area-enemy') addZone(state, caster, def, spot.x, spot.y, 'damage');

  return { ok: true };
}

function usePotion(state) {
  if (state.status !== 'fighting') return { ok: false, reason: '전투가 끝났다' };
  if (state.potions <= 0) return { ok: false, reason: '물약이 없다' };
  if (state.t < state.potionReadyAt) return { ok: false, reason: '쿨타임' };
  const caster = hero(state);
  if (caster.dead) return { ok: false, reason: '쓰러졌다' };

  state.potions--;
  state.potionReadyAt = state.t + D.POTION.cd;
  caster.mp = Math.min(caster.maxMp, caster.mp + D.POTION.mana);
  emit(state, { type: 'potion', uid: caster.uid, text: `${D.POTION.name}` });
  return { ok: true };
}

// --- 진행 --------------------------------------------------------------

function checkEnd(state) {
  if (hero(state).dead || !alive(state, 'ally').length) {
    state.status = 'lost';
    emit(state, { type: 'end', result: 'lost', text: '파티 전멸' });
    return;
  }
  if (alive(state, 'enemy').length) return;

  if (state.waveIndex + 1 < state.quest.waves.length) {
    if (!state.nextWaveAt) state.nextWaveAt = state.t + WAVE_GAP;
    else if (state.t >= state.nextWaveAt) {
      state.nextWaveAt = 0;
      spawnWave(state, state.waveIndex + 1);
    }
    return;
  }
  state.status = 'won';
  emit(state, { type: 'end', result: 'won', text: '퀘스트 완료' });
}

function step(state, dt) {
  state.t += dt;
  updateZones(state);
  updateDots(state);

  for (const unit of state.units) {
    if (unit.dead || unit.uid === HERO_UID) continue;
    const decision = AI.decide(unit, state);
    unit.targetUid = decision.targetUid;
    if (decision.skill) runUnitSkill(state, unit, decision.skill);
    else if (decision.move) moveToward(unit, decision.move, dt);

    if (decision.attack && state.t >= unit.nextAttackAt && isFinite(unit.attackCd)) {
      const target = byUid(state, decision.attack);
      if (target && !target.dead) {
        unit.nextAttackAt = state.t + unit.attackCd;
        // 피해에 ±10%를 준다. 같은 적을 같은 순서로 때려도 죽는 시점이 조금씩
        // 달라야 힐 타이밍이 외워지지 않는다.
        applyDamage(state, unit, target, unit.atk * (0.9 + state.rng() * 0.2));
      }
    }
  }

  separate(state);
  checkEnd(state);
}

// 화면은 프레임 간격이 들쭉날쭉하지만 전투는 일정한 간격으로 굴러야 한다.
// 남는 시간을 모아 두었다가 고정 간격으로만 진행한다.
function advance(state, elapsed) {
  if (state.status !== 'fighting') return;
  state.lag = (state.lag || 0) + Math.min(elapsed, 0.25);
  while (state.lag >= TICK && state.status === 'fighting') {
    state.lag -= TICK;
    step(state, TICK);
  }
}

const api = {
  HERO_UID, TICK, WAVE_GAP,
  createRng, createBattle, advance, step, drainEvents,
  castSkill, usePotion, applyDamage, applyHeal, addDot, addZone,
  hero, skillSlot, resolveTarget,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerLogic = api;

})(typeof window !== 'undefined' ? window : globalThis);

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
const WAVE_GAP = 3.2;         // 웨이브 사이 간격(초)
// 무리와 무리 사이에 배경이 흘러가는 속도(전장 격자/초). 그 사이 아군은 대열을
// 다시 짜고, 화면은 배경을 왼쪽으로 흘려 "걸어서 다음 무리를 만나러 간다"로 읽힌다.
const MARCH_SPEED = 26;
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

// 레벨은 수치를 곱하는 것으로만 표현한다. 레벨마다 다른 유닛을 적어 두면 자료가
// 레벨 수만큼 불어나고, 레벨 하나를 고칠 때마다 다른 레벨과 어긋난다.
// **수치는 능력치에서 나온다**(data.js의 attrsAt/derive). 레벨은 능력치를 올리고,
// 능력치가 체력·마나·공격력·회복량·회피를 만든다.
//
// override는 주인공처럼 능력치가 밖에서 정해지는 경우(나눠 준 점수까지 반영해
// progress.js가 계산한다), bonus는 장비 몫이다. 장비는 능력치가 아니라 결과
// 수치에 더한다 — 장비까지 레벨로 곱하면 높은 레벨에서 장비가 전부를 결정한다.
function makeUnit(def, side, uid, x, y, level, override, bonus, potions, name) {
  const attrs = (override && override.attrs) || D.attrsAt(def, level, null);
  const base = D.derive(def, attrs);
  // **주인공은 캐릭터 창이 계산해 둔 최종 수치를 그대로 받는다.** 여기서 다시
  // 계산하던 동안에는 창에 적힌 장비 몫이 전투에 들어가지 않아, 같은 캐릭터가
  // 두 화면에서 다른 체력을 가졌다. 동료와 적은 장비를 여기서 얹는다.
  const stats = override && override.hp != null
    ? override
    : D.withGear(base, bonus, def.armor);

  return {
    uid, defId: def.id, name: name || def.name, job: def.job, sprite: def.sprite, side, level,
    x, y, attrs,
    hp: stats.hp, maxHp: stats.hp,
    mp: stats.mp, maxMp: stats.mp,
    atk: stats.atk,
    // 레벨에 따른 공격력 배수. 도트와 장판의 초당 피해가 정액이라 이것을 곱해
    // 준다 — 곱하지 않으면 높은 레벨의 저주가 1레벨 저주와 같은 값을 넣는다.
    // 장비 몫을 빼고 능력치만 보는 것은, 무기가 저주의 초당 피해까지 올리면
    // 도트가 무기에 두 번 곱해지기 때문이다.
    power: base.atk / (def.atk || 1),
    armor: stats.armor,
    healPower: stats.heal,
    spellPower: stats.spell,
    // 회피·치명타는 능력치와 장비 옵션에서 온다. 상한은 D.withGear가 건다.
    dodge: stats.dodge,
    crit: stats.crit,
    critDamage: stats.critDamage,
    // 직업에 따라 자동으로 들고 들어간다. 마나를 다 쓴 사제가 남은 전투 내내
    // 서 있는 것을 막는 것이 이것의 목적이다.
    potions: Object.assign({}, potions),
    potionReadyAt: 0,
    range: def.range, speed: def.speed,
    attackCd: def.attackCd, nextAttackAt: 0,
    // 시전 중인 스킬. 서서 외우는 동안 여기 들어 있고, 움직이면 지워진다.
    cast: null,
    exp: Math.round((def.exp || 0) * (1 + 0.25 * (level - 1))),
    // 계열의 목록 중 레벨이 되는 것을 앞에서부터 넷. 편성 화면이 보여 준 것과
    // 전투에서 실제로 쓰는 것이 같아야 하므로 같은 함수를 쓴다.
    skills: D.skillsFor(def.spec, level).map((id) => ({ id, readyAt: 0 })),
    targetUid: null, tauntUid: null, tauntUntil: 0,
    // 전투가 끝난 뒤 캐릭터별로 무엇을 했는지 보여 주기 위한 집계. 이벤트를
    // 모아 두었다가 세지 않는 것은, 이벤트가 화면을 위해 지워지기 때문이다.
    tally: { dealt: 0, taken: 0, healed: 0, overheal: 0 },
    dead: false,
  };
}

// 아군 배치. 직업에 따라 앞뒤를 나눠 세운다 — 다들 같은 자리에서 출발하면
// 첫 몇 초 동안 힐러가 최전선에 서 있게 된다.
const ALLY_LANE = { tank: 32, dealer: 22, healer: 12 };

// 줄 세우기. 위아래로 FIELD.top~bottom 안에서만 세운다 — 그 밖은 유닛의 몸통이
// 화면을 벗어나는 자리다.
function laneY(index, count) {
  const top = D.FIELD.top;
  const span = D.FIELD.bottom - top;
  return count <= 1 ? top + span / 2 : top + (index * span) / (count - 1);
}

function placeAllies(state, members) {
  members.forEach((member, i) => {
    const def = member.def;
    const hero = def.id === D.HERO.id;
    const unit = makeUnit(def, 'ally', hero ? HERO_UID : `a${i}`,
      hero ? 7 : ALLY_LANE[def.job], laneY(i, members.length),
      member.level, member.stats, member.bonus, member.potions, member.name);
    // 웨이브 사이에 되돌아갈 자리. 다음 무리를 만나러 갈 때 대열을 다시 짠다.
    unit.homeX = unit.x;
    unit.homeY = unit.y;
    state.units.push(unit);
  });
}

function spawnWave(state, index) {
  const wave = state.quest.waves[index];
  state.waveIndex = index;
  wave.forEach((defId, i) => {
    const def = D.ENEMIES[defId];
    const x = D.FIELD.w - 10 - (i % 2) * 9;
    const y = laneY(i, wave.length);
    // 적도 직업에 따라 물약을 들고 온다. 아군만 마나를 되찾을 수 있으면
    // 뒤 웨이브의 주술사가 그냥 서 있는 상대가 된다.
    state.units.push(makeUnit(def, 'enemy', `e${index}_${i}`, x, y, state.quest.level || 1,
      null, null, D.JOB_POTIONS[def.job]));
  });
  emit(state, { type: 'wave', index, total: state.quest.waves.length,
    text: `${index + 1}번째 무리 (${state.quest.waves.length} 중)` });
}

// party는 편성 화면이 고른 동료다: [{ defId, level }]. 주인공의 수치는 성장
// 상태에서 계산해 넘어온다(progress.stats) — 전투가 레벨·장비 규칙을 다시 알
// 필요가 없고, 캐릭터 창에 적힌 수치가 곧 전투에서 쓰이는 수치가 된다.
function createBattle(config) {
  const quest = config.quest;
  const heroStats = config.heroStats
    || { attrs: D.attrsAt(D.HERO, config.heroLevel || 1, null), armor: D.HERO.armor };
  const party = (config.party || [])
    .map((entry) => ({
      def: D.COMPANIONS[entry.defId],
      level: entry.level || 1,
      bonus: entry.bonus,
      potions: entry.potions || D.JOB_POTIONS[(D.COMPANIONS[entry.defId] || {}).job],
      name: entry.name,
    }))
    .filter((entry) => entry.def);
  const skills = (config.skills || []).filter((id) => D.PLAYER_SKILLS[id]).slice(0, D.SKILL_MAX);
  // 스킬 레벨은 전투가 시작할 때 굳는다. 전투 중에 올릴 수 있는 것이 아니고,
  // 진행 상태를 전투가 들여다보지 않게 하려는 것이기도 하다.
  const levels = config.skillLevels || {};

  const state = {
    quest, rng: createRng(config.seed == null ? 1 : config.seed),
    t: 0, waveIndex: -1, nextWaveAt: 0,
    units: [], zones: [], dots: [],
    // 배경이 지금까지 흘러간 거리. 무리 사이에만 늘고, 화면이 이 값으로 배경을 민다.
    scroll: 0, marching: false,
    skills: skills.map((id) => ({ id, level: D.skillLevelOf(levels[id] || 1), readyAt: 0 })),
    // 주인공이 들고 온 물약. 상점에서 사서 채운 것이 그대로 들어온다.
    potions: Object.assign({ mana: 0, health: 0 }, config.potions),
    potionReadyAt: 0,
    status: 'fighting', events: [], nextZoneId: 1,
    stats: { healed: 0, overheal: 0, damage: 0, casts: 0, deaths: 0 },
  };

  placeAllies(state, [
    { def: D.HERO, level: config.heroLevel || 1, stats: heroStats },
    ...party.slice(0, D.PARTY_MAX - 1),
  ]);
  spawnWave(state, 0);
  return state;
}

const hero = (state) => byUid(state, HERO_UID);

// 마법 피해 배수. 회복량과 같은 지능에서 오지만 몫이 작다 — 힐러의 성장이
// 딜러 노릇을 잘하게 만드는 쪽으로 흐르면 이 게임이 아니게 된다.
const magicPowerOf = (unit) => unit.spellPower;

// --- 피해와 회복 -------------------------------------------------------

// 치명타. 확률은 때리는 쪽의 민첩이, 추가 피해는 그쪽의 힘이 정한다.
//
// **막는 쪽의 회피가 두 번 끼어든다**: 터진 치명타를 그냥 맞는 것으로 무르고
// (critAvoid), 그래도 터지면 추가 피해를 깎는다(critCut). 회피가 상한일 때
// 추가 피해가 절반이 되도록 잡았다.
//
// 회복에는 막는 쪽이 없다 — 아군에게 가는 것이라 피할 이유가 없다. 그때는
// defender 없이 부르면 시전자의 확률과 배수가 그대로 걸린다.
function rollCrit(state, source, defender) {
  if (!source || !(source.crit > 0)) return 1;

  let chance = source.crit;
  if (defender) chance *= Math.max(0, 1 - defender.dodge * D.ATTR.critAvoid);
  if (state.rng() >= chance) return 1;

  let bonus = source.critDamage - 1;
  if (defender) {
    const cut = Math.min(D.ATTR.critCut, (defender.dodge / D.ATTR.dodgeCap) * D.ATTR.critCut);
    bonus *= 1 - cut;
  }
  return 1 + bonus;
}

// 회피는 때리는 것에만 걸린다. 장판과 도트까지 피할 수 있으면 민첩 하나로
// 모든 것을 무르는 능력치가 되고, 어디에 장판을 깔지 고르는 뜻도 사라진다.
// 다만 **치명타는 무엇으로 맞든 회피가 끼어든다** — 그쪽은 피하는 것이 아니라
// 급소를 내주지 않는 것이라 장판이든 도트든 같이 걸린다.
function applyDamage(state, source, target, raw, dodgeable) {
  if (target.dead) return 0;

  if (dodgeable && target.dodge > 0 && state.rng() < target.dodge) {
    emit(state, { type: 'dodge', uid: target.uid });
    return 0;
  }

  const crit = rollCrit(state, source, target);
  const amount = Math.max(1, Math.round(raw * crit * target.armor));
  target.hp = Math.max(0, target.hp - amount);
  state.stats.damage += source && source.side === 'ally' ? amount : 0;
  if (source) source.tally.dealt += amount;
  target.tally.taken += amount;
  emit(state, { type: 'damage', uid: target.uid, amount, crit: crit > 1 });
  if (target.hp === 0) kill(state, target);
  return amount;
}

function applyHeal(state, source, target, raw) {
  if (target.dead) return 0;
  // 회복도 터진다. 다만 받는 쪽이 아군이라 회피가 끼어들지 않는다.
  const crit = rollCrit(state, source, null);
  const healed = Math.round(raw * crit);
  const amount = Math.min(healed, target.maxHp - target.hp);
  target.hp += amount;
  if (source && source.uid === HERO_UID) {
    state.stats.healed += amount;
    state.stats.overheal += healed - amount;
  }
  if (source) {
    source.tally.healed += amount;
    source.tally.overheal += healed - amount;
  }
  emit(state, { type: 'heal', uid: target.uid, amount, over: healed - amount, crit: crit > 1 });
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
function addDot(state, source, target, def, kind, amount) {
  const key = `${def.id}:${target.uid}`;
  const existing = state.dots.find((dot) => dot.key === key);
  const dot = existing || { key, targetUid: target.uid };
  dot.sourceUid = source ? source.uid : null;
  dot.kind = kind;
  dot.amount = amount == null ? def.tick : amount;
  dot.interval = def.interval;
  dot.endsAt = state.t + def.duration;
  dot.nextAt = state.t + def.interval;
  if (!existing) state.dots.push(dot);
}

// **누구에게 걸리는 장판인지를 여기서 정해 둔다.** 예전에는 회복이면 아군,
// 아니면 적이라고 봤는데, 그것은 장판을 까는 것이 주인공뿐이던 때의 이야기다.
// 적 궁수가 깐 독 구름은 아군에게 걸려야 한다.
function addZone(state, source, def, x, y, kind, amount) {
  const own = source ? source.side : 'ally';
  state.zones.push({
    id: state.nextZoneId++, sourceUid: source ? source.uid : null, kind,
    side: kind === 'heal' ? own : AI.opposite(own),
    x, y, radius: def.radius, amount: amount == null ? def.tick : amount,
    interval: def.interval,
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
      const source = zone.sourceUid ? byUid(state, zone.sourceUid) : null;
      for (const unit of alive(state, zone.side)) {
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

// 스킬이 실제로 터지는 자리. 쿨타임과 마나는 여기가 아니라 시전을 **시작할 때**
// 낸다(startCast) — 캐스팅이 취소되어도 자원이 돌아오지 않아야 캐스팅 스킬을
// 고르는 것이 판단이 된다.
function runUnitSkill(state, unit, choice) {
  const def = D.UNIT_SKILLS[choice.id];
  const target = byUid(state, choice.targetUid);
  if (!def || !target || target.dead) return;

  emit(state, { type: 'cast', uid: unit.uid, name: def.name,
    text: `${unit.name}: ${def.name}` });

  if (def.kind === 'taunt' || def.kind === 'taunt-area') {
    // 광역 도발은 반경 안의 적을 한꺼번에 끌어온다. 탱커 하나가 여러 적의
    // 어그로를 다 붙들지 못해 후방이 무너지던 것을 푸는 스킬이라, 대상 하나만
    // 다르고 나머지 처리는 같다.
    const pulled = def.kind === 'taunt-area'
      ? alive(state, AI.opposite(unit.side)).filter((foe) => dist(foe, unit) <= def.radius)
      : [target];
    for (const foe of pulled) {
      foe.tauntUid = unit.uid;
      foe.tauntUntil = state.t + def.duration;
      foe.targetUid = unit.uid;
    }
    return;
  }
  // 도트와 장판의 초당 피해는 정액이라 레벨 배수를 곱해 준다. 곱하지 않으면
  // 9레벨 저주가 1레벨 저주와 같은 값을 넣는다.
  const over = (base) => base * unit.power;

  if (def.kind === 'heal') { applyHeal(state, unit, target, def.heal); return; }
  if (def.kind === 'heal-dot') { addDot(state, unit, target, def, 'heal'); return; }
  if (def.kind === 'heal-area') {
    for (const mate of alive(state, unit.side)) {
      if (dist(mate, target) <= def.radius) applyHeal(state, unit, mate, def.heal);
    }
    return;
  }
  // 자기 마나를 되찾는다. 마나를 다 쓴 시전자가 남은 전투 내내 기본 공격만
  // 하는 것을 막는 것이 이 종류의 목적이다.
  if (def.kind === 'mana') { unit.mp = Math.min(unit.maxMp, unit.mp + def.mana); return; }
  if (def.kind === 'dot') { addDot(state, unit, target, def, 'damage', over(def.tick)); return; }
  if (def.kind === 'zone') {
    addZone(state, unit, def, target.x, target.y, 'damage', over(def.tick));
    return;
  }
  if (def.kind === 'damage') { applyDamage(state, unit, target, unit.atk * def.mul, true); return; }
  if (def.kind === 'damage-area') {
    for (const foe of alive(state, AI.opposite(unit.side))) {
      if (dist(foe, target) <= def.radius) applyDamage(state, unit, foe, unit.atk * def.mul);
    }
  }
}

// --- 시전 -------------------------------------------------------------

// 모든 스킬은 즉시 시전이거나 캐스팅이다(data.js의 cast). 캐스팅은 그 시간 동안
// 서서 외우고, 그 사이에 스스로 움직이면 취소된다.
//
// **자원은 시작할 때 낸다.** 끝날 때 내면 취소가 아무 손해도 아니게 되어,
// 캐스팅 스킬과 즉시 시전 스킬을 가르는 뜻이 사라진다.
function startCast(state, unit, choice) {
  const def = D.UNIT_SKILLS[choice.id];
  const slot = unit.skills.find((s) => s.id === choice.id);
  if (!def || !slot) return;

  slot.readyAt = state.t + def.cd;
  unit.mp -= def.mp;

  if (!def.cast) { runUnitSkill(state, unit, choice); return; }
  unit.cast = { skillId: def.id, name: def.name, targetUid: choice.targetUid,
    startedAt: state.t, endsAt: state.t + def.cast, player: false };
}

function cancelCast(state, unit) {
  if (!unit.cast) return;
  emit(state, { type: 'castCancel', uid: unit.uid, name: unit.cast.name });
  unit.cast = null;
}

// 시전 중인 유닛의 한 틱. 대상이 쓰러지면 거기서 끝난다 — 죽은 것을 계속
// 외우고 있으면 그 시간만큼 아무것도 안 한 것이 된다.
function tickCast(state, unit) {
  const cast = unit.cast;
  const target = cast.targetUid ? byUid(state, cast.targetUid) : null;
  if (cast.targetUid && (!target || target.dead)) { cancelCast(state, unit); return; }
  if (state.t < cast.endsAt) return;

  unit.cast = null;
  if (cast.player) resolvePlayerSkill(state, playerSkill(state, cast.skillId), cast);
  else runUnitSkill(state, unit, { id: cast.skillId, targetUid: cast.targetUid });
}

// **스스로 움직이면 시전이 취소된다.** 밀려나는 것(separate)은 여기를 거치지
// 않으므로 취소가 아니다 — 대열을 벌리는 힘까지 취소로 치면 캐스팅 스킬이 아예
// 나가지 않는다.
function moveToward(state, unit, point, dt) {
  const dx = point.x - unit.x;
  const dy = point.y - unit.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.4) return;
  cancelCast(state, unit);
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
    unit.y = Math.min(D.FIELD.bottom, Math.max(D.FIELD.top, unit.y));
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

// 시전이 끝났을 때(즉시 시전이면 곧바로) 실제로 터지는 자리.
//
// 대상은 여기서 다시 찾는다 — 캐스팅하는 동안 대상이 움직였을 수 있다. 장판은
// 고를 때 찍은 자리에 그대로 깔리고, 대상 지정 스킬은 그 사람을 따라간다.
function resolvePlayerSkill(state, def, spot) {
  const caster = hero(state);
  if (!def || !caster || caster.dead) return;

  const unit = spot.targetUid ? byUid(state, spot.targetUid) : null;
  if (spot.targetUid && (!unit || unit.dead)) return;
  const point = { x: unit ? unit.x : spot.x, y: unit ? unit.y : spot.y };

  emit(state, { type: 'cast', uid: caster.uid, skillId: def.id, name: def.name,
    x: point.x, y: point.y, radius: def.radius || 0, text: `${def.name}` });

  // 회복량은 회복력 배수를, 피해는 마법 공격력 배수를 탄다. 지능이 둘 다
  // 올리지만 계수가 달라서, 지능을 올린다고 딜러 노릇이 힐러 노릇을 앞지르지는
  // 않는다 — 회복 쪽 계수가 더 크다.
  const heal = (base) => Math.round(base * caster.healPower);
  const harm = (base) => Math.round(base * magicPowerOf(caster));

  if (def.mana) caster.mp = Math.min(caster.maxMp, caster.mp + def.mana);
  else if (def.targeting === 'ally' && def.heal) applyHeal(state, caster, unit, heal(def.heal));
  else if (def.targeting === 'ally') addDot(state, caster, unit, def, 'heal', heal(def.tick));
  else if (def.targeting === 'enemy') addDot(state, caster, unit, def, 'damage', harm(def.tick));
  else if (def.targeting === 'area-ally' && def.heal) {
    for (const ally of alive(state, 'ally')) {
      if (dist(ally, point) <= def.radius) applyHeal(state, caster, ally, heal(def.heal));
    }
  } else if (def.targeting === 'area-ally') {
    addZone(state, caster, def, point.x, point.y, 'heal', heal(def.tick));
  } else if (def.targeting === 'area-enemy') {
    addZone(state, caster, def, point.x, point.y, 'damage', harm(def.tick));
  }
}

// 등록한 스킬의 지금 레벨 정의. 전투 안에서 스킬 수치를 보는 곳은 전부 이걸
// 거친다 — 정의를 직접 보면 레벨 1의 값이 나온다.
function playerSkill(state, skillId) {
  const slot = skillSlot(state, skillId);
  return slot ? D.skillAt(D.PLAYER_SKILLS[skillId], slot.level) : null;
}

function castSkill(state, skillId, target) {
  if (state.status !== 'fighting') return { ok: false, reason: '전투가 끝났다' };
  const slot = skillSlot(state, skillId);
  const def = playerSkill(state, skillId);
  if (!def || !slot) return { ok: false, reason: '등록되지 않은 스킬' };

  const caster = hero(state);
  if (caster.dead) return { ok: false, reason: '쓰러졌다' };
  // 시전 중인 것이 쿨타임보다 먼저다. 외우는 중에 다른 것을 누르면 화면에
  // 뜨는 이유가 "쿨타임"이면 무엇이 막고 있는지 알 수 없다.
  if (caster.cast) return { ok: false, reason: '시전 중' };
  if (state.t < slot.readyAt) return { ok: false, reason: '쿨타임' };
  if (caster.mp < def.mp) return { ok: false, reason: '마나 부족' };

  const spot = resolveTarget(state, def, target);
  if (!spot) return { ok: false, reason: '대상이 올바르지 않다' };
  // 주인공의 스킬도 사거리가 있다. 닿지 않으면 쓸 수 없고, 대신 주인공이
  // 저절로 앞줄 쪽으로 붙으므로 잠시 뒤에는 닿는다.
  if (dist(caster, spot) > def.range) return { ok: false, reason: '사거리 밖' };

  slot.readyAt = state.t + def.cd;
  caster.mp -= def.mp;
  state.stats.casts++;

  const cast = { skillId, name: def.name, targetUid: spot.unit ? spot.unit.uid : null,
    x: spot.x, y: spot.y, startedAt: state.t, endsAt: state.t + def.cast, player: true };
  if (!def.cast) { resolvePlayerSkill(state, def, cast); return { ok: true }; }
  caster.cast = cast;
  return { ok: true, casting: def.cast };
}

// 물약은 마시는 순간 회복된다. 마나 물약과 체력 물약이 쿨타임을 함께 쓰는 것은,
// 둘을 번갈아 마시는 것이 최선이 되면 물약 관리가 아니라 손가락 싸움이 되기 때문이다.
function drink(state, unit, potionId) {
  const potion = D.POTIONS[potionId];
  const carried = unit === hero(state) ? state.potions : unit.potions;
  if (!potion || !carried || carried[potionId] <= 0) return { ok: false, reason: '물약이 없다' };

  const readyAt = unit === hero(state) ? state.potionReadyAt : unit.potionReadyAt;
  if (state.t < readyAt) return { ok: false, reason: '쿨타임' };
  if (unit.dead) return { ok: false, reason: '쓰러졌다' };

  carried[potionId]--;
  if (unit === hero(state)) state.potionReadyAt = state.t + potion.cd;
  else unit.potionReadyAt = state.t + potion.cd;

  const before = unit[potion.restore];
  const cap = potion.restore === 'hp' ? unit.maxHp : unit.maxMp;
  unit[potion.restore] = Math.min(cap, before + cap * potion.ratio);
  const gained = unit[potion.restore] - before;

  emit(state, { type: 'potion', uid: unit.uid, potionId, amount: gained,
    text: `${unit.name}: ${potion.name}` });
  if (potion.restore === 'hp' && gained > 0) {
    emit(state, { type: 'heal', uid: unit.uid, amount: Math.round(gained), over: 0 });
  }
  return { ok: true, amount: gained };
}

function usePotion(state, potionId) {
  if (state.status !== 'fighting') return { ok: false, reason: '전투가 끝났다' };
  return drink(state, hero(state), potionId || 'mana');
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
    if (!state.nextWaveAt) {
      state.nextWaveAt = state.t + WAVE_GAP;
      state.marching = true;
      emit(state, { type: 'march', text: '다음 무리를 찾아 나선다' });
    } else if (state.t >= state.nextWaveAt) {
      state.nextWaveAt = 0;
      state.marching = false;
      spawnWave(state, state.waveIndex + 1);
    }
    return;
  }
  state.status = 'won';
  emit(state, { type: 'end', result: 'won', text: '퀘스트 완료' });
}

// 무리와 무리 사이. 싸울 상대가 없으므로 판단을 돌리지 않고, 아군은 처음 섰던
// 자리로 대열을 다시 짜며 배경이 흘러간다. 적을 새로 깔아 놓고 아군을 그 앞에
// 세우는 것보다, 걸어가서 만나는 편이 무엇이 일어났는지 보인다.
function march(state, dt) {
  state.scroll += MARCH_SPEED * dt;
  for (const unit of alive(state, 'ally')) {
    if (!unit.speed) continue;
    moveToward(state, unit, { x: unit.homeX, y: unit.homeY }, dt);
  }
}

function step(state, dt) {
  state.t += dt;
  updateZones(state);
  updateDots(state);

  if (state.marching) {
    march(state, dt);
    separate(state);
    checkEnd(state);
    return;
  }

  for (const unit of state.units) {
    if (unit.dead) continue;

    // 시전 중이면 그 틱은 외우는 데만 쓴다. 다시 판단하지 않는 것은, 매 틱 새로
    // 고르면 이동이 걸려 캐스팅이 시작하자마자 취소되기 때문이다.
    if (unit.cast) { tickCast(state, unit); continue; }

    const decision = AI.decide(unit, state);

    // 주인공이 조작하는 것은 여전히 스킬뿐이다. 이동만 다른 힐러와 같은 규칙에
    // 맡긴다 — 스킬에 사거리가 생긴 이상 제자리에 서 있으면 힐이 앞줄에 닿지 않는다.
    if (unit.uid === HERO_UID) {
      if (decision.move) moveToward(state, unit, decision.move, dt);
      continue;
    }

    unit.targetUid = decision.targetUid;
    if (decision.potion) drink(state, unit, decision.potion);
    else if (decision.skill) startCast(state, unit, decision.skill);
    else if (decision.move) moveToward(state, unit, decision.move, dt);

    if (decision.attack && state.t >= unit.nextAttackAt && isFinite(unit.attackCd)) {
      const target = byUid(state, decision.attack);
      if (target && !target.dead) {
        unit.nextAttackAt = state.t + unit.attackCd;
        // 피해에 ±10%를 준다. 같은 적을 같은 순서로 때려도 죽는 시점이 조금씩
        // 달라야 힐 타이밍이 외워지지 않는다.
        applyDamage(state, unit, target, unit.atk * (0.9 + state.rng() * 0.2), true);
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

// 전투가 끝나고 무엇을 얻었는지. 화면 두 곳에서 따로 계산하면 결과 화면에 뜬
// 숫자와 실제로 오른 경험치가 어긋난다.
//
// 실패해도 길드 몫의 절반은 준다. 아무것도 없이 끝나면 어려운 퀘스트를 시도할
// 이유가 사라진다.
function rewardOf(state) {
  const won = state.status === 'won';
  const kills = state.units
    .filter((unit) => unit.side === 'enemy' && unit.dead)
    .reduce((sum, unit) => sum + unit.exp, 0);
  const guild = Math.round((state.quest.guildReward.exp || 0) * (won ? 1 : 0.5));
  const healExp = D.LEVEL.healExp(state.stats.healed);

  return {
    won, kills, guild, healExp,
    charExp: kills + guild,
    // 힐러의 직업 경험치는 벤 것보다 살린 것에서 더 나온다. 힐만 하다 전투가
    // 끝나도 남는 것이 있어야 이 직업을 하는 뜻이 산다.
    jobExp: Math.round(kills * 0.5) + guild + healExp,
    gold: won ? state.quest.guildReward.gold : 0,
  };
}

// 캐릭터별 전투 리포트. 전투 중에는 누가 얼마나 맞고 있는지가 체력 막대로만
// 보이고 끝나면 그것마저 사라진다 — 편성을 다시 짤 근거가 남지 않는다.
//
// 적은 빼고 아군만 본다. 무리마다 새로 솟는 적은 이름이 겹쳐 줄이 늘기만 한다.
function battleReport(state) {
  return state.units
    .filter((unit) => unit.side === 'ally')
    .map((unit) => ({
      uid: unit.uid, name: unit.name, job: unit.job, level: unit.level, dead: unit.dead,
      dealt: Math.round(unit.tally.dealt),
      taken: Math.round(unit.tally.taken),
      healed: Math.round(unit.tally.healed),
      overheal: Math.round(unit.tally.overheal),
    }));
}

const api = {
  HERO_UID, TICK, WAVE_GAP, MARCH_SPEED, rewardOf, battleReport,
  createRng, createBattle, advance, step, drainEvents,
  castSkill, playerSkill, usePotion, drink, magicPowerOf, rollCrit, applyDamage, applyHeal, addDot, addZone,
  hero, skillSlot, resolveTarget, moveToward,
  startCast, tickCast, cancelCast, runUnitSkill, resolvePlayerSkill,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerLogic = api;

})(typeof window !== 'undefined' ? window : globalThis);

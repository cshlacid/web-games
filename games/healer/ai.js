'use strict';

// 동료와 적의 판단. 기획서 10~14장의 직업별 행동 우선순위가 여기 다 들어 있다.
//
// **판단만 하고 상태를 바꾸지 않는다.** 실행(피해·회복·이동 적용)은 logic.js가 한다.
// 이렇게 나눠 두면 "탱커가 어그로를 놓쳤을 때 도발을 고르는가" 같은 것을 전투를
// 굴리지 않고 상태 하나만 만들어서 확인할 수 있고, logic.js와 순환 참조도 없다.
(function (root) {

const D = (typeof module !== 'undefined' && module.exports)
  ? require('./data.js') : root.HealerData;

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const alive = (state, side) => state.units.filter((u) => u.side === side && !u.dead);
const byUid = (state, uid) => state.units.find((u) => u.uid === uid) || null;
const opposite = (side) => (side === 'ally' ? 'enemy' : 'ally');
const missing = (u) => u.maxHp - u.hp;

function nearest(unit, list) {
  let best = null;
  let bestD = Infinity;
  for (const other of list) {
    const d = dist(unit, other);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

function skillReady(unit, state, id) {
  const slot = unit.skills.find((s) => s.id === id);
  if (!slot || state.t < slot.readyAt) return null;
  const def = D.UNIT_SKILLS[id];
  if (def.mp > unit.mp) return null;
  return def;
}

// 이 편의 탱커. 여럿이면 앞에 선 쪽을 기준으로 본다 — 어그로를 보는 쪽이
// 최전선이어야 딜러의 우선순위가 뜻대로 굴러간다.
function frontTank(state, side) {
  const tanks = alive(state, side).filter((u) => u.job === 'tank');
  if (!tanks.length) return null;
  const forward = side === 'ally' ? 1 : -1;
  return tanks.reduce((a, b) => ((b.x - a.x) * forward > 0 ? b : a));
}

// 적이 지금 누구를 때리고 있는지. 어그로 판단의 근거라 logic.js가 매 틱 갱신한 값을 쓴다.
function currentTargetOf(state, unit) {
  return unit.targetUid ? byUid(state, unit.targetUid) : null;
}

// --- 대상 고르기 -------------------------------------------------------

// 딜러: 탱커가 어그로를 잡고 있는 적을 우선 공격한다. 그런 적이 없으면
// 적 힐러 → 적 딜러 → 적 탱커 순이다. (기획서 12장)
const DEALER_ORDER = { healer: 0, dealer: 1, tank: 2 };

function dealerTarget(unit, state) {
  const foes = alive(state, opposite(unit.side));
  if (!foes.length) return null;

  const tank = frontTank(state, unit.side);
  if (tank) {
    const held = foes.filter((foe) => foe.targetUid === tank.uid);
    if (held.length) return nearest(unit, held);
  }

  // 우선순위가 같으면 가까운 쪽. 뒤에 있는 적을 향해 대열을 가로지르지 않게 한다.
  let best = null;
  for (const foe of foes) {
    if (!best) { best = foe; continue; }
    const rank = DEALER_ORDER[foe.job] - DEALER_ORDER[best.job];
    if (rank < 0 || (rank === 0 && dist(unit, foe) < dist(unit, best))) best = foe;
  }
  return best;
}

// 탱커: 최전선의 적을 잡는다. 자기를 때리는 적이 있으면 그쪽을 먼저 본다 —
// 맞고 있는 적을 두고 다른 적을 쫓아가면 최전선이 무너진다.
function tankTarget(unit, state) {
  const foes = alive(state, opposite(unit.side));
  if (!foes.length) return null;
  const onMe = foes.filter((foe) => foe.targetUid === unit.uid);
  return nearest(unit, onMe.length ? onMe : foes);
}

// 힐러: 때릴 대상은 가까운 적이면 된다. 힐 대상 판단은 healTarget이 따로 한다.
function healerTarget(unit, state) {
  return nearest(unit, alive(state, opposite(unit.side)));
}

// 적: 어그로 표를 따른다. 도발이 걸려 있으면 그것이 이긴다.
function enemyTarget(unit, state) {
  const foes = alive(state, opposite(unit.side));
  if (!foes.length) return null;

  const forced = unit.tauntUid && state.t < unit.tauntUntil ? byUid(state, unit.tauntUid) : null;
  if (forced && !forced.dead) return forced;

  const table = state.threat[unit.uid] || {};
  let best = null;
  let bestValue = 0;
  for (const foe of foes) {
    const value = table[foe.uid] || 0;
    if (value > bestValue) { bestValue = value; best = foe; }
  }
  // 아직 아무도 위협을 쌓지 않은 전투 시작 직후에는 가까운 쪽으로 달려든다.
  return best || nearest(unit, foes);
}

function chooseTarget(unit, state) {
  if (unit.side === 'enemy') return enemyTarget(unit, state);
  if (unit.job === 'tank') return tankTarget(unit, state);
  if (unit.job === 'dealer') return dealerTarget(unit, state);
  return healerTarget(unit, state);
}

// --- 힐 판단 -----------------------------------------------------------

// 기획서 13장: 조금 깎였다고 바로 힐하지 않고, 한 번의 힐로 거의 다 채울 수
// 있을 만큼 깎였을 때 쓴다. 마나가 자연 회복되지 않으므로 흘린 힐량이 그대로 손해다.
//
// 두 값 모두 임시다. 기획서는 정확한 임계값을 정하지 않았다.
const EFFICIENT = 0.85;  // 힐량의 이만큼은 깎여 있어야 쓴다
const EMERGENCY = 0.35;  // 효율을 따질 상황이 아닌 체력 비율

function healTarget(unit, state, heal) {
  const friends = alive(state, unit.side).filter((u) => missing(u) > 0);
  if (!friends.length) return null;

  // 탱커 최우선. 같은 조건이면 더 많이 깎인 쪽.
  const ordered = friends.slice().sort((a, b) => {
    if ((a.job === 'tank') !== (b.job === 'tank')) return a.job === 'tank' ? -1 : 1;
    return missing(b) - missing(a);
  });

  const efficient = ordered.find((u) => missing(u) >= heal * EFFICIENT);
  if (efficient) return efficient;

  // 효율이 안 나와도 죽을 것 같으면 쓴다. 아낀 마나는 대상이 죽으면 의미가 없다.
  return ordered.find((u) => u.hp / u.maxHp <= EMERGENCY) || null;
}

// --- 스킬 판단 ---------------------------------------------------------

// **적힌 순서대로 본다.** 조건이 까다로운 스킬(광역 도발, 대치유술)을 앞에 두면
// 그것이 먼저 걸리고, 조건이 안 맞으면 뒤의 것으로 넘어간다. 순서를 바꾸는 것이
// 곧 우선순위를 바꾸는 것이라 data.js의 skills 배열이 그 자리다.
function chooseSkill(unit, state, target) {
  for (const slot of unit.skills) {
    const def = skillReady(unit, state, slot.id);
    if (!def) continue;

    if (def.kind === 'taunt' || def.kind === 'taunt-area') {
      // 어그로가 풀렸다는 것은, 내가 아닌 아군을 때리고 있는 적이 있다는 뜻이다.
      const reach = def.radius || 30;
      const loose = alive(state, opposite(unit.side)).filter((foe) => {
        const t = currentTargetOf(state, foe);
        return t && t.uid !== unit.uid && dist(unit, foe) <= reach;
      });
      if (!loose.length) continue;
      // 광역 도발은 쿨타임이 길다. 하나 놓쳤다고 쓰면 정작 여럿이 풀렸을 때
      // 쓸 것이 없다 — 둘 이상 풀렸을 때만 쓰고, 하나뿐이면 단일 도발에 맡긴다.
      if (def.kind === 'taunt-area' && loose.length < 2) continue;
      return { id: def.id, targetUid: nearest(unit, loose).uid };
    }

    if (def.kind === 'heal') {
      const hurt = healTarget(unit, state, def.heal);
      if (hurt && dist(unit, hurt) <= unit.range + 6) return { id: def.id, targetUid: hurt.uid };
      continue;
    }

    if (def.kind === 'damage' || def.kind === 'dot') {
      if (target && dist(unit, target) <= unit.range) return { id: def.id, targetUid: target.uid };
      continue;
    }

    if (def.kind === 'damage-area') {
      // 여럿이 겹쳐 있을 때만 쓴다. 하나에게 쓰면 쿨타임만 버리는 셈이다.
      if (!target || dist(unit, target) > unit.range) continue;
      const hit = alive(state, opposite(unit.side)).filter((foe) => dist(foe, target) <= def.radius);
      if (hit.length >= 2) return { id: def.id, targetUid: target.uid };
      continue;
    }
  }
  return null;
}

// --- 이동 --------------------------------------------------------------

// 목표 지점은 "대상에게서 사거리만큼 떨어진, 지금 내가 선 방향" 이다. 대상 위로
// 곧장 파고들지 않으므로 각자 다가온 각도가 유지되고 대열이 덜 뭉친다.
function standoff(unit, target, range) {
  const dx = unit.x - target.x;
  const dy = unit.y - target.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: target.x + (dx / d) * range, y: target.y + (dy / d) * range };
}

const RETREAT = { ranged: 14, healer: 17 };

function chooseMove(unit, state, target) {
  if (!unit.speed) return null;

  // 뒤에서 싸우는 직업은 붙는 것보다 떨어지는 것이 먼저다. 붙으면 어그로가
  // 풀렸을 때 곧바로 맞기 시작한다.
  const back = unit.job === 'healer' ? RETREAT.healer : (unit.range > 20 ? RETREAT.ranged : 0);
  if (back) {
    const foe = nearest(unit, alive(state, opposite(unit.side)));
    if (foe && dist(unit, foe) < back) return standoff(unit, foe, back + 4);
  }

  if (unit.job === 'healer') {
    // 힐러는 적이 아니라 아군을 따라다닌다. 탱커가 사거리 밖으로 나가면 힐이 끊긴다.
    const anchor = frontTank(state, unit.side) || nearest(unit, alive(state, unit.side));
    if (anchor && anchor.uid !== unit.uid && dist(unit, anchor) > unit.range * 0.8) {
      return standoff(unit, anchor, unit.range * 0.7);
    }
    return null;
  }

  if (!target) return null;
  const want = unit.range * 0.85;
  return dist(unit, target) > want ? standoff(unit, target, want) : null;
}

// --- 물약 --------------------------------------------------------------

// 마나를 다 쓴 사제가 남은 전투 내내 서 있는 것을 막는다. 물약은 수가 적으므로
// 아무 때나 마시면 정작 필요할 때 없다.
//
// 체력이 먼저다. 마나가 없어 못 싸우는 것보다 죽는 것이 급하다.
const POTION_HP = 0.35;   // 이 아래로 내려가면 체력 물약
const POTION_MP = 1.15;   // 가장 싼 스킬도 못 쓸 지경(비용의 이만큼)이면 마나 물약

function cheapestSkillCost(unit) {
  let cheapest = Infinity;
  for (const slot of unit.skills) {
    const def = D.UNIT_SKILLS[slot.id];
    if (def && def.mp > 0) cheapest = Math.min(cheapest, def.mp);
  }
  return cheapest;
}

function choosePotion(unit, state) {
  if (!unit.potions || state.t < unit.potionReadyAt) return null;

  if (unit.potions.health > 0 && unit.hp / unit.maxHp <= POTION_HP) return 'health';

  if (unit.potions.mana > 0) {
    const cost = cheapestSkillCost(unit);
    // 쓸 스킬이 없으면 마나를 채울 이유도 없다.
    if (cost !== Infinity && unit.mp < cost * POTION_MP) return 'mana';
  }
  return null;
}

function decide(unit, state) {
  const target = chooseTarget(unit, state);
  const potion = choosePotion(unit, state);
  // 물약을 마시는 턴에는 스킬을 쓰지 않는다. 마시자마자 그 마나로 스킬을 쓰면
  // 물약이 사실상 스킬 하나를 공짜로 얹어 주는 것이 된다.
  const skill = potion ? null : chooseSkill(unit, state, target);
  return {
    targetUid: target ? target.uid : null,
    potion,
    skill,
    move: chooseMove(unit, state, target),
    attack: target && dist(unit, target) <= unit.range ? target.uid : null,
  };
}

const api = {
  dist, alive, byUid, opposite, nearest, frontTank,
  chooseTarget, healTarget, chooseSkill, choosePotion, chooseMove, decide,
  POTION_HP, POTION_MP,
  EFFICIENT, EMERGENCY,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerAI = api;

})(typeof window !== 'undefined' ? window : globalThis);

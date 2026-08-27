'use strict';

// 동료와 적의 판단. 기획서 10~14장의 직업별 행동 우선순위가 여기 다 들어 있다.
//
// **아군과 적이 같은 함수를 쓴다.** 편마다 다른 규칙을 두었더니 한쪽만 고치고
// 다른 쪽을 잊는 일이 반복됐고, 무엇보다 적이 아군과 다르게 움직이면 전투를
// 보면서 규칙을 배울 수가 없다. 여기서 편은 `opposite(side)`로만 나타난다.
//
// **판단만 하고 상태를 바꾸지 않는다.** 실행(피해·회복·이동 적용)은 logic.js가 한다.
// 이렇게 나눠 두면 "힐러가 노려질 때 탱커가 도발을 고르는가" 같은 것을 전투를
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

// 딜러는 근접이냐 원거리냐로 하는 일이 갈린다. 그 구분을 data.js가 사거리에서
// 뽑아 주므로 여기서는 직업 대신 이것을 본다.
const roleOf = (unit) => D.roleOf(unit);

function nearest(unit, list) {
  let best = null;
  let bestD = Infinity;
  for (const other of list) {
    const d = dist(unit, other);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

// 우선순위 표에서 앞설수록 작은 값. 표에 없는 역할은 맨 뒤로 보낸다.
function rankOf(order, unit) {
  const i = order.indexOf(roleOf(unit));
  return i < 0 ? order.length : i;
}

// 표에서 앞선 쪽, 같으면 가까운 쪽. 가까운 쪽을 섞는 것은 뒤에 선 적을 향해
// 대열을 가로지르지 않게 하려는 것이다.
function bestBy(unit, list, order) {
  let best = null;
  for (const other of list) {
    if (!best) { best = other; continue; }
    const rank = rankOf(order, other) - rankOf(order, best);
    if (rank < 0 || (rank === 0 && dist(unit, other) < dist(unit, best))) best = other;
  }
  return best;
}

const mates = (unit, state) => alive(state, unit.side).filter((u) => u.uid !== unit.uid);
const foesOf = (unit, state) => alive(state, opposite(unit.side));

// 이 편의 탱커. 여럿이면 앞에 선 쪽을 기준으로 본다 — 후열이 붙는 자리이자
// 어그로를 보는 자리라 최전선이어야 나머지 규칙이 뜻대로 굴러간다.
function frontTank(state, side) {
  const tanks = alive(state, side).filter((u) => u.job === 'tank');
  if (!tanks.length) return null;
  const forward = side === 'ally' ? 1 : -1;
  return tanks.reduce((a, b) => ((b.x - a.x) * forward > 0 ? b : a));
}

// unit을 지금 노리고 있는 반대편. 어그로 판단의 근거라 logic.js가 매 틱 갱신한
// targetUid를 그대로 쓴다 — 위협도 표 없이 "누가 누구를 보고 있는가"만 본다.
function attackersOf(state, unit) {
  return alive(state, opposite(unit.side)).filter((foe) => foe.targetUid === unit.uid);
}

// 우리 편에서 지금 구해야 할 사람과 그를 치고 있는 적. PULL_ORDER 순으로
// 힐러 → 원거리 딜러 → 근접 딜러를 보고, 처음 걸리는 쪽을 돌려준다.
// 탱커는 표에 없다 — 탱커가 맞는 것은 구할 일이 아니라 제 할 일이다.
function endangered(unit, state) {
  const ranked = mates(unit, state)
    .filter((mate) => rankOf(D.PULL_ORDER, mate) < D.PULL_ORDER.length)
    .sort((a, b) => rankOf(D.PULL_ORDER, a) - rankOf(D.PULL_ORDER, b));
  for (const mate of ranked) {
    const foes = attackersOf(state, mate);
    if (foes.length) return { mate, foes };
  }
  return null;
}

function skillReady(unit, state, id) {
  const slot = unit.skills.find((s) => s.id === id);
  if (!slot || state.t < slot.readyAt) return null;
  const def = D.UNIT_SKILLS[id];
  if (def.mp > unit.mp) return null;
  return def;
}

// --- 대상 고르기 -------------------------------------------------------

// 탱커: 후열을 노리는 적을 떼어 내는 것이 최우선이다. 아무도 안 노려지고 있으면
// 나를 때리는 적을, 그것도 없으면 가까운 적을 본다.
function tankTarget(unit, state) {
  const foes = foesOf(unit, state);
  if (!foes.length) return null;
  const danger = endangered(unit, state);
  if (danger) return nearest(unit, danger.foes);
  const onMe = foes.filter((foe) => foe.targetUid === unit.uid);
  return nearest(unit, onMe.length ? onMe : foes);
}

// 딜러: 우리 힐러를 치고 있는 적이 먼저다. 없으면 적 힐러 → 원거리 → 근접 →
// 탱커 순(ATTACK_ORDER). 탱커가 맨 뒤인 것은 제일 단단한 쪽이기 때문이다.
function dealerTarget(unit, state) {
  const foes = foesOf(unit, state);
  if (!foes.length) return null;

  const onHealer = [];
  for (const mate of alive(state, unit.side)) {
    if (roleOf(mate) !== 'healer') continue;
    for (const foe of attackersOf(state, mate)) onHealer.push(foe);
  }
  if (onHealer.length) return nearest(unit, onHealer);

  return bestBy(unit, foes, D.ATTACK_ORDER);
}

function chooseTarget(unit, state) {
  // 도발은 다른 모든 판단을 이긴다. 아군이든 적이든 같다.
  const forced = unit.tauntUid && state.t < unit.tauntUntil ? byUid(state, unit.tauntUid) : null;
  if (forced && !forced.dead) return forced;

  const role = roleOf(unit);
  if (role === 'tank') return tankTarget(unit, state);
  // 힐러가 때릴 상대는 가까운 적이면 된다. 힐 대상은 healTarget이 따로 고른다.
  if (role === 'healer') return nearest(unit, foesOf(unit, state));
  return dealerTarget(unit, state);
}

// --- 힐 판단 -----------------------------------------------------------

// 기획서 13장: 조금 깎였다고 바로 힐하지 않고, 한 번의 힐로 거의 다 채울 수
// 있을 만큼 깎였을 때 쓴다. 마나는 아주 느리게만 돌아오므로(logic.js의
// MANA_REGEN) 흘린 힐량은 사실상 그대로 손해다.
//
// 두 값 모두 임시다. 기획서는 정확한 임계값을 정하지 않았다.
const EFFICIENT = 0.85;  // 힐량의 이만큼은 깎여 있어야 쓴다
const EMERGENCY = 0.35;  // 효율을 따질 상황이 아닌 체력 비율

// 탱커가 최우선이고, 탱커에게 여유가 있으면 힐러 → 근접 → 원거리 순(HEAL_ORDER).
// "여유가 있다"를 따로 재지 않는 것은, 효율·위급 조건에 걸리지 않는 것이 곧
// 여유가 있다는 뜻이기 때문이다 — 조건 하나로 순서와 여유를 같이 본다.
function healTarget(unit, state, heal) {
  const friends = alive(state, unit.side).filter((u) => missing(u) > 0);
  if (!friends.length) return null;

  const ordered = friends.slice().sort((a, b) => {
    const rank = rankOf(D.HEAL_ORDER, a) - rankOf(D.HEAL_ORDER, b);
    return rank || (missing(b) - missing(a));
  });

  const efficient = ordered.find((u) => missing(u) >= heal * EFFICIENT);
  if (efficient) return efficient;

  // 효율이 안 나와도 죽을 것 같으면 쓴다. 아낀 마나는 대상이 죽으면 의미가 없다.
  return ordered.find((u) => u.hp / u.maxHp <= EMERGENCY) || null;
}

// --- 물약과 마나 -------------------------------------------------------

// 마나를 다 쓴 사제가 남은 전투 내내 서 있는 것을 막는다. 물약은 수가 적으므로
// 아무 때나 마시면 정작 필요할 때 없다.
//
// 체력이 먼저다. 마나가 없어 못 싸우는 것보다 죽는 것이 급하다.
const POTION_HP = 0.35;   // 이 아래로 내려가면 체력 물약
const POTION_MP = 1.15;   // 가장 싼 스킬도 못 쓸 지경(비용의 이만큼)이면 마나 물약

const isTaunt = (def) => def.kind === 'taunt' || def.kind === 'taunt-area';

// **도발에 쓸 마나는 남겨 둔다.** 탱커가 때리는 스킬로 마나를 다 쓰고 나면,
// 정작 적이 힐러에게 붙었을 때 끌어올 수단이 없다 — 위협도 표를 없앤 뒤로
// 어그로를 움직이는 것은 도발뿐이라 그 순간이 그대로 후열이 무너지는 순간이 된다.
//
// 들고 있는 도발을 한 번씩 쓸 만큼 남긴다. 도발이 없는 유닛에게는 0이라
// 직업을 가르는 분기가 필요 없다.
function tauntReserve(unit) {
  let reserve = 0;
  for (const slot of unit.skills) {
    const def = D.UNIT_SKILLS[slot.id];
    if (def && isTaunt(def)) reserve += def.mp;
  }
  return reserve;
}

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

// --- 스킬 판단 ---------------------------------------------------------

// 사거리는 스킬마다 다르다. 적어 두지 않은 스킬은 유닛의 사거리를 따른다.
const rangeOf = (def, unit) => (def.range == null ? unit.range : def.range);

// **적힌 순서대로 본다.** 조건이 까다로운 스킬(광역 도발, 대치유술)을 앞에 두면
// 그것이 먼저 걸리고, 조건이 안 맞으면 뒤의 것으로 넘어간다. 순서를 바꾸는 것이
// 곧 우선순위를 바꾸는 것이라 data.js의 skills 배열이 그 자리다.
function chooseSkill(unit, state, target) {
  const reserve = tauntReserve(unit);

  for (const slot of unit.skills) {
    const def = skillReady(unit, state, slot.id);
    if (!def) continue;
    // 도발 몫을 헐어 가며 때리지 않는다. 마나를 되찾는 스킬은 예외다 —
    // 그것을 막으면 마나가 바닥난 탱커가 영영 도발을 못 하게 된다.
    if (!isTaunt(def) && def.kind !== 'mana' && unit.mp - def.mp < reserve) continue;
    const reach = rangeOf(def, unit);

    if (isTaunt(def)) {
      if (def.kind === 'taunt-area') {
        // 광역 도발은 쿨타임이 길다. 하나 놓쳤다고 쓰면 정작 여럿이 풀렸을 때
        // 쓸 것이 없다 — 둘 이상 풀렸을 때만 쓰고, 하나뿐이면 단일 도발에 맡긴다.
        const loose = foesOf(unit, state).filter((foe) => {
          const t = foe.targetUid ? byUid(state, foe.targetUid) : null;
          return t && t.uid !== unit.uid && dist(unit, foe) <= def.radius;
        });
        if (loose.length < 2) continue;
        return { id: def.id, targetUid: nearest(unit, loose).uid };
      }
      // 단일 도발은 가장 급한 아군(PULL_ORDER)을 치는 적에게 쓴다.
      const danger = endangered(unit, state);
      if (!danger) continue;
      const inReach = danger.foes.filter((foe) => dist(unit, foe) <= reach);
      if (!inReach.length) continue;
      return { id: def.id, targetUid: nearest(unit, inReach).uid };
    }

    // 자기 마나를 되찾는 스킬. 물약과 같은 잣대로 본다 — 아직 쓸 마나가
    // 남아 있으면 아낀다. 이것이 없으면 시전자가 곧바로 기본 공격만 하게 된다.
    if (def.kind === 'mana') {
      const cost = cheapestSkillCost(unit);
      if (cost === Infinity || unit.mp >= cost * POTION_MP) continue;
      if (unit.mp + def.mana > unit.maxMp * 1.3) continue;
      return { id: def.id, targetUid: unit.uid };
    }

    // 아군의 마나를 채운다. 자기 것을 채우는 'mana'와 달리 아낄 이유가 없다 —
    // 쓸 곳이 있으면 바로 쓰는 것이 낫고, 쓸 곳이 없으면 아래 조건에서 걸린다.
    if (def.kind === 'mana-ally') {
      const dry = manaTarget(unit, state, def.mana);
      if (dry && dist(unit, dry) <= reach) return { id: def.id, targetUid: dry.uid };
      continue;
    }

    // 광역은 쿨타임이 길다. 둘 이상이 함께 말랐을 때만 쓴다 — 하나에게 쓰면
    // 후렴보다 덜 채우고 더 오래 기다리는 스킬이 된다.
    if (def.kind === 'mana-area') {
      const dry = manaTarget(unit, state, def.mana);
      if (!dry || dist(unit, dry) > reach) continue;
      const covered = mates(unit, state).filter((mate) => mate.maxMp > 0
        && dist(mate, dry) <= def.radius && mate.maxMp - mate.mp >= def.mana * EFFICIENT);
      if (covered.length >= 2) return { id: def.id, targetUid: dry.uid };
      continue;
    }

    if (def.kind === 'heal' || def.kind === 'heal-dot') {
      // 도트 힐은 한 번에 채우는 것이 아니라 지속 시간 동안 다 채운다.
      const worth = def.kind === 'heal-dot' ? def.tick * def.duration : def.heal;
      const hurt = healTarget(unit, state, worth);
      if (hurt && dist(unit, hurt) <= reach) return { id: def.id, targetUid: hurt.uid };
      continue;
    }

    // 범위 회복은 둘 이상이 함께 깎였을 때만 쓴다. 하나에게 쓰면 단일 힐보다
    // 비싸고 덜 채우는 스킬이 된다.
    if (def.kind === 'heal-area') {
      const hurt = healTarget(unit, state, def.heal);
      if (!hurt || dist(unit, hurt) > reach) continue;
      const covered = alive(state, unit.side)
        .filter((mate) => dist(mate, hurt) <= def.radius && missing(mate) >= def.heal * EFFICIENT);
      if (covered.length >= 2) return { id: def.id, targetUid: hurt.uid };
      continue;
    }

    if (def.kind === 'damage' || def.kind === 'dot') {
      if (target && dist(unit, target) <= reach) return { id: def.id, targetUid: target.uid };
      continue;
    }

    if (def.kind === 'damage-area' || def.kind === 'zone') {
      // 여럿이 겹쳐 있을 때만 쓴다. 하나에게 쓰면 쿨타임만 버리는 셈이다.
      if (!target || dist(unit, target) > reach) continue;
      const hit = foesOf(unit, state).filter((foe) => dist(foe, target) <= def.radius);
      if (hit.length >= 2) return { id: def.id, targetUid: target.uid };
      continue;
    }
  }
  return null;
}

// 회복을 맡는 종류. 어디에 설지 정할 때와 마나를 아낄지 정할 때 같은 목록을 본다.
const HEAL_KINDS = ['heal', 'heal-area', 'heal-dot'];

// **마나를 채워 줄 아군.** 체력의 healTarget과 같은 잣대다 — 채워 줄 양의 몫만큼
// 비어 있어야 쓴다. 조금 빈 사람에게 부어 넘치면 긴 쿨타임만 버리는 셈이다.
//
// 누구부터인가는 HEAL_ORDER를 그대로 쓴다. 마나가 마르면 탱커는 도발을, 힐러는
// 힐을 못 하므로 급한 순서가 체력과 다르지 않다. 스킬을 쓰지 않는 유닛(최대
// 마나가 0)은 애초에 대상이 아니다.
function manaTarget(unit, state, worth) {
  const dry = mates(unit, state).filter((mate) =>
    mate.maxMp > 0 && mate.maxMp - mate.mp >= worth * EFFICIENT);
  if (!dry.length) return null;
  return bestBy(unit, dry, D.HEAL_ORDER);
}

// 지금 사거리 안에 들어가야 하는 회복 대상. 쿨타임과 마나는 보지 않는다 —
// 쿨타임이 도는 동안 자리를 잡아 두어야 돌아오자마자 힐이 나간다.
function healReach(unit, state) {
  for (const slot of unit.skills) {
    const def = D.UNIT_SKILLS[slot.id];
    if (!def || HEAL_KINDS.indexOf(def.kind) < 0) continue;
    const worth = def.kind === 'heal-dot' ? def.tick * def.duration : def.heal;
    const hurt = healTarget(unit, state, worth);
    if (hurt) return { unit: hurt, range: rangeOf(def, unit) };
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

const STICK = 16;    // 후열이 탱커 뒤에서 유지하는 거리
const SPREAD = 10;   // 붙어 있는 동안 허용하는 세로 편차
const RETREAT = 18;  // 붙을 곳이 아무도 없을 때 적과 벌리려는 거리

// 붙는 자리는 탱커의 **뒤**다. 지금 선 방향으로 붙게 했더니 다섯이 한 덩어리로
// 뭉쳐 화면에서 누가 누구인지 보이지 않았고, 후열이 탱커를 지나쳐 적 쪽에 서기도
// 했다.
//
// 세로는 지금 선 높이를 지키되 탱커에게서 SPREAD 안으로 묶는다. 그대로 두었더니
// 처음 선 줄에서 영영 내려오지 않아, 맨 위 줄에서 시작한 주인공이 전투가 아래로
// 옮겨 간 뒤에도 혼자 위에 남았다. 아주 묶어 버리면 다섯이 한 줄로 선다.
function behind(unit, anchor, gap) {
  const forward = unit.side === 'ally' ? 1 : -1;
  const offset = Math.max(-SPREAD, Math.min(SPREAD, unit.y - anchor.y));
  return { x: anchor.x - forward * gap, y: anchor.y + offset };
}

// 앞줄을 앞질러 가지 않게 가로 위치를 자른다. 세로는 그대로 둔다 — 앞뒤만
// 지키면 되고, 세로까지 묶으면 대열이 한 줄이 된다.
function holdBehind(unit, anchor, spot) {
  const forward = unit.side === 'ally' ? 1 : -1;
  const limit = anchor.x - forward * 2;
  const x = forward > 0 ? Math.min(spot.x, limit) : Math.max(spot.x, limit);
  return { x, y: spot.y };
}

// 후열이 붙을 자리. 탱커가 없으면 근접 딜러, 그것도 없으면 없다.
function anchorOf(unit, state) {
  const tank = frontTank(state, unit.side);
  if (tank && tank.uid !== unit.uid) return tank;
  return nearest(unit, mates(unit, state).filter((u) => roleOf(u) === 'melee'));
}

// **후열은 맞아도 도망가지 않는다.** 도망가면 어그로를 끌 탱커에게서 멀어지고,
// 결국 탱커가 닿지 못하는 곳에서 혼자 맞는다. 탱커 곁에 붙어 있어야 탱커가
// 그 적을 도발 사거리 안에 둔다. 붙을 탱커도 근접 딜러도 없을 때에만 물러선다.
function chooseMove(unit, state, target) {
  if (!unit.speed) return null;
  const role = roleOf(unit);

  if (role === 'healer' || role === 'ranged') {
    // 힐이 안 닿으면 붙어 있는 뜻이 없다. 회복 대상이 먼저다.
    const need = healReach(unit, state);
    if (need && dist(unit, need.unit) > need.range) {
      return standoff(unit, need.unit, need.range * 0.8);
    }

    const anchor = anchorOf(unit, state);

    // **회복시킬 사람이 없으면 사거리 안까지 나가 때린다.** 뒤에 서서 아무것도
    // 안 하는 힐러는 화면에서 고장 난 것으로 보인다. 다만 **탱커보다 앞으로는
    // 나가지 않는다** — 앞질러 나가면 어그로를 끌 사람이 뒤에 남는다.
    if (role === 'healer' && !need && target && dist(unit, target) > unit.range) {
      const spot = standoff(unit, target, unit.range * 0.9);
      return anchor ? holdBehind(unit, anchor, spot) : spot;
    }
    if (anchor) {
      // 제자리 근처에서는 움직이지 않는다. 조금씩이라도 계속 걸으면 캐스팅이
      // 매번 취소되어 후열이 아무 스킬도 못 쓴다.
      const spot = behind(unit, anchor, STICK);
      return dist(unit, spot) > STICK * 0.4 ? spot : null;
    }

    // 앞에 아무도 없다. 이제야 물러서되, 공격과 힐은 계속한다 — 도망은
    // 이동일 뿐이고 logic.js는 사거리만 맞으면 때린다.
    const foe = nearest(unit, foesOf(unit, state));
    if (foe && dist(unit, foe) < RETREAT) return standoff(unit, foe, RETREAT + 4);
    return null;
  }

  if (!target) return null;
  const want = unit.range * 0.85;
  return dist(unit, target) > want ? standoff(unit, target, want) : null;
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
  dist, alive, byUid, opposite, nearest, roleOf, rankOf, frontTank, anchorOf, behind,
  tauntReserve, manaTarget,
  attackersOf, endangered, healReach,
  chooseTarget, healTarget, chooseSkill, choosePotion, chooseMove, decide,
  POTION_HP, POTION_MP, STICK, RETREAT, SPREAD,
  EFFICIENT, EMERGENCY,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerAI = api;

})(typeof window !== 'undefined' ? window : globalThis);

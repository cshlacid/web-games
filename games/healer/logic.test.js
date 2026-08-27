'use strict';

// 실행: node games/healer/logic.test.js
const D = require('./data.js');
const L = require('./logic.js');
const AI = require('./ai.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`);
  }
}

// 퀘스트는 이제 씨앗에서 만들어진다. 테스트가 특정 퀘스트에 기대면 생성 규칙을
// 조금 고칠 때마다 테스트가 깨지므로, 여기서 쓸 판을 직접 짠다.
function quest(over) {
  return Object.assign({
    id: 'test', region: 'mine', scene: 'mine', level: 1,
    name: '시험용 의뢰', desc: '',
    waves: [['scout', 'scout', 'scout'], ['scout', 'scout', 'scout', 'shaman']],
    guildReward: { gold: 100, exp: 50 },
    drops: [{ defId: 'fang', tier: 0 }],
    exp: 100,
  }, over);
}

const PARTY = [
  { defId: 'bran', level: 1 }, { defId: 'lyle', level: 1 },
  { defId: 'mira', level: 1 }, { defId: 'noa', level: 1 },
];
const SKILLS = ['touch', 'quick', 'regen', 'ripple', 'focus'];

const battle = (over) => L.createBattle(Object.assign(
  { quest: quest(), party: PARTY, skills: SKILLS, seed: 3,
    potions: { mana: 3, health: 2 } }, over));

const unit = (state, name) => state.units.find((u) => u.name === name);
const run = (state, seconds) => {
  const steps = Math.round(seconds / L.TICK);
  for (let i = 0; i < steps && state.status === 'fighting'; i++) L.step(state, L.TICK);
};

// 캐스팅이 끝난 자리까지 밀어 준다. 전투를 통째로 굴리지 않는 것은, 아래에서
// 보려는 것이 스킬의 효과이지 외우는 동안 적이 얼마나 때렸는지가 아니기 때문이다.
// 캐스팅 자체는 따로 확인한다.
function cast(state, skillId, target) {
  const result = L.castSkill(state, skillId, target);
  const caster = L.hero(state);
  if (result.ok && caster.cast) {
    state.t = caster.cast.endsAt;
    L.tickCast(state, caster);
  }
  return result;
}

// --- 파티 구성 ---------------------------------------------------------
{
  const state = battle();
  check('주인공을 포함해 다섯', AI.alive(state, 'ally').length, 5);
  check('주인공은 힐러', L.hero(state).job, 'healer');
  check('첫 웨이브가 깔린다', AI.alive(state, 'enemy').length, quest().waves[0].length);

  // 기획서 2.2: 직업 중복을 허용한다.
  const twins = battle({ party: [
    { defId: 'bran', level: 1 }, { defId: 'corin', level: 1 },
    { defId: 'noa', level: 1 }, { defId: 'dean', level: 1 }] });
  check('같은 직업 둘을 넣을 수 있다',
    AI.alive(twins, 'ally').filter((u) => u.job === 'tank').length, 2);

  // 5인을 넘겨 넣어도 다섯에서 잘린다.
  const crowd = battle({ party: ['bran', 'corin', 'lyle', 'sera', 'mira', 'yuri']
    .map((defId) => ({ defId, level: 1 })) });
  check('파티는 다섯을 넘지 않는다', AI.alive(crowd, 'ally').length, D.PARTY_MAX);

  // 기획서 5.1: 전투에 가져가는 스킬은 다섯까지.
  const many = battle({ skills: Object.keys(D.PLAYER_SKILLS) });
  check('등록 스킬은 다섯까지', many.skills.length, D.SKILL_MAX);
}

// --- 스킬 사용 조건 -----------------------------------------------------
{
  const state = battle();
  const hero = L.hero(state);
  const tank = unit(state, '강철의 브란');
  tank.hp = 400;

  check('등록하지 않은 스킬은 못 쓴다',
    L.castSkill(state, 'pyre', { uid: tank.uid }).ok, false);

  const before = hero.mp;
  check('개별 대상 힐이 나간다', cast(state, 'touch', { uid: tank.uid }).ok, true);
  check('회복량만큼 찬다', tank.hp, 400 + D.PLAYER_SKILLS.touch.heal);
  check('마나가 준다', hero.mp, before - D.PLAYER_SKILLS.touch.mp);

  // 기획서 6장: 스킬마다 독립된 쿨타임을 가진다.
  check('같은 스킬은 쿨타임 동안 다시 못 쓴다',
    L.castSkill(state, 'touch', { uid: tank.uid }).ok, false);
  check('다른 스킬은 영향을 받지 않는다',
    L.castSkill(state, 'quick', { uid: tank.uid }).ok, true);

  run(state, D.PLAYER_SKILLS.touch.cd + 0.1);
  check('쿨타임이 지나면 다시 쓸 수 있다',
    L.castSkill(state, 'touch', { uid: tank.uid }).ok, true);

  const poor = battle();
  L.hero(poor).mp = 5;
  check('마나가 모자라면 못 쓴다',
    L.castSkill(poor, 'touch', { uid: unit(poor, '강철의 브란').uid }).ok, false);
}

// --- 대상 지정 (기획서 8장) --------------------------------------------
{
  const state = battle({ skills: ['touch', 'ripple', 'sanctuary', 'flame', 'pyre'] });
  const tank = unit(state, '강철의 브란');
  const foe = AI.alive(state, 'enemy')[0];

  check('개별 대상 힐은 적에게 못 쓴다',
    L.castSkill(state, 'touch', { uid: foe.uid }).ok, false);
  check('개별 대상 힐은 위치로 못 쓴다',
    L.castSkill(state, 'touch', { x: 20, y: 20 }).ok, false);

  // 8.1 동료 초상화를 고르면 그 동료를 기준으로 발동한다.
  AI.alive(state, 'ally').forEach((u) => { u.hp = u.maxHp - 200; });
  const near = AI.alive(state, 'ally').filter((u) => AI.dist(u, tank) <= D.PLAYER_SKILLS.ripple.radius);
  check('범위 힐을 동료 기준으로 쓸 수 있다',
    cast(state, 'ripple', { uid: tank.uid }).ok, true);
  check('반경 안의 아군만 회복한다',
    AI.alive(state, 'ally').filter((u) => u.hp > u.maxHp - 200).length, near.length);

  // 8.2 전투 화면의 위치를 기준으로도 발동한다.
  check('장판을 위치에 깔 수 있다',
    cast(state, 'sanctuary', { x: 30, y: 28 }).ok, true);
  check('장판이 생긴다', state.zones.length, 1);
  check('장판은 고른 위치에 있다', [state.zones[0].x, state.zones[0].y], [30, 28]);

  // 사거리 밖에는 못 깐다. 주인공이 앞줄 쪽으로 붙어야 적 진영에 닿는다.
  check('사거리 밖에는 못 깐다', L.castSkill(state, 'pyre', { x: 95, y: 28 }).ok, false);
  L.hero(state).x = 60; L.hero(state).y = 28;
  check('적 장판은 위치로 깐다', cast(state, 'pyre', { x: 80, y: 28 }).ok, true);
  check('적 도트는 아군에게 못 건다',
    L.castSkill(state, 'flame', { uid: tank.uid }).ok, false);
  check('적 도트는 적에게 건다', cast(state, 'flame', { uid: foe.uid }).ok, true);
}

// --- 도트와 장판 -------------------------------------------------------
{
  const state = battle({ skills: ['regen', 'sanctuary', 'flame', 'touch', 'focus'] });
  const tank = unit(state, '강철의 브란');
  tank.hp = 200;
  const def = D.PLAYER_SKILLS.regen;
  // 여기서 보려는 것은 도트가 몇 번 째깍이는가다. 치명타가 터지면 회복량이
  // 달라져 아래 세는 방법이 그 째깍임을 놓친다.
  L.hero(state).crit = 0;

  cast(state, 'regen', { uid: tank.uid });
  check('도트는 즉시 회복시키지 않는다', tank.hp, 200);

  // 전투가 함께 굴러가므로 체력만 보면 적의 피해와 동료 힐이 섞인다. 이 도트가
  // 몇 번 째깍였는지는 회복량이 정확히 tick인 이벤트만 세면 알 수 있다.
  let ticks = 0;
  const countTicks = () => {
    for (const event of L.drainEvents(state)) {
      if (event.type === 'heal' && event.uid === tank.uid && event.amount === def.tick) ticks++;
    }
  };
  run(state, def.interval + 0.05);
  countTicks();
  check('한 번 째깍이면 한 번 회복', ticks, 1);

  // 지속 시간이 끝나면 더는 회복하지 않아야 한다. 마나 없이 무한히 차면 게임이 없다.
  run(state, def.duration + 3);
  countTicks();
  check('지속 시간만큼만 째깍인다', ticks, def.duration / def.interval);
  check('끝난 도트는 목록에서 빠진다',
    state.dots.filter((dot) => dot.targetUid === tank.uid).length, 0);

  // 같은 도트를 다시 걸면 쌓이지 않고 새로 고쳐진다.
  const stack = battle({ skills: ['regen', 'touch', 'quick', 'ripple', 'focus'] });
  const bran = unit(stack, '강철의 브란');
  bran.hp = 100;
  cast(stack, 'regen', { uid: bran.uid });
  // 쿨타임만 지나면 된다. 전투를 그만큼 굴리면 여기서 보려는 것(중첩 규칙)이
  // 아니라 그동안 파티가 버티는지가 결과를 가른다.
  L.skillSlot(stack, 'regen').readyAt = stack.t;
  cast(stack, 'regen', { uid: bran.uid });
  check('같은 도트는 겹쳐 걸리지 않는다',
    stack.dots.filter((d) => d.targetUid === bran.uid).length, 1);
}

// --- 마나 (기획서 7장) --------------------------------------------------
{
  const state = battle();
  const hero = L.hero(state);
  hero.mp = 40;
  run(state, 12);
  // **저절로 돌아오기는 하지만 아주 느리다.** 12초에 최대 마나의 5%가 안 된다 —
  // 힐 한 번 값을 벌기까지 십수 초라, 흘린 힐량이 그대로 손해라는 힐 판단의
  // 전제는 그대로다.
  const idle = hero.mp - 40;
  check('마나가 저절로 조금 돌아온다',
    idle > 0 && idle < hero.maxMp * 0.06, true);

  const beforeFocus = hero.mp;
  cast(state, 'focus', {});
  check('마나 회복 스킬로 찬다', hero.mp, beforeFocus + D.PLAYER_SKILLS.focus.mana);

  hero.mp = 10;
  check('마나 물약으로도 찬다', L.usePotion(state, 'mana').ok, true);
  check('최대 마나의 비율만큼 찬다', hero.mp, 10 + hero.maxMp * D.POTIONS.mana.ratio);
  check('물약이 하나 준다', state.potions.mana, 2);
  check('물약도 쿨타임이 있다', L.usePotion(state, 'mana').ok, false);

  const empty = battle();
  empty.potions.mana = 0;
  check('물약이 없으면 못 쓴다', L.usePotion(empty, 'mana').ok, false);

  // 최대치를 넘겨 채워지지 않아야 물약을 아껴 쓸 이유가 생긴다.
  const full = battle();
  L.hero(full).mp = L.hero(full).maxMp - 5;
  L.usePotion(full, 'mana');
  check('최대치를 넘지 않는다', L.hero(full).mp, L.hero(full).maxMp);

  // 체력 물약은 같은 쿨타임을 쓴다. 번갈아 마시는 것이 최선이 되면 물약
  // 관리가 아니라 손가락 싸움이 된다.
  const both = battle();
  L.hero(both).hp = 100;
  L.hero(both).mp = 10;
  check('체력 물약도 있다', L.usePotion(both, 'health').ok, true);
  check('체력이 찬다', L.hero(both).hp > 100, true);
  check('쿨타임은 둘이 함께 쓴다', L.usePotion(both, 'mana').ok, false);
}

// --- 마나 자연 회복 -----------------------------------------------------
//
// 아군과 적이 같은 규칙을 쓴다. 마나가 마르면 힐도 도발도 멈추는데, 그 상태로
// 남은 전투를 보내면 파티가 손 쓸 것 없이 깎이기만 한다.
{
  const state = battle();
  const foe = AI.alive(state, 'enemy').find((u) => u.maxMp > 0);
  const down = AI.alive(state, 'ally').find((u) => u.uid !== L.HERO_UID);
  L.hero(state).mp = 0;
  foe.mp = 0;
  down.mp = 0;
  L.applyDamage(state, null, down, 99999);

  run(state, 10);
  const share = (u) => u.mp / u.maxMp;
  const near = (a, b) => Math.abs(a - b) < 0.005;
  check('주인공의 마나가 초당 정해진 몫만큼 돈다',
    near(share(L.hero(state)), L.MANA_REGEN * 10), true);
  check('적도 같은 규칙을 쓴다', near(share(foe), L.MANA_REGEN * 10), true);
  check('쓰러진 유닛은 돌지 않는다', down.mp, 0);

  const full = battle();
  L.hero(full).mp = L.hero(full).maxMp;
  run(full, 5);
  check('최대치를 넘지 않는다', L.hero(full).mp, L.hero(full).maxMp);
}

// --- 피해 ---------------------------------------------------------------
{
  const state = battle();
  const foe = AI.alive(state, 'enemy')[0];

  // 방어력은 곱셈이라 피해가 0이 되는 구간이 없다.
  const soft = unit(state, '궁수 미라');
  const before = soft.hp;
  L.applyDamage(state, foe, soft, 100);
  check('방어력이 낮은 쪽이 더 아프다', soft.maxHp - soft.hp > 0, true);
  check('체력이 실제로 준다', soft.hp < before, true);
}

// --- 캐스팅 -------------------------------------------------------------
//
// 모든 스킬은 즉시 시전이거나 캐스팅이다. 캐스팅은 서서 외우는 동안 아무것도
// 못 하고, 스스로 움직이면 취소된다 — 그 손해가 있어야 두 종류를 나눈 뜻이 산다.
{
  const state = battle();
  const hero = L.hero(state);
  const tank = unit(state, '강철의 브란');
  tank.hp = 400;

  // 빠뜨린 스킬이 하나 있으면 사거리 없이 어디서나 나가는데, 화면에서는 티가
  // 나지 않고 그 스킬만 조용히 세진다.
  for (const [who, table] of [['주인공', D.PLAYER_SKILLS], ['동료·적', D.UNIT_SKILLS]]) {
    const missing = Object.values(table)
      .filter((def) => typeof def.cast !== 'number' || typeof def.range !== 'number');
    check(`${who} 스킬은 모두 시전 시간과 사거리를 적는다`, missing.map((def) => def.id), []);
  }

  check('즉시 시전 스킬도 있다', D.PLAYER_SKILLS.quick.cast, 0);
  check('즉시 시전은 바로 터진다',
    (() => { L.castSkill(state, 'quick', { uid: tank.uid }); return tank.hp > 400; })(), true);
  check('즉시 시전은 시전 상태를 남기지 않는다', hero.cast, null);

  tank.hp = 400;
  const before = hero.mp;
  L.castSkill(state, 'touch', { uid: tank.uid });
  check('캐스팅 스킬은 외우기 시작한다', hero.cast && hero.cast.skillId, 'touch');
  check('아직 회복되지 않았다', tank.hp, 400);
  check('마나는 시작할 때 낸다', hero.mp, before - D.PLAYER_SKILLS.touch.mp);
  check('시전 중에는 다른 스킬을 못 쓴다',
    L.castSkill(state, 'ripple', { uid: tank.uid }).reason, '시전 중');

  run(state, D.PLAYER_SKILLS.touch.cast + 0.1);
  check('시전 시간이 지나면 터진다', state.stats.healed > 0, true);
  check('끝나면 시전 상태가 지워진다', hero.cast, null);

  // 움직이면 취소된다.
  const moved = battle();
  const moving = L.hero(moved);
  const bran = unit(moved, '강철의 브란');
  bran.hp = 400;
  L.castSkill(moved, 'touch', { uid: bran.uid });
  const paid = moving.mp;
  L.moveToward(moved, moving, { x: moving.x + 20, y: moving.y }, L.TICK);
  check('움직이면 취소된다', moving.cast, null);
  run(moved, D.PLAYER_SKILLS.touch.cast + 0.1);
  check('취소된 스킬은 터지지 않는다', moved.stats.healed, 0);
  // 자원은 시작할 때 냈고 취소해도 돌아오지 않는다. 그래야 캐스팅 스킬을
  // 고르는 것이 판단이 된다.
  // 저절로 도는 몫이 있으므로 "줄어든 채로"가 아니라 "돌려받지 않았다"로 본다.
  check('낸 마나는 돌아오지 않는다',
    moving.mp < paid + D.PLAYER_SKILLS.touch.mp, true);
  check('쿨타임도 돈다', L.skillSlot(moved, 'touch').readyAt > moved.t, true);

  // 대열을 벌리는 힘은 이동이 아니다. 그것까지 취소로 치면 캐스팅 스킬이 아예
  // 나가지 않는다 — 밀어내기는 매 틱 일어난다.
  const pushed = battle();
  const shover = L.hero(pushed);
  unit(pushed, '강철의 브란').hp = 400;
  L.castSkill(pushed, 'touch', { uid: unit(pushed, '강철의 브란').uid });
  L.step(pushed, L.TICK);
  check('밀려나는 것은 취소가 아니다', pushed.units[0].cast !== null, true);

  // 동료의 캐스팅도 같은 규칙이다.
  const ally = battle();
  const noa = unit(ally, '사제 노아');
  const wounded = unit(ally, '강철의 브란');
  wounded.hp = wounded.maxHp - D.UNIT_SKILLS.greaterMend.heal;
  noa.x = wounded.x; noa.y = wounded.y;
  L.startCast(ally, noa, { id: 'mend', targetUid: wounded.uid });
  check('동료도 외운다', noa.cast && noa.cast.skillId, 'mend');
  check('아직 회복되지 않았다', wounded.hp, wounded.maxHp - D.UNIT_SKILLS.greaterMend.heal);
  ally.t += D.UNIT_SKILLS.mend.cast;
  L.tickCast(ally, noa);
  check('시전이 끝나면 회복시킨다', wounded.hp > wounded.maxHp - D.UNIT_SKILLS.greaterMend.heal, true);

  // 대상이 쓰러지면 거기서 끝난다. 죽은 것을 계속 외우면 그 시간이 통째로 손해다.
  const gone = battle();
  const healer = unit(gone, '사제 노아');
  const doomed = unit(gone, '검사 라일');
  doomed.hp = 1;
  L.startCast(gone, healer, { id: 'mend', targetUid: doomed.uid });
  doomed.dead = true;
  L.tickCast(gone, healer);
  check('대상이 쓰러지면 취소된다', healer.cast, null);
}

// --- 계열 스킬 ----------------------------------------------------------
//
// 계열마다 제 스킬을 가지고, 그중 넷만 들고 들어간다. 궁수와 마법사가 같은
// 스킬을 쓰던 때에는 둘을 고르는 것이 그림 고르기였다.
{
  const state = battle({ party: [{ defId: 'mira', level: 6 }, { defId: 'yuri', level: 6 },
    { defId: 'lyle', level: 6 }, { defId: 'sera', level: 6 }] });
  const kit = (name) => unit(state, name).skills.map((slot) => slot.id);

  check('궁수와 마법사가 다른 스킬을 쓴다',
    kit('궁수 미라').some((id) => kit('마법사 유리').indexOf(id) >= 0), false);
  check('전사와 도적도 다르다',
    kit('검사 라일').some((id) => kit('도적 세라').indexOf(id) >= 0), false);
  check('넷씩 들고 온다', kit('궁수 미라').length, D.UNIT_SKILL_MAX);

  // 스킬은 제 계열의 것만 들고 온다. 섞이면 편성 화면에 적힌 계열이 거짓말이 된다.
  for (const [name, spec] of [['궁수 미라', 'archer'], ['마법사 유리', 'mage'],
    ['검사 라일', 'warrior'], ['도적 세라', 'rogue']]) {
    check(`${D.SPECS[spec]}는 제 계열 스킬만 든다`,
      kit(name).every((id) => D.UNIT_SKILLS[id].spec === spec), true);
  }

  // 마나를 쓰는 계열은 스스로 되찾을 길이 있어야 한다. 넷으로 자르면서 마나
  // 회복 스킬이 밀려 나가면, 레벨이 오를수록 시전자가 더 빨리 멈춘다.
  //
  // **레벨 1부터 있어야 한다.** 물약은 인간형만 마시므로, 고블린 주술사에게는
  // 이 스킬이 마나를 되찾는 유일한 길이다. 열리는 레벨을 뒤로 미뤄 두었을 때에는
  // 저레벨 주술사가 한 번 마나를 쓰고 나면 남은 전투 내내 기본 공격만 했다.
  for (const spec of ['mage', 'priest', 'shaman']) {
    const has = (level) => D.skillsFor(spec, level)
      .some((id) => D.UNIT_SKILLS[id].kind === 'mana');
    check(`${D.SPECS[spec]}는 레벨 1부터 마나를 되찾는다`, has(1), true);
    check(`${D.SPECS[spec]}는 높은 레벨에서도 마나를 되찾는다`, has(12), true);
  }
}

// --- 비인간형은 물약을 못 마신다 ----------------------------------------
{
  // 적은 전부 비인간형이라 전투에 물약을 들고 오지 않는다. 직업 표만 보고
  // 채우던 동안에는 고블린 척후병이 체력 물약을 마셨다.
  const state = battle({});
  const drinkers = AI.alive(state, 'foe')
    .filter((u) => Object.values(u.potions).some((n) => n > 0))
    .map((u) => u.name);
  check('적은 물약을 들고 오지 않는다', drinkers, []);

  // 동료는 인간형이라 직업 표대로 채워진다.
  const bran = unit(state, '강철의 브란');
  check('인간형 동료는 물약을 든다', bran.potions.health > 0, true);
}

// --- 새 스킬 종류 -------------------------------------------------------
{
  const state = battle({ party: [{ defId: 'noa', level: 6 }, { defId: 'bran', level: 6 },
    { defId: 'mira', level: 8 }] });
  const noa = unit(state, '사제 노아');
  const bran = unit(state, '강철의 브란');
  const mira = unit(state, '궁수 미라');

  // 범위 회복: 기준점 주변 아군을 한 번에 채운다.
  AI.alive(state, 'ally').forEach((u) => { u.x = 40; u.y = 30; u.hp = u.maxHp - 200; });
  L.runUnitSkill(state, noa, { id: 'wave', targetUid: bran.uid });
  check('범위 회복은 반경 안을 다 채운다',
    AI.alive(state, 'ally').every((u) => u.hp > u.maxHp - 200), true);

  // 지속 회복: 즉시 차지 않고 시간을 두고 찬다.
  bran.hp = bran.maxHp - 400;
  const before = bran.hp;
  // 전투가 함께 굴러가므로 체력만 보면 적의 피해와 동료 힐이 섞인다. 이 도트가
  // 째깍였는지는 회복량이 정확히 tick인 이벤트로 가린다 — 치명타가 터지면 값이
  // 달라지므로 여기서만 꺼 둔다.
  noa.crit = 0;
  L.runUnitSkill(state, noa, { id: 'renew', targetUid: bran.uid });
  check('지속 회복은 즉시 채우지 않는다', bran.hp, before);
  L.drainEvents(state);
  run(state, D.UNIT_SKILLS.renew.interval + 0.05);
  check('시간이 지나면 찬다',
    L.drainEvents(state).some((e) => e.type === 'heal' && e.uid === bran.uid
      && e.amount === D.UNIT_SKILLS.renew.tick), true);

  // 마나 회복: 자기 마나를 되찾는다.
  noa.mp = 0;
  L.runUnitSkill(state, noa, { id: 'meditate', targetUid: noa.uid });
  check('마나 회복 스킬로 제 마나를 채운다', noa.mp, D.UNIT_SKILLS.meditate.mana);

  // 장판: 깐 자리에 남아 반대편을 깎는다.
  const foe = AI.alive(state, 'enemy')[0];
  L.runUnitSkill(state, mira, { id: 'poisonCloud', targetUid: foe.uid });
  check('장판이 생긴다', state.zones.length, 1);
  check('아군이 깐 장판은 적에게 걸린다', state.zones[0].side, 'enemy');

  // 적이 깐 장판은 아군에게 걸려야 한다. 예전에는 회복이면 아군, 아니면 적이라고
  // 보았는데 그것은 장판을 까는 것이 주인공뿐이던 때의 규칙이었다.
  const mirror = battle();
  const shaman = AI.alive(mirror, 'enemy').find((u) => u.job === 'healer')
    || AI.alive(mirror, 'enemy')[0];
  L.addZone(mirror, shaman, D.UNIT_SKILLS.poisonCloud, 40, 30, 'damage', 10);
  check('적이 깐 장판은 아군에게 걸린다', mirror.zones[0].side, 'ally');
}

// --- 마나가 없으면 기본 공격 -------------------------------------------
//
// 모든 직업에 걸리는 규칙이다. 마나가 바닥난 유닛이 남은 전투 내내 서 있으면
// 화면에서는 고장 난 것으로 보인다.
{
  const state = battle();
  for (const who of AI.alive(state, 'ally')) {
    check(`${who.name}은 기본 공격이 있다`, who.atk > 0 && isFinite(who.attackCd), true);
  }
  check('주인공도 예외가 아니다', L.hero(state).atk > 0, true);

  // 마나를 0으로 두고 굴려도 적은 계속 깎인다. 물약과 마나 회복 스킬까지
  // 없애야 남은 것이 기본 공격뿐이라는 것을 볼 수 있다.
  const dry = battle();
  for (const who of AI.alive(dry, 'ally')) {
    who.mp = 0;
    who.potions = { mana: 0, health: 0 };
    who.skills = who.skills.filter((slot) => D.UNIT_SKILLS[slot.id].mp > 0);
  }
  dry.potions = { mana: 0, health: 0 };
  const total = () => AI.alive(dry, 'enemy').reduce((sum, u) => sum + u.hp, 0);
  const before = total();
  run(dry, 12);
  check('마나가 없어도 적을 깎는다', total() < before, true);
  // 마나가 저절로 조금 돌아오므로 0인지로는 볼 수 없다. 들고 있는 스킬 중 가장
  // 싼 것에도 못 미치는지를 본다 — 하나라도 나갔으면 여기서 걸린다.
  check('스킬은 한 번도 나가지 않았다',
    AI.alive(dry, 'ally').every((u) =>
      u.mp < Math.min(...u.skills.map((slot) => D.UNIT_SKILLS[slot.id].mp))), true);
}

// --- 전장의 위아래 여백 -------------------------------------------------
//
// 유닛은 발밑을 기준으로 그려지고 몸통이 그 위로 뻗는다. 위쪽 여백이 없으면
// 맨 윗줄에 선 유닛의 머리가 화면 밖으로 잘린다.
{
  const state = battle();
  check('위쪽에 여백이 있다', D.FIELD.top > 0, true);
  check('아래쪽도 화면 안이다', D.FIELD.bottom < D.FIELD.h, true);

  for (const unit of state.units) {
    unit.y = unit.side === 'ally' ? -50 : 999;
  }
  run(state, 0.1);
  check('여백 밖으로 나가지 않는다',
    state.units.every((u) => u.y >= D.FIELD.top - 1e-6 && u.y <= D.FIELD.bottom + 1e-6), true);

  // 처음 세울 때부터 여백 안이다.
  const fresh = battle();
  check('배치도 여백 안에서 한다',
    fresh.units.every((u) => u.y >= D.FIELD.top && u.y <= D.FIELD.bottom), true);
}

// --- 무리 사이의 이동 ---------------------------------------------------
//
// 다음 무리가 있으면 그 자리에 적이 솟는 것이 아니라, 걸어가서 만나는 것으로
// 보여야 한다. 배경이 흘러가고 아군은 대열을 다시 짠다.
{
  const state = battle({ skills: ['touch', 'sanctuary'] });
  // 장판을 하나 깔아 둔 채로 무리를 정리한다. 장판은 유닛 좌표계에 있고 이동
  // 중에는 그 좌표가 그대로라, 배경만 흘러가면 장판이 파티를 따라오는 것으로
  // 보인다 — 시체를 치우는 것과 같은 이유로 두고 온다.
  cast(state, 'sanctuary', { uid: unit(state, '강철의 브란').uid });
  check('장판이 깔렸다', state.zones.length > 0, true);

  AI.alive(state, 'enemy').forEach((u) => L.applyDamage(state, null, u, 99999));
  // 대열이 흐트러진 상태에서 시작해야 다시 짜는 것이 보인다.
  AI.alive(state, 'ally').forEach((u) => { u.x = 80; });
  run(state, 0.2);
  check('무리를 정리하면 이동이 시작된다', state.marching, true);
  check('깔아 둔 장판은 두고 온다', state.zones, []);

  const scrolled = state.scroll;
  run(state, 1);
  check('배경이 흘러간다', state.scroll > scrolled, true);
  check('아군이 제자리로 대열을 다시 짠다',
    AI.alive(state, 'ally').every((u) => !u.speed || u.x < 80), true);

  // **이동 중에도 시전은 이어진다.** 대열을 다시 짜자고 끌고 가면 그 순간
  // 시전이 취소되는데, 무리 사이는 사람이 힐을 넣는 자리라 누른 스킬이 그냥
  // 사라지는 것으로 보인다.
  const hurt = unit(state, '강철의 브란');
  hurt.hp = hurt.maxHp - 400;
  check('이동 중에도 스킬을 쓸 수 있다',
    L.castSkill(state, 'touch', { uid: hurt.uid }).ok, true);
  check('외우는 중에는 걸음을 멈춘다',
    (() => { const at = L.hero(state).x; run(state, 0.3); return L.hero(state).x === at; })(), true);
  const healedBefore = state.stats.healed;
  run(state, L.playerSkill(state, 'touch').cast + 0.2);
  check('이동 중에 건 힐이 실제로 들어간다', state.stats.healed > healedBefore, true);

  run(state, L.WAVE_GAP);
  check('다음 무리가 나온다', state.waveIndex, 1);
  check('이동이 끝난다', state.marching, false);
  check('싸우는 동안에는 배경이 멈춘다',
    (() => { const at = state.scroll; run(state, 1); return state.scroll === at; })(), true);
}

// --- 무리 사이의 회복 ---------------------------------------------------
//
// 걸어가는 동안 살아 있는 아군이 체력과 마나를 최대치의 25%만큼 되찾는다.
{
  const state = battle();
  const hurt = AI.alive(state, 'ally');
  hurt.forEach((u) => { u.hp = Math.round(u.maxHp * 0.3); u.mp = 0; });
  // 한 명은 쓰러진 채로 둔다. 걸어서 회복하는 것은 쉬는 것이지 부활이 아니다.
  const down = unit(state, '강철의 브란');
  L.applyDamage(state, null, down, 99999);

  AI.alive(state, 'enemy').forEach((u) => L.applyDamage(state, null, u, 99999));
  // 이동이 시작된 뒤에 기준을 잡는다. 그 앞의 한 틱은 아직 전투라 자동 물약이
  // 들어가고, 그것까지 세면 회복량이 이동 몫보다 커진다.
  L.step(state, L.TICK);
  check('이동이 시작된다', state.marching, true);
  const before = AI.alive(state, 'ally').map((u) => ({ hp: u.hp / u.maxHp, mp: u.mp / u.maxMp }));

  L.step(state, L.TICK);
  check('걸어가는 동안 조금씩 차오른다',
    AI.alive(state, 'ally').every((u, i) => u.hp / u.maxHp > before[i].hp), true);

  // 다음 무리가 솟기 전까지만 굴린다. 무리가 나오면 앞줄이 다시 맞기 시작해
  // 회복량이 아니라 전투 결과를 보게 된다.
  while (state.marching) L.step(state, L.TICK);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  check('체력이 최대치의 25%만큼 늘었다',
    AI.alive(state, 'ally').every((u, i) => near(u.hp / u.maxHp - before[i].hp, L.MARCH_RECOVER)), true);
  // 마나는 걸어가는 동안에도 저절로 도는 몫(MANA_REGEN)이 함께 붙는다.
  const walked = L.MARCH_RECOVER + L.MANA_REGEN * L.WAVE_GAP;
  check('마나도 같은 몫만큼 늘었다',
    AI.alive(state, 'ally').every((u, i) => near(u.mp / u.maxMp - before[i].mp, walked)), true);
  check('쓰러진 동료는 일어나지 않는다', AI.byUid(state, down.uid).hp, 0);
}

// --- 웨이브와 승패 -----------------------------------------------------
{
  const state = battle();
  AI.alive(state, 'enemy').forEach((u) => L.applyDamage(state, null, u, 99999));
  run(state, 0.1);
  check('아직 다음 웨이브는 아니다', state.waveIndex, 0);
  run(state, L.WAVE_GAP + 0.2);
  check('시간이 지나면 다음 웨이브', state.waveIndex, 1);

  AI.alive(state, 'enemy').forEach((u) => L.applyDamage(state, null, u, 99999));
  run(state, L.WAVE_GAP + 0.2);
  check('마지막 웨이브를 넘기면 승리', state.status, 'won');
  check('끝난 뒤에는 스킬이 나가지 않는다',
    L.castSkill(state, 'touch', { uid: unit(state, '강철의 브란').uid }).ok, false);

  const wipe = battle();
  AI.alive(wipe, 'ally').forEach((u) => L.applyDamage(wipe, null, u, 99999));
  run(wipe, 0.1);
  check('파티가 전멸하면 패배', wipe.status, 'lost');

  // **주인공이 쓰러져도 전투는 이어진다.** 조작할 것이 없어졌다는 이유로 끝내면
  // 남은 넷이 이길 수 있는 판까지 함께 사라진다.
  const dead = battle();
  L.applyDamage(dead, null, L.hero(dead), 99999);
  run(dead, 0.5);
  check('주인공이 쓰러져도 계속한다', dead.status, 'fighting');
  check('동료는 남아 있었다', AI.alive(dead, 'ally').length > 0, true);
  check('스킬은 더 못 쓴다',
    L.castSkill(dead, 'touch', { uid: AI.alive(dead, 'ally')[0].uid }).reason, '쓰러졌다');

  // 남은 동료가 다 정리하면 주인공이 없어도 이긴다.
  AI.alive(dead, 'enemy').forEach((u) => L.applyDamage(dead, null, u, 99999));
  run(dead, L.WAVE_GAP + 0.2);
  AI.alive(dead, 'enemy').forEach((u) => L.applyDamage(dead, null, u, 99999));
  run(dead, L.WAVE_GAP + 0.2);
  check('주인공 없이도 이길 수 있다', dead.status, 'won');

  // 마지막 하나까지 쓰러져야 진다.
  const wiped = battle();
  AI.alive(wiped, 'ally').forEach((u) => L.applyDamage(wiped, null, u, 99999));
  run(wiped, 0.1);
  check('전부 쓰러지면 그때 진다', wiped.status, 'lost');
}

// --- 레벨과 성장 --------------------------------------------------------
{
  // 적은 의뢰의 적정 레벨을 따라 세진다. 레벨마다 다른 유닛을 적어 두지 않고
  // 곱해 쓰는 것이 규칙이므로, 실제로 곱해지는지 확인한다.
  const low = battle({ quest: quest({ level: 1 }) });
  const high = battle({ quest: quest({ level: 10 }) });
  const foeOf = (state) => AI.alive(state, 'enemy')[0];
  check('적정 레벨이 높으면 적이 단단하다', foeOf(high).maxHp > foeOf(low).maxHp, true);
  check('적정 레벨이 높으면 적이 아프다', foeOf(high).atk > foeOf(low).atk, true);
  check('적도 레벨을 들고 있다', foeOf(high).level, 10);

  // 동료도 레벨로 세지고, 못 배운 스킬은 들고 오지 않는다.
  const rookie = battle({ party: [{ defId: 'bran', level: 1 }] });
  const veteran = battle({ party: [{ defId: 'bran', level: 8 }] });
  const branOf = (state) => unit(state, '강철의 브란');
  check('동료도 레벨로 세진다', branOf(veteran).maxHp > branOf(rookie).maxHp, true);
  check('낮은 레벨은 광역 도발을 못 쓴다',
    branOf(rookie).skills.map((slot) => slot.id), ['taunt', 'bash']);
  // 순서는 data.js에 적힌 그대로다 — 그 순서가 곧 AI의 우선순위이자 넷을 고르는
  // 순서다. 레벨이 오르면 앞쪽이 열리면서 뒤쪽의 싸구려 스킬이 밀려난다.
  check('레벨이 오르면 들고 온다',
    branOf(veteran).skills.map((slot) => slot.id), ['roar', 'taunt', 'sweep', 'slam']);
  check('넷을 넘겨 들고 가지 않는다',
    branOf(veteran).skills.length <= D.UNIT_SKILL_MAX, true);
  // 동료가 쓰는 계열은 목록이 넷보다 길어야 "그중 넷"이 고르는 일이 된다.
  // 적 전용 계열(잡졸)은 예외다 — 고블린은 넷을 채울 만큼 배운 것이 없다.
  const companionSpecs = new Set(Object.values(D.COMPANIONS).map((def) => def.spec));
  check('동료 계열은 목록이 넷보다 길다',
    [...companionSpecs].every((spec) => D.SPEC_SKILLS[spec].length > D.UNIT_SKILL_MAX), true);

  // 주인공의 수치는 성장 상태에서 계산해 넘어온다. 전투가 레벨 규칙을 다시
  // 알지 못하게 하려는 것이라, 넘긴 값이 그대로 쓰여야 한다.
  // 능력치를 넘기면 그것이 곧 수치가 된다. 체력 100 → 최대 체력 1400.
  const strong = battle({ heroStats: { attrs: { str: 8, agi: 10, int: 60, vit: 100 }, armor: 0.5 } });
  check('체력이 최대 체력을 정한다', L.hero(strong).maxHp, 100 * D.ATTR.hpPerVit);
  check('지능이 최대 마나를 정한다', L.hero(strong).maxMp, 60 * D.ATTR.mpPerInt);

  const tank = unit(strong, '강철의 브란');
  tank.hp = 100;
  cast(strong, 'touch', { uid: tank.uid });
  // 지능 60은 기준(25)의 2.4배 → 회복량은 그 몫의 40%만 받아 ×1.56.
  const power = 1 + (60 / D.HERO.attrs.int - 1) * D.ATTR.healRatio;
  check('지능이 회복량을 올린다', tank.hp, 100 + Math.round(D.PLAYER_SKILLS.touch.heal * power));

  // 피해에는 곱해지지 않는다. 힐러의 성장이 딜러 노릇을 잘하게 만드는 쪽으로
  // 흐르면 이 게임이 아니게 된다.
  // 마법 피해도 지능을 타지만 계수가 회복량보다 작다 — 힐러의 성장이 딜러
  // 노릇을 잘하게 만드는 쪽으로 흐르면 이 게임이 아니게 된다.
  const flame = battle({ skills: ['flame'],
    heroStats: { attrs: { str: 8, agi: 10, int: 60, vit: 70 }, armor: 0.9 } });
  const foe = AI.alive(flame, 'enemy')[0];
  L.hero(flame).x = foe.x - 10; L.hero(flame).y = foe.y;
  cast(flame, 'flame', { uid: foe.uid });
  const dot = flame.dots.find((entry) => entry.targetUid === foe.uid);
  check('지능이 마법 피해도 올린다', dot.amount > D.PLAYER_SKILLS.flame.tick, true);
  check('회복량보다는 덜 오른다',
    dot.amount / D.PLAYER_SKILLS.flame.tick < power, true);
}

// --- 치명타 ------------------------------------------------------------
{
  // 난수를 직접 넣어 확률을 확정한다. 굴려서 확인하면 "가끔 터진다"까지만 알 수
  // 있고, 회피가 몇 번 어떻게 끼어드는지는 볼 수 없다.
  const state = battle();
  const source = { crit: 0.5, critDamage: 2, side: 'ally' };
  const rolls = [];
  state.rng = () => rolls.shift();

  const soft = { dodge: 0 };
  const nimble = { dodge: D.ATTR.dodgeCap };

  rolls.push(0.9);
  check('확률을 넘기면 그냥 맞는다', L.rollCrit(state, source, soft), 1);

  rolls.push(0.1);
  check('확률 안이면 터진다', L.rollCrit(state, source, soft), 2);

  // 회피는 두 번 끼어든다. 먼저 터진 치명타를 무른다.
  rolls.push(0.4);
  check('회피가 있으면 같은 값에도 안 터진다', L.rollCrit(state, source, nimble), 1);

  // 그래도 터지면 추가 피해를 깎는다. 회피가 상한이면 절반이다.
  rolls.push(0.1);
  check('터져도 추가 피해가 깎인다', L.rollCrit(state, source, nimble), 1.5);

  // 회복에는 막는 쪽이 없다 — 아군에게 가는 것이라 피할 이유가 없다.
  rolls.push(0.4);
  check('회복은 회피가 끼어들지 않는다', L.rollCrit(state, source, null), 2);

  check('때리는 쪽이 없으면 터지지 않는다', L.rollCrit(state, null, soft), 1);
  check('치명타가 없는 쪽도 터지지 않는다',
    L.rollCrit(state, { crit: 0, critDamage: 3 }, soft), 1);
}

// --- 치명타가 실제 피해와 회복에 반영되는가 -----------------------------
{
  // 반드시 터지게 해 두고 값을 본다.
  const state = battle();
  const foe = AI.alive(state, 'enemy')[0];
  const dealer = unit(state, '검사 라일');
  dealer.crit = 1;
  dealer.critDamage = 2;
  foe.dodge = 0;
  foe.armor = 1;

  const before = foe.hp;
  L.applyDamage(state, dealer, foe, 100);
  check('치명타면 피해가 배수만큼', before - foe.hp, 200);

  const events = L.drainEvents(state);
  check('화면에 치명타라고 알린다',
    events.some((event) => event.type === 'damage' && event.crit), true);

  // 회복도 터진다.
  const healer = L.hero(state);
  healer.crit = 1;
  healer.critDamage = 2;
  const tank = unit(state, '강철의 브란');
  tank.hp = 100;
  cast(state, 'touch', { uid: tank.uid });
  check('회복도 배수만큼 터진다', tank.hp, 100 + D.PLAYER_SKILLS.touch.heal * 2);

  // 도트와 장판도 터진다 — 피할 수는 없지만 급소는 내줄 수 있다.
  const dot = battle({ skills: ['flame', 'touch', 'quick', 'regen', 'focus'] });
  const target = AI.alive(dot, 'enemy').find((u) => u.job === 'tank')
    || AI.alive(dot, 'enemy')[0];
  target.dodge = 0;
  target.armor = 1;
  L.hero(dot).crit = 1;
  L.hero(dot).critDamage = 2;
  L.hero(dot).x = target.x - 10; L.hero(dot).y = target.y;
  cast(dot, 'flame', { uid: target.uid });
  const hpBefore = target.hp;
  run(dot, D.PLAYER_SKILLS.flame.interval + 0.05);
  const ticked = hpBefore - target.hp;
  check('도트도 터진다', ticked >= D.PLAYER_SKILLS.flame.tick * 2, true);
}

// --- 광역 도발 ----------------------------------------------------------
{
  const state = battle({ party: [{ defId: 'bran', level: 8 }, { defId: 'mira', level: 1 }] });
  const bran = unit(state, '강철의 브란');
  const mira = unit(state, '궁수 미라');
  const foes = AI.alive(state, 'enemy');

  // 적을 탱커 주위로 모으고 전부 딴 곳을 보게 한다.
  bran.x = 50; bran.y = 23;
  foes.forEach((foe, i) => { foe.x = 54 + i * 3; foe.y = 23; foe.targetUid = mira.uid; });

  const choice = AI.chooseSkill(bran, state, foes[0]);
  check('여럿이 풀리면 광역 도발을 고른다', choice && choice.id, 'roar');

  L.step(state, L.TICK);
  check('반경 안의 적을 전부 끌어온다',
    AI.alive(state, 'enemy').every((foe) => foe.targetUid === bran.uid), true);

  // 하나만 풀렸을 때 긴 쿨타임을 쓰면 정작 여럿이 풀렸을 때 쓸 것이 없다.
  const single = battle({ party: [{ defId: 'bran', level: 8 }, { defId: 'mira', level: 1 }] });
  const tank2 = unit(single, '강철의 브란');
  const others = AI.alive(single, 'enemy');
  tank2.x = 50; tank2.y = 23;
  others.forEach((foe, i) => { foe.x = 54 + i * 3; foe.y = 23; foe.targetUid = tank2.uid; });
  others[0].targetUid = unit(single, '궁수 미라').uid;
  const one = AI.chooseSkill(tank2, single, others[0]);
  check('하나만 풀리면 단일 도발', one && one.id, 'taunt');
}

// --- 전투 보상 ----------------------------------------------------------
{
  const state = battle();
  AI.alive(state, 'enemy').forEach((u) => L.applyDamage(state, null, u, 99999));
  run(state, L.WAVE_GAP + 0.2);
  AI.alive(state, 'enemy').forEach((u) => L.applyDamage(state, null, u, 99999));
  run(state, L.WAVE_GAP + 0.2);

  const reward = L.rewardOf(state);
  check('이겼다', reward.won, true);
  check('처치 경험치가 들어간다', reward.kills > 0, true);
  check('길드 몫을 그대로 받는다', reward.guild, quest().guildReward.exp);
  check('골드는 이겼을 때만', reward.gold, quest().guildReward.gold);

  // 힐로도 직업 경험치가 쌓인다. 흘린 힐은 세지 않는다 — 마나를 아껴 쓸 이유를
  // 경험치가 무너뜨리면 안 된다.
  const healer = battle();
  const tank = unit(healer, '강철의 브란');
  tank.hp = 100;
  cast(healer, 'touch', { uid: tank.uid });
  const healed = L.rewardOf(healer);
  check('회복이 직업 경험치가 된다', healed.healExp > 0, true);
  check('직업 경험치에 회복 몫이 들어 있다',
    healed.jobExp >= healed.healExp, true);

  const wasted = battle();
  cast(wasted, 'touch', { uid: unit(wasted, '강철의 브란').uid });
  check('흘린 힐은 경험치가 되지 않는다', L.rewardOf(wasted).healExp, 0);

  // 실패해도 길드 몫의 절반은 받는다. 아무것도 없이 끝나면 어려운 의뢰를
  // 시도할 이유가 사라진다.
  const lost = battle();
  AI.alive(lost, 'ally').forEach((u) => L.applyDamage(lost, null, u, 99999));
  run(lost, 0.1);
  const failure = L.rewardOf(lost);
  check('졌다', failure.won, false);
  check('길드 몫의 절반', failure.guild, Math.round(quest().guildReward.exp * 0.5));
  check('골드는 없다', failure.gold, 0);
}

// --- 스킬 레벨 ----------------------------------------------------------
{
  // 직업 레벨로 올린 스킬은 더 많이 회복하고 마나를 더 먹는다. 효과보다 마나가
  // 천천히 오르는 것이 올릴 이유를 남긴다.
  const one = battle();
  const five = battle({ skillLevels: { touch: 5 } });
  check('레벨을 안 주면 1레벨', L.playerSkill(one, 'touch').level, 1);
  check('레벨을 주면 그 레벨', L.playerSkill(five, 'touch').level, 5);

  const low = L.playerSkill(one, 'touch');
  const high = L.playerSkill(five, 'touch');
  check('회복량이 오른다', high.heal > low.heal, true);
  check('소비 마나가 오른다', high.mp > low.mp, true);
  check('마나가 효과보다 덜 오른다', (high.mp / low.mp) < (high.heal / low.heal), true);
  check('쿨타임은 그대로', high.cd, low.cd);
  check('사거리도 그대로', high.range, low.range);

  // 실제로 나가는 힐도 올라야 한다. 정의만 바뀌고 전투가 옛 값을 보면 점수를
  // 넣은 것이 화면의 숫자로만 남는다.
  const healed = (state) => {
    const tank = unit(state, '강철의 브란');
    tank.hp = 1;
    cast(state, 'touch', { uid: tank.uid });
    return tank.hp - 1;
  };
  check('전투에서도 더 회복한다', healed(five) > healed(one), true);

  // 저장본이 이상해도 범위 밖으로 나가지 않는다.
  const wild = battle({ skillLevels: { touch: 99 } });
  check('레벨은 상한까지', L.playerSkill(wild, 'touch').level, D.SKILL.max);

  // 마나도 실제로 그만큼 먹는다.
  const drain = battle({ skillLevels: { quick: 5 } });
  const hero = L.hero(drain);
  const before = hero.mp;
  cast(drain, 'quick', { uid: unit(drain, '강철의 브란').uid });
  check('올린 만큼 마나를 낸다', before - hero.mp, L.playerSkill(drain, 'quick').mp);
}

// --- 주인공의 장비 ------------------------------------------------------
{
  // 캐릭터 창이 계산한 최종 수치가 그대로 전투에 들어가야 한다. 전투가 능력치만
  // 보고 다시 계산하던 동안에는 장비를 낀 주인공이 창과 전투에서 다른 체력을
  // 가졌다.
  const gear = { hp: 200, mp: 50, atk: 0.3, heal: 0.25, armor: -0.05, crit: 0.05, dodge: 0.03 };
  const attrs = D.attrsAt(D.HERO, 5, null);
  const stats = Object.assign({ attrs }, D.withGear(D.derive(D.HERO, attrs), gear, D.HERO.armor));
  const state = battle({ heroLevel: 5, heroStats: stats });
  const hero = L.hero(state);
  check('체력이 장비를 탄다', hero.maxHp, stats.hp);
  check('마나도 장비를 탄다', hero.maxMp, stats.mp);
  check('회복력도 장비를 탄다', hero.healPower, stats.heal);
  check('치명타도 장비를 탄다', hero.crit, stats.crit);
  check('회피도 장비를 탄다', hero.dodge, stats.dodge);
  check('받는 피해도 장비를 탄다', hero.armor, stats.armor);

  // 상한은 능력치로 올린 것이든 장비로 올린 것이든 같이 걸린다.
  const capped = D.withGear(D.derive(D.HERO, attrs), { dodge: 1, crit: 1, critDamage: 5 },
    D.HERO.armor);
  check('회피 상한', capped.dodge, D.ATTR.dodgeCap);
  check('치명타 상한', capped.crit, D.ATTR.critCap);
  check('치명타 피해 상한', capped.critDamage, D.ATTR.critDamageCap);
}

// --- 전투 리포트 --------------------------------------------------------
{
  // 전투가 끝난 뒤 캐릭터별로 무엇을 했는지. 화면이 이 숫자를 그대로 그린다.
  const state = battle();
  const tank = unit(state, '강철의 브란');
  tank.hp = tank.maxHp - 200;
  cast(state, 'touch', { uid: tank.uid });
  run(state, 6);

  const rows = L.battleReport(state);
  check('아군만 줄을 갖는다', rows.length,
    state.units.filter((u) => u.side === 'ally').length);
  check('주인공이 첫 줄', rows[0].uid, L.HERO_UID);

  const hero = rows[0];
  check('주인공의 힐량이 잡힌다', hero.healed > 0, true);
  // 힐량 합계는 전투 통계와 같은 수를 보아야 한다. 두 곳에서 따로 세면 결과
  // 화면의 위아래가 서로 다른 숫자를 말한다.
  check('주인공 힐량이 전투 통계와 맞는다', hero.healed, Math.round(state.stats.healed));

  const dealt = rows.reduce((sum, row) => sum + row.dealt, 0);
  check('아군이 준 피해가 잡힌다', dealt > 0, true);
  check('아군이 준 피해가 전투 통계와 맞는다', dealt, Math.round(state.stats.damage));

  const wounded = rows.filter((row) => row.taken > 0);
  check('맞은 만큼 받은 피해가 쌓인다', wounded.length > 0, true);

  // 쓰러진 동료도 줄에서 빠지지 않는다. 죽은 캐릭터가 사라지면 왜 졌는지가
  // 리포트에서 지워진다.
  const fallen = battle();
  const mira = unit(fallen, '궁수 미라');
  L.applyDamage(fallen, null, mira, 99999);
  const row = L.battleReport(fallen).find((entry) => entry.name === mira.name);
  check('쓰러진 동료도 남는다', Boolean(row), true);
  check('쓰러진 것으로 표시된다', row.dead, true);
  check('받은 피해가 남는다', row.taken > 0, true);
}

// --- 재현성 -------------------------------------------------------------
{
  const digest = (seed) => {
    const state = L.createBattle({ quest: quest({ waves: [['scout', 'scout', 'orc', 'shaman']] }),
      party: PARTY, skills: SKILLS, seed });
    run(state, 40);
    return state.units.map((u) => `${u.uid}:${Math.round(u.hp)}`).join(',');
  };
  check('같은 씨앗이면 같은 전투', digest(11), digest(11));
  check('다른 씨앗이면 달라진다', digest(11) === digest(12), false);
}

// --- 난이도 확인 --------------------------------------------------------
//
// 힐러가 게임의 전부이므로, "가만히 둬도 이긴다"면 이 게임은 성립하지 않는다.
// 고정한 판이 아니라 **실제로 생성되는 의뢰**로 잰다 — 자료를 손볼 때마다 고정
// 판만 맞춰 두면 게시판에 실제로 걸리는 의뢰가 어떤지는 아무도 모르게 된다.
{
  const Q = require('./quests.js');
  const R = require('./roster.js');

  function autoHeal(state) {
    const hero = L.hero(state);
    if (hero.dead) return;
    const has = (id) => state.skills.some((slot) => slot.id === id);
    const ready = (id) => { const slot = L.skillSlot(state, id); return slot && state.t >= slot.readyAt; };
    // 스킬에 사거리가 생겼으므로 닿는 것만 고른다. 닿지 않는 대상을 붙들고
    // 있으면 그동안 아무도 회복하지 못한다.
    const reaches = (u, id) => AI.dist(hero, u) <= D.PLAYER_SKILLS[id].range;

    // 적 딜러가 힐러를 먼저 노리는 규칙이 들어온 뒤로 주인공이 표적이 된다.
    // 사람이라면 제 물약부터 마시므로 여기서도 그렇게 한다.
    if (hero.hp / hero.maxHp <= 0.4 && state.potions.health > 0 && state.t >= state.potionReadyAt) {
      return void L.usePotion(state, 'health');
    }
    if (has('focus') && hero.mp < 50 && ready('focus')) return void L.castSkill(state, 'focus', {});
    if (hero.mp < 30 && state.potions.mana > 0 && state.t >= state.potionReadyAt) {
      return void L.usePotion(state, 'mana');
    }

    const hurt = AI.alive(state, 'ally').filter((u) => u.hp < u.maxHp)
      .sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp));
    if (!hurt.length) return;
    // 죽기 직전인 사람이 있으면 많이 깎인 사람보다 먼저다. 깎인 양으로만
    // 고르면 체력이 큰 탱커가 늘 이겨서 후열이 그냥 죽는다.
    const dying = hurt.filter((u) => u.hp / u.maxHp <= 0.35)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    const worst = dying || hurt[0];
    const missing = worst.maxHp - worst.hp;
    const clustered = hurt.filter((u) => AI.dist(u, worst) <= D.PLAYER_SKILLS.ripple.radius
      && u.maxHp - u.hp >= D.PLAYER_SKILLS.ripple.heal);
    if (has('ripple') && clustered.length >= 2 && reaches(worst, 'ripple') && ready('ripple')
      && hero.mp >= D.PLAYER_SKILLS.ripple.mp) {
      return void L.castSkill(state, 'ripple', { uid: worst.uid });
    }
    if (has('regen') && missing >= 200 && reaches(worst, 'regen') && ready('regen')) {
      return void L.castSkill(state, 'regen', { uid: worst.uid });
    }
    if (missing >= 115 && reaches(worst, 'touch') && ready('touch')) return void L.castSkill(state, 'touch', { uid: worst.uid });
    if (missing >= 60 && reaches(worst, 'quick') && ready('quick')) return void L.castSkill(state, 'quick', { uid: worst.uid });
  }

  // 점수를 고르게 나눈 주인공의 수치. progress.js를 거치지 않고 만드는 것은
  // 저장·인벤토리 없이 능력치만 보려는 것이기 때문이다.
  function heroAt(level) {
    const each = Math.floor((level - 1) * D.ATTR.pointsPerLevel / 4);
    const spent = { str: each, agi: each, int: each, vit: each };
    return { attrs: D.attrsAt(D.HERO, level, spent), armor: D.HERO.armor };
  }

  // 게시판에서 사람이 고를 법한 의뢰: 내 레벨에 가장 가까운 것과, 확실히 벅찬 것.
  function questAt(playerLevel, seed, wanted) {
    const quests = Q.generate(playerLevel, seed);
    return quests.slice().sort((a, b) =>
      Math.abs(a.level - wanted) - Math.abs(b.level - wanted))[0];
  }

  function play(playerLevel, seed, wanted, withHealer) {
    const quest = questAt(playerLevel, seed, wanted);
    const roster = R.create(seed);
    const candidates = Q.companionsFor(quest, roster, seed);
    // 탱커 하나, 힐러 하나, 나머지는 딜러 — 사람이 짤 법한 편성.
    const party = [];
    for (const job of ['tank', 'healer', 'dealer', 'dealer']) {
      const found = candidates.find((m) => R.jobOf(m) === job && !party.includes(m));
      if (found) party.push(found);
    }
    for (const member of party) member.level = quest.level;

    const state = L.createBattle({
      quest,
      party: party.map(R.toParty),
      skills: ['touch', 'quick', 'regen', 'ripple', 'focus'],
      // 점수를 네 능력치에 고르게 나눈 주인공. 한쪽에 몰면 그쪽이 세지므로
      // 난이도를 잴 때는 치우치지 않은 쪽을 기준으로 삼는다.
      heroStats: heroAt(playerLevel),
      heroLevel: playerLevel,
      potions: { mana: 3, health: 1 },
      seed,
    });

    let sinceInput = 0;
    for (let i = 0; i < 300 / L.TICK && state.status === 'fighting'; i++) {
      L.step(state, L.TICK);
      sinceInput += L.TICK;
      if (withHealer && sinceInput >= 0.2) { sinceInput = 0; autoHeal(state); }
      L.drainEvents(state);
    }
    return state.status;
  }

  // **씨앗 스물넷으로 재고 기준을 비율로 잡는다.** 판 수를 세는 기준은 참값이
  // 기준선 근처일 때 동전 던지기가 된다 — 벅찬 의뢰를 손 놓고 깨는 참값이
  // 15%쯤인데 열둘에서 "둘 이하"를 요구하면 우연히 셋이 나오는 판이 네 번에
  // 한 번꼴이다. 판을 늘리고 기준을 참값에서 넉넉히 떨어뜨렸다.
  const seeds = [];
  for (let i = 1; i <= 24; i++) seeds.push(i * 11);
  const wins = (playerLevel, wanted, withHealer) =>
    seeds.filter((seed) => play(playerLevel, seed, wanted, withHealer) === 'won').length;
  const rate = (playerLevel, wanted, withHealer) =>
    wins(playerLevel, wanted, withHealer) / seeds.length;

  // 적정 레벨이 내 레벨과 같은 의뢰는 힐이 들어가면 대체로 넘어간다.
  check('알맞은 의뢰는 힐이 들어가면 깬다', rate(6, 6, true) >= 0.5, true);

  // 벅찬 의뢰(적정 레벨 +3)는 손을 놓으면 넘어가지 못한다.
  check('벅찬 의뢰는 손을 놓으면 거의 못 깬다', rate(6, 9, false) <= 0.35, true);

  // 힐이 들어가도 적지 않게 진다. 그래서 "벅참"이다 — 여기서 다 이기면 게시판의
  // 난이도 표시가 거짓말이 된다. 위 자동 힐러는 사람보다 서투르므로 실제로는
  // 이보다 잘 나온다.
  const hard = rate(6, 9, true);
  check('벅찬 의뢰는 힐이 들어가도 만만치 않다', hard >= 0.3 && hard <= 0.9, true);

  // 어느 레벨에서든 힐이 들어간 쪽이 더 많이 이겨야 한다. 이 게임에서 플레이어가
  // 하는 일이 그것뿐이다.
  for (const level of [3, 8, 14]) {
    check(`Lv${level}: 힐이 들어간 쪽이 더 이긴다`,
      wins(level, level + 2, true) > wins(level, level + 2, false), true);
  }
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

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
  // 불꽃은 성기사의 것이 되면서 사거리가 26으로 줄었다. 여기서 보려는 것은
  // 사거리가 아니라 대상이 갈리는가라, 적을 사거리 안으로 옮긴다.
  foe.x = 78; foe.y = 28;
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

// --- 같은 계열이라도 캐릭터마다 다른 넷을 든다 --------------------------
//
// 계열만 같으면 누구나 같은 넷을 들던 때에는 사제 둘을 나란히 놓아도 다를 것이
// 없었다. 씨앗은 이름이다 — **이름이 곧 신원이라** 같은 동료는 언제 봐도 같은
// 넷을 들고 오고, 저장본에 스킬 목록을 적어 둘 필요가 없다.
{
  const level = 8;
  const seedOf = (name) => D.skillSeed(name);
  const hands = ['사제 노아', '수도사 딘', '고요한 레아', '푸른 베라', '기도하는 이샤']
    .map((name) => D.skillsFor('priest', level, seedOf(name)).join(','));

  check('같은 이름이면 같은 넷',
    D.skillsFor('priest', level, seedOf('사제 노아')).join(','), hands[0]);
  check('이름이 다르면 손이 갈린다', new Set(hands).size > 1, true);
  check('그래도 넷을 넘지 않는다',
    hands.every((hand) => hand.split(',').length <= D.UNIT_SKILL_MAX), true);

  // 계열의 정체가 걸린 스킬은 늘 들어간다. 도발 없는 탱커나 힐이 없는 사제는
  // 그 계열이 아니다.
  const core = (spec) => D.SPEC_SKILLS[spec].filter((id) => D.UNIT_SKILLS[id].core);
  const missing = [];
  for (const spec of ['tank', 'warrior', 'rogue', 'archer', 'mage', 'priest', 'bard']) {
    for (const name of ['가', '나', '다', '라', '마', '바', '사', '아']) {
      const hand = D.skillsFor(spec, level, seedOf(`${spec}-${name}`));
      for (const id of core(spec)) {
        if (D.UNIT_SKILLS[id].minLevel <= level && !hand.includes(id)) missing.push(`${spec}:${id}`);
      }
    }
  }
  check('계열의 정체가 걸린 스킬은 늘 든다', [...new Set(missing)], []);

  // 레벨이 올라 목록이 길어져도 이미 정해진 취향은 그대로다. 섞은 목록을 잘라
  // 쓰면 새 스킬이 열릴 때마다 순서가 통째로 달라져, 들던 넷이 이유 없이 바뀐다.
  const seed = seedOf('궁수 미라');
  const at = (lv) => D.skillsFor('archer', lv, seed);
  const kept = at(7).filter((id) => at(8).includes(id));
  check('레벨이 올라도 손이 통째로 바뀌지는 않는다', kept.length >= 3, true);

  // 씨앗을 주지 않으면 예전처럼 목록 앞에서부터 넷이다. 화면이 "이 계열은 보통
  // 무엇을 드는가"를 보여 줄 때 쓰는 길이다.
  check('씨앗이 없으면 앞에서부터',
    D.skillsFor('tank', level), D.SPEC_SKILLS.tank
      .filter((id) => D.UNIT_SKILLS[id].minLevel <= level).slice(0, D.UNIT_SKILL_MAX));
}

// --- 기절 ---------------------------------------------------------------
//
// 근접 세 계열만 갖는 수단이다. 굳어 있는 동안에는 판단도 이동도 기본 공격도 없다.
{
  const state = battle({ party: [{ defId: 'bran', level: 8 }] });
  const tank = unit(state, '강철의 브란');
  const foe = AI.alive(state, 'enemy')[0];
  const def = D.UNIT_SKILLS.shieldSlam;

  L.runUnitSkill(state, tank, { id: 'shieldSlam', targetUid: foe.uid });
  check('걸리면 그 시각까지 굳는다', foe.stunUntil, state.t + def.duration);
  check('굳은 것을 밖에서도 볼 수 있다', L.stunned(state, foe), true);

  // 굳어 있는 동안에는 아무것도 하지 않는다. 붙어 있어도 때리지 않는다.
  // 적 딜러는 힐러부터 노리므로 주인공이 표적이다. 굳은 적 하나만 남기고, 판이
  // 도중에 끝나지 않게 양쪽 다 죽지 않을 만큼 체력을 준다 — 여기서 보려는 것은
  // 승패가 아니라 굳어 있는 동안 무엇을 못 하는가다.
  for (const other of AI.alive(state, 'enemy')) {
    if (other.uid !== foe.uid) L.applyDamage(state, null, other, 99999);
  }
  // 위에서 쿨타임을 거치지 않고 직접 걸었으므로, 두면 탱커가 매 틱 다시 건다.
  tank.skills = [];
  const hero = L.hero(state);
  foe.hp = 1e6; foe.maxHp = 1e6;
  hero.hp = 1e6; hero.maxHp = 1e6;
  foe.x = hero.x + 2; foe.y = hero.y;
  foe.nextAttackAt = 0;
  const stood = foe.x;
  const before = hero.hp;
  run(state, def.duration - 0.3);
  check('굳어 있는 동안에는 때리지 못한다', hero.hp, before);
  check('걸음도 멈춘다', foe.x, stood);

  // 시간이 지나면 풀리고 다시 움직인다.
  run(state, 2);
  check('시간이 지나면 풀린다', L.stunned(state, foe), false);
  check('풀리면 다시 움직인다', foe.x !== stood, true);

  // **거는 순간 외우던 것이 끊긴다.** 끊지 않으면 기절이 아무 일도 하지 않은
  // 것으로 보인다.
  const caster = AI.alive(state, 'enemy').find((u) => u.uid !== foe.uid) || foe;
  caster.stunUntil = 0;
  L.startCast(state, caster, { id: caster.skills[0].id, targetUid: tank.uid });
  L.stun(state, tank, caster, 2);
  check('외우던 것이 끊긴다', caster.cast, null);

  // 짧은 기절로 긴 기절을 덮으면 두 번째가 오히려 상대를 풀어 준다.
  const long = state.t + 5;
  caster.stunUntil = long;
  L.stun(state, tank, caster, 1);
  check('남은 시간이 긴 쪽이 남는다', caster.stunUntil, long);

  // 주인공이 굳으면 스킬이 나가지 않는다. 화면이 그 사실을 보여야 하므로
  // 이유를 그대로 돌려준다.
  hero.stunUntil = state.t + 2;
  check('주인공도 굳으면 못 쓴다',
    L.castSkill(state, 'touch', { uid: hero.uid }).reason, '기절');
}

// --- 아군의 마나를 채운다 (음유시인) ------------------------------------
{
  const state = battle({ party: [{ defId: 'bran', level: 9 }, { defId: 'finn', level: 9 },
    { defId: 'lyle', level: 9 }, { defId: 'noa', level: 9 }] });
  const bard = unit(state, '음유시인 핀');
  const tank = unit(state, '강철의 브란');
  const healer = unit(state, '사제 노아');
  const refrain = D.UNIT_SKILLS.refrain;

  tank.mp = 0;
  L.runUnitSkill(state, bard, { id: 'refrain', targetUid: tank.uid });
  check('아군 하나의 마나가 찬다', Math.round(tank.mp), refrain.mana);

  // 최대치를 넘겨 채워지지 않아야 "누구를 채울지"가 판단이 된다.
  tank.mp = tank.maxMp - 5;
  L.runUnitSkill(state, bard, { id: 'refrain', targetUid: tank.uid });
  check('최대치를 넘지 않는다', tank.mp, tank.maxMp);

  // 광역은 기준점 주변 아군 전부. 반경 밖은 그대로다.
  const anthem = D.UNIT_SKILLS.echo;
  for (const mate of AI.alive(state, 'ally')) { mate.mp = 0; mate.x = tank.x; mate.y = tank.y; }
  const far = unit(state, '검사 라일');
  far.x = tank.x + anthem.radius + 10;
  L.runUnitSkill(state, bard, { id: 'echo', targetUid: tank.uid });
  check('반경 안 아군이 함께 찬다',
    [Math.round(tank.mp), Math.round(healer.mp)], [anthem.mana, anthem.mana]);
  check('반경 밖은 그대로다', far.mp, 0);

  // 쓰러진 아군에게는 들어가지 않는다. 마나가 차도 일어나지 않으므로 버리는 것이다.
  const down = unit(state, '사제 노아');
  L.applyDamage(state, null, down, 99999);
  down.mp = 0;
  L.runUnitSkill(state, bard, { id: 'refrain', targetUid: down.uid });
  check('쓰러진 아군은 채우지 않는다', down.mp, 0);
}

// --- 화면에 뜨는 숫자는 정수다 ------------------------------------------
//
// 체력과 마나는 자연 회복과 무리 사이 회복 때문에 소수를 갖는다. 남은 자리를
// 그대로 회복량으로 삼으면 그 소수가 "+106.99999999999864"처럼 화면으로 샌다.
{
  const state = battle();
  const tank = unit(state, '강철의 브란');
  // 소수 자리가 남아 있는 체력을 만든다.
  tank.hp = tank.maxHp - 106.99999999999864;
  const healed = L.applyHeal(state, L.hero(state), tank, 99999);
  check('회복량이 정수다', healed % 1, 0);
  check('넘치지 않는다', tank.hp <= tank.maxHp, true);

  // 피해도 마찬가지다. 이쪽은 예전부터 정수였지만 같은 잣대로 본다.
  tank.hp = tank.maxHp;
  const took = L.applyDamage(state, AI.alive(state, 'enemy')[0], tank, 123.456);
  check('피해도 정수다', took % 1, 0);

  // 실제 전투를 굴려도 소수가 새지 않는다 — 무리 사이를 넘겨야 회복이 소수를 만든다.
  const run2 = battle({ quest: quest({ waves: [['scout'], ['scout', 'shaman']] }) });
  const bad = [];
  for (let i = 0; i < 160 / L.TICK && run2.status === 'fighting'; i++) {
    L.step(run2, L.TICK);
    for (const event of L.drainEvents(run2)) {
      if ((event.type === 'damage' || event.type === 'heal') && event.amount % 1 !== 0) bad.push(event.amount);
    }
  }
  check('전투 내내 소수가 안 뜬다', bad, []);
}

// --- 강화와 약화 --------------------------------------------------------
//
// 곱으로만 걸리고, 같은 스킬은 겹쳐 쌓이지 않는다. 피해와 회복을 계산하는
// 자리가 두 곳뿐이라 기본 공격·스킬·도트·장판이 모두 같은 규칙을 탄다.
{
  const fresh = () => battle({ party: [{ defId: 'bran', level: 9 }, { defId: 'finn', level: 9 },
    { defId: 'lyle', level: 9 }, { defId: 'noa', level: 9 }] });
  // 죽이지 않고 한 대만 재 본다. 쓰러뜨리면 그 뒤의 측정이 0으로 나온다.
  const hit = (state, from, to) => {
    to.hp = to.maxHp;
    L.applyDamage(state, from, to, 100);
    return to.maxHp - to.hp;
  };

  {
    const state = fresh();
    const bard = unit(state, '음유시인 핀');
    const tank = unit(state, '강철의 브란');
    const foe = AI.alive(state, 'enemy')[0];

    const bare = hit(state, foe, tank);
    L.runUnitSkill(state, bard, { id: 'harmony', targetUid: tank.uid });
    check('강화가 걸린다', tank.auras.map((a) => a.skillId), ['harmony']);
    const warded = hit(state, foe, tank);
    check('받는 피해가 줄어든다', warded < bare, true);

    // **같은 스킬은 겹쳐 쌓이지 않는다.** 곱이 두 번 걸리면 음유시인 둘이 붙은
    // 파티가 전혀 다른 게임이 된다.
    L.runUnitSkill(state, bard, { id: 'harmony', targetUid: tank.uid });
    check('다시 걸어도 하나뿐', tank.auras.length, 1);
    check('다시 걸어도 더 줄지 않는다', hit(state, foe, tank), warded);

    // 시간이 지나면 풀린다. 화면이 이 목록을 그대로 그리므로 남겨 두면 끝난
    // 표시가 초상화에 붙어 있는다.
    state.t += D.UNIT_SKILLS.harmony.duration + 0.1;
    L.step(state, L.TICK);
    check('시간이 지나면 풀린다', tank.auras.length, 0);
    check('풀리면 원래대로 맞는다', hit(state, foe, tank), bare);
  }

  {
    // 약화는 반대쪽이다 — 적이 받는 피해가 는다.
    const state = fresh();
    const bard = unit(state, '음유시인 핀');
    const melee = unit(state, '검사 라일');
    const foe = AI.alive(state, 'enemy')[0];
    const plain = hit(state, melee, foe);
    L.runUnitSkill(state, bard, { id: 'lament', targetUid: foe.uid });
    check('약화가 걸린 적은 더 아프다', hit(state, melee, foe) > plain, true);
  }

  {
    // 공격력 강화는 때리는 쪽에 걸린다. 맞는 쪽에 건 것과 곱해지는 자리가 다르다.
    const state = fresh();
    const bard = unit(state, '음유시인 핀');
    const melee = unit(state, '검사 라일');
    const foe = AI.alive(state, 'enemy')[0];
    const swing = hit(state, melee, foe);
    L.runUnitSkill(state, bard, { id: 'anthem', targetUid: melee.uid });
    check('광역 강화는 반경 안 아군 모두에게',
      [melee.auras.length, bard.auras.length], [1, 1]);
    check('공격력 강화가 피해를 올린다', hit(state, melee, foe) > swing, true);

    // 반경 밖은 그대로다.
    const far = unit(state, '사제 노아');
    check('반경 밖은 안 걸린다',
      AI.dist(far, melee) > D.UNIT_SKILLS.anthem.radius ? far.auras.length : 0, 0);
  }

  {
    // 회복 경로도 같은 곱을 본다. 걸린 것이 없으면 1이어야 한다.
    const state = fresh();
    const bard = unit(state, '음유시인 핀');
    const tank = unit(state, '강철의 브란');
    tank.hp = tank.maxHp - 500;
    check('강화가 없으면 회복은 그대로', L.applyHeal(state, bard, tank, 200) > 0, true);
  }
}

// --- 마나 자연 회복 -----------------------------------------------------
//
// 아군과 적이 같은 규칙을 쓴다. 마나가 마르면 힐도 도발도 멈추는데, 그 상태로
// 남은 전투를 보내면 파티가 손 쓸 것 없이 깎이기만 한다.
{
  const state = battle();
  const foe = AI.alive(state, 'enemy').find((u) => u.maxMp > 0);
  const down = AI.alive(state, 'ally').find((u) => u.uid !== L.HERO_UID);
  // 전부 비우고 시작한다. 남아 있는 마나가 제각각이면 "지능이 높은 쪽이 더
  // 돈다"를 잴 수 없다.
  for (const u of AI.alive(state, 'ally')) u.mp = 0;
  foe.mp = 0;
  down.mp = 0;
  L.applyDamage(state, null, down, 99999);

  run(state, 10);
  // **지능에 비례한다.** 최대 마나의 비율로 두면 장비로 최대 마나만 올린
  // 캐릭터가 회복 속도까지 덤으로 얻는다.
  const gained = (u) => u.mp;
  const near = (a, b) => Math.abs(a - b) < 0.5;
  const perTen = (u) => u.attrs.int * L.MANA_REGEN_PER_INT * 10;
  check('주인공의 마나가 지능에 비례해 돈다',
    near(gained(L.hero(state)), perTen(L.hero(state))), true);
  check('적도 같은 규칙을 쓴다', near(gained(foe), perTen(foe)), true);
  // 지능이 높은 쪽이 더 빨리 돈다 — 비율이었다면 둘의 **비율**이 같았을 것이다.
  const smart = AI.alive(state, 'ally').slice().sort((a, b) => b.attrs.int - a.attrs.int)[0];
  const dull = AI.alive(state, 'ally').slice().sort((a, b) => a.attrs.int - b.attrs.int)[0];
  check('지능이 높으면 더 돈다', smart.attrs.int === dull.attrs.int || smart.mp > dull.mp, true);
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

  // 넉백으로 밀려나는 것은 이동이 아니다. 그것까지 취소로 치면 시전 중에는
  // 아무도 나를 건드리지 못한다는 규칙이 하나 더 생긴다.
  const pushed = battle();
  const shoved = unit(pushed, '사제 노아');
  const foe = AI.alive(pushed, 'enemy')[0];
  shoved.x = 40; shoved.y = 28;
  L.startCast(pushed, shoved, { id: 'mend', targetUid: shoved.uid });
  const wasAt = shoved.x;
  L.knockback(pushed, foe, shoved, 8);
  check('넉백은 자리를 옮긴다', shoved.x !== wasAt, true);
  check('밀려나는 것은 취소가 아니다', shoved.cast !== null, true);

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

// --- 등급이 무엇을 들고 오는지도 정한다 ---------------------------------
//
// 수치와 보상만 등급을 따르던 동안에는 정예가 "잡졸을 더 세게 만든 것"이었다.
// 광역기를 확실히 들고 오게 하면서 정예가 파티 전체를 긁는 상대가 됐다.
{
  const AREA = ['damage-area', 'zone'];
  const kit = (id, level) => {
    const def = D.ENEMIES[id];
    return D.skillsFor(def.spec, level, D.skillSeed(`${id}:e0_0`), def.always)
      .map((s) => D.UNIT_SKILLS[s]);
  };
  const hasArea = (id, level) => kit(id, level).some((s) => AREA.indexOf(s.kind) >= 0);
  const hasZone = (id, level) => kit(id, level).some((s) => s.kind === 'zone');

  // 잡졸에게는 없다. 있으면 "약한 여럿"이라는 자리가 사라진다.
  check('잡졸은 광역기가 없다', [hasArea('scout', 12), hasArea('shaman', 12)], [false, false]);
  // 정예는 확실히 든다. 취향에 맡기면 우연에 걸리고, 등급을 올린 뜻이 사라진다.
  check('정예는 광역기를 든다', [hasArea('orc', 12), hasArea('hexer', 12)], [true, true]);
  // 우두머리만 장판을 깐다. 정예와 같은 것을 더 세게 쓰는 것뿐이면 등급이
  // 수치 차이로만 남는다.
  check('우두머리는 장판을 깐다', hasZone('chief', 12), true);
  check('정예는 장판까지는 없다', [hasZone('orc', 12), hasZone('hexer', 12)], [false, false]);
  // 정예의 광역기는 한 번 긁고 끝나지만 우두머리의 장판은 그 자리에 남는다.
  // 반경도 넓어서, 후열이 자리를 옮기지 않으면 계속 탄다.
  check('우두머리의 장판이 더 넓다',
    D.UNIT_SKILLS.rupture.radius > D.UNIT_SKILLS.sweep.radius, true);
  check('우두머리는 광역기도 함께 든다', hasArea('chief', 12), true);

  // 씨앗이 달라도 흔들리지 않는다 — 그것이 `always`를 둔 이유다.
  const shaky = [];
  for (let i = 0; i < 12; i++) {
    const def = D.ENEMIES.orc;
    const kinds = D.skillsFor(def.spec, 12, D.skillSeed(`orc:e${i}_0`), def.always)
      .map((id) => D.UNIT_SKILLS[id].kind);
    if (!kinds.some((k) => AREA.indexOf(k) >= 0)) shaky.push(i);
  }
  check('어떤 씨앗에서도 정예는 광역기를 든다', shaky, []);
}

// --- 계열마다 본업과 보조가 있다 ----------------------------------------
//
// 넷을 자르는 순서가 곧 그 계열이 무엇을 하는 캐릭터인가다. 목록 앞이 본업이고
// 뒤가 보조라, 여기가 뒤집히면 편성 화면에서 궁수와 마법사를 고를 이유가 없어진다.
{
  const kindsOf = (spec, level) => D.skillsFor(spec, level).map((id) => D.UNIT_SKILLS[id].kind);
  const count = (list, want) => list.filter((k) => want.indexOf(k) >= 0).length;
  const SINGLE = ['damage', 'dot'];
  const AREA = ['damage-area', 'zone'];
  const SUPPORT = ['buff', 'buff-area', 'debuff', 'debuff-area'];
  const HEAL = ['heal', 'heal-area', 'heal-dot'];

  // 궁수는 단일이 본업, 광역이 보조.
  const archer = kindsOf('archer', 12);
  check('궁수는 단일이 광역보다 많다', count(archer, SINGLE) > count(archer, AREA), true);
  check('궁수도 광역을 하나는 든다', count(archer, AREA) >= 1, true);

  // 마법사는 그 반대다.
  const mage = kindsOf('mage', 12);
  check('마법사는 광역이 단일보다 많다', count(mage, AREA) > count(mage, SINGLE), true);
  check('마법사도 단일을 하나는 든다', count(mage, SINGLE) >= 1, true);

  // **순서만 뒤집은 것이 아니라 수치도 갈라 두었다.** 순서만 바꾸면 둘 다
  // "아무거나 잘 쏘는 원거리"로 남는다.
  check('궁수의 한 발이 마법사의 한 발보다 세다',
    D.UNIT_SKILLS.snipe.mul > D.UNIT_SKILLS.arcane.mul, true);
  check('마법사의 장판이 궁수의 장판보다 세다',
    D.UNIT_SKILLS.blizzard.tick > D.UNIT_SKILLS.arrowStorm.tick, true);

  // 전사는 딜이 본업, 탱이 보조 — 도발이 때리는 것보다 뒤에 온다.
  const warrior = D.SPEC_SKILLS.warrior;
  const firstTaunt = warrior.findIndex((id) => D.UNIT_SKILLS[id].kind === 'taunt');
  const firstHit = warrior.findIndex((id) => SINGLE.concat(AREA).indexOf(D.UNIT_SKILLS[id].kind) >= 0);
  check('전사는 때리는 것이 도발보다 앞', firstHit < firstTaunt, true);
  check('전사도 도발을 든다', firstTaunt >= 0, true);
  check('전사는 버티는 강화를 든다',
    warrior.some((id) => D.UNIT_SKILLS[id].kind === 'buff'), true);
  // 수호자는 정반대다. 이 둘이 같으면 탱커를 따로 데려갈 이유가 없다.
  const tank = D.SPEC_SKILLS.tank;
  check('수호자는 도발이 때리는 것보다 앞',
    tank.findIndex((id) => /^taunt/.test(D.UNIT_SKILLS[id].kind))
      < tank.findIndex((id) => SINGLE.concat(AREA).indexOf(D.UNIT_SKILLS[id].kind) >= 0), true);

  // 음유시인은 강화·약화가 본업, 회복이 보조.
  const bard = kindsOf('bard', 12);
  check('음유시인은 강화·약화가 회복보다 많다',
    count(bard, SUPPORT) > count(bard, HEAL), true);
  check('음유시인은 힐러 역할이다', D.COMPANIONS.finn.job, 'healer');
  // 회복량이 사제보다 작아야 "노래도 부르는 사제"가 되지 않는다.
  check('음유시인의 회복이 사제보다 작다',
    D.UNIT_SKILLS.chord.heal < D.UNIT_SKILLS.mend.heal, true);
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

// --- 서로 밀지 않는다 ---------------------------------------------------
//
// 예전에는 매 틱 같은 편끼리 밀어내 대열을 벌렸다. 그러면 유닛이 제 발로 간 적
// 없는 자리에 서 있게 된다 — 겹치는 것은 이제 스스로 비켜서서 푼다(`ai.freeSpot`).
{
  // 굳은 유닛은 스스로 움직이지 않는다. 그 위에 동료를 겹쳐 세워도 자리가
  // 그대로여야 "아무도 남을 밀지 않는다"가 지켜진 것이다.
  const state = battle();
  const stuck = unit(state, '강철의 브란');
  const crowd = unit(state, '검사 라일');
  stuck.x = 40; stuck.y = 28;
  crowd.x = 40; crowd.y = 28;
  stuck.stunUntil = state.t + 5;
  const at = { x: stuck.x, y: stuck.y };
  run(state, 0.5);
  check('굳은 유닛은 겹쳐도 밀리지 않는다',
    [stuck.x, stuck.y], [at.x, at.y]);

  // 겹친 쪽은 제 발로 비켜선다. 여기까지 없으면 다섯이 한 점에 포개 선다.
  check('겹친 쪽이 비켜선다', AI.dist(stuck, crowd) > 1, true);

  // 양보하는 쪽은 늘 한쪽이다. 둘 다 비키면 매 틱 자리를 바꾸며 떤다.
  const pair = battle();
  const a = unit(pair, '강철의 브란');
  const b = unit(pair, '검사 라일');
  const senior = a.uid < b.uid ? a : b;
  a.x = 40; a.y = 28; b.x = 40; b.y = 28;
  const kept = { x: senior.x, y: senior.y };
  const spot = AI.freeSpot(senior, pair, { x: senior.x, y: senior.y });
  check('앞선 쪽은 제자리를 지킨다', [spot.x, spot.y], [kept.x, kept.y]);
}
{
  // **적과도 겹치지 않는다.** 같은 편끼리만 벌리던 때에는 근접 적이 아군 위에
  // 그대로 올라섰다 — 화면에서 둘이 한 덩어리로 보인다.
  const state = battle();
  const ally = unit(state, '강철의 브란');
  const foe = AI.alive(state, 'enemy')[0];
  ally.x = 40; ally.y = 28;
  foe.x = 40; foe.y = 28;
  const junior = ally.uid < foe.uid ? foe : ally;
  const spot = AI.freeSpot(junior, state, { x: junior.x, y: junior.y });
  check('적 위에 겹쳐 서면 비켜선다', Math.abs(spot.y - 28), AI.CLOSE);

  // **적과 벌리는 거리는 가장 짧은 근접 사거리보다 좁다.** 사거리 밖으로 비켜서면
  // 붙으려는 힘과 비키려는 힘이 매 틱 싸워 근접 유닛이 사거리 언저리에서 떤다.
  const melee = Object.values(D.UNIT_SKILLS).map((def) => def.range)
    .concat(Object.values(D.COMPANIONS).map((def) => def.range))
    .filter((range) => range > 0 && range <= D.MELEE_RANGE);
  check('적과의 거리가 근접 사거리 안이다', AI.CLOSE < Math.min(...melee), true);
  // 같은 편끼리는 붙을 이유가 없으니 더 넉넉히 벌린다.
  check('같은 편끼리 더 벌린다', AI.SPACING > AI.CLOSE, true);
}

// --- 넉백 ---------------------------------------------------------------
//
// **남의 좌표를 옮기는 유일한 길이다.** 대열이 서로 밀리지 않게 된 뒤로, 적을
// 물러나게 하는 수단은 이렇게 `knock`이 적힌 스킬뿐이다.
{
  const state = battle();
  const tank = unit(state, '강철의 브란');
  const foe = AI.alive(state, 'enemy')[0];
  tank.x = 40; tank.y = 28;
  foe.x = 46; foe.y = 28;
  tank.skills = [{ id: 'shieldSlam', readyAt: 0 }];
  tank.mp = tank.maxMp;
  L.runUnitSkill(state, tank, { id: 'shieldSlam', targetUid: foe.uid });
  check('밀치면 뒤로 밀려난다', foe.x > 46, true);
  check('민 거리는 적어 둔 만큼이다',
    Math.round(AI.dist(tank, foe)), 6 + D.UNIT_SKILLS.shieldSlam.knock);
  check('밀치면 굳기도 한다', L.stunned(state, foe), true);

  // 밀린 자리도 전장 안이다. 벽 너머로 밀어내면 그대로 화면 밖에 선다.
  const edge = battle();
  const pusher = unit(edge, '강철의 브란');
  const near = AI.alive(edge, 'enemy')[0];
  pusher.x = 10; near.x = D.FIELD.w - 6; near.y = pusher.y;
  L.knockback(edge, pusher, near, 40);
  check('밀려도 전장 안이다', near.x <= D.FIELD.w - 4, true);
}

// --- 주인공의 계열 스킬 --------------------------------------------------
//
// 음유시인은 강화·약화와 마나 나눔이 본업이라, 회복·도트·장판만 다루던 실행부에
// 종류가 넷 늘었다. **동료 스킬과 같은 함수를 부른다** — 따로 구현하면 "같은
// 스킬은 겹쳐 쌓이지 않는다" 같은 규칙을 주인공만 안 지키게 된다.
{
  // 전투에 들고 갈 수 있는 것은 다섯뿐이라(SKILL_MAX) 화음은 빼고 넣는다.
  const state = battle({ skills: ['refrain', 'anthem', 'lament', 'dissonance', 'finale'] });
  const tank = unit(state, '강철의 브란');
  const foe = AI.alive(state, 'enemy')[0];
  // 적은 반대편 끝에 서 있어 사거리 밖이다. 여기서 보려는 것은 사거리가 아니다.
  foe.x = L.hero(state).x + 8;
  foe.y = L.hero(state).y;

  // 강화: 기준점 주변 아군 모두에게 걸린다.
  cast(state, 'anthem', { x: tank.x, y: tank.y });
  check('광역 강화가 아군에게 걸린다', tank.auras.length, 1);
  check('올리는 수치가 적혀 있다', tank.auras[0].stat, 'atk');
  check('적에게는 안 걸린다', foe.auras.length, 0);

  // 약화: 고른 적 하나에게. **만가가 단일, 불협화음이 광역이다** — 동료 음유시인의
  // 같은 이름이 그렇게 생겼고, 한 이름이 두 모양이면 같은 기술로 보이지 않는다.
  cast(state, 'lament', { uid: foe.uid });
  check('약화가 적에게 걸린다', foe.auras.map((a) => a.skillId), ['lament']);
  check('약화는 아군에게 안 걸린다', tank.auras.length, 1);

  // 광역 약화: 기준점 주변 적 모두에게.
  L.hero(state).mp = L.hero(state).maxMp;
  cast(state, 'dissonance', { x: foe.x, y: foe.y });
  check('광역 약화가 적에게 걸린다', foe.auras.length, 2);

  // 마나 나눔: 제 마나값보다 많이 준다(노래로 채우는 것이지 제 것을 나누는 것이 아니다).
  tank.mp = 0;
  cast(state, 'refrain', { uid: tank.uid });
  check('동료의 마나가 찬다', tank.mp > 0, true);
  check('주는 마나가 제 마나값보다 크다',
    D.PLAYER_SKILLS.refrain.mana > D.PLAYER_SKILLS.refrain.mp, true);

  // 직접 피해: 마법 공격력 배수를 탄다. 앞의 넷으로 마나를 거의 다 썼으므로
  // 채워 준다 — 여기서 보려는 것은 마나가 아니다.
  L.hero(state).mp = L.hero(state).maxMp;
  const before = foe.hp;
  cast(state, 'finale', { uid: foe.uid });
  check('직접 피해가 들어간다', foe.hp < before, true);
}

// --- 성기사와 주교 --------------------------------------------------------
//
// 성기사는 주인공이 직접 어그로를 옮기는 유일한 계열이고, 광역 즉발 피해도
// 여기서 처음 나왔다. 주교는 회복하면서 약화를 걷어낸다.
{
  const state = battle({ skills: ['smite', 'taunt', 'holyShield', 'hammer', 'radiance'] });
  const hero = L.hero(state);
  const foes = AI.alive(state, 'enemy');
  foes.forEach((foe, i) => { foe.x = hero.x + 8 + i * 2; foe.y = hero.y; });
  hero.mp = hero.maxMp;

  // 도발: 동료 탱커의 도발과 같은 자리를 건드린다.
  cast(state, 'taunt', { uid: foes[0].uid });
  check('주인공이 적을 끌어온다',
    [foes[0].tauntUid, foes[0].targetUid], [hero.uid, hero.uid]);
  check('끌린 시간이 정해져 있다', foes[0].tauntUntil > state.t, true);

  // 광역 즉발 피해: 반경 안의 적 모두가 맞는다.
  hero.mp = hero.maxMp;
  const before = foes.map((foe) => foe.hp);
  cast(state, 'hammer', { x: foes[1].x, y: foes[1].y });
  check('반경 안의 적이 모두 맞는다', foes.every((foe, i) => foe.hp < before[i]), true);

  // 강화: 자신에게도 걸 수 있다(앞에 서는 계열이라 그것이 본래 쓰임이다).
  hero.mp = hero.maxMp;
  cast(state, 'holyShield', { uid: hero.uid });
  check('자신에게 강화를 건다', hero.auras.map((a) => a.skillId), ['holyShield']);
  check('받는 피해를 줄이는 강화다',
    [hero.auras[0].stat, hero.auras[0].mul < 1], ['armor', true]);
}

{
  // 정화: 걸린 약화만 걷어낸다. 강화까지 지우면 아군의 노래가 정화에 끊긴다.
  const state = battle({ skills: ['purify', 'mend'] });
  const tank = unit(state, '강철의 브란');
  L.hero(state).mp = L.hero(state).maxMp;
  L.addAura(state, null, tank, D.PLAYER_SKILLS.dissonance);   // 약화
  L.addAura(state, null, tank, D.PLAYER_SKILLS.holyShield);   // 강화
  tank.hp = tank.maxHp - 300;
  cast(state, 'purify', { uid: tank.uid });
  check('약화를 걷어낸다', tank.auras.map((a) => a.skillId), ['holyShield']);
  check('회복도 함께 들어간다', tank.hp > tank.maxHp - 300, true);
}

// **상위 계열은 그냥 상위 호환이 아니다.** 수치가 세면 마나도 세고, 배울 수 있는
// 수도 적어야 아래 계열을 고를 이유가 남는다.
{
  check('주교의 회복이 사제보다 크다',
    D.PLAYER_SKILLS.mend.heal > D.PLAYER_SKILLS.touch.heal, true);
  check('주교의 마나도 더 먹는다',
    D.PLAYER_SKILLS.mend.mp > D.PLAYER_SKILLS.touch.mp, true);
  check('주교는 점수를 덜 받는다', D.jobMaxLevel('bishop') < D.jobMaxLevel('priest'), true);
  // 성기사의 회복은 급한 불만 끄는 정도다. 이것이 "보조 힐러"의 뜻이다.
  check('성기사의 회복이 사제의 절반 아래',
    D.PLAYER_SKILLS.layHands.heal < D.PLAYER_SKILLS.touch.heal / 2, true);
  check('도발은 성기사만 들고 온다',
    Object.values(D.PLAYER_SKILLS).filter((def) => def.kind === 'taunt')
      .map((def) => def.job), ['paladin']);
  // 앞에 서는 계열이라 사거리가 짧다. 뒤에서 다 할 수 있으면 수치에 없는 말이 된다.
  check('성기사의 사거리가 사제보다 짧다',
    D.heroSkillsOf('paladin').every((def) => def.range <= D.PLAYER_SKILLS.touch.range), true);
  // **사제는 회복만 한다.** 때리는 것은 앞에 서는 성기사의 일로 옮겼다 — 회복만
  // 하는 계열이 하나도 없으면 "회복이 본업"이 수치에 없는 말이 된다.
  check('사제에 공격 스킬이 없다',
    D.heroSkillsOf('priest').some((def) => def.targeting === 'enemy'
      || def.targeting === 'area-enemy'), false);
  check('옮긴 둘은 성기사가 들고 있다',
    ['flame', 'pyre'].every((id) => D.PLAYER_SKILLS[id].job === 'paladin'), true);
}

// --- 상위 계열의 새 수단 ---------------------------------------------------
//
// 성전사는 무리를 통째로 붙들고 굳힌다. 광역 도발과 기절은 여기서 처음 나왔다.
{
  const state = battle({ skills: ['roar', 'shieldSlam', 'charge', 'bracing', 'quake'] });
  const hero = L.hero(state);
  const foes = AI.alive(state, 'enemy');
  foes.forEach((foe, i) => { foe.x = hero.x + 8 + i * 2; foe.y = hero.y; });
  hero.mp = hero.maxMp;

  cast(state, 'roar', { x: foes[1].x, y: foes[1].y });
  check('광역 도발이 여럿을 끌어온다',
    foes.every((foe) => foe.tauntUid === hero.uid), true);

  hero.mp = hero.maxMp;
  const before = foes[0].hp;
  cast(state, 'shieldSlam', { uid: foes[0].uid });
  check('밀치면 굳는다', L.stunned(state, foes[0]), true);
  check('밀치면서 때린다', foes[0].hp < before, true);
}

// 서사시인은 회복량을 올리는 강화를 든다. 회복량 강화는 이 계열뿐이라, 파티의
// 힐러 전체를 세게 만드는 유일한 수단이다.
{
  const state = battle({ skills: ['ovation', 'ballad', 'epic', 'requiem', 'chorus'] });
  const hero = L.hero(state);
  const tank = unit(state, '강철의 브란');
  hero.mp = hero.maxMp;
  cast(state, 'ovation', { x: hero.x, y: hero.y });
  check('회복량을 올리는 강화가 걸린다',
    hero.auras.map((a) => a.stat), ['heal']);

  // 걸린 채로 회복하면 더 들어간다. 곱하는 자리가 applyHeal 하나라 주인공도 탄다.
  tank.hp = tank.maxHp - 600;
  const healed = tank.hp;
  L.applyHeal(state, hero, tank, 100);
  const withAura = tank.hp - healed;
  hero.auras = [];
  tank.hp = healed;
  L.applyHeal(state, hero, tank, 100);
  check('강화가 걸린 쪽이 더 회복시킨다', withAura > tank.hp - healed, true);
}

// **상위 계열이 계열마다 하나씩 있다.** 하나에만 있으면 나머지를 고르는 것이
// 끝이 없는 길이 된다.
{
  const uppers = Object.values(D.HERO_JOBS).filter((job) => (job.need || {}).jobLevel);
  check('상위 계열이 셋', uppers.length, 3);
  check('저마다 다른 아래 계열을 요구한다',
    uppers.map((job) => Object.keys(job.need.jobLevel)[0]).sort(), ['bard', 'paladin', 'priest']);
  check('상위 계열은 점수를 덜 받는다',
    uppers.every((job) => job.maxLevel < D.HERO_JOBS[Object.keys(job.need.jobLevel)[0]].maxLevel),
    true);
  // 모든 계열의 스킬이 그 계열 상한 안에서 열려야 한다. 넘으면 영영 못 배운다.
  const late = Object.values(D.PLAYER_SKILLS)
    .filter((def) => def.unlock > D.jobMaxLevel(def.job)).map((def) => def.id);
  check('상한 안에서 다 열린다', late, []);
  // 아이콘이 겹치면 스킬바에서 무엇을 누르는지 알 수 없다.
  const icons = Object.values(D.PLAYER_SKILLS).map((def) => def.icon);
  check('주인공 스킬의 아이콘이 서로 겹치지 않는다', new Set(icons).size, icons.length);
}

// **같은 레벨까지 직업 쪽이 더 든다.** 예전에는 네 판이면 만렙이라 무엇을 배울지
// 고민할 시간이 그 전에 끝났다. 지금은 직업 20이 캐릭터 20보다 무겁고, 상한도
// 캐릭터(30)보다 낮다 — 스킬을 다 올리는 것이 캐릭터를 키우는 것보다 늦게 끝난다.
{
  const upto = (f, max) => {
    let sum = 0;
    for (let level = 1; level < max; level++) sum += f(level);
    return sum;
  };
  const top = D.jobMaxLevel('priest');
  check('같은 레벨까지 직업 경험치가 더 든다',
    upto(D.LEVEL.jobExpTo, top) > upto(D.LEVEL.charExpTo, top), true);
  check('직업 상한이 캐릭터 상한보다 낮다', top < D.LEVEL.maxLevel, true);
  // 상한이 20이라도 스킬을 전부 끝까지 올릴 수는 없다 — 그러면 고를 것이 없어진다.
  const points = D.SKILL.start + (top - 1) * D.SKILL.pointsPerLevel;
  check('점수로 전부를 상한까지 올릴 수는 없다',
    points < D.heroSkillsOf('priest').length * D.SKILL.max, true);
}

// **계열마다 본업과 보조가 갈린다.** 같은 값을 주면 "노래도 부르는 사제"가 되어
// 둘 중 하나를 고를 이유가 사라진다.
{
  check('음유시인의 직접 회복이 사제보다 작다',
    D.PLAYER_SKILLS.chord.heal < D.PLAYER_SKILLS.touch.heal, true);
  check('아군의 마나를 채우는 것은 음유시인뿐',
    D.heroSkillsOf('priest').some((def) => def.kind === 'mana-ally'), false);
  check('강화·약화는 음유시인뿐',
    D.heroSkillsOf('priest').some((def) => def.stat), false);
}

// --- 같은 기술은 한 번만 적는다 --------------------------------------------
//
// 주인공과 동료가 같은 기술을 스물여덟 개 나눠 쓴다. 두 벌로 적어 두었을 때에는
// 정화가 동료는 190, 주인공은 90을 회복했고 만가는 한쪽이 광역이었다.
{
  const twins = Object.keys(D.PLAYER_SKILLS).filter((id) => D.UNIT_SKILLS[id]);
  check('두 표가 나눠 쓰는 기술이 있다', twins.length > 20, true);

  const split = twins.filter((id) => {
    const h = D.PLAYER_SKILLS[id], u = D.UNIT_SKILLS[id];
    return h.name !== u.name || h.icon !== u.icon || h.kind !== u.kind;
  });
  check('나눠 쓰는 기술은 이름·아이콘·종류가 같다', split, []);

  // 아이콘 하나를 서로 다른 기술이 쓰면 스킬바에서 무엇을 누르는지 알 수 없다.
  const byIcon = {};
  for (const def of Object.values(D.PLAYER_SKILLS).concat(Object.values(D.UNIT_SKILLS))) {
    (byIcon[def.icon] = byIcon[def.icon] || new Set()).add(def.id);
  }
  check('아이콘 하나에 기술 하나',
    Object.entries(byIcon).filter(([, set]) => set.size > 1).map(([icon]) => icon), []);

  // 이름도 마찬가지다. 같은 이름이 서로 다른 기술이면 편람에서 구별되지 않는다.
  const byName = {};
  for (const def of Object.values(D.PLAYER_SKILLS).concat(Object.values(D.UNIT_SKILLS))) {
    (byName[def.name] = byName[def.name] || new Set()).add(def.id);
  }
  check('이름 하나에 기술 하나',
    Object.entries(byName).filter(([, set]) => set.size > 1).map(([name]) => name), []);
}

// --- 동료의 상위 계열 -----------------------------------------------------
//
// **레벨이 오르면 계열이 한 번 올라간다.** 목록을 통째로 새로 짜지 않고 아래
// 계열의 것을 물려받는 것은, 같은 캐릭터가 레벨 하나에 전혀 다른 사람이 되지
// 않게 하려는 것이다.
{
  check('문턱 아래는 그대로', D.specAt('tank', D.SPEC_UP_LEVEL - 1), 'tank');
  check('문턱에서 올라간다', D.specAt('tank', D.SPEC_UP_LEVEL), 'bulwark');
  check('상위가 없는 계열은 그대로', D.specAt('priest', 99), 'priest');
  check('상위 계열은 더 안 올라간다', D.specAt('bulwark', 99), 'bulwark');

  // 다섯 계열에 하나씩. 힐러 계열(사제·음유시인)은 주인공 쪽에서 다룬다.
  check('상위가 다섯', Object.keys(D.SPEC_UP).sort(),
    ['archer', 'mage', 'rogue', 'tank', 'warrior']);

  for (const [base, up] of Object.entries(D.SPEC_UP)) {
    // 아래 것을 그대로 물려받는다 — 올라갔다고 쓰던 기술을 잃으면 안 된다.
    check(`${base}: 아래 목록을 물려받는다`,
      D.SPEC_SKILLS[base].every((id) => D.SPEC_SKILLS[up.spec].includes(id)), true);
    // 전용 둘이 앞에 온다. 뒤에 두면 넷을 고르는 순서에서 밀려, 상위가 되어도
    // 들고 오는 넷이 그대로일 수 있다.
    check(`${base}: 전용이 앞에 온다`, D.SPEC_SKILLS[up.spec].slice(0, 2), up.skills);
    check(`${base}: 전용은 문턱 레벨에 열린다`,
      up.skills.every((id) => D.UNIT_SKILLS[id].minLevel === D.SPEC_UP_LEVEL), true);
    check(`${base}: 이름표가 있다`, Boolean(D.SPECS[up.spec]), true);
  }

  // 실제로 들고 오는 넷이 바뀐다. 안 바뀌면 계열이 오른 것이 화면에만 남는다.
  const before = D.skillsFor('tank', D.SPEC_UP_LEVEL - 1, D.skillSeed('강철의 브란'));
  const after = D.skillsFor(D.specAt('tank', D.SPEC_UP_LEVEL), D.SPEC_UP_LEVEL,
    D.skillSeed('강철의 브란'));
  check('올라가면 들고 오는 것이 달라진다', after.join() !== before.join(), true);
  check('전용을 하나는 들고 온다',
    after.some((id) => D.SPEC_UP.tank.skills.includes(id)), true);
}

{
  // 전투도 명부도 같은 함수를 본다 — 한쪽만 보면 편성 화면에 적힌 계열과
  // 전장에서 쓰는 스킬이 갈린다.
  const state = battle({ party: [{ defId: 'bran', level: D.SPEC_UP_LEVEL }] });
  const tank = state.units.find((u) => u.defId === 'bran');
  check('전투의 유닛이 상위 계열이다', tank.spec, 'bulwark');
  check('상위 전용을 들고 들어온다',
    tank.skills.some((s) => D.SPEC_UP.tank.skills.includes(s.id)), true);

  const low = battle({ party: [{ defId: 'bran', level: 1 }] });
  check('낮은 레벨은 아래 계열 그대로',
    low.units.find((u) => u.defId === 'bran').spec, 'tank');
}

// --- 계열을 바꾼 동료 ------------------------------------------------------
//
// 전투는 명부를 들여다보지 않으므로 파티 항목이 바꾼 계열과 배운 것을 함께
// 넘긴다. 넘기지 않으면 편성 화면에 적힌 계열과 전장의 스킬이 갈린다.
{
  const state = battle({ party: [{ defId: 'mira', level: 8, name: '시험용 미라',
    spec: 'mage', learned: ['snipe', 'volley', 'aimed', 'quickShot'] }] });
  const mate = unit(state, '시험용 미라');
  check('전투가 바꾼 계열을 쓴다', mate.spec, 'mage');
  check('그림도 따라간다', mate.sprite, 'mage');
  const ids = mate.skills.map((s) => s.id);
  check('넷을 넘지 않는다', ids.length <= D.UNIT_SKILL_MAX, true);
  const borrowed = ['snipe', 'volley', 'aimed', 'quickShot'];
  check('배운 적 없는 계열의 스킬은 안 든다',
    ids.every((id) => D.SPEC_SKILLS.mage.includes(id) || borrowed.includes(id)), true);

  // **누가 무엇을 드는지는 이름이 정한다**(취향). 그래서 한 캐릭터로는 섞였는지를
  // 볼 수 없고, 여러 이름을 놓고 "섞이는 사람이 있다"를 본다.
  const names = ['가', '나', '다', '라', '마', '바', '사', '아'];
  const mixed = names.filter((name) =>
    D.skillsFor('mage', 8, D.skillSeed(name), null, borrowed)
      .some((id) => borrowed.includes(id)));
  check('배워 온 것을 섞어 드는 사람이 있다', mixed.length > 0, true);
  check('제 계열만 드는 사람도 있다', mixed.length < names.length, true);
}

// --- 무리 사이의 이동 ---------------------------------------------------
//
// 다음 무리가 있으면 그 자리에 적이 솟는 것이 아니라, 걸어가서 만나는 것으로
// 보여야 한다. 배경이 흘러가고 아군은 대열을 다시 짠다.
{
  const state = battle({ skills: ['touch', 'sanctuary'] });
  // 장판을 하나 깔아 둔 채로 무리를 정리한다. 장판은 바닥에 놓인 것이라 걸어가는
  // 동안 배경과 함께 뒤로 흘러가야 한다 — 유닛 좌표만 보면 그 자리에 남아
  // 파티를 따라오는 것으로 보인다.
  cast(state, 'sanctuary', { uid: unit(state, '강철의 브란').uid });
  check('장판이 깔렸다', state.zones.length > 0, true);
  const laid = state.zones[0];
  const laidX = L.zoneX(state, laid);

  AI.alive(state, 'enemy').forEach((u) => L.applyDamage(state, null, u, 99999));
  // 대열이 흐트러진 상태에서 시작해야 다시 짜는 것이 보인다.
  AI.alive(state, 'ally').forEach((u) => { u.x = 80; });
  run(state, 0.2);
  check('무리를 정리하면 이동이 시작된다', state.marching, true);

  const scrolled = state.scroll;
  run(state, 1);
  check('배경이 흘러간다', state.scroll > scrolled, true);
  // 걸어간 만큼 그대로 뒤로 밀린다 — 파티는 제자리이므로 판 위를 지나가는 것이
  // 이렇게만 보인다.
  check('장판이 바닥과 함께 뒤로 흘러간다',
    Math.abs((laidX - L.zoneX(state, laid)) - state.scroll) < 1e-6, true);
  // 이동 중에 새로 까는 것도 같은 규칙을 탄다 — 예외를 두면 이동 중에 깐 것만
  // 파티를 따라온다.
  const during = state.zones.length;
  // 방금 깔았으므로 쿨타임을 풀어 준다 — 여기서 보려는 것은 쿨타임이 아니다.
  L.skillSlot(state, 'sanctuary').readyAt = 0;
  L.hero(state).mp = L.hero(state).maxMp;
  cast(state, 'sanctuary', { uid: unit(state, '강철의 브란').uid });
  const fresh2 = state.zones[state.zones.length - 1];
  check('이동 중에도 장판을 깔 수 있다', state.zones.length, during + 1);
  const freshX = L.zoneX(state, fresh2);
  run(state, 0.5);
  check('이동 중에 깐 장판도 흘러간다', L.zoneX(state, fresh2) < freshX - 1, true);
  // 화면 밖으로 나가면 시간이 남아 있어도 사라진다. 되감기는 배경과 달리 장판은
  // 돌아오지 않으므로, 보이지 않는 자리에서 계속 돌게 두지 않는다.
  laid.scrollAt -= D.FIELD.w;
  run(state, 0.05);
  check('바닥 밖으로 나간 장판은 사라진다', state.zones.includes(laid), false);
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
  // **마나는 체력보다 덜 돌려준다**(20% 대 25%). 걸어가는 동안에도 저절로 도는
  // 몫이 함께 붙는데, 그것은 지능 비례라 유닛마다 다르다.
  check('마나는 그보다 덜 늘었다',
    AI.alive(state, 'ally').every((u, i) => {
      const walked = L.MARCH_RECOVER_MP + (u.attrs.int * L.MANA_REGEN_PER_INT * L.WAVE_GAP) / u.maxMp;
      return near(u.mp / u.maxMp - before[i].mp, walked);
    }), true);
  check('마나를 체력보다 덜 돌려준다', L.MARCH_RECOVER_MP < L.MARCH_RECOVER, true);
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
  const idsOf = (state) => branOf(state).skills.map((slot) => slot.id);
  check('못 배운 스킬은 들고 오지 않는다',
    idsOf(rookie).every((id) => D.UNIT_SKILLS[id].minLevel <= 1), true);
  check('넷을 넘겨 들고 가지 않는다', branOf(veteran).skills.length <= D.UNIT_SKILL_MAX, true);
  // 순서는 data.js에 적힌 그대로다 — 그 순서가 곧 AI의 우선순위다. 무엇을 뽑든
  // 든 것을 목록 순서로 되돌려 놓아야, 싸구려 스킬이 광역기보다 먼저 나가지 않는다.
  check('든 것은 목록 순서대로다', idsOf(veteran),
    D.SPEC_SKILLS.tank.filter((id) => idsOf(veteran).includes(id)));
  // 동료가 쓰는 계열은 열 개씩이다. 넷을 고르는 일이 되려면 목록이 훨씬 길어야
  // 하고, 그래야 같은 계열의 동료 둘이 다른 손을 든다. 적 전용 계열은 예외다 —
  // 고블린은 넷을 채울 만큼 배운 것이 없다.
  const companionSpecs = new Set(Object.values(D.COMPANIONS).map((def) => def.spec));
  check('동료 계열은 열 개씩이다',
    [...companionSpecs].every((spec) => D.SPEC_SKILLS[spec].length === 10), true);

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

  // **스킬을 손으로 쥐여 준다.** 계열의 열 개 중 넷을 캐릭터마다 다르게 들고
  // 오므로, 광역 도발을 든 탱커가 걸릴 때까지 기다릴 수는 없다.
  const hold = (unit, ids) => { unit.skills = ids.map((id) => ({ id, readyAt: 0 })); };
  hold(bran, ['roar', 'taunt', 'bash']);

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
  tank2.skills = ['roar', 'taunt', 'bash'].map((id) => ({ id, readyAt: 0 }));
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

  // **골드는 전투가 나누지 않는다.** 모집할 때 부른 보수가 정해져 있고(hire.js),
  // 그것을 내고 남는 것이 주인공 몫이다 — 같은 일을 하는 규칙을 둘로 두면
  // 한쪽만 고치게 된다.
  check('전투는 골드를 세지 않는다',
    ['purse', 'share', 'gold', 'party'].filter((key) => key in reward), []);

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

// --- 등급이 위협과 보상을 함께 정한다 -----------------------------------
//
// 잡졸 여럿이 정예 하나보다 위험하던 때가 있었다. 등급을 나눈 뜻이 살려면 위쪽
// 등급이 하나하나 더 아프고 더 많이 줘야 한다.
{
  const rank = (id) => D.rankOf(D.ENEMIES[id]).id;
  const trash = Object.values(D.ENEMIES).filter((def) => rank(def.id) === 'trash');
  const elite = Object.values(D.ENEMIES).filter((def) => rank(def.id) === 'elite');
  const boss = D.ENEMIES.chief;

  const most = (list, key) => Math.max(...list.map((def) => def[key]));
  check('정예가 잡졸보다 세다',
    Math.min(...elite.map((d) => d.atk)) > most(trash, 'atk'), true);
  check('정예가 잡졸보다 단단하다',
    Math.min(...elite.map((d) => d.hp)) > most(trash, 'hp'), true);
  check('우두머리가 정예보다 세다', boss.atk > most(elite, 'atk'), true);
  check('우두머리가 정예보다 단단하다', boss.hp > most(elite, 'hp'), true);

  // 보상도 같은 순서다. 값이 같으면 무리를 골라 싸울 이유가 없다.
  check('정예가 잡졸보다 많이 준다',
    Math.min(...elite.map((d) => d.exp)) > most(trash, 'exp') * 2, true);
  check('우두머리가 정예보다 많이 준다', boss.exp > most(elite, 'exp') * 3, true);
  check('전리품도 등급 순으로 잘 나온다',
    D.RANKS.trash.drop < D.RANKS.elite.drop && D.RANKS.elite.drop < D.RANKS.boss.drop, true);
  check('좋은 등급이 나올 확률도 그렇다',
    D.RANKS.trash.luck < D.RANKS.elite.luck && D.RANKS.elite.luck < D.RANKS.boss.luck, true);

  // 우두머리는 제 계열을 쓴다. 오크 전사와 같은 것을 들고 있으면 덩치만 큰
  // 오크가 된다 — 잡는 데 오래 걸릴 뿐 무섭지는 않았다.
  check('우두머리 계열이 따로 있다', boss.spec, 'chieftain');
  const kit = D.skillsFor(boss.spec, 10);
  check('광역기를 들고 온다',
    kit.some((id) => D.UNIT_SKILLS[id].kind === 'damage-area'), true);
  check('어그로도 가져간다',
    kit.some((id) => D.UNIT_SKILLS[id].kind.startsWith('taunt')), true);
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

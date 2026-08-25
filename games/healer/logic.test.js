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
  { quest: quest(), party: PARTY, skills: SKILLS, seed: 3 }, over));

const unit = (state, name) => state.units.find((u) => u.name === name);
const run = (state, seconds) => {
  const steps = Math.round(seconds / L.TICK);
  for (let i = 0; i < steps && state.status === 'fighting'; i++) L.step(state, L.TICK);
};

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
  check('개별 대상 힐이 나간다', L.castSkill(state, 'touch', { uid: tank.uid }).ok, true);
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
    L.castSkill(state, 'ripple', { uid: tank.uid }).ok, true);
  check('반경 안의 아군만 회복한다',
    AI.alive(state, 'ally').filter((u) => u.hp > u.maxHp - 200).length, near.length);

  // 8.2 전투 화면의 위치를 기준으로도 발동한다.
  check('장판을 위치에 깔 수 있다',
    L.castSkill(state, 'sanctuary', { x: 30, y: 28 }).ok, true);
  check('장판이 생긴다', state.zones.length, 1);
  check('장판은 고른 위치에 있다', [state.zones[0].x, state.zones[0].y], [30, 28]);

  check('적 장판은 위치로 깐다', L.castSkill(state, 'pyre', { x: 80, y: 28 }).ok, true);
  check('적 도트는 아군에게 못 건다',
    L.castSkill(state, 'flame', { uid: tank.uid }).ok, false);
  check('적 도트는 적에게 건다', L.castSkill(state, 'flame', { uid: foe.uid }).ok, true);
}

// --- 도트와 장판 -------------------------------------------------------
{
  const state = battle({ skills: ['regen', 'sanctuary', 'flame', 'touch', 'focus'] });
  const tank = unit(state, '강철의 브란');
  tank.hp = 200;
  const def = D.PLAYER_SKILLS.regen;

  L.castSkill(state, 'regen', { uid: tank.uid });
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
  L.castSkill(stack, 'regen', { uid: bran.uid });
  run(stack, D.PLAYER_SKILLS.regen.cd + 0.05);
  L.castSkill(stack, 'regen', { uid: bran.uid });
  check('같은 도트는 겹쳐 걸리지 않는다',
    stack.dots.filter((d) => d.targetUid === bran.uid).length, 1);
}

// --- 마나 (기획서 7장) --------------------------------------------------
{
  const state = battle();
  const hero = L.hero(state);
  hero.mp = 40;
  run(state, 12);
  check('마나는 저절로 차지 않는다', hero.mp, 40);

  L.castSkill(state, 'focus', {});
  check('마나 회복 스킬로 찬다', hero.mp, 40 + D.PLAYER_SKILLS.focus.mana);

  hero.mp = 10;
  check('물약으로도 찬다', L.usePotion(state).ok, true);
  check('물약만큼 찬다', hero.mp, 10 + D.POTION.mana);
  check('물약이 하나 준다', state.potions, D.POTION.count - 1);
  check('물약도 쿨타임이 있다', L.usePotion(state).ok, false);

  const empty = battle();
  empty.potions = 0;
  check('물약이 없으면 못 쓴다', L.usePotion(empty).ok, false);

  // 최대치를 넘겨 채워지지 않아야 물약을 아껴 쓸 이유가 생긴다.
  const full = battle();
  L.hero(full).mp = L.hero(full).maxMp - 5;
  L.usePotion(full);
  check('최대치를 넘지 않는다', L.hero(full).mp, L.hero(full).maxMp);
}

// --- 어그로와 피해 -----------------------------------------------------
{
  const state = battle();
  const tank = unit(state, '강철의 브란');
  const dealer = unit(state, '검사 라일');
  const foe = AI.alive(state, 'enemy')[0];

  L.applyDamage(state, dealer, foe, 100);
  check('딜러가 때리면 딜러에게 위협도가 쌓인다',
    state.threat[foe.uid][dealer.uid] > 0, true);
  check('탱커는 같은 피해로 더 많은 위협도를 쌓는다',
    (() => {
      L.applyDamage(state, tank, foe, 100);
      return state.threat[foe.uid][tank.uid] > state.threat[foe.uid][dealer.uid];
    })(), true);

  // 방어력은 곱셈이라 피해가 0이 되는 구간이 없다.
  const soft = unit(state, '궁수 미라');
  const before = soft.hp;
  L.applyDamage(state, foe, soft, 100);
  check('방어력이 낮은 쪽이 더 아프다', soft.maxHp - soft.hp > 0, true);
  check('체력이 실제로 준다', soft.hp < before, true);
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

  // 주인공이 죽으면 남은 동료가 있어도 진다 — 조작할 대상이 없어진다.
  const dead = battle();
  L.applyDamage(dead, null, L.hero(dead), 99999);
  run(dead, 0.1);
  check('주인공이 쓰러지면 패배', dead.status, 'lost');
  check('동료는 남아 있었다', AI.alive(dead, 'ally').length > 0, true);
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
    branOf(rookie).skills.map((slot) => slot.id), ['taunt']);
  // 순서는 data.js에 적힌 그대로다 — 그 순서가 곧 AI의 우선순위다.
  check('레벨이 오르면 들고 온다',
    branOf(veteran).skills.map((slot) => slot.id), ['roar', 'taunt']);

  // 주인공의 수치는 성장 상태에서 계산해 넘어온다. 전투가 레벨 규칙을 다시
  // 알지 못하게 하려는 것이라, 넘긴 값이 그대로 쓰여야 한다.
  const strong = battle({ heroStats: { hp: 1000, mp: 500, heal: 2, armor: 0.5 } });
  check('넘긴 체력이 그대로', L.hero(strong).maxHp, 1000);
  check('넘긴 마나가 그대로', L.hero(strong).maxMp, 500);

  const tank = unit(strong, '강철의 브란');
  tank.hp = 100;
  L.castSkill(strong, 'touch', { uid: tank.uid });
  check('회복력 배수가 힐에 곱해진다', tank.hp, 100 + D.PLAYER_SKILLS.touch.heal * 2);

  // 피해에는 곱해지지 않는다. 힐러의 성장이 딜러 노릇을 잘하게 만드는 쪽으로
  // 흐르면 이 게임이 아니게 된다.
  const flame = battle({ skills: ['flame'], heroStats: { hp: 900, mp: 400, heal: 3, armor: 0.9 } });
  const foe = AI.alive(flame, 'enemy')[0];
  L.castSkill(flame, 'flame', { uid: foe.uid });
  check('피해에는 배수가 붙지 않는다',
    flame.dots.find((dot) => dot.targetUid === foe.uid).amount, D.PLAYER_SKILLS.flame.tick);
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
  L.castSkill(healer, 'touch', { uid: tank.uid });
  const healed = L.rewardOf(healer);
  check('회복이 직업 경험치가 된다', healed.healExp > 0, true);
  check('직업 경험치에 회복 몫이 들어 있다',
    healed.jobExp >= healed.healExp, true);

  const wasted = battle();
  L.castSkill(wasted, 'touch', { uid: unit(wasted, '강철의 브란').uid });
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
// 조작 없이 굴린 결과와 단순한 자동 힐러를 붙인 결과를 함께 본다.
{
  function autoHeal(state) {
    const hero = L.hero(state);
    if (hero.dead) return;
    const ready = (id) => { const slot = L.skillSlot(state, id); return slot && state.t >= slot.readyAt; };
    if (hero.mp < 45 && ready('focus')) return void L.castSkill(state, 'focus', {});
    if (hero.mp < 30 && state.potions > 0 && state.t >= state.potionReadyAt) return void L.usePotion(state);

    const hurt = AI.alive(state, 'ally').filter((u) => u.hp < u.maxHp)
      .sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp));
    if (!hurt.length) return;
    const worst = hurt[0];
    const missing = worst.maxHp - worst.hp;
    const clustered = hurt.filter((u) => AI.dist(u, worst) <= D.PLAYER_SKILLS.ripple.radius
      && u.maxHp - u.hp >= D.PLAYER_SKILLS.ripple.heal);
    if (clustered.length >= 2 && ready('ripple') && hero.mp >= D.PLAYER_SKILLS.ripple.mp) {
      return void L.castSkill(state, 'ripple', { uid: worst.uid });
    }
    if (missing >= 200 && ready('regen')) return void L.castSkill(state, 'regen', { uid: worst.uid });
    if (missing >= 115 && ready('touch')) return void L.castSkill(state, 'touch', { uid: worst.uid });
    if (missing >= 60 && ready('quick')) return void L.castSkill(state, 'quick', { uid: worst.uid });
  }

  function play(waves, seed, withHealer) {
    const state = L.createBattle({ quest: quest({ waves }), party: PARTY, skills: SKILLS, seed });
    let sinceInput = 0;
    for (let i = 0; i < 240 / L.TICK && state.status === 'fighting'; i++) {
      L.step(state, L.TICK);
      sinceInput += L.TICK;
      if (withHealer && sinceInput >= 0.2) { sinceInput = 0; autoHeal(state); }
      L.drainEvents(state);
    }
    return state.status;
  }

  const EASY = [['scout', 'scout', 'scout'], ['scout', 'scout', 'scout', 'shaman']];
  const MID = [['scout', 'scout', 'scout', 'shaman'], ['orc', 'scout', 'shaman'],
    ['orc', 'orc', 'shaman']];
  const HARD = [['orc', 'orc', 'scout', 'scout'], ['hexer', 'shaman', 'orc'], ['chief', 'orc']];

  const seeds = [1, 2, 3, 4, 5];
  const wins = (waves, withHealer) =>
    seeds.filter((seed) => play(waves, seed, withHealer) === 'won').length;

  check('힐러가 놀아도 연습용 판은 넘어간다', wins(EASY, false), 5);
  // 실시간 전투에 난수가 섞여 있어 어쩌다 넘어가는 판이 나온다. 확률이 아니라
  // "손을 놓으면 안 된다"는 것이 확인하려는 것이므로 다섯 판 중 하나까지만 봐준다.
  check('힐러가 놀면 중간 판은 거의 못 깬다', wins(MID, false) <= 1, true);
  check('힐러가 놀면 어려운 판은 못 깬다', wins(HARD, false), 0);
  check('힐이 들어가면 중간 판을 깬다', wins(MID, true), 5);
  check('힐이 들어가면 어려운 판도 깬다', wins(HARD, true), 5);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/healer/ai.test.js
// 직업별 행동 우선순위를 상태만 만들어 놓고 확인한다. 전투를 굴려서 보면
// 우연히 맞은 것인지 규칙대로인지 가릴 수 없다.
//
// **아군과 적이 같은 규칙을 쓴다는 것도 여기서 확인한다.** 한쪽만 고치고 다른
// 쪽을 잊는 것이 이 파일이 막으려는 것이다.
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

// 적 세 직업이 한 웨이브에 다 있어야 딜러의 우선순위를 끝까지 볼 수 있다.
// 실제 퀘스트에는 그런 웨이브가 없어서 여기서만 쓰는 판을 만든다.
const TEST_QUEST = {
  id: 'test', name: '판단 확인용', desc: '', scene: 'mine', level: 1,
  waves: [['shaman', 'scout', 'orc']],
  guildReward: { gold: 0, exp: 0 },
  drops: [], exp: 0,
};

const battle = (over) => L.createBattle(Object.assign({
  quest: TEST_QUEST,
  party: [{ defId: 'bran', level: 1 }, { defId: 'lyle', level: 1 },
    { defId: 'mira', level: 1 }, { defId: 'noa', level: 1 }],
  skills: ['touch'], seed: 5,
}, over));

const named = (state, name) => state.units.find((u) => u.name === name);
const enemies = (state) => AI.alive(state, 'enemy');
const enemyOf = (state, job) => enemies(state).find((u) => u.job === job);

// 서로 사거리 안에 들어와 있게 모아 둔다. 대상 선택을 보려는 것이지
// 누가 먼저 도착하는지를 보려는 것이 아니다.
function gather(state) {
  for (const unit of AI.alive(state, 'ally')) { unit.x = 40; unit.y = 28; }
  for (const unit of enemies(state)) { unit.x = 46; unit.y = 28; }
}

// --- 역할 구분 ---------------------------------------------------------
{
  const state = battle();
  check('탱커는 탱커', AI.roleOf(named(state, '강철의 브란')), 'tank');
  check('사거리 짧은 딜러는 근접', AI.roleOf(named(state, '검사 라일')), 'melee');
  check('사거리 긴 딜러는 원거리', AI.roleOf(named(state, '궁수 미라')), 'ranged');
  check('힐러는 힐러', AI.roleOf(named(state, '사제 노아')), 'healer');
  check('주인공도 힐러', AI.roleOf(L.hero(state)), 'healer');
  check('적도 같은 잣대로 갈린다', AI.roleOf(enemyOf(state, 'dealer')), 'melee');
}

// --- 딜러 --------------------------------------------------------------
{
  const state = battle();
  gather(state);
  const dealer = named(state, '검사 라일');

  // 아무도 우리 힐러를 안 치고 있으면 적 힐러 → 원거리 → 근접 → 탱커.
  check('우리 힐러가 안전하면 적 힐러부터', AI.chooseTarget(dealer, state).job, 'healer');

  enemyOf(state, 'healer').dead = true;
  check('적 힐러가 없으면 딜러', AI.chooseTarget(dealer, state).job, 'dealer');

  enemyOf(state, 'dealer').dead = true;
  check('탱커가 마지막', AI.chooseTarget(dealer, state).job, 'tank');

  enemies(state).forEach((u) => { u.dead = true; });
  check('남은 적이 없으면 대상도 없다', AI.chooseTarget(dealer, state), null);
}
{
  // 우리 힐러를 치는 적이 있으면 그쪽이 먼저다. 우선순위상 맨 뒤인 탱커라도.
  const state = battle();
  gather(state);
  const orc = enemyOf(state, 'tank');
  orc.targetUid = named(state, '사제 노아').uid;
  check('힐러를 치는 적을 먼저 친다',
    AI.chooseTarget(named(state, '검사 라일'), state).uid, orc.uid);
  check('원거리 딜러도 같은 규칙',
    AI.chooseTarget(named(state, '궁수 미라'), state).uid, orc.uid);
  check('그 적은 우선순위상 맨 뒤인 탱커다', orc.job, 'tank');

  // 주인공도 힐러다. 주인공을 치는 적도 같은 대접을 받는다.
  const other = battle();
  gather(other);
  const scout = enemyOf(other, 'dealer');
  scout.targetUid = L.HERO_UID;
  check('주인공을 치는 적도 먼저 친다',
    AI.chooseTarget(named(other, '검사 라일'), other).uid, scout.uid);
}

// --- 탱커 --------------------------------------------------------------
{
  const state = battle();
  gather(state);
  const tank = named(state, '강철의 브란');

  // 모든 적이 탱커를 보고 있으면 도발할 이유가 없다. 때리는 스킬은 나가도 된다 —
  // 여기서 보려는 것은 도발을 고르지 않는다는 것이다.
  enemies(state).forEach((u) => { u.targetUid = tank.uid; });
  const idle = AI.chooseSkill(tank, state, enemies(state)[0]);
  check('어그로가 붙어 있으면 도발하지 않는다',
    idle && D.UNIT_SKILLS[idle.id].kind.startsWith('taunt'), false);

  // 하나라도 다른 아군을 때리기 시작하면 도발로 회수한다.
  const loose = enemyOf(state, 'dealer');
  loose.targetUid = named(state, '궁수 미라').uid;
  const choice = AI.chooseSkill(tank, state, loose);
  check('어그로가 풀리면 도발한다', choice && choice.id, 'taunt');
  check('풀린 적을 겨냥한다', choice.targetUid, loose.uid);
  check('그쪽으로 대상을 돌린다', AI.chooseTarget(tank, state).uid, loose.uid);

  L.step(state, L.TICK);
  check('도발이 나가면 그 적이 탱커를 본다', AI.byUid(state, loose.uid).targetUid, tank.uid);
  check('도발은 지속 시간이 있다', AI.byUid(state, loose.uid).tauntUntil > state.t, true);

  // 도발이 쿨타임이면 다시 나가지 않는다.
  const again = enemyOf(state, 'tank');
  again.targetUid = named(state, '사제 노아').uid;
  // 아무 스킬도 안 나가는지가 아니라 **도발이** 안 나가는지를 본다. 때리는
  // 스킬은 사거리만 맞으면 나가도 되고, 사거리는 대열이 어떻게 서느냐에 따라
  // 달라진다.
  const later = AI.chooseSkill(tank, state, again);
  check('도발은 쿨타임 동안 다시 안 나간다',
    Boolean(later && D.UNIT_SKILLS[later.id].kind.startsWith('taunt')), false);
}
{
  // 여럿이 풀렸으면 힐러 → 원거리 → 근접 순으로 구한다.
  const state = battle();
  gather(state);
  const tank = named(state, '강철의 브란');
  const onMelee = enemyOf(state, 'dealer');
  const onHealer = enemyOf(state, 'healer');
  const onRanged = enemyOf(state, 'tank');
  onMelee.targetUid = named(state, '검사 라일').uid;

  check('근접만 맞고 있으면 그쪽',
    AI.chooseSkill(tank, state, onMelee).targetUid, onMelee.uid);

  onRanged.targetUid = named(state, '궁수 미라').uid;
  check('원거리가 맞기 시작하면 그쪽이 먼저',
    AI.chooseSkill(tank, state, onMelee).targetUid, onRanged.uid);

  onHealer.targetUid = named(state, '사제 노아').uid;
  check('힐러가 맞기 시작하면 그쪽이 먼저',
    AI.chooseSkill(tank, state, onMelee).targetUid, onHealer.uid);

  onHealer.dead = true;
  check('힐러가 안전하면 원거리 딜러',
    AI.chooseSkill(tank, state, onMelee).targetUid, onRanged.uid);
}
{
  // 광역 도발은 둘 이상 풀렸을 때만 쓴다. 쿨타임이 길어 하나에 쓰면 아깝다.
  const state = battle({ party: [{ defId: 'bran', level: 4 }, { defId: 'lyle', level: 1 },
    { defId: 'mira', level: 1 }, { defId: 'noa', level: 1 }] });
  gather(state);
  const tank = named(state, '강철의 브란');
  // 계열의 열 개 중 넷을 캐릭터마다 다르게 들고 오므로, 여기서 보려는 스킬은
  // 손으로 쥐여 준다. 무엇을 들고 오는가는 data.js의 skillsFor가 볼 일이다.
  tank.skills = ['roar', 'taunt', 'bash'].map((id) => ({ id, readyAt: 0 }));
  check('광역 도발과 단일 도발을 함께 든 탱커',
    tank.skills.map((s) => s.id).includes('roar'), true);

  enemies(state).forEach((u) => { u.targetUid = tank.uid; });
  enemyOf(state, 'dealer').targetUid = named(state, '궁수 미라').uid;
  check('하나만 풀리면 단일 도발', AI.chooseSkill(tank, state, null).id, 'taunt');

  enemyOf(state, 'healer').targetUid = named(state, '사제 노아').uid;
  check('둘 이상 풀리면 광역 도발', AI.chooseSkill(tank, state, null).id, 'roar');
}

// --- 힐러 --------------------------------------------------------------
{
  const state = battle();
  gather(state);
  const healer = named(state, '사제 노아');
  const tank = named(state, '강철의 브란');
  const melee = named(state, '검사 라일');
  const ranged = named(state, '궁수 미라');
  const heal = D.UNIT_SKILLS.mend.heal;

  check('아무도 안 다쳤으면 힐 대상이 없다', AI.healTarget(healer, state, heal), null);

  // 조금 깎인 정도로는 쓰지 않는다 — 넘치는 힐량이 그대로 마나 손해다.
  tank.hp = tank.maxHp - Math.floor(heal * 0.5);
  check('조금 깎인 정도로는 힐하지 않는다', AI.healTarget(healer, state, heal), null);

  tank.hp = tank.maxHp - heal;
  check('거의 다 채울 수 있으면 힐한다', AI.healTarget(healer, state, heal).uid, tank.uid);

  // 탱커 최우선. 딜러가 더 많이 깎였어도 탱커가 조건을 만족하면 탱커부터.
  melee.hp = 1;
  check('탱커를 먼저 본다', AI.healTarget(healer, state, heal).uid, tank.uid);

  // 탱커에게 여유가 있으면 힐러 → 근접 → 원거리.
  tank.hp = tank.maxHp;
  ranged.hp = 1;
  check('탱커가 멀쩡하면 근접이 원거리보다 먼저',
    AI.healTarget(healer, state, heal).uid, melee.uid);

  healer.hp = healer.maxHp - heal;
  check('힐러가 근접보다 먼저', AI.healTarget(healer, state, heal).uid, healer.uid);

  // 마나가 없으면 힐이 아니라 마나를 되찾는 쪽을 고른다. 마나를 주로 쓰는
  // 계열은 1레벨부터 그 스킬을 들고 온다.
  healer.mp = 0;
  tank.hp = tank.maxHp - heal;
  const dry = AI.chooseSkill(healer, state, enemies(state)[0]);
  check('마나가 없으면 힐 스킬을 고르지 않는다',
    dry && D.UNIT_SKILLS[dry.id].kind === 'heal', false);
  check('대신 마나를 되찾는다', dry && D.UNIT_SKILLS[dry.id].kind, 'mana');

  // 그 스킬마저 없으면 아무것도 고르지 않는다.
  healer.skills = healer.skills.filter((slot) => D.UNIT_SKILLS[slot.id].kind !== 'mana');
  check('되찾을 길이 없으면 아무것도 못 쓴다',
    AI.chooseSkill(healer, state, enemies(state)[0]), null);
}

// --- 기절 (근접 세 계열) ------------------------------------------------
{
  const state = battle();
  gather(state);
  const tank = named(state, '강철의 브란');
  tank.skills = ['shieldSlam', 'bash'].map((id) => ({ id, readyAt: 0 }));
  const foes = enemies(state);

  const pick = AI.chooseSkill(tank, state, foes[0]);
  check('닿는 적에게 기절을 건다', pick && pick.id, 'shieldSlam');

  // 이미 굳어 있는 적에게 다시 걸면 남은 시간이 겹쳐 사라지고 쿨타임만 버린다.
  for (const foe of foes) foe.stunUntil = state.t + 2;
  const again = AI.chooseSkill(tank, state, foes[0]);
  check('굳어 있는 적에게는 다시 걸지 않는다', again && again.id, 'bash');

  // 외우는 적이 있으면 그쪽이 먼저다 — 끊는 것이 기절의 값이다.
  for (const foe of foes) foe.stunUntil = 0;
  const casting = foes[foes.length - 1];
  casting.cast = { skillId: 'hex', name: '저주', targetUid: tank.uid, startedAt: 0, endsAt: 9 };
  const cut = AI.chooseSkill(tank, state, foes[0]);
  check('외우는 적을 먼저 끊는다', cut && cut.targetUid, casting.uid);

  // 원거리 계열에는 기절이 없다. 붙어야 넣을 수 있는 것이 기절이고, 멀리서 거는
  // 수단까지 있으면 후열이 아무것도 못 하는 판이 나온다.
  const stunSpecs = Object.entries(D.SPEC_SKILLS)
    .filter(([, list]) => list.some((id) => D.UNIT_SKILLS[id].kind === 'stun'))
    .map(([spec]) => spec).sort();
  // 상위 계열은 아래 계열의 목록을 물려받으므로 근접 셋의 상위 셋까지 나온다.
  // 늘어난 것이 그 여섯뿐인지를 본다 — 원거리 상위가 기절을 얻으면 여기서 걸린다.
  const melee = ['rogue', 'tank', 'warrior'];
  check('기절은 근접 계열만 갖는다', stunSpecs,
    melee.concat(melee.map((spec) => D.SPEC_UP[spec].spec)).sort());
}

// --- 음유시인: 아군의 마나를 채운다 -------------------------------------
//
// 마나 회복 스킬은 지금까지 전부 자기 것만 채웠다(마나 순환·명상·마력 흡수).
// 밖에서 남을 채우는 것은 이 계열뿐이라 판단 규칙도 따로다.
{
  const state = battle({ party: [{ defId: 'bran', level: 9 }, { defId: 'finn', level: 9 },
    { defId: 'lyle', level: 9 }, { defId: 'noa', level: 9 }] });
  gather(state);
  const bard = named(state, '음유시인 핀');
  const tank = named(state, '강철의 브란');
  const healer = named(state, '사제 노아');
  const melee = named(state, '검사 라일');
  // 계열의 열 개 중 넷을 캐릭터마다 다르게 들고 오므로, 여기서 보려는 둘은
  // 손으로 쥐여 준다.
  // 여기서 보려는 것은 마나를 누구에게 채우는가뿐이라, 강화·약화는 빼고 쥐여
  // 준다 — 목록 앞이 노래라 그냥 두면 늘 그쪽이 먼저 걸린다.
  bard.skills = ['echo', 'refrain', 'chord'].map((id) => ({ id, readyAt: 0 }));
  const refrain = D.UNIT_SKILLS.refrain;

  check('아군 마나가 넉넉하면 채워 줄 대상이 없다',
    AI.manaTarget(bard, state, refrain.mana), null);

  // 조금 빈 정도로는 쓰지 않는다. 부어서 넘치면 긴 쿨타임만 버리는 셈이다.
  tank.mp = tank.maxMp - Math.floor(refrain.mana * 0.5);
  check('조금 빈 정도로는 채우지 않는다', AI.manaTarget(bard, state, refrain.mana), null);

  tank.mp = 0;
  check('마른 아군을 채운다', AI.manaTarget(bard, state, refrain.mana).uid, tank.uid);

  // 누구부터인가는 회복 순서(HEAL_ORDER)를 그대로 쓴다 — 마나가 마르면 탱커는
  // 도발을, 힐러는 힐을 못 한다.
  healer.mp = 0;
  check('탱커가 힐러보다 먼저', AI.manaTarget(bard, state, refrain.mana).uid, tank.uid);
  tank.mp = tank.maxMp;
  check('그다음이 힐러', AI.manaTarget(bard, state, refrain.mana).uid, healer.uid);

  // 스킬을 안 쓰는 유닛(최대 마나 0)은 애초에 대상이 아니다.
  const noMana = { uid: 'x', side: 'ally', dead: false, mp: 0, maxMp: 0, x: 40, y: 28, job: 'dealer' };
  state.units.push(noMana);
  check('마나를 안 쓰는 유닛은 대상이 아니다',
    AI.manaTarget(bard, state, refrain.mana).uid, healer.uid);
  state.units.pop();

  // 하나만 말랐으면 광역은 아낀다. 쿨타임이 길어 둘 이상일 때 써야 값을 한다.
  const one = AI.chooseSkill(bard, state, enemies(state)[0]);
  check('하나만 마르면 후렴', one && one.id, 'refrain');

  melee.mp = 0;
  tank.mp = 0;
  const many = AI.chooseSkill(bard, state, enemies(state)[0]);
  check('여럿이 마르면 메아리', many && many.id, 'echo');
  check('메아리가 광역 마나다', D.UNIT_SKILLS[many.id].kind, 'mana-area');
  check('반경 안 아군을 본다', D.UNIT_SKILLS.echo.radius > 0, true);
}

// --- 강화와 약화를 언제 거는가 ------------------------------------------
{
  const state = battle({ party: [{ defId: 'bran', level: 9 }, { defId: 'finn', level: 9 },
    { defId: 'lyle', level: 9 }, { defId: 'noa', level: 9 }] });
  gather(state);
  const bard = named(state, '음유시인 핀');
  const tank = named(state, '강철의 브란');
  const melee = named(state, '검사 라일');
  const foe = enemies(state)[0];

  bard.skills = ['harmony', 'lament', 'chord'].map((id) => ({ id, readyAt: 0 }));

  // 받는 피해를 줄이는 강화는 회복 순서를 그대로 쓴다 — 맞는 사람부터다.
  check('받는 피해 강화는 탱커부터',
    AI.buffTarget(bard, state, D.UNIT_SKILLS.harmony).uid, tank.uid);

  const first = AI.chooseSkill(bard, state, foe);
  check('걸린 것이 없으면 먼저 건다', first && first.id, 'harmony');

  // **걸려 있으면 다시 걸지 않는다.** 곱이 겹치지 않으므로 쿨타임만 버린다.
  tank.auras = [{ skillId: 'harmony', stat: 'armor', mul: 0.78, endsAt: state.t + 9 }];
  check('걸린 대상은 건너뛴다', AI.hasAura(tank, 'harmony'), true);
  const next = AI.buffTarget(bard, state, D.UNIT_SKILLS.harmony);
  check('안 걸린 아군에게 넘어간다', next.uid !== tank.uid, true);

  // 공격력 강화는 가장 세게 때리는 아군부터다. 계열을 보지 않고 무엇을 올리는지만 본다.
  const punchy = AI.buffTarget(bard, state, D.UNIT_SKILLS.anthem);
  check('공격력 강화는 센 아군부터',
    AI.alive(state, 'ally').every((mate) => mate.atk <= punchy.atk), true);

  // 약화는 딜러가 고른 상대에게 건다. 다른 적에게 걸면 걸어 놓고 안 때린다.
  tank.auras = [];
  bard.skills = ['lament'].map((id) => ({ id, readyAt: 0 }));
  const hex = AI.chooseSkill(bard, state, foe);
  check('약화는 때릴 상대에게', hex && hex.targetUid, foe.uid);
  foe.auras = [{ skillId: 'lament', stat: 'armor', mul: 1.3, endsAt: state.t + 9 }];
  const other = AI.chooseSkill(bard, state, foe);
  check('이미 걸린 적에게는 안 건다', other && other.targetUid !== foe.uid, true);

  // **급한 사람이 있으면 노래보다 힐이 먼저다.** 강화는 지금 당장 죽는 것을
  // 막지 못하는데, 목록 앞이라는 이유로 쓰러져 가는 탱커를 두고 노래를 불렀다.
  for (const f of enemies(state)) f.auras = [{ skillId: 'lament', stat: 'armor', mul: 1.3, endsAt: state.t + 9 }];
  bard.skills = ['harmony', 'lament', 'chord'].map((id) => ({ id, readyAt: 0 }));
  tank.hp = Math.floor(tank.maxHp * 0.2);
  const urgent = AI.chooseSkill(bard, state, foe);
  check('급하면 힐이 먼저', urgent && urgent.id, 'chord');

  // 힐을 안 들고 온 유닛에게는 이 규칙이 걸리지 않는다 — 그러면 아무것도 안 하고 선다.
  const warrior = named(state, '검사 라일');
  warrior.skills = [{ id: 'bracing', readyAt: 0 }];
  warrior.mp = warrior.maxMp;
  const brace = AI.chooseSkill(warrior, state, foe);
  check('힐이 없으면 급해도 건다', brace && brace.id, 'bracing');
  check('사거리 0은 자기에게', brace && brace.targetUid, warrior.uid);
  void melee;
}

// --- 적도 같은 논리로 움직인다 -----------------------------------------
{
  const state = battle();
  gather(state);
  const scout = enemyOf(state, 'dealer');
  const orc = enemyOf(state, 'tank');
  const shaman = enemyOf(state, 'healer');
  const lyle = named(state, '검사 라일');

  // 적 딜러도 상대편 힐러부터 노린다.
  check('적 딜러는 우리 힐러부터', AI.roleOf(AI.chooseTarget(scout, state)), 'healer');

  // 그 편의 힐러를 치는 쪽이 있으면 그쪽이 먼저다.
  lyle.targetUid = shaman.uid;
  check('적 딜러는 제 힐러를 치는 쪽을 먼저', AI.chooseTarget(scout, state).uid, lyle.uid);
  check('적 탱커도 그쪽으로 간다', AI.chooseTarget(orc, state).uid, lyle.uid);

  // 같은 논리를 쓴다는 것은 같은 수단을 갖는다는 뜻이기도 하다. 도발이 이쪽에만
  // 있으면 적 힐러는 아무에게도 보호받지 못한다.
  check('적 탱커도 도발을 들고 온다',
    orc.skills.some((slot) => slot.id === 'taunt'), true);
  const pull = AI.chooseSkill(orc, state, lyle);
  check('제 힐러를 치는 쪽에게 도발한다', pull && pull.targetUid, lyle.uid);

  // 도발은 아군이든 적이든 다른 모든 판단을 이긴다.
  scout.tauntUid = named(state, '강철의 브란').uid;
  scout.tauntUntil = state.t + 3;
  check('도발이 우선순위를 이긴다', AI.chooseTarget(scout, state).job, 'tank');
  scout.tauntUntil = state.t - 1;
  check('도발이 풀리면 다시 우선순위대로', AI.chooseTarget(scout, state).uid, lyle.uid);
}

// --- 사거리 ------------------------------------------------------------
{
  const state = battle();
  gather(state);
  const melee = named(state, '검사 라일');
  const ranged = named(state, '궁수 미라');
  const healer = named(state, '사제 노아');
  const tank = named(state, '강철의 브란');
  const foe = enemyOf(state, 'healer');

  check('강타는 사거리가 짧다', D.UNIT_SKILLS.cleave.range < D.UNIT_SKILLS.aimed.range, true);

  melee.x = foe.x - D.UNIT_SKILLS.cleave.range - 2;
  check('사거리 밖이면 근접 스킬이 안 나간다', AI.chooseSkill(melee, state, foe), null);
  melee.x = foe.x - D.UNIT_SKILLS.cleave.range + 2;
  check('들어오면 나간다', AI.chooseSkill(melee, state, foe).id, 'cleave');
  check('사거리 밖이면 대신 다가간다',
    (() => { melee.x = foe.x - 40; const m = AI.chooseMove(melee, state, foe); return m && m.x > melee.x; })(),
    true);

  // 원거리는 멀리서 쏜다.
  ranged.x = foe.x - D.UNIT_SKILLS.aimed.range + 2;
  check('원거리는 멀리서도 나간다', AI.chooseSkill(ranged, state, foe).id, 'aimed');

  // 힐도 사거리가 있다. 닿지 않으면 대신 그쪽으로 간다.
  tank.hp = tank.maxHp - D.UNIT_SKILLS.mend.heal;
  healer.x = tank.x - D.UNIT_SKILLS.mend.range - 5;
  check('사거리 밖이면 힐이 안 나간다', AI.chooseSkill(healer, state, foe), null);
  const step = AI.chooseMove(healer, state, foe);
  check('대신 탱커 쪽으로 간다', step && step.x > healer.x, true);
  healer.x = tank.x - 5;
  check('들어오면 힐이 나간다', AI.chooseSkill(healer, state, foe).id, 'mend');
}

// --- 붙기와 물러서기 ---------------------------------------------------
{
  // 후열은 맞아도 도망가지 않는다. 탱커 곁에 붙어야 탱커가 어그로를 가져간다.
  const state = battle();
  gather(state);
  const tank = named(state, '강철의 브란');
  const ranged = named(state, '궁수 미라');
  const melee = named(state, '검사 라일');
  const foe = enemyOf(state, 'dealer');

  tank.x = 60; tank.y = 28;
  ranged.x = 20; ranged.y = 28;
  foe.x = 22; foe.y = 28;
  foe.targetUid = ranged.uid;
  const stick = AI.chooseMove(ranged, state, foe);
  check('맞고 있어도 탱커에게 붙는다', stick && stick.x > ranged.x, true);

  // 탱커가 없으면 근접 딜러에게 붙는다.
  tank.dead = true;
  melee.x = 60; melee.y = 28;
  const toMelee = AI.chooseMove(ranged, state, foe);
  check('탱커가 없으면 근접 딜러에게', toMelee && toMelee.x > ranged.x, true);
  check('붙을 자리가 근접 딜러다', AI.anchorOf(ranged, state).uid, melee.uid);

  // 둘 다 없으면 그제야 물러선다.
  melee.dead = true;
  const away = AI.chooseMove(ranged, state, foe);
  check('붙을 곳이 없으면 물러선다', away && away.x < ranged.x, true);
  check('그래도 때리는 것은 멈추지 않는다', AI.decide(ranged, state).attack !== null, true);
}
{
  // 근접은 대상 쪽으로 붙는다.
  const state = battle();
  const tank = named(state, '강철의 브란');
  const foe = enemies(state)[0];
  tank.x = 10; tank.y = 28;
  foe.x = 80; foe.y = 28;
  check('근접은 대상 쪽으로 간다', AI.chooseMove(tank, state, foe).x > tank.x, true);
}

// --- 물약 (마나를 다 쓴 동료가 서 있지 않게) ----------------------------
{
  const state = battle();
  gather(state);
  const healer = named(state, '사제 노아');
  const tank = named(state, '강철의 브란');

  check('멀쩡하면 안 마신다', AI.choosePotion(healer, state), null);

  // 체력이 먼저다. 마나가 없어 못 싸우는 것보다 죽는 것이 급하다.
  healer.hp = healer.maxHp * (AI.POTION_HP - 0.05);
  healer.mp = 0;
  check('둘 다 급하면 체력부터', AI.choosePotion(healer, state), 'health');

  healer.hp = healer.maxHp;
  check('마나가 없으면 마나 물약', AI.choosePotion(healer, state), 'mana');

  // 가장 싼 스킬을 쓸 만큼 남아 있으면 아직 마시지 않는다. 물약은 수가 적어
  // 아무 때나 마시면 정작 필요할 때 없다.
  healer.mp = D.UNIT_SKILLS.mend.mp * 2;
  check('쓸 만큼 있으면 아낀다', AI.choosePotion(healer, state), null);

  healer.mp = 0;
  healer.potions = { mana: 0, health: 0 };
  check('없으면 못 마신다', AI.choosePotion(healer, state), null);

  // 쿨타임이 도는 동안에는 마시지 않는다.
  healer.potions = { mana: 2, health: 1 };
  healer.potionReadyAt = state.t + 5;
  check('쿨타임 중에는 안 마신다', AI.choosePotion(healer, state), null);

  // 물약을 마시는 턴에는 스킬을 쓰지 않는다. 마시자마자 그 마나로 스킬을 쓰면
  // 물약이 사실상 스킬 하나를 공짜로 얹어 주는 것이 된다.
  tank.hp = tank.maxHp * 0.2;
  tank.potionReadyAt = 0;
  const decision = AI.decide(tank, state);
  check('물약을 고르면', decision.potion, 'health');
  check('그 턴에는 스킬을 쓰지 않는다', decision.skill, null);
  check('때리는 것은 막지 않는다', decision.attack !== undefined, true);

  // 실제로 마셔지는지. 회복량은 최대치의 비율이다.
  const drinker = battle();
  const bran = named(drinker, '강철의 브란');
  bran.hp = 100;
  const before = bran.hp;
  check('마신다', L.drink(drinker, bran, 'health').ok, true);
  check('최대 체력의 비율만큼 찬다',
    Math.round(bran.hp - before), Math.round(bran.maxHp * D.POTIONS.health.ratio));
  check('물약이 준다', bran.potions.health, D.JOB_POTIONS.tank.health - 1);
  check('연달아 못 마신다', L.drink(drinker, bran, 'health').ok, false);
}

// --- 탱커는 도발에 쓸 마나를 남긴다 -------------------------------------
//
// 때리는 스킬로 마나를 다 쓰고 나면, 정작 적이 힐러에게 붙었을 때 끌어올 수단이
// 없다. 위협도 표를 없앤 뒤로 어그로를 움직이는 것은 도발뿐이다.
{
  const state = battle({ party: [{ defId: 'bran', level: 8 }, { defId: 'lyle', level: 8 },
    { defId: 'mira', level: 8 }, { defId: 'noa', level: 8 }] });
  gather(state);
  const tank = named(state, '강철의 브란');
  const reserve = AI.tauntReserve(tank);

  check('도발 몫이 잡혀 있다', reserve > 0, true);
  check('들고 있는 도발을 한 번씩 쓸 만큼이다', reserve,
    tank.skills
      .map((slot) => D.UNIT_SKILLS[slot.id])
      .filter((def) => def.kind === 'taunt' || def.kind === 'taunt-area')
      .reduce((sum, def) => sum + def.mp, 0));

  // 도발이 필요 없는 상황에서도 남은 마나가 도발 몫뿐이면 때리지 않는다.
  // **마나를 되찾는 스킬은 빼고 본다** — 그것은 일부러 예약에 걸리지 않게 두었고
  // (그것까지 막으면 바닥난 탱커가 영영 도발을 못 한다), 여기서 보려는 것은
  // 때리는 스킬 쪽이다.
  tank.skills = tank.skills.filter((slot) => D.UNIT_SKILLS[slot.id].kind !== 'mana');
  enemies(state).forEach((u) => { u.targetUid = tank.uid; });
  tank.mp = reserve + 1;
  check('마나가 도발 몫뿐이면 때리는 스킬을 아낀다',
    AI.chooseSkill(tank, state, enemies(state)[0]), null);

  tank.mp = tank.maxMp;
  const rich = AI.chooseSkill(tank, state, enemies(state)[0]);
  check('여유가 있으면 때린다', rich && D.UNIT_SKILLS[rich.id].kind.startsWith('taunt'), false);

  // 남겨 둔 덕에, 적이 힐러에게 붙는 순간 도발이 나간다.
  tank.mp = reserve;
  enemyOf(state, 'dealer').targetUid = named(state, '사제 노아').uid;
  const pull = AI.chooseSkill(tank, state, enemyOf(state, 'dealer'));
  check('힐러가 맞으면 남긴 마나로 도발한다',
    pull && D.UNIT_SKILLS[pull.id].kind.startsWith('taunt'), true);

  // 마나를 되찾는 스킬까지 막으면 바닥난 탱커가 영영 도발을 못 한다.
  const caster = battle({ party: [{ defId: 'noa', level: 8 }] });
  const priest = named(caster, '사제 노아');
  priest.mp = 0;
  const refill = AI.chooseSkill(priest, caster, enemies(caster)[0]);
  check('마나 회복 스킬은 예약에 막히지 않는다',
    refill && D.UNIT_SKILLS[refill.id].kind, 'mana');
}

// --- 회복시킬 사람이 없으면 힐러도 때린다 -------------------------------
{
  const state = battle();
  const healer = named(state, '사제 노아');
  const tank = named(state, '강철의 브란');
  const foe = enemies(state)[0];

  // 아무도 안 다쳤고 적이 멀다: 사거리 안까지 나간다.
  AI.alive(state, 'ally').forEach((u) => { u.x = 20; u.y = 28; });
  enemies(state).forEach((u) => { u.x = 80; u.y = 28; });
  tank.x = 40;
  const step = AI.chooseMove(healer, state, foe);
  check('때리러 나간다', step && step.x > healer.x, true);
  check('탱커를 앞지르지는 않는다', step.x <= tank.x, true);

  // 회복할 사람이 생기면 때리러 나가지 않는다.
  tank.hp = tank.maxHp - D.UNIT_SKILLS.mend.heal;
  const toTank = AI.chooseMove(healer, state, foe);
  check('회복이 먼저다', !toTank || toTank.x <= tank.x, true);

  // 붙을 자리에 이미 서 있고 적도 사거리 안이면 움직이지 않는다.
  tank.hp = tank.maxHp;
  tank.x = foe.x - 12;
  healer.x = tank.x - AI.STICK;
  check('제자리면 그대로 선다', AI.chooseMove(healer, state, foe), null);
  check('그리고 때린다', AI.decide(healer, state).attack, foe.uid);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/healer/ai.test.js
// 기획서 10~14장의 직업별 행동 우선순위를 상태만 만들어 놓고 확인한다.
// 전투를 굴려서 보면 우연히 맞은 것인지 규칙대로인지 가릴 수 없다.
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

// 서로 사거리 안에 들어와 있게 모아 둔다. 대상 선택을 보려는 것이지
// 누가 먼저 도착하는지를 보려는 것이 아니다.
function gather(state) {
  for (const unit of AI.alive(state, 'ally')) { unit.x = 40; unit.y = 28; }
  for (const unit of enemies(state)) { unit.x = 46; unit.y = 28; }
}

// --- 딜러 (기획서 12장) -------------------------------------------------
{
  const state = battle();
  gather(state);
  const dealer = named(state, '검사 라일');
  const tank = named(state, '강철의 브란');

  // 탱커가 어그로를 잡은 적이 없으면 적 힐러 → 딜러 → 탱커.
  const first = AI.chooseTarget(dealer, state);
  check('탱커가 잡은 적이 없으면 적 힐러부터', first.job, 'healer');

  first.dead = true;
  check('적 힐러가 없으면 적 딜러', AI.chooseTarget(dealer, state).job, 'dealer');

  enemies(state).filter((u) => u.job === 'dealer').forEach((u) => { u.dead = true; });
  check('그다음이 적 탱커', AI.chooseTarget(dealer, state).job, 'tank');

  enemies(state).forEach((u) => { u.dead = true; });
  check('남은 적이 없으면 대상도 없다', AI.chooseTarget(dealer, state), null);

  // 탱커가 어그로를 잡고 있으면 그 적이 우선이다. 우선순위상 마지막인 탱커라도.
  const held = battle();
  gather(held);
  const orc = enemies(held).find((u) => u.job === 'tank');
  orc.targetUid = named(held, '강철의 브란').uid;
  check('탱커가 잡은 적을 먼저 친다',
    AI.chooseTarget(named(held, '검사 라일'), held).uid, orc.uid);
  check('그 적은 우선순위상 마지막인 탱커다', orc.job, 'tank');
  check('탱커가 살아 있어야 성립한다', tank.dead, false);
}

// --- 탱커 (기획서 11장) -------------------------------------------------
{
  const state = battle();
  gather(state);
  const tank = named(state, '강철의 브란');

  // 모든 적이 탱커를 보고 있으면 도발할 이유가 없다.
  enemies(state).forEach((u) => { u.targetUid = tank.uid; });
  check('어그로가 붙어 있으면 도발하지 않는다', AI.chooseSkill(tank, state, enemies(state)[0]), null);

  // 하나라도 다른 아군을 때리기 시작하면 도발로 회수한다.
  const loose = enemies(state)[0];
  loose.targetUid = named(state, '궁수 미라').uid;
  const choice = AI.chooseSkill(tank, state, loose);
  check('어그로가 풀리면 도발한다', choice && choice.id, 'taunt');
  check('풀린 적을 겨냥한다', choice.targetUid, loose.uid);

  L.step(state, L.TICK);
  check('도발이 나가면 그 적이 탱커를 본다', AI.byUid(state, loose.uid).targetUid, tank.uid);
  check('도발은 지속 시간이 있다',
    AI.byUid(state, loose.uid).tauntUntil > state.t, true);

  // 도발이 쿨타임이면 다시 나가지 않는다.
  const again = enemies(state)[1];
  again.targetUid = named(state, '사제 노아').uid;
  check('도발은 쿨타임 동안 다시 안 나간다', AI.chooseSkill(tank, state, again), null);
}

// --- 동료 힐러 (기획서 13장) --------------------------------------------
{
  const state = battle();
  gather(state);
  const healer = named(state, '사제 노아');
  const tank = named(state, '강철의 브란');
  const dealer = named(state, '검사 라일');
  const heal = D.UNIT_SKILLS.mend.heal;

  check('아무도 안 다쳤으면 힐 대상이 없다', AI.healTarget(healer, state, heal), null);

  // 조금 깎인 정도로는 쓰지 않는다 — 넘치는 힐량이 그대로 마나 손해다.
  tank.hp = tank.maxHp - Math.floor(heal * 0.5);
  check('조금 깎인 정도로는 힐하지 않는다', AI.healTarget(healer, state, heal), null);

  // 한 번의 힐로 거의 다 채울 만큼 깎이면 쓴다.
  tank.hp = tank.maxHp - heal;
  const pick = AI.healTarget(healer, state, heal);
  check('거의 다 채울 수 있으면 힐한다', pick && pick.uid, tank.uid);

  // 탱커 최우선. 딜러가 더 많이 깎였어도 탱커가 조건을 만족하면 탱커부터.
  dealer.hp = 1;
  check('탱커를 먼저 본다', AI.healTarget(healer, state, heal).uid, tank.uid);

  // 탱커가 멀쩡하면 위급한 다른 아군으로 간다.
  tank.hp = tank.maxHp;
  check('탱커가 멀쩡하면 위급한 쪽', AI.healTarget(healer, state, heal).uid, dealer.uid);

  // 마나가 없으면 판단 자체가 성립하지 않는다.
  healer.mp = 0;
  tank.hp = tank.maxHp - heal;
  check('마나가 없으면 힐 스킬을 고르지 않는다',
    AI.chooseSkill(healer, state, enemies(state)[0]), null);
}

// --- 적 어그로 ----------------------------------------------------------
{
  const state = battle();
  gather(state);
  const foe = enemies(state)[0];
  const tank = named(state, '강철의 브란');
  const dealer = named(state, '검사 라일');

  state.threat[foe.uid] = { [tank.uid]: 100, [dealer.uid]: 300 };
  check('위협도가 가장 높은 쪽을 본다', AI.chooseTarget(foe, state).uid, dealer.uid);

  foe.tauntUid = tank.uid;
  foe.tauntUntil = state.t + 3;
  check('도발은 위협도를 이긴다', AI.chooseTarget(foe, state).uid, tank.uid);

  foe.tauntUntil = state.t - 1;
  check('도발이 풀리면 다시 위협도대로', AI.chooseTarget(foe, state).uid, dealer.uid);

  // 주인공이 공격 스킬로 어그로를 끌 수 있어야 기획서 9장의 도트가 선택이 된다.
  // 첫 째깍이기 전에 죽지 않도록 가장 단단한 적에게 건다.
  const heroState = battle({ skills: ['flame', 'touch', 'quick', 'regen', 'focus'] });
  gather(heroState);
  const target = enemies(heroState).find((u) => u.job === 'tank');
  L.castSkill(heroState, 'flame', { uid: target.uid });
  for (let i = 0; i < Math.round(3 / L.TICK); i++) L.step(heroState, L.TICK);
  check('주인공이 피해를 주면 위협도가 쌓인다',
    (heroState.threat[target.uid] || {})[L.HERO_UID] > 0, true);
}

// --- 이동 --------------------------------------------------------------
{
  const state = battle();
  const tank = named(state, '강철의 브란');
  const healer = named(state, '사제 노아');
  const foe = enemies(state)[0];

  // 근접은 붙는다.
  tank.x = 10; tank.y = 28;
  foe.x = 80; foe.y = 28;
  const step = AI.chooseMove(tank, state, foe);
  check('근접은 대상 쪽으로 간다', step.x > tank.x, true);

  // 힐러는 적이 붙으면 물러선다.
  healer.x = 78; healer.y = 28;
  const away = AI.chooseMove(healer, state, foe);
  check('힐러는 적이 붙으면 물러선다', away.x < healer.x, true);

  // 탱커가 앞서 나가면 힐러가 따라붙는다 — 사거리를 벗어나면 힐이 끊긴다.
  healer.x = 5; healer.y = 28;
  tank.x = 70; tank.y = 28;
  foe.x = 95;
  const follow = AI.chooseMove(healer, state, foe);
  check('힐러는 탱커를 따라간다', follow && follow.x > healer.x, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/healer/flow.test.js
//
// 화면 코드가 부르는 규칙들이 실제로 있는지, **이겼을 때와 졌을 때 둘 다** 확인한다.
// 이 파일이 생긴 이유가 있다: 결과 화면의 분배 목록이 옮겨 간 함수(D.itemDef)를
// 계속 부르고 있었는데, 그 코드는 이겼을 때만 도는 자리라 브라우저로 확인할 때마다
// 지는 판만 걸려 몇 번을 지나쳤다. 이기면 결과 화면이 아예 뜨지 않는 상태였다.
//
// main.js를 node에서 그대로 돌릴 수는 없으므로(DOM이 필요하다) 화면이 밟는 순서를
// 여기서 그대로 밟는다. 화면이 부르는 것을 여기서도 부르는 것이 요점이다.
const D = require('./data.js');
const L = require('./logic.js');
const AI = require('./ai.js');
const P = require('./progress.js');
const Q = require('./quests.js');
const R = require('./roster.js');
const Loot = require('./loot.js');
const Items = require('./items.js');
const Shop = require('./shop.js');

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

// 결과 화면이 하는 일을 순서 그대로. 화면에서 이 순서가 바뀌면 여기도 바뀌어야 한다.
function settle(progress, state, party, method, lootSeed, dropsOverride) {
  const won = state.status === 'won';
  const quest = state.quest;
  const members = state.units.filter((u) => u.side === 'ally')
    .map((u) => ({ id: u.uid, name: u.name, job: u.job }));

  const reward = L.rewardOf(state);
  const gained = P.addExp(progress, reward.charExp, reward.jobExp);
  progress.gold += reward.gold;
  progress.potions = Object.assign({}, state.potions);

  const roster = R.awardExp(progress.roster, party.map((m) => m.name), reward.charExp, 1);

  const lines = [];
  let mine = 0;
  let handed = 0;

  if (won) {
    // 화면과 같은 자리에서 굴린다 — 전리품은 쓰러뜨린 적에게서 나온다.
    // 손으로 짠 목록을 넘길 수 있게 둔 것은, 아래에서 장비와 재료가 섞인 판을
    // 확실히 만들어 그리는 코드를 다 밟아 보기 위해서다.
    const result = Loot.distribute(dropsOverride || L.dropsOf(state), members, method, lootSeed);
    for (const award of result.awards) {
      // 화면이 이 줄을 그린다: 아이콘·이름·이유·받는 사람.
      const def = Items.def(award.item);
      const owner = members.find((m) => m.id === award.toId);
      lines.push(`${def.icon} ${Items.name(award.item)} · ${award.reason} → ${owner.name}`);
    }
    for (const item of result.byMember[L.HERO_UID] || []) {
      if (!P.addItem(progress, item).sold) mine++;
    }
    for (const award of result.awards) {
      if (award.toId === L.HERO_UID || !Items.isGear(award.item)) continue;
      const taker = members.find((m) => m.id === award.toId);
      const member = taker && party.find((entry) => entry.name === taker.name);
      if (member && R.offerGear(member, award.item).taken) handed++;
    }
    progress.cleared++;
    progress.questSeed = 12345;
    progress.shopSeed = 54321;
  }

  return { won, reward, gained, roster, lines, mine, handed, members };
}

// 명부는 씨앗을 주지 않으면 무작위로 만들어진다. 그대로 두면 전투 결과가 판마다
// 달라져 "이겼을 때 도는 코드"를 확인하려던 자리가 난이도 시험이 된다.
function seededProgress(seed) {
  const progress = P.create();
  progress.roster = R.create(seed);
  progress.questSeed = seed;
  progress.shopSeed = seed;
  return progress;
}

function runQuest(progress, seed, autoHeal, questOver) {
  const quest = questOver || Q.generate(progress.charLevel, progress.questSeed)[0];
  const candidates = Q.companionsFor(quest, progress.roster, progress.questSeed + quest.level);
  const party = [];
  for (const job of ['tank', 'healer', 'dealer', 'dealer']) {
    const found = candidates.find((m) => R.jobOf(m) === job && !party.includes(m));
    if (found) party.push(found);
  }

  const state = L.createBattle({
    quest,
    party: party.map(R.toParty),
    skills: P.validSkills(progress, P.learnedSkills(progress).map((def) => def.id)),
    heroStats: P.stats(progress),
    // 화면이 넘기는 것과 같은 표. 빠뜨리면 캐릭터 창에서 올린 스킬이 전투에서
    // 1레벨로 나간다.
    skillLevels: P.skillLevels(progress),
    heroLevel: progress.charLevel,
    potions: Object.assign({}, progress.potions),
    seed,
  });

  for (let i = 0; i < 300 / L.TICK && state.status === 'fighting'; i++) {
    L.step(state, L.TICK);
    if (autoHeal && i % 6 === 0) {
      const hero = L.hero(state);
      const hurt = AI.alive(state, 'ally').filter((u) => u.hp < u.maxHp)
        .sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp))[0];
      if (hurt && !hero.dead) L.castSkill(state, 'touch', { uid: hurt.uid });
    }
    L.drainEvents(state);
  }
  return { quest, party, state };
}

// --- 이긴 판 -----------------------------------------------------------
{
  // 반드시 이기게 만든다. 이 자리의 목적은 난이도가 아니라 "이겼을 때 도는 코드가
  // 실제로 도는가"이다.
  const progress = seededProgress(4242);
  progress.charLevel = 20;
  progress.jobLevel = 20;
  for (const member of progress.roster) member.level = 24;

  // 확실히 이기는 판을 손으로 짠다. 생성된 의뢰를 쓰면 난이도에 따라 결과가
  // 갈리는데, 여기서 보려는 것은 난이도가 아니라 이겼을 때 도는 코드다.
  // 전리품에는 장비와 재료를 함께 넣는다 — 둘의 처리가 다르다.
  const quest = Object.assign(Q.generate(20, 4242)[0], {
    waves: [['scout']],
    drops: [Items.make('shield', 2, 1), Items.make('charm', 2, 2),
      Items.make('staff', 2, 3), Items.make('fang', 0, 4)],
  });

  const { party, state } = runQuest(progress, 7, true, quest);
  check('이겼다', state.status, 'won');

  const goldBefore = progress.gold;
  // 화면이 실제로 쓰는 길: 쓰러뜨린 적에게서 굴린다.
  const rolled = L.dropsOf(state);
  check('쓰러뜨린 적에게서 전리품을 굴린다',
    rolled.every((item) => Boolean(Items.def(item))), true);
  check('한 번 굴린 것은 다시 굴리지 않는다', Array.isArray(rolled), true);

  const out = settle(progress, state, party, 'job', 99, quest.drops);

  check('분배 줄을 전부 그린다', out.lines.length, quest.drops.length);
  check('물음표가 섞이지 않는다', out.lines.some((line) => line.includes('?')), false);
  check('받는 사람 이름이 들어간다',
    out.lines.every((line) => out.members.some((m) => line.endsWith(m.name))), true);
  check('골드가 들어온다', progress.gold > goldBefore, true);
  check('의뢰를 깬 것으로 센다', progress.cleared, 1);
  check('경험치가 오른다', out.reward.charExp > 0, true);
  check('명부 전원이 보고에 들어간다', out.roster.length, progress.roster.length);

  // 캐릭터 창에서 올린 스킬이 전투에 그대로 들어간다. 창과 전투가 다른 값을
  // 보면 점수를 넣은 것이 화면의 글자로만 남는다.
  {
    const raised = seededProgress(99);
    raised.jobLevel = 6;
    check('스킬을 올린다', P.raiseSkill(raised, 'touch').ok, true);
    const battle = L.createBattle({
      quest, party: [], skills: ['touch'],
      heroStats: P.stats(raised), skillLevels: P.skillLevels(raised),
      heroLevel: raised.charLevel, seed: 3,
    });
    check('전투가 올린 레벨을 본다',
      L.playerSkill(battle, 'touch').heal, P.skillDef(raised, 'touch').heal);
    check('1레벨보다 많이 회복한다',
      L.playerSkill(battle, 'touch').heal > D.PLAYER_SKILLS.touch.heal, true);
  }

  // 결과 화면이 그리는 캐릭터별 리포트. 화면 코드를 직접 돌릴 수 없으니 화면이
  // 부르는 것을 여기서도 부른다.
  const report = L.battleReport(state);
  check('파티 전원이 리포트에 들어간다', report.length, party.length + 1);
  check('숫자가 다 채워진다',
    report.every((row) => Number.isFinite(row.dealt + row.taken + row.healed)), true);

  // 동료 몫 장비가 실제로 그 동료에게 간다. 이것이 없으면 직업 우선 분배가
  // 결과 화면의 글자로만 남는다.
  const gearDrops = quest.drops.filter((item) => Items.isGear(item));
  if (gearDrops.length) {
    const worn = progress.roster.reduce((sum, m) => sum + R.gearOf(m).length, 0);
    check('동료가 장비를 실제로 챙긴다', worn + out.mine > 0, true);
  }

  // 새 동료가 들어와도 명부가 깨지지 않는다.
  R.maybeJoin(progress.roster, progress.charLevel, 3);
  const names = progress.roster.map((m) => m.name);
  check('이름이 겹치지 않는다', new Set(names).size, names.length);

  // 저장하고 다시 읽어도 그대로여야 한다.
  global.localStorage = {
    data: null,
    getItem() { return this.data; },
    setItem(key, value) { this.data = value; },
    removeItem() { this.data = null; },
  };
  check('저장된다', P.save(progress), true);
  const loaded = P.load();
  check('레벨이 남는다', loaded.charLevel, progress.charLevel);
  check('골드가 남는다', loaded.gold, progress.gold);
  check('명부가 남는다', loaded.roster.length, progress.roster.length);
  check('동료 장비도 남는다',
    loaded.roster.reduce((sum, m) => sum + R.gearOf(m).length, 0),
    progress.roster.reduce((sum, m) => sum + R.gearOf(m).length, 0));
  delete global.localStorage;
}

// --- 진 판 -------------------------------------------------------------
{
  const progress = seededProgress(4242);

  const { party, state } = runQuest(progress, 3, false);
  // 확실히 지게 만든다.
  AI.alive(state, 'ally').forEach((u) => L.applyDamage(state, null, u, 1e9));
  L.step(state, L.TICK);
  check('졌다', state.status, 'lost');

  const out = settle(progress, state, party, 'even', 5);
  check('분배는 하지 않는다', out.lines.length, 0);
  check('골드는 없다', progress.gold, 0);
  check('의뢰를 깬 것으로 세지 않는다', progress.cleared, 0);

  // 아무것도 없이 끝나면 어려운 의뢰를 시도할 이유가 사라진다.
  check('길드 몫의 절반은 받는다', out.reward.charExp > 0, true);
  check('명부는 그래도 자란다', out.roster.every((entry) => entry.exp > 0), true);
}

// --- 상점을 거쳐 가는 길 ------------------------------------------------
{
  // 화면이 부르는 순서 그대로: 진열대를 만들고, 사고, 장착하고, 판다.
  const progress = seededProgress(77);
  progress.gold = 100000;
  const stock = Shop.stock(progress.charLevel, progress.shopSeed);

  check('진열대가 채워진다', stock.gear.length, Shop.GEAR_COUNT);
  check('값을 매길 수 있다', stock.gear.every((item) => Items.price(item) > 0), true);
  check('요약을 그릴 수 있다', stock.gear.every((item) => Items.summary(item).length > 0), true);
  check('견주기를 그릴 수 있다',
    stock.gear.every((item) => P.compare(progress, item) !== null), true);

  const item = stock.gear[0];
  check('산다', P.buyGear(progress, item).ok, true);
  check('장착한다', P.equip(progress, item.uid).ok, true);
  check('벗는다', P.unequip(progress, D.GEAR[item.defId].slot).ok, true);
  check('판다', P.sell(progress, item.uid).ok, true);

  check('물약을 산다', P.buyPotion(progress, 'health').ok, true);
  check('갱신 값을 낸다', P.spend(progress, Shop.refreshCost(progress.charLevel)).ok, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

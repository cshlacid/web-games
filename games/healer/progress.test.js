'use strict';

// 실행: node games/healer/progress.test.js
// 성장과 장비. 저장본을 읽는 부분까지 여기서 본다 — 브라우저에서만 도는 코드로
// 두면 저장본이 깨졌을 때 진행이 통째로 날아가는 것을 알 방법이 없다.
const D = require('./data.js');
const P = require('./progress.js');
const Items = require('./items.js');
const Roster = require('./roster.js');

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

const gear = (defId, tier) => Items.make(defId, tier || 0, 3);

// --- 시작 상태 ----------------------------------------------------------
{
  const progress = P.create();
  check('레벨 1에서 시작', [progress.charLevel, P.jobLevel(progress)], [1, 1]);
  check('사제로 시작', progress.job, D.HERO_JOB_START);
  check('빈손으로 시작', [progress.inventory.length, progress.gold], [0, 0]);
  check('명부를 들고 시작', progress.roster.length, Roster.START_SIZE);
  check('물약을 조금 들고 시작', progress.potions.mana > 0, true);
  check('처음 배울 수 있는 것은 둘', P.unlockedSkills(progress).map((def) => def.id), ['touch', 'quick']);
  // 아무것도 안 배운 채로 편성 화면에 서면 "전투 시작"이 왜 꺼져 있는지 알 수 없다.
  check('첫 스킬 하나는 배운 채로 시작', P.learnedSkills(progress).map((def) => def.id), ['touch']);

  const stats = P.stats(progress);
  check('기본 체력은 체력 능력치에서 나온다', stats.hp, D.HERO.attrs.vit * D.ATTR.hpPerVit);
  check('기본 회복력은 배수 1', stats.heal, 1);
}

// --- 경험치와 레벨 ------------------------------------------------------
{
  const progress = P.create();
  const need = D.LEVEL.charExpTo(1);

  P.addExp(progress, need - 1, 0);
  check('모자라면 오르지 않는다', progress.charLevel, 1);

  P.addExp(progress, 1, 0);
  check('채우면 오른다', progress.charLevel, 2);
  check('남은 경험치는 0', progress.charExp, 0);

  // 남는 경험치를 버리면 큰 의뢰를 깰수록 손해가 된다.
  const spill = P.create();
  P.addExp(spill, D.LEVEL.charExpTo(1) + 5, 0);
  check('넘친 만큼은 다음 레벨로 넘어간다', spill.charExp, 5);

  // 한 판에 두 레벨이 오를 수 있어야 한다.
  const big = P.create();
  const jump = P.addExp(big, D.LEVEL.charExpTo(1) + D.LEVEL.charExpTo(2) + 3, 0);
  check('한 번에 두 레벨', big.charLevel, 3);
  check('오른 레벨 수를 알려 준다', jump.charLevels, 2);

  // 두 레벨은 따로 오른다. 힐만 하다 끝난 전투에서도 직업 레벨은 올라야 한다.
  const healOnly = P.create();
  P.addExp(healOnly, 0, D.LEVEL.jobExpTo(1));
  check('직업 레벨만 오를 수 있다', [healOnly.charLevel, P.jobLevel(healOnly)], [1, 2]);

  // 최대 레벨을 넘지 않는다.
  const capped = P.create();
  P.addExp(capped, 1e9, 1e9);
  check('최대 레벨에서 멈춘다', capped.charLevel, D.LEVEL.maxLevel);
  check('최대에서는 경험치를 쌓지 않는다', capped.charExp, 0);
  // **직업 레벨의 천장은 계열이 정하고 캐릭터 레벨보다 훨씬 낮다.** 여기가
  // 무너지면 결국 다 배우게 되어 무엇을 배울지 고르는 일이 사라진다.
  check('직업 레벨은 계열의 상한에서 멈춘다', P.jobLevel(capped), D.jobMaxLevel(capped.job));
  check('계열 상한이 캐릭터 상한보다 낮다', D.jobMaxLevel('priest') < D.LEVEL.maxLevel, true);
}

// --- 스킬을 배우고 올린다 ------------------------------------------------
{
  const progress = P.create();
  const before = P.unlockedSkills(progress).length;
  const gained = P.addExp(progress, 0, D.LEVEL.jobExpTo(1));
  check('배울 수 있는 스킬이 늘었다', P.unlockedSkills(progress).length > before, true);
  check('무엇이 열렸는지 알려 준다', gained.unlocked.map((def) => def.id), ['regen']);

  // **열린 것과 배운 것은 다르다.** 저절로 열리던 때에는 이 둘이 같았다.
  check('열렸다고 배운 것은 아니다', P.learnedSkills(progress).map((def) => def.id), ['touch']);
  check('안 배운 것은 등록할 수 없다',
    P.validSkills(progress, ['touch', 'pyre', 'quick']), ['touch']);

  P.learnSkill(progress, 'quick');
  P.learnSkill(progress, 'regen');
  check('배우면 등록할 수 있다',
    P.validSkills(progress, ['touch', 'pyre', 'quick', 'regen']), ['touch', 'quick', 'regen']);
  check('다섯을 넘겨도 다섯까지',
    P.validSkills(progress, ['touch', 'quick', 'regen', 'touch', 'quick', 'regen', 'touch',
      'quick', 'regen']).length, D.SKILL_MAX);
}

// --- 계열을 바꾼다 --------------------------------------------------------
{
  const progress = P.create();
  check('조건을 못 채우면 못 바꾼다', P.canChangeJob(progress, 'bard').ok, false);
  check('맡고 있는 계열로는 못 바꾼다', P.canChangeJob(progress, progress.job).ok, false);
  check('없는 계열로는 못 바꾼다', P.canChangeJob(progress, '없는계열').ok, false);
  check('안 바뀐 채로 남는다', P.changeJob(progress, 'bard').ok, false);

  // 사제로 조금 키워 둔다. 되돌아왔을 때 그대로 있어야 한다.
  P.addExp(progress, 0, D.LEVEL.jobExpTo(1) + D.LEVEL.jobExpTo(2));
  P.learnSkill(progress, 'quick');
  P.learnSkill(progress, 'regen');
  const priestLevel = P.jobLevel(progress);
  const priestSkills = P.learnedSkills(progress).map((def) => def.id);
  progress.skills = ['touch', 'quick'];

  progress.charLevel = D.HERO_JOBS.bard.need.charLevel;
  check('조건을 채우면 바꿀 수 있다', P.changeJob(progress, 'bard').ok, true);
  check('계열이 바뀐다', progress.job, 'bard');
  check('새 계열은 1레벨부터', P.jobLevel(progress), 1);
  // **배운 것은 계열을 바꿔도 그대로 들고 간다.** 전직할 때마다 손이 빈 채로
  // 나가면 다른 계열을 겪어 보는 것이 그대로 손해가 된다.
  check('등록해 둔 것이 남는다', progress.skills, ['touch', 'quick']);
  check('앞 계열에서 배운 것도 들 수 있다',
    P.learnedSkills(progress).map((def) => def.id), priestSkills);
  check('새 계열에서는 아무것도 안 배운 상태', P.jobSkills(progress), []);
  // 배우지 않은 것은 여전히 걸러진다.
  check('안 배운 것은 못 든다', P.validSkills(progress, ['touch', 'chord']), ['touch']);

  // 점수는 계열마다 따로 쌓이고 따로 쓰인다.
  check('점수도 새 계열 것', P.freeSkillPoints(progress), D.SKILL.start);
  check('다른 계열 스킬은 못 배운다', P.learnSkill(progress, 'ripple').ok, false);
  check('제 계열 스킬은 배운다', P.learnSkill(progress, 'chord').ok, true);
  P.addExp(progress, 0, D.LEVEL.jobExpTo(1));
  check('음유시인도 레벨이 오른다', P.jobLevel(progress), 2);

  // **되돌아오면 그대로 있다.** 아니면 아무도 다른 계열을 겪어 보지 않는다.
  check('사제로 되돌아온다', P.changeJob(progress, 'priest').ok, true);
  check('직업 레벨이 남아 있다', P.jobLevel(progress), priestLevel);
  // 이제 배운 것은 계열을 가리지 않으므로, 사제로 돌아온 뒤에도 음유시인에서
  // 배운 화음이 함께 남는다. 그 계열에서 배운 것만 보려면 jobSkills를 본다.
  check('사제에서 배운 것이 그대로다', P.jobSkills(progress).map((def) => def.id), priestSkills);
  check('음유시인에서 배운 것도 함께 남는다',
    P.learnedSkills(progress).map((def) => def.id), priestSkills.concat(['chord']));
  check('음유시인 레벨도 따로 남는다', progress.jobs.bard.level, 2);
  check('음유시인에서 배운 것도 남는다', progress.learned.chord, 1);
}

// --- 상위 계열 ------------------------------------------------------------
{
  // **상위 계열은 아래 계열을 끝까지 키운 사람만 간다.** 이것이 "상위"의 뜻이고,
  // 조건은 자료에 있으므로 계열을 더해도 분기가 늘지 않는다.
  const progress = P.create();
  progress.charLevel = D.HERO_JOBS.bishop.need.charLevel;
  check('아래 계열을 안 키우면 못 간다', P.canChangeJob(progress, 'bishop').ok, false);
  check('무엇이 모자란지 알려 준다',
    P.canChangeJob(progress, 'bishop').reason.includes('사제'), true);

  progress.jobs.priest.level = D.HERO_JOBS.bishop.need.jobLevel.priest;
  check('아래 계열을 키우면 갈 수 있다', P.canChangeJob(progress, 'bishop').ok, true);
  check('전직한다', P.changeJob(progress, 'bishop').ok, true);
  check('주교의 스킬만 배울 수 있다', P.learnSkill(progress, 'touch').ok, false);
  // 배우는 것은 그 계열 것만이지만, 이미 배운 것은 계열을 가리지 않고 들고 간다.
  check('앞 계열에서 배운 것은 그대로 들 수 있다',
    P.validSkills(progress, ['touch']), ['touch']);
  check('주교의 스킬은 배운다', P.learnSkill(progress, 'mend').ok, true);

  // 캐릭터 레벨만 채운 성기사는 아래 계열을 안 키워도 간다 — 상위 계열이 아니다.
  const knight = P.create();
  knight.charLevel = D.HERO_JOBS.paladin.need.charLevel;
  check('성기사는 아래 계열을 요구하지 않는다', P.canChangeJob(knight, 'paladin').ok, true);

  // **상위 계열이 계열마다 하나씩 있다.** 아래 계열을 키운 만큼만 열린다.
  const many = P.create();
  many.charLevel = 12;
  const upper = { bishop: 'priest', laureate: 'bard', crusader: 'paladin' };
  for (const [top, base] of Object.entries(upper)) {
    check(`${top}: 아래 계열을 안 키우면 못 간다`, P.canChangeJob(many, top).ok, false);
    many.jobs[base] = { level: D.jobMaxLevel(base), exp: 0 };
    check(`${top}: 아래 계열을 키우면 갈 수 있다`, P.canChangeJob(many, top).ok, true);
  }
}

// --- 인벤토리와 장착 ----------------------------------------------------
{
  const progress = P.create();

  // 재료는 들고 다니지 않고 그 자리에서 팔린다.
  const sold = P.addItem(progress, gear('fang', 1));
  check('재료는 팔린다', sold.sold, true);
  check('골드가 들어온다', progress.gold > 0, true);
  check('인벤토리에는 남지 않는다', progress.inventory.length, 0);

  P.addItem(progress, gear('staff', 1));
  check('장비는 인벤토리로', progress.inventory.length, 1);

  const before = P.stats(progress);
  check('장착된다', P.equip(progress, progress.inventory[0].uid).ok, true);
  check('장착하면 인벤토리에서 빠진다', progress.inventory.length, 0);
  check('수치가 오른다', P.stats(progress).heal > before.heal, true);

  // 같은 슬롯에 다른 것을 끼면 원래 것이 인벤토리로 돌아온다. 사라지면 안 된다.
  const rod = gear('rod', 0);
  P.addItem(progress, rod);
  P.equip(progress, rod.uid);
  check('갈아 끼우면 쓰던 것이 인벤토리로', progress.inventory.length, 1);
  check('새 것이 장착되어 있다', progress.equipped.weapon.defId, 'rod');

  check('벗으면 인벤토리로', P.unequip(progress, 'weapon').ok, true);
  check('빈 슬롯을 벗을 수는 없다', P.unequip(progress, 'weapon').ok, false);
  check('둘 다 인벤토리에 있다', progress.inventory.length, 2);
}

// --- 견주기 -------------------------------------------------------------
{
  const progress = P.create();
  const staff = gear('staff', 0);
  P.addItem(progress, staff);
  P.equip(progress, staff.uid);

  // 빈 슬롯과 견주면 통째로 이득이고, 낀 것과 견주면 차이만 보여야 한다.
  const better = P.compare(progress, gear('staff', 3));
  check('등급이 높으면 이득이다', better.diff.heal > 0, true);
  check('어느 슬롯인지 알려 준다', better.slot, 'weapon');

  const same = P.compare(progress, staff);
  check('같은 것이면 차이가 없다', Object.keys(same.diff).length, 0);

  const empty = P.compare(P.create(), gear('robe', 0));
  check('빈 슬롯과 견주면 전부 이득', empty.diff.hp > 0, true);
}

// --- 방어 계수의 바닥 ---------------------------------------------------
{
  // 장비를 겹쳐 끼우면 계수가 0 아래로 내려가 피해가 회복이 될 수 있다.
  const progress = P.create();
  for (const defId of ['mail', 'shield', 'band']) {
    const item = gear(defId, D.TIERS.length - 1);
    P.addItem(progress, item);
    P.equip(progress, item.uid);
  }
  check('받는 피해에 바닥이 있다', P.stats(progress).armor >= 0.35, true);
}

// --- 저장본 읽기 --------------------------------------------------------
{
  // localStorage가 없는 곳에서도 돌아야 한다 — node에서 규칙을 확인하려는 것이
  // 이 파일의 목적이다.
  check('저장이 막혀도 터지지 않는다', P.save(P.create()), false);
  check('읽을 수 없으면 새로 시작한다', P.load().charLevel, 1);

  // 저장본을 흉내 내 읽기 규칙만 따로 본다.
  global.localStorage = {
    data: null,
    getItem() { return this.data; },
    setItem(key, value) { this.data = value; },
    removeItem() { this.data = null; },
  };

  const saved = P.create();
  saved.charLevel = 4;
  saved.gold = 500;
  saved.inventory = [gear('staff', 1), { defId: '없는물건', tier: 0 }, null];
  saved.equipped.weapon = gear('robe', 0);   // 슬롯이 맞지 않는 장착
  saved.potions = { mana: 99, health: -3 };  // 범위를 벗어난 값
  saved.jobs = { priest: { level: 3, exp: 0 }, bard: { level: 99, exp: 0 } };
  // 받은 점수는 넷뿐인데 훨씬 많이 쓴 저장본. 손으로 고쳐도 점수가 늘지 않아야
  // 하고, **계열을 넘어 나눠 주어서도 안 된다.**
  saved.learned = { touch: 3, quick: 3, regen: 9, chord: 5 };
  // 등록해 둔 스킬. 아직 안 배운 것과 없는 것이 섞여 있어도 배운 것만 남아야 한다.
  saved.skills = ['quick', 'pyre', '없는스킬', 'touch'];
  saved.lootMethod = 'dice';
  check('저장된다', P.save(saved), true);

  const loaded = P.load();
  check('레벨이 남는다', loaded.charLevel, 4);
  check('골드가 남는다', loaded.gold, 500);
  check('모르는 물건은 버린다', loaded.inventory.length, 1);
  check('슬롯이 안 맞는 장착은 비운다', loaded.equipped.weapon, null);
  check('물약 수는 범위 안으로 자른다', [loaded.potions.mana, loaded.potions.health], [D.POTION_MAX, 0]);
  check('명부도 살아 돌아온다', loaded.roster.length, Roster.START_SIZE);
  // uid를 저장본 그대로 믿으면 겹칠 수 있고, 겹치면 하나를 장착할 때 다른
  // 하나가 사라진다.
  check('아이템 uid를 다시 붙인다',
    new Set(loaded.inventory.map((item) => item.uid)).size, loaded.inventory.length);

  // 등록해 둔 스킬이 남는다. 없으면 새로고침할 때마다 다섯을 다시 골라야 한다.
  check('등록한 스킬이 남는다', loaded.skills, ['quick', 'touch']);
  check('처음에는 비어 있다', P.create().skills, []);
  // 분배 방식도 남는다. 파티가 미리 합의한다는 뜻이 "매번 고르는 칸"이 되면 사라진다.
  check('분배 방식이 남는다', loaded.lootMethod, 'dice');

  check('스킬 레벨이 남는다', P.skillLevel(loaded, 'touch'), 3);
  check('받은 점수를 넘지 않는다', P.spentSkillPoints(loaded), P.earnedSkillPoints(loaded));
  check('남은 점수는 0', P.freeSkillPoints(loaded), 0);
  // 조건을 못 채운 계열이 적혀 있으면 처음 계열로 되돌린다 — 저장본을 손대서
  // 전직 조건을 건너뛸 수 있으면 조건이 아무것도 아니게 된다.
  const forged = P.create();
  forged.job = 'bard';
  forged.charLevel = 1;
  P.save(forged);
  check('조건을 못 채운 계열은 되돌린다', P.load().job, D.HERO_JOB_START);
  P.save(saved);

  // 계열 상한을 넘겨 적어 두어도 그 계열의 천장에서 잘린다.
  check('직업 레벨은 계열 상한으로 자른다', loaded.jobs.bard.level, D.jobMaxLevel('bard'));
  // 사제 예산으로 음유시인 스킬을 배운 것이 되면 계열을 나눈 뜻이 사라진다.
  check('점수는 계열마다 따로 센다',
    P.spentSkillPoints(loaded, 'bard') <= P.earnedSkillPoints(loaded, 'bard'), true);

  // 판이 바뀌면 저장본을 통째로 버린다. 어중간하게 읽으면 더 이상한 상태가 된다.
  // 모르는 방식이 적혀 있으면 기본값으로 돌린다. 저장본을 손대도 전투로
  // 넘어가서는 안 된다.
  saved.lootMethod = '없는방식';
  P.save(saved);
  check('모르는 분배 방식은 기본값으로', P.load().lootMethod, 'even');

  global.localStorage.setItem('x', JSON.stringify({ version: 999, charLevel: 20 }));
  check('판이 다르면 새로 시작', P.load().charLevel, 1);

  global.localStorage.setItem('x', '깨진 저장본');
  check('깨진 저장본도 새로 시작', P.load().charLevel, 1);
  delete global.localStorage;
}

// --- 스킬 점수 -----------------------------------------------------------
{
  // **배우는 데 1, 한 칸 올리는 데 1.** 예전에는 직업 레벨만 되면 저절로 열리고
  // 점수는 올리는 데만 썼다. 지금은 무엇을 배울지가 곧 점수를 어디에 쓸지다.
  const progress = P.create();
  check('처음 점수는 시작 점수에서 배운 하나를 뺀 만큼',
    P.freeSkillPoints(progress), D.SKILL.start - 1);

  check('배운다', P.learnSkill(progress, 'quick').level, 1);
  check('배우면 점수가 준다', P.freeSkillPoints(progress), D.SKILL.start - 2);
  check('점수가 없으면 못 배운다', P.learnSkill(progress, 'regen').ok, false);

  progress.jobs.priest.level = D.jobMaxLevel('priest');
  const cap = D.SKILL.start + (D.jobMaxLevel('priest') - 1) * D.SKILL.pointsPerLevel;
  check('레벨마다 하나씩 받는다', P.freeSkillPoints(progress), cap - 2);
  // **배우는 것까지는 되지만 전부를 상한까지 올릴 수는 없다.** 상한이 6이던
  // 때에는 배우는 것만으로 점수가 끝나 스킬 레벨을 올릴 자리가 없었고, 지금은
  // 무엇을 올릴지가 고르는 자리다.
  const all = D.heroSkillsOf('priest').length;
  check('배우는 데는 점수가 넉넉하다', cap > all, true);
  check('전부를 상한까지 올릴 수는 없다', cap < all * D.SKILL.max, true);

  check('올린다', P.raiseSkill(progress, 'touch').level, 2);
  check('쓴 만큼 준다', P.freeSkillPoints(progress), cap - 3);
  check('없는 스킬은 못 배운다', P.learnSkill(progress, '없는스킬').ok, false);
  check('이미 배운 것은 다시 못 배운다', P.learnSkill(progress, 'touch').ok, false);
  check('안 배운 것은 못 올린다', P.raiseSkill(progress, 'ripple').ok, false);
  // 다른 계열의 스킬은 점수가 남아 있어도 손댈 수 없다.
  check('다른 계열 스킬은 못 배운다', P.learnSkill(progress, 'chord').ok, false);

  // 올린 레벨이 실제 수치로 이어진다. 화면과 전투가 이 함수를 같이 본다.
  const def = P.skillDef(progress, 'touch');
  check('회복량이 오른다', def.heal > D.PLAYER_SKILLS.touch.heal, true);
  check('소비 마나도 오른다', def.mp > D.PLAYER_SKILLS.touch.mp, true);
  check('전투에 넘길 표에 다 들어간다',
    Object.keys(P.skillLevels(progress)).length, Object.keys(D.PLAYER_SKILLS).length);

  // 상한까지만 오른다. 남은 점수가 있어도 더 넣을 수 없다.
  const maxed = P.create();
  maxed.jobs.priest.level = D.jobMaxLevel('priest');
  for (let i = 0; i < D.SKILL.max + 3; i++) P.raiseSkill(maxed, 'touch');
  check('스킬 레벨에 상한이 있다', P.skillLevel(maxed, 'touch'), D.SKILL.max);
  check('상한에서는 못 올린다', P.raiseSkill(maxed, 'touch').ok, false);
}

// --- 상점 --------------------------------------------------------------
{
  const progress = P.create();
  const item = gear('staff', 2);
  // 값이 아니라 규칙을 보는 자리다. 값이 오르내려도 테스트가 흔들리지 않게
  // 물건 값에서 지갑을 정한다.
  progress.gold = Items.price(item) + 500;

  check('골드가 모자라면 못 산다', P.buyGear(P.create(), item).ok, false);
  const bought = P.buyGear(progress, item);
  check('사면 인벤토리로', [bought.ok, progress.inventory.length], [true, 1]);
  check('골드가 준다', progress.gold, 500);

  // 사서 되파는 것이 이득이면 골드가 뜻을 잃는다.
  const goldBefore = progress.gold;
  const sold = P.sell(progress, item.uid);
  check('팔면 골드가 는다', sold.ok, true);
  check('산 값보다 싸게 팔린다', sold.gold < Items.price(item), true);
  check('되팔아도 본전이 안 된다', progress.gold < goldBefore + Items.price(item), true);
  check('없는 물건은 못 판다', P.sell(progress, '없는uid').ok, false);

  const potions = P.create();
  potions.gold = 10000;
  potions.potions.mana = D.POTION_MAX;
  check('가득 차면 더 못 산다', P.buyPotion(potions, 'mana').ok, false);
  check('모르는 물약은 못 산다', P.buyPotion(potions, '엘릭서').ok, false);
  potions.potions.health = 0;
  check('빈 쪽은 살 수 있다', P.buyPotion(potions, 'health').ok, true);
  check('한 개씩 는다', potions.potions.health, 1);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

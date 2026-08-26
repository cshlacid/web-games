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
  check('레벨 1에서 시작', [progress.charLevel, progress.jobLevel], [1, 1]);
  check('빈손으로 시작', [progress.inventory.length, progress.gold], [0, 0]);
  check('명부를 들고 시작', progress.roster.length, Roster.START_SIZE);
  check('물약을 조금 들고 시작', progress.potions.mana > 0, true);
  check('처음 열린 스킬은 둘', P.unlockedSkills(progress).map((def) => def.id), ['touch', 'quick']);

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
  check('직업 레벨만 오를 수 있다', [healOnly.charLevel, healOnly.jobLevel], [1, 2]);

  // 최대 레벨을 넘지 않는다.
  const capped = P.create();
  P.addExp(capped, 1e9, 1e9);
  check('최대 레벨에서 멈춘다', capped.charLevel, D.LEVEL.maxLevel);
  check('최대에서는 경험치를 쌓지 않는다', capped.charExp, 0);
}

// --- 스킬 해금 ----------------------------------------------------------
{
  const progress = P.create();
  const before = P.unlockedSkills(progress).length;
  const gained = P.addExp(progress, 0, D.LEVEL.jobExpTo(1));
  check('열린 스킬이 늘었다', P.unlockedSkills(progress).length > before, true);
  check('무엇이 열렸는지 알려 준다', gained.unlocked.map((def) => def.id), ['regen']);

  // 열리지 않은 스킬은 등록할 수 없다. 저장본을 손대도 마찬가지여야 한다.
  check('안 열린 스킬은 걸러진다',
    P.validSkills(progress, ['touch', 'pyre', 'quick']), ['touch', 'quick']);
  check('다섯을 넘겨도 다섯까지', P.validSkills(progress, ['touch', 'quick', 'regen', 'touch', 'quick', 'regen']).length,
    D.SKILL_MAX);
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

  // 판이 바뀌면 저장본을 통째로 버린다. 어중간하게 읽으면 더 이상한 상태가 된다.
  global.localStorage.setItem('x', JSON.stringify({ version: 999, charLevel: 20 }));
  check('판이 다르면 새로 시작', P.load().charLevel, 1);

  global.localStorage.setItem('x', '깨진 저장본');
  check('깨진 저장본도 새로 시작', P.load().charLevel, 1);
  delete global.localStorage;
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

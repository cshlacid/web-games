'use strict';

// 실행: node games/healer/progress.test.js
// 성장과 장비. 저장본을 읽는 부분까지 여기서 본다 — 브라우저에서만 도는 코드로
// 두면 저장본이 깨졌을 때 진행이 통째로 날아가는 것을 알 방법이 없다.
const D = require('./data.js');
const P = require('./progress.js');

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

const gear = (defId, tier) => ({ defId, tier: tier || 0 });

// --- 시작 상태 ----------------------------------------------------------
{
  const progress = P.create();
  check('레벨 1에서 시작', [progress.charLevel, progress.jobLevel], [1, 1]);
  check('빈손으로 시작', [progress.inventory.length, progress.gold], [0, 0]);
  check('처음 열린 스킬은 둘', P.unlockedSkills(progress).map((def) => def.id), ['touch', 'quick']);

  const stats = P.stats(progress);
  check('기본 체력', stats.hp, D.LEVEL.heroHp(1));
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
  check('장착된다', P.equip(progress, 0).ok, true);
  check('장착하면 인벤토리에서 빠진다', progress.inventory.length, 0);
  check('수치가 오른다', P.stats(progress).heal > before.heal, true);

  // 같은 슬롯에 다른 것을 끼면 원래 것이 인벤토리로 돌아온다. 사라지면 안 된다.
  P.addItem(progress, gear('rod', 0));
  P.equip(progress, 0);
  check('갈아 끼우면 쓰던 것이 인벤토리로', progress.inventory.length, 1);
  check('새 것이 장착되어 있다', progress.equipped.weapon.defId, 'rod');

  check('벗으면 인벤토리로', P.unequip(progress, 'weapon').ok, true);
  check('빈 슬롯을 벗을 수는 없다', P.unequip(progress, 'weapon').ok, false);
  check('둘 다 인벤토리에 있다', progress.inventory.length, 2);
}

// --- 견주기 -------------------------------------------------------------
{
  const progress = P.create();
  P.addItem(progress, gear('staff', 0));
  P.equip(progress, 0);

  // 빈 슬롯과 견주면 통째로 이득이고, 낀 것과 견주면 차이만 보여야 한다.
  const better = P.compare(progress, gear('staff', 3));
  check('등급이 높으면 이득이다', better.diff.heal > 0, true);
  check('어느 슬롯인지 알려 준다', better.slot, 'weapon');

  const same = P.compare(progress, gear('staff', 0));
  check('같은 것이면 차이가 없다', Object.keys(same.diff).length, 0);

  const empty = P.compare(P.create(), gear('robe', 0));
  check('빈 슬롯과 견주면 전부 이득', empty.diff.hp > 0, true);
}

// --- 방어 계수의 바닥 ---------------------------------------------------
{
  // 장비를 겹쳐 끼우면 계수가 0 아래로 내려가 피해가 회복이 될 수 있다.
  const progress = P.create();
  for (const defId of ['mail', 'shield', 'band']) {
    P.addItem(progress, gear(defId, D.TIERS.length - 1));
    P.equip(progress, 0);
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
  check('저장된다', P.save(saved), true);

  const loaded = P.load();
  check('레벨이 남는다', loaded.charLevel, 4);
  check('골드가 남는다', loaded.gold, 500);
  check('모르는 물건은 버린다', loaded.inventory.length, 1);
  check('슬롯이 안 맞는 장착은 비운다', loaded.equipped.weapon, null);

  // 판이 바뀌면 저장본을 통째로 버린다. 어중간하게 읽으면 더 이상한 상태가 된다.
  global.localStorage.setItem('x', JSON.stringify({ version: 999, charLevel: 20 }));
  check('판이 다르면 새로 시작', P.load().charLevel, 1);

  global.localStorage.setItem('x', '깨진 저장본');
  check('깨진 저장본도 새로 시작', P.load().charLevel, 1);
  delete global.localStorage;
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

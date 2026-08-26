'use strict';

// 실행: node games/healer/roster.test.js
// 길드 명부. 동료가 의뢰마다 새로 만들어지지 않고 남아서 자라는 것이 이 파일의
// 전부이므로, "같은 이름이면 같은 동료"가 어디서도 깨지지 않는지를 본다.
const D = require('./data.js');
const Items = require('./items.js');
const R = require('./roster.js');

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

const SEEDS = [1, 5, 77, 4242, 20260825];

// --- 처음 명부 ----------------------------------------------------------
{
  const roster = R.create(7);
  check('정해진 수만큼', roster.length, R.START_SIZE);
  check('같은 씨앗이면 같은 명부', R.create(7).map((m) => m.name), roster.map((m) => m.name));
  check('레벨 1에서 시작', roster.every((m) => m.level === 1), true);
  check('빈손으로 시작', roster.every((m) => R.gearOf(m).length === 0), true);

  // 탱커와 힐러가 없으면 첫 의뢰부터 막힌다.
  const bad = [];
  for (const seed of SEEDS) {
    const jobs = R.create(seed).map(R.jobOf);
    if (!jobs.includes('tank')) bad.push(`${seed}: 탱커 없음`);
    if (!jobs.includes('healer')) bad.push(`${seed}: 힐러 없음`);
  }
  check('탱커와 힐러가 반드시 있다', bad, []);

  // 이름이 곧 신원이다. 겹치면 두 동료가 한 사람처럼 보인다.
  const dupes = [];
  for (const seed of SEEDS) {
    const names = R.create(seed).map((m) => m.name);
    if (new Set(names).size !== names.length) dupes.push(seed);
  }
  check('이름이 겹치지 않는다', dupes, []);

  // 이름과 계열이 어긋나면 편성 화면에서 이름을 못 믿게 된다. 역할(딜러)이
  // 아니라 계열(궁수·마법사)로 나누는 것은, 한 통에 두면 "궁수 유리"가 전사의
  // 스킬을 들고 나오기 때문이다.
  const wrong = [];
  for (const seed of SEEDS) {
    for (const member of R.create(seed)) {
      const titles = D.NAMES.title[R.specOf(member)];
      if (!titles || !titles.some((title) => member.name.startsWith(title))) wrong.push(member.name);
    }
  }
  check('이름이 계열에 맞는다', wrong, []);
  check('계열마다 이름 조각이 있다',
    Object.values(D.COMPANIONS).every((def) => Array.isArray(D.NAMES.title[def.spec])), true);
}

// --- 성장 ---------------------------------------------------------------
{
  const member = R.create(1)[0];
  const need = D.LEVEL.allyExpTo(1);

  check('모자라면 오르지 않는다', R.gainExp(member, need - 1), 0);
  check('채우면 오른다', R.gainExp(member, 1), 1);
  check('남은 경험치는 0', member.exp, 0);

  const spill = R.create(1)[0];
  R.gainExp(spill, D.LEVEL.allyExpTo(1) + 7);
  check('넘친 만큼은 다음 레벨로', spill.exp, 7);

  const capped = R.create(1)[0];
  R.gainExp(capped, 1e9);
  check('최대 레벨에서 멈춘다', capped.level, D.LEVEL.maxLevel);
  check('최대에서는 쌓지 않는다', capped.exp, 0);
}

// --- 명부 전체의 성장 ---------------------------------------------------
{
  const roster = R.create(3);
  const joined = [roster[0].name, roster[1].name];
  const report = R.awardExp(roster, joined, 500, 9);

  check('모두가 보고에 들어간다', report.length, roster.length);
  check('데려간 쪽은 전부 받는다',
    report.filter((r) => r.joined).every((r) => r.exp === 500), true);

  // 데려간 쪽보다 덜 자라야 편성을 고르는 것이 손해가 되지 않는다.
  const idle = report.filter((r) => !r.joined);
  check('남은 쪽은 일부만 받는다', idle.every((r) => r.exp < 500), true);
  check('남은 쪽도 0은 아니다 (다른 파티에서 일했다)', idle.every((r) => r.exp > 0), true);

  const [lo, hi] = D.LEVEL.idleExpRate;
  check('정해진 범위 안에서 받는다',
    idle.every((r) => r.exp >= Math.round(500 * lo) - 1 && r.exp <= Math.round(500 * hi) + 1), true);

  // 같은 이름이면 같은 동료다. 이름이 명부에 없으면 아무도 참여로 치지 않는다.
  const ghost = R.awardExp(R.create(3), ['없는 사람'], 100, 1);
  check('모르는 이름은 참여로 치지 않는다', ghost.every((r) => !r.joined), true);
}

// --- 스킬 ---------------------------------------------------------------
{
  const roster = R.create(5);
  const tank = roster.find((m) => R.jobOf(m) === 'tank');

  check('레벨 1은 기본기만', R.skillsOf(tank).includes('roar'), false);
  check('레벨 1도 스킬이 하나는 있다', R.skillsOf(tank).length > 0, true);

  tank.level = D.UNIT_SKILLS.roar.minLevel;
  check('레벨이 되면 광역 도발을 든다', R.skillsOf(tank).includes('roar'), true);

  // 편성 화면이 보여 주는 것과 전투가 쓰는 것이 같아야 한다.
  const everyone = [];
  for (const seed of SEEDS) {
    for (const member of R.create(seed)) {
      if (!R.skillsOf(member).length) everyone.push(member.name);
    }
  }
  check('레벨 1에서도 다들 스킬이 있다', everyone, []);
}

// --- 물약 ---------------------------------------------------------------
{
  const roster = R.create(11);
  for (const member of roster) {
    const potions = R.potionsOf(member);
    const job = R.jobOf(member);
    check(`${D.JOBS[job].name}: 직업에 맞는 물약`, potions, D.JOB_POTIONS[job]);
  }

  // 표를 그대로 넘기면 한 전투에서 마신 것이 다음 전투에 남는다.
  const member = roster[0];
  R.potionsOf(member).health = 0;
  check('물약 표를 복사해 준다', R.potionsOf(member).health, D.JOB_POTIONS[R.jobOf(member)].health);
}

// --- 장비 ---------------------------------------------------------------
{
  const roster = R.create(13);
  const tank = roster.find((m) => R.jobOf(m) === 'tank');

  const shield = Items.make('shield', 1, 1);
  check('빈 슬롯이면 받는다', R.offerGear(tank, shield).taken, true);
  check('실제로 낀다', tank.gear.armor.uid, shield.uid);
  check('수치에 반영된다', R.bonusOf(tank).hp > 0, true);

  // 쓰던 것이 나으면 흘려보낸다. 동료의 창고까지 관리하게 하면 화면이 하나 는다.
  check('나쁜 것은 안 받는다', R.offerGear(tank, Items.make('shield', 0, 2)).taken, false);
  check('쓰던 것이 그대로', tank.gear.armor.uid, shield.uid);
  check('좋은 것은 받는다', R.offerGear(tank, Items.make('shield', 4, 3)).taken, true);

  check('재료는 받지 않는다', R.offerGear(tank, Items.make('fang', 0, 1)).taken, false);

  // 전투에 넘길 꼴. 편성 화면이 고른 것을 그대로 넘기면 전투가 명부의 모양까지
  // 알아야 한다.
  const party = R.toParty(tank);
  check('이름을 들고 간다', party.name, tank.name);
  check('레벨을 들고 간다', party.level, tank.level);
  check('장비 몫이 들어 있다', party.bonus.hp > 0, true);
  check('물약도 들어 있다', party.potions.health, D.JOB_POTIONS.tank.health);
}

// --- 새 동료 ------------------------------------------------------------
{
  // 확률이라 한 번으로는 알 수 없다. 여러 씨앗으로 들어오기도 하고 안 들어오기도
  // 하는지를 본다.
  let joins = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const roster = R.create(seed);
    if (R.maybeJoin(roster, 5, seed)) joins++;
  }
  check('가끔 들어온다', joins > 0, true);
  check('늘 들어오지는 않는다', joins < 40, true);

  const roster = R.create(2);
  const before = roster.map((m) => m.name);
  const member = R.maybeJoin(roster, 8, 3) || R.maybeJoin(roster, 8, 5) || R.maybeJoin(roster, 8, 9);
  if (member) {
    check('명부에 들어간다', roster.includes(member), true);
    check('이름이 겹치지 않는다', before.includes(member.name), false);
    // 1레벨이 들어오면 명부에만 있고 아무도 안 데려간다.
    check('주인공 레벨 근처로 들어온다', Math.abs(member.level - 8) <= 2, true);
  }

  // 명부가 너무 길어지면 편성 화면이 목록 훑기가 된다.
  const crowd = R.create(1);
  while (crowd.length < R.MAX_SIZE) crowd.push(R.makeMember(Items.createRng(crowd.length), new Set(crowd.map((m) => m.name)), 1));
  check('상한을 넘지 않는다', R.maybeJoin(crowd, 5, 1), null);
}

// --- 저장본 -------------------------------------------------------------
{
  const saved = R.create(17);
  R.offerGear(saved[0], Items.make('shield', 2, 1));
  saved[0].level = 6;

  const loaded = R.adopt(JSON.parse(JSON.stringify(saved)));
  check('그대로 돌아온다', loaded.length, saved.length);
  check('레벨이 남는다', loaded[0].level, 6);
  check('장비가 남는다', loaded[0].gear.armor.defId, 'shield');
  check('아이템 uid는 새로 붙는다', typeof loaded[0].gear.armor.uid, 'string');

  // 동료 하나가 이상해도 나머지는 살아야 한다.
  const messy = R.adopt([
    { name: '멀쩡한 사람', defId: 'bran', level: 3, exp: 10, gear: {} },
    { name: '이름만', defId: '없는직업', level: 2 },
    null,
    { defId: 'noa', level: 1 },                                   // 이름 없음
    { name: '중복', defId: 'noa', level: 1, gear: {} },
    { name: '중복', defId: 'noa', level: 1, gear: {} },
    { name: '슬롯 어긋남', defId: 'lyle', level: 1, gear: { weapon: { defId: 'shield', tier: 0 } } },
  ]);
  check('못 읽는 항목만 버린다', messy.map((m) => m.name), ['멀쩡한 사람', '중복', '슬롯 어긋남']);
  check('슬롯이 안 맞는 장비는 버린다', messy[2].gear.weapon, null);

  check('아무것도 못 읽으면 새로 만든다', R.adopt([]).length, R.START_SIZE);
  check('배열이 아니어도 버틴다', R.adopt(null).length, R.START_SIZE);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

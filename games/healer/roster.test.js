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

// --- 제 몫의 골드와 장보기 ------------------------------------------------
//
// 길드 골드를 파티가 나눠 가지면서 동료도 지갑을 갖게 됐다. 쓸 데가 없으면
// 저장본에 숫자만 쌓이므로, 그 돈으로 제 장비를 산다.
{
  const roster = R.create(3);
  const joined = [roster[0].name, roster[1].name];
  const report = R.awardGold(roster, joined, 400, 9);

  check('모두가 보고에 들어간다', report.length, roster.length);
  check('데려간 쪽은 몫을 전부 받는다',
    report.filter((r) => r.joined).every((r) => r.gold === 400), true);
  // 경험치와 같은 규칙이다 — 규칙을 둘로 두면 한쪽만 고치게 된다.
  const idle = report.filter((r) => !r.joined);
  check('남은 쪽은 일부만 받는다', idle.every((r) => r.gold > 0 && r.gold < 400), true);
  check('받은 만큼 지갑에 쌓인다',
    roster.every((m) => m.gold === report.find((r) => r.name === m.name).gold), true);
  R.awardGold(roster, joined, 400, 9);
  check('다음 판의 몫이 더해진다', roster[0].gold, 800);
}
{
  // 돈이 없으면 아무것도 안 산다. 없는 돈으로 사면 지갑이 음수가 된다.
  const poor = R.create(11)[0];
  check('빈 지갑으로는 못 산다', R.goShopping(poor, 5), null);

  const rich = R.create(11)[0];
  rich.gold = 100000;
  const deal = R.goShopping(rich, 5);
  check('돈이 넉넉하면 산다', Boolean(deal), true);
  check('산 값만큼 지갑이 준다', rich.gold, 100000 - deal.price);
  check('산 것을 그 자리에서 낀다', rich.gear[deal.slot].uid, deal.item.uid);
  // 동료는 제 직업 물건만 산다. 아무거나 사면 탱커가 회복 지팡이를 들고 온다.
  const gearJob = D.GEAR[deal.item.defId].job;
  check('제 직업에 맞는 것을 산다',
    !gearJob || gearJob === D.COMPANIONS[rich.defId].job, true);

  // **지금 낀 것보다 나은 것만 산다.** 아니면 돈을 모은다 — 매번 다 써 버리면
  // 몇 판 참으면 살 수 있는 좋은 등급을 영영 못 산다.
  const best = R.create(11)[0];
  best.gold = 100000;
  for (const slot of Object.keys(best.gear)) {
    const def = Object.values(D.GEAR).find((g) => g.slot === slot);
    best.gear[slot] = Items.make(def.id, D.TIERS.length - 1, 7);
  }
  const before = best.gold;
  R.goShopping(best, 5);
  check('쓰던 것이 나으면 돈을 안 쓴다', best.gold, before);
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

  saved[0].gold = 250;

  const loaded = R.adopt(JSON.parse(JSON.stringify(saved)));
  check('그대로 돌아온다', loaded.length, saved.length);
  check('레벨이 남는다', loaded[0].level, 6);
  check('지갑이 남는다', loaded[0].gold, 250);
  check('지갑이 없던 저장본은 0으로 채운다', loaded[1].gold, 0);
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

// --- 계열 바꾸기 ----------------------------------------------------------
//
// **역할은 그대로 두고 계열만 바꾼다.** 탱커가 마법사가 되면 편성 화면이 보장하는
// "탱커 하나, 힐러 하나"가 뜻을 잃는다.
{
  const dealer = R.makeMember(Items.createRng(3), new Set(), 1, 'mira');
  check('딜러는 넷 중에서 고른다', R.specChoices(dealer).sort(),
    ['archer', 'mage', 'rogue', 'warrior']);
  check('낮은 레벨에는 못 바꾼다', R.canChangeSpec(dealer, 'mage').ok, false);
  check('안 바뀐 채로 남는다', R.changeSpec(dealer, 'mage').ok, false);

  dealer.level = D.SPEC_CHANGE_LEVEL;
  const had = R.skillsOf(dealer);
  check('레벨이 되면 바꿀 수 있다', R.changeSpec(dealer, 'mage').ok, true);
  check('계열이 바뀐다', R.specOf(dealer), 'mage');
  check('역할은 그대로다', R.jobOf(dealer), 'dealer');
  // 그림은 계열을 따라간다 — 궁수가 마법사가 되면 손에 든 것이 바뀐다.
  check('그림도 바뀐다', R.spriteOf(dealer), 'mage');
  // **바꾸기 전에 들고 다니던 넷은 배운 것으로 남는다.** 바꾸는 것이 곧 잃는
  // 일이면 아무도 바꾸지 않는다.
  check('쓰던 넷이 배운 것으로 남는다',
    had.every((id) => dealer.learned.includes(id)), true);
  check('다른 계열 스킬을 섞어 든다',
    R.skillsOf(dealer).some((id) => !D.SPEC_SKILLS.mage.includes(id)), true);
  check('그래도 넷을 넘지 않는다', R.skillsOf(dealer).length <= D.UNIT_SKILL_MAX, true);

  // 역할 밖의 계열은 고를 수 없다.
  check('딜러가 사제로는 못 간다', R.canChangeSpec(dealer, 'priest').ok, false);
  const tank = R.makeMember(Items.createRng(9), new Set(), D.SPEC_CHANGE_LEVEL, 'bran');
  check('탱커의 선택지는 둘', R.specChoices(tank).sort(), ['tank', 'warrior']);
  check('탱커가 궁수로는 못 간다', R.canChangeSpec(tank, 'archer').ok, false);

  // 레벨이 올라 새로 들게 된 것도 배운 것이 된다.
  const grown = R.makeMember(Items.createRng(4), new Set(), 1, 'lyle');
  R.gainExp(grown, 1e6);
  check('레벨이 오르면 그때 든 것도 배운다', grown.learned.length > 0, true);
}

// --- 저장본에 남는다 -------------------------------------------------------
{
  const member = R.makeMember(Items.createRng(3), new Set(), D.SPEC_CHANGE_LEVEL, 'mira');
  R.changeSpec(member, 'mage');
  const back = R.adopt([member])[0];
  check('바꾼 계열이 남는다', R.specOf(back), 'mage');
  check('배운 것도 남는다', back.learned.sort(), member.learned.sort());

  // 저장본을 손대서 역할 밖의 계열을 적어 두면 되돌린다.
  const forged = R.adopt([Object.assign({}, member, { spec: 'priest' })])[0];
  check('고를 수 없는 계열은 되돌린다', R.baseSpecOf(forged), R.defOf(forged).spec);
  // 모르는 스킬이 섞여 있으면 버린다 — 전투가 빈 스킬을 들고 들어간다.
  const junk = R.adopt([Object.assign({}, member, { learned: ['없는스킬', 'snipe'] })])[0];
  check('모르는 스킬은 버린다', junk.learned, ['snipe']);
}

// --- 상위 계열 ------------------------------------------------------------
//
// 명부와 전투가 같은 함수를 봐야 편성 화면에 적힌 계열과 전장에서 쓰는 스킬이
// 갈리지 않는다.
{
  const member = R.makeMember(Items.createRng(7), new Set(), 1, 'bran');
  check('낮은 레벨은 아래 계열', R.specOf(member), 'tank');

  member.level = D.SPEC_UP_LEVEL;
  check('문턱에서 상위 계열', R.specOf(member), 'bulwark');
  check('상위 전용을 들고 온다',
    R.skillsOf(member).some((id) => D.SPEC_UP.tank.skills.includes(id)), true);
  // 이름은 처음 만들 때 정해진 신원이라 계열이 올라가도 그대로다.
  const named = R.makeMember(Items.createRng(7), new Set(), D.SPEC_UP_LEVEL, 'bran');
  check('이름 조각은 아래 계열에서 나온다', named.name, member.name);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

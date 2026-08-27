'use strict';

// 실행: node games/healer/items.test.js
// 아이템 인스턴스. 등급과 무작위 옵션이 붙으면서 "같은 이름의 다른 물건"이
// 생겼고, 그것을 구별하고 견주는 규칙이 여기 다 들어 있다.
const D = require('./data.js');
const Items = require('./items.js');

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

const SEEDS = [1, 7, 42, 999, 20260825];

// --- 만들기 -------------------------------------------------------------
{
  const item = Items.make('staff', 2, 5);
  check('정의를 찾는다', Items.def(item).id, 'staff');
  check('장비다', Items.isGear(item), true);
  check('등급이 그대로', item.tier, 2);
  check('같은 씨앗이면 같은 옵션',
    Items.make('staff', 2, 5).affixes, item.affixes);

  // uid가 없으면 인벤토리에서 같은 물건을 구별할 수 없다.
  check('저마다 다른 uid', Items.make('staff', 2, 5).uid === item.uid, false);

  check('등급은 범위 안으로 자른다', Items.make('staff', 99, 1).tier, D.TIERS.length - 1);
  check('음수 등급도 자른다', Items.make('staff', -3, 1).tier, 0);

  // 재료에는 옵션이 붙지 않는다. 팔아서 골드가 되는 것뿐이다.
  const fang = Items.make('fang', 2, 1);
  check('재료는 장비가 아니다', Items.isGear(fang), false);
  check('재료에는 옵션이 없다', fang.affixes, undefined);
}

// --- 옵션 ---------------------------------------------------------------
{
  // 등급이 오르면 직업 옵션 수가 는다. 그 위에 치명타·회피가 확률로 하나 더
  // 붙으므로, 실제 옵션 수는 정해진 수이거나 거기에 하나 많다.
  const special = new Set(D.SPECIAL_POOL);
  const jobCount = (item) => item.affixes.filter((a) => !special.has(a.stat)).length;
  for (let tier = 0; tier < D.TIERS.length; tier++) {
    const items = SEEDS.map((seed) => Items.make('shield', tier, seed));
    check(`등급 ${tier}: 직업 옵션이 정해진 만큼`,
      items.every((item) => jobCount(item) === D.AFFIX_COUNT[tier]), true);
    // 옵션이 하나도 없는 물건은 같은 등급이면 전부 같은 물건이 된다.
    check(`등급 ${tier}: 옵션이 하나는 붙는다`,
      items.every((item) => item.affixes.length > 0), true);
  }

  // 직업에 어울리는 스탯 위주로 붙어야 탱커 방패에 회복력이 붙지 않는다.
  // 치명타·회피는 직업을 가리지 않는 자리라 따로 센다.
  const wrong = [];
  let withSpecial = 0;
  let total = 0;
  for (const seed of SEEDS) {
    for (const [defId, gear] of Object.entries(D.GEAR)) {
      const item = Items.make(defId, D.TIERS.length - 1, seed);
      const pool = D.AFFIX_POOL[gear.job || 'none'];
      total++;
      if (item.affixes.some((affix) => special.has(affix.stat))) withSpecial++;
      for (const affix of item.affixes) {
        if (!pool.includes(affix.stat) && !special.has(affix.stat)) {
          wrong.push(`${defId}:${affix.stat}`);
        }
      }
      // 같은 스탯이 두 번 붙으면 한 줄로 합쳐 보여야 해서 읽기가 나빠진다.
      const stats = item.affixes.map((affix) => affix.stat);
      if (new Set(stats).size !== stats.length) wrong.push(`${defId}:중복`);
    }
  }
  check('직업에 맞는 옵션이거나 치명타·회피다', [...new Set(wrong)], []);
  // 확률로 붙는 자리다. 늘 붙으면 옵션이 아니라 기본 수치이고, 안 붙으면 없는
  // 기능이다.
  check('치명타·회피가 붙기는 한다', withSpecial > 0, true);
  check('모든 물건에 붙지는 않는다', withSpecial < total, true);

  // 같은 스탯이 두 번 붙으면 한 줄로 합쳐 보여야 해서 읽기가 나빠진다.
  const dupes = [];
  for (const seed of SEEDS) {
    const item = Items.make('mail', D.TIERS.length - 1, seed);
    const stats = item.affixes.map((affix) => affix.stat);
    if (new Set(stats).size !== stats.length) dupes.push(seed);
  }
  check('같은 옵션이 두 번 붙지 않는다', dupes, []);

  // 옵션 값이 흔들려야 같은 등급 안에서도 "잘 나왔다"가 생긴다.
  const values = SEEDS.map((seed) => Items.make('charm', 3, seed).affixes[0].value);
  check('옵션 값은 판마다 다르다', new Set(values.map((v) => v.toFixed(4))).size > 1, true);
}

// --- 수치 ---------------------------------------------------------------
{
  const plain = Items.make('shield', 0, 1);
  const fancy = Items.make('shield', 4, 1);
  check('등급이 오르면 기본 수치도 오른다',
    Items.stats(fancy).hp > Items.stats(plain).hp, true);

  // 옵션은 기본 수치 위에 더해진다.
  const charm = Items.make('charm', 3, 7);
  const base = D.GEAR.charm.stats.heal * (1 + 3 * 0.6);
  check('옵션이 기본 위에 얹힌다', Items.stats(charm).heal > base, true);

  const total = Items.sum([Items.make('shield', 1, 1), Items.make('charm', 1, 2)]);
  check('여러 장비를 더한다', total.hp > 0 && total.heal > 0, true);
  check('빈 목록도 더할 수 있다', Items.sum([]), {});
}

// --- 이름과 요약 --------------------------------------------------------
{
  check('장비에는 등급 이름이 붙는다', Items.name(Items.make('robe', 2, 1)), '희귀 사제의 로브');
  check('재료에는 붙지 않는다', Items.name(Items.make('pelt', 3, 1)), '거친 가죽');
  check('모르는 물건도 터지지 않는다', Items.name({ defId: '없음', tier: 0 }), '?');
  check('요약에 스탯 이름이 들어간다', Items.summary(Items.make('mail', 0, 1)).includes('체력'), true);
}

// --- 견주기 -------------------------------------------------------------
{
  const weak = Items.make('staff', 0, 1);
  const strong = Items.make('staff', 4, 1);

  check('빈 슬롯과 견주면 통째로 이득', Object.keys(Items.diff(weak, null)).length > 0, true);
  check('같은 물건이면 차이가 없다', Items.diff(weak, weak), {});
  check('더 좋은 것은 이득으로 나온다', Items.diff(strong, weak).heal > 0, true);

  check('업그레이드로 본다', Items.isUpgrade(strong, weak), true);
  check('반대는 업그레이드가 아니다', Items.isUpgrade(weak, strong), false);

  // 받는 피해는 낮을수록 좋다. 부호만 보면 뜻이 뒤집힌다.
  check('받는 피해가 줄면 이득', Items.gainOf('armor', -0.05) > 0, true);
  check('체력이 늘면 이득', Items.gainOf('hp', 20) > 0, true);

  // 잃는 것 없이 오르기만 할 때만 "낫다"고 한다. 한 수치라도 오르면 낫다고
  // 하면 거의 모든 물건에 표시가 붙어 표시의 뜻이 사라진다.
  const trade = { uid: 'x', defId: 'mail', tier: 0, affixes: [] };
  const rich = { uid: 'y', defId: 'mail', tier: 0, affixes: [{ stat: 'mp', value: 30 }] };
  check('한쪽이 손해면 업그레이드가 아니다',
    Items.isUpgrade(trade, rich), false);
}

// --- 값 -----------------------------------------------------------------
{
  const cheap = Items.make('crystal', 0, 1);
  const dear = Items.make('crystal', 4, 1);
  check('등급이 오르면 비싸다', Items.price(dear) > Items.price(cheap), true);

  // 옵션이 잘 붙은 물건이 더 비싸야 상점에서 옵션을 들여다볼 이유가 생긴다.
  const prices = SEEDS.map((seed) => Items.price(Items.make('charm', 3, seed)));
  check('같은 등급이라도 값이 다르다', new Set(prices).size > 1, true);

  // 사서 되파는 것이 이득이면 골드가 뜻을 잃는다.
  const bad = [];
  for (const seed of SEEDS) {
    for (const defId of Object.keys(D.GEAR)) {
      const item = Items.make(defId, 2, seed);
      if (Items.sellPrice(item) >= Items.price(item)) bad.push(defId);
    }
  }
  check('파는 값이 사는 값보다 싸다', [...new Set(bad)], []);
  check('아무리 싸도 1골드는 받는다', Items.sellPrice(Items.make('bow', 0, 1)) >= 1, true);
}

// --- 저장본에서 받기 ----------------------------------------------------
{
  const adopted = Items.adopt({ defId: 'staff', tier: 2, affixes: [{ stat: 'heal', value: 0.2 }] });
  check('받아들인다', adopted.defId, 'staff');
  check('uid를 새로 붙인다', typeof adopted.uid, 'string');
  check('옵션이 남는다', adopted.affixes.length, 1);

  check('모르는 물건은 버린다', Items.adopt({ defId: '없음', tier: 0 }), null);
  check('null도 버린다', Items.adopt(null), null);
  check('모르는 스탯의 옵션은 버린다',
    Items.adopt({ defId: 'staff', tier: 0, affixes: [{ stat: '행운', value: 5 }] }).affixes, []);
  check('숫자가 아닌 값도 버린다',
    Items.adopt({ defId: 'staff', tier: 0, affixes: [{ stat: 'heal', value: 'many' }] }).affixes, []);
  check('옵션이 배열이 아니어도 버틴다',
    Items.adopt({ defId: 'staff', tier: 0, affixes: '많음' }).affixes, []);
}

// --- 동료의 판단 --------------------------------------------------------
{
  // 동료는 인벤토리가 없다. 총합 점수로 갈아 끼울지 정하는데, 갈아 끼우는 것은
  // **같은 슬롯 안에서만** 일어나므로 견주기도 슬롯 안에서 해야 뜻이 있다.
  const staff = Items.make('staff', 3, 1);   // 무기 · 힐러
  const rod = Items.make('rod', 3, 1);       // 무기 · 딜러
  const shield = Items.make('shield', 3, 1); // 방어구 · 탱커
  const robe = Items.make('robe', 3, 1);     // 방어구 · 힐러

  check('힐러에게는 지팡이가 낫다', Items.score(staff, 'healer') > Items.score(rod, 'healer'), true);
  check('딜러에게는 지팡이가 아니다', Items.score(rod, 'dealer') > Items.score(staff, 'dealer'), true);
  check('탱커에게는 방패가 낫다', Items.score(shield, 'tank') > Items.score(robe, 'tank'), true);
  check('힐러에게는 로브가 낫다', Items.score(robe, 'healer') > Items.score(shield, 'healer'), true);
}

// --- 등급이 높으면 옵션이 좋다 ------------------------------------------
//
// 이것이 색을 나눈 이유다. 구간이 겹치면 잘 나온 고급이 못 나온 희귀보다 나은
// 일이 생기고, 그러면 등급을 보고 고를 수 없다.
{
  check('등급이 여섯이다', D.TIERS.length, 6);
  check('이름이 붙어 있다', D.TIERS.map((t) => t.name),
    ['일반', '고급', '희귀', '영웅', '전설', '신화']);
  check('색 이름도 붙어 있다', D.TIERS.every((t) => typeof t.css === 'string'), true);

  check('등급마다 하한과 상한이 있다', D.AFFIX_RANGE.length, D.TIERS.length);
  const gaps = [];
  for (let tier = 1; tier < D.AFFIX_RANGE.length; tier++) {
    const [lo] = D.AFFIX_RANGE[tier];
    const [, prevHi] = D.AFFIX_RANGE[tier - 1];
    if (lo <= prevHi) gaps.push(D.TIERS[tier].name);
  }
  check('구간이 겹치지 않는다', gaps, []);
  check('하한이 상한보다 낮다',
    D.AFFIX_RANGE.every(([lo, hi]) => lo < hi), true);

  // 실제로 굴려도 그렇다. 같은 스탯이 붙은 것끼리 견준다.
  const worst = [];
  for (let tier = 1; tier < D.TIERS.length; tier++) {
    for (const seed of SEEDS) {
      const low = Items.make('mail', tier - 1, seed);
      const high = Items.make('mail', tier, seed);
      const hpOf = (item) => (item.affixes.find((a) => a.stat === 'hp') || {}).value || 0;
      if (hpOf(low) && hpOf(high) && hpOf(high) <= hpOf(low)) worst.push(D.TIERS[tier].name);
    }
  }
  check('굴려도 위 등급이 낫다', [...new Set(worst)], []);

  // 기본 수치도 등급을 따라 오른다.
  check('등급이 오르면 기본 수치도 오른다',
    D.TIER_POWER.every((v, i) => i === 0 || v > D.TIER_POWER[i - 1]), true);
  check('옵션 수도 줄지 않는다',
    D.AFFIX_COUNT.every((v, i) => i === 0 || v >= D.AFFIX_COUNT[i - 1]), true);
  check('등급이 오르면 값도 오른다', (() => {
    let last = -1;
    for (let tier = 0; tier < D.TIERS.length; tier++) {
      const price = Items.price(Items.make('mail', tier, 5));
      if (price <= last) return `등급 ${tier}`;
      last = price;
    }
    return true;
  })(), true);
}

// --- 적의 등급과 레벨이 전리품 등급을 정한다 ----------------------------
{
  const rolls = (rank, level, count) => {
    const rng = Items.createRng(rank.length * 31 + level);
    const out = [];
    for (let i = 0; i < count; i++) out.push(D.tierRoll(rank, level, rng));
    return out;
  };
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;

  const trash = mean(rolls('trash', 10, 4000));
  const elite = mean(rolls('elite', 10, 4000));
  const boss = mean(rolls('boss', 10, 4000));
  check('센 적일수록 좋은 등급이 나온다', trash < elite && elite < boss, true);

  check('레벨이 오르면 등급도 오른다',
    mean(rolls('trash', 5, 4000)) < mean(rolls('trash', 25, 4000)), true);

  // 잡졸에게서도 아주 드물게는 나온다 — 확률이 0이면 등급이 아니라 자물쇠다.
  check('잡졸에게서도 나올 수는 있다',
    rolls('trash', 20, 20000).some((tier) => tier >= 4), true);
  // 다만 낮은 레벨의 잡졸이 신화를 흘리면 우두머리를 잡을 이유가 없다.
  check('1레벨 잡졸이 신화를 흘리지는 않는다',
    rolls('trash', 1, 20000).every((tier) => tier < D.TIERS.length - 1), true);

  check('등급은 표 안에 있다',
    rolls('boss', 30, 2000).every((tier) => tier >= 0 && tier < D.TIERS.length), true);
}

// --- 능력치도 옵션으로 붙는다 -------------------------------------------
//
// 능력치가 오르면 거기서 나오는 수치가 함께 오른다. 그래서 결과 수치에 더하는
// 것이 아니라 derive 앞에 얹어야 한다.
{
  const attrIds = Object.keys(D.ATTRS);
  check('능력치가 옵션 표에 있다',
    attrIds.every((id) => Number.isFinite(D.AFFIX_BASE[id])), true);

  // **장비를 바꾸는 것이 화면에서 일이어야 한다.** 값을 올리기 전에는 희귀
  // 한 자리를 끼워도 캐릭터 창의 숫자가 거의 그대로였다. 능력치 옵션 하나가
  // 최대 체력 옵션 하나와 엇비슷해야 둘 중 무엇을 고를지가 생긴다.
  check('능력치 하나가 최대 체력 하나와 엇비슷하다',
    Math.abs(D.AFFIX_BASE.vit * D.ATTR.hpPerVit - D.AFFIX_BASE.hp) <= D.AFFIX_BASE.hp * 0.75, true);
  // 희귀 하나가 최대 체력을 눈에 띄게 올려야 한다 — 기준값 × 등급 구간이다.
  check('희귀 최대 체력 옵션이 20을 넘는다',
    D.AFFIX_BASE.hp * D.AFFIX_RANGE[2][0] > 20, true);
  check('능력치마다 어느 표에든 들어 있다',
    attrIds.filter((id) => !Object.values(D.AFFIX_POOL).some((pool) => pool.includes(id))), []);
  check('이름이 적혀 있다', attrIds.every((id) => D.STATS[id]), true);

  // 최대 체력·최대 마나와 이름이 갈려야 한 물건 안에서 구별된다.
  check('최대 체력이라고 적는다', D.STATS.hp.name, '최대 체력');
  check('최대 마나라고 적는다', D.STATS.mp.name, '최대 마나');
  check('능력치 체력과 이름이 다르다', D.STATS.vit.name !== D.STATS.hp.name, true);

  // 실제로 굴려서 붙는지. 등급이 높을수록 옵션이 많아 잘 걸린다.
  const rolled = new Set();
  for (const seed of SEEDS) {
    for (const defId of Object.keys(D.GEAR)) {
      for (const affix of Items.make(defId, D.TIERS.length - 1, seed).affixes) {
        if (attrIds.includes(affix.stat)) rolled.add(affix.stat);
      }
    }
  }
  check('네 능력치가 모두 붙어 본다', attrIds.filter((id) => !rolled.has(id)), []);

  // 정수로 붙는다. 화면에 +2라고 적고 속으로 1.7을 쓰면 캐릭터 창의 합이 안 맞는다.
  const fractions = [];
  for (const seed of SEEDS) {
    for (let tier = 0; tier < D.TIERS.length; tier++) {
      for (const affix of Items.make('mail', tier, seed).affixes) {
        if (attrIds.includes(affix.stat) && affix.value !== Math.round(affix.value)) {
          fractions.push(`${affix.stat} ${affix.value}`);
        }
      }
    }
  }
  check('능력치는 정수로 붙는다', fractions, []);

  // 능력치를 올리면 거기서 나오는 수치가 함께 오른다.
  const base = D.attrsAt(D.HERO, 5, null);
  const geared = D.attrsWithGear(base, { vit: 10, int: 10 });
  check('장비 능력치가 얹힌다', geared.vit - base.vit, 10);
  const before = D.derive(D.HERO, base);
  const after = D.derive(D.HERO, geared);
  check('체력이 최대 체력을 올린다', after.hp - before.hp, 10 * D.ATTR.hpPerVit);
  check('지능이 최대 마나를 올린다', after.mp - before.mp, 10 * D.ATTR.mpPerInt);
  check('지능이 회복량도 올린다', after.heal > before.heal, true);

  // 동료도 능력치가 붙은 물건을 알아본다.
  const plain = { uid: 'a', defId: 'mail', tier: 0, affixes: [] };
  const withVit = { uid: 'b', defId: 'mail', tier: 0, affixes: [{ stat: 'vit', value: 5 }] };
  check('능력치가 붙으면 점수가 오른다',
    Items.score(withVit, 'tank') > Items.score(plain, 'tank'), true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

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
  // 등급이 오르면 옵션 수가 는다. 등급만으로 수치가 오르면 같은 등급의 물건이
  // 전부 같은 물건이라 상점을 들여다볼 이유가 없다.
  for (let tier = 0; tier < D.TIERS.length; tier++) {
    const counts = SEEDS.map((seed) => Items.make('shield', tier, seed).affixes.length);
    check(`등급 ${tier}: 옵션 수가 정해진 만큼`,
      counts.every((n) => n === D.AFFIX_COUNT[tier]), true);
  }

  // 직업에 어울리는 스탯 위주로 붙어야 탱커 방패에 회복력이 붙지 않는다.
  const wrong = [];
  for (const seed of SEEDS) {
    for (const [defId, gear] of Object.entries(D.GEAR)) {
      const item = Items.make(defId, D.TIERS.length - 1, seed);
      const pool = D.AFFIX_POOL[gear.job || 'none'];
      for (const affix of item.affixes) {
        if (!pool.includes(affix.stat)) wrong.push(`${defId}:${affix.stat}`);
      }
    }
  }
  check('직업에 맞는 옵션만 붙는다', [...new Set(wrong)], []);

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
  check('장비에는 등급 이름이 붙는다', Items.name(Items.make('robe', 2, 1)), '튼튼한 사제의 로브');
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

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

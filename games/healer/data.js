'use strict';

// 게임에 나오는 모든 수치와 정의. 규칙(logic.js)·판단(ai.js)과 분리해 둔 이유는,
// 기획서가 "구체적인 수치는 아직 결정하지 않는다"고 적어 둔 항목이 많아서다.
// 수치가 정해지면 이 파일만 고치면 되고, 규칙 코드는 건드릴 일이 없다.
(function (root) {

// 전투 화면의 좌표계. 화면 픽셀이 아니라 이 격자 위에서 계산한다 — 화면 크기가
// 달라져도 사거리와 장판 반경이 같은 뜻을 유지해야 하기 때문이다.
//
// 높이를 가로의 절반 남짓으로 잡은 것은 실제로 쓰이는 만큼만 두기 위해서다.
// 딜러가 탱커가 잡은 적을 치러 모이므로 전투는 한 덩어리로 뭉치는데, 높이를
// 넉넉히 잡으면 화면 아래쪽이 늘 비어 있게 된다. 반경 값들은 이 높이에 맞춰
// 정해져 있다.
//
// **top은 유닛이 올라설 수 없는 위쪽 여백이다.** 유닛은 발밑을 기준으로 그려지고
// 몸통이 그 위로 뻗으므로, 0까지 올라가면 머리가 화면 밖으로 잘린다. 지평선
// (scenes.js의 HORIZON)보다 아래로 잡아야 벽에 서 있는 것처럼 보이지도 않는다.
const FIELD = { w: 100, h: 56, top: 16, bottom: 52 };

// 피해 감소는 곱셈 계수다. 방어력을 빼기로 하면 공격력이 낮은 적의 피해가
// 0이 되어 탱커가 무적이 되는 구간이 생긴다.
const JOBS = {
  tank: { name: '탱커', role: '아군 후열을 노리는 적의 어그로를 끈다' },
  dealer: { name: '딜러', role: '아군 힐러를 치는 적을 먼저 친다' },
  healer: { name: '힐러', role: '탱커 체력 관리 최우선' },
};

// 딜러는 근접과 원거리가 하는 일이 다르고, 우선순위 표가 그 구분을 쓴다.
// 사거리로 가르는 것은 정의에 이미 적혀 있는 것을 두 번 적지 않기 위해서다.
const MELEE_RANGE = 12;
const roleOf = (def) => (def.job === 'dealer'
  ? (def.range > MELEE_RANGE ? 'ranged' : 'melee')
  : def.job);

// 누구를 먼저 치고 먼저 살리는가. **아군과 적이 같은 표를 쓴다.**
const ATTACK_ORDER = ['healer', 'ranged', 'melee', 'tank'];
const HEAL_ORDER = ['tank', 'healer', 'melee', 'ranged'];
// 탱커가 어그로를 끌 때의 순서 — 후열부터 구한다.
const PULL_ORDER = ['healer', 'ranged', 'melee'];

// 종족. **모든 캐릭터가 하나씩 갖는다.**
//
// 두 가지를 정한다.
//
// - **물약을 쓸 수 있는가.** 인간형(인간·엘프·드워프)만 마신다. 고블린과 오크가
//   유리병을 들고 다니며 홀짝이는 그림이 이상해서 넣은 구분이지만, 전투에서는
//   "저쪽은 마나가 떨어지면 스킬이 끊긴다"는 뜻이 된다 — 그래서 마나를 주로
//   쓰는 비인간형에게는 마나를 되찾는 스킬을 반드시 쥐여 준다.
// - **기본 능력치를 얼마나 비트는가.** 정의에 적힌 능력치에 곱해진다. 인간은
//   1.0으로 균등하고, 엘프는 지능·민첩 쪽으로, 드워프는 힘·체력 쪽으로 기운다.
//   합이 4.0 언저리로 맞춰져 있어 어느 종족도 그냥 더 세지는 않는다.
//
// 오우거와 언데드는 표에만 있고 아직 쓰는 유닛이 없다. 적을 늘릴 자리다.
const RACES = {
  human:  { id: 'human',  name: '인간',   humanoid: 1,
            attrs: { str: 1.00, agi: 1.00, int: 1.00, vit: 1.00 } },
  elf:    { id: 'elf',    name: '엘프',   humanoid: 1,
            attrs: { str: 0.85, agi: 1.25, int: 1.25, vit: 0.85 } },
  dwarf:  { id: 'dwarf',  name: '드워프', humanoid: 1,
            attrs: { str: 1.25, agi: 0.80, int: 0.85, vit: 1.25 } },
  goblin: { id: 'goblin', name: '고블린', humanoid: 0,
            attrs: { str: 0.90, agi: 1.25, int: 0.95, vit: 0.90 } },
  orc:    { id: 'orc',    name: '오크',   humanoid: 0,
            attrs: { str: 1.25, agi: 0.85, int: 0.85, vit: 1.20 } },
  ogre:   { id: 'ogre',   name: '오우거', humanoid: 0,
            attrs: { str: 1.45, agi: 0.70, int: 0.70, vit: 1.45 } },
  undead: { id: 'undead', name: '언데드', humanoid: 0,
            attrs: { str: 1.05, agi: 0.85, int: 1.10, vit: 1.15 } },
};

const raceOf = (def) => RACES[(def && def.race) || 'human'] || RACES.human;

// **물약은 인간형만 마신다.** 직업이 무엇을 들고 가는지는 JOB_POTIONS가 정하고,
// 종족이 마실 수 있는지를 정한다.
const potionsFor = (def) => (raceOf(def).humanoid
  ? Object.assign({}, JOB_POTIONS[def && def.job] || {})
  : {});

// 능력치 넷. 모든 캐릭터가 갖고, 화면에 보이는 수치는 전부 여기서 나온다.
//
// **최대 체력과 최대 마나는 능력치에서 곧바로 나오고, 공격력과 회복량은 배수로
// 붙는다.** 체력·마나는 직업이 달라도 같은 잣대로 잴 수 있지만, 공격력은 그렇지
// 않다 — 탱커의 26과 우두머리의 116을 하나의 계수로 이으면 직업 색깔이 사라진다.
// 그래서 공격력·회복량은 기준 능력치에서 얼마나 벗어났는지로 곱한다.
const ATTRS = {
  str: { id: 'str', name: '힘',   effect: '물리 공격력 · 치명타 피해' },
  agi: { id: 'agi', name: '민첩', effect: '회피 · 치명타 확률' },
  int: { id: 'int', name: '지능', effect: '마법 공격력 · 회복량 · 최대 마나' },
  vit: { id: 'vit', name: '체력', effect: '최대 체력' },
};

const ATTR = {
  hpPerVit: 14,
  mpPerInt: 8,
  // 공격력·회복량은 **기준 능력치 대비 비율**로 오른다. 차이(빼기)로 두었더니
  // 기준이 낮은 유닛과 높은 유닛의 성장 속도가 달라졌다 — 힘 20짜리 탱커와
  // 힘 89짜리 우두머리가 같은 계수에서 전혀 다른 곡선을 그렸다.
  //
  // 공격력은 비율을 그대로 쓰고(힘이 두 배면 공격력도 두 배), 회복량과 주문
  // 피해는 그 일부만 받는다. 회복량 쪽이 큰 것은 의도한 것이다 — 지능을 올린
  // 힐러가 딜러 노릇을 더 잘하게 되면 이 게임이 아니게 된다.
  powerRatio: 1,      // 때리는 공격력(힘 또는 지능)
  healRatio: 0.4,     // 회복량
  spellRatio: 0.25,   // 주인공의 주문 피해
  // 회피율. 상한이 없으면 높은 레벨에서 서로 못 맞히는 전투가 된다.
  dodgePerAgi: 0.0025,
  dodgeCap: 0.30,

  // 치명타. 확률은 민첩이, 추가 피해는 힘이 정한다. 둘 다 능력치에 곧바로 비례한다.
  //
  // 기준 대비 비율로 잡아 봤더니 같은 레벨의 모든 캐릭터가 거의 같은 치명타
  // 피해를 냈다 — 비율은 레벨에 따라서만 오르기 때문이다. 치명타 피해는 그
  // 캐릭터가 힘을 쓰는 쪽인지를 나타내야 하므로 힘 자체에 비례시키고, 대신
  // 상한으로 높은 레벨에서 부풀지 않게 막는다.
  critPerAgi: 0.002,
  critCap: 0.40,
  critBase: 1.5,             // 치명타의 기본 배수
  critDamagePerStr: 0.004,
  critDamageCap: 2.5,

  // 회피는 치명타에도 걸린다. 맞더라도 치명타는 아닌 것으로 무르고(critAvoid),
  // 그래도 터지면 추가 피해를 깎는다(critCut). 회피가 상한일 때 추가 피해가
  // 절반이 되도록 잡았다.
  critAvoid: 1,
  critCut: 0.5,
  // 레벨당 나눠 줄 점수. 주인공만 받는다.
  pointsPerLevel: 3,
};

// 레벨당 능력치가 기준의 몇 분의 몇씩 오르는지. 예전의 체력·공격력 배수를 그대로
// 옮긴 값이라, 레벨 1에서도 높은 레벨에서도 지금까지의 수치와 거의 같다.
const ATTR_GROWTH = {
  hero:  { str: 0.10, agi: 0.10, int: 0.15, vit: 0.095 },
  ally:  { str: 0.20, agi: 0.20, int: 0.22, vit: 0.26 },
  enemy: { str: 0.22, agi: 0.22, int: 0.26, vit: 0.30 },
};

// 레벨과 나눠 준 점수를 반영한 실제 능력치.
// 정의에 적힌 능력치에 종족을 곱한 것. **이것이 그 캐릭터의 기본 능력치다** —
// 레벨 성장도 비율 계산도 전부 여기서 출발한다. 정의 쪽 숫자는 종족을 빼고
// 보았을 때의 값이라, 같은 숫자를 적어도 엘프와 드워프가 다른 캐릭터가 된다.
//
// 정의는 바뀌지 않으므로 한 번 계산해 두고 쓴다.
const raceCache = new Map();

function raceAttrs(def) {
  if (raceCache.has(def)) return raceCache.get(def);
  const mul = raceOf(def).attrs;
  const out = {};
  for (const key of Object.keys(ATTRS)) {
    out[key] = Math.max(1, Math.round(((def.attrs || {})[key] || 1) * mul[key]));
  }
  raceCache.set(def, out);
  return out;
}

function attrsAt(def, level, spent) {
  const growth = ATTR_GROWTH[def.growth || 'ally'];
  const raced = raceAttrs(def);
  const out = {};
  for (const key of Object.keys(ATTRS)) {
    const base = raced[key];
    out[key] = Math.round(base * (1 + growth[key] * (Math.max(1, level) - 1)))
      + ((spent || {})[key] || 0);
  }
  return out;
}

// 능력치에서 실제 수치로. 화면과 전투가 같은 함수를 봐야 캐릭터 창에 적힌 것과
// 전투에서 쓰는 것이 어긋나지 않는다.
// 기준 대비 몇 배인지. 기준이 0이면 나눌 수 없으므로 1로 본다.
const ratioOf = (attrs, base, key) => attrs[key] / ((base || {})[key] || attrs[key] || 1);

function derive(def, attrs) {
  // 비율의 기준도 종족이 곱해진 값이다. 정의 쪽 숫자를 기준으로 삼으면 레벨 1의
  // 엘프가 이미 기준을 넘어선 것이 되어, 적어 둔 공격력과 실제가 어긋난다.
  const base = raceAttrs(def);
  // 마법을 쓰는 쪽은 지능이, 나머지는 힘이 공격력을 올린다.
  const key = def.attackType === 'magic' ? 'int' : 'str';
  const power = ratioOf(attrs, base, key);
  const smarts = ratioOf(attrs, base, 'int');

  return {
    hp: Math.round(attrs.vit * ATTR.hpPerVit),
    mp: Math.round(attrs.int * ATTR.mpPerInt),
    atk: (def.atk || 0) * (1 + (power - 1) * ATTR.powerRatio),
    heal: 1 + (smarts - 1) * ATTR.healRatio,
    spell: 1 + (smarts - 1) * ATTR.spellRatio,
    dodge: Math.min(ATTR.dodgeCap, attrs.agi * ATTR.dodgePerAgi),
    crit: Math.min(ATTR.critCap, attrs.agi * ATTR.critPerAgi),
    // 공격 방식과 무관하게 힘이 정한다 — 시전자는 자주 터뜨려도 세게 때리지는
    // 못한다는 뜻이고, 그것이 힘과 지능을 가르는 자리다.
    critDamage: Math.min(ATTR.critDamageCap,
      ATTR.critBase + attrs.str * ATTR.critDamagePerStr),
  };
}

// 능력치가 만든 수치에 장비를 얹은 **최종 수치**. 캐릭터 창(progress.stats)과
// 전투(logic.makeUnit)가 같은 함수를 봐야 창에 적힌 숫자와 전투가 어긋나지
// 않는다 — 따로 계산하던 동안 주인공의 장비가 전투에 반영되지 않았다.
//
// 상한은 여기서도 걸린다. 능력치로 올린 것이든 장비로 올린 것이든 회피·치명타가
// 같은 천장을 보아야, 장비 옵션 하나로 규칙이 무너지지 않는다.
// **장비가 올린 능력치는 derive 앞에 얹는다.** 결과 수치에 더하면 체력 옵션이
// 최대 체력만 올리고 끝나는데, 능력치는 거기서 나오는 것을 전부 올려야 한다 —
// 지능 하나가 최대 마나와 회복량과 마법 공격력을 같이 올리는 것이 능력치의 뜻이다.
function attrsWithGear(attrs, gear) {
  const out = Object.assign({}, attrs);
  for (const id of Object.keys(ATTRS)) out[id] = (out[id] || 0) + ((gear && gear[id]) || 0);
  return out;
}

function withGear(base, gear, armorBase) {
  const g = gear || {};
  return {
    hp: Math.round(base.hp + (g.hp || 0)),
    mp: Math.round(base.mp + (g.mp || 0)),
    atk: base.atk * (1 + (g.atk || 0)),
    heal: base.heal + (g.heal || 0),
    spell: base.spell,
    dodge: Math.min(ATTR.dodgeCap, base.dodge + (g.dodge || 0)),
    crit: Math.min(ATTR.critCap, base.crit + (g.crit || 0)),
    critDamage: Math.min(ATTR.critDamageCap, base.critDamage + (g.critDamage || 0)),
    // 방어 계수가 0 아래로 내려가면 피해가 회복이 된다. 장비를 아무리 겹쳐도
    // 넘지 못하는 바닥을 둔다.
    armor: Math.max(0.35, armorBase + (g.armor || 0)),
  };
}

// 레벨과 경험치. 캐릭터 레벨과 직업 레벨을 따로 두는 것은 둘이 오르는 이유가
// 다르기 때문이다 — 캐릭터 레벨은 전투를 치르면 오르고, 직업 레벨은 힐러 노릇을
// 얼마나 했는지로 오른다. 힐만 하다 전투가 끝나도 남는 것이 있어야 한다.
const LEVEL = {
  maxLevel: 30,
  charExpTo: (level) => Math.round(90 * Math.pow(level, 1.45)),
  // **상한이 20이라 곡선이 완만해야 한다.** 6에서 멈추던 때의 곡선(600 × 레벨^1.85)
  // 을 그대로 두면 10레벨에 백 판을 넘겨 상한이 있으나 마나였다. 지금은 자기
  // 레벨의 의뢰를 이어서 깰 때 6레벨이 여섯 판, 12레벨이 서른세 판, 20레벨이
  // 예순여덟 판이다 — 캐릭터 30이 여든세 판이므로 **직업 만렙이 조금 먼저 온다.**
  //
  // 초반이 빠른 것은 상한이 6이 아니기 때문이다. 그때는 여섯 판이 곧 만렙이라
  // 고민할 시간이 사라졌지만, 지금 6레벨은 스킬 넷을 겨우 배운 자리다.
  jobExpTo: (level) => Math.round(220 * Math.pow(level, 1.35)),

  // 체력·마나·공격력·회복량은 이제 능력치(ATTRS)가 정한다. 레벨은 능력치를
  // 올리고, 능력치가 수치를 만든다.

  // 힐 경험치. 흘린 힐은 세지 않는다 — 마나를 아껴 쓸 이유를 경험치가 무너뜨리면
  // 안 된다. 실제로 채운 만큼만 쌓인다.
  healExp: (healed) => Math.round(healed / 9),

  // 동료의 경험치 곡선. 주인공보다 완만한 것은 동료가 여럿이라 하나하나
  // 챙겨 키우는 것이 아니라 명부 전체가 천천히 자라야 하기 때문이다.
  allyExpTo: (level) => Math.round(80 * Math.pow(level, 1.4)),

  // 데려가지 않은 동료도 자란다 — 다른 파티에서 일했다는 뜻이다. 데려간 쪽보다
  // 덜 자라야 편성을 고르는 것이 손해가 되지 않는다.
  idleExpRate: [0.15, 0.45],
};

// 장비가 올려 주는 것들. 주인공과 동료가 같은 표를 쓴다 — 직업 우선 분배로 간
// 방패가 실제로 탱커를 단단하게 만들어야 그 분배 규칙이 뜻을 가진다.
//
// heal과 atk가 따로 있는 것은 회복량 배수를 공격에 얹지 않기 위해서다. 힐러의
// 성장이 딜러 노릇을 잘하게 만드는 쪽으로 흐르면 이 게임이 아니게 된다.
// 아이템 옵션으로 보이는 수치의 이름과 적는 법.
//
// **최대 체력·최대 마나라고 적는다.** 능력치에도 '체력'이 있어서(그쪽은 최대
// 체력을 만드는 능력치다) 그냥 '체력'이라고 적으면 한 물건에 '체력 +5'와
// '체력 +72'가 나란히 붙어 무엇이 무엇인지 알 수 없다.
const STATS = {
  str:   { id: 'str',   name: '힘',        fmt: (v) => `+${Math.round(v)}` },
  agi:   { id: 'agi',   name: '민첩',      fmt: (v) => `+${Math.round(v)}` },
  int:   { id: 'int',   name: '지능',      fmt: (v) => `+${Math.round(v)}` },
  vit:   { id: 'vit',   name: '체력',      fmt: (v) => `+${Math.round(v)}` },
  hp:    { id: 'hp',    name: '최대 체력', fmt: (v) => `+${Math.round(v)}` },
  mp:    { id: 'mp',    name: '최대 마나', fmt: (v) => `+${Math.round(v)}` },
  atk:   { id: 'atk',   name: '공격력',    fmt: (v) => `+${Math.round(v * 100)}%` },
  heal:  { id: 'heal',  name: '회복력',    fmt: (v) => `+${Math.round(v * 100)}%` },
  // 받는 피해는 계수라 낮을수록 좋다. 부호를 뒤집어 적어야 읽는 사람이 헷갈리지 않는다.
  armor: { id: 'armor', name: '받는 피해', fmt: (v) => `${Math.round(v * 100)}%` },
  // 치명타와 회피는 예전에 능력치에서만 왔다. 장비에도 붙게 하면서 여기 들어왔다 —
  // 확률로 붙는 것이라 모든 물건에 있지는 않고, 그래서 잘 나온 물건이 갈린다.
  crit:  { id: 'crit',  name: '치명타 확률', fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  critDamage: { id: 'critDamage', name: '치명타 피해', fmt: (v) => `+${Math.round(v * 100)}%` },
  dodge: { id: 'dodge', name: '회피',        fmt: (v) => `+${(v * 100).toFixed(1)}%` },
};

// 낮을수록 좋은 스탯. 견주기와 상점의 "더 나은가" 판정이 이걸 봐야 한다.
const LOWER_IS_BETTER = new Set(['armor']);

// 장비. 슬롯 셋뿐이고 아이템마다 등급(tier)이 붙는다. 등급별로 이름을 따로
// 적어 두면 자료가 몇 배로 길어지므로, 정의 하나에 배수를 곱해 쓴다.
// 아이템 등급 여섯. **색이 곧 등급이다** — 이름만으로는 목록에서 훑어지지 않는다.
// 실제 색은 `style.css`가 `css` 이름으로 정한다. 밝은 테마와 어두운 테마에서
// 읽히는 색이 달라야 하는데, 그것은 화면 쪽 사정이라 여기에 두지 않는다.
const TIERS = [
  { id: 'common',   name: '일반',  css: 'common' },
  { id: 'uncommon', name: '고급',  css: 'uncommon' },
  { id: 'rare',     name: '희귀',  css: 'rare' },
  { id: 'epic',     name: '영웅',  css: 'epic' },
  { id: 'legend',   name: '전설',  css: 'legend' },
  { id: 'myth',     name: '신화',  css: 'myth' },
];

const tierName = (tier) => (TIERS[tier] || TIERS[0]).name;

// **상점은 희귀까지만 판다.** 그 위는 적에게서만 나온다 — 골드로 살 수 있으면
// 의뢰를 깰 이유가 상점 값을 모으는 것으로 바뀐다.
const SHOP_MAX_TIER = 2;

// 등급이 기본 옵션에 곱하는 배수. 등급 하나가 눈에 띄게 세야 색을 보는 뜻이 산다.
const TIER_POWER = [1, 1.6, 2.2, 2.9, 3.7, 4.6];

// 등급이 오르면 붙는 무작위 옵션 수. **가장 낮은 등급에도 하나는 붙는다** —
// 옵션이 없는 물건은 같은 등급이면 전부 같은 물건이라 들여다볼 이유가 없다.
const AFFIX_COUNT = [1, 1, 2, 2, 3, 4];

// **등급마다 옵션 값의 하한과 상한이 있다**(기준값의 배수). 구간이 서로 겹치지
// 않으므로 "등급이 높으면 옵션이 좋다"가 예외 없이 성립한다 — 겹쳐 두었더니
// 잘 나온 고급이 못 나온 희귀보다 나은 일이 생겼고, 그러면 색을 보는 뜻이 없다.
// 구간 안에서는 무작위라 같은 등급에서도 "이건 잘 나왔다"가 남는다.
const AFFIX_RANGE = [
  [0.60, 0.90],   // 일반
  [0.95, 1.30],   // 고급
  [1.35, 1.80],   // 희귀
  [1.85, 2.50],   // 영웅
  [2.55, 3.40],   // 전설
  [3.45, 4.50],   // 신화
];

// 무작위 옵션의 기준값. 직업에 어울리는 스탯 위주로 붙어야 탱커 방패에 회복력이
// 붙는 일이 생기지 않는다.
// **능력치도 옵션으로 붙는다.** 능력치가 오르면 거기서 나오는 수치가 함께 오르므로
// (체력 하나가 최대 체력을, 지능 하나가 최대 마나와 회복량을 같이 올린다) 값이
// 작아도 무게가 있다. 최대 체력 옵션 하나와 엇비슷해지도록 잡았다 —
// 체력 1 = 최대 체력 14이므로 2.4면 33~34쯤이다.
//
// **한 번 통째로 1.4배 올렸다.** 그전에는 희귀 한 자리를 끼워도 캐릭터 창의
// 숫자가 거의 그대로라, 장비를 바꾸는 것이 화면에서 아무 일도 아니었다.
// 올린 만큼은 적을 세게 만들어 되돌렸다(아래 난이도 절).
const AFFIX_BASE = {
  str: 3, agi: 3, int: 2.4, vit: 2.4,
  hp: 20, mp: 10, atk: 0.07, heal: 0.055, armor: -0.028,
  crit: 0.028, critDamage: 0.085, dodge: 0.021,
};

// 능력치 옵션은 정수로 붙는다. 화면에 '체력 +2'라고 적어 놓고 속으로 1.7을
// 쓰면 캐릭터 창의 합이 안 맞는다.
const WHOLE_AFFIX = new Set(Object.keys(ATTRS));
// 뽑기 표. 같은 스탯을 여러 번 적어 무게를 준다 — **직업에 어울리는 쪽이 자주
// 붙어야** 탱커 방패에 회복력이 붙는 일이 생기지 않는다.
//
// 표마다 **서로 다른 스탯이 넷 이상 있어야 한다.** 신화가 직업 옵션 넷을
// 요구하는데(AFFIX_COUNT) 표에 셋뿐이면 하나가 모자란 채로 나온다.
const AFFIX_POOL = {
  tank: ['hp', 'armor', 'hp', 'mp', 'atk', 'vit', 'vit', 'str', 'agi'],
  dealer: ['atk', 'hp', 'atk', 'mp', 'armor', 'str', 'str', 'agi', 'int'],
  healer: ['heal', 'mp', 'heal', 'hp', 'armor', 'int', 'int', 'vit', 'agi'],
  none: ['hp', 'mp', 'atk', 'armor', 'vit', 'int', 'str', 'agi'],
};
// 직업 옵션 위에 **확률로** 하나 더 붙는 자리. 치명타와 회피는 직업을 가리지
// 않으므로 직업 표에 섞으면 탱커 방패에서 회복력을 밀어내는 일이 생긴다.
//
// 예전에는 이 셋이 능력치에서만 왔다. 장비에 붙이면 그것만 쌓는 것이 최선이
// 될까 봐 막아 두었는데, 상한(dodgeCap·critCap·critDamageCap)이 능력치든
// 장비든 똑같이 걸리므로 무한히 쌓이지는 않는다.
const SPECIAL_POOL = ['crit', 'critDamage', 'dodge'];
const SPECIAL_CHANCE = 0.35;

const SLOTS = {
  weapon: { id: 'weapon', name: '무기' },
  armor: { id: 'armor', name: '방어구' },
  trinket: { id: 'trinket', name: '장신구' },
};

// job은 분배에서 우선권을 가르는 데만 쓴다(기획서 16.2). 주인공은 어떤 것이든
// 장착할 수 있다 — 힐러 물건이 아니면 회복력이 안 붙을 뿐이다.
const GEAR = {
  staff:   { id: 'staff',   name: '치유의 지팡이', slot: 'weapon',  job: 'healer', icon: 'staff',
             stats: { heal: 0.10, mp: 14 } },
  rod:     { id: 'rod',     name: '불꽃의 지팡이', slot: 'weapon',  job: 'dealer', icon: 'rod',
             stats: { mp: 20 } },
  dagger:  { id: 'dagger',  name: '예리한 단검',   slot: 'weapon',  job: 'dealer', icon: 'dagger',
             stats: { hp: 20 } },
  bow:     { id: 'bow',     name: '사냥꾼의 활',   slot: 'weapon',  job: 'dealer', icon: 'bow',
             stats: { hp: 15, mp: 8 } },
  robe:    { id: 'robe',    name: '사제의 로브',   slot: 'armor',   job: 'healer', icon: 'robe',
             stats: { hp: 45, mp: 12, heal: 0.04 } },
  mail:    { id: 'mail',    name: '사슬 갑옷',     slot: 'armor',   job: 'tank',   icon: 'mail',
             stats: { hp: 80, armor: -0.05 } },
  shield:  { id: 'shield',  name: '참나무 방패',   slot: 'armor',   job: 'tank',   icon: 'shield',
             stats: { hp: 55, armor: -0.07 } },
  helm:    { id: 'helm',    name: '오크 투구',     slot: 'armor',   job: 'tank',   icon: 'helm',
             stats: { hp: 65, armor: -0.03 } },
  charm:   { id: 'charm',   name: '성자의 부적',   slot: 'trinket', job: 'healer', icon: 'charm',
             stats: { heal: 0.07, mp: 10 } },
  chalice: { id: 'chalice', name: '치유의 성배',   slot: 'trinket', job: 'healer', icon: 'chalice',
             stats: { mp: 26, heal: 0.03 } },
  crystal: { id: 'crystal', name: '마나 결정',     slot: 'trinket', job: null,     icon: 'crystal',
             stats: { mp: 22 } },
  band:    { id: 'band',    name: '수호의 팔찌',   slot: 'trinket', job: 'tank',   icon: 'band',
             stats: { hp: 40, armor: -0.03 } },
};

// 장비가 아닌 전리품. 팔아서 골드가 되는 것뿐이라 슬롯이 없다. 이런 것이 섞여
// 있어야 분배에서 "직업 무관" 규칙이 실제로 쓰인다.
const MATERIALS = {
  fang: { id: 'fang', name: '고블린 이빨', job: null, icon: 'fang', gold: 18 },
  pelt: { id: 'pelt', name: '거친 가죽',   job: null, icon: 'pelt', gold: 26 },
  ore:  { id: 'ore',  name: '녹슨 광석',   job: null, icon: 'ore', gold: 34 },
};

// 주인공. 자동 공격이 없다 — 기획서에서 플레이어가 직접 쓰는 것은 힐러의
// 스킬뿐이고, 그 외 행동은 언급되지 않았다. 이동도 마찬가지라 제자리에 선다.
const HERO = {
  id: 'hero',
  name: '주인공',
  job: 'healer',
  race: 'human',
  sprite: 'hero',
  growth: 'hero',
  // 능력치가 곧 수치다: 체력 42 → 최대 체력 588, 지능 25 → 최대 마나 200.
  //
  // 동료 힐러(사제 노아, 체력 40)보다 조금 단단하다. 적 딜러가 힐러를 먼저
  // 노리는 규칙이 들어온 뒤로 주인공이 늘 표적이 되는데, 주인공이 쓰러지면
  // 그대로 패배라 여기서 밀리면 전투가 아니라 사고가 된다.
  // 레벨이 오르면 자동으로 조금 오르고, 그 위에 나눠 주는 점수가 얹힌다.
  attrs: { str: 8, agi: 10, int: 25, vit: 42 },
  attackType: 'magic',
  hp: 588, mp: 200,
  // 주인공도 움직인다. 스킬에 사거리가 생긴 이상 제자리에 서 있으면 앞줄에
  // 힐이 닿지 않는다. 다만 조작하는 것은 여전히 스킬뿐이고, 이동은 다른
  // 힐러와 같은 규칙으로 저절로 된다.
  //
  // **마나가 없으면 기본 공격을 한다.** 모든 직업에 걸리는 규칙이고 주인공도
  // 예외가 아니다 — 마나가 바닥난 힐러가 남은 전투 내내 구경만 하는 것이
  // 동료에게 문제였다면 조작하는 쪽에서는 더 문제다. 여전히 손으로 하는 것은
  // 스킬뿐이고, 기본 공격은 사거리 안에 적이 있으면 저절로 나간다.
  //
  // **일부러 약하게 잡았다.** 손을 놓아도 이기면 이 게임이 성립하지 않는데,
  // 주인공의 공격이 딜러 몫을 하면 그쪽으로 기운다. 이것은 "가만히 서 있지
  // 않는다"까지고, 판을 가르는 것은 여전히 힐이다.
  atk: 14, attackCd: 2.6, range: 30, speed: 15,
  armor: 0.9,
  // 스킬 목록은 비어 있다. 주인공이 쓰는 것은 PLAYER_SKILLS에서 직접 고른
  // 다섯이고, 계열은 화면에 적기 위해서만 들고 있다.
  spec: 'priest', skills: [],
};

// 동료. 같은 직업이 여럿 있는 것은 의도한 것이다 — 파티는 직업 중복을 허용한다.
//
// **skills의 순서가 곧 AI의 우선순위다**(ai.js는 앞에서부터 조건이 맞는 것을 고른다).
// 광역 도발과 대치유술을 앞에 둔 것은 조건이 까다로운 쪽을 먼저 보게 하려는 것이다 —
// 조건이 안 맞으면 그대로 다음 것으로 넘어간다.
//
// **모든 스킬이 마나를 먹는다.** 근접 직업까지 마나를 쓰게 한 것은, 마나가 없으면
// 기본 공격만 남는 상태가 모든 직업에 똑같이 오게 하기 위해서다. 그래야 직업별
// 물약 구성(JOB_POTIONS)이 전투 중에 뜻을 가진다.
const COMPANIONS = {
  bran:  { id: 'bran', race: 'dwarf',  name: '강철의 브란', job: 'tank',   sprite: 'tank',
           hp: 1162, mp: 72,  atk: 26, attackCd: 1.6, range: 7,  speed: 17,
           attrs: { str: 20, agi: 8, int: 11, vit: 66 },
           armor: 0.55, spec: 'tank',
           note: '공격이 매워 어그로를 잘 붙든다' },
  corin: { id: 'corin', race: 'human', name: '방패병 코린', job: 'tank',   sprite: 'tank',
           hp: 1316, mp: 80,  atk: 21, attackCd: 1.8, range: 7,  speed: 15,
           attrs: { str: 16, agi: 6, int: 10, vit: 94 },
           armor: 0.48, spec: 'tank',
           note: '더 단단하지만 더 느리다' },
  lyle:  { id: 'lyle', race: 'human',  name: '검사 라일',   job: 'dealer', sprite: 'warrior',
           hp: 644, mp: 80,  atk: 46, attackCd: 1.2, range: 7,  speed: 21,
           attrs: { str: 35, agi: 14, int: 10, vit: 46 },
           armor: 0.82, spec: 'warrior',
           note: '근접. 강타로 한 번에 크게 넣는다' },
  sera:  { id: 'sera', race: 'elf',  name: '도적 세라',   job: 'dealer', sprite: 'rogue',
           hp: 560, mp: 112,  atk: 38, attackCd: 0.9, range: 7,  speed: 24,
           attrs: { str: 29, agi: 22, int: 11, vit: 47 },
           armor: 0.86, spec: 'rogue',
           note: '근접. 빠르게 여러 번 때린다' },
  mira:  { id: 'mira', race: 'elf',  name: '궁수 미라',   job: 'dealer', sprite: 'archer',
           hp: 518, mp: 128, atk: 42, attackCd: 1.4, range: 34, speed: 17,
           attrs: { str: 32, agi: 18, int: 13, vit: 44 },
           armor: 0.9, spec: 'archer',
           note: '원거리. 화살비로 적 여럿을 친다' },
  yuri:  { id: 'yuri', race: 'human',  name: '마법사 유리', job: 'dealer', sprite: 'mage',
           hp: 476, mp: 112, atk: 52, attackCd: 1.9, range: 36, speed: 15,
           attrs: { str: 14, agi: 12, int: 14, vit: 34 }, attackType: 'magic',
           armor: 0.92, spec: 'mage',
           note: '원거리. 느리지만 한 방이 무겁다' },
  noa:   { id: 'noa', race: 'human',   name: '사제 노아',   job: 'healer', sprite: 'priest',
           hp: 560, mp: 104, atk: 18, attackCd: 2.0, range: 30, speed: 16,
           attrs: { str: 12, agi: 10, int: 13, vit: 40 }, attackType: 'magic',
           armor: 0.9, spec: 'priest',
           note: '마나가 많아 오래 버틴다' },
  dean:  { id: 'dean', race: 'dwarf',  name: '수도사 딘',   job: 'healer', sprite: 'priest',
           hp: 616, mp: 72,  atk: 24, attackCd: 1.7, range: 26, speed: 18,
           attrs: { str: 14, agi: 12, int: 11, vit: 35 }, attackType: 'magic',
           armor: 0.86, spec: 'priest',
           note: '힐량이 작은 대신 때리기도 한다' },
  // 음유시인은 딜러로 둔다. 힐러로 두면 편성이 "힐러 둘"이 되어 적 딜러의
  // 힐러 우선 규칙이 이쪽으로 몰리는데, 이 계열이 하는 일은 살리는 것이 아니라
  // 남을 계속 쓰게 하는 것이다.
  finn:  { id: 'finn', race: 'human',  name: '음유시인 핀', job: 'healer', sprite: 'bard',
           hp: 490, mp: 160, atk: 36, attackCd: 1.6, range: 32, speed: 18,
           attrs: { str: 13, agi: 16, int: 20, vit: 35 }, attackType: 'magic',
           armor: 0.9, spec: 'bard',
           note: '원거리. 아군을 강화하고 적을 약화시킨다' },
  elin:  { id: 'elin', race: 'elf',  name: '악사 엘린',   job: 'healer', sprite: 'bard',
           hp: 406, mp: 168, atk: 40, attackCd: 1.5, range: 32, speed: 20,
           attrs: { str: 12, agi: 21, int: 17, vit: 34 }, attackType: 'magic',
           armor: 0.92, spec: 'bard',
           note: '원거리. 강화는 덜하고 회복을 더 한다' },
};

// 동료와 적이 쓰는 스킬. 플레이어 스킬(PLAYER_SKILLS)과 표를 나눈 이유는
// 등록 화면에 섞여 나오면 안 되기 때문이다 — 전투에 등록하는 것은 주인공 것뿐이다.
//
// **spec(계열)마다 제 스킬을 가진다.** 탱커·딜러·힐러는 전투에서 하는 일(역할)이고,
// 전사·도적·궁수·마법사는 그 일을 어떤 손으로 하는가다. 궁수와 마법사가 같은
// 스킬을 쓰던 때에는 둘을 고르는 것이 그림 고르기였다.
//
// minLevel은 그 스킬이 열리는 레벨이다. 목록이 넷보다 길고 앞에서부터 넷만
// 들고 가므로(UNIT_SKILL_MAX), 레벨이 오르면 들고 가는 넷 자체가 바뀐다 —
// 편성 화면에서 누구를 데려갈지 고르는 이유가 여기서 나온다.
//
// range는 사거리, cast는 시전 시간(초)이다. cast가 0이면 즉시 시전이고, 그렇지
// 않으면 그 시간 동안 서서 외운다 — **움직이면 취소된다.**
const UNIT_SKILLS = {
  // --- 탱커 ---
  // 광역 도발. 탱커 하나로는 여러 적의 어그로를 다 잡을 수 없어 후방이 무너지는데,
  // 이 스킬이 그것을 푼다. 대신 쿨타임이 길어 아무 때나 쓸 수는 없다.
  roar:   { id: 'roar', icon: 'roar', name: '전투 함성', spec: 'tank', cd: 14, mp: 26, kind: 'taunt-area',
            duration: 8, range: 34, cast: 0, radius: 34, minLevel: 3,
            desc: '주변 적 전부의 어그로를 한 번에 가져온다' },
  sweep:  { id: 'sweep', icon: 'sweep', name: '휩쓸기', spec: 'tank', cd: 10, mp: 20, kind: 'damage-area',
            mul: 1.3, radius: 13, range: 9, cast: 0, minLevel: 5,
            desc: '주변 적 여럿을 한 번에 친다' },
  slam:   { id: 'slam', icon: 'slam', name: '내려찍기', spec: 'tank', cd: 9, mp: 18, kind: 'damage',
            mul: 3.0, range: 9, cast: 1.0, minLevel: 4,
            desc: '방패를 들어 올렸다 내려찍는다' },
  // 쿨타임이 지속 시간보다 짧다. 이것이 탱커가 하나를 계속 붙들 수 있는 근거다 —
  // 위협도 표를 없앤 뒤로 어그로를 유지하는 수단이 도발뿐이라, 끊기면 그 순간
  // 적이 곧장 후열로 간다.
  taunt:  { id: 'taunt', icon: 'taunt', name: '도발', spec: 'tank', cd: 5, mp: 10, kind: 'taunt',
            duration: 6, range: 30, cast: 0, minLevel: 1, core: 1,
            desc: '적 하나의 어그로를 가져온다' },
  crush:  { id: 'crush', icon: 'crush', name: '짓밟기', spec: 'tank', cd: 8, mp: 12, kind: 'dot',
            tick: 13, interval: 1, duration: 6, range: 9, cast: 0, minLevel: 2,
            desc: '밟아 뭉갠 자리가 계속 아프다' },
  bash:   { id: 'bash', icon: 'bash', name: '방패 강타', spec: 'tank', cd: 6, mp: 12, kind: 'damage',
            mul: 1.9, range: 9, cast: 0, minLevel: 1,
            desc: '방패로 밀어붙인다' },
  // 기절. 근접 세 계열(수호·전사·도적)만 갖는다 — 붙어 있어야 넣을 수 있는 것이
  // 기절이고, 멀리서 거는 수단까지 있으면 후열이 아무것도 못 하는 판이 나온다.
  // **남의 자리를 옮기는 유일한 스킬이다**(`knock`). 대열은 서로 밀리지 않으므로,
  // 적을 물러나게 하려면 이렇게 적어 둔 스킬이 있어야 한다. 굳혀 두지 않으면
  // 밀어 놓자마자 걸어 돌아와 민 표가 나지 않아, 기절과 한 몸으로 둔다.
  shieldSlam: { id: 'shieldSlam', icon: 'shieldSlam', name: '방패 밀치기', spec: 'tank', cd: 16, mp: 22,
            kind: 'stun', duration: 2.0, knock: 8, range: 9, cast: 0, minLevel: 4,
            desc: '방패로 밀쳐 내고 잠시 못 움직이게 한다' },
  quake:  { id: 'quake', icon: 'quake', name: '발구르기', spec: 'tank', cd: 15, mp: 24, kind: 'damage-area',
            mul: 1.1, radius: 20, range: 9, cast: 0.8, minLevel: 7,
            desc: '땅을 굴러 주변을 흔든다' },
  // **탱커에게도 마나를 되찾을 길을 준다.** 없던 동안 탱커는 전투 시간의 절반을
  // 마나 0으로 보냈고, 그동안 도발이 나가지 않아 후열이 그대로 뚫렸다.
  secondWind: { id: 'secondWind', icon: 'secondWind', name: '재정비', spec: 'tank', cd: 28, mp: 0,
            kind: 'mana', mana: 40, range: 0, cast: 2.0, minLevel: 2, core: 1,
            desc: '숨을 고르며 마나를 되찾는다' },
  thorns: { id: 'thorns', icon: 'thorns', name: '가시 방패', spec: 'tank', cd: 11, mp: 16, kind: 'dot',
            tick: 15, interval: 1, duration: 6, range: 9, cast: 0, minLevel: 6,
            desc: '부딪칠 때마다 상처가 벌어진다' },

  // --- 전사 ---
  whirl:  { id: 'whirl', icon: 'whirl', name: '회전 베기', spec: 'warrior', cd: 11, mp: 24, kind: 'damage-area',
            mul: 1.6, radius: 12, range: 8, cast: 0, minLevel: 3,
            desc: '몸을 돌려 붙어 있는 적을 모두 벤다' },
  execute:{ id: 'execute', icon: 'execute', name: '마무리', spec: 'warrior', cd: 13, mp: 22, kind: 'damage',
            mul: 4.2, range: 8, cast: 1.2, minLevel: 6,
            desc: '크게 준비해 한 방을 꽂는다' },
  rend:   { id: 'rend', icon: 'rend', name: '가르기', spec: 'warrior', cd: 9, mp: 14, kind: 'dot',
            tick: 16, interval: 1, duration: 6, range: 8, cast: 0, minLevel: 2,
            desc: '상처를 남겨 계속 피가 흐르게 한다' },
  // 사거리가 다른 근접기. 붙기 전에 한 번 넣을 수 있어 전사가 먼저 들이닥친다.
  charge: { id: 'charge', icon: 'charge', name: '돌진', spec: 'warrior', cd: 12, mp: 16, kind: 'damage',
            mul: 2.4, range: 18, cast: 0, minLevel: 4,
            desc: '거리를 좁히며 부딪친다' },
  cleave: { id: 'cleave', icon: 'cleave', name: '강타', spec: 'warrior', cd: 7, mp: 16, kind: 'damage',
            mul: 2.6, range: 8, cast: 0, minLevel: 1,
            desc: '한 번에 크게 넣는다' },
  overpower: { id: 'overpower', icon: 'overpower', name: '힘으로 누르기', spec: 'warrior', cd: 4, mp: 8,
            kind: 'damage', mul: 1.4, range: 8, cast: 0, minLevel: 1,
            desc: '싸게 계속 때린다' },
  stagger: { id: 'stagger', icon: 'stagger', name: '어깨치기', spec: 'warrior', cd: 15, mp: 20, kind: 'stun',
            duration: 1.8, range: 8, cast: 0, minLevel: 3,
            desc: '어깨로 들이받아 잠시 멈춰 세운다' },
  // **보조 탱커의 두 손이 여기다.** 딜이 본업이라 목록 앞은 때리는 것이고,
  // 도발과 굳히기는 그 뒤에 온다 — 탱커가 놓친 것을 받아 주는 자리다.
  challenge: { id: 'challenge', icon: 'challenge', name: '도전', spec: 'warrior', cd: 8, mp: 14,
            kind: 'taunt', duration: 5, range: 12, cast: 0, minLevel: 4,
            desc: '적 하나를 자기 쪽으로 끌어온다' },
  bracing: { id: 'bracing', icon: 'bracing', name: '굳히기', spec: 'warrior', cd: 20, mp: 16,
            kind: 'buff', stat: 'armor', mul: 0.8, duration: 10, range: 0, cast: 0, minLevel: 5,
            desc: '버티는 자세로 받는 피해를 줄인다' },
  sunder: { id: 'sunder', icon: 'sunder', name: '방어 부수기', spec: 'warrior', cd: 14, mp: 16,
            kind: 'debuff', stat: 'armor', mul: 1.22, duration: 10, range: 8, cast: 0, minLevel: 5,
            desc: '갑옷 틈을 벌려 받는 피해를 늘린다' },
  breather: { id: 'breather', icon: 'breather', name: '숨 고르기', spec: 'warrior', cd: 30, mp: 0, kind: 'mana',
            mana: 36, range: 0, cast: 2.0, minLevel: 4, core: 1,
            desc: '자기 마나를 되찾는다' },

  // --- 도적 ---
  // 전사와 같은 자리에서 싸우지만 한 방이 아니라 잦음과 독으로 넣는다. 역할이
  // 같아도 손에 잡히는 감각이 달라야 둘 중 누구를 데려갈지가 고민이 된다.
  smoke:  { id: 'smoke', icon: 'smoke', name: '연막', spec: 'rogue', cd: 16, mp: 18, kind: 'damage-area',
            mul: 1.1, radius: 14, range: 12, cast: 0, minLevel: 6,
            desc: '연기를 터뜨려 주변을 흔든다' },
  backstab:{ id: 'backstab', icon: 'backstab', name: '등 찌르기', spec: 'rogue', cd: 12, mp: 20, kind: 'damage',
            mul: 3.6, range: 8, cast: 0.8, minLevel: 5,
            desc: '빈틈을 노려 깊게 찌른다' },
  flurry: { id: 'flurry', icon: 'flurry', name: '연격', spec: 'rogue', cd: 10, mp: 20, kind: 'damage',
            mul: 3.0, range: 8, cast: 0.6, minLevel: 3,
            desc: '몰아친다' },
  venom:  { id: 'venom', icon: 'venom', name: '독칼', spec: 'rogue', cd: 8, mp: 16, kind: 'dot',
            tick: 20, interval: 1, duration: 6, range: 8, cast: 0, minLevel: 2,
            desc: '칼에 독을 발라 오래 깎는다' },
  stab:   { id: 'stab', icon: 'stab', name: '기습', spec: 'rogue', cd: 4, mp: 10, kind: 'damage',
            mul: 1.8, range: 8, cast: 0, minLevel: 1,
            desc: '짧은 쿨타임으로 계속 찌른다' },
  kidney: { id: 'kidney', icon: 'kidney', name: '급소 치기', spec: 'rogue', cd: 14, mp: 18, kind: 'stun',
            duration: 1.6, range: 8, cast: 0, minLevel: 4,
            desc: '급소를 쳐 숨을 막는다' },
  ambush: { id: 'ambush', icon: 'ambush', name: '매복', spec: 'rogue', cd: 14, mp: 22, kind: 'damage',
            mul: 3.9, range: 8, cast: 1.0, minLevel: 7,
            desc: '숨을 죽였다가 한 번에 꽂는다' },
  caltrops: { id: 'caltrops', icon: 'caltrops', name: '마름쇠', spec: 'rogue', cd: 18, mp: 20, kind: 'zone',
            tick: 12, interval: 1, duration: 8, radius: 14, range: 12, cast: 0, minLevel: 6,
            desc: '바닥에 뿌려 밟는 적을 계속 깎는다' },
  catchBreath: { id: 'catchBreath', icon: 'catchBreath', name: '숨 죽이기', spec: 'rogue', cd: 28, mp: 0,
            kind: 'mana', mana: 34, range: 0, cast: 1.8, minLevel: 3, core: 1,
            desc: '자기 마나를 되찾는다' },
  quickCut:{ id: 'quickCut', icon: 'quickCut', name: '속공', spec: 'rogue', cd: 2.5, mp: 6, kind: 'damage',
            mul: 1.1, range: 8, cast: 0, minLevel: 1,
            desc: '거의 쉬지 않고 벤다' },

  // --- 궁수 ---
  volley: { id: 'volley', icon: 'volley', name: '화살비', spec: 'archer', cd: 9, mp: 26, kind: 'damage-area',
            mul: 1.2, radius: 15, range: 34, cast: 1.2, minLevel: 3,
            desc: '겹쳐 있는 적 여럿을 친다' },
  pierce: { id: 'pierce', icon: 'pierce', name: '관통 사격', spec: 'archer', cd: 11, mp: 20, kind: 'damage',
            mul: 3.7, range: 40, cast: 1.6, minLevel: 5,
            desc: '멀리서 꿰뚫는다. 오래 겨눠야 한다' },
  poisonCloud: { id: 'poisonCloud', icon: 'poisonCloud', name: '독 구름', spec: 'archer', cd: 18, mp: 24,
            kind: 'zone', tick: 12, interval: 1, duration: 7, radius: 14, range: 34,
            cast: 1.4, minLevel: 6, desc: '남아 있는 독 구름을 쏘아 올린다' },
  barbed: { id: 'barbed', icon: 'barbed', name: '갈고리 화살', spec: 'archer', cd: 8, mp: 14, kind: 'dot',
            tick: 15, interval: 1, duration: 6, range: 34, cast: 0, minLevel: 2,
            desc: '박힌 채로 남아 계속 깎는다' },
  aimed:  { id: 'aimed', icon: 'aimed', name: '조준 사격', spec: 'archer', cd: 6, mp: 14, kind: 'damage',
            mul: 2.5, range: 34, cast: 1.0, minLevel: 1,
            desc: '한 발을 겨눠 크게 넣는다' },
  snipe:  { id: 'snipe', icon: 'snipe', name: '저격', spec: 'archer', cd: 14, mp: 22, kind: 'damage',
            mul: 3.9, range: 44, cast: 1.6, minLevel: 7,
            desc: '멀리서 한 발에 크게 넣는다' },
  arrowStorm: { id: 'arrowStorm', icon: 'arrowStorm', name: '화살 폭풍', spec: 'archer', cd: 20, mp: 28,
            kind: 'zone', tick: 11, interval: 1, duration: 7, radius: 16, range: 36, cast: 1.2, minLevel: 8,
            desc: '한 자리에 화살을 계속 퍼붓는다' },
  cripple: { id: 'cripple', icon: 'cripple', name: '발목 쏘기', spec: 'archer', cd: 9, mp: 12, kind: 'dot',
            tick: 13, interval: 1, duration: 6, range: 34, cast: 0, minLevel: 4,
            desc: '발목을 꿰어 계속 피가 흐르게 한다' },
  steadyBreath: { id: 'steadyBreath', icon: 'steadyBreath', name: '활 고르기', spec: 'archer', cd: 28, mp: 0,
            kind: 'mana', mana: 34, range: 0, cast: 1.8, minLevel: 2, core: 1,
            desc: '자기 마나를 되찾는다' },
  quickShot: { id: 'quickShot', icon: 'quickShot', name: '속사', spec: 'archer', cd: 3, mp: 8, kind: 'damage',
            mul: 1.4, range: 34, cast: 0, minLevel: 1,
            desc: '겨누지 않고 빠르게 쏜다' },

  // --- 마법사 ---
  // 마나 순환이 있어 마법사는 물약 없이도 한 번은 되살아난다. 마나를 다 쓴
  // 시전자가 남은 전투 내내 서 있는 것을 막는 것이 이 스킬의 목적이다.
  frost:  { id: 'frost', icon: 'frost', name: '서리 폭발', spec: 'mage', cd: 10, mp: 26, kind: 'damage-area',
            mul: 2.1, radius: 16, range: 36, cast: 1.4, minLevel: 3,
            desc: '터뜨려 여럿을 얼린다' },
  inferno:{ id: 'inferno', icon: 'inferno', name: '불바다', spec: 'mage', cd: 20, mp: 30, kind: 'zone',
            tick: 22, interval: 1, duration: 7, radius: 15, range: 36, cast: 1.8,
            minLevel: 5, desc: '바닥을 태워 그 자리에 남긴다' },
  ember:  { id: 'ember', icon: 'ember', name: '불씨', spec: 'mage', cd: 9, mp: 16, kind: 'dot',
            tick: 18, interval: 1, duration: 6, range: 36, cast: 0.8, minLevel: 2,
            desc: '불이 옮겨붙어 계속 탄다' },
  channel:{ id: 'channel', icon: 'channel', name: '마나 순환', spec: 'mage', cd: 26, mp: 0, kind: 'mana',
            mana: 60, range: 0, cast: 2.0, minLevel: 1, core: 1,
            desc: '자기 마나를 되찾는다' },
  bolt:   { id: 'bolt', icon: 'bolt', name: '화염구', spec: 'mage', cd: 5, mp: 14, kind: 'damage',
            mul: 1.7, range: 36, cast: 1.0, minLevel: 1,
            desc: '불덩이를 던진다' },
  blizzard: { id: 'blizzard', icon: 'blizzard', name: '눈보라', spec: 'mage', cd: 22, mp: 30, kind: 'zone',
            tick: 20, interval: 1, duration: 7, radius: 18, range: 36, cast: 1.6, minLevel: 8,
            desc: '한 자리에 눈보라를 묶어 둔다' },
  arcane: { id: 'arcane', icon: 'arcane', name: '비전 폭발', spec: 'mage', cd: 12, mp: 26, kind: 'damage',
            mul: 2.9, range: 36, cast: 1.8, minLevel: 6,
            desc: '모아 두었다가 한 번에 터뜨린다' },
  flare:  { id: 'flare', icon: 'flare', name: '섬광', spec: 'mage', cd: 9, mp: 20, kind: 'damage-area',
            mul: 1.5, radius: 14, range: 36, cast: 0.8, minLevel: 4,
            desc: '터뜨려 주변을 함께 태운다' },
  chill:  { id: 'chill', icon: 'chill', name: '서리 손길', spec: 'mage', cd: 8, mp: 14, kind: 'dot',
            tick: 14, interval: 1, duration: 6, range: 36, cast: 0, minLevel: 3,
            desc: '얼어붙은 자리가 계속 아프다' },
  spark:  { id: 'spark', icon: 'spark', name: '불티', spec: 'mage', cd: 2.8, mp: 7, kind: 'damage',
            mul: 0.85, range: 36, cast: 0, minLevel: 1,
            desc: '싸게 계속 흘려보낸다' },

  // --- 사제 ---
  // 동료 힐러는 보조다. 물약까지 들고 나면서 주인공이 손을 놓아도 파티가 버티기
  // 시작했고, 그러면 이 게임이 성립하지 않는다 — 힐량과 마나를 함께 줄였다.
  wave:   { id: 'wave', icon: 'wave', name: '치유의 물결', spec: 'priest', cd: 12, mp: 34, kind: 'heal-area',
            heal: 90, radius: 18, range: 30, cast: 2.0, minLevel: 4,
            desc: '기준점 주변 아군을 한 번에 회복시킨다' },
  greaterMend: { id: 'greaterMend', icon: 'greaterMend', name: '대치유술', spec: 'priest', cd: 6, mp: 40,
            kind: 'heal', heal: 290, range: 30, cast: 2.5, minLevel: 5,
            desc: '크게 회복시킨다. 마나를 많이 먹는다' },
  renew:  { id: 'renew', icon: 'renew', name: '재생', spec: 'priest', cd: 10, mp: 20, kind: 'heal-dot',
            tick: 22, interval: 1, duration: 7, range: 30, cast: 0, minLevel: 2,
            desc: '천천히 오래 채운다' },
  mend:   { id: 'mend', icon: 'mend', name: '치유술', spec: 'priest', cd: 3.0, mp: 24, kind: 'heal',
            heal: 145, range: 30, cast: 1.5, minLevel: 1, core: 1,
            desc: '탱커 체력을 본다' },
  meditate:{ id: 'meditate', icon: 'meditate', name: '명상', spec: 'priest', cd: 30, mp: 0, kind: 'mana',
            mana: 50, range: 0, cast: 2.2, minLevel: 1, core: 1,
            desc: '자기 마나를 되찾는다' },
  blessing: { id: 'blessing', icon: 'blessing', name: '축복', spec: 'priest', cd: 14, mp: 28, kind: 'heal-dot',
            tick: 30, interval: 1, duration: 8, range: 30, cast: 0, minLevel: 6,
            desc: '오래 크게 채운다' },
  purify: { id: 'purify', icon: 'purify', name: '정화', spec: 'priest', cd: 8, mp: 30, kind: 'heal',
            heal: 190, range: 30, cast: 1.8, minLevel: 3,
            desc: '치유술과 대치유술 사이' },
  judgement: { id: 'judgement', icon: 'judgement', name: '신벌', spec: 'priest', cd: 12, mp: 24,
            kind: 'damage-area', mul: 1.3, radius: 16, range: 30, cast: 1.2, minLevel: 5,
            desc: '빛을 내려 여럿을 친다' },
  chastise: { id: 'chastise', icon: 'chastise', name: '응징', spec: 'priest', cd: 9, mp: 14, kind: 'dot',
            tick: 15, interval: 1, duration: 6, range: 30, cast: 0, minLevel: 2,
            desc: '지워지지 않는 낙인을 남긴다' },
  smite:  { id: 'smite', icon: 'smite', name: '심판', spec: 'priest', cd: 7, mp: 12, kind: 'damage',
            mul: 1.6, range: 30, cast: 1.0, minLevel: 1,
            desc: '힐할 곳이 없으면 때린다' },

  // --- 음유시인 ---
  // **아군의 마나를 채우는 유일한 계열.** 자기 마나만 채우는 것(kind 'mana')과
  // 달라서 종류를 둘 더 두었다 — 'mana-ally'는 하나에게, 'mana-area'는 기준점
  // 주변 아군 모두에게 준다.
  //
  // 주는 마나가 제 마나값보다 크다. 남의 마나를 대신 내주는 것이 아니라 노래로
  // 채운다는 뜻이고, 이것이 아니면 파티 전체의 마나 총량이 늘지 않아 이 계열을
  // 넣은 뜻이 사라진다. 대신 쿨타임으로 막는다.
  // 여럿에게 한 번에 건다. 강화·약화가 이 계열의 본업이라 목록 앞이 전부
  // 노래고, 회복은 그 뒤에 온다.
  anthem: { id: 'anthem', icon: 'anthem', name: '전투가', spec: 'bard', cd: 26, mp: 24,
            kind: 'buff-area', stat: 'atk', mul: 1.28, duration: 14, radius: 22,
            range: 30, cast: 1.8, minLevel: 6,
            desc: '주변 아군의 공격이 매서워진다' },
  dissonance: { id: 'dissonance', icon: 'dissonance', name: '불협화음', spec: 'bard', cd: 22, mp: 26,
            kind: 'debuff-area', stat: 'atk', mul: 0.74, duration: 12, radius: 16,
            range: 32, cast: 1.6, minLevel: 5,
            desc: '귀를 찢는 소리에 적의 손이 무뎌진다' },
  harmony: { id: 'harmony', icon: 'harmony', name: '화성', spec: 'bard', cd: 16, mp: 18,
            kind: 'buff', stat: 'armor', mul: 0.78, duration: 12, range: 30, cast: 1.2,
            minLevel: 3, core: 1,
            desc: '아군 하나가 받는 피해를 줄인다' },
  lament: { id: 'lament', icon: 'lament', name: '만가', spec: 'bard', cd: 14, mp: 16,
            kind: 'debuff', stat: 'armor', mul: 1.3, duration: 12, range: 32, cast: 1.0,
            minLevel: 2,
            desc: '적 하나가 받는 피해를 늘린다' },
  // 자기 마나가 마르면 노래도 못 부른다. 계열의 정체가 걸린 자리라 늘 들고 간다.
  tune:   { id: 'tune', icon: 'tune', name: '조율', spec: 'bard', cd: 26, mp: 0, kind: 'mana',
            mana: 40, range: 0, cast: 1.8, minLevel: 2, core: 1,
            desc: '자기 마나를 되찾는다' },
  // 파티 전체의 마나 총량이 느는 유일한 수단이라, 강화·약화로 중심을 옮긴 뒤에도
  // 남겨 두었다. 마나가 마른 탱커와 힐러를 밖에서 도울 수 있는 것이 이것뿐이다.
  refrain:{ id: 'refrain', icon: 'refrain', name: '후렴', spec: 'bard', cd: 12, mp: 8, kind: 'mana-ally',
            mana: 60, range: 30, cast: 1.0, minLevel: 1,
            desc: '아군 하나의 마나를 채운다' },
  echo:   { id: 'echo', icon: 'echo', name: '메아리', spec: 'bard', cd: 24, mp: 12, kind: 'mana-area',
            mana: 46, radius: 22, range: 30, cast: 1.8, minLevel: 7,
            desc: '주변 아군 모두의 마나를 채운다' },
  // --- 여기부터가 보조 힐. 사제보다 회복량이 작고 종류도 적다 ---
  serenade: { id: 'serenade', icon: 'serenade', name: '자장가', spec: 'bard', cd: 14, mp: 18, kind: 'heal-dot',
            tick: 15, interval: 1, duration: 7, range: 30, cast: 0, minLevel: 2,
            desc: '천천히 아물게 한다' },
  chord:  { id: 'chord', icon: 'chord', name: '화음', spec: 'bard', cd: 5, mp: 14, kind: 'heal',
            heal: 74, range: 30, cast: 0.9, minLevel: 1,
            desc: '음을 겹쳐 아물게 한다' },
  finale: { id: 'finale', icon: 'finale', name: '종막', spec: 'bard', cd: 14, mp: 24, kind: 'damage',
            mul: 3.2, range: 32, cast: 1.6, minLevel: 8,
            desc: '길게 끌었다가 한 번에 끝낸다' },

  // --- 우두머리 (적) ---
  // **우두머리만 장판을 깐다.** 정예가 광역기를 하나씩 갖게 되면서 우두머리가
  // "정예와 같은 것을 더 세게"뿐이었는데, 그러면 등급이 수치 차이로만 남는다.
  // 발밑에 남아 계속 타는 것이라 후열이 자리를 옮겨야 하고, 그때 대열이 흐트러진다.
  rupture: { id: 'rupture', icon: 'rupture', name: '대지 가르기', spec: 'chieftain', cd: 16, mp: 30,
            kind: 'zone', tick: 26, interval: 1, duration: 8, radius: 18, range: 30,
            cast: 1.4, minLevel: 1,
            desc: '땅을 갈라 그 자리를 계속 태운다' },

  // --- 잡졸 (적) ---
  // 고블린에게 도적의 기술을 그대로 주었더니 등 찌르기·연격을 쓰는 잡졸이 되어,
  // 무리로 몰려오는 상대가 아니라 하나하나가 위험한 상대가 됐다. 계열을 따로
  // 두는 것이 "약한 여럿"이라는 자리를 지키는 방법이다.
  pounce: { id: 'pounce', icon: 'pounce', name: '덮치기', spec: 'grunt', cd: 7, mp: 12, kind: 'damage',
            mul: 1.9, range: 8, cast: 0, minLevel: 1,
            desc: '몸으로 부딪친다' },
  gash:   { id: 'gash', icon: 'gash', name: '할퀴기', spec: 'grunt', cd: 9, mp: 12, kind: 'dot',
            tick: 11, interval: 1, duration: 5, range: 8, cast: 0, minLevel: 3,
            desc: '할퀸 자리가 계속 쓰라리다' },
  jab:    { id: 'jab', icon: 'jab', name: '찌르기', spec: 'grunt', cd: 5, mp: 8, kind: 'damage',
            mul: 1.3, range: 8, cast: 0, minLevel: 1,
            desc: '짧게 찌른다' },

  // --- 주술사 (적) ---
  // 적 주술사의 것. 아군 사제와 표를 나눈 이유는 편성 화면에 섞여 나오면 안 되기
  // 때문이다 — 데려갈 수 없는 스킬이 목록에 있으면 고르는 자리가 흐려진다.
  // 파티 전체를 한 번에 때리는 유일한 적 스킬이다. 반경과 배수를 넉넉히 잡았더니
  // 뭉쳐 선 파티가 쓸릴 때마다 힐이 따라가지 못했다 — 아군에게는 흩어지는 규칙이
  // 없으므로 이 스킬만 세면 그냥 못 막는 피해가 된다.
  curse:  { id: 'curse', icon: 'curse', name: '역병', spec: 'shaman', cd: 18, mp: 28, kind: 'damage-area',
            mul: 1.0, radius: 12, range: 30, cast: 1.6, minLevel: 3,
            desc: '퍼뜨려 여럿을 앓게 한다' },
  mendEnemy: { id: 'mendEnemy', icon: 'mendEnemy', name: '주술 치유', spec: 'shaman', cd: 4.5, mp: 20,
            kind: 'heal', heal: 140, range: 30, cast: 1.5, minLevel: 1,
            desc: '같은 편을 회복시킨다' },
  hex:    { id: 'hex', icon: 'hex', name: '저주', spec: 'shaman', cd: 8, mp: 18, kind: 'dot',
            tick: 14, interval: 1, duration: 5, range: 30, cast: 1.0, minLevel: 1,
            desc: '지속 피해' },
  drain:  { id: 'drain', icon: 'drain', name: '마력 흡수', spec: 'shaman', cd: 24, mp: 0, kind: 'mana',
            mana: 55, range: 0, cast: 2.0, minLevel: 1, core: 1,
            desc: '자기 마나를 되찾는다' },
  spirit: { id: 'spirit', icon: 'spirit', name: '정령 화살', spec: 'shaman', cd: 5, mp: 12, kind: 'damage',
            mul: 1.7, range: 30, cast: 1.0, minLevel: 1,
            desc: '정령을 날려 보낸다' },
};

// 스킬이 하는 일. **아이콘이 "어떤 스킬인가"를, 색이 "무엇을 하는가"를 알린다.**
// 둘 중 하나만으로는 서른 몇 개를 훑을 수 없다 — 아이콘만 있으면 처음 보는
// 스킬이 공격인지 회복인지 알 수 없고, 색만 있으면 같은 색이 대여섯씩 겹친다.
//
// 실제 색은 style.css가 정한다. 밝은 테마와 어두운 테마에서 읽히는 색이 다른데
// 그것은 화면 쪽 사정이다.
const SKILL_KINDS = {
  'damage':      { name: '공격', css: 'harm' },
  'damage-area': { name: '광역 공격', css: 'harm' },
  'dot':         { name: '지속 피해', css: 'bane' },
  'zone':        { name: '장판', css: 'bane' },
  'heal':        { name: '회복', css: 'mend' },
  'heal-area':   { name: '광역 회복', css: 'mend' },
  'heal-dot':    { name: '지속 회복', css: 'mend' },
  'taunt':       { name: '도발', css: 'pull' },
  'taunt-area':  { name: '광역 도발', css: 'pull' },
  'mana':        { name: '마나 회복', css: 'mana' },
  'mana-ally':   { name: '마나 나눔', css: 'mana' },
  'mana-area':   { name: '광역 마나', css: 'mana' },
  'stun':        { name: '기절', css: 'stun' },
  'buff':        { name: '강화', css: 'boon' },
  'buff-area':   { name: '광역 강화', css: 'boon' },
  'debuff':      { name: '약화', css: 'wilt' },
  'debuff-area': { name: '광역 약화', css: 'wilt' },
};

// 강화와 약화가 건드리는 수치. **곱으로만 걸린다** — 더하기로 두면 같은 스킬이
// 낮은 레벨에서는 판을 뒤집고 높은 레벨에서는 아무것도 아니게 된다.
//
// 셋뿐인 것은 이것들이 이미 화면에 있는 수치이기 때문이다. 새 수치를 만들면
// 캐릭터 창에 없는 것이 전투에서만 움직인다.
const AURA_STATS = {
  atk:   '공격력',
  armor: '받는 피해',
  heal:  '회복량',
};

const skillKind = (def) => SKILL_KINDS[def && def.kind] || SKILL_KINDS.damage;

// 계열의 이름. 화면에 "딜러 · 궁수"처럼 역할과 함께 적는다 — 역할만 적으면
// 궁수와 마법사가 같은 줄로 보이고, 계열만 적으면 누가 앞에 서는지 알 수 없다.
const SPECS = {
  tank:    '수호자',
  warrior: '전사',
  rogue:   '도적',
  archer:  '궁수',
  mage:    '마법사',
  priest:  '사제',
  shaman:  '주술사',
  bard:    '음유시인',
  // 상위 계열. 레벨이 오르면 여기로 올라간다(SPEC_UP).
  bulwark:   '철벽',
  berserker: '광전사',
  assassin:  '암살자',
  marksman:  '명궁',
  archmage:  '대마법사',
  grunt:   '잡졸',
  chieftain: '우두머리',
};

// **한 유닛이 전투에 들고 들어가는 스킬 수.** 계열의 목록 중 레벨이 되는 것을
// 앞에서부터 이만큼 자른다. 전부 들고 가게 하면 스킬을 늘린 것이 그냥 "더 세짐"이
// 되고, 레벨이 올라 새 스킬이 열려도 달라지는 것이 없다.
// --- 상위 계열 전용 --------------------------------------------------------
//
// **동료도 레벨이 오르면 계열이 한 번 올라간다**(`SPEC_UP`). 여기 있는 열 개는
// 그때 열리는 것이고, 아래 계열의 목록을 그대로 물려받은 위에 얹힌다 — 목록을
// 통째로 새로 짜면 같은 캐릭터가 레벨 하나에 전혀 다른 사람이 된다.
//
// **둘씩만 둔다.** 넷 중 둘이 바뀌는 것으로 충분하고(`UNIT_SKILL_MAX`), 그보다
// 많으면 상위 계열의 스킬끼리 자리를 다투느라 아래 계열의 정체가 밀려난다.
const UPPER_SKILLS = {
  // 철벽. 하나는 파티를, 하나는 자기를 지킨다 — 수호자에게 없던 방향이다.
  aegis:  { id: 'aegis', icon: 'aegis', name: '수호의 장막', spec: 'bulwark', cd: 26, mp: 34,
            kind: 'buff-area', stat: 'armor', mul: 0.8, duration: 10, radius: 20, range: 20, cast: 0.8,
            minLevel: 12, core: 1,
            desc: '주변 아군이 받는 피해를 함께 줄인다' },
  ironWall: { id: 'ironWall', icon: 'ironWall', name: '강철 벽', spec: 'bulwark', cd: 30, mp: 22,
            kind: 'buff', stat: 'armor', mul: 0.55, duration: 8, range: 0, cast: 0, minLevel: 12,
            desc: '한동안 거의 뚫리지 않는다' },

  // 광전사. 자기를 세게 만들고 한 번에 여럿을 벤다.
  frenzy: { id: 'frenzy', icon: 'frenzy', name: '광란', spec: 'berserker', cd: 26, mp: 20,
            kind: 'buff', stat: 'atk', mul: 1.35, duration: 10, range: 0, cast: 0, minLevel: 12, core: 1,
            desc: '제 공격력을 크게 올린다' },
  massacre: { id: 'massacre', icon: 'massacre', name: '학살', spec: 'berserker', cd: 16, mp: 30,
            kind: 'damage-area', mul: 2.2, radius: 13, range: 9, cast: 0.6, minLevel: 12,
            desc: '주변 적을 한 번에 크게 벤다' },

  // 암살자. 한 명을 끝내고, 끝내는 동안 맞지 않는다.
  assassinate: { id: 'assassinate', icon: 'assassinate', name: '암살', spec: 'assassin', cd: 20, mp: 32,
            kind: 'damage', mul: 5.2, range: 7, cast: 0, minLevel: 12, core: 1,
            desc: '급소를 찔러 한 번에 크게 넣는다' },
  vanish: { id: 'vanish', icon: 'vanish', name: '자취 감추기', spec: 'assassin', cd: 26, mp: 18,
            kind: 'buff', stat: 'armor', mul: 0.62, duration: 6, range: 0, cast: 0, minLevel: 12,
            desc: '잠시 모습을 감춰 받는 피해를 줄인다' },

  // 명궁. 한 발이 더 세고, 표식이 파티 전체의 딜을 키운다.
  deadeye: { id: 'deadeye', icon: 'deadeye', name: '필중', spec: 'marksman', cd: 18, mp: 30,
            kind: 'damage', mul: 4.8, range: 46, cast: 1.6, minLevel: 12, core: 1,
            desc: '겨눈 하나에게 한 발을 크게 넣는다' },
  huntersMark: { id: 'huntersMark', icon: 'huntersMark', name: '사냥 표식', spec: 'marksman', cd: 20, mp: 22,
            kind: 'debuff', stat: 'armor', mul: 1.3, duration: 12, range: 40, cast: 0.8, minLevel: 12,
            desc: '표식을 남겨 그 적이 받는 피해를 늘린다' },

  // 대마법사. 한 방과 장판 둘 다 마법사의 것보다 크다.
  meteor: { id: 'meteor', icon: 'meteor', name: '운석', spec: 'archmage', cd: 24, mp: 40,
            kind: 'damage-area', mul: 2.6, radius: 18, range: 40, cast: 2.0, minLevel: 12, core: 1,
            desc: '하늘에서 돌덩이를 떨어뜨린다' },
  maelstrom: { id: 'maelstrom', icon: 'maelstrom', name: '소용돌이', spec: 'archmage', cd: 26, mp: 36,
            kind: 'zone', tick: 30, interval: 1, duration: 8, radius: 16, range: 36, cast: 1.4,
            minLevel: 12,
            desc: '한 자리를 계속 휘몰아친다' },
};

Object.assign(UNIT_SKILLS, UPPER_SKILLS);

// **상위 계열은 아래 계열이 레벨로 올라간 것이다**(`specAt`). 목록도 그렇게 만든다 —
// 아래 것을 그대로 물려받고 전용 둘을 **앞에** 얹는다. 앞에 두는 것은 `SPEC_SKILLS`의
// 순서가 곧 AI의 우선순위이자 넷을 고르는 순서라, 뒤에 두면 상위 계열이 되어도
// 들고 오는 넷이 그대로일 수 있기 때문이다.
//
// **그림은 아래 계열의 것을 그대로 쓴다.** 계열마다 그림이 하나씩이라는 규칙의
// 예외처럼 보이지만, 이쪽은 다른 종류가 아니라 **같은 사람이 더 강해진 것**이다 —
// 명부의 같은 이름이 이어서 자란 결과라, 그림이 바뀌면 다른 동료로 보인다.
const SPEC_UP = {
  tank:    { spec: 'bulwark',   skills: ['aegis', 'ironWall'] },
  warrior: { spec: 'berserker', skills: ['frenzy', 'massacre'] },
  rogue:   { spec: 'assassin',  skills: ['assassinate', 'vanish'] },
  archer:  { spec: 'marksman',  skills: ['deadeye', 'huntersMark'] },
  mage:    { spec: 'archmage',  skills: ['meteor', 'maelstrom'] },
};

// **동료도 계열을 바꾼다.** 역할(`job`)은 그대로 두고 계열만 바꾸는 것이라,
// "역할은 전투에서 하는 일, 계열은 그 일을 어떤 손으로 하는가"라는 두 겹 구조를
// 그대로 쓴다 — 탱커가 마법사가 되면 편성 화면이 보장하는 "탱커 하나, 힐러 하나"가
// 뜻을 잃는다. 탱커가 전사를 고를 수 있는 것은 전사가 도발과 굳히기를 들고 있어
// 역할을 바꾸지 않고도 손이 달라지기 때문이다.
const SPEC_CHOICES = {
  tank: ['tank', 'warrior'],
  dealer: ['warrior', 'rogue', 'archer', 'mage'],
  healer: ['priest', 'bard'],
};

// 바꿀 수 있게 되는 레벨. 1레벨부터 바꿀 수 있으면 명부를 받자마자 전부 갈아
// 끼우게 되어, 처음 뽑힌 계열이 아무 뜻도 없어진다.
const SPEC_CHANGE_LEVEL = 5;

// 그 계열이 쓰는 그림. **상위 계열은 아래 계열의 그림을 그대로 쓴다**(같은 사람이
// 강해진 것이라). 계열을 바꾸는 것은 다르다 — 궁수가 마법사가 되면 손에 든 것이
// 바뀌므로 그림도 따라간다.
function spriteFor(spec) {
  for (const [base, up] of Object.entries(SPEC_UP)) {
    if (up.spec === spec) return base;
  }
  return spec;
}

// 상위 계열로 올라가는 레벨. **난이도 검사가 도는 구간(1~10레벨)보다 위에 둔다** —
// 그 아래에 두면 자동 힐러로 재 둔 승률이 통째로 흔들린다.
const SPEC_UP_LEVEL = 12;


// 그 레벨에서 실제로 무슨 계열인가. **정의(`def.spec`)를 직접 보는 자리를 남기지
// 않는다** — 한 곳만 잊어도 편성 화면에 적힌 계열과 전투에서 쓰는 스킬이 갈린다.
const specAt = (spec, level) =>
  (level >= SPEC_UP_LEVEL && SPEC_UP[spec] ? SPEC_UP[spec].spec : spec);

const UNIT_SKILL_MAX = 4;

// 계열별 스킬 목록. **순서가 곧 AI의 우선순위이자 들고 가는 넷을 고르는 순서다.**
// 조건이 까다롭고 강한 쪽(광역기·마무리·대치유술)을 앞에 두었으므로, 레벨이 올라
// 앞쪽이 열리면 뒤쪽의 싸구려 스킬이 목록에서 밀려난다.
const SPEC_SKILLS = {
  // 탱커는 도발이 때리는 것보다 앞이다. 순서를 뒤집어 두었더니 후열이 뚫린
  // 순간에도 휩쓸기가 먼저 나갔다 — 어그로를 끄는 것이 이 직업의 첫 일이다.
  tank:    ['roar', 'taunt', 'secondWind', 'shieldSlam', 'quake', 'sweep', 'slam', 'thorns', 'crush', 'bash'],
  // **전사는 딜이 본업이고 탱은 보조다.** 그래서 도발이 때리는 것보다 뒤에
  // 온다 — 수호자와 정반대다. 앞의 둘이 쿨타임일 때 도발과 굳히기가 나오므로,
  // 탱커가 놓친 적을 받아 주면서도 딜이 멈추지 않는다.
  warrior: ['execute', 'whirl', 'breather', 'challenge', 'bracing', 'sunder', 'stagger', 'rend', 'cleave', 'overpower'],
  rogue:   ['smoke', 'backstab', 'catchBreath', 'kidney', 'ambush', 'caltrops', 'flurry', 'venom', 'stab', 'quickCut'],
  // **궁수는 단일이 본업이고 광역이 보조, 마법사는 그 반대다.** 순서만 뒤집은
  // 것이 아니라 수치도 갈라 두었다 — 궁수의 한 발이 마법사의 한 발보다 세고,
  // 마법사의 장판이 궁수의 장판보다 세다. 순서만 바꾸면 둘 다 "아무거나 잘 쏘는
  // 원거리"로 남는다.
  archer:  ['snipe', 'pierce', 'steadyBreath', 'volley', 'arrowStorm', 'cripple', 'barbed', 'poisonCloud', 'aimed', 'quickShot'],
  // 마나 회복 스킬(마나 순환·명상·마력 흡수)을 앞쪽에 두고 1레벨부터 열어 둔다.
  // 뒤에 두었더니 레벨이 오르면서 강한 스킬에 밀려 나갔고, 마나를 다 쓴 시전자가
  // 남은 전투 내내 기본 공격만 하는 상태가 레벨이 오를수록 잦아졌다.
  //
  // **비인간형은 물약을 못 마시므로 이것이 유일한 길이다.** 고블린 주술사에게
  // 마력 흡수가 2레벨부터였을 때에는, 1레벨 주술사가 마나를 다 쓰고 나면 남은
  // 전투 내내 아무것도 못 했다.
  mage:    ['blizzard', 'frost', 'channel', 'arcane', 'inferno', 'flare', 'ember', 'chill', 'bolt', 'spark'],
  priest:  ['wave', 'greaterMend', 'meditate', 'blessing', 'purify', 'judgement', 'mend', 'renew', 'chastise', 'smite'],
  shaman:  ['curse', 'mendEnemy', 'drain', 'hex', 'spirit'],
  // 음유시인은 **아군의 마나를 채우는 유일한 계열이다.** 마나 회복 스킬은 지금까지
  // 전부 자기 것만 채웠고(마나 순환·명상·마력 흡수), 그래서 마나가 마른 탱커와
  // 힐러를 밖에서 도울 방법이 없었다. 광역이 단일보다 앞인 것은 쿨타임이 길어서다.
  // **음유시인은 강화·약화가 본업이고 회복이 보조다.** 목록 앞이 전부 노래고,
  // 회복은 마나 나눔 뒤에 온다 — 사제와 같은 힐러 역할이지만 하는 일이 다르다.
  // 회복량도 사제보다 작게 잡았다: 여기서 같은 값을 주면 "노래도 부르는 사제"가
  // 되어 둘 중 하나를 고를 이유가 사라진다.
  bard:    ['anthem', 'dissonance', 'harmony', 'lament', 'tune', 'echo', 'refrain', 'serenade', 'chord', 'finale'],
  grunt:   ['gash', 'pounce', 'jab'],
  // 우두머리 전용. 새 스킬을 만들지 않고 수호와 전사의 무거운 것만 골라 묶었다 —
  // 이 계열이 하는 일은 "이미 있는 것 중 가장 아픈 것"이지 새로운 수단이 아니다.
  chieftain: ['rupture', 'sweep', 'roar', 'slam', 'crush', 'bash'],
};

// 그 유닛이 이 레벨에서 전투에 들고 가는 스킬. 편성 화면과 전투가 같은 것을
// 보여야 하므로 한 곳에서만 계산한다.
// 이름을 씨앗으로 바꾼다. **이름이 곧 신원이라** 같은 동료는 언제 봐도 같은 넷을
// 들고 오고, 저장본에 스킬 목록을 적어 두지 않아도 된다.
function skillSeed(text) {
  let h = 2166136261;
  const str = String(text || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 그 캐릭터가 이 스킬을 얼마나 좋아하는가(0~1). 씨앗과 스킬 이름을 섞어 만든다 —
// **레벨이 올라 목록이 길어져도 이미 정해진 취향은 변하지 않는다.** 섞은 목록을
// 잘라 쓰면 새 스킬이 열릴 때마다 순서가 통째로 달라져, 5레벨에 들던 넷이
// 6레벨에 아무 이유 없이 전부 바뀐다.
function taste(seed, id) {
  let a = (seed ^ skillSeed(id)) >>> 0;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

// 그 유닛이 이 레벨에서 전투에 들고 가는 스킬. 편성 화면과 전투가 같은 것을
// 보여야 하므로 한 곳에서만 계산한다.
//
// 상위 계열의 목록은 아래 계열이 정해진 뒤에 만든다 — 클래식 스크립트라 선언
// 순서가 곧 의존이다.
for (const [base, up] of Object.entries(SPEC_UP)) {
  SPEC_SKILLS[up.spec] = up.skills.concat(SPEC_SKILLS[base]);
}

// **씨앗을 주면 캐릭터마다 다른 넷을 든다.** 같은 계열이면 누구나 같은 넷을 들던
// 때에는 사제 둘을 나란히 놓아도 다를 것이 없었다. 다만 계열의 정체가 걸린
// 스킬(`core`: 탱커의 도발, 마나를 되찾는 것, 사제의 치유술, 음유시인의 후렴)은
// 열려 있으면 늘 들어간다 — 도발 없는 탱커나 힐이 없는 사제는 그 계열이 아니다.
//
// 고른 뒤에는 목록 순서로 되돌린다. **`SPEC_SKILLS`의 순서가 곧 AI의 우선순위라**
// 뽑힌 순서대로 두면 싸구려 스킬이 광역기보다 먼저 나간다.
// always는 **그 유닛이 반드시 들고 오는 것**이다. `core`가 계열의 정체라면
// 이쪽은 그 개체의 정체다 — 등급이 무엇을 들고 오는가를 정하는 자리라, 같은
// 수호자 계열이라도 정예 오크만 휩쓸기를 확실히 들고 온다. 취향에 맡겨 두면
// "광역기를 든 정예"가 우연에 걸리고, 등급을 올린 뜻이 사라진다.
//
// **learned는 다른 계열에서 배워 온 것이다.** 계열을 바꿔도 손에 남으므로 지금
// 계열의 목록 뒤에 이어 붙인다. 뒤에 두는 것은 `SPEC_SKILLS`의 순서가 곧 AI의
// 우선순위이기 때문이다 — 빌려 온 기술이 제 계열의 정체보다 먼저 나가면, 계열을
// 바꾼 것이 아니라 스킬을 모으는 놀이가 된다.
function skillsFor(spec, level, seed, always, learned) {
  const list = SPEC_SKILLS[spec] || [];
  const extra = (learned || []).filter((id) => UNIT_SKILLS[id] && list.indexOf(id) < 0);
  const order = list.concat(extra);
  const open = order.filter((id) => level >= UNIT_SKILLS[id].minLevel);
  if (seed == null) return open.slice(0, UNIT_SKILL_MAX);

  const forced = (always || []).filter((id) => open.indexOf(id) >= 0);
  const core = open.filter((id) => UNIT_SKILLS[id].core && forced.indexOf(id) < 0);
  const rest = open.filter((id) => !UNIT_SKILLS[id].core && forced.indexOf(id) < 0)
    .sort((a, b) => taste(seed, a) - taste(seed, b));
  const picked = new Set(forced.concat(core, rest).slice(0, UNIT_SKILL_MAX));
  return order.filter((id) => picked.has(id));
}

// 기획서에 나온 다섯 유형을 모두 쓴다: 개별 대상 / 범위 / 장판 / 도트 / 마나 회복.
//
// **kind는 색을 정하는 데만 쓴다**(SKILL_KINDS). 무엇이 나가는지는 targeting과
// heal/tick/mana가 정한다 — 동료 스킬과 같은 잣대로 색을 입히려고 두었다.
//
// **쿨타임은 시전 시간만큼 덜어 두었다.** 시전의 대가는 그동안 서 있어야 한다는
// 것이지 힐을 덜 넣는 것이 아니다 — 둘을 겹쳐 물리면 캐스팅 스킬이 그냥 나쁜
// 스킬이 되고, 즉시 시전만 고르게 된다.
//
// range는 사거리, cast는 시전 시간(초)이다. cast가 0이면 즉시 시전이고, 그렇지
// 않으면 그 시간 동안 서서 외운다 — **움직이면 취소된다.**
//
// unlock은 이 스킬이 열리는 직업 레벨이다. 처음부터 여덟 개를 다 주면 등록 화면이
// 고르는 자리가 아니라 외우는 자리가 된다.
// targeting은 전투 화면이 무엇을 받아야 하는지다.
//   ally/enemy — 대상 하나
//   area-ally/area-enemy — 동료 초상화 또는 전투 화면의 위치 (기획서 8장)
//   self — 대상 선택 없이 즉시
//
// 적힌 수치는 **스킬 레벨 1의 값**이다. 직업 레벨이 오르면 받는 점수로 스킬
// 레벨을 올리고, 그때 효과와 소비 마나가 함께 오른다(SKILL, skillAt). desc에
// 숫자를 적지 않는 것은 그 때문이다 — 숫자는 skillEffect가 레벨에서 만든다.
// **같은 기술을 두 표에 따로 적지 않는다.** 동료의 후렴과 주인공의 후렴은 같은
// 것인데 두 벌로 적혀 있었고, 그래서 갈렸다 — 정화가 동료는 190을 회복하고
// 주인공은 90을 회복했으며, 만가는 한쪽이 광역이고 다른 쪽이 단일이었고,
// `smite`는 아예 이름까지 달랐다(심판 / 성스러운 일격).
//
// **정체(이름·아이콘·종류)는 동료 표가 원본이고 여기서 물려받는다.** 수치는
// 여전히 따로 잡는다 — 사람이 누르는 쪽은 쿨타임과 마나가 달라야 한다. 두 표에
// 남는 차이가 이제 "수치뿐"이라, 이름을 고치면 양쪽이 함께 바뀐다.
function shared(id, over) {
  const twin = UNIT_SKILLS[id];
  if (!twin) throw new Error(`동료 표에 없는 스킬: ${id}`);
  return Object.assign({ id, name: twin.name, icon: twin.icon, kind: twin.kind }, over);
}

const PLAYER_SKILLS = {
  touch: {
    id: 'touch', job: 'priest', unlock: 1, kind: 'heal', range: 40, cast: 1.0, name: '치유의 손길', type: '개별 대상', targeting: 'ally',
    mp: 14, cd: 1.4, heal: 130, icon: 'cross',
    desc: '동료 하나의 체력을 한 번에 크게 회복한다.',
  },
  quick: {
    id: 'quick', job: 'priest', unlock: 1, kind: 'heal', range: 36, cast: 0, name: '신속한 치유', type: '개별 대상', targeting: 'ally',
    mp: 9, cd: 1.2, heal: 62, icon: 'quickHeal',
    desc: '싸고 빠르지만 회복량이 작다.',
  },
  regen: {
    id: 'regen', job: 'priest', unlock: 2, kind: 'heal-dot', range: 40, cast: 1.0, name: '재생의 축복', type: '도트', targeting: 'ally',
    mp: 20, cd: 8, tick: 26, interval: 1, duration: 8, icon: 'regen',
    desc: '동료 하나에게 걸어 두면 시간을 두고 회복된다.',
  },
  ripple: {
    id: 'ripple', job: 'priest', unlock: 4, kind: 'heal-area', range: 44, cast: 1.5, name: '빛의 파문', type: '범위', targeting: 'area-ally',
    mp: 30, cd: 7.5, heal: 76, radius: 20, icon: 'ripple',
    desc: '기준점 주변의 아군을 한 번에 회복한다.',
  },
  sanctuary: {
    id: 'sanctuary', job: 'priest', unlock: 6, kind: 'heal-area', range: 48, cast: 2.0, name: '생명의 성역', type: '장판', targeting: 'area-ally',
    mp: 38, cd: 20, tick: 22, interval: 1, duration: 10, radius: 21, icon: 'sanctuary',
    desc: '바닥에 남는 장판. 안에 서 있는 아군이 계속 회복된다.',
  },
  focus: {
    id: 'focus', job: 'priest', unlock: 3, kind: 'mana', range: 0, cast: 2.0, name: '정신 집중', type: '마나 회복', targeting: 'self',
    mp: 0, cd: 28, mana: 70, icon: 'focus',
    desc: '서서 외워 자신의 마나를 되찾는다.',
  },

  // --- 음유시인 ---------------------------------------------------------
  //
  // **강화·약화가 본업이고 회복이 보조다.** 사제와 같은 값을 주면 "노래도 부르는
  // 사제"가 되어 둘 중 하나를 고를 이유가 사라진다 — 직접 회복은 사제보다 작고
  // (화음 84 대 치유의 손길 130), 대신 파티 전체의 공격력과 마나를 만진다.
  //
  // **이름과 아이콘은 동료 음유시인의 같은 기술에서 가져왔다.** 주인공의 후렴과
  // 동료의 후렴은 같은 것이라, 다른 그림을 주면 다른 기술로 보인다.
  chord: shared('chord', {
    job: 'bard', unlock: 1, range: 38, cast: 0.8, type: '개별 대상', targeting: 'ally',
    mp: 12, cd: 1.6, heal: 84,
    desc: '동료 하나를 회복한다. 사제의 손길보다 작다.',
  }),
  refrain: shared('refrain', {
    job: 'bard', unlock: 1, range: 36, cast: 0, type: '마나 나눔', targeting: 'ally',
    mp: 10, cd: 10, mana: 34,
    desc: '동료 하나의 마나를 채운다. 제 마나보다 많이 준다.',
  }),
  anthem: shared('anthem', {
    job: 'bard', unlock: 2, range: 30, cast: 1.2, type: '광역 강화', targeting: 'area-ally',
    mp: 26, cd: 24, stat: 'atk', mul: 1.18, duration: 12, radius: 26,
    desc: '기준점 주변 아군의 공격력을 올린다.',
  }),
  lament: shared('lament', {
    job: 'bard', unlock: 3, range: 42, cast: 1.0, type: '약화', targeting: 'enemy',
    mp: 18, cd: 14, stat: 'armor', mul: 1.16, duration: 10,
    desc: '적 하나가 받는 피해를 늘린다.',
  }),
  serenade: shared('serenade', {
    job: 'bard', unlock: 3, range: 38, cast: 0, type: '도트', targeting: 'ally',
    mp: 18, cd: 7, tick: 24, interval: 1, duration: 8,
    desc: '동료 하나에게 걸어 두면 시간을 두고 회복된다.',
  }),
  dissonance: shared('dissonance', {
    job: 'bard', unlock: 4, range: 40, cast: 1.4, type: '광역 약화', targeting: 'area-enemy',
    mp: 26, cd: 20, stat: 'atk', mul: 0.85, duration: 10, radius: 18,
    desc: '기준점 주변 적의 공격력을 함께 떨어뜨린다.',
  }),
  echo: shared('echo', {
    job: 'bard', unlock: 5, range: 30, cast: 1.6, type: '광역 마나', targeting: 'area-ally',
    mp: 16, cd: 26, mana: 26, radius: 22,
    desc: '기준점 주변 아군의 마나를 함께 채운다.',
  }),
  finale: shared('finale', {
    job: 'bard', unlock: 6, range: 40, cast: 1.2, type: '개별 대상', targeting: 'enemy',
    mp: 22, cd: 12, damage: 96,
    desc: '적 하나를 노래로 내리친다.',
  }),

  // --- 성기사 -----------------------------------------------------------
  //
  // **서브 탱커이자 서브 힐러다.** 앞에 서서 맞아 주고 신성한 것으로 때리며,
  // 회복은 급한 불만 끈다 — 회복량이 사제의 절반이고 사거리도 짧다. 대신 이
  // 계열만 **도발**을 들고 온다: 주인공이 직접 적을 끌어오는 것은 여기뿐이다.
  //
  // 근접 계열이라 사거리가 전부 짧다. 뒤에 서서 다 할 수 있으면 "앞에 선다"가
  // 수치에 없는 말이 된다.
  smite: shared('smite', {
    job: 'paladin', unlock: 1, range: 14, cast: 0, type: '개별 대상', targeting: 'enemy',
    mp: 14, cd: 3.5, damage: 110,
    desc: '붙어서 내리친다. 즉시 나가고 세지만 사거리가 짧다.',
  }),
  layHands: {
    id: 'layHands', job: 'paladin', unlock: 1, kind: 'heal', range: 30, cast: 0.6, name: '신성한 손길', type: '개별 대상', targeting: 'ally',
    mp: 14, cd: 2.2, heal: 64, icon: 'layHands',
    desc: '동료 하나를 조금 회복한다. 사제의 손길보다 훨씬 작다.',
  },
  taunt: shared('taunt', {
    job: 'paladin', unlock: 2, range: 28, cast: 0, type: '도발', targeting: 'enemy',
    mp: 16, cd: 9, duration: 6,
    desc: '적 하나를 자신에게 끌어온다. 주인공이 어그로를 옮기는 유일한 수단이다.',
  }),
  holyShield: {
    id: 'holyShield', job: 'paladin', unlock: 3, kind: 'buff', range: 26, cast: 0, name: '성스러운 방패', type: '강화', targeting: 'ally',
    mp: 20, cd: 18, stat: 'armor', mul: 0.84, duration: 12, icon: 'holyShield',
    desc: '동료 하나가 받는 피해를 줄인다. 자신에게도 걸 수 있다.',
  },
  oath: {
    id: 'oath', job: 'paladin', unlock: 3, kind: 'mana', range: 0, cast: 1.6, name: '서약', type: '마나 회복', targeting: 'self',
    mp: 0, cd: 26, mana: 66, icon: 'oath',
    desc: '무릎 꿇어 맹세하며 자신의 마나를 되찾는다.',
  },
  radiance: {
    id: 'radiance', job: 'paladin', unlock: 4, kind: 'heal-area', range: 32, cast: 1.2, name: '광휘', type: '범위', targeting: 'area-ally',
    mp: 26, cd: 9, heal: 48, radius: 18, icon: 'radiance',
    desc: '기준점 주변의 아군을 조금씩 회복한다.',
  },
  hammer: {
    id: 'hammer', job: 'paladin', unlock: 5, kind: 'damage-area', range: 24, cast: 1.0, name: '심판의 망치', type: '광역', targeting: 'area-enemy',
    mp: 28, cd: 12, damage: 84, radius: 16, icon: 'hammer',
    desc: '기준점 주변의 적을 한 번에 내리친다.',
  },
  devotion: {
    id: 'devotion', job: 'paladin', unlock: 6, kind: 'buff-area', range: 24, cast: 1.4, name: '헌신', type: '광역 강화', targeting: 'area-ally',
    mp: 30, cd: 24, stat: 'armor', mul: 0.9, duration: 10, radius: 20, icon: 'devotion',
    desc: '기준점 주변 아군이 받는 피해를 함께 줄인다.',
  },
  // **사제에게 있던 공격 둘을 여기로 옮겼다.** 사제는 회복만 하는 계열이고,
  // 때리는 것은 앞에 서는 성기사의 일이다 — 힐러 게임에서 "회복만 하는 계열"이
  // 하나도 없으면 회복이 본업이라는 말이 수치에 없는 말이 된다. 사거리도 성기사에
  // 맞춰 줄였다(40 → 26, 44 → 30).
  flame: {
    id: 'flame', job: 'paladin', unlock: 4, kind: 'dot', range: 26, cast: 1.0, name: '심판의 불꽃', type: '도트', targeting: 'enemy',
    mp: 16, cd: 9, tick: 22, interval: 1, duration: 6, icon: 'flame',
    desc: '적 하나를 태운다. 어그로를 끌 수 있다.',
  },
  pyre: {
    id: 'pyre', job: 'paladin', unlock: 6, kind: 'zone', range: 30, cast: 1.8, name: '성스러운 불길', type: '장판', targeting: 'area-enemy',
    mp: 34, cd: 18, tick: 26, interval: 1, duration: 8, radius: 18, icon: 'pyre',
    desc: '바닥에 남는 장판. 안에 선 적이 계속 탄다.',
  },

  // --- 주교 -------------------------------------------------------------
  //
  // **사제의 상위 계열이다.** 전직하려면 사제를 끝까지 키워야 하고(`need`),
  // 하나하나가 사제보다 세다. 대신 **최대 직업 레벨이 하나 낮아 점수를 덜 받고,
  // 마나를 훨씬 많이 먹는다** — 그냥 상위 호환이면 사제를 고를 이유가 사라진다.
  //
  // 이름과 아이콘은 동료 사제의 기술에서 가져왔다. 같은 전통의 더 높은 기술이라
  // 다른 그림을 주면 다른 계통으로 보인다.
  mend: shared('mend', {
    job: 'bishop', unlock: 1, range: 40, cast: 1.0, type: '개별 대상', targeting: 'ally',
    mp: 20, cd: 1.6, heal: 150,
    desc: '동료 하나를 크게 회복한다. 사제의 손길보다 세고 마나를 더 먹는다.',
  }),
  renew: shared('renew', {
    job: 'bishop', unlock: 2, range: 40, cast: 0.8, type: '도트', targeting: 'ally',
    mp: 26, cd: 8, tick: 32, interval: 1, duration: 8,
    desc: '동료 하나에게 걸어 두면 시간을 두고 회복된다.',
  }),
  wave: shared('wave', {
    job: 'bishop', unlock: 2, range: 46, cast: 1.6, type: '범위', targeting: 'area-ally',
    mp: 38, cd: 8, heal: 96, radius: 22,
    desc: '기준점 주변의 아군을 한 번에 크게 회복한다.',
  }),
  purify: shared('purify', {
    job: 'bishop', unlock: 3, range: 40, cast: 0.8, type: '개별 대상', targeting: 'ally',
    mp: 24, cd: 12, heal: 90, cleanse: 1,
    desc: '회복하면서 걸려 있는 약화를 걷어낸다. 이것만 할 수 있는 계열이다.',
  }),
  meditate: shared('meditate', {
    job: 'bishop', unlock: 3, range: 0, cast: 2.0, type: '마나 회복', targeting: 'self',
    mp: 0, cd: 26, mana: 92,
    desc: '서서 외워 자신의 마나를 되찾는다. 사제의 정신 집중보다 많이 채운다.',
  }),
  chastise: shared('chastise', {
    job: 'bishop', unlock: 4, range: 40, cast: 0.8, type: '도트', targeting: 'enemy',
    mp: 20, cd: 9, tick: 28, interval: 1, duration: 6,
    desc: '적 하나를 벌한다. 시간을 두고 깎인다.',
  }),
  greaterMend: shared('greaterMend', {
    job: 'bishop', unlock: 5, range: 40, cast: 2.2, type: '개별 대상', targeting: 'ally',
    mp: 48, cd: 6, heal: 280,
    desc: '오래 외워 한 명을 크게 되살린다. 마나를 많이 먹는다.',
  }),
  judgement: shared('judgement', {
    job: 'bishop', unlock: 5, range: 42, cast: 1.4, type: '광역', targeting: 'area-enemy',
    mp: 30, cd: 12, damage: 120, radius: 16,
    desc: '기준점 주변의 적에게 벌을 내린다.',
  }),

  // --- 성전사 (성기사의 상위) --------------------------------------------
  //
  // 앞에 서는 힘이 더 커진 쪽이다. **광역 도발과 기절이 여기서 처음 나온다** —
  // 성기사가 적 하나를 끌어오는 데 그쳤다면, 이쪽은 무리를 통째로 붙든다.
  // 이름과 아이콘은 수호자·전사 계열의 같은 기술에서 그대로 가져왔다.
  bracing: shared('bracing', {
    job: 'crusader', unlock: 1, range: 24, cast: 0, type: '강화', targeting: 'ally',
    mp: 22, cd: 18, stat: 'armor', mul: 0.78, duration: 12,
    desc: '받는 피해를 크게 줄인다. 성기사의 방패보다 세다.',
  }),
  charge: shared('charge', {
    job: 'crusader', unlock: 1, range: 30, cast: 0, type: '개별 대상', targeting: 'enemy',
    mp: 20, cd: 8, damage: 150,
    desc: '멀리서 달려들어 내리친다.',
  }),
  roar: shared('roar', {
    job: 'crusader', unlock: 2, range: 26, cast: 0, type: '광역 도발', targeting: 'area-enemy',
    mp: 26, cd: 16, duration: 7, radius: 26,
    desc: '기준점 주변의 적을 한꺼번에 자신에게 끌어온다.',
  }),
  secondWind: shared('secondWind', {
    job: 'crusader', unlock: 3, range: 0, cast: 1.6, type: '마나 회복', targeting: 'self',
    mp: 0, cd: 26, mana: 84,
    desc: '숨을 고르며 자신의 마나를 되찾는다.',
  }),
  blessing: shared('blessing', {
    job: 'crusader', unlock: 3, range: 32, cast: 0.8, type: '도트', targeting: 'ally',
    mp: 28, cd: 8, tick: 34, interval: 1, duration: 8,
    desc: '동료 하나에게 걸어 두면 시간을 두고 회복된다.',
  }),
  thorns: shared('thorns', {
    job: 'crusader', unlock: 4, range: 20, cast: 0, type: '도트', targeting: 'enemy',
    mp: 22, cd: 9, tick: 32, interval: 1, duration: 6,
    desc: '붙은 적을 가시로 계속 찌른다.',
  }),
  quake: shared('quake', {
    job: 'crusader', unlock: 5, range: 20, cast: 1.0, type: '광역', targeting: 'area-enemy',
    mp: 34, cd: 14, damage: 110, radius: 20,
    desc: '땅을 굴러 주변의 적을 함께 때린다.',
  }),
  shieldSlam: shared('shieldSlam', {
    job: 'crusader', unlock: 5, range: 16, cast: 0, type: '기절', targeting: 'enemy',
    mp: 26, cd: 14, damage: 100, duration: 1.6, knock: 8,
    desc: '방패로 밀쳐 굳힌다. 뒤로 밀려나고 외우던 것이 끊긴다.',
  }),

  // --- 서사시인 (음유시인의 상위) ----------------------------------------
  //
  // 노래가 더 크고 멀리 간다. **회복량을 올리는 강화는 여기뿐이다**(갈채) —
  // 파티의 힐러 전체를 세게 만드는 것이라, 회복을 남에게 맡기고 노래로 판을
  // 굴리는 계열의 끝이다. 아이콘은 음표가 아니라 책·두루마리·월계관이다.
  ballad: {
    id: 'ballad', job: 'laureate', unlock: 1, kind: 'heal', range: 40, cast: 1.0, name: '발라드', type: '개별 대상', targeting: 'ally',
    mp: 24, cd: 1.8, heal: 168, icon: 'ballad',
    desc: '동료 하나를 크게 회복한다. 음유시인의 화음보다 훨씬 세다.',
  },
  harmony: shared('harmony', {
    job: 'laureate', unlock: 1, range: 32, cast: 1.0, type: '강화', targeting: 'ally',
    mp: 22, cd: 16, stat: 'armor', mul: 0.8, duration: 12,
    desc: '동료 하나가 받는 피해를 줄인다.',
  }),
  chorus: {
    id: 'chorus', job: 'laureate', unlock: 2, kind: 'mana-area', range: 32, cast: 1.6, name: '합창', type: '광역 마나', targeting: 'area-ally',
    mp: 20, cd: 22, mana: 40, radius: 24, icon: 'chorus',
    desc: '기준점 주변 아군의 마나를 함께 채운다. 메아리보다 많이 준다.',
  },
  epic: {
    id: 'epic', job: 'laureate', unlock: 3, kind: 'buff-area', range: 32, cast: 1.4, name: '서사시', type: '광역 강화', targeting: 'area-ally',
    mp: 34, cd: 24, stat: 'atk', mul: 1.3, duration: 12, radius: 30, icon: 'epic',
    desc: '기준점 주변 아군의 공격력을 크게 올린다.',
  },
  tune: shared('tune', {
    job: 'laureate', unlock: 3, range: 0, cast: 1.8, type: '마나 회복', targeting: 'self',
    mp: 0, cd: 24, mana: 84,
    desc: '악기를 고르며 자신의 마나를 되찾는다.',
  }),
  requiem: {
    id: 'requiem', job: 'laureate', unlock: 4, kind: 'debuff-area', range: 44, cast: 1.4, name: '진혼곡', type: '광역 약화', targeting: 'area-enemy',
    mp: 30, cd: 20, stat: 'armor', mul: 1.28, duration: 10, radius: 24, icon: 'requiem',
    desc: '기준점 주변의 적이 받는 피해를 크게 늘린다.',
  },
  ovation: {
    id: 'ovation', job: 'laureate', unlock: 5, kind: 'buff-area', range: 30, cast: 1.2, name: '갈채', type: '광역 강화', targeting: 'area-ally',
    mp: 32, cd: 26, stat: 'heal', mul: 1.3, duration: 12, radius: 26, icon: 'ovation',
    desc: '주변 아군의 회복량을 올린다. 자신과 동료 힐러가 함께 세진다.',
  },
  saga: {
    id: 'saga', job: 'laureate', unlock: 5, kind: 'damage', range: 42, cast: 1.4, name: '무훈시', type: '개별 대상', targeting: 'enemy',
    mp: 30, cd: 11, damage: 180, icon: 'saga',
    desc: '적 하나의 최후를 노래한다.',
  },
};

// **주인공이 고를 수 있는 계열.** 힐러 게임이므로 회복을 맡는 계열만 둔다 —
// 딜러나 탱커를 고를 수 있게 하면 "손을 놓아도 이기면 안 된다"는 이 게임의
// 전제가 무너진다.
//
// - **최대 직업 레벨이 캐릭터 레벨보다 낮다**(20 대 30). 받는 점수가 스물하나라,
//   배우는 데 여덟을 쓰고 나면 올리는 데 열셋이 남는다 — **전부를 상한까지 올릴
//   수는 없다**(마흔 점이 든다). 여섯에서 멈추던 때에는 점수가 일곱뿐이라 배우는
//   것만으로 끝나 스킬 레벨을 올릴 자리가 없었다.
// - **레벨과 점수는 계열마다 따로 쌓인다**(`progress.jobs`). 다른 계열을 겪어
//   보려다 지금까지 키운 것이 날아가면 아무도 바꿔 보지 않는다.
// - **배운 스킬은 계열이 달라도 남는다.** 계열을 되돌리면 그때 배운 것이 그대로
//   있다 — 점수만 그 계열 것으로 돌아간다.
// - 조건은 임시다. 지금은 캐릭터 레벨 하나만 본다.
const HERO_JOBS = {
  priest: {
    id: 'priest', name: '사제', spec: 'priest', maxLevel: 20, need: null,
    desc: '직접 회복이 본업. 크게 한 번에 채우고 장판으로 버틴다.',
  },
  bard: {
    id: 'bard', name: '음유시인', spec: 'bard', maxLevel: 20, need: { charLevel: 5 },
    desc: '강화·약화가 본업, 회복이 보조. 파티 전체의 공격력과 마나를 만진다.',
  },
  paladin: {
    id: 'paladin', name: '성기사', spec: 'tank', maxLevel: 20, need: { charLevel: 8 },
    desc: '앞에 서는 보조 탱커이자 보조 힐러. 신성 공격과 도발, 회복은 약하다.',
  },
  // **상위 계열은 최대 직업 레벨이 낮다**(16 대 20). 하나하나가 세면서 점수까지
  // 같으면 아래 계열을 고를 이유가 사라진다 — 적게 배우고 세게 쓰는 쪽이다.
  // **계열마다 상위가 하나씩 있다.** 하나에만 있으면 나머지를 고르는 것이
  // "끝이 없는 길"이 된다.
  bishop: {
    id: 'bishop', name: '주교', spec: 'priest', maxLevel: 16,
    need: { charLevel: 12, jobLevel: { priest: 12 } },
    desc: '사제의 상위 계열. 회복이 더 크고 마나를 더 먹는다. 약화를 걷어낸다.',
  },
  laureate: {
    id: 'laureate', name: '서사시인', spec: 'bard', maxLevel: 16,
    need: { charLevel: 12, jobLevel: { bard: 12 } },
    desc: '음유시인의 상위 계열. 노래가 더 크고, 아군의 회복량까지 올린다.',
  },
  crusader: {
    id: 'crusader', name: '성전사', spec: 'tank', maxLevel: 16,
    need: { charLevel: 12, jobLevel: { paladin: 12 } },
    desc: '성기사의 상위 계열. 광역 도발과 기절로 무리를 통째로 붙든다.',
  },
};

const HERO_JOB_START = 'priest';

// 그 계열의 스킬만. 자료를 계열별로 쪼개지 않고 표 하나에 두는 것은, 전투와
// 저장본이 스킬을 id 하나로 찾기 때문이다 — 쪼개면 찾는 곳마다 계열을 알아야 한다.
const heroSkillsOf = (jobId) =>
  Object.values(PLAYER_SKILLS).filter((def) => def.job === jobId);

const heroJob = (jobId) => HERO_JOBS[jobId] || HERO_JOBS[HERO_JOB_START];

// 그 계열의 최대 직업 레벨. 레벨 상한이 계열마다 다르므로 경험치도 여기서 멈춘다.
const jobMaxLevel = (jobId) => heroJob(jobId).maxLevel;

// 스킬 레벨. **직업 레벨이 오를 때마다 점수를 받아 스킬 하나를 올린다.**
// 캐릭터 레벨이 능력치를 올리듯 직업 레벨은 스킬을 올린다 — 예전에는 직업
// 레벨이 새 스킬을 여는 일만 했고, 여덟 개가 다 열린 뒤에는 아무것도 아니었다.
//
// 효과보다 마나가 천천히 오른다. 마나가 같이 오르는 것은 레벨을 올리는 것이
// 공짜가 아니게 하려는 것이고, 덜 오르는 것은 그래도 올릴 이유를 남기려는
// 것이다. 쿨타임·사거리·반경·지속은 레벨을 타지 않는다 — 그쪽까지 오르면
// 스킬의 성격 자체가 바뀌어, 등록 화면에서 무엇을 고를지가 없어진다.
const SKILL = {
  max: 5,
  pointsPerLevel: 1,
  // 직업 레벨 1에서 받는 점수. 0으로 두면 새로 시작한 사람이 배울 수 있는 스킬이
  // 하나도 없는 채로 편성 화면에 서고, "전투 시작"이 왜 꺼져 있는지 알 수 없다.
  start: 2,
  effect: 0.18,   // 레벨당 회복량·피해·마나 회복
  cost: 0.09,     // 레벨당 소비 마나
};

const skillLevelOf = (level) => Math.max(1, Math.min(SKILL.max, level | 0 || 1));

// 레벨을 반영한 스킬. 원본을 고치지 않고 새 물건을 돌려주는 것은, 화면과 전투가
// 같은 정의를 돌려 쓰기 때문이다 — 제자리에서 고치면 한 번 올린 스킬이 모든
// 유닛에게 올라간 것이 된다.
function skillAt(def, level) {
  if (!def) return null;
  const lv = skillLevelOf(level);
  const out = Object.assign({}, def, { level: lv });
  if (lv === 1) return out;

  const grow = 1 + SKILL.effect * (lv - 1);
  const cost = 1 + SKILL.cost * (lv - 1);
  for (const key of ['heal', 'tick', 'mana', 'damage']) {
    if (def[key]) out[key] = Math.round(def[key] * grow);
  }
  // 강화·약화는 곱이라 그대로 곱하면 1.22가 1.44가 된다. **1에서 떨어진 만큼**을
  // 키운다 — 지속을 늘리지 않는 것은 다른 스킬과 같은 이유다(성격이 바뀐다).
  if (def.stat && def.mul) {
    out.mul = Math.round((1 + (def.mul - 1) * grow) * 1000) / 1000;
  }
  if (def.mp) out.mp = Math.round(def.mp * cost);
  return out;
}

// 스킬이 지금 레벨에서 실제로 얼마를 하는지. 정의에 적어 둔 문장으로는 레벨이
// 오른 것이 화면에 보이지 않는다.
function skillEffect(def) {
  if (!def) return '';
  // 강화·약화는 무엇을 몇 배로 만드는지가 전부다. 이름만으로는 공격력인지
  // 받는 피해인지 알 수 없다.
  if (def.stat) {
    const name = AURA_STATS[def.stat] || def.stat;
    const where = def.radius ? `반경 ${def.radius} 안, ` : '';
    return `${where}${name} ×${def.mul} (${def.duration}초)`;
  }
  if (def.mana && def.targeting === 'ally') return `동료의 마나 ${def.mana} 회복`;
  if (def.mana && def.radius) return `반경 ${def.radius} 안 아군의 마나 ${def.mana} 회복`;
  if (def.mana) return `마나 ${def.mana} 회복`;
  if (def.kind === 'taunt-area') {
    return `반경 ${def.radius} 안의 적을 ${def.duration}초 동안 끌어온다`;
  }
  if (def.kind === 'taunt') return `${def.duration}초 동안 자신에게 끌어온다`;
  if (def.kind === 'stun') return `${def.damage} 피해 · ${def.duration}초 기절`;
  if (def.damage) {
    return def.radius ? `반경 ${def.radius} 안의 적에게 ${def.damage} 피해`
      : `${def.damage} 피해`;
  }
  const kind = def.targeting === 'enemy' || def.targeting === 'area-enemy' ? '피해' : '회복';
  if (def.heal) {
    const cleanse = def.cleanse ? ' · 약화 제거' : '';
    return def.radius ? `반경 ${def.radius} 안의 아군을 ${def.heal}씩 회복${cleanse}`
      : `${def.heal} 회복${cleanse}`;
  }
  if (def.tick) {
    const total = Math.round(def.tick * (def.duration / (def.interval || 1)));
    const where = def.radius ? `반경 ${def.radius} 장판, ` : '';
    return `${where}${def.duration}초 동안 1초마다 ${def.tick} ${kind} (총 ${total})`;
  }
  return '';
}

// 소모성 물약. 전투 중 마나를 회복하는 두 방법 가운데 하나다.
// 물약. 마나 회복과 체력 회복 두 가지다. 전투 중 마나가 저절로 차지 않는다는
// 규칙(기획서 7장)은 그대로이고, 물약이 그 규칙 아래의 유일한 외부 수단이다.
//
// 동료도 물약을 쓴다. 마나를 다 쓴 마법사·사제가 남은 전투 내내 아무것도 하지
// 않고 서 있는 것이 이 물약을 넣은 이유다.
//
// **회복량은 정액이 아니라 최대치의 비율이다.** 정액으로 두었더니 체력 260짜리
// 물약이 330짜리 고블린에게는 부활이고 1900짜리 우두머리에게는 긁는 수준이었다.
// 레벨이 오르면 정액 물약이 그대로 쓸모없어지기도 한다.
const POTIONS = {
  mana:   { id: 'mana',   name: '마나 물약', icon: 'potionMana', restore: 'mp', ratio: 0.40, cd: 15, price: 90 },
  health: { id: 'health', name: '체력 물약', icon: 'potionHealth', restore: 'hp', ratio: 0.25, cd: 12, price: 110 },
};

// 물약 값은 주인공 레벨을 따라간다. 정액으로 두었더니 초반에는 의뢰 하나로 다섯
// 개를 사고 후반에는 값이 없는 것이나 마찬가지였다 — 회복량이 최대치의 비율이라
// 값도 그렇게 따라가야 한다.
function potionPrice(potionId, charLevel) {
  const potion = POTIONS[potionId];
  if (!potion) return Infinity;
  return Math.round(potion.price * (1 + (Math.max(1, charLevel) - 1) * 0.35));
}

// 직업에 따라 자동으로 들고 들어간다. 탱커는 맞는 쪽이라 체력, 마나를 쓰는
// 직업은 마나 위주다. 하나씩은 반대쪽도 들려 보낸다 — 탱커도 도발할 마나는 있어야 한다.
const JOB_POTIONS = {
  tank:   { health: 2, mana: 1 },
  dealer: { health: 1, mana: 2 },
  healer: { health: 1, mana: 2 },
};

// 주인공이 들고 갈 수 있는 최대치. 상점에서 사서 채운다.
const POTION_MAX = 5;

// **rank는 적의 등급이다.** 전리품의 등급 확률이 여기서 나온다 — 고블린 무리를
// 아무리 베어도 신화가 나오면 우두머리를 잡을 이유가 없다.
//
// growth를 적어 두는 것은 기본값이 아군 성장률이기 때문이다. 빠뜨리면 적이
// 아군보다 천천히 자라 높은 레벨 의뢰가 저절로 쉬워진다.
//
// **기본 공격력이 예전보다 낮고 체력은 높다.** 적도 계열 스킬을 넷씩 들고 오게
// 되면서 실제로 넣는 피해가 두 배 남짓이 되었고, 그만큼 공격력을 내렸다.
//
// 체력을 올린 것은 주인공이 쓰러져도 전투가 이어지게 하면서다. 그전까지는 "손을
// 놓으면 진다"의 절반을 주인공의 죽음이 맡고 있었는데, 그것이 빠지자 파티가
// 혼자서도 절반은 이겼다. **전투가 짧으면 회복이 판을 가르지 못한다** — 적을
// 단단하게 만들어 전투를 길게 끌어야 힐이 있는 쪽과 없는 쪽이 갈린다.
//
// **무리 사이의 회복과 마나 자연 회복이 들어오면서 다시 잡았다** — 회복 때 체력
// 1.2배·공격력 1.15배, 마나 회복 때 공격력을 한 번 더 1.25배, 체력을 1.05배.
// 마나가 마르지 않으면 힐도 도발도 후반까지 도므로 그만큼 압박이 있어야 한다.
// 걸어가는 동안 모두가 최대치의 25%를 되찾게 되자 손을 놓고도 벅찬 의뢰를 절반
// 넘게 깼다 — 앞 무리가 남긴 상처가 다음 무리로 이어지지 않으면, 무리가 여럿인
// 의뢰가 짧은 의뢰 여러 개가 된다. 마나 자연 회복도 같은 자리를 건드린다.
// 두 번 모두 난이도 확인의 승률이 그 전 수치로 돌아오는 자리를 씨앗 스물넷으로
// 재서 골랐다.
//
// **적 탱커도 도발을 들고 온다.** 아군과 같은 논리로 움직인다는 것은 같은 표를
// 본다는 뜻만이 아니라 같은 수단을 갖는다는 뜻이다 — 도발이 이쪽에만 있으면
// 적 힐러가 아무에게도 보호받지 못하고, 후열을 먼저 치는 규칙이 한쪽에서만 돈다.
const ENEMIES = {
  scout:  { id: 'scout', race: 'goblin', rank: 'trash', exp: 10,  name: '고블린 척후병', job: 'dealer', sprite: 'goblin',
            hp: 742, mp: 64,  atk: 25, attackCd: 1.5, range: 7,  speed: 21,
           attrs: { str: 40, agi: 16, int: 8, vit: 59 }, growth: 'enemy',
            armor: 0.95, spec: 'grunt' },
  shaman: { id: 'shaman', race: 'goblin', rank: 'trash', exp: 13, name: '고블린 주술사', job: 'healer', sprite: 'shaman',
            hp: 658, mp: 120, atk: 24, attackCd: 2.2, range: 30, speed: 15,
           attrs: { str: 12, agi: 10, int: 16, vit: 52 }, growth: 'enemy', attackType: 'magic',
            armor: 1, spec: 'shaman' },
  orc:    { id: 'orc', race: 'orc', rank: 'elite', exp: 46,    name: '오크 전사',     job: 'tank',   sprite: 'orc',
            hp: 2254, mp: 72,  atk: 51, attackCd: 1.8, range: 7,  speed: 16,
           attrs: { str: 58, agi: 8, int: 10, vit: 134 }, growth: 'enemy',
            armor: 0.7,  spec: 'tank', always: ['sweep'] },
  hexer:  { id: 'hexer', race: 'orc', rank: 'elite', exp: 42,  name: '오크 주술사',   job: 'healer', sprite: 'shaman',
            hp: 1372, mp: 128, atk: 38, attackCd: 2.4, range: 30, speed: 14,
           attrs: { str: 16, agi: 8, int: 19, vit: 82 }, growth: 'enemy', attackType: 'magic',
            armor: 0.9, spec: 'shaman', always: ['curse'] },
  // **우두머리는 제 계열을 쓴다.** 오크 전사와 같은 수호 계열을 들고 있던 동안에는
  // 덩치만 큰 오크였다 — 잡는 데 오래 걸릴 뿐 무섭지는 않았다. 지금은 휩쓸기로
  // 파티 전체를 긁고 마무리로 한 명을 끊는다.
  chief:  { id: 'chief', race: 'orc', rank: 'boss', exp: 210,  name: '오크 우두머리', job: 'tank',   sprite: 'boss',
            hp: 4858, mp: 136, atk: 67, attackCd: 2.0, range: 8,  speed: 14,
           attrs: { str: 89, agi: 6, int: 20, vit: 289 }, growth: 'enemy',
            armor: 0.62, spec: 'chieftain', always: ['rupture', 'sweep'] },
};

// 동료 이름 조각. 명부에 새 동료가 들어올 때 조합해 쓴다 — 이름이 곧 신원이고,
// 같은 이름이면 같은 동료라 경험치와 장비가 이어진다.
//
// 앞 조각은 직업별로 나눠 둔다. 한 통에 섞었더니 "도적 오릭(힐러)" 같은 이름이
// 나왔고, 이름과 직업이 어긋나면 편성 화면에서 이름을 못 믿게 된다.
const NAMES = {
  // **계열별로 나눈다.** 역할(탱커·딜러·힐러)로 나누었을 때에는 "궁수 유리"가
  // 전사의 스킬을 들고 나왔다 — 딜러라는 한 통에 검사와 궁수와 마법사가 함께
  // 들어 있었기 때문이다. 이름이 곧 신원이므로 이름과 스킬이 어긋나면 편성
  // 화면에서 이름을 못 믿게 된다.
  title: {
    tank: ['강철의', '방패병', '불굴의', '바위의', '굳건한', '늙은', '수호'],
    warrior: ['검사', '전사', '용맹한', '떠돌이', '거친', '외팔의', '맹세한'],
    rogue: ['도적', '그림자', '재빠른', '조용한', '뒷골목', '날랜', '잿빛'],
    archer: ['궁수', '사냥꾼', '매의', '멀리 보는', '숲의', '조준하는', '깃털'],
    mage: ['마법사', '불꽃의', '서리의', '주문사', '푸른 불', '늙은', '별을 읽는'],
    priest: ['사제', '수도사', '고요한', '푸른', '치유사', '기도하는', '견습'],
    bard: ['음유시인', '악사', '노래하는', '떠도는', '거리의', '흥겨운', '금빛'],
  },
  given: ['브란', '코린', '라일', '세라', '미라', '유리', '노아', '딘',
          '카엘', '테오', '린', '하나', '오릭', '베라', '단', '이샤',
          '루카', '멜', '가온', '시온', '레아', '드윈', '아셀', '토린'],
};

// 지역. 퀘스트는 미리 적어 두지 않고 여기서 뽑아 만든다(quests.js) — 목록이
// 늘 같으면 "오늘 무엇을 받을까"가 사라진다. 지역이 정하는 것은 어떤 적이 나오고
// 무엇이 떨어지는지, 그리고 어떤 배경에서 싸우는지다.
const REGIONS = {
  mine: {
    id: 'mine', scene: 'mine', name: '폐광',
    // 이름 조각. 지역마다 몇 개씩 두고 섞어 쓴다.
    prefix: ['버려진', '무너진', '깊은', '어두운'],
    task: ['소탕', '정리', '수색'],
    enemies: ['scout', 'shaman'],
    boss: null,
    drops: ['fang', 'fang', 'pelt', 'ore', 'staff', 'charm', 'dagger', 'crystal'],
    minLevel: 1,
  },
  outpost: {
    id: 'outpost', scene: 'outpost', name: '초소',
    prefix: ['무너진', '국경', '잊힌', '외딴'],
    task: ['탈환', '정찰', '방어'],
    enemies: ['scout', 'shaman', 'orc'],
    boss: null,
    drops: ['pelt', 'ore', 'helm', 'bow', 'robe', 'shield', 'charm', 'crystal', 'band'],
    minLevel: 3,
  },
  camp: {
    id: 'camp', scene: 'camp', name: '야영지',
    prefix: ['오크', '전초', '피비린내 나는', '연기 오르는'],
    task: ['습격', '토벌', '기습'],
    enemies: ['orc', 'hexer', 'scout'],
    boss: 'chief',
    drops: ['ore', 'pelt', 'mail', 'rod', 'chalice', 'shield', 'band', 'crystal', 'robe'],
    minLevel: 6,
  },
};

// 적의 등급. 전리품이 나올 확률과 등급이 여기서 갈린다.
// **등급이 곧 보상이다.** 잡졸을 여럿 베는 것과 정예 하나를 잡는 것이 같은 값이면
// 무리를 골라 싸울 이유가 없다. 경험치(정의의 exp)도 같은 기울기로 벌려 두었다 —
// 잡졸 10, 정예 42~46, 우두머리 210이라 우두머리 하나가 잡졸 스물한 마리다.
const RANKS = {
  trash: { id: 'trash', name: '잡졸', drop: 0.14, luck: 0.05 },
  elite: { id: 'elite', name: '정예', drop: 0.68, luck: 0.28 },
  boss:  { id: 'boss',  name: '우두머리', drop: 1, luck: 0.60 },
};

const rankOf = (def) => RANKS[(def && def.rank) || 'trash'] || RANKS.trash;

// 레벨이 등급의 바닥을 올린다. 30레벨에서 바닥이 영웅이 되도록 잡았다 — 바닥이
// 없으면 높은 의뢰에서도 일반이 쏟아져 레벨을 올릴 이유가 전리품에서 사라진다.
const TIER_FLOOR_PER_LEVEL = 1 / 10;
// 레벨 하나가 등급을 한 칸 더 올릴 확률에 얹는 몫.
const TIER_LUCK_PER_LEVEL = 0.008;
const TIER_LUCK_CAP = 0.55;

const tierFloor = (level) =>
  Math.min(TIERS.length - 2, Math.floor((Math.max(1, level) - 1) * TIER_FLOOR_PER_LEVEL));

// **적의 등급과 레벨이 전리품의 등급을 정한다.** 바닥에서 시작해 한 칸씩 올리는
// 굴림을 이어 가는 방식이라, 등급마다 확률을 손으로 적지 않아도 위로 갈수록
// 가파르게 드물어진다. 등급을 하나 더해도 표를 다시 짜지 않아도 된다.
function tierRoll(rank, level, rng) {
  const luck = Math.min(TIER_LUCK_CAP, rankOf({ rank }).luck + Math.max(1, level) * TIER_LUCK_PER_LEVEL);
  let tier = tierFloor(level);
  while (tier < TIERS.length - 1 && rng() < luck) tier++;
  return tier;
}

// 이 등급·레벨의 적에게서 나올 수 있는 가장 높은 등급. 게시판이 "무엇을 노리고
// 가는가"를 적는 데 쓴다 — 몇 개가 나오는지는 굴려 봐야 알지만, 어디까지
// 나올 수 있는지는 미리 말할 수 있다.
const tierCeiling = () => TIERS.length - 1;

// --- 평판과 신뢰도 (기획서 평판·신뢰도편) --------------------------------
//
// **둘은 다른 것을 잰다.** 평판은 세상이 주인공을 어떻게 보는가이고 하나뿐이며,
// 신뢰도는 동료 하나하나가 주인공을 얼마나 믿는가라 동료 수만큼 있다. 한 수치로
// 합치면 "유명하지만 저 사람과는 못 하겠다"가 표현되지 않는다.

// 평판의 단계. 위로는 열려 있지 않고 `max`에서 멈춘다 — 천장이 없으면 몇십 판
// 뒤에 단계 표가 뜻을 잃는다.
//
// `questGap`은 그 단계에서 게시판에 걸리는 의뢰의 적정 레벨 상한이다(주인공
// 레벨 대비). **이것이 평판의 본업이다** — 기획서가 말하는 "높은 평판일수록 상위
// 콘텐츠"를 이 게임에서 잴 수 있는 것은 의뢰의 난이도뿐이다.
// `wage`는 동료가 부르는 삯의 배수다. 이름이 알려진 사람과 가는 값이 싸다.
// **1 근처에서 좁게 흔든다.** 삯의 기준이 의뢰 골드의 1인 몫이라(hire.js),
// 배수들의 곱이 1을 크게 넘으면 넷을 데려가는 순간 주인공 몫이 늘 음수가 되어
// 편성이 "적게 데려가기"만 남는다.
const REPUTATION = {
  start: 0,
  max: 1000,
  stages: [
    { id: 'unknown', name: '무명',   min: 0,   questGap: 1, wage: 1.06 },
    { id: 'known',   name: '알려짐', min: 80,  questGap: 2, wage: 1.02 },
    { id: 'trusted', name: '믿음직', min: 240, questGap: 3, wage: 0.98 },
    { id: 'famed',   name: '이름난', min: 480, questGap: 4, wage: 0.94 },
    { id: 'hero',    name: '영웅',   min: 760, questGap: 5, wage: 0.90 },
  ],
};

// 평판이 움직이는 폭. **어려운 의뢰일수록 크게 오른다**(기획서 2.2) — 쉬운 것을
// 반복해 올리는 길을 막는 것이 이 시스템의 목적이라, 적정 레벨이 내 레벨보다
// 높은 만큼을 얹는다. 반대로 한참 아래인 의뢰는 이름값을 올려 주지 않는다.
//
// **동료 전투불능은 평판보다 신뢰도를 깎는다**(기획서 2.3). 여기서 -4이고
// 신뢰도는 -50이라, 사고가 나면 세상보다 그 동료가 먼저 등을 돌린다.
// **오르내리는 폭은 이 게임의 승률을 보고 정했다.** 벅찬 의뢰는 힐이 들어가도
// 만만치 않게 잡혀 있어(logic.test의 난이도 확인) 지는 판이 적지 않은데, 실패가
// 성공만큼 깎으면 평판이 0에 붙어 단계 표가 뜻을 잃는다 — 재 보니 스물다섯 판에
// 열다섯을 이기고도 평판이 0이었다. 지금은 적정 난이도에서 예닐곱 판을 이기고
// 서너 판을 지면 한 단계씩 오른다.
const REP_CHANGE = {
  clear: 20,        // 완료 기본
  perGap: 8,        // 적정 레벨이 내 레벨보다 하나 높을 때마다
  gapCap: 5,        // 그 이상은 세지 않는다 — 무모한 한 판이 평판을 통째로 사지 않게
  easyGap: -2,      // 이만큼 아래인 의뢰는
  easyClear: 4,     //   완료해도 이것만 오른다
  fail: -8,
  down: -3,         // 동료 하나가 쓰러질 때마다 (이긴 판에서만 센다)
};

// 신뢰도. **범위와 초기값은 기획서에 확정으로 적힌 것이다**(-100~+100, 초면 0).
// 단계 경계도 기획서 7장의 표를 그대로 옮겼다.
const TRUST = {
  min: -100, max: 100, start: 0,
  down: -50,        // 전투불능 한 번 (기획서 9장 확정)
  // 단계마다 한 마디씩 붙여 둔 것은, 숫자만으로는 -40과 -60이 어떻게 다른지
  // 화면에서 읽히지 않기 때문이다. 기획서 7장의 대사를 그대로 옮겼다.
  stages: [
    { id: 'broken',  name: '관계 단절',    min: -100, line: '다시는 당신과 함께하지 않겠습니다.' },
    { id: 'hate',    name: '강한 불신',    min: -79,  line: '지난번 일은 아직 잊지 않았습니다.' },
    { id: 'cold',    name: '불신',        min: -39,  line: '조건이 좋아야 움직이겠습니다.' },
    { id: 'neutral', name: '중립',        min: -9,   line: '처음 만났으니 조건부터 이야기하시죠.' },
    { id: 'warm',    name: '우호적',      min: 10,   line: '나쁘지 않은 자리군요.' },
    { id: 'high',    name: '높은 신뢰',    min: 40,   line: '당신과라면 해볼 만합니다.' },
    { id: 'bond',    name: '매우 높은 신뢰', min: 80, line: '당신이라면 함께하겠습니다.' },
  ],
};

// 동료가 이번 의뢰를 어떻게 보는가. **자기 적정 난이도와의 차이로만 본다**
// (기획서 8장) — 주인공 레벨은 여기 들어오지 않는다. 같은 의뢰라도 데려가는
// 동료에 따라 값이 갈리는 것이 이 표의 뜻이다.
//
// `upTo`는 그 칸에 들어가는 차이의 상한이고, 앞에서부터 처음 맞는 칸을 쓴다.
// **쉬운 쪽이 마이너스인 것이 기획서 8.1이다** — 시시한 일을 반복해 신뢰를
// 쌓는 노가다를 막는다. `wage`가 양쪽 끝에서 다 오르는 것은 12장이다:
// 시간을 낭비할 정도로 쉬워도 싫고 목숨을 걸 정도로 어려워도 싫다.
// `downRelief`는 그 판에서 쓰러졌을 때 -50에서 덜어 내는 몫이다. **기획서의
// -50은 "동료가 쓰러지면 퀘스트가 끝난다"를 전제한 값인데** 이 게임은 그래도
// 이어지므로, 쓰러지는 일이 훨씬 잦다 — 그대로 두면 스물다섯 판에 명부 전원이
// 관계 단절에 닿았다. 각오하고 따라나선 판일수록 덜 원망한다고 보고 덜어 낸다:
// 위험한 의뢰를 깨고 쓰러진 것은 거의 상쇄되고, 시시한 판에서 죽으면 그대로 -50이다.
//
// **쉬운 쪽 칸을 한 번 넓혔다.** 처음에는 한 레벨만 아래여도 쉽다, 둘 아래면
// 시시하다였는데, 동료가 주인공보다 빨리 자라서(`allyExpTo`가 `charExpTo`보다
// 싸다) 진행할수록 명부가 주인공을 앞지른다 — 마흔 판을 굴려 재 보니 레벨차가
// 평균 1.5였고, 그래서 **게시판의 51%가 시시하다·쉽다로 읽혔다.** 규칙이 늘
// 켜져 있으면 그것은 규칙이 아니라 기본값이다. 지금은 두 레벨 아래까지 알맞다로
// 보고, 다시 재 보니 시시 4% · 쉽다 10% · 알맞다 54%다.
const TRUST_FEEL = [
  { upTo: -4,       id: 'trivial', name: '시시하다', trust: -10, wage: 1.20, downRelief: 0 },
  { upTo: -3,       id: 'easy',    name: '쉽다',    trust: -3,  wage: 1.06, downRelief: 4 },
  { upTo: 0,        id: 'fit',     name: '알맞다',  trust: 8,   wage: 1.00, downRelief: 10 },
  { upTo: 2,        id: 'hard',    name: '벅차다',  trust: 15,  wage: 1.15, downRelief: 20 },
  { upTo: Infinity, id: 'deadly',  name: '위험하다', trust: 22,  wage: 1.42, downRelief: 30 },
];

// 실패한 의뢰. 성공했을 때의 표와 나란히 두지 않은 것은, 실패는 난이도가 무엇이든
// 신뢰를 깎기 때문이다 — 다만 애초에 무리한 일이었다면 덜 깎인다.
const TRUST_FAIL = { base: -10, hardRelief: 6 };

// 데려가지 않은 동료는 판이 하나 지날 때마다 이만큼 0 쪽으로 돌아온다.
// **회복 수단이 없으면 신뢰도는 한 방향으로만 간다** — 이 게임은 아군이 자주
// 쓰러지므로(전멸이 곧 실패다) 몇 판 만에 명부 전원이 관계 단절에 닿는다.
// 데려가지 않은 동료가 다른 파티에서 일하고 온다는 규칙이 이미 있으니(roster.js),
// 그동안 앙금도 가라앉는다고 본다. 데려간 동료에게는 걸리지 않는다 — 그쪽은
// 이번 판의 결과가 정한다.
const TRUST_REST = 4;

// 받은 삯이 부른 값과 다를 때(기획서 14장). 요구보다 많이 받으면 만족하고 적게
// 받으면 상한다. **위쪽 폭이 좁은 것은** 돈으로 관계를 사는 것이 어려운 의뢰를
// 함께 깨는 것보다 싸지지 않게 하려는 것이다.
const TRUST_PAY = { per: 24, cap: 10, shortPer: 40, shortCap: -25 };

// 선물(기획서 18장). **값에 제곱근을 씌운다** — 등급이 한 칸 오를 때마다 값이
// 배로 뛰므로 선형으로 두면 좋은 물건 하나가 관계를 통째로 산다.
// 유료 선물은 보류라 여기에 없다.
const GIFT = { div: 3, cap: 25, likedMul: 1.5 };

// 삯의 기준값이 의뢰 골드의 1인 몫에서 차지하는 몫. **1이 아니다** — 1로 두면
// 넷을 데려가는 순간 배수가 조금만 1을 넘어도 삯 합계가 길드가 내는 돈을 넘어,
// 가진 돈이 없는 초반에 넷을 못 데려간다. 그러면 둘만 데리고 나가 지고, 지면
// 돈이 안 들어와 다음 판에는 더 못 데려가는 내리막이 생긴다(재 보니 스무 판
// 만에 파티가 하나까지 줄었다). 기획서 11장의 예도 이쪽이다 — 1,000G에서 셋이
// 450G를 가져가고 주인공이 550G를 남긴다.
const WAGE_BASE = 0.85;

// 동료의 경제적 성격(기획서 16장). **차이를 좁게 둔다** — 벌리면 특정 성격만
// 데려가는 것이 정답이 되어, 전투 능력과 의뢰 적합도가 판단에서 밀려난다.
// `taste`는 적정 난이도를 제 레벨에서 얼마나 옮겨 잡는가이고, `method`는
// 분배 방식마다의 삯 배수다(기획서 15.1).
const TRAITS = {
  coin:  { id: 'coin',  name: '현실적', note: '삯을 깐깐하게 따진다',
           wage: 1.10, taste: 0,  method: { even: 1.00, job: 1.02, dice: 1.04 } },
  gear:  { id: 'gear',  name: '장비광', note: '좋은 물건이 나오는 자리를 좋아한다',
           wage: 0.98, taste: 0,  method: { even: 1.02, job: 0.94, dice: 1.00 } },
  honor: { id: 'honor', name: '명예로움', note: '삯보다 이름을 본다',
           wage: 0.92, taste: 1,  method: { even: 0.98, job: 1.00, dice: 1.00 } },
  bold:  { id: 'bold',  name: '모험가', note: '위험한 일일수록 반긴다',
           wage: 1.00, taste: 1,  method: { even: 1.02, job: 1.00, dice: 0.96 } },
  safe:  { id: 'safe',  name: '신중함', note: '안전한 일을 고른다',
           wage: 1.04, taste: -1, method: { even: 0.98, job: 0.98, dice: 1.06 } },
};

const PARTY_MAX = 5;   // 주인공을 포함한 수
const SKILL_MAX = 5;   // 전투에 등록할 수 있는 주인공 스킬 수

const api = {
  FIELD, JOBS, SPECS, RACES, raceOf, raceAttrs, potionsFor, MELEE_RANGE, roleOf, ATTACK_ORDER, HEAL_ORDER, PULL_ORDER, LEVEL, ATTRS, ATTR, ATTR_GROWTH, attrsAt, derive, STATS, LOWER_IS_BETTER, TIERS, AFFIX_COUNT, AFFIX_BASE, AFFIX_POOL,
  tierName, tierFloor, tierRoll, tierCeiling, TIER_POWER, AFFIX_RANGE, SHOP_MAX_TIER,
  RANKS, rankOf,
  SLOTS, GEAR, MATERIALS, REGIONS, NAMES, SPECIAL_POOL, SPECIAL_CHANCE,
  withGear, attrsWithGear, WHOLE_AFFIX,
  HERO, COMPANIONS, UNIT_SKILLS, SPEC_UP, SPEC_UP_LEVEL, specAt,
  SPEC_CHOICES, SPEC_CHANGE_LEVEL, spriteFor, SKILL_KINDS, skillKind, AURA_STATS, SPEC_SKILLS, UNIT_SKILL_MAX, skillsFor, skillSeed,
  PLAYER_SKILLS, HERO_JOBS, HERO_JOB_START, heroSkillsOf, heroJob, jobMaxLevel,
  SKILL, skillAt, skillEffect, skillLevelOf,
  POTIONS, JOB_POTIONS, POTION_MAX, ENEMIES,
  PARTY_MAX, SKILL_MAX,
  REPUTATION, REP_CHANGE, WAGE_BASE, TRUST, TRUST_FEEL, TRUST_FAIL, TRUST_REST, TRUST_PAY, GIFT, TRAITS,
  potionPrice,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerData = api;

})(typeof window !== 'undefined' ? window : globalThis);

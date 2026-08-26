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
function attrsAt(def, level, spent) {
  const growth = ATTR_GROWTH[def.growth || 'ally'];
  const out = {};
  for (const key of Object.keys(ATTRS)) {
    const base = (def.attrs || {})[key] || 1;
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
  const base = def.attrs || {};
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
  jobExpTo: (level) => Math.round(70 * Math.pow(level, 1.4)),

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
const STATS = {
  hp:    { id: 'hp',    name: '체력',      fmt: (v) => `+${Math.round(v)}` },
  mp:    { id: 'mp',    name: '마나',      fmt: (v) => `+${Math.round(v)}` },
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
const AFFIX_BASE = {
  hp: 14, mp: 7, atk: 0.05, heal: 0.04, armor: -0.02,
  crit: 0.02, critDamage: 0.06, dodge: 0.015,
};
// 뽑기 표. 같은 스탯을 여러 번 적어 무게를 준다 — **직업에 어울리는 쪽이 자주
// 붙어야** 탱커 방패에 회복력이 붙는 일이 생기지 않는다.
//
// 표마다 **서로 다른 스탯이 넷 이상 있어야 한다.** 신화가 직업 옵션 넷을
// 요구하는데(AFFIX_COUNT) 표에 셋뿐이면 하나가 모자란 채로 나온다.
const AFFIX_POOL = {
  tank: ['hp', 'armor', 'hp', 'mp', 'atk'],
  dealer: ['atk', 'hp', 'atk', 'mp', 'armor'],
  healer: ['heal', 'mp', 'heal', 'hp', 'armor'],
  none: ['hp', 'mp', 'atk', 'armor'],
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
  staff:   { id: 'staff',   name: '치유의 지팡이', slot: 'weapon',  job: 'healer', icon: '🪄',
             stats: { heal: 0.10, mp: 14 } },
  rod:     { id: 'rod',     name: '불꽃의 지팡이', slot: 'weapon',  job: 'dealer', icon: '🔥',
             stats: { mp: 20 } },
  dagger:  { id: 'dagger',  name: '예리한 단검',   slot: 'weapon',  job: 'dealer', icon: '🗡',
             stats: { hp: 20 } },
  bow:     { id: 'bow',     name: '사냥꾼의 활',   slot: 'weapon',  job: 'dealer', icon: '🏹',
             stats: { hp: 15, mp: 8 } },
  robe:    { id: 'robe',    name: '사제의 로브',   slot: 'armor',   job: 'healer', icon: '👘',
             stats: { hp: 45, mp: 12, heal: 0.04 } },
  mail:    { id: 'mail',    name: '사슬 갑옷',     slot: 'armor',   job: 'tank',   icon: '🥋',
             stats: { hp: 80, armor: -0.05 } },
  shield:  { id: 'shield',  name: '참나무 방패',   slot: 'armor',   job: 'tank',   icon: '🛡',
             stats: { hp: 55, armor: -0.07 } },
  helm:    { id: 'helm',    name: '오크 투구',     slot: 'armor',   job: 'tank',   icon: '⛑',
             stats: { hp: 65, armor: -0.03 } },
  charm:   { id: 'charm',   name: '성자의 부적',   slot: 'trinket', job: 'healer', icon: '📿',
             stats: { heal: 0.07, mp: 10 } },
  chalice: { id: 'chalice', name: '치유의 성배',   slot: 'trinket', job: 'healer', icon: '🏆',
             stats: { mp: 26, heal: 0.03 } },
  crystal: { id: 'crystal', name: '마나 결정',     slot: 'trinket', job: null,     icon: '💎',
             stats: { mp: 22 } },
  band:    { id: 'band',    name: '수호의 팔찌',   slot: 'trinket', job: 'tank',   icon: '💍',
             stats: { hp: 40, armor: -0.03 } },
};

// 장비가 아닌 전리품. 팔아서 골드가 되는 것뿐이라 슬롯이 없다. 이런 것이 섞여
// 있어야 분배에서 "직업 무관" 규칙이 실제로 쓰인다.
const MATERIALS = {
  fang: { id: 'fang', name: '고블린 이빨', job: null, icon: '🦷', gold: 18 },
  pelt: { id: 'pelt', name: '거친 가죽',   job: null, icon: '🧶', gold: 26 },
  ore:  { id: 'ore',  name: '녹슨 광석',   job: null, icon: '🪨', gold: 34 },
};

// 주인공. 자동 공격이 없다 — 기획서에서 플레이어가 직접 쓰는 것은 힐러의
// 스킬뿐이고, 그 외 행동은 언급되지 않았다. 이동도 마찬가지라 제자리에 선다.
const HERO = {
  id: 'hero',
  name: '주인공',
  job: 'healer',
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
  atk: 22, attackCd: 2.2, range: 30, speed: 15,
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
  bran:  { id: 'bran',  name: '강철의 브란', job: 'tank',   sprite: 'tank',
           hp: 1148, mp: 88,  atk: 26, attackCd: 1.6, range: 7,  speed: 17,
           attrs: { str: 20, agi: 8, int: 11, vit: 82 },
           armor: 0.55, spec: 'tank',
           note: '공격이 매워 어그로를 잘 붙든다' },
  corin: { id: 'corin', name: '방패병 코린', job: 'tank',   sprite: 'tank',
           hp: 1316, mp: 80,  atk: 21, attackCd: 1.8, range: 7,  speed: 15,
           attrs: { str: 16, agi: 6, int: 10, vit: 94 },
           armor: 0.48, spec: 'tank',
           note: '더 단단하지만 더 느리다' },
  lyle:  { id: 'lyle',  name: '검사 라일',   job: 'dealer', sprite: 'melee',
           hp: 644, mp: 80,  atk: 46, attackCd: 1.2, range: 7,  speed: 21,
           attrs: { str: 35, agi: 14, int: 10, vit: 46 },
           armor: 0.82, spec: 'warrior',
           note: '근접. 강타로 한 번에 크게 넣는다' },
  sera:  { id: 'sera',  name: '도적 세라',   job: 'dealer', sprite: 'melee',
           hp: 560, mp: 88,  atk: 38, attackCd: 0.9, range: 7,  speed: 24,
           attrs: { str: 29, agi: 22, int: 11, vit: 40 },
           armor: 0.86, spec: 'rogue',
           note: '근접. 빠르게 여러 번 때린다' },
  mira:  { id: 'mira',  name: '궁수 미라',   job: 'dealer', sprite: 'ranged',
           hp: 518, mp: 104, atk: 42, attackCd: 1.4, range: 34, speed: 17,
           attrs: { str: 32, agi: 18, int: 13, vit: 37 },
           armor: 0.9, spec: 'archer',
           note: '원거리. 화살비로 적 여럿을 친다' },
  yuri:  { id: 'yuri',  name: '마법사 유리', job: 'dealer', sprite: 'ranged',
           hp: 476, mp: 112, atk: 52, attackCd: 1.9, range: 36, speed: 15,
           attrs: { str: 14, agi: 12, int: 14, vit: 34 }, attackType: 'magic',
           armor: 0.92, spec: 'mage',
           note: '원거리. 느리지만 한 방이 무겁다' },
  noa:   { id: 'noa',   name: '사제 노아',   job: 'healer', sprite: 'healer',
           hp: 560, mp: 104, atk: 18, attackCd: 2.0, range: 30, speed: 16,
           attrs: { str: 12, agi: 10, int: 13, vit: 40 }, attackType: 'magic',
           armor: 0.9, spec: 'priest',
           note: '마나가 많아 오래 버틴다' },
  dean:  { id: 'dean',  name: '수도사 딘',   job: 'healer', sprite: 'healer',
           hp: 616, mp: 88,  atk: 24, attackCd: 1.7, range: 26, speed: 18,
           attrs: { str: 14, agi: 12, int: 11, vit: 44 }, attackType: 'magic',
           armor: 0.86, spec: 'priest',
           note: '힐량이 작은 대신 때리기도 한다' },
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
  roar:   { id: 'roar', name: '전투 함성', spec: 'tank', cd: 14, mp: 26, kind: 'taunt-area',
            duration: 8, range: 34, cast: 0, radius: 34, minLevel: 3,
            desc: '주변 적 전부의 어그로를 한 번에 가져온다' },
  sweep:  { id: 'sweep', name: '휩쓸기', spec: 'tank', cd: 10, mp: 20, kind: 'damage-area',
            mul: 1.3, radius: 13, range: 9, cast: 0, minLevel: 5,
            desc: '주변 적 여럿을 한 번에 친다' },
  slam:   { id: 'slam', name: '내려찍기', spec: 'tank', cd: 9, mp: 18, kind: 'damage',
            mul: 3.0, range: 9, cast: 1.0, minLevel: 4,
            desc: '방패를 들어 올렸다 내려찍는다' },
  // 쿨타임이 지속 시간보다 짧다. 이것이 탱커가 하나를 계속 붙들 수 있는 근거다 —
  // 위협도 표를 없앤 뒤로 어그로를 유지하는 수단이 도발뿐이라, 끊기면 그 순간
  // 적이 곧장 후열로 간다.
  taunt:  { id: 'taunt', name: '도발', spec: 'tank', cd: 5, mp: 10, kind: 'taunt',
            duration: 6, range: 30, cast: 0, minLevel: 1,
            desc: '적 하나의 어그로를 가져온다' },
  crush:  { id: 'crush', name: '짓밟기', spec: 'tank', cd: 8, mp: 12, kind: 'dot',
            tick: 13, interval: 1, duration: 6, range: 9, cast: 0, minLevel: 2,
            desc: '밟아 뭉갠 자리가 계속 아프다' },
  bash:   { id: 'bash', name: '방패 강타', spec: 'tank', cd: 6, mp: 12, kind: 'damage',
            mul: 1.9, range: 9, cast: 0, minLevel: 1,
            desc: '방패로 밀어붙인다' },

  // --- 전사 ---
  whirl:  { id: 'whirl', name: '회전 베기', spec: 'warrior', cd: 11, mp: 24, kind: 'damage-area',
            mul: 1.6, radius: 12, range: 8, cast: 0, minLevel: 3,
            desc: '몸을 돌려 붙어 있는 적을 모두 벤다' },
  execute:{ id: 'execute', name: '마무리', spec: 'warrior', cd: 13, mp: 22, kind: 'damage',
            mul: 4.2, range: 8, cast: 1.2, minLevel: 6,
            desc: '크게 준비해 한 방을 꽂는다' },
  rend:   { id: 'rend', name: '가르기', spec: 'warrior', cd: 9, mp: 14, kind: 'dot',
            tick: 16, interval: 1, duration: 6, range: 8, cast: 0, minLevel: 2,
            desc: '상처를 남겨 계속 피가 흐르게 한다' },
  // 사거리가 다른 근접기. 붙기 전에 한 번 넣을 수 있어 전사가 먼저 들이닥친다.
  charge: { id: 'charge', name: '돌진', spec: 'warrior', cd: 12, mp: 16, kind: 'damage',
            mul: 2.4, range: 18, cast: 0, minLevel: 4,
            desc: '거리를 좁히며 부딪친다' },
  cleave: { id: 'cleave', name: '강타', spec: 'warrior', cd: 7, mp: 16, kind: 'damage',
            mul: 2.6, range: 8, cast: 0, minLevel: 1,
            desc: '한 번에 크게 넣는다' },
  overpower: { id: 'overpower', name: '힘으로 누르기', spec: 'warrior', cd: 4, mp: 8,
            kind: 'damage', mul: 1.4, range: 8, cast: 0, minLevel: 1,
            desc: '싸게 계속 때린다' },

  // --- 도적 ---
  // 전사와 같은 자리에서 싸우지만 한 방이 아니라 잦음과 독으로 넣는다. 역할이
  // 같아도 손에 잡히는 감각이 달라야 둘 중 누구를 데려갈지가 고민이 된다.
  smoke:  { id: 'smoke', name: '연막', spec: 'rogue', cd: 16, mp: 18, kind: 'damage-area',
            mul: 1.1, radius: 14, range: 12, cast: 0, minLevel: 6,
            desc: '연기를 터뜨려 주변을 흔든다' },
  backstab:{ id: 'backstab', name: '등 찌르기', spec: 'rogue', cd: 12, mp: 20, kind: 'damage',
            mul: 3.6, range: 8, cast: 0.8, minLevel: 5,
            desc: '빈틈을 노려 깊게 찌른다' },
  flurry: { id: 'flurry', name: '연격', spec: 'rogue', cd: 10, mp: 20, kind: 'damage',
            mul: 3.0, range: 8, cast: 0.6, minLevel: 3,
            desc: '몰아친다' },
  venom:  { id: 'venom', name: '독칼', spec: 'rogue', cd: 8, mp: 16, kind: 'dot',
            tick: 20, interval: 1, duration: 6, range: 8, cast: 0, minLevel: 2,
            desc: '칼에 독을 발라 오래 깎는다' },
  stab:   { id: 'stab', name: '기습', spec: 'rogue', cd: 4, mp: 10, kind: 'damage',
            mul: 1.8, range: 8, cast: 0, minLevel: 1,
            desc: '짧은 쿨타임으로 계속 찌른다' },
  quickCut:{ id: 'quickCut', name: '속공', spec: 'rogue', cd: 2.5, mp: 6, kind: 'damage',
            mul: 1.1, range: 8, cast: 0, minLevel: 1,
            desc: '거의 쉬지 않고 벤다' },

  // --- 궁수 ---
  volley: { id: 'volley', name: '화살비', spec: 'archer', cd: 9, mp: 26, kind: 'damage-area',
            mul: 1.5, radius: 15, range: 34, cast: 1.2, minLevel: 3,
            desc: '겹쳐 있는 적 여럿을 친다' },
  pierce: { id: 'pierce', name: '관통 사격', spec: 'archer', cd: 11, mp: 20, kind: 'damage',
            mul: 3.4, range: 40, cast: 1.6, minLevel: 5,
            desc: '멀리서 꿰뚫는다. 오래 겨눠야 한다' },
  poisonCloud: { id: 'poisonCloud', name: '독 구름', spec: 'archer', cd: 18, mp: 24,
            kind: 'zone', tick: 15, interval: 1, duration: 7, radius: 14, range: 34,
            cast: 1.4, minLevel: 6, desc: '남아 있는 독 구름을 쏘아 올린다' },
  barbed: { id: 'barbed', name: '갈고리 화살', spec: 'archer', cd: 8, mp: 14, kind: 'dot',
            tick: 15, interval: 1, duration: 6, range: 34, cast: 0, minLevel: 2,
            desc: '박힌 채로 남아 계속 깎는다' },
  aimed:  { id: 'aimed', name: '조준 사격', spec: 'archer', cd: 6, mp: 14, kind: 'damage',
            mul: 2.2, range: 34, cast: 1.0, minLevel: 1,
            desc: '한 발을 겨눠 크게 넣는다' },
  quickShot: { id: 'quickShot', name: '속사', spec: 'archer', cd: 3, mp: 8, kind: 'damage',
            mul: 1.2, range: 34, cast: 0, minLevel: 1,
            desc: '겨누지 않고 빠르게 쏜다' },

  // --- 마법사 ---
  // 마나 순환이 있어 마법사는 물약 없이도 한 번은 되살아난다. 마나를 다 쓴
  // 시전자가 남은 전투 내내 서 있는 것을 막는 것이 이 스킬의 목적이다.
  frost:  { id: 'frost', name: '서리 폭발', spec: 'mage', cd: 10, mp: 26, kind: 'damage-area',
            mul: 1.7, radius: 16, range: 36, cast: 1.4, minLevel: 3,
            desc: '터뜨려 여럿을 얼린다' },
  inferno:{ id: 'inferno', name: '불바다', spec: 'mage', cd: 20, mp: 30, kind: 'zone',
            tick: 18, interval: 1, duration: 7, radius: 15, range: 36, cast: 1.8,
            minLevel: 5, desc: '바닥을 태워 그 자리에 남긴다' },
  ember:  { id: 'ember', name: '불씨', spec: 'mage', cd: 9, mp: 16, kind: 'dot',
            tick: 18, interval: 1, duration: 6, range: 36, cast: 0.8, minLevel: 2,
            desc: '불이 옮겨붙어 계속 탄다' },
  channel:{ id: 'channel', name: '마나 순환', spec: 'mage', cd: 26, mp: 0, kind: 'mana',
            mana: 60, range: 0, cast: 2.0, minLevel: 4,
            desc: '자기 마나를 되찾는다' },
  bolt:   { id: 'bolt', name: '화염구', spec: 'mage', cd: 5, mp: 14, kind: 'damage',
            mul: 2.0, range: 36, cast: 1.0, minLevel: 1,
            desc: '불덩이를 던진다' },
  spark:  { id: 'spark', name: '불티', spec: 'mage', cd: 2.8, mp: 7, kind: 'damage',
            mul: 1.0, range: 36, cast: 0, minLevel: 1,
            desc: '싸게 계속 흘려보낸다' },

  // --- 사제 ---
  // 동료 힐러는 보조다. 물약까지 들고 나면서 주인공이 손을 놓아도 파티가 버티기
  // 시작했고, 그러면 이 게임이 성립하지 않는다 — 힐량과 마나를 함께 줄였다.
  wave:   { id: 'wave', name: '치유의 물결', spec: 'priest', cd: 12, mp: 34, kind: 'heal-area',
            heal: 90, radius: 18, range: 30, cast: 2.0, minLevel: 4,
            desc: '기준점 주변 아군을 한 번에 회복시킨다' },
  greaterMend: { id: 'greaterMend', name: '대치유술', spec: 'priest', cd: 6, mp: 40,
            kind: 'heal', heal: 290, range: 30, cast: 2.5, minLevel: 5,
            desc: '크게 회복시킨다. 마나를 많이 먹는다' },
  renew:  { id: 'renew', name: '재생', spec: 'priest', cd: 10, mp: 20, kind: 'heal-dot',
            tick: 22, interval: 1, duration: 7, range: 30, cast: 0, minLevel: 2,
            desc: '천천히 오래 채운다' },
  mend:   { id: 'mend', name: '치유술', spec: 'priest', cd: 3.0, mp: 24, kind: 'heal',
            heal: 145, range: 30, cast: 1.5, minLevel: 1,
            desc: '탱커 체력을 본다' },
  meditate:{ id: 'meditate', name: '명상', spec: 'priest', cd: 30, mp: 0, kind: 'mana',
            mana: 50, range: 0, cast: 2.2, minLevel: 3,
            desc: '자기 마나를 되찾는다' },
  smite:  { id: 'smite', name: '심판', spec: 'priest', cd: 7, mp: 12, kind: 'damage',
            mul: 1.6, range: 30, cast: 1.0, minLevel: 1,
            desc: '힐할 곳이 없으면 때린다' },

  // --- 잡졸 (적) ---
  // 고블린에게 도적의 기술을 그대로 주었더니 등 찌르기·연격을 쓰는 잡졸이 되어,
  // 무리로 몰려오는 상대가 아니라 하나하나가 위험한 상대가 됐다. 계열을 따로
  // 두는 것이 "약한 여럿"이라는 자리를 지키는 방법이다.
  pounce: { id: 'pounce', name: '덮치기', spec: 'grunt', cd: 7, mp: 12, kind: 'damage',
            mul: 1.9, range: 8, cast: 0, minLevel: 1,
            desc: '몸으로 부딪친다' },
  gash:   { id: 'gash', name: '할퀴기', spec: 'grunt', cd: 9, mp: 12, kind: 'dot',
            tick: 11, interval: 1, duration: 5, range: 8, cast: 0, minLevel: 3,
            desc: '할퀸 자리가 계속 쓰라리다' },
  jab:    { id: 'jab', name: '찌르기', spec: 'grunt', cd: 5, mp: 8, kind: 'damage',
            mul: 1.3, range: 8, cast: 0, minLevel: 1,
            desc: '짧게 찌른다' },

  // --- 주술사 (적) ---
  // 적 주술사의 것. 아군 사제와 표를 나눈 이유는 편성 화면에 섞여 나오면 안 되기
  // 때문이다 — 데려갈 수 없는 스킬이 목록에 있으면 고르는 자리가 흐려진다.
  // 파티 전체를 한 번에 때리는 유일한 적 스킬이다. 반경과 배수를 넉넉히 잡았더니
  // 뭉쳐 선 파티가 쓸릴 때마다 힐이 따라가지 못했다 — 아군에게는 흩어지는 규칙이
  // 없으므로 이 스킬만 세면 그냥 못 막는 피해가 된다.
  curse:  { id: 'curse', name: '역병', spec: 'shaman', cd: 18, mp: 28, kind: 'damage-area',
            mul: 1.0, radius: 12, range: 30, cast: 1.6, minLevel: 3,
            desc: '퍼뜨려 여럿을 앓게 한다' },
  mendEnemy: { id: 'mendEnemy', name: '주술 치유', spec: 'shaman', cd: 4.5, mp: 20,
            kind: 'heal', heal: 140, range: 30, cast: 1.5, minLevel: 1,
            desc: '같은 편을 회복시킨다' },
  hex:    { id: 'hex', name: '저주', spec: 'shaman', cd: 8, mp: 18, kind: 'dot',
            tick: 14, interval: 1, duration: 5, range: 30, cast: 1.0, minLevel: 1,
            desc: '지속 피해' },
  drain:  { id: 'drain', name: '마력 흡수', spec: 'shaman', cd: 24, mp: 0, kind: 'mana',
            mana: 55, range: 0, cast: 2.0, minLevel: 2,
            desc: '자기 마나를 되찾는다' },
  spirit: { id: 'spirit', name: '정령 화살', spec: 'shaman', cd: 5, mp: 12, kind: 'damage',
            mul: 1.7, range: 30, cast: 1.0, minLevel: 1,
            desc: '정령을 날려 보낸다' },
};

// 계열의 이름. 화면에 "딜러 · 궁수"처럼 역할과 함께 적는다 — 역할만 적으면
// 궁수와 마법사가 같은 줄로 보이고, 계열만 적으면 누가 앞에 서는지 알 수 없다.
const SPECS = {
  tank:    '수호',
  warrior: '전사',
  rogue:   '도적',
  archer:  '궁수',
  mage:    '마법사',
  priest:  '사제',
  shaman:  '주술사',
  grunt:   '잡졸',
};

// **한 유닛이 전투에 들고 들어가는 스킬 수.** 계열의 목록 중 레벨이 되는 것을
// 앞에서부터 이만큼 자른다. 전부 들고 가게 하면 스킬을 늘린 것이 그냥 "더 세짐"이
// 되고, 레벨이 올라 새 스킬이 열려도 달라지는 것이 없다.
const UNIT_SKILL_MAX = 4;

// 계열별 스킬 목록. **순서가 곧 AI의 우선순위이자 들고 가는 넷을 고르는 순서다.**
// 조건이 까다롭고 강한 쪽(광역기·마무리·대치유술)을 앞에 두었으므로, 레벨이 올라
// 앞쪽이 열리면 뒤쪽의 싸구려 스킬이 목록에서 밀려난다.
const SPEC_SKILLS = {
  // 탱커는 도발이 때리는 것보다 앞이다. 순서를 뒤집어 두었더니 후열이 뚫린
  // 순간에도 휩쓸기가 먼저 나갔다 — 어그로를 끄는 것이 이 직업의 첫 일이다.
  tank:    ['roar', 'taunt', 'sweep', 'slam', 'crush', 'bash'],
  warrior: ['whirl', 'execute', 'rend', 'charge', 'cleave', 'overpower'],
  rogue:   ['smoke', 'backstab', 'flurry', 'venom', 'stab', 'quickCut'],
  archer:  ['volley', 'pierce', 'poisonCloud', 'barbed', 'aimed', 'quickShot'],
  // 마나 회복 스킬(마나 순환·명상·마력 흡수)을 앞쪽에 둔 것은 잘리지 않게 하려는
  // 것이다. 뒤에 두었더니 레벨이 오르면서 강한 스킬에 밀려 나갔고, 마나를 다 쓴
  // 시전자가 남은 전투 내내 기본 공격만 하는 상태가 레벨이 오를수록 잦아졌다.
  mage:    ['frost', 'inferno', 'channel', 'ember', 'bolt', 'spark'],
  priest:  ['wave', 'greaterMend', 'meditate', 'mend', 'renew', 'smite'],
  shaman:  ['curse', 'mendEnemy', 'drain', 'hex', 'spirit'],
  grunt:   ['gash', 'pounce', 'jab'],
};

// 그 유닛이 이 레벨에서 전투에 들고 가는 스킬. 편성 화면과 전투가 같은 것을
// 보여야 하므로 한 곳에서만 계산한다.
function skillsFor(spec, level) {
  return (SPEC_SKILLS[spec] || [])
    .filter((id) => level >= UNIT_SKILLS[id].minLevel)
    .slice(0, UNIT_SKILL_MAX);
}

// 기획서에 나온 다섯 유형을 모두 쓴다: 개별 대상 / 범위 / 장판 / 도트 / 마나 회복.
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
const PLAYER_SKILLS = {
  touch: {
    id: 'touch', unlock: 1, range: 40, cast: 1.0, name: '치유의 손길', type: '개별 대상', targeting: 'ally',
    mp: 14, cd: 1.4, heal: 130, icon: '✚',
    desc: '동료 하나의 체력을 한 번에 크게 회복한다.',
  },
  quick: {
    id: 'quick', unlock: 1, range: 36, cast: 0, name: '신속한 치유', type: '개별 대상', targeting: 'ally',
    mp: 9, cd: 1.2, heal: 62, icon: '✦',
    desc: '싸고 빠르지만 회복량이 작다.',
  },
  regen: {
    id: 'regen', unlock: 2, range: 40, cast: 1.0, name: '재생의 축복', type: '도트', targeting: 'ally',
    mp: 20, cd: 8, tick: 26, interval: 1, duration: 8, icon: '❃',
    desc: '동료 하나에게 걸어 두면 시간을 두고 회복된다.',
  },
  ripple: {
    id: 'ripple', unlock: 4, range: 44, cast: 1.5, name: '빛의 파문', type: '범위', targeting: 'area-ally',
    mp: 30, cd: 7.5, heal: 76, radius: 20, icon: '◎',
    desc: '기준점 주변의 아군을 한 번에 회복한다.',
  },
  sanctuary: {
    id: 'sanctuary', unlock: 6, range: 48, cast: 2.0, name: '생명의 성역', type: '장판', targeting: 'area-ally',
    mp: 38, cd: 20, tick: 22, interval: 1, duration: 10, radius: 21, icon: '⬡',
    desc: '바닥에 남는 장판. 안에 서 있는 아군이 계속 회복된다.',
  },
  focus: {
    id: 'focus', unlock: 3, range: 0, cast: 2.0, name: '정신 집중', type: '마나 회복', targeting: 'self',
    mp: 0, cd: 28, mana: 70, icon: '☾',
    desc: '서서 외워 자신의 마나를 되찾는다.',
  },
  flame: {
    id: 'flame', unlock: 5, range: 40, cast: 1.0, name: '심판의 불꽃', type: '도트', targeting: 'enemy',
    mp: 16, cd: 9, tick: 22, interval: 1, duration: 6, icon: '✹',
    desc: '적 하나를 태운다. 어그로를 끌 수 있다.',
  },
  pyre: {
    id: 'pyre', unlock: 8, range: 44, cast: 1.8, name: '성스러운 불길', type: '장판', targeting: 'area-enemy',
    mp: 34, cd: 18, tick: 26, interval: 1, duration: 8, radius: 18, icon: '⌘',
    desc: '바닥에 남는 장판. 안에 선 적이 계속 탄다.',
  },
};

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
  for (const key of ['heal', 'tick', 'mana']) {
    if (def[key]) out[key] = Math.round(def[key] * grow);
  }
  if (def.mp) out.mp = Math.round(def.mp * cost);
  return out;
}

// 스킬이 지금 레벨에서 실제로 얼마를 하는지. 정의에 적어 둔 문장으로는 레벨이
// 오른 것이 화면에 보이지 않는다.
function skillEffect(def) {
  if (!def) return '';
  if (def.mana) return `마나 ${def.mana} 회복`;
  const kind = def.targeting === 'enemy' || def.targeting === 'area-enemy' ? '피해' : '회복';
  if (def.heal) {
    return def.radius ? `반경 ${def.radius} 안의 아군을 ${def.heal}씩 회복`
      : `${def.heal} 회복`;
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
  mana:   { id: 'mana',   name: '마나 물약', icon: '⚗', restore: 'mp', ratio: 0.40, cd: 15, price: 90 },
  health: { id: 'health', name: '체력 물약', icon: '🧪', restore: 'hp', ratio: 0.25, cd: 12, price: 110 },
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
// **기본 공격력이 예전보다 낮다.** 적도 계열 스킬을 넷씩 들고 오게 되면서 실제로
// 넣는 피해가 두 배 남짓이 되었다 — 예전에는 고블린 척후병과 오크에게 스킬이
// 아예 없었고, 적어 둔 atk이 곧 그 유닛의 전부였다.
//
// **적 탱커도 도발을 들고 온다.** 아군과 같은 논리로 움직인다는 것은 같은 표를
// 본다는 뜻만이 아니라 같은 수단을 갖는다는 뜻이다 — 도발이 이쪽에만 있으면
// 적 힐러가 아무에게도 보호받지 못하고, 후열을 먼저 치는 규칙이 한쪽에서만 돈다.
const ENEMIES = {
  scout:  { id: 'scout', rank: 'trash', exp: 14,  name: '고블린 척후병', job: 'dealer', sprite: 'goblin',
            hp: 336, mp: 64,  atk: 24, attackCd: 1.5, range: 7,  speed: 21,
           attrs: { str: 40, agi: 16, int: 8, vit: 24 }, growth: 'enemy',
            armor: 0.95, spec: 'grunt' },
  shaman: { id: 'shaman', rank: 'trash', exp: 18, name: '고블린 주술사', job: 'healer', sprite: 'shaman',
            hp: 294, mp: 128, atk: 22, attackCd: 2.2, range: 30, speed: 15,
           attrs: { str: 12, agi: 10, int: 16, vit: 21 }, growth: 'enemy', attackType: 'magic',
            armor: 1, spec: 'shaman' },
  orc:    { id: 'orc', rank: 'elite', exp: 32,    name: '오크 전사',     job: 'tank',   sprite: 'orc',
            hp: 784, mp: 80,  atk: 37, attackCd: 1.8, range: 7,  speed: 16,
           attrs: { str: 58, agi: 8, int: 10, vit: 56 }, growth: 'enemy',
            armor: 0.7,  spec: 'tank' },
  hexer:  { id: 'hexer', rank: 'elite', exp: 30,  name: '오크 주술사',   job: 'healer', sprite: 'shaman',
            hp: 476, mp: 152, atk: 27, attackCd: 2.4, range: 30, speed: 14,
           attrs: { str: 16, agi: 8, int: 19, vit: 34 }, growth: 'enemy', attackType: 'magic',
            armor: 0.9, spec: 'shaman' },
  chief:  { id: 'chief', rank: 'boss', exp: 90,  name: '오크 우두머리', job: 'tank',   sprite: 'boss',
            hp: 1904, mp: 160, atk: 58, attackCd: 2.0, range: 8,  speed: 14,
           attrs: { str: 89, agi: 6, int: 20, vit: 136 }, growth: 'enemy',
            armor: 0.62, spec: 'tank' },
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
const RANKS = {
  trash: { id: 'trash', name: '잡졸', drop: 0.22, luck: 0.09 },
  elite: { id: 'elite', name: '정예', drop: 0.55, luck: 0.20 },
  boss:  { id: 'boss',  name: '우두머리', drop: 1, luck: 0.40 },
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

const PARTY_MAX = 5;   // 주인공을 포함한 수
const SKILL_MAX = 5;   // 전투에 등록할 수 있는 주인공 스킬 수

const api = {
  FIELD, JOBS, SPECS, MELEE_RANGE, roleOf, ATTACK_ORDER, HEAL_ORDER, PULL_ORDER, LEVEL, ATTRS, ATTR, ATTR_GROWTH, attrsAt, derive, STATS, LOWER_IS_BETTER, TIERS, AFFIX_COUNT, AFFIX_BASE, AFFIX_POOL,
  tierName, tierFloor, tierRoll, tierCeiling, TIER_POWER, AFFIX_RANGE, SHOP_MAX_TIER,
  RANKS, rankOf,
  SLOTS, GEAR, MATERIALS, REGIONS, NAMES, SPECIAL_POOL, SPECIAL_CHANCE, withGear,
  HERO, COMPANIONS, UNIT_SKILLS, SPEC_SKILLS, UNIT_SKILL_MAX, skillsFor,
  PLAYER_SKILLS, SKILL, skillAt, skillEffect, skillLevelOf,
  POTIONS, JOB_POTIONS, POTION_MAX, ENEMIES,
  PARTY_MAX, SKILL_MAX,
  potionPrice,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerData = api;

})(typeof window !== 'undefined' ? window : globalThis);

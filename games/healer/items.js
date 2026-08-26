'use strict';

// 아이템 하나하나. 같은 이름의 물건이라도 붙은 옵션이 다르므로, 정의(GEAR)가
// 아니라 **인스턴스**를 다룬다: { uid, defId, tier, affixes }.
//
// uid가 필요한 이유는 인벤토리에서 같은 물건을 구별해야 하기 때문이다. 예전에는
// defId와 등급으로 찾았는데, 옵션이 붙기 시작하면서 같은 defId·등급의 다른 물건이
// 생겼다 — 하나를 장착하면 엉뚱한 것이 사라졌다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;

function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextUid = 1;
const uid = () => `i${nextUid++}`;

function def(item) {
  return item && (D.GEAR[item.defId] || D.MATERIALS[item.defId]) || null;
}

const isGear = (item) => Boolean(item && D.GEAR[item.defId]);

// --- 만들기 -------------------------------------------------------------

// 옵션은 그 물건을 쓸 직업에 어울리는 것 위주로 뽑는다. 탱커 방패에 회복력이
// 붙으면 직업 우선 분배가 뜻을 잃는다.
//
// **직업 옵션은 모든 장비에 하나 이상 붙고**(AFFIX_COUNT), 그 위에 치명타·회피가
// 확률로 하나 더 붙는다. 확률로 둔 것은 모든 물건에 붙으면 그것이 옵션이 아니라
// 기본 수치가 되기 때문이다.
const affixRange = (tier) => D.AFFIX_RANGE[Math.max(0, Math.min(D.AFFIX_RANGE.length - 1, tier))];

function rollAffixes(defId, tier, rng) {
  const gear = D.GEAR[defId];
  if (!gear) return [];
  const pool = D.AFFIX_POOL[gear.job || 'none'];
  const count = D.AFFIX_COUNT[Math.min(tier, D.AFFIX_COUNT.length - 1)];

  const affixes = [];
  const used = new Set();
  const roll = (stat) => {
    // **등급마다 하한과 상한이 있고 구간이 겹치지 않는다**(AFFIX_RANGE). 그
    // 안에서 무작위라 같은 등급에서도 "이건 잘 나왔다"가 남는다.
    const [lo, hi] = affixRange(tier);
    affixes.push({ stat, value: D.AFFIX_BASE[stat] * (lo + rng() * (hi - lo)) });
    used.add(stat);
  };

  for (let i = 0; i < count; i++) {
    // 같은 스탯이 두 번 붙으면 한 줄로 합쳐 보여야 해서 읽기가 나빠진다.
    // **이미 붙은 것을 빼고 뽑는다** — 다시 뽑아 보는 방식이었더니 표가 좁은
    // 등급(신화는 넷을 요구한다)에서 가끔 하나가 모자란 채로 나왔다. 표에
    // 같은 스탯을 여러 번 적어 둔 무게는 걸러 낸 뒤에도 그대로 남는다.
    const remaining = pool.filter((stat) => !used.has(stat));
    if (!remaining.length) break;
    roll(remaining[(rng() * remaining.length) | 0]);
  }

  // 치명타·회피는 직업을 가리지 않으므로 직업 표에 섞지 않는다. 섞으면 탱커
  // 방패에서 체력을 밀어내고 들어가는 일이 생긴다.
  if (rng() < D.SPECIAL_CHANCE) {
    const special = D.SPECIAL_POOL[(rng() * D.SPECIAL_POOL.length) | 0];
    if (!used.has(special)) roll(special);
  }
  return affixes;
}

// 같은 씨앗으로 다른 물건을 만들면 옵션이 서로를 베낀다 — 굴림 순서가 같기
// 때문이다. 물건 이름과 등급을 씨앗에 섞어 그것을 끊는다. 한 진열대의 물건들이
// 같은 자리에서 같은 결과를 내던 것이 이것 때문이었다.
function seedOf(defId, tier, seed) {
  let h = ((seed >>> 0) ^ Math.imul(tier + 1, 0x9E3779B1)) >>> 0;
  for (let i = 0; i < defId.length; i++) {
    h = Math.imul(h ^ defId.charCodeAt(i), 0x85EBCA6B) >>> 0;
  }
  return h >>> 0;
}

function make(defId, tier, seed) {
  const rng = createRng(seedOf(defId, tier, seed == null ? (Math.random() * 1e9) | 0 : seed));
  const item = { uid: uid(), defId, tier: Math.max(0, Math.min(D.TIERS.length - 1, tier | 0)) };
  if (D.GEAR[defId]) item.affixes = rollAffixes(defId, item.tier, rng);
  return item;
}

// 저장본에서 읽어 온 것에는 uid가 없거나 겹칠 수 있다. 다시 붙여 준다.
function adopt(item) {
  if (!item || !def(item)) return null;
  const tier = Math.max(0, Math.min(D.TIERS.length - 1, item.tier | 0));
  const copy = { uid: uid(), defId: item.defId, tier };
  if (D.GEAR[item.defId]) {
    copy.affixes = (Array.isArray(item.affixes) ? item.affixes : [])
      .filter((affix) => affix && D.STATS[affix.stat] && Number.isFinite(affix.value))
      .slice(0, D.AFFIX_COUNT[D.AFFIX_COUNT.length - 1]);
  }
  return copy;
}

// --- 수치 ---------------------------------------------------------------

// 기본 옵션(등급으로 오른다) + 무작위 옵션. 화면과 전투가 같은 함수를 봐야
// 캐릭터 창의 수치와 실제 전투가 어긋나지 않는다.
function stats(item) {
  const gear = item && D.GEAR[item.defId];
  if (!gear) return {};
  const mul = D.TIER_POWER[Math.min(item.tier, D.TIER_POWER.length - 1)];
  const out = {};
  for (const [key, value] of Object.entries(gear.stats)) out[key] = value * mul;
  for (const affix of item.affixes || []) {
    out[affix.stat] = (out[affix.stat] || 0) + affix.value;
  }
  return out;
}

// 여러 장비를 한 번에 더한다. 주인공과 동료가 같은 규칙을 쓴다.
function sum(items) {
  const total = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(stats(item))) {
      total[key] = (total[key] || 0) + value;
    }
  }
  return total;
}

function name(item) {
  const base = def(item);
  if (!base) return '?';
  if (!isGear(item)) return base.name;
  return `${D.tierName(item.tier)} ${base.name}`;
}

// 등급 하나. 화면이 색을 입히는 데 쓴다 — 이름만으로는 목록에서 훑어지지 않는다.
const tier = (item) => D.TIERS[Math.max(0, Math.min(D.TIERS.length - 1, (item && item.tier) | 0))];

function statLine(key, value) {
  const stat = D.STATS[key];
  return stat ? `${stat.name} ${stat.fmt(value)}` : '';
}

function summary(item) {
  return Object.entries(stats(item)).map(([key, value]) => statLine(key, value)).join(' · ');
}

// 어느 쪽이 나은가. 받는 피해처럼 낮을수록 좋은 스탯이 섞여 있어 부호만
// 봐서는 알 수 없다.
const gainOf = (key, delta) => (D.LOWER_IS_BETTER.has(key) ? -delta : delta);

// 지금 낀 것과 견준 차이.
function diff(item, current) {
  const next = stats(item);
  const prev = current ? stats(current) : {};
  const out = {};
  for (const key of Object.keys(D.STATS)) {
    const delta = (next[key] || 0) - (prev[key] || 0);
    if (Math.abs(delta) > 0.0001) out[key] = delta;
  }
  return out;
}

// 잃는 것 없이 오르기만 할 때만 "낫다"고 한다. 한 수치라도 오르면 낫다고 하면
// 거의 모든 물건에 표시가 붙어 표시의 뜻이 사라진다.
function isUpgrade(item, current) {
  const changes = Object.entries(diff(item, current)).map(([key, value]) => gainOf(key, value));
  return changes.some((v) => v > 0) && !changes.some((v) => v < 0);
}

// 동료는 인벤토리가 없다. 지금 낀 것보다 나으면 갈아 끼우고 아니면 흘려보내는데,
// 그 판단에는 "잃는 것 없이"가 너무 빡빡하다 — 총합으로 본다.
function score(item, job) {
  // 회복력의 기본 무게가 0인 것은, 힐러가 아닌 동료에게 회복력이 아무것도 아니기
  // 때문이다. 기본에 값을 주면 딜러가 지팡이를 들고 다닌다.
  // 받는 피해 계수 0.2를 덜어 내는 것은 체력 30% 정도를 더 얻는 것과 비슷하다.
  // 처음에 -2600을 줬더니 방패가 모든 직업에게 최고의 방어구가 됐다.
  // 치명타·회피의 무게는 옵션 하나가 다른 옵션 하나와 엇비슷한 값이 되도록
  // 잡았다. 0으로 두면 그 옵션이 붙은 물건을 동료가 거저 흘려보낸다.
  const weight = {
    hp: 1, mp: 1.4, atk: 900, heal: 0, armor: -800,
    crit: 2000, critDamage: 700, dodge: 2500,
  };
  const jobBonus = {
    tank: { hp: 0.6, armor: -700 },
    dealer: { atk: 400 },
    healer: { heal: 1400, mp: 0.8 },
  };
  const bonus = jobBonus[job] || {};
  let total = 0;
  for (const [key, value] of Object.entries(stats(item))) {
    total += value * ((weight[key] || 0) + (bonus[key] || 0));
  }
  return total;
}

// --- 값 -----------------------------------------------------------------

// 파는 값은 사는 값의 절반이 안 된다. 상점에서 사서 되파는 것이 이득이 되면
// 골드가 뜻을 잃는다.
const SELL_RATE = 0.35;

// 옵션이 얼마나 잘 붙었는지. 개수만 세면 잘 나온 물건과 못 나온 물건이 같은
// 값이 되어, 상점에서 옵션을 들여다볼 이유가 사라진다.
//
// 재는 자리는 **그 등급의 구간 안**이다. 등급을 섞어 재면 신화는 무엇이 붙어도
// 잘 나온 것이 되어, 같은 등급끼리 견주는 뜻이 사라진다. 구간의 한가운데면
// 1옵션이 1.0쯤이 되게 잡았다.
function quality(item) {
  const [lo, hi] = affixRange(item.tier);
  const mid = (lo + hi) / 2;
  return (item.affixes || []).reduce((total, affix) => {
    const base = D.AFFIX_BASE[affix.stat] * mid;
    return total + (base ? Math.abs(affix.value / base) : 0);
  }, 0);
}

function price(item) {
  const base = def(item);
  if (!base) return 0;
  if (!isGear(item)) return base.gold * (1 + item.tier);
  // 기준값이 낮으면 첫 의뢰의 보상만으로 진열대를 통째로 살 수 있고, 그러면
  // 전리품이 나올 이유가 없어진다. 등급 하나가 의뢰 반 판에서 한 판쯤 되게 잡았다.
  const power = D.TIER_POWER[Math.min(item.tier, D.TIER_POWER.length - 1)];
  const affixWorth = quality(item) * 150 * power;
  return Math.round(160 * power * power + affixWorth);
}

const sellPrice = (item) => Math.max(1, Math.round(price(item) * SELL_RATE));

const api = {
  createRng, seedOf, make, adopt, def, isGear, tier, stats, sum, name, summary, statLine,
  diff, isUpgrade, gainOf, score, quality, price, sellPrice, SELL_RATE,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerItems = api;

})(typeof window !== 'undefined' ? window : globalThis);

'use strict';

// 동료 모집의 값 계산(기획서 10~15장). **보수는 동료가 먼저 부른다** — 주인공이
// 배분하는 것이 아니라, 각자 자기 조건을 내밀고 남는 것이 주인공 몫이다.
// 그래서 주인공의 몫은 0이나 음수가 될 수 있다(기획서 22장 확정 사항).
//
// 값을 내는 규칙만 두고 화면을 모른다. 편성 화면과 결과 화면이 각각 계산하면
// 부른 보수와 실제로 준 보수가 갈리는데, 그 차이가 곧 신뢰도라 조용히 어긋난다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;
const Rep = node ? require('./reputation.js') : root.HealerRep;
// 분배 방식의 이름을 보수의 이유로 적으므로 여기서 본다. 클래식 스크립트라
// 순서가 곧 의존이고, `index.html`에서 loot.js가 앞에 온다.
const Loot = node ? require('./loot.js') : root.HealerLoot;

// 보수의 기준은 **의뢰 골드의 1인 몫에서 조금 뗀 값**이다(`WAGE_BASE`). 게시판에
// 적힌 금액이 이미 파티 전체 몫이므로(quests.js) 1인 몫이 자연스러운 기준이지만,
// 그대로 두면 배수가 조금만 1을 넘어도 넷의 보수가 길드가 내는 돈을 넘는다.
const baseWage = (quest) =>
  Math.max(1, Math.round((quest.guildReward.gold / D.PARTY_MAX) * D.WAGE_BASE));

// 신뢰도가 보수에 미치는 배수(기획서 13장). **한쪽으로만 걸린다** — 못 믿는
// 사람은 비싸게 부르고, 믿는 사람이라고 깎아 주지는 않는다.
//
// 예전에는 신뢰가 쌓일수록 30%까지 깎아 주었는데, **주인공 몫이 길드 돈에서
// 보수를 뺀 나머지라 그 할인 넷이 통째로 주인공에게 쌓인다.** 관계가 좋아질수록
// 주인공이 동료의 두 배, 세 배를 가져갔다(재 보니 후반에 2.4배·길드 돈의 38%).
// 깎아 주는 폭이 곧 주인공이 얼마나 더 가져가는가라, 그 폭을 0으로 두었다.
// 신뢰가 값에 남기는 것은 **못 믿을수록 비싸다** 한 방향뿐이고, 나머지는 모집
// 가부와 거절로 간다.
function trustScale(trust) {
  return trust >= 0 ? 1 : 1 + (trust / D.TRUST.min) * 0.50;
}

// 이 동료가 이번 의뢰에 부르는 값. `ctx`는 { rep, method }다.
//
// 배수를 곱으로 쌓는 것은 각각이 독립된 이유이기 때문이다 — 신뢰도·평판·
// 난이도 적합도·성격·분배 방식이 전부 기획서에 따로 적힌 항목이고, 더하기로
// 두면 하나가 0에 가까울 때 나머지가 통째로 사라진다.
function wageOf(member, quest, ctx) {
  const opts = ctx || {};
  const rep = Rep.repValue({ rep: opts.rep });
  const trust = Rep.trustOf(member);
  const feel = Rep.feelOf(member, quest);
  const trait = Rep.traitOf(member);
  const stage = Rep.repStage(rep);
  const method = D.TRAITS[trait.id].method[opts.method] || 1;

  const base = baseWage(quest);
  const scales = [
    { why: `${feel.name}`, mul: feel.wage },
    { why: Rep.trustStage(trust).name, mul: trustScale(trust) },
    { why: `평판 ${stage.name}`, mul: stage.wage },
    { why: trait.name, mul: trait.wage },
    { why: (Loot.METHODS[opts.method] || {}).name || '분배 방식', mul: method },
  ];
  const gold = Math.max(1, Math.round(scales.reduce((n, s) => n * s.mul, base)));

  return { name: member.name, gold, base, feel, trait, trust, stage, scales };
}

// 모집에 응하는가(기획서 10장). **관계가 끊어진 동료는 값을 부르지 않는다** —
// 얼마를 준다 해도 따라나서지 않는 자리가 있어야 신뢰도가 숫자 이상이 된다.
function willJoin(member, quest) {
  const trust = Rep.trustOf(member);
  const stage = Rep.trustStage(trust);
  const feel = Rep.feelOf(member, quest);

  if (stage.id === 'broken') {
    return { ok: false, reason: stage.line, stage, feel };
  }
  // 목숨을 걸 만한 일은 믿는 사람과만 한다. 단계로 보는 것은, 경계 수치를
  // 여기에 다시 적으면 표를 고칠 때 한쪽만 바뀌기 때문이다.
  if (feel.id === 'deadly' && (stage.id === 'hate' || stage.id === 'broken')) {
    return { ok: false, reason: '이런 일을 당신과 할 수는 없습니다.', stage, feel };
  }
  // **시시한 일은 거절한다.** 길드의 모험가는 주인공 레벨에 맞춰 나오는 것이
  // 아니라 제 경력이 있고(`roster.guildLevel`), 한참 아래 의뢰는 시간 낭비다 —
  // 값을 더 부르는 것(`TRUST_FEEL`의 `wage`)만으로는 "안 가는 자리"가 없었다.
  // **믿는 사이면 따라나선다**: 관계가 그 손해를 대신 갚는 자리다.
  if (feel.id === 'trivial' && !(stage.id === 'high' || stage.id === 'bond')) {
    return { ok: false, reason: '이런 일에 저까지 부르실 필요는 없습니다.', stage, feel };
  }
  return { ok: true, reason: stage.line, stage, feel };
}

// 이번 편성의 계약. 화면이 고른 동료들에 대해 한 번에 낸다 — 하나씩 부르면
// 분배 방식을 바꿨을 때 일부만 갱신되는 일이 난다.
function contractsFor(members, quest, ctx) {
  return members.map((member) => {
    const wage = wageOf(member, quest, ctx);
    const join = willJoin(member, quest);
    return Object.assign(wage, { ok: join.ok, line: join.reason });
  });
}

// 계약을 다 지키고 나면 주인공에게 얼마가 남는가.
//
// **실패하면 아무도 받지 못한다.** 기획서에 없어서 정한 자리다 — 길드가 내는
// 돈이 성공 보수라 실패하면 들어오는 것이 없고, 없는 돈에서 보수를 내려면 주인공이
// 빚을 지는 규칙을 따로 만들어야 한다. 대신 실패는 신뢰도로 갚는다.
//
// `tips`는 부른 값에 얹어 주는 몫이다(이름 → 골드, 기획서 14장).
function settle(quest, contracts, won, tips) {
  const purse = won ? quest.guildReward.gold : 0;
  const extra = tips || {};
  const paid = contracts.map((contract) => {
    const tip = won ? Math.max(0, Math.round(extra[contract.name] || 0)) : 0;
    return {
      name: contract.name,
      asked: contract.gold,
      gold: won ? contract.gold + tip : 0,
      tip,
    };
  });
  const spent = paid.reduce((sum, row) => sum + row.gold, 0);
  return { purse, paid, spent, hero: purse - spent };
}

// 이 편성을 감당할 수 있는가. 주인공 몫이 음수가 되는 것 자체는 기획서가 허용한
// 자리라 막지 않고, **가진 돈으로도 못 메우는 경우**만 막는다 — 지갑이 음수가
// 되면 상점이 무슨 뜻인지 설명할 수 없다.
function canAfford(gold, quest, contracts, tips) {
  const deal = settle(quest, contracts, true, tips);
  const short = -deal.hero - Math.max(0, gold | 0);
  return short > 0 ? { ok: false, short, deal } : { ok: true, short: 0, deal };
}

const api = { baseWage, trustScale, wageOf, willJoin, contractsFor, settle, canAfford };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerHire = api;

})(typeof window !== 'undefined' ? window : globalThis);

'use strict';

// 평판과 신뢰도. **둘은 재는 대상이 다르다** — 평판은 주인공과 세계의 관계라
// 하나뿐이고, 신뢰도는 주인공과 개별 동료의 관계라 동료 수만큼 있다. 한 수치로
// 합치면 "세상에는 이름이 났지만 저 사람과는 못 하겠다"가 표현되지 않는다.
//
// 수치 규칙만 두고 화면을 모른다. 편성 화면과 결과 화면 두 곳에서 같은 계산을
// 하게 되면 부른 삯과 실제로 준 삯이 갈린다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;
const Items = node ? require('./items.js') : root.HealerItems;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// --- 평판 ---------------------------------------------------------------

const repValue = (progress) => clamp(Math.round((progress && progress.rep) || 0), 0, D.REPUTATION.max);

// 단계는 뒤에서부터 찾는다. 앞에서부터 보면 `min: 0`인 첫 칸에 늘 걸린다.
function repStage(rep) {
  const stages = D.REPUTATION.stages;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (rep >= stages[i].min) return stages[i];
  }
  return stages[0];
}

// 다음 단계까지 얼마나 남았는가. 화면이 막대를 그리는 데 쓴다 — 숫자만 두면
// 이 평판이 어디쯤인지가 표를 외운 사람에게만 보인다.
function repProgress(rep) {
  const stages = D.REPUTATION.stages;
  const stage = repStage(rep);
  const next = stages[stages.indexOf(stage) + 1] || null;
  return {
    stage, next,
    have: rep - stage.min,
    need: next ? next.min - stage.min : 0,
  };
}

// 이번 의뢰가 평판을 얼마나 움직이는가. **어려운 의뢰일수록 크게 오른다** —
// 쉬운 것을 반복해 이름을 사는 길을 막는 것이 이 시스템의 목적이다.
// `downed`는 이번 판에 쓰러진 동료 수다.
// **진 판에서는 전투불능을 따로 세지 않는다.** 기획서의 전투불능은 "그 때문에
// 퀘스트가 끝났다"는 사건인데, 이 게임에서 파티가 다 쓰러지면 그것이 곧 실패다 —
// 실패로 한 번 세고 전투불능으로 또 세면 한 사건을 두 번 깎는 것이 된다.
// 이긴 판에서 누가 쓰러진 것만 사고로 센다.
function repDelta(quest, playerLevel, won, downed) {
  const C = D.REP_CHANGE;
  const fallen = Math.max(0, downed | 0);
  if (!won) return { delta: C.fail, gap: 0, easy: false };

  const gap = quest.level - playerLevel;
  const easy = gap <= C.easyGap;
  const base = easy ? C.easyClear : C.clear + C.perGap * clamp(gap, 0, C.gapCap);
  return { delta: base + C.down * fallen, gap, easy };
}

// 평판을 올리고 내린다. 바닥이 0인 것은, 음수 평판을 표에 넣지 않았기 때문이다 —
// 단계가 다섯이고 그 아래는 "무명"으로 다 담긴다.
function addRep(progress, delta) {
  const before = repValue(progress);
  progress.rep = clamp(before + Math.round(delta), 0, D.REPUTATION.max);
  return {
    before, after: progress.rep, delta: progress.rep - before,
    stage: repStage(progress.rep),
    // 단계가 넘어갔는지는 화면이 알려 줘야 한다. 게시판에 걸리는 의뢰가 바뀌는
    // 자리라, 조용히 넘어가면 목록이 왜 달라졌는지 알 수 없다.
    moved: repStage(before).id !== repStage(progress.rep).id,
  };
}

// 이 평판에서 게시판에 걸리는 의뢰의 적정 레벨 상한(주인공 레벨 대비).
const questGap = (rep) => repStage(rep).questGap;

// --- 신뢰도 -------------------------------------------------------------

const trustOf = (member) => clamp(Math.round((member && member.trust) || 0), D.TRUST.min, D.TRUST.max);

function trustStage(trust) {
  const stages = D.TRUST.stages;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (trust >= stages[i].min) return stages[i];
  }
  return stages[0];
}

function addTrust(member, delta) {
  const before = trustOf(member);
  member.trust = clamp(before + Math.round(delta), D.TRUST.min, D.TRUST.max);
  return {
    name: member.name, before, after: member.trust, delta: member.trust - before,
    stage: trustStage(member.trust),
    moved: trustStage(before).id !== trustStage(member.trust).id,
  };
}

// --- 성격과 적정 난이도 -------------------------------------------------

// **성격은 이름에서 나온다.** 저장본에 적어 두면 자료를 고칠 때마다 어긋나고,
// 새로 뽑으면 같은 동료가 판마다 다른 사람이 된다 — 이름이 곧 신원이라는 규칙을
// 여기서도 그대로 쓴다(`skillsOf`와 같은 방식).
function traitOf(member) {
  const ids = Object.keys(D.TRAITS);
  const seed = D.skillSeed(`trait:${member.name}`);
  return D.TRAITS[ids[seed % ids.length]];
}

// 이 동료가 알맞다고 보는 의뢰 레벨. 제 레벨에 성격 몫을 얹는다 — 모험가는
// 조금 위를, 신중한 쪽은 조금 아래를 알맞다고 본다.
const tasteOf = (member) => Math.max(1, member.level + traitOf(member).taste);

// 이번 의뢰를 그 동료가 어떻게 보는가. **주인공 레벨은 들어오지 않는다** —
// 게시판의 "벅참"은 주인공 기준이고, 이쪽은 동료 기준이라 값이 갈린다.
function feelOf(member, quest) {
  const gap = quest.level - tasteOf(member);
  const feel = D.TRUST_FEEL.find((row) => gap <= row.upTo) || D.TRUST_FEEL[D.TRUST_FEEL.length - 1];
  return Object.assign({ gap }, feel);
}

// --- 의뢰가 끝난 뒤 -----------------------------------------------------

// 동료 하나의 신뢰도가 이번 판에 얼마나 움직이는가.
//
// **전투불능이 가장 크다**(-50, 기획서 9장 확정). 난이도로 얻는 것이 최대 +22라
// 한 번 쓰러지면 두 판을 잘해야 돌아온다 — 신뢰가 낮은 동료는 그 한 번으로
// 관계가 사실상 끊어지고, 높은 동료는 버틴다.
function trustDelta(member, quest, outcome) {
  const feel = feelOf(member, quest);
  const parts = [];

  if (outcome.won) {
    parts.push({ why: `${feel.name} 의뢰 완료`, delta: feel.trust });
  } else {
    // 애초에 무리한 일이었다면 덜 깎인다. 벅찬 줄 알고 따라나선 것이라 실패도
    // 절반은 제 판단이다.
    const relief = (feel.id === 'hard' || feel.id === 'deadly') ? D.TRUST_FAIL.hardRelief : 0;
    parts.push({ why: '의뢰 실패', delta: D.TRUST_FAIL.base + relief });
  }

  // 진 판의 전투불능은 실패 몫에 이미 들어 있다. 둘을 다 세면 전멸한 판마다
  // -64가 되어, 두 판이면 어떤 동료와도 관계가 끊어진다.
  if (outcome.downed && outcome.won) {
    parts.push({ why: '전투불능', delta: D.TRUST.down + feel.downRelief });
  }

  // 받은 삯이 부른 값과 다를 때. 부른 값이 0이면 견줄 것이 없다.
  //
  // **진 판은 보지 않는다.** 실패하면 길드가 내지 않아 아무도 못 받는데, 그것을
  // "약속보다 덜 받았다"로 세면 실패가 두 번 깎인다 — 재 보니 실패마다 -8이
  // 아니라 -33이 되어 열 판이면 명부 전원이 관계 단절에 닿았다. 기획서 14장의
  // 만족도는 일을 마치고 나눌 때의 이야기다.
  const asked = Math.max(0, outcome.asked | 0);
  const paid = Math.max(0, outcome.paid | 0);
  if (outcome.won && asked > 0 && paid !== asked) {
    const ratio = paid / asked;
    const delta = paid > asked
      ? Math.min(D.TRUST_PAY.cap, Math.round((ratio - 1) * D.TRUST_PAY.per))
      : Math.max(D.TRUST_PAY.shortCap, Math.round((ratio - 1) * D.TRUST_PAY.shortPer));
    if (delta) parts.push({ why: paid > asked ? '삯을 더 받았다' : '삯이 모자랐다', delta });
  }

  return { feel, parts, delta: parts.reduce((sum, part) => sum + part.delta, 0) };
}

// 데려가지 않은 동료의 앙금이 가라앉는다. **0을 지나치지 않는다** — 쉬게 두는
// 것만으로 신뢰가 쌓이면 명부에 넣어 두고 안 쓰는 것이 최선이 된다.
function rest(member) {
  const trust = trustOf(member);
  if (trust === 0) return null;
  const step = Math.min(D.TRUST_REST, Math.abs(trust)) * (trust > 0 ? -1 : 1);
  return addTrust(member, step);
}

// --- 선물 ---------------------------------------------------------------

// **그 동료가 쓸 수 있는 물건이면 값이 곱해진다**(기획서 18장). 기사에게 좋은
// 무기, 마법사에게 마법서다 — 직업을 가리지 않는 물건은 그냥 값어치로만 친다.
function liked(member, item, job) {
  const def = Items.def(item);
  return !!(def && def.job && def.job === job);
}

// 값에 제곱근을 씌우는 이유는 등급이 한 칸 오를 때마다 값이 배로 뛰기 때문이다.
// 선형으로 두면 신화 하나가 관계를 통째로 사고, 그 뒤로는 선물이 유일한 답이 된다.
function giftValue(member, item, job) {
  const price = Items.price(item);
  if (!(price > 0)) return { trust: 0, liked: false, price: 0 };
  const love = liked(member, item, job);
  const raw = (Math.sqrt(price) / D.GIFT.div) * (love ? D.GIFT.likedMul : 1);
  return { trust: Math.max(1, Math.min(D.GIFT.cap, Math.round(raw))), liked: love, price };
}

const api = {
  clamp,
  repValue, repStage, repProgress, repDelta, addRep, questGap,
  trustOf, trustStage, addTrust,
  traitOf, tasteOf, feelOf, trustDelta, rest,
  giftValue, liked,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerRep = api;

})(typeof window !== 'undefined' ? window : globalThis);

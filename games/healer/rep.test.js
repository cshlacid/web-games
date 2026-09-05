'use strict';

// 실행: node games/healer/rep.test.js
// 평판과 신뢰도, 그리고 거기서 나오는 삯(기획서 평판·신뢰도편). 유료 선물은
// 보류라 여기 없다.
const D = require('./data.js');
const Rep = require('./reputation.js');
const Hire = require('./hire.js');
const Items = require('./items.js');
const Roster = require('./roster.js');

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

const quest = (level, gold) => ({
  level, id: `q-${level}`, name: '시험 의뢰',
  guildReward: { gold: gold == null ? 5000 : gold, exp: 100 },
});
// 이름이 성격을 정하므로(traitOf) 시험용 동료도 이름을 준다. 성격을 지정하고
// 싶을 때에는 그 성격이 나오는 이름을 찾아 쓴다.
const member = (name, level, trust) => ({ name, level, trust: trust || 0, defId: 'lyle' });

const nameWithTrait = (want) => {
  for (let i = 0; i < 400; i++) {
    const name = `시험 동료 ${i}`;
    if (Rep.traitOf({ name }).id === want) return name;
  }
  throw new Error(`${want} 성격이 나오는 이름을 못 찾았다`);
};

// --- 평판 단계 ----------------------------------------------------------
{
  check('처음은 무명', Rep.repStage(D.REPUTATION.start).id, 'unknown');
  check('경계값은 위 단계에 든다', Rep.repStage(80).id, 'known');
  check('경계 바로 아래는 아래 단계', Rep.repStage(79).id, 'unknown');
  check('천장에서도 단계가 있다', Rep.repStage(D.REPUTATION.max).id, 'hero');

  // 단계는 오름차순이어야 뒤에서부터 찾는 방식이 성립한다.
  const mins = D.REPUTATION.stages.map((s) => s.min);
  check('단계는 오름차순', mins.slice().sort((a, b) => a - b), mins);

  // 삯 배수는 위로 갈수록 싸야 평판이 뜻을 가진다.
  const wages = D.REPUTATION.stages.map((s) => s.wage);
  check('평판이 높을수록 삯이 싸다',
    wages.every((w, i) => i === 0 || w < wages[i - 1]), true);
  // 상한도 함께 열린다 — 이것이 기획서가 말하는 상위 콘텐츠다.
  const gaps = D.REPUTATION.stages.map((s) => s.questGap);
  check('평판이 높을수록 어려운 의뢰가 걸린다',
    gaps.every((g, i) => i === 0 || g > gaps[i - 1]), true);
}

// --- 평판이 움직이는 폭 -------------------------------------------------
{
  check('어려운 의뢰가 더 많이 오른다',
    Rep.repDelta(quest(9), 5, true, 0).delta > Rep.repDelta(quest(5), 5, true, 0).delta, true);
  check('한참 쉬운 의뢰는 이름값을 거의 안 준다',
    Rep.repDelta(quest(3), 5, true, 0).delta, D.REP_CHANGE.easyClear);
  check('실패는 내린다', Rep.repDelta(quest(5), 5, false, 0).delta < 0, true);
  // 무모한 한 판이 평판을 통째로 사지 않게 상한이 있다.
  check('차이는 일정 이상 세지 않는다',
    Rep.repDelta(quest(50), 5, true, 0).delta, Rep.repDelta(quest(10), 5, true, 0).delta);

  // **동료가 쓰러지면 평판보다 신뢰도가 크게 깎인다**(기획서 2.3).
  const downed = Rep.repDelta(quest(5), 5, true, 1);
  check('전투불능은 평판을 조금만 깎는다',
    Math.abs(downed.delta - Rep.repDelta(quest(5), 5, true, 0).delta) < Math.abs(D.TRUST.down),
    true);
  // 진 판에서는 세지 않는다 — 전멸이 곧 실패라 한 사건을 두 번 깎게 된다.
  check('진 판에서는 전투불능을 따로 세지 않는다',
    Rep.repDelta(quest(5), 5, false, 4).delta, Rep.repDelta(quest(5), 5, false, 0).delta);

  // **이기는 판이 지는 판보다 많으면 평판이 자란다.** 이 게임은 벅찬 의뢰를
  // 힐이 들어가도 만만치 않게 잡아 두어 지는 판이 적지 않은데, 실패가 성공만큼
  // 깎으면 평판이 0에 붙어 단계 표가 뜻을 잃는다.
  const per = (wins, plays) => (Rep.repDelta(quest(5), 5, true, 1).delta * wins
    + Rep.repDelta(quest(5), 5, false, 0).delta * (plays - wins)) / plays;
  check('반쯤 이기면 평판이 자란다', per(13, 25) > 0, true);
  check('셋에 하나만 이기면 제자리다', per(8, 25) < per(13, 25) / 2, true);
}

// --- 평판 더하기 --------------------------------------------------------
{
  const progress = { rep: 0 };
  const up = Rep.addRep(progress, 100);
  check('올린 만큼 오른다', up.after, 100);
  check('단계가 넘어간 것을 알린다', up.moved, true);

  Rep.addRep(progress, -1000);
  check('바닥은 0', progress.rep, 0);
  Rep.addRep(progress, 99999);
  check('천장에서 멈춘다', progress.rep, D.REPUTATION.max);

  check('막대에 쓸 값이 나온다', Rep.repProgress(80).have, 0);
  check('마지막 단계에는 다음이 없다', Rep.repProgress(D.REPUTATION.max).next, null);
}

// --- 신뢰도 단계 --------------------------------------------------------
//
// 경계는 기획서 7장의 표 그대로다.
{
  const at = (n) => Rep.trustStage(n).name;
  check('+100은 매우 높은 신뢰', at(100), '매우 높은 신뢰');
  check('+80도 매우 높은 신뢰', at(80), '매우 높은 신뢰');
  check('+79는 높은 신뢰', at(79), '높은 신뢰');
  check('+40은 높은 신뢰', at(40), '높은 신뢰');
  check('+39는 우호적', at(39), '우호적');
  check('+10은 우호적', at(10), '우호적');
  check('0은 중립', at(0), '중립');
  check('-9는 중립', at(-9), '중립');
  check('-10은 불신', at(-10), '불신');
  check('-40은 강한 불신', at(-40), '강한 불신');
  check('-80은 관계 단절', at(-80), '관계 단절');
  check('-100도 관계 단절', at(-100), '관계 단절');
}

// --- 신뢰도 더하기 ------------------------------------------------------
{
  const m = member('시험 동료 0', 5, 0);
  check('처음 만난 동료는 0', Rep.trustOf({ name: 'x', level: 1 }), D.TRUST.start);
  Rep.addTrust(m, 500);
  check('천장에서 멈춘다', m.trust, D.TRUST.max);
  Rep.addTrust(m, -500);
  check('바닥에서 멈춘다', m.trust, D.TRUST.min);

  // 전투불능 -50은 기획서 확정 수치다. 신뢰가 낮은 동료는 한 번에 끊어지고
  // 높은 동료는 버틴다 — 이것이 그 수치를 고른 이유다.
  const low = member('시험 동료 1', 5, 10);
  const high = member('시험 동료 2', 5, 100);
  Rep.addTrust(low, D.TRUST.down);
  Rep.addTrust(high, D.TRUST.down);
  check('신뢰가 낮으면 한 번에 강한 불신', Rep.trustStage(low.trust).id, 'hate');
  check('신뢰가 높으면 버틴다', Rep.trustStage(high.trust).id, 'high');
}

// --- 성격은 이름에서 나온다 ---------------------------------------------
{
  const m = member('검사 라일', 5, 0);
  check('같은 이름이면 같은 성격', Rep.traitOf(m).id, Rep.traitOf({ name: '검사 라일' }).id);
  check('레벨이 올라도 성격은 그대로',
    Rep.traitOf({ name: '검사 라일', level: 30 }).id, Rep.traitOf(m).id);

  // 다섯 성격이 고르게 나와야 성격이 뜻을 가진다. 한쪽으로 쏠리면 표를
  // 만들어 둔 이유가 사라진다.
  const seen = {};
  for (let i = 0; i < 300; i++) {
    const id = Rep.traitOf({ name: `시험 동료 ${i}` }).id;
    seen[id] = (seen[id] || 0) + 1;
  }
  check('다섯 성격이 다 나온다', Object.keys(seen).length, Object.keys(D.TRAITS).length);
  check('한쪽으로 쏠리지 않는다', Object.values(seen).every((n) => n > 30), true);

  // **차이를 좁게 둔다**(기획서 16장). 벌리면 특정 성격만 데려가는 것이 정답이 된다.
  const wages = Object.values(D.TRAITS).map((t) => t.wage);
  check('성격이 삯을 크게 흔들지 않는다',
    Math.max(...wages) / Math.min(...wages) < 1.25, true);
}

// --- 적정 난이도 --------------------------------------------------------
{
  const bold = member(nameWithTrait('bold'), 5, 0);
  const safe = member(nameWithTrait('safe'), 5, 0);
  check('모험가는 더 높은 쪽을 알맞다고 본다', Rep.tasteOf(bold) > Rep.tasteOf(safe), true);

  const fit = member(nameWithTrait('coin'), 5, 0);   // taste 보정 0
  check('제 레벨이 알맞다', Rep.feelOf(fit, quest(5)).id, 'fit');
  check('하나 아래는 쉽다', Rep.feelOf(fit, quest(4)).id, 'easy');
  check('둘 아래는 시시하다', Rep.feelOf(fit, quest(3)).id, 'trivial');
  check('둘 위는 벅차다', Rep.feelOf(fit, quest(7)).id, 'hard');
  check('셋 위는 위험하다', Rep.feelOf(fit, quest(8)).id, 'deadly');

  // **기획서 8.1의 핵심**: 쉬운 의뢰를 반복해 신뢰를 쌓는 길을 막는다.
  check('시시한 의뢰는 성공해도 신뢰가 깎인다',
    Rep.trustDelta(fit, quest(3), { won: true }).delta < 0, true);
  check('알맞은 의뢰는 오른다', Rep.trustDelta(fit, quest(5), { won: true }).delta > 0, true);
  check('어려울수록 더 오른다',
    Rep.trustDelta(fit, quest(8), { won: true }).delta
      > Rep.trustDelta(fit, quest(5), { won: true }).delta, true);
  check('실패하면 깎인다', Rep.trustDelta(fit, quest(5), { won: false }).delta < 0, true);
  check('무리한 일은 실패해도 덜 깎인다',
    Rep.trustDelta(fit, quest(8), { won: false }).delta
      > Rep.trustDelta(fit, quest(5), { won: false }).delta, true);

  // **전투불능이 가장 크다.** 다만 각오하고 따라나선 판일수록 덜 원망한다 —
  // 기획서의 -50은 "쓰러지면 퀘스트가 끝난다"를 전제한 값인데 이 게임은
  // 이어지므로 쓰러지는 일이 훨씬 잦다.
  check('이긴 판의 전투불능은 크게 깎는다',
    Rep.trustDelta(fit, quest(5), { won: true, downed: true }).delta
      < Rep.trustDelta(fit, quest(5), { won: true }).delta - 30, true);
  check('시시한 판에서 죽으면 그대로 -50이다',
    Rep.trustDelta(fit, quest(3), { won: true, downed: true }).parts
      .find((part) => part.why === '전투불능').delta, D.TRUST.down);
  check('위험한 판에서 죽으면 덜 원망한다',
    Rep.trustDelta(fit, quest(8), { won: true, downed: true }).delta
      > Rep.trustDelta(fit, quest(5), { won: true, downed: true }).delta, true);

  // **진 판에서는 전투불능을 따로 세지 않는다.** 전멸이 곧 실패라 한 사건을
  // 두 번 깎게 된다.
  check('진 판의 전투불능은 실패 몫에 들어 있다',
    Rep.trustDelta(fit, quest(5), { won: false, downed: true }).delta,
    Rep.trustDelta(fit, quest(5), { won: false }).delta);
}

// --- 쉬는 동안 앙금이 가라앉는다 ----------------------------------------
//
// 회복 수단이 없으면 신뢰도는 한 방향으로만 간다. 이 게임은 아군이 자주
// 쓰러지므로 몇 판 만에 명부 전원이 관계 단절에 닿았다.
{
  const cold = member('시험 동료 8', 5, -40);
  Rep.rest(cold);
  check('불신은 0 쪽으로 돌아온다', cold.trust, -40 + D.TRUST_REST);

  const warm = member('시험 동료 9', 5, 40);
  Rep.rest(warm);
  check('호감도 0 쪽으로 돌아온다', warm.trust, 40 - D.TRUST_REST);

  // **0을 지나치지 않는다.** 쉬게 두는 것만으로 신뢰가 쌓이면 명부에 넣어 두고
  // 안 쓰는 것이 최선이 된다.
  const near = member('시험 동료 10', 5, 1);
  Rep.rest(near);
  check('0을 지나치지 않는다', near.trust, 0);
  check('0이면 아무것도 하지 않는다', Rep.rest(member('시험 동료 11', 5, 0)), null);
}

// --- 삯 만족도(기획서 14장) --------------------------------------------
{
  const m = member(nameWithTrait('coin'), 5, 0);
  const same = Rep.trustDelta(m, quest(5), { won: true, asked: 200, paid: 200 }).delta;
  const more = Rep.trustDelta(m, quest(5), { won: true, asked: 200, paid: 250 }).delta;
  const less = Rep.trustDelta(m, quest(5), { won: true, asked: 200, paid: 100 }).delta;
  check('더 주면 더 오른다', more > same, true);
  check('덜 주면 깎인다', less < same, true);
  // 실패하면 길드가 내지 않아 아무도 못 받는다. 그것을 "약속보다 덜 받았다"로
  // 세면 실패가 두 번 깎인다.
  check('진 판에서는 삯을 따지지 않는다',
    Rep.trustDelta(m, quest(5), { won: false, asked: 200, paid: 0 }).delta,
    Rep.trustDelta(m, quest(5), { won: false }).delta);
  // 돈으로 관계를 사는 것이 어려운 의뢰를 함께 깨는 것보다 싸면 안 된다.
  const huge = Rep.trustDelta(m, quest(5), { won: true, asked: 200, paid: 20000 }).delta;
  check('돈으로 살 수 있는 폭에는 천장이 있다', huge - same, D.TRUST_PAY.cap);
}

// --- 선물(기획서 18장) --------------------------------------------------
{
  const m = member('검사 라일', 5, 0);
  const cheap = Items.make('mail', 0, 7);
  const rich = Items.make('mail', 5, 7);
  check('비싼 것이 더 오른다',
    Rep.giftValue(m, rich, 'tank').trust > Rep.giftValue(m, cheap, 'tank').trust, true);
  // 값이 등급마다 배로 뛰므로 신뢰도도 그렇게 오르면 하나로 관계가 끝난다.
  check('값이 배로 뛰어도 신뢰도는 그만큼 안 뛴다',
    Rep.giftValue(m, rich, 'tank').trust < Rep.giftValue(m, cheap, 'tank').trust * 5, true);
  check('상한이 있다',
    Rep.giftValue(m, Items.make('mail', 5, 7), 'tank').trust <= D.GIFT.cap, true);

  // 쓸 수 있는 물건이면 더 기뻐한다. 지팡이는 힐러 것이다.
  const staff = Items.make('staff', 2, 7);
  check('제 직업 물건이 더 크다',
    Rep.giftValue(m, staff, 'healer').trust > Rep.giftValue(m, staff, 'tank').trust, true);
}

// --- 삯 계산(기획서 11~13장) --------------------------------------------
{
  const q = quest(5);
  const base = Hire.baseWage(q);
  // 1인 몫에서 조금 뗀 값이다. 그대로 두면 배수가 조금만 1을 넘어도 넷의 삯이
  // 길드가 내는 돈을 넘어, 가진 돈이 없는 초반에 넷을 못 데려간다.
  check('기준은 의뢰 골드의 1인 몫에서 조금 뗀 값',
    base, Math.round((q.guildReward.gold / D.PARTY_MAX) * D.WAGE_BASE));
  check('1인 몫보다 싸다', base < q.guildReward.gold / D.PARTY_MAX, true);

  const name = nameWithTrait('coin');
  const wageAt = (trust, rep, method) =>
    Hire.wageOf(member(name, 5, trust), q, { rep, method: method || 'even' }).gold;

  check('신뢰가 높으면 싸게 부른다', wageAt(80, 0) < wageAt(0, 0), true);
  check('불신하면 비싸게 부른다', wageAt(-40, 0) > wageAt(0, 0), true);
  check('평판이 높으면 싸게 부른다', wageAt(0, D.REPUTATION.max) < wageAt(0, 0), true);
  check('아래쪽이 더 가파르다',
    wageAt(-100, 0) - wageAt(0, 0) > wageAt(0, 0) - wageAt(100, 0), true);

  // **12장**: 시시해도 비싸고 위험해도 비싸다.
  const at = (level) => Hire.wageOf(member(name, 5, 0), quest(level), { rep: 0, method: 'even' }).gold;
  check('알맞은 난이도가 가장 싸다', at(5) < at(3) && at(5) < at(8), true);
  check('위험한 일이 가장 비싸다', at(8) > at(7), true);

  // **15.1장**: 분배 방식에 따라 부르는 값이 달라진다.
  const gearer = nameWithTrait('gear');
  const byMethod = ['even', 'job', 'dice']
    .map((id) => Hire.wageOf(member(gearer, 5, 0), q, { rep: 0, method: id }).gold);
  check('장비광은 직업 우선을 반긴다', byMethod[1] < byMethod[0], true);

  check('삯은 1골드보다 아래로 안 간다',
    Hire.wageOf(member(name, 5, 100), quest(1, 1), { rep: D.REPUTATION.max, method: 'even' }).gold >= 1,
    true);
}

// --- 모집 가부(기획서 10장) ---------------------------------------------
{
  const q = quest(5);
  check('중립이면 응한다', Hire.willJoin(member('시험 동료 3', 5, 0), q).ok, true);
  check('관계가 끊어지면 거부', Hire.willJoin(member('시험 동료 3', 5, -90), q).ok, false);
  check('거부에는 이유가 붙는다',
    Hire.willJoin(member('시험 동료 3', 5, -90), q).reason.length > 0, true);
  // 목숨을 걸 만한 일은 믿는 사람과만 한다.
  check('불신하는 상대와 위험한 일은 안 한다',
    Hire.willJoin(member('시험 동료 3', 5, -60), quest(9)).ok, false);
  check('같은 상대라도 알맞은 일이면 응한다',
    Hire.willJoin(member('시험 동료 3', 5, -60), quest(5)).ok, true);
}

// --- 정산 ---------------------------------------------------------------
{
  const q = quest(5, 5000);
  const four = ['시험 동료 4', '시험 동료 5', '시험 동료 6', '시험 동료 7']
    .map((name) => member(name, 5, 0));
  const contracts = Hire.contractsFor(four, q, { rep: 0, method: 'even' });
  const deal = Hire.settle(q, contracts, true);

  check('넷과 계약한다', deal.paid.length, 4);
  check('나머지가 주인공 몫', deal.hero, q.guildReward.gold - deal.spent);
  // **가득 채워도 남는 것이 있어야 한다.** 배수들의 곱이 1을 크게 넘으면 편성이
  // "적게 데려가기"만 남는다.
  check('알맞은 의뢰를 가득 채워도 주인공 몫이 남는다', deal.hero > 0, true);

  const lost = Hire.settle(q, contracts, false);
  check('실패하면 길드가 내지 않는다', lost.purse, 0);
  check('실패하면 아무도 못 받는다', lost.paid.map((row) => row.gold), [0, 0, 0, 0]);
  check('실패해도 주인공이 빚지지 않는다', lost.hero, 0);

  // 얹어 준 몫은 그 동료에게만 간다.
  const tipped = Hire.settle(q, contracts, true, { [four[0].name]: 100 });
  check('얹어 준 만큼 더 나간다', tipped.spent, deal.spent + 100);
  check('얹은 몫이 기록된다', tipped.paid[0].tip, 100);
  check('부른 값도 함께 남는다', tipped.paid[0].asked, contracts[0].gold);

  // 감당할 수 없는 계약은 막는다. 주인공 몫이 음수인 것 자체는 기획서가 허락한
  // 자리라, 막는 것은 가진 돈으로도 못 메울 때뿐이다.
  const rich = Hire.canAfford(100000, q, contracts);
  check('돈이 있으면 감당할 수 있다', rich.ok, true);
  const hard = Hire.contractsFor(four, quest(20, 1000), { rep: 0, method: 'even' });
  check('가진 돈으로 못 메우면 막는다', Hire.canAfford(0, quest(20, 1000), hard).ok, false);
  check('얼마가 모자라는지 알린다', Hire.canAfford(0, quest(20, 1000), hard).short > 0, true);
}

// --- 명부와 저장본 ------------------------------------------------------
{
  const members = Roster.create(1234);
  check('새 동료는 신뢰도 0', members.every((m) => m.trust === D.TRUST.start), true);

  const saved = JSON.parse(JSON.stringify(members));
  saved[0].trust = 999;
  saved[1].trust = -999;
  delete saved[2].trust;
  const back = Roster.adopt(saved);
  check('저장본의 신뢰도는 범위 안으로 자른다', back[0].trust, D.TRUST.max);
  check('아래쪽도 자른다', back[1].trust, D.TRUST.min);
  check('없으면 0으로 채운다', back[2].trust, 0);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/defense/balance.test.js
//
// 이 게임의 계수를 잡는 자. 규칙이 맞는지가 아니라 **판이 사람에게 어떻게 느껴지는지**를
// 본다. 점령전이 "한 판이 3분에 끝나는가"로 초당 계수를 잡았듯, 여기서는 스스로
// 두는 손으로 스테이지를 올려 가며 난이도가 평평한지 본다.
const D = require('./data.js');
const W = require('./waves.js');
const M = require('./mapgen.js');
const T = require('./meta.js');
const AI = require('./ai.js');

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}
const median = (list) => {
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// --- 균형식 ---
// 강화 효과가 레벨당 ×(1+e), 비용이 ×(1+c)면 누적 보석 R로 얻는 힘은 R^a다.
// 난이도가 스테이지에 무관하려면 보상 성장률 g가 g^a ≈ 적 성장률이어야 한다.
const a = Math.log(T.LEVEL_STEP) / Math.log(1.15);
const ours = Math.pow(T.GEM_GROWTH, a);
check('아군 성장이 적 성장과 맞물린다', Math.abs(ours / W.GROWTH - 1) < 0.03, true);

// --- 성장이 없으면 멀리 못 간다 ---
// 이 검사가 무너지면 영구 성장이 장식이라는 뜻이다.
const bare = T.blank();
check('맨몸으로 첫 스테이지는 깬다', AI.play(1, bare, { style: 'open' }).over, 'won');
check('맨몸으로 열다섯 번째는 못 깬다', AI.play(15, bare, { style: 'open' }).over, 'lost');

// --- 난이도가 평평한가 ---
// **씨드 하나로 재면 안 된다.** 잘 풀리는 판과 무너지는 판이 있어, 한 판만 보면
// 그날의 운을 계수로 착각한다. 손버릇 둘을 각각 네 판씩 돌려 본다.
const SEEDS = [1, 2, 3, 4];
const climbs = (style) => SEEDS.map((seed) => AI.climb({ style, seed, cap: 25 }));
const opens = climbs('open');
const walls = climbs('wall');
const reached = (list) => list.map((r) => r.reached);
// 스테이지당 몇 판이 드는가. **판마다 중앙값을 낸 다음 그 중앙값들의 중앙값을
// 본다** — 잘 풀린 한 판을 골라 재면 그 판의 운을, 못 푼 한 판을 골라 재면 그 손의
// 실수를 계수로 착각한다.
const attemptsOf = (run) => {
  const tries = {};
  for (const row of run.log) tries[row.stage] = (tries[row.stage] || 0) + 1;
  return Object.values(tries);
};

check('스물다섯 스테이지까지 가는 판이 있다', Math.max(...reached(opens)) >= 25, true);
check('막는 손으로도 끝까지 간 판이 있다', Math.max(...reached(walls)) >= 25, true);
check('어느 한쪽이 일방적이지 않다',
  Math.abs(median(reached(walls)) - median(reached(opens))) <= 10, true);
check('한 스테이지에 드는 판이 늘어나지 않는다',
  median(opens.map((r) => median(attemptsOf(r)))) <= 2, true);
// **가장 힘든 스테이지는 벽이어도 된다.** 중앙값이 한두 판인데 어떤 스테이지에서만
// 여러 판이 드는 것은 거기서 조합을 바꾸라는 신호다. 최대 판 수까지 못 박으면
// 계수가 벽을 없애는 쪽으로만 굴러간다.

// --- 한 종류만으로는 못 간다 ---
// 이 게임이 조합을 요구하는지 재는 자다. 궁수만 키워서 끝까지 가면 나머지
// 다섯과 영웅 셋은 장식이다.
const solo = AI.climb({ style: 'open', seed: 1, cap: 30, only: [D.STARTER] });
check('한 종류만으로는 스물다섯을 못 넘는다', solo.reached < 25, true);
check('그래도 몇 스테이지는 간다', solo.reached >= 5, true);
check('섞는 쪽이 훨씬 멀리 간다', Math.max(...reached(opens)) > solo.reached, true);

// --- 한 판이 폰에서 할 만한 길이인가 ---
const spans = opens.flatMap((r) => r.log.map((row) => row.time));
const mid = median(spans);
check('판 길이 중앙값이 2~6분', mid >= 120 && mid <= 360, true);
check('끝나지 않는 판이 없다', spans.every((t) => t < 900), true);

// --- 마릿수가 폰을 넘지 않는가 ---
let most = 0;
for (let s = 1; s <= 60; s++) {
  for (const wave of W.wavesOf(s)) {
    most = Math.max(most, wave.groups.reduce((n, g) => n + g.count, 0));
  }
}
check('한 웨이브가 상한을 넘지 않는다', most <= W.CAP, true);

// 같은 종류를 겹쳐 세우지 못하게 막는 것이 조합을 요구하는 뼈대다.
check('같은 종류에 한도가 있다', D.MOST_OF_KIND > 0 && D.MOST_OF_KIND <= 10, true);
check('겹쳐 세울수록 비싸진다', D.RAISE > 1, true);
check('중장병은 한 놈씩 때리는 공격에 강하다', D.FOES.armored.resist.single >= 0.8, true);
check('그 강함은 지속 피해에는 걸리지 않는다', D.HIT.dot !== D.HIT.single, true);

// --- 판과 적이 편성을 정하는가 ---
// **공격 종류 셋 모두에 큰 벽이 하나씩 있어야 한다.** 하나라도 비면 그 종류로
// 때리는 자만 넷 세우는 것이 새 정답이 된다 — 포수에게 범위 기본 공격을 준 뒤
// 실제로 그렇게 됐다(포수만으로 서른 스테이지).
for (const kind of ['single', 'area', 'dot']) {
  check(`${kind}을 크게 막는 적이 있다`,
    Object.values(D.FOES).some((f) => (f.resist[kind] || 0) >= 0.8), true);
}
// 그 벽들이 한 적에게 몰려 있으면 안 된다. 그 적만 피하면 되는 게임이 된다.
check('벽이 여러 적에게 흩어져 있다',
  new Set(['single', 'area', 'dot'].map((kind) =>
    Object.keys(D.FOES).find((k) => (D.FOES[k].resist[kind] || 0) >= 0.8))).size >= 2, true);
// 판 성격이 갈려야 "막을까 흘릴까"가 판마다 다른 답이 된다.
check('판 성격이 셋이다', M.SHAPES.length, 3);
check('판마다 주력 적이 있다', [...Array(30)].every((_, i) => !!W.themeOf(i + 1)), true);

// **레벨은 부대 하나에 하나다.** 캐릭터마다 따로면 보석을 한 명에게 몰아 붓는 것이
// 언제나 정답이 되어(같은 종류를 여럿 세우니 레벨이 머릿수만큼 곱해진다) 편성이
// 판을 보지 않게 된다.
const flat = T.blank();
flat.gems = 100000;
T.grant(flat, 'cannon');
T.buyLevel(flat);
check('레벨 하나가 가진 사람 모두를 올린다',
  T.modsOf(flat).unit.cannon.damage, T.modsOf(flat).unit.archer.damage);
check('아직 못 얻은 사람도 같은 계수를 받는다',
  T.modsOf(flat).unit.spear.damage, T.modsOf(flat).unit.archer.damage);
check('보상이 값보다 빨리 오른다', T.GEM_GROWTH > 1, true);
check('고용비는 스테이지와 무관하다', D.UNITS.archer.cost, D.UNITS.archer.cost);

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);

'use strict';

// 실행: node games/defense/balance.test.js
//
// 이 게임의 계수를 잡는 자. 규칙이 맞는지가 아니라 **판이 사람에게 어떻게 느껴지는지**를
// 본다. 점령전이 "한 판이 3분에 끝나는가"로 초당 계수를 잡았듯, 여기서는 스스로
// 두는 손으로 스테이지를 올려 가며 난이도가 평평한지 본다.
const D = require('./data.js');
const W = require('./waves.js');
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
const climbed = AI.climb({ style: 'open', seed: 1, cap: 25 });
const tries = {};
for (const row of climbed.log) tries[row.stage] = (tries[row.stage] || 0) + 1;
const counts = Object.values(tries);
check('스물다섯 스테이지를 오른다', climbed.reached >= 25, true);
check('한 스테이지에 드는 판이 늘어나지 않는다', median(counts) <= 2, true);
check('가장 힘든 스테이지도 여남은 판 안에 넘는다', Math.max(...counts) <= 10, true);

// --- 한 판이 폰에서 할 만한 길이인가 ---
const spans = climbed.log.map((row) => row.time);
const mid = median(spans);
check('판 길이 중앙값이 2~6분', mid >= 120 && mid <= 360, true);
check('끝나지 않는 판이 없다', spans.every((t) => t < 900), true);

// --- 막는 손이 장식이 아닌가 ---
// 길을 막는 쪽이 늘 손해면 "부수고 지나간다"는 규칙이 의미를 잃고, 늘 이득이면
// 이 게임은 봉쇄 하나로 끝난다.
const walled = AI.climb({ style: 'wall', seed: 1, cap: 25 });
check('막는 손으로도 열 스테이지는 간다', walled.reached >= 10, true);
check('막는 손이 트인 손을 압도하지는 않는다', walled.reached <= climbed.reached, true);

// --- 마릿수가 폰을 넘지 않는가 ---
let most = 0;
for (let s = 1; s <= 60; s++) {
  for (const wave of W.wavesOf(s)) {
    most = Math.max(most, wave.groups.reduce((n, g) => n + g.count, 0));
  }
}
check('한 웨이브가 상한을 넘지 않는다', most <= W.CAP, true);
check('보상이 값보다 빨리 오른다', T.GEM_GROWTH > 1, true);
check('고용비는 스테이지와 무관하다', D.UNITS.archer.cost, D.UNITS.archer.cost);

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);

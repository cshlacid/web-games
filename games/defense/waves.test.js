'use strict';

// 실행: node games/defense/waves.test.js
const D = require('./data.js');
const W = require('./waves.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

const one = W.wavesOf(1);
check('한 판은 열 웨이브', one.length, D.RUN.waves);
check('같은 스테이지는 같은 웨이브', W.wavesOf(1), one);
check('스테이지가 다르면 다르다', JSON.stringify(W.wavesOf(2)) === JSON.stringify(one), false);

check('마지막만 우두머리', one.map((w) => w.boss),
  [false, false, false, false, false, false, false, false, false, true]);
check('우두머리 웨이브에 우두머리가 하나',
  one[9].groups.filter((g) => g.foe === 'boss').reduce((n, g) => n + g.count, 0), 1);

check('체력은 스테이지마다 배수로 오른다',
  +(W.hpOf(2, 1) / W.hpOf(1, 1)).toFixed(4), +W.GROWTH.toFixed(4));
check('같은 스테이지 안에서도 뒤가 무겁다', W.hpOf(5, 10) > W.hpOf(5, 1), true);

// 스테이지가 아무리 올라가도 규격을 지키는가. 여기가 무너지면 화면과 폰이 먼저 죽는다.
let over = 0;
let none = 0;
let early = 0;
let split = 0;
let flood = 0;
for (let s = 1; s <= 200; s++) {
  for (const w of W.wavesOf(s)) {
    const total = w.groups.reduce((n, g) => n + g.count, 0);
    if (total > W.CAP) over++;
    if (!w.groups.length || w.groups.some((g) => g.count < 1)) none++;
    const seen = new Set();
    for (const g of w.groups) {
      if (g.foe !== 'boss' && s < D.FOE_FROM[g.foe]) early++;
      // 그 종류를 처음 만나는 스테이지에서는 몇 마리만 나온다.
      if (s > 1 && s === D.FOE_FROM[g.foe] && g.count > W.FIRST_MEET) flood++;
      if (seen.has(g.foe)) split++;
      seen.add(g.foe);
    }
  }
}
check('한 번에 서는 수가 상한을 넘지 않는다', over, 0);
check('빈 웨이브가 없다', none, 0);
check('열리지 않은 종류는 나오지 않는다', early, 0);
check('처음 만나는 종류는 몇 마리뿐', flood, 0);
check('같은 종류를 두 무더기로 쪼개지 않는다', split, 0);

check('치유병은 열 번째 스테이지부터',
  W.wavesOf(9).some((w) => w.groups.some((g) => g.foe === 'mender')), false);
check('열 번째 스테이지에는 나온다',
  W.wavesOf(10).some((w) => w.groups.some((g) => g.foe === 'mender')), true);
check('첫 스테이지는 보병만',
  [...new Set(W.wavesOf(1).flatMap((w) => w.groups.map((g) => g.foe)))].sort(),
  ['boss', 'grunt']);

check('처음 두 웨이브에는 비싼 종류가 없다',
  W.wavesOf(20).slice(0, 2).flatMap((w) => w.groups).every((g) => D.FOES[g.foe].cost <= 1), true);

// --- 판마다 주력 적 ---
check('주력은 스테이지 씨드로 고정이다', W.themeOf(9), W.themeOf(9));
check('아직 안 나오는 종류는 주력이 못 된다',
  [1, 2, 3, 4].every((s) => W.poolAt(s).includes(W.themeOf(s))), true);
check('우두머리는 주력이 못 된다',
  [...Array(40)].map((_, i) => W.themeOf(i + 1)).includes('boss'), false);

// 주력이 실제로 앞세워지는가. 종류가 여럿인 스테이지에서 재야 뜻이 있다.
let leading = 0;
let stages = 0;
for (let s = 5; s <= 40; s++) {
  const theme = W.themeOf(s);
  const all = W.wavesOf(s).flatMap((w) => w.groups.map((g) => g.foe));
  const share = all.filter((k) => k === theme).length / all.length;
  stages++;
  if (share >= 0.2) leading++;
}
check('어느 스테이지에서나 주력이 다섯 중 하나는 된다', leading, stages);

// 판마다 색이 갈리는가. 마흔 판이 전부 같은 주력이면 장치가 없는 것과 같다.
check('주력이 여러 종류로 갈린다',
  new Set([...Array(40)].map((_, i) => W.themeOf(i + 11))).size >= 4, true);

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);

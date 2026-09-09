'use strict';

// 실행: node games/eufloria/ai.test.js
const A = require('./ai.js');
const L = require('./logic.js');
const M = require('./mapgen.js');

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

const DT = 1 / 30;
const THINK = 1.2;

// 양쪽 다 상대에게 맡기고 끝까지 돌린다. **이 게임에는 "정답 판"이 없어서, 판이
// 제 시간에 끝나는지가 유일하게 자동으로 볼 수 있는 균형이다.** 계수를 건드리면
// 여기 걸린다.
function selfPlay(seed, count, limit = 900) {
  const world = L.createWorld(M.generate(seed, count));
  let next = 0;
  for (let t = 0; t < limit && !world.over; t += DT) {
    if (t >= next) {
      next = t + THINK;
      for (const owner of [1, 2]) A.apply(world, owner, A.decide(world, owner));
    }
    L.step(world, DT);
  }
  return world;
}

const runs = [];
for (const count of [9, 12, 15]) {
  for (let seed = 1; seed <= 20; seed++) runs.push(selfPlay(seed, count));
}

const done = runs.filter((w) => w.over);
// **한두 판은 끝나지 않는데, 그것이 맞다.** 양쪽이 소행성 하나로만 닿아 있는 지도가
// 나오면 앞줄의 크기가 각자의 생산량에 묶여(정원 초과분은 굶는다) 어느 쪽도 상대를
// 1.3배로 넘지 못한다. 실력이 같은 둘이 길목에서 막힌 것이라 판단기가 틀린 것이
// 아니다. 그래서 "다 끝난다"가 아니라 "거의 다 끝난다"로 본다 — 이 수가 확 늘면
// 그때는 계수가 틀어진 것이다.
check('맡겨 두면 열에 아홉은 끝난다', done.length >= runs.length * 0.9, true);
check('비기지 않는다', done.every((w) => w.over.winner !== 0), true);

const times = done.map((w) => w.t).sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
check('한 판이 1~8분 사이에 끝난다', median > 60 && median < 480, true);

// --- 판단 ---
// 지도에서 상황을 만들면 씨앗 번호에 따라 배치가 달라져 무엇을 보고 있는지 흐려진다.
// 여기서는 소행성을 손으로 놓는다. 80만큼 떨어뜨리면 이웃이고, 160이면 사거리 밖이다.
const mid = { energy: 60, strength: 60, speed: 60 };

function stage(spec) {
  const world = L.createWorld({
    seed: 0,
    asteroids: spec.map((s, id) => ({
      id, x: s.x, y: s.y, r: s.r || 16, stats: mid,
      owner: s.owner || 0, trees: s.trees || [], seeds: 0,
    })),
  });
  spec.forEach((s, id) => {
    if (s.seeds) {
      world.asteroids[id].seeds[s.owner] = { n: s.seeds, str: 60, eng: 60, spd: 60 };
    }
  });
  return world;
}

const full = ['dyson', 'defense'];

{
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: ['dyson'], seeds: 12 },
    { x: 80, y: 0 },
  ]);
  check('씨앗이 열이면 나무부터 심는다', A.decide(w, 2), [{ type: 'plant', id: 0, tree: 'dyson' }]);
}

{
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: ['dyson'], seeds: 12 },
    { x: 80, y: 0, owner: 1, seeds: 5 },
  ]);
  check('적이 붙은 자리에는 방어 나무', A.decide(w, 2), [{ type: 'plant', id: 0, tree: 'defense' }]);
}

{
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: full, seeds: 30 },
    { x: 80, y: 0 },
    { x: 0, y: 80, owner: 1, trees: ['defense'], seeds: 25 },
  ]);
  check('싼 곳부터 먹는다', A.decide(w, 2), [{ type: 'send', from: 0, to: 1, ratio: 1 }]);
}

{
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: full, seeds: 16 },
    { x: 80, y: 0, owner: 1, trees: ['defense'], seeds: 40 },
  ]);
  check('못 이길 곳에는 보내지 않는다', A.decide(w, 2), []);
}

{
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: full, seeds: 30 },
    { x: 80, y: 0, owner: 2, trees: full, seeds: 8 },
    { x: 160, y: 0, owner: 1, trees: ['defense'], seeds: 40 },
  ]);
  check('앞줄이 모자라면 뒤에서 밀어 준다',
    A.decide(w, 2), [{ type: 'send', from: 0, to: 1, ratio: 0.75 }]);
}

{
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: full, seeds: 260 },
    { x: 80, y: 0, owner: 1, trees: ['defense', 'dyson'], seeds: 180 },
  ]);
  check('쌓아 둘 곳을 넘기면 여유 없이도 친다',
    A.decide(w, 2), [{ type: 'send', from: 0, to: 1, ratio: 1 }]);
}

// --- 난이도 ---
{
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: full, seeds: 30 },
    { x: 80, y: 0, owner: 1, seeds: 12 },
  ]);
  check('기본 여유로는 친다', A.decide(w, 2), [{ type: 'send', from: 0, to: 1, ratio: 1 }]);
  check('여유를 크게 잡으면 같은 자리에서 참는다', A.decide(w, 2, { edge: 1.9 }), []);
}

{
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: ['dyson'], seeds: 30 },
    { x: 80, y: 0, owner: 1, seeds: 3 },
  ]);
  check('문을 닫아 두면 나무만 심는다',
    A.decide(w, 2, { hold: true }), [{ type: 'plant', id: 0, tree: 'defense' }]);
  check('방어를 꺼 두면 다이슨만 심는다',
    A.decide(w, 2, { hold: true, defense: false }), [{ type: 'plant', id: 0, tree: 'dyson' }]);
}

{
  // 앞줄 셋이 한 목표를 칠 수 있는 자리. 손을 한 번으로 묶으면 가장 큰 무리만 간다.
  const w = stage([
    { x: 0, y: 0, owner: 2, trees: full, seeds: 12 },
    { x: 0, y: 80, owner: 2, trees: full, seeds: 30 },
    { x: 0, y: 160, owner: 2, trees: full, seeds: 20 },
    { x: 80, y: 80, owner: 1, seeds: 6 },
  ]);
  check('제한이 없으면 앞줄이 한꺼번에 쏟아붓는다', A.decide(w, 2).length, 3);
  check('손을 하나로 묶으면 가장 큰 무리만 간다',
    A.decide(w, 2, { moves: 1 }), [{ type: 'send', from: 1, to: 3, ratio: 1 }]);
}

{
  const rung = ['easy', 'normal', 'hard'].map((key) => A.LEVELS[key]);
  const falls = (key) => rung[0][key] > rung[1][key] && rung[1][key] >= rung[2][key];
  check('쉬울수록 뜸하게 생각하고 크게 참고 늦게 나온다',
    [falls('think'), falls('edge'), falls('opening')], [true, true, true]);
  check('쉬울수록 천천히 자란다', rung[0].growth < rung[1].growth && rung[1].growth < rung[2].growth, true);
  check('쉬움에서만 방어 나무를 접는다',
    [rung[0].defense, rung[1].defense, rung[2].defense], [false, true, true]);
}

// --- 사람과 붙였을 때 ---
// **사람 흉내를 세워 잰다.** 판단기끼리 붙이면 손 속도가 같아 난이도가 갈리지 않는데,
// 실제로 갈리는 것은 대부분 손 속도다. 4.5초에 한 번, 한 번에 한 곳만 보내고, 판을
// 읽는 데 12초를 쓰는 상대를 사람 자리에 세운다 — 느긋하게 두는 사람의 어림이다.
const HUMAN = { think: 4.5, edge: 1.35, opening: 12, moves: 1 };

// **이겼는가가 아니라 앞섰는가로 본다.** 손이 느린 쪽은 이겨 놓고도 남은 소행성을
// 다 걷어내는 데 한참이 걸려, 10분 안에 끝나지 않은 판이 흔하다. 그런 판도 소행성을
// 더 쥐고 있으면 사람이 이기고 있는 판이다.
function ahead(level, seed, count, limit = 600) {
  const world = L.createWorld(M.generate(seed, count));
  const foe = A.LEVELS[level];
  world.growth[2] = foe.growth;
  let tHuman = 0;
  let tFoe = 0;
  for (let t = 0; t < limit && !world.over; t += DT) {
    if (t >= tHuman) {
      tHuman = t + HUMAN.think;
      A.apply(world, 1, A.decide(world, 1,
        { edge: HUMAN.edge, hold: t < HUMAN.opening, moves: HUMAN.moves }));
    }
    if (t >= tFoe) {
      tFoe = t + foe.think;
      A.apply(world, 2, A.decide(world, 2,
        { edge: foe.edge, hold: t < foe.opening, moves: foe.moves, defense: foe.defense }));
    }
    L.step(world, DT);
  }
  if (world.over) return world.over.winner === 1;
  return L.holdings(world, 1) > L.holdings(world, 2);
}

function upperHand(level) {
  let up = 0;
  let n = 0;
  for (const count of [9, 12, 15]) {
    for (let seed = 1; seed <= 14; seed++) { n++; if (ahead(level, seed, count)) up++; }
  }
  return up / n;
}

{
  const easy = upperHand('easy');
  const normal = upperHand('normal');
  const hard = upperHand('hard');
  check('쉬움은 느긋하게 둬도 거의 앞선다', easy > 0.85, true);
  check('보통은 반반에 가깝다', normal > 0.4 && normal < 0.7, true);
  check('어려움은 느긋하게 둬서는 밀린다', hard < 0.3, true);
  check('난이도 순서대로 어려워진다', easy > normal && normal > hard, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

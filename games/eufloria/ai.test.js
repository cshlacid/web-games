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

// --- 세기 ---
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
}

{
  const order = ['soft', 'normal', 'wild'].map((key) => A.LEVELS[key]);
  check('순할수록 뜸하게 생각하고 크게 참는다', [
    order[0].think > order[1].think && order[1].think > order[2].think,
    order[0].edge > order[1].edge && order[1].edge > order[2].edge,
    order[0].opening > order[1].opening && order[1].opening >= order[2].opening,
  ], [true, true, true]);
}

// 사람 대신 '보통' 판단기를 세워 세기별로 승부를 본다. 사람은 이보다 느리므로
// 여기서 나오는 승률이 사람이 겪을 승률의 아래쪽 어림이다.
function match(level, seed, count, limit = 900) {
  const world = L.createWorld(M.generate(seed, count));
  const me = A.LEVELS.normal;
  const foe = A.LEVELS[level];
  let tMe = 0;
  let tFoe = 0;
  for (let t = 0; t < limit && !world.over; t += DT) {
    if (t >= tMe) {
      tMe = t + me.think;
      A.apply(world, 1, A.decide(world, 1, { edge: me.edge, hold: t < me.opening }));
    }
    if (t >= tFoe) {
      tFoe = t + foe.think;
      A.apply(world, 2, A.decide(world, 2, { edge: foe.edge, hold: t < foe.opening }));
    }
    L.step(world, DT);
  }
  return world.over ? world.over.winner : 0;
}

{
  const rate = (level) => {
    let win = 0;
    let n = 0;
    for (const count of [9, 12, 15]) {
      for (let seed = 1; seed <= 12; seed++) { n++; if (match(level, seed, count) === 1) win++; }
    }
    return win / n;
  };
  const soft = rate('soft');
  const wild = rate('wild');
  check('순한 상대는 대체로 진다', soft > 0.7, true);
  check('사나운 상대는 대체로 이긴다', wild < 0.45, true);
  check('세기를 올리면 상대가 세진다', soft > wild, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/conquest/logic.test.js
const L = require('./logic.js');

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

// 실시간 게임이라 판정을 "몇 초 뒤"로 물어야 한다. 한 틱을 잘게 썰어 그 시간만큼 민다.
function run(world, seconds, dt = 1 / 30) {
  const events = [];
  for (let t = 0; t < seconds; t += dt) events.push(...L.step(world, dt));
  return events;
}

const mid = { energy: 60, strength: 60, speed: 60 };

function world(spec) {
  return L.createWorld({
    seed: 1,
    nodes: spec.map((s, id) => ({
      id,
      x: s.x,
      y: s.y,
      r: s.r || 16,
      stats: s.stats || mid,
      owner: s.owner || 0,
      builds: s.builds || [],
      units: s.units || 0,
    })),
  });
}

// 판정이 끼어들지 않게 양쪽 진영을 하나씩 멀리 세워 둔다. 한 진영만 있는 판은
// 첫 틱에 승부가 나 버려 그 뒤를 볼 수 없다.
function arena(spec) {
  return world(spec.concat([
    { x: 2000, y: 0, owner: 1, units: 1 },
    { x: 2000, y: 300, owner: 2, units: 1 },
  ]));
}

// --- 생산 ---
{
  const w = arena([{ x: 0, y: 0, owner: 1, builds: ['factory'], units: 0 }]);
  run(w, 5);
  const grown = w.nodes[0].units[1].n;
  check('생산탑은 병력을 낳는다', grown > 2 && grown < 8, true);

  run(w, 200);
  check('상한에서 멈춘다', Math.round(w.nodes[0].units[1].n), L.capacity(w.nodes[0]));

  const bare = arena([{ x: 0, y: 0, owner: 1, units: 4 }]);
  run(bare, 20);
  check('시설가 없으면 늘지 않는다', bare.nodes[0].units[1].n, 4);
}

{
  const w = arena([{ x: 0, y: 0, owner: 1, builds: ['factory'], units: 120 }]);
  run(w, 30);
  const cap = L.capacity(w.nodes[0]);
  const left = w.nodes[0].units[1].n;
  check('한도를 넘긴 부대는 줄어든다', left > cap && left < 120, true);

  run(w, 600);
  check('줄어도 한도 아래로는 내려가지 않는다', Math.round(w.nodes[0].units[1].n), cap);
}

{
  const w = arena([{ x: 0, y: 0, owner: 1, builds: ['factory'], units: 0 }]);
  w.growth[1] = 0.5;
  run(w, 20);
  const slow = w.nodes[0].units[1].n;

  const fast = arena([{ x: 0, y: 0, owner: 1, builds: ['factory'], units: 0 }]);
  run(fast, 20);
  check('생산 배수를 낮추면 그만큼 천천히 는다',
    Math.abs(slow / fast.nodes[0].units[1].n - 0.5) < 0.01, true);
}

// --- 보내기 ---
{
  const w = arena([
    { x: 0, y: 0, owner: 1, units: 20 },
    { x: 80, y: 0 },
    { x: 300, y: 0 },
  ]);

  check('사거리 밖으로는 못 보낸다', L.canSend(w, 0, 2, 1), false);
  check('남의 거점에서는 못 보낸다', L.canSend(w, 1, 0, 1), false);
  check('사거리 안으로 보낸다', L.send(w, 0, 1, 1, 0.5), true);
  check('보낸 만큼 줄어든다', w.nodes[0].units[1].n, 10);
  check('가는 중에는 도착지에 없다', w.nodes[1].units[1].n, 0);

  run(w, 10);
  check('도착하면 거점에 들어온다', w.nodes[1].units[1].n > 0, true);
  check('다 도착하면 비행이 남지 않는다', w.flights.length, 0);
}

// --- 스탯 물려받기 ---
{
  const strong = { energy: 120, strength: 120, speed: 120 };
  const w = arena([
    { x: 0, y: 0, owner: 1, units: 10, stats: strong },
    { x: 80, y: 0, owner: 1, units: 10, stats: { energy: 20, strength: 20, speed: 20 } },
  ]);
  L.send(w, 0, 1, 1, 1);
  run(w, 10);
  const merged = w.nodes[1].units[1];
  check('부대를 합치면 스탯은 머릿수로 섞인다', Math.round(merged.str), 70);
}

// --- 시설 건설 ---
{
  const w = arena([{ x: 0, y: 0, r: 12, owner: 1, units: 25 }]);
  check('병력 10으로 세운다', L.build(w, 0, 1, 'factory'), true);
  check('세운 만큼 병력이 준다', w.nodes[0].units[1].n, 15);
  check('작은 거점에는 한 그루뿐', L.canBuild(w, 0, 1, 'turret'), false);

  const big = arena([{ x: 0, y: 0, r: 20, owner: 1, units: 25 }]);
  L.build(big, 0, 1, 'factory');
  check('큰 거점에는 더 세운다', L.build(big, 0, 1, 'turret'), true);
  check('병력이 모자라면 못 세운다', L.canBuild(big, 0, 1, 'factory'), false);
}

// --- 전투 ---
{
  const w = arena([{ x: 0, y: 0, owner: 1, units: 30 }]);
  w.nodes[0].units[2] = { n: 10, str: 60, eng: 60, spd: 60 };
  run(w, 20);
  check('많은 쪽이 남는다', [w.nodes[0].units[1].n > 0, w.nodes[0].units[2].n], [true, 0]);
  check('싸운 쪽도 줄어든다', w.nodes[0].units[1].n < 30, true);
  check('싸움만으로는 주인이 바뀌지 않는다', w.nodes[0].owner, 1);
}

{
  const w = arena([{ x: 0, y: 0, r: 20, owner: 1, builds: ['turret', 'turret'] }]);
  w.nodes[0].units[2] = { n: 20, str: 60, eng: 60, spd: 60 };
  run(w, 10);
  check('방어탑은 지키는 병력 없이도 쏜다', w.nodes[0].units[2].n, 0);
  check('쏘는 동안 코어는 버틴다', w.nodes[0].owner, 1);
}

// --- 점령 ---
{
  const w = arena([{ x: 0, y: 0 }]);
  w.nodes[0].units[1] = { n: 12, str: 60, eng: 60, spd: 60 };
  run(w, 20);
  check('빈 거점은 코어만 깎으면 넘어온다', w.nodes[0].owner, 1);
  check('넘어온 코어는 다시 찬다', w.nodes[0].core.hp, L.CORE_HP.owned);
}

{
  const w = arena([{ x: 0, y: 0, r: 16, owner: 2, builds: ['factory'] }]);
  w.nodes[0].units[1] = { n: 40, str: 60, eng: 60, spd: 60 };
  run(w, 3);
  check('시설가 남아 있으면 코어는 멀쩡하다', w.nodes[0].core.hp, L.CORE_HP.owned);
  run(w, 30);
  check('시설을 부수고 나면 넘어온다', [w.nodes[0].owner, w.nodes[0].builds.length], [1, 0]);
}

{
  const w = arena([{ x: 0, y: 0 }]);
  w.nodes[0].units[1] = { n: 6, str: 60, eng: 60, spd: 60 };
  run(w, 3);
  const dented = w.nodes[0].core.hp;
  w.nodes[0].units[1] = L.emptyStack();
  run(w, 20);
  check('공격이 끊기면 코어가 되돌아온다',
    [dented < L.CORE_HP.neutral, w.nodes[0].core.hp], [true, L.CORE_HP.neutral]);
}

// --- 승패 ---
{
  const w = world([
    { x: 0, y: 0, owner: 1, units: 5 },
    { x: 80, y: 0, owner: 2, units: 1 },
  ]);
  check('양쪽이 살아 있으면 아직이다', L.judge(w), null);

  w.nodes[1].owner = 1;
  w.nodes[1].units[2] = L.emptyStack();
  const events = run(w, 1);
  check('상대가 사라지면 이긴다', w.over, { winner: 1 });
  check('끝나는 순간을 알려 준다', events.some((e) => e.type === 'over'), true);
}

{
  const w = world([
    { x: 0, y: 0, owner: 1, units: 8 },
    { x: 80, y: 0, owner: 2, units: 8 },
  ]);
  L.send(w, 0, 1, 1, 1);
  w.nodes[0].owner = 0;
  check('날아가는 부대가 남았으면 아직 진 것이 아니다', L.judge(w), null);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

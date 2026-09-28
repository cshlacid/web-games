'use strict';

// 실행: node games/archmage/sim.test.js
const S = require('./sim.js');

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

function run(state, seconds) {
  const events = [];
  for (let t = 0; t < seconds && !state.pending && !state.over; t += 1 / 60) {
    S.step(state, 1 / 60);
    events.push(...S.drain(state));
  }
  return events;
}

function foe(state, type, x, y, hp = 1000) {
  const f = { id: 999 + state.foes.length, type, x, y, hp, maxHp: hp, r: 11, speed: 0, dmg: 0, slowT: 0, slow: 0, burnT: 0, burn: 0, kx: 0, ky: 0, flash: 0, dead: false, phase: 0 };
  state.foes.push(f);
  return f;
}

// 새길 룬을 억지로 정한다. 제시는 난수라 시험에서는 고정해 둔다.
function engrave(state, id, ci) {
  state.pending = { options: [{ type: 'rune', id }, { type: 'heal' }, { type: 'heal' }] };
  state.queued = 0;
  return S.choose(state, 0, ci);
}

// --- 시작과 첫 제시 ---
{
  const st = S.create({ circle: 1, seed: 5 });
  check('시작하자마자 룬을 고른다', !!st.pending, true);
  check('첫 제시는 원소만', st.pending.options.every((o) => o.type === 'rune' && ['fire', 'water', 'wind', 'earth'].includes(o.id)), true);
  check('제시는 셋', st.pending.options.length, 3);
  const before = st.t;
  S.step(st, 1);
  check('고르는 동안은 멈춘다', st.t, before);
}

// --- 새기기 ---
{
  const st = S.create({ circle: 2, seed: 1 });
  check('불을 새긴다', engrave(st, 'fire', 0), true);
  check('마법이 된다', st.circles[0].spell.kind, 'bolt');
  check('잠긴 마법진에는 못 새긴다', S.placeMode(st, 'wind', 1), null);
  engrave(st, 'wind', 0);
  check('2서클은 두 칸', st.circles[0].runes.map((r) => r.id), ['fire', 'wind']);
  check('찬 마법진에 같은 룬은 강화', S.placeMode(st, 'fire', 0), 'grade');
  check('찬 마법진에 다른 룬은 안 된다', S.placeMode(st, 'water', 0), null);
  engrave(st, 'fire', 0);
  check('강화는 칸을 쓰지 않는다', st.circles[0].runes.map((r) => r.id + r.grade), ['fire1', 'wind0']);
  check('만든 마법이 기록된다', Array.from(st.formed).sort(), ['fire1', 'fire1-wind1']);
}

// --- 1서클은 수식어를 내지 않는다 ---
{
  let modifier = false;
  for (let seed = 1; seed <= 40; seed++) {
    const st = S.create({ circle: 1, seed });
    engrave(st, 'fire', 0);
    st.queued = 1;
    st.pending = null;
    st.xp = 0;
    st.level = 1;
    // 다음 제시를 열어 본다.
    st.queued = 1;
    S.step(st, 0);
    if (st.pending && st.pending.options.some((o) => o.type === 'rune' && !['fire', 'water', 'wind', 'earth'].includes(o.id))) modifier = true;
  }
  check('1서클 제시에는 수식어가 없다', modifier, false);
}

// --- 재각인 ---
{
  const st = S.create({ circle: 2, seed: 1 });
  engrave(st, 'fire', 0);
  engrave(st, 'chain', 0);
  st.pending = { options: [{ type: 'erase' }] };
  check('재각인으로 룬을 지운다', S.choose(st, 0, { ci: 0, slot: 1 }), true);
  check('지운 뒤', st.circles[0].runes.map((r) => r.id), ['fire']);
}

// --- 시전 ---
{
  const st = S.create({ circle: 1, seed: 1 });
  engrave(st, 'fire', 0);
  const f = foe(st, 'slime', 80, 0);
  const ev = run(st, 1.5);
  check('불은 적에게 날아가 맞힌다', f.hp < 1000, true);
  check('시전 이벤트가 난다', ev.some((e) => e.type === 'cast' && e.el === 'fire'), true);
}
{
  const st = S.create({ circle: 1, seed: 1 });
  engrave(st, 'fire', 0);
  const ev = run(st, 0.5);
  check('적이 없으면 탄을 쏘지 않는다', ev.some((e) => e.type === 'cast'), false);
}
{
  const st = S.create({ circle: 1, seed: 1 });
  engrave(st, 'wind', 0);
  const f = foe(st, 'slime', 73, 0);
  run(st, 1);
  check('바람은 둘레의 적을 긁는다', f.hp < 1000, true);
  const c = st.circles[0];
  check('유지가 끝나야 쿨타임이 돈다', c.cd > c.spell.cd, true);
}
{
  const st = S.create({ circle: 3, seed: 1 });
  engrave(st, 'earth', 0);
  engrave(st, 'earth', 0);
  engrave(st, 'water', 0);
  const f = foe(st, 'slime', 100, 0);
  run(st, 1);
  check('물을 더한 땅은 둔화를 건다', f.slow > 0, true);
}
{
  const st = S.create({ circle: 2, seed: 1 });
  engrave(st, 'fire', 0);
  engrave(st, 'echo', 0);
  foe(st, 'slime', 120, 0);
  const ev = run(st, 1);
  check('메아리는 한 번 더 시전한다', ev.some((e) => e.type === 'echo'), true);
}
{
  const st = S.create({ circle: 2, seed: 1 });
  engrave(st, 'fire', 0);
  engrave(st, 'chain', 0);
  foe(st, 'slime', 100, 0);
  const b = foe(st, 'slime', 160, 30);
  run(st, 1.5);
  check('연쇄는 둘레의 적에게 번진다', b.hp < 1000, true);
}

{
  const st = S.create({ circle: 2, seed: 1 });
  engrave(st, 'fire', 0);
  engrave(st, 'anima', 0);
  st.player.hp = 50;
  foe(st, 'slime', 100, 0);
  run(st, 1.5);
  check('흡혈은 입힌 피해로 생명력을 되찾는다', st.player.hp > 50, true);
  const hp = st.player.hp;
  for (let i = 0; i < 40; i++) foe(st, 'slime', 100 + (i % 5) * 4, (i / 5 | 0) * 4);
  run(st, 1);
  check('흡혈은 초당 한도를 넘지 않는다', st.player.hp - hp <= 6 + 0.01, true);
}

// --- 단계 마법 ---
for (const [el, name] of [['fire', '메테오'], ['water', '해일'], ['wind', '토네이도'], ['earth', '지진']]) {
  const st = S.create({ circle: 3, seed: 1 });
  engrave(st, el, 0); engrave(st, el, 0); engrave(st, el, 0);
  const f = foe(st, 'slime', 90, 20);
  run(st, 2.5);
  check(name + '이 적을 친다', f.hp < 1000, true);
}
{
  const st = S.create({ circle: 2, seed: 1 });
  engrave(st, 'fire', 0); engrave(st, 'fire', 0);
  foe(st, 'slime', 90, 0);
  let frag = false;
  for (let i = 0; i < 90 && !frag; i++) { S.step(st, 1 / 60); S.drain(st); frag = st.shots.some((x) => x.frag); }
  check('폭염탄은 터지며 파편을 흩는다', frag, true);
}

// --- 적과 끝 ---
{
  const st = S.create({ circle: 1, seed: 1 });
  engrave(st, 'fire', 0);
  const ev = run(st, 30);
  check('적이 온다', st.foes.length > 0, true);
  check('1분 전에는 포위가 없다', ev.some((e) => e.type === 'burst'), false);
}
{
  const st = S.create({ circle: 1, seed: 1 });
  engrave(st, 'fire', 0);
  st.t = st.duration - 0.01;
  const ev = run(st, 0.1);
  check('밤이 끝나면 사도가 온다', ev.some((e) => e.type === 'boss'), true);
  st.boss.hp = 1;
  st.boss.x = st.player.x + 60;
  st.boss.y = st.player.y;
  st.foes = [st.boss];
  run(st, 2);
  check('사도를 쓰러뜨리면 이긴다', st.over, 'won');
}
{
  const st = S.create({ circle: 1, seed: 1 });
  engrave(st, 'fire', 0);
  const f = foe(st, 'goblin', 0, 0);
  f.dmg = 500;
  run(st, 0.2);
  check('생명력이 다하면 진다', st.over, 'lost');
}

// --- 레벨과 마법진 ---
{
  const st = S.create({ circle: 1, seed: 1 });
  engrave(st, 'fire', 0);
  st.xp = 1000;
  S.step(st, 1 / 60);
  check('경험치가 차면 레벨이 오르고 제시가 뜬다', !!st.pending && st.level > 4, true);
  check('레벨 4에 둘째 마법진이 열린다', st.unlocked >= 2, true);
}

// --- 같은 세계 ---
// 적이 오는 차례는 서클로만 정해진다. 회귀자가 미래를 아는 근거라 깨지면 안 된다.
{
  const a = S.create({ circle: 2, seed: 1 });
  const b = S.create({ circle: 2, seed: 999 });
  engrave(a, 'fire', 0);
  engrave(b, 'fire', 0);
  a.foes = []; b.foes = [];
  const sa = [], sb = [];
  for (let i = 0; i < 600; i++) {
    S.step(a, 1 / 60); S.drain(a);
    S.step(b, 1 / 60); S.drain(b);
  }
  for (const f of a.foes) sa.push(f.type);
  for (const f of b.foes) sb.push(f.type);
  check('룬 운이 달라도 같은 서클의 밤은 같은 적이 온다', sa.slice(0, 12), sb.slice(0, 12));
}
{
  const a = S.create({ circle: 1, seed: 3 });
  const b = S.create({ circle: 1, seed: 3 });
  check('같은 씨앗이면 같은 제시', a.pending.options, b.pending.options);
}

// --- 한 판을 끝까지 ---
// 폰에서 1초에 60번 도는 것이므로 한 판(5분)을 node로 수 초 안에 돌 수 있어야 한다.
{
  const st = S.create({ circle: 1, seed: 7 });
  const t0 = Date.now();
  let guard = 0;
  while (!st.over && st.t < st.duration + 60 && guard++ < 100000) {
    if (st.pending) {
      const o = st.pending.options;
      let done = false;
      for (let i = 0; i < o.length && !done; i++) {
        if (o[i].type !== 'rune') continue;
        for (let ci = 0; ci < 3 && !done; ci++) if (S.placeMode(st, o[i].id, ci)) done = S.choose(st, i, ci);
      }
      if (!done) S.choose(st, o.findIndex((x) => x.type === 'heal'), null);
      continue;
    }
    const a = st.t * 0.4;
    st.input = { x: Math.cos(a), y: Math.sin(a) };
    S.step(st, 1 / 60);
    S.drain(st);
  }
  // 크게 원만 그리는 손이라 보석을 못 주워 일찍 질 수도 있다. 보는 것은 제시에 막히지
  // 않고 승패까지 가는지다.
  check('한 판이 오류 없이 끝까지 돈다', guard < 100000 && (!!st.over || st.t >= st.duration + 60), true);
  check('한 판 시뮬레이션이 5초 안', Date.now() - t0 < 5000, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

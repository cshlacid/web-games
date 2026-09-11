'use strict';

// 실행: node games/defense/rules.test.js
const D = require('./data.js');
const P = require('./paths.js');
const R = require('./rules.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

function mapOf(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const walls = [];
  let entry = null;
  let exit = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      walls.push(c === '#' ? 1 : 0);
      if (c === 'I') entry = { x, y };
      if (c === 'O') exit = { x, y };
    }
  }
  return { w, h, walls, entry, exit };
}

// 폭이 한 칸인 복도. 여기서는 사람을 세우는 것이 곧 완전 봉쇄라 "뚫고 온다"가
// 바로 보인다.
const hall = mapOf(['#I#', '#.#', '#.#', '#.#', '#.#', '#O#']);
// 넓은 판. 돌아갈 자리가 있어 배치와 사거리를 본다.
const field = mapOf(['..I..', '.....', '.....', '.....', '..O..']);

const quiet = [{ index: 1, hp: 100, groups: [], boss: false, reward: 0 }];
const make = (map, extra) => R.createRun(1, Object.assign({ map, waves: quiet, mods: {} }, extra || {}));

const base = make(field);
check('시작 골드와 목숨', [base.gold, base.lives], [D.RUN.gold, D.RUN.lives]);
check('한 판은 열 웨이브', R.createRun(1, {}).waves.length, D.RUN.waves);

// --- 배치 ---
check('벽에는 못 세운다', R.canPlace(make(hall), 'archer', 0, 1), '벽');
check('판 밖에는 못 세운다', R.canPlace(base, 'archer', -1, 0), '판 밖');
check('편성에 없으면 못 세운다',
  R.canPlace(make(field, { roster: ['archer'] }), 'cannon', 1, 1), '편성에 없다');
check('골드가 모자라면 못 세운다', R.canPlace(make(field, { mods: { startGold: 0 } }), 'archer', 1, 1),
  '골드가 모자라다');

const placing = make(field);
R.place(placing, 'archer', 1, 1);
check('세우면 골드가 준다', placing.gold, D.RUN.gold - D.UNITS.archer.cost);
check('같은 칸에는 둘을 못 세운다', R.canPlace(placing, 'archer', 1, 1), '이미 서 있다');
check('통계에 남는다', [placing.stats.placed, placing.stats.kinds.archer], [1, 1]);

R.spawn(placing, 'grunt', 100);
check('적이 밟고 있는 칸에는 못 세운다',
  R.canPlace(placing, 'archer', placing.map.entry.x, placing.map.entry.y), '적이 밟고 있다');

const selling = make(field);
const sold = R.place(selling, 'archer', 1, 1);
R.sell(selling, sold.id);
check('해고하면 일부를 돌려받는다', selling.gold,
  D.RUN.gold - D.UNITS.archer.cost + Math.round(D.UNITS.archer.cost * D.RUN.refund));
check('해고하면 칸이 빈다', selling.cells[1 * selling.map.w + 1], null);

// --- 단계 ---
const up = make(field);
const one = R.place(up, 'archer', 1, 1);
const before = up.gold;
R.upgrade(up, one.id);
check('올리면 값을 치른다', before - up.gold, R.upCost('archer', 1));
check('올리면 단계가 오른다', one.tier, 2);
check('올리면 체력도 오른다', one.max > D.UNITS.archer.hp, true);
check('피해는 단계마다 곱해진다',
  +(R.statOf('archer', 2, {}).damage / R.statOf('archer', 1, {}).damage).toFixed(3),
  +D.UP.damage.toFixed(3));
check('mods는 규칙 바깥에서 들어온다',
  R.statOf('archer', 1, { damage: 2, unit: { archer: { damage: 1.5 } } }).damage,
  D.UNITS.archer.damage * 3);

// --- 누수와 목숨 ---
const leak = make(hall);
R.spawn(leak, 'grunt', 10);
R.run(leak, 30);
check('끝까지 가면 목숨이 준다', leak.stats.livesLost >= 1, true);

const bossLeak = make(hall);
R.spawn(bossLeak, 'boss', 1);
R.run(bossLeak, 60);
check('우두머리가 새면 셋이 준다', bossLeak.stats.livesLost, 3);

// --- 막아 세우기 ---
const block = make(hall);
const wall = R.place(block, 'shield', 1, 3);
R.spawn(block, 'grunt', 50);
// 방패병이 스킬로 붙들어 두므로 예전보다 오래 걸린다 — 기절이 풀린 사이에
// 조금씩 부순다.
for (let i = 0; i < 300; i++) R.step(block, R.TICK);
check('막아 세우면 부수기 시작한다', wall.hp < wall.max, true);
check('부수는 동안은 지나가지 못한다', block.stats.livesLost, 0);

const broken = make(hall);
const frail = R.place(broken, 'archer', 1, 3);
R.spawn(broken, 'breaker', 200);
R.run(broken, 60);
check('다 부수면 그 사람은 사라진다', broken.units.includes(frail), false);
check('부수고 나면 지나간다', broken.stats.livesLost, 1);

// --- 사거리 ---
// 적을 원하는 칸에 세워 놓고 본다. 한 틱만 밀면 그 자리에서 무슨 일이 나는지
// 그대로 드러난다.
// `hold`를 주면 그 자리에 붙들어 둔다. 걷게 두면 몇 초 만에 사거리를 벗어나
// 무엇을 재고 있었는지 알 수 없게 된다.
function stand(run, key, hp, x, y, hold = true) {
  R.spawn(run, key, hp);
  const e = run.foes[run.foes.length - 1];
  e.from = { x, y };
  e.to = null;
  e.p = 0;
  if (hold) e.stunT = 9999;
  return e;
}

const reach = make(field, { mods: { startGold: 10 } });
reach.timer = 9999;
const gunner = R.place(reach, 'cannon', 2, 2);
const hugging = stand(reach, 'grunt', 400, 2, 3);   // 바로 옆
R.run(reach, 4);
check('포수는 코앞의 적을 못 친다', hugging.hp, hugging.max);

const afar = make(field, { mods: { startGold: 10 } });
afar.timer = 9999;
R.place(afar, 'cannon', 2, 0);
const away = stand(afar, 'grunt', 400, 2, 3);
R.run(afar, 4);
check('포수는 떨어진 적을 친다', away.hp < away.max, true);
check('안쪽 한계는 자료에서 나온다', R.statOf('cannon', 1, {}).near, D.UNITS.cannon.range.min - 0.5);
check('붙어 있으면 사거리 밖', R.inRange(R.statOf('cannon', 1, {}), 1), false);
check('두 칸부터 사거리 안', R.inRange(R.statOf('cannon', 1, {}), 2), true);
check('궁수는 네 칸까지', R.inRange(R.statOf('archer', 1, {}), 4), true);
check('대각선 이웃도 한 칸으로 친다', R.inRange(R.statOf('shield', 1, {}), Math.SQRT2), true);
check('다섯 칸은 못 친다', R.inRange(R.statOf('archer', 1, {}), 5), false);
check('단계를 올려도 안쪽 한계는 그대로', R.statOf('cannon', 3, {}).near, R.statOf('cannon', 1, {}).near);
check('단계를 올리면 바깥은 늘어난다', R.statOf('cannon', 3, {}).far > R.statOf('cannon', 1, {}).far, true);

// --- 기본 공격과 스킬 ---
// 스킬은 제 쿨타임이 돌아올 때만 나가고, 그 사이에는 기본 공격이 대신한다.
const aim = make(field, { mods: { startGold: 10 } });
aim.timer = 9999;
R.place(aim, 'archer', 2, 0);
const mark = stand(aim, 'grunt', 9000, 2, 1);
R.step(aim, R.TICK);
check('첫 발은 스킬이라 배수가 붙는다',
  Math.abs((mark.max - mark.hp) - D.UNITS.archer.damage * D.UNITS.archer.skill.mul) < 0.01, true);
mark.hp = mark.max;
R.run(aim, 1.2);
check('쿨타임 중에는 기본 피해가 들어간다',
  Math.abs((mark.max - mark.hp) - D.UNITS.archer.damage) < 0.01, true);
check('쿨타임 중에도 쉬지 않는다', mark.hp < mark.max, true);

const lineHit = make(field, { mods: { startGold: 10 } });
lineHit.timer = 9999;
R.place(lineHit, 'spear', 2, 0);
// 겨누는 것은 출구에 가장 가까운 놈이다. 여기서는 (2,2)가 그쪽이고 (2,1)은
// 창이 지나는 줄 위에 있어 덤으로 맞는다.
const aimed = stand(lineHit, 'grunt', 9000, 2, 2);
const onWay = stand(lineHit, 'grunt', 9000, 2, 1);
const aside = stand(lineHit, 'grunt', 9000, 0, 2);
R.step(lineHit, R.TICK);
check('창의 스킬은 한 줄을 꿰뚫는다', [aimed.hp < aimed.max, onWay.hp < onWay.max], [true, true]);
check('줄 밖은 맞지 않는다', aside.hp, aside.max);
check('꿰뚫린 적에게는 출혈이 남는다', !!onWay.bleed, true);

aimed.hp = aimed.max; onWay.hp = onWay.max;
aimed.bleed = null; onWay.bleed = null;
R.run(lineHit, 2.5);
check('쿨타임 중에는 한 놈만 맞는다', onWay.hp, onWay.max);
check('그동안에도 겨눈 하나는 맞는다', aimed.hp < aimed.max, true);

const bash = make(hall, { mods: { startGold: 10 } });
bash.timer = 9999;
R.place(bash, 'shield', 1, 2);
const bashed = stand(bash, 'grunt', 9000, 1, 1, false);
R.step(bash, R.TICK);
check('방패병의 스킬은 기절시킨다', bashed.stunT > 0, true);

// --- 출혈 ---
const bleeding = make(field, { mods: { startGold: 10 } });
bleeding.timer = 9999;
R.place(bleeding, 'spear', 2, 0);
const cut = stand(bleeding, 'armored', 9000, 2, 1);
R.step(bleeding, R.TICK);
check('맞은 적에게 출혈이 붙는다', !!cut.bleed, true);
const beforeBleed = cut.hp;
cut.bleed = { dps: D.UNITS.spear.skill.bleedDps, t: 1 };
R.run(bleeding, bleeding.time + 1.05);
check('출혈은 시간이 지나며 깎는다', cut.hp < beforeBleed, true);

// 중장병의 방어는 6이다. 지속 피해가 방어를 탄다면 초당 7은 1 남짓만 들어간다.
const armorTest = make(field);
const tough = stand(armorTest, 'armored', 9000, 1, 1);
const toughWas = tough.hp;
tough.bleed = { dps: 6, t: 9 };
R.run(armorTest, 1.05);
check('지속 피해는 방어를 무시한다', Math.abs((toughWas - tough.hp) - 6) < 1, true);

// **지속 피해에는 최소 1이 붙지 않는다.** 틱마다 1이 들어가면 초당 서른이 된다.
const drip = make(field);
const slowly = stand(drip, 'grunt', 9000, 1, 1);
const was = slowly.hp;
for (let i = 0; i < 30; i++) {
  slowly.bleed = { dps: 3, t: 9 };
  R.step(drip, R.TICK);
}
check('한 틱에 들어가는 지속 피해는 값 그대로', was - slowly.hp < 6, true);

// --- 바닥 얼음 ---
check('빙결술사의 쿨타임이 가장 길다',
  Object.keys(D.UNITS).every((k) => D.UNITS[k].skill.cd <= D.UNITS.frost.skill.cd), true);

const icy = make(field, { mods: { startGold: 10 } });
icy.timer = 9999;
R.place(icy, 'frost', 2, 0);
const chilled = stand(icy, 'grunt', 9000, 2, 2);
R.run(icy, 3);
check('빙결술사는 바닥을 깐다', icy.zones.length > 0, true);
check('밟은 적은 느려진다', chilled.slowT > 0, true);
check('밟은 적은 깎인다', chilled.hp < chilled.max, true);
check('얼음이 무한히 쌓이지는 않는다', icy.zones.length <= 12, true);

// 쿨타임이 9초이므로 20초를 돌려도 몇 번뿐이다.
const paced = make(field, { mods: { startGold: 10 } });
paced.timer = 9999;
R.place(paced, 'frost', 2, 0);
stand(paced, 'grunt', 90000, 2, 2);
R.run(paced, 20);
check('긴 쿨타임만큼만 쓴다', paced.stats.skills <= Math.ceil(20 / D.UNITS.frost.skill.cd), true);
check('그 사이에도 때린다', paced.foes[0].hp < paced.foes[0].max, true);

const melt = make(field, { mods: { startGold: 10 } });
melt.timer = 9999;
R.place(melt, 'frost', 2, 0);
stand(melt, 'grunt', 9000, 2, 2);
R.run(melt, 2);
melt.foes.length = 0;
R.run(melt, 2 + D.UNITS.frost.skill.fieldFor + 1);
check('시간이 지나면 얼음이 녹는다', melt.zones.length, 0);

// --- 회복 ---
const heal = make(field, { mods: { startGold: 3 } });
const hurt = R.place(heal, 'shield', 2, 2);
R.place(heal, 'healer', 2, 3);
hurt.hp = 10;
R.run(heal, 5);
check('힐러는 아군을 되살린다', hurt.hp > 10, true);

const tooFar = make(field, { mods: { startGold: 3 } });
const lonely = R.place(tooFar, 'shield', 0, 0);
R.place(tooFar, 'healer', 4, 4);
lonely.hp = 10;
R.run(tooFar, 5);
check('사거리 밖은 되살리지 못한다', lonely.hp, 10);

// 멀쩡한 판에서 치유가 헛돌면 힐러는 그 판 내내 아무것도 하지 않는다.
const idle = make(field, { mods: { startGold: 10 } });
idle.timer = 9999;
R.place(idle, 'healer', 2, 0);
const poked = stand(idle, 'grunt', 9000, 2, 1);
R.run(idle, 3);
check('되살릴 이가 없으면 힐러도 적을 친다', poked.hp < poked.max, true);

// --- 골드와 승패 ---
const bounty = make(field);
R.place(bounty, 'archer', 2, 1);
const purse = bounty.gold;
R.spawn(bounty, 'swarm', 1);
R.run(bounty, 10);
check('잡으면 골드가 들어온다', bounty.gold > purse, true);

const lose = make(hall, { mods: { lives: -4 } });
R.spawn(lose, 'grunt', 1);
R.run(lose, 30);
check('목숨이 다하면 진다', lose.over, 'lost');

const win = make(field, { waves: [{ index: 1, hp: 1, groups: [{ foe: 'swarm', count: 1, gap: 0 }], boss: false, reward: 10 }] });
R.place(win, 'archer', 2, 1);
R.run(win, 120);
check('웨이브를 다 막으면 이긴다', win.over, 'won');

// --- 영웅 자리 ---
D.UNITS.testHero = { name: '시험 영웅', cost: 10, damage: 5, range: 2, rate: 1, hp: 50, kind: 'single', hero: true };
const hero = make(field, { roster: ['testHero'] });
R.place(hero, 'testHero', 1, 1);
check('영웅을 부르면 통계에 남는다', hero.stats.heroUsed, true);
check('영웅은 한 판에 한 번', R.canPlace(hero, 'testHero', 2, 1), '영웅은 한 판에 한 번');
delete D.UNITS.testHero;

// --- 시간 ---
const clamp = make(field);
R.step(clamp, 10);
check('밀린 시간은 버린다', clamp.time <= 0.1 + R.TICK, true);

// 같은 판을 같은 손으로 두면 같은 결과가 나와야 한다.
function played() {
  const r = make(hall, { waves: [{ index: 1, hp: 60, groups: [{ foe: 'grunt', count: 5, gap: 0.5 }], boss: false, reward: 0 }] });
  R.place(r, 'archer', 1, 2);
  R.run(r, 200);
  return [r.over, r.lives, Math.round(r.time * 100), r.gold];
}
check('같은 손이면 같은 판', played(), played());

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);

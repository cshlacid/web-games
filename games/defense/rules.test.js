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
for (let i = 0; i < 90; i++) R.step(block, R.TICK);
check('막아 세우면 부수기 시작한다', wall.hp < wall.max, true);
check('부수는 동안은 지나가지 못한다', block.stats.livesLost, 0);

const broken = make(hall);
const frail = R.place(broken, 'archer', 1, 3);
R.spawn(broken, 'breaker', 200);
R.run(broken, 60);
check('다 부수면 그 사람은 사라진다', broken.units.includes(frail), false);
check('부수고 나면 지나간다', broken.stats.livesLost, 1);

// --- 성격 ---
const armor = make(field);
const spear = R.statOf('spear', 1, {});
const archer = R.statOf('archer', 1, {});
const pierced = make(field);
R.spawn(armor, 'armored', 100);
R.spawn(pierced, 'armored', 100);
const a0 = armor.foes[0].hp;
armor.foes[0].hp -= Math.max(1, archer.damage - D.FOES.armored.armor);
pierced.foes[0].hp -= Math.max(1, spear.damage);
check('중장병에게는 방어만큼 덜 들어간다', a0 - armor.foes[0].hp, archer.damage - D.FOES.armored.armor);
check('창병은 방어를 무시한다', a0 - pierced.foes[0].hp, spear.damage);

const slow = make(field);
R.place(slow, 'frost', 2, 1);
R.spawn(slow, 'grunt', 400);
R.run(slow, 4);
check('빙결술사는 느리게 만든다', slow.foes[0].slowT > 0, true);

const heal = make(field, { mods: { startGold: 3 } });
const hurt = R.place(heal, 'shield', 2, 2);
R.place(heal, 'healer', 2, 3);
hurt.hp = 10;
R.run(heal, 5);
check('힐러는 아군을 되살린다', hurt.hp > 10, true);

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

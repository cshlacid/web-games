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
// 영웅은 더 길어도 된다 — 한 판에 한 번뿐이라 다른 자에 선다.
check('일반 캐릭터 중에서는 빙결술사가 가장 길다',
  Object.keys(D.UNITS).filter((k) => !D.UNITS[k].hero)
    .every((k) => D.UNITS[k].skill.cd <= D.UNITS.frost.skill.cd), true);

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

// --- 막는 것은 값이 아니라 공격의 종류다 ---
// 중장병은 한 놈씩 때리는 공격에 강하다. 범위·관통·지속은 제값이 들어간다.
check('중장병은 한 놈씩 때리는 공격에 강하다', D.FOES.armored.resist > 0.5, true);
check('보병에게는 그런 것이 없다', D.FOES.grunt.resist, 0);

const single = make(field, { mods: { startGold: 10 } });
single.timer = 9999;
R.place(single, 'archer', 2, 0);
const tanky = stand(single, 'armored', 90000, 2, 1);
R.run(single, 1);
const throughSingle = tanky.max - tanky.hp;

const wide = make(field, { mods: { startGold: 10 } });
wide.timer = 9999;
R.place(wide, 'spear', 2, 0);
const same = stand(wide, 'armored', 90000, 2, 1);
R.step(wide, R.TICK);
const throughArea = same.max - same.hp;
check('관통은 같은 적에게 훨씬 많이 들어간다', throughArea > throughSingle * 2, true);

// --- 대마법사의 기본 공격은 범위다 ---
// 스킬이 아니라 기본 공격이 둘레까지 닿는지 본다. 쿨타임을 밀어 두어 운석이
// 섞이지 않게 한다.
const blast = make(field, { roster: D.HERO_KEYS, mods: { startGold: 10 } });
blast.timer = 9999;
const mage = R.place(blast, 'arch', 2, 0);
mage.scd = 9999;
// 출구에 가장 가까운 (2,3)이 표적이고, (3,3)은 그 옆, (0,0)은 사거리 안이지만
// 표적에서 멀다.
const meteorTarget = stand(blast, 'grunt', 9000, 2, 3);
const meteorNear = stand(blast, 'grunt', 9000, 3, 3);
const meteorFar = stand(blast, 'grunt', 9000, 0, 0);
R.step(blast, R.TICK);
check('대마법사의 기본 공격이 둘레의 적도 맞힌다',
  [meteorTarget.hp < meteorTarget.max, meteorNear.hp < meteorNear.max], [true, true]);
check('둘레라도 범위 밖은 안 맞는다', meteorFar.hp, meteorFar.max);

const plain = make(field, { mods: { startGold: 10 } });
plain.timer = 9999;
const shooter = R.place(plain, 'archer', 2, 0);
shooter.scd = 9999;
const arrowTarget = stand(plain, 'grunt', 9000, 2, 2);
const arrowNear = stand(plain, 'grunt', 9000, 3, 2);
R.step(plain, R.TICK);
check('궁수의 기본은 그대로 한 놈만', arrowNear.hp, arrowNear.max);
check('그 한 놈은 맞는다', arrowTarget.hp < arrowTarget.max, true);

// 범위는 `single`이 아니라 `area`로 들어가므로 중장병의 저항을 타지 않는다.
const mageHeavy = make(field, { roster: D.HERO_KEYS, mods: { startGold: 10 } });
mageHeavy.timer = 9999;
R.place(mageHeavy, 'arch', 2, 0).scd = 9999;
const heavyA = stand(mageHeavy, 'armored', 90000, 2, 2);
R.step(mageHeavy, R.TICK);
const mageThrough = heavyA.max - heavyA.hp;
const mageStat = R.statOf('arch', 1, mageHeavy.mods);
check('대마법사의 기본은 중장병의 저항을 안 탄다',
  mageThrough > mageStat.damage * 0.9, true);

// --- 같은 종류는 여섯까지 ---
const crowd = make(field, { mods: { startGold: 40 } });
let put = 0;
for (let y = 0; y < field.h; y++) {
  for (let x = 0; x < field.w; x++) if (R.place(crowd, 'archer', x, y)) put++;
}
check('같은 종류는 여섯까지', put, D.MOST_OF_KIND);
check('한도에 닿으면 이유를 말한다',
  R.canPlace(crowd, 'archer', 4, 4).includes(String(D.MOST_OF_KIND)), true);
check('다른 종류는 그대로 세울 수 있다', R.canPlace(crowd, 'shield', 4, 4), null);

// 겹쳐 세울수록 비싸진다. 섞는 쪽이 싸지는 자리다.
const pricey = make(field, { mods: { startGold: 40 } });
const first = R.costOf(pricey, 'archer');
R.place(pricey, 'archer', 1, 1);
check('둘째부터 값이 오른다', R.costOf(pricey, 'archer') > first, true);
check('다른 종류 값은 그대로', R.costOf(pricey, 'shield'), D.UNITS.shield.cost);
const paid = R.costOf(pricey, 'archer');
const second = R.place(pricey, 'archer', 2, 2);
check('치른 값을 들고 있는다', second.paid, paid);
const kept = pricey.gold;
R.sell(pricey, second.id);
check('돌려받는 몫은 치른 값 기준', pricey.gold - kept, Math.round(paid * D.RUN.refund));

// --- 단계가 바꾸는 리듬 ---
// 피해만 오르면 빙결술사처럼 값이 "바닥을 얼려 둔 시간"에 있는 캐릭터는 올려도
// 체감이 없다.
const iceOne = R.statOf('frost', 1, {});
const iceThree = R.statOf('frost', 3, {});
check('단계를 올리면 쿨타임이 준다', iceThree.skill.cd < iceOne.skill.cd, true);
check('단계를 올리면 지속이 는다', iceThree.skill.fieldFor > iceOne.skill.fieldFor, true);
check('얼음이 깔려 있는 비율이 오른다',
  iceThree.skill.fieldFor / iceThree.skill.cd > iceOne.skill.fieldFor / iceOne.skill.cd, true);
check('출혈도 길어진다', R.statOf('spear', 3, {}).skill.bleedFor > D.UNITS.spear.skill.bleedFor, true);
check('기절도 길어진다', R.statOf('shield', 3, {}).skill.stunFor > D.UNITS.shield.skill.stunFor, true);
check('자료 원본은 그대로다',
  [D.UNITS.frost.skill.cd, D.UNITS.frost.skill.fieldFor], [9, 4]);
check('1단계는 자료 그대로', iceOne.skill.cd, D.UNITS.frost.skill.cd);

// 실제로 더 자주 나가는가.
function zonesIn(tier, seconds) {
  const r = make(field, { mods: { startGold: 10 } });
  r.timer = 9999;
  const u = R.place(r, 'frost', 2, 0);
  u.tier = tier;
  stand(r, 'grunt', 900000, 2, 2);
  R.run(r, seconds);
  return r.stats.skills;
}
check('3단계가 1단계보다 자주 깐다', zonesIn(3, 30) > zonesIn(1, 30), true);

// --- 기여도 ---
// 판이 끝난 뒤 "누가 얼마나 했는가"를 읽는 자료. 리포트가 이것만 본다.
const credit = make(field, { mods: { startGold: 10 } });
credit.timer = 9999;
R.place(credit, 'archer', 2, 0);
const shot = stand(credit, 'grunt', 9000, 2, 1);
R.run(credit, 3);
check('때린 몫이 그 사람에게 쌓인다', R.tally(credit, 'archer').dealt > 0, true);
check('때린 값과 적이 잃은 값이 같다',
  Math.abs(R.tally(credit, 'archer').dealt - (shot.max - shot.hp)) < 0.01, true);
check('고용한 수가 남는다', R.tally(credit, 'archer').hired, 1);
check('쓴 골드가 남는다', R.tally(credit, 'archer').spent, D.UNITS.archer.cost);

// **넘치는 몫은 세지 않는다.** 마지막 한 방이 판 전체의 피해를 가져가면 리포트가
// 누가 일했는지가 아니라 누가 막타를 쳤는지를 말하게 된다.
const overkill = make(field, { mods: { startGold: 10 } });
overkill.timer = 9999;
R.place(overkill, 'archer', 2, 0);
const tiny = stand(overkill, 'swarm', 1, 2, 1);
R.run(overkill, 1);
check('넘치는 피해는 세지 않는다', R.tally(overkill, 'archer').dealt <= tiny.max, true);
check('잡은 수가 남는다', R.tally(overkill, 'archer').kills, 1);

const soaked = make(hall, { mods: { startGold: 10 } });
soaked.timer = 9999;
R.place(soaked, 'shield', 1, 3);
R.spawn(soaked, 'grunt', 400);
R.run(soaked, 20);
check('몸으로 받아 낸 피해가 남는다', R.tally(soaked, 'shield').taken > 0, true);

const mended = make(field, { mods: { startGold: 3 } });
const scarred = R.place(mended, 'shield', 2, 2);
R.place(mended, 'healer', 2, 3);
scarred.hp = 10;
R.run(mended, 6);
check('되살린 양이 남는다', R.tally(mended, 'healer').healed > 0, true);
check('되살린 양은 실제로 오른 만큼', Math.abs(R.tally(mended, 'healer').healed - (scarred.hp - 10)) < 0.01, true);

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

// --- 영웅 ---
const hero = make(field, { roster: D.HERO_KEYS, mods: { startGold: 10 } });
R.place(hero, 'blade', 1, 1);
check('영웅을 부르면 통계에 남는다', hero.stats.heroUsed, true);
check('영웅은 한 판에 한 번', R.canPlace(hero, 'blade', 2, 1), '영웅은 한 판에 한 번');
check('다른 영웅도 못 부른다', R.canPlace(hero, 'saint', 2, 1), '영웅은 한 판에 한 번');
check('셋 다 영웅 표시를 달고 있다', D.HERO_KEYS.every((k) => D.UNITS[k].hero), true);

// 회전베기는 목표가 아니라 **자기를 가운데로** 삼는다.
const spin = make(field, { roster: D.HERO_KEYS, mods: { startGold: 10 } });
spin.timer = 9999;
R.place(spin, 'blade', 2, 2);
const near1 = stand(spin, 'grunt', 9000, 2, 1);
const near2 = stand(spin, 'grunt', 9000, 1, 2);
const outside = stand(spin, 'grunt', 9000, 4, 4);
R.step(spin, R.TICK);
check('회전베기는 둘레를 통째로 벤다', [near1.hp < near1.max, near2.hp < near2.max], [true, true]);
check('둘레 밖은 맞지 않는다', outside.hp, outside.max);

// 성기사의 치유는 다친 아군을 한꺼번에 되살린다.
const bless = make(field, { roster: [...D.HERO_KEYS, 'shield'], mods: { startGold: 20 } });
bless.timer = 9999;
const hurtA = R.place(bless, 'shield', 1, 1);
const hurtB = R.place(bless, 'shield', 3, 1);
R.place(bless, 'saint', 2, 2);
hurtA.hp = 20;
hurtB.hp = 20;
R.run(bless, 2);
check('치유의 빛은 여럿을 한꺼번에', [hurtA.hp > 20, hurtB.hp > 20], [true, true]);
check('되살린 양이 기여도에 남는다', R.tally(bless, 'saint').healed > 0, true);

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

'use strict';

// 실행: node games/defense/meta.test.js
const D = require('./data.js');
const R = require('./rules.js');
const T = require('./meta.js');

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

const fresh = () => T.blank();

check('처음에는 궁수 하나', [fresh().owned, fresh().team], [[D.STARTER], [D.STARTER]]);
check('처음 편성 칸', T.slotsOf(fresh()), T.SLOTS_BASE);

// 저장본은 무엇이 들어와도 살아남아야 한다. 캐릭터나 축을 더한 뒤 옛 저장본을
// 여는 일이 실제로 생긴다.
check('쓰레기 저장본은 기본값', T.patch('아무거나'), fresh());
check('없는 캐릭터는 걸러낸다', T.patch({ owned: ['archer', '없는놈'] }).owned, ['archer']);
check('상한을 넘긴 축은 깎는다', T.patch({ perks: { slots: 99 } }).perks.slots, T.PERKS.slots.max);
check('음수 보석은 0', T.patch({ gems: -5 }).gems, 0);
check('편성은 보유한 것만', T.patch({ owned: ['archer'], team: ['archer', 'cannon'] }).team, ['archer']);
check('모르는 칸은 무시한다', T.patch({ 옛날칸: 1 }).gems, 0);

// --- 성장 ---
const grow = fresh();
check('레벨이 없으면 계수는 1', T.modsOf(grow).unit.archer.damage, 1);
grow.gems = 1000;
T.buyLevel(grow, 'archer');
check('레벨은 곱으로 붙는다', +T.modsOf(grow).unit.archer.damage.toFixed(4), +T.LEVEL_STEP.toFixed(4));
check('레벨을 올리면 값이 나간다', grow.gems < 1000, true);
check('비용은 레벨마다 오른다', T.levelCost(grow, 'archer') > T.levelCost(fresh(), 'archer'), true);
check('가지지 않은 캐릭터는 못 올린다', T.buyLevel(grow, 'cannon'), false);

const poor = fresh();
check('보석이 없으면 못 올린다', T.buyLevel(poor, 'archer'), false);

const perk = fresh();
perk.gems = 100000;
for (let i = 0; i < 20; i++) T.buyPerk(perk, 'slots');
check('축은 상한에서 멈춘다', perk.perks.slots, T.PERKS.slots.max);
check('편성 칸이 늘면 자리도 는다', T.slotsOf(perk), T.SLOTS_BASE + T.PERKS.slots.max);
check('목숨 축은 mods로 나간다', T.modsOf(T.patch({ perks: { lives: 2 } })).lives, 2);
check('시작 골드 축도 mods로', T.modsOf(T.patch({ perks: { purse: 5 } })).startGold, 1.5);

// --- 새 캐릭터 ---
const hire = fresh();
hire.gems = 100000;
for (let i = 0; i < 5; i++) T.buyLevel(hire, 'archer');
T.grant(hire, 'cannon');
check('새 캐릭터는 평균 레벨로 들어온다', T.levelOf(hire, 'cannon'), 5);
check('이미 가진 캐릭터는 다시 못 받는다', T.grant(hire, 'cannon'), false);
check('받으면 편성에 자리가 있으면 들어간다', hire.team.includes('cannon'), true);

const team = fresh();
T.grant(team, 'cannon');
T.grant(team, 'frost');
T.grant(team, 'spear');
check('편성은 칸을 넘지 않는다', team.team.length, T.slotsOf(team));
check('칸이 찼으면 더 못 넣는다', T.toggleTeam(team, 'spear'), false);
T.toggleTeam(team, 'cannon');
check('빼면 자리가 난다', team.team.includes('cannon'), false);
const solo = fresh();
check('마지막 하나는 뺄 수 없다', T.toggleTeam(solo, D.STARTER), false);

// --- 보상 ---
const won = R.createRun(3, {});
won.over = 'won';
won.wave = D.RUN.waves;
won.lives = 5;
const lost = R.createRun(3, {});
lost.over = 'lost';
lost.wave = 5;
check('이긴 판이 진 판보다 많이 준다',
  T.gemsFor(fresh(), 3, won, false) > T.gemsFor(fresh(), 3, lost, false), true);
check('진 판도 준다', T.gemsFor(fresh(), 3, lost, false) > 0, true);
check('스테이지가 높으면 더 준다',
  T.gemsFor(fresh(), 6, won, false) > T.gemsFor(fresh(), 3, won, false), true);
const again = fresh();
again.cleared[3] = true;
check('첫 클리어에 보너스가 붙는다',
  T.gemsFor(fresh(), 3, won, false) > T.gemsFor(again, 3, won, false), true);

const cards = T.cardsFor(fresh(), 3, 3, () => 0.5);
check('카드는 부른 만큼 나온다', cards.length, 3);
check('잠긴 캐릭터가 있으면 해금 카드가 있다', cards.some((c) => c.kind === 'unlock'), true);
const full = fresh();
for (const k of D.LOCKED) T.grant(full, k);
const noUnlock = T.cardsFor(full, 3, 3, () => 0.5);
check('다 열렸으면 해금 카드는 없다', noUnlock.some((c) => c.kind === 'unlock'), false);
check('그래도 카드는 나온다', noUnlock.length, 3);

const take = fresh();
T.takeCard(take, { kind: 'gems', amount: 40 });
check('보석 카드', take.gems, 40);
T.takeCard(take, { kind: 'items', id: 'bomb', count: 2 });
check('아이템 카드', take.items.bomb, 2);
check('아이템을 쓰면 준다', [T.useItem(take, 'bomb'), take.items.bomb], [true, 1]);
T.useItem(take, 'bomb');
check('없으면 못 쓴다', T.useItem(take, 'bomb'), false);

// --- 정산 ---
const settle = fresh();
const clear = R.createRun(2, {});
clear.over = 'won';
clear.wave = D.RUN.waves;
clear.lives = 5;
clear.stats.livesLost = 0;
clear.stats.time = 100;
clear.stats.placed = 2;
clear.stats.kinds = { archer: 2 };
clear.stats.goldLeft = 999;
clear.stats.upgrades = 0;
clear.stats.bossFrom = 90;
clear.stats.bossAt = 95;
const got = T.settle(settle, 2, clear, () => 0.5);
check('클리어하면 기록이 오른다', settle.best, 2);
check('클리어한 스테이지는 남는다', settle.cleared[2], true);
check('목표를 채우면 카드가 나온다', got.cards.length > 0, true);
check('보석이 들어온다', settle.gems, got.gems);

const missed = fresh();
const sloppy = R.createRun(2, {});
sloppy.over = 'won';
sloppy.wave = D.RUN.waves;
sloppy.lives = 1;
sloppy.stats.livesLost = 4;
sloppy.stats.time = 999;
sloppy.stats.placed = 20;
sloppy.stats.kinds = { archer: 1, cannon: 1 };
sloppy.stats.upgrades = 5;
sloppy.stats.goldLeft = 0;
const weak = T.settle(missed, 2, sloppy, () => 0.5);
check('목표를 못 채우면 카드가 없다', weak.cards.length, 0);
check('그래도 클리어는 클리어', missed.cleared[2], true);

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);

'use strict';

// 실행: node games/healer/loot.test.js
// 기획서 16장의 세 분배 방식. 경매는 후순위로 미뤄 둔 기능이라 여기 없다.
const D = require('./data.js');
const Loot = require('./loot.js');
const Items = require('./items.js');

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

const MEMBERS = [
  { id: 'hero', name: '주인공', job: 'healer' },
  { id: 'bran', name: '브란', job: 'tank' },
  { id: 'lyle', name: '라일', job: 'dealer' },
  { id: 'mira', name: '미라', job: 'dealer' },
  { id: 'noa', name: '노아', job: 'healer' },
];

const counts = (result) => MEMBERS.map((m) => result.byMember[m.id].length);
const jobOf = (id) => MEMBERS.find((m) => m.id === id).job;

// 전리품 하나는 { defId, tier } 꼴이다. 등급이 붙는 것은 장비뿐이다.
const gear = (defId, tier) => Items.make(defId, tier || 0, 1);
const names = (list) => list.map((item) => Items.name(item));

// --- 전리품은 퀘스트가 들고 온다 ----------------------------------------
{
  const Q = require('./quests.js');
  const quest = Q.generate(6, 99)[0];
  check('의뢰에 전리품이 붙어 있다', quest.drops.length > 0, true);
  check('전부 아는 물건이다', quest.drops.every((item) => Boolean(Items.def(item))), true);
  check('같은 씨앗이면 같은 전리품', names(Q.generate(6, 99)[0].drops), names(quest.drops));
}

// --- 균등 분배 ----------------------------------------------------------
{
  const drops = [gear('fang'), gear('pelt'), gear('shield'), gear('bow'), gear('charm')];
  const result = Loot.distribute(drops, MEMBERS, 'even', 4);
  check('전부 누군가에게 간다', result.awards.length, drops.length);
  // 다섯 명에게 다섯 개면 정확히 하나씩이어야 한다.
  check('사람 수만큼이면 하나씩', counts(result).sort(), [1, 1, 1, 1, 1]);

  // 개수가 딱 나뉘지 않아도 차이가 하나를 넘지 않아야 균등이다.
  const seven = Loot.distribute(drops.concat([gear('fang'), gear('pelt')]), MEMBERS, 'even', 4);
  const got = counts(seven);
  check('나머지가 있어도 차이는 하나까지', Math.max(...got) - Math.min(...got) <= 1, true);

  // 늘 첫 사람부터 돌리면 균등하지 않다. 씨앗에 따라 시작이 달라야 한다.
  const starts = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
    Loot.distribute([gear('fang')], MEMBERS, 'even', seed).awards[0].toId);
  check('시작 위치가 고정되어 있지 않다', new Set(starts).size > 1, true);
}

// --- 직업 우선 ----------------------------------------------------------
{
  // 방패는 탱커, 활은 딜러, 부적은 힐러가 쓴다.
  const result = Loot.distribute([gear('shield'), gear('bow'), gear('charm')], MEMBERS, 'job', 7);
  check('방패는 탱커에게', jobOf(result.awards[0].toId), 'tank');
  check('활은 딜러에게', jobOf(result.awards[1].toId), 'dealer');
  check('부적은 힐러에게', jobOf(result.awards[2].toId), 'healer');

  // 파티에 탱커가 하나뿐이면 다른 후보가 없으므로 주사위를 굴리지 않는다.
  check('후보가 하나면 그냥 준다', result.awards[0].rolls, undefined);
  check('이유가 적혀 있다', result.awards[0].reason, '탱커 우선');

  // 같은 직업이 둘이면 적게 받은 쪽부터. 딜러 둘에게 활 둘이면 하나씩이다.
  const two = Loot.distribute([gear('bow'), gear('bow')], MEMBERS, 'job', 7);
  check('같은 직업 둘이면 나눠 갖는다',
    [two.byMember.lyle.length, two.byMember.mira.length].sort(), [1, 1]);

  // 쓸 직업이 파티에 없으면 우선권이 생기지 않는다.
  const noTank = MEMBERS.filter((m) => m.job !== 'tank');
  const orphan = Loot.distribute([gear('shield')], noTank, 'job', 7);
  check('쓸 직업이 없으면 주사위로 넘어간다', orphan.awards[0].reason, '탱커 없음 · 주사위');
  check('그때는 굴린 값이 남는다', orphan.awards[0].rolls.length, noTank.length);

  // 직업을 가리지 않는 물건도 마찬가지다.
  const plain = Loot.distribute([gear('crystal')], MEMBERS, 'job', 7);
  check('직업 무관 물건도 주사위', plain.awards[0].reason, '직업 무관 · 주사위');
}

// --- 주사위 -------------------------------------------------------------
{
  const result = Loot.distribute([gear('shield'), gear('bow')], MEMBERS, 'dice', 21);
  check('참여자 모두가 굴린다', result.awards[0].rolls.length, MEMBERS.length);
  check('1~100 사이',
    result.awards[0].rolls.every((r) => r.roll >= 1 && r.roll <= 100), true);

  const top = result.awards[0].rolls.reduce((a, b) => (b.roll > a.roll ? b : a));
  check('가장 높은 사람이 가져간다', result.awards[0].toId, top.id);
  check('직업은 보지 않는다', jobOf(result.awards[0].toId) === 'tank', jobOf(top.id) === 'tank');

  // 같은 물건이라도 굴릴 때마다 달라야 주사위다.
  const winners = [1, 2, 3, 4, 5, 6].map((seed) =>
    Loot.distribute([gear('shield')], MEMBERS, 'dice', seed).awards[0].toId);
  check('씨앗이 다르면 결과도 달라진다', new Set(winners).size > 1, true);
}

// --- 재현성 -------------------------------------------------------------
{
  // 화면에서 방식을 바꿔 가며 보는 동안 주사위가 다시 굴려지면, 원하는 결과가
  // 나올 때까지 왔다 갔다 하면 그만이다. 같은 씨앗이면 같은 결과여야 한다.
  const drops = [gear('shield'), gear('bow'), gear('crystal')];
  for (const method of ['even', 'job', 'dice']) {
    const once = Loot.distribute(drops, MEMBERS, method, 55);
    const twice = Loot.distribute(drops, MEMBERS, method, 55);
    check(`${method}: 다시 굴려도 같다`, once.awards, twice.awards);
  }

  // 방식을 바꿨다 되돌려도 마찬가지다.
  const before = Loot.distribute(drops, MEMBERS, 'dice', 55);
  Loot.distribute(drops, MEMBERS, 'even', 55);
  check('방식을 오갔다 돌아와도 같다',
    Loot.distribute(drops, MEMBERS, 'dice', 55).awards, before.awards);
}

// --- 참여자 목록 --------------------------------------------------------
{
  // 파티가 셋뿐이어도 돌아가야 한다. 다섯을 채우지 않고 나가는 것이 가능하다.
  const small = MEMBERS.slice(0, 3);
  const result = Loot.distribute([gear('fang'), gear('pelt'), gear('shield'), gear('bow')],
    small, 'even', 2);
  check('참여자만 받는다',
    result.awards.every((a) => small.some((m) => m.id === a.toId)), true);
  check('빠진 사람에게는 가지 않는다', result.byMember.mira, undefined);

  // 모르는 방식을 넘기면 균등으로 떨어진다 — 화면이 잘못 불러도 보상이 사라지면 안 된다.
  const fallback = Loot.distribute([gear('fang')], MEMBERS, '경매', 2);
  check('모르는 방식은 균등으로', fallback.method, 'even');
}

// --- 이름 표시 ----------------------------------------------------------
{
  check('장비 이름에는 등급이 붙는다', Items.name(gear('shield', 2)), '튼튼한 참나무 방패');
  check('재료 이름에는 등급이 붙지 않는다', Items.name(gear('fang', 2)), '고블린 이빨');
  check('등급이 오르면 수치도 오른다',
    Items.stats(gear('shield', 2)).hp > Items.stats(gear('shield', 0)).hp, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

'use strict';

// 실행: node games/archmage/runes.test.js
const R = require('./runes.js');

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

const rs = (...ids) => ids.map((id) => ({ id, grade: 0 }));

// --- 형태와 열쇠 ---
check('원소가 없으면 시전하지 않는다', R.compose(rs('chain', 'omni')), null);
check('불 하나는 탄', R.compose(rs('fire')).kind, 'bolt');
check('물 하나는 창', R.compose(rs('water')).kind, 'lance');
check('바람 하나는 둘레', R.compose(rs('wind')).kind, 'orbit');
check('땅 하나는 지대', R.compose(rs('earth')).kind, 'zone');
check('룬을 가장 많이 쓰는 마법이 발동한다', R.compose(rs('fire', 'wind', 'wind')).kind, 'orbit');
check('불·불·물은 불 둘의 마법에 물이 남는다', [R.compose(rs('fire', 'fire', 'water')).key, R.compose(rs('fire', 'fire', 'water')).extra], ['fire2', { water: 1 }]);
check('같은 수면 먼저 새긴 룬을 쓰는 쪽', [R.compose(rs('water', 'fire', 'fire')).key, R.compose(rs('water', 'fire', 'fire')).extra], ['fire1-water1', { fire: 1 }]);
check('더 많은 룬을 쓰는 특수 조합이 이긴다', R.compose(rs('fire', 'fire', 'water', 'water')).key, 'fire2-water2');
check('셋이 다 쓰이는 조합이 없으면 둘을 쓴다', R.compose(rs('fire', 'water', 'wind', 'wind')).key, 'fire1-water1-wind1');
check('열쇠에 수식어는 들어가지 않는다', R.compose(rs('fire', 'chain', 'fire')).key, 'fire2');
check('열쇠는 원소 차례로 적는다', R.compose(rs('earth', 'fire')).key, 'fire1-earth1');

// --- 성질과 수식어 ---
{
  const one = R.compose(rs('fire'));
  const two = R.compose(rs('fire', 'fire'));
  check('불을 강화하면 탄이 는다', R.compose([{ id: 'fire', grade: 1 }]).count, 2);
  check('불 둘은 폭염탄(파편)', [two.kind, two.tier, !!two.cluster], ['bolt', 2, true]);
  check('불 셋은 메테오', R.compose(rs('fire', 'fire', 'fire')).kind, 'meteor');
  check('물 셋은 해일', R.compose(rs('water', 'water', 'water')).kind, 'wave');
  check('바람 셋은 토네이도', R.compose(rs('wind', 'wind', 'wind')).kind, 'tornado');
  check('땅 셋은 지진', R.compose(rs('earth', 'earth', 'earth')).kind, 'quake');
  check('섞으면 단계는 주원소의 수', R.compose(rs('fire', 'fire', 'wind')).tier, 2);
  check('여섯은 다섯의 형태에 피해만 는다', [R.compose(rs('fire', 'fire', 'fire', 'fire', 'fire', 'fire')).kind, R.compose(rs('fire', 'fire', 'fire', 'fire', 'fire', 'fire')).dmg > R.compose(rs('fire', 'fire', 'fire', 'fire', 'fire')).dmg], [R.compose(rs('fire', 'fire', 'fire', 'fire', 'fire')).kind, true]);
  check('불을 겹쳐도 관통은 붙지 않는다', R.compose([{ id: 'fire', grade: 3 }]).pierce, 0);
  check('불을 강화하면 폭발이 커진다', R.compose([{ id: 'fire', grade: 1 }]).size > one.size, true);
  check('단계가 오르면 강해진다', two.dmg > one.dmg * 1.5, true);
  check('남은 불은 스플래시', R.compose(rs('wind', 'wind', 'fire')).splash, 1);
  check('첫 불에는 덧붙는 효과가 없다', [one.splash, one.slow, one.knock, one.root], [0, 0, 0, 0]);
  check('남은 물은 둔화', R.compose(rs('fire', 'fire', 'water')).slow, 0.25);
  check('남은 바람은 넉백', R.compose(rs('fire', 'fire', 'wind')).knock, 40);
  check('남은 땅은 발묶기', R.compose(rs('fire', 'fire', 'earth')).root > 0, true);
  check('남은 룬은 더하기로 쌓인다', R.compose(rs('fire', 'fire', 'fire', 'fire', 'water', 'water')).slow, 0.5);
  check('남은 룬끼리 더 큰 조합을 이루면 그것이 발동한다', R.compose(rs('earth', 'earth', 'earth', 'wind', 'wind')).key, 'wind2-earth2');
  check('남은 룬의 등급도 쌓인다', R.compose([{ id: 'fire', grade: 0 }, { id: 'fire', grade: 0 }, { id: 'water', grade: 1 }]).slow, 0.5);
  check('연쇄', R.compose(rs('fire', 'chain')).chain, 2);
  check('연쇄는 겹친다', R.compose(rs('fire', 'chain', 'chain')).chain, 4);
  check('바람을 겹쳐 올리면 개수가 는다', R.compose([{ id: 'wind', grade: 1 }]).count, R.compose(rs('wind')).count + 1);
  check('땅을 겹쳐 올리면 범위가 는다', R.compose([{ id: 'earth', grade: 1 }]).size > R.compose(rs('earth')).size, true);
  check('수식어를 겹쳐 올리면 한 번 더 걸린다', R.compose([{ id: 'fire', grade: 0 }, { id: 'chain', grade: 1 }]).chain, 4);
  check('흡혈', R.compose(rs('fire', 'anima')).leech > 0, true);
  check('수식어를 올려도 원소 강화는 걸리지 않는다', R.compose([{ id: 'fire', grade: 0 }, { id: 'chain', grade: 3 }]).count, 1);
  check('물을 겹치면 관통이 는다', R.compose([{ id: 'water', grade: 2 }]).pierce, R.compose(rs('water')).pierce + 2);
  check('수식어 개수를 센다', R.compose(rs('fire', 'echo', 'echo')).mods, { echo: 2 });
  check('등급이 피해를 올린다', R.compose([{ id: 'fire', grade: 2 }]).dmg > one.dmg, true);
}

// --- 수식어의 원소 상성 ---
{
  const at = (...ids) => R.compose(rs(...ids));
  check('냉각: 물에는 결빙과 관통', [at('water', 'frost').freezeChance > 0, at('water', 'frost').pierce, at('water', 'frost').synergy], [true, 4, ['frost']]);
  check('냉각: 불에는 약화', [at('fire', 'frost').dmg < at('fire').dmg, at('fire', 'frost').clash], [true, ['frost']]);
  check('냉각: 그 밖에는 둔화만', [at('earth', 'frost').slow > 0, at('earth', 'frost').dmg, at('earth', 'frost').synergy.length + at('earth', 'frost').clash.length], [true, at('earth').dmg, 0]);
  check('과열: 불에는 화상이 두 배', at('fire', 'heat').burn, at('wind', 'heat').burn * 2);
  check('과열: 물에는 화상이 붙지 않고 약해진다', [at('water', 'heat').burn, at('water', 'heat').dmg < at('water').dmg], [0, true]);
  check('중력: 끌어당긴다', !!at('fire', 'gravity').vortex, true);
  check('중력: 땅에는 발묶기', at('earth', 'gravity').root > 0, true);
  check('중력: 바람에는 끌어당김이 없다', [!!at('wind', 'gravity').vortex, at('wind', 'gravity').dmg < at('wind').dmg], [false, true]);
  check('질풍: 빨라진다', at('fire', 'gale').speed > at('fire').speed, true);
  check('질풍: 바람에는 칼날 +1, 넉백은 없다', [at('wind', 'gale').count, at('wind', 'gale').knock], [at('wind').count + 1, 0]);
  check('질풍: 땅에는 약화', at('earth', 'gale').dmg < at('earth').dmg, true);
  check('공명: 한 원소만이면 세진다', at('fire', 'fire', 'resonance').dmg > at('fire', 'fire').dmg, true);
  check('공명: 섞이면 아무 일도 없다', [at('fire', 'fire', 'water', 'resonance').dmg, at('fire', 'fire', 'water', 'resonance').clash], [at('fire', 'fire', 'water').dmg, ['resonance']]);
  check('궁극기는 일곱이 제각각 상성을 받는다', at(...R.ELEMENTS, 'frost').parts.map((p) => p.clash.length + p.synergy.length), [1, 1, 0, 0, 0, 0, 0]);
}

// --- 단계와 특수 조합 ---
{
  const n = (el, k) => { const a = []; for (let i = 0; i < k; i++) a.push({ id: el, grade: 0 }); return a; };
  check('원소는 일곱', R.ELEMENTS.length, 7);
  check('구멍 배치', R.SOCKETS.join(''), 'EFMEFMEFF');
  check('서클별 원소 칸', [1, 2, 3, 4, 5, 6, 7, 8, 9].map(R.maxElements), [1, 2, 2, 3, 4, 4, 5, 6, 7]);
  check('구멍은 룬을 가린다', [R.fits('E', 'fire'), R.fits('E', 'chain'), R.fits('M', 'fire'), R.fits('M', 'chain'), R.fits('F', 'fire'), R.fits('F', 'chain')], [true, false, false, true, true, true]);
  check('단계가 바뀌는 자리', [1, 2, 3, 4, 5, 6, 7].map(R.formTierOf), [1, 2, 3, 4, 5, 5, 7]);
  check('불 넷은 유성우', R.compose(n('fire', 4)).kind, 'rain');
  check('물 다섯은 대해일', [R.compose(n('water', 5)).kind, !!R.compose(n('water', 5)).ring], ['wave', true]);
  check('바람 넷은 회오리 떼', [R.compose(n('wind', 4)).kind, R.compose(n('wind', 4)).count >= 4], ['tornado', true]);
  check('땅 일곱은 화면 전체', !!R.compose(n('earth', 7)).screen, true);
  check('번개는 곧바로 튄다', [R.compose(n('thunder', 1)).kind, R.compose(n('thunder', 1)).jumps], ['zap', 2]);
  check('번개 넷은 뇌우', [R.compose(n('thunder', 4)).kind, R.compose(n('thunder', 4)).sub], ['rain', 'bolt']);
  check('빛은 광선', R.compose(n('light', 1)).kind, 'beam');
  check('빛 둘은 두 갈래', R.compose(n('light', 2)).count, 2);
  check('어둠은 그림자 낫', R.compose(n('dark', 1)).kind, 'reap');
  check('일곱 원소 모두 7단계가 화면 전체', R.ELEMENTS.map((el) => !!R.compose(n(el, 7)).screen), R.ELEMENTS.map(() => true));
  check('특수 조합: 두 원소 21쌍×2 + 옛 여섯 쌍 3:3 + 세 원소 넷×2 + 궁극기', Object.keys(R.RECIPES).length, 21 * 2 + 6 + 8 + 1);
  const steam = R.compose(rs('fire', 'water'));
  check('불+물은 특수 조합(얼리는 화염구)', [steam.recipe, steam.kind, !!steam.freeze], [true, 'bolt', true]);
  check('새 원소가 든 쌍은 새 원소가 형태를 정한다', [R.compose(rs('fire', 'thunder')).kind, R.compose(rs('light', 'dark')).kind], ['zap', 'reap']);
  check('특수 조합은 접목이 붙는다', !!R.compose(rs('fire', 'wind')).ignite, true);
  check('조합을 벗어나면 규칙으로 돌아간다', R.compose(rs('fire', 'fire', 'water')).recipe, false);
  check('특수 조합은 어느 원소를 강화해도 강해진다', R.compose([{ id: 'fire', grade: 3 }, { id: 'earth', grade: 0 }]).dmg > R.compose(rs('fire', 'earth')).dmg, true);
  check('수식어는 특수 조합을 깨지 않는다', R.compose(rs('fire', 'water', 'chain')).recipe, true);
  const ult = R.compose(R.ELEMENTS.map((id) => ({ id, grade: 0 })));
  check('일곱 원소를 하나씩 모으면 궁극기', [ult.key, ult.kind, ult.parts.length], ['genesis', 'harmony', 7]);
  check('궁극기는 9서클에서만', [R.allKeys(8).includes('genesis'), R.allKeys(9).includes('genesis')], [false, true]);
  let bad = 0;
  for (const key of Object.keys(R.RECIPES)) {
    const runes = R.keyRunes(key);
    if (runes.length > 7 || !R.compose(runes).recipe) bad++;
  }
  check('모든 특수 조합이 원소 칸 일곱 안에서 만들어진다', bad, 0);
}

// --- 모든 마법이 정의되는지 ---
{
  let bad = 0;
  for (let circle = 1; circle <= 9; circle++) {
    for (const key of R.allKeys(circle)) {
      const s = R.compose(R.keyRunes(key));
      const parts = s.parts || [s];
      const finite = parts.every((p) => ['dmg', 'cd', 'dur', 'size', 'count'].every((k) => Number.isFinite(p[k]) && p[k] >= 0));
      if (!s || s.key !== key || !finite || s.cd < 0.25) bad++;
    }
  }
  check('1~9서클의 모든 마법이 정의된다', bad, 0);
  check('서클별 마법 수(한 원소만 + 특수 조합)', [1, 2, 4, 9].map((c) => R.allKeys(c).length), [7, 35, 46, 106]);
}

// 원소 룬을 아무렇게나 새겨도 늘 마법이 된다(원소가 하나라도 있으면).
{
  const r = require('./sim.js').rng(4);
  let bad = 0;
  for (let i = 0; i < 400; i++) {
    const n = 1 + Math.floor(r() * 9);
    const runes = [];
    for (let k = 0; k < n; k++) runes.push({ id: R.ALL[Math.floor(r() * R.ALL.length)], grade: Math.floor(r() * 3) });
    const s = R.compose(runes);
    const hasEl = runes.some((x) => R.isElement(x.id));
    if (!!s !== hasEl) bad++;
    if (s && !['dmg', 'cd', 'size'].every((k) => Number.isFinite(s[k]))) bad++;
  }
  check('아무 묶음이나 마법이 되거나 원소가 없어 시전하지 않는다', bad, 0);
}

check('빛과 어둠은 서로 맞서는 특수 원소', [R.OPPOSITE.light, R.OPPOSITE.dark, R.ELEMENTS.filter(R.isSpecialElement)], ['dark', 'light', ['light', 'dark']]);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

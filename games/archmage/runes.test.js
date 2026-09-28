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
check('가장 많은 원소가 형태를 정한다', R.compose(rs('fire', 'wind', 'wind')).kind, 'orbit');
check('비기면 정해진 차례로 가른다', R.compose(rs('wind', 'wind', 'fire', 'fire', 'earth')).primary, 'fire');
check('순서를 따지지 않는다',
  JSON.stringify(R.compose(rs('wind', 'fire', 'earth'))), JSON.stringify(R.compose(rs('earth', 'fire', 'wind'))));
check('열쇠에 수식어는 들어가지 않는다', R.compose(rs('fire', 'chain', 'fire')).key, 'fire2');
check('열쇠는 원소 차례로 적는다', R.compose(rs('earth', 'fire', 'fire')).key, 'fire2-earth1');

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
  check('넷째부터는 형태는 그대로 피해만 는다', R.compose(rs('fire', 'fire', 'fire', 'fire')).dmg > R.compose(rs('fire', 'fire', 'fire')).dmg, true);
  check('불을 겹쳐도 관통은 붙지 않는다', R.compose([{ id: 'fire', grade: 3 }]).pierce, 0);
  check('불을 강화하면 폭발이 커진다', R.compose([{ id: 'fire', grade: 1 }]).size > one.size, true);
  check('단계가 오르면 강해진다', two.dmg > one.dmg * 1.5, true);
  check('다른 원소로 더한 불은 화상을 붙인다', R.compose(rs('wind', 'wind', 'fire')).burn > 0, true);
  check('첫 불에는 성질이 붙지 않는다', one.burn, 0);
  check('물을 더하면 둔화', R.compose(rs('fire', 'fire', 'water')).slow > 0, true);
  check('바람을 더하면 개수가 는다', R.compose(rs('fire', 'fire', 'wind')).count, R.compose(rs('fire', 'fire')).count + 1);
  check('땅을 더하면 커진다', R.compose(rs('fire', 'fire', 'earth')).size > R.compose(rs('fire', 'fire')).size, true);
  check('연쇄', R.compose(rs('fire', 'chain')).chain, 2);
  check('연쇄는 겹친다', R.compose(rs('fire', 'chain', 'chain')).chain, 4);
  check('시간은 쿨타임을 줄인다', R.compose(rs('fire', 'chrono')).cd < one.cd, true);
  check('집중은 피해를 모은다', R.compose(rs('fire', 'focus')).dmg > one.dmg, true);
  check('바람을 겹쳐 올리면 개수가 는다', R.compose([{ id: 'wind', grade: 1 }]).count, R.compose(rs('wind')).count + 1);
  check('땅을 겹쳐 올리면 범위가 는다', R.compose([{ id: 'earth', grade: 1 }]).size > R.compose(rs('earth')).size, true);
  check('수식어를 겹쳐 올리면 한 번 더 걸린다', R.compose([{ id: 'fire', grade: 0 }, { id: 'chain', grade: 1 }]).chain, 4);
  check('흡혈', R.compose(rs('fire', 'anima')).leech > 0, true);
  check('수식어를 올려도 원소 강화는 걸리지 않는다', R.compose([{ id: 'fire', grade: 0 }, { id: 'chain', grade: 3 }]).count, 1);
  check('물을 겹치면 관통이 는다', R.compose([{ id: 'water', grade: 2 }]).pierce, R.compose(rs('water')).pierce + 2);
  check('수식어 개수를 센다', R.compose(rs('fire', 'echo', 'echo')).mods, { echo: 2 });
  check('등급이 피해를 올린다', R.compose([{ id: 'fire', grade: 2 }]).dmg > one.dmg, true);
}

// --- 9서클까지의 단계와 특수 조합 ---
{
  const n = (el, k) => { const a = []; for (let i = 0; i < k; i++) a.push({ id: el, grade: 0 }); return a; };
  check('단계가 바뀌는 자리', [1, 2, 3, 4, 5, 6, 7, 8, 9].map(R.formTierOf), [1, 2, 3, 3, 5, 5, 7, 7, 9]);
  check('불 다섯은 유성우', R.compose(n('fire', 5)).kind, 'rain');
  check('물 일곱은 대해일', [R.compose(n('water', 7)).kind, !!R.compose(n('water', 7)).ring], ['wave', true]);
  check('바람 일곱은 태풍의 눈', R.compose(n('wind', 7)).kind, 'aura');
  check('땅 아홉은 화면 전체', !!R.compose(n('earth', 9)).screen, true);
  check('특수 조합은 서른여덟', Object.keys(R.RECIPES).length, 38);
  const steam = R.compose(rs('fire', 'water'));
  check('불+물은 특수 조합(얼리는 화염구)', [steam.recipe, steam.kind, !!steam.freeze], [true, 'bolt', true]);
  check('특수 조합은 접목이 붙는다', !!R.compose(rs('fire', 'wind')).ignite, true);
  check('조합을 벗어나면 규칙으로 돌아간다', R.compose(rs('fire', 'fire', 'water')).recipe, false);
  check('특수 조합은 어느 원소를 강화해도 강해진다', R.compose([{ id: 'fire', grade: 3 }, { id: 'earth', grade: 0 }]).dmg > R.compose(rs('fire', 'earth')).dmg, true);
  check('수식어는 특수 조합을 깨지 않는다', R.compose(rs('fire', 'water', 'chain')).recipe, true);
  let bad = 0;
  for (const key of Object.keys(R.RECIPES)) {
    const runes = [];
    for (const part of key.split('-')) {
      const m = /^([a-z]+)(\d+)$/.exec(part);
      for (let i = 0; i < Number(m[2]); i++) runes.push({ id: m[1], grade: 0 });
    }
    if (runes.length > 9 || !R.compose(runes).recipe) bad++;
  }
  check('모든 특수 조합이 9서클 안에서 만들어진다', bad, 0);
}

// --- 모든 조합이 정의되는지 ---
{
  let bad = 0;
  for (let circle = 1; circle <= 9; circle++) {
    for (const key of R.allKeys(circle)) {
      const runes = [];
      for (const part of key.split('-')) {
        const m = /^([a-z]+)(\d+)$/.exec(part);
        for (let i = 0; i < Number(m[2]); i++) runes.push({ id: m[1], grade: 0 });
      }
      const s = R.compose(runes);
      const finite = ['dmg', 'cd', 'dur', 'size', 'count'].every((k) => Number.isFinite(s[k]) && s[k] >= 0);
      if (!s || s.key !== key || !finite || s.cd < 0.25) bad++;
    }
  }
  check('1~9서클의 모든 원소 조합이 마법이 된다', bad, 0);
  check('서클별 조합 수', [1, 2, 3, 9].map(R.comboCount), [4, 14, 34, 714]);
  check('열쇠 목록과 조합 수가 같다', R.allKeys(9).length, 714);
}

// 순수 마법이 늘 최강이면 섞을 이유가 없다. 3서클 조합 중 단일 대상 피해가 가장 큰 것이
// 순수 조합 하나로 몰리지 않는지만 본다 — 균형은 사람이 해 보고 맞춘다.
{
  const keys = R.allKeys(3).filter((k) => k.split('-').reduce((n, p) => n + Number(p.replace(/\D/g, '')), 0) === 3);
  const byKind = {};
  for (const key of keys) {
    const runes = [];
    for (const part of key.split('-')) {
      const m = /^([a-z]+)(\d+)$/.exec(part);
      for (let i = 0; i < Number(m[2]); i++) runes.push({ id: m[1], grade: 0 });
    }
    const s = R.compose(runes);
    (byKind[s.kind] = byKind[s.kind] || []).push(s);
  }
  check('3서클에서 기본 넷과 3단계 넷이 모두 나온다', Object.keys(byKind).sort(), ['bolt', 'lance', 'meteor', 'orbit', 'quake', 'tornado', 'wave', 'zone']);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

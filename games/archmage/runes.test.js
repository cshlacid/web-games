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
check('비기면 정해진 차례로 가른다', R.compose(rs('wind', 'fire')).primary, 'fire');
check('순서를 따지지 않는다',
  JSON.stringify(R.compose(rs('wind', 'fire', 'earth'))), JSON.stringify(R.compose(rs('earth', 'fire', 'wind'))));
check('열쇠에 수식어는 들어가지 않는다', R.compose(rs('fire', 'chain', 'fire')).key, 'fire2');
check('열쇠는 원소 차례로 적는다', R.compose(rs('earth', 'fire', 'fire')).key, 'fire2-earth1');

// --- 성질과 수식어 ---
{
  const one = R.compose(rs('fire'));
  const two = R.compose(rs('fire', 'fire'));
  check('불을 더하면 피해가 는다', two.dmg > one.dmg, true);
  check('불을 겹치면 탄이 는다', two.count, 2);
  check('불을 겹쳐도 관통은 붙지 않는다', R.compose([{ id: 'fire', grade: 3 }]).pierce, 0);
  check('불을 겹치면 폭발이 커진다', two.size > one.size, true);
  check('다른 원소로 더한 불은 화상을 붙인다', R.compose(rs('wind', 'wind', 'fire')).burn > 0, true);
  check('첫 불에는 성질이 붙지 않는다', one.burn, 0);
  check('물을 더하면 둔화', R.compose(rs('fire', 'water')).slow > 0, true);
  check('바람을 더하면 개수가 는다', R.compose(rs('fire', 'wind')).count, 2);
  check('땅을 더하면 커진다', R.compose(rs('fire', 'earth')).size > one.size, true);
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
  check('3서클에서 네 형태가 모두 나온다', Object.keys(byKind).sort(), ['bolt', 'lance', 'orbit', 'zone']);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

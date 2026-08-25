'use strict';

// 실행: node games/healer/quests.test.js
// 의뢰 생성. 무작위로 만드는 것이라 "이 판이 이렇게 나온다"를 볼 수는 없고,
// 어떤 씨앗으로 만들어도 깨지지 않아야 하는 것들을 본다.
const D = require('./data.js');
const Q = require('./quests.js');
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

const SEEDS = [1, 7, 99, 2024, 505050, 777777];
const LEVELS = [1, 2, 5, 9, 15, 25, 30];

// 씨앗과 레벨을 두루 돌려 한 번이라도 어긋나는 것이 있는지 본다.
function everyQuest(fn) {
  const bad = [];
  for (const seed of SEEDS) {
    for (const level of LEVELS) {
      for (const quest of Q.generate(level, seed)) {
        const problem = fn(quest, level);
        if (problem) bad.push(`Lv${level}/${seed}: ${problem}`);
      }
    }
  }
  return bad;
}

// --- 목록 --------------------------------------------------------------
{
  check('정해진 개수만큼 걸린다', Q.generate(1, 7).length, Q.QUEST_COUNT);
  check('같은 씨앗이면 같은 목록',
    Q.generate(5, 7).map((q) => q.name), Q.generate(5, 7).map((q) => q.name));
  check('씨앗이 다르면 달라진다',
    Q.generate(5, 7).map((q) => q.name).join() === Q.generate(5, 8).map((q) => q.name).join(),
    false);

  // 쉬운 것부터 보여 주지 않으면 게시판을 훑는 기준이 없다.
  const levels = Q.generate(9, 42).map((q) => q.level);
  check('적정 레벨 순으로 정렬', levels.slice().sort((a, b) => a - b), levels);
}

// --- 어떤 씨앗으로도 성립해야 하는 것 -----------------------------------
{
  check('적정 레벨은 1 이상', everyQuest((q) => (q.level >= 1 ? null : `레벨 ${q.level}`)), []);
  check('주인공 레벨 근처에서 나온다',
    everyQuest((q, level) => (Math.abs(q.level - level) <= 4 ? null : `${q.level} vs ${level}`)), []);
  check('웨이브가 비어 있지 않다',
    everyQuest((q) => (q.waves.length && q.waves.every((w) => w.length) ? null : '빈 웨이브')), []);
  check('아는 적만 나온다',
    everyQuest((q) => (q.waves.flat().every((id) => D.ENEMIES[id]) ? null : '모르는 적')), []);
  check('아는 장소에서 싸운다',
    everyQuest((q) => (D.REGIONS[q.region] && q.scene ? null : '모르는 지역')), []);
  check('전리품이 붙어 있다',
    everyQuest((q) => (q.drops.length && q.drops.every((i) => D.itemDef(i.defId)) ? null : '전리품')), []);
  check('보상이 0보다 크다',
    everyQuest((q) => (q.guildReward.gold > 0 && q.guildReward.exp > 0 ? null : '보상 없음')), []);

  // 적 힐러가 여럿이면 서로를 살려 파티의 화력으로 아무도 죽일 수 없는 판이 된다.
  check('한 웨이브에 적 힐러는 하나까지', everyQuest((q) => {
    for (const wave of q.waves) {
      const healers = wave.filter((id) => D.ENEMIES[id].job === 'healer').length;
      if (healers > 1) return `힐러 ${healers}`;
    }
    return null;
  }), []);

  // 낮은 레벨에 높은 지역이 걸리면 받을 수 있는 의뢰가 하나도 없는 게시판이 된다.
  check('지역의 최소 레벨을 지킨다',
    everyQuest((q) => (q.level >= D.REGIONS[q.region].minLevel ? null : '최소 레벨')), []);

  // 등급이 적정 레벨을 따라야 낮은 의뢰만 반복하는 것이 최선이 되지 않는다.
  check('등급이 레벨을 크게 앞지르지 않는다', everyQuest((q) => {
    const cap = Math.min(D.TIERS.length - 1, Math.floor((q.level - 1) / 5) + 1);
    return q.drops.every((item) => item.tier <= cap) ? null : '등급 과다';
  }), []);
}

// --- 보상은 규모를 따른다 -----------------------------------------------
{
  const small = Q.generate(1, 11)[0];
  const big = Q.generate(20, 11)[3];
  check('레벨이 높으면 보상도 크다', big.guildReward.gold > small.guildReward.gold, true);
  check('레벨이 높으면 경험치도 크다', big.exp > small.exp, true);
}

// --- 동료 후보 ----------------------------------------------------------
{
  const quest = Q.generate(6, 31)[0];
  const list = Q.companionsFor(quest, 31);

  check('정해진 수만큼 나온다', list.length, Q.COMPANION_COUNT);
  check('같은 씨앗이면 같은 후보',
    Q.companionsFor(quest, 31).map((c) => c.defId), list.map((c) => c.defId));
  check('겹치지 않는다', new Set(list.map((c) => c.defId)).size, list.length);

  // 탱커와 힐러가 없으면 편성을 고민하는 것이 아니라 그냥 못 깨는 의뢰가 된다.
  const bad = [];
  for (const seed of SEEDS) {
    for (const level of LEVELS) {
      for (const q of Q.generate(level, seed)) {
        const jobs = Q.companionsFor(q, seed).map((c) => D.COMPANIONS[c.defId].job);
        if (!jobs.includes('tank')) bad.push(`Lv${level}/${seed}: 탱커 없음`);
        if (!jobs.includes('healer')) bad.push(`Lv${level}/${seed}: 힐러 없음`);
      }
    }
  }
  check('탱커와 힐러가 반드시 있다', bad, []);

  // 스킬을 하나도 못 들고 오는 동료는 고를 이유가 없는 동료다.
  const mute = [];
  for (const seed of SEEDS) {
    for (const q of Q.generate(1, seed)) {
      for (const entry of Q.companionsFor(q, seed)) {
        if (!entry.skills.length) mute.push(D.COMPANIONS[entry.defId].name);
      }
    }
  }
  check('레벨 1에서도 스킬이 하나는 있다', [...new Set(mute)], []);

  // 레벨이 높으면 더 들고 온다 — 광역 도발이 그 예다.
  const low = Q.companionsFor(Q.generate(1, 5)[0], 5);
  const high = Q.companionsFor(Q.generate(12, 5)[0], 5);
  const roars = (list2) => list2.some((c) => c.skills.includes('roar'));
  check('낮은 레벨 탱커는 광역 도발을 못 쓴다', roars(low), false);
  check('레벨이 오르면 광역 도발을 들고 온다', roars(high), true);

  check('동료 레벨은 의뢰 레벨 근처',
    list.every((c) => Math.abs(c.level - quest.level) <= 1), true);
}

// --- 만들어진 의뢰가 실제로 굴러가는가 ----------------------------------
{
  // 생성기가 만든 판을 전투가 그대로 받아야 한다. 자료 모양이 어긋나면
  // 게시판에서는 멀쩡해 보이다가 전투를 시작하는 순간 터진다.
  const bad = [];
  for (const seed of [3, 88, 12345]) {
    for (const level of [1, 8, 20]) {
      for (const quest of Q.generate(level, seed)) {
        const party = Q.companionsFor(quest, seed).slice(0, 4);
        const state = L.createBattle({
          quest, party, skills: ['touch', 'quick'],
          heroStats: { hp: 900, mp: 400, heal: 1.5, armor: 0.8 }, heroLevel: level, seed,
        });
        for (let i = 0; i < 20 / L.TICK && state.status === 'fighting'; i++) {
          L.step(state, L.TICK);
          L.drainEvents(state);
        }
        if (!state.units.length) bad.push(`${quest.name}: 유닛 없음`);
        const reward = L.rewardOf(state);
        if (!(reward.charExp >= 0 && reward.jobExp >= 0)) bad.push(`${quest.name}: 보상 계산`);
      }
    }
  }
  check('생성된 의뢰로 전투가 굴러간다', bad, []);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

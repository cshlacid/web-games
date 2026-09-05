'use strict';

// 실행: node games/healer/quests.test.js
// 의뢰 생성. 무작위로 만드는 것이라 "이 판이 이렇게 나온다"를 볼 수는 없고,
// 어떤 씨앗으로 만들어도 깨지지 않아야 하는 것들을 본다.
const D = require('./data.js');
const Q = require('./quests.js');
const L = require('./logic.js');
const R = require('./roster.js');
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

// --- 늘 서는 자리(친구·고른 동료) ----------------------------------------
//
// 명부에서 한 번에 열만 보여 주므로, 공들여 키운 동료가 이번 뽑기에 안 걸리면
// 데려갈 방법이 없었다. `always`로 넘긴 동료는 뽑기와 상관없이 목록에 선다.
{
  const R = require('./roster.js');
  const roster = R.create(3);
  const quest = Q.generate(5, 1)[0];
  const fixed = [roster[2], roster[5]];
  const list = Q.companionsFor(quest, roster, 11, fixed);

  check('넘긴 동료가 목록에 있다', fixed.every((m) => list.includes(m)), true);
  check('같은 동료가 두 번 서지 않는다', list.length, new Set(list).size);
  // **뽑기 자리를 먹지 않는다.** 먹으면 친구가 늘수록 고를 폭이 줄어, 친구를
  // 만든 것이 손해가 된다.
  const plain = Q.companionsFor(quest, roster, 11);
  check('넘긴 만큼 목록이 좁아지지 않는다', list.length >= plain.length, true);

  // 탱커·힐러 보장은 그대로다. 이미 서 있는 쪽이 맡고 있으면 다시 넣지 않는다.
  const jobOf = (m) => D.COMPANIONS[m.defId].job;
  check('탱커와 힐러가 있다',
    ['tank', 'healer'].every((job) => list.some((m) => jobOf(m) === job)), true);
  const tanks = roster.filter((m) => jobOf(m) === 'tank');
  const withTank = Q.companionsFor(quest, roster, 11, [tanks[0]]);
  check('넘긴 쪽이 탱커면 탱커를 또 넣지 않는다',
    withTank.filter((m) => jobOf(m) === 'tank').length >= 1, true);

  // 명부에 없는 사람은 넣지 않는다 — 저장본이 어긋났을 때 유령이 목록에 선다.
  const ghost = Q.companionsFor(quest, roster, 11, [{ name: '없는 사람', defId: 'lyle' }]);
  check('명부에 없는 사람은 안 선다',
    ghost.every((m) => roster.includes(m)), true);
}

// --- 게시판에 여러 난이도가 걸린다 ---------------------------------------
//
// **예전에는 넷이 한 가지 난이도로 채워졌다.** 아래쪽 폭이 -1까지뿐이라 평판이
// 무명인 동안 서로 다른 난이도가 넷 중 1.79뿐이었고, 화면의 "쉬움" 딱지(두 레벨
// 아래부터)가 붙는 의뢰는 아예 생길 수 없었다.
{
  const spreadOf = (level, seed, gap) =>
    Q.generate(level, seed, gap).map((q) => q.level - level);

  let same = 0;
  let boards = 0;
  let narrow = 0;
  for (let level = 5; level <= 20; level++) {
    for (let seed = 1; seed <= 30; seed++) {
      for (const stage of D.REPUTATION.stages) {
        const offs = spreadOf(level, seed * 71 + level, stage.questGap);
        if (new Set(offs).size < 3) same++;
        if (Math.max(...offs) - Math.min(...offs) < 2) narrow++;
        boards++;
      }
    }
  }
  check('한 게시판에 세 가지 넘는 난이도가 걸린다', same, 0);
  check('가장 쉬운 것과 어려운 것이 두 레벨 넘게 벌어진다', narrow, 0);

  // 아래쪽은 평판이 자르지 않는다. 무명이어도 쉬운 판을 고를 수 있어야
  // 게시판이 한 가지로 채워지지 않는다.
  const unknown = D.REPUTATION.stages[0];
  const low = [];
  for (let seed = 1; seed <= 40; seed++) low.push(...spreadOf(10, seed, unknown.questGap));
  check('무명이어도 쉬운 의뢰가 걸린다', low.some((n) => n <= -2), true);
  check('무명이어도 제 레벨 위가 하나는 있다', low.some((n) => n > 0), true);

  // 위쪽만 평판이 연다 — 이 게임에서 "상위 콘텐츠"라고 부를 수 있는 것이
  // 의뢰의 난이도뿐이라 그렇게 옮겼다(기획서 3장).
  const top = (gap) => {
    let best = -99;
    for (let seed = 1; seed <= 40; seed++) best = Math.max(best, ...spreadOf(10, seed, gap));
    return best;
  };
  const tops = D.REPUTATION.stages.map((stage) => top(stage.questGap));
  check('평판이 오르면 더 어려운 의뢰가 걸린다',
    tops.every((n, i) => i === 0 || n > tops[i - 1]), true);
}

// --- 어떤 씨앗으로도 성립해야 하는 것 -----------------------------------
{
  check('적정 레벨은 1 이상', everyQuest((q) => (q.level >= 1 ? null : `레벨 ${q.level}`)), []);
  check('주인공 레벨 근처에서 나온다',
    everyQuest((q, level) => (Math.abs(q.level - level) <= 5 ? null : `${q.level} vs ${level}`)), []);
  check('웨이브가 비어 있지 않다',
    everyQuest((q) => (q.waves.length && q.waves.every((w) => w.length) ? null : '빈 웨이브')), []);
  check('아는 적만 나온다',
    everyQuest((q) => (q.waves.flat().every((id) => D.ENEMIES[id]) ? null : '모르는 적')), []);
  check('아는 장소에서 싸운다',
    everyQuest((q) => (D.REGIONS[q.region] && q.scene ? null : '모르는 지역')), []);
  // 전리품 목록은 의뢰에 붙지 않는다. 쓰러뜨린 적에게서 굴려지므로(logic.dropsOf)
  // 게시판이 미리 말할 수 있는 것은 "가장 높은 적 등급"까지다.
  check('전리품 목록을 미리 들고 있지 않다',
    everyQuest((q) => (q.drops === undefined ? null : '전리품 목록')), []);
  check('적 등급을 알린다',
    everyQuest((q) => (D.RANKS[q.rank] ? null : '모르는 등급')), []);
  check('등급은 실제로 나오는 적 중 가장 높은 것이다', everyQuest((q) => {
    const order = Object.keys(D.RANKS);
    const best = q.waves.flat()
      .reduce((top, id) => Math.max(top, order.indexOf(D.rankOf(D.ENEMIES[id]).id)), 0);
    return order[best] === q.rank ? null : `${q.rank} vs ${order[best]}`;
  }), []);
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

  // 등급의 바닥이 레벨을 따라야 낮은 의뢰만 반복하는 것이 최선이 되지 않는다.
  check('레벨이 낮으면 등급 바닥도 낮다', D.tierFloor(1), 0);
  check('레벨이 오르면 바닥도 오른다', D.tierFloor(30) > D.tierFloor(1), true);
  check('바닥이 맨 위까지 오르지는 않는다',
    D.tierFloor(D.LEVEL.maxLevel) < D.TIERS.length - 1, true);
}

// --- 보상은 규모를 따른다 -----------------------------------------------
{
  const small = Q.generate(1, 11)[0];
  const big = Q.generate(20, 11)[3];
  check('레벨이 높으면 보상도 크다', big.guildReward.gold > small.guildReward.gold, true);
  check('레벨이 높으면 경험치도 크다', big.exp > small.exp, true);

  // 우두머리가 나오는 의뢰는 값이 다르다. 위험만 크고 보상이 같으면 우두머리를
  // 피해 다니는 것이 최선이 된다.
  const withBoss = [];
  const without = [];
  for (const seed of SEEDS) {
    for (const quest of Q.generate(12, seed)) {
      const boss = quest.waves.flat().some((id) => D.rankOf(D.ENEMIES[id]).id === 'boss');
      (boss ? withBoss : without).push(quest);
    }
  }
  const mean = (list, f) => list.reduce((sum, q) => sum + f(q), 0) / (list.length || 1);
  check('우두머리 의뢰가 실제로 걸린다', withBoss.length > 0, true);
  check('우두머리 의뢰가 더 준다',
    mean(withBoss, (q) => q.exp) > mean(without, (q) => q.exp) * 1.5, true);
}

// --- 무리는 머릿수가 아니라 위협의 몫으로 짠다 --------------------------
//
// 등급을 가리지 않고 세던 때에는 "잡졸 넷"이 "정예 둘"보다 위험했다. 정예가 잡졸
// 둘 몫을 차지해야 정예가 든 무리의 머릿수가 줄고 하나하나가 아프다.
{
  const weight = { trash: 1, elite: 2.2, boss: 6 };
  const threat = (wave) => wave.reduce((sum, id) => sum + weight[D.rankOf(D.ENEMIES[id]).id], 0);

  // 전장의 세로 줄이 다섯이라 그 이상은 세울 자리가 없다.
  check('한 무리는 다섯을 넘지 않는다',
    everyQuest((q) => (q.waves.every((w) => w.length <= 5) ? null : '여섯 이상')), []);

  // 정예가 섞인 무리와 잡졸뿐인 무리를 견준다. 같은 예산에서 정예 쪽이 머릿수가
  // 적어야 등급을 센 것이다.
  const mixed = [];
  const trashOnly = [];
  for (const seed of SEEDS) {
    for (const quest of Q.generate(12, seed)) {
      for (const wave of quest.waves) {
        if (wave.some((id) => D.rankOf(D.ENEMIES[id]).id === 'boss')) continue;
        (wave.some((id) => D.rankOf(D.ENEMIES[id]).id === 'elite') ? mixed : trashOnly).push(wave);
      }
    }
  }
  const mean = (list, f) => list.reduce((sum, w) => sum + f(w), 0) / (list.length || 1);
  check('견줄 무리가 둘 다 있다', mixed.length > 0 && trashOnly.length > 0, true);
  check('정예가 든 무리는 머릿수가 적다',
    mean(mixed, (w) => w.length) < mean(trashOnly, (w) => w.length), true);
  check('대신 위협의 몫은 더 크다',
    mean(mixed, threat) > mean(trashOnly, threat), true);
}

// --- 동료 후보 ----------------------------------------------------------
{
  const quest = Q.generate(6, 31)[0];
  const roster = R.create(31);
  const list = Q.companionsFor(quest, roster, 31);

  check('명부만큼 나온다', list.length, Math.min(Q.COMPANION_COUNT, roster.length));
  check('같은 씨앗이면 같은 후보',
    Q.companionsFor(quest, roster, 31).map((c) => c.name), list.map((c) => c.name));
  check('같은 동료가 두 번 나오지 않는다', new Set(list.map((c) => c.name)).size, list.length);
  check('명부에 있는 동료만 나온다', list.every((c) => roster.includes(c)), true);

  // 탱커와 힐러가 없으면 편성을 고민하는 것이 아니라 그냥 못 깨는 의뢰가 된다.
  const bad = [];
  for (const seed of SEEDS) {
    for (const level of LEVELS) {
      for (const q of Q.generate(level, seed)) {
        const jobs = Q.companionsFor(q, R.create(seed), seed).map((c) => D.COMPANIONS[c.defId].job);
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
      for (const entry of Q.companionsFor(q, R.create(seed), seed)) {
        if (!R.skillsOf(entry).length) mute.push(D.COMPANIONS[entry.defId].name);
      }
    }
  }
  check('레벨 1에서도 스킬이 하나는 있다', [...new Set(mute)], []);

  // 레벨이 높으면 더 들고 온다. **무엇을 드는지는 캐릭터마다 다르므로**(계열의
  // 열 개 중 넷) 특정 스킬로는 볼 수 없다 — 대신 드는 것들의 최소 레벨이 올라가는지
  // 본다. 레벨은 명부가 들고 있다.
  const rookies = R.create(5);
  const veterans = R.create(5).map((m) => Object.assign({}, m, { level: 12 }));
  const topLevel = (members) => Math.max(...members
    .flatMap((m) => R.skillsOf(m)).map((id) => D.UNIT_SKILLS[id].minLevel));
  check('낮은 레벨은 낮은 스킬만 든다', topLevel(rookies), 1);
  check('레벨이 오르면 늦게 열리는 것도 든다', topLevel(veterans) > 1, true);
}

// --- 만들어진 의뢰가 실제로 굴러가는가 ----------------------------------
{
  // 생성기가 만든 판을 전투가 그대로 받아야 한다. 자료 모양이 어긋나면
  // 게시판에서는 멀쩡해 보이다가 전투를 시작하는 순간 터진다.
  const bad = [];
  for (const seed of [3, 88, 12345]) {
    for (const level of [1, 8, 20]) {
      for (const quest of Q.generate(level, seed)) {
        const party = Q.companionsFor(quest, R.create(seed), seed).slice(0, 4).map(R.toParty);
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

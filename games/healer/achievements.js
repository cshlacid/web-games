'use strict';

// 업적. 만렙이 가까워지면 할 일이 "같은 의뢰를 또 깬다"뿐이라, 힐러의 솜씨를 재는 목표와
// 가는 길의 이정표를 둔다. **솜씨를 재는 것이 먼저다** — 레벨·골드처럼 시간이 채워 주는 것만
// 두면 목표가 아니라 기록이 된다. 이름과 설명은 사전(`hl.ach.<id>.*`)에 있다.
//
// 판정은 결과(`battle`)나 진행(`progress`)만 보고 화면을 모른다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;
const Items = node ? require('./items.js') : root.HealerItems;
const Rep = node ? require('./reputation.js') : root.HealerRep;

// `won`은 이긴 판에서만 본다. `battle`이 없으면(진행만 볼 때) 판 업적은 건너뛴다.
const LIST = [
  { id: 'firstWin', test: (b) => b && b.won },
  { id: 'clean', test: (b) => b && b.won && b.downs === 0 },
  // 흘린 힐이 적은 판. 적게 채운 판에서 저절로 나오지 않게 회복량 하한을 둔다.
  { id: 'thrifty', test: (b) => b && b.won && b.healed >= 3000 && b.overheal <= b.healed * 0.1 },
  { id: 'boss', test: (b) => b && b.won && b.boss },
  { id: 'bossClean', test: (b) => b && b.won && b.boss && b.downs === 0 },
  { id: 'daring', test: (b) => b && b.won && b.gap >= 3 },
  { id: 'mod', test: (b) => b && b.won && Boolean(b.mod) },
  { id: 'allMods', test: (b, p) => Object.keys(D.QUEST_MODS).every((id) => (p.modsCleared || []).includes(id)) },
  { id: 'lv10', test: (b, p) => p.charLevel >= 10 },
  { id: 'lv20', test: (b, p) => p.charLevel >= 20 },
  { id: 'lv30', test: (b, p) => p.charLevel >= D.LEVEL.maxLevel },
  { id: 'upper', test: (b, p) => Object.keys(p.jobs || {}).some((id) => D.HERO_JOBS[id] && (D.HERO_JOBS[id].need || {}).jobLevel) },
  { id: 'plus10', test: (b, p) => Object.values(p.equipped || {}).some((item) => item && Items.plusOf(item) >= Items.PLUS_MAX) },
  { id: 'friend', test: (b, p) => (p.roster || []).some(Rep.isFriend) },
];

const IDS = new Set(LIST.map((a) => a.id));

// 판이 끝났거나 진행이 바뀐 뒤에 부른다. 새로 얻은 것의 id 목록을 돌려주고 진행에 적는다.
function check(progress, battle) {
  if (!progress.achieved) progress.achieved = {};
  if (battle && battle.won && battle.mod) {
    progress.modsCleared = [...new Set((progress.modsCleared || []).concat(battle.mod))];
  }
  const fresh = [];
  for (const a of LIST) {
    if (progress.achieved[a.id]) continue;
    if (a.test(battle, progress)) {
      progress.achieved[a.id] = true;
      fresh.push(a.id);
    }
  }
  return fresh;
}

// 저장본에서 읽을 때: 모르는 id와 참이 아닌 값은 버린다.
function adopt(saved) {
  const out = {};
  for (const [id, value] of Object.entries(saved || {})) if (IDS.has(id) && value === true) out[id] = true;
  return out;
}

const count = (progress) => Object.keys(progress.achieved || {}).filter((id) => IDS.has(id)).length;

const api = { LIST, check, adopt, count };

if (node) module.exports = api;
root.HealerAchievements = api;

})(typeof window !== 'undefined' ? window : globalThis);

'use strict';

// 퀘스트 진행 중 얻은 보상의 분배(기획서 16장). 길드의 확정 보상은 여기 오지
// 않는다 — 그쪽은 파티가 나누는 것이 아니라 완료하면 그냥 받는 것이다.
//
// 세 방식 모두 같은 결과 형태를 돌려준다. 화면이 방식을 바꿔 가며 다시 굴려도
// 같은 씨앗이면 같은 결과가 나온다 — 주사위를 다시 굴려 원하는 결과가 나올
// 때까지 방식을 왔다 갔다 하는 것을 막기 위해서다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;
const Items = node ? require('./items.js') : root.HealerItems;

function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 전리품은 퀘스트가 만들어질 때 이미 정해져 있다(quests.js). 여기서는 그것을
// 누구에게 줄지만 정한다 — 전투를 잘했다고 더 좋은 물건이 나오지는 않는다.
// 아이템 하나는 { defId, tier } 꼴이다.

// 균등 분배: 참여자 순서대로 한 개씩 돌린다. 시작 위치를 씨앗으로 옮기는 것은,
// 늘 첫 번째 참여자가 첫 아이템을 가져가면 균등하지 않기 때문이다.
function even(drops, members, rng) {
  const start = Math.floor(rng() * members.length);
  return drops.map((item, i) => ({
    item,
    toId: members[(start + i) % members.length].id,
    reason: '순서대로',
  }));
}

// 주사위: 100면체를 굴려 가장 높은 사람이 가져간다. 같은 값이면 먼저 굴린 쪽이
// 이긴다 — 다시 굴리기로 하면 결과가 언제 끝날지 알 수 없다.
function rollFor(members, rng) {
  const rolls = members.map((m) => ({ id: m.id, name: m.name, roll: 1 + Math.floor(rng() * 100) }));
  const winner = rolls.reduce((a, b) => (b.roll > a.roll ? b : a));
  return { winner, rolls };
}

function dice(drops, members, rng) {
  return drops.map((item) => {
    const { winner, rolls } = rollFor(members, rng);
    return { item, toId: winner.id, reason: `${winner.roll} 최고`, rolls };
  });
}

// 직업 우선: 아이템의 직업 태그와 같은 직업의 참여자에게 우선권을 준다.
// 후보가 여럿일 때의 규칙은 기획서에 없어서 정했다 — 지금까지 적게 받은 사람을
// 먼저 보고, 그래도 같으면 그 사람들끼리만 주사위를 굴린다.
function byJob(drops, members, rng) {
  const taken = {};
  members.forEach((m) => { taken[m.id] = 0; });

  return drops.map((item) => {
    const def = Items.def(item);
    const job = def && def.job;
    const matched = job ? members.filter((m) => m.job === job) : [];

    // 쓸 직업이 파티에 없거나 직업을 가리지 않는 물건이면 우선권이 생기지 않는다.
    // 그때는 주사위로 넘긴다 — 균등으로 넘기면 순서가 남아 다음 아이템까지 흔든다.
    if (!matched.length) {
      const { winner, rolls } = rollFor(members, rng);
      taken[winner.id]++;
      return { item, toId: winner.id, rolls,
        reason: job ? `${D.JOBS[job].name} 없음 · 주사위` : '직업 무관 · 주사위' };
    }

    const fewest = Math.min(...matched.map((m) => taken[m.id]));
    const pool = matched.filter((m) => taken[m.id] === fewest);
    if (pool.length === 1) {
      taken[pool[0].id]++;
      return { item, toId: pool[0].id, reason: `${D.JOBS[job].name} 우선` };
    }
    const { winner, rolls } = rollFor(pool, rng);
    taken[winner.id]++;
    return { item, toId: winner.id, rolls, reason: `${D.JOBS[job].name} 우선 · 주사위` };
  });
}

const METHODS = {
  even: { id: 'even', name: '균등 분배', desc: '참여자에게 순서대로 하나씩 돌린다', run: even },
  job: { id: 'job', name: '직업 우선', desc: '아이템을 쓸 직업에게 우선권을 준다', run: byJob },
  dice: { id: 'dice', name: '주사위', desc: '굴려서 가장 높은 사람이 가져간다', run: dice },
};

// **기본값은 직업 우선이다.** 균등이 기본이던 때에는 탱커 방패가 마법사에게
// 가는 판이 그냥 지나갔다 — 세 방식 중 파티가 실제로 세지는 것은 이쪽뿐이고,
// 나머지 둘은 그것을 포기하는 대신 다른 것(고르게 나눔·운)을 얻는 선택이다.
//
// **기본값을 한 곳에만 둔다.** 처음 진행·저장본 읽기·모르는 방식의 대체가 저마다
// 값을 적고 있으면 하나만 고치는 일이 난다.
const DEFAULT = 'job';

// members: [{ id, name, job }] — 주인공을 포함한 참여자
function distribute(drops, members, methodId, seed) {
  const method = METHODS[methodId] || METHODS[DEFAULT];
  const awards = method.run(drops, members, createRng(seed));

  const byMember = {};
  members.forEach((m) => { byMember[m.id] = []; });
  awards.forEach((award) => { byMember[award.toId].push(award.item); });

  return { method: method.id, awards, byMember };
}

const api = { METHODS, DEFAULT, distribute, createRng };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerLoot = api;

})(typeof window !== 'undefined' ? window : globalThis);

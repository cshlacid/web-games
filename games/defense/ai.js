'use strict';

// 스스로 두는 손. 게임에는 쓰이지 않는다 — **계수를 재기 위한 자다.**
//
// 점령전이 "한 판이 3분에 끝나는가"로 초당 계수를 잡았듯, 여기서는 이 손으로
// 스테이지를 올려 가며 **어디서 막히는가**를 보고 보상 성장률을 잡는다.
//
// 두 가지 손버릇을 나눠 둔 이유가 있다. 길을 아예 막아 버리는 쪽(`wall`)이 늘
// 이득이면 이 게임은 봉쇄 하나로 끝나고, 늘 손해면 막을 수 있다는 규칙이 장식이
// 된다. 둘을 같이 돌려 어느 쪽도 일방적이지 않은지 본다.
(function () {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : window.DefenseData;
const P = node ? require('./paths.js') : window.DefensePaths;
const R = node ? require('./rules.js') : window.DefenseRules;
const T = node ? require('./meta.js') : window.DefenseMeta;

// 사고 싶은 차례. 편성에 없는 것은 건너뛴다. 사람이 짜는 조합의 어림이지
// 최적해가 아니다 — 최적해로 재면 계수가 사람 손보다 세게 잡힌다.
const WANT = ['archer', 'archer', 'frost', 'cannon', 'archer', 'spear', 'cannon', 'healer', 'archer', 'spear'];

function freeCells(run, key) {
  const list = [];
  for (let y = 0; y < run.map.h; y++) {
    for (let x = 0; x < run.map.w; x++) {
      if (R.canPlace(run, key, x, y)) continue;
      list.push({ x, y });
    }
  }
  return list;
}

// 그 자리에서 길을 몇 칸이나 볼 수 있는가. 사거리 안에 든 길 칸을 센다.
function coverage(run, route, x, y, range) {
  let n = 0;
  for (const c of route) if (Math.hypot(c.x - x, c.y - y) <= range) n++;
  return n;
}

function bestSpot(run, key, style) {
  const route = P.route(run.map, R.fieldFor(run, 'grunt'), run.map.entry);
  const onPath = new Set(route.map((c) => `${c.x},${c.y}`));
  const range = R.statOf(key, 1, run.mods).range;
  let best = null;
  for (const c of freeCells(run, key)) {
    const here = onPath.has(`${c.x},${c.y}`);
    // 막는 손버릇은 **방패병만** 길 위에 세운다. 나머지까지 길에 세우면 맞고
    // 죽으라고 내보내는 꼴이라, 그것을 봉쇄 전략이라고 부를 수 없다.
    const mayBlock = style === 'wall' && key === 'shield';
    if (mayBlock !== here) continue;
    const score = coverage(run, route, c.x, c.y, range) + (here ? 3 : 0);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { x: c.x, y: c.y, score };
  }
  return best;
}

// 차례를 무한히 돈다. **개수를 정해 두면 안 된다** — 목록 길이만큼 세우고 나면
// 골드가 남아도 아무것도 사지 않고 죽는 손이 된다(실제로 그렇게 짰다가 잡았다).
function wanted(run, style) {
  const list = (style === 'wall' ? ['shield', ...WANT] : WANT).filter((k) => run.roster.includes(k));
  if (!list.length) return run.roster[0];
  return list[run.units.length % list.length];
}

// 한 번의 판단. 돈이 되면 세우고, 더 세울 자리가 없으면 올린다.
function act(run, style) {
  const first = wanted(run, style);
  // 차례가 비싸면 살 수 있는 것 중 가장 비싼 것으로 대신한다. 기다리기만 하면
  // 골드를 쥔 채 뚫린다.
  const tries = [first, ...run.roster.filter((k) => k !== first)
    .sort((a, b) => D.UNITS[b].cost - D.UNITS[a].cost)];
  for (const key of tries) {
    if (!key || run.gold < D.UNITS[key].cost) continue;
    const spot = bestSpot(run, key, style);
    if (spot) { R.place(run, key, spot.x, spot.y); return true; }
  }
  // 올리는 것은 세우는 것보다 나중이다. 사람이 먼저 깔고 나중에 키운다.
  let target = null;
  for (const u of run.units) {
    if (u.tier >= D.UP.max) continue;
    if (run.gold < R.upCost(u.key, u.tier) * 1.6) continue;
    if (!target || D.UNITS[u.key].damage > D.UNITS[target.key].damage) target = u;
  }
  if (target) return R.upgrade(run, target.id);
  return false;
}

function play(stage, save, opts) {
  const o = opts || {};
  const style = o.style || 'open';
  const run = R.createRun(stage, {
    mods: T.modsOf(save),
    roster: save.team.slice(),
    map: o.map,
  });
  let guard = 0;
  while (!run.over && run.time < 900 && guard++ < 60000) {
    while (act(run, style)) { /* 살 수 있는 만큼 산다 */ }
    R.step(run, R.TICK * 3);
  }
  return run;
}

// 보석을 가장 싼 레벨부터 붓는다. 캐릭터 피해는 서로 더해지므로 나눠 키우는 쪽이
// 조금 낫고, 사람도 대개 그렇게 쓴다.
function spend(save) {
  let moved = true;
  let bought = false;
  while (moved) {
    moved = false;
    // 데려갈 사람이 칸보다 많으면 칸부터 늘린다. 좋은 사람을 얻고도 못 데려가는
    // 것이 레벨 하나보다 크게 손해다.
    if (save.owned.length > T.slotsOf(save) && T.buyPerk(save, 'slots')) { moved = true; bought = true; continue; }
    let cheapest = null;
    for (const key of save.owned) {
      const cost = T.levelCost(save, key);
      if (cost > save.gems) continue;
      if (!cheapest || cost < cheapest.cost) cheapest = { key, cost };
    }
    if (cheapest) { moved = T.buyLevel(save, cheapest.key); bought = bought || moved; }
  }
  return bought;
}

// 새 저장본으로 시작해 스테이지를 계속 올려 본다. 막히면 그 자리에서 몇 번 더
// 도전하고(진 판도 보석을 주므로 조금씩 유리해진다), 그래도 안 되면 멈춘다.
function rngOf(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function climb(opts) {
  const o = opts || {};
  const style = o.style || 'open';
  // 판은 스테이지로 고정이라 이 손이 완전히 결정적이다. 분포를 보려면 고르는
  // 카드가 갈려야 해서 씨드를 하나 받는다.
  const roll = rngOf(o.seed == null ? 1 : o.seed);
  const save = T.blank();
  const log = [];
  let stage = 1;
  let tries = 0;
  while (stage <= (o.cap || 60)) {
    const run = play(stage, save, { style });
    const got = T.settle(save, stage, run, roll);
    if (got.cards.length) T.takeCard(save, got.cards[Math.floor(roll() * got.cards.length)]);
    // 카드가 없어도 잠긴 사람은 언젠가 열린다고 보고, 편성 칸이 남으면 채운다.
    T.fillTeam(save);
    const grew = spend(save);
    log.push({ stage, won: run.over === 'won', wave: run.wave, time: Math.round(run.time) });
    if (run.over === 'won') { stage++; tries = 0; continue; }
    // 진 판이 레벨 하나라도 올려 줬다면 다음 도전은 다른 판이다. 아무것도 안
    // 늘었으면 똑같은 판을 다시 도는 것이라 세어 봐야 소용없다.
    if (grew) { tries = 0; continue; }
    // 막히면 **깰 수 있는 스테이지를 다시 돌아** 보석을 모은다. 진 판이 주는 것은
    // 클리어의 몇 십 분의 일이라, 벽 앞에서 같은 판만 다시 미는 것으로는 영영
    // 넘지 못한다. 사람이 실제로 하는 것도 이쪽이다.
    if (save.best >= 1) {
      const farm = play(save.best, save, { style });
      T.settle(save, save.best, farm, roll);
      log.push({ stage: save.best, farm: true, won: farm.over === 'won', wave: farm.wave, time: Math.round(farm.time) });
      if (spend(save)) { tries = 0; continue; }
    }
    if (++tries >= (o.retries || 8)) break;
  }
  return { save, log, reached: save.best };
}

const AI = { WANT, bestSpot, act, play, spend, climb, rngOf };

if (typeof module !== 'undefined' && module.exports) module.exports = AI;
if (typeof window !== 'undefined') window.DefenseAI = AI;

})();

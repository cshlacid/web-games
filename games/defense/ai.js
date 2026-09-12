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
function coverage(run, route, x, y, stat) {
  let n = 0;
  for (const c of route) if (R.inRange(stat, Math.hypot(c.x - x, c.y - y))) n++;
  return n;
}

function bestSpot(run, key, style) {
  const route = P.route(run.map, R.fieldFor(run, 'grunt'), run.map.entry);
  const onPath = new Set(route.map((c) => `${c.x},${c.y}`));
  const stat = R.statOf(key, 1, run.mods);
  let best = null;
  for (const c of freeCells(run, key)) {
    const here = onPath.has(`${c.x},${c.y}`);
    // **길 위에 서는 것은 앞을 맡는 자뿐이다.** 나머지까지 길에 세우면 맞고 죽으라고
    // 내보내는 꼴이라, 그것을 봉쇄 전략이라고 부를 수 없다.
    //
    // 예전에는 막는 손버릇(`wall`)에서만 길 위에 세웠는데, 그러면 트인 손은 공성병
    // 판에서 무엇을 해도 진다 — 초당 60으로 부수며 들어오는 것을 몸으로 받을 자가
    // 없기 때문이다. 실제로 어느 계수를 줘도 스테이지 21에서 똑같이 멈췄다.
    // 이제 앞을 맡는 자는 어느 손버릇에서나 길에 서고, 막는 손은 그 자리를 더
    // 좋아할 뿐이다.
    if (here && !D.UNITS[key].front) continue;
    // **공성병 판에서는 막는 손버릇도 막지 않는다.** 초당 60으로 부수며 들어오는
    // 것 앞에 길을 막고 서면 앞줄이 통째로 녹는다 — 사람도 그 판에서는 흘린다.
    const siege = mainFoe(run) === 'breaker';
    // **앞을 맡는 자는 길 칸 수로 재면 안 된다.** 사거리 1이라 보이는 길 칸이
    // 한둘뿐이어서, 커버리지로 고르면 길 밖의 구석에 선다. 그러면 검성처럼 붙어야
    // 값이 나오는 영웅이 판 내내 아무도 못 만난다 — 부른 열세 판 중 길 위에 선 것이
    // 둘뿐이었고, 그래서 검성을 데려간 쪽이 안 데려간 쪽보다 판 수가 더 들었다.
    // 이들은 **길 위에서 얼마나 앞쪽이냐**로 고른다.
    // **일반 방패병에게는 이 자를 대지 않는다.** 옮겨 보니 트인 손버릇이 늘 길을
    // 막는 손이 되어 손버릇 둘을 나눠 둔 뜻이 없어졌고, 막는 손의 도달도 오히려
    // 떨어졌다(25 → 24). 한 판에 하나뿐이라 자리를 고를 여유가 없는 영웅만 이렇게
    // 고른다.
    const blocker = D.UNITS[key].front && D.UNITS[key].hero;
    const score = (blocker && !siege)
      ? (here ? 100 - route.findIndex((r) => r.x === c.x && r.y === c.y) : 1)
      : coverage(run, route, c.x, c.y, stat) + (here ? (style === 'wall' && !siege ? 4 : 2) : 0);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { x: c.x, y: c.y, score };
  }
  return best;
}

// 차례를 무한히 돈다. **개수를 정해 두면 안 된다** — 목록 길이만큼 세우고 나면
// 골드가 남아도 아무것도 사지 않고 죽는 손이 된다(실제로 그렇게 짰다가 잡았다).
// **적마다 답이 다르다.** 이 표가 없으면 이 손은 판을 안 보고 늘 같은 것을 사서,
// "조합이 필요한 게임인가"를 재려 해도 조합을 할 줄 모르는 손으로 재게 된다.
// 근거는 `FOES[].resist`와 속도다 — 무리는 한 놈씩 쏘면 반이 낭비되고, 중장병은
// 단일에 90%를 깎고, 경보병은 느리게 하지 않으면 사거리를 지나간다.
const COUNTER = {
  grunt: ['archer', 'spear'],
  swarm: ['cannon', 'archer'],
  swift: ['frost', 'archer'],
  armored: ['frost', 'spear'],
  breaker: ['archer', 'shield', 'healer'],
  mender: ['cannon', 'archer'],
  // 언데드는 산 것을 잡는 수단이 전부 반쯤 통한다. 신성을 든 힐러가 답이다.
  bone: ['healer', 'spear'],
  wraith: ['healer', 'frost'],
};

// **그 판에 데려갈 영웅.** 셋이 저마다 다른 자리를 맡으므로 영웅 칸도 판을 보고
// 골라야 한다 — 멀리 다수면 대마법사, 붙어서 소수면 검성, 언데드면 성기사다.
const HERO_FOR = {
  grunt: 'blade', swarm: 'arch', swift: 'arch', armored: 'blade',
  breaker: 'blade', mender: 'arch', bone: 'saint', wraith: 'saint',
};

// 이 판에 가장 무겁게 오는 적. `waves.js`의 주력을 직접 읽지 않고 판이 들고 있는
// 웨이브에서 세면, 손으로 짠 판에서도 같은 손이 돈다. **마릿수가 아니라 예산으로
// 센다** — 무리는 한 무더기가 스물둘이라 머릿수로 세면 늘 무리가 주력이 된다.
function mainFoe(run) {
  const n = {};
  for (const w of run.waves) {
    for (const g of w.groups) {
      if (g.foe === 'boss') continue;
      n[g.foe] = (n[g.foe] || 0) + g.count * (D.FOES[g.foe].cost || 1);
    }
  }
  let top = null;
  for (const k of Object.keys(n)) if (!top || n[k] > n[top]) top = k;
  return top;
}

function wanted(run, style) {
  // 막는 손버릇이거나 미로판이면 방패병을 앞에 둔다. 좁은 목이 많은 판에서만
  // 막는 것이 이득이라, 판을 보고 정하는 것이 이 한 줄이다. **공성병 판은 빼고** —
  // 초당 60으로 부수며 들어오는 것 앞에 벽을 세우면 앞줄이 통째로 녹는다.
  const foe = mainFoe(run);
  const front = (style === 'wall' || run.map.shape === 'maze') && foe !== 'breaker' ? ['shield'] : [];
  const plan = [...front, ...(COUNTER[foe] || []), ...WANT];
  const list = plan.filter((k) => run.roster.includes(k));
  if (!list.length) return run.roster[0];
  return list[run.units.length % list.length];
}

// 한 번의 판단. 돈이 되면 세우고, 더 세울 자리가 없으면 올린다.
function act(run, style) {
  // **영웅을 부르려면 골드를 아껴야 한다.** 이 손은 싼 것부터 쉬지 않고 사느라
  // 골드가 220까지 모이는 순간이 오지 않아, 영웅 셋을 **한 번도 세우지 않았다** —
  // 계수 재기에서 통째로 빠져 있었다. 앞줄 넷이 선 뒤부터 여섯 번째 웨이브까지는
  // 영웅 말고는 아무것도 사지 않고 모은다.
  //
  // 셋째 웨이브를 기다리는 것은 **여는 값을 영웅에 쓰면 판이 통째로 무너지기**
  // 때문이다 — 두 번째 웨이브부터 모으게 했더니 성기사를 데려간 판이 스테이지
  // 2를 못 넘었다(240골드면 앞줄 넷이다). 여섯에서 푸는 것은 그때까지 못 모았으면
  // 그 판은 영웅을 부를 판이 아니기 때문이다.
  const hero = run.roster.find((k) => D.UNITS[k].hero);
  if (hero && !run.heroUsed && run.units.length >= 4 && run.wave >= 3 && run.wave <= 6) {
    if (run.gold >= R.costOf(run, hero)) {
      const spot = bestSpot(run, hero, style);
      if (spot) { R.place(run, hero, spot.x, spot.y); return true; }
    }
    return false;
  }
  const first = wanted(run, style);
  // 차례가 비싸면 살 수 있는 것 중 가장 비싼 것으로 대신한다. 기다리기만 하면
  // 골드를 쥔 채 뚫린다.
  const tries = [first, ...run.roster.filter((k) => k !== first)
    .sort((a, b) => R.costOf(run, b) - R.costOf(run, a))];
  for (const key of tries) {
    if (!key || run.gold < R.costOf(run, key)) continue;
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
    // 영웅도 데려간다. 사고 싶은 목록에는 없지만 골드가 남으면 비싼 것부터
    // 고르므로 자연스럽게 불려 나간다.
    roster: T.rosterOf(save),
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
// **데려가는 사람만 키운다.** 가진 것 전부에 골고루 부으면 정작 판에 세우는
// 사람들의 레벨이 반으로 깎인다 — 사람도 그렇게 쓰지 않는다.
function spend(save, only) {
  let moved = true;
  let bought = false;
  while (moved) {
    moved = false;
    // 데려갈 사람이 칸보다 많으면 칸부터 늘린다. 좋은 사람을 얻고도 못 데려가는
    // 것이 레벨 하나보다 크게 손해다.
    if (save.owned.length > T.slotsOf(save) && T.buyPerk(save, 'slots')) { moved = true; bought = true; continue; }
    // **막아 낼 종류가 모자라면 레벨보다 사람을 먼저 산다.** 목표를 못 채워도
    // 보석으로 여는 길이 있다.
    // **여유가 있을 때만 산다.** 가진 보석을 통째로 해금에 쓰면 정작 세울 사람들의
    // 레벨이 바닥이라, 종류만 늘고 판은 더 못 깬다.
    if (!only && save.owned.filter((k) => !T.isHero(k)).length < 4) {
      const shut = T.lockedList(save).filter((k) => !T.isHero(k));
      if (shut.length && save.gems >= T.unlockCost(save, shut[0]) * 2 && T.buyUnit(save, shut[0])) {
        T.fillTeam(save);
        moved = true;
        bought = true;
        continue;
      }
    }
    // 레벨은 부대 하나에 하나라 고를 것이 없다. 올릴 수 있으면 올린다.
    if (T.buyLevel(save)) { moved = true; bought = true; }
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
  // **한 종류만으로 어디까지 가는가.** 조합이 필요한 게임인지 재는 자다 — 궁수만
  // 올려서 끝까지 가면 나머지 다섯은 장식이다.
  const only = o.only || null;
  const keepTeam = () => {
    if (!only) return;
    save.team = only.filter((k) => save.owned.includes(k));
    if (!save.team.length) save.team = [D.STARTER];
    save.hero = null;
  };
  keepTeam();
  const log = [];
  let stage = 1;
  let tries = 0;
  while (stage <= (o.cap || 60)) {
    const run = play(stage, save, { style });
    const got = T.settle(save, stage, run, roll);
    if (got.cards.length) {
      // **새 캐릭터가 있으면 그것부터 고른다.** 사람도 그렇게 고르고, 무엇보다
      // 대응할 종류가 없으면 보석을 아무리 쌓아도 못 넘는 벽이 나온다.
      const open = got.cards.filter((c) => c.kind === 'unlock');
      const pool = open.length ? open : got.cards;
      T.takeCard(save, pool[Math.floor(roll() * pool.length)]);
    }
    // 카드가 없어도 잠긴 사람은 언젠가 열린다고 보고, 편성 칸이 남으면 채운다.
    T.fillTeam(save);
    keepTeam();
    const grew = spend(save, only);
    log.push({ stage, won: run.over === 'won', wave: run.wave, time: Math.round(run.time) });
    if (run.over === 'won') { stage++; tries = 0; continue; }
    // 진 판이 레벨 하나라도 올려 줬다면 다음 도전은 다른 판이다. 아무것도 안
    // 늘었으면 똑같은 판을 다시 도는 것이라 세어 봐야 소용없다.
    if (grew) { tries = 0; continue; }
    // 막히면 **깰 수 있는 스테이지를 다시 돌아** 보석을 모은다. 진 판이 주는 것은
    // 클리어의 몇 십 분의 일이라, 벽 앞에서 같은 판만 다시 미는 것으로는 영영
    // 넘지 못한다. 사람이 실제로 하는 것도 이쪽이다.
    if (save.best >= 1) {
      // **아직 목표를 못 채운 예전 스테이지를 먼저 고른다.** 거기서 목표를 채우면
      // 카드가 나와 막아 낼 종류를 얻는다 — 사람이 벽 앞에서 하는 것도 이쪽이다.
      const back = [];
      for (let s = 1; s <= save.best; s++) if (!save.goals[s]) back.push(s);
      // **그중 가장 높은 곳을 고른다.** 아래로 내려갈수록 보석이 적어, 낮은 판을
      // 돌면 목표는 채워도 레벨이 안 오른다.
      const pick = back.length ? Math.max(...back) : save.best;
      const farm = play(pick, save, { style });
      const won = T.settle(save, pick, farm, roll);
      if (won.cards.length) {
        const open = won.cards.filter((c) => c.kind === 'unlock');
        const pool = open.length ? open : won.cards;
        T.takeCard(save, pool[Math.floor(roll() * pool.length)]);
        T.fillTeam(save);
        keepTeam();
      }
      log.push({ stage: pick, farm: true, won: farm.over === 'won', wave: farm.wave, time: Math.round(farm.time) });
      if (won.cards.length || spend(save, only)) { tries = 0; continue; }
    }
    if (++tries >= (o.retries || 8)) break;
  }
  return { save, log, reached: save.best };
}

const AI = { WANT, COUNTER, HERO_FOR, mainFoe, bestSpot, act, play, spend, climb, rngOf };

if (typeof module !== 'undefined' && module.exports) module.exports = AI;
if (typeof window !== 'undefined') window.DefenseAI = AI;

})();

'use strict';

// 회귀 사이에 남는 것: 서클, 마나, 마도서. 저장본을 읽고 고치는 순수 함수만 둔다 —
// localStorage를 만지는 것은 화면 쪽이다.
//
// 서클은 판 밖에서만 오른다. 판 안에서 오르게 하면 한 판이 1서클부터 다시 쌓는
// 반복이 되어, "회귀할수록 강해진다"가 판 밖에 남지 않는다.
(function () {
  const node = typeof module !== 'undefined' && module.exports;
  const Runes = node ? require('./runes.js') : window.ArchmageRunes;
  const Gear = node ? require('./gear.js') : window.ArchmageGear;

  const MAX_CIRCLE = 9;
  const VERSION = 2;
  // 마력 수련. 서클마다 TRAIN_STEPS 단계를 마나로 수련하고, 다 채우면 다음 서클로 돌파한다.
  // 단계마다 능력 다섯이 차례로 하나씩 오른다(TRAIN_ORDER). 한 단계의 값은 서클과 상관없이
  // 같고, 값이 커지는 쪽은 비용이다 — 서클이 오를수록 한 단계가 크게 비싸져, 뒤로 갈수록
  // 서클 하나가 멀어진다. 1.7제곱일 때는 밤 다섯에 서클 하나씩 따라붙어 밤이 서클을
  // 앞서는 일이 없었고, 2.2제곱이면 한 서클에 드는 판 수가 두 판에서 열 판 가까이로 는다.
  const TRAIN_STEPS = 10;
  const TRAIN_ORDER = ['dmg', 'hp', 'cd', 'speed', 'xp'];
  const TRAIN_VALUE = { dmg: 0.06, hp: 10, cd: 0.012, speed: 0.015, xp: 0.04 };
  const trainCost = (circle, step) => Math.round(18 * Math.pow(circle, 2.2) * (1 + 0.12 * step));

  // night는 열려 있는 가장 깊은 밤, bosses는 넘긴 보스의 밤(번호로), train은 지금 서클에서
  // 수련한 단계 수.
  function fresh() {
    return {
      v: VERSION, circle: 1, train: 0, mana: 0, night: 1, bosses: {}, grimoire: {}, runs: 0, best: {},
      gold: 0, items: [], equipped: {}, nextUid: 1,
    };
  }

  function parse(text) {
    let raw = null;
    try { raw = JSON.parse(text || 'null'); } catch { raw = null; }
    const base = fresh();
    if (!raw || typeof raw !== 'object') return base;
    const obj = (v) => (v && typeof v === 'object' ? v : {});
    return {
      v: VERSION,
      circle: clampInt(raw.circle, 1, MAX_CIRCLE, 1),
      train: clampInt(raw.train, 0, TRAIN_STEPS, 0),
      mana: clampInt(raw.mana, 0, 1e9, 0),
      // 판이 서클에 묶여 있던 저장본(v1)은 밤의 기록이 없어 첫 번째 밤부터 연다.
      night: raw.v === VERSION ? clampInt(raw.night, 1, 1e6, 1) : 1,
      bosses: raw.v === VERSION ? obj(raw.bosses) : {},
      grimoire: obj(raw.grimoire),
      runs: clampInt(raw.runs, 0, 1e9, 0),
      best: raw.v === VERSION ? obj(raw.best) : {},
      gold: clampInt(raw.gold, 0, 1e9, 0),
      items: Array.isArray(raw.items) ? raw.items.filter(validItem) : [],
      equipped: obj(raw.equipped),
      nextUid: clampInt(raw.nextUid, 1, 1e9, 1),
    };
  }

  function clampInt(v, lo, hi, d) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  }

  const validItem = (it) => it && Gear.SLOTS.indexOf(it.slot) >= 0 && it.rarity >= 0 && it.rarity < Gear.RARITIES && it.level >= 1;

  const bossCount = (save) => Object.keys(save.bosses).length;

  // 한 판에서 버는 금화. 장비 강화와 상점에 쓴다. 잡은 수가 가장 크다 — 마나(버틴 시간)와
  // 결을 달리해, 오래 버티는 판과 많이 쓸어 담는 판이 서로 다른 것을 벌게 했다.
  function goldFor(result) {
    const base = Math.floor(result.kills / 4 + result.t / 3);
    const win = result.won ? 30 + 10 * result.night : 0;
    return Math.floor((base + win) * (1 + 0.1 * (result.night - 1)));
  }

  // 한 판에서 버는 마나. 버틴 시간이 가장 크고, 넘기면 밤의 깊이만큼 얹는다 — 지더라도
  // 오래 버틴 판이 돌파에 다가가게 해야 회귀가 헛걸음이 아니다.
  function manaFor(result) {
    const time = Math.floor(result.t / 6);
    const kills = Math.floor(result.kills / 12);
    const win = result.won ? (10 + 4 * result.night) * (result.boss ? 2 : 1) : 0;
    return Math.floor((time + kills + win) * (1 + 0.05 * (result.night - 1)));
  }

  // 판이 끝났을 때. 새로 기록한 마법의 열쇠와 번 마나·금화, 얻은 장비, 새로 열린 밤을
  // 돌려준다. 보스의 밤을 넘기면 장비가 반드시, 보통 밤은 네 판에 한 번꼴로 나온다.
  function settle(save, result, rng) {
    const gained = manaFor(result);
    save.mana += gained;
    const gold = goldFor(result);
    save.gold += gold;
    const drops = [];
    if (result.won && rng && (result.boss || rng() < 0.25)) drops.push(Gear.give(save, Gear.nightDrop(result.night, result.boss, rng)));
    save.runs += 1;
    const found = [];
    for (const key of result.formed) {
      if (save.grimoire[key]) continue;
      save.grimoire[key] = { run: save.runs };
      found.push(key);
    }
    let opened = false;
    if (result.won) {
      if (result.boss) save.bosses[result.night] = true;
      if (result.night >= save.night) { save.night = result.night + 1; opened = true; }
    }
    const prev = save.best[result.night] || 0;
    if (result.t > prev) save.best[result.night] = Math.floor(result.t);
    return { gained, gold, drops, found, opened };
  }

  function trainCheck(save) {
    if (save.train >= TRAIN_STEPS) return { ok: false, why: 'done' };
    const cost = trainCost(save.circle, save.train);
    return { ok: save.mana >= cost, why: save.mana >= cost ? null : 'mana', cost, stat: TRAIN_ORDER[totalSteps(save) % TRAIN_ORDER.length] };
  }

  function train(save) {
    const check = trainCheck(save);
    if (!check.ok) return false;
    save.mana -= check.cost;
    save.train += 1;
    return true;
  }

  // 지금까지 수련한 단계의 합. 서클을 돌파해도 수련한 것은 그대로 남는다.
  const totalSteps = (save) => (save.circle - 1) * TRAIN_STEPS + save.train;

  // 수련으로 오른 능력. 장비의 것(Gear.loadout)과 같은 꼴이라 둘을 더해 판에 넘긴다.
  function training(save) {
    const out = Gear.empty();
    const n = totalSteps(save);
    for (let k = 0; k < n; k++) {
      const stat = TRAIN_ORDER[k % TRAIN_ORDER.length];
      out[stat] += TRAIN_VALUE[stat];
    }
    return out;
  }

  // 판에 넘기는 힘: 수련 + 장비. 쿨타임은 합쳐도 절반까지만 준다.
  function power(save) {
    const a = training(save);
    const b = Gear.loadout(save);
    const out = { el: {} };
    for (const k of ['dmg', 'hp', 'cd', 'xp', 'regen', 'speed']) out[k] = a[k] + b[k];
    for (const e in b.el) out.el[e] = a.el[e] + b.el[e];
    out.cd = Math.min(0.5, out.cd);
    return out;
  }

  // 돌파는 지금 서클의 수련을 다 채웠을 때.
  function breakCheck(save) {
    if (save.circle >= MAX_CIRCLE) return { ok: false, why: 'max' };
    if (save.train < TRAIN_STEPS) return { ok: false, why: 'train', need: TRAIN_STEPS, have: save.train };
    return { ok: true };
  }

  function breakthrough(save) {
    if (!breakCheck(save).ok) return false;
    save.circle += 1;
    save.train = 0;
    return true;
  }

  // 이 서클까지에서 찾은 것과 찾을 수 있는 것.
  function grimoireCount(save, circle) {
    const keys = Runes.allKeys(circle);
    let found = 0, special = 0, specialFound = 0;
    for (const k of keys) {
      if (save.grimoire[k]) found += 1;
      if (Runes.isSpecial(k)) { special += 1; if (save.grimoire[k]) specialFound += 1; }
    }
    return { found, total: keys.length, specialFound, special };
  }

  const api = {
    MAX_CIRCLE, TRAIN_STEPS, TRAIN_ORDER, TRAIN_VALUE, trainCost, fresh, parse, manaFor, goldFor, settle,
    trainCheck, train, training, power, totalSteps, breakCheck, breakthrough, grimoireCount, bossCount,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageMeta = api;
})();

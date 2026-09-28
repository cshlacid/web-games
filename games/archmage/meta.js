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
  // 서클 c에서 c+1로 돌파하는 데 드는 마나. 뒤로 갈수록 한 판에 버는 양도 늘어
  // 대략 두세 판에 한 번 돌파하도록 맞췄다.
  const BREAK_COST = [0, 60, 180, 400, 750, 1250, 1900, 2800, 4000];

  // night는 열려 있는 가장 깊은 밤, bosses는 넘긴 보스의 밤(번호로). 서클 돌파는
  // 보스를 쓰러뜨린 수로 연다 — 밤이 서클과 따로 이어지게 되면서, 서클의 밤을 넘기는
  // 조건을 보스를 잡는 조건으로 바꿨다.
  function fresh() {
    return {
      v: VERSION, circle: 1, mana: 0, night: 1, bosses: {}, grimoire: {}, runs: 0, best: {},
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

  // 돌파는 보스를 지금 서클 수만큼 쓰러뜨렸고 마나가 모자라지 않을 때.
  function breakCheck(save) {
    const c = save.circle;
    if (c >= MAX_CIRCLE) return { ok: false, why: 'max' };
    const bosses = bossCount(save);
    if (bosses < c) return { ok: false, why: 'boss', cost: BREAK_COST[c], need: c, have: bosses };
    if (save.mana < BREAK_COST[c]) return { ok: false, why: 'mana', cost: BREAK_COST[c] };
    return { ok: true, cost: BREAK_COST[c] };
  }

  function breakthrough(save) {
    const check = breakCheck(save);
    if (!check.ok) return false;
    save.mana -= check.cost;
    save.circle += 1;
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

  const api = { MAX_CIRCLE, BREAK_COST, fresh, parse, manaFor, goldFor, settle, breakCheck, breakthrough, grimoireCount, bossCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageMeta = api;
})();

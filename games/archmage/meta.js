'use strict';

// 회귀 사이에 남는 것: 서클, 마나, 마도서. 저장본을 읽고 고치는 순수 함수만 둔다 —
// localStorage를 만지는 것은 화면 쪽이다.
//
// 서클은 판 밖에서만 오른다. 판 안에서 오르게 하면 한 판이 1서클부터 다시 쌓는
// 반복이 되어, "회귀할수록 강해진다"가 판 밖에 남지 않는다.
(function () {
  const Runes = typeof module !== 'undefined' && module.exports ? require('./runes.js') : window.ArchmageRunes;

  const MAX_CIRCLE = 9;
  const VERSION = 1;
  // 서클 c에서 c+1로 돌파하는 데 드는 마나. 뒤로 갈수록 한 판에 버는 양도 늘어
  // 대략 두세 판에 한 번 돌파하도록 맞췄다.
  const BREAK_COST = [0, 60, 180, 400, 750, 1250, 1900, 2800, 4000];

  function fresh() {
    return { v: VERSION, circle: 1, mana: 0, cleared: {}, grimoire: {}, runs: 0, best: {} };
  }

  function parse(text) {
    let raw = null;
    try { raw = JSON.parse(text || 'null'); } catch { raw = null; }
    const base = fresh();
    if (!raw || typeof raw !== 'object') return base;
    return {
      v: VERSION,
      circle: clampInt(raw.circle, 1, MAX_CIRCLE, 1),
      mana: clampInt(raw.mana, 0, 1e9, 0),
      cleared: raw.cleared && typeof raw.cleared === 'object' ? raw.cleared : {},
      grimoire: raw.grimoire && typeof raw.grimoire === 'object' ? raw.grimoire : {},
      runs: clampInt(raw.runs, 0, 1e9, 0),
      best: raw.best && typeof raw.best === 'object' ? raw.best : {},
    };
  }

  function clampInt(v, lo, hi, d) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  }

  // 한 판에서 버는 마나. 버틴 시간이 가장 크고, 이기면 서클만큼 얹는다 — 지더라도
  // 오래 버틴 판이 돌파에 다가가게 해야 회귀가 헛걸음이 아니다.
  function manaFor(result) {
    const time = Math.floor(result.t / 6);
    const kills = Math.floor(result.kills / 12);
    const win = result.won ? 40 * result.circle : 0;
    return Math.floor((time + kills + win) * (1 + 0.25 * (result.circle - 1)));
  }

  // 판이 끝났을 때. 새로 기록한 마법의 열쇠와 번 마나를 돌려준다.
  function settle(save, result) {
    const gained = manaFor(result);
    save.mana += gained;
    save.runs += 1;
    const found = [];
    for (const key of result.formed) {
      if (save.grimoire[key]) continue;
      save.grimoire[key] = { run: save.runs };
      found.push(key);
    }
    if (result.won) save.cleared[result.circle] = true;
    const prev = save.best[result.circle] || 0;
    if (result.t > prev) save.best[result.circle] = Math.floor(result.t);
    return { gained, found };
  }

  // 돌파는 지금 서클의 밤을 한 번 이겼고 마나가 모자라지 않을 때.
  function breakCheck(save) {
    const c = save.circle;
    if (c >= MAX_CIRCLE) return { ok: false, why: 'max' };
    if (!save.cleared[c]) return { ok: false, why: 'clear', cost: BREAK_COST[c] };
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

  const api = { MAX_CIRCLE, BREAK_COST, fresh, parse, manaFor, settle, breakCheck, breakthrough, grimoireCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageMeta = api;
})();

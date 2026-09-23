'use strict';

// 오늘의 도전. 날짜로 미션 셋을 고르고, 게임이 알려 온 판 결과로 달성을 가리고,
// 날마다 몇 개를 해냈는지 쌓는다. 화면과 저장은 `daily-ui.js`가 맡고 여기는 자료만
// 다룬다 — node로 규칙을 검증하려면 이 파일이 DOM도 localStorage도 몰라야 한다.
//
// 날짜는 기기의 현지 날짜다. 꼬들은 모두가 같은 답을 받아야 해서 한국 시간으로
// 끊지만, 여기서는 남과 맞출 것이 없고 달력은 제 하루를 따라가야 읽힌다.
(function (root) {

const PER_DAY = 3;

// 한 게임이 쉬움·보통·어려움(tier 1~3)을 하나 이상씩 들고 있어야 한다. 하루 세
// 미션은 서로 다른 게임 셋에서 tier를 하나씩 받는다 — 같은 게임이 둘 나오면
// 그 게임 한 판으로 둘이 한꺼번에 끝나 "여러 게임"이 무너진다.
//
// 문구는 사전의 `daily.<text>`(없으면 `daily.<id>`)에 있고 `vars`를 끼운다. 판 크기와
// 힌트처럼 여러 게임에 되풀이되는 조건은 공통 틀(`any`, `sizeUpClean` 같은)을 같이 쓴다 —
// 게임마다 문장을 따로 두면 열몇 게임 × 여섯 언어가 거의 같은 문장으로 채워진다.
// 기준 숫자를 vars로 빼 둔 것도 난이도를 손볼 때 문장을 고치지 않기 위해서다.
//
// 알파 게임은 넣지 않는다 — 규칙과 균형이 바뀌는 중이라 오늘 낸 미션이 내일
// 불가능해질 수 있다. 판 결과를 알려 오지 않는 게임도 당연히 넣을 수 없다.
const MISSIONS = [
  { id: 'sudoku.any', game: 'sudoku', tier: 1, text: 'anyLevel', test: () => true },
  { id: 'sudoku.medium', game: 'sudoku', tier: 2, text: 'medium', test: (r) => r.level === 'medium' || r.level === 'hard' },
  { id: 'sudoku.fast', game: 'sudoku', tier: 2, text: 'fast', vars: { min: 10 }, test: (r) => r.time <= 600 },
  { id: 'sudoku.hard', game: 'sudoku', tier: 3, text: 'hard', test: (r) => r.level === 'hard' },

  { id: 'queens.any', game: 'queens', tier: 1, text: 'any', test: () => true },
  { id: 'queens.big', game: 'queens', tier: 2, text: 'size', vars: { size: 9 }, test: (r) => r.size >= 9 },
  { id: 'queens.clean', game: 'queens', tier: 2, text: 'clean', test: (r) => r.hints === 0 },
  { id: 'queens.fast', game: 'queens', tier: 3, text: 'sizeUpFast', vars: { size: 8, min: 2 },
    test: (r) => r.size >= 8 && r.hints === 0 && r.time <= 120 },

  { id: 'tango.any', game: 'tango', tier: 1, text: 'any', test: () => true },
  { id: 'tango.big', game: 'tango', tier: 2, text: 'size', vars: { size: 8 }, test: (r) => r.size >= 8 },
  { id: 'tango.clean', game: 'tango', tier: 2, text: 'clean', test: (r) => r.hints === 0 },
  { id: 'tango.fast', game: 'tango', tier: 3, text: 'sizeFast', vars: { size: 8, min: 4 },
    test: (r) => r.size >= 8 && r.hints === 0 && r.time <= 240 },

  // 5×5는 몇 초면 끝나 쉬움으로도 싱겁다. 가장 쉬운 미션도 10×10부터다.
  { id: 'nonogram.any', game: 'nonogram', tier: 1, text: 'sizeUp', vars: { size: 10 }, test: (r) => r.size >= 10 },
  { id: 'nonogram.clean', game: 'nonogram', tier: 2, text: 'sizeUpClean', vars: { size: 10 },
    test: (r) => r.size >= 10 && r.hints === 0 },
  { id: 'nonogram.big', game: 'nonogram', tier: 2, text: 'size', vars: { size: 15 }, test: (r) => r.size >= 15 },
  { id: 'nonogram.hard', game: 'nonogram', tier: 3, text: 'sizeClean', vars: { size: 15 },
    test: (r) => r.size >= 15 && r.hints === 0 },

  { id: 'zip.any', game: 'zip', tier: 1, text: 'any', test: () => true },
  { id: 'zip.big', game: 'zip', tier: 2, text: 'size', vars: { size: 8 }, test: (r) => r.size >= 8 },
  { id: 'zip.clean', game: 'zip', tier: 2, text: 'sizeUpClean', vars: { size: 7 },
    test: (r) => r.size >= 7 && r.hints === 0 },
  { id: 'zip.fast', game: 'zip', tier: 3, text: 'sizeFast', vars: { size: 8, min: 2 },
    test: (r) => r.size >= 8 && r.hints === 0 && r.time <= 120 },

  { id: 'patches.any', game: 'patches', tier: 1, text: 'any', test: () => true },
  { id: 'patches.big', game: 'patches', tier: 2, text: 'size', vars: { size: 8 }, test: (r) => r.size >= 8 },
  { id: 'patches.clean', game: 'patches', tier: 2, text: 'clean', test: (r) => r.hints === 0 },
  { id: 'patches.fast', game: 'patches', tier: 3, text: 'sizeFast', vars: { size: 8, min: 3 },
    test: (r) => r.size >= 8 && r.hints === 0 && r.time <= 180 },

  // 기본 크기가 4×4라 그대로 두고 푼 판은 쉬움에도 넣지 않는다.
  { id: 'idioms.any', game: 'idioms', tier: 1, text: 'sizeUp', vars: { size: 5 }, test: (r) => r.size >= 5 },
  { id: 'idioms.big', game: 'idioms', tier: 2, text: 'sizeUp', vars: { size: 7 }, test: (r) => r.size >= 7 },
  { id: 'idioms.clean', game: 'idioms', tier: 2, text: 'sizeUpClean', vars: { size: 6 },
    test: (r) => r.size >= 6 && r.hints === 0 },
  { id: 'idioms.hard', game: 'idioms', tier: 3, text: 'sizeClean', vars: { size: 8 },
    test: (r) => r.size >= 8 && r.hints === 0 },

  { id: 'hashi.any', game: 'hashi', tier: 1, text: 'any', test: () => true },
  { id: 'hashi.clean', game: 'hashi', tier: 2, text: 'sizeUpClean', vars: { size: 11 },
    test: (r) => r.size >= 11 && r.hints === 0 },
  { id: 'hashi.big', game: 'hashi', tier: 2, text: 'size', vars: { size: 13 }, test: (r) => r.size >= 13 },
  { id: 'hashi.hard', game: 'hashi', tier: 3, text: 'sizeClean', vars: { size: 13 },
    test: (r) => r.size >= 13 && r.hints === 0 },

  { id: 'doppelblock.any', game: 'doppelblock', tier: 1, text: 'anyLevel', test: () => true },
  { id: 'doppelblock.medium', game: 'doppelblock', tier: 2, text: 'medium',
    test: (r) => r.level === 'medium' || r.level === 'hard' },
  { id: 'doppelblock.big', game: 'doppelblock', tier: 3, text: 'sizeUp', vars: { size: 7 }, test: (r) => r.size >= 7 },
  { id: 'doppelblock.hard', game: 'doppelblock', tier: 3, text: 'hard', test: (r) => r.level === 'hard' },
];

const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 밀리초로 하루를 빼면 서머타임이 걸린 날 한 시간이 모자라 같은 날에 머문다.
// 날짜 칸을 직접 옮기면 Date가 달과 해를 넘겨 준다.
function shiftKey(key, days) {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

// FNV-1a. 꼬들의 날짜 해시와 같은 방식이다.
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(key, missions = MISSIONS) {
  const random = mulberry32(hash('daily:' + key));
  const games = [];
  for (const m of missions) if (!games.includes(m.game)) games.push(m.game);
  for (let i = games.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [games[i], games[j]] = [games[j], games[i]];
  }
  return games.slice(0, PER_DAY).map((game, i) => {
    const pool = missions.filter((m) => m.game === game && m.tier === i + 1);
    return pool[Math.floor(random() * pool.length)].id;
  });
}

function create() {
  return { v: 1, days: {} };
}

// 그날의 셋은 처음 본 순간 기록에 박는다. 뒤에 미션 표를 고치거나 게임을 더해도
// 이미 시작한 날의 미션이 바뀌지 않고, 지난 날의 기록도 제 미션과 함께 남는다.
function day(state, key) {
  if (!state.days[key]) state.days[key] = { q: pick(key), done: [] };
  return state.days[key];
}

// 새로 달성한 미션 id를 돌려준다. 이미 해낸 것은 다시 세지 않는다.
function report(state, key, game, result) {
  const today = day(state, key);
  const gained = [];
  for (const id of today.q) {
    if (today.done.includes(id)) continue;
    const mission = BY_ID.get(id);
    if (!mission || mission.game !== game) continue;
    if (mission.test(result)) {
      today.done.push(id);
      gained.push(id);
    }
  }
  return gained;
}

function isComplete(entry) {
  return Boolean(entry) && entry.q.length > 0 && entry.done.length >= entry.q.length;
}

// 연속 기록은 셋을 다 해낸 날로 센다. 오늘을 아직 다 못 했다고 끊기지는 않는다 —
// 하루가 끝나기 전이니 어제까지의 줄이 그대로 살아 있다.
function streak(state, key) {
  let cursor = isComplete(state.days[key]) ? key : shiftKey(key, -1);
  let count = 0;
  while (isComplete(state.days[cursor])) {
    count++;
    cursor = shiftKey(cursor, -1);
  }
  return count;
}

function bestStreak(state) {
  const keys = Object.keys(state.days).filter((k) => isComplete(state.days[k])).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    run = prev && shiftKey(prev, 1) === key ? run + 1 : 1;
    if (run > best) best = run;
    prev = key;
  }
  return best;
}

const api = {
  PER_DAY, MISSIONS,
  mission: (id) => BY_ID.get(id) || null,
  dateKey, parseKey, shiftKey, hash, mulberry32,
  pick, create, day, report, isComplete, streak, bestStreak,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') root.SharedDaily = api;

})(typeof window !== 'undefined' ? window : globalThis);

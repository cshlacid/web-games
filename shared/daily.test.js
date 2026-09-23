'use strict';

// 실행: node shared/daily.test.js
const D = require('./daily.js');

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

// --- 날짜 ---

check('날짜 열쇠', D.dateKey(new Date(2026, 0, 5)), '2026-01-05');
check('해 넘김', D.shiftKey('2026-12-31', 1), '2027-01-01');
check('윤년', D.shiftKey('2028-03-01', -1), '2028-02-29');
check('달 넘김 거꾸로', D.shiftKey('2026-10-01', -1), '2026-09-30');

// --- 미션 표 ---

const games = [...new Set(D.MISSIONS.map((m) => m.game))];
check('게임 수가 하루 미션 수 이상', games.length >= D.PER_DAY, true);
for (const game of games) {
  for (let tier = 1; tier <= D.PER_DAY; tier++) {
    check(`${game} tier ${tier} 있음`, D.MISSIONS.some((m) => m.game === game && m.tier === tier), true);
  }
}
check('id 중복 없음', new Set(D.MISSIONS.map((m) => m.id)).size, D.MISSIONS.length);

// --- 고르기 ---

check('같은 날은 같은 셋', D.pick('2026-09-23'), D.pick('2026-09-23'));
let key = '2026-01-01';
let differ = 0;
let prev = null;
for (let i = 0; i < 365; i++) {
  const q = D.pick(key);
  const ms = q.map(D.mission);
  if (ms.some((m) => !m)) check(`${key} 없는 미션`, q, 'ok');
  check(`${key} 게임이 서로 다름`, new Set(ms.map((m) => m.game)).size, D.PER_DAY);
  check(`${key} tier 1·2·3`, ms.map((m) => m.tier), [1, 2, 3]);
  if (prev && JSON.stringify(prev) !== JSON.stringify(q)) differ++;
  prev = q;
  key = D.shiftKey(key, 1);
}
check('날마다 대체로 바뀐다', differ > 300, true);

// --- 달성 ---

{
  const state = D.create();
  const today = '2026-09-23';
  const entry = D.day(state, today);
  // 셋을 사람 손으로 박아 판정만 본다.
  entry.q = ['sudoku.hard', 'queens.clean', 'nonogram.any'];

  check('다른 게임은 무시', D.report(state, today, 'tango', { size: 8, time: 10, hints: 0 }), []);
  check('조건 미달', D.report(state, today, 'sudoku', { level: 'medium', time: 100 }), []);
  check('달성', D.report(state, today, 'sudoku', { level: 'hard', time: 900 }), ['sudoku.hard']);
  check('두 번 세지 않음', D.report(state, today, 'sudoku', { level: 'hard', time: 900 }), []);
  check('힌트 쓰면 미달', D.report(state, today, 'queens', { size: 9, time: 50, hints: 1 }), []);
  check('5×5는 안 침', D.report(state, today, 'nonogram', { size: 5, time: 10, hints: 0 }), []);
  check('아직 미완', D.isComplete(state.days[today]), false);
  D.report(state, today, 'queens', { size: 7, time: 300, hints: 0 });
  D.report(state, today, 'nonogram', { size: 10, time: 300, hints: 1 });
  check('셋 다 완료', D.isComplete(state.days[today]), true);
}

check('처음 본 날의 셋을 지킨다', (() => {
  const state = D.create();
  state.days['2026-09-23'] = { q: ['a', 'b', 'c'], done: [] };
  return D.day(state, '2026-09-23').q;
})(), ['a', 'b', 'c']);

// --- 연속 기록 ---

function full(q = ['x', 'y', 'z']) {
  return { q, done: q.slice() };
}

{
  const state = D.create();
  state.days['2026-09-20'] = full();
  state.days['2026-09-21'] = full();
  state.days['2026-09-22'] = full();
  state.days['2026-09-23'] = { q: ['x', 'y', 'z'], done: ['x'] };
  check('오늘 미완이어도 어제까지 이어진다', D.streak(state, '2026-09-23'), 3);
  state.days['2026-09-23'] = full();
  check('오늘 완료면 오늘까지', D.streak(state, '2026-09-23'), 4);
  check('하루 비면 끊긴다', D.streak(state, '2026-09-25'), 0);
  state.days['2026-09-10'] = full();
  state.days['2026-09-11'] = full();
  check('최고 연속', D.bestStreak(state), 4);
  check('달을 넘어 이어진다', (() => {
    const s = D.create();
    s.days['2026-08-31'] = full();
    s.days['2026-09-01'] = full();
    return D.streak(s, '2026-09-01');
  })(), 2);
}

console.log(`통과 ${passed}, 실패 ${failed}`);
if (failed) process.exit(1);

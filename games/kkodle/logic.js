'use strict';

const H = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./hangul.js')
  : window.KkodleHangul;

const WORD_LENGTH = 2;
const MAX_TRIES = 6;
const SLOTS = WORD_LENGTH * 3;

/**
 * 추측 한 줄을 판정한다. 워들과 같은 두 번 훑기 규칙이다: 먼저 자리까지 맞는
 * 것을 확정하고, 남은 자모 개수 안에서만 '있음'을 준다. 이렇게 하지 않으면
 * 정답에 한 번 나오는 자모가 여러 칸에서 노랑으로 표시된다.
 *
 * 받침 없음('')은 자리가 맞을 때만 인정하고 '있음' 후보에서는 뺀다. 다른
 * 글자의 받침이 비었다는 이유로 노랑을 주면 힌트로서 뜻이 없다.
 */
function judge(guessSlots, answerSlots) {
  const marks = new Array(SLOTS).fill('absent');
  const pool = new Map();

  for (let i = 0; i < SLOTS; i++) {
    if (guessSlots[i] === answerSlots[i]) {
      marks[i] = 'correct';
    } else if (answerSlots[i] !== '') {
      pool.set(answerSlots[i], (pool.get(answerSlots[i]) || 0) + 1);
    }
  }

  for (let i = 0; i < SLOTS; i++) {
    if (marks[i] === 'correct') continue;
    const jamo = guessSlots[i];
    if (jamo === '') continue;
    const left = pool.get(jamo) || 0;
    if (left > 0) {
      marks[i] = 'present';
      pool.set(jamo, left - 1);
    }
  }

  return marks;
}

/** 자모별 최선의 결과. 키보드 색칠에 쓴다. */
function keyboardState(rows) {
  const rank = { absent: 0, present: 1, correct: 2 };
  const state = {};
  for (const row of rows) {
    row.slots.forEach((jamo, i) => {
      if (!jamo) return;
      const mark = row.marks[i];
      if (!(jamo in state) || rank[mark] > rank[state[jamo]]) state[jamo] = mark;
    });
  }
  return state;
}

// 날짜를 섞어 인덱스로 만든다. 단순히 날짜 순서대로 꺼내면 목록 순서가 그대로
// 노출되고, 하루 지난 답이 다음 답을 알려주는 꼴이 된다.
function dailyIndex(dateKey, size) {
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % size;
}

// 날짜 경계는 한국 시간 자정으로 잡는다. 브라우저 시간대를 그대로 쓰면 같은
// 날에 사람마다 다른 답을 받는다.
function dateKey(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function isValidGuess(text) {
  if ([...text].length !== WORD_LENGTH) return false;
  return [...text].every((ch) => H.isSyllable(ch));
}

/** 공유용 이모지 격자. */
function shareText(rows, dayLabel, solved) {
  const emoji = { correct: '🟩', present: '🟨', absent: '⬜' };
  const head = `꼬들 ${dayLabel} ${solved ? rows.length : 'X'}/${MAX_TRIES}`;
  const body = rows
    .map((row) => row.marks.map((m) => emoji[m]).join(''))
    .join('\n');
  return `${head}\n${body}`;
}

const Logic = {
  WORD_LENGTH, MAX_TRIES, SLOTS,
  judge, keyboardState, dailyIndex, dateKey, isValidGuess, shareText,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
if (typeof window !== 'undefined') window.KkodleLogic = Logic;

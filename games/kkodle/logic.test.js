'use strict';

// 브라우저 없이 자모 처리와 판정을 검증한다. 실행: node games/kkodle/logic.test.js
const H = require('./hangul.js');
const L = require('./logic.js');
const WORDS = require('./words.js');

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

// --- 분해와 조합 ---
check('받침 없는 글자 분해', H.decompose('가'), { cho: 'ㄱ', jung: 'ㅏ', jong: '' });
check('받침 있는 글자 분해', H.decompose('강'), { cho: 'ㄱ', jung: 'ㅏ', jong: 'ㅇ' });
check('겹받침 분해', H.decompose('닭'), { cho: 'ㄷ', jung: 'ㅏ', jong: 'ㄺ' });
check('겹모음 분해', H.decompose('과'), { cho: 'ㄱ', jung: 'ㅘ', jong: '' });
check('조합', H.compose('ㅅ', 'ㅏ', 'ㅇ'), '상');
check('받침 없는 조합', H.compose('ㅅ', 'ㅏ'), '사');
check('한글이 아니면 null', H.decompose('a'), null);

check('단어를 6칸으로', H.toSlots('사과'), ['ㅅ', 'ㅏ', '', 'ㄱ', 'ㅘ', '']);
check('받침 있는 단어', H.toSlots('한글'), ['ㅎ', 'ㅏ', 'ㄴ', 'ㄱ', 'ㅡ', 'ㄹ']);

// --- 입력기(오토마타) ---
function type(keys, maxLength = 2) {
  let blocks = [];
  for (const key of keys) {
    blocks = key === '<' ? H.backspace(blocks) : H.input(blocks, key, maxLength);
  }
  return H.blocksToText(blocks);
}

check('자음만', type(['ㄱ']), 'ㄱ');
check('자음+모음', type(['ㄱ', 'ㅏ']), '가');
check('받침까지', type(['ㄱ', 'ㅏ', 'ㅇ']), '강');
check('두 글자', type(['ㅅ', 'ㅏ', 'ㄱ', 'ㅗ', 'ㅏ']), '사과');
check('겹모음 합치기', type(['ㄱ', 'ㅗ', 'ㅏ']), '과');
check('겹받침 합치기', type(['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ']), '닭');

// 받침 뒤에 모음이 오면 받침이 다음 글자의 초성으로 넘어간다.
check('받침 이동', type(['ㄱ', 'ㅏ', 'ㅁ', 'ㅏ']), '가마');
check('겹받침에서 뒤만 이동', type(['ㅇ', 'ㅏ', 'ㄴ', 'ㅈ', 'ㅏ']), '안자');
check('받침 없이 모음이 오면 새 글자', type(['ㄱ', 'ㅏ', 'ㅗ']), '가ㅗ');

// 두 글자가 찬 뒤에도 자음은 받침이 될 수 있으므로 받아준다.
check('완성 뒤 받침은 허용', type(['ㄱ', 'ㅏ', 'ㄴ', 'ㅏ', 'ㅇ']), '가낭');
// 반면 모음은 세 번째 글자를 만들게 되므로 거부한다.
check('세 글자를 만드는 모음은 무시', type(['ㄱ', 'ㅏ', 'ㄴ', 'ㅏ', 'ㄷ', 'ㅏ']), '가낟');
check('받침 이동으로도 길이를 넘지 못한다', type(['ㄱ', 'ㅏ', 'ㄴ', 'ㅏ', 'ㅇ', 'ㅣ']), '가낭');

// 지우기는 자모 한 겹씩
check('받침 지우기', type(['ㄱ', 'ㅏ', 'ㅇ', '<']), '가');
check('겹받침 한 겹만', type(['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ', '<']), '달');
check('겹모음 한 겹만', type(['ㄱ', 'ㅗ', 'ㅏ', '<']), '고');
check('모음 지우기', type(['ㄱ', 'ㅏ', '<']), 'ㄱ');
check('초성 지우면 빈 칸', type(['ㄱ', '<']), '');
check('빈 상태에서 지우기', type(['<']), '');

// --- 판정 ---
const marks = (guess, answer) => L.judge(H.toSlots(guess), H.toSlots(answer));

check('정답', marks('사과', '사과'), ['correct', 'correct', 'correct', 'correct', 'correct', 'correct']);
// 겹치는 자모가 없으면 받침 자리를 뺀 나머지는 모두 absent
const disjoint = marks('구름', '사탕');
check('겹치는 자모가 없음', [disjoint[0], disjoint[1], disjoint[3], disjoint[4]],
  ['absent', 'absent', 'absent', 'absent']);

// 자리는 틀렸지만 단어 안에 있는 자모는 present
check('자리 다른 자모', marks('가시', '시가').slice(0, 2), ['present', 'present']);

// 받침 없음은 자리가 맞을 때만 correct, present로는 주지 않는다.
const noJong = marks('사과', '나비');
check('빈 받침은 자리가 맞으면 correct', [noJong[2], noJong[5]], ['correct', 'correct']);
const jongCase = marks('한글', '사과');
check('있는 받침이 정답에 없으면 absent', [jongCase[2], jongCase[5]], ['absent', 'absent']);

// 자리가 맞아 이미 쓰인 자모는 다른 칸에 노랑을 주지 않는다.
const used = L.judge(['ㄱ', 'ㅏ', '', 'ㄱ', 'ㅏ', ''], ['ㄴ', 'ㅏ', '', 'ㄱ', 'ㅗ', '']);
check('정답의 ㄱ은 자리가 맞은 칸이 가져간다', used[3], 'correct');
check('남은 ㄱ이 없으므로 absent', used[0], 'absent');

// 추측에 세 번, 정답에 두 번 나오는 자모: present는 남은 개수만큼만.
const dup = L.judge(H.toSlots('각가'), H.toSlots('고낙'));
check('자리 맞은 ㄱ', dup[0], 'correct');
check('남은 ㄱ 하나는 present', dup[2], 'present');
check('그 다음 ㄱ은 absent', dup[3], 'absent');

// --- 키보드 상태 ---
const rows = [
  { slots: H.toSlots('가나'), marks: marks('가나', '가방') },
  { slots: H.toSlots('바다'), marks: marks('바다', '가방') },
];
const kb = L.keyboardState(rows);
check('맞은 자모는 correct 유지', kb['ㄱ'], 'correct');
check('여러 줄 중 가장 좋은 결과', kb['ㅂ'], 'present');

// --- 날짜와 단어 선택 ---
check('KST 기준 날짜', L.dateKey(new Date('2026-08-18T16:00:00Z')), '2026-08-19');
check('자정 직전은 아직 전날', L.dateKey(new Date('2026-08-18T14:59:00Z')), '2026-08-18');
check('같은 날은 같은 단어', L.dailyIndex('2026-08-18', 100), L.dailyIndex('2026-08-18', 100));
check('다른 날은 대체로 다른 단어',
  L.dailyIndex('2026-08-18', 269) !== L.dailyIndex('2026-08-19', 269), true);

// 날짜별 인덱스가 목록 전체에 고르게 퍼지는지 (한쪽으로 쏠리면 같은 답이 자주 나온다)
const seen = new Set();
for (let i = 0; i < 269; i++) {
  const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000);
  seen.add(L.dailyIndex(L.dateKey(d), WORDS.length));
}
check('269일 동안 서로 다른 단어가 절반 이상', seen.size > 134, true);

// --- 입력 검증 ---
check('두 글자 한글', L.isValidGuess('사과'), true);
check('한 글자', L.isValidGuess('사'), false);
check('세 글자', L.isValidGuess('사과나'), false);
check('자모만', L.isValidGuess('ㄱㅏ'), false);
check('영어', L.isValidGuess('ab'), false);

// --- 공유 문구 ---
const share = L.shareText([{ marks: marks('사과', '사과') }], '2026-08-18', true);
check('공유 문구 첫 줄', share.split('\n')[0], '꼬들 2026-08-18 1/6');
check('공유 문구 격자', share.split('\n')[1], '🟩🟩🟩🟩🟩🟩');
check('실패는 X', L.shareText([{ marks: [] }], '2026-08-18', false).split('\n')[0], '꼬들 2026-08-18 X/6');

// --- 단어 목록 ---
check('단어는 모두 두 글자 한글', WORDS.every((w) => L.isValidGuess(w)), true);
check('중복 없음', WORDS.length, new Set(WORDS).size);
check('모든 단어가 6칸으로 펼쳐짐', WORDS.every((w) => H.toSlots(w).length === 6), true);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);

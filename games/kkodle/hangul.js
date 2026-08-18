'use strict';

// 한글 음절을 자모로 쪼개고 다시 합치는 계층. 판정도 입력도 모두 자모 단위로
// 이뤄지므로 게임의 나머지 전부가 이 파일 위에 올라간다.

const BASE = 0xac00;
const LAST = 0xd7a3;

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

// 두 자모가 한 자리에 겹쳐 들어가는 경우. 키보드에는 ㅘ나 ㄳ 키가 없으므로
// 입력기가 이 표를 보고 합쳐 준다.
const JUNG_PAIRS = {
  'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ',
  'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ',
  'ㅡㅣ': 'ㅢ',
};

const JONG_PAIRS = {
  'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ',
  'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ',
  'ㅂㅅ': 'ㅄ',
};

// 겹자모를 다시 둘로 나눈다. 받침이 다음 글자로 넘어가거나 지워질 때 필요하다.
const SPLIT = {};
for (const [pair, merged] of Object.entries({ ...JUNG_PAIRS, ...JONG_PAIRS })) {
  SPLIT[merged] = [pair[0], pair[1]];
}

const isSyllable = (ch) => {
  const code = ch.charCodeAt(0);
  return code >= BASE && code <= LAST;
};

const isConsonant = (jamo) => CHO.includes(jamo) || JONG.includes(jamo);
const isVowel = (jamo) => JUNG.includes(jamo);

function decompose(ch) {
  if (!isSyllable(ch)) return null;
  const offset = ch.charCodeAt(0) - BASE;
  return {
    cho: CHO[Math.floor(offset / (21 * 28))],
    jung: JUNG[Math.floor(offset / 28) % 21],
    jong: JONG[offset % 28],
  };
}

function compose(cho, jung, jong = '') {
  const c = CHO.indexOf(cho);
  const v = JUNG.indexOf(jung);
  const t = JONG.indexOf(jong || '');
  if (c < 0 || v < 0 || t < 0) return null;
  return String.fromCharCode(BASE + (c * 21 + v) * 28 + t);
}

// 단어를 판정 단위로 펼친다. 받침이 없는 글자도 자리를 비워 두지 않고 빈
// 문자열을 채워, 모든 글자가 초·중·종 세 칸을 똑같이 차지하게 한다.
function toSlots(word) {
  const slots = [];
  for (const ch of word) {
    const parts = decompose(ch);
    if (!parts) return null;
    slots.push(parts.cho, parts.jung, parts.jong);
  }
  return slots;
}

/** 블록 하나(조합 중인 글자)를 화면에 보일 문자열로 만든다. */
function blockText(block) {
  if (!block) return '';
  if (block.cho && block.jung) return compose(block.cho, block.jung, block.jong) || '';
  return block.cho || block.jung || '';
}

function blocksToText(blocks) {
  return blocks.map(blockText).join('');
}

/**
 * 자모 하나를 입력한 뒤의 블록 배열을 돌려준다. 입력을 받을 수 없으면 원본을
 * 그대로 돌려준다(길이 초과 등).
 *
 * 블록을 배열로 들고 있는 이유: 받침은 뒤에 모음이 오면 다음 글자의 초성으로
 * 옮겨가야 한다. 완성된 문자열만 들고 있으면 이 되돌리기를 할 수 없다.
 */
function input(blocks, jamo, maxLength) {
  const next = blocks.map((b) => ({ ...b }));
  const last = next[next.length - 1];

  const pushBlock = (block) => {
    if (next.length >= maxLength) return blocks;
    next.push(block);
    return next;
  };

  if (isVowel(jamo)) {
    if (!last) return pushBlock({ cho: null, jung: jamo, jong: null });

    if (last.cho && !last.jung) {
      last.jung = jamo;
      return next;
    }
    if (last.jung && !last.jong) {
      const merged = JUNG_PAIRS[last.jung + jamo];
      if (merged) {
        last.jung = merged;
        return next;
      }
      return pushBlock({ cho: null, jung: jamo, jong: null });
    }
    if (last.jong) {
      // 받침 이동: 겹받침이면 뒤쪽 자모만 넘어간다. 앉 + ㅏ -> 안자
      const split = SPLIT[last.jong];
      const moving = split ? split[1] : last.jong;
      if (next.length >= maxLength) return blocks;
      last.jong = split ? split[0] : null;
      next.push({ cho: moving, jung: jamo, jong: null });
      return next;
    }
    return pushBlock({ cho: null, jung: jamo, jong: null });
  }

  if (!isConsonant(jamo)) return blocks;

  if (!last) return pushBlock({ cho: jamo, jung: null, jong: null });

  if (last.cho && last.jung && !last.jong) {
    if (JONG.includes(jamo)) {
      last.jong = jamo;
      return next;
    }
    return pushBlock({ cho: jamo, jung: null, jong: null });
  }
  if (last.jong) {
    const merged = JONG_PAIRS[last.jong + jamo];
    if (merged) {
      last.jong = merged;
      return next;
    }
    return pushBlock({ cho: jamo, jung: null, jong: null });
  }
  return pushBlock({ cho: jamo, jung: null, jong: null });
}

/** 자모 하나만큼 지운다. 겹자모는 한 번에 다 지우지 않고 한 겹만 벗긴다. */
function backspace(blocks) {
  const next = blocks.map((b) => ({ ...b }));
  const last = next[next.length - 1];
  if (!last) return next;

  if (last.jong) {
    const split = SPLIT[last.jong];
    last.jong = split ? split[0] : null;
  } else if (last.jung) {
    const split = SPLIT[last.jung];
    if (split) last.jung = split[0];
    else if (last.cho) last.jung = null;
    else next.pop();
  } else {
    next.pop();
  }
  return next;
}

const Hangul = {
  CHO, JUNG, JONG,
  isSyllable, isConsonant, isVowel,
  decompose, compose, toSlots,
  blockText, blocksToText, input, backspace,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Hangul;
if (typeof window !== 'undefined') window.KkodleHangul = Hangul;

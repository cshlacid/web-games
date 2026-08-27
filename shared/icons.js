'use strict';

// 여러 게임이 함께 쓰는 화면 아이콘. 연필·지우기·되돌리기 같은 도구 단추는
// 스도쿠와 더블블록이 글자 하나 다르지 않게 같은 줄을 쓰고, 지우기는 꼬들
// 자판에도 있다. 그래서 `shared/audio.js`와 같은 자리에 둔다.
//
// **이모지나 기호 문자로 대신하지 않는다.** 글꼴이 그리는 그림이라 기기마다
// 모양과 크기가 다르고(⌫와 ↶는 아예 안 그리는 글꼴도 있다), 제 색을 들고 와서
// 화면이 정한 색 규칙을 깬다. `currentColor`로 그으면 밝은 테마와 어두운 테마를
// 함께 탄다.
//
// 게임 하나에만 있는 아이콘은 여기에 두지 않는다 — 힐러의 스킬·장비 아이콘은
// `games/healer/icons.js`에 따로 있다.
(function (root) {

// 24칸 격자에 선 굵기 2. 화면에서 아이콘 하나가 18~22px이라 이보다 가늘면 선이
// 사라지고, 굵으면 안쪽 구멍이 메워진다.
const BOX = 24;
const STROKE = 2;

// { d: '...' } 는 선으로 긋는 경로, `f: 1`이면 채운다.
const ICONS = {
  // 연필. 심과 몸통을 가르는 선이 없으면 그냥 막대로 보인다.
  pencil: [{ d: 'M3.5 20.5 L4.5 15.8 L15.9 4.4 A2.6 2.6 0 0 1 19.6 8.1 L8.2 19.5 Z' },
    { d: 'M13.6 6.7 L17.3 10.4' }],
  // 지우기. 왼쪽으로 뾰족한 자판 모양이라야 "뒤로 지운다"로 읽힌다.
  backspace: [{ d: 'M9 4 H20 A2 2 0 0 1 22 6 V18 A2 2 0 0 1 20 20 H9 L1.5 12 Z' },
    { d: 'M12.5 9.5 L17.5 14.5' }, { d: 'M17.5 9.5 L12.5 14.5' }],
  // 되돌리기. 곧은 꼬리와 갈매기 촉으로 다시 하기(고리)와 가른다.
  undo: [{ d: 'M3 8 H13.5 A6 6 0 0 1 13.5 20 H7.5' }, { d: 'M7 3.5 L2.5 8 L7 12.5' }],
  // 힌트. 물음표는 글자라 글꼴을 타므로 전구로 바꿨다.
  hint: [{ d: 'M12 2.5 A6.2 6.2 0 0 1 15.7 13.6 V16 H8.3 V13.6 A6.2 6.2 0 0 1 12 2.5 Z' },
    { d: 'M9 18.6 H15' }, { d: 'M10.2 21.5 H13.8' }],
  plus: [{ d: 'M12 4 V20' }, { d: 'M4 12 H20' }],
  // 다시 하기. 한 바퀴 도는 고리라야 되돌리기와 갈린다.
  restart: [{ d: 'M20.5 12 A8.5 8.5 0 1 1 15.2 4.1' }, { d: 'M11 2.2 L16 3.6 L14.6 8.6 Z', f: 1 }],
  next: [{ d: 'M3 12 H17' }, { d: 'M14 6.5 L21 12 L14 17.5 Z', f: 1 }],
  // 한 번 눌러 겹모음·된소리로 바꾸는 자판 키.
  shift: [{ d: 'M12 2.5 L21.5 12 H16.5 V20.5 H7.5 V12 H2.5 Z' }],
};

function shape(part) {
  const fill = part.f ? ' fill="currentColor" stroke="none"' : '';
  return `<path d="${part.d}"${fill}/>`;
}

const cache = new Map();

// 모르는 이름이 와도 화면이 비지 않아야 한다 — 아이콘 하나가 빠졌다고 단추를
// 못 누르게 되면 곤란하다.
const FALLBACK = [{ d: 'M12 4 A8 8 0 1 1 11.9 4 Z' }];

function svg(name) {
  if (cache.has(name)) return cache.get(name);
  const parts = (ICONS[name] || FALLBACK).map(shape).join('');
  const markup = `<svg class="ico" viewBox="0 0 ${BOX} ${BOX}"`
    + ` fill="none" stroke="currentColor" stroke-width="${STROKE}"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
  cache.set(name, markup);
  return markup;
}

// HTML에는 `data-icon="pencil"`처럼 이름만 적고 여기서 그린다. 경로를 HTML에도
// 적으면 같은 그림이 두 곳에 생겨 한쪽만 고치는 일이 난다.
function paint(scope) {
  const where = scope || document;
  for (const slot of where.querySelectorAll('[data-icon]')) {
    slot.innerHTML = svg(slot.dataset.icon);
  }
}

const has = (name) => Object.prototype.hasOwnProperty.call(ICONS, name);

const api = { svg, paint, has, ICONS, BOX, STROKE };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.SharedIcons = api;

})(typeof window !== 'undefined' ? window : globalThis);

'use strict';

// 이 게임에만 있는 아이콘 둘. 여러 게임이 함께 쓰는 것은 ../../shared/icons.js에 있고,
// 여기 있는 것은 노노그램의 두 가지 칠하기 모드를 가리킨다.
//
// **`currentColor`로 그린다.** 고른 모드에 따라 색이 뒤바뀌므로 아이콘이 제 색을 들고
// 있으면 안 된다.
(function (root) {

const BOX = 24;
const STROKE = 2;

const ICONS = {
  // 칠하기. 네모를 꽉 채운 그림이 곧 칠한 칸의 모습이다.
  fill: [{ d: 'M4 4 H20 V20 H4 Z', f: 1 }],
  // 아님. 비어 있는 것이 확실한 칸에 치는 가위표.
  cross: [{ d: 'M6 6 L18 18' }, { d: 'M18 6 L6 18' }],
};

function shape(one) {
  if (one.f) return `<path d="${one.d}" fill="currentColor" stroke="none"/>`;
  return `<path d="${one.d}"/>`;
}

function svg(name) {
  const parts = (ICONS[name] || []).map(shape).join('');
  return `<svg viewBox="0 0 ${BOX} ${BOX}" fill="none" stroke="currentColor"`
    + ` stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`
    + ` aria-hidden="true">${parts}</svg>`;
}

// HTML에는 이름만 적는다(`data-game-icon="cross"`). 공용 아이콘과 속성 이름을 갈라
// 두어야 두 모듈이 같은 자리를 서로 덮어쓰지 않는다.
function paint(scope) {
  const where = scope || document;
  for (const slot of where.querySelectorAll('[data-game-icon]')) {
    slot.innerHTML = svg(slot.dataset.gameIcon);
  }
}

const api = { ICONS, svg, paint, BOX, STROKE };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.NonoIcons = api;

})(typeof window !== 'undefined' ? window : globalThis);

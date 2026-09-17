'use strict';

// 이 게임에만 있는 아이콘 — 차로가 허락하는 이동을 나타내는 화살표 넷.
//
// **이모지나 화살표 글자(↑←→↩)로 대신하지 않는다.** 글꼴이 그리는 그림이라 기기마다
// 모양과 크기가 다르고, 제 색을 들고 와서 화면이 정한 색 규칙을 깬다. 도로 바닥에
// 그리는 화살표는 캔버스가 같은 모양을 직접 긋는다(main.js).
(function (root) {

const BOX = 24;
const STROKE = 2;

// 아래에서 위로 올라가는 화살표다. 도로 바닥의 화살표도 같은 뜻으로 읽히게 방향을
// 맞췄다 — 진행 방향이 위쪽이다.
const ICONS = {
  through: [{ d: 'M12 21 V5' }, { d: 'M7 10 L12 4.5 L17 10' }],
  left: [{ d: 'M12 21 V13 A5 5 0 0 0 7 8 H4.5' }, { d: 'M8.5 3.5 L3.5 8 L8.5 12.5' }],
  right: [{ d: 'M12 21 V13 A5 5 0 0 1 17 8 H19.5' }, { d: 'M15.5 3.5 L20.5 8 L15.5 12.5' }],
  // 유턴. 고리를 돌아 반대로 내려가는 모양이라야 좌회전과 갈린다.
  uturn: [{ d: 'M8 21 V11 A4 4 0 0 1 16 11 V17' }, { d: 'M12 13 L16 18 L20 13' }],
};

function shape(part) {
  const fill = part.f ? ' fill="currentColor" stroke="none"' : '';
  return `<path d="${part.d}"${fill}/>`;
}

const cache = new Map();

function svg(name) {
  if (cache.has(name)) return cache.get(name);
  const parts = (ICONS[name] || []).map(shape).join('');
  const markup = `<svg class="ico" viewBox="0 0 ${BOX} ${BOX}"`
    + ` fill="none" stroke="currentColor" stroke-width="${STROKE}"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
  cache.set(name, markup);
  return markup;
}

// 공용 아이콘과 자리를 나눠 쓰지 않도록 속성 이름을 따로 둔다.
function paint(scope) {
  const where = scope || document;
  for (const slot of where.querySelectorAll('[data-road-icon]')) {
    slot.innerHTML = svg(slot.dataset.roadIcon);
  }
}

const api = { svg, paint, ICONS, BOX, STROKE };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RoadIcons = api;

})(typeof window !== 'undefined' ? window : globalThis);

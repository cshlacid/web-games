'use strict';

// 이 게임에만 있는 도구 아이콘. 여러 게임이 함께 쓰는 것은 `shared/icons.js`에 있고,
// 여기 셋은 도로공사 말고 쓸 데가 없어 게임 폴더에 둔다(힐러의 스킬 아이콘과 같은
// 이유다). 이모지로 대신하지 않는 이유도 같다 — 글꼴이 그리는 그림이라 기기마다
// 모양과 색이 달라진다.
(function (root) {

const BOX = 24;
const STROKE = 2;

const ICONS = {
  // 새 길. 갓길 두 줄과 가운데 점선. 점선이 없으면 그냥 막대 두 개로 보인다.
  road: [{ d: 'M5 2 V22' }, { d: 'M19 2 V22' },
    { d: 'M12 4 V8' }, { d: 'M12 11 V13' }, { d: 'M12 16 V20' }],
  // 차로를 늘린다. 갓길이 밖으로 밀려나는 화살표로 "넓힌다"를 말한다.
  widen: [{ d: 'M4 3 V21' }, { d: 'M20 3 V21' },
    { d: 'M10 12 H6' }, { d: 'M8.5 9.5 L6 12 L8.5 14.5' },
    { d: 'M14 12 H18' }, { d: 'M15.5 9.5 L18 12 L15.5 14.5' }],
  // 신호등. 등 셋과 기둥. 등이 둘이면 신호로 읽히지 않는다.
  signal: [{ d: 'M8.5 2 H15.5 A2 2 0 0 1 17.5 4 V15 A2 2 0 0 1 15.5 17 H8.5 A2 2 0 0 1 6.5 15 V4 A2 2 0 0 1 8.5 2 Z' },
    { d: 'M12 4.3 A1.3 1.3 0 1 1 11.99 4.3 Z', f: 1 },
    { d: 'M12 8.2 A1.3 1.3 0 1 1 11.99 8.2 Z', f: 1 },
    { d: 'M12 12.1 A1.3 1.3 0 1 1 11.99 12.1 Z', f: 1 },
    { d: 'M12 17 V22' }],
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

// 공용 아이콘과 자리를 나눠 쓰지 않도록 속성 이름을 따로 둔다. 같은 `data-icon`에
// 얹으면 어느 파일이 그 이름을 들고 있는지가 HTML만 봐서는 보이지 않는다.
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

'use strict';

// 이 게임에만 있는 그림. 단서가 말하는 조각의 모양이다. 다른 게임에 없으므로
// `shared/icons.js`가 아니라 여기에 둔다. 도구 단추(되돌리기·지우기·힌트·새 판)는
// 공용 것을 그대로 쓴다.
//
// **이모지나 기호 문자로 대신하지 않는다.** 글꼴이 그리는 그림이라 기기마다 모양과
// 크기가 다르고 제 색을 들고 온다. 이 아이콘은 조각 색 위에 얹히므로 색을 스스로
// 정하면 안 되고, `currentColor`로 그어야 밝은 테마와 어두운 테마를 함께 탄다.
//
// **네모를 네모로 그린다.** 정사각·가로·세로가 한눈에 갈리려면 그림 자체가 그
// 비율이어야 한다. 24칸 격자 안에서 넓이는 비슷하게 두고 비율만 바꿨다.
(function (root) {

const BOX = 24;

const ICONS = {
  square: { x: 4.5, y: 4.5, w: 15, h: 15 },
  wide: { x: 1.5, y: 6.5, w: 21, h: 11 },
  tall: { x: 6.5, y: 1.5, w: 11, h: 21 },
  // 자유 단서. 점선이라 "정해지지 않았다"로 읽힌다.
  free: { x: 3.5, y: 3.5, w: 17, h: 17, dash: 1 },
};

const cache = new Map();

function svg(name) {
  if (cache.has(name)) return cache.get(name);
  const box = ICONS[name];
  if (!box) return '';
  const dash = box.dash ? ' stroke-dasharray="3.4 2.8"' : '';
  const markup = `<svg class="ico ico-${name}" viewBox="0 0 ${BOX} ${BOX}"`
    + ' fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"'
    + ` aria-hidden="true"><rect x="${box.x}" y="${box.y}" width="${box.w}"`
    + ` height="${box.h}" rx="2.4"${dash}/></svg>`;
  cache.set(name, markup);
  return markup;
}

const api = { svg, ICONS, BOX };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.PatchesIcons = api;

})(typeof window !== 'undefined' ? window : globalThis);

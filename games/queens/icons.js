'use strict';

// 이 게임에만 있는 그림. 왕관과 배제 표시는 다른 게임에 없으므로 `shared/icons.js`가
// 아니라 여기에 둔다. 도구 단추(되돌리기·지우기·힌트·새 판)는 공용 것을 그대로 쓴다.
//
// **이모지(♛·✕)로 대신하지 않는다.** 글꼴이 그리는 그림이라 기기마다 모양과
// 크기가 다르고 제 색을 들고 온다. 왕관은 판의 영역 색 위에 놓이므로 색을
// 스스로 정하면 안 되고, `currentColor`로 그어야 밝은 테마와 어두운 테마를
// 함께 탄다.
(function (root) {

const BOX = 24;

// 왕관은 칸을 꽉 채우는 그림이라 선이 아니라 면으로 그린다. 선으로 그리면
// 작은 칸에서 안쪽 삼각형 두 개가 뭉개진다.
const ICONS = {
  crown: [
    { d: 'M3.4 6.2 L8.4 11.4 L12 4.6 L15.6 11.4 L20.6 6.2 L19.2 16.6 L4.8 16.6 Z', f: 1 },
    { d: 'M5 18.4 H19 A1.3 1.3 0 0 1 19 21 H5 A1.3 1.3 0 0 1 5 18.4 Z', f: 1 },
  ],
  // 배제 표시. 왕관과 굵기가 비슷하면 판을 훑을 때 둘이 섞여 보이므로 가늘게
  // 긋고 화면에서 흐리게 깐다.
  mark: [{ d: 'M7.5 7.5 L16.5 16.5' }, { d: 'M16.5 7.5 L7.5 16.5' }],
};

function shape(part) {
  const fill = part.f ? ' fill="currentColor" stroke="none"' : '';
  return `<path d="${part.d}"${fill}/>`;
}

const cache = new Map();

function svg(name) {
  if (cache.has(name)) return cache.get(name);
  const parts = (ICONS[name] || []).map(shape).join('');
  const markup = `<svg class="ico ico-${name}" viewBox="0 0 ${BOX} ${BOX}"`
    + ' fill="none" stroke="currentColor" stroke-width="2.4"'
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
  cache.set(name, markup);
  return markup;
}

const api = { svg, ICONS, BOX };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.QueensIcons = api;

})(typeof window !== 'undefined' ? window : globalThis);

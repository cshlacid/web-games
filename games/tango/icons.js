'use strict';

// 이 게임에만 있는 그림. 해와 달은 다른 게임에 없으므로 `shared/icons.js`가 아니라
// 여기에 둔다. 도구 단추(되돌리기·지우기·힌트·새 판)는 공용 것을 그대로 쓴다.
//
// **이모지(☀·🌙)로 대신하지 않는다.** 글꼴이 그리는 그림이라 기기마다 모양과
// 크기가 다르고 제 색을 들고 온다. 이 게임은 두 그림을 한눈에 가르는 것이
// 전부라 모양이 기기마다 달라지면 안 되고, `currentColor`로 그어야 밝은 테마와
// 어두운 테마를 함께 탄다.
(function (root) {

const BOX = 24;

// 둘 다 면으로 그린다. 선으로 그리면 6×6 판을 8×8로 바꿨을 때 속이 비어 보여
// 멀리서 둘을 가르기 어렵다. 대신 **해는 뻗은 빛, 달은 파인 옆구리**로 윤곽이
// 서로 닮지 않게 했다 — 색만으로 가르게 두면 색을 못 가리는 사람이 못 푼다.
const ICONS = {
  sun: [
    { d: 'M12 7.1 A4.9 4.9 0 1 1 11.99 7.1 Z', f: 1 },
    { d: 'M12 1.6 V4.4 M12 19.6 V22.4 M1.6 12 H4.4 M19.6 12 H22.4'
      + ' M4.65 4.65 L6.63 6.63 M17.37 17.37 L19.35 19.35'
      + ' M19.35 4.65 L17.37 6.63 M6.63 17.37 L4.65 19.35' },
  ],
  // 초승달은 큰 원에서 작은 원을 도려낸 모양이다. 두 호를 반대로 돌려 한 획에
  // 담으면 도려낸 자리가 그대로 빈다.
  moon: [
    { d: 'M20.2 15.4 A9 9 0 1 1 9.1 3.5 A7.1 7.1 0 0 0 20.2 15.4 Z', f: 1 },
  ],
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
    + ' fill="none" stroke="currentColor" stroke-width="2.1"'
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
  cache.set(name, markup);
  return markup;
}

root.TangoIcons = { svg };

})(window);

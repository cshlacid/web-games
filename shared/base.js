'use strict';

// 더블 탭 확대를 막는 마지막 한 겹. 나머지는 `shared/base.css`가 한다.
//
// **iOS 사파리는 `touch-action: none`으로는 더블 탭 확대를 막지 않는다.**
// `manipulation`만 막는다. 그런데 판처럼 끌어서 조작하는 자리에는 `none`을 걸어야
// 한다 — `manipulation`은 손가락을 끌면 페이지가 따라 스크롤되고, 그러면 선도 조각도
// 그을 수 없다. 그래서 화면 대부분은 막히는데 **판 안에서만 두 번 두드리면 확대되는**
// 상태가 된다. 실제로 그렇게 보고를 받았다.
//
// 그 자리만 자바스크립트로 메운다. 두 번째 두드림의 기본 동작을 없애면 사파리가
// 확대를 시작하지 않는다.
//
// **`touchend`가 아니라 `touchstart`에서 막는다.** 처음에는 touchend에서 막았는데
// 왕관 놓기에서만 듣지 못했다. 그 게임은 칸을 누르는 순간 칸 안의 그림을 갈아
// 끼우는데, 그러면 두드림이 시작된 요소가 사라져 touchend가 문서까지 올라오지
// 않는다. touchstart는 그 순간의 요소로 잡히므로 이 일이 없다.
//
// 두 가지를 좁혀 두었다. **연달아 같은 자리를 두드렸을 때만** 막는다 — 아무 탭이나
// 막으면 단추를 두 번 눌러야 하는 곳에서 두 번째가 먹지 않는다. 그리고 **효력이
// 미치는 곳이 `none`인 자리에서만** 막는다 — 그 밖은 CSS가 이미 막고 있고, 거기까지
// 손대면 시트를 닫는 탭 같은 것이 같이 죽는다.
(function () {

// 두 번의 두드림을 한 번의 더블 탭으로 볼 간격과 거리. 사파리가 보는 것과 비슷하게
// 잡았다. 더 길게 잡으면 빠르게 두 번 누르는 조작이 걸리고, 더 짧으면 새 나간다.
const GAP = 350;
const NEAR = 32;

let last = 0;
let lastX = 0;
let lastY = 0;

// touch-action은 상속되지 않지만, 실제로 걸리는 값은 조상까지의 교집합이다.
// 그래서 위로 올라가며 하나라도 none이면 그 자리는 none이다.
function handled(node) {
  for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
    if (getComputedStyle(el).touchAction === 'none') return true;
  }
  return false;
}

document.addEventListener('touchstart', (event) => {
  const touch = event.changedTouches[0];
  if (!touch) return;

  const now = Date.now();
  const quick = now - last < GAP;
  const near = Math.abs(touch.clientX - lastX) < NEAR
    && Math.abs(touch.clientY - lastY) < NEAR;
  last = now;
  lastX = touch.clientX;
  lastY = touch.clientY;

  if (!quick || !near || !handled(event.target)) return;
  event.preventDefault();
}, { capture: true, passive: false });

})();

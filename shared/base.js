'use strict';

// 더블 탭 확대를 막는 마지막 한 겹. 나머지는 `shared/base.css`가 한다.
//
// **iOS 사파리는 `touch-action: none`으로는 더블 탭 확대를 막지 않는다.**
// `manipulation`만 막는다. 그런데 판처럼 끌어서 조작하는 자리에는 `none`을 걸어야
// 한다 — `manipulation`은 손가락을 끌면 페이지가 따라 스크롤되고, 그러면 선도 조각도
// 그을 수 없다. 그래서 화면 대부분은 CSS가 막는데 **판 안에서만 두 번 두드리면
// 확대되는** 상태가 된다. 그 자리만 여기서 메운다.
//
// **`none`인 자리에서는 조건 없이 막는다.** 처음에는 "짧은 사이에 같은 자리를 두 번"
// 일 때만 막았는데, 사파리가 더블 탭으로 보는 간격이 그보다 넓어서 적당한 박자로
// 눌러 나가면 새 나갔다. 시간으로 재는 한 어디선가 새고, 문턱을 넓히면 이번에는
// 연달아 눌러야 하는 조작이 막힌다.
//
// **그 대신 `none`이 아닌 자리는 건드리지 않는다.** 거기는 CSS가 이미 막고 있고,
// 손대면 시트를 닫는 탭이나 단추 두 번 누르기가 같이 죽는다.
//
// **`touchstart`가 아니라 `touchend`에서 막는다.** touchstart에서 막았더니 2048의
// 스와이프가 죽었다 — 그 게임은 touchstart와 touchend의 좌표 차이로 방향을 읽는데,
// 시작을 취소하면 그 뒤가 오지 않는다. 끝을 취소하는 것은 뒤따르는 click을 없앨
// 뿐이라 조작을 건드리지 않는다.
//
// 조건 없이 막아도 되는 이유는 **`none`인 자리가 click으로 도는 조작을 두지 않기
// 때문이다** — 판 넷(2048·한붓그리기·왕관 놓기·Patches), 힐러의 전장, 시트 손잡이가
// 전부 포인터·터치 이벤트로만 돈다. 이 안에 click으로 도는 단추를 두게 되면 여기도
// 같이 고쳐야 한다.
//
// 이것이 되려면 **누른 요소가 손가락을 떼는 순간까지 붙어 있어야 한다.** 눌린 칸의
// 그림을 그 자리에서 갈아 끼우면 touchend가 문서까지 올라오지 않아 여기가 듣지
// 못한다. 왕관 놓기가 그랬고, 그래서 그 게임은 그림을 미리 넣어 두고 감춘다.
(function () {

// 손가락을 벌려 키우는 확대도 막는다. `user-scalable=no`는 iOS 사파리가 무시하고,
// `touch-action: manipulation`은 이름 그대로 벌리기를 허용하는 값이라 CSS로는
// 남는다. 목록 페이지까지 모든 페이지가 이 파일을 부른다.
//
// **두 갈래로 막는다.** 웹킷의 gesture 이벤트는 사파리가 벌리기를 알아채는 지점이고,
// 손가락이 둘 이상인 touchmove는 규격에 있는 쪽이다. 사파리 판에 따라 한쪽이 새는
// 일이 있어 둘 다 둔다. 손가락 하나로 하는 스크롤은 건드리지 않는다.
//
// **`touch-action`을 `pan-x pan-y`로 바꾸는 길도 있지만 택하지 않았다.** 규격대로면
// 그 값이 벌리기와 더블 탭을 함께 막지만, 사파리가 `none`을 더블 탭에 대해 무시한
// 전례가 있어 `manipulation`에서 옮기는 것은 이미 되는 것을 걸고 하는 내기가 된다.
// 지금은 CSS가 더블 탭을, 이쪽이 벌리기를 맡아 서로 기대지 않는다.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
}

document.addEventListener('touchmove', (event) => {
  if (event.touches.length > 1) event.preventDefault();
}, { capture: true, passive: false });

// 마지막 그물. 위의 것들이 다 새더라도 **확대된 채로 남지는 않게** 한다. 막는 것이
// 아니라 되돌리는 것이라 어떤 경로로 확대됐든 걸린다 — 사파리 판마다 새는 자리가
// 달라 하나씩 틀어막는 방식으로는 끝이 나지 않았다.
//
// viewport 메타의 내용을 다시 써 넣으면 사파리가 제약을 다시 적용하며 배율을
// 되돌린다. 같은 값을 그대로 넣으면 바뀐 것이 없어 다시 적용하지 않으므로 한 번
// 다른 값을 거쳐 간다. 배율이 1일 때는 아무것도 하지 않으니, 이 방법이 통하지
// 않는 판에서도 해가 없다.
const viewport = document.querySelector('meta[name="viewport"]');
if (viewport && window.visualViewport) {
  const wanted = viewport.getAttribute('content');
  window.visualViewport.addEventListener('resize', () => {
    if (window.visualViewport.scale <= 1.01) return;
    viewport.setAttribute('content', `${wanted}, minimum-scale=1`);
    requestAnimationFrame(() => viewport.setAttribute('content', wanted));
  });
}

// touch-action은 상속되지 않지만, 실제로 걸리는 값은 조상까지의 교집합이다.
// 그래서 위로 올라가며 하나라도 none이면 그 자리는 none이다.
function handled(node) {
  for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
    if (getComputedStyle(el).touchAction === 'none') return true;
  }
  return false;
}

document.addEventListener('touchend', (event) => {
  if (!handled(event.target)) return;
  event.preventDefault();
}, { capture: true, passive: false });

})();

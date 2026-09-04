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

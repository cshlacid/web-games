'use strict';

// 판을 기기 픽셀 자리에 앉힌다.
//
// 판은 가운데 정렬로 놓이는데 그 자리는 대개 소수점이다(6×6 한붓그리기를 아이폰
// 폭에서 재 보니 202.5 기기픽셀, 딱 반 픽셀). 그러면 **칸과 선이 서로 다르게
// 반올림된다** — 칸의 배경색은 배치 엔진이 픽셀에 맞춰 칠하고, 그 위에 겹쳐 긋는
// SVG 선은 `shape-rendering: crispEdges`가 제 나름대로 픽셀에 맞춘다. 둘이 반 픽셀
// 어긋난 자리에서 각자 반올림하니 선이 칸마다 같은 쪽으로 한 픽셀씩 밀려 보이고,
// 그것이 "오른쪽과 아래쪽에 선이 삐져나온다"로 나타났다.
//
// 판을 그 소수점만큼 밀어 자리를 정수로 맞추면 둘이 같은 격자 위에 놓인다. 칸
// 크기까지 정수로 끊어 두면(각 게임의 `--cell`) 판 안의 모든 경계가 정수가 된다.
//
// 화면이 바뀌면 칸 크기도 바뀌므로 다시 맞춘다.
(function (root) {

function offset(node) {
  const dpr = window.devicePixelRatio || 1;
  const box = node.getBoundingClientRect();
  return [
    (Math.round(box.x * dpr) - box.x * dpr) / dpr,
    (Math.round(box.y * dpr) - box.y * dpr) / dpr,
  ];
}

function snap(node) {
  if (!node) return;
  // 이전에 민 것을 되돌리고 원래 자리를 다시 잰다.
  node.style.transform = '';
  const [dx, dy] = offset(node);
  node.style.transform = (dx || dy) ? `translate(${dx}px, ${dy}px)` : '';
}

// 한 번 걸어 두면 화면이 바뀔 때마다 알아서 다시 맞춘다.
function pin(node) {
  const again = () => snap(node);
  snap(node);
  window.addEventListener('resize', again);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', again);
  return again;
}

const api = { snap, pin };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.SharedSnap = api;

})(typeof window !== 'undefined' ? window : globalThis);

// 서비스 워커를 등록한다. 워커 자신(`sw.js`)은 사이트 전체를 담아야 하므로 루트에
// 두고, 등록은 모든 페이지가 이 파일 하나로 한다 — 게임 폴더마다 경로를 적어 두면
// 새 게임에서 빠뜨린다. 루트는 이 스크립트 자리에서 한 칸 위로 계산한다.
(function () {
  if (!('serviceWorker' in navigator)) return;
  var root = new URL('../', document.currentScript.src);

  // 처음 담을 때 사이트 전체를 받으므로 첫 화면이 다 뜬 뒤로 미룬다.
  window.addEventListener('load', function () {
    navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.href })
      .catch(function () {});
  });
})();

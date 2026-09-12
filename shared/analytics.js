// 측정 ID를 한 곳에만 두려고 gtag 스니펫을 공용 파일로 뽑았다. 페이지마다 적어 두면
// 게임을 새로 만들 때 빠뜨리기 쉽고, ID가 바뀌면 열일곱 곳을 고쳐야 한다.
(function () {
  var ID = 'G-CC2RRW8EJD';

  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(tag);

  window.dataLayer = window.dataLayer || [];
  // gtag.js가 arguments 객체를 그대로 읽으므로 화살표 함수나 나머지 매개변수로 바꿀 수 없다.
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', ID);
})();

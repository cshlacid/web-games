// 언어는 페이지마다 고르지 않고 목록 페이지에서 한 번 고른 값을 모든 페이지가 읽는다.
// 사전을 언어별 파일로 쪼개 고른 것만 받아오는 길도 있지만, 빌드 도구가 없어 동적
// 로드를 직접 짜야 하고 첫 화면이 그 요청을 기다리게 된다 — 한 파일에 여섯 언어를
// 담아 동기로 읽으면 몇 KB 더 받는 대신 기다림이 없다.
(function () {
  var STORE_KEY = 'web-games.lang';
  // 다섯 언어 어느 쪽도 아닌 브라우저는 영어로 보낸다. 한국어로 두면 읽지 못하는
  // 사람에게 읽지 못하는 화면이 나오지만, 영어는 최소한 게임 이름은 짚을 수 있다.
  var FALLBACK = 'en';

  // 라벨은 그 언어 스스로의 표기다 — 모르는 언어로 적힌 목록에서는 자기 언어를 못 찾는다.
  var LANGS = [
    { code: 'ko', label: '한국어' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'zh-CN', label: '简体中文' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'es', label: 'Español' }
  ];

  var dict = {};
  LANGS.forEach(function (l) { dict[l.code] = {}; });

  var current = null;

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* 사파리 비공개 모드에서는 저장이 막힌다 — 이번 방문만 쓰고 넘어간다. */ }
  }

  function load(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function known(code) {
    return LANGS.some(function (l) { return l.code === code; });
  }

  // 브라우저가 주는 태그는 'zh-Hans-CN'이나 'es-419'처럼 지역·표기가 붙어 온다.
  function resolve(tag) {
    var parts = String(tag || '').toLowerCase().split('-');
    var base = parts[0];
    if (base === 'zh') {
      // 표기가 적혀 있으면 그대로 따르고, 지역만 있으면 대만·홍콩·마카오만 번체로 본다.
      if (parts.indexOf('hans') >= 0) return 'zh-CN';
      if (parts.indexOf('hant') >= 0) return 'zh-TW';
      var hant = parts.indexOf('tw') >= 0 || parts.indexOf('hk') >= 0 || parts.indexOf('mo') >= 0;
      return hant ? 'zh-TW' : 'zh-CN';
    }
    if (base === 'ko' || base === 'en' || base === 'ja' || base === 'es') return base;
    return null;
  }

  function detect() {
    var saved = load(STORE_KEY);
    if (saved && known(saved)) return saved;
    var tags = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language];
    for (var i = 0; i < tags.length; i++) {
      var hit = resolve(tags[i]);
      if (hit) return hit;
    }
    return FALLBACK;
  }

  function t(key, vars) {
    var text = dict[current][key];
    // 번역이 아직 없는 자리는 영어로, 영어도 없으면 한국어로 내린다. 빈 화면보다는
    // 다른 언어로라도 읽히는 편이 낫다.
    if (text === undefined) text = dict.en[key];
    if (text === undefined) text = dict.ko[key];
    if (text === undefined) return null;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
    });
  }

  function each(scope, selector, fn) {
    Array.prototype.forEach.call(scope.querySelectorAll(selector), fn);
  }

  function apply(root) {
    var scope = root || document;
    each(scope, '[data-i18n]', function (el) {
      var text = t(el.getAttribute('data-i18n'));
      if (text !== null) el.textContent = text;
    });
    // 도움말 문장처럼 <b>가 문장 한가운데 박히는 자리는 통째로 옮긴다. 강조 앞뒤를
    // 따로 나누면 어순이 다른 언어에서 문장이 성립하지 않는다. 사전은 우리가 쓴
    // 글이라 innerHTML로 넣어도 바깥에서 들어온 값이 섞일 자리가 없다.
    each(scope, '[data-i18n-html]', function (el) {
      var text = t(el.getAttribute('data-i18n-html'));
      if (text !== null) el.innerHTML = text;
    });
    // "content=hub.desc, aria-label=hub.lang" 꼴. 글로 보이지 않는 자리(대체 텍스트,
    // 메타 태그, 문서 제목)도 같은 사전을 타야 해서 속성용 통로를 따로 둔다.
    each(scope, '[data-i18n-attr]', function (el) {
      el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var cut = pair.indexOf('=');
        if (cut < 0) return;
        var text = t(pair.slice(cut + 1).trim());
        if (text !== null) el.setAttribute(pair.slice(0, cut).trim(), text);
      });
    });
    document.documentElement.lang = current;
    if (!root) fillPickers(scope);
  }

  function fillPickers(scope) {
    each(scope, 'select[data-i18n-picker]', function (select) {
      if (!select.options.length) {
        LANGS.forEach(function (l) {
          var option = document.createElement('option');
          option.value = l.code;
          option.textContent = l.label;
          select.appendChild(option);
        });
        select.addEventListener('change', function () { set(select.value); });
      }
      select.value = current;
    });
  }

  function set(code) {
    if (!known(code) || code === current) return;
    current = code;
    store(STORE_KEY, code);
    apply();
    // 화면을 스스로 그리는 쪽(점수판, 결과 안내)은 이 신호를 받아 다시 그린다.
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: code } }));
  }

  function add(tables) {
    Object.keys(tables).forEach(function (code) {
      if (!dict[code]) return;
      var table = tables[code];
      Object.keys(table).forEach(function (key) { dict[code][key] = table[key]; });
    });
  }

  current = detect();
  // 사전이 실려 다 등록되기 전이라도 문서 언어는 먼저 맞춰 둔다. 글꼴 선택과
  // 줄바꿈 규칙이 이 값을 보고 갈리므로 늦으면 한 번 다시 배치된다.
  document.documentElement.lang = current;

  window.SharedI18n = {
    LANGS: LANGS,
    add: add,
    apply: apply,
    set: set,
    t: t,
    get lang() { return current; }
  };
})();

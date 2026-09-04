'use strict';

// 브라우저에서는 클래식 스크립트가 전역 렉시컬 스코프를 공유한다. 파일마다
// 최상위에 같은 이름을 선언하면 다른 파일과 충돌하므로 IIFE로 가둔다.
(function () {
  const L = window.ChessPuzzleLogic;
  const Icons = window.SharedIcons;
  const Data = window.ChessPuzzleData;
  const Sound = window.ChessSound;
  const SAVE_KEY = 'web-games.chess-puzzle.progress';

  const el = {
    board: document.getElementById('board'),
    levels: document.getElementById('levels'),
    count: document.getElementById('count'),
    rating: document.getElementById('rating'),
    side: document.getElementById('side'),
    title: document.getElementById('title'),
    themes: document.getElementById('themes'),
    message: document.getElementById('message'),
    hint: document.getElementById('hint'),
    retry: document.getElementById('retry'),
    next: document.getElementById('next'),
    after: document.getElementById('after'),
    why: document.getElementById('why'),
    replay: document.getElementById('replay'),
    promotion: document.getElementById('promotion'),
    promotionKeys: document.getElementById('promotion-keys'),
    help: document.getElementById('help'),
    helpOpen: document.getElementById('help-open'),
    helpClose: document.getElementById('help-close'),
    toggleBgm: document.getElementById('toggle-bgm'),
    toggleSfx: document.getElementById('toggle-sfx'),
  };

  const Pieces = window.ChessPieces;
  const PROMOTION_ORDER = ['q', 'r', 'b', 'n'];
  const PROMOTION_NAMES = { q: '퀸', r: '룩', b: '비숍', n: '나이트' };

  const store = {
    get(fallback) {
      try { return JSON.parse(localStorage.getItem(SAVE_KEY)) ?? fallback; } catch { return fallback; }
    },
    set(value) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(value)); } catch { /* 무시 */ }
    },
  };

  const LEVELS = { easy: '쉬움', medium: '보통', hard: '어려움' };
  const LEVEL_NAMES = Object.keys(LEVELS);

  // 문제는 난이도별로 나뉘어 있고, 몇 개인지는 목차가 알려 준다. 실제 자료는
  // 그 문제가 나올 때 data.js가 받아 온다.
  const countOf = (name) => Data.levels[name].count;
  // 등급이 비어 있으면 고를 수는 있는데 아무것도 안 나온다. 그럴 바에는
  // 문제가 있는 난이도로 시작한다.
  const firstFilled = LEVEL_NAMES.find((name) => countOf(name) > 0) || 'easy';

  /**
   * 문제를 담긴 차례대로 내보내면 늘 같은 순서로 만난다. 그래서 섞는데, 섞는
   * 방법을 두 가지로 나눈다 — **덩이 차례를 섞고, 덩이 안을 섞는다.** 900개를
   * 한꺼번에 섞으면 다음 문제가 거의 항상 다른 덩이에 있어서, 문제마다 파일을
   * 하나씩 받게 된다. 필요할 때 받는다는 구조가 그대로 무너진다.
   *
   * 덩이는 주제를 돌아가며 담은 것이라 한 덩이 안에 공통점이 없다. 50개씩
   * 묶여 나오는 것을 눈으로 알아챌 만한 성질이 없다는 뜻이다.
   */
  const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const shuffled = (items, rng) => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  function orderOf(name, seed) {
    const count = countOf(name);
    const size = Data.chunkSize;
    // 난이도마다 씨앗을 달리한다. 같으면 세 난이도가 똑같은 차례로 섞인다.
    const rng = mulberry32(seed + LEVEL_NAMES.indexOf(name) * 0x9e3779b9);
    const chunks = [];
    for (let n = 0; n * size < count; n++) chunks.push(n);

    const out = [];
    for (const n of shuffled(chunks, rng)) {
      const inside = [];
      for (let at = n * size; at < Math.min((n + 1) * size, count); at++) inside.push(at);
      out.push(...shuffled(inside, rng));
    }
    return out;
  }

  // 섞은 차례는 씨앗 하나로 다시 만들 수 있으므로 씨앗만 저장한다. 매번 새로
  // 섞으면 "이어서 풀기"가 성립하지 않고 문제 번호도 뜻을 잃는다.
  let seed = Math.floor(Math.random() * 0x100000000);
  const orders = {};
  const orderFor = (name) => (orders[name] || (orders[name] = orderOf(name, seed)));

  let level = firstFilled;
  let index = 0;             // 섞은 차례에서 몇 번째인지 — 문제 번호가 아니다
  let state = null;          // 아직 못 받았거나 받는 중이면 null이다
  let loadToken = 0;         // 받는 사이에 다른 문제로 넘어갔는지 가리는 표
  let selected = null;
  let targets = new Map();   // 도착 칸 → 그 칸으로 가는 합법 수들
  let pending = null;        // 승격 선택을 기다리는 수
  let replyTimer = null;
  let solved = new Set();
  // 다 푼 뒤 이어지는 수순을 되짚어 보는 중. 여기 있는 동안에는 판이 이 자리를
  // 보여 주고, 입력은 받지 않는다 — 문제는 이미 끝났으므로 둘 것이 없다.
  let review = null;
  let reviewTimer = null;

  // --- 그리기 ---

  const squares = new Map();

  /**
   * 판을 세운다. 내 쪽이 아래로 오도록 방향을 잡는다 — 흑 문제를 백 시점으로
   * 보면 수읽기가 통째로 뒤집혀서 사실상 다른 문제가 된다.
   */
  function buildBoard() {
    el.board.replaceChildren();
    squares.clear();
    // 아직 문제가 없으면 백 시점으로 세운다. 빈 판이라도 자리를 잡아 두어야
    // 자료가 도착했을 때 화면이 덜컥 밀리지 않는다.
    const flipped = state ? state.color === L.BLACK : false;

    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const x = flipped ? 7 - column : column;
        const y = flipped ? row : 7 - row;
        const name = L.squareOf(x, y);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'square';
        button.dataset.square = name;
        button.setAttribute('role', 'gridcell');
        // 좌표만 읽어 주면 무엇이 있는지 알 수 없다. 말 이름까지 붙인다.
        button.setAttribute('aria-label', name);
        el.board.appendChild(button);
        squares.set(name, button);
      }
    }
  }

  const PIECE_NAMES = { k: '킹', q: '퀸', r: '룩', b: '비숍', n: '나이트', p: '폰' };

  function describe(square, piece) {
    if (!piece) return `${square} 빈 칸`;
    const color = L.colorOf(piece) === L.WHITE ? '백' : '흑';
    return `${square} ${color} ${PIECE_NAMES[piece.toLowerCase()]}`;
  }

  function render() {
    // 되짚어 보는 중이면 그 자리를, 아니면 지금 문제를 그린다. 자료를 아직
    // 못 받았으면 둘 다 없어서 빈 판이 된다.
    const shown = review || state;
    const board = shown ? shown.position.board : {};
    const last = shown ? shown.lastMove : null;
    // 체크를 받고 있는 쪽의 킹만 표시한다. 어느 쪽이든 지금 위험한 자리다.
    const checked = shown && L.inCheck(shown.position)
      ? L.kingSquare(board, shown.position.turn) : null;

    for (const [name, button] of squares) {
      const piece = board[name];
      const classes = ['square'];
      classes.push((L.fileOf(name) + L.rankOf(name)) % 2 === 0 ? 'dark' : 'light');
      if (last && (name === last.from || name === last.to)) classes.push('last');
      if (name === selected) classes.push('selected');
      if (name === checked) classes.push('checked');
      if (targets.has(name)) classes.push(piece ? 'capture' : 'target');
      button.className = classes.join(' ');

      // 같은 말이 같은 칸에 그대로 있으면 다시 그리지 않는다. 매 수마다 64칸의
      // SVG를 새로 파싱하면 판이 눈에 띄게 느려진다.
      if (button.dataset.piece !== (piece || '')) {
        button.dataset.piece = piece || '';
        button.innerHTML = piece
          ? `<span class="piece ${L.colorOf(piece) === L.WHITE ? 'white' : 'black'}">${Pieces.svg(piece.toLowerCase())}</span>`
          : '';
      }
      button.setAttribute('aria-label', describe(name, piece));
    }
  }

  function renderInfo() {
    // 푼 표시는 문제 번호 옆에 둔다. "다음 문제" 버튼에 달면 지금 문제가 푼
    // 것인지 다음 문제가 푼 것인지 읽는 사람이 알 수 없다.
    el.count.textContent = `문제 ${index + 1} / ${countOf(level)}`;

    if (!state) {
      el.count.classList.remove('solved');
      el.rating.textContent = '';
      el.side.textContent = '';
      el.title.textContent = '';
      el.themes.textContent = '';
      return;
    }

    const puzzle = state.puzzle;
    el.count.classList.toggle('solved', solved.has(puzzle.id));
    el.rating.textContent = `레이팅 ${puzzle.rating}`;
    el.side.textContent = state.color === L.WHITE ? '내가 백' : '내가 흑';
    el.title.textContent = puzzle.title;
    el.themes.textContent = puzzle.themes.join(' · ');
  }

  function setMessage(text, kind) {
    el.message.textContent = text;
    el.message.dataset.kind = kind || '';
  }

  // --- 문제 넘나들기 ---

  function buildLevels() {
    el.levels.replaceChildren();
    for (const name of LEVEL_NAMES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick';
      button.textContent = LEVELS[name];
      button.dataset.level = name;
      button.disabled = countOf(name) === 0;
      button.setAttribute('aria-pressed', String(name === level));
      button.addEventListener('click', () => {
        if (name === level) return;
        Sound.unlock();
        Sound.play('click');
        setLevel(name);
        loadPuzzle(0);
      });
      el.levels.appendChild(button);
    }
  }

  function setLevel(name) {
    level = name;
    buildLevels();
  }

  /** 판을 비우고 문제 하나를 세울 준비를 한다. 자료를 기다리는 동안의 모습이기도 하다. */
  function clearBoard() {
    state = null;
    selected = null;
    targets = new Map();
    pending = null;
    el.promotion.hidden = true;
    buildBoard();
    render();
  }

  /**
   * 문제 자료는 여기서 처음 필요해진다. 이미 받아 둔 덩이면 기다림 없이 그대로
   * 이어지고, 아니면 받는 동안 판을 비워 둔다 — 앞 문제를 남겨 두면 다음 문제로
   * 넘어간 줄 알고 이미 푼 자리에 수를 두게 된다.
   */
  async function loadPuzzle(next) {
    clearTimeout(replyTimer);
    hideAfter();
    const order = orderFor(level);
    const total = order.length;
    index = ((next % total) + total) % total;
    const at = order[index];
    const token = ++loadToken;

    let puzzle = Data.get(level, at);
    if (!puzzle) {
      clearBoard();
      renderInfo();
      setMessage('문제를 불러오는 중…');
      try {
        puzzle = await Data.load(level, at);
      } catch {
        if (token !== loadToken) return;
        setMessage('문제를 불러오지 못했습니다. 연결을 확인하고 다시 눌러 보세요.', 'wrong');
        return;
      }
      if (token !== loadToken) return;   // 기다리는 사이 다른 문제로 넘어갔다
    }

    state = L.startPuzzle(puzzle);
    selected = null;
    targets = new Map();
    pending = null;
    el.promotion.hidden = true;
    buildBoard();
    renderInfo();
    render();
    setMessage(state.color === L.WHITE ? '백 차례입니다. 가장 강한 수를 찾아보세요.'
      : '흑 차례입니다. 가장 강한 수를 찾아보세요.');
    // 다음 문제가 다른 덩이에 있으면 지금 받아 둔다. 그래야 "다음 문제"를
    // 눌렀을 때 덩이 경계에서만 기다리는 일이 없다.
    Data.prefetch(level, order[(index + 1) % total]);
    save();
  }

  function save() {
    store.set({ version: Data.version, seed, level, index, solved: [...solved] });
  }

  function restore() {
    const saved = store.get(null);
    if (!saved) return 0;
    // 푼 기록은 문제 하나하나에 붙는데, 자료를 다시 구우면 아이디가 통째로
    // 바뀐다. 전에는 없어진 아이디를 걸러 냈지만 이제는 그럴 수 없다 — 덩이를
    // 다 받아 보기 전에는 어떤 아이디가 있는지 모른다. 대신 목차의 version이
    // 다르면 기록 전체를 버린다.
    if (saved.version === Data.version && Array.isArray(saved.solved)) {
      solved = new Set(saved.solved);
    }
    // 씨앗까지 되살려야 저장해 둔 번째가 저번과 같은 문제를 가리킨다. 씨앗이
    // 바뀌면 그 번째는 전혀 다른 문제가 되어, 이어서 푸는 것이 아니게 된다.
    if (saved.version === Data.version && Number.isInteger(saved.seed)) seed = saved.seed;
    if (LEVEL_NAMES.includes(saved.level) && countOf(saved.level) > 0) setLevel(saved.level);
    return Number.isInteger(saved.index) ? saved.index : 0;
  }

  // --- 입력 ---

  function selectSquare(square) {
    const piece = state.position.board[square];
    // 내 말이 아니면 고를 수 없다. 상대 말을 집어 옮기려다 아무 일도 일어나지
    // 않는 것보다, 애초에 잡히지 않는 편이 덜 헷갈린다.
    if (!piece || L.colorOf(piece) !== state.position.turn) return false;

    selected = square;
    targets = new Map();
    for (const move of L.legalMoves(state.position, square)) {
      if (!targets.has(move.to)) targets.set(move.to, []);
      targets.get(move.to).push(move);
    }
    Sound.play('click');
    render();
    return true;
  }

  function clearSelection() {
    selected = null;
    targets = new Map();
    render();
  }

  function onSquare(square) {
    Sound.unlock();
    if (review) return;               // 되짚어 보는 중에는 둘 것이 없다
    if (pending) return;              // 승격을 고르는 중에는 판을 잠근다
    if (!state || state.status !== 'playing') return;

    if (selected && targets.has(square)) {
      const moves = targets.get(square);
      if (moves.length > 1) {
        // 도착 칸이 같은데 수가 여럿이면 승격뿐이다.
        pending = { from: selected, to: square };
        clearSelection();
        openPromotion();
        return;
      }
      play(moves[0].from, moves[0].to, moves[0].promotion);
      return;
    }

    if (square === selected) { clearSelection(); return; }
    if (!selectSquare(square)) clearSelection();
  }

  function openPromotion() {
    el.promotionKeys.replaceChildren();
    for (const kind of PROMOTION_ORDER) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'promotion-key';
      button.dataset.promotion = kind;
      const color = state.color === L.WHITE ? 'white' : 'black';
      button.innerHTML = `<span class="piece ${color}">${Pieces.svg(kind)}</span>`;
      button.setAttribute('aria-label', PROMOTION_NAMES[kind]);
      button.addEventListener('click', () => {
        const move = pending;
        pending = null;
        el.promotion.hidden = true;
        play(move.from, move.to, kind);
      });
      el.promotionKeys.appendChild(button);
    }
    el.promotion.hidden = false;
  }

  /** 소리는 잡기·체크·보통 이동을 구분한다. 눈을 판에 두고도 무슨 일이 났는지 안다. */
  function moveSound(before, after, to) {
    if (L.inCheck(after)) { Sound.play('check'); return; }
    Sound.play(before.board[to] ? 'capture' : 'move');
  }

  function play(from, to, promotion) {
    const before = state.position;
    const result = L.attemptMove(state, from, to, promotion);
    clearSelection();

    if (!result.correct) {
      state = result.state;
      if (result.reason === 'illegal') {
        // 화면이 이미 막고 있으므로 여기 오면 판과 규칙이 어긋난 것이다.
        setMessage('그 수는 체스 규칙에 맞지 않습니다.', 'wrong');
      } else {
        Sound.play('wrong');
        setMessage('규칙에는 맞지만 가장 강한 수가 아닙니다. 다시 보세요.', 'wrong');
      }
      render();
      return;
    }

    state = result.state;
    moveSound(before, state.position, to);
    render();

    if (state.status === 'solved') { finish(); return; }

    setMessage('상대가 최선으로 응수합니다…');
    replyTimer = setTimeout(() => {
      const previous = state.position;
      state = L.playReply(state);
      moveSound(previous, state.position, state.lastMove.to);
      render();
      if (state.status === 'solved') finish();
      else setMessage('계속해서 가장 강한 수를 두세요.');
    }, 560);
  }

  function finish() {
    solved.add(state.puzzle.id);
    save();
    renderInfo();
    Sound.play('solved');
    const mate = L.positionStatus(state.position) === 'checkmate';
    setMessage(mate ? '체크메이트! 문제를 풀었습니다.' : '정답입니다! 문제를 풀었습니다.', 'solved');
    showAfter();
  }

  /**
   * 왜 그 수가 정답이었는지. 한 수짜리 문제는 두고 나도 그 수가 무엇을 얻는지
   * 화면에 남지 않아서, 다 푼 뒤에만 여기서 알려 준다.
   */
  function showAfter() {
    const puzzle = state.puzzle;
    el.why.textContent = puzzle.why || '';
    const hasLine = Array.isArray(puzzle.line) && puzzle.line.length > 0;
    el.replay.hidden = !hasLine;
    el.replay.disabled = false;
    el.replay.textContent = '이어지는 수순 보기';
    el.after.hidden = !puzzle.why && !hasLine;
  }

  function hideAfter() {
    clearTimeout(reviewTimer);
    review = null;
    el.after.hidden = true;
  }

  function startReview() {
    const line = state.puzzle.line || [];
    if (!line.length) return;
    clearTimeout(reviewTimer);
    review = { position: state.position, lastMove: state.lastMove, at: 0 };
    el.replay.disabled = true;
    el.replay.textContent = '두는 중…';
    render();
    reviewTimer = setTimeout(stepReview, 500);
  }

  function stepReview() {
    const line = state.puzzle.line || [];
    if (!review || review.at >= line.length) {
      el.replay.disabled = false;
      el.replay.textContent = '다시 보기';
      return;
    }
    const uci = line[review.at++];
    const before = review.position;
    review.position = L.applyMove(before, uci);
    review.lastMove = L.moveParts(uci);
    moveSound(before, review.position, uci.slice(2, 4));
    render();
    reviewTimer = setTimeout(stepReview, 850);
  }

  // --- 버튼 ---

  el.board.addEventListener('click', (event) => {
    const button = event.target.closest('.square');
    if (button) onSquare(button.dataset.square);
  });

  el.hint.addEventListener('click', () => {
    Sound.unlock();
    if (!state || state.status !== 'playing') return;
    const move = L.expectedMove(state);
    if (!move) return;
    // 도착 칸까지 알려 주면 문제가 사라진다. 어떤 말을 볼지까지만 짚는다.
    selectSquare(move.slice(0, 2));
    Sound.play('hint');
    setMessage(`${state.puzzle.hint} 움직일 말을 표시했습니다.`, 'hint');
  });

  el.replay.addEventListener('click', () => { Sound.unlock(); startReview(); });
  el.retry.addEventListener('click', () => { Sound.unlock(); Sound.play('click'); loadPuzzle(index); });
  el.next.addEventListener('click', () => { Sound.unlock(); Sound.play('click'); loadPuzzle(index + 1); });

  window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

  window.addEventListener('keydown', (event) => {
    Sound.unlock();
    if (event.key === 'Escape') {
      if (review) {
        clearTimeout(reviewTimer);
        review = null;
        el.replay.disabled = false;
        el.replay.textContent = '다시 보기';
        render();
        return;
      }
      if (pending) { pending = null; el.promotion.hidden = true; return; }
      clearSelection();
    }
  });

  function bindSoundToggle(button, key, apply) {
    const sync = () => button.setAttribute('aria-pressed', String(Sound.prefs[key]));
    sync();
    button.addEventListener('click', () => {
      Sound.unlock();
      apply(!Sound.prefs[key]);
      sync();
    });
  }
  bindSoundToggle(el.toggleBgm, 'bgm', (on) => Sound.setBgm(on));
  bindSoundToggle(el.toggleSfx, 'sfx', (on) => Sound.setSfx(on));

  buildLevels();
  loadPuzzle(restore());

  // 도구 단추의 아이콘은 HTML에 이름만 적혀 있다. 여기서 한 번 그린다.
  Icons.paint();
})();

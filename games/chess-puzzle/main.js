'use strict';

// 브라우저에서는 클래식 스크립트가 전역 렉시컬 스코프를 공유한다. 파일마다
// 최상위에 같은 이름을 선언하면 다른 파일과 충돌하므로 IIFE로 가둔다.
(function () {
  const L = window.ChessPuzzleLogic;
  const Sound = window.ChessSound;
  const SAVE_KEY = 'web-games.chess-puzzle.progress';

  const el = {
    board: document.getElementById('board'),
    count: document.getElementById('count'),
    rating: document.getElementById('rating'),
    side: document.getElementById('side'),
    title: document.getElementById('title'),
    themes: document.getElementById('themes'),
    message: document.getElementById('message'),
    hint: document.getElementById('hint'),
    retry: document.getElementById('retry'),
    next: document.getElementById('next'),
    promotion: document.getElementById('promotion'),
    promotionKeys: document.getElementById('promotion-keys'),
    help: document.getElementById('help'),
    helpOpen: document.getElementById('help-open'),
    helpClose: document.getElementById('help-close'),
    toggleBgm: document.getElementById('toggle-bgm'),
    toggleSfx: document.getElementById('toggle-sfx'),
  };

  // 말은 양쪽 다 속이 찬 글리프를 쓰고 색으로만 가른다. 유니코드의 흰 말
  // (♔♕♖)은 속이 빈 글자라, 칸 색에 따라 안이 비쳐 보이거나 아예 묻힌다.
  // 같은 모양을 칠하고 반대색 테두리를 두르는 편이 어느 칸에서도 읽힌다.
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
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

  const puzzles = window.CHESS_PUZZLES;

  let index = 0;
  let state = null;
  let selected = null;
  let targets = new Map();   // 도착 칸 → 그 칸으로 가는 합법 수들
  let pending = null;        // 승격 선택을 기다리는 수
  let replyTimer = null;
  let solved = new Set();

  // --- 그리기 ---

  const squares = new Map();

  /**
   * 판을 세운다. 내 쪽이 아래로 오도록 방향을 잡는다 — 흑 문제를 백 시점으로
   * 보면 수읽기가 통째로 뒤집혀서 사실상 다른 문제가 된다.
   */
  function buildBoard() {
    el.board.replaceChildren();
    squares.clear();
    const flipped = state.color === L.BLACK;

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
    const board = state.position.board;
    const last = state.lastMove;
    // 체크를 받고 있는 쪽의 킹만 표시한다. 어느 쪽이든 지금 위험한 자리다.
    const checked = L.inCheck(state.position) ? L.kingSquare(board, state.position.turn) : null;

    for (const [name, button] of squares) {
      const piece = board[name];
      const classes = ['square'];
      classes.push((L.fileOf(name) + L.rankOf(name)) % 2 === 0 ? 'dark' : 'light');
      if (last && (name === last.from || name === last.to)) classes.push('last');
      if (name === selected) classes.push('selected');
      if (name === checked) classes.push('checked');
      if (targets.has(name)) classes.push(piece ? 'capture' : 'target');
      button.className = classes.join(' ');

      button.replaceChildren();
      if (piece) {
        const glyph = document.createElement('span');
        glyph.className = `piece ${L.colorOf(piece) === L.WHITE ? 'white' : 'black'}`;
        glyph.textContent = GLYPHS[piece.toLowerCase()];
        button.appendChild(glyph);
      }
      button.setAttribute('aria-label', describe(name, piece));
    }
  }

  function renderInfo() {
    const puzzle = state.puzzle;
    // 푼 표시는 문제 번호 옆에 둔다. "다음 문제" 버튼에 달면 지금 문제가 푼
    // 것인지 다음 문제가 푼 것인지 읽는 사람이 알 수 없다.
    el.count.textContent = `문제 ${index + 1} / ${puzzles.length}`;
    el.count.classList.toggle('solved', solved.has(puzzle.id));
    el.rating.textContent = `난이도 ${puzzle.rating}`;
    el.side.textContent = state.color === L.WHITE ? '내가 백' : '내가 흑';
    el.title.textContent = puzzle.title;
    el.themes.textContent = puzzle.themes.join(' · ');
  }

  function setMessage(text, kind) {
    el.message.textContent = text;
    el.message.dataset.kind = kind || '';
  }

  // --- 문제 넘나들기 ---

  function loadPuzzle(next) {
    clearTimeout(replyTimer);
    index = ((next % puzzles.length) + puzzles.length) % puzzles.length;
    state = L.startPuzzle(puzzles[index]);
    selected = null;
    targets = new Map();
    pending = null;
    el.promotion.hidden = true;
    buildBoard();
    renderInfo();
    render();
    setMessage(state.color === L.WHITE ? '백 차례입니다. 가장 강한 수를 찾아보세요.'
      : '흑 차례입니다. 가장 강한 수를 찾아보세요.');
    save();
  }

  function save() {
    store.set({ index, solved: [...solved] });
  }

  function restore() {
    const saved = store.get(null);
    if (!saved) return 0;
    if (Array.isArray(saved.solved)) {
      const ids = new Set(puzzles.map((p) => p.id));
      solved = new Set(saved.solved.filter((id) => ids.has(id)));
    }
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
    if (pending) return;              // 승격을 고르는 중에는 판을 잠근다
    if (state.status !== 'playing') return;

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
      button.innerHTML = `<span class="piece ${color}">${GLYPHS[kind]}</span>`;
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
  }

  // --- 버튼 ---

  el.board.addEventListener('click', (event) => {
    const button = event.target.closest('.square');
    if (button) onSquare(button.dataset.square);
  });

  el.hint.addEventListener('click', () => {
    Sound.unlock();
    if (state.status !== 'playing') return;
    const move = L.expectedMove(state);
    if (!move) return;
    // 도착 칸까지 알려 주면 문제가 사라진다. 어떤 말을 볼지까지만 짚는다.
    selectSquare(move.slice(0, 2));
    Sound.play('hint');
    setMessage(`${state.puzzle.hint} 움직일 말을 표시했습니다.`, 'hint');
  });

  el.retry.addEventListener('click', () => { Sound.unlock(); Sound.play('click'); loadPuzzle(index); });
  el.next.addEventListener('click', () => { Sound.unlock(); Sound.play('click'); loadPuzzle(index + 1); });

  el.helpOpen.addEventListener('click', () => {
    const open = el.help.hidden;
    el.help.hidden = !open;
    el.helpOpen.setAttribute('aria-pressed', String(open));
  });
  el.helpClose.addEventListener('click', () => {
    el.help.hidden = true;
    el.helpOpen.setAttribute('aria-pressed', 'false');
  });

  window.addEventListener('keydown', (event) => {
    Sound.unlock();
    if (event.key === 'Escape') {
      if (pending) { pending = null; el.promotion.hidden = true; return; }
      if (!el.help.hidden) { el.help.hidden = true; el.helpOpen.setAttribute('aria-pressed', 'false'); return; }
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

  loadPuzzle(restore());
})();

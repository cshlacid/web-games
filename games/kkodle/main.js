'use strict';

(function () {
  const H = window.KkodleHangul;
  const Icons = window.SharedIcons;
  const L = window.KkodleLogic;
  const WORDS = window.KkodleWords;
  const Sound = window.KkodleSound;

  const DAILY_KEY = 'web-games.kkodle.daily';
  const STATS_KEY = 'web-games.kkodle.stats';

  // 두벌식 배열. 물리 키보드는 event.code로 받는다 — 한글 IME가 켜져 있으면
  // event.key가 조합 중인 값이라 쓸 수 없고, code는 자판 위치라 항상 같다.
  const LAYOUT = [
    ['KeyQ', 'ㅂ'], ['KeyW', 'ㅈ'], ['KeyE', 'ㄷ'], ['KeyR', 'ㄱ'], ['KeyT', 'ㅅ'],
    ['KeyY', 'ㅛ'], ['KeyU', 'ㅕ'], ['KeyI', 'ㅑ'], ['KeyO', 'ㅐ'], ['KeyP', 'ㅔ'],
    ['KeyA', 'ㅁ'], ['KeyS', 'ㄴ'], ['KeyD', 'ㅇ'], ['KeyF', 'ㄹ'], ['KeyG', 'ㅎ'],
    ['KeyH', 'ㅗ'], ['KeyJ', 'ㅓ'], ['KeyK', 'ㅏ'], ['KeyL', 'ㅣ'],
    ['KeyZ', 'ㅋ'], ['KeyX', 'ㅌ'], ['KeyC', 'ㅊ'], ['KeyV', 'ㅍ'],
    ['KeyB', 'ㅠ'], ['KeyN', 'ㅜ'], ['KeyM', 'ㅡ'],
  ];
  const CODE_TO_JAMO = Object.fromEntries(LAYOUT);
  const SHIFTED = { 'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ', 'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ' };

  const KEY_ROWS = [
    ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'],
    ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
    ['shift', 'ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ', 'back'],
    ['enter'],
  ];

  const el = {
    board: document.getElementById('board'),
    keyboard: document.getElementById('keyboard'),
    toast: document.getElementById('toast'),
    mode: document.getElementById('mode'),
    subtitle: document.getElementById('subtitle'),
    result: document.getElementById('result'),
    resultTitle: document.getElementById('result-title'),
    resultAnswer: document.getElementById('result-answer'),
    stats: document.getElementById('stats'),
    share: document.getElementById('share'),
    again: document.getElementById('again'),
    help: document.getElementById('help'),
    toggleBgm: document.getElementById('toggle-bgm'),
    toggleSfx: document.getElementById('toggle-sfx'),
    helpOpen: document.getElementById('help-open'),
    helpClose: document.getElementById('help-close'),
  };

  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 무시 */ }
    },
  };

  const state = {
    daily: true,
    answer: '',
    blocks: [],
    rows: [], // {word, slots, marks}
    status: 'playing', // playing | won | lost
    shiftOn: false,
    locked: false,
  };

  function pickAnswer() {
    if (state.daily) return WORDS[L.dailyIndex(L.dateKey(), WORDS.length)];
    return WORDS[Math.floor(Math.random() * WORDS.length)];
  }

  // --- 그리기 ---

  function buildBoard() {
    el.board.replaceChildren();
    for (let r = 0; r < L.MAX_TRIES; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      for (let c = 0; c < L.WORD_LENGTH; c++) row.appendChild(document.createElement('div'));
      row.querySelectorAll('div').forEach((tile) => { tile.className = 'tile'; });
      el.board.appendChild(row);
    }
  }

  const COLOR = { correct: 'var(--correct)', present: 'var(--present)', absent: 'var(--absent)' };

  function paintRow(index, word, marks) {
    const row = el.board.children[index];
    [...word].forEach((ch, i) => {
      const tile = row.children[i];
      tile.textContent = ch;
      tile.className = 'tile judged';
      const parts = H.decompose(ch);
      if (!parts.jong) tile.classList.add('no-jong');
      tile.style.setProperty('--c1', COLOR[marks[i * 3]]);
      tile.style.setProperty('--c2', COLOR[marks[i * 3 + 1]]);
      tile.style.setProperty('--c3', COLOR[marks[i * 3 + 2]]);
    });
  }

  function drawCurrent() {
    const index = state.rows.length;
    if (index >= L.MAX_TRIES) return;
    const row = el.board.children[index];
    const text = H.blocksToText(state.blocks);
    for (let i = 0; i < L.WORD_LENGTH; i++) {
      const tile = row.children[i];
      const ch = [...text][i] || '';
      const changed = tile.textContent !== ch;
      tile.textContent = ch;
      tile.className = ch ? 'tile filled' : 'tile';
      if (ch && changed) {
        tile.classList.remove('pop');
        void tile.offsetWidth; // 같은 애니메이션을 다시 트리거하려면 리플로우가 필요하다.
        tile.classList.add('pop');
      }
    }
  }

  function buildKeyboard() {
    el.keyboard.replaceChildren();
    for (const keys of KEY_ROWS) {
      const row = document.createElement('div');
      row.className = 'krow';
      for (const key of keys) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'key';
        if (key === 'shift') {
          // 기호 문자(⇧⌫)로 두었더니 글꼴마다 크기와 두께가 달랐고, 아예 안
          // 그리는 글꼴도 있었다. 자모 사이에 섞여 서는 자리라 그것이 잘 보인다.
          button.innerHTML = Icons.svg('shift');
          button.dataset.action = 'shift';
          button.setAttribute('aria-pressed', 'false');
        } else if (key === 'back') {
          button.innerHTML = Icons.svg('backspace');
          button.dataset.action = 'back';
        } else if (key === 'enter') {
          button.textContent = '입력';
          button.classList.add('wide');
          button.dataset.action = 'enter';
        } else {
          button.textContent = key;
          button.dataset.jamo = key;
        }
        row.appendChild(button);
      }
      el.keyboard.appendChild(row);
    }
  }

  function paintKeyboard() {
    const marks = L.keyboardState(state.rows);
    el.keyboard.querySelectorAll('[data-jamo]').forEach((key) => {
      const jamo = state.shiftOn ? (SHIFTED[key.dataset.jamo] || key.dataset.jamo) : key.dataset.jamo;
      key.textContent = jamo;
      const mark = marks[jamo];
      if (mark) key.dataset.state = mark;
      else delete key.dataset.state;
    });
    const shift = el.keyboard.querySelector('[data-action="shift"]');
    if (shift) shift.setAttribute('aria-pressed', String(state.shiftOn));
  }

  let toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 1800);
  }

  // --- 게임 진행 ---

  function press(jamo) {
    if (state.status !== 'playing' || state.locked) return;
    const before = H.blocksToText(state.blocks);
    state.blocks = H.input(state.blocks, jamo, L.WORD_LENGTH);
    // 길이 초과로 무시된 입력에는 소리를 내지 않는다. 눌리지 않은 키다.
    if (H.blocksToText(state.blocks) !== before) Sound.play('key');
    // 시프트는 한 글자만 적용된다. 키보드와 같은 감각을 유지한다.
    if (state.shiftOn) { state.shiftOn = false; paintKeyboard(); }
    drawCurrent();
  }

  function back() {
    if (state.status !== 'playing' || state.locked) return;
    const before = H.blocksToText(state.blocks);
    state.blocks = H.backspace(state.blocks);
    if (H.blocksToText(state.blocks) !== before) Sound.play('back');
    drawCurrent();
  }

  function shake() {
    const row = el.board.children[state.rows.length];
    if (!row) return;
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
  }

  function submit() {
    if (state.status !== 'playing' || state.locked) return;
    const text = H.blocksToText(state.blocks);
    if (!L.isValidGuess(text)) {
      toast(H.blocksToText(state.blocks).length < 2 ? '두 글자를 채워주세요' : '완성된 두 글자여야 해요');
      Sound.play('invalid');
      shake();
      return;
    }

    const slots = H.toSlots(text);
    const marks = L.judge(slots, H.toSlots(state.answer));
    state.rows.push({ word: text, slots, marks });
    state.blocks = [];

    paintRow(state.rows.length - 1, text, marks);
    paintKeyboard();

    // 글자마다 몇 칸이 맞았는지를 음높이로 들려준다.
    const scores = [];
    for (let i = 0; i < L.WORD_LENGTH; i++) {
      scores.push(marks.slice(i * 3, i * 3 + 3).filter((m) => m === 'correct').length);
    }
    Sound.play('reveal', scores);

    if (text === state.answer) finish('won');
    else if (state.rows.length >= L.MAX_TRIES) finish('lost');
    else saveDaily();
  }

  function finish(status) {
    state.status = status;
    // 판정 공개음이 끝난 뒤에 울려야 둘이 뭉개지지 않는다.
    setTimeout(() => Sound.play(status === 'won' ? 'win' : 'lose'), 380);
    if (state.daily) {
      saveDaily();
      recordStats(status === 'won' ? state.rows.length : 0);
    }
    showResult();
  }

  function showResult() {
    const won = state.status === 'won';
    el.resultTitle.textContent = won ? `${state.rows.length}번 만에 맞혔어요` : '아쉬워요';
    el.resultAnswer.textContent = `정답은 "${state.answer}"`;
    el.share.hidden = !state.daily;
    renderStats();
    el.result.hidden = false;
  }

  // --- 저장 ---

  function saveDaily() {
    if (!state.daily) return;
    store.set(DAILY_KEY, {
      date: L.dateKey(),
      answer: state.answer,
      words: state.rows.map((row) => row.word),
      status: state.status,
    });
  }

  function restoreDaily() {
    const saved = store.get(DAILY_KEY, null);
    if (!saved || saved.date !== L.dateKey()) return false;
    // 단어 목록이 바뀌면 같은 날짜라도 정답이 달라진다. 그때 남아 있던 진행을
    // 복원하면 다른 문제의 추측을 새 정답으로 채점하게 된다. 정답이 적혀 있지
    // 않은 예전 저장본도 같은 이유로 버린다 — 어느 문제의 기록인지 알 수 없다.
    if (saved.answer !== state.answer) return false;

    for (const word of saved.words) {
      const slots = H.toSlots(word);
      const marks = L.judge(slots, H.toSlots(state.answer));
      state.rows.push({ word, slots, marks });
      paintRow(state.rows.length - 1, word, marks);
    }
    state.status = saved.status === 'playing' ? 'playing' : saved.status;
    paintKeyboard();
    if (state.status !== 'playing') showResult();
    return true;
  }

  function recordStats(triesOrZero) {
    const stats = store.get(STATS_KEY, { played: 0, wins: 0, streak: 0, best: 0, date: null });
    // 같은 날짜를 두 번 기록하지 않는다. 저장된 판을 복원해도 통계는 한 번만.
    if (stats.date === L.dateKey()) return;
    stats.date = L.dateKey();
    stats.played += 1;
    if (triesOrZero > 0) {
      stats.wins += 1;
      stats.streak += 1;
      stats.best = Math.max(stats.best, stats.streak);
    } else {
      stats.streak = 0;
    }
    store.set(STATS_KEY, stats);
  }

  function renderStats() {
    const stats = store.get(STATS_KEY, { played: 0, wins: 0, streak: 0, best: 0 });
    const rate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    const items = [['판수', stats.played], ['승률', `${rate}%`], ['연속', stats.streak], ['최고 연속', stats.best]];
    el.stats.replaceChildren();
    for (const [label, value] of items) {
      const group = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      group.append(dt, dd);
      el.stats.appendChild(group);
    }
  }

  // --- 시작/전환 ---

  function start(daily) {
    state.daily = daily;
    state.answer = pickAnswer();
    state.blocks = [];
    state.rows = [];
    state.status = 'playing';
    state.shiftOn = false;
    el.result.hidden = true;
    el.mode.textContent = daily ? '오늘의 단어' : '연습';
    el.mode.setAttribute('aria-pressed', String(daily));
    el.subtitle.textContent = daily
      ? `오늘의 단어 · ${L.dateKey()}`
      : '연습 · 아무 때나 새 단어';
    buildBoard();
    paintKeyboard();
    if (daily) restoreDaily();
    drawCurrent();
  }

  // --- 입력 연결 ---

  el.keyboard.addEventListener('click', (event) => {
    const key = event.target.closest('button');
    if (!key) return;
    if (key.dataset.jamo) {
      press(state.shiftOn ? (SHIFTED[key.dataset.jamo] || key.dataset.jamo) : key.dataset.jamo);
    } else if (key.dataset.action === 'back') back();
    else if (key.dataset.action === 'enter') submit();
    else if (key.dataset.action === 'shift') {
      state.shiftOn = !state.shiftOn;
      paintKeyboard();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    Sound.unlock();
    if (event.key === 'Enter') { event.preventDefault(); submit(); return; }
    if (event.key === 'Backspace') { event.preventDefault(); back(); return; }
    const jamo = CODE_TO_JAMO[event.code];
    if (!jamo) return;
    event.preventDefault();
    press(event.shiftKey ? (SHIFTED[jamo] || jamo) : jamo);
  });

  el.mode.addEventListener('click', () => { Sound.play('click'); start(!state.daily); });
  el.again.addEventListener('click', () => { Sound.play('click'); start(false); });

  // 브라우저 정책상 사용자 조작 전에는 소리를 낼 수 없다. unlock()은 여러 번
  // 불러도 안전하므로 첫 입력마다 그냥 호출한다.
  document.addEventListener('pointerdown', () => Sound.unlock());

  function bindSoundToggle(node, key, apply) {
    node.setAttribute('aria-pressed', String(Sound.prefs[key]));
    node.addEventListener('click', () => {
      const on = !Sound.prefs[key];
      apply(on);
      node.setAttribute('aria-pressed', String(on));
      Sound.play('click');
    });
  }

  bindSoundToggle(el.toggleBgm, 'bgm', (on) => Sound.setBgm(on));
  bindSoundToggle(el.toggleSfx, 'sfx', (on) => Sound.setSfx(on));
  el.helpOpen.addEventListener('click', () => {
    const open = el.help.hidden;
    el.help.hidden = !open;
    el.helpOpen.setAttribute('aria-pressed', String(open));
  });
  el.helpClose.addEventListener('click', () => {
    el.help.hidden = true;
    el.helpOpen.setAttribute('aria-pressed', 'false');
  });

  el.share.addEventListener('click', async () => {
    const text = L.shareText(state.rows, L.dateKey(), state.status === 'won');
    try {
      await navigator.clipboard.writeText(text);
      toast('결과를 복사했어요');
    } catch {
      // 클립보드 권한이 없거나 http로 열린 경우. 복사 대신 보여주기라도 한다.
      toast('복사할 수 없어 결과를 아래에 표시했어요');
      el.resultAnswer.textContent = text;
    }
  });

  buildKeyboard();
  start(true);
})();

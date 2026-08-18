'use strict';

(function () {
  const S = window.SudokuSolver;
  const G = window.SudokuGenerator;
  const Sound = window.SudokuSound;
  const SAVE_KEY = 'web-games.sudoku.game';

  const TECHNIQUE_LABEL = {
    nakedSingle: '이 칸에 들어갈 수 있는 숫자가 하나뿐',
    hiddenSingle: '이 줄에서 그 숫자가 들어갈 칸이 여기뿐',
    pointing: '상자 안에서 그 숫자의 자리가 한 줄에 몰려 있음',
    claiming: '줄에서 그 숫자의 자리가 한 상자에 몰려 있음',
    nakedPair: '두 칸이 같은 두 숫자를 나눠 가짐',
    hiddenPair: '두 숫자가 두 칸에만 들어갈 수 있음',
    nakedTriple: '세 칸이 같은 세 숫자를 나눠 가짐',
    hiddenTriple: '세 숫자가 세 칸에만 들어갈 수 있음',
    xWing: 'X-Wing',
  };

  const el = {
    board: document.getElementById('board'),
    veil: document.getElementById('veil'),
    levels: document.getElementById('levels'),
    digits: document.getElementById('digits'),
    timer: document.getElementById('timer'),
    toast: document.getElementById('toast'),
    pencil: document.getElementById('pencil'),
    erase: document.getElementById('erase'),
    undo: document.getElementById('undo'),
    hint: document.getElementById('hint'),
    newGame: document.getElementById('new-game'),
    result: document.getElementById('result'),
    resultTitle: document.getElementById('result-title'),
    resultNote: document.getElementById('result-note'),
    again: document.getElementById('again'),
    help: document.getElementById('help'),
    helpOpen: document.getElementById('help-open'),
    helpClose: document.getElementById('help-close'),
    toggleBgm: document.getElementById('toggle-bgm'),
    toggleSfx: document.getElementById('toggle-sfx'),
  };

  const store = {
    get(fallback) {
      try { return JSON.parse(localStorage.getItem(SAVE_KEY)) ?? fallback; } catch { return fallback; }
    },
    set(value) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(value)); } catch { /* 무시 */ }
    },
  };

  const state = {
    level: 'easy',
    puzzle: '',
    solution: '',
    values: new Int8Array(81),
    marks: new Uint16Array(81),
    selected: 0,
    pencil: false,
    history: [],
    elapsed: 0,
    running: false,
    done: false,
  };

  const isGiven = (i) => state.puzzle[i] !== '.';
  const rowOf = (i) => (i / 9) | 0;
  const colOf = (i) => i % 9;
  const boxOf = (i) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

  const cells = [];
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = i;
    el.board.appendChild(cell);
    cells.push(cell);
  }

  // --- 그리기 ---

  function conflicts() {
    const bad = new Set();
    for (const unit of S.UNITS) {
      const seen = new Map();
      for (const i of unit) {
        const v = state.values[i];
        if (!v) continue;
        if (seen.has(v)) { bad.add(i); bad.add(seen.get(v)); }
        else seen.set(v, i);
      }
    }
    return bad;
  }

  function render() {
    const bad = conflicts();
    const selectedValue = state.values[state.selected];
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 81; i++) if (state.values[i]) counts[state.values[i]]++;

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const value = state.values[i];
      const classes = ['cell'];
      if (rowOf(i) % 3 === 0 && i > 8) classes.push('box-top');
      if (colOf(i) % 3 === 0 && colOf(i) > 0) classes.push('box-left');
      if (isGiven(i)) classes.push('given');
      if (bad.has(i)) classes.push('wrong');

      if (i === state.selected) classes.push('selected');
      else if (selectedValue && value === selectedValue) classes.push('same');
      else if (rowOf(i) === rowOf(state.selected) || colOf(i) === colOf(state.selected)
               || boxOf(i) === boxOf(state.selected)) classes.push('peer');

      if (cell.dataset.hinted === '1') classes.push('hinted');
      cell.className = classes.join(' ');

      if (value) {
        cell.textContent = value;
      } else if (state.marks[i]) {
        cell.textContent = '';
        const grid = document.createElement('span');
        grid.className = 'marks';
        for (let d = 1; d <= 9; d++) {
          const slot = document.createElement('span');
          slot.textContent = (state.marks[i] & S.bitOf(d)) ? d : '';
          grid.appendChild(slot);
        }
        cell.replaceChildren(grid);
      } else {
        cell.textContent = '';
      }
    }

    for (let d = 1; d <= 9; d++) {
      el.digits.children[d - 1].classList.toggle('done', counts[d] >= 9);
    }
    el.undo.disabled = state.history.length === 0;
    el.pencil.setAttribute('aria-pressed', String(state.pencil));
    for (const button of el.levels.children) {
      button.setAttribute('aria-pressed', String(button.dataset.level === state.level));
    }
  }

  let toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 3200);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  // --- 조작 ---

  function snapshot() {
    // 되돌리기는 칸 하나가 아니라 판 전체를 되돌린다. 숫자를 확정하면 주변
    // 연필 표시까지 함께 지워지므로, 바뀐 곳만 추리는 것보다 이 편이 안전하다.
    state.history.push({ values: state.values.slice(), marks: state.marks.slice() });
    if (state.history.length > 200) state.history.shift();
  }

  function place(digit) {
    const i = state.selected;
    if (state.done || isGiven(i)) return;
    snapshot();
    if (state.values[i] === digit) {
      state.values[i] = 0;
      Sound.play('erase');
    } else {
      state.values[i] = digit;
      state.marks[i] = 0;
      // 확정한 숫자는 같은 줄·상자의 후보에서 빠진다. 손으로 지우게 두면
      // 연필 표시가 금세 거짓말을 한다.
      for (const peer of S.PEERS[i]) state.marks[peer] &= ~S.bitOf(digit);
      // 규칙에 어긋나는 자리면 다른 소리를 낸다. 화면의 빨간색을 놓쳐도 귀로 걸린다.
      Sound.play(conflicts().has(i) ? 'conflict' : 'place', digit);
    }
    afterChange();
  }

  function mark(digit) {
    const i = state.selected;
    if (state.done || isGiven(i) || state.values[i]) return;
    snapshot();
    state.marks[i] ^= S.bitOf(digit);
    Sound.play('pencil');
    afterChange();
  }

  function clearCell() {
    const i = state.selected;
    if (state.done || isGiven(i)) return;
    if (!state.values[i] && !state.marks[i]) return;
    snapshot();
    state.values[i] = 0;
    state.marks[i] = 0;
    Sound.play('erase');
    afterChange();
  }

  function undo() {
    const last = state.history.pop();
    if (!last) return;
    state.values.set(last.values);
    state.marks.set(last.marks);
    Sound.play('undo');
    save();
    render();
  }

  function afterChange() {
    save();
    render();
    checkDone();
  }

  function checkDone() {
    for (let i = 0; i < 81; i++) if (state.values[i] !== Number(state.solution[i])) return;
    state.done = true;
    state.running = false;
    el.resultTitle.textContent = '다 풀었어요';
    el.resultNote.textContent = `${G.LEVELS[state.level].label} · ${formatTime(state.elapsed)}`;
    el.result.hidden = false;
    Sound.play('win');
    save();
  }

  function boardString() {
    let out = '';
    for (let i = 0; i < 81; i++) out += state.values[i] || '.';
    return out;
  }

  function hint() {
    if (state.done) return;
    // 사용자가 넣은 숫자가 정답과 다르면 그 위에서 아무리 추론해도 의미가 없다.
    for (let i = 0; i < 81; i++) {
      if (state.values[i] && state.values[i] !== Number(state.solution[i])) {
        state.selected = i;
        render();
        Sound.play('conflict');
        toast('여기 숫자가 정답과 달라요. 먼저 고쳐야 이어서 풀 수 있어요');
        return;
      }
    }

    const step = S.nextPlacement(boardString());
    if (!step) { toast('더 짚어줄 칸을 찾지 못했어요'); return; }

    snapshot();
    state.values[step.index] = step.digit;
    state.marks[step.index] = 0;
    for (const peer of S.PEERS[step.index]) state.marks[peer] &= ~S.bitOf(step.digit);
    state.selected = step.index;

    cells[step.index].dataset.hinted = '1';
    setTimeout(() => { delete cells[step.index].dataset.hinted; render(); }, 900);

    Sound.play('hint');
    toast(`${step.digit} — ${TECHNIQUE_LABEL[step.technique] || step.technique}`);
    afterChange();
  }

  // --- 저장 ---

  function save() {
    store.set({
      level: state.level,
      puzzle: state.puzzle,
      solution: state.solution,
      values: [...state.values],
      marks: [...state.marks],
      elapsed: Math.floor(state.elapsed),
      done: state.done,
    });
  }

  function restore() {
    const saved = store.get(null);
    if (!saved || !saved.puzzle || saved.puzzle.length !== 81) return false;
    if (!G.LEVELS[saved.level]) return false;
    state.level = saved.level;
    state.puzzle = saved.puzzle;
    state.solution = saved.solution;
    state.values.set(saved.values || []);
    state.marks.set(saved.marks || []);
    state.elapsed = saved.elapsed || 0;
    state.done = Boolean(saved.done);
    state.history = [];
    state.selected = state.values.findIndex((v, i) => !v && !isGiven(i));
    if (state.selected < 0) state.selected = 0;
    state.running = !state.done;
    if (state.done) {
      el.resultTitle.textContent = '다 풀었어요';
      el.resultNote.textContent = `${G.LEVELS[state.level].label} · ${formatTime(state.elapsed)}`;
      el.result.hidden = false;
    }
    return true;
  }

  // --- 새 판 ---

  function newGame(level = state.level) {
    state.level = level;
    el.veil.hidden = false;
    el.result.hidden = true;
    render();

    // 어려움은 만드는 데 100ms 넘게 걸린다. 그 사이 화면이 멈춘 것처럼 보이지
    // 않도록 "만드는 중"을 먼저 그리고 다음 프레임에 생성한다.
    requestAnimationFrame(() => setTimeout(() => {
      const made = G.generate(level);
      state.puzzle = made.puzzle;
      state.solution = made.solution;
      state.values.set([...made.puzzle].map((ch) => (ch === '.' ? 0 : Number(ch))));
      state.marks.fill(0);
      state.history = [];
      state.elapsed = 0;
      state.running = true;
      state.done = false;
      state.selected = [...made.puzzle].findIndex((ch) => ch === '.');
      el.veil.hidden = true;
      el.timer.textContent = '0:00';
      save();
      render();
    }, 0));
  }

  // --- 입력 연결 ---

  for (const [level, config] of Object.entries(G.LEVELS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level';
    button.dataset.level = level;
    button.textContent = config.label;
    button.addEventListener('click', () => newGame(level));
    el.levels.appendChild(button);
  }

  for (let d = 1; d <= 9; d++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'digit';
    button.textContent = d;
    button.addEventListener('click', () => (state.pencil ? mark(d) : place(d)));
    el.digits.appendChild(button);
  }

  el.board.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    state.selected = Number(cell.dataset.index);
    render();
  });

  el.pencil.addEventListener('click', () => {
    state.pencil = !state.pencil;
    Sound.play('click');
    render();
  });
  el.erase.addEventListener('click', clearCell);
  el.undo.addEventListener('click', undo);
  el.hint.addEventListener('click', hint);
  el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
  el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });
  el.helpOpen.addEventListener('click', () => {
    const open = el.help.hidden;
    el.help.hidden = !open;
    el.helpOpen.setAttribute('aria-pressed', String(open));
  });
  el.helpClose.addEventListener('click', () => {
    el.help.hidden = true;
    el.helpOpen.setAttribute('aria-pressed', 'false');
  });

  const MOVES = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 };

  window.addEventListener('keydown', (event) => {
    Sound.unlock();
    if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key in MOVES) {
      event.preventDefault();
      const step = MOVES[event.key];
      // 좌우 이동이 줄을 넘어가지 않게 막는다. 인덱스로만 더하면 9번 칸에서
      // 오른쪽을 눌렀을 때 다음 줄 첫 칸으로 튄다.
      if (Math.abs(step) === 1 && colOf(state.selected) + step > 8) return;
      if (Math.abs(step) === 1 && colOf(state.selected) + step < 0) return;
      const next = state.selected + step;
      if (next >= 0 && next < 81) { state.selected = next; render(); }
      return;
    }

    if (event.key === ' ') { event.preventDefault(); state.pencil = !state.pencil; render(); return; }
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
      event.preventDefault();
      clearCell();
      return;
    }
    if (event.key >= '1' && event.key <= '9') {
      event.preventDefault();
      const digit = Number(event.key);
      if (event.shiftKey || state.pencil) mark(digit);
      else place(digit);
    }
  });

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

  setInterval(() => {
    if (!state.running || state.done) return;
    state.elapsed += 1;
    el.timer.textContent = formatTime(state.elapsed);
  }, 1000);

  if (restore()) {
    el.timer.textContent = formatTime(state.elapsed);
    render();
  } else {
    newGame('easy');
  }
})();

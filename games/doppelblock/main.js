'use strict';

(function () {
  const R = window.DoppelRules;
  const S = window.DoppelSolver;
  const G = window.DoppelGenerator;
  const Sound = window.DoppelSound;
  const SAVE_KEY = 'web-games.doppelblock.game';

  const el = {
    board: document.getElementById('board'),
    veil: document.getElementById('veil'),
    sizes: document.getElementById('sizes'),
    levels: document.getElementById('levels'),
    timer: document.getElementById('timer'),
    toast: document.getElementById('toast'),
    combos: document.getElementById('combos'),
    digits: document.getElementById('digits'),
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
    helpRange: document.getElementById('help-range'),
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
    n: 6,
    level: 'easy',
    rowClues: [],
    colClues: [],
    solution: null,
    values: null,
    marks: null,
    selected: 0,
    pencil: false,
    history: [],
    elapsed: 0,
    running: false,
    done: false,
    doneLines: new Set(),
  };

  const digitsOf = () => R.digitCount(state.n);
  const rowOf = (i) => Math.floor(i / state.n);
  const colOf = (i) => i % state.n;

  // --- 그리기 ---

  let cells = [];
  let rowClueNodes = [];
  let colClueNodes = [];

  function buildBoard() {
    el.board.replaceChildren();
    el.board.style.gridTemplateColumns = `repeat(${state.n + 1}, var(--cell))`;
    cells = [];
    rowClueNodes = [];
    colClueNodes = [];

    for (let r = 0; r < state.n; r++) {
      for (let c = 0; c < state.n; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.index = r * state.n + c;
        el.board.appendChild(cell);
        cells.push(cell);
      }
      const clue = document.createElement('div');
      clue.className = 'clue';
      el.board.appendChild(clue);
      rowClueNodes.push(clue);
    }
    for (let c = 0; c < state.n; c++) {
      const clue = document.createElement('div');
      clue.className = 'clue';
      el.board.appendChild(clue);
      colClueNodes.push(clue);
    }
    const corner = document.createElement('div');
    corner.className = 'corner';
    el.board.appendChild(corner);
  }

  function lineCells(kind, index) {
    const out = [];
    for (let k = 0; k < state.n; k++) {
      out.push(kind === 'row' ? index * state.n + k : k * state.n + index);
    }
    return out;
  }

  /** 그 줄이 규칙과 합을 모두 만족하는지. 어긋나면 사유를 돌려준다. */
  function lineStatus(kind, index) {
    const values = lineCells(kind, index).map((i) => state.values[i]);
    const clue = kind === 'row' ? state.rowClues[index] : state.colClues[index];
    const blocks = values.filter((v) => v === R.BLOCK).length;
    if (blocks > 2) return 'broken';

    const digits = values.filter((v) => v > 0);
    if (new Set(digits).size !== digits.length) return 'broken';

    if (values.some((v) => v === R.UNKNOWN)) return 'open';
    if (blocks !== 2) return 'broken';
    return R.clueOf(values) === clue ? 'done' : 'broken';
  }

  function render() {
    const selected = state.selected;
    const selectedValue = state.values[selected];
    const counts = new Array(digitsOf() + 1).fill(0);
    for (const v of state.values) if (v > 0) counts[v]++;

    const brokenCells = new Set();
    for (const kind of ['row', 'col']) {
      for (let i = 0; i < state.n; i++) {
        if (lineStatus(kind, i) !== 'broken') continue;
        // 어느 칸이 문제인지까지는 규칙상 특정할 수 없다. 중복 숫자와 초과된
        // 검은 칸만 짚어 준다 — 합이 안 맞는 것은 줄 단서 쪽에 표시한다.
        const cellsInLine = lineCells(kind, i);
        const seen = new Map();
        let blocks = 0;
        for (const idx of cellsInLine) {
          const v = state.values[idx];
          if (v === R.BLOCK) { blocks++; if (blocks > 2) brokenCells.add(idx); }
          else if (v > 0) {
            if (seen.has(v)) { brokenCells.add(idx); brokenCells.add(seen.get(v)); }
            else seen.set(v, idx);
          }
        }
      }
    }

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const value = state.values[i];
      const classes = ['cell'];
      if (value === R.BLOCK) classes.push('block');
      if (brokenCells.has(i)) classes.push('wrong');
      if (i === selected) classes.push('selected');
      else if (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected)) classes.push('peer');
      if (cell.dataset.hinted === '1') classes.push('hinted');
      cell.className = classes.join(' ');

      if (value > 0) {
        cell.textContent = value;
      } else if (value === R.BLOCK) {
        cell.textContent = '';
      } else if (state.marks[i]) {
        cell.textContent = '';
        const grid = document.createElement('span');
        grid.className = 'marks';
        grid.style.gridTemplateColumns = `repeat(${Math.min(3, digitsOf())}, 1fr)`;
        for (let d = 1; d <= digitsOf(); d++) {
          const slot = document.createElement('span');
          slot.textContent = (state.marks[i] & (1 << d)) ? d : '';
          grid.appendChild(slot);
        }
        cell.replaceChildren(grid);
      } else {
        cell.textContent = '';
      }
    }

    for (let i = 0; i < state.n; i++) {
      rowClueNodes[i].textContent = state.rowClues[i];
      rowClueNodes[i].className = `clue ${lineStatus('row', i)}`;
      colClueNodes[i].textContent = state.colClues[i];
      colClueNodes[i].className = `clue ${lineStatus('col', i)}`;
    }

    for (let d = 1; d <= digitsOf(); d++) {
      const key = el.digits.querySelector(`[data-digit="${d}"]`);
      if (key) key.classList.toggle('done', counts[d] >= state.n);
    }

    el.undo.disabled = state.history.length === 0;
    el.pencil.setAttribute('aria-pressed', String(state.pencil));
    renderCombos();
  }

  function renderCombos() {
    const rows = [
      { title: `가로 ${rowOf(state.selected) + 1}줄 · 합 ${state.rowClues[rowOf(state.selected)]}`,
        groups: S.clueCombinations(state.n, state.rowClues[rowOf(state.selected)]) },
      { title: `세로 ${colOf(state.selected) + 1}줄 · 합 ${state.colClues[colOf(state.selected)]}`,
        groups: S.clueCombinations(state.n, state.colClues[colOf(state.selected)]) },
    ];

    el.combos.replaceChildren();
    for (const row of rows) {
      const head = document.createElement('div');
      head.className = 'combo-line';
      const title = document.createElement('span');
      title.className = 'combo-head';
      title.textContent = row.title;
      head.appendChild(title);

      if (row.groups.length === 0) {
        const none = document.createElement('span');
        none.className = 'combo-none';
        none.textContent = '가능한 조합이 없습니다';
        head.appendChild(none);
      }
      el.combos.appendChild(head);

      for (const group of row.groups) {
        const line = document.createElement('div');
        line.className = 'combo-line';
        const between = document.createElement('span');
        between.className = 'combo-head';
        between.textContent = `사이 ${group.between}칸`;
        line.appendChild(between);
        for (const set of group.sets) {
          const chip = document.createElement('span');
          chip.className = 'combo-set';
          chip.textContent = set.length ? set.join(' ') : '없음';
          line.appendChild(chip);
        }
        el.combos.appendChild(line);
      }
    }
    el.combos.hidden = false;
  }

  let toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 3600);
  }

  const formatTime = (seconds) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  // --- 조작 ---

  function snapshot() {
    state.history.push({ values: state.values.slice(), marks: state.marks.slice() });
    if (state.history.length > 200) state.history.shift();
  }

  function put(value) {
    const i = state.selected;
    if (state.done) return;
    snapshot();
    const cleared = state.values[i] === value;
    state.values[i] = cleared ? R.UNKNOWN : value;
    if (state.values[i] !== R.UNKNOWN) state.marks[i] = 0;

    if (cleared) Sound.play('erase');
    else if (brokenLinesAt(i)) Sound.play('conflict');
    else Sound.play(value === R.BLOCK ? 'block' : 'digit', value);

    afterChange();
  }

  /** 이 칸이 속한 줄 중 하나라도 규칙을 어겼는가. 소리를 고르는 데만 쓴다. */
  function brokenLinesAt(index) {
    return lineStatus('row', rowOf(index)) === 'broken'
      || lineStatus('col', colOf(index)) === 'broken';
  }

  function mark(digit) {
    const i = state.selected;
    if (state.done || state.values[i] !== R.UNKNOWN) return;
    snapshot();
    state.marks[i] ^= 1 << digit;
    Sound.play('pencil');
    afterChange();
  }

  function clearCell() {
    const i = state.selected;
    if (state.done) return;
    if (state.values[i] === R.UNKNOWN && !state.marks[i]) return;
    snapshot();
    state.values[i] = R.UNKNOWN;
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
    syncDoneLines();
    save();
    render();
  }

  /** 지금 완성된 줄들의 집합. 새로 완성된 줄이 생기면 소리로 알린다. */
  function currentDoneLines() {
    const done = new Set();
    for (const kind of ['row', 'col']) {
      for (let i = 0; i < state.n; i++) {
        if (lineStatus(kind, i) === 'done') done.add(`${kind}-${i}`);
      }
    }
    return done;
  }

  function syncDoneLines() {
    state.doneLines = currentDoneLines();
  }

  function afterChange() {
    const before = state.doneLines;
    const after = currentDoneLines();
    // 완성이 풀렸다가 다시 완성되는 것도 새 완성으로 친다. 되돌리기로 줄어드는
    // 경우에는 울리지 않아야 하므로 크기 비교가 아니라 원소로 따진다.
    const fresh = [...after].some((key) => !before.has(key));
    state.doneLines = after;

    save();
    render();
    // 마지막 수는 줄도 완성시키므로, 먼저 완주 여부를 판정해 두 소리가 겹치는
    // 것을 막는다. 완주했다면 승리음만 울린다.
    checkDone();
    if (fresh && !state.done) Sound.play('lineDone');
  }

  function checkDone() {
    if (state.values.some((v) => v === R.UNKNOWN)) return;
    if (R.validate(state.n, state.values, state.rowClues, state.colClues)) return;
    state.done = true;
    state.running = false;
    el.resultTitle.textContent = '다 풀었어요';
    el.resultNote.textContent = `${state.n}×${state.n} ${G.LEVELS[state.level].label} · ${formatTime(state.elapsed)}`;
    el.result.hidden = false;
    Sound.play('win');
    save();
  }

  function hint() {
    if (state.done) return;
    for (let i = 0; i < state.values.length; i++) {
      if (state.values[i] !== R.UNKNOWN && state.values[i] !== state.solution[i]) {
        state.selected = i;
        render();
        Sound.play('conflict');
        toast('여기 값이 정답과 달라요. 먼저 고쳐야 이어서 풀 수 있어요');
        return;
      }
    }

    const step = S.nextStep(state.n, state.rowClues, state.colClues, state.values);
    if (!step) { toast('더 짚어줄 칸을 찾지 못했어요'); return; }

    snapshot();
    state.values[step.cell] = step.value;
    state.marks[step.cell] = 0;
    state.selected = step.cell;

    // 하이라이트를 지울 때 인덱스로 다시 찾으면 안 된다. 그 사이에 새 판을
    // 만들면 격자가 통째로 새로 그려져 그 자리에 다른 칸이 있거나 아예 없다.
    const hinted = cells[step.cell];
    hinted.dataset.hinted = '1';
    setTimeout(() => {
      if (!hinted.isConnected) return;
      delete hinted.dataset.hinted;
      render();
    }, 900);

    Sound.play('hint');
    const what = step.value === R.BLOCK ? '검은 칸' : step.value;
    toast(`${what} — ${step.detail}`);
    afterChange();
  }

  // --- 저장 ---

  function save() {
    store.set({
      n: state.n,
      level: state.level,
      rowClues: state.rowClues,
      colClues: state.colClues,
      solution: [...state.solution],
      values: [...state.values],
      marks: [...state.marks],
      elapsed: Math.floor(state.elapsed),
      done: state.done,
    });
  }

  function restore() {
    const saved = store.get(null);
    if (!saved || !G.SIZES.includes(saved.n) || !G.levelsFor(saved.n).includes(saved.level)) return false;
    if (!Array.isArray(saved.solution) || saved.solution.length !== saved.n * saved.n) return false;

    state.n = saved.n;
    state.level = saved.level;
    state.rowClues = saved.rowClues;
    state.colClues = saved.colClues;
    state.solution = Int8Array.from(saved.solution);
    state.values = Int8Array.from(saved.values);
    state.marks = Uint16Array.from(saved.marks);
    state.elapsed = saved.elapsed || 0;
    state.done = Boolean(saved.done);
    state.history = [];
    state.selected = state.values.findIndex((v) => v === R.UNKNOWN);
    if (state.selected < 0) state.selected = 0;
    state.running = !state.done;

    buildPickers();
    buildDigits();
    buildBoard();
    syncDoneLines();
    if (state.done) {
      el.resultTitle.textContent = '다 풀었어요';
      el.resultNote.textContent = `${state.n}×${state.n} ${G.LEVELS[state.level].label} · ${formatTime(state.elapsed)}`;
      el.result.hidden = false;
    }
    return true;
  }

  // --- 새 판 ---

  function newGame(n = state.n, level = state.level) {
    if (!G.levelsFor(n).includes(level)) level = G.levelsFor(n)[0];
    state.n = n;
    state.level = level;
    el.veil.hidden = false;
    el.result.hidden = true;
    buildPickers();
    buildDigits();
    buildBoard();

    // 6×6 쉬움은 판당 60ms를 넘길 때가 있다. 화면이 멈춘 것처럼 보이지 않도록
    // "만드는 중"을 먼저 그리고 다음 프레임에 만든다.
    requestAnimationFrame(() => setTimeout(() => {
      const made = G.generate(n, level);
      state.rowClues = made.rowClues;
      state.colClues = made.colClues;
      state.solution = made.solution;
      state.values = new Int8Array(n * n).fill(R.UNKNOWN);
      state.marks = new Uint16Array(n * n);
      state.history = [];
      state.elapsed = 0;
      state.running = true;
      state.done = false;
      state.selected = 0;
      el.veil.hidden = true;
      el.timer.textContent = '0:00';
      el.helpRange.textContent = `1~${R.digitCount(n)}`;
      syncDoneLines();
      save();
      render();
    }, 0));
  }

  // --- 버튼 만들기 ---

  function buildPickers() {
    el.sizes.replaceChildren();
    for (const size of G.SIZES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick';
      button.textContent = `${size}×${size}`;
      button.setAttribute('aria-pressed', String(size === state.n));
      button.addEventListener('click', () => newGame(size, state.level));
      el.sizes.appendChild(button);
    }

    el.levels.replaceChildren();
    for (const level of G.levelsFor(state.n)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick';
      button.textContent = G.LEVELS[level].label;
      button.setAttribute('aria-pressed', String(level === state.level));
      button.addEventListener('click', () => newGame(state.n, level));
      el.levels.appendChild(button);
    }
  }

  function buildDigits() {
    const digits = R.digitCount(state.n);
    el.digits.replaceChildren();
    el.digits.style.gridTemplateColumns = `repeat(${digits + 1}, 1fr)`;

    const blockKey = document.createElement('button');
    blockKey.type = 'button';
    blockKey.className = 'digit block-key';
    blockKey.textContent = '■';
    blockKey.addEventListener('click', () => put(R.BLOCK));
    el.digits.appendChild(blockKey);

    for (let d = 1; d <= digits; d++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'digit';
      button.dataset.digit = d;
      button.textContent = d;
      button.addEventListener('click', () => (state.pencil ? mark(d) : put(d)));
      el.digits.appendChild(button);
    }
  }

  // --- 입력 연결 ---

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

  window.addEventListener('keydown', (event) => {
    Sound.unlock();
    if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); undo(); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -state.n, ArrowDown: state.n };
    if (event.key in moves) {
      event.preventDefault();
      const step = moves[event.key];
      // 좌우 이동이 줄을 넘어가지 않게 막는다.
      if (Math.abs(step) === 1) {
        const next = colOf(state.selected) + step;
        if (next < 0 || next >= state.n) return;
      }
      const next = state.selected + step;
      if (next >= 0 && next < state.n * state.n) { state.selected = next; render(); }
      return;
    }

    if (event.key === ' ') { event.preventDefault(); state.pencil = !state.pencil; render(); return; }
    if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); clearCell(); return; }
    if (event.key === '0' || event.key.toLowerCase() === 'b') { event.preventDefault(); put(R.BLOCK); return; }
    if (event.key >= '1' && event.key <= String(R.digitCount(state.n))) {
      event.preventDefault();
      const digit = Number(event.key);
      if (event.shiftKey || state.pencil) mark(digit);
      else put(digit);
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
    el.helpRange.textContent = `1~${digitsOf()}`;
    render();
  } else {
    newGame(6, 'easy');
  }
})();

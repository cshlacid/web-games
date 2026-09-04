'use strict';

(function () {
  const R = window.DoppelRules;
  const Icons = window.SharedIcons;
  const S = window.DoppelSolver;
  const G = window.DoppelGenerator;
  const Sound = window.DoppelSound;
  const SAVE_KEY = 'web-games.doppelblock.game';

  const el = {
    board: document.getElementById('board'),
    veil: document.getElementById('veil'),
    size: document.getElementById('size'),
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
    helpKeys: document.getElementById('help-keys'),
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
    hinted: new Set(),
  };

  const digitsOf = () => R.digitCount(state.n);
  // 연필 표시에 올 수 있는 값들. 검은 칸도 후보가 될 수 있어야 힌트가 "여기는
  // 검은 칸일 수도 있다"까지 적어 줄 수 있다.
  const markValues = () => [R.BLOCK, ...Array.from({ length: digitsOf() }, (_, k) => k + 1)];
  const rowOf = (i) => Math.floor(i / state.n);
  const colOf = (i) => i % state.n;

  // --- 그리기 ---

  let cells = [];
  let rowClueNodes = [];
  let colClueNodes = [];

  function buildBoard() {
    el.board.replaceChildren();
    el.board.style.gridTemplateColumns = `repeat(${state.n + 1}, var(--cell))`;
    el.board.style.setProperty('--cols', state.n + 1);
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
      const clue = document.createElement('button');
      clue.type = 'button';
      clue.className = 'clue';
      clue.dataset.kind = 'row';
      clue.dataset.index = r;
      el.board.appendChild(clue);
      rowClueNodes.push(clue);
    }
    for (let c = 0; c < state.n; c++) {
      const clue = document.createElement('button');
      clue.type = 'button';
      clue.className = 'clue';
      clue.dataset.kind = 'col';
      clue.dataset.index = c;
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
      if (state.hinted.has(i)) classes.push('hinted');
      cell.className = classes.join(' ');

      if (value > 0) {
        cell.textContent = value;
      } else if (value === R.BLOCK) {
        cell.textContent = '';
      } else if (state.marks[i]) {
        cell.textContent = '';
        const grid = document.createElement('span');
        grid.className = 'marks';
        grid.style.gridTemplateColumns = `repeat(${Math.min(3, digitsOf() + 1)}, 1fr)`;
        for (const value of markValues()) {
          const slot = document.createElement('span');
          const on = state.marks[i] & S.bitOf(value);
          if (value === R.BLOCK) slot.className = 'mark-block';
          slot.textContent = on ? (value === R.BLOCK ? '■' : value) : '';
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

  /**
   * persist를 주면 시간이 지나도 지우지 않는다. 힌트 설명은 읽는 데 시간이
   * 걸리는데 몇 초 만에 사라지면 무슨 근거였는지 다시 볼 방법이 없다. 대신
   * 다음 동작에서 지운다.
   */
  function toast(message, persist = false) {
    el.toast.textContent = message;
    el.toast.classList.toggle('persist', persist);
    clearTimeout(toastTimer);
    if (!persist) toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 3600);
  }

  /**
   * 힌트 하이라이트도 여기서 함께 거둔다. 설명과 짚어 준 칸은 한 쌍이라
   * 따로 사라지면 어느 칸 이야기였는지 알 수 없게 된다.
   */
  function clearToast() {
    clearTimeout(toastTimer);
    el.toast.textContent = '';
    el.toast.classList.remove('persist');
    if (state.hinted.size) { state.hinted.clear(); render(); }
  }

  const formatTime = (seconds) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  // --- 조작 ---

  function snapshot() {
    state.history.push({ values: state.values.slice(), marks: state.marks.slice() });
    if (state.history.length > 200) state.history.shift();
  }

  /**
   * 방금 놓은 값 때문에 더는 성립하지 않는 연필 표시를 같은 가로·세로 줄에서
   * 지운다. 손으로 지우게 두면 연필 표시가 금세 거짓말을 한다.
   *
   * 숫자는 줄마다 한 번뿐이므로 놓는 즉시 같은 줄에서 빠지지만, 검은 칸은 두
   * 개까지 들어가므로 두 개가 다 찬 뒤에야 나머지 칸에서 뺄 수 있다.
   */
  function clearPeerMarks(index, value) {
    for (const kind of ['row', 'col']) {
      const line = lineCells(kind, kind === 'row' ? rowOf(index) : colOf(index));
      if (value === R.BLOCK && line.filter((c) => state.values[c] === R.BLOCK).length < 2) continue;
      const bit = S.bitOf(value);
      for (const cell of line) {
        if (cell !== index) state.marks[cell] &= ~bit;
      }
    }
  }

  function put(value) {
    const i = state.selected;
    if (state.done) return;
    clearToast();
    snapshot();
    const cleared = state.values[i] === value;
    state.values[i] = cleared ? R.UNKNOWN : value;
    if (state.values[i] !== R.UNKNOWN) state.marks[i] = 0;
    if (!cleared) clearPeerMarks(i, value);

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

  function mark(value) {
    const i = state.selected;
    if (state.done || state.values[i] !== R.UNKNOWN) return;
    clearToast();
    snapshot();
    state.marks[i] ^= S.bitOf(value);
    Sound.play('pencil');
    afterChange();
  }

  function clearCell() {
    const i = state.selected;
    if (state.done) return;
    clearToast();
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
    clearToast();
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

  /**
   * 단서를 누르면 그 줄의 빈 칸에 후보를 한꺼번에 적는다. 두 번 두드리기를
   * 칸마다 반복하는 것과 같고, 후보 계산도 같다 — 가로·세로에 놓인 숫자만 뺀다.
   * 값이 놓인 칸도, 이미 연필로 적어 둔 칸도 건드리지 않는다. 손으로 좁혀 둔
   * 후보를 가로·세로만 본 넓은 후보로 되돌리면 따져 둔 것이 날아간다.
   *
   * 검은 칸 두 개가 아직 정해지지 않은 줄에서는 동작하지 않는다. 그 상태에서
   * 빈 칸에 숫자 후보를 적으면 검은 칸이 될 수도 있는 자리에 "여기는 숫자"라고
   * 잘못 말하는 셈이 된다.
   */
  function fillLineCandidates(kind, index) {
    if (state.done) return;
    if (lineStatus(kind, index) === 'done') { toast('이미 끝난 줄이에요'); return; }

    const cellsInLine = lineCells(kind, index);
    const blocks = cellsInLine.filter((cell) => state.values[cell] === R.BLOCK).length;
    if (blocks !== 2) {
      toast(`검은 칸 두 개를 먼저 정해야 후보를 적을 수 있어요 (지금 ${blocks}개)`);
      return;
    }

    const updates = [];
    for (const cell of cellsInLine) {
      if (state.values[cell] !== R.UNKNOWN || state.marks[cell]) continue;
      const mask = availableDigits(cell);
      if (mask) updates.push([cell, mask]);
    }

    if (updates.length === 0) { toast('이 줄에 새로 적을 후보가 없어요'); return; }

    snapshot();
    for (const [cell, mask] of updates) state.marks[cell] = mask;
    Sound.play('autofill');
    toast(`${kind === 'row' ? '가로' : '세로'} ${index + 1}줄 ${updates.length}칸에 후보를 적었어요`);
    afterChange();
  }

  /**
   * 그 칸의 가로·세로에 아직 안 쓰인 숫자들. 더블탭과 단서 클릭이 함께 쓴다.
   *
   * 검은 칸은 일부러 넣지 않는다. 순환의 다음 칸이 검은 칸이라, 후보에까지
   * 넣으면 같은 말을 두 번 하는 데다 숫자 후보 사이에서 ■만 눈에 띈다.
   * 검은 칸 후보는 연필 모드에서 손으로 찍거나 힌트가 적어 준다.
   *
   * 숫자도 일부러 이 정도만 본다. 그 줄의 가능한 배치까지 따지면 후보가 너무
   * 좁아져서 사실상 대신 풀어주는 꼴이 된다 — 실제로 그렇게 만들었다가 되돌렸다.
   */
  function availableDigits(index) {
    const used = new Set();
    for (const kind of ['row', 'col']) {
      const line = lineCells(kind, kind === 'row' ? rowOf(index) : colOf(index));
      for (const cell of line) if (state.values[cell] > 0) used.add(state.values[cell]);
    }
    let mask = 0;
    for (let d = 1; d <= digitsOf(); d++) if (!used.has(d)) mask |= 1 << d;
    return mask;
  }

  /**
   * 칸을 더블클릭할 때마다 빈 칸 → 연필 후보 → 검은 칸 → 빈 칸으로 돈다.
   *
   * 숫자가 놓인 칸은 순환에 넣지 않는다. 더블클릭 한 번에 확신하고 넣은 값이
   * 사라지면 곤란하다.
   */
  function cycleCell(index) {
    if (state.done) return;
    clearToast();
    const value = state.values[index];
    if (value > 0) return;

    if (value === R.BLOCK) {
      snapshot();
      state.values[index] = R.UNKNOWN;
      state.marks[index] = 0;
      Sound.play('erase');
      afterChange();
      return;
    }

    if (state.marks[index]) {
      snapshot();
      state.values[index] = R.BLOCK;
      state.marks[index] = 0;
      clearPeerMarks(index, R.BLOCK);
      Sound.play('block');
      afterChange();
      return;
    }

    const mask = availableDigits(index);
    if (!mask) {
      // 가로·세로에 숫자가 다 찼으면 그 칸은 숫자가 될 수 없다. 적을 후보가
      // 없다고 멈추는 대신 순환의 다음 칸인 검은 칸으로 바로 넘어간다.
      snapshot();
      state.values[index] = R.BLOCK;
      state.marks[index] = 0;
      clearPeerMarks(index, R.BLOCK);
      Sound.play('block');
      afterChange();
      return;
    }

    snapshot();
    state.marks[index] = mask;
    Sound.play('autofill');
    afterChange();
  }

  function hint() {
    if (state.done) return;
    for (let i = 0; i < state.values.length; i++) {
      if (state.values[i] !== R.UNKNOWN && state.values[i] !== state.solution[i]) {
        state.selected = i;
        state.hinted.clear();
        render();
        Sound.play('conflict');
        toast('여기 값이 정답과 달라요. 먼저 고쳐야 이어서 풀 수 있어요', true);
        return;
      }
    }

    const step = S.nextHint(state.n, state.rowClues, state.colClues, state.values, state.marks);
    if (!step) { toast('더 짚어줄 것을 찾지 못했어요'); return; }

    snapshot();
    state.hinted.clear();

    if (step.kind === 'place') {
      state.values[step.cell] = step.value;
      state.marks[step.cell] = 0;
      clearPeerMarks(step.cell, step.value);
      state.selected = step.cell;
      state.hinted.add(step.cell);
      Sound.play('hint');
      toast(`${S.valueName(step.value)} — ${step.detail}`, true);
      afterChange();
      return;
    }

    // 좁혀진 후보를 연필로 적어 둔다. 화면에 남지 않으면 다음 힌트가 같은
    // 단계를 다시 알려 주게 되고, 힌트를 눌러도 제자리인 것처럼 보인다.
    for (const { cell, mask } of step.cells) {
      // 이미 적어 둔 것이 더 좁으면 그대로 두고 지울 것만 지운다. 다만 그
      // 결과가 비면 플레이어의 표시가 틀렸다는 뜻이라 새 후보로 바로잡는다.
      state.marks[cell] = (state.marks[cell] & mask) || mask;
      state.hinted.add(cell);
    }
    state.selected = step.cells[0].cell;

    Sound.play('hint');
    toast(`${step.label} — ${step.detail}`, true);
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
    if (!saved || !G.SIZES.includes(saved.n) || !G.LEVEL_NAMES.includes(saved.level)) return false;
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
    state.hinted.clear();
    state.selected = state.values.findIndex((v) => v === R.UNKNOWN);
    if (state.selected < 0) state.selected = 0;
    state.running = !state.done;

    buildPickers();
    buildDigits();
    buildBoard();
    el.size.textContent = `${state.n}×${state.n}`;
    syncDoneLines();
    if (state.done) {
      el.resultTitle.textContent = '다 풀었어요';
      el.resultNote.textContent = `${state.n}×${state.n} ${G.LEVELS[state.level].label} · ${formatTime(state.elapsed)}`;
      el.result.hidden = false;
    }
    return true;
  }

  // --- 새 판 ---

  function newGame(level = state.level) {
    state.level = level;
    el.veil.hidden = false;
    el.result.hidden = true;
    buildPickers();

    // 판을 만드는 데 걸리는 시간이 크게 튄다. 큰 판은 미리 구워 둔 목록에서
    // 꺼내므로 즉시 나오지만, 그 자리에서 뽑는 어려움(5×5·6×6)은 무작위 판
    // 1000개에 하나꼴이라 노트북에서도 최악 1.4초다. 화면이 멈춘 것처럼 보이지
    // 않도록 "만드는 중"을 먼저 그리고 다음 프레임에 만든다.
    requestAnimationFrame(() => setTimeout(() => {
      const made = G.generate(level);
      const n = made.n;
      state.n = n;
      // 크기는 판을 만들고 나서야 정해지므로 격자도 그때 세운다.
      buildDigits();
      buildBoard();
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
      state.hinted.clear();
      el.veil.hidden = true;
      el.timer.textContent = '0:00';
      el.size.textContent = `${n}×${n}`;
      setDigitRange(n);
      syncDoneLines();
      save();
      render();
    }, 0));
  }

  // --- 버튼 만들기 ---

  function buildPickers() {
    el.levels.replaceChildren();
    for (const level of G.LEVEL_NAMES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick';
      button.textContent = G.LEVELS[level].label;
      button.title = G.LEVELS[level].note;
      button.setAttribute('aria-pressed', String(level === state.level));
      button.addEventListener('click', () => newGame(level));
      el.levels.appendChild(button);
    }
  }

  // 도움말이 숫자 범위를 두 군데서 말한다. 크기를 바꿀 때 한쪽만 고치면
  // 없는 키를 누르라고 적혀 있게 된다.
  function setDigitRange(n) {
    const text = `1~${R.digitCount(n)}`;
    el.helpRange.textContent = text;
    el.helpKeys.textContent = text;
  }

  function buildDigits() {
    const digits = R.digitCount(state.n);
    el.digits.replaceChildren();
    el.digits.style.gridTemplateColumns = `repeat(${digits + 1}, 1fr)`;

    const blockKey = document.createElement('button');
    blockKey.type = 'button';
    blockKey.className = 'digit block-key';
    blockKey.textContent = '■';
    blockKey.addEventListener('click', () => (state.pencil ? mark(R.BLOCK) : put(R.BLOCK)));
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

  // 같은 칸을 짧은 간격으로 두 번 누르면 순환으로 친다.
  //
  // dblclick 이벤트에 맡기지 않는 이유: iOS 사파리는 탭 두 번에 dblclick을 주지
  // 않는 경우가 있어 아이폰에서 기능이 통째로 먹통이 된다. 크로미움의 아이폰
  // 에뮬레이션은 dblclick을 만들어 주기 때문에 테스트로도 잡히지 않았다.
  const DOUBLE_TAP_MS = 400;
  let lastTap = { index: -1, at: 0 };

  el.board.addEventListener('click', (event) => {
    const clue = event.target.closest('.clue');
    if (clue) {
      fillLineCandidates(clue.dataset.kind, Number(clue.dataset.index));
      return;
    }
    const cell = event.target.closest('.cell');
    if (!cell) return;

    const index = Number(cell.dataset.index);
    const now = Date.now();
    if (lastTap.index === index && now - lastTap.at < DOUBLE_TAP_MS) {
      // 한 쌍을 소비한다. 그러지 않으면 이어지는 한 번의 탭에도 또 돈다.
      lastTap = { index: -1, at: 0 };
      cycleCell(index);
      return;
    }

    lastTap = { index, at: now };
    state.selected = index;
    render();
  });

  el.toast.addEventListener('click', clearToast);

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
  window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

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
    if (event.key === '0' || event.key.toLowerCase() === 'b') {
      event.preventDefault();
      if (event.shiftKey || state.pencil) mark(R.BLOCK);
      else put(R.BLOCK);
      return;
    }
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
    setDigitRange(state.n);
    render();
  } else {
    newGame('easy');
  }

  // 도구 단추의 아이콘은 HTML에 이름만 적혀 있다. 여기서 한 번 그린다.
  Icons.paint();
})();

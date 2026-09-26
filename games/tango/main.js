'use strict';

(function () {

const R = window.TangoRules;
const S = window.TangoSolver;
const G = window.TangoGenerator;
const Icons = window.TangoIcons;
const Sound = window.TangoSound;
const t = SharedI18n.t;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SIZE_KEY = 'web-games.tango.size';
const BEST_KEY = 'web-games.tango.best';
const CHECK_KEY = 'web-games.tango.autocheck';

const el = {
  sizes: document.getElementById('sizes'),
  autoCheck: document.getElementById('auto-check'),
  best: document.getElementById('best'),
  timer: document.getElementById('timer'),
  board: document.getElementById('board'),
  veil: document.getElementById('veil'),
  toast: document.getElementById('toast'),
  undo: document.getElementById('undo'),
  clear: document.getElementById('clear'),
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

const game = {
  size: loadSize(),
  autoCheck: loadCheck(),
  puzzle: null,
  board: null,
  state: null,
  cells: [],
  history: [],
  lit: null,
  cursor: null,
  elapsed: 0,
  running: false,
  hinted: 0,
  done: false,
};

function loadSize() {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY));
    if (G.SIZES.includes(saved)) return saved;
  } catch { /* 저장된 값이 없거나 접근 불가 */ }
  return 6;
}

function loadCheck() {
  try { return localStorage.getItem(CHECK_KEY) !== 'off'; } catch { return true; }
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; }
}

function saveBest(best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* 무시 */ }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showBest() {
  const best = loadBest()[game.size];
  el.best.textContent = best ? t('record.best', { time: formatTime(best) }) : '';
}

function toast(text) {
  el.toast.textContent = text;
}

// --- 판 그리기 ---

function buildBoard() {
  const size = game.size;
  el.board.style.setProperty('--cols', size);
  el.board.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
  el.board.classList.remove('done');
  el.board.replaceChildren();
  game.cells = [];

  // **그림을 둘 다 넣어 두고 감춘다.** 눌릴 때마다 innerHTML을 갈아 끼우면
  // 손가락 밑의 요소가 그 자리에서 사라진다. 사라진 요소에서 시작한 두드림은
  // 뒤이은 터치 이벤트가 문서까지 올라오지 않아, 더블 탭을 가로채는 공용
  // 처리기(`shared/base.js`)가 듣지 못한다 — Queens에서 실제로 겪었다.
  for (let cell = 0; cell < size * size; cell++) {
    const node = document.createElement('div');
    node.className = R.locked(game.board, cell) ? 'cell fixed' : 'cell';
    node.dataset.cell = String(cell);
    node.innerHTML = Icons.svg('sun') + Icons.svg('moon');
    el.board.appendChild(node);
    game.cells.push(node);
  }

  // 칸 구분선·바깥 테두리·표를 한 SVG에 담는다. 칸은 배치 엔진이 기기 픽셀에
  // 맞춰 반올림해 칠하고 SVG는 소수점 좌표 그대로 그리므로, 둘을 섞어 그리면
  // 표가 금에서 조금씩 벗어난다. viewBox를 칸 수로 잡아 두면 판 크기가 달라져도
  // 좌표를 다시 계산할 일이 없다.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'edges');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  // 계산된 굵기를 읽으려면 먼저 붙어 있어야 한다.
  el.board.appendChild(svg);

  // **바깥 테두리는 굵기의 절반만큼 들여 두른다.** 들이는 양을 굵기와 따로
  // 정해 두면 둘이 어긋나 모서리에 칸 색이 새거나 테두리가 칸을 덮는다.
  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'frame');
  svg.appendChild(frame);
  const inset = parseFloat(getComputedStyle(frame).strokeWidth) / 2;

  // 선 끝은 굵기의 절반만큼 더 나간다(`stroke-linecap: square`). 판 가장자리에
  // 닿는 선을 칸 경계에서 끊으면 그만큼 테두리 밖으로 삐져나오므로 **테두리
  // 선의 한가운데**에서 끊는다.
  const stop = (v) => (v <= 0 ? inset : v >= size ? size - inset : v);

  // 표가 앉는 자리에서는 금을 끊는다. 금이 표를 뚫고 지나가면 `=`의 두 줄과
  // 섞여 세 줄로 보이고, `×`는 한가운데가 지저분해진다.
  const HALF_GAP = 0.2;
  const breaks = new Map();
  const marks = [];
  for (const link of game.puzzle.links) {
    const a = Math.min(link.a, link.b);
    const r = Math.floor(a / size);
    const c = a % size;
    const across = Math.abs(link.a - link.b) === 1;
    // 가로로 묶인 짝은 세로 금 위에, 세로로 묶인 짝은 가로 금 위에 앉는다.
    const line = across ? `v${c + 1}` : `h${r + 1}`;
    const at = across ? r + 0.5 : c + 0.5;
    if (!breaks.has(line)) breaks.set(line, []);
    breaks.get(line).push(at);
    marks.push({
      x: across ? c + 1 : c + 0.5,
      y: across ? r + 0.5 : r + 1,
      same: link.same,
    });
  }

  // 한 금은 표가 앉은 자리를 뺀 토막들로 그린다.
  function segments(line) {
    const cuts = (breaks.get(line) || []).slice().sort((a, b) => a - b);
    const out = [];
    let from = 0;
    for (const at of cuts) {
      if (at - HALF_GAP > from) out.push([from, at - HALF_GAP]);
      from = at + HALF_GAP;
    }
    if (from < size) out.push([from, size]);
    return out;
  }

  const grid = [];
  for (let k = 1; k < size; k++) {
    for (const [from, to] of segments(`v${k}`)) {
      grid.push(`M${k} ${stop(from)}L${k} ${stop(to)}`);
    }
    for (const [from, to] of segments(`h${k}`)) {
      grid.push(`M${stop(from)} ${k}L${stop(to)} ${k}`);
    }
  }

  if (grid.length) {
    const node = document.createElementNS(SVG_NS, 'path');
    node.setAttribute('class', 'grid');
    node.setAttribute('d', grid.join(''));
    svg.insertBefore(node, frame);
  }

  // `=`는 가로 두 줄, `×`는 빗금 두 개다. **묶인 방향과 상관없이 같은 모양으로
  // 그린다** — 세로 짝에서 `=`를 세로로 눕히면 두 표가 서로 다른 기호로 보인다.
  const link = [];
  for (const mark of marks) {
    const w = 0.13;
    if (mark.same) {
      link.push(`M${mark.x - w} ${mark.y - 0.06}L${mark.x + w} ${mark.y - 0.06}`);
      link.push(`M${mark.x - w} ${mark.y + 0.06}L${mark.x + w} ${mark.y + 0.06}`);
    } else {
      link.push(`M${mark.x - w} ${mark.y - w}L${mark.x + w} ${mark.y + w}`);
      link.push(`M${mark.x + w} ${mark.y - w}L${mark.x - w} ${mark.y + w}`);
    }
  }
  if (link.length) {
    const node = document.createElementNS(SVG_NS, 'path');
    node.setAttribute('class', 'link');
    node.setAttribute('d', link.join(''));
    svg.insertBefore(node, frame);
  }

  frame.setAttribute('x', inset);
  frame.setAttribute('y', inset);
  frame.setAttribute('width', size - inset * 2);
  frame.setAttribute('height', size - inset * 2);

  // 칸과 선이 같은 픽셀 격자에 놓이도록 판을 정수 자리에 앉힌다.
  window.SharedSnap.snap(el.board);
}

function paint() {
  const marks = game.state.marks;
  const bad = game.autoCheck ? R.conflicts(game.board, game.state) : new Set();

  game.cells.forEach((node, cell) => {
    node.classList.toggle('sun', marks[cell] === R.SUN);
    node.classList.toggle('moon', marks[cell] === R.MOON);
    node.classList.toggle('bad', bad.has(cell));
    node.classList.toggle('lit', game.lit !== null && game.lit.has(cell));
    node.classList.toggle('cursor', game.cursor === cell);
  });

  const touched = game.cells.some((node, cell) =>
    !R.locked(game.board, cell) && marks[cell] !== R.EMPTY);
  el.undo.disabled = game.done || game.history.length === 0;
  el.clear.disabled = game.done || !touched;
  el.hint.disabled = game.done;
}

// --- 시계 ---

function startClock() {
  if (game.running || game.done) return;
  game.running = true;
}

setInterval(() => {
  if (!game.running || game.done) return;
  game.elapsed += 1;
  el.timer.textContent = formatTime(game.elapsed);
}, 1000);

// --- 칸 바꾸기 ---

// 되돌리기는 묶음 단위다. 힌트 한 번이 여러 칸을 건드리므로 칸 하나씩 쌓으면
// 힌트를 되돌리는 데 여러 번 눌러야 한다.
function apply(changes) {
  const undone = [];
  for (const [cell, value] of changes) {
    const before = game.state.marks[cell];
    if (before === value) continue;
    R.set(game.board, game.state, cell, value);
    undone.push([cell, before]);
  }
  if (undone.length) game.history.push(undone);
  return undone.length;
}

function clearLit() { game.lit = null; }

function touch(cell) {
  if (game.done) return null;
  if (R.locked(game.board, cell)) {
    toast(t('tango.locked'));
    return null;
  }
  const next = (game.state.marks[cell] + 1) % 3;
  apply([[cell, next]]);
  startClock();
  clearLit();

  if (next === R.EMPTY) {
    Sound.play('erase');
  } else {
    const clashing = game.autoCheck && R.conflicts(game.board, game.state).has(cell);
    Sound.play(clashing ? 'clash' : next === R.SUN ? 'sun' : 'moon');
  }

  paint();
  finishIfDone();
  return next;
}

function undo() {
  if (game.done || !game.history.length) return;
  for (const [cell, before] of game.history.pop()) R.set(game.board, game.state, cell, before);
  clearLit();
  Sound.play('erase');
  paint();
}

function clearBoard() {
  if (game.done) return;
  const changes = [];
  for (let cell = 0; cell < game.board.n; cell++) {
    if (!R.locked(game.board, cell) && game.state.marks[cell] !== R.EMPTY) {
      changes.push([cell, R.EMPTY]);
    }
  }
  if (!apply(changes)) return;
  clearLit();
  Sound.play('erase');
  paint();
}

// 힌트는 어긋난 칸을 걷어 내고 한 걸음을 채운다. 채우는 칸은 정답에서 아무 데나
// 고르는 것이 아니라 **사람이 채운 칸만 보고 규칙 하나로 알 수 있는 칸**이고, 그
// 규칙과 근거가 된 칸(묶음·셋·줄)을 함께 밝혀 알린다 — 왜 거기인지 따라갈 수 있어야
// 힌트가 배움이 된다.
function hint() {
  if (game.done) return;
  const solution = game.puzzle.solution;
  const kept = Uint8Array.from(game.state.marks, (now, cell) => (now === solution[cell] ? now : R.EMPTY));

  const changes = [];
  for (let cell = 0; cell < game.board.n; cell++) {
    const now = game.state.marks[cell];
    if (now !== R.EMPTY && now !== solution[cell]) changes.push([cell, R.EMPTY]);
  }
  const removed = changes.length;

  let text;
  let lit = null;
  if (removed) {
    // 틀린 칸 위에서 좁혀 봐야 틀린 것이 나온다. 걷는 것만으로 한 번을 쓴다.
    text = t('tango.hintCleared', { count: removed });
    lit = new Set(changes.map(([cell]) => cell));
  } else {
    const found = S.step(game.puzzle, kept);
    if (found) {
      changes.push(...found.put);
      const why = found.why;
      text = t(`tango.why.${why.line ? `${why.code}.${why.line}` : why.code}`);
      lit = new Set(found.cells);
    } else {
      // 좁히기가 막힐 일은 없지만(논리로 풀리는 판만 낸다) 막히면 풀이 순서에서 집는다.
      const next = game.puzzle.order.find((cell) => game.state.marks[cell] !== solution[cell]);
      if (next === undefined) return;
      changes.push([next, solution[next]]);
      text = t('tango.hintPlaced');
      lit = new Set([next]);
    }
  }

  apply(changes);
  game.hinted++;
  game.lit = lit;
  startClock();
  Sound.play('hint');
  paint();
  toast(text);
  finishIfDone();
}

function finishIfDone() {
  if (!R.isDone(game.board, game.state)) return;
  game.done = true;
  game.running = false;
  game.cursor = null;
  clearLit();
  el.board.classList.add('done');
  paint();
  Sound.play('win');

  const best = loadBest();
  const previous = best[game.size];
  // 조각에 앞 공백을 넣어 두면 언어마다 빈칸 규칙이 달라 어긋난다 — 모아서 붙인다.
  const note = [t('tango.note', {
    size: game.size,
    given: game.puzzle.given.length,
    links: game.puzzle.links.length,
  })];
  if (game.hinted) {
    note.push(t('record.hinted', { count: game.hinted }));
  } else if (!previous || game.elapsed < previous) {
    best[game.size] = game.elapsed;
    saveBest(best);
    note.push(previous ? t('record.improved', { time: formatTime(previous) }) : t('record.first'));
    showBest();
  } else {
    note.push(t('record.bestIs', { time: formatTime(previous) }));
  }

  el.resultTitle.textContent = t('record.done', { time: formatTime(game.elapsed) });
  el.resultNote.textContent = note.join(' ');
  el.result.hidden = false;
  SharedDailyUI.report('tango', { size: game.size, time: game.elapsed, hints: game.hinted });
}

// --- 판 만들기 ---

function newGame() {
  el.result.hidden = true;
  el.veil.hidden = false;
  toast('');
  // 가림막이 먼저 그려지도록 한 프레임 뒤로 미룬다 — 바로 만들면 화면이 멈춘
  // 채로 아무 표시가 없다.
  requestAnimationFrame(() => setTimeout(() => {
    const puzzle = G.generate(game.size) || G.generate(game.size);
    if (!puzzle) {
      el.veil.hidden = true;
      toast(t('record.genFail'));
      return;
    }
    game.puzzle = puzzle;
    game.board = R.board(puzzle);
    game.state = R.newState(game.board);
    game.history = [];
    game.lit = null;
    game.cursor = null;
    game.elapsed = 0;
    game.running = false;
    game.hinted = 0;
    game.done = false;
    el.timer.textContent = '0:00';
    buildBoard();
    paint();
    el.veil.hidden = true;
  }, 20));
}

function buildSizePicker() {
  el.sizes.replaceChildren();
  for (const size of G.SIZES) {
    const button = document.createElement('button');
    button.className = 'pick';
    button.type = 'button';
    button.textContent = `${size}×${size}`;
    button.setAttribute('aria-pressed', String(size === game.size));
    button.addEventListener('click', () => {
      if (size === game.size) return;
      game.size = size;
      try { localStorage.setItem(SIZE_KEY, String(size)); } catch { /* 무시 */ }
      for (const other of el.sizes.children) {
        other.setAttribute('aria-pressed', String(other === button));
      }
      showBest();
      Sound.play('click');
      newGame();
    });
    el.sizes.appendChild(button);
  }
}

// --- 조작 ---

// 판은 `touch-action: none`이라 그 안에서는 click이 나지 않는다(`shared/base.js`가
// touchend를 취소한다). 포인터 이벤트로 짠다.
el.board.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const node = e.target && e.target.closest ? e.target.closest('.cell') : null;
  if (!node || !el.board.contains(node)) return;
  touch(Number(node.dataset.cell));
});

const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

document.addEventListener('keydown', (e) => {
  if (!game.board || game.done) return;
  if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
  if (e.key === 'Escape') { clearBoard(); return; }
  if (e.key === ' ' || e.key === 'Enter') {
    if (game.cursor === null) return;
    e.preventDefault();
    touch(game.cursor);
    return;
  }
  const move = ARROWS[e.key];
  if (!move) return;
  e.preventDefault();
  if (game.cursor === null) {
    game.cursor = 0;
  } else {
    const row = Math.floor(game.cursor / game.size) + move[0];
    const col = (game.cursor % game.size) + move[1];
    if (row < 0 || col < 0 || row >= game.size || col >= game.size) return;
    game.cursor = row * game.size + col;
  }
  paint();
});

// --- 배선 ---

el.undo.addEventListener('click', undo);
el.clear.addEventListener('click', clearBoard);
el.hint.addEventListener('click', hint);
el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });

el.autoCheck.setAttribute('aria-pressed', String(game.autoCheck));
el.autoCheck.addEventListener('click', () => {
  game.autoCheck = !game.autoCheck;
  try { localStorage.setItem(CHECK_KEY, game.autoCheck ? 'on' : 'off'); } catch { /* 무시 */ }
  el.autoCheck.setAttribute('aria-pressed', String(game.autoCheck));
  Sound.play('click');
  if (game.board) paint();
});

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

function bindSoundToggle(node, key, apply2) {
  node.setAttribute('aria-pressed', String(Sound.prefs[key]));
  node.addEventListener('click', () => {
    const on = !Sound.prefs[key];
    apply2(on);
    node.setAttribute('aria-pressed', String(on));
    Sound.play('click');
  });
}

bindSoundToggle(el.toggleBgm, 'bgm', (on) => Sound.setBgm(on));
bindSoundToggle(el.toggleSfx, 'sfx', (on) => Sound.setSfx(on));

window.SharedIcons.paint();
buildSizePicker();
showBest();
newGame();

})();

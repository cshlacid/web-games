'use strict';

(function () {

const R = window.QueensRules;
const G = window.QueensGenerator;
const Icons = window.QueensIcons;
const Sound = window.QueensSound;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 바깥 테두리 선의 중심이 놓이는 자리(칸 하나를 1로 센 좌표). 안쪽 경계선도 판
// 가장자리에서는 여기까지만 긋는다.
const EDGE_INSET = 0.05;

const SIZE_KEY = 'web-games.queens.size';
const BEST_KEY = 'web-games.queens.best';
const CHECK_KEY = 'web-games.queens.autocheck';

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
  drawn: null,
  history: [],
  lit: null,
  cursor: null,
  elapsed: 0,
  running: false,
  hinted: 0,
  done: false,
  dragging: false,
  dragValue: null,
  dragLast: -1,
};

function loadSize() {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY));
    if (G.SIZES.includes(saved)) return saved;
  } catch { /* 저장된 값이 없거나 접근 불가 */ }
  return 7;
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
  el.best.textContent = best ? `최고 ${formatTime(best)}` : '';
}

function toast(text) {
  el.toast.textContent = text;
}

// --- 판 그리기 ---

function line(x1, y1, x2, y2) {
  const node = document.createElementNS(SVG_NS, 'line');
  node.setAttribute('x1', x1);
  node.setAttribute('y1', y1);
  node.setAttribute('x2', x2);
  node.setAttribute('y2', y2);
  return node;
}

function buildBoard() {
  const size = game.size;
  const regions = game.board.regions;
  el.board.style.setProperty('--cols', size);
  el.board.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
  el.board.classList.remove('done');
  el.board.replaceChildren();
  game.cells = [];
  game.drawn = new Int8Array(size * size).fill(-1);

  for (let cell = 0; cell < size * size; cell++) {
    const node = document.createElement('div');
    node.className = `cell rg${regions[cell]}`;
    node.dataset.cell = String(cell);
    el.board.appendChild(node);
    game.cells.push(node);
  }

  // 영역 경계는 칸 배경색만으로는 약하다 — 비슷한 밝기의 아홉 색을 쓰기 때문에
  // 어디까지가 한 영역인지 색만 보고 가르기 어렵다. 선을 칸 위에 겹쳐 긋는다.
  // viewBox를 칸 수로 잡아 두면 판 크기가 달라져도 좌표를 다시 계산할 일이 없다.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'edges');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  // 선 끝을 둥글게 마감하므로 끝점 너머로 굵기의 절반만큼 반원이 더 나간다.
  // 판 가장자리에 닿는 세로·가로선을 칸 경계(0이나 size)에서 끊으면 그 반원이
  // 바깥 테두리 밖으로 삐져나온다. 대신 **바깥 테두리 선의 한가운데**에서
  // 끊고 테두리를 맨 나중에 덧그린다 — 반원이 테두리 선 굵기 안에 정확히
  // 들어가므로 굵기를 바꿔도 이 관계가 유지된다.
  const stop = (v) => (v <= 0 ? EDGE_INSET : v >= size ? size - EDGE_INSET : v);

  for (let cell = 0; cell < size * size; cell++) {
    const r = Math.floor(cell / size);
    const c = cell % size;
    if (c < size - 1 && regions[cell] !== regions[cell + 1]) {
      svg.appendChild(line(c + 1, stop(r), c + 1, stop(r + 1)));
    }
    if (r < size - 1 && regions[cell] !== regions[cell + size]) {
      svg.appendChild(line(stop(c), r + 1, stop(c + 1), r + 1));
    }
  }

  const outline = document.createElementNS(SVG_NS, 'rect');
  outline.setAttribute('x', EDGE_INSET);
  outline.setAttribute('y', EDGE_INSET);
  outline.setAttribute('width', size - EDGE_INSET * 2);
  outline.setAttribute('height', size - EDGE_INSET * 2);
  outline.setAttribute('rx', 0.12);
  svg.appendChild(outline);

  el.board.appendChild(svg);
}

function paint() {
  const marks = game.state.marks;
  const bad = new Set(game.autoCheck ? R.conflicts(game.board, game.state) : []);

  game.cells.forEach((node, cell) => {
    if (game.drawn[cell] !== marks[cell]) {
      node.innerHTML = marks[cell] === R.CROWN ? Icons.svg('crown')
        : marks[cell] === R.MARK ? Icons.svg('mark') : '';
      game.drawn[cell] = marks[cell];
    }
    node.classList.toggle('bad', bad.has(cell));
    node.classList.toggle('lit', game.lit !== null && game.lit.has(cell));
    node.classList.toggle('cursor', game.cursor === cell);
  });

  const touched = marks.some((value) => value !== R.EMPTY);
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
  const next = (game.state.marks[cell] + 1) % 3;
  apply([[cell, next]]);
  startClock();
  clearLit();

  if (next === R.CROWN) {
    const clashing = game.autoCheck
      && R.conflicts(game.board, game.state).includes(cell);
    Sound.play(clashing ? 'clash' : 'crown');
  } else {
    Sound.play(next === R.MARK ? 'mark' : 'erase');
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
    if (game.state.marks[cell] !== R.EMPTY) changes.push([cell, R.EMPTY]);
  }
  if (!apply(changes)) return;
  clearLit();
  Sound.play('erase');
  paint();
}

// 힌트는 어긋난 왕관을 걷어 내고 한 자리를 짚는다. 짚는 자리는 정답에서 아무
// 데나 고르는 것이 아니라 **생성기가 남긴 논리 풀이 순서의 앞쪽**이다 —
// 지금 이 판에서 사람이 다음으로 알아낼 수 있는 자리라야 힌트가 배움이 된다.
function hint() {
  if (game.done) return;
  const size = game.size;
  const answer = new Set(game.puzzle.solution.map((c, r) => r * size + c));

  const changes = [];
  for (let cell = 0; cell < game.board.n; cell++) {
    if (game.state.marks[cell] === R.CROWN && !answer.has(cell)) changes.push([cell, R.EMPTY]);
  }
  const removed = changes.length;

  const next = game.puzzle.order.find((cell) => game.state.marks[cell] !== R.CROWN);
  if (next !== undefined) changes.push([next, R.CROWN]);

  apply(changes);
  game.hinted++;
  game.lit = next === undefined ? null
    : new Set(game.board.regionCells[game.board.regions[next]]);
  startClock();
  Sound.play('hint');
  paint();
  toast(removed
    ? `어긋난 왕관 ${removed}개를 걷어 내고 다음 자리를 짚었습니다.`
    : '지금 알아낼 수 있는 영역에 왕관을 놓았습니다.');
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
  let note = `${game.size}×${game.size}, 영역 ${game.size}개.`;
  if (game.hinted) {
    note += ` 힌트를 ${game.hinted}번 썼으니 기록은 남기지 않습니다.`;
  } else if (!previous || game.elapsed < previous) {
    best[game.size] = game.elapsed;
    saveBest(best);
    note += previous ? ` 최고 기록을 ${formatTime(previous)}에서 줄였습니다.` : ' 첫 기록입니다.';
    showBest();
  } else {
    note += ` 최고 기록은 ${formatTime(previous)}입니다.`;
  }

  el.resultTitle.textContent = `완성! ${formatTime(game.elapsed)}`;
  el.resultNote.textContent = note;
  el.result.hidden = false;
}

// --- 판 만들기 ---

function newGame() {
  el.result.hidden = true;
  el.veil.hidden = false;
  toast('');
  // 9×9는 만드는 데 0.5초가 걸리기도 한다. 가림막이 먼저 그려지도록 한 프레임
  // 뒤로 미룬다 — 바로 만들면 화면이 멈춘 채로 아무 표시가 없다.
  requestAnimationFrame(() => setTimeout(() => {
    const puzzle = G.generate(game.size) || G.generate(game.size);
    if (!puzzle) {
      el.veil.hidden = true;
      toast('판을 만들지 못했습니다. 새 판을 눌러 다시 시도해 주세요.');
      return;
    }
    game.puzzle = puzzle;
    game.board = R.board(puzzle);
    game.state = R.reset(game.board, R.newState(game.board));
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

function cellAt(x, y) {
  const node = document.elementFromPoint(x, y);
  const cell = node && node.closest ? node.closest('.cell') : null;
  if (!cell || !el.board.contains(cell)) return null;
  return Number(cell.dataset.cell);
}

el.board.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const cell = cellAt(e.clientX, e.clientY);
  if (cell === null) return;
  game.dragging = true;
  game.dragLast = cell;
  el.board.setPointerCapture(e.pointerId);
  const next = touch(cell);
  // 끌어서 칠할 수 있는 것은 X와 지우개뿐이다. 왕관을 끌어 놓게 두면 손가락이
  // 지나간 줄이 통째로 규칙 위반이 되고, 그걸 되돌리는 것이 일이 된다.
  game.dragValue = next === R.MARK ? R.MARK : next === R.EMPTY ? R.EMPTY : null;
});

el.board.addEventListener('pointermove', (e) => {
  if (!game.dragging || game.dragValue === null || game.done) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (cell === null || cell === game.dragLast) return;
  game.dragLast = cell;
  const now = game.state.marks[cell];
  // 칠하는 중에 남의 왕관을 건드리지 않는다.
  if (game.dragValue === R.MARK && now !== R.EMPTY) return;
  if (game.dragValue === R.EMPTY && now !== R.MARK) return;
  if (!apply([[cell, game.dragValue]])) return;
  startClock();
  clearLit();
  Sound.play(game.dragValue === R.MARK ? 'mark' : 'erase');
  paint();
});

for (const name of ['pointerup', 'pointercancel']) {
  el.board.addEventListener(name, () => {
    game.dragging = false;
    game.dragValue = null;
    game.dragLast = -1;
  });
}

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

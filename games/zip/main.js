'use strict';

(function () {

const R = window.ZipRules;
const G = window.ZipGenerator;
const Sound = window.ZipSound;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SIZE_KEY = 'web-games.zip.size';
const BEST_KEY = 'web-games.zip.best';

const el = {
  sizes: document.getElementById('sizes'),
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
  puzzle: null,
  board: null,
  state: null,
  cells: [],
  trail: null,
  head: null,
  elapsed: 0,
  running: false,
  hinted: 0,
  done: false,
  dragging: false,
};

function loadSize() {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY));
    if (G.SIZES.includes(saved)) return saved;
  } catch { /* 저장된 값이 없거나 접근 불가 */ }
  return 6;
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

// --- 판 그리기 ---

function line(cls, x1, y1, x2, y2) {
  const node = document.createElementNS(SVG_NS, 'line');
  node.setAttribute('class', cls);
  node.setAttribute('x1', x1);
  node.setAttribute('y1', y1);
  node.setAttribute('x2', x2);
  node.setAttribute('y2', y2);
  return node;
}

function buildBoard() {
  const size = game.size;
  el.board.style.setProperty('--cols', size);
  el.board.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
  el.board.replaceChildren();
  game.cells = [];

  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.cell = String(i);
    const num = game.board.order[i];
    if (num) {
      const badge = document.createElement('span');
      badge.className = 'num';
      badge.textContent = String(num);
      cell.appendChild(badge);
      if (num === 1) cell.classList.add('start');
    }
    el.board.appendChild(cell);
    game.cells.push(cell);
  }

  // 선과 벽은 칸 위에 겹쳐 긋는다. viewBox를 칸 수로 잡아 두면 판 크기가 달라져도
  // 좌표를 다시 계산할 일이 없다 — 한 칸이 곧 1이다.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ink');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  for (const edge of game.puzzle.walls) {
    const a = Math.floor(edge / 4096);
    const b = edge % 4096;
    const r = Math.floor(a / size);
    const c = a % size;
    if (b === a + 1) svg.appendChild(line('wall', c + 1, r + 0.08, c + 1, r + 0.92));
    else svg.appendChild(line('wall', c + 0.08, r + 1, c + 0.92, r + 1));
  }

  game.trail = document.createElementNS(SVG_NS, 'polyline');
  game.trail.setAttribute('class', 'trail');
  svg.appendChild(game.trail);

  // 선 끝을 표시하는 점. 선 위에 얹어야 하므로 선보다 뒤에 붙인다.
  game.head = document.createElementNS(SVG_NS, 'circle');
  game.head.setAttribute('class', 'head');
  game.head.setAttribute('r', '0.13');
  svg.appendChild(game.head);

  el.board.appendChild(svg);
}

function paint() {
  const size = game.size;
  const path = game.state.path;
  const on = new Set(path);
  game.cells.forEach((cell, i) => cell.classList.toggle('on', on.has(i)));

  const points = path.map((cell) => `${(cell % size) + 0.5},${Math.floor(cell / size) + 0.5}`);
  game.trail.setAttribute('points', points.join(' '));

  // SVG에는 HTML의 hidden이 듣지 않는다(브라우저 기본 스타일시트가 HTML 요소에만
  // 건다). 숨길 때는 visibility를 직접 준다 — 안 그러면 좌표 없는 점이 판 왼쪽
  // 위 구석에 찍힌다.
  if (path.length) {
    const last = path[path.length - 1];
    game.head.setAttribute('cx', (last % size) + 0.5);
    game.head.setAttribute('cy', Math.floor(last / size) + 0.5);
    game.head.setAttribute('visibility', 'visible');
  } else {
    game.head.setAttribute('visibility', 'hidden');
  }

  el.undo.disabled = game.done || path.length === 0;
  el.clear.disabled = game.done || path.length === 0;
  el.hint.disabled = game.done;
}

// --- 시계 ---

function startClock() {
  if (game.running || game.done) return;
  game.running = true;
}

function stopClock() {
  game.running = false;
}

setInterval(() => {
  if (!game.running || game.done) return;
  game.elapsed += 1;
  el.timer.textContent = formatTime(game.elapsed);
}, 1000);

// --- 조작 ---

function cellAt(x, y) {
  const node = document.elementFromPoint(x, y);
  const cell = node && node.closest ? node.closest('.cell') : null;
  if (!cell || !el.board.contains(cell)) return null;
  return Number(cell.dataset.cell);
}

// 한 칸씩 잇는다. 끌다가 손가락이 빨라 칸을 건너뛰면 같은 줄에 있는 사이 칸들을
// 대신 채운다 — 이게 없으면 빨리 그을수록 선이 자꾸 끊긴다.
function stepsTo(from, target) {
  const size = game.size;
  const steps = [];
  const fromRow = Math.floor(from / size);
  const targetRow = Math.floor(target / size);
  if (fromRow === targetRow) {
    const dir = Math.sign(target - from);
    for (let cell = from + dir; cell !== target + dir; cell += dir) steps.push(cell);
  } else if (from % size === target % size) {
    const dir = Math.sign(targetRow - fromRow) * size;
    for (let cell = from + dir; cell !== target + dir; cell += dir) steps.push(cell);
  }
  return steps;
}

function visit(target) {
  if (target === null || game.done) return;
  const { board, state } = game;
  const path = state.path;

  const here = path.indexOf(target);
  if (here >= 0) {
    // 되짚기: 지나온 칸을 다시 만나면 거기까지만 남긴다.
    if (here === path.length - 1) return;
    while (path.length > here + 1) R.pop(board, state);
    Sound.play('back');
    paint();
    return;
  }

  if (!path.length) {
    if (R.push(board, state, target)) { startClock(); Sound.play('step', 0); paint(); }
    return;
  }

  const steps = stepsTo(path[path.length - 1], target);
  let moved = false;
  for (const cell of steps) {
    if (!R.push(board, state, cell)) break;
    moved = true;
  }
  if (!moved) return;
  startClock();
  Sound.play('step', path.length / board.n);
  paint();
  finishIfDone();
}

function finishIfDone() {
  if (!R.isDone(game.board, game.state)) return;
  game.done = true;
  stopClock();
  paint();
  Sound.play('win');

  const best = loadBest();
  const previous = best[game.size];
  let note = `${game.size}×${game.size}, ${game.puzzle.hints.length}개의 숫자.`;
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

function undo() {
  if (game.done || !game.state.path.length) return;
  R.pop(game.board, game.state);
  Sound.play('back');
  paint();
}

function clearPath() {
  if (game.done || !game.state.path.length) return;
  R.reset(game.board, game.state);
  Sound.play('back');
  paint();
}

// 힌트는 정답과 어긋난 곳까지 지우고 한 칸을 놓아 준다. 답이 하나뿐인 판이라
// 생성기가 들고 있는 경로가 곧 유일한 정답이고, 그래서 "어긋난 곳"을 정답과
// 한 칸씩 맞춰 보는 것만으로 찾을 수 있다.
function hint() {
  if (game.done) return;
  const { board, state, puzzle } = game;
  let same = 0;
  while (same < state.path.length && state.path[same] === puzzle.solution[same]) same++;
  const trimmed = state.path.length - same;
  while (state.path.length > same) R.pop(board, state);
  R.push(board, state, puzzle.solution[state.path.length]);
  game.hinted++;
  startClock();
  Sound.play('hint');
  paint();
  toast(trimmed ? `어긋난 ${trimmed}칸을 지우고 다음 칸을 놓았습니다.` : '다음 칸을 놓았습니다.');
  finishIfDone();
}

function toast(text) {
  el.toast.textContent = text;
}

// --- 판 만들기 ---

function newGame() {
  el.result.hidden = true;
  el.veil.hidden = false;
  toast('');
  // 8×8은 만드는 데 1초를 넘기기도 한다. 가림막이 먼저 그려지도록 한 프레임 뒤로
  // 미룬다 — 바로 만들면 화면이 멈춘 채로 아무 표시가 없다.
  requestAnimationFrame(() => setTimeout(() => {
    const puzzle = G.generate(game.size) || G.generate(game.size);
    if (!puzzle) {
      el.veil.hidden = true;
      toast('판을 만들지 못했습니다. 새 판을 눌러 다시 시도해 주세요.');
      return;
    }
    game.puzzle = puzzle;
    game.board = R.board(puzzle);
    game.state = R.reset(game.board, R.newState());
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

// --- 배선 ---

el.board.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  game.dragging = true;
  el.board.setPointerCapture(e.pointerId);
  visit(cellAt(e.clientX, e.clientY));
});

el.board.addEventListener('pointermove', (e) => {
  if (!game.dragging) return;
  visit(cellAt(e.clientX, e.clientY));
});

for (const name of ['pointerup', 'pointercancel']) {
  el.board.addEventListener(name, () => { game.dragging = false; });
}

const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

document.addEventListener('keydown', (e) => {
  if (!game.board) return;
  if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
  if (e.key === 'Escape') { clearPath(); return; }
  const move = ARROWS[e.key];
  if (!move) return;
  e.preventDefault();
  const path = game.state.path;
  if (!path.length) { visit(game.puzzle.hints[0]); return; }
  const from = path[path.length - 1];
  const row = Math.floor(from / game.size) + move[0];
  const col = (from % game.size) + move[1];
  if (row < 0 || col < 0 || row >= game.size || col >= game.size) return;
  visit(row * game.size + col);
});

el.undo.addEventListener('click', undo);
el.clear.addEventListener('click', clearPath);
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

window.SharedIcons.paint();
buildSizePicker();
showBest();
newGame();

})();

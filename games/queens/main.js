'use strict';

(function () {

const R = window.QueensRules;
const G = window.QueensGenerator;
const Icons = window.QueensIcons;
const Sound = window.QueensSound;
const SVG_NS = 'http://www.w3.org/2000/svg';

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

function buildBoard() {
  const size = game.size;
  const regions = game.board.regions;
  el.board.style.setProperty('--cols', size);
  el.board.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
  el.board.classList.remove('done');
  el.board.replaceChildren();
  game.cells = [];

  // **그림을 둘 다 넣어 두고 감춘다.** 예전에는 칸이 바뀔 때마다 innerHTML을 갈아
  // 끼웠는데, 그러면 손가락 밑의 요소가 그 자리에서 사라진다. 사라진 요소에서
  // 시작한 두드림은 뒤이은 터치 이벤트가 문서까지 올라오지 않아, 더블 탭을
  // 가로채는 공용 처리기(`shared/base.js`)가 이 게임에서만 듣지 못했다.
  for (let cell = 0; cell < size * size; cell++) {
    const node = document.createElement('div');
    node.className = `cell rg${regions[cell]}`;
    node.dataset.cell = String(cell);
    node.innerHTML = Icons.svg('mark') + Icons.svg('crown');
    el.board.appendChild(node);
    game.cells.push(node);
  }

  // 영역 경계는 칸 배경색만으로는 약하다 — 비슷한 밝기의 아홉 색을 쓰기 때문에
  // 어디까지가 한 영역인지 색만 보고 가르기 어렵다. 선을 칸 위에 겹쳐 긋는다.
  // viewBox를 칸 수로 잡아 두면 판 크기가 달라져도 좌표를 다시 계산할 일이 없다.
  //
  // **칸 구분선(얇은 흰 선)도 여기서 함께 긋는다.** 예전에는 칸마다 box-shadow로
  // 그었는데, 칸은 배치 엔진이 기기 픽셀에 맞춰 반올림해 칠하고 이 SVG는 소수점
  // 좌표 그대로 그린다. 그 어긋남 때문에 굵은 경계선이 흰 선보다 오른쪽 아래로
  // 반 픽셀쯤 밀려 보였다(9×9에서 실측 0.74·0.45 기기픽셀). 둘을 같은 좌표계에
  // 두면 어긋날 자리가 없다.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'edges');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  // 계산된 굵기를 읽으려면 먼저 붙어 있어야 한다.
  el.board.appendChild(svg);

  // **바깥 테두리는 굵기의 절반만큼 들여 두른다.** 들이는 양을 굵기와 따로 정해
  // 두면 둘이 어긋나 칸 색이 테두리 밖으로 새거나(모서리에 1픽셀 자국이 남았다)
  // 테두리가 칸을 덮는다. 절반만큼 들이면 테두리 바깥면이 칸 경계에 정확히 닿는다.
  // 굵기는 CSS가 정하므로 여기서 읽어 온다.
  const outline = document.createElementNS(SVG_NS, 'rect');
  outline.setAttribute('class', 'region');
  svg.appendChild(outline);
  const inset = parseFloat(getComputedStyle(outline).strokeWidth) / 2;

  // 선 끝은 굵기의 절반만큼 더 나간다(`stroke-linecap: square`). 판 가장자리에
  // 닿는 선을 칸 경계(0이나 size)에서 끊으면 그만큼 테두리 밖으로 삐져나오므로
  // **테두리 선의 한가운데**에서 끊는다 — 튀어나온 만큼이 테두리 굵기 안에 든다.
  const stop = (v) => (v <= 0 ? inset : v >= size ? size - inset : v);

  const grid = [];
  for (let k = 1; k < size; k++) {
    grid.push(`M${k} ${stop(0)}L${k} ${stop(size)}`);
    grid.push(`M${stop(0)} ${k}L${stop(size)} ${k}`);
  }

  // 이어지는 경계는 한 구간으로 잇는다. 칸마다 토막을 내면 토막의 경계마다
  // 반투명한 가장자리가 겹쳐 이음매가 옅은 자국으로 보인다.
  const edges = [];
  for (let c = 1; c < size; c++) {
    let from = null;
    for (let r = 0; r <= size; r++) {
      const cut = r < size && regions[r * size + c - 1] !== regions[r * size + c];
      if (cut && from === null) from = r;
      if (!cut && from !== null) { edges.push(`M${c} ${stop(from)}L${c} ${stop(r)}`); from = null; }
    }
  }
  for (let r = 1; r < size; r++) {
    let from = null;
    for (let c = 0; c <= size; c++) {
      const cut = c < size && regions[(r - 1) * size + c] !== regions[r * size + c];
      if (cut && from === null) from = c;
      if (!cut && from !== null) { edges.push(`M${stop(from)} ${r}L${stop(c)} ${r}`); from = null; }
    }
  }

  // 구간을 전부 한 path에 담는 것도 이음매 때문이다. 요소를 나누면 겹치는 자리가
  // 따로따로 그려져 섞이지만, 한 path는 통째로 한 번에 칠해진다.
  for (const [cls, parts] of [['grid', grid], ['region', edges]]) {
    if (!parts.length) continue;
    const node = document.createElementNS(SVG_NS, 'path');
    node.setAttribute('class', cls);
    node.setAttribute('d', parts.join(''));
    // 테두리는 맨 위에 남는다 — 가장자리에서 끊은 선의 끝을 덮어야 한다.
    svg.insertBefore(node, outline);
  }

  outline.setAttribute('x', inset);
  outline.setAttribute('y', inset);
  outline.setAttribute('width', size - inset * 2);
  outline.setAttribute('height', size - inset * 2);
  // 모서리는 네모다. 둥글게 두면 네모난 칸과 곡률이 어긋나 그 사이로 칸 색이 한
  // 픽셀 비어져 나온다 — 판의 `border-radius`를 없앤 것도 같은 이유다.
}

function paint() {
  const marks = game.state.marks;
  const bad = new Set(game.autoCheck ? R.conflicts(game.board, game.state) : []);

  game.cells.forEach((node, cell) => {
    node.classList.toggle('marked', marks[cell] === R.MARK);
    node.classList.toggle('crowned', marks[cell] === R.CROWN);
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

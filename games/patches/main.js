'use strict';

(function () {

const R = window.PatchesRules;
const G = window.PatchesGenerator;
const Icons = window.PatchesIcons;
const Sound = window.PatchesSound;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SIZE_KEY = 'web-games.patches.size';
const BEST_KEY = 'web-games.patches.best';

// 조각 색의 가짓수. `--pc0`~`--pc8`과 맞춘다.
const PALETTE = 9;

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
  colors: [],
  ink: null,
  history: [],
  drag: null,
  anchor: null,
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

function toast(text) { el.toast.textContent = text; }

const key = (rect) => `${rect.r},${rect.c},${rect.w},${rect.h}`;

// --- 판 그리기 ---

// **단서는 언제나 테두리를 두른다.** 모양을 알려 주지 않는 단서는 점선으로 두른다 —
// 테두리를 아예 빼면 "모양이 자유"라는 것과 "여기 단서가 있다"가 같은 빈칸으로
// 보인다. 숫자는 알 때만 그 안에 얹는다.
function clueMarkup(clue) {
  const parts = [Icons.svg(clue.shape || 'free')];
  if (clue.area !== null) parts.push(`<span class="clue-num">${clue.area}</span>`);
  return `<span class="clue">${parts.join('')}</span>`;
}

function node(name, cls) {
  const created = document.createElementNS(SVG_NS, name);
  created.setAttribute('class', cls);
  return created;
}

function buildBoard() {
  const size = game.size;
  el.board.style.setProperty('--cols', size);
  el.board.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
  el.board.replaceChildren();
  game.cells = [];

  for (let cell = 0; cell < size * size; cell++) {
    const box = document.createElement('div');
    box.className = 'cell';
    box.dataset.cell = String(cell);
    const at = game.board.clueAt[cell];
    if (at !== -1) box.innerHTML = clueMarkup(game.board.clues[at]);
    el.board.appendChild(box);
    game.cells.push(box);
  }

  // 칸 구분선과 조각 테두리를 같은 SVG에 함께 긋는다. 칸은 배치 엔진이 기기
  // 픽셀에 맞춰 반올림해 칠하고 SVG는 소수점 좌표 그대로 그리므로, 구분선을
  // 칸의 box-shadow로 두면 조각 테두리가 그보다 밀려 보인다.
  const svg = node('svg', 'ink');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  // 계산된 굵기를 읽으려면 먼저 붙어 있어야 한다.
  el.board.appendChild(svg);

  // **바깥 테두리는 굵기의 절반만큼 들여 두른다.** 들이는 양을 굵기와 따로 정해
  // 두면 둘이 어긋나 칸 색이 테두리 밖으로 새거나(모서리에 1픽셀 자국이 남았다)
  // 테두리가 칸을 덮는다. 절반만큼 들이면 테두리 바깥면이 칸 경계에 정확히 닿는다.
  // 굵기는 CSS가 정하므로 여기서 읽어 온다.
  const frame = node('rect', 'frame');
  svg.appendChild(frame);
  const inset = parseFloat(getComputedStyle(frame).strokeWidth) / 2;

  // 선 끝은 굵기의 절반만큼 더 나간다(`stroke-linecap: square`). 판 가장자리에
  // 닿는 선을 칸 경계에서 끊으면 그만큼 테두리 밖으로 삐져나오므로 테두리 선의
  // 한가운데에서 끊는다.
  const stop = (v) => (v <= 0 ? inset : v >= size ? size - inset : v);
  const grid = [];
  for (let k = 1; k < size; k++) {
    grid.push(`M${k} ${stop(0)}L${k} ${stop(size)}`);
    grid.push(`M${stop(0)} ${k}L${stop(size)} ${k}`);
  }
  const gridPath = node('path', 'grid');
  gridPath.setAttribute('d', grid.join(''));
  svg.insertBefore(gridPath, frame);

  // 조각 테두리는 판이 바뀔 때마다 다시 그린다. 요소를 나누면 겹치는 자리가
  // 따로따로 칠해져 이음매가 자국으로 남으므로 종류마다 path 하나에 담는다.
  game.ink = {
    patch: node('path', 'patch'),
    wrong: node('path', 'wrong'),
    ghost: node('rect', 'ghost'),
    cursor: node('rect', 'cursor'),
  };
  // 조각 테두리는 바깥 테두리 아래에 둔다 — 가장자리에서 끊은 끝을 덮어야 한다.
  svg.insertBefore(game.ink.patch, frame);
  svg.insertBefore(game.ink.wrong, frame);

  frame.setAttribute('x', inset);
  frame.setAttribute('y', inset);
  frame.setAttribute('width', size - inset * 2);
  frame.setAttribute('height', size - inset * 2);
  // 모서리는 둥글게 두지 않는다. 판이 `overflow: hidden`으로 둥글게 잘라 주므로
  // 여기서 또 둥글게 하면 두 곡률이 미묘하게 어긋나 그 사이로 네모난 칸의 색이
  // 한 픽셀 비어져 나온다. 네모로 두면 테두리가 모서리를 끝까지 덮고, 둥근 모양은
  // 판의 잘림이 만든다.

  svg.appendChild(game.ink.cursor);
  svg.appendChild(game.ink.ghost);
}

function outline(rect) {
  const { r, c, w, h } = rect;
  return `M${c} ${r}L${c + w} ${r}L${c + w} ${r + h}L${c} ${r + h}Z`;
}

function placeRect(target, rect, inset) {
  if (!rect) { target.setAttribute('visibility', 'hidden'); return; }
  target.setAttribute('x', rect.c + inset);
  target.setAttribute('y', rect.r + inset);
  target.setAttribute('width', rect.w - inset * 2);
  target.setAttribute('height', rect.h - inset * 2);
  target.setAttribute('rx', 0.08);
  target.setAttribute('visibility', 'visible');
}

function paint() {
  const { board: b, state } = game;
  const marks = R.faults(b, state);

  const tint = new Int32Array(b.n).fill(-1);
  state.patches.forEach((rect, i) => {
    const found = R.cluesIn(b, rect);
    const color = found.length === 1 ? game.colors[found[0]] : -1;
    for (const cell of R.cells(b.size, rect)) tint[cell] = marks[i] === null || found.length === 1 ? color : -1;
  });

  game.cells.forEach((box, cell) => {
    const covered = state.cover[cell] !== -1;
    for (let i = 0; i < PALETTE; i++) box.classList.toggle(`pc${i}`, tint[cell] === i);
    box.classList.toggle('stray', covered && tint[cell] === -1);
  });

  const good = [];
  const wrong = [];
  state.patches.forEach((rect, i) => (marks[i] === null ? good : wrong).push(outline(rect)));
  game.ink.patch.setAttribute('d', good.join(''));
  game.ink.wrong.setAttribute('d', wrong.join(''));

  placeRect(game.ink.ghost, game.drag ? spanOf(game.drag.from, game.drag.to) : null, 0.04);
  placeRect(game.ink.cursor,
    game.cursor === null ? null : spanOf(game.anchor === null ? game.cursor : game.anchor, game.cursor),
    0.09);

  el.undo.disabled = game.done || game.history.length === 0;
  el.clear.disabled = game.done || state.patches.length === 0;
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

// --- 조각 놓기 ---

function spanOf(from, to) {
  const size = game.size;
  const r1 = Math.floor(from / size);
  const c1 = from % size;
  const r2 = Math.floor(to / size);
  const c2 = to % size;
  return {
    r: Math.min(r1, r2),
    c: Math.min(c1, c2),
    w: Math.abs(c1 - c2) + 1,
    h: Math.abs(r1 - r2) + 1,
  };
}

function remember() {
  game.history.push(game.state.patches.map((rect) => ({ ...rect })));
}

function restore(patches) {
  game.state.patches = patches;
  R.recover(game.board, game.state);
}

function commit(from, to) {
  if (game.done) return;
  const rect = spanOf(from, to);

  // 톡 누르면 그 자리의 조각을 지운다. 지우려고 다시 같은 크기로 그리게 하면
  // 손이 두 번 간다.
  if (rect.w === 1 && rect.h === 1 && game.state.cover[from] !== -1) {
    remember();
    R.removeAt(game.board, game.state, from);
    Sound.play('erase');
    paint();
    return;
  }

  remember();
  R.add(game.board, game.state, rect);
  startClock();
  // 조각이 클수록 낮은 음이 난다 — 몇 칸을 덮었는지가 소리로도 들린다.
  Sound.play(R.faultOf(game.board, rect) === null ? 'draw' : 'wrong', rect.w * rect.h);
  paint();
  finishIfDone();
}

function undo() {
  if (game.done || !game.history.length) return;
  restore(game.history.pop());
  Sound.play('erase');
  paint();
}

function clearBoard() {
  if (game.done || !game.state.patches.length) return;
  remember();
  restore([]);
  Sound.play('erase');
  paint();
}

// 힌트는 어긋난 조각을 걷어 내고 한 조각을 놓아 준다. 놓는 조각은 정답에서 아무
// 거나 고르는 것이 아니라 **생성기가 남긴 논리 풀이 순서의 앞쪽**이다 — 지금 이
// 판에서 사람이 다음으로 알아낼 수 있는 조각이라야 힌트가 배움이 된다.
function hint() {
  if (game.done) return;
  const answer = new Set(game.puzzle.solution.map(key));

  remember();
  const kept = game.state.patches.filter((rect) => answer.has(key(rect)));
  const removed = game.state.patches.length - kept.length;
  restore(kept);

  const placed = new Set(kept.map(key));
  const next = game.puzzle.order.find((rect) => !placed.has(key(rect)));
  if (next) R.add(game.board, game.state, next);

  game.hinted++;
  startClock();
  Sound.play('hint');
  paint();
  toast(removed
    ? `어긋난 조각 ${removed}개를 걷어 내고 다음 조각을 놓았습니다.`
    : '지금 알아낼 수 있는 조각을 놓았습니다.');
  finishIfDone();
}

function finishIfDone() {
  if (!R.isDone(game.board, game.state)) return;
  game.done = true;
  game.running = false;
  game.cursor = null;
  game.anchor = null;
  paint();
  Sound.play('win');

  const best = loadBest();
  const previous = best[game.size];
  let note = `${game.size}×${game.size}, 조각 ${game.puzzle.solution.length}개.`;
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
  // 가림막이 먼저 그려지도록 한 프레임 뒤로 미룬다.
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
    game.colors = R.colorize(puzzle, PALETTE);
    game.history = [];
    game.drag = null;
    game.anchor = null;
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
  const found = document.elementFromPoint(x, y);
  const box = found && found.closest ? found.closest('.cell') : null;
  if (!box || !el.board.contains(box)) return null;
  return Number(box.dataset.cell);
}

el.board.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const cell = cellAt(e.clientX, e.clientY);
  if (cell === null || game.done) return;
  el.board.setPointerCapture(e.pointerId);
  game.drag = { from: cell, to: cell };
  game.cursor = null;
  game.anchor = null;
  paint();
});

el.board.addEventListener('pointermove', (e) => {
  if (!game.drag) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (cell === null || cell === game.drag.to) return;
  game.drag.to = cell;
  paint();
});

for (const name of ['pointerup', 'pointercancel']) {
  el.board.addEventListener(name, (e) => {
    if (!game.drag) return;
    const { from, to } = game.drag;
    game.drag = null;
    if (e.type === 'pointerup') commit(from, to);
    else paint();
  });
}

const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

document.addEventListener('keydown', (e) => {
  if (!game.board || game.done) return;
  if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
  if (e.key === 'Escape') {
    if (game.anchor !== null) { game.anchor = null; paint(); } else clearBoard();
    return;
  }
  // 한 번 눌러 귀퉁이를 찍고, 옮긴 뒤 다시 눌러 조각을 그린다. 키보드로는 끌
  // 수가 없으니 두 번에 나눈다.
  if (e.key === ' ' || e.key === 'Enter') {
    if (game.cursor === null) return;
    e.preventDefault();
    if (game.anchor === null) {
      game.anchor = game.cursor;
      Sound.play('click');
      paint();
    } else {
      const from = game.anchor;
      game.anchor = null;
      commit(from, game.cursor);
    }
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

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

function bindSoundToggle(button, name, apply) {
  button.setAttribute('aria-pressed', String(Sound.prefs[name]));
  button.addEventListener('click', () => {
    const on = !Sound.prefs[name];
    apply(on);
    button.setAttribute('aria-pressed', String(on));
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

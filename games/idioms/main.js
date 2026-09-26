'use strict';

(function () {

const R = window.IdiomsRules;
const S = window.IdiomsSolver;
const G = window.IdiomsGenerator;
// 성어는 언어마다 다르다. 뿌리가 한문 고전이라 겹치는 것이 많지만 칸에 들어가는
// 글자가 그 나라의 것이라 판을 나눠 쓸 수 없다(`words.js`).
const W = window.IdiomsWords.pick(SharedI18n.lang);
const Sound = window.IdiomsSound;
const t = SharedI18n.t;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SIZE_KEY = 'web-games.idioms.size';
const BEST_KEY = 'web-games.idioms.best';
// 한 판에 성어가 열두 개까지 오므로 색도 열둘이다. 모자라면 같은 색 길이 둘이
// 되어 어느 길이 어느 성어인지 눈으로 따라갈 수 없다.
const COLORS = 12;

const el = {
  sizes: document.getElementById('sizes'),
  best: document.getElementById('best'),
  timer: document.getElementById('timer'),
  board: document.getElementById('board'),
  veil: document.getElementById('veil'),
  toast: document.getElementById('toast'),
  found: document.getElementById('found'),
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
  ink: null,
  draft: [],
  dragging: false,
  // 톡 눌러 지우는 것과 끌어서 긋는 것을 가른다. 누른 칸이 이미 성어에 들어
  // 있으면 지우는 것이고, 그때는 길을 긋지 않는다.
  erasing: false,
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
  return 4;
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
  el.board.replaceChildren();
  game.cells = [];

  for (let cell = 0; cell < size * size; cell++) {
    const node = document.createElement('div');
    const wall = game.board.walls.has(cell);
    node.className = wall ? 'cell wall' : 'cell';
    node.dataset.cell = String(cell);
    // **글자를 갈아 끼우지 않는다.** 칸의 내용이 손가락 밑에서 바뀌면 그 요소에서
    // 시작한 두드림의 뒤이은 터치 이벤트가 문서까지 올라오지 않아, 더블 탭을
    // 가로채는 공용 처리기(`shared/base.js`)가 듣지 못한다.
    if (!wall) {
      const ch = document.createElement('span');
      ch.className = 'ch';
      ch.textContent = game.board.cells[cell];
      node.appendChild(ch);
    }
    el.board.appendChild(node);
    game.cells.push(node);
  }

  // 칸 구분선과 길을 한 SVG에 담는다. 칸은 배치 엔진이 기기 픽셀에 맞춰 반올림해
  // 칠하고 SVG는 소수점 좌표 그대로 그리므로, 둘을 섞어 그리면 길이 칸 가운데를
  // 벗어난다. viewBox를 칸 수로 잡아 두면 판 크기가 달라져도 좌표는 그대로다.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ink');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

  const grid = [];
  for (let k = 1; k < size; k++) {
    grid.push(`M${k} 0L${k} ${size}`);
    grid.push(`M0 ${k}L${size} ${k}`);
  }
  const lines = document.createElementNS(SVG_NS, 'path');
  lines.setAttribute('class', 'grid');
  lines.setAttribute('d', grid.join(''));
  svg.appendChild(lines);

  el.board.appendChild(svg);
  game.ink = svg;

  // 칸과 길이 같은 픽셀 격자에 놓이도록 판을 정수 자리에 앉힌다.
  window.SharedSnap.snap(el.board);
}

function middle(cell) {
  const size = game.size;
  return [(cell % size) + 0.5, Math.floor(cell / size) + 0.5];
}

function drawTrail(path, className) {
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('class', `trail ${className}`);
  line.setAttribute('points', path.map(middle).map(([x, y]) => `${x},${y}`).join(' '));
  game.ink.appendChild(line);

  const head = document.createElementNS(SVG_NS, 'circle');
  const [x, y] = middle(path[0]);
  head.setAttribute('class', `head ${className}`);
  head.setAttribute('cx', x);
  head.setAttribute('cy', y);
  head.setAttribute('r', '0.37');
  game.ink.appendChild(head);
}

function paint() {
  const state = game.state;
  const draft = new Set(game.draft);

  game.cells.forEach((node, cell) => {
    const at = state.cover[cell];
    for (let i = 0; i < COLORS; i++) node.classList.toggle(`w${i}`, at !== -1 && at % COLORS === i);
    node.classList.toggle('draft', draft.has(cell));
  });

  // 길은 통째로 다시 그린다. 지우고 다시 그리는 것이 어느 길이 사라졌는지 따지는
  // 것보다 짧고, 한 판에 길이 다섯 개뿐이라 값도 싸다.
  for (const old of [...game.ink.querySelectorAll('.trail, .head')]) old.remove();
  state.found.forEach((entry, i) => drawTrail(entry.path, `t${i % COLORS}`));
  if (game.draft.length > 1) drawTrail(game.draft, 'draft');

  el.undo.disabled = game.done || state.found.length === 0;
  el.clear.disabled = game.done || state.found.length === 0;
  el.hint.disabled = game.done;

  el.found.replaceChildren();
  state.found.forEach((entry, i) => {
    const li = document.createElement('li');
    const word = document.createElement('span');
    word.className = `word f${i % COLORS}`;
    word.textContent = entry.word;
    const mean = document.createElement('span');
    mean.className = 'mean';
    mean.textContent = W.MEANING[entry.word] || '';
    li.append(word, mean);
    el.found.appendChild(li);
  });
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

// --- 길 긋기 ---

function cellAt(x, y) {
  const node = document.elementFromPoint(x, y);
  const cell = node && node.closest ? node.closest('.cell') : null;
  if (!cell || !el.board.contains(cell)) return null;
  return Number(cell.dataset.cell);
}

// 힌트의 근거가 된 칸을 잠깐 밝힌다. 성어의 색이 칠해진 뒤라 테두리로 짚는다.
function flash(cell) {
  const node = game.cells[cell];
  if (!node) return;
  node.classList.add('hinted');
  setTimeout(() => node.classList.remove('hinted'), 1600);
}

function shake(cell) {
  const node = game.cells[cell];
  if (!node) return;
  node.classList.remove('bad');
  void node.offsetWidth; // 같은 애니메이션을 다시 트리거하려면 리플로우가 필요하다.
  node.classList.add('bad');
}

function visit(cell) {
  if (cell === null || game.done || game.erasing) return;
  const path = game.draft;

  // 되짚기: 바로 앞 칸을 다시 만나면 한 칸 무른다. 손가락이 흔들려 지나친 칸을
  // 처음부터 다시 긋지 않게 한다.
  if (path.length > 1 && cell === path[path.length - 2]) {
    path.pop();
    paint();
    return;
  }
  if (!R.canExtend(game.board, game.state, path, cell)) return;
  path.push(cell);
  startClock();
  Sound.play('step', Math.min(path.length - 1, 3));
  paint();
}

function finishDraft() {
  const path = game.draft;
  game.draft = [];
  if (!path.length || game.done) { paint(); return; }

  const result = R.commit(game.board, game.state, path);
  if (result.ok) {
    Sound.play('found');
    toast(`${result.word} — ${W.MEANING[result.word] || ''}`);
    paint();
    finishIfDone();
    return;
  }
  // 너무 짧은 것은 그냥 손을 뗀 것이라 나무라지 않는다.
  if (result.why !== 'short') {
    Sound.play('wrong');
    toast(t(`idioms.${result.why}`));
    shake(path[path.length - 1]);
  } else {
    toast('');
  }
  paint();
}

function removeAt(cell) {
  const gone = R.removeAt(game.board, game.state, cell);
  if (!gone) return false;
  Sound.play('erase');
  toast('');
  paint();
  return true;
}

function undo() {
  if (game.done || !game.state.found.length) return;
  const last = game.state.found[game.state.found.length - 1];
  removeAt(last.path[0]);
}

function clearBoard() {
  if (game.done || !game.state.found.length) return;
  R.reset(game.board, game.state);
  game.draft = [];
  Sound.play('erase');
  toast('');
  paint();
}

// 힌트는 정답에 없는 성어가 있으면 그것만 걷어 내고, 없으면 **지금 빈 칸만으로 반드시
// 들어가야 하는 성어** 하나를 놓으며 근거가 된 칸을 밝힌다(`solver.js`의 `next`). 정답의
// 앞쪽 성어를 주면 지금 판으로는 왜 그것인지 알 수 없다.
function hint() {
  if (game.done) return;
  const state = game.state;
  const answer = new Set(game.puzzle.solution.map((entry) => entry.word + entry.path.join()));
  let removed = 0;
  for (const entry of state.found.slice()) {
    if (answer.has(entry.word + entry.path.join())) continue;
    R.removeAt(game.board, state, entry.path[0]);
    removed++;
  }
  // 틀린 성어를 걷는 것만으로 한 번을 쓴다. 걷고 곧바로 놓으면 무엇이 틀렸는지가 묻힌다.
  if (removed) {
    game.draft = [];
    game.hinted++;
    startClock();
    Sound.play('hint');
    paint();
    toast(t('idioms.hintCleared', { count: removed }));
    return;
  }
  // 찾지 못할 일은 없어야 하지만(답이 하나뿐인 판) 막히면 정답에서 하나를 집는다.
  const next = S.next(game.board, state) || game.puzzle.solution.find((entry) =>
    !state.found.some((got) => got.word === entry.word));
  if (!next) return;

  R.commit(game.board, state, next.path);
  game.draft = [];
  game.hinted++;
  startClock();
  Sound.play('hint');
  paint();
  if (next.why) flash(next.why.cell);
  // 성어와 뜻은 사전이 아니라 자료에서 온다(`words.js`). 까닭 문장만 옮긴다 — 문장
  // 사이 빈칸도 언어마다 달라 사전이 정한다.
  const line = `${next.word} — ${W.MEANING[next.word] || ''}`;
  toast(next.why ? t(`idioms.why.${next.why.code}`, { line }) : line);
  finishIfDone();
}

function finishIfDone() {
  if (!R.isDone(game.board, game.state)) return;
  game.done = true;
  game.running = false;
  game.draft = [];
  paint();
  Sound.play('win');

  const best = loadBest();
  const previous = best[game.size];
  // 조각에 앞 공백을 넣어 두면 언어마다 빈칸 규칙이 달라 어긋난다 — 모아서 붙인다.
  const note = [t('idioms.note', { size: game.size, count: game.puzzle.solution.length })];
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
  SharedDailyUI.report('idioms', { size: game.size, time: game.elapsed, hints: game.hinted });
}

// --- 판 만들기 ---

function newGame() {
  el.result.hidden = true;
  el.veil.hidden = false;
  toast('');
  el.found.replaceChildren();
  // 가림막이 먼저 그려지도록 한 프레임 뒤로 미룬다 — 바로 만들면 화면이 멈춘 채로
  // 아무 표시가 없다.
  requestAnimationFrame(() => setTimeout(() => {
    const words = W.WORDS;
    const puzzle = G.generate(game.size, { words }) || G.generate(game.size, { words });
    if (!puzzle) {
      el.veil.hidden = true;
      toast(t('record.genFail'));
      return;
    }
    game.puzzle = puzzle;
    game.board = R.board(puzzle, W.WORDS);
    game.state = R.newState(game.board);
    game.draft = [];
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
  if (game.done) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (cell === null || game.board.walls.has(cell)) return;
  el.board.setPointerCapture(e.pointerId);
  game.dragging = true;
  // 이미 찾은 성어 위를 누르면 그걸 지우는 손짓이다. 길을 긋는 것과 겹치지 않게
  // 이 손짓 동안에는 긋기를 아예 끈다.
  game.erasing = game.state.cover[cell] !== -1;
  if (game.erasing) { removeAt(cell); return; }
  game.draft = [];
  visit(cell);
});

el.board.addEventListener('pointermove', (e) => {
  if (!game.dragging) return;
  visit(cellAt(e.clientX, e.clientY));
});

for (const name of ['pointerup', 'pointercancel']) {
  el.board.addEventListener(name, () => {
    if (!game.dragging) return;
    game.dragging = false;
    if (game.erasing) { game.erasing = false; return; }
    finishDraft();
  });
}

document.addEventListener('keydown', (e) => {
  if (!game.board || game.done) return;
  if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
  if (e.key === 'Escape') { clearBoard(); }
});

// --- 배선 ---

el.undo.addEventListener('click', undo);
el.clear.addEventListener('click', clearBoard);
el.hint.addEventListener('click', hint);
el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

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

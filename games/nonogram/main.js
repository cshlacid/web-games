'use strict';

// 화면과 조작. 규칙은 rules.js, 풀이기는 solver.js, 판 만들기는 generator.js가 들고
// 있고 여기서는 그것들을 부르고 그린다.
//
// **칸은 판을 만들 때 한 번 만들고 클래스만 바꾼다.** 손가락 밑의 요소를 갈아 끼우면
// 끌던 조작이 끊긴다.
(function () {

const R = window.NonoRules;
const S = window.NonoSolver;
const G = window.NonoGenerator;
const Sound = window.NonoSound;

const SIZES = [{ label: '작게', n: 5 }, { label: '보통', n: 10 }, { label: '크게', n: 15 }];
const SIZE_KEY = 'web-games.nonogram.size';
const BEST_KEY = 'web-games.nonogram.best';
// 칸이 이보다 작으면 손가락이 두 칸을 덮는다. 큰 판에서 판이 화면을 넘치면 넘치는 대로
// 두고 칸 크기를 지킨다.
const MIN_CELL = 17;
const MAX_CELL = 52;

const el = {
  board: document.getElementById('board'),
  sizes: document.getElementById('sizes'),
  best: document.getElementById('best'),
  timer: document.getElementById('timer'),
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

let size = Number(localStorage.getItem(SIZE_KEY)) || 10;
let game = null;
let view = null;
let clock = null;
let toastTimer = null;
// 끌어서 칠하는 중의 상태. 시작한 칸에서 무엇을 칠할지 정하고 끝까지 그것만 칠한다.
let stroke = null;
// 바로 앞 판의 그림 이름. 같은 그림이 잇달아 나오지 않게 생성기에 넘긴다.
let lastPicture = '';

function toast(text) {
  el.toast.innerHTML = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 2200);
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; }
}

function saveBest(best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* 무시 */ }
}

function showBest() {
  const best = loadBest()[size];
  el.best.textContent = best ? `최고 ${formatTime(best)}` : '';
}

// --- 판 만들기 ---

// 힌트 칸의 폭까지 넣어 칸 크기를 정한다. 힌트가 긴 판일수록 칸이 작아지므로 판마다
// 다시 잰다.
function measure(puzzle) {
  const maxRow = Math.max(...puzzle.rows.map((one) => one.length));
  const maxCol = Math.max(...puzzle.cols.map((one) => one.length));
  const room = el.board.parentElement.clientWidth - 18;
  // 힌트 한 칸은 판 한 칸의 0.66배로 둔다. 같은 폭으로 두면 힌트가 판보다 넓어진다.
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL,
    Math.floor(room / (puzzle.w + maxRow * 0.66))));
  const clue = Math.round(cell * 0.66);
  return { maxRow, maxCol, cell, clue };
}

function clueLine(clues, cls) {
  const line = document.createElement('div');
  line.className = `clue-line ${cls}`;
  for (const n of clues) {
    const span = document.createElement('span');
    // 0은 "아무것도 없음"이라 숫자로 적으면 하나를 칠하라는 말처럼 보인다.
    span.textContent = n === 0 ? '' : String(n);
    line.append(span);
  }
  return line;
}

function build() {
  const puzzle = game.puzzle;
  const spec = measure(puzzle);
  el.board.textContent = '';
  el.board.style.setProperty('--cell', `${spec.cell}px`);
  el.board.style.setProperty('--clue', `${spec.clue}px`);
  el.board.style.setProperty('--clue-font', `${Math.max(9, Math.round(spec.cell * 0.42))}px`);

  const corner = document.createElement('div');
  const cols = document.createElement('div');
  cols.className = 'col-clues';
  const rows = document.createElement('div');
  rows.className = 'row-clues';
  const cells = document.createElement('div');
  cells.className = 'cells';
  cells.style.gridTemplateColumns = `repeat(${puzzle.w}, var(--cell))`;

  const colLines = puzzle.cols.map((clues) => {
    const line = clueLine(clues, 'col');
    cols.append(line);
    return line;
  });
  const rowLines = puzzle.rows.map((clues) => {
    const line = clueLine(clues, 'row');
    rows.append(line);
    return line;
  });

  const cellNodes = [];
  for (let r = 0; r < puzzle.h; r++) {
    for (let c = 0; c < puzzle.w; c++) {
      const node = document.createElement('div');
      node.className = 'cell';
      node.dataset.at = String(r * puzzle.w + c);
      if (c % 5 === 4 || c === puzzle.w - 1) node.classList.add('block-x');
      if (r % 5 === 4 || r === puzzle.h - 1) node.classList.add('block-y');
      cells.append(node);
      cellNodes.push(node);
    }
  }

  el.board.append(corner, cols, rows, cells);
  view = { cellNodes, rowLines, colLines, shown: new Array(cellNodes.length).fill(-1) };
}

// --- 그리기 ---

function paint() {
  const { puzzle, cells } = game;
  for (let i = 0; i < cells.length; i++) {
    if (view.shown[i] === cells[i]) continue;
    view.shown[i] = cells[i];
    const node = view.cellNodes[i];
    node.classList.toggle('on', cells[i] === R.FILL);
    node.classList.toggle('off', cells[i] === R.MARK);
  }
  for (let r = 0; r < puzzle.h; r++) {
    view.rowLines[r].classList.toggle('done', R.rowDone(puzzle, cells, r));
  }
  for (let c = 0; c < puzzle.w; c++) {
    view.colLines[c].classList.toggle('done', R.colDone(puzzle, cells, c));
  }

  el.undo.disabled = game.done || !game.undo.length;
  el.clear.disabled = game.done || !cells.some((n) => n !== R.EMPTY);
  el.hint.disabled = game.done;
}

function tick() {
  if (!game.startedAt || game.done) return;
  game.elapsed = Date.now() - game.startedAt;
  el.timer.textContent = formatTime(game.elapsed);
}

function startClock() {
  if (game.startedAt) return;
  game.startedAt = Date.now();
  clock = setInterval(tick, 250);
}

// --- 진행 ---

function newGame() {
  clearInterval(clock);
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const puzzle = G.generate(seed, size, lastPicture);
  // 방금 나온 그림은 건너뛴다. 다 풀지 않고 새 판을 눌러도 같은 그림이 다시 나오면
  // 판을 새로 받은 느낌이 들지 않는다.
  lastPicture = puzzle.name;
  game = {
    puzzle,
    cells: R.newState(puzzle),
    undo: [],
    hinted: false,
    startedAt: 0,
    elapsed: 0,
    done: false,
  };
  stroke = null;
  el.board.classList.remove('solved');
  el.result.hidden = true;
  el.toast.textContent = '';
  el.timer.textContent = '0:00';
  showBest();
  build();
  paint();
}

function push() {
  game.undo.push(game.cells.slice());
  if (game.undo.length > 400) game.undo.shift();
}

function finish() {
  game.done = true;
  clearInterval(clock);
  tick();
  stroke = null;
  // 다 풀면 가위표를 감춰 그림만 남긴다. 자료는 그대로 두므로 되돌리면 다시 보인다.
  el.board.classList.add('solved');

  const best = loadBest();
  let note = `${formatTime(game.elapsed)} 걸렸습니다`;
  if (game.hinted) {
    note += ' · 힌트를 써서 기록에는 넣지 않습니다';
  } else if (!best[size] || game.elapsed < best[size]) {
    best[size] = game.elapsed;
    saveBest(best);
    showBest();
    note += ' · 최고 기록';
  }

  el.resultTitle.textContent = game.puzzle.name ? `${game.puzzle.name}!` : '다 풀었습니다';
  el.resultNote.textContent = note;
  el.result.hidden = false;
  Sound.play('win');
}

// 한 칸을 누를 때 도는 차례: 빈칸 → 칠함 → 아님 → 빈칸. **칠하는 방식을 따로 고르지
// 않는다** — 모드 단추를 두었더니 X를 치려고 화면 아래를 보고 단추를 누르고 다시 판으로
// 올라오는 일이 한 판에 수십 번이었다.
const NEXT = { [R.EMPTY]: R.FILL, [R.FILL]: R.MARK, [R.MARK]: R.EMPTY };

// 칸 하나를 그 값으로 만든다. 이미 그 값이면 아무것도 하지 않는다 — 끌 때 같은 칸을
// 여러 번 지나므로 여기서 걸러야 소리가 겹치고 되돌리기가 지저분해진다.
function apply(at, value) {
  if (game.done || game.cells[at] === value) return false;
  const before = game.cells[at];
  game.cells[at] = value;
  startClock();

  if (value === R.EMPTY) Sound.play('erase');
  else if (value === R.FILL) Sound.play('fill');
  else Sound.play('mark');

  // 이 칸이 든 줄이 방금 맞았으면 알린다.
  const w = game.puzzle.w;
  const r = Math.floor(at / w);
  const c = at % w;
  const wasRow = view.rowLines[r].classList.contains('done');
  const wasCol = view.colLines[c].classList.contains('done');
  paint();
  const nowRow = view.rowLines[r].classList.contains('done');
  const nowCol = view.colLines[c].classList.contains('done');
  if ((nowRow && !wasRow) || (nowCol && !wasCol)) Sound.play('line');

  if (R.isDone(game.puzzle, game.cells)) finish();
  return before !== value;
}

// --- 끌어서 칠하기 ---
//
// **click이 아니라 포인터 이벤트로 짠다.** 판에 touch-action: none을 걸었고, 공용
// base.js가 그 자리의 touchend를 취소하므로 click이 나지 않는다.

function cellAt(x, y) {
  const node = document.elementFromPoint(x, y);
  const cell = node && node.closest ? node.closest('[data-at]') : null;
  return cell ? Number(cell.dataset.at) : null;
}

el.board.addEventListener('pointerdown', (event) => {
  if (game.done) return;
  const at = cellAt(event.clientX, event.clientY);
  if (at === null) return;
  event.preventDefault();

  // **끄는 동안에는 시작한 칸이 된 값을 그대로 바른다.** 칸마다 제각기 돌면 한 번
  // 쓸고 지나간 자리가 칠함과 아님으로 얼룩진다.
  const value = NEXT[game.cells[at]];
  push();
  stroke = { value, from: at, axis: null, changed: false };
  stroke.changed = apply(at, value);
  el.board.setPointerCapture(event.pointerId);
});

el.board.addEventListener('pointermove', (event) => {
  if (!stroke || game.done) return;
  const at = cellAt(event.clientX, event.clientY);
  if (at === null || at === stroke.from) return;

  const w = game.puzzle.w;
  const r0 = Math.floor(stroke.from / w);
  const c0 = stroke.from % w;
  const r = Math.floor(at / w);
  const c = at % w;

  // 처음 벗어난 방향으로 축을 잠근다. 잠그지 않으면 손이 흔들릴 때 옆줄까지 칠해진다.
  if (!stroke.axis) stroke.axis = r === r0 ? 'row' : 'col';
  if (stroke.axis === 'row' && r !== r0) return;
  if (stroke.axis === 'col' && c !== c0) return;

  if (apply(at, stroke.value)) stroke.changed = true;
});

function endStroke() {
  if (!stroke) return;
  // 아무것도 바뀌지 않았으면 되돌리기 자리를 도로 버린다.
  if (!stroke.changed) game.undo.pop();
  stroke = null;
  paint();
}

el.board.addEventListener('pointerup', endStroke);
el.board.addEventListener('pointercancel', endStroke);

// --- 도구 ---

el.undo.addEventListener('click', () => {
  if (!game.undo.length || game.done) return;
  game.cells = game.undo.pop();
  Sound.play('erase');
  paint();
});

el.clear.addEventListener('click', () => {
  if (game.done) return;
  push();
  game.cells = R.newState(game.puzzle);
  Sound.play('erase');
  paint();
});

// 다음 한 칸을 알려 준다. 사람이 채운 것에서 이어 좁히므로, 지금 판에서 실제로
// 알 수 있는 칸이 나온다.
el.hint.addEventListener('click', () => {
  if (game.done) return;
  const wrong = R.wrongCells(game.puzzle, game.cells);
  push();
  if (wrong.length) {
    for (const at of wrong) game.cells[at] = R.EMPTY;
    game.hinted = true;
    Sound.play('erase');
    paint();
    toast(`잘못 칠한 칸 <b>${wrong.length}개</b>를 지웠습니다`);
    return;
  }
  const step = S.nextCell(game.puzzle, game.cells);
  if (!step) { game.undo.pop(); return; }
  game.hinted = true;
  startClock();
  apply(step.at, step.state);
  toast(step.state === R.FILL ? '이 칸은 <b>칠하는</b> 칸입니다' : '이 칸은 <b>비는</b> 칸입니다');
});

el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });

for (const item of SIZES) {
  const button = document.createElement('button');
  button.className = 'pick';
  button.type = 'button';
  button.textContent = item.label;
  button.setAttribute('aria-pressed', String(item.n === size));
  button.addEventListener('click', () => {
    size = item.n;
    localStorage.setItem(SIZE_KEY, String(size));
    for (const other of el.sizes.children) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    lastPicture = '';
    Sound.play('click');
    newGame();
  });
  el.sizes.append(button);
}

// 폭이 바뀌면 칸 크기를 다시 잰다. 판을 다시 만들되 칠한 것은 그대로 둔다.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!game) return;
    build();
    view.shown.fill(-1);
    paint();
  }, 150);
});

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

function bindSoundToggle(node, key, apply2) {
  node.setAttribute('aria-pressed', String(Sound.prefs[key]));
  node.addEventListener('click', () => {
    const on = !Sound.prefs[key];
    node.setAttribute('aria-pressed', String(on));
    apply2(on);
    Sound.play('click');
  });
}

bindSoundToggle(el.toggleBgm, 'bgm', (on) => Sound.setBgm(on));
bindSoundToggle(el.toggleSfx, 'sfx', (on) => Sound.setSfx(on));

newGame();

// 풀이기는 화면에서 쓰지 않지만, 판이 이상할 때 콘솔에서 바로 확인할 수 있게 열어 둔다.
window.NonoDebug = { game: () => game, solver: S, apply };

})();

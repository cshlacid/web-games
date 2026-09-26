'use strict';

// 화면과 조작. 규칙은 rules.js, 풀이는 solver.js, 판은 generator.js(구워 둔 puzzles.js)가
// 들고 있고 여기서는 그것들을 부르고 그린다.
//
// **칸마다 바탕과 점을 판을 만들 때 한 번 그려 두고 보이기만 바꾼다.** 끄는 동안 손가락
// 밑의 요소를 갈아 끼우면 조작이 끊긴다(저장소 규칙).
(function () {

const R = window.NurikabeRules;
const S = window.NurikabeSolver;
const G = window.NurikabeGenerator;
const Sound = window.NurikabeSound;
const t = SharedI18n.t;
const NS = 'http://www.w3.org/2000/svg';

const LEVELS = [
  { key: 'easy', labelKey: 'ui.easy' },
  { key: 'normal', labelKey: 'ui.medium' },
  { key: 'hard', labelKey: 'ui.hard' },
];
const LEVEL_KEY = 'web-games.nurikabe.level';
const BEST_KEY = 'web-games.nurikabe.best';
// 칸 크기의 위아래. 10×10에서도 칸 하나를 손가락으로 골라 누를 수 있어야 한다.
const MIN_CELL = 30;
const MAX_CELL = 60;
// SVG 좌표에서 칸 한 변. 칸을 1로 두면 숫자의 글꼴 크기가 1 아래로 내려가 웹킷이 숫자를
// 칸 가운데서 비껴 그린다(슬리더링크에서 겪었다).
const U = 100;

const el = {
  app: document.querySelector('.app'),
  board: document.getElementById('board'),
  levels: document.getElementById('levels'),
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

function readLevel() {
  try {
    const saved = localStorage.getItem(LEVEL_KEY);
    return G.PUZZLES[saved] ? saved : 'easy';
  } catch { return 'easy'; }
}

let level = readLevel();
let game = null;
let view = null;
let drag = null;
let toastTimer = null;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toast(html) {
  el.toast.innerHTML = html;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 4000);
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; }
}

function saveBest(best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* 무시 */ }
}

function showBest() {
  const best = loadBest()[level];
  el.best.textContent = best ? t('record.best', { time: formatTime(best) }) : '';
}

// --- 판 만들기 ---

function svg(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (parent) parent.append(node);
  return node;
}

// 칸 크기. 폭과 남는 높이 둘 다에 맞춘다.
function measure(size) {
  const room = el.board.parentElement.clientWidth;
  const pad = getComputedStyle(document.body);
  const rest = el.app.offsetHeight - el.board.offsetHeight
    + parseFloat(pad.paddingTop) + parseFloat(pad.paddingBottom);
  const tall = Math.max(200, window.innerHeight - rest);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(room, tall) / size)));
}

function build() {
  const { rows, cols, clues } = game.puzzle;
  const cell = measure(cols);
  el.board.textContent = '';

  // 크기를 속성으로 직접 준다(저장소 규칙).
  const root = svg('svg', {
    width: cols * cell, height: rows * cell,
    viewBox: `0 0 ${cols * U} ${rows * U}`,
  }, el.board);

  const lands = [];
  const marks = [];
  const texts = [];
  for (let i = 0; i < rows * cols; i++) {
    const x = (i % cols) * U;
    const y = Math.floor(i / cols) * U;
    lands.push(svg('rect', { class: 'land', x, y, width: U, height: U }, root));
    marks.push(svg('circle', { class: 'mark', cx: x + U / 2, cy: y + U / 2, r: U * 0.1 }, root));
    if (!clues[i]) { texts.push(null); continue; }
    // 세로 가운데는 기준선에서 0.35em 내려 맞춘다(슬리더링크와 같은 까닭).
    const text = svg('text', { class: 'clue', x: x + U / 2, y: y + U / 2, dy: '0.35em', 'font-size': U * 0.58 }, root);
    text.textContent = String(clues[i]);
    texts.push(text);
  }

  // 칸 구분선은 경로 하나로 긋는다. 칸마다 테두리를 두면 이웃한 선이 겹쳐 굵기가 갈린다.
  let d = '';
  for (let c = 1; c < cols; c++) d += `M${c * U} 0V${rows * U}`;
  for (let r = 1; r < rows; r++) d += `M0 ${r * U}H${cols * U}`;
  svg('path', { class: 'grid', d, 'stroke-width': U * 0.03 }, root);
  svg('rect', { class: 'frame', x: 0, y: 0, width: cols * U, height: rows * U, 'stroke-width': U * 0.06 }, root);

  view = { root, lands, marks, texts };
  SharedSnap.snap(root);
}

// --- 그리기 ---

function paint() {
  const { marks, puzzle } = game;
  const state = R.inspect(puzzle, marks);
  const pools = new Set(state.pools);
  for (let i = 0; i < marks.length; i++) {
    const sea = marks[i] === R.SEA;
    view.lands[i].classList.toggle('sea', sea);
    view.lands[i].classList.toggle('pool', pools.has(i));
    view.marks[i].classList.toggle('on', marks[i] === R.DOT);
  }
  const done = new Set(state.done);
  const wrong = new Set(state.wrong);
  view.texts.forEach((node, i) => {
    if (!node) return;
    node.classList.toggle('done', done.has(i));
    node.classList.toggle('wrong', wrong.has(i));
  });

  const touched = marks.some((value) => value !== R.EMPTY);
  el.undo.disabled = game.done || !game.history.length;
  el.clear.disabled = game.done || !touched;
  el.hint.disabled = game.done;
  return state;
}

// --- 시계 ---

setInterval(() => {
  if (!game || !game.running || game.done) return;
  game.elapsed += 1;
  el.timer.textContent = formatTime(game.elapsed);
}, 1000);

// --- 칸 바꾸기 ---

// 바꾼 것을 묶음으로 쌓는다. 끌어서 칠한 칸과 힌트는 여러 칸을 한 번에 바꾸므로
// 칸 하나씩 쌓으면 되돌리는 데 여러 번 눌러야 한다.
function set(i, value, group) {
  if (game.puzzle.clues[i]) return false;
  const before = game.marks[i];
  if (before === value) return false;
  game.marks[i] = value;
  group.push([i, before]);
  return true;
}

function commit(group) {
  if (!group.length) return;
  game.history.push(group);
  if (!game.running && !game.done) game.running = true;
  const state = paint();
  if (state.solved) finish();
}

const SOUND_OF = { [R.SEA]: 'sea', [R.DOT]: 'dot', [R.EMPTY]: 'erase' };

// --- 누르기와 끌기 ---
//
// **click이 아니라 포인터 이벤트로 짠다.** 판에 touch-action: none을 걸었고, 공용
// base.js가 그 자리의 touchend를 취소하므로 click이 나지 않는다.

function cellAt(event) {
  const box = view.root.getBoundingClientRect();
  const { rows, cols } = game.puzzle;
  const c = Math.floor(((event.clientX - box.left) / box.width) * cols);
  const r = Math.floor(((event.clientY - box.top) / box.height) * rows);
  if (r < 0 || c < 0 || r >= rows || c >= cols) return -1;
  return r * cols + c;
}

el.board.addEventListener('contextmenu', (event) => event.preventDefault());

// 누르는 순간 그 칸을 바꾸고, 끌면 첫 칸이 받은 것을 지나간 칸에 똑같이 찍는다. 바다를
// 칠하다 숫자 칸을 지나가도 숫자 칸은 건드리지 않는다.
el.board.addEventListener('pointerdown', (event) => {
  if (!game || game.done || !view) return;
  event.preventDefault();
  const i = cellAt(event);
  if (i < 0 || game.puzzle.clues[i]) return;
  const now = game.marks[i];
  // 빈칸 → 바다 → 점 → 빈칸. 오른쪽 단추는 점을 바로 찍는다.
  const value = event.button === 2
    ? (now === R.DOT ? R.EMPTY : R.DOT)
    : (now === R.EMPTY ? R.SEA : now === R.SEA ? R.DOT : R.EMPTY);
  drag = { id: event.pointerId, value, last: i, group: [] };
  set(i, value, drag.group);
  Sound.play(SOUND_OF[value]);
  paint();
  el.board.setPointerCapture(event.pointerId);
});

el.board.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const i = cellAt(event);
  if (i < 0 || i === drag.last) return;
  drag.last = i;
  if (set(i, drag.value, drag.group)) {
    Sound.play(SOUND_OF[drag.value]);
    paint();
  }
});

function endDrag(event) {
  if (!drag || drag.id !== event.pointerId) return;
  const one = drag;
  drag = null;
  commit(one.group);
}

el.board.addEventListener('pointerup', endDrag);
el.board.addEventListener('pointercancel', endDrag);

// --- 진행 ---

function newGame() {
  const made = G.pick(level, game && game.level === level ? game.puzzle.id : -1);
  game = {
    level,
    puzzle: made,
    marks: new Uint8Array(made.rows * made.cols),
    history: [],
    solution: null,
    elapsed: 0,
    running: false,
    done: false,
    hinted: 0,
  };
  drag = null;
  el.result.hidden = true;
  el.board.classList.remove('done');
  el.timer.textContent = '0:00';
  el.toast.textContent = '';
  showBest();
  build();
  paint();
}

function finish() {
  game.done = true;
  game.running = false;
  drag = null;
  el.board.classList.add('done');
  paint();
  Sound.play('win');

  const best = loadBest();
  const previous = best[level];
  // 조각은 모아서 붙인다. 앞 공백을 달아 두면 언어마다 빈칸 규칙이 달라 어긋난다.
  const note = [t('nurikabe.note', { size: game.puzzle.cols })];
  if (game.hinted) {
    note.push(t('record.hinted', { count: game.hinted }));
  } else if (!previous || game.elapsed < previous) {
    best[level] = game.elapsed;
    saveBest(best);
    note.push(previous ? t('record.improved', { time: formatTime(previous) }) : t('record.first'));
    showBest();
  } else {
    note.push(t('record.bestIs', { time: formatTime(previous) }));
  }
  el.resultTitle.textContent = t('record.done', { time: formatTime(game.elapsed) });
  el.resultNote.textContent = note.join(' ');
  el.result.hidden = false;
  SharedDailyUI.report('nurikabe', { level, size: game.puzzle.cols, time: game.elapsed, hints: game.hinted });
}

// --- 도구 ---

el.undo.addEventListener('click', () => {
  if (game.done || !game.history.length) return;
  const group = game.history.pop();
  for (let k = group.length - 1; k >= 0; k--) game.marks[group[k][0]] = group[k][1];
  Sound.play('erase');
  paint();
});

el.clear.addEventListener('click', () => {
  if (game.done) return;
  const group = [];
  for (let i = 0; i < game.marks.length; i++) set(i, R.EMPTY, group);
  if (!group.length) return;
  game.history.push(group);
  Sound.play('click');
  paint();
});

// 어긋난 칸을 걷어 내고, 지금 알아낼 수 있는 칸을 채우며 까닭을 알린다. 정답에서 아무
// 칸이나 골라 주면 "왜 거기인지 알 수 없는 힌트"가 된다.
function hint() {
  if (game.done) return;
  if (!game.solution) game.solution = S.solve(game.puzzle, { trial: true, limit: Infinity }).cells;
  const sol = game.solution;
  const group = [];
  let removed = 0;
  for (let i = 0; i < game.marks.length; i++) {
    const mine = game.marks[i];
    const wrong = (mine === R.SEA && sol[i] !== S.SEA) || (mine === R.DOT && sol[i] === S.SEA);
    if (wrong && set(i, R.EMPTY, group)) removed++;
  }

  // 사람의 표시를 풀이기의 칸 상태로 옮긴다. 점은 땅, 숫자 칸도 땅이다.
  const cells = S.start(S.context(game.puzzle));
  game.marks.forEach((mark, i) => {
    if (mark === R.SEA) cells[i] = S.SEA;
    else if (mark === R.DOT) cells[i] = S.LAND;
  });
  // 걷어 낸 것이 있으면 그 번에는 걷기만 한다. 걷고 곧바로 채우면 무엇이 틀렸는지가 묻힌다.
  const step = removed ? null : S.next(game.puzzle, cells, { trial: true });
  const lines = [];
  if (removed) lines.push(t('nurikabe.hintCleared', { count: removed }));
  if (step) {
    const value = step.value === S.SEA ? R.SEA : R.DOT;
    for (const i of step.cells) {
      set(i, value, group);
      const node = view.lands[i];
      node.classList.add('hinted');
      setTimeout(() => node.classList.remove('hinted'), 1400);
    }
    lines.push(t(`nurikabe.why.${step.why.code}`, { clue: step.why.clue }));
  }
  if (!group.length) return;
  game.hinted++;
  Sound.play('hint');
  toast(lines.join('<br>'));
  commit(group);
}

el.hint.addEventListener('click', hint);
el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });

document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Backspace' || event.key === 'z' || event.key === 'Z') {
    event.preventDefault();
    el.undo.click();
  }
});

for (const item of LEVELS) {
  const button = document.createElement('button');
  button.className = 'pick';
  button.type = 'button';
  button.textContent = t(item.labelKey);
  button.setAttribute('aria-pressed', String(item.key === level));
  button.addEventListener('click', () => {
    level = item.key;
    try { localStorage.setItem(LEVEL_KEY, level); } catch { /* 무시 */ }
    for (const other of el.levels.children) other.setAttribute('aria-pressed', String(other === button));
    Sound.play('click');
    newGame();
  });
  el.levels.append(button);
}

// 폭이 바뀌면 칸 크기를 다시 잰다. 판을 다시 그리되 칠한 칸은 그대로 둔다.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!game) return;
    build();
    paint();
  }, 150);
});

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

function bindSoundToggle(node, key, apply) {
  node.setAttribute('aria-pressed', String(Sound.prefs[key]));
  node.addEventListener('click', () => {
    const on = !Sound.prefs[key];
    node.setAttribute('aria-pressed', String(on));
    apply(on);
    Sound.play('click');
  });
}

bindSoundToggle(el.toggleBgm, 'bgm', (on) => Sound.setBgm(on));
bindSoundToggle(el.toggleSfx, 'sfx', (on) => Sound.setSfx(on));

window.SharedIcons.paint();
newGame();

window.NurikabeDebug = { game: () => game, hint, newGame };

})();

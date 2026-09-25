'use strict';

// 화면과 조작. 규칙은 rules.js, 풀이는 solver.js, 판은 generator.js(구워 둔 puzzles.js)가
// 들고 있고 여기서는 그것들을 부르고 그린다.
//
// **칸마다 케이지 글자·숫자·연필 자리를 판을 만들 때 한 번 넣어 두고 글자만 바꾼다.**
// 눌린 칸의 요소를 갈아 끼우면 조작이 끊긴다(저장소 규칙).
(function () {

const R = window.KenKenRules;
const S = window.KenKenSolver;
const G = window.KenKenGenerator;
const Sound = window.KenKenSound;
const t = SharedI18n.t;

const LEVELS = [
  { key: 'easy', labelKey: 'ui.easy' },
  { key: 'normal', labelKey: 'ui.medium' },
  { key: 'hard', labelKey: 'ui.hard' },
];
const SAVE_KEY = 'web-games.kenken.game';
const BEST_KEY = 'web-games.kenken.best';
const OP_SIGN = { '+': '+', '-': '−', '*': '×', '/': '÷', '=': '' };

const el = {
  app: document.querySelector('.app'),
  board: document.getElementById('board'),
  levels: document.getElementById('levels'),
  digits: document.getElementById('digits'),
  timer: document.getElementById('timer'),
  toast: document.getElementById('toast'),
  combos: document.getElementById('combos'),
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
  toggleBgm: document.getElementById('toggle-bgm'),
  toggleSfx: document.getElementById('toggle-sfx'),
};

let game = null;
let view = null;
let pencil = false;
let toastTimer = null;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
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

// --- 판 만들기 ---

// 케이지 경계는 굵게, 나머지 칸 사이는 가늘게 칸 안쪽 그림자로 긋는다. 가는 선은 오른쪽·
// 아래 칸 몫만 긋고, 굵은 선은 양쪽 칸이 1px씩 나눠 그어 2px가 된다.
function cageShadow(i) {
  const { size: n, cageOf } = game.puzzle;
  const r = Math.floor(i / n);
  const c = i % n;
  const other = (j) => cageOf[j] !== cageOf[i];
  const out = [];
  if (c < n - 1) out.push(`inset -1px 0 0 var(${other(i + 1) ? '--cage-line' : '--line'})`);
  if (r < n - 1) out.push(`inset 0 -1px 0 var(${other(i + n) ? '--cage-line' : '--line'})`);
  if (c > 0 && other(i - 1)) out.push('inset 1px 0 0 var(--cage-line)');
  if (r > 0 && other(i - n)) out.push('inset 0 1px 0 var(--cage-line)');
  return out.join(', ') || 'none';
}

function build() {
  const { size: n, cages } = game.puzzle;
  el.app.style.setProperty('--n', n);
  el.board.textContent = '';
  const cells = [];
  const values = [];
  const marks = [];
  const labels = new Array(cages.length);
  for (let i = 0; i < n * n; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.style.setProperty('--cage', cageShadow(i));
    const value = document.createElement('span');
    value.className = 'value';
    const grid = document.createElement('span');
    grid.className = 'marks';
    // 연필 자리는 판 크기와 관계없이 3×3이다(8×8이면 한 자리가 빈다).
    const slots = [];
    for (let d = 1; d <= n; d++) slots.push(grid.appendChild(document.createElement('span')));
    cell.append(value, grid);
    el.board.append(cell);
    cells.push(cell);
    values.push(value);
    marks.push(slots);
  }
  cages.forEach((cage, id) => {
    const label = document.createElement('span');
    label.className = 'cage-label';
    label.textContent = `${cage.target}${OP_SIGN[cage.op]}`;
    cells[Math.min(...cage.cells)].append(label);
    labels[id] = label;
  });

  el.digits.textContent = '';
  const digits = [];
  for (let d = 1; d <= n; d++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'digit';
    button.textContent = d;
    button.addEventListener('click', () => (pencil ? mark(d) : place(d)));
    el.digits.append(button);
    digits.push(button);
  }
  view = { cells, values, marks, labels, digits };
}

// 칸 폭을 정수 픽셀로 끊는다. CSS의 --cell은 화면 폭에서 나눈 값이라 소수가 되고, 그러면
// 칸마다 안쪽 그림자 선이 다른 쪽으로 반올림돼 굵기가 들쭉날쭉하다.
function fit() {
  el.board.style.removeProperty('--cell');
  const width = parseFloat(getComputedStyle(view.cells[0]).width);
  el.board.style.setProperty('--cell', `${Math.floor(width)}px`);
  SharedSnap.snap(el.board);
}

function paint() {
  const { size: n } = game.puzzle;
  const seen = R.inspect(game.puzzle, game.values);
  const dup = new Set(seen.dup);
  const sel = game.selected;
  const selValue = game.values[sel];
  const counts = new Array(n + 1).fill(0);
  for (let i = 0; i < n * n; i++) {
    const v = game.values[i];
    counts[v]++;
    const cell = view.cells[i];
    cell.classList.toggle('wrong', dup.has(i));
    cell.classList.toggle('selected', i === sel);
    cell.classList.toggle('same', i !== sel && Boolean(selValue) && v === selValue);
    cell.classList.toggle('peer', i !== sel && !(selValue && v === selValue)
      && (Math.floor(i / n) === Math.floor(sel / n) || i % n === sel % n));
    view.values[i].textContent = v || '';
    view.marks[i].forEach((slot, k) => {
      slot.textContent = !v && (game.marks[i] & S.bit(k + 1)) ? k + 1 : '';
    });
  }
  const wrong = new Set(seen.wrong);
  const done = new Set(seen.done);
  view.labels.forEach((label, id) => {
    label.classList.toggle('wrong', wrong.has(id));
    label.classList.toggle('done', done.has(id));
  });
  view.digits.forEach((button, k) => button.classList.toggle('done', counts[k + 1] >= n));
  paintCombos();
  el.undo.disabled = !game.history.length;
  el.pencil.setAttribute('aria-pressed', String(pencil));
  for (const button of el.levels.children) {
    button.setAttribute('aria-pressed', String(button.dataset.level === game.level));
  }
}

// 고른 칸의 케이지 조합. 같은 내용이면 다시 그리지 않는다 — 옆으로 밀어 둔 자리가 칸을
// 누를 때마다 처음으로 돌아가면 긴 목록을 끝까지 볼 수 없다.
let combosKey = '';
function paintCombos() {
  const id = game.puzzle.cageOf[game.selected];
  const cage = game.puzzle.cages[id];
  const key = `${game.code}:${id}:${cage.cells.map((i) => game.values[i]).join('')}`;
  if (key === combosKey) return;
  const moved = !key.startsWith(combosKey.slice(0, combosKey.lastIndexOf(':') + 1)) || !combosKey;
  combosKey = key;
  const label = document.createElement('span');
  label.className = 'combos-label';
  label.textContent = `${cage.target}${OP_SIGN[cage.op]}`;
  // 남은 조합을 앞에 둔다. 흐린 것이 앞을 차지하면 쓸 만한 조합을 보려고 옆으로 밀어야 한다.
  const list = R.combos(game.puzzle, id, game.values);
  const chips = [...list.filter((c) => c.live), ...list.filter((c) => !c.live)].map((combo) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = combo.live ? 'combo' : 'combo off';
    chip.disabled = !combo.live;
    chip.dataset.digits = combo.digits.join('');
    chip.textContent = combo.digits.join(' ');
    return chip;
  });
  el.combos.replaceChildren(label, ...chips);
  if (moved) el.combos.scrollLeft = 0;
}

// --- 조작 ---

function snapshot() {
  // 숫자를 넣으면 같은 줄의 연필 표시까지 지워지므로 판 전체를 담아 둔다.
  game.history.push({ values: game.values.slice(), marks: game.marks.slice() });
  if (game.history.length > 200) game.history.shift();
}

function started() {
  if (!game.running && !game.done) game.running = true;
}

// 확정한 숫자는 같은 줄의 후보에서 뺀다. 손으로 지우게 두면 연필 표시가 금세 거짓말을 한다.
function put(i, digit) {
  const n = game.puzzle.size;
  game.values[i] = digit;
  game.marks[i] = 0;
  for (let k = 0; k < n; k++) {
    game.marks[Math.floor(i / n) * n + k] &= ~S.bit(digit);
    game.marks[k * n + (i % n)] &= ~S.bit(digit);
  }
}

function place(digit) {
  const i = game.selected;
  if (game.done) return;
  started();
  snapshot();
  if (game.values[i] === digit) {
    game.values[i] = 0;
    Sound.play('erase');
  } else {
    put(i, digit);
    // 줄에서 겹치면 다른 소리를 낸다. 빨간색을 놓쳐도 귀로 걸린다.
    Sound.play(R.inspect(game.puzzle, game.values).dup.includes(i) ? 'conflict' : 'place', digit);
  }
  afterChange();
}

function mark(digit) {
  const i = game.selected;
  if (game.done || game.values[i]) return;
  started();
  snapshot();
  game.marks[i] ^= S.bit(digit);
  Sound.play('pencil');
  afterChange();
}

// 조합의 숫자를 고른 칸의 연필 표시에 더한다. 지우지는 않는다 — 조합 둘을 차례로 눌러
// 후보를 모으는 것이 쓰임새라, 이미 있는 숫자를 끄면 앞에서 모은 것이 사라진다.
function markCombo(digits) {
  const i = game.selected;
  if (game.done || game.values[i]) return;
  const add = digits.reduce((mask, d) => mask | S.bit(d), 0);
  if ((game.marks[i] | add) === game.marks[i]) return;
  started();
  snapshot();
  game.marks[i] |= add;
  Sound.play('pencil');
  afterChange();
}

function clearCell() {
  const i = game.selected;
  if (game.done || (!game.values[i] && !game.marks[i])) return;
  snapshot();
  game.values[i] = 0;
  game.marks[i] = 0;
  Sound.play('erase');
  afterChange();
}

function undo() {
  if (game.done) return;
  const last = game.history.pop();
  if (!last) return;
  game.values.set(last.values);
  game.marks.set(last.marks);
  Sound.play('erase');
  save();
  paint();
}

function afterChange() {
  save();
  paint();
  if (R.inspect(game.puzzle, game.values).solved) finish();
}

function select(i) {
  game.selected = i;
  paint();
}

function showResult() {
  const best = loadBest();
  const previous = best[game.level];
  // 조각은 모아서 붙인다. 앞 공백을 달아 두면 언어마다 빈칸 규칙이 달라 어긋난다.
  const note = [];
  if (game.hinted) {
    note.push(t('record.hinted', { count: game.hinted }));
  } else if (!game.recorded && (!previous || game.elapsed < previous)) {
    best[game.level] = game.elapsed;
    saveBest(best);
    note.push(previous ? t('record.improved', { time: formatTime(previous) }) : t('record.first'));
  } else if (previous) {
    note.push(t('record.bestIs', { time: formatTime(previous) }));
  }
  game.recorded = true;
  el.resultTitle.textContent = t('record.done', { time: formatTime(game.elapsed) });
  el.resultNote.textContent = note.join(' ');
  el.result.hidden = false;
}

function finish() {
  game.done = true;
  game.running = false;
  Sound.play('win');
  showResult();
  save();
  SharedDailyUI.report('kenken', {
    level: game.level, size: game.puzzle.size, time: game.elapsed, hints: game.hinted,
  });
}

// 틀린 숫자가 있으면 먼저 짚고, 없으면 지금 확정할 수 있는 칸 하나를 까닭과 함께 채운다.
// 정답에서 아무 칸이나 골라 주면 "왜 거기인지 알 수 없는 힌트"가 된다.
function hint() {
  if (game.done) return;
  if (!game.solution) game.solution = S.solve(game.puzzle, { trial: true }).values;
  const sol = game.solution;
  const bad = game.values.findIndex((v, i) => v && v !== sol[i]);
  if (bad >= 0) {
    select(bad);
    Sound.play('conflict');
    toast(t('kenken.wrong'));
    return;
  }
  const step = S.next(game.puzzle, Array.from(game.values), { trial: true });
  if (!step) { toast(t('kenken.noStep')); return; }
  started();
  game.hinted++;
  game.selected = step.cell;
  const node = view.cells[step.cell];
  node.classList.add('hinted');
  setTimeout(() => node.classList.remove('hinted'), 900);
  snapshot();
  put(step.cell, step.digit);
  Sound.play('hint');
  toast(t(`kenken.why.${step.why.code}`, { digit: step.digit }));
  afterChange();
}

// --- 저장 ---

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      level: game.level,
      id: game.id,
      code: game.code,
      values: [...game.values],
      marks: [...game.marks],
      elapsed: game.elapsed,
      hinted: game.hinted,
      done: game.done,
    }));
  } catch { /* 무시 */ }
}

function restore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return false; }
  if (!saved || !G.PUZZLES[saved.level]) return false;
  const set = G.PUZZLES[saved.level];
  // 판을 다시 구우면 같은 번호가 다른 판이 된다. 적어 둔 판 자료로 가린다.
  if (set.list[saved.id] !== saved.code) return false;
  const puzzle = R.parse(set.size, saved.code);
  const cells = set.size * set.size;
  start({ id: saved.id, level: saved.level, code: saved.code, ...puzzle });
  game.values.set((saved.values || []).slice(0, cells));
  game.marks.set((saved.marks || []).slice(0, cells));
  game.elapsed = saved.elapsed || 0;
  game.hinted = saved.hinted || 0;
  game.done = Boolean(saved.done);
  game.recorded = game.done;
  const empty = game.values.findIndex((v) => !v);
  game.selected = empty < 0 ? 0 : empty;
  game.running = !game.done && game.values.some((v) => v);
  el.timer.textContent = formatTime(game.elapsed);
  paint();
  if (game.done) showResult();
  return true;
}

// --- 새 판 ---

function start(made) {
  game = {
    level: made.level,
    id: made.id,
    code: made.code,
    puzzle: made,
    values: new Int8Array(made.size * made.size),
    marks: new Uint16Array(made.size * made.size),
    selected: 0,
    history: [],
    solution: null,
    elapsed: 0,
    running: false,
    done: false,
    recorded: false,
    hinted: 0,
  };
  el.result.hidden = true;
  el.timer.textContent = '0:00';
  el.toast.textContent = '';
  build();
  fit();
}

function newGame(level = game ? game.level : 'easy') {
  const skip = game && game.level === level ? game.id : -1;
  start(G.pick(level, skip));
  save();
  paint();
}

// --- 입력 연결 ---

for (const item of LEVELS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'level';
  button.dataset.level = item.key;
  button.textContent = t(item.labelKey);
  button.addEventListener('click', () => { Sound.play('click'); newGame(item.key); });
  el.levels.append(button);
}

el.board.addEventListener('click', (event) => {
  const cell = event.target.closest('.cell');
  if (cell) select(Number(cell.dataset.index));
});

el.combos.addEventListener('click', (event) => {
  const chip = event.target.closest('.combo');
  if (chip && !chip.disabled) markCombo([...chip.dataset.digits].map(Number));
});

el.pencil.addEventListener('click', () => {
  pencil = !pencil;
  Sound.play('click');
  paint();
});
el.erase.addEventListener('click', clearCell);
el.undo.addEventListener('click', undo);
el.hint.addEventListener('click', hint);
el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });
window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    undo();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const n = game.puzzle.size;
  const r = Math.floor(game.selected / n);
  const c = game.selected % n;
  const MOVES = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  if (event.key in MOVES) {
    event.preventDefault();
    const [dr, dc] = MOVES[event.key];
    if (r + dr >= 0 && r + dr < n && c + dc >= 0 && c + dc < n) select((r + dr) * n + c + dc);
    return;
  }
  if (event.key === ' ') { event.preventDefault(); el.pencil.click(); return; }
  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
    event.preventDefault();
    clearCell();
    return;
  }
  // Shift+숫자는 자판 배열에 따라 key가 기호로 온다. 숫자 자리는 code로 읽는다.
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  const digit = match ? Number(match[1]) : 0;
  if (digit >= 1 && digit <= n) {
    event.preventDefault();
    if (event.shiftKey || pencil) mark(digit);
    else place(digit);
  }
});

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

setInterval(() => {
  if (!game || !game.running || game.done) return;
  game.elapsed += 1;
  el.timer.textContent = formatTime(game.elapsed);
  // 시간을 이따금 남겨 둔다. 새로 열었을 때 0초부터 다시 세면 기록이 어긋난다.
  if (game.elapsed % 5 === 0) save();
}, 1000);

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (view) fit(); }, 150);
});

window.SharedIcons.paint();
if (!restore()) newGame('easy');

window.KenKenDebug = { game: () => game, hint, newGame };

})();

'use strict';

// 화면과 조작. 규칙은 rules.js, 최단 풀이는 solver.js, 판은 generator.js가 들고 있고
// 여기서는 그것들을 부르고 그린다.
//
// **차는 판을 만들 때 한 번 만들고 자리만 옮긴다.** 손가락 밑의 요소를 갈아 끼우면
// 끌던 조작이 끊긴다.
(function () {

const R = window.RushRules;
const S = window.RushSolver;
const G = window.RushGenerator;
const Sound = window.RushSound;
const NS = 'http://www.w3.org/2000/svg';

const LEVELS = [{ label: '쉬움', key: 'easy' }, { label: '보통', key: 'normal' }, { label: '어려움', key: 'hard' }];
const LEVEL_KEY = 'web-games.rushhour.level';
const BEST_KEY = 'web-games.rushhour.best';
// 칸 크기의 위아래. 폰에서 손가락이 차 한 대를 덮지 않을 만큼은 되어야 한다.
const MIN_CELL = 40;
const MAX_CELL = 62;
// 이보다 적게 움직였으면 끈 것이 아니라 누른 것으로 친다.
const TAP = 6;
// 오른쪽 벽에 트인 자리의 너비. 판 밖으로 한 뼘 내어 그려야 "여기로 나간다"가 보인다.
const EXIT = 20;

const el = {
  board: document.getElementById('board'),
  levels: document.getElementById('levels'),
  count: document.getElementById('count'),
  best: document.getElementById('best'),
  toast: document.getElementById('toast'),
  undo: document.getElementById('undo'),
  reset: document.getElementById('reset'),
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

let level = G.PUZZLES[localStorage.getItem(LEVEL_KEY)] ? localStorage.getItem(LEVEL_KEY) : 'easy';
let game = null;
let view = null;
let drag = null;
let toastTimer = null;

function toast(text) {
  el.toast.innerHTML = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 2400);
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; }
}

function showBest() {
  const best = loadBest()[level] || 0;
  el.best.textContent = best ? `최소 수로 푼 판 ${best}` : '';
}

function markBest() {
  const best = loadBest();
  best[level] = (best[level] || 0) + 1;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* 무시 */ }
  showBest();
}

// --- 판 만들기 ---

function measure() {
  const room = el.board.parentElement.clientWidth;
  const gap = 3;
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL,
    Math.floor((room - gap * 2 - EXIT) / R.SIZE)));
  return { cell, gap };
}

function svg(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  return node;
}

function build() {
  const spec = measure();
  el.board.textContent = '';
  el.board.style.setProperty('--size', `${spec.cell}px`);
  el.board.style.setProperty('--gap', `${spec.gap}px`);
  el.board.style.width = `${spec.cell * R.SIZE + spec.gap * 2 + EXIT}px`;
  el.board.style.height = `${spec.cell * R.SIZE + spec.gap * 2}px`;

  const at = (n) => spec.gap + n * spec.cell;
  for (let y = 0; y < R.SIZE; y++) {
    for (let x = 0; x < R.SIZE; x++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.style.left = `${at(x) + 2}px`;
      slot.style.top = `${at(y) + 2}px`;
      slot.style.width = `${spec.cell - 4}px`;
      slot.style.height = `${spec.cell - 4}px`;
      el.board.append(slot);
    }
  }

  // 빠져나가는 자리. 오른쪽 벽이 트여 있다는 것을 화살표로 알린다.
  const exit = document.createElement('div');
  exit.className = 'exit';
  exit.style.left = `${at(R.SIZE)}px`;
  exit.style.top = `${at(R.EXIT_ROW)}px`;
  exit.style.width = `${EXIT}px`;
  exit.style.height = `${spec.cell}px`;
  const arrow = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  arrow.append(svg('path', { d: 'M4 12 H18' }), svg('path', { d: 'M13 6 L19 12 L13 18' }));
  exit.append(arrow);
  el.board.append(exit);

  const cars = game.puzzle.cars.map((car, id) => {
    const node = document.createElement('div');
    node.className = `car ${id === 0 ? 'target' : `c${1 + ((id - 1) % 6)}`}`;
    node.dataset.id = String(id);
    node.style.width = `${(car.horizontal ? car.len : 1) * spec.cell - 4}px`;
    node.style.height = `${(car.horizontal ? 1 : car.len) * spec.cell - 4}px`;
    el.board.append(node);
    return node;
  });

  view = { spec, cars, at };
}

// --- 그리기 ---

function place(id, offset) {
  const car = game.puzzle.cars[id];
  const pos = game.state[id];
  const node = view.cars[id];
  const x = car.horizontal ? pos : car.line;
  const y = car.horizontal ? car.line : pos;
  node.style.left = `${view.at(x) + 2}px`;
  node.style.top = `${view.at(y) + 2}px`;
  const dx = offset && car.horizontal ? offset : 0;
  const dy = offset && !car.horizontal ? offset : 0;
  node.style.setProperty('--dx', `${dx}px`);
  node.style.setProperty('--dy', `${dy}px`);
  node.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
}

function paint() {
  for (let id = 0; id < game.puzzle.cars.length; id++) place(id);
  el.count.innerHTML = `${game.moves}수 <b>/ 최소 ${game.puzzle.moves}수</b>`;
  el.undo.disabled = game.done || !game.undo.length;
  el.reset.disabled = game.done || !game.moves;
  el.hint.disabled = game.done;
}

// --- 진행 ---

function newGame() {
  const made = G.pick((Math.random() * 0xffffffff) >>> 0, level, game && game.puzzle.id);
  game = {
    puzzle: made,
    state: made.cars.map((car) => car.pos),
    undo: [],
    moves: 0,
    hinted: false,
    done: false,
  };
  drag = null;
  el.result.hidden = true;
  el.toast.textContent = '';
  showBest();
  build();
  paint();
}

function finish() {
  game.done = true;
  drag = null;
  const best = game.moves <= game.puzzle.moves && !game.hinted;
  if (best) markBest();
  el.resultTitle.textContent = '빠져나갔습니다';
  el.resultNote.textContent = best
    ? `${game.moves}수 · 최소 수로 풀었습니다`
    : `${game.moves}수 · 최소는 ${game.puzzle.moves}수${game.hinted ? ' · 힌트를 썼습니다' : ''}`;
  el.result.hidden = false;
  paint();
  Sound.play('win');
}

// 차 하나를 옮긴다. **몇 칸을 가든 한 수**다.
function apply(id, pos, quiet) {
  if (game.done || game.state[id] === pos) return false;
  if (!R.canMove(game.puzzle, game.state, id, pos)) return false;
  game.undo.push(game.state.slice());
  if (game.undo.length > 400) game.undo.shift();
  const far = Math.abs(game.state[id] - pos);
  game.state[id] = pos;
  game.moves++;
  if (!quiet) Sound.play('slide', far);
  paint();
  if (R.isDone(game.puzzle, game.state)) finish();
  return true;
}

// --- 끌어서 옮기기 ---
//
// **click이 아니라 포인터 이벤트로 짠다.** 판에 touch-action: none을 걸었고, 공용
// base.js가 그 자리의 touchend를 취소하므로 click이 나지 않는다.

el.board.addEventListener('pointerdown', (event) => {
  if (game.done) return;
  const node = event.target.closest('[data-id]');
  if (!node) return;
  event.preventDefault();

  const id = Number(node.dataset.id);
  const car = game.puzzle.cars[id];
  const spots = R.movesOf(game.puzzle, game.state, id).map((one) => one.pos);
  if (!spots.length) {
    // 갈 데가 없으면 떨리기만 한다. 왜 안 가는지 손에 알린다.
    node.classList.remove('stuck');
    void node.offsetWidth;
    node.classList.add('stuck');
    Sound.play('stuck');
    return;
  }

  drag = {
    id,
    car,
    node,
    from: game.state[id],
    low: Math.min(...spots, game.state[id]),
    high: Math.max(...spots, game.state[id]),
    startX: event.clientX,
    startY: event.clientY,
    moved: 0,
  };
  node.classList.add('held');
  el.board.setPointerCapture(event.pointerId);
});

el.board.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const along = drag.car.horizontal ? event.clientX - drag.startX : event.clientY - drag.startY;
  const across = drag.car.horizontal ? event.clientY - drag.startY : event.clientX - drag.startX;
  drag.moved = Math.max(drag.moved, Math.abs(along), Math.abs(across));

  // 갈 수 있는 자리까지만 따라온다. 벽 너머로 끌려가면 어디까지 갈 수 있는지가 안 보인다.
  const cell = view.spec.cell;
  const wanted = drag.from + along / cell;
  const clamped = Math.max(drag.low, Math.min(drag.high, wanted));
  place(drag.id, (clamped - drag.from) * cell);
});

function endDrag(event) {
  if (!drag) return;
  const one = drag;
  drag = null;
  one.node.classList.remove('held');

  const cell = view.spec.cell;
  const along = one.car.horizontal ? event.clientX - one.startX : event.clientY - one.startY;

  // 짧게 누른 것은 그쪽으로 한 칸. 차가 커서 끌지 않고 톡 치는 사람이 많다.
  let pos;
  if (one.moved < TAP) {
    const box = one.node.getBoundingClientRect();
    const mid = one.car.horizontal ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2;
    const at = one.car.horizontal ? event.clientX : event.clientY;
    pos = one.from + (at < mid ? -1 : 1);
  } else {
    pos = Math.round(Math.max(one.low, Math.min(one.high, one.from + along / cell)));
  }
  pos = Math.max(one.low, Math.min(one.high, pos));

  if (pos === one.from || !apply(one.id, pos)) {
    place(one.id);
    paint();
  }
}

el.board.addEventListener('pointerup', endDrag);
el.board.addEventListener('pointercancel', (event) => {
  if (!drag) return;
  const one = drag;
  drag = null;
  one.node.classList.remove('held');
  place(one.id);
});

// --- 도구 ---

el.undo.addEventListener('click', () => {
  if (!game.undo.length || game.done) return;
  game.state = game.undo.pop();
  game.moves = Math.max(0, game.moves - 1);
  Sound.play('slide', 1);
  paint();
});

el.reset.addEventListener('click', () => {
  if (game.done) return;
  game.undo.push(game.state.slice());
  game.state = game.puzzle.cars.map((car) => car.pos);
  game.moves = 0;
  Sound.play('click');
  paint();
});

// 지금 자리에서 최단 풀이의 다음 한 수를 대신 둔다. 사람이 엉뚱하게 옮겨 놓았어도 그
// 자리에서 다시 계산하므로 늘 맞는 수가 나온다.
el.hint.addEventListener('click', () => {
  if (game.done) return;
  const step = S.nextMove(game.puzzle, game.state);
  if (!step) return;
  game.hinted = true;
  const node = view.cars[step.id];
  node.classList.add('hinted');
  setTimeout(() => node.classList.remove('hinted'), 700);
  apply(step.id, step.pos);
  toast('최단 풀이의 다음 한 수입니다');
});

el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });

for (const item of LEVELS) {
  const button = document.createElement('button');
  button.className = 'pick';
  button.type = 'button';
  button.textContent = item.label;
  button.setAttribute('aria-pressed', String(item.key === level));
  button.addEventListener('click', () => {
    level = item.key;
    localStorage.setItem(LEVEL_KEY, level);
    for (const other of el.levels.children) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    Sound.play('click');
    newGame();
  });
  el.levels.append(button);
}

// 폭이 바뀌면 칸 크기를 다시 잰다. 판을 다시 만들되 옮긴 차는 그대로 둔다.
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

window.SharedIcons.paint();
newGame();

window.RushDebug = { game: () => game, solver: S, apply };

})();

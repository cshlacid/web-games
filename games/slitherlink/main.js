'use strict';

// 화면과 조작. 규칙은 rules.js, 풀이는 solver.js, 판은 generator.js(구워 둔 puzzles.js)가
// 들고 있고 여기서는 그것들을 부르고 그린다.
//
// **변마다 선과 X를 판을 만들 때 한 번 그려 두고 보이기만 바꾼다.** 끄는 동안 손가락
// 밑의 요소를 갈아 끼우면 조작이 끊긴다(저장소 규칙).
(function () {

const R = window.SlitherRules;
const S = window.SlitherSolver;
const G = window.SlitherGenerator;
const Sound = window.SlitherSound;
const t = SharedI18n.t;
const NS = 'http://www.w3.org/2000/svg';

const LEVELS = [
  { key: 'easy', labelKey: 'ui.easy' },
  { key: 'normal', labelKey: 'ui.medium' },
  { key: 'hard', labelKey: 'ui.hard' },
];
const LEVEL_KEY = 'web-games.slitherlink.level';
const BEST_KEY = 'web-games.slitherlink.best';
// 칸 크기의 위아래. 10×10에서도 변 하나를 손가락으로 골라 누를 수 있어야 한다.
const MIN_CELL = 28;
const MAX_CELL = 64;
// 이만큼(칸 단위) 움직이기 전에는 끈 것이 아니라 누른 것으로 본다.
const DRAG_START = 0.3;
// 끄는 동안 점에 이만큼 다가가야 그 점에 닿은 것으로 친다. 크게 잡으면 모서리를 스칠
// 때 엉뚱한 변이 그어진다.
const VERTEX_REACH = 0.38;
// 누른 자리에서 변까지 이보다 멀면(칸 단위) 아무 변도 고르지 않는다.
const EDGE_REACH = 0.5;
// SVG 좌표에서 칸 한 변의 길이. 칸을 1로 두면 숫자의 글꼴 크기가 0.6이 되는데, 웹킷은
// 이렇게 작은 글자를 viewBox로 키워 그릴 때 글자 폭과 기준선을 작은 크기에서 재어
// 숫자가 칸 가운데서 비껴 났다. 칸을 100으로 두면 글자를 제 크기 근처에서 잰다.
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

// 칸 크기. 폭과 남는 높이 둘 다에 맞춘다. 판 둘레에 점을 그릴 자리로 반 칸씩 더 둔다.
function measure(size) {
  const room = el.board.parentElement.clientWidth;
  const pad = getComputedStyle(document.body);
  const rest = el.app.offsetHeight - el.board.offsetHeight
    + parseFloat(pad.paddingTop) + parseFloat(pad.paddingBottom);
  const tall = Math.max(200, window.innerHeight - rest);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(room, tall) / (size + 1))));
}

function build() {
  const { geo } = game;
  const size = geo.rows;
  const cell = measure(size);
  el.board.textContent = '';

  // 크기를 속성으로 직접 준다(저장소 규칙). 좌표는 점 번호에 U를 곱한 값이다.
  const root = svg('svg', {
    width: (size + 1) * cell, height: (size + 1) * cell,
    viewBox: `${-U / 2} ${-U / 2} ${(size + 1) * U} ${(size + 1) * U}`,
  }, el.board);

  const clues = [];
  for (let c = 0; c < geo.cellCount; c++) {
    const k = game.puzzle.clues[c];
    if (k < 0) { clues.push(null); continue; }
    // 세로 가운데는 dominant-baseline에 맡기지 않고 기준선에서 0.35em 내려 맞춘다. 숫자의
    // 높이가 글꼴마다 0.7em 안팎이라 이것이 어느 브라우저에서나 같은 자리에 놓인다.
    const text = svg('text', {
      class: 'clue', x: ((c % size) + 0.5) * U, y: (Math.floor(c / size) + 0.5) * U,
      dy: '0.35em', 'font-size': 0.6 * U,
    }, root);
    text.textContent = String(k);
    clues.push(text);
  }

  // 선이 겹치는 점에서 끝이 둥글게 이어지도록 선 굵기를 점보다 조금 가늘게 둔다.
  const segs = [];
  const crosses = [];
  for (let e = 0; e < geo.edgeCount; e++) {
    const [a, b] = geo.edgeVerts[e].map((v) => point(v));
    segs.push(svg('line', { class: 'seg', x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-width': 0.13 * U }, root));
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const d = 0.1 * U;
    crosses.push(svg('path', {
      class: 'x', d: `M${mx - d} ${my - d} L${mx + d} ${my + d} M${mx + d} ${my - d} L${mx - d} ${my + d}`,
      'stroke-width': 0.055 * U,
    }, root));
  }

  const dots = [];
  for (let v = 0; v < geo.vertexCount; v++) {
    const [x, y] = point(v);
    dots.push(svg('circle', { class: 'dot', cx: x, cy: y, r: 0.085 * U }, root));
  }

  view = { root, clues, segs, crosses, dots, size };
  SharedSnap.snap(root);
}

// 점 번호 → SVG 좌표.
function point(v) {
  const w = game.geo.cols + 1;
  return [(v % w) * U, Math.floor(v / w) * U];
}

// --- 그리기 ---

function paint() {
  const { geo, edges } = game;
  for (let e = 0; e < geo.edgeCount; e++) {
    view.segs[e].classList.toggle('on', edges[e] === R.LINE);
    view.crosses[e].classList.toggle('on', edges[e] === R.CROSS);
  }
  const state = R.inspect(game.puzzle, edges);
  const over = new Set(state.over);
  const done = new Set(state.done);
  view.clues.forEach((node, c) => {
    if (!node) return;
    node.classList.toggle('over', over.has(c));
    node.classList.toggle('done', done.has(c) && !over.has(c));
  });
  const branch = new Set(state.branch);
  view.dots.forEach((node, v) => node.classList.toggle('bad', branch.has(v)));

  const touched = edges.some((value) => value !== R.EMPTY);
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

// --- 변 바꾸기 ---

// 바꾼 것을 묶음으로 쌓는다. 끌어서 그은 선과 힌트는 여러 변을 한 번에 바꾸므로
// 변 하나씩 쌓으면 되돌리는 데 여러 번 눌러야 한다.
function set(e, value, group) {
  const before = game.edges[e];
  if (before === value) return false;
  game.edges[e] = value;
  group.push([e, before]);
  return true;
}

function commit(group) {
  if (!group.length) return;
  game.history.push(group);
  if (!game.running && !game.done) game.running = true;
  const state = paint();
  if (state.solved) finish();
}

// --- 누르기와 끌기 ---
//
// **click이 아니라 포인터 이벤트로 짠다.** 판에 touch-action: none을 걸었고, 공용
// base.js가 그 자리의 touchend를 취소하므로 click이 나지 않는다.

function toBoard(event) {
  const box = view.root.getBoundingClientRect();
  const span = view.size + 1;
  return {
    x: ((event.clientX - box.left) / box.width) * span - 0.5,
    y: ((event.clientY - box.top) / box.height) * span - 0.5,
  };
}

// 누른 자리에서 가장 가까운 변. 가로변은 위아래 거리, 세로변은 좌우 거리로 잰다 —
// 칸 한가운데를 누르면 네 변이 같은 거리라 아무것도 고르지 않는다.
function nearestEdge(p) {
  const { geo } = game;
  const n = geo.rows;
  let best = null;
  let bestDist = EDGE_REACH;
  const hr = Math.round(p.y);
  const hc = Math.floor(p.x);
  if (hr >= 0 && hr <= n && hc >= 0 && hc < n) {
    const d = Math.abs(p.y - hr);
    if (d < bestDist) { bestDist = d; best = geo.hid(hr, hc); }
  }
  const vc = Math.round(p.x);
  const vr = Math.floor(p.y);
  if (vc >= 0 && vc <= n && vr >= 0 && vr < n) {
    const d = Math.abs(p.x - vc);
    if (d < bestDist) { bestDist = d; best = geo.vtid(vr, vc); }
  }
  return best;
}

function nearestVertex(p, reach) {
  const n = game.geo.rows;
  const r = Math.max(0, Math.min(n, Math.round(p.y)));
  const c = Math.max(0, Math.min(n, Math.round(p.x)));
  if (Math.hypot(p.x - c, p.y - r) > reach) return null;
  return { r, c };
}

// 두 점 사이의 변들. 같은 줄이나 같은 열이면 사이의 변을 차례로, 아니면 없다 —
// 손가락이 빨라 점 몇 개를 건너뛰어도 선이 끊기지 않게 한다.
function edgesBetween(a, b) {
  const { geo } = game;
  const out = [];
  if (a.r === b.r) {
    const step = b.c > a.c ? 1 : -1;
    for (let c = a.c; c !== b.c; c += step) out.push(geo.hid(a.r, Math.min(c, c + step)));
  } else if (a.c === b.c) {
    const step = b.r > a.r ? 1 : -1;
    for (let r = a.r; r !== b.r; r += step) out.push(geo.vtid(Math.min(r, r + step), a.c));
  }
  return out;
}

el.board.addEventListener('contextmenu', (event) => event.preventDefault());

el.board.addEventListener('pointerdown', (event) => {
  if (!game || game.done || !view) return;
  event.preventDefault();
  const p = toBoard(event);
  drag = {
    id: event.pointerId,
    start: p,
    right: event.button === 2,
    moved: false,
    last: nearestVertex(p, 0.75),
    mode: null,
    group: [],
    count: 0,
  };
  el.board.setPointerCapture(event.pointerId);
});

el.board.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId || drag.right) return;
  const p = toBoard(event);
  if (!drag.moved) {
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < DRAG_START) return;
    drag.moved = true;
  }
  const v = nearestVertex(p, VERTEX_REACH);
  if (!v) return;
  if (!drag.last) { drag.last = v; return; }
  if (v.r === drag.last.r && v.c === drag.last.c) return;
  const path = edgesBetween(drag.last, v);
  drag.last = v;
  let changed = false;
  for (const e of path) {
    // 처음 지나간 변이 이미 선이었으면 지우는 끌기다.
    if (!drag.mode) drag.mode = game.edges[e] === R.LINE ? 'erase' : 'draw';
    if (drag.mode === 'draw' && set(e, R.LINE, drag.group)) {
      changed = true;
      Sound.play('line', drag.count++);
    }
    if (drag.mode === 'erase' && game.edges[e] === R.LINE && set(e, R.EMPTY, drag.group)) {
      changed = true;
      Sound.play('erase');
    }
  }
  if (changed) paint();
});

el.board.addEventListener('pointerup', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const one = drag;
  drag = null;
  if (game.done) return;
  if (one.moved) { commit(one.group); return; }

  // 짧게 누른 것은 가장 가까운 변 하나를 바꾼다. 오른쪽 단추는 X를 바로 찍는다.
  const e = nearestEdge(one.start);
  if (e === null) return;
  const now = game.edges[e];
  const next = one.right
    ? (now === R.CROSS ? R.EMPTY : R.CROSS)
    : (now === R.EMPTY ? R.LINE : now === R.LINE ? R.CROSS : R.EMPTY);
  const group = [];
  set(e, next, group);
  Sound.play(next === R.LINE ? 'line' : next === R.CROSS ? 'cross' : 'erase', 0);
  commit(group);
});

el.board.addEventListener('pointercancel', () => {
  if (!drag) return;
  const one = drag;
  drag = null;
  commit(one.group);
});

// --- 진행 ---

function newGame() {
  const made = G.pick(level, game && game.level === level ? game.puzzle.id : -1);
  game = {
    level,
    puzzle: made,
    geo: R.geometry(made.rows, made.cols),
    edges: new Uint8Array(R.geometry(made.rows, made.cols).edgeCount),
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
  const note = [t('slitherlink.note', { size: game.geo.rows })];
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
  SharedDailyUI.report('slitherlink', { level, size: game.geo.rows, time: game.elapsed, hints: game.hinted });
}

// --- 도구 ---

el.undo.addEventListener('click', () => {
  if (game.done || !game.history.length) return;
  const group = game.history.pop();
  for (let i = group.length - 1; i >= 0; i--) game.edges[group[i][0]] = group[i][1];
  Sound.play('erase');
  paint();
});

el.clear.addEventListener('click', () => {
  if (game.done) return;
  const group = [];
  for (let e = 0; e < game.edges.length; e++) set(e, R.EMPTY, group);
  if (!group.length) return;
  game.history.push(group);
  Sound.play('click');
  paint();
});

// 어긋난 선을 걷어 내고, 지금 알아낼 수 있는 변 하나를 채우며 까닭을 알린다. 아무
// 변이나 정답에서 골라 주면 "왜 거기인지 알 수 없는 힌트"가 된다.
function hint() {
  if (game.done) return;
  const trial = game.level === 'hard';
  if (!game.solution) game.solution = S.solve(game.puzzle, { trial, limit: Infinity }).edges;
  const sol = game.solution;
  const group = [];
  let removed = 0;
  for (let e = 0; e < game.edges.length; e++) {
    const mine = game.edges[e];
    const wrong = (mine === R.LINE && sol[e] !== R.LINE) || (mine === R.CROSS && sol[e] === R.LINE);
    if (wrong && set(e, R.EMPTY, group)) removed++;
  }

  // 걷어 낸 것이 있으면 그 번에는 걷기만 한다. 걷고 곧바로 채우면 무엇이 틀렸는지가 묻힌다.
  const step = removed ? null : S.next(game.puzzle, game.edges, { trial });
  const lines = [];
  if (removed) lines.push(t('slitherlink.hintCleared', { count: removed }));
  if (step) {
    for (const e of step.edges) set(e, step.value, group);
    lines.push(t(`slitherlink.why.${step.why.code}`, { clue: step.why.clue }));
    for (const e of step.edges) {
      const node = step.value === R.LINE ? view.segs[e] : view.crosses[e];
      node.classList.add('hinted');
      setTimeout(() => node.classList.remove('hinted'), 1400);
    }
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

// 폭이 바뀌면 칸 크기를 다시 잰다. 판을 다시 그리되 그은 선은 그대로 둔다.
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

window.SlitherDebug = { game: () => game, hint, newGame };

})();

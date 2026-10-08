'use strict';

// 화면과 조작. 규칙은 rules.js, 풀이는 solver.js, 판은 generator.js(구워 둔 puzzles.js)가
// 들고 있고 여기서는 그것들을 부르고 그린다.
//
// **도미노마다 판 위의 조각과 아래 칸을 판을 만들 때 한 번 만들어 두고 보이고 감추기만 한다.**
// 놓을 때마다 요소를 옮기거나 갈아 끼우면 아래 칸의 자리가 밀리고, 눌린 요소가 사라져 조작이
// 끊긴다(저장소 규칙).
(function () {

const R = window.PipsRules;
const S = window.PipsSolver;
const G = window.PipsGenerator;
const Sound = window.PipsSound;
const t = SharedI18n.t;

const LEVELS = [
  { key: 'easy', labelKey: 'ui.easy' },
  { key: 'normal', labelKey: 'ui.medium' },
  { key: 'hard', labelKey: 'ui.hard' },
];
const SAVE_KEY = 'web-games.pips.game';
const BEST_KEY = 'web-games.pips.best';
const COLORS = 8;

// 눈의 자리(12칸 격자). 6은 두 줄 셋이다.
const DOTS = {
  0: [],
  1: [[6, 6]],
  2: [[3, 3], [9, 9]],
  3: [[3, 3], [6, 6], [9, 9]],
  4: [[3, 3], [9, 3], [3, 9], [9, 9]],
  5: [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]],
  6: [[3, 3], [9, 3], [3, 6], [9, 6], [3, 9], [9, 9]],
};
const pipSvg = (v) => `<svg viewBox="0 0 12 12" aria-hidden="true">${
  DOTS[v].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.35" fill="currentColor"/>`).join('')}</svg>`;

const el = {
  app: document.querySelector('.app'),
  board: document.getElementById('board'),
  levels: document.getElementById('levels'),
  tray: document.getElementById('tray'),
  timer: document.getElementById('timer'),
  toast: document.getElementById('toast'),
  undo: document.getElementById('undo'),
  hint: document.getElementById('hint'),
  restart: document.getElementById('restart'),
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
let toastTimer = null;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function toast(text) {
  el.toast.textContent = text;
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

// 이웃한 구역끼리 색이 겹치지 않게 칠한다. 같은 색이 맞닿으면 두 구역이 하나로 읽힌다.
function colorRegions(puzzle) {
  const near = puzzle.regions.map(() => new Set());
  puzzle.adj.forEach((list, c) => {
    const id = puzzle.regionOf[c];
    for (const d of list) {
      const other = puzzle.regionOf[d];
      if (id >= 0 && other >= 0 && other !== id) near[id].add(other);
    }
  });
  const colors = [];
  puzzle.regions.forEach((_, id) => {
    const taken = new Set([...near[id]].map((k) => colors[k]));
    // 같은 색이 판 위쪽에 몰리지 않게 구역 번호로 시작 색을 돌린다.
    let k = (id * 3) % COLORS;
    for (let n = 0; n < COLORS && taken.has(k); n++) k = (k + 1) % COLORS;
    colors[id] = k;
  });
  return colors;
}

// 구역 경계는 굵게, 칸 사이는 가늘게. 가는 선은 오른쪽·아래 칸 몫만 긋고, 굵은 선은 양쪽
// 칸이 1px씩 나눠 그어 2px가 된다. 판 바깥(구멍)과 맞닿은 변은 긋지 않는다 — 칸 바탕만으로
// 판의 모양이 드러난다.
function edgeOf(puzzle, c) {
  const { w, index, regionOf } = puzzle;
  const g = puzzle.pos[c];
  const r = Math.floor(g / w);
  const col = g % w;
  const at = (dr, dc) => {
    const rr = r + dr;
    const cc = col + dc;
    if (rr < 0 || rr >= puzzle.h || cc < 0 || cc >= w) return -1;
    return index[rr * w + cc];
  };
  const other = (d) => regionOf[d] !== regionOf[c];
  const out = [];
  const right = at(0, 1);
  const down = at(1, 0);
  const left = at(0, -1);
  const up = at(-1, 0);
  if (right >= 0) out.push(`inset -1px 0 0 var(${other(right) ? '--region-line' : '--line'})`);
  if (down >= 0) out.push(`inset 0 -1px 0 var(${other(down) ? '--region-line' : '--line'})`);
  if (left >= 0 && other(left)) out.push('inset 1px 0 0 var(--region-line)');
  if (up >= 0 && other(up)) out.push('inset 0 1px 0 var(--region-line)');
  return out.join(', ') || 'none';
}

const badgeText = (region) => ({
  sum: String(region.target), lt: `<${region.target}`, gt: `>${region.target}`, eq: '=', ne: '≠',
}[region.kind]);

function faceOf(first, second, vertical) {
  const face = document.createElement('span');
  face.className = 'face';
  for (const v of [first, second]) {
    const half = document.createElement('span');
    half.className = 'half';
    half.innerHTML = pipSvg(v);
    face.append(half);
  }
  face.classList.toggle('vertical', vertical);
  return face;
}

function build() {
  const puzzle = game.puzzle;
  el.app.style.setProperty('--w', puzzle.w);
  el.board.textContent = '';
  const colors = colorRegions(puzzle);
  const cells = [];
  for (let g = 0; g < puzzle.w * puzzle.h; g++) {
    const c = puzzle.index[g];
    if (c < 0) {
      el.board.append(Object.assign(document.createElement('span'), { className: 'hole' }));
      continue;
    }
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = c;
    const id = puzzle.regionOf[c];
    if (id >= 0) cell.dataset.color = colors[id];
    cell.style.setProperty('--edge', edgeOf(puzzle, c));
    el.board.append(cell);
    cells.push(cell);
  }
  const badges = puzzle.regions.map((region, id) => {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.color = colors[id];
    badge.textContent = badgeText(region);
    // 맨 아래 줄의 가장 오른쪽 칸. 번호가 위→아래, 왼→오른 순이라 가장 큰 번호가 그 칸이다.
    badge.dataset.cell = Math.max(...region.cells);
    el.board.append(badge);
    return badge;
  });
  const pieces = puzzle.tiles.map((_, k) => {
    const piece = document.createElement('button');
    piece.type = 'button';
    piece.className = 'piece';
    piece.dataset.tile = k;
    piece.hidden = true;
    el.board.append(piece);
    return piece;
  });

  el.tray.textContent = '';
  const slots = puzzle.tiles.map((_, k) => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'slot';
    slot.dataset.tile = k;
    el.tray.append(slot);
    return slot;
  });
  view = { cells, badges, pieces, slots };
}

// 칸 폭을 정수 픽셀로 끊는다. CSS의 --cell은 화면 폭에서 나눈 값이라 소수가 되고, 그러면
// 칸마다 안쪽 그림자 선이 다른 쪽으로 반올림돼 굵기가 들쭉날쭉하고 도미노가 칸에서 비껴 앉는다.
function fit() {
  el.board.style.removeProperty('--cell');
  const width = parseFloat(getComputedStyle(view.cells[0]).width);
  el.board.style.setProperty('--cell', `${Math.floor(width)}px`);
  SharedSnap.snap(el.board);
}

// 칸 c의 자리(열, 행).
function spot(c) {
  const g = game.puzzle.pos[c];
  return [g % game.puzzle.w, Math.floor(g / game.puzzle.w)];
}

const px = (n) => `calc(var(--cell) * ${n})`;

function paintPiece(k) {
  const piece = view.pieces[k];
  const p = game.placed[k];
  piece.hidden = !p;
  if (!p) return;
  const [ac, ar] = spot(p.a);
  const [bc, br] = spot(p.b);
  const vertical = ac === bc;
  // 왼쪽(위) 반쪽부터 그린다. 앞 눈이 오른쪽(아래)에 있으면 순서를 바꾼다.
  const firstIsA = vertical ? ar < br : ac < bc;
  const [x, y] = game.puzzle.tiles[k];
  const key = `${p.a},${p.b}`;
  if (piece.dataset.key !== key) {
    piece.dataset.key = key;
    piece.replaceChildren(faceOf(firstIsA ? x : y, firstIsA ? y : x, vertical));
  }
  piece.classList.toggle('vertical', vertical);
  piece.style.left = px(Math.min(ac, bc));
  piece.style.top = px(Math.min(ar, br));
  piece.style.width = `calc(var(--cell) * ${vertical ? 1 : 2})`;
  piece.style.height = `calc(var(--cell) * ${vertical ? 2 : 1})`;
}

// 아래 칸의 도미노. 돌린 방향(0: 앞|뒤, 1: 앞/뒤, 2: 뒤|앞, 3: 뒤/앞)대로 그린다.
function paintSlot(k) {
  const slot = view.slots[k];
  const used = Boolean(game.placed[k]);
  slot.classList.toggle('used', used);
  slot.disabled = used;
  slot.setAttribute('aria-pressed', String(game.picked === k));
  const rot = game.rots[k];
  const [x, y] = game.puzzle.tiles[k];
  const key = String(rot);
  if (slot.dataset.key !== key) {
    slot.dataset.key = key;
    const face = faceOf(rot < 2 ? x : y, rot < 2 ? y : x, rot % 2 === 1);
    face.className = `tile${rot % 2 ? ' vertical' : ''}`;
    slot.replaceChildren(face);
  }
}

function paint() {
  const puzzle = game.puzzle;
  const seen = R.inspect(puzzle, game.placed);
  const wrong = new Set(seen.wrong);
  const done = new Set(seen.done);
  view.badges.forEach((badge, id) => {
    badge.classList.toggle('wrong', wrong.has(id));
    badge.classList.toggle('done', done.has(id));
    const [col, row] = spot(Number(badge.dataset.cell));
    badge.style.left = px(col + 1);
    badge.style.top = px(row + 1);
  });
  puzzle.tiles.forEach((_, k) => { paintPiece(k); paintSlot(k); });
  el.undo.disabled = !game.history.length;
  el.restart.disabled = !game.placed.some(Boolean);
  for (const button of el.levels.children) {
    button.setAttribute('aria-pressed', String(button.dataset.level === game.level));
  }
}

// --- 조작 ---

function snapshot() {
  game.history.push({ placed: game.placed.slice(), rots: game.rots.slice() });
  if (game.history.length > 200) game.history.shift();
}

function started() {
  if (!game.running && !game.done) game.running = true;
}

function pick(k) {
  if (game.done || game.placed[k]) return;
  if (game.picked === k) {
    game.rots[k] = (game.rots[k] + 1) % 4;
    Sound.play('rotate');
  } else {
    game.picked = k;
    Sound.play('pick');
  }
  save();
  paint();
}

function rotate() {
  if (game.picked >= 0) pick(game.picked);
}

// 고른 도미노가 누른 칸을 덮게 놓는다. 보이는 모양 그대로, 누른 칸에 왼쪽(위) 반쪽을 두고
// 안 되면 오른쪽(아래) 반쪽을 둔다 — 판 끝이나 놓인 도미노 옆을 눌렀을 때 한 칸 비켜 맞춘다.
function drop(c) {
  if (game.done) return;
  const k = game.picked;
  if (k < 0) { toast(t('pips.pickFirst')); return; }
  const rot = game.rots[k];
  const vertical = rot % 2 === 1;
  const [col, row] = spot(c);
  const cellAt = (cc, rr) => {
    const { w, h, index } = game.puzzle;
    return cc < 0 || cc >= w || rr < 0 || rr >= h ? -1 : index[rr * w + cc];
  };
  const [dc, dr] = vertical ? [0, 1] : [1, 0];
  const tries = [[c, cellAt(col + dc, row + dr)], [cellAt(col - dc, row - dr), c]];
  const fit = tries.find(([first, second]) => R.fits(game.puzzle, game.placed, first, second, k));
  if (!fit) { Sound.play('conflict'); toast(t('pips.noRoom')); return; }
  started();
  snapshot();
  const [first, second] = fit;
  game.placed[k] = rot < 2 ? { a: first, b: second } : { a: second, b: first };
  game.picked = -1;
  const piece = view.pieces[k];
  piece.classList.remove('dropped');
  void piece.offsetWidth;
  piece.classList.add('dropped');
  // 놓자마자 구역이 어긋나면 다른 소리를 낸다. 빨간 표를 놓쳐도 귀로 걸린다.
  const before = new Set(R.inspect(game.puzzle, game.history[game.history.length - 1].placed).wrong);
  const broke = R.inspect(game.puzzle, game.placed).wrong.some((id) => !before.has(id));
  Sound.play(broke ? 'conflict' : 'place');
  afterChange();
}

// 놓인 도미노를 아래로 되돌리고 바로 고른 채로 둔다. 다른 자리로 옮기려고 들어 올리는 일이
// 대부분이라, 다시 고르게 하면 한 번 더 눌러야 한다. 방향은 판에 놓였던 모양 그대로 둔다.
function lift(k) {
  if (game.done) return;
  const p = game.placed[k];
  if (!p) return;
  snapshot();
  const [ac, ar] = spot(p.a);
  const [bc, br] = spot(p.b);
  const vertical = ac === bc;
  const aFirst = vertical ? ar < br : ac < bc;
  game.rots[k] = (vertical ? 1 : 0) + (aFirst ? 0 : 2);
  game.placed[k] = null;
  game.picked = k;
  Sound.play('pick');
  afterChange();
}

function undo() {
  if (game.done) return;
  const last = game.history.pop();
  if (!last) return;
  game.placed = last.placed;
  game.rots = last.rots;
  game.picked = -1;
  Sound.play('pick');
  save();
  paint();
}

function restart() {
  if (game.done || !game.placed.some(Boolean)) return;
  snapshot();
  game.placed = game.placed.map(() => null);
  game.picked = -1;
  Sound.play('click');
  afterChange();
}

function afterChange() {
  save();
  paint();
  if (R.inspect(game.puzzle, game.placed).solved) finish();
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
  game.picked = -1;
  Sound.play('win');
  showResult();
  save();
  paint();
  SharedDailyUI.report('pips', { level: game.level, time: game.elapsed, hints: game.hinted });
}

function flash(tiles) {
  for (const k of tiles) {
    const piece = view.pieces[k];
    piece.classList.remove('hinted');
    void piece.offsetWidth;
    piece.classList.add('hinted');
    setTimeout(() => piece.classList.remove('hinted'), 900);
  }
}

// 틀린 도미노가 있으면 먼저 짚고, 없으면 지금 판에서 새로 정할 수 있는 도미노 하나를 까닭과
// 함께 놓는다. 정답에서 아무 도미노나 골라 주면 "왜 거기인지 알 수 없는 힌트"가 된다.
function hint() {
  if (game.done) return;
  const puzzle = game.puzzle;
  if (!game.solution) {
    const solved = S.solve(puzzle, { trial: true, limit: Infinity });
    game.solution = solved.solved ? solved.placed : S.search(puzzle, 1)[0];
  }
  const sol = game.solution;
  const sameSpot = (p, q) => (p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a);
  const misplaced = game.placed.findIndex((p, k) => p && !sameSpot(p, sol[k]));
  if (misplaced >= 0) {
    flash([misplaced]);
    Sound.play('conflict');
    toast(t('pips.wrong'));
    return;
  }
  // 자리는 다 맞는데 끝까지 갈 수 없으면 방향이 틀린 것이다. 정답과 방향이 다른 것을 짚는다 —
  // 뒤집어도 되는 도미노가 있어 정답과 다르다고 다 틀린 것은 아니라서, 막혔을 때만 본다.
  if (!S.search(puzzle, 1, game.placed).length) {
    const flipped = game.placed.findIndex((p, k) => p && p.a !== sol[k].a
      && puzzle.tiles[k][0] !== puzzle.tiles[k][1]);
    flash([flipped >= 0 ? flipped : game.placed.findIndex(Boolean)]);
    Sound.play('conflict');
    toast(t('pips.wrongWay'));
    return;
  }
  const step = S.hint(puzzle, game.placed);
  if (!step) { toast(t('pips.noStep')); return; }
  started();
  game.hinted++;
  snapshot();
  game.placed[step.t] = { a: step.a, b: step.b };
  if (game.picked === step.t) game.picked = -1;
  afterChange();
  flash([step.t]);
  if (step.why.cell !== undefined && view.cells[step.why.cell]) {
    const node = view.cells[step.why.cell];
    node.classList.add('hinted');
    setTimeout(() => node.classList.remove('hinted'), 900);
  }
  Sound.play('hint');
  toast(t(`pips.why.${step.why.code}`));
}

// --- 저장 ---

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      level: game.level,
      id: game.id,
      code: game.code,
      placed: game.placed.map((p) => (p ? [p.a, p.b] : null)),
      rots: game.rots,
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
  // 판을 다시 구우면 같은 번호가 다른 판이 된다. 적어 둔 판 자료로 가린다.
  if (G.PUZZLES[saved.level][saved.id] !== saved.code) return false;
  start({ id: saved.id, level: saved.level, code: saved.code, ...R.parse(saved.code) });
  const placed = game.placed.slice();
  (saved.placed || []).slice(0, placed.length).forEach((p, k) => {
    if (Array.isArray(p) && R.fits(game.puzzle, placed, p[0], p[1])) placed[k] = { a: p[0], b: p[1] };
  });
  game.placed = placed;
  game.rots = game.rots.map((_, k) => (saved.rots && [0, 1, 2, 3].includes(saved.rots[k]) ? saved.rots[k] : 0));
  game.elapsed = saved.elapsed || 0;
  game.hinted = saved.hinted || 0;
  game.done = Boolean(saved.done) && R.inspect(game.puzzle, game.placed).solved;
  game.recorded = game.done;
  game.running = !game.done && game.placed.some(Boolean);
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
    placed: made.tiles.map(() => null),
    rots: made.tiles.map(() => 0),
    picked: -1,
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
  const piece = event.target.closest('.piece');
  if (piece) { lift(Number(piece.dataset.tile)); return; }
  const cell = event.target.closest('.cell');
  if (cell) drop(Number(cell.dataset.index));
});

el.tray.addEventListener('click', (event) => {
  const slot = event.target.closest('.slot');
  if (slot && !slot.disabled) pick(Number(slot.dataset.tile));
});

el.undo.addEventListener('click', undo);
el.hint.addEventListener('click', hint);
el.restart.addEventListener('click', restart);
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
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); rotate(); }
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

window.PipsDebug = { game: () => game, hint, newGame };

})();

'use strict';

// 화면과 조작. 규칙은 rules.js, 판 만들기는 generator.js가 들고 있고 여기서는 그것들을
// 부르고 그린다.
//
// **판은 SVG 하나에 그리고, 노드는 판을 만들 때 한 번만 만든다.** 다리는 자리마다
// 선 두 줄을 미리 넣어 두고 보이고 감추기만 한다 — 누를 때마다 지웠다 다시 만들면
// 손가락 밑의 요소가 사라져 두드림이 끊긴다.
(function () {

const R = window.HashiRules;
const G = window.HashiGenerator;
const S = window.HashiSolver;
const Sound = window.HashiSound;
const NS = 'http://www.w3.org/2000/svg';

const SIZES = [{ label: '작게', n: 9 }, { label: '보통', n: 11 }, { label: '크게', n: 13 }];
const SIZE_KEY = 'web-games.hashi.size';
const BEST_KEY = 'web-games.hashi.best';

// 한 칸의 크기(SVG 단위). 100으로 두면 섬 반지름·다리 간격을 정수로 적을 수 있다.
const CELL = 100;
const ISLAND_R = 34;
const GAP = 13;   // 다리 두 줄 사이

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

let size = Number(localStorage.getItem(SIZE_KEY)) || 11;
let game = null;
let view = null;
let toastTimer = null;
let clock = null;
// 고른 섬. 섬을 누르고 이어질 섬을 누르는 길을 함께 둔다 — 두 통로가 교차하는 자리는
// 거리로 고르면 어느 쪽인지 애매해서, 섬 두 개로 가리키는 편이 확실하다.
let picked = null;

function svg(name, attrs, cls) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (cls) node.setAttribute('class', cls);
  return node;
}

const center = (v) => v * CELL + CELL / 2;

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

function toast(text) {
  el.toast.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 1800);
}

// --- 판 만들기 ---

function build() {
  const { puzzle, board } = game;
  el.board.textContent = '';
  el.board.setAttribute('viewBox', `0 0 ${puzzle.w * CELL} ${puzzle.h * CELL}`);

  const guides = svg('g');
  const bridges = svg('g');
  const islands = svg('g');
  el.board.append(guides, bridges, islands);

  // **누르는 자리는 판 전체 하나다.** 자리마다 사각형을 깔았더니 판의 43%만 눌렸고,
  // 통로를 조금만 벗어나면 아무 일도 일어나지 않았다. 어디를 누르든 가장 가까운
  // 자리를 찾아 주는 편이 손가락에 맞다(linkAt).
  el.board.append(svg('rect', {
    x: 0, y: 0, width: puzzle.w * CELL, height: puzzle.h * CELL,
  }, 'hit'));

  const lines = board.links.map((link) => {
    const a = board.islands[link.a];
    const b = board.islands[link.b];
    // 놓을 수 있는 자리를 미리 깔아 둔다. 다리와 같은 자리에 그리므로 다리가 놓이면
    // 가려지지 않게 감춘다(paint).
    const guide = link.horizontal
      ? svg('line', {
        x1: center(a.x) + ISLAND_R, y1: center(a.y),
        x2: center(b.x) - ISLAND_R, y2: center(b.y),
      }, 'guide')
      : svg('line', {
        x1: center(a.x), y1: center(a.y) + ISLAND_R,
        x2: center(b.x), y2: center(b.y) - ISLAND_R,
      }, 'guide');
    guides.append(guide);

    const pair = [];
    for (const side of [-1, 1]) {
      const off = side * GAP;
      const line = link.horizontal
        ? svg('line', {
          x1: center(a.x) + ISLAND_R, y1: center(a.y) + off,
          x2: center(b.x) - ISLAND_R, y2: center(b.y) + off,
        }, 'bridge')
        : svg('line', {
          x1: center(a.x) + off, y1: center(a.y) + ISLAND_R,
          x2: center(b.x) + off, y2: center(b.y) - ISLAND_R,
        }, 'bridge');
      line.setAttribute('opacity', '0');
      bridges.append(line);
      pair.push(line);
    }
    // 하나짜리는 가운데 한 줄로 그린다. 두 줄 중 하나만 켜면 다리가 한쪽으로 쏠린다.
    const single = link.horizontal
      ? svg('line', {
        x1: center(a.x) + ISLAND_R, y1: center(a.y),
        x2: center(b.x) - ISLAND_R, y2: center(b.y),
      }, 'bridge')
      : svg('line', {
        x1: center(a.x), y1: center(a.y) + ISLAND_R,
        x2: center(b.x), y2: center(b.y) - ISLAND_R,
      }, 'bridge');
    single.setAttribute('opacity', '0');
    bridges.append(single);

    return { guide, pair, single, shown: -1, guided: null };
  });

  const marks = board.islands.map((island) => {
    const g = svg('g');
    const circle = svg('circle', { cx: center(island.x), cy: center(island.y), r: ISLAND_R }, 'island');
    const text = svg('text', { x: center(island.x), y: center(island.y) + 2 }, 'count');
    text.textContent = String(island.need);
    g.append(circle, text);
    islands.append(g);
    return { circle, text, done: false };
  });

  view = { lines, marks };
}

function newGame() {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const made = G.generate(seed, size);
  const board = R.board(made.puzzle);
  game = {
    puzzle: made.puzzle,
    board,
    answer: made.answer,
    state: R.newState(board),
    undo: [],
    hinted: false,
    startedAt: 0,
    elapsed: 0,
    done: false,
  };
  picked = null;
  el.result.hidden = true;
  el.toast.textContent = '점선을 누르거나, 섬을 누르고 이어질 섬을 누르세요.';
  el.timer.textContent = '0:00';
  showBest();
  build();
  paint();
}

// --- 그리기 ---

function paint() {
  const { board, state } = game;

  const full = board.islands.map((island) => R.degree(board, state, island.id) === island.need);

  board.links.forEach((link, i) => {
    const node = view.lines[i];
    const n = state[link.id];
    // 안내 점선은 다리 수뿐 아니라 양쪽 섬이 찼는지에 따라서도 바뀌므로 따로 본다.
    const guided = n === 0 && !(full[link.a] && full[link.b]);
    if (guided !== node.guided) {
      node.guided = guided;
      node.guide.setAttribute('opacity', guided ? '1' : '0');
    }
    if (n === node.shown) return;
    node.shown = n;
    node.single.setAttribute('opacity', n === 1 ? '1' : '0');
    for (const line of node.pair) line.setAttribute('opacity', n === 2 ? '1' : '0');
  });

  for (const island of board.islands) {
    const node = view.marks[island.id];
    node.done = full[island.id];
    node.text.setAttribute('class', node.done ? 'count done' : 'count');
  }
  paintPick();

  el.undo.disabled = game.done || !game.undo.length;
  el.clear.disabled = game.done || !state.some((n) => n > 0);
  el.hint.disabled = game.done;
}

// 고른 섬과 거기서 이을 수 있는 섬·통로를 표시한다. 섬 하나가 여러 상태를 겹쳐
// 가지므로(다 참 / 고름 / 이을 수 있음) 클래스는 한 곳에서 만들어 붙인다.
function paintPick() {
  const partners = new Set();
  if (picked !== null) {
    for (const link of game.board.links) {
      if (link.a === picked) partners.add(link.b);
      else if (link.b === picked) partners.add(link.a);
    }
  }

  for (const island of game.board.islands) {
    const node = view.marks[island.id];
    let cls = node.done ? 'island done' : 'island';
    if (island.id === picked) cls += ' picked';
    else if (partners.has(island.id)) cls += ' near';
    node.circle.setAttribute('class', cls);
  }

  game.board.links.forEach((link, i) => {
    const hot = picked !== null && (link.a === picked || link.b === picked);
    view.lines[i].guide.setAttribute('class', hot ? 'guide hot' : 'guide');
  });
}

function tick() {
  if (!game.startedAt || game.done) return;
  game.elapsed = Date.now() - game.startedAt;
  el.timer.textContent = formatTime(game.elapsed);
}

// --- 진행 ---

function startClock() {
  if (game.startedAt) return;
  game.startedAt = Date.now();
  clock = setInterval(tick, 250);
}

function finish() {
  game.done = true;
  clearInterval(clock);
  tick();

  const best = loadBest();
  let note = `${formatTime(game.elapsed)}`;
  if (game.hinted) {
    note += ' · 힌트를 써서 기록에는 넣지 않습니다';
  } else if (!best[size] || game.elapsed < best[size]) {
    best[size] = game.elapsed;
    saveBest(best);
    showBest();
    note += ' · 최고 기록';
  }

  el.resultTitle.textContent = '다 이었습니다';
  el.resultNote.textContent = note;
  el.result.hidden = false;
  Sound.play('win');
}

function push() {
  game.undo.push(game.state.slice());
  if (game.undo.length > 200) game.undo.shift();
}

function place(li) {
  const before = game.state[li];
  push();
  const after = R.cycle(game.board, game.state, li);
  if (after === before) {
    game.undo.pop();
    toast('여기에는 더 놓을 수 없습니다');
    return;
  }
  startClock();
  el.toast.textContent = '';
  Sound.play(after === 0 ? 'erase' : 'place', after);
  paint();
  if (R.isDone(game.board, game.state)) finish();
}

// 누른 자리에서 가장 가까운 다리 자리. 통로에서 이만큼 떨어진 곳까지 받는다 —
// 나란한 통로는 한 칸씩 떨어져 있으므로 반 칸을 넘겨 잡아도 서로 넘보지 않는다.
const REACH = CELL * 0.62;
// 섬을 누른 것으로 치는 거리. 섬 그림보다 조금 넉넉하게 잡는다.
const ISLAND_REACH = ISLAND_R + 6;

function distanceToLink(link, x, y) {
  const a = game.board.islands[link.a];
  const b = game.board.islands[link.b];
  // 섬에 가린 부분을 뺀 통로만 잰다. 섬까지 넣으면 한 섬에 모인 자리들이 모두 거리
  // 0이 되어 어느 쪽으로 눌렀는지가 사라진다.
  const x1 = link.horizontal ? center(a.x) + ISLAND_R : center(a.x);
  const y1 = link.horizontal ? center(a.y) : center(a.y) + ISLAND_R;
  const x2 = link.horizontal ? center(b.x) - ISLAND_R : center(b.x);
  const y2 = link.horizontal ? center(b.y) : center(b.y) - ISLAND_R;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
  return Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
}

// 이 자리에서 무엇이든 일어나는가. 다리가 놓여 있으면 언제나 걷을 수 있고, 빈 자리는
// 하나를 놓을 수 있어야 한다(가로지르는 다리에 막히면 그렇지 못하다).
function usable(li) {
  return game.state[li] > 0 || R.canSet(game.board, game.state, li, 1);
}

// 누른 자리가 무엇인가. 섬이면 `{ island }`, 통로면 `{ link }`, 아무것도 아니면 null.
function spotAt(event) {
  if (event.clientX === undefined) return null;
  const rect = el.board.getBoundingClientRect();
  const box = el.board.viewBox.baseVal;
  if (!rect.width || !rect.height) return null;
  const x = box.x + (event.clientX - rect.left) / rect.width * box.width;
  const y = box.y + (event.clientY - rect.top) / rect.height * box.height;

  for (const island of game.board.islands) {
    if (Math.hypot(center(island.x) - x, center(island.y) - y) <= ISLAND_REACH) {
      return { island: island.id };
    }
  }

  const near = game.board.links
    .map((link) => ({ id: link.id, gap: distanceToLink(link, x, y) }))
    .filter((one) => one.gap <= REACH)
    .sort((one, two) => one.gap - two.gap);
  if (!near.length) return null;
  // 막힌 자리가 조금 더 가깝다고 그것을 집으면 누를 때마다 "놓을 수 없습니다"만 뜬다.
  // 손이 닿은 자리 중에 할 수 있는 것이 있으면 그것을 고른다.
  const open = near.find((one) => usable(one.id));
  return { link: (open || near[0]).id };
}

function linkBetween(a, b) {
  const link = game.board.links.find((one) =>
    (one.a === a && one.b === b) || (one.a === b && one.b === a));
  return link ? link.id : null;
}

// 섬을 눌렀을 때. 처음이면 고르고, 이을 수 있는 섬을 이어서 누르면 그 자리에 놓는다.
function tapIsland(id) {
  if (picked === null || picked === id) {
    picked = picked === id ? null : id;
    Sound.play('click');
    paintPick();
    return;
  }
  const li = linkBetween(picked, id);
  picked = null;
  if (li === null) {
    // 이을 수 없는 두 섬이면 방금 누른 섬을 새로 고른다 — 여기서 아무것도 안 하면
    // 엇갈려 누를 때마다 고른 것이 사라진다.
    picked = id;
    paintPick();
    Sound.play('click');
    return;
  }
  paintPick();
  place(li);
}

el.board.addEventListener('click', (event) => {
  if (game.done) return;
  const spot = spotAt(event);
  if (!spot) {
    if (picked === null) return;
    picked = null;
    paintPick();
    return;
  }
  if (spot.island !== undefined) { tapIsland(spot.island); return; }
  picked = null;
  place(spot.link);
});

el.undo.addEventListener('click', () => {
  if (!game.undo.length) return;
  game.state = game.undo.pop();
  Sound.play('erase');
  paint();
});

el.clear.addEventListener('click', () => {
  push();
  game.state = R.newState(game.board);
  Sound.play('erase');
  paint();
});

// 어긋난 다리를 먼저 치우고, 없으면 다음 한 자리를 놓아 준다. 잘못 놓은 것을 그대로
// 둔 채 정답 한 자리를 더해 주면 판이 더 꼬인다.
el.hint.addEventListener('click', () => {
  const { board, state, answer } = game;
  const wrong = board.links.find((l) => state[l.id] > answer[l.id]);
  const missing = board.links.find((l) => state[l.id] < answer[l.id]);
  const link = wrong || missing;
  if (!link) return;

  push();
  game.hinted = true;
  game.state[link.id] = answer[link.id];
  startClock();
  Sound.play('hint');
  toast(wrong ? '어긋난 다리를 치웠습니다' : '다리 하나를 놓았습니다');
  paint();
  if (R.isDone(board, game.state)) finish();
});

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
    Sound.play('click');
    clearInterval(clock);
    newGame();
  });
  el.sizes.append(button);
}

el.newGame.addEventListener('click', () => { Sound.play('click'); clearInterval(clock); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); clearInterval(clock); newGame(); });

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

// 풀이기는 화면에서 쓰지 않지만, 판이 이상할 때 콘솔에서 바로 확인할 수 있게 열어 둔다.
window.HashiDebug = { game: () => game, solver: S, spotAt, picked: () => picked };

})();

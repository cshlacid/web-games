'use strict';

// 화면과 조작. 규칙은 rules.js, 판 자료는 levels.js에 있고 여기서는 그것들을 부르고
// 그린다.
//
// **상자와 사람은 판을 만들 때 한 번 만들고 자리만 옮긴다.** 옮겨 가는 모습은 CSS
// 전환이 맡고, 손가락 밑의 요소를 갈아 끼우지 않는다(저장소 전체 규칙).
(function () {

const R = window.SokobanRules;
const L = window.SokobanLevels;
const Sound = window.SokobanSound;
const t = SharedI18n.t;
const NS = 'http://www.w3.org/2000/svg';

const LEVEL_KEY = 'web-games.sokoban.level';
const SOLVED_KEY = 'web-games.sokoban.solved';
// 두던 판. 판 하나에 수백 걸음이 들 수 있어 새로고침에 날아가면 억울하다.
const PLAY_KEY = 'web-games.sokoban.play';
const MIN_CELL = 12;
const MAX_CELL = 52;
// 이보다 적게 움직였으면 쓴 것이 아니라 누른 것으로 친다.
const TAP = 12;
// 누른 칸까지 걸어갈 때 걸음 사이 간격. style.css의 `.mover` 전환 길이와 맞춘다.
const WALK_MS = 80;
// 되돌리기를 무한히 쌓지 않는다. 판 하나를 처음부터 다시 두는 것보다 긴 기록은 쓸 일이 없다.
const UNDO_MAX = 1000;

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

const el = {
  board: document.getElementById('board'),
  levelOpen: document.getElementById('level-open'),
  levelSheet: document.getElementById('levels'),
  levelGrid: document.getElementById('level-grid'),
  count: document.getElementById('count'),
  solved: document.getElementById('solved'),
  undo: document.getElementById('undo'),
  reset: document.getElementById('reset'),
  next: document.getElementById('next'),
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
let walk = null;
let touch = null;
let levelSheet = null;
let helpSheet = null;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 무시 */ }
}

// 판마다 가장 적은 걸음과 그때 민 횟수.
const solved = read(SOLVED_KEY, {});

function showSolved() {
  el.solved.textContent = t('sokoban.solvedCount', {
    count: Object.keys(solved).length, total: L.LEVELS.length,
  });
}

// --- 판 만들기 ---

function svg(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (parent) parent.append(node);
  return node;
}

// 칸 크기. 폭과 높이 둘 다에 맞춘다 — 세운 판은 서른 줄까지 가서 폭만 보면 도구줄이
// 화면 밖으로 밀려난다.
function measure(level) {
  const room = el.board.clientWidth;
  const tall = Math.max(240, window.innerHeight * 0.62);
  return Math.max(MIN_CELL, Math.min(MAX_CELL,
    Math.floor(Math.min(room / level.w, tall / level.h))));
}

// 칸들을 경로 하나로 긋는다. 칸마다 사각형을 두면 이웃한 사각형의 경계가 각자
// 반투명하게 칠해져 바닥에 실금이 간다.
function cells(level, pick) {
  let d = '';
  for (let at = 0; at < level.w * level.h; at++) {
    if (!pick(at)) continue;
    d += `M${at % level.w} ${Math.floor(at / level.w)}h1v1h-1z`;
  }
  return d;
}

function build() {
  const level = game.level;
  const cell = measure(level);
  el.board.textContent = '';

  // 크기를 속성으로 직접 준다. viewBox가 칸 단위라 그리는 좌표는 칸 번호 그대로다.
  const root = svg('svg', {
    width: level.w * cell, height: level.h * cell,
    viewBox: `0 0 ${level.w} ${level.h}`,
  }, el.board);

  // 벽 바깥의 빈칸은 판이 아니다. 155번처럼 벽에 갇힌 목표 칸은 바닥으로 칠해 둔다.
  svg('path', { class: 'floor', d: cells(level, (at) => level.floor[at] || level.goals[at]) }, root);
  svg('path', { class: 'wall', d: cells(level, (at) => level.walls[at]) }, root);
  // 벽 윗면을 조금 밝게 얹어 바닥과 높이가 다른 것을 보인다.
  const tops = svg('g', { class: 'wall-top' }, root);
  for (let at = 0; at < level.w * level.h; at++) {
    if (!level.walls[at]) continue;
    svg('rect', { x: at % level.w + 0.08, y: Math.floor(at / level.w) + 0.08, width: 0.84, height: 0.62, rx: 0.12 }, tops);
  }

  for (let at = 0; at < level.w * level.h; at++) {
    if (!level.goals[at]) continue;
    svg('circle', { class: 'goal', cx: at % level.w + 0.5, cy: Math.floor(at / level.w) + 0.5, r: 0.2 }, root);
  }

  const boxes = game.state.boxes.map(() => {
    const g = svg('g', { class: 'mover box' }, root);
    svg('rect', { class: 'box-body', x: 0.1, y: 0.1, width: 0.8, height: 0.8, rx: 0.12 }, g);
    svg('path', { class: 'box-mark', d: 'M0.3 0.3 L0.7 0.7 M0.7 0.3 L0.3 0.7' }, g);
    return g;
  });

  const player = svg('g', { class: 'mover player' }, root);
  svg('circle', { class: 'player-body', cx: 0.5, cy: 0.5, r: 0.34 }, player);
  // 눈은 바라보는 쪽으로 조금 비킨다. 사람이 어느 쪽을 향해 섰는지가 밀 방향이다.
  const eyes = svg('g', { class: 'eyes' }, player);
  svg('circle', { class: 'player-eye', cx: 0.4, cy: 0.45, r: 0.065 }, eyes);
  svg('circle', { class: 'player-eye', cx: 0.6, cy: 0.45, r: 0.065 }, eyes);

  view = { root, boxes, player, eyes };
  SharedSnap.snap(root);

  // 새로 만든 요소는 제자리를 받는 순간 왼쪽 위에서 미끄러져 온다. 첫 자리를 잡는
  // 동안만 전환을 끈다 — 두 프레임을 기다려야 자리가 칠해진 뒤에 풀린다.
  root.classList.add('still');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('still')));
}

// --- 그리기 ---

function spot(node, at) {
  const w = game.level.w;
  node.style.transform = `translate(${at % w}px, ${Math.floor(at / w)}px)`;
}

function paint() {
  const { level, state } = game;
  state.boxes.forEach((at, id) => {
    spot(view.boxes[id], at);
    view.boxes[id].classList.toggle('on', !!level.goals[at]);
  });
  spot(view.player, state.player);
  const dir = R.DIRS[game.facing] || [0, 1];
  view.eyes.style.transform = `translate(${dir[0] * 0.09}px, ${dir[1] * 0.09}px)`;

  el.count.textContent = t('sokoban.count', { moves: game.moves, pushes: game.pushes });
  el.levelOpen.textContent = t('sokoban.level', { n: game.index + 1 });
  el.undo.disabled = game.done || !game.undo.length;
  el.reset.disabled = game.done || !game.moves;
}

// --- 진행 ---

function load(index, resume) {
  stopWalk();
  const count = L.LEVELS.length;
  index = ((index % count) + count) % count;
  const level = R.parse(R.upright(L.LEVELS[index]));
  // 판 자료가 바뀌었으면 남겨 둔 자리가 맞지 않는다. 상자 수가 다르면 버린다.
  const kept = resume && resume.index === index && Array.isArray(resume.boxes)
    && resume.boxes.length === level.start.boxes.length ? resume : null;
  game = {
    index,
    level,
    state: kept ? { player: kept.player, boxes: kept.boxes.slice() } : { player: level.start.player, boxes: level.start.boxes.slice() },
    moves: kept ? kept.moves : 0,
    pushes: kept ? kept.pushes : 0,
    facing: 'down',
    undo: [],
    done: false,
  };
  write(LEVEL_KEY, index);
  el.result.hidden = true;
  build();
  paint();
  save();
}

// 두던 판을 남긴다. 되돌리기 기록까지는 남기지 않는다 — 다시 열었을 때 이어서 두는
// 것이 목적이지 지난 걸음을 되짚는 것이 아니다.
function save() {
  if (game.done || !game.moves) {
    try { localStorage.removeItem(PLAY_KEY); } catch { /* 무시 */ }
    return;
  }
  write(PLAY_KEY, {
    index: game.index,
    player: game.state.player,
    boxes: game.state.boxes,
    moves: game.moves,
    pushes: game.pushes,
  });
}

function snapshot() {
  return {
    state: { player: game.state.player, boxes: game.state.boxes.slice() },
    moves: game.moves,
    pushes: game.pushes,
    facing: game.facing,
  };
}

function remember() {
  game.undo.push(snapshot());
  if (game.undo.length > UNDO_MAX) game.undo.shift();
}

function finish() {
  game.done = true;
  stopWalk();
  const key = String(game.index + 1);
  const before = solved[key];
  const best = !before || game.moves < before.moves;
  SharedDailyUI.report('sokoban', { fresh: !before, improved: Boolean(before) && game.moves < before.moves });
  if (best) {
    solved[key] = { moves: game.moves, pushes: game.pushes };
    write(SOLVED_KEY, solved);
  }
  save();
  showSolved();
  paint();
  // 마지막 상자가 목표에 닿는 모습을 본 다음에 덮는다.
  setTimeout(() => {
    if (!game.done) return;
    el.resultTitle.textContent = t('sokoban.done');
    const note = [t('sokoban.count', { moves: game.moves, pushes: game.pushes })];
    if (best && before) note.push(t('sokoban.noteBest'));
    if (!best) note.push(t('sokoban.notePrev', { moves: before.moves }));
    el.resultNote.textContent = note.join(' · ');
    el.result.hidden = false;
    Sound.play('win');
  }, WALK_MS * 2);
}

// 한 걸음. 되돌리기 기록은 부르는 쪽이 남긴다 — 누른 칸까지 걸어간 길은 한 번에
// 되돌려야 해서 걸음마다 남기면 안 된다.
function move(dir, quiet) {
  if (game.done) return false;
  game.facing = dir;
  const out = R.step(game.level, game.state, dir);
  if (!out) {
    if (!quiet) Sound.play('bump');
    paint();
    return false;
  }
  game.state = out.state;
  game.moves++;
  if (out.box >= 0) {
    game.pushes++;
    Sound.play(game.level.goals[out.state.boxes[out.box]] ? 'goal' : 'push');
  } else if (!quiet) {
    Sound.play('step');
  }
  paint();
  if (R.isDone(game.level, game.state)) finish();
  else save();
  return true;
}

function stepOnce(dir) {
  stopWalk();
  if (game.done) return;
  const before = snapshot();
  if (move(dir)) {
    game.undo.push(before);
    if (game.undo.length > UNDO_MAX) game.undo.shift();
    paint();
  }
}

function stopWalk() {
  if (!walk) return;
  clearTimeout(walk.timer);
  walk = null;
}

// 누른 칸까지 걷는다. 한 걸음씩 전환을 태워 옮기므로 사람이 길을 따라가는 것이 보인다.
function walkTo(route) {
  stopWalk();
  if (!route.length) return;
  remember();
  walk = { route, index: 0, timer: null };
  const tick = () => {
    if (!walk) return;
    const dir = walk.route[walk.index++];
    move(dir, true);
    Sound.play('step');
    if (walk && walk.index < walk.route.length && !game.done) {
      walk.timer = setTimeout(tick, WALK_MS);
    } else {
      walk = null;
    }
  };
  tick();
}

// --- 누르기와 쓸기 ---
//
// **click이 아니라 포인터 이벤트로 짠다.** 판에 touch-action: none을 걸었고, 공용
// base.js가 그 자리의 touchend를 취소하므로 click이 나지 않는다.

function cellAt(event) {
  const box = view.root.getBoundingClientRect();
  const x = Math.floor((event.clientX - box.left) / (box.width / game.level.w));
  const y = Math.floor((event.clientY - box.top) / (box.height / game.level.h));
  if (x < 0 || y < 0 || x >= game.level.w || y >= game.level.h) return -1;
  return y * game.level.w + x;
}

function tapAt(event) {
  const target = cellAt(event);
  if (target < 0 || target === game.state.player) return;
  // 바로 옆 칸이면 걷거나 미는 한 걸음이다. 옆 상자를 누르는 것이 곧 미는 것이다.
  const dir = R.dirBetween(game.level, game.state.player, target);
  if (dir) { stepOnce(dir); return; }
  const route = R.path(game.level, game.state, target);
  if (route) walkTo(route);
  else Sound.play('bump');
}

el.board.addEventListener('pointerdown', (event) => {
  if (!game || game.done) return;
  event.preventDefault();
  touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
  el.board.setPointerCapture(event.pointerId);
});

el.board.addEventListener('pointerup', (event) => {
  if (!touch || touch.id !== event.pointerId) return;
  const dx = event.clientX - touch.x;
  const dy = event.clientY - touch.y;
  touch = null;
  if (game.done) return;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < TAP) { tapAt(event); return; }
  // 쓴 방향으로 한 걸음. 비스듬히 쓸었으면 더 많이 간 쪽을 따른다.
  if (Math.abs(dx) > Math.abs(dy)) stepOnce(dx > 0 ? 'right' : 'left');
  else stepOnce(dy > 0 ? 'down' : 'up');
});

el.board.addEventListener('pointercancel', () => { touch = null; });

document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (levelSheet.isOpen() || helpSheet.isOpen()) return;
  const dir = KEYS[event.key];
  if (dir) {
    event.preventDefault();
    stepOnce(dir);
  } else if (event.key === 'z' || event.key === 'Z' || event.key === 'Backspace') {
    event.preventDefault();
    undo();
  }
});

// --- 도구 ---

function undo() {
  stopWalk();
  if (!game.undo.length || game.done) return;
  const back = game.undo.pop();
  game.state = back.state;
  game.moves = back.moves;
  game.pushes = back.pushes;
  game.facing = back.facing;
  Sound.play('step');
  paint();
  save();
}

el.undo.addEventListener('click', undo);

el.reset.addEventListener('click', () => {
  stopWalk();
  if (game.done || !game.moves) return;
  remember();
  game.state = { player: game.level.start.player, boxes: game.level.start.boxes.slice() };
  game.moves = 0;
  game.pushes = 0;
  game.facing = 'down';
  Sound.play('click');
  paint();
  save();
});

el.next.addEventListener('click', () => { Sound.play('click'); load(game.index + 1); });
el.again.addEventListener('click', () => { Sound.play('click'); load(game.index + 1); });

// --- 판 고르기 ---

function fillLevels() {
  el.levelGrid.textContent = '';
  L.LEVELS.forEach((_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level-cell';
    button.textContent = String(index + 1);
    if (solved[String(index + 1)]) button.classList.add('solved');
    if (index === game.index) button.classList.add('current');
    button.addEventListener('click', () => {
      Sound.play('click');
      levelSheet.close();
      if (index !== game.index) load(index);
    });
    el.levelGrid.append(button);
  });
}

levelSheet = window.SharedSheet.bind({ sheet: el.levelSheet, opener: el.levelOpen, onOpen: fillLevels });

// 폭이 바뀌면 칸 크기를 다시 잰다. 판을 다시 만들되 옮긴 자리는 그대로 둔다.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!game) return;
    build();
    paint();
  }, 150);
});

helpSheet = window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

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
showSolved();
const lastLevel = Number(read(LEVEL_KEY, 0)) || 0;
load(lastLevel, read(PLAY_KEY, null));

window.SokobanDebug = { game: () => game, load, stepOnce };

})();

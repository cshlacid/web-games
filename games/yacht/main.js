'use strict';

// 화면과 조작. 규칙과 점수 계산은 rules.js, 상대는 ai.js가 들고 있고 여기서는 그것을
// 부르고 그린다.
//
// **주사위와 점수 칸은 판을 만들 때 한 번 만들고 값만 바꾼다.** 누를 때마다 지웠다 다시
// 만들면 손가락 밑의 요소가 사라져 두드림이 끊긴다.
(function () {

const R = window.YachtRules;
const A = window.YachtAI;
const Sound = window.YachtSound;
const NS = 'http://www.w3.org/2000/svg';

const PLAYERS = [{ label: '2인', n: 2 }, { label: '3인', n: 3 }, { label: '4인', n: 4 }];
const LEVELS = [{ label: '쉬움', key: 'easy' }, { label: '보통', key: 'normal' }, { label: '어려움', key: 'hard' }];
const PLAYERS_KEY = 'web-games.yacht.players';
const LEVEL_KEY = 'web-games.yacht.level';
const BEST_KEY = 'web-games.yacht.best';

// 굴리는 모습을 보여 주는 길이(밀리초).
const SPIN = 460;
const SPIN_FRAME = 65;
// 상대가 한 걸음 둘 때마다 쉬는 시간. 너무 빠르면 무엇을 잡았는지 못 보고, 느리면
// 기다리는 게임이 된다.
const BOT_STEP = 520;

const el = {
  sheet: document.getElementById('sheet'),
  dice: document.getElementById('dice'),
  roll: document.getElementById('roll'),
  round: document.getElementById('round'),
  whose: document.getElementById('whose'),
  tally: document.getElementById('tally'),
  players: document.getElementById('players'),
  levels: document.getElementById('levels'),
  toast: document.getElementById('toast'),
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

let players = Number(localStorage.getItem(PLAYERS_KEY)) || 2;
let level = A.LEVELS[localStorage.getItem(LEVEL_KEY)] ? localStorage.getItem(LEVEL_KEY) : 'normal';
let game = null;
let view = null;
let rolling = false;
let spinTimer = null;
let botTimer = null;
// 0점을 적으려고 고른 칸. 값비싼 칸을 손이 미끄러져 버리는 일을 막는 자리라, 0점일
// 때만 쓴다 — 판마다 열두 번 누르는 곳에 늘 확인을 붙이면 번거롭기만 하다.
let armed = null;
let toastTimer = null;

const mine = () => game.turn === 1;

function svg(name, attrs, cls) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (cls) node.setAttribute('class', cls);
  return node;
}

function toast(text) {
  el.toast.innerHTML = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 2600);
}

// --- 주사위 그림 ---

// 눈이 놓이는 자리(24칸 기준). 여섯 눈까지 쓸 자리를 미리 만들어 두고 켜고 끈다 —
// 구르는 동안 눈이 매 프레임 바뀌므로 그때마다 원을 새로 만들면 노드가 쏟아진다.
const PIP_SPOTS = [[7, 7], [17, 7], [7, 12], [17, 12], [7, 17], [17, 17], [12, 12]];
const PIP_FACES = {
  1: [6],
  2: [0, 5],
  3: [0, 6, 5],
  4: [0, 1, 4, 5],
  5: [0, 1, 4, 5, 6],
  6: [0, 1, 2, 3, 4, 5],
};

function dieNode() {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'die blank';
  const face = svg('svg', { viewBox: '0 0 24 24', width: '100%', height: '100%' });
  face.append(svg('rect', { x: 1.6, y: 1.6, width: 20.8, height: 20.8, rx: 5 }, 'die-face'));
  const pips = PIP_SPOTS.map(([x, y]) => {
    const pip = svg('circle', { cx: x, cy: y, r: 2.2 }, 'die-pip');
    pip.style.display = 'none';
    face.append(pip);
    return pip;
  });
  node.append(face);
  return { node, pips };
}

function setFace(die, value) {
  const on = PIP_FACES[value] || [];
  die.pips.forEach((pip, i) => { pip.style.display = on.includes(i) ? '' : 'none'; });
}

// --- 판 만들기 ---

function slotNode(label) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'slot';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = label;
  const value = document.createElement('span');
  value.className = 'value';
  node.append(name, value);
  return { node, value };
}

function build() {
  el.sheet.textContent = '';
  el.dice.textContent = '';

  const slots = {};
  const upper = R.CATEGORIES.filter((cat) => cat.upper);
  const lower = R.CATEGORIES.filter((cat) => !cat.upper);

  // 두 폭을 줄 단위로 번갈아 채운다. 격자가 왼쪽 여섯 · 오른쪽 여섯으로 보이려면
  // 순서를 이렇게 엮어야 한다.
  for (let i = 0; i < 6; i++) {
    for (const cat of [upper[i], lower[i]]) {
      const slot = slotNode(cat.upper ? `${cat.face}의 눈` : cat.label);
      slot.node.dataset.key = cat.key;
      slots[cat.key] = slot;
      el.sheet.append(slot.node);
    }
  }

  const bonus = slotNode(`보너스 (${R.BONUS_AT})`);
  bonus.node.className = 'slot sum';
  const total = slotNode('합계');
  total.node.className = 'slot sum total';
  el.sheet.append(bonus.node, total.node);

  const dice = [];
  for (let i = 0; i < R.DICE; i++) {
    const die = dieNode();
    die.node.dataset.index = String(i);
    el.dice.append(die.node);
    dice.push(die);
  }

  view = { slots, bonus, total, dice };
}

// --- 그리기 ---

// 점수판은 **지금 차례인 자리의 것**을 보여 준다. 내 것만 보이면 상대가 무엇을 적었는지
// 숫자 하나로만 알게 되어, 판이 어떻게 흘러가는지가 보이지 않는다.
function paint() {
  const who = game.turn;
  const rolled = game.rollsLeft < R.ROLLS;
  const sheet = R.sheetOf(game, who);

  for (const cat of R.CATEGORIES) {
    const slot = view.slots[cat.key];
    const written = sheet[cat.key];
    if (written !== undefined) {
      slot.node.className = 'slot filled';
      slot.value.textContent = String(written);
      continue;
    }
    if (!rolled) {
      // 굴리기 전에는 미리보기가 없다. 빈칸으로 두면 무엇이 남았는지만 보인다.
      slot.node.className = 'slot dead';
      slot.value.textContent = '·';
      continue;
    }
    const got = R.scoreOf(cat.key, game.dice);
    slot.node.className = got ? 'slot open' : 'slot open zero';
    if (armed === cat.key) slot.node.classList.add('armed');
    slot.value.textContent = String(got);
  }

  const upper = R.upperSum(game, who);
  view.bonus.node.className = R.bonus(game, who) ? 'slot sum hit' : 'slot sum';
  view.bonus.value.textContent = R.bonus(game, who) ? `+${R.BONUS}` : `${upper}`;
  view.total.value.textContent = String(R.total(game, who));

  game.dice.forEach((value, i) => {
    const die = view.dice[i];
    setFace(die, value);
    die.node.className = 'die'
      + (value ? '' : ' blank')
      + (game.keep[i] ? ' kept' : '');
    die.node.disabled = !rolled || game.done || rolling || !mine();
  });

  el.round.textContent = game.done ? '끝' : `${game.round} / ${R.CATEGORIES.length}판`;
  el.whose.innerHTML = game.done ? '' : (mine()
    ? '<b class="p1">내 점수판</b>'
    : `<b class="p${who}">${who}번</b>의 점수판`);

  paintTally();

  el.roll.disabled = game.done || rolling || !mine() || game.rollsLeft === 0;
  if (game.done) el.roll.textContent = '판이 끝났습니다';
  else if (!mine()) el.roll.textContent = `${who}번 차례…`;
  else if (game.rollsLeft === R.ROLLS) el.roll.textContent = '굴리기';
  else if (game.rollsLeft === 0) el.roll.textContent = '적을 칸을 고르세요';
  else el.roll.textContent = `다시 굴리기 · ${game.rollsLeft}번 남음`;
}

function paintTally() {
  el.tally.textContent = '';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = '합계';
  el.tally.append(label);
  for (let player = 1; player <= game.players; player++) {
    const span = document.createElement('span');
    span.className = `p${player}`;
    if (player === game.turn && !game.done) span.classList.add('now');
    span.textContent = String(R.total(game, player));
    el.tally.append(span);
  }
}

function showBest() {
  const best = Number(localStorage.getItem(BEST_KEY)) || 0;
  return best;
}

function saveBest(score) {
  const best = showBest();
  if (score <= best) return false;
  try { localStorage.setItem(BEST_KEY, String(score)); } catch { /* 무시 */ }
  return true;
}

// --- 굴리기 ---

// 잡아 두지 않은 주사위를 굴리고, 멎으면 `then`을 부른다. 내 차례와 상대 차례가 같은
// 길을 쓴다 — 굴림을 보여 주는 방식이 자리마다 다르면 상대가 무엇을 했는지 읽기 어렵다.
function rollNow(then) {
  const spun = view.dice.filter((die, i) => !(game.keep[i] && game.dice[i]));
  R.roll(game, Math.random);
  rolling = true;
  Sound.play('roll', mine() ? 1 : 0.65);

  const quiet = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const land = () => {
    rolling = false;
    for (const die of spun) die.node.classList.remove('spin');
    paint();
    if (then) then();
  };

  if (quiet) { land(); return; }

  // 칠하고 나서 흔든다. paint()가 클래스를 통째로 다시 쓰므로 순서가 바뀌면 흔들림이
  // 곧바로 지워진다.
  paint();
  for (const die of spun) {
    die.node.classList.remove('blank');
    die.node.classList.add('spin');
  }
  // 구르는 동안 보여 주는 눈은 아무 값이나 좋다. 멎을 때 규칙이 정한 눈으로 맞춘다.
  let spent = 0;
  spinTimer = setInterval(() => {
    spent += SPIN_FRAME;
    for (const die of spun) setFace(die, 1 + Math.floor(Math.random() * 6));
    if (spent < SPIN) return;
    clearInterval(spinTimer);
    land();
  }, SPIN_FRAME);
}

function doRoll() {
  if (game.done || rolling || !mine() || game.rollsLeft === 0) return;
  armed = null;
  rollNow(() => {
    if (game.rollsLeft === 0) toast('마지막 굴림입니다. 적을 칸을 고르세요.');
    // 주사위를 눌러 잡는다는 것은 화면만 봐서는 모른다. 첫 굴림 뒤 한 번 일러 준다.
    else if (game.rollsLeft === R.ROLLS - 1 && !game.keep.some(Boolean)) {
      toast('남길 주사위를 눌러 잡아 두세요.');
    }
  });
}

// --- 적기 ---

const nameOf = (key) => {
  const cat = R.CATEGORIES.find((one) => one.key === key);
  return cat.upper ? `${cat.face}의 눈` : cat.label;
};

function write(key) {
  if (game.done || rolling || !mine() || game.rollsLeft === R.ROLLS) return;
  if (R.sheetOf(game, 1)[key] !== undefined) return;

  const got = R.scoreOf(key, game.dice);
  // 0점은 한 번 더 눌러야 들어간다.
  if (got === 0 && armed !== key) {
    armed = key;
    toast(`<b>${nameOf(key)}</b>에 0점을 적습니다. 한 번 더 누르면 확정됩니다.`);
    paint();
    return;
  }
  armed = null;

  const before = R.bonus(game, 1);
  const done = R.pick(game, key);
  if (!done) return;

  toast(`<b>${nameOf(key)}</b>에 ${done.score}점`);
  Sound.play('write', done.score);
  if (!before && R.bonus(game, 1)) {
    setTimeout(() => Sound.play('bonus'), 260);
    toast(`위 칸 63점을 넘겨 <b>보너스 ${R.BONUS}점</b>`);
  }
  paint();
  if (game.done) { finish(); return; }
  runBot();
}

// --- 상대 차례 ---

function runBot() {
  clearTimeout(botTimer);
  if (game.done || mine()) return;

  const step = () => {
    if (game.done || mine()) return;
    const move = A.decide(game, Math.random, { level });
    if (!move) return;

    if (move.write) {
      const who = game.turn;
      const done = R.pick(game, move.write);
      paint();
      toast(`<b class="p${who}">${who}번</b>이 ${nameOf(move.write)}에 ${done.score}점`);
      Sound.play('write', done.score);
      if (game.done) { botTimer = setTimeout(finish, 700); return; }
      botTimer = setTimeout(() => { paint(); if (!mine()) step(); }, BOT_STEP * 1.6);
      return;
    }

    if (move.keep) {
      // 무엇을 잡았는지 먼저 보여 주고, 한 박자 뒤에 굴린다. 같이 하면 잡는 눈이
      // 보이지 않아 상대가 무슨 생각인지 알 수 없다.
      game.keep = move.keep.slice();
      paint();
      botTimer = setTimeout(() => rollNow(() => { botTimer = setTimeout(step, BOT_STEP); }), BOT_STEP);
      return;
    }

    rollNow(() => { botTimer = setTimeout(step, BOT_STEP); });
  };

  botTimer = setTimeout(step, BOT_STEP);
}

// --- 끝 ---

function finish() {
  clearTimeout(botTimer);
  const board = R.standings(game);
  const my = R.total(game, 1);
  const best = saveBest(my);
  const rank = board.findIndex((one) => one.player === 1) + 1;

  el.resultTitle.textContent = rank === 1 ? `이겼습니다 · ${my}점` : `${rank}등 · ${my}점`;
  const line = board.map((one) => (one.player === 1 ? `나 ${one.total}` : `${one.player}번 ${one.total}`)).join(' · ');
  el.resultNote.textContent = best ? `${line} · 내 최고 기록입니다` : line;
  el.result.hidden = false;
  paint();
  Sound.play(rank === 1 ? 'finish' : 'write', rank === 1 ? 1 : 0);
}

// --- 새 판 ---

function newGame() {
  clearInterval(spinTimer);
  clearTimeout(botTimer);
  game = R.newGame(players);
  rolling = false;
  armed = null;
  el.result.hidden = true;
  el.toast.textContent = '';
  paint();
}

// --- 조작 ---

el.dice.addEventListener('click', (event) => {
  const node = event.target.closest('[data-index]');
  if (!node || rolling || !mine()) return;
  const i = Number(node.dataset.index);
  const was = game.keep[i];
  R.toggleKeep(game, i);
  if (game.keep[i] === was) return;
  armed = null;
  Sound.play('keep');
  paint();
});

el.sheet.addEventListener('click', (event) => {
  const node = event.target.closest('[data-key]');
  if (!node) return;
  if (!mine() || game.done) return;
  if (game.rollsLeft === R.ROLLS) {
    toast('먼저 주사위를 굴리세요.');
    return;
  }
  write(node.dataset.key);
});

el.roll.addEventListener('click', doRoll);
el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });

for (const item of PLAYERS) {
  const button = document.createElement('button');
  button.className = 'pick';
  button.type = 'button';
  button.textContent = item.label;
  button.setAttribute('aria-pressed', String(item.n === players));
  button.addEventListener('click', () => {
    players = item.n;
    localStorage.setItem(PLAYERS_KEY, String(players));
    for (const other of el.players.children) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    Sound.play('click');
    newGame();
  });
  el.players.append(button);
}

// 난이도는 판을 다시 만들지 않고 바꾼다 — 상대가 세서 못 이기겠다 싶을 때 판을 버리지
// 않고 낮출 수 있어야 한다.
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
  });
  el.levels.append(button);
}

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

build();
newGame();

window.YachtDebug = { game: () => game, write, roll: doRoll, bot: runBot };

})();

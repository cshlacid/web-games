'use strict';

// 화면과 조작. 규칙과 점수 계산은 rules.js가 들고 있고 여기서는 그것을 부르고 그린다.
//
// **주사위와 점수 칸은 판을 만들 때 한 번 만들고 값만 바꾼다.** 누를 때마다 지웠다 다시
// 만들면 손가락 밑의 요소가 사라져 두드림이 끊긴다.
(function () {

const R = window.YachtRules;
const Sound = window.YachtSound;
const NS = 'http://www.w3.org/2000/svg';

const BEST_KEY = 'web-games.yacht.best';
// 굴리는 모습을 보여 주는 길이(밀리초).
const SPIN = 460;
const SPIN_FRAME = 65;

const el = {
  sheet: document.getElementById('sheet'),
  dice: document.getElementById('dice'),
  roll: document.getElementById('roll'),
  undo: document.getElementById('undo'),
  round: document.getElementById('round'),
  best: document.getElementById('best'),
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

let game = null;
let view = null;
let rolling = false;
let spinTimer = null;
// 방금 적은 칸을 무르기 위한 자리. 잘못 누른 것을 되돌리는 용도라 다시 굴리면 지운다.
let undoPoint = null;
let toastTimer = null;

function svg(name, attrs, cls) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (cls) node.setAttribute('class', cls);
  return node;
}

function toast(text) {
  el.toast.innerHTML = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 2400);
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

function paint() {
  const rolled = game.rollsLeft < R.ROLLS;

  for (const cat of R.CATEGORIES) {
    const slot = view.slots[cat.key];
    const written = game.sheet[cat.key];
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
    slot.value.textContent = String(got);
  }

  const upper = R.upperSum(game);
  view.bonus.node.className = R.bonus(game) ? 'slot sum hit' : 'slot sum';
  view.bonus.value.textContent = R.bonus(game) ? `+${R.BONUS}` : `${upper}`;
  view.total.value.textContent = String(R.total(game));

  game.dice.forEach((value, i) => {
    const die = view.dice[i];
    setFace(die, value);
    die.node.className = 'die'
      + (value ? '' : ' blank')
      + (game.keep[i] ? ' kept' : '');
    die.node.disabled = !rolled || game.done || rolling;
  });

  el.round.textContent = game.done ? '끝' : `${game.round} / ${R.CATEGORIES.length}판`;
  el.roll.disabled = game.done || rolling || game.rollsLeft === 0;
  if (game.rollsLeft === R.ROLLS) el.roll.textContent = '굴리기';
  else if (game.rollsLeft === 0) el.roll.textContent = '적을 칸을 고르세요';
  else el.roll.textContent = `다시 굴리기 · ${game.rollsLeft}번 남음`;
  el.undo.disabled = !undoPoint || rolling;
}

function showBest() {
  const best = Number(localStorage.getItem(BEST_KEY)) || 0;
  el.best.textContent = best ? `최고 ${best}점` : '';
  return best;
}

function saveBest(score) {
  const best = Number(localStorage.getItem(BEST_KEY)) || 0;
  if (score <= best) return false;
  try { localStorage.setItem(BEST_KEY, String(score)); } catch { /* 무시 */ }
  showBest();
  return true;
}

// --- 진행 ---

function newGame() {
  clearInterval(spinTimer);
  game = R.newGame();
  rolling = false;
  undoPoint = null;
  el.result.hidden = true;
  el.toast.textContent = '';
  showBest();
  paint();
}

function doRoll() {
  if (game.done || rolling || game.rollsLeft === 0) return;
  undoPoint = null;
  const spun = view.dice.filter((die, i) => !(game.keep[i] && game.dice[i]));
  R.roll(game, Math.random);
  rolling = true;
  Sound.play('roll');

  const quiet = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const land = () => {
    rolling = false;
    for (const die of spun) die.node.classList.remove('spin');
    paint();
    if (game.rollsLeft === 0) toast('마지막 굴림입니다. 적을 칸을 고르세요.');
    // 주사위를 눌러 잡는다는 것은 화면만 봐서는 모른다. 첫 굴림 뒤 한 번 일러 준다.
    else if (game.rollsLeft === R.ROLLS - 1 && !game.keep.some(Boolean)) {
      toast('남길 주사위를 눌러 잡아 두세요.');
    }
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

function write(key) {
  if (game.done || rolling || game.rollsLeft === R.ROLLS) return;
  if (game.sheet[key] !== undefined) return;

  const before = R.bonus(game);
  const snapshot = {
    round: game.round,
    rollsLeft: game.rollsLeft,
    dice: game.dice.slice(),
    keep: game.keep.slice(),
    sheet: { ...game.sheet },
  };
  const done = R.pick(game, key);
  if (!done) return;
  undoPoint = snapshot;

  const cat = R.CATEGORIES.find((one) => one.key === key);
  const name = cat.upper ? `${cat.face}의 눈` : cat.label;
  toast(`${name}에 <b>${done.score}점</b>`);
  Sound.play('write', done.score);
  if (!before && R.bonus(game)) {
    setTimeout(() => Sound.play('bonus'), 260);
    toast(`위 칸 63점을 넘겨 <b>보너스 ${R.BONUS}점</b>`);
  }
  paint();
  if (game.done) finish();
}

function finish() {
  const score = R.total(game);
  const best = saveBest(score);
  el.resultTitle.textContent = `${score}점`;
  el.resultNote.textContent = best
    ? '최고 기록입니다.'
    : `최고 기록은 ${Number(localStorage.getItem(BEST_KEY)) || score}점입니다.`;
  el.result.hidden = false;
  Sound.play('finish');
}

function undo() {
  if (!undoPoint || rolling) return;
  game.round = undoPoint.round;
  game.rollsLeft = undoPoint.rollsLeft;
  game.dice = undoPoint.dice.slice();
  game.keep = undoPoint.keep.slice();
  game.sheet = { ...undoPoint.sheet };
  game.done = false;
  undoPoint = null;
  el.result.hidden = true;
  Sound.play('click');
  paint();
}

// --- 조작 ---

el.dice.addEventListener('click', (event) => {
  const node = event.target.closest('[data-index]');
  if (!node || rolling) return;
  const i = Number(node.dataset.index);
  const was = game.keep[i];
  R.toggleKeep(game, i);
  if (game.keep[i] === was) return;
  Sound.play('keep');
  paint();
});

el.sheet.addEventListener('click', (event) => {
  const node = event.target.closest('[data-key]');
  if (!node) return;
  if (game.rollsLeft === R.ROLLS && !game.done) {
    toast('먼저 주사위를 굴리세요.');
    return;
  }
  write(node.dataset.key);
});

el.roll.addEventListener('click', doRoll);
el.undo.addEventListener('click', undo);
el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });

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
build();
newGame();

window.YachtDebug = { game: () => game, write, roll: doRoll };

})();

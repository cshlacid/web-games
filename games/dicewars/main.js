'use strict';

// 화면과 조작. 규칙은 rules.js, 지도는 mapgen.js, 상대는 ai.js, 확률은 odds.js가
// 들고 있고 여기서는 그것들을 부르고 그린다.
//
// **육각 칸을 하나씩 그리고 영토 경계만 굵게 덧그린다.** 영토 모양대로 다각형 하나를
// 만들려면 칸들의 바깥선을 이어 붙여야 하는데, 칸을 그대로 칠하고 이웃이 다른 영토인
// 변에만 선을 그으면 같은 그림이 훨씬 짧게 나온다.
(function () {

const R = window.DiceRules;
const M = window.DiceMap;
const A = window.DiceAI;
const O = window.DiceOdds;
const Sound = window.DiceSound;
const NS = 'http://www.w3.org/2000/svg';

const PLAYERS = [{ label: '2인', n: 2 }, { label: '3인', n: 3 }, { label: '4인', n: 4 }];
const LEVELS = [{ label: '쉬움', key: 'easy' }, { label: '보통', key: 'normal' }, { label: '어려움', key: 'hard' }];
const PLAYERS_KEY = 'web-games.dicewars.players';
const LEVEL_KEY = 'web-games.dicewars.level';

// 육각 칸의 크기(SVG 단위). 뾰족한 쪽이 위인 배치라 폭은 √3배, 줄 간격은 1.5배다.
const S = 10;
const SQRT3 = Math.sqrt(3);
// 상대가 한 수 둘 때마다 쉬는 시간. 너무 빠르면 무엇이 일어났는지 못 보고, 느리면
// 기다리는 게임이 된다.
const BOT_STEP = 750;

const el = {
  board: document.getElementById('board'),
  players: document.getElementById('players'),
  levels: document.getElementById('levels'),
  tally: document.getElementById('tally'),
  newGame: document.getElementById('new-game'),
  endTurn: document.getElementById('end-turn'),
  toast: document.getElementById('toast'),
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

let players = Number(localStorage.getItem(PLAYERS_KEY)) || 3;
let level = A.LEVELS[localStorage.getItem(LEVEL_KEY)] ? localStorage.getItem(LEVEL_KEY) : 'easy';
let map = null;
let game = null;
let view = null;
let selected = null;
let rolling = false;   // 굴림을 보여 주는 동안에는 조작을 받지 않는다
let botTimer = null;
let dice = null;       // 이 판의 주사위. 씨드를 걸어 두면 같은 판을 다시 볼 수 있다

function svg(name, attrs, cls) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (cls) node.setAttribute('class', cls);
  return node;
}

function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 육각 배치 ---

function centerOf(cell) {
  const x = SQRT3 * S * (cell.q + (cell.r % 2 ? 0.5 : 0)) + SQRT3 * S / 2;
  const y = 1.5 * S * cell.r + S;
  return { x, y };
}

function corner(center, k) {
  const angle = (Math.PI / 180) * (60 * k + 30);
  return `${(center.x + S * Math.cos(angle)).toFixed(2)},${(center.y + S * Math.sin(angle)).toFixed(2)}`;
}

// 이웃이 있는 여섯 방향. 각도는 그 방향으로 난 변을 찾는 데 쓴다(변의 양 끝은 ±30도).
const DIRS = [
  { deg: 0, even: [1, 0], odd: [1, 0] },
  { deg: 60, even: [0, 1], odd: [1, 1] },
  { deg: 120, even: [-1, 1], odd: [0, 1] },
  { deg: 180, even: [-1, 0], odd: [-1, 0] },
  { deg: 240, even: [-1, -1], odd: [0, -1] },
  { deg: 300, even: [0, -1], odd: [1, -1] },
];

function edgePoint(center, deg) {
  const angle = (Math.PI / 180) * deg;
  return [center.x + S * Math.cos(angle), center.y + S * Math.sin(angle)];
}

// --- 판 만들기 ---

function build() {
  el.board.textContent = '';
  const width = SQRT3 * S * (map.w + 0.5) + SQRT3 * S / 2;
  const height = 1.5 * S * map.h + S * 1.5;
  el.board.setAttribute('viewBox', `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);

  const cells = svg('g');
  const edges = svg('g');
  const marks = svg('g');
  const chips = svg('g');
  const hits = svg('g');
  el.board.append(cells, edges, marks, chips, hits);

  const owner = new Array(map.w * map.h).fill(-1);
  map.territories.forEach((t) => t.cells.forEach((c) => { owner[c] = t.id; }));

  const cellNodes = map.cells.map((cell, i) => {
    const center = centerOf(cell);
    const points = [0, 1, 2, 3, 4, 5].map((k) => corner(center, k)).join(' ');
    const node = svg('polygon', { points }, 'cell');
    cells.append(node);

    // 이웃이 다른 영토인 변에만 선을 긋는다.
    for (const dir of DIRS) {
      const [dq, dr] = cell.r % 2 ? dir.odd : dir.even;
      const nq = cell.q + dq;
      const nr = cell.r + dr;
      const inside = nq >= 0 && nr >= 0 && nq < map.w && nr < map.h;
      if (inside && owner[nr * map.w + nq] === owner[i]) continue;
      const [x1, y1] = edgePoint(center, dir.deg - 30);
      const [x2, y2] = edgePoint(center, dir.deg + 30);
      edges.append(svg('line', {
        x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2),
      }, 'edge'));
    }
    return node;
  });

  // 영토마다 가운데 칸 하나를 골라 주사위 수를 얹는다. 무게중심에 두면 영토가 굽은
  // 모양일 때 칸 밖으로 나가 다른 영토 위에 뜬다.
  const chipNodes = map.territories.map((t) => {
    const spot = anchorCell(t, owner);
    const center = centerOf(map.cells[spot]);
    const g = svg('g');
    const box = svg('rect', {
      x: (center.x - 9).toFixed(2), y: (center.y - 8).toFixed(2),
      width: 18, height: 16, rx: 4,
    }, 'chip');
    const text = svg('text', { x: center.x.toFixed(2), y: center.y.toFixed(2) }, 'dice');
    g.append(box, text);
    chips.append(g);

    const hit = svg('circle', { cx: center.x.toFixed(2), cy: center.y.toFixed(2), r: S * 1.6 }, 'hit');
    hit.dataset.territory = String(t.id);
    hits.append(hit);

    return { box, text, center, shown: -1, owner: -1 };
  });

  view = { cellNodes, marks, chipNodes, owner };
}

// 영토의 한가운데에 가장 가까운 칸. 이웃이 같은 영토인 칸을 먼저 고른다 — 꼬리 끝에
// 숫자가 붙으면 어느 영토의 것인지 헷갈린다.
function anchorCell(t, owner) {
  let best = t.cells[0];
  let bestScore = -1;
  for (const cell of t.cells) {
    const same = map.cells[cell].links.filter((n) => owner[n] === t.id).length;
    if (same > bestScore) { bestScore = same; best = cell; }
  }
  return best;
}

function newGame() {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  map = M.generate(seed, players);
  game = R.createGame(map);
  dice = rng(seed ^ 0x5bf03635);
  selected = null;
  rolling = false;
  clearTimeout(botTimer);
  el.result.hidden = true;
  build();
  paint();
  say('내 차례입니다. 칠 영토를 고르세요.');
}

// --- 그리기 ---

function paint() {
  for (const t of game.territories) {
    const chip = view.chipNodes[t.id];
    if (chip.owner !== t.owner) {
      chip.owner = t.owner;
      chip.text.setAttribute('class', `dice p${t.owner}`);
      for (const cell of map.territories[t.id].cells) {
        view.cellNodes[cell].setAttribute('class', `cell p${t.owner}`);
      }
    }
    if (chip.shown !== t.dice) {
      chip.shown = t.dice;
      chip.text.textContent = String(t.dice);
    }
  }
  paintMarks();
  paintTally();

  const mine = game.turn === 1 && !game.over;
  el.endTurn.disabled = !mine || rolling;
  el.endTurn.textContent = mine
    ? `턴 종료 · 주사위 ${R.largestGroup(game, 1) + game.stock[1]}개 받기`
    : '상대 차례…';
}

function paintMarks() {
  view.marks.textContent = '';
  if (selected === null || game.over) return;

  const from = game.territories[selected];
  const ring = (id, cls) => {
    const chip = view.chipNodes[id];
    view.marks.append(svg('circle', {
      cx: chip.center.x.toFixed(2), cy: chip.center.y.toFixed(2), r: S * 1.15,
    }, `mark ${cls}`));
  };

  ring(selected, 'pick');
  for (const id of from.neighbors) {
    const to = game.territories[id];
    if (to.owner === from.owner) continue;
    ring(id, 'target');
    const chip = view.chipNodes[id];
    chip.text.textContent = `${O.percent(from.dice, to.dice)}%`;
    chip.text.setAttribute('class', 'dice odds');
    chip.box.setAttribute('class', 'chip odds');
  }
}

// 확률을 지우고 주사위 수를 되돌린다.
function clearOdds() {
  for (const t of game.territories) {
    const chip = view.chipNodes[t.id];
    chip.text.textContent = String(t.dice);
    chip.text.setAttribute('class', `dice p${t.owner}`);
    chip.box.setAttribute('class', 'chip');
  }
}

function paintTally() {
  el.tally.textContent = '';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = '영토';
  el.tally.append(label);
  for (let player = 1; player <= game.players; player++) {
    const span = document.createElement('span');
    const held = R.held(game, player).length;
    span.className = player === 1 ? 'me' : `foe${player}`;
    if (!held) span.classList.add('out');
    span.textContent = `${held}`;
    el.tally.append(span);
  }
}

function say(text) {
  el.toast.innerHTML = text;
}

// --- 진행 ---

function describe(result) {
  const win = result.win ? '이겼습니다' : '막혔습니다';
  return `${result.attackSum} 대 ${result.defendSum} · <b>${win}</b>`;
}

function resolve(fromId, toId, player) {
  const before = game.territories[fromId].dice;
  const against = game.territories[toId].dice;
  const result = R.attack(game, fromId, toId, player, dice);
  if (!result) return null;

  rolling = true;
  selected = null;
  clearOdds();
  paint();
  say(`${before}개로 ${against}개를 칩니다 — ${describe(result)}`);
  Sound.play(result.win ? 'win' : 'fail');

  setTimeout(() => {
    rolling = false;
    if (game.over) { finish(); return; }
    paint();
    if (game.turn !== 1) runBot();
  }, 450);
  return result;
}

function finish() {
  clearTimeout(botTimer);
  const winner = game.over.winner;
  el.resultTitle.textContent = winner === 1 ? '다 차지했습니다' : '졌습니다';
  el.resultNote.textContent = winner === 1
    ? '마지막까지 남았습니다.'
    : `${winner}번이 마지막까지 남았습니다.`;
  el.result.hidden = false;
  paint();
  Sound.play(winner === 1 ? 'victory' : 'defeat');
}

// 상대는 한 수씩 두고 그때마다 화면을 갱신한다. 한 번에 다 두면 무엇이 일어났는지
// 볼 수 없다.
function runBot() {
  clearTimeout(botTimer);
  if (game.over) { finish(); return; }
  const player = game.turn;
  if (player === 1) { say('내 차례입니다.'); paint(); return; }

  say(`<b>${player}번</b>이 두는 중…`);
  paint();

  let done = 0;
  const step = () => {
    const move = A.decide(game, player, { level, done, next: dice });
    if (!move) {
      const gained = R.endTurn(game, dice);
      paint();
      if (game.over) { finish(); return; }
      botTimer = setTimeout(() => {
        say(`<b>${player}번</b>이 주사위 ${gained.gain}개를 받았습니다.`);
        runBot();
      }, 350);
      return;
    }
    done++;
    const result = R.attack(game, move.from, move.to, player, dice);
    paint();
    say(`<b>${player}번</b>의 공격 — ${describe(result)}`);
    Sound.play(result.win ? 'fail' : 'win', 0.6);
    if (game.over) { botTimer = setTimeout(finish, 500); return; }
    botTimer = setTimeout(step, BOT_STEP);
  };
  botTimer = setTimeout(step, BOT_STEP);
}

el.board.addEventListener('click', (event) => {
  if (game.over || rolling || game.turn !== 1) return;
  const hit = event.target.closest('[data-territory]');
  if (!hit) { selected = null; clearOdds(); paintMarks(); return; }

  const id = Number(hit.dataset.territory);
  const t = game.territories[id];

  if (selected !== null && R.canAttack(game, selected, id, 1)) {
    resolve(selected, id, 1);
    return;
  }
  if (t.owner === 1) {
    if (t.dice < 2) { say('주사위가 하나뿐인 영토로는 칠 수 없습니다.'); return; }
    selected = selected === id ? null : id;
    Sound.play('click');
    clearOdds();
    paintMarks();
    return;
  }
  selected = null;
  clearOdds();
  paintMarks();
});

el.endTurn.addEventListener('click', () => {
  if (game.over || rolling || game.turn !== 1) return;
  selected = null;
  clearOdds();
  const gained = R.endTurn(game, dice);
  Sound.play('turn');
  paint();
  say(`주사위 ${gained.gain}개를 받았습니다.`);
  runBot();
});

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

for (const item of LEVELS) {
  const button = document.createElement('button');
  button.className = 'pick';
  button.type = 'button';
  button.textContent = item.label;
  button.setAttribute('aria-pressed', String(item.key === level));
  // 난이도는 판을 다시 만들지 않고 그 자리에서 바뀐다. 밀린다 싶을 때 물러설 길이다.
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

newGame();

// 판이 이상할 때 콘솔에서 바로 들여다볼 수 있게 열어 둔다.
window.DiceDebug = { game: () => game, map: () => map };

})();

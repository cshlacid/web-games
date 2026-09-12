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
const T = SharedI18n.t;
const NS = 'http://www.w3.org/2000/svg';

const PLAYERS = [{ n: 2 }, { n: 3 }, { n: 4 }];
const LEVELS = [{ labelKey: 'ui.easy', key: 'easy' }, { labelKey: 'ui.medium', key: 'normal' }, { labelKey: 'ui.hard', key: 'hard' }];
const PLAYERS_KEY = 'web-games.dicewars.players';
const LEVEL_KEY = 'web-games.dicewars.level';

// 육각 칸의 크기(SVG 단위). 뾰족한 쪽이 위인 배치라 폭은 √3배, 줄 간격은 1.5배다.
const S = 10;
const SQRT3 = Math.sqrt(3);
// 상대가 한 수 둘 때마다 쉬는 시간. 너무 빠르면 무엇이 일어났는지 못 보고, 느리면
// 기다리는 게임이 된다.
const BOT_STEP = 380;
// 주사위를 굴려 보이는 길이(밀리초). 상대 차례에는 짧게 — 여러 수를 이어 두므로
// 같은 길이로 두면 보는 시간이 대부분이 된다.
const ROLL = { me: { spin: 520, hold: 620 }, bot: { spin: 340, hold: 380 } };
const ROLL_FRAME = 70;
// 판 둘레의 여백(SVG 단위).
const PAD = 5;

const el = {
  board: document.getElementById('board'),
  players: document.getElementById('players'),
  levels: document.getElementById('levels'),
  tally: document.getElementById('tally'),
  newGame: document.getElementById('new-game'),
  endTurn: document.getElementById('end-turn'),
  toast: document.getElementById('toast'),
  roll: document.getElementById('roll'),
  rollAttack: document.getElementById('roll-attack'),
  rollDefend: document.getElementById('roll-defend'),
  rollScore: document.getElementById('roll-score'),
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
let rollTimer = null;  // 굴림을 보여 주는 중인 타이머
// 판 세대. 굴리는 도중에 새 판을 누르면 아직 남은 타이머가 지난 판의 뒷정리를 하려 든다.
let era = 0;

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

// 칸 무리의 바깥선. 판의 영토 경계와 고른 영토를 덧그리는 선이 같은 계산을 쓴다 —
// 따로 두면 한쪽만 고쳐 선이 어긋난다.
function borderSegments(cellIds) {
  const set = new Set(cellIds);
  const out = [];
  for (const i of cellIds) {
    const cell = map.cells[i];
    const center = centerOf(cell);
    for (const dir of DIRS) {
      const [dq, dr] = cell.r % 2 ? dir.odd : dir.even;
      const nq = cell.q + dq;
      const nr = cell.r + dr;
      const inside = nq >= 0 && nr >= 0 && nq < map.w && nr < map.h;
      if (inside && set.has(nr * map.w + nq)) continue;
      const [x1, y1] = edgePoint(center, dir.deg - 30);
      const [x2, y2] = edgePoint(center, dir.deg + 30);
      out.push({ x1, y1, x2, y2 });
    }
  }
  return out;
}

// **바깥선은 변마다 선을 긋지 않고 이어 붙여 닫힌 길로 그린다.** 변을 따로 그으면
// 두 변이 만나는 꼭짓점마다 둥근 끝이 서로를 덮지 못해 쐐기꼴로 파여, 폰에서 경계가
// 끊겨 보였다. 한 길로 이으면 이음매를 stroke-linejoin이 채운다.
function borderPaths(cellIds) {
  const segs = borderSegments(cellIds);
  const key = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const at = new Map();
  segs.forEach((seg, i) => {
    for (const k of [key(seg.x1, seg.y1), key(seg.x2, seg.y2)]) {
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(i);
    }
  });

  const used = new Array(segs.length).fill(false);
  const paths = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const seg = segs[i];
    const start = key(seg.x1, seg.y1);
    const points = [[seg.x1, seg.y1], [seg.x2, seg.y2]];
    let here = key(seg.x2, seg.y2);
    // 꼭짓점 하나에 변이 넷 모이는 자리(영토가 잘록한 곳)가 있어 아무 것이나 집는다 —
    // 어느 쪽을 골라도 남은 변은 다음 길에서 다시 걸린다.
    while (here !== start) {
      const next = (at.get(here) || []).find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = true;
      const other = segs[next];
      const far = key(other.x1, other.y1) === here ? [other.x2, other.y2] : [other.x1, other.y1];
      points.push(far);
      here = key(far[0], far[1]);
    }
    const d = points.map(([x, y], n) => `${n ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    paths.push(here === start ? `${d} Z` : d);
  }
  return paths;
}

// --- 주사위 굴리기 ---

// 눈이 놓이는 자리(24칸 기준). 여섯 눈까지 쓸 자리를 미리 만들어 두고 켜고 끈다 —
// 굴리는 동안 눈이 매 프레임 바뀌므로 그때마다 원을 새로 만들면 노드가 쏟아진다.
const PIP_SPOTS = [[7, 7], [17, 7], [7, 12], [17, 12], [7, 17], [17, 17], [12, 12]];
const PIP_FACES = {
  1: [6],
  2: [0, 5],
  3: [0, 6, 5],
  4: [0, 1, 4, 5],
  5: [0, 1, 4, 5, 6],
  6: [0, 1, 2, 3, 4, 5],
};

function dieNode(player) {
  const node = svg('svg', { viewBox: '0 0 24 24' }, `die p${player}`);
  node.append(svg('rect', { x: 1.2, y: 1.2, width: 21.6, height: 21.6, rx: 5 }, 'die-face'));
  const pips = PIP_SPOTS.map(([x, y]) => {
    const pip = svg('circle', { cx: x, cy: y, r: 2.3 }, 'die-pip');
    node.append(pip);
    return pip;
  });
  return { node, pips };
}

function setFace(die, value) {
  const on = PIP_FACES[value];
  die.pips.forEach((pip, i) => { pip.style.display = on.includes(i) ? '' : 'none'; });
}

function fillRow(row, count, player) {
  row.textContent = '';
  const dice = [];
  for (let i = 0; i < count; i++) {
    const die = dieNode(player);
    die.node.classList.add('spin');
    row.append(die.node);
    dice.push(die);
  }
  return dice;
}

// 공격 한 번을 보여 준다. **구르는 동안의 눈은 Math.random으로 굴린다** — 판의 주사위는
// 씨드를 건 굴림이라, 보여 주기용으로 거기서 뽑으면 같은 씨드가 다른 판을 만든다.
function showRoll(result, attacker, defender, mine, then) {
  const pace = mine ? ROLL.me : ROLL.bot;
  const startedIn = era;
  const quiet = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const attack = fillRow(el.rollAttack, result.attackRoll.length, attacker);
  const defend = fillRow(el.rollDefend, result.defendRoll.length, defender);
  const all = attack.concat(defend);
  el.rollScore.textContent = '';
  el.roll.hidden = false;
  // 굴리는 동안에는 차례를 넘기지 못한다. 판을 다시 칠하는 것은 주사위가 멎은 뒤라
  // 단추 상태도 그때까지는 손으로 잠가 둔다.
  el.endTurn.disabled = true;

  const land = () => {
    if (startedIn !== era) return;
    all.forEach((die) => die.node.classList.remove('spin'));
    result.attackRoll.forEach((value, i) => setFace(attack[i], value));
    result.defendRoll.forEach((value, i) => setFace(defend[i], value));
    el.rollScore.innerHTML = T('dice.rollScore', { attack: result.attackSum, defend: result.defendSum })
      + `<span class="${result.win ? 'win' : 'lose'}">${result.win ? T('dice.won') : T('dice.blocked')}</span>`;
    // 소리는 **나에게 좋은 일인지**로 고른다. 상대가 뚫으면 내 쪽에서는 나쁜 소식이다.
    Sound.play((mine ? result.win : !result.win) ? 'win' : 'fail', mine ? 1 : 0.6);
    setTimeout(() => {
      if (startedIn !== era) return;
      el.roll.hidden = true;
      then();
    }, pace.hold);
  };

  if (quiet || !pace.spin) {
    for (const die of all) setFace(die, 1);
    land();
    return;
  }

  for (const die of all) setFace(die, 1 + Math.floor(Math.random() * 6));
  let spent = 0;
  const spin = setInterval(() => {
    spent += ROLL_FRAME;
    for (const die of all) setFace(die, 1 + Math.floor(Math.random() * 6));
    if (startedIn !== era) { clearInterval(spin); return; }
    if (spent < pace.spin) return;
    clearInterval(spin);
    land();
  }, ROLL_FRAME);
  rollTimer = spin;
}

// --- 판 만들기 ---

function build() {
  el.board.textContent = '';
  // 칸이 상자에 딱 붙어 왼쪽·위가 잘려 보였다. 네 변에 같은 여백을 두른다 — 오른쪽과
  // 아래는 줄 어긋남 때문에 이미 남던 자리라, 그만큼을 폭·높이에서 뺀다.
  const width = SQRT3 * S * (map.w + 0.5) + PAD * 2;
  const height = 1.5 * S * map.h + S * 0.5 + PAD * 2;
  el.board.setAttribute('viewBox', `${-PAD} ${-PAD} ${width.toFixed(1)} ${height.toFixed(1)}`);

  const cells = svg('g');
  const edges = svg('g');
  const marks = svg('g');
  const chips = svg('g');
  el.board.append(cells, edges, marks, chips);

  const owner = new Array(map.w * map.h).fill(-1);
  map.territories.forEach((t) => t.cells.forEach((c) => { owner[c] = t.id; }));

  // **칸 자체가 누르는 자리다.** 숫자 둘레에 원판을 깔아 두었더니 영토의 나머지 칸은
  // 눌러도 반응이 없고, 이웃 영토의 원판과 겹쳐 엉뚱한 곳이 잡히기도 했다.
  const cellNodes = map.cells.map((cell, i) => {
    const center = centerOf(cell);
    const points = [0, 1, 2, 3, 4, 5].map((k) => corner(center, k)).join(' ');
    const node = svg('polygon', { points }, 'cell');
    node.dataset.territory = String(owner[i]);
    cells.append(node);
    return node;
  });

  for (const t of map.territories) {
    for (const d of borderPaths(t.cells)) edges.append(svg('path', { d }, 'edge'));
  }

  // 영토마다 가운데 칸 하나를 골라 주사위 수를 얹는다. 무게중심에 두면 영토가 굽은
  // 모양일 때 칸 밖으로 나가 다른 영토 위에 뜬다.
  const chipNodes = map.territories.map((t) => {
    const spot = anchorCell(t, owner);
    const center = centerOf(map.cells[spot]);
    const g = svg('g');
    const box = svg('rect', {
      x: (center.x - 10).toFixed(2), y: (center.y - 7).toFixed(2),
      width: 20, height: 14, rx: 4,
    }, 'chip');
    const text = svg('text', { x: center.x.toFixed(2), y: center.y.toFixed(2) }, 'dice');
    g.append(box, text);
    chips.append(g);

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
  era++;
  clearTimeout(botTimer);
  clearInterval(rollTimer);
  el.roll.hidden = true;
  el.result.hidden = true;
  build();
  paint();
  say(T('dice.myTurn'));
}

// --- 그리기 ---

function paint() {
  for (const t of game.territories) {
    const chip = view.chipNodes[t.id];
    if (chip.owner !== t.owner) {
      chip.owner = t.owner;
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
    ? T('dice.endTurnGain', { gain: R.largestGroup(game, 1) + game.stock[1] })
    : T('dice.foeTurn');
}

function paintMarks() {
  view.marks.textContent = '';
  if (selected === null || game.over) return;

  const from = game.territories[selected];
  // 숫자 둘레에 동그라미를 치면 어느 땅이 고른 땅인지가 아니라 어느 숫자를 골랐는지만
  // 보인다. 땅의 바깥선을 그대로 덧그려 영토 모양을 알린다.
  const outline = (id, cls) => {
    for (const d of borderPaths(map.territories[id].cells)) {
      view.marks.append(svg('path', { d }, `mark ${cls}`));
    }
  };

  outline(selected, 'pick');
  for (const id of from.neighbors) {
    const to = game.territories[id];
    if (to.owner === from.owner) continue;
    outline(id, 'target');
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
    chip.text.setAttribute('class', 'dice');
    chip.box.setAttribute('class', 'chip');
  }
}

function paintTally() {
  el.tally.textContent = '';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = T('dice.territory');
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
  const outcome = result.win ? T('dice.won') : T('dice.blocked');
  return T('dice.describe', { attack: result.attackSum, defend: result.defendSum, outcome });
}

function resolve(fromId, toId, player) {
  const before = game.territories[fromId].dice;
  const against = game.territories[toId].dice;
  const beforeOwner = game.territories[toId].owner;
  const result = R.attack(game, fromId, toId, player, dice);
  if (!result) return null;

  rolling = true;
  selected = null;
  clearOdds();
  paintMarks();
  say(T('dice.attacking', { before, against }));

  // 주사위가 멎기 전에 판을 고쳐 칠하면 결과가 먼저 새어 나간다.
  showRoll(result, player, beforeOwner, true, () => {
    rolling = false;
    paint();
    say(T('dice.attacked', { before, against, result: describe(result) }));
    if (game.over) { finish(); return; }
    if (game.turn !== 1) runBot();
  });
  return result;
}

function finish() {
  clearTimeout(botTimer);
  // 결과 덮개와 굴림 표가 겹치지 않게 한다. 마지막 공격의 굴림은 이미 접혔지만,
  // 판이 끝나는 자리가 여럿이라 여기서 한 번 더 잠근다.
  el.roll.hidden = true;
  const winner = game.over.winner;
  el.resultTitle.textContent = winner === 1 ? T('dice.allYours') : T('dice.lost');
  el.resultNote.textContent = winner === 1
    ? T('dice.lastStanding')
    : T('dice.foeLastStanding', { n: winner });
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
  if (player === 1) { say(T('dice.myTurnShort')); paint(); return; }

  say(T('dice.foeThinking', { n: player }));
  paint();

  let done = 0;
  const step = () => {
    const move = A.decide(game, player, { level, done, next: dice });
    if (!move) {
      const gained = R.endTurn(game, dice);
      paint();
      if (game.over) { finish(); return; }
      botTimer = setTimeout(() => {
        say(T('dice.foeGained', { n: player, gain: gained.gain }));
        runBot();
      }, 350);
      return;
    }
    done++;
    const foe = game.territories[move.to].owner;
    const result = R.attack(game, move.from, move.to, player, dice);
    say(T('dice.foeAttacking', { n: player, dice: move.dice, against: move.against }));
    showRoll(result, player, foe, false, () => {
      paint();
      say(T('dice.foeAttacked', { n: player, result: describe(result) }));
      if (game.over) { botTimer = setTimeout(finish, 500); return; }
      botTimer = setTimeout(step, BOT_STEP);
    });
  };
  botTimer = setTimeout(step, BOT_STEP);
}

// 누른 자리의 영토. 칸을 살짝 빗나갔으면 가까운 칸으로 붙여 준다 — 판 가장자리는 줄이
// 어긋나 배경이 칸 사이까지 들어오는데, 거기서 놓아 버리면 고른 것이 풀린다.
function territoryAt(event) {
  const hit = event.target.closest('[data-territory]');
  if (hit) return Number(hit.dataset.territory);
  if (event.clientX === undefined) return null;

  const rect = el.board.getBoundingClientRect();
  const box = el.board.viewBox.baseVal;
  if (!rect.width || !rect.height) return null;
  const x = box.x + (event.clientX - rect.left) / rect.width * box.width;
  const y = box.y + (event.clientY - rect.top) / rect.height * box.height;

  let best = null;
  let near = S * 1.4;
  map.cells.forEach((cell, i) => {
    const center = centerOf(cell);
    const gap = Math.hypot(center.x - x, center.y - y);
    if (gap < near) { near = gap; best = i; }
  });
  return best === null ? null : view.owner[best];
}

el.board.addEventListener('click', (event) => {
  if (game.over || rolling || game.turn !== 1) return;
  const id = territoryAt(event);
  if (id === null || id < 0) { selected = null; clearOdds(); paintMarks(); return; }

  const t = game.territories[id];

  if (selected !== null && R.canAttack(game, selected, id, 1)) {
    resolve(selected, id, 1);
    return;
  }
  if (t.owner === 1) {
    if (t.dice < 2) { say(T('dice.needTwo')); return; }
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
  say(T('dice.gained', { gain: gained.gain }));
  runBot();
});

for (const item of PLAYERS) {
  const button = document.createElement('button');
  button.className = 'pick';
  button.type = 'button';
  button.textContent = T('ui.playerCount', { n: item.n });
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
  button.textContent = T(item.labelKey);
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

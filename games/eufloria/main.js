'use strict';

// 화면과 조작. 규칙은 logic.js, 지도는 mapgen.js, 상대는 ai.js가 들고 있고 여기서는
// 그것들을 부르고 그린다.
//
// **판은 SVG 하나에 직접 그린다.** 소행성은 원, 씨앗은 점, 사거리는 선이라 도형
// 그대로다. 노드는 판을 새로 만들 때 한 번만 만들고, 매 프레임에는 값만 바꾼다 —
// 초당 60번 innerHTML을 다시 쓰면 폰에서 눈에 띄게 끊긴다.
(function () {

const L = window.EufloriaLogic;
const G = window.EufloriaMap;
const AI = window.EufloriaAI;
const Sound = window.EufloriaSound;
const NS = 'http://www.w3.org/2000/svg';

const SIZES = [{ label: '작게', n: 9 }, { label: '보통', n: 12 }, { label: '크게', n: 15 }];
const RATIOS = [{ label: '절반', v: 0.5 }, { label: '전부', v: 1 }];
const LEVELS = [{ label: '순함', key: 'soft' }, { label: '보통', key: 'normal' }, { label: '사나움', key: 'wild' }];
const SIZE_KEY = 'web-games.eufloria.size';
const LEVEL_KEY = 'web-games.eufloria.level';
// 탭을 옮겼다 돌아오면 프레임 간격이 몇 초씩 튄다. 그대로 밀면 그 사이의 전투가
// 한 번에 계산돼 판이 순간이동한다. 밀린 시간은 버린다.
const MAX_DT = 0.05;

const el = {
  board: document.getElementById('board'),
  sizes: document.getElementById('sizes'),
  levels: document.getElementById('levels'),
  ratios: document.getElementById('ratios'),
  tally: document.getElementById('tally'),
  newGame: document.getElementById('new-game'),
  panelEmpty: document.getElementById('panel-empty'),
  panelBody: document.getElementById('panel-body'),
  stats: document.getElementById('stats'),
  dyson: document.getElementById('plant-dyson'),
  defense: document.getElementById('plant-defense'),
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

let world = null;
let view = null;
let size = Number(localStorage.getItem(SIZE_KEY)) || 12;
// 기본은 가장 순한 상대다. 처음 여는 사람이 곧바로 밀리면 규칙을 익힐 틈이 없다.
let level = AI.LEVELS[localStorage.getItem(LEVEL_KEY)] ? localStorage.getItem(LEVEL_KEY) : 'soft';
let ratio = 0.5;
let selected = null;
let think = 0;
let last = 0;
let spin = 0;

function svg(name, attrs, cls) {
  const node = document.createElementNS(NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (cls) node.setAttribute('class', cls);
  return node;
}

// --- 판 만들기 ---

function build() {
  el.board.textContent = '';
  const links = svg('g');
  const flights = svg('g');
  const rocks = svg('g');
  el.board.append(links, flights, rocks);

  const nodes = world.asteroids.map((a) => {
    const g = svg('g', { 'data-id': a.id });
    const rock = svg('circle', { cx: a.x, cy: a.y, r: a.r }, 'rock');
    // 코어는 소행성보다 조금 바깥에 그린다. 안에 그리면 나무와 숫자에 가린다.
    const coreR = a.r + 4;
    const core = svg('circle', {
      cx: a.x, cy: a.y, r: coreR,
      transform: `rotate(-90 ${a.x} ${a.y})`,
    }, 'core');
    core.dataset.circ = 2 * Math.PI * coreR;
    const trees = svg('g');
    const dots = svg('g');
    const count = svg('text', { x: a.x, y: a.y }, 'count');
    const invader = svg('text', { x: a.x, y: a.y - a.r - 9 }, 'count small');
    // 손가락으로 누를 자리는 소행성보다 넉넉해야 한다. 작은 소행성은 반지름이 11이라
    // 그대로 두면 눌리지 않는다.
    const hit = svg('circle', { cx: a.x, cy: a.y, r: Math.max(a.r + 12, 24) }, 'hit');
    g.append(rock, core, trees, dots, count, invader, hit);
    rocks.append(g);
    return { rock, core, trees, dots, count, invader, sign: '', shown: -1 };
  });

  view = { links, flights, rocks, nodes, flying: new Map() };
}

function newGame() {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  world = L.createWorld(G.generate(seed, size));
  selected = world.start.player;
  think = 0;
  el.result.hidden = true;
  build();
  drawLinks();
  paint();
}

// --- 그리기 ---

function drawLinks() {
  view.links.textContent = '';
  if (selected === null) return;
  const from = world.asteroids[selected];
  if (from.owner !== 1) { selected = null; return; }
  for (const to of world.asteroids) {
    if (!L.inRange(from, to)) continue;
    view.links.append(svg('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y }, 'link'));
  }
  view.links.append(svg('circle', { cx: from.x, cy: from.y, r: from.r + 7 }, 'ring'));
}

function treeShape(type, x, y) {
  if (type === 'dyson') return svg('circle', { cx: x, cy: y, r: 2.6 }, 'tree');
  return svg('path', { d: `M ${x} ${y - 3} L ${x + 3} ${y + 2.4} L ${x - 3} ${y + 2.4} Z` }, 'tree');
}

function paintAsteroid(a, node) {
  node.rock.setAttribute('class', `rock p${a.owner}`);

  const sign = a.trees.map((t) => t.type).join(',');
  if (sign !== node.sign) {
    node.sign = sign;
    node.trees.textContent = '';
    a.trees.forEach((tree, i) => {
      const spread = 46;
      const deg = -90 + (i - (a.trees.length - 1) / 2) * spread;
      const rad = (deg * Math.PI) / 180;
      const rr = a.r * 0.5;
      node.trees.append(treeShape(tree.type, a.x + Math.cos(rad) * rr, a.y + Math.sin(rad) * rr));
    });
  }

  const full = a.owner ? L.CORE_HP.owned : L.CORE_HP.neutral;
  if (a.core.hp >= full) {
    node.core.setAttribute('opacity', '0');
  } else {
    const circ = Number(node.core.dataset.circ);
    node.core.setAttribute('opacity', '1');
    node.core.setAttribute('stroke-dasharray', `${(circ * a.core.hp) / full} ${circ}`);
  }

  // 궤도의 점. 마릿수를 그대로 찍으면 200개가 되므로 아홉 개까지만 두고 숫자로 읽는다.
  const holder = a.owner || (a.seeds[1].n > 0 ? 1 : a.seeds[2].n > 0 ? 2 : 0);
  const mine = Math.floor(a.seeds[holder || 1].n);
  const dots = Math.min(9, Math.ceil(Math.sqrt(Math.max(0, mine))));
  if (dots !== node.shown) {
    node.shown = dots;
    node.dots.textContent = '';
    for (let i = 0; i < dots; i++) {
      const rad = (i / dots) * Math.PI * 2;
      node.dots.append(svg('circle', {
        cx: a.x + Math.cos(rad) * (a.r + 7),
        cy: a.y + Math.sin(rad) * (a.r + 7),
        r: 2.2,
      }, `dot p${holder || 0}`));
    }
  }
  node.dots.setAttribute('transform', `rotate(${spin * (holder === 2 ? -1 : 1)} ${a.x} ${a.y})`);

  // 주인이 있으면 소행성 색 위에 흰 글씨, 빈 소행성이면 궤도에 있는 쪽의 색으로
  // 쓴다. 빈 소행성의 숫자를 회색으로 두면 누가 물고 있는지가 보이지 않는다.
  node.count.setAttribute('class', a.owner ? `count p${a.owner}` : `count tint${holder || 0}`);
  node.count.textContent = mine > 0 ? String(mine) : '';

  const other = holder === 1 ? 2 : 1;
  const invaders = Math.floor(a.seeds[other].n);
  node.invader.setAttribute('class', `count small tint${other}`);
  node.invader.textContent = invaders > 0 ? String(invaders) : '';
}

function paintFlights() {
  const live = new Set();
  for (const f of world.flights) {
    live.add(f);
    let dot = view.flying.get(f);
    if (!dot) {
      dot = svg('circle', { r: 2.6 }, `flight p${f.owner}`);
      view.flights.append(dot);
      view.flying.set(f, dot);
    }
    const from = world.asteroids[f.from];
    const to = world.asteroids[f.to];
    dot.setAttribute('cx', from.x + (to.x - from.x) * f.pos);
    dot.setAttribute('cy', from.y + (to.y - from.y) * f.pos);
  }
  for (const [f, dot] of view.flying) {
    if (live.has(f)) continue;
    dot.remove();
    view.flying.delete(f);
  }
}

function paintPanel() {
  const a = selected === null ? null : world.asteroids[selected];
  el.panelEmpty.hidden = !!a;
  el.panelBody.hidden = !a;
  if (!a) return;

  const stats = [['에너지', a.stats.energy], ['강도', a.stats.strength], ['속도', a.stats.speed]];
  if (el.stats.dataset.id !== String(a.id)) {
    el.stats.dataset.id = String(a.id);
    el.stats.textContent = '';
    for (const [name, value] of stats) {
      const box = document.createElement('div');
      box.className = 'stat';
      const label = document.createElement('span');
      label.className = 'stat-name';
      label.textContent = `${name} ${value}`;
      const bar = document.createElement('span');
      bar.className = 'stat-bar';
      const fill = document.createElement('span');
      fill.className = 'stat-fill';
      fill.style.width = `${Math.min(100, (value / 140) * 100)}%`;
      bar.append(fill);
      box.append(label, bar);
      el.stats.append(box);
    }
  }

  el.dyson.disabled = !!world.over || !L.canPlant(world, a.id, 1, 'dyson');
  el.defense.disabled = !!world.over || !L.canPlant(world, a.id, 1, 'defense');
}

function paintTally() {
  const stars = [L.holdings(world, 1), L.holdings(world, 2)];
  const seeds = [Math.floor(L.power(world, 1)), Math.floor(L.power(world, 2))];
  el.tally.innerHTML =
    `별 <b>${stars[0]}</b>:<i>${stars[1]}</i> · 씨앗 <b>${seeds[0]}</b>:<i>${seeds[1]}</i>`;
}

function paint() {
  world.asteroids.forEach((a, i) => paintAsteroid(a, view.nodes[i]));
  paintFlights();
  paintPanel();
  paintTally();
}

// --- 진행 ---

function handle(events) {
  for (const e of events) {
    if (e.type === 'taken') Sound.play(e.owner === 1 ? 'take' : 'lost');
    else if (e.type === 'tree-fell') Sound.play('fell');
    else if (e.type === 'over') finish(e.winner);
  }
}

function finish(winner) {
  el.resultTitle.textContent = winner === 1 ? '다 번졌습니다' : '말라 버렸습니다';
  el.resultNote.textContent = winner === 1
    ? `${Math.round(world.t)}초 만에 상대를 걷어 냈습니다.`
    : '상대가 먼저 다 차지했습니다.';
  el.result.hidden = false;
  Sound.play(winner === 1 ? 'win' : 'lose');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(MAX_DT, (now - last) / 1000 || 0);
  last = now;
  spin = (spin + dt * 18) % 360;

  if (!world.over) {
    think -= dt;
    if (think <= 0) {
      const setting = AI.LEVELS[level];
      think = setting.think;
      AI.apply(world, 2, AI.decide(world, 2, {
        edge: setting.edge,
        hold: world.t < setting.opening,
      }));
    }
    handle(L.step(world, dt));
  }
  paint();
}

// --- 조작 ---

function select(id) {
  selected = id;
  el.stats.dataset.id = '';
  drawLinks();
}

el.board.addEventListener('click', (event) => {
  if (world.over) return;
  const g = event.target.closest('[data-id]');
  if (!g) { select(null); return; }
  const id = Number(g.dataset.id);
  const a = world.asteroids[id];

  if (selected !== null && id !== selected && L.canSend(world, selected, id, 1)) {
    if (L.send(world, selected, id, 1, ratio)) {
      Sound.play('send');
      drawLinks();
    }
    return;
  }
  if (a.owner === 1) { Sound.play('click'); select(id); return; }
  select(null);
});

el.dyson.addEventListener('click', () => {
  if (L.plant(world, selected, 1, 'dyson')) Sound.play('plant');
});
el.defense.addEventListener('click', () => {
  if (L.plant(world, selected, 1, 'defense')) Sound.play('plant', 1);
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
    newGame();
  });
  el.sizes.append(button);
}

for (const item of LEVELS) {
  const button = document.createElement('button');
  button.className = 'pick';
  button.type = 'button';
  button.textContent = item.label;
  button.setAttribute('aria-pressed', String(item.key === level));
  // 세기는 판을 다시 만들지 않고 그 자리에서 바뀐다. 밀린다 싶을 때 물러설 길을
  // 열어 두는 것이 이 손잡이의 목적이다.
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

for (const item of RATIOS) {
  const button = document.createElement('button');
  button.className = 'pick';
  button.type = 'button';
  button.textContent = item.label;
  button.setAttribute('aria-pressed', String(item.v === ratio));
  button.addEventListener('click', () => {
    ratio = item.v;
    for (const other of el.ratios.children) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    Sound.play('click');
  });
  el.ratios.append(button);
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
requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });

})();

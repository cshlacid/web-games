'use strict';

// 화면. 규칙은 rules.js가 들고 있고 여기서는 그리기와 손가락만 맡는다.
//
// **판 전체를 캔버스 하나에 그린다.** 이 저장소의 다른 게임은 DOM이나 SVG로 그리는데,
// 여기서는 적 마흔 마리가 매 프레임 움직이고 그 위로 사격선이 번쩍인다. 노드로
// 두면 프레임마다 수십 개가 갈려 폰이 먼저 죽는다.
(function () {

const R = window.DefenseRules;
const D = window.DefenseData;
const M = window.DefenseMap;
const P = window.DefensePaths;
const SP = window.DefenseSprites;
const Sound = window.DefenseSound;

const el = {
  canvas: document.getElementById('board'),
  palette: document.getElementById('palette'),
  stage: document.getElementById('stage'),
  lives: document.getElementById('lives'),
  gold: document.getElementById('gold'),
  wave: document.getElementById('wave'),
  toast: document.getElementById('toast'),
  bar: document.getElementById('unit-bar'),
  barName: document.getElementById('unit-name'),
  barUp: document.getElementById('unit-up'),
  barSell: document.getElementById('unit-sell'),
  rush: document.getElementById('rush'),
  speed: document.getElementById('speed'),
  restart: document.getElementById('restart'),
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

const ctx = el.canvas.getContext('2d');
const ORDER = ['archer', 'shield', 'cannon', 'frost', 'spear', 'healer'];
const PITCH = { archer: 720, shield: 300, cannon: 200, frost: 880, spear: 420, healer: 560 };
const SHOT_LIFE = 0.1;

let stage = 1;
let run = null;
let speed = 1;
let chosen = null;   // 팔레트에서 고른 사람
let picked = null;   // 판에서 고른 사람
let press = null;    // 누르고 있는 동안의 미리보기
let shots = [];
let cell = 40;
let body = 32;
let theme = {};
let last = 0;
let lastShotSound = 0;
let toastUntil = 0;

const idx = (x, y) => y * run.map.w + x;

function readTheme() {
  const s = getComputedStyle(document.body);
  const get = (n) => s.getPropertyValue(n).trim();
  theme = {
    cell: get('--cell'), grid: get('--grid'), wall: get('--wall'),
    entry: get('--entry'), exit: get('--exit'), trail: get('--trail'),
    fg: get('--fg'), gold: get('--gold'), life: get('--life'),
  };
}

function layout() {
  const avail = document.querySelector('.app').clientWidth;
  cell = Math.max(28, Math.min(46, Math.floor(avail / M.W)));
  body = cell - 8;
  const w = cell * M.W;
  const h = cell * M.H;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  el.canvas.style.width = `${w}px`;
  el.canvas.style.height = `${h}px`;
  el.canvas.width = Math.round(w * dpr);
  el.canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 점 그림이라 흐려지면 안 된다.
  ctx.imageSmoothingEnabled = false;
}

// 적이 지금 갈 길. 보병 기준으로 그린다 — 종류마다 길이 달라 다 그리면 판이
// 점으로 덮인다.
function routeNow(cells) {
  const g = D.FOES.grunt;
  const f = cells
    ? P.field(run.map, cells, { speed: g.speed, siege: g.siege, bias: g.bias })
    : R.fieldFor(run, 'grunt');
  return P.route(run.map, f, run.map.entry);
}

function ghostRoute(key, x, y) {
  const cells = run.cells.map((u) => (u ? { hp: u.hp } : null));
  cells[idx(x, y)] = { hp: R.statOf(key, 1, run.mods).hp };
  return routeNow(cells);
}

function drawSprite(key, cx, cy, size) {
  const art = SP.sprite(key, 2);
  if (!art) return;
  ctx.drawImage(art, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
}

function bar(x, y, w, ratio, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, w * ratio), 3);
}

function paint() {
  if (!run) return;
  const map = run.map;
  ctx.clearRect(0, 0, cell * map.w, cell * map.h);

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const wall = map.walls[idx(x, y)];
      ctx.fillStyle = wall ? theme.wall : theme.cell;
      if (x === map.entry.x && y === map.entry.y) ctx.fillStyle = theme.entry;
      if (x === map.exit.x && y === map.exit.y) ctx.fillStyle = theme.exit;
      ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    }
  }

  const route = press && press.route ? press.route : routeNow();
  ctx.fillStyle = press && press.route ? theme.fg : theme.trail;
  ctx.globalAlpha = press && press.route ? 0.5 : 0.85;
  for (const c of route) {
    ctx.beginPath();
    ctx.arc(c.x * cell + cell / 2, c.y * cell + cell / 2, Math.max(2, cell * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const u of run.units) {
    const cx = u.x * cell + cell / 2;
    const cy = u.y * cell + cell / 2;
    if (picked && picked.id === u.id) {
      ctx.strokeStyle = theme.fg;
      ctx.lineWidth = 2;
      ctx.strokeRect(u.x * cell + 2, u.y * cell + 2, cell - 4, cell - 4);
      // 사거리. 고른 순간에만 보여 준다 — 늘 그리면 판이 원으로 덮인다.
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(cx, cy, R.statOf(u.key, u.tier, run.mods).range * cell, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawSprite(u.key, cx, cy - 1, body);
    if (u.hp < u.max) bar(u.x * cell + 4, u.y * cell + cell - 6, cell - 8, u.hp / u.max, theme.exit);
    // 올린 단계는 점으로. 숫자를 얹으면 32px에서 읽히지 않는다.
    for (let i = 1; i < u.tier; i++) {
      ctx.fillStyle = theme.gold;
      ctx.beginPath();
      ctx.arc(u.x * cell + 6 + i * 5, u.y * cell + 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (press && press.key) {
    ctx.globalAlpha = press.ok ? 0.55 : 0.25;
    drawSprite(press.key, press.x * cell + cell / 2, press.y * cell + cell / 2, body);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = press.ok ? theme.fg : theme.entry;
    ctx.lineWidth = 2;
    ctx.strokeRect(press.x * cell + 2, press.y * cell + 2, cell - 4, cell - 4);
  }

  for (const e of run.foes) {
    const p = R.foeXY(e);
    const cx = p.x * cell + cell / 2;
    const cy = p.y * cell + cell / 2;
    const size = e.key === 'boss' ? body * 1.35 : (e.key === 'swarm' ? body * 0.78 : body);
    drawSprite(e.key, cx, cy, size);
    if (e.hp < e.max) bar(cx - body / 2, cy - size / 2 - 5, body, e.hp / e.max, theme.life);
    if (e.slowT > 0) {
      ctx.strokeStyle = SP.TINT.frost.a;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.52, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const s of shots) {
    ctx.globalAlpha = Math.max(0, s.t / SHOT_LIFE) * 0.85;
    ctx.strokeStyle = s.kind === 'heal' ? SP.TINT.healer.x : (SP.TINT[s.kind] || {}).a || theme.fg;
    ctx.lineWidth = s.kind === 'cannon' ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(s.from.x * cell + cell / 2, s.from.y * cell + cell / 2);
    ctx.lineTo(s.to.x * cell + cell / 2, s.to.y * cell + cell / 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function toast(text) {
  el.toast.textContent = text;
  toastUntil = performance.now() + 1800;
}

function hud() {
  el.stage.textContent = `스테이지 ${stage}`;
  el.lives.textContent = `목숨 ${Math.max(0, run.lives)}`;
  el.gold.textContent = String(run.gold);
  const waiting = run.wave < run.waves.length && !run.pending.length && !run.foes.length;
  el.wave.textContent = run.wave === 0 && waiting
    ? `곧 시작 ${Math.max(0, Math.ceil(run.timer))}`
    : (waiting ? `${run.wave}/${run.waves.length} · 다음 ${Math.max(0, Math.ceil(run.timer))}`
      : `웨이브 ${run.wave}/${run.waves.length}`);
  el.rush.disabled = !waiting || !!run.over;

  for (const node of el.palette.children) {
    const key = node.dataset.key;
    const poor = run.gold < D.UNITS[key].cost;
    node.classList.toggle('poor', poor);
    node.setAttribute('aria-pressed', String(chosen === key));
  }

  if (picked && !run.units.includes(picked)) picked = null;
  el.bar.hidden = !picked;
  if (picked) {
    const d = D.UNITS[picked.key];
    el.barName.textContent = `${d.name} ${picked.tier}단계`;
    const top = picked.tier >= D.UP.max;
    el.barUp.disabled = top || run.gold < R.upCost(picked.key, picked.tier);
    el.barUp.textContent = top ? '끝까지 올렸다' : `올리기 ${R.upCost(picked.key, picked.tier)}`;
    el.barSell.textContent = `해고 +${Math.round(d.cost * D.RUN.refund)}`;
  }
}

function handle(events) {
  const now = performance.now();
  for (const ev of events) {
    if (ev.type === 'shot') {
      shots.push({ from: ev.from, to: ev.to, t: SHOT_LIFE, kind: ev.key });
      // 마흔 마리가 동시에 맞으면 초당 수십 번이 되어 소리가 뭉갠다.
      if (now - lastShotSound > 70) { Sound.play('shot', PITCH[ev.key] || 660); lastShotSound = now; }
    } else if (ev.type === 'heal') {
      shots.push({ from: ev.from, to: ev.to, t: SHOT_LIFE * 2, kind: 'heal' });
    } else if (ev.type === 'kill') {
      if (now - lastShotSound > 40) Sound.play('kill');
    } else if (ev.type === 'down') {
      Sound.play('down');
      toast(`${D.UNITS[ev.key].name}이(가) 무너졌다`);
    } else if (ev.type === 'leak') {
      Sound.play('leak');
      toast(ev.lost > 1 ? `우두머리가 지나갔다 · 목숨 −${ev.lost}` : '적이 지나갔다');
    } else if (ev.type === 'wave') {
      Sound.play('wave');
      toast(`웨이브 ${ev.index}${run.waves[ev.index - 1].boss ? ' · 우두머리' : ''}`);
    } else if (ev.type === 'over') {
      finish(ev.how);
    }
  }
}

function finish(how) {
  Sound.play(how === 'won' ? 'win' : 'lose');
  el.resultTitle.textContent = how === 'won' ? `스테이지 ${stage} 돌파` : '뚫렸다';
  el.resultNote.textContent = how === 'won'
    ? `목숨 ${run.lives} 남김 · ${Math.round(run.time)}초`
    : `웨이브 ${run.wave}까지 버텼다`;
  el.again.textContent = how === 'won' ? '다음 스테이지' : '다시';
  el.result.hidden = false;
}

function newRun(next) {
  stage = Math.max(1, next || stage);
  run = R.createRun(stage);
  chosen = ORDER[0];
  picked = null;
  press = null;
  shots = [];
  el.result.hidden = true;
  el.toast.textContent = '';
  layout();
  hud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  if (run && el.result.hidden) {
    // 판이 끝난 뒤에도 한 번은 비워 준다. 끝나는 순간이 step 안에서 나면 그 이벤트가
    // 그대로 돌아오지만, 규칙을 바깥에서 밀어 끝낸 경우(자동 플레이·검증)에는
    // 남아 있는 이벤트를 아무도 가져가지 않아 결과가 뜨지 않았다.
    if (!run.over) handle(R.step(run, dt * speed));
    else if (run.events.length) handle(R.drain(run));
  }
  for (const s of shots) s.t -= dt;
  if (shots.length) shots = shots.filter((s) => s.t > 0);
  if (toastUntil && now > toastUntil) { el.toast.textContent = ''; toastUntil = 0; }
  paint();
  hud();
}

// --- 손가락 ---
function cellAt(ev) {
  const r = el.canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - r.left) / cell);
  const y = Math.floor((ev.clientY - r.top) / cell);
  if (x < 0 || y < 0 || x >= run.map.w || y >= run.map.h) return null;
  return { x, y };
}

function aim(c) {
  if (!c) { press = null; return; }
  // 이미 누가 서 있는 칸이면 고른 사람이 있어도 그를 고른 것으로 본다 — 어차피
  // 그 칸에는 세울 수 없고, 세우려다 고르지 못하면 올릴 방법이 없다.
  const here = run.cells[idx(c.x, c.y)];
  if (chosen && !here) {
    const why = R.canPlace(run, chosen, c.x, c.y);
    press = {
      key: chosen, x: c.x, y: c.y, ok: !why, why,
      route: why ? null : ghostRoute(chosen, c.x, c.y),
    };
  } else {
    press = { pick: here || null, x: c.x, y: c.y };
  }
}

el.canvas.addEventListener('pointerdown', (ev) => {
  if (!run || !el.result.hidden) return;
  ev.preventDefault();
  el.canvas.setPointerCapture(ev.pointerId);
  aim(cellAt(ev));
});

el.canvas.addEventListener('pointermove', (ev) => {
  if (!press) return;
  const c = cellAt(ev);
  if (c && press.x === c.x && press.y === c.y) return;
  aim(c);
});

el.canvas.addEventListener('pointerup', () => {
  if (!press) return;
  const it = press;
  press = null;
  if (it.key) {
    if (it.ok) {
      R.place(run, it.key, it.x, it.y);
      Sound.play('place');
      picked = null;
      if (run.gold < D.UNITS[it.key].cost) chosen = null;
    } else if (it.why) {
      toast(it.why);
    }
  } else {
    picked = it.pick;
    if (picked) Sound.play('click');
  }
  hud();
});

el.canvas.addEventListener('pointercancel', () => { press = null; });

// --- 팔레트 ---
for (const key of ORDER) {
  const d = D.UNITS[key];
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'slot';
  node.dataset.key = key;
  node.setAttribute('aria-pressed', 'false');
  const art = document.createElement('canvas');
  art.width = 32;
  art.height = 32;
  const g = art.getContext('2d');
  g.imageSmoothingEnabled = false;
  const baked = SP.sprite(key, 2);
  if (baked) g.drawImage(baked, 0, 0);
  node.appendChild(art);
  const cost = document.createElement('span');
  cost.className = 'cost';
  cost.textContent = String(d.cost);
  node.appendChild(cost);
  node.title = `${d.name} — ${d.note}`;
  node.addEventListener('click', () => {
    chosen = chosen === key ? null : key;
    picked = null;
    Sound.play('click');
    hud();
  });
  el.palette.appendChild(node);
}

el.barUp.addEventListener('click', () => {
  if (picked && R.upgrade(run, picked.id)) Sound.play('place');
  hud();
});
el.barSell.addEventListener('click', () => {
  if (picked) { R.sell(run, picked.id); picked = null; Sound.play('click'); }
  hud();
});
el.rush.addEventListener('click', () => {
  if (el.rush.disabled) return;
  R.startWave(run);
  handle(R.drain(run));
  hud();
});
el.speed.addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  el.speed.querySelector('.tool-label').textContent = `${speed}배속`;
  Sound.play('click');
});
el.restart.addEventListener('click', () => { newRun(stage); Sound.play('click'); });
el.again.addEventListener('click', () => {
  newRun(run.over === 'won' ? stage + 1 : stage);
  Sound.play('click');
});

window.addEventListener('resize', () => { layout(); });
const dark = window.matchMedia('(prefers-color-scheme: dark)');
if (dark.addEventListener) dark.addEventListener('change', readTheme);

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
readTheme();
newRun(1);
requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });

window.DefenseDebug = { run: () => run, stage: (n) => newRun(n), rules: R };

})();

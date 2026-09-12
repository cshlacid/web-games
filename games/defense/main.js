'use strict';

// 화면. 규칙은 rules.js가, 판 밖의 성장은 meta.js가 들고 있고 여기서는 그리기와
// 손가락만 맡는다.
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
const G = window.DefenseGoals;
const WV = window.DefenseWaves;
const T = window.DefenseMeta;
const Sound = window.DefenseSound;
const t = SharedI18n.t;

const el = {};
for (const [name, id] of [
  ['canvas', 'board'], ['palette', 'palette'], ['items', 'items'],
  ['stage', 'stage'], ['lives', 'lives'], ['time', 'time'], ['heroList', 'hero-list'], ['lockList', 'lock-list'], ['gold', 'gold'], ['wave', 'wave'], ['goal', 'goal'],
  ['toast', 'toast'], ['bar', 'unit-bar'], ['barName', 'unit-name'], ['barUp', 'unit-up'],
  ['barSell', 'unit-sell'], ['barStats', 'unit-stats'], ['report', 'report'], ['resultCamp', 'result-camp'], ['rush', 'rush'], ['speed', 'speed'], ['restart', 'restart'],
  ['result', 'result'], ['resultTitle', 'result-title'], ['resultNote', 'result-note'],
  ['cards', 'cards'], ['again', 'again'],
  ['camp', 'camp'], ['campOpen', 'camp-open'], ['campClose', 'camp-close'], ['campGems', 'camp-gems'],
  ['heroCount', 'hero-count'], ['stageDown', 'stage-down'], ['stageUp', 'stage-up'], ['stageNow', 'stage-now'], ['stageNote', 'stage-note'],
  ['teamCount', 'team-count'], ['teamList', 'team-list'], ['levelList', 'level-list'], ['perkList', 'perk-list'],
  ['help', 'help'], ['helpOpen', 'help-open'], ['helpClose', 'help-close'],
  ['toggleBgm', 'toggle-bgm'], ['toggleSfx', 'toggle-sfx'],
]) el[name] = document.getElementById(id);

const ctx = el.canvas.getContext('2d');
const PITCH = { archer: 720, shield: 300, cannon: 200, frost: 880, spear: 420, healer: 560 };
const SHOT_LIFE = 0.1;
const POP_LIFE = 0.3;

let save = T.load();
let stage = 1;
let goal = null;
let run = null;
let speed = 1;
let chosen = null;   // 팔레트에서 고른 사람
let picked = null;   // 판에서 고른 사람
let press = null;    // 누르고 있는 동안의 미리보기
let order = null;    // 명령서로 옮기는 중
let shots = [];
let pops = [];
let cell = 40;
let body = 32;
let theme = {};
let last = 0;
let lastShotSound = 0;
let toastUntil = 0;

const idx = (x, y) => y * run.map.w + x;
// 100 아래에서는 소수 한 자리까지 적는다. 레벨 하나가 올리는 폭이 그 자리에 있어,
// 반올림해 버리면 올려도 숫자가 그대로인 것처럼 보인다.
const num = (v) => (v >= 100 ? String(Math.round(v)) : v.toFixed(1));

// **판 성격과 주력 적을 판 시작 전에 알려 준다.** 편성은 판을 열기 전에 정하는데
// 무엇이 오는지 모르면 고를 수가 없어, 어느 판에서나 통하는 하나를 데려가는 것이
// 늘 맞는 답이 됐다.
const goalName = (g) => t('def.goal.' + g.id);
const goalLine = (g) => t('def.goalLine', { name: goalName(g), note: t('def.goal.' + g.id + '.note', { arg: g.arg }) });

function stageNote(stage) {
  const shape = M.build(stage).shape;
  const line = t('def.mapLine', { name: t('def.map.' + shape), note: t('def.map.' + shape + '.note') });
  const foe = WV.themeOf(stage);
  return D.FOES[foe] ? t('def.mainFoe', { map: line, foe: t('def.foe.' + foe) }) : line;
}

// **영웅은 제 이름을 가진다.** 직함만 적으면 셋이 "영웅"으로 뭉뚱그려져 어느 판에
// 누구를 꺼냈는지 기억에 남지 않는다. 일반 캐릭터는 직함이 곧 이름이다.
const who = (key) => {
  const name = t('def.unit.' + key);
  const person = t('def.who.' + key);
  return person ? `${name} ${person}` : name;
};

// 기본 공격의 모양을 적지 않는 캐릭터가 대부분이라, 다른 자들만 꼬리표를 단다.
const BASIC_TAG = { splash: 'def.tagSplash', ring: 'def.tagRing', smite: 'def.tagSmite' };
const BASIC_NOTE = {
  splash: 'def.basicSplash', ring: 'def.basicRing',
  smite: 'def.basicSmite', single: 'def.basicSingle',
};
// 신성으로 때리는지는 모양이 아니라 종류에 달렸다. 언데드 판에서 누구를 데려갈지
// 가르는 값이라 따로 적는다.
const holyOf = (d) => (d.basic && d.basic.kind === 'holy' ? ` · ${t('def.holyNote')}` : '');
const big = (v) => Math.round(v).toLocaleString(SharedI18n.lang);
// 단추와 목록의 작은 그림은 배경으로 얹는다 — 시트가 아직 안 왔어도 브라우저가
// 알아서 채운다.
const spriteNode = (key, side) => {
  const node = document.createElement('i');
  node.className = 'pic';
  node.setAttribute('style', SP.style(key, side || 30));
  return node;
};

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
  // 한 칸을 160px로 그려 두고 줄여 쓴다. 폰의 화면 배율이 2~3배라 줄인 그림이
  // 오히려 선명하다.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
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
      ctx.fillStyle = map.walls[idx(x, y)] ? theme.wall : theme.cell;
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
    const lit = (picked && picked.id === u.id) || (order && order.id === u.id);
    if (lit) {
      ctx.strokeStyle = theme.fg;
      ctx.lineWidth = 2;
      ctx.strokeRect(u.x * cell + 2, u.y * cell + 2, cell - 4, cell - 4);
      // 사거리는 고른 순간에만 보여 준다 — 늘 그리면 판이 원으로 덮인다.
      // **안쪽 한계가 있으면 도넛으로 그린다.** 포수가 코앞을 못 친다는 것을
      // 글로 적어 두는 것보다 이 구멍 하나가 잘 알린다.
      const stat = R.statOf(u.key, u.tier, run.mods);
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(cx, cy, stat.far * cell, 0, Math.PI * 2);
      if (stat.near > 0.6) ctx.arc(cx, cy, stat.near * cell, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
    }
    SP.draw(ctx, u.key, cx, cy - 1, body);
    if (u.hp < u.max) bar(u.x * cell + 4, u.y * cell + cell - 6, cell - 8, u.hp / u.max, theme.exit);
    for (let i = 1; i < u.tier; i++) {
      ctx.fillStyle = theme.gold;
      ctx.beginPath();
      ctx.arc(u.x * cell + 6 + i * 5, u.y * cell + 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 스킬이 준비됐는지. 쿨타임이 긴 빙결술사를 어디에 세울지가 여기서 갈린다.
    if (u.scd <= 0) {
      ctx.fillStyle = (SP.TINT[u.key] || {}).main || theme.fg;
      ctx.beginPath();
      ctx.arc(u.x * cell + cell - 6, u.y * cell + 6, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (press && press.key) {
    ctx.globalAlpha = press.ok ? 0.55 : 0.25;
    SP.draw(ctx, press.key, press.x * cell + cell / 2, press.y * cell + cell / 2, body);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = press.ok ? theme.fg : theme.entry;
    ctx.lineWidth = 2;
    ctx.strokeRect(press.x * cell + 2, press.y * cell + 2, cell - 4, cell - 4);
  }

  for (const z of run.zones) {
    ctx.globalAlpha = Math.min(0.42, 0.14 + z.t * 0.09);
    ctx.fillStyle = SP.TINT.frost.light;
    ctx.beginPath();
    ctx.arc(z.x * cell + cell / 2, z.y * cell + cell / 2, z.r * cell, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = SP.TINT.frost.main;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  for (const e of run.foes) {
    const p = R.foeXY(e);
    const cx = p.x * cell + cell / 2;
    const cy = p.y * cell + cell / 2;
    const size = e.key === 'boss' ? body * 1.35 : (e.key === 'swarm' ? body * 0.78 : body);
    SP.draw(ctx, e.key, cx, cy, size);
    if (e.hp < e.max) bar(cx - body / 2, cy - size / 2 - 5, body, e.hp / e.max, theme.life);
    if (e.slowT > 0) {
      ctx.strokeStyle = SP.TINT.frost.main;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.52, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.bleed) {
      ctx.fillStyle = SP.TINT.spear.main;
      ctx.beginPath();
      ctx.arc(cx + size * 0.32, cy + size * 0.3, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.stunT > 0) {
      ctx.strokeStyle = theme.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - size * 0.55, size * 0.22, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  }

  for (const p of pops) {
    const grow = 1 - p.t / POP_LIFE;
    ctx.globalAlpha = Math.max(0, p.t / POP_LIFE) * 0.9;
    ctx.strokeStyle = (SP.TINT[p.key] || {}).main || theme.gold;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x * cell + cell / 2, p.y * cell + cell / 2, cell * (0.2 + grow * 0.32), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const s of shots) {
    ctx.globalAlpha = Math.max(0, s.t / SHOT_LIFE) * 0.85;
    ctx.strokeStyle = s.kind === 'heal' ? SP.TINT.healer.light
      : (s.kind === 'bond' ? SP.TINT.warden.light : ((SP.TINT[s.kind] || {}).main || theme.fg));
    ctx.lineWidth = s.kind === 'cannon' ? 3 : (s.kind === 'bond' ? 2.5 : 1.5);
    // 공명은 점선으로 긋는다 — 사격선과 같은 실선이면 누가 누구를 쏜 것인지 섞인다.
    ctx.setLineDash(s.kind === 'bond' ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(s.from.x * cell + cell / 2, s.from.y * cell + cell / 2);
    ctx.lineTo(s.to.x * cell + cell / 2, s.to.y * cell + cell / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

function toast(text) {
  el.toast.textContent = text;
  toastUntil = performance.now() + 1800;
}

function hud() {
  el.stage.textContent = t('def.stage', { n: stage });
  el.lives.textContent = t('def.lives', { n: Math.max(0, run.lives) });
  el.gold.textContent = t('def.gold', { n: run.gold });
  const waiting = run.wave < run.waves.length && !run.pending.length && !run.foes.length;
  const left = Math.max(0, Math.ceil(run.timer));
  el.wave.textContent = run.wave === 0 && waiting
    ? t('def.startsIn', { n: left })
    : (waiting ? t('def.nextWave', { wave: run.wave, total: run.waves.length, n: left })
      : t('def.wave', { wave: run.wave, total: run.waves.length }));
  el.rush.disabled = !waiting || !!run.over;

  // 진행 시간. 속공 목표가 걸린 판에서는 한도까지 같이 적는다.
  const limit = goal.id === 'swift' ? goal.arg : null;
  el.time.textContent = limit ? `${clock(run.time)} / ${clock(limit)}` : clock(run.time);
  el.time.classList.toggle('over', !!limit && run.time > limit);

  const done = G.met(goal, run.stats);
  el.goal.classList.toggle('done', done && !!run.over);
  el.goal.innerHTML = `${stageNote(run.stage)}<br>${goalLine(goal)}`;

  for (const node of el.palette.children) {
    const key = node.dataset.key;
    // **값은 매 프레임 다시 적는다.** 겹쳐 세울수록 오르는데 세울 때의 값과 팔레트에
    // 적힌 값이 다르면, 눌러 놓고 왜 안 되는지 알 수 없다.
    const cost = R.costOf(run, key);
    const tag = node.querySelector('.cost');
    // **영웅은 골드가 아니라 웨이브로 막는다.** 값 자리에 0을 적어 두면 왜 안
    // 세워지는지 알 수 없어, 부를 수 있는 웨이브를 대신 적는다.
    const hero = !!D.UNITS[key].hero;
    const ready = hero ? R.heroWave(Object.keys(run.heroesUsed).length) : 0;
    const label = hero
      ? (run.heroesUsed[key] ? t('def.called') : (run.wave >= ready ? t('def.callNow') : t('def.callFrom', { n: ready })))
      : String(cost);
    if (tag.textContent !== label) tag.textContent = label;
    node.classList.toggle('poor', hero ? run.wave < ready : run.gold < cost);
    // 더 못 세우는 자리는 회색으로 둔다 — 이미 부른 영웅과 한도에 닿은 종류다.
    const full = (hero && !!run.heroesUsed[key]) || R.standing(run, key) >= D.MOST_OF_KIND;
    node.classList.toggle('used', full);
    node.setAttribute('aria-pressed', String(chosen === key));
  }
  for (const node of el.items.children) {
    const id = node.dataset.item;
    node.textContent = `${t('def.item.' + id)} ${save.items[id]}`;
    node.disabled = !save.items[id] || !!run.over;
    node.setAttribute('aria-pressed', String(!!order && order.id == null && order.item === id));
  }

  if (picked && !run.units.includes(picked)) picked = null;
  el.bar.hidden = !picked;
  if (picked) {
    const d = D.UNITS[picked.key];
    const now = R.statOf(picked.key, picked.tier, run.mods);
    const wait = Math.max(0, picked.scd);
    el.barName.textContent = t('def.tier', { who: who(picked.key), n: picked.tier });
    // 지금 수치를 그대로 적는다. 스킬 칸은 힐러만 회복량이고 나머지는 한 방 피해다.
    // 얼음 지대는 한 방의 크기가 아니라 **초당 얼마를 깎는가**가 뜻 있는 값이다.
    const sk = now.skill;
    const power = sk.shape === 'heal'
      ? t('def.heal', { n: num(sk.heal * (run.mods.heal == null ? 1 : run.mods.heal)) })
      : (sk.shape === 'field'
        ? t('def.dps', { n: num(now.damage * sk.fieldDps) })
        : `<b>${num(now.damage * (sk.mul == null ? 1 : sk.mul))}</b>`);
    const hold = now.skill.fieldFor || now.skill.bleedFor || now.skill.stunFor;
    const tag = now.basic.kind === 'holy' ? t('def.tagHoly')
      : (BASIC_TAG[now.basic.shape] ? t(BASIC_TAG[now.basic.shape]) : '');
    el.barStats.innerHTML = t('def.stats', {
      hp: Math.round(picked.hp), maxHp: now.hp, dmg: num(now.damage), tag,
      min: d.range.min, max: d.range.max,
    }) + '<br>'
      + t('def.skillLine', { skill: t('def.skill.' + picked.key), power, cd: num(now.skill.cd) })
      + (hold ? ` · ${t('def.hold', { n: num(hold) })}` : '') + ' · '
      + (wait > 0.1 ? t('def.waitLeft', { n: Math.ceil(wait) }) : t('def.ready'));
    const top = picked.tier >= D.UP.max;
    const cost = R.upCost(picked.key, picked.tier);
    el.barUp.disabled = top || run.gold < cost;
    if (top) {
      el.barUp.innerHTML = t('def.maxed');
    } else {
      // 값을 치르기 전에 무엇이 얼마나 오르는지 나란히 보여 준다.
      const next = R.statOf(picked.key, picked.tier + 1, run.mods);
      const nextHold = next.skill.fieldFor || next.skill.bleedFor || next.skill.stunFor;
      el.barUp.innerHTML = t('def.upgrade', { cost })
        + `<span>${t('def.upgradeStats', {
          a: num(now.damage), b: num(next.damage), c: now.hp, d: next.hp,
          e: (next.far - now.far).toFixed(1),
        })}</span>`
        + `<span>${t('def.upgradeCd', { a: num(now.skill.cd), b: num(next.skill.cd) })}`
        + (hold ? ` · ${t('def.upgradeHold', { a: num(hold), b: num(nextHold) })}` : '') + '</span>';
    }
    el.barSell.textContent = t('def.sell', { n: Math.round((picked.paid || d.cost) * D.RUN.refund) });
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
    } else if (ev.type === 'bond') {
      // **공명은 눈에 보여야 한다.** 쿨타임이 당겨지는 것은 숫자로만 나서,
      // 선을 긋지 않으면 붙여 세운 보람이 화면에 하나도 안 남는다.
      shots.push({ from: ev.from, to: ev.to, t: SHOT_LIFE * 2.4, kind: 'bond' });
    } else if (ev.type === 'skill') {
      // 스킬이 나간 자리에 고리를 남긴다. 쿨타임이 돌아온 것을 눈으로 알린다.
      shots.push({ from: ev.from, to: ev.to, t: SHOT_LIFE * 1.6, kind: ev.key });
      pops.push({ x: ev.to.x, y: ev.to.y, t: POP_LIFE, key: ev.key });
      if (now - lastShotSound > 40) { Sound.play('shot', (PITCH[ev.key] || 660) * 0.75); lastShotSound = now; }
    } else if (ev.type === 'kill') {
      if (now - lastShotSound > 40) Sound.play('kill');
    } else if (ev.type === 'down') {
      Sound.play('down');
      toast(t('def.fell', { who: who(ev.key) }));
    } else if (ev.type === 'leak') {
      Sound.play('leak');
      toast(ev.lost > 1 ? t('def.bossPassed', { n: ev.lost }) : t('def.foePassed'));
    } else if (ev.type === 'wave') {
      Sound.play('wave');
      toast(t(run.waves[ev.index - 1].boss ? 'def.waveBoss' : 'def.waveStart', { n: ev.index }));
    } else if (ev.type === 'over') {
      finish(ev.how);
    }
  }
}

// 기여도. 때린 것·몸으로 받아 낸 것·되살린 것을 한 자로 재 순서를 매긴다.
function showReport() {
  el.report.textContent = '';
  const rows = Object.keys(run.tally)
    .map((key) => ({ key, t: run.tally[key], sum: run.tally[key].dealt + run.tally[key].taken + run.tally[key].healed }))
    .filter((r) => r.sum > 0 || r.t.hired)
    .sort((a, b) => b.sum - a.sum);
  if (!rows.length) return;
  const top = Math.max(...rows.map((r) => r.sum), 1);
  for (const r of rows) {
    const bits = [];
    if (r.t.dealt >= 1) bits.push(t('def.statDealt', { n: big(r.t.dealt) }));
    if (r.t.kills) bits.push(t('def.statKills', { n: r.t.kills }));
    if (r.t.taken >= 1) bits.push(t('def.statTaken', { n: big(r.t.taken) }));
    if (r.t.healed >= 1) bits.push(t('def.statHealed', { n: big(r.t.healed) }));
    if (r.t.skills) bits.push(t('def.statSkills', { n: r.t.skills }));
    const line = document.createElement('div');
    line.className = 'line';
    line.innerHTML = `<span class="who">${who(r.key)}</span>`
      + `<span class="bar"><i style="width:${Math.round((r.sum / top) * 100)}%;background:${(SP.TINT[r.key] || {}).main || '#888'}"></i></span>`
      + `<span class="did">${bits.join(' · ') || t('def.statHired', { n: r.t.hired })}</span>`;
    el.report.appendChild(line);
  }
}

function finish(how) {
  Sound.play(how === 'won' ? 'win' : 'lose');
  const got = T.settle(save, stage, run, Math.random);
  T.store(save);
  el.resultTitle.textContent = how === 'won' ? t('def.cleared', { n: stage }) : t('def.failed');
  const bits = [];
  if (how === 'won') bits.push(t('def.wonNote', { lives: Math.max(0, run.lives), time: Math.round(run.time) }));
  else bits.push(t('def.lostNote', { n: run.wave }));
  bits.push(got.goalDone ? t('def.goalDone', { name: goalName(goal) }) : t('def.goalMissed', { name: goalName(goal) }));
  bits.push(t('def.gemsGot', { n: got.gems }));
  el.resultNote.textContent = bits.join('\n');
  el.again.textContent = how === 'won' ? t('def.nextStage') : t('ui.restart');
  showReport();
  showCards(got.cards);
  el.result.hidden = false;
}

function cardText(card) {
  if (card.kind === 'unlock') {
    const name = card.hero ? t('def.heroPrefix', { name: who(card.key) }) : t('def.unit.' + card.key);
    return [name, t('def.unit.' + card.key + '.note')];
  }
  if (card.kind === 'gems') return [t('def.cardGems', { n: card.amount }), t('def.cardGemsNote')];
  return [t('def.cardItems', { name: t('def.item.' + card.id) }), t('def.cardItemsNote')];
}

function showCards(cards) {
  el.cards.textContent = '';
  el.cards.hidden = !cards.length;
  el.again.disabled = !!cards.length;
  for (const card of cards) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'card';
        // 카드 문구는 kind와 key로 사전에서 꺼낸다 — meta.js는 자료만 돌려준다.
    const [name, note] = cardText(card);
    node.innerHTML = `<b>${name}</b><span>${note}</span>`;
    node.addEventListener('click', () => {
      T.takeCard(save, card);
      T.store(save);
      el.cards.hidden = true;
      el.again.disabled = false;
      Sound.play('place');
      buildPalette();
      renderCamp();
    });
    el.cards.appendChild(node);
  }
}

// --- 판 시작 ---
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function buildPalette() {
  el.palette.textContent = '';
  const roster = T.rosterOf(save);
  el.palette.style.gridTemplateColumns = `repeat(${Math.max(3, roster.length)}, minmax(0, 1fr))`;
  for (const key of roster) {
    const d = D.UNITS[key];
    const node = document.createElement('button');
    node.type = 'button';
    node.className = D.UNITS[key].hero ? 'slot hero' : 'slot';
    node.dataset.key = key;
    node.setAttribute('aria-pressed', 'false');
    node.appendChild(spriteNode(key));
    const cost = document.createElement('span');
    cost.className = 'cost';
    cost.textContent = String(d.cost);
    node.appendChild(cost);
    const basic = (d.basic ? ` · ${t(BASIC_NOTE[d.basic.shape])}` : '') + holyOf(d)
      + (d.hero ? ` · ${t('def.heroTip', { pct: Math.round(D.BOND.gain * 100) })}${d.lead ? t('def.leadTip') : ''}` : '');
    node.title = t('def.paletteTip', {
      who: who(key), min: d.range.min, max: d.range.max, basic,
      skill: t('def.skill.' + key), cd: d.skill.cd, note: t('def.skill.' + key + '.note'),
      most: D.MOST_OF_KIND,
    });
    node.addEventListener('click', () => {
      chosen = chosen === key ? null : key;
      picked = null;
      order = null;
      Sound.play('click');
      hud();
    });
    el.palette.appendChild(node);
  }
}

function buildItems() {
  el.items.textContent = '';
  for (const id of T.ITEM_POOL) {
    if (!save.items[id]) continue;
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'item';
    node.dataset.item = id;
    node.title = R.ITEMS[id].note;
    node.addEventListener('click', () => useItem(id));
    el.items.appendChild(node);
  }
}

function useItem(id) {
  if (!save.items[id] || run.over) return;
  if (id === 'order') {
    // 명령서는 두 번 누른다 — 옮길 사람, 그다음 빈 칸.
    order = order && order.item === 'order' ? null : { item: 'order', id: null };
    chosen = null;
    picked = null;
    toast(order ? t('def.pickToMove') : '');
    hud();
    return;
  }
  if (!R.useItem(run, id)) { toast(t('def.cannotUse')); return; }
  T.useItem(save, id);
  T.store(save);
  Sound.play(id === 'bomb' ? 'down' : 'place');
  handle(R.drain(run));
  buildItems();
  hud();
}

function newRun(next) {
  stage = Math.min(save.best + 1, Math.max(1, next || stage));
  goal = G.goalOf(stage);
  run = R.createRun(stage, { mods: T.modsOf(save), roster: T.rosterOf(save) });
  chosen = save.team[0] || null;
  picked = null;
  press = null;
  order = null;
  shots = [];
  pops = [];
  el.result.hidden = true;
  el.cards.hidden = true;
  el.again.disabled = false;
  el.toast.textContent = '';
  buildPalette();
  buildItems();
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
  for (const p of pops) p.t -= dt;
  if (pops.length) pops = pops.filter((p) => p.t > 0);
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
    press = { key: chosen, x: c.x, y: c.y, ok: !why, why, route: why ? null : ghostRoute(chosen, c.x, c.y) };
  } else {
    press = { pick: here || null, x: c.x, y: c.y };
  }
}

el.canvas.addEventListener('pointerdown', (ev) => {
  if (!run || !el.result.hidden) return;
  ev.preventDefault();
  el.canvas.setPointerCapture(ev.pointerId);
  if (order) { press = { order: true, x: 0, y: 0 }; return; }
  aim(cellAt(ev));
});

el.canvas.addEventListener('pointermove', (ev) => {
  if (!press || press.order) return;
  const c = cellAt(ev);
  if (c && press.x === c.x && press.y === c.y) return;
  aim(c);
});

el.canvas.addEventListener('pointerup', (ev) => {
  if (!press) return;
  const it = press;
  press = null;
  if (it.order) { orderTap(cellAt(ev)); return; }
  if (it.key) {
    if (it.ok) {
      R.place(run, it.key, it.x, it.y);
      Sound.play('place');
      picked = null;
      if (run.gold < R.costOf(run, it.key)) chosen = null;
    } else if (it.why) {
      toast(t('def.why.' + it.why));
    }
  } else {
    picked = it.pick;
    if (picked) Sound.play('click');
  }
  hud();
});

el.canvas.addEventListener('pointercancel', () => { press = null; });

function orderTap(c) {
  if (!c || !order) return;
  const here = run.cells[idx(c.x, c.y)];
  if (order.id == null) {
    if (!here) { toast(t('def.pickToMove')); return; }
    order.id = here.id;
    toast(t('def.pickTarget'));
    hud();
    return;
  }
  if (!R.useItem(run, 'order', { id: order.id, x: c.x, y: c.y })) { toast(t('def.cannotGo')); return; }
  T.useItem(save, 'order');
  T.store(save);
  order = null;
  Sound.play('place');
  handle(R.drain(run));
  buildItems();
  hud();
}

// --- 정비 ---
function row(inner) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'row';
  node.innerHTML = inner;
  return node;
}

function renderCamp() {
  el.campGems.textContent = t('def.gems', { n: save.gems });
  el.stageNow.textContent = String(stage);
  el.stageDown.disabled = stage <= 1;
  el.stageUp.disabled = stage >= save.best + 1;
  const g = G.goalOf(stage);
  el.stageNote.innerHTML = t('def.stageLine', {
    state: t(save.cleared[stage] ? 'def.stageCleared' : 'def.stageNotYet'),
    goal: goalName(g),
  }) + `<br>${stageNote(stage)}`;
  el.teamCount.textContent = t('def.slots', { used: save.team.length, total: T.slotsOf(save) });

  el.teamList.textContent = '';
  // 영웅은 아래 제 칸에서 고른다 — 여기에 섞으면 일반 칸을 쓰는 것처럼 보인다.
  for (const key of save.owned.filter((k) => !T.isHero(k))) {
    const on = save.team.includes(key);
    const node = row(`<span class="who">${who(key)}</span><span class="sub">${on ? t('def.inTeam') : t('def.unit.' + key + '.note')}</span>`);
    node.prepend(spriteNode(key, 26));
    node.setAttribute('aria-pressed', String(on));
    node.addEventListener('click', () => {
      if (!T.toggleTeam(save, key)) { toast(t(on ? 'def.noEmptyTeam' : 'def.teamFull')); return; }
      T.store(save);
      buildPalette();
      renderCamp();
      Sound.play('click');
    });
    el.teamList.appendChild(node);
  }

  el.heroList.textContent = '';
  const heroes = save.owned.filter(T.isHero);
  if (!heroes.length) {
    const none = document.createElement('p');
    none.className = 'camp-note';
    none.textContent = t('def.noHeroes', { n: D.HERO_FROM });
    el.heroList.appendChild(none);
  }
  el.heroCount.textContent = t('def.slots', { used: save.heroes.length, total: T.heroSlots(save) });
  for (const key of heroes) {
    const on = save.heroes.includes(key);
    const node = row(`<span class="who">${who(key)}<br><span class="camp-note">${t('def.skill.' + key)} · ${t('def.unit.' + key + '.note')}</span></span>`
      + `<span class="sub">${on ? t('def.taken') : t('def.hire', { n: D.UNITS[key].cost })}</span>`);
    node.prepend(spriteNode(key, 26));
    node.setAttribute('aria-pressed', String(on));
    node.addEventListener('click', () => {
      if (!T.chooseHero(save, key)) { toast(t('def.heroFull')); return; }
      T.store(save);
      buildPalette();
      renderCamp();
      Sound.play('click');
    });
    el.heroList.appendChild(node);
  }

  el.lockList.textContent = '';
  const shut = T.lockedList(save);
  if (!shut.length) {
    const done = document.createElement('p');
    done.className = 'camp-note';
    done.textContent = t('def.allUnlocked');
    el.lockList.appendChild(done);
  }
  for (const key of shut) {
    const cost = T.unlockCost(save, key);
    const d = D.UNITS[key];
    const node = row(`<span class="who">${d.hero ? t('def.heroPrefix', { name: who(key) }) : t('def.unit.' + key)}`
      + `<br><span class="camp-note">${t('def.rangeSkill', {
        min: d.range.min, max: d.range.max,
        skill: t('def.skill.' + key), note: t('def.skill.' + key + '.note'),
      })}</span></span>`
      + `<span class="sub price">${t('def.gemPrice', { n: cost })}</span>`);
    node.prepend(spriteNode(key, 26));
    node.disabled = save.gems < cost;
    node.addEventListener('click', () => {
      if (!T.buyUnit(save, key)) return;
      T.store(save);
      buildPalette();
      renderCamp();
      Sound.play('place');
    });
    el.lockList.appendChild(node);
  }

  // 레벨은 부대 하나에 하나다. 줄도 하나지만, 올리면 누가 얼마나 세지는지는
  // 가진 사람마다 달라 데려가는 사람들의 값을 같이 적는다.
  el.levelList.textContent = '';
  {
    const cost = T.levelCost(save);
    const now = T.modsOf(save);
    const next = T.modsWith(save, 1);
    const rows = save.owned.map((key) => {
      const a = R.statOf(key, 1, now);
      const b = R.statOf(key, 1, next);
      return t('def.levelDelta', { name: t('def.unit.' + key), a: num(a.damage), b: num(b.damage) });
    });
    const node = row(`<span class="who">${t('def.levelRow', { n: T.levelOf(save) })}`
      + `<br><span class="camp-note">${t('def.levelNote')}</span>`
      + `<br><span class="camp-note">${rows.join(' · ')}</span></span>`
      + `<span class="sub price">${t('def.gemPrice', { n: cost })}</span>`);
    node.disabled = save.gems < cost;
    node.addEventListener('click', () => {
      if (!T.buyLevel(save)) return;
      T.store(save);
      renderCamp();
      Sound.play('place');
    });
    el.levelList.appendChild(node);
  }

  el.perkList.textContent = '';
  for (const id of Object.keys(T.PERKS)) {
    const perk = T.PERKS[id];
    const top = save.perks[id] >= perk.max;
    const cost = T.perkCost(save, id);
    const node = row(`<span class="who">${t('def.perk.' + id)} <span class="camp-note">${save.perks[id]}/${perk.max}</span><br><span class="camp-note">${t('def.perk.' + id + '.note')}</span></span><span class="sub price">${top ? t('def.perkTop') : t('def.gemPrice', { n: cost })}</span>`);
    node.disabled = top || save.gems < cost;
    node.addEventListener('click', () => {
      if (!T.buyPerk(save, id)) return;
      T.store(save);
      buildPalette();
      renderCamp();
      Sound.play('place');
    });
    el.perkList.appendChild(node);
  }
}

el.stageDown.addEventListener('click', () => { newRun(stage - 1); renderCamp(); });
el.stageUp.addEventListener('click', () => { newRun(stage + 1); renderCamp(); });

el.barUp.addEventListener('click', () => { if (picked && R.upgrade(run, picked.id)) Sound.play('place'); hud(); });
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
// 배속은 눌러야 바뀌는 값이지만 처음 한 번은 여기서 적는다 — HTML에 적어 두면
// 그 한 글자만 한국어로 남는다.
const paintSpeed = () => { el.speed.querySelector('.tool-label').textContent = t('def.speed', { n: speed }); };
paintSpeed();
el.speed.addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  paintSpeed();
  Sound.play('click');
});
el.restart.addEventListener('click', () => { newRun(stage); Sound.play('click'); });
el.resultCamp.addEventListener('click', () => {
  renderCamp();
  campSheet.open();
  Sound.play('click');
});
el.again.addEventListener('click', () => {
  newRun(run.over === 'won' ? stage + 1 : stage);
  Sound.play('click');
});

window.addEventListener('resize', () => { layout(); });
const dark = window.matchMedia('(prefers-color-scheme: dark)');
if (dark.addEventListener) dark.addEventListener('change', readTheme);

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });
const campSheet = window.SharedSheet.bind({ sheet: el.camp, opener: el.campOpen, closer: el.campClose });
el.campOpen.addEventListener('click', renderCamp);

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
SP.load();
readTheme();
newRun(save.best + 1);
renderCamp();
requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });

window.DefenseDebug = {
  run: () => run, save: () => save, rules: R, meta: T,
  go: (n) => newRun(n),
  wipe: () => { save = T.blank(); T.store(save); newRun(1); renderCamp(); },
};

})();

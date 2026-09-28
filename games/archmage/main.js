'use strict';

// 화면: 전장 캔버스, 조이스틱, 룬 고르기, 회귀의 방. 규칙은 sim.js, 조합은 runes.js,
// 회귀 사이에 남는 것은 meta.js에 있고 여기서는 읽어서 그리기만 한다.
(function () {
  const Runes = window.ArchmageRunes;
  const S = window.ArchmageSim;
  const M = window.ArchmageMeta;
  const G = window.ArchmageGear;
  const I = window.ArchmageIcons;
  const Sound = window.ArchmageSound;
  const { ELEMENTS } = Runes;

  const T = (key, vars) => window.SharedI18n.t(key, vars) || key;
  const SAVE_KEY = 'web-games.archmage.save';
  const STEP = 1 / 60;
  // 화면 너비에 담기는 세계의 폭. 폰 세로 화면에서 적이 나오는 고리(420)가 화면
  // 바로 바깥에 오도록 맞췄다 — 더 넓히면 적이 보이는 채로 솟아나고, 좁히면 몰려오는
  // 것을 볼 틈이 없다.
  const VIEW_W = 400;
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

  const el = {};
  for (const [name, id] of [
    ['wrap', 'board-wrap'], ['canvas', 'board'], ['alert', 'alert'],
    ['lobby', 'lobby'], ['lobbyBody', 'lobby-body'], ['tabs', 'tabs'], ['itemLayer', 'item-layer'], ['itemCard', 'item-card'],
    ['status', 'status'], ['purseCircle', 'purse-circle'], ['purseMana', 'purse-mana'], ['purseGold', 'purse-gold'],
    ['levelup', 'levelup'], ['levelTitle', 'level-title'], ['levelNote', 'level-note'], ['choices', 'choices'],
    ['levelActions', 'level-actions'], ['levelBack', 'level-back'],
    ['result', 'result'], ['resultTitle', 'result-title'], ['resultNote', 'result-note'], ['report', 'report'], ['regress', 'regress'],
    ['paused', 'paused'], ['resume', 'resume'], ['pause', 'pause'],
    ['circleChip', 'circle-chip'], ['levelChip', 'level-chip'], ['killsChip', 'kills-chip'], ['timeChip', 'time-chip'],
    ['xpFill', 'xp-fill'], ['bossBar', 'boss-bar'], ['bossFill', 'boss-fill'],
    ['slots', 'slots'], ['help', 'help'], ['helpOpen', 'help-open'], ['helpClose', 'help-close'],
    ['toggleBgm', 'toggle-bgm'], ['toggleSfx', 'toggle-sfx'],
  ]) el[name] = document.getElementById(id);
  const ctx = el.canvas.getContext('2d');

  // --- 저장 ---
  function loadSave() {
    try { return M.parse(localStorage.getItem(SAVE_KEY)); } catch { return M.fresh(); }
  }
  function store() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 무시 */ }
  }
  const save = loadSave();

  let mode = 'camp';
  let night = save.night;
  let state = S.create({ circle: night, seed: 1 });
  let paused = false;
  let seenThisRun = new Set();

  // --- 마법의 이름 ---
  function secondOf(spell) {
    let second = null;
    for (const e of ELEMENTS) {
      if (e !== spell.primary && spell.counts[e] && (!second || spell.counts[e] > spell.counts[second])) second = e;
    }
    return second;
  }
  function spellName(spell) {
    if (!spell) return T('spell.none');
    const second = secondOf(spell);
    let n = 0;
    for (const e of ELEMENTS) n += spell.counts[e];
    // 같은 원소를 여럿 새겨 단계가 오르면 그 단계의 이름을 쓴다(메테오, 해일). 로마
    // 숫자는 이름이 보여 주는 것보다 원소가 더 들었을 때만 붙인다.
    let name;
    if (spell.recipe) name = T('recipe.' + spell.key);
    else {
      const base = spell.form >= 2 ? T('spell.' + spell.primary + '.' + spell.form)
        : T(second ? 'spell.' + spell.primary + '-' + second : 'spell.' + spell.primary);
      name = n > spell.form ? base + ' ' + ROMAN[n] : base;
    }
    // 수식어가 있으면 이름 앞에 붙인다(연쇄의 대지 균열). 많이 넣은 것부터.
    const mods = Object.keys(spell.mods || {});
    if (!mods.length) return name;
    mods.sort((a, b) => spell.mods[b] - spell.mods[a] || Runes.MODIFIERS.indexOf(a) - Runes.MODIFIERS.indexOf(b));
    return T('spell.withMods', { mods: mods.map((id) => T('rune.' + id)).join(T('spell.modJoin')), name });
  }
  // 아홉 번째 밤까지는 말로, 그 뒤로는 숫자로 부른다.
  const nightName = (n) => (n <= 9 ? T('am.night' + n) : T('am.nightN', { n }));
  const known = (key) => !!save.grimoire[key] || (mode === 'run' && state.formed.has(key)) || seenThisRun.has(key);

  function runesFromKey(key) {
    const out = [];
    for (const part of key.split('-')) {
      const m = /^([a-z]+)(\d+)$/.exec(part);
      for (let i = 0; i < Number(m[2]); i++) out.push({ id: m[1], grade: 0 });
    }
    return out;
  }

  // 마법진의 룬 구멍. 서클 수만큼 파 두고 새긴 룬을 끼운다 — 칸이 보이지 않으면
  // 서클이 무엇을 정하는지, 왜 더 못 넣는지 알아볼 길이 없다.
  function sockets(runes, cap, mark) {
    let out = '<span class="sockets">';
    for (let i = 0; i < cap; i++) {
      const r = runes[i];
      if (!r) { out += '<span class="socket"></span>'; continue; }
      const g = r.grade ? '<span class="grade">+' + r.grade + '</span>' : '';
      out += '<span class="socket filled' + (mark === i ? ' new' : '') + '" style="--c:' + I.colorOf(r.id) + '">' + I.svg(r.id) + g + '</span>';
    }
    return out + '</span>';
  }

  function glyphs(runes, withGrade) {
    return '<span class="glyphs">' + runes.map((r) => {
      const g = withGrade && r.grade ? '<span class="grade">+' + r.grade + '</span>' : '';
      return '<span style="color:' + I.colorOf(r.id) + '">' + I.svg(r.id) + '</span>' + g;
    }).join('') + '</span>';
  }

  // --- 캔버스 크기 ---
  let cssW = 0, cssH = 0, dpr = 1, k = 1;
  function layout() {
    cssW = el.wrap.clientWidth;
    const top = el.wrap.getBoundingClientRect().top + window.scrollY;
    const below = el.slots.offsetHeight + 24;
    const avail = window.innerHeight - top - below;
    cssH = Math.round(Math.max(320, Math.min(cssW * 1.9, avail)));
    dpr = Math.min(3, window.devicePixelRatio || 1);
    el.canvas.style.height = cssH + 'px';
    el.canvas.width = Math.round(cssW * dpr);
    el.canvas.height = Math.round(cssH * dpr);
    k = cssW / VIEW_W;
    buildSprites();
    lobbyArt = null;
  }

  // --- 그림 ---
  // 캐릭터·적·소품은 art.js가 긋고, 여기서는 판을 열 때 한 번 찍어 두고 찍어 쓴다.
  const A = window.ArchmageArt;
  const FRAMES = 4;
  const sprites = {};
  function offscreen(w, h, draw) {
    const scale = dpr * k * 1.5;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * scale);
    c.height = Math.ceil(h * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    draw(g);
    return { img: c, w, h };
  }

  function whiteOf(sp) {
    const c = document.createElement('canvas');
    c.width = sp.img.width; c.height = sp.img.height;
    const g = c.getContext('2d');
    g.drawImage(sp.img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    return { img: c, w: sp.w, h: sp.h };
  }

  function glowSprite(color, size) {
    return offscreen(size, size, (g) => {
      const r = size / 2;
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.18, color);
      grad.addColorStop(0.5, hexA(color, 0.35));
      grad.addColorStop(1, hexA(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    });
  }

  const hexA = (hex, a) => A.rgba(hex, a);

  // 날아가는 것의 꼬리. 오른쪽이 머리이고, 뒤로 갈수록 가늘고 옅어진다.
  function streakSprite(color) {
    return offscreen(64, 20, (g) => {
      const grad = g.createLinearGradient(0, 0, 64, 0);
      grad.addColorStop(0, hexA(color, 0));
      grad.addColorStop(0.6, hexA(color, 0.55));
      grad.addColorStop(0.85, color);
      grad.addColorStop(1, '#ffffff');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(0, 10); g.quadraticCurveTo(40, 3, 56, 3.5); g.arc(56, 10, 6.5, -Math.PI / 2, Math.PI / 2); g.quadraticCurveTo(40, 17, 0, 10); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(55, 10, 5, 3, 0, 0, Math.PI * 2); g.fill();
    });
  }

  function buildSprites() {
    for (const type in A.FOES) {
      const def = A.FOES[type];
      sprites[type] = [];
      sprites[type + '!'] = [];
      for (let f = 0; f < FRAMES; f++) {
        const sp = offscreen(def.box[0], def.box[1], (g) => def.draw(g, f));
        sprites[type].push(sp);
        sprites[type + '!'].push(whiteOf(sp));
      }
    }
    sprites.mage = [];
    for (let f = 0; f < FRAMES; f++) sprites.mage.push(offscreen(A.MAGE.box[0], A.MAGE.box[1], (g) => A.MAGE.draw(g, f)));
    sprites.mage_ = sprites.mage.map(whiteOf);
    for (const name in A.PROPS) sprites['prop-' + name] = offscreen(A.PROPS[name].box[0], A.PROPS[name].box[1], A.PROPS[name].draw);
    for (const e of ELEMENTS) sprites['glow-' + e] = glowSprite(I.COLORS[e], 40);
    sprites['glow-arcane'] = glowSprite(I.COLORS.arcane, 40);
    sprites['glow-leech'] = glowSprite(I.COLORS.leech, 40);
    sprites['glow-heal'] = glowSprite(I.COLORS.heal, 40);
    for (const e of ELEMENTS.concat(['arcane'])) sprites['streak-' + e] = streakSprite(I.colorOf(e));
    sprites.gem = offscreen(14, 14, (g) => {
      A.glow(g, 7, 7, 7, '#8fe9ff', 0.45);
      g.strokeStyle = '#0b2a3a'; g.lineWidth = 1.6; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(7, 1.5); g.lineTo(11, 7); g.lineTo(7, 12.5); g.lineTo(3, 7); g.closePath(); g.stroke();
      g.fillStyle = '#c9f6ff'; g.fill();
      g.fillStyle = '#3fb8e6'; g.beginPath(); g.moveTo(7, 7); g.lineTo(11, 7); g.lineTo(7, 12.5); g.lineTo(3, 7); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(7, 2.5); g.lineTo(8.4, 6); g.lineTo(5.6, 6); g.closePath(); g.fill();
    });
    sprites.gemBig = offscreen(18, 18, (g) => {
      A.glow(g, 9, 9, 9, '#ffcf5a', 0.5);
      g.strokeStyle = '#3a2408'; g.lineWidth = 1.8; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(9, 1.5); g.lineTo(14.5, 9); g.lineTo(9, 16.5); g.lineTo(3.5, 9); g.closePath(); g.stroke();
      g.fillStyle = '#ffe9a8'; g.fill();
      g.fillStyle = '#e8a42a'; g.beginPath(); g.moveTo(9, 9); g.lineTo(14.5, 9); g.lineTo(9, 16.5); g.lineTo(3.5, 9); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(9, 3); g.lineTo(10.8, 7.6); g.lineTo(7.2, 7.6); g.closePath(); g.fill();
    });
    sprites.ground = groundTile();
    sprites.light = lightSprite();
    vignette = null;
  }

  // 바닥. 한 장을 그려 두고 세계 좌표에 무늬로 깐다 — 움직일 때 바닥이 같이 흘러야
  // 걷는 느낌이 난다. 기기 픽셀 밀도대로 그려 두지 않으면 두 배로 늘어나 흐려진다.
  const GROUND = 512;
  function groundTile() {
    const q = Math.min(2, dpr * k);
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(GROUND * q);
    const g = c.getContext('2d');
    g.scale(q, q);
    A.ground(g, GROUND, S.rng(7));
    c.q = q;
    return c;
  }

  // 빛 한 점. 어둠 막에서 이 모양으로 도려낸다.
  function lightSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return c;
  }

  // 흩어 둔 폐허. 세계를 큰 칸으로 나눠 칸마다 같은 자리에 같은 것이 놓인다 — 되돌아가도
  // 거기 있어야 지나온 길이 된다.
  const PROP_CELL = 170;
  const PROP_KINDS = ['grave', 'pillar', 'tree', 'skulls', 'crystal', 'candle', 'grave', 'skulls', 'candle'];
  function propAt(cx, cy) {
    let h = (cx * 73856093) ^ (cy * 19349663) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15;
    const u = (h >>> 0) / 4294967296;
    if (u > 0.55) return null;
    // 마법사가 서는 첫 자리는 비워 둔다.
    if (Math.abs(cx) <= 0 && Math.abs(cy) <= 0) return null;
    const v = ((h >>> 8) & 0xffff) / 65536, w = ((h >>> 3) & 0xffff) / 65536;
    return { kind: PROP_KINDS[(h >>> 20) % PROP_KINDS.length], x: (cx + 0.15 + v * 0.7) * PROP_CELL, y: (cy + 0.15 + w * 0.7) * PROP_CELL };
  }
  function drawProps(x0, y0, x1, y1) {
    for (let cy = Math.floor(y0 / PROP_CELL) - 1; cy <= Math.floor(y1 / PROP_CELL) + 1; cy++) {
      for (let cx = Math.floor(x0 / PROP_CELL) - 1; cx <= Math.floor(x1 / PROP_CELL) + 1; cx++) {
        const pr = propAt(cx, cy);
        if (!pr) continue;
        const sp = sprites['prop-' + pr.kind];
        ctx.drawImage(sp.img, pr.x - sp.w / 2, pr.y - sp.h + 3, sp.w, sp.h);
        if (pr.kind === 'candle' || pr.kind === 'crystal') lights.push(pr.x, pr.y - sp.h * 0.6, pr.kind === 'candle' ? 60 : 70);
      }
    }
  }

  let vignette = null;

  // --- 이펙트 ---
  let fx = [];
  let shake = 0;
  const lastSound = {};
  function sound(name, arg, gap) {
    const now = performance.now();
    const key = name + (arg || '');
    if (gap && now - (lastSound[key] || 0) < gap) return;
    lastSound[key] = now;
    Sound.play(name, arg);
  }

  let gemPitch = 0;
  function handle(events) {
    for (const ev of events) {
      if (ev.type === 'cast' || ev.type === 'echo') {
        sound('cast', ev.el, 90);
        fx.push({ kind: 'cast', ci: ev.ci, el: ev.el, t: 0, life: 0.35 });
      } else if (ev.type === 'burst-hit') {
        fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, el: ev.el, t: 0, life: 0.3 });
        sound('hit', null, 60);
      } else if (ev.type === 'impact') {
        if (ev.sub === 'bolt') {
          fx.push({ kind: 'bolt', x: ev.x, y: ev.y, r: ev.r, el: ev.el, t: 0, life: 0.22, seed: Math.random() * 1000 });
          sound('hit', null, 50);
        } else {
          fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, el: ev.el, t: 0, life: 0.45 });
          shake = Math.max(shake, ev.sub === 'ice' ? 1 : 3);
          sound('cast', ev.sub === 'ice' ? 'water' : 'earth', 80);
        }
      } else if (ev.type === 'aura') {
        if (ev.screen) { fx.push({ kind: 'flash', el: ev.el, t: 0, life: 0.35 }); shake = Math.max(shake, 4); }
        else if (fx.length < 400) fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, el: ev.el, t: 0, life: 0.3 });
        sound('cast', ev.el, 150);
      } else if (ev.type === 'shock') {
        fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, el: ev.el, t: 0, life: 0.3 });
      } else if (ev.type === 'quake') {
        fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r, el: 'earth', t: 0, life: 0.45 });
        if (ev.screen) fx.push({ kind: 'flash', el: 'earth', t: 0, life: 0.35 });
        shake = Math.max(shake, 4);
        sound('cast', 'earth', 120);
      } else if (ev.type === 'kill') {
        if (fx.length < 400) fx.push({ kind: 'puff', x: ev.x, y: ev.y, foe: ev.foe, t: 0, life: 0.5 });
        sound('kill', null, 45);
      } else if (ev.type === 'gem') {
        gemPitch = (gemPitch + 1) % 12;
        sound('gem', gemPitch, 40);
      } else if (ev.type === 'hurt') {
        shake = Math.max(shake, 5);
        sound('hurt', null, 120);
      } else if (ev.type === 'level') {
        fx.push({ kind: 'levelup', t: 0, life: 0.8 });
        sound('level');
      } else if (ev.type === 'unlock') {
        alert(T('am.unlockAlert', { n: ev.ci + 1 }));
        sound('unlock');
      } else if (ev.type === 'formed') {
        if (!save.grimoire[ev.key] && !seenThisRun.has(ev.key)) {
          seenThisRun.add(ev.key);
          alert(T('am.newSpell', { name: spellName(state.circles[ev.ci].spell) }));
          sound('discover');
        }
      } else if (ev.type === 'burst') {
        alert(T('am.burstAlert'));
        sound('burst');
      } else if (ev.type === 'boss') {
        alert(T('am.bossAlert'), 2600);
        shake = 10;
        sound('boss');
      } else if (ev.type === 'charge') {
        shake = Math.max(shake, 3);
      }
    }
  }

  let alertTimer = 0;
  function alert(text, ms = 1800) {
    el.alert.textContent = text;
    el.alert.classList.add('show');
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => el.alert.classList.remove('show'), ms);
  }

  // --- 그리기 ---
  let clock = 0;
  // 빛. 판 위를 어둠 막으로 덮고 빛나는 것들 자리만 도려낸다 — 밤의 전장이라 마법이
  // 곧 조명이어야 한다. 막은 4분의 1 크기로 그려 늘인다. 빛은 흐릿해도 되고, 제 크기로
  // 그리면 빛 백 개를 도려내는 값이 폰에서 무겁다.
  const lights = [];
  let dark = null;
  const MAX_LIGHTS = 140;
  function light(x, y, r) { if (lights.length < MAX_LIGHTS * 3) lights.push(x, y, r); }

  function draw() {
    const p = state.player;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    const camX = p.x + sx, camY = p.y + sy;
    const s = dpr * k;
    ctx.setTransform(s, 0, 0, s, dpr * cssW / 2 - camX * s, dpr * cssH / 2 - camY * s);
    const halfW = cssW / k / 2 + 40, halfH = cssH / k / 2 + 40;
    const x0 = camX - halfW, y0 = camY - halfH;
    lights.length = 0;

    // 바닥은 조각을 이어 붙여 깐다. 무늬 채우기(createPattern)에 배율을 걸면 폰의 느린
    // 길로 빠져 한 프레임이 세 배 걸렸다. 조각 사이의 머리카락 틈을 막으려 한 단위씩 겹친다.
    const T0 = Math.floor(x0 / GROUND), T1 = Math.floor((x0 + halfW * 2) / GROUND);
    const U0 = Math.floor(y0 / GROUND), U1 = Math.floor((y0 + halfH * 2) / GROUND);
    for (let ty = U0; ty <= U1; ty++) for (let tx = T0; tx <= T1; tx++) ctx.drawImage(sprites.ground, tx * GROUND, ty * GROUND, GROUND + 1, GROUND + 1);

    const visible = (x, y, r) => x > x0 - r && x < x0 + halfW * 2 + r && y > y0 - r && y < y0 + halfH * 2 + r;

    drawProps(x0, y0, x0 + halfW * 2, y0 + halfH * 2);

    // 지대
    for (const z of state.zones) { drawZone(z); light(z.x, z.y, z.r * 1.5); }
    for (const q of state.quakes) drawQuake(q, p);
    ctx.globalCompositeOperation = 'lighter';
    for (const a of state.auras) { drawAura(a, p); if (!a.screen) light(p.x, p.y, a.r * 1.3); }
    ctx.globalCompositeOperation = 'source-over';
    for (const m of state.meteors) drawMeteorMark(m);

    // 보석. 제자리에서 천천히 떠오르내리며 반짝인다.
    for (const g of state.gems) {
      if (!visible(g.x, g.y, 10)) continue;
      const big = g.v > 3;
      const sp = big ? sprites.gemBig : sprites.gem;
      const w = big ? 16 : 11;
      const bob = Math.sin(clock * 3 + g.x * 0.1) * 1.2;
      ctx.drawImage(sp.img, g.x - w / 2, g.y - w / 2 - 2 + bob, w, w);
    }

    drawCircleUnder(p);

    // 적은 위쪽부터 그린다. 겹칠 때 앞에 선 것이 위에 오게.
    const foes = state.foes.filter((f) => visible(f.x, f.y, 60));
    foes.sort((a, b) => a.y - b.y);
    let mageDrawn = false;
    for (const f of foes) {
      if (!mageDrawn && f.y > p.y) { drawMageAt(p); mageDrawn = true; }
      drawFoe(f, p);
    }
    if (!mageDrawn) drawMageAt(p);

    ctx.globalCompositeOperation = 'lighter';
    for (const o of state.orbits) drawOrbit(o, p);
    for (const sh of state.shots) { drawShot(sh); light(sh.x, sh.y, sh.kind === 'bolt' ? 46 : 34); }
    for (const w of state.waves) { drawWave(w); light(w.x, w.y, w.w * 1.6); }
    for (const t of state.tornados) { drawTornado(t); light(t.x, t.y, t.r * 2); }
    for (const m of state.meteors) drawMeteor(m);
    for (const f of fx) drawFx(f, p);
    ctx.globalCompositeOperation = 'source-over';
    for (const f of fx) if (f.kind === 'puff') drawPuff(f);

    drawDark(camX, camY);
    drawAmbient();
    drawHp(p);
    drawDanger(p);
    drawStick();
  }

  function drawDark(camX, camY) {
    const W = Math.ceil(el.canvas.width / 4), H = Math.ceil(el.canvas.height / 4);
    if (!dark || dark.width !== W || dark.height !== H) {
      dark = document.createElement('canvas');
      dark.width = W; dark.height = H;
    }
    const g = dark.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    // 밤이 깊을수록 어둡다.
    g.fillStyle = 'rgba(6,4,20,' + Math.min(0.7, 0.5 + state.depth * 0.02).toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    const s = (dpr * k) / 4;
    const ox = W / 2 - camX * s, oy = H / 2 - camY * s;
    const p = state.player;
    const flick = 1 + Math.sin(clock * 7) * 0.03 + Math.sin(clock * 13) * 0.02;
    const L = sprites.light;
    const put = (x, y, r) => { const R = r * s; g.drawImage(L, ox + x * s - R, oy + y * s - R, R * 2, R * 2); };
    put(p.x, p.y - 10, 170 * flick);
    put(p.x, p.y - 10, 90);
    for (let i = 0; i < lights.length; i += 3) put(lights[i], lights[i + 1], lights[i + 2]);
    // 가장자리 그늘도 같은 막에 얹는다. 따로 한 장을 덮으면 화면 전체를 한 번 더 칠한다.
    g.globalCompositeOperation = 'source-over';
    if (!vignette || vignette.width !== W) {
      vignette = document.createElement('canvas');
      vignette.width = W; vignette.height = H;
      const vg = vignette.getContext('2d');
      const r = Math.hypot(W, H) / 2;
      const grad = vg.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
      grad.addColorStop(0, 'rgba(0,0,8,0)');
      grad.addColorStop(1, 'rgba(0,0,8,0.72)');
      vg.fillStyle = grad; vg.fillRect(0, 0, W, H);
    }
    g.drawImage(vignette, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(dark, 0, 0, el.canvas.width, el.canvas.height);
  }

  // 떠오르는 불티. 화면에 붙어 있어 움직여도 따라오지 않는다 — 공기에 떠 있는 것이다.
  const embers = [];
  function drawAmbient() {
    const W = cssW, H = cssH;
    while (embers.length < 36) embers.push({ x: Math.random() * W, y: H + Math.random() * H, v: 8 + Math.random() * 18, r: 0.6 + Math.random() * 1.6, ph: Math.random() * 6.28, hue: Math.random() < 0.7 ? '#ff9a4a' : '#b99bff' });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      e.y -= e.v / 60;
      e.x += Math.sin(clock * 0.8 + e.ph) * 0.15;
      if (e.y < -10) { e.y = H + 10; e.x = Math.random() * W; }
      const a = 0.35 + 0.35 * Math.sin(clock * 3 + e.ph);
      ctx.fillStyle = hexA(e.hue, Math.max(0, a));
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- 로비의 그림 ---
  // 회귀 사이의 자리. 핏빛 달 아래 무너진 탑들, 발밑에서 도는 마법진 위에 마법사가 선다.
  // 마법진의 고리 수가 지금의 서클이다 — 돌파하면 로비의 그림이 먼저 달라진다.
  let lobbyArt = null, lobbyMage = null, lobbyFeet = 0;
  function buildLobbyArt() {
    const W = cssW, H = cssH;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const horizon = H * 0.5;
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#05040f'); sky.addColorStop(0.55, '#170f36'); sky.addColorStop(1, '#40183e');
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 2);
    const rand = S.rng(11);
    for (let i = 0; i < 140; i++) {
      const x = rand() * W, y = rand() * horizon * 0.9, r = rand() < 0.08 ? 1.3 : 0.6;
      g.fillStyle = 'rgba(230,225,255,' + (0.3 + rand() * 0.6) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 핏빛 달
    const mx = W * 0.8, my = H * 0.14, mr = Math.min(W, H) * 0.11;
    A.glow(g, mx, my, mr * 3, '#ff4a5a', 0.28);
    const moon = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    moon.addColorStop(0, '#ffe2d6'); moon.addColorStop(0.6, '#f08a7a'); moon.addColorStop(1, '#b0404e');
    g.fillStyle = moon; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(120,30,50,0.25)';
    for (const [dx, dy, rr] of [[-0.3, 0.2, 0.22], [0.25, -0.2, 0.15], [0.15, 0.4, 0.12], [-0.1, -0.45, 0.09]]) { g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2); g.fill(); }
    // 무너진 탑들. 먼 줄은 옅게, 가까운 줄은 짙게.
    const skyline = (base, color, towers, hmin, hmax) => {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, horizon + 4);
      let x = 0;
      while (x < W) {
        const w = W / towers * (0.5 + rand());
        const h = hmin + rand() * (hmax - hmin);
        const broken = rand() < 0.5;
        g.lineTo(x, base - h * 0.35);
        g.lineTo(x + w * 0.15, base - h * 0.35);
        g.lineTo(x + w * 0.15, base - h);
        if (broken) { g.lineTo(x + w * 0.35, base - h * 1.08); g.lineTo(x + w * 0.5, base - h * 0.9); g.lineTo(x + w * 0.62, base - h * 1.02); }
        else { g.lineTo(x + w * 0.45, base - h * 1.35); }
        g.lineTo(x + w * 0.75, base - h);
        g.lineTo(x + w * 0.75, base - h * 0.3);
        x += w;
      }
      g.lineTo(W, horizon + 4); g.closePath(); g.fill();
    };
    skyline(horizon, '#231634', 7, H * 0.08, H * 0.16);
    skyline(horizon + 6, '#130c20', 5, H * 0.05, H * 0.12);
    // 창에 남은 불빛 몇 개
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(255,170,90,' + (0.4 + rand() * 0.4) + ')';
      g.fillRect(rand() * W, horizon - rand() * H * 0.1, 1.6, 2.4);
    }
    // 땅: 지평선에서 발밑으로 짙어진다.
    const ground = g.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, '#1a1128'); ground.addColorStop(0.3, '#0e0a18'); ground.addColorStop(1, '#050409');
    g.fillStyle = ground; g.fillRect(0, horizon, W, H - horizon);
    const haze = g.createLinearGradient(0, horizon - 30, 0, horizon + 30);
    haze.addColorStop(0, 'rgba(120,60,120,0)'); haze.addColorStop(0.5, 'rgba(150,70,130,0.25)'); haze.addColorStop(1, 'rgba(120,60,120,0)');
    g.fillStyle = haze; g.fillRect(0, horizon - 30, W, 60);
    lobbyArt = c;
    const scale = 2.6;
    lobbyMage = [];
    for (let f = 0; f < FRAMES; f++) {
      const m = document.createElement('canvas');
      m.width = Math.ceil(A.MAGE.box[0] * scale * dpr); m.height = Math.ceil(A.MAGE.box[1] * scale * dpr);
      const mg = m.getContext('2d'); mg.scale(scale * dpr, scale * dpr); A.MAGE.draw(mg, f);
      lobbyMage.push(m);
    }
  }

  function placeLobbyFeet() {
    const pick = el.lobbyBody.querySelector('.night-pick');
    const wrapTop = el.wrap.getBoundingClientRect().top;
    lobbyFeet = pick ? Math.max(cssH * 0.3, pick.getBoundingClientRect().top - wrapTop - 26) : cssH * 0.52;
  }

  function drawLobby() {
    if (!lobbyArt) buildLobbyArt();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lobbyArt, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cssW, H = cssH;
    const cx = W / 2, fy = lobbyFeet || H * 0.52;
    // 흐르는 안개
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const x = ((clock * (6 + i * 3) + i * 170) % (W + 300)) - 150;
      ctx.save(); ctx.translate(x, H * 0.5 + i * 18); ctx.scale(1, 0.25);
      A.glow(ctx, 0, 0, 150, '#6a3a8a', 0.12);
      ctx.restore();
    }
    // 발밑의 마법진: 서클 수만큼의 고리와 새겨진 문양이 돈다.
    const R = Math.min(W * 0.36, 150);
    ctx.save();
    ctx.translate(cx, fy);
    ctx.scale(1, 0.34);
    A.glow(ctx, 0, 0, R * 1.3, '#8a5aff', 0.35);
    const rings = save.circle;
    ctx.lineCap = 'round';
    for (let i = 0; i < rings; i++) {
      const r = R * (1 - i * 0.075);
      ctx.strokeStyle = 'rgba(190,160,255,' + (0.85 - i * 0.06) + ')';
      ctx.lineWidth = i === 0 ? 2.4 : 1.2;
      ctx.setLineDash(i % 2 ? [6, 7] : []);
      ctx.lineDashOffset = clock * (i % 2 ? -20 : 14);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    // 별 모양 안쪽 도형
    const inner = R * (1 - rings * 0.075);
    ctx.rotate(clock * 0.15);
    ctx.strokeStyle = 'rgba(210,190,255,0.7)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i * 4 * Math.PI) / 6 - Math.PI / 2;
      const px = Math.cos(a) * inner * 0.92, py = Math.sin(a) * inner * 0.92;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i * 4 * Math.PI) / 6 + Math.PI / 6;
      const px = Math.cos(a) * inner * 0.92, py = Math.sin(a) * inner * 0.92;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    // 고리 위를 도는 룬 문양
    const ids = ['fire', 'water', 'wind', 'earth', 'chain', 'omni', 'echo', 'focus', 'magna'];
    const n = Math.min(ids.length, 3 + rings);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - clock * 0.3;
      ctx.save();
      ctx.translate(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12);
      ctx.rotate(-clock * 0.15);
      ctx.scale(0.55, 1.6);
      ctx.translate(-12, -12);
      ctx.strokeStyle = I.colorOf(ids[i]);
      ctx.lineWidth = 2;
      ctx.stroke(I.path2d(ids[i]));
      ctx.restore();
    }
    ctx.restore();
    // 마법진에서 솟는 빛. 아래가 짙고 위로 흩어진다.
    ctx.save(); ctx.translate(cx, fy - 40); ctx.scale(1, 1.8);
    A.glow(ctx, 0, 0, R * 0.7, '#9a70ff', 0.28);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    // 마법사
    const m = lobbyMage[0];
    const mw = A.MAGE.box[0] * 2.6, mh = A.MAGE.box[1] * 2.6;
    const breathe = Math.sin(clock * 2) * 1.5;
    ctx.drawImage(m, cx - mw / 2, fy - A.MAGE.foot * 2.6 + breathe, mw, mh);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(clock * 3);
    A.glow(ctx, cx - mw / 2 + 30 * 2.6, fy - (A.MAGE.foot - 8) * 2.6 + breathe, 34, '#b99bff', 0.8);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawAmbient();
  }

  // 걸음 빠르기. 늑대는 달리고 골렘은 쿵쿵 걷는다.
  const FOE_ANIM = { slime: 6, goblin: 9, wolf: 13, wraith: 5, golem: 5, boss: 4 };

  function drawFoe(f, p) {
    const def = A.FOES[f.type];
    const fr = ((clock * FOE_ANIM[f.type] + f.phase * 3) | 0) % FRAMES;
    const sp = sprites[f.type][fr];
    const flip = f.x > p.x;
    const w = sp.w, h = sp.h;
    const top = f.y + f.r * 0.55 - def.foot;
    const draw = (img, alpha) => {
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      if (flip) {
        ctx.save(); ctx.translate(f.x, 0); ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, top, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, f.x - w / 2, top, w, h);
      }
      ctx.globalAlpha = 1;
    };
    // 돌진하는 사도. 지나온 자리에 잔상이 남아 무엇이 오는지 미리 보인다.
    if (f.type === 'boss' && f.charge > 0) {
      const d = Math.hypot(p.x - f.x, p.y - f.y) || 1;
      for (let i = 3; i >= 1; i--) {
        ctx.save(); ctx.translate(-(p.x - f.x) / d * i * 12, -(p.y - f.y) / d * i * 12);
        draw(sprites['boss!'][fr].img, 0.12 * (4 - i));
        ctx.restore();
      }
    }
    draw(sp.img);
    if (f.flash > 0) draw(sprites[f.type + '!'][fr].img, Math.min(1, f.flash / 0.08) * 0.85);
    if (f.slow > 0) {
      if (f.slow >= 0.95) {
        // 얼어붙음: 얼음 덩이에 갇힌다.
        ctx.fillStyle = 'rgba(170,225,255,0.38)';
        ctx.strokeStyle = 'rgba(230,248,255,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(f.x - w * 0.42, top + h * 0.25, w * 0.84, h * 0.72, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(f.x - w * 0.32, top + h * 0.3, 2, h * 0.4);
      } else {
        ctx.strokeStyle = 'rgba(140,210,255,0.55)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(f.x, f.y + f.r * 0.55, f.r * 0.9, f.r * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (f.burn > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const u = (clock * 1.8 + f.phase + i * 0.5) % 1;
        const fx0 = f.x + Math.sin(f.phase * 7 + i * 3) * f.r * 0.5;
        ctx.globalAlpha = 1 - u;
        glowAt('fire', fx0, f.y - f.r * 0.2 - u * 16, 12 * (1 - u) + 3);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (f.type === 'boss') light(f.x, f.y - 20, 110);
  }

  function drawMageAt(p) {
    // 흡혈로 생명력이 차오르는 동안 몸이 붉게 빛난다. 숫자를 띄우면 수십 번씩 겹친다.
    if (p.healed > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, p.healed * 4) * 0.8;
      glowAt('leech', p.x, p.y - 12, 50);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const fr = p.moving ? ((clock * 10) | 0) % FRAMES : 0;
    const blink = p.inv > 0 && ((clock * 20) | 0) % 2;
    const sp = sprites.mage[fr];
    const breathe = p.moving ? 0 : Math.sin(clock * 2.2) * 0.6;
    const top = p.y + 6 - A.MAGE.foot + breathe;
    ctx.save();
    ctx.translate(p.x, 0);
    if (p.face < 0) ctx.scale(-1, 1);
    ctx.drawImage(sp.img, -sp.w / 2, top, sp.w, sp.h);
    if (blink) { ctx.globalAlpha = 0.7; ctx.drawImage(sprites.mage_[fr].img, -sp.w / 2, top, sp.w, sp.h); ctx.globalAlpha = 1; }
    ctx.restore();
    // 지팡이 끝의 수정이 빛난다.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(clock * 4);
    glowAt('arcane', p.x + p.face * 12, top + 8, 20);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 발밑의 마법진. 고리의 수가 서클이고, 새긴 룬이 고리 위에서 빛난다.
  function drawCircleUnder(p) {
    const rings = state.circle;
    ctx.save();
    ctx.translate(p.x, p.y + 6);
    ctx.scale(1, 0.55);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < rings; i++) {
      const r = 20 + i * 5;
      ctx.strokeStyle = hexA(I.COLORS.arcane, 0.28 - i * 0.02);
      ctx.lineWidth = i === rings - 1 ? 1.4 : 0.8;
      ctx.setLineDash(i % 2 ? [3, 4] : []);
      ctx.lineDashOffset = clock * (i % 2 ? -12 : 12);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    const runes = [];
    state.circles.forEach((c, ci) => { if (ci < state.unlocked) for (const r of c.runes) runes.push(r.id); });
    const R = 20 + rings * 5 + 4;
    runes.forEach((id, i) => {
      const a = clock * 0.6 + (i / runes.length) * Math.PI * 2;
      ctx.save();
      ctx.translate(Math.cos(a) * R, Math.sin(a) * R);
      ctx.scale(0.36, 0.65);
      ctx.translate(-12, -12);
      ctx.strokeStyle = I.colorOf(id);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke(I.path2d(id));
      ctx.restore();
    });
    ctx.restore();
  }

  function glowAt(elId, x, y, size) {
    const sp = sprites['glow-' + elId] || sprites['glow-arcane'];
    ctx.drawImage(sp.img, x - size / 2, y - size / 2, size, size);
  }

  function drawRotated(sp, x, y, a, w, h) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.drawImage(sp.img, -w + h * 0.5, -h / 2, w, h);
    ctx.restore();
  }

  function drawShot(sh) {
    const a = Math.atan2(sh.vy, sh.vx);
    const el0 = sh.el in I.COLORS ? sh.el : 'arcane';
    if (sh.kind === 'bolt') {
      const size = sh.frag ? 0.5 : 1 + sh.aoe * 0.006;
      glowAt(sh.el, sh.x, sh.y, 30 * size);
      drawRotated(sprites['streak-' + el0], sh.x, sh.y, a, 44 * size, 13 * size);
      // 불티가 꼬리를 따라 흩어진다.
      if (!sh.frag) {
        for (let i = 1; i <= 3; i++) {
          const j = Math.sin(clock * 30 + i * 2.1 + sh.x) * 3;
          glowAt(sh.el, sh.x - Math.cos(a) * i * 9 - Math.sin(a) * j, sh.y - Math.sin(a) * i * 9 + Math.cos(a) * j, 7 - i);
        }
      }
    } else {
      // 창: 가늘고 긴 결정. 빛나는 꼬리 위에 흰 날을 세운다.
      const len = 22 + sh.r * 1.2, wid = Math.max(3, sh.r * 0.5);
      glowAt(sh.el, sh.x, sh.y, 18 + sh.r);
      drawRotated(sprites['streak-' + el0], sh.x, sh.y, a, len * 1.8, wid * 2.6);
      ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(a);
      ctx.fillStyle = '#f2fbff';
      ctx.beginPath(); ctx.moveTo(wid * 1.6, 0); ctx.lineTo(0, -wid * 0.55); ctx.lineTo(-len * 0.7, 0); ctx.lineTo(0, wid * 0.55); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawOrbit(o, p) {
    const fade = Math.min(1, o.life / 0.3, (o.total - o.life) / 0.2 + 0.2);
    ctx.globalAlpha = fade;
    const blades = S.orbitBlades(o, p);
    const color = I.colorOf(o.el);
    const oc = o.cx !== undefined ? { x: o.cx, y: o.cy } : p;
    const R = S.orbitRadius(o);
    ctx.strokeStyle = hexA(color, 0.07);
    ctx.lineWidth = o.blade * 1.2;
    ctx.beginPath(); ctx.arc(oc.x, oc.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineCap = 'round';
    // 칼날이 촘촘하면 빛이 겹쳐 하얗게 타 버린다. 많을수록 하나하나를 옅게.
    const dense = Math.min(1, 5 / Math.max(1, blades.length));
    for (const b of blades) {
      const ang = Math.atan2(b.y - oc.y, b.x - oc.x);
      const dir = o.spin >= 0 ? 1 : -1;
      // 칼날이 지나온 자리에 바람 줄기가 남는다.
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = hexA(color, 0.5 - i * 0.14);
        ctx.lineWidth = o.blade * (0.7 - i * 0.18);
        const r = R + (i - 1) * o.blade * 0.35;
        ctx.beginPath(); ctx.arc(oc.x, oc.y, r, ang - dir * (0.5 + i * 0.12), ang, dir < 0); ctx.stroke();
      }
      ctx.globalAlpha = fade * dense;
      glowAt(o.el, b.x, b.y, o.blade * 2.6);
      ctx.globalAlpha = fade;
      const t = ang + Math.PI / 2 * dir;
      ctx.strokeStyle = '#effff8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, o.blade * 0.85, t - 1, t + 1); ctx.stroke();
      light(b.x, b.y, 36);
    }
    ctx.globalAlpha = 1;
  }

  function drawZone(z) {
    const t = 1 - z.life / z.total;
    const fade = Math.min(1, z.life / 0.3, t * 8);
    const color = I.colorOf(z.el);
    ctx.globalAlpha = fade;
    // 갈라진 땅. 가장자리가 짙고 안쪽은 제 빛깔로 달아오른다.
    const grad = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    grad.addColorStop(0, hexA(color, 0.12));
    grad.addColorStop(0.75, hexA(color, 0.22));
    grad.addColorStop(1, hexA(color, 0.45));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(color, 0.75);
    ctx.lineWidth = 1.3;
    const rand = S.rng((z.x * 13 + z.y * 7) | 0);
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      let a = rand() * Math.PI * 2, d = z.r * 0.12;
      ctx.moveTo(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d);
      while (d < z.r * 0.95) { d += z.r * (0.12 + rand() * 0.1); a += (rand() - 0.5) * 0.7; ctx.lineTo(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d); }
    }
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -clock * 20;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.95 + 0.04 * Math.sin(clock * 6)), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // 가시. 틱마다 솟는다 — 외곽선을 둘러 바위로 보이게.
    const pulse = Math.max(0, 1 - z.tick / 0.4);
    const rise = 1 - pulse;
    if (rise > 0.05) {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4 + z.x;
        const d = z.r * (0.2 + (i % 3) * 0.22);
        const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
        const h = (6 + (i % 2) * 4) * rise;
        ctx.beginPath(); ctx.moveTo(x - 3.5, y + 2); ctx.lineTo(x - 0.5, y - h); ctx.lineTo(x + 3.5, y + 2); ctx.closePath();
        ctx.fillStyle = '#120b1e'; ctx.lineWidth = 2; ctx.strokeStyle = '#120b1e'; ctx.stroke();
        ctx.fillStyle = color; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.moveTo(x - 3, y + 1.5); ctx.lineTo(x - 0.5, y - h); ctx.lineTo(x - 0.5, y + 1.5); ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // 떨어질 자리. 미리 보여야 무엇이 떨어지는지 알고, 떨어지기 전의 긴장이 생긴다.
  function drawMeteorMark(m) {
    const t = 1 - m.delay / m.total;
    ctx.fillStyle = hexA(I.colorOf(m.el), 0.08 + 0.18 * t);
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.4 + 0.6 * t), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(I.colorOf(m.el), 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.stroke();
  }

  // 떨어지는 것. 운석·얼음·바위는 비스듬히 떨어지고, 번개는 떨어지는 대신 곧바로 친다.
  function drawMeteor(m) {
    const t = 1 - m.delay / m.total;
    if (m.sub === 'bolt') return;
    const h = 260 * (1 - t);
    const x = m.x + h * 0.55, y = m.y - h;
    if (m.sub === 'ice') {
      ctx.strokeStyle = hexA(I.COLORS.water, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10, y - 22); ctx.stroke();
      glowAt('water', x, y, 20);
      return;
    }
    if (m.sub === 'rock') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#7a6a55';
      ctx.beginPath(); ctx.arc(x, y, m.r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a8957a';
      ctx.beginPath(); ctx.arc(x - m.r * 0.1, y - m.r * 0.1, m.r * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      return;
    }
    glowAt(m.el, x, y, 34 + m.r * 0.3);
    glowAt(m.el, x + 14, y - 26, 20);
    glowAt(m.el, x + 26, y - 50, 12);
  }

  function drawAura(a, p) {
    if (a.screen) return;
    const fade = Math.min(1, a.life / 0.3, (a.total - a.life) / 0.2 + 0.2);
    const color = I.colorOf(a.el);
    ctx.globalAlpha = fade;
    const grad = ctx.createRadialGradient(p.x, p.y, a.r * 0.2, p.x, p.y, a.r);
    grad.addColorStop(0, hexA(color, 0));
    grad.addColorStop(0.8, hexA(color, 0.12));
    grad.addColorStop(1, hexA(color, 0.35));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(p.x, p.y, a.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(color, 0.7);
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = (a.pull ? 1 : -1) * clock * 60;
    ctx.beginPath(); ctx.arc(p.x, p.y, a.r * (0.92 + 0.05 * Math.sin(clock * 5)), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawWave(w) {
    const fade = Math.min(1, w.life / 0.3, (w.total - w.life) / 0.1 + 0.3);
    const nx = -w.dy, ny = w.dx;
    ctx.globalAlpha = fade;
    ctx.strokeStyle = hexA(I.colorOf(w.el), 0.85);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const back = i * 9;
      ctx.lineWidth = 7 - i * 2;
      ctx.beginPath();
      ctx.moveTo(w.x - nx * w.w - w.dx * (back + 10), w.y - ny * w.w - w.dy * (back + 10));
      ctx.quadraticCurveTo(w.x - w.dx * back, w.y - w.dy * back, w.x + nx * w.w - w.dx * (back + 10), w.y + ny * w.w - w.dy * (back + 10));
      ctx.stroke();
    }
    for (let i = -2; i <= 2; i++) glowAt(w.el, w.x + nx * w.w * i * 0.4, w.y + ny * w.w * i * 0.4, 26);
    ctx.globalAlpha = 1;
  }

  function drawTornado(t) {
    const fade = Math.min(1, t.life / 0.3, (t.total - t.life) / 0.2 + 0.2);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = hexA(I.colorOf(t.el), 0.75);
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const rr = t.r * (0.3 + i * 0.18);
      const a = clock * (7 - i) + i;
      ctx.beginPath(); ctx.arc(t.x, t.y - i * 5, rr, a, a + 3.6); ctx.stroke();
    }
    glowAt(t.el, t.x, t.y, t.r * 1.6);
    ctx.globalAlpha = 1;
  }

  function drawQuake(q, p) {
    const fade = Math.min(1, q.life / 0.3, (q.total - q.life) / 0.2 + 0.2);
    ctx.globalAlpha = fade * 0.5;
    ctx.strokeStyle = hexA(I.COLORS.earth, 0.8);
    ctx.lineWidth = 2;
    const rand = S.rng(7);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      let a = rand() * Math.PI * 2, d = 20;
      ctx.moveTo(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      while (d < q.r) { d += 18 + rand() * 14; a += (rand() - 0.5) * 0.5; ctx.lineTo(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d); }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawFx(f, p) {
    const t = f.t / f.life;
    if (f.kind === 'ring') {
      // 충격파: 빛 한 번, 퍼지는 고리, 튀는 불꽃 줄기.
      const color = I.colorOf(f.el);
      ctx.globalAlpha = (1 - t) * (1 - t);
      glowAt(f.el, f.x, f.y, f.r * 2.2 * (0.5 + t * 0.7));
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = color;
      ctx.lineWidth = 5 * (1 - t) + 0.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.35 + t * 0.75), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 * (1 - t);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + t * 0.7), 0, Math.PI * 2); ctx.stroke();
      if (f.r > 14) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * 0.785 + f.x;
          const r0 = f.r * (0.3 + t * 0.9), r1 = r0 + 6 * (1 - t);
          ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0);
          ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (t < 0.5) light(f.x, f.y, f.r * 1.6);
    } else if (f.kind === 'bolt') {
      // 하늘에서 내리꽂는 번개. 굵은 빛줄기 위에 흰 심지, 곁가지 하나.
      ctx.globalAlpha = 1 - t;
      const rand = S.rng(f.seed | 0);
      const pts = [];
      let x = f.x + (rand() - 0.5) * 40;
      pts.push([x, f.y - 320]);
      for (let j = 1; j <= 7; j++) {
        const u = j / 7;
        pts.push([f.x + (rand() - 0.5) * 30 * (1 - u), f.y - 320 * (1 - u)]);
      }
      const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); };
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hexA(I.colorOf(f.el), 0.5); ctx.lineWidth = 7; path(); ctx.stroke();
      ctx.strokeStyle = '#f4fbff'; ctx.lineWidth = 2.2; path(); ctx.stroke();
      const q = pts[4];
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + 14, q[1] + 18); ctx.lineTo(q[0] + 10, q[1] + 34); ctx.stroke();
      glowAt(f.el, f.x, f.y, f.r * 2.6);
      ctx.globalAlpha = 1;
      light(f.x, f.y, f.r * 2);
    } else if (f.kind === 'levelup') {
      // 레벨업: 발밑에서 금빛 기둥이 솟고 고리가 퍼진다.
      ctx.globalAlpha = 1 - t;
      const r = 12 + t * 50;
      ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 3 * (1 - t) + 0.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      const beam = ctx.createLinearGradient(0, p.y - 90, 0, p.y + 6);
      beam.addColorStop(0, 'rgba(255,217,138,0)'); beam.addColorStop(1, 'rgba(255,217,138,0.55)');
      ctx.fillStyle = beam;
      ctx.fillRect(p.x - 14 * (1 - t * 0.5), p.y - 90, 28 * (1 - t * 0.5), 96);
      ctx.globalAlpha = 1;
      light(p.x, p.y, 120);
    } else if (f.kind === 'flash') {
      // 화면 전체를 치는 마법. 한 번 번쩍여 무엇이 쳤는지 알린다.
      ctx.globalAlpha = (1 - t) * 0.35;
      ctx.fillStyle = I.colorOf(f.el);
      ctx.fillRect(p.x - 700, p.y - 700, 1400, 1400);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'cast') {
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = I.colorOf(f.el);
      ctx.lineWidth = 2 * (1 - t) + 0.5;
      const r = 14 + t * 32;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      glowAt(f.el, p.x + p.face * 12, p.y - 26, 26 * (1 - t));
      ctx.globalAlpha = 1;
    }
  }

  // 쓰러진 적. 흰 실루엣이 주저앉으며 사라지고, 제 빛깔의 조각이 튄다.
  const PUFF = { slime: '#8fd35a', goblin: '#9ccf5a', wolf: '#9aa3c0', wraith: '#a9b6ff', golem: '#c9bfa6', boss: '#ff5a5a' };
  function drawPuff(f) {
    const t = f.t / f.life;
    const def = A.FOES[f.foe];
    if (def && t < 0.45) {
      const u = t / 0.45;
      const sp = sprites[f.foe + '!'][0];
      ctx.globalAlpha = (1 - u) * 0.9;
      const sx = 1 + u * 0.3, sy = 1 - u * 0.7;
      const foot = f.y + 6;
      ctx.save(); ctx.translate(f.x, foot); ctx.scale(sx, sy);
      ctx.drawImage(sp.img, -sp.w / 2, -def.foot, sp.w, sp.h);
      ctx.restore();
    }
    ctx.fillStyle = PUFF[f.foe] || '#fff';
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + f.x * 0.37;
      const v = 18 + (i % 3) * 10;
      const x = f.x + Math.cos(a) * v * t, y = f.y - 6 + Math.sin(a) * v * t * 0.6 - 30 * t + 60 * t * t;
      ctx.globalAlpha = 1 - t;
      ctx.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);
    }
    ctx.globalAlpha = 1;
  }

  function drawHp(p) {
    // 발밑의 생명력 막대. 피격 직후에는 줄어든 몫이 흰빛으로 잠깐 남아 얼마나 맞았는지 보인다.
    const w = 30, h = 4;
    const x = p.x - w / 2, y = p.y + 13;
    const frac = Math.max(0, p.hp / p.maxHp);
    hpShown = hpShown > frac ? Math.max(frac, hpShown - 0.012) : frac;
    ctx.fillStyle = 'rgba(8,4,12,0.85)';
    ctx.beginPath(); ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,240,0.8)';
    ctx.fillRect(x, y, w * hpShown, h);
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, frac < 0.3 ? '#ff9a8a' : '#ff8a94'); grad.addColorStop(1, frac < 0.3 ? '#c21a1a' : '#b8202f');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = 'rgba(230,192,103,0.55)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.stroke();
  }
  let hpShown = 1;

  // 생명력이 바닥이면 화면 가장자리가 붉게 뛴다. 막대보다 먼저 눈에 들어온다.
  function drawDanger(p) {
    const frac = p.hp / p.maxHp;
    if (frac >= 0.3 || state.over) return;
    const a = (0.3 - frac) / 0.3 * (0.55 + 0.25 * Math.sin(clock * 7));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = el.canvas.width, H = el.canvas.height;
    const r = Math.hypot(W, H) / 2;
    const grad = ctx.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
    grad.addColorStop(0, 'rgba(200,0,20,0)');
    grad.addColorStop(1, 'rgba(200,0,20,' + a.toFixed(3) + ')');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  }

  function drawStick() {
    if (!stick) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = stickVector();
    const grad = ctx.createRadialGradient(stick.ox, stick.oy, STICK_R * 0.6, stick.ox, stick.oy, STICK_R);
    grad.addColorStop(0, 'rgba(20,14,40,0.15)'); grad.addColorStop(1, 'rgba(20,14,40,0.45)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(230,192,103,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const kx = stick.ox + v.x * STICK_R, ky = stick.oy + v.y * STICK_R;
    const knob = ctx.createRadialGradient(kx - 5, ky - 5, 2, kx, ky, 18);
    knob.addColorStop(0, 'rgba(220,200,255,0.85)'); knob.addColorStop(1, 'rgba(110,80,210,0.6)');
    ctx.fillStyle = knob;
    ctx.beginPath(); ctx.arc(kx, ky, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 1;
    ctx.stroke();
  }

  // --- 손 ---
  // 떠다니는 조이스틱. 누른 자리가 중심이 된다 — 고정된 자리에 두면 엄지가 그 자리를
  // 찾느라 화면에서 눈을 뗀다.
  const STICK_R = 46;
  let stick = null;
  const keys = new Set();

  function localPoint(ev) {
    const r = el.canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function stickVector() {
    if (!stick) return { x: 0, y: 0 };
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d < 6) return { x: 0, y: 0 };
    const m = Math.min(1, d / STICK_R);
    return { x: (dx / d) * m, y: (dy / d) * m };
  }
  function readInput() {
    let x = 0, y = 0;
    if (keys.has('left')) x -= 1;
    if (keys.has('right')) x += 1;
    if (keys.has('up')) y -= 1;
    if (keys.has('down')) y += 1;
    const v = stickVector();
    x += v.x; y += v.y;
    state.input = { x, y };
  }

  el.canvas.addEventListener('pointerdown', (ev) => {
    if (mode !== 'run') return;
    ev.preventDefault();
    const q = localPoint(ev);
    stick = { id: ev.pointerId, ox: q.x, oy: q.y, x: q.x, y: q.y };
    try { el.canvas.setPointerCapture(ev.pointerId); } catch { /* 무시 */ }
  });
  el.canvas.addEventListener('pointermove', (ev) => {
    if (!stick || ev.pointerId !== stick.id) return;
    const q = localPoint(ev);
    stick.x = q.x; stick.y = q.y;
    // 엄지가 원 밖으로 멀리 나가면 중심을 끌고 간다. 반대로 틀 때 한참 되돌아오지 않게.
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R * 1.6) {
      const pull = (d - STICK_R * 1.6) / d;
      stick.ox += dx * pull; stick.oy += dy * pull;
    }
  });
  const release = (ev) => { if (stick && ev.pointerId === stick.id) stick = null; };
  el.canvas.addEventListener('pointerup', release);
  el.canvas.addEventListener('pointercancel', release);

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  };
  window.addEventListener('keydown', (ev) => {
    const dir = KEYMAP[ev.code];
    if (dir && mode === 'run') { keys.add(dir); ev.preventDefault(); }
    if (ev.code === 'Escape' || ev.code === 'KeyP') togglePause();
  });
  window.addEventListener('keyup', (ev) => { const dir = KEYMAP[ev.code]; if (dir) keys.delete(dir); });
  window.addEventListener('blur', () => { keys.clear(); stick = null; });

  // 알림이나 전화로 화면을 벗어나면 멈춘다. 실시간 게임이라 그사이에 판이 끝난다.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'run' && !state.over && !state.pending) setPaused(true);
  });

  function setPaused(on) {
    paused = on;
    el.paused.hidden = !on;
    el.pause.setAttribute('aria-pressed', String(on));
    keys.clear();
    stick = null;
  }
  function togglePause() {
    if (mode !== 'run' || state.over || state.pending) return;
    setPaused(!paused);
    Sound.play('click');
  }
  el.pause.addEventListener('click', togglePause);
  el.resume.addEventListener('click', togglePause);

  // --- 룬 고르기 ---
  let pickIndex = -1;

  function statsOf(spell) {
    if (!spell) return null;
    return {
      dmg: Math.round(spell.dmg), cd: spell.cd.toFixed(1), dur: spell.dur ? spell.dur.toFixed(1) : null,
      size: Math.round(spell.size), count: spell.count + (spell.kind === 'orbit' ? 2 : 3) * spell.omni,
      leech: spell.leech ? Math.round(spell.leech * 100) : null,
    };
  }

  // 새기기 전과 뒤. 바뀐 값만 화살표로 잇는다 — 같은 룬을 겹쳤을 때 무엇이 늘었는지가
  // 이 줄로 보여야 한다.
  function statsDiff(before, after) {
    if (!after) return T('spell.noElement');
    const a = statsOf(after);
    const b = before && before.kind === after.kind ? statsOf(before) : null;
    const label = {
      dmg: (v) => T('stat.dmg') + ' ' + v, cd: (v) => T('stat.cd') + ' ' + T('stat.sec', { n: v }),
      dur: (v) => T('stat.dur') + ' ' + T('stat.sec', { n: v }), size: (v) => T('stat.size') + ' ' + v,
      count: (v) => T('stat.count') + ' ' + v, leech: (v) => T('stat.leech', { n: v }),
    };
    const parts = [];
    for (const k of ['dmg', 'cd', 'dur', 'size', 'count', 'leech']) {
      if (a[k] === null || (k === 'count' && a[k] <= 1 && (!b || b[k] <= 1))) continue;
      if (b && b[k] !== null && b[k] !== a[k]) parts.push('<b>' + label[k](b[k] + '→' + a[k]) + '</b>');
      else parts.push(label[k](a[k]));
    }
    return parts.join(' · ');
  }

  function nameFor(spell) {
    if (!spell) return '<span class="unknown">' + T('spell.none') + '</span>';
    if (known(spell.key)) return '<b>' + spellName(spell) + '</b>';
    return '<span class="unknown">' + T('spell.unknown') + '</span> <span class="tag">' + T('am.new') + '</span>';
  }

  function optionDesc(opt) {
    if (opt.type === 'erase') return T('desc.erase');
    if (opt.type === 'heal') return T('desc.heal');
    if (Runes.isElement(opt.id)) {
      // 여럿 새기면 무엇이 되는지는 알려 주지 않는다. 조합은 찾아내는 것이고, 찾은 것은
      // 마도서가 자리를 고를 때 보여 준다.
      return '<b>' + T('desc.primary') + '</b> ' + T('form.' + opt.id) +
        '<br><b>' + T('desc.stacked') + '</b> ' + T('stack.' + opt.id) +
        '<br><b>' + T('desc.added') + '</b> ' + T('trait.' + opt.id);
    }
    return T('desc.' + opt.id) + '<br><b>' + T('desc.stacked') + '</b> ' + T('desc.modStack');
  }

  function targetsFor(opt) {
    const out = [];
    for (let ci = 0; ci < state.unlocked; ci++) {
      for (const mode of S.placeModes(state, opt.id, ci)) out.push({ ci, mode, pv: S.previewPlace(state, opt.id, ci, mode) });
    }
    return out;
  }

  function showLevelUp() {
    pickIndex = -1;
    stick = null;
    keys.clear();
    el.levelTitle.textContent = T('am.levelTitle');
    el.levelNote.textContent = T('am.levelNote');
    el.levelActions.hidden = true;
    const opts = state.pending.options;
    el.choices.innerHTML = opts.map((opt, i) => {
      const id = opt.type === 'rune' ? opt.id : opt.type;
      let tag = '';
      if (opt.type === 'rune' && targetsFor(opt).some((t) => t.pv.spell && !known(t.pv.spell.key))) {
        tag = '<span class="tag">' + T('am.new') + '</span>';
      }
      return '<button class="choice" type="button" data-i="' + i + '" style="--c:' + I.colorOf(id) + '">' +
        '<span class="icon" style="color:' + I.colorOf(id) + '">' + I.svg(id) + '</span>' +
        '<span><span class="choice-name">' + T('rune.' + id) + tag + '</span>' +
        '<span class="choice-desc">' + optionDesc(opt) + '</span></span></button>';
    }).join('');
    el.levelup.hidden = false;
  }

  // 자리 고르기. 마법진 셋을 늘 그대로 보여 주고 **구멍을 눌러** 고른다 — 빈 구멍은
  // 새기기, 같은 룬이 끼워진 구멍은 강화, 재각인이면 끼워진 구멍은 제거. 목록으로 풀어
  // 두었을 때는 마법진이 몇 개이고 어디가 비었는지가 한눈에 들어오지 않았다.
  let picked = null;

  function actionFor(opt, ci, slot) {
    if (ci >= state.unlocked) return null;
    const r = state.circles[ci].runes[slot];
    if (opt.type === 'erase') return r ? { kind: 'erase', target: { ci, slot } } : null;
    // 빈 구멍은 첫째만 누를 수 있다. 룬 묶음은 순서를 따지지 않아 늘 앞부터 채워진다.
    if (!r) return slot === state.circles[ci].runes.length && S.placeModes(state, opt.id, ci).includes('add') ? { kind: 'add', target: { ci, mode: 'add' } } : null;
    if (r.id === opt.id) return { kind: 'grade', target: { ci, mode: 'grade', slot } };
    return null;
  }

  function showTargets(i) {
    pickIndex = i;
    picked = null;
    const opt = state.pending.options[i];
    el.levelActions.hidden = false;
    el.levelTitle.textContent = T(opt.type === 'erase' ? 'am.pickErase' : 'am.pickCircle');
    el.levelNote.innerHTML = opt.type === 'erase' ? T('am.tapErase') : T('rune.' + opt.id) + ' · ' + T('am.tapSocket');
    renderTargets();
  }

  function socketButton(opt, ci, slot) {
    const r = state.circles[ci].runes[slot];
    const act = actionFor(opt, ci, slot);
    const sel = picked && picked.ci === ci && picked.slot === slot;
    let cls = 'socket' + (act ? ' can' : '');
    let color = r ? r.id : null;
    let inner = '';
    if (r) {
      cls += ' filled';
      const g = r.grade + (sel && act.kind === 'grade' ? 1 : 0);
      inner = I.svg(r.id) + (g ? '<span class="grade">+' + g + '</span>' : '');
      if (sel && act.kind === 'erase') cls += ' removing';
    } else if (sel) {
      cls += ' filled ghost';
      color = opt.id;
      inner = I.svg(opt.id);
    }
    if (sel) cls += ' new';
    return '<button type="button" class="' + cls + '"' + (color ? ' style="--c:' + I.colorOf(color) + '"' : '') +
      ' data-ci="' + ci + '" data-slot="' + slot + '"' + (act ? '' : ' disabled') + '>' + inner + '</button>';
  }

  function renderTargets() {
    const opt = state.pending.options[pickIndex];
    const cap = S.capacity(state);
    let html = '';
    for (let ci = 0; ci < 3; ci++) {
      const c = state.circles[ci];
      const locked = ci >= state.unlocked;
      let row = '';
      for (let slot = 0; slot < cap; slot++) row += socketButton(opt, ci, slot);
      const name = locked ? T('am.locked', { n: S.CIRCLE_UNLOCK[ci] }) : c.spell ? spellName(c.spell) : T('am.empty');
      html += '<div class="circle-panel' + (locked ? ' locked' : '') + '"><div class="cp-head"><b>' + T('am.slot', { n: ci + 1 }) +
        '</b><span>' + name + '</span></div><div class="sockets big">' + row + '</div></div>';
    }
    if (picked) {
      const act = actionFor(opt, picked.ci, picked.slot);
      const c = state.circles[picked.ci];
      const pv = act.kind === 'erase' ? S.previewErase(state, picked.ci, picked.slot)
        : S.previewPlace(state, opt.id, picked.ci, act.target.mode, picked.slot);
      html += '<div class="preview"><div><span class="tag">' + T('am.' + act.kind) + '</span> ' + nameFor(pv.spell) +
        '<span class="stats">' + statsDiff(c.spell, pv.spell) + '</span></div>' +
        '<button class="btn" type="button" data-confirm="1">' + T('am.confirm') + '</button></div>';
    }
    el.choices.innerHTML = html;
  }

  function commit(target) {
    if (!S.choose(state, pickIndex >= 0 ? pickIndex : 0, target)) return;
    Sound.play('engrave');
    handle(S.drain(state));
    el.levelup.hidden = true;
    renderSlots();
    if (state.pending) showLevelUp();
  }

  el.choices.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn || btn.disabled || !state.pending) return;
    if (pickIndex < 0) {
      const i = Number(btn.dataset.i);
      const opt = state.pending.options[i];
      if (opt.type === 'heal') { pickIndex = i; commit(null); return; }
      // 자리가 하나뿐이어도 묻는다. 어느 구멍에 끼워지고 무엇이 느는지를 보는 자리다.
      Sound.play('click');
      showTargets(i);
      return;
    }
    const opt = state.pending.options[pickIndex];
    if (btn.dataset.confirm) { commit(actionFor(opt, picked.ci, picked.slot).target); return; }
    const ci = Number(btn.dataset.ci), slot = Number(btn.dataset.slot);
    // 고른 구멍을 한 번 더 누르면 바로 새긴다.
    if (picked && picked.ci === ci && picked.slot === slot) { commit(actionFor(opt, ci, slot).target); return; }
    picked = { ci, slot };
    Sound.play('click');
    renderTargets();
  });
  el.levelBack.addEventListener('click', () => { Sound.play('click'); showLevelUp(); });

  // --- 마법진 셋 ---
  let slotSig = '';
  function renderSlots() {
    const sig = state.unlocked + '|' + state.circles.map((c) => c.runes.map((r) => r.id + r.grade).join(',')).join('|') + '|' + mode;
    if (sig === slotSig) return;
    slotSig = sig;
    el.slots.innerHTML = state.circles.map((c, ci) => {
      if (ci >= state.unlocked) {
        return '<div class="slot locked"><span class="slot-name">' + T('am.slot', { n: ci + 1 }) + '</span>' +
          sockets([], S.capacity(state)) + '<span class="slot-sub">' + T('am.locked', { n: S.CIRCLE_UNLOCK[ci] }) + '</span></div>';
      }
      const name = c.spell ? (known(c.spell.key) || mode === 'run' ? spellName(c.spell) : T('spell.unknown')) : T('am.empty');
      return '<div class="slot" data-ci="' + ci + '"><span class="slot-name">' + name + '</span>' +
        sockets(c.runes, S.capacity(state)) +
        '<span class="bar"></span></div>';
    }).join('');
  }
  function slotBars() {
    const nodes = el.slots.children;
    for (let ci = 0; ci < state.unlocked && ci < nodes.length; ci++) {
      const c = state.circles[ci];
      if (!c.spell) continue;
      const active = c.active > 0;
      const fill = active ? 1 : 1 - Math.max(0, c.cd) / c.spell.cd;
      nodes[ci].style.setProperty('--fill', Math.max(0, Math.min(1, fill)).toFixed(3));
      nodes[ci].classList.toggle('active', active);
    }
  }

  // --- 상태줄 ---
  function fmt(t) {
    const s = Math.max(0, Math.floor(t));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  let hudSig = '';
  function hud() {
    if (mode !== 'run') return;
    const max = state.level >= S.maxLevel(state.circle);
    el.xpFill.style.transform = 'scaleX(' + (max ? 1 : Math.min(1, state.xp / S.xpNext(state.level))).toFixed(3) + ')';
    const b = state.boss;
    const bossOn = !!(b && !b.dead);
    if (bossOn) el.bossFill.style.transform = 'scaleX(' + Math.max(0, b.hp / b.maxHp).toFixed(3) + ')';
    // 사도가 오면 이름과 체력은 아래 막대가 보이므로 시간 자리에는 결전만 적는다.
    const time = state.bossSpawned ? T('am.bossFight') : fmt(state.duration - state.t);
    const sig = state.night + '|' + state.level + '|' + state.kills + '|' + time + '|' + bossOn;
    if (sig === hudSig) return;
    hudSig = sig;
    el.bossBar.hidden = !bossOn;
    el.circleChip.textContent = nightName(state.night);
    el.levelChip.textContent = T(max ? 'am.levelMax' : 'am.level', { n: state.level });
    el.killsChip.textContent = state.kills;
    el.timeChip.textContent = time;
    el.timeChip.classList.toggle('boss', state.bossSpawned);
  }

  // --- 로비 ---
  // 탭 여섯: 출전(밤 고르기)·장비(끼운 것)·가방(가진 것)·강화(서클 돌파·합성)·상점·마도서.
  // 뱀서류 로비의 차례를 따랐다 — 싸우러 가는 것이 맨 앞, 둘러보는 것이 뒤.
  let tab = 'night';
  let openItem = null;
  let lastDrop = null;

  const html = (strings) => strings.join('');
  const rarityColor = (r) => I.RARITY[r];
  function itemName(it) {
    const base = T('gear.slot.' + it.slot);
    const el = it.el ? T('gear.el.' + it.el, { name: base }) : base;
    return T('gear.rarity.' + it.rarity) + ' ' + el;
  }
  function statText(it, level) {
    const one = Object.assign({}, it, { level: level || it.level });
    const stat = G.STATS[it.slot].stat;
    const v = G.statValue(one);
    let out = T('gear.stat.' + stat, { v: stat === 'hp' ? Math.round(v) : stat === 'regen' ? v.toFixed(1) : Math.round(v * 100) });
    if (it.el) out += ' · ' + T('gear.stat.el', { el: T('rune.' + it.el), v: Math.round(G.elementValue(one) * 100) });
    return out;
  }
  function itemIcon(it, cls) {
    return '<span class="item-icon ' + (cls || '') + '" style="--r:' + rarityColor(it.rarity) + (it.el ? ';--e:' + I.colorOf(it.el) : '') + '">' +
      I.svg(it.slot) + '<span class="item-lv">' + it.level + '</span></span>';
  }

  function renderPurse() {
    el.purseCircle.textContent = T('am.circle', { n: save.circle });
    el.purseMana.textContent = save.mana;
    el.purseGold.textContent = save.gold;
    for (const b of el.tabs.children) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
  }

  function renderNightTab() {
    if (night > save.night) night = save.night;
    // 밤은 끝없이 늘어나므로 열린 것 가운데 가장 깊은 다섯만 보인다. 지난 밤을 다시 하는
    // 것은 마나·금화를 모으거나 조합을 찾으러 가는 것이라 가까운 밤이면 된다.
    let list = '';
    for (let n = Math.max(1, save.night - 4); n <= save.night; n++) {
      const tag = S.isBossNight(n) ? ' <span class="tag">' + T('am.bossTag') + '</span>' : '';
      list += '<button class="btn small" type="button" data-night="' + n + '" aria-pressed="' + (n === night) + '">' + nightName(n) + tag + '</button>';
    }
    let info = T('am.nightInfo', { m: Math.round(S.nightLength(night) / 60 * 10) / 10, n: save.circle, max: S.maxLevel(save.circle) });
    if (S.isBossNight(night)) info = T('am.bossNightInfo') + ' · ' + info;
    if (save.best[night]) info += ' · ' + T('am.best', { t: fmt(save.best[night]) });
    // 위쪽은 비워 둔다. 그 자리에 캔버스가 마법진 위의 마법사를 그린다(drawLobby).
    return html([
      '<div class="hero"><p class="hero-run sys">', save.runs ? T('am.campTitle', { n: save.runs + 1 }) : T('am.campFirst'), '</p>',
      '<p class="hero-circle">', T('am.circle', { n: save.circle }), '</p>',
      '<p class="hero-train">', T('am.trainProgress', { have: save.train, n: M.TRAIN_STEPS }), '</p></div>',
      '<div class="night-pick"><p class="label">', T('am.pickNight'), '</p><div class="night-list">', list, '</div>',
      '<p class="sheet-note small">', info, '</p>',
      '<div class="sheet-actions center"><button class="btn big" type="button" data-act="start">', T('am.start'), '</button></div></div>',
    ]);
  }

  function renderGearTab() {
    const tiles = G.SLOTS.map((slot) => {
      const it = G.equippedIn(save, slot);
      if (!it) {
        return '<button class="gear-tile empty" type="button" data-slot="' + slot + '"><span class="item-icon ghost">' + I.svg(slot) +
          '</span><span class="gear-name">' + T('gear.slot.' + slot) + '</span><span class="gear-stat">' + T('am.empty') + '</span></button>';
      }
      return '<button class="gear-tile" type="button" data-uid="' + it.uid + '">' + itemIcon(it) +
        '<span class="gear-name" style="color:' + rarityColor(it.rarity) + '">' + itemName(it) + '</span><span class="gear-stat">' + statText(it) + '</span></button>';
    }).join('');
    const g = G.loadout(save);
    const sum = [
      T('gear.stat.dmg', { v: Math.round(g.dmg * 100) }), T('gear.stat.hp', { v: Math.round(g.hp) }),
      T('gear.stat.cd', { v: Math.round(g.cd * 100) }), T('gear.stat.xp', { v: Math.round(g.xp * 100) }),
      T('gear.stat.regen', { v: g.regen.toFixed(1) }), T('gear.stat.speed', { v: Math.round(g.speed * 100) }),
    ];
    for (const e of Runes.ELEMENTS) if (g.el[e]) sum.push(T('gear.stat.el', { el: T('rune.' + e), v: Math.round(g.el[e] * 100) }));
    return html([
      '<p class="label">', T('am.tab.gear'), '</p><div class="gear-grid">', tiles, '</div>',
      '<p class="label">', T('gear.total'), '</p><ul class="gear-sum">', sum.map((x) => '<li>' + x + '</li>').join(''), '</ul>',
    ]);
  }

  function bagItems() {
    return save.items.slice().sort((a, b) => b.rarity - a.rarity || G.SLOTS.indexOf(a.slot) - G.SLOTS.indexOf(b.slot) || b.level - a.level);
  }

  function renderBagTab() {
    const items = bagItems();
    const cells = items.map((it) => '<button class="bag-cell' + (G.isEquipped(save, it) ? ' on' : '') + '" type="button" data-uid="' + it.uid + '">' +
      itemIcon(it) + '</button>').join('');
    return html([
      '<p class="label">', T('am.tab.bag'), ' ', items.length, '</p>',
      items.length ? '<div class="bag-grid">' + cells + '</div>' : '<p class="sheet-note">' + T('gear.bagEmpty') + '</p>',
      '<p class="sheet-note small">', T('gear.bagNote'), '</p>',
    ]);
  }

  function mergeable() {
    let n = 0;
    for (const slot of G.SLOTS) {
      for (let r = 0; r < G.RARITIES - 1; r++) n += Math.floor(save.items.filter((it) => it.slot === slot && it.rarity === r).length / 3);
    }
    return n;
  }

  const statLine = (stat, v) => T('gear.stat.' + stat, { v: stat === 'hp' ? Math.round(v) : stat === 'regen' ? v.toFixed(1) : +(v * 100).toFixed(1) });

  function renderForgeTab() {
    const b = M.breakCheck(save);
    const t = M.trainCheck(save);
    const note = b.why === 'train' ? T('forge.needTrain', { have: b.have, n: b.need }) : '';
    const breakLabel = b.why === 'max' ? T('am.breakMax') : T('am.break', { n: save.circle + 1 });
    const m = mergeable();
    // 이 서클의 수련 단계. 다 찬 칸, 다음 칸, 남은 칸.
    let dots = '';
    for (let i = 0; i < M.TRAIN_STEPS; i++) {
      const stat = M.TRAIN_ORDER[((save.circle - 1) * M.TRAIN_STEPS + i) % M.TRAIN_ORDER.length];
      dots += '<span class="train-dot' + (i < save.train ? ' done' : i === save.train ? ' next' : '') + '" title="' + T('train.' + stat) + '">' +
        T('train.short.' + stat) + '</span>';
    }
    const trained = M.training(save);
    const sum = M.TRAIN_ORDER.filter((k) => trained[k]).map((k) => '<li>' + statLine(k, trained[k]) + '</li>').join('');
    const trainBtn = t.why === 'done' ? T('forge.trainDone')
      : T('forge.train', { stat: T('train.' + t.stat), v: statLine(t.stat, M.TRAIN_VALUE[t.stat]) }) + ' · ' + T('am.breakCost', { n: t.cost });
    return html([
      '<div class="forge-card"><p class="label">', T('forge.trainTitle', { n: save.circle }), '</p><p class="sheet-note small">', T('forge.trainNote'), '</p>',
      '<div class="train-dots">', dots, '</div>',
      '<button class="btn" type="button" data-act="train"', t.ok ? '' : ' disabled', '>', trainBtn, '</button>',
      t.why === 'mana' ? '<p class="sheet-note small">' + T('am.breakNeedMana', { n: t.cost - save.mana }) + '</p>' : '',
      sum ? '<ul class="gear-sum">' + sum + '</ul>' : '', '</div>',
      '<div class="forge-card"><p class="label">', T('forge.circleTitle'), '</p><p class="sheet-note small">', T('forge.circleNote'), '</p>',
      '<button class="btn" type="button" data-act="break"', b.ok ? '' : ' disabled', '>', breakLabel, '</button>',
      '<p class="sheet-note small">', note, '</p></div>',
      '<div class="forge-card"><p class="label">', T('forge.mergeTitle'), '</p><p class="sheet-note small">', T('forge.mergeNote'), '</p>',
      '<button class="btn" type="button" data-act="merge"', m ? '' : ' disabled', '>', T('forge.mergeAll', { n: m }), '</button></div>',
      '<div class="forge-card"><p class="label">', T('forge.upTitle'), '</p><p class="sheet-note small">', T('forge.upNote'), '</p></div>',
    ]);
  }

  function renderShopTab() {
    const chests = Object.keys(G.CHESTS).map((kind) => {
      const c = G.CHESTS[kind];
      let total = 0;
      for (const w of c.weights) total += w;
      const odds = c.weights.map((w, r) => (w ? '<span style="color:' + rarityColor(r) + '">' + T('gear.rarity.' + r) + ' ' + Math.round((w / total) * 100) + '%</span>' : ''))
        .filter(Boolean).join(' · ');
      return '<div class="shop-card"><span class="item-icon big" style="--r:' + rarityColor(kind === 'fine' ? 3 : 1) + '">' + I.svg('shop') + '</span>' +
        '<div><p class="shop-name">' + T('shop.' + kind) + '</p><p class="sheet-note small">' + odds + '</p></div>' +
        '<button class="btn small" type="button" data-chest="' + kind + '"' + (save.gold >= c.cost ? '' : ' disabled') + '>' +
        '<span class="purse-glyph">' + I.svg('coin') + '</span> ' + c.cost + '</button></div>';
    }).join('');
    return html(['<p class="label">', T('am.tab.shop'), '</p>', chests, '<p class="sheet-note small">', T('shop.note'), '</p>']);
  }

  function renderBookTab() {
    const g = M.grimoireCount(save, save.circle);
    const keys = Runes.allKeys(save.circle).filter((key) => save.grimoire[key]);
    const list = keys.length
      ? keys.map((key) => {
        const runes = runesFromKey(key);
        const tag = Runes.isSpecial(key) ? ' <span class="tag">' + T('am.special') + '</span>' : '';
        return '<li>' + glyphs(runes) + ' ' + spellName(Runes.compose(runes)) + tag + '</li>';
      }).join('')
      : '<li class="sheet-note">' + T('am.grimoireNone') + '</li>';
    return html([
      '<p class="label">', T('am.grimoire'), ' <b class="count">', T('am.grimoireCount', g), ' · ',
      T('am.specialCount', { found: g.specialFound, total: g.special }), '</b></p><ul class="grimoire-list">', list, '</ul>',
    ]);
  }

  const TABS = { night: renderNightTab, gear: renderGearTab, bag: renderBagTab, forge: renderForgeTab, shop: renderShopTab, book: renderBookTab };

  function renderLobby() {
    renderPurse();
    el.lobby.classList.toggle('solid', tab !== 'night');
    el.lobbyBody.innerHTML = TABS[tab]();
    el.lobbyBody.scrollTop = 0;
    placeLobbyFeet();
    renderItem();
  }

  // 장비 한 점. 가방·장비 탭에서 눌러 연다. 상점에서 막 얻은 것도 여기로 보여 준다.
  function renderItem() {
    const it = openItem ? G.find(save, openItem) : null;
    el.itemLayer.hidden = !it;
    if (!it) return;
    const on = G.isEquipped(save, it);
    const can = G.canUpgrade(it);
    const cost = G.upgradeCost(it);
    const next = can ? '<p class="sheet-note small">' + T('gear.next', { text: statText(it, it.level + 1) }) + '</p>' : '';
    el.itemCard.innerHTML = html([
      lastDrop === it.uid ? '<p class="sheet-title sys">' + T('gear.gotTitle') + '</p>' : '',
      '<div class="item-head">', itemIcon(it, 'big'), '<div><p class="shop-name" style="color:', rarityColor(it.rarity), '">', itemName(it), '</p>',
      '<p class="sheet-note small">', T('gear.level', { n: it.level, max: G.MAX_LEVEL[it.rarity] }), on ? ' · ' + T('gear.equipped') : '', '</p></div></div>',
      '<p>', statText(it), '</p>', next,
      '<div class="sheet-actions wrap">',
      on ? '<button class="btn ghost" type="button" data-item="off">' + T('gear.unequip') + '</button>'
        : '<button class="btn" type="button" data-item="on">' + T('gear.equip') + '</button>',
      '<button class="btn" type="button" data-item="up"', can && save.gold >= cost ? '' : ' disabled', '>',
      can ? T('gear.upgrade') + ' <span class="purse-glyph">' + I.svg('coin') + '</span> ' + cost : T('gear.maxed'), '</button>',
      on ? '' : '<button class="btn ghost" type="button" data-item="sell">' + T('gear.sell', { n: G.sellPrice(it) }) + '</button>',
      '<button class="btn ghost" type="button" data-item="close">', T('ui.close'), '</button>',
      '</div>',
    ]);
  }

  el.tabs.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    tab = b.dataset.tab;
    openItem = null;
    Sound.play('click');
    renderLobby();
  });

  el.lobbyBody.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.night) { night = Number(b.dataset.night); Sound.play('click'); renderLobby(); return; }
    if (b.dataset.uid) { openItem = Number(b.dataset.uid); lastDrop = null; Sound.play('click'); renderItem(); return; }
    if (b.dataset.slot) { tab = 'bag'; Sound.play('click'); renderLobby(); return; }
    if (b.dataset.chest) {
      const got = G.openChest(save, b.dataset.chest, Math.random);
      if (!got) return;
      store();
      openItem = got.uid;
      lastDrop = got.uid;
      Sound.play('discover');
      renderLobby();
      return;
    }
    const act = b.dataset.act;
    if (act === 'start') startRun();
    else if (act === 'train') {
      if (!M.train(save)) return;
      store();
      Sound.play('engrave');
      renderLobby();
    } else if (act === 'break') {
      if (!M.breakthrough(save)) return;
      store();
      Sound.play('unlock');
      alert(T('am.breakDone', { n: save.circle }), 2200);
      renderLobby();
    } else if (act === 'merge') {
      const made = G.mergeAll(save);
      store();
      Sound.play('unlock');
      alert(T('forge.merged', { n: made.length }), 1800);
      renderLobby();
    }
  });

  el.itemLayer.addEventListener('click', (ev) => {
    if (ev.target === el.itemLayer) { openItem = null; renderItem(); return; }
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    const it = G.find(save, openItem);
    const act = b.dataset.item;
    if (act === 'close' || !it) { openItem = null; renderItem(); return; }
    if (act === 'on') { G.equip(save, it.uid); Sound.play('engrave'); }
    else if (act === 'off') { G.unequip(save, it.slot); Sound.play('click'); }
    else if (act === 'up') { if (!G.upgrade(save, it.uid)) return; Sound.play('level'); }
    else if (act === 'sell') { G.sell(save, it.uid); openItem = null; Sound.play('gem'); }
    lastDrop = null;
    store();
    renderPurse();
    el.lobby.classList.toggle('solid', tab !== 'night');
    el.lobbyBody.innerHTML = TABS[tab]();
    renderItem();
  });

  function showLobby() {
    mode = 'camp';
    setPaused(false);
    state = S.create({ circle: save.circle, night, seed: 1 });
    state.pending = null;
    fx = [];
    el.result.hidden = true;
    el.levelup.hidden = true;
    el.lobby.hidden = false;
    el.slots.hidden = true;
    // 레벨·처치·남은 시간은 싸우는 동안의 것이라 로비에서는 감춘다.
    el.status.style.visibility = 'hidden';
    layout();
    renderLobby();
  }

  function startRun() {
    mode = 'run';
    seenThisRun = new Set();
    state = S.create({ circle: save.circle, night, gear: M.power(save), seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
    if (state.bossNight) alert(T('am.bossNightAlert'), 2400);
    fx = [];
    hpShown = 1;
    acc = 0;
    el.lobby.hidden = true;
    el.slots.hidden = false;
    el.status.style.visibility = '';
    el.result.hidden = true;
    slotSig = '';
    renderSlots();
    layout();
    Sound.play('click');
    showLevelUp();
  }

  function finish() {
    const res = S.summary(state);
    const { gained, gold, drops, found, opened } = M.settle(save, res, Math.random);
    // 넘긴 밤이 가장 깊은 밤이면 다음 회차는 새로 열린 밤에서 시작한다.
    if (opened) night = save.night;
    store();
    const won = res.won;
    el.resultTitle.textContent = T(won ? 'am.wonTitle' : 'am.lostTitle', { night: nightName(res.night) });
    el.resultNote.textContent = T(won ? 'am.wonNote' : 'am.lostNote');
    el.report.innerHTML = [
      T('am.reportTime', { t: fmt(res.t) }),
      T('am.reportLevel', { n: res.level }),
      T('am.reportKills', { n: res.kills }),
      T('am.reportMana', { n: gained }),
      T('am.reportGold', { n: gold }),
      T('am.reportFound', { n: found.length }),
    ].concat(drops.map((it) => T('am.reportDrop', { name: '<b style="color:' + rarityColor(it.rarity) + '">' + itemName(it) + '</b>' })))
      .concat(opened ? [T('am.nightOpened', { night: nightName(save.night) })] : [])
      .map((s) => '<li>' + s + '</li>').join('');
    el.result.hidden = false;
    Sound.play(won ? 'won' : 'lost');
  }
  el.regress.addEventListener('click', () => { Sound.play('click'); showLobby(); });

  // --- 한 프레임 ---
  let last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    clock += dt;
    if (mode === 'run' && !paused && !state.pending && !state.over) {
      readInput();
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 6) {
        S.step(state, STEP);
        acc -= STEP;
        n += 1;
        handle(S.drain(state));
        if (state.pending || state.over) { acc = 0; break; }
      }
      if (state.over) finish();
      renderSlots();
    }
    if (mode === 'run' && state.pending && el.levelup.hidden && !state.over) showLevelUp();
    for (const f of fx) f.t += dt;
    if (fx.length) fx = fx.filter((f) => f.t < f.life);
    if (shake > 0) shake = Math.max(0, shake - dt * 30);
    if (mode === 'camp') drawLobby(); else draw();
    slotBars();
    hud();
  }

  window.addEventListener('resize', () => { layout(); if (mode === 'camp') placeLobbyFeet(); });

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

  // 로비의 아이콘. HTML에는 이름만 적고 경로는 icons.js에서 가져온다.
  for (const node of document.querySelectorAll('[data-glyph]')) node.innerHTML = I.svg(node.dataset.glyph);
  showLobby();
  layout();
  requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });

  window.ArchmageDebug = {
    state: () => state, save: () => save, sim: S,
    grant: (xp) => { state.xp += xp; },
  };
})();

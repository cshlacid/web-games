'use strict';

// 화면: 전장 캔버스, 조이스틱, 룬 고르기, 회귀의 방. 규칙은 sim.js, 조합은 runes.js,
// 회귀 사이에 남는 것은 meta.js에 있고 여기서는 읽어서 그리기만 한다.
(function () {
  const Runes = window.ArchmageRunes;
  const S = window.ArchmageSim;
  const M = window.ArchmageMeta;
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
    ['camp', 'camp'], ['campTitle', 'camp-title'], ['circleMark', 'circle-mark'], ['campCircle', 'camp-circle'],
    ['campMana', 'camp-mana'], ['brk', 'break'], ['breakNote', 'break-note'], ['nightList', 'night-list'],
    ['nightInfo', 'night-info'], ['grimoireCount', 'grimoire-count'], ['grimoireList', 'grimoire-list'], ['start', 'start'],
    ['levelup', 'levelup'], ['levelTitle', 'level-title'], ['levelNote', 'level-note'], ['choices', 'choices'],
    ['levelActions', 'level-actions'], ['levelBack', 'level-back'],
    ['result', 'result'], ['resultTitle', 'result-title'], ['resultNote', 'result-note'], ['report', 'report'], ['regress', 'regress'],
    ['paused', 'paused'], ['resume', 'resume'], ['pause', 'pause'],
    ['circleChip', 'circle-chip'], ['levelChip', 'level-chip'], ['killsChip', 'kills-chip'], ['timeChip', 'time-chip'],
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
  let night = save.circle;
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
  const nightName = (n) => T('am.night' + n);
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
  }

  // --- 그림 ---
  // 한 번 그려 두고 찍어 쓰는 그림. 적 수백 마리를 매 프레임 도형으로 그으면 폰이
  // 버티지 못한다. 알파의 임시 그림이고, 상용 수준의 그림은 뒤 단계에서 바꾼다.
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

  function shade(g, x, y, r, light, dark) {
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, light);
    grad.addColorStop(1, dark);
    return grad;
  }

  function eyes(g, x, y, gap, r, color) {
    g.fillStyle = color;
    g.beginPath(); g.arc(x - gap, y, r, 0, Math.PI * 2); g.arc(x + gap, y, r, 0, Math.PI * 2); g.fill();
  }

  const FOE_ART = {
    slime(g) {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(14, 24, 11, 3.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(g, 14, 16, 12, '#b6f07a', '#3f8a2c');
      g.beginPath(); g.moveTo(2, 22); g.quadraticCurveTo(2, 5, 14, 5); g.quadraticCurveTo(26, 5, 26, 22); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(9, 11, 3, 2, -0.5, 0, Math.PI * 2); g.fill();
      eyes(g, 14, 15, 4, 1.8, '#17240f');
    },
    goblin(g) {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(14, 25, 9, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5b3a24'; g.beginPath(); g.roundRect(8, 15, 12, 10, 3); g.fill();
      g.fillStyle = shade(g, 14, 12, 9, '#9fc36a', '#4d6e2a');
      g.beginPath(); g.moveTo(1, 8); g.lineTo(8, 11); g.lineTo(8, 14); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(27, 8); g.lineTo(20, 11); g.lineTo(20, 14); g.closePath(); g.fill();
      g.beginPath(); g.arc(14, 12, 7.5, 0, Math.PI * 2); g.fill();
      eyes(g, 14, 12, 3, 1.5, '#ff4a2a');
    },
    wolf(g) {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(14, 22, 12, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(g, 13, 15, 12, '#a9b0bd', '#4a505c');
      g.beginPath(); g.ellipse(12, 16, 11, 6, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(22, 12, 5.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(19, 8); g.lineTo(20, 2); g.lineTo(23, 7); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(23, 7); g.lineTo(26, 2); g.lineTo(26, 9); g.closePath(); g.fill();
      g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(24, 11.5, 1.3, 0, Math.PI * 2); g.fill();
    },
    wraith(g) {
      const grad = g.createLinearGradient(0, 3, 0, 28);
      grad.addColorStop(0, 'rgba(214,226,255,0.95)');
      grad.addColorStop(1, 'rgba(120,140,220,0)');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(5, 14); g.quadraticCurveTo(5, 3, 14, 3); g.quadraticCurveTo(23, 3, 23, 14);
      g.lineTo(23, 22); g.quadraticCurveTo(19, 18, 17, 27); g.quadraticCurveTo(14, 20, 11, 27); g.quadraticCurveTo(9, 18, 5, 22); g.closePath(); g.fill();
      eyes(g, 14, 11, 3.5, 2, '#1b1440');
    },
    golem(g) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(20, 36, 16, 4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(g, 20, 20, 18, '#a39a8a', '#4b4439');
      g.beginPath(); g.roundRect(4, 8, 32, 27, 7); g.fill();
      g.beginPath(); g.roundRect(11, 1, 18, 13, 5); g.fill();
      g.strokeStyle = 'rgba(30,25,20,0.6)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(10, 20); g.lineTo(16, 25); g.lineTo(14, 31); g.moveTo(28, 14); g.lineTo(25, 21); g.stroke();
      eyes(g, 20, 7, 4, 1.8, '#7dfcff');
    },
    boss(g) {
      const aura = g.createRadialGradient(40, 40, 8, 40, 40, 40);
      aura.addColorStop(0, 'rgba(255,60,60,0.5)'); aura.addColorStop(1, 'rgba(255,60,60,0)');
      g.fillStyle = aura; g.fillRect(0, 0, 80, 80);
      g.fillStyle = shade(g, 40, 44, 26, '#5a3a6e', '#1a0f24');
      g.beginPath(); g.moveTo(16, 70); g.quadraticCurveTo(14, 36, 40, 30); g.quadraticCurveTo(66, 36, 64, 70); g.closePath(); g.fill();
      g.beginPath(); g.arc(40, 30, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d8cbb0';
      g.beginPath(); g.moveTo(30, 22); g.quadraticCurveTo(20, 12, 22, 2); g.quadraticCurveTo(28, 12, 34, 18); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(50, 22); g.quadraticCurveTo(60, 12, 58, 2); g.quadraticCurveTo(52, 12, 46, 18); g.closePath(); g.fill();
      eyes(g, 40, 31, 5, 2.4, '#ff4040');
    },
  };
  const FOE_BOX = { slime: [28, 28], goblin: [28, 28], wolf: [30, 26], wraith: [28, 28], golem: [40, 40], boss: [80, 80] };

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

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function buildSprites() {
    for (const type in FOE_ART) {
      const [w, h] = FOE_BOX[type];
      sprites[type] = offscreen(w, h, FOE_ART[type]);
      sprites[type + '!'] = whiteOf(sprites[type]);
    }
    sprites.mage = offscreen(30, 38, drawMage);
    sprites.mage_ = whiteOf(sprites.mage);
    for (const e of ELEMENTS) sprites['glow-' + e] = glowSprite(I.COLORS[e], 40);
    sprites['glow-arcane'] = glowSprite(I.COLORS.arcane, 40);
    sprites['glow-leech'] = glowSprite(I.COLORS.leech, 40);
    sprites.gem = offscreen(12, 12, (g) => {
      g.fillStyle = hexA('#8fe9ff', 0.35); g.beginPath(); g.arc(6, 6, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#bff4ff'; g.beginPath(); g.moveTo(6, 1.5); g.lineTo(10, 6); g.lineTo(6, 10.5); g.lineTo(2, 6); g.closePath(); g.fill();
      g.fillStyle = '#4fc6ea'; g.beginPath(); g.moveTo(6, 6); g.lineTo(10, 6); g.lineTo(6, 10.5); g.closePath(); g.fill();
    });
    sprites.ground = groundTile();
    vignette = null;
  }

  function drawMage(g) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(15, 35, 10, 3, 0, 0, Math.PI * 2); g.fill();
    // 지팡이
    g.strokeStyle = '#8a6a44'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(24, 34); g.lineTo(26, 8); g.stroke();
    const orb = g.createRadialGradient(26, 7, 0, 26, 7, 6);
    orb.addColorStop(0, '#ffffff'); orb.addColorStop(0.4, '#c9b2ff'); orb.addColorStop(1, 'rgba(185,155,255,0)');
    g.fillStyle = orb; g.beginPath(); g.arc(26, 7, 6, 0, Math.PI * 2); g.fill();
    // 로브
    g.fillStyle = shade(g, 13, 24, 14, '#6f5bd6', '#2a1f63');
    g.beginPath(); g.moveTo(4, 35); g.quadraticCurveTo(7, 18, 14, 15); g.quadraticCurveTo(21, 18, 23, 35); g.closePath(); g.fill();
    g.strokeStyle = '#e2c46a'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(5, 33.5); g.lineTo(22.5, 33.5); g.stroke();
    // 얼굴과 두건
    g.fillStyle = '#f0d2b4'; g.beginPath(); g.arc(14, 13, 4.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9e6f2'; g.beginPath(); g.moveTo(10, 15); g.quadraticCurveTo(14, 26, 18, 15); g.closePath(); g.fill();
    g.fillStyle = shade(g, 14, 8, 9, '#7e6ae0', '#2d2170');
    g.beginPath(); g.moveTo(6, 13); g.quadraticCurveTo(8, 2, 16, 0); g.quadraticCurveTo(15, 5, 21, 12); g.quadraticCurveTo(14, 7, 6, 13); g.fill();
    g.fillStyle = '#231a4f'; g.beginPath(); g.arc(12.5, 13, 0.9, 0, Math.PI * 2); g.arc(15.8, 13, 0.9, 0, Math.PI * 2); g.fill();
  }

  // 바닥. 한 장을 그려 두고 세계 좌표에 무늬로 깐다 — 움직일 때 바닥이 같이 흘러야
  // 걷는 느낌이 난다.
  function groundTile() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#141626'; g.fillRect(0, 0, size, size);
    const rand = S.rng(7);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = 'rgba(' + (60 + rand() * 40 | 0) + ',' + (70 + rand() * 40 | 0) + ',' + (110 + rand() * 50 | 0) + ',' + (0.05 + rand() * 0.1) + ')';
      const r = 1 + rand() * 6;
      g.beginPath(); g.arc(rand() * size, rand() * size, r, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(120,110,190,0.08)'; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      let x = rand() * size, y = rand() * size;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (rand() - 0.5) * 50; y += (rand() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(90,140,110,' + (0.08 + rand() * 0.1) + ')'; g.lineWidth = 1;
      const x = rand() * size, y = rand() * size;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y - 5); g.moveTo(x + 1, y); g.lineTo(x + 2, y - 6); g.stroke();
    }
    return c;
  }

  let vignette = null;
  function drawVignette() {
    if (!vignette) {
      const c = document.createElement('canvas');
      c.width = el.canvas.width; c.height = el.canvas.height;
      const g = c.getContext('2d');
      const r = Math.hypot(c.width, c.height) / 2;
      const grad = g.createRadialGradient(c.width / 2, c.height / 2, r * 0.35, c.width / 2, c.height / 2, r);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,8,0.72)');
      g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
      vignette = c;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(vignette, 0, 0);
  }

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
        if (fx.length < 400) fx.push({ kind: 'puff', x: ev.x, y: ev.y, foe: ev.foe, t: 0, life: 0.35 });
        sound('kill', null, 45);
      } else if (ev.type === 'gem') {
        gemPitch = (gemPitch + 1) % 12;
        sound('gem', gemPitch, 40);
      } else if (ev.type === 'hurt') {
        shake = Math.max(shake, 5);
        sound('hurt', null, 120);
      } else if (ev.type === 'level') {
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
  function draw() {
    const p = state.player;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    const camX = p.x + sx, camY = p.y + sy;
    const s = dpr * k;
    ctx.setTransform(s, 0, 0, s, dpr * cssW / 2 - camX * s, dpr * cssH / 2 - camY * s);
    const halfW = cssW / k / 2 + 40, halfH = cssH / k / 2 + 40;
    const x0 = camX - halfW, y0 = camY - halfH;

    if (!groundPattern) groundPattern = ctx.createPattern(sprites.ground, 'repeat');
    ctx.fillStyle = groundPattern;
    ctx.fillRect(x0, y0, halfW * 2, halfH * 2);

    const visible = (x, y, r) => x > x0 - r && x < x0 + halfW * 2 + r && y > y0 - r && y < y0 + halfH * 2 + r;

    // 지대
    for (const z of state.zones) drawZone(z);
    for (const q of state.quakes) drawQuake(q, p);
    ctx.globalCompositeOperation = 'lighter';
    for (const a of state.auras) drawAura(a, p);
    ctx.globalCompositeOperation = 'source-over';
    for (const m of state.meteors) drawMeteorMark(m);

    // 보석
    const gem = sprites.gem;
    for (const g of state.gems) {
      if (!visible(g.x, g.y, 10)) continue;
      const w = g.v > 3 ? 16 : 11;
      ctx.drawImage(gem.img, g.x - w / 2, g.y - w / 2, w, w);
    }

    drawCircleUnder(p);

    // 적은 아래쪽부터 그린다. 겹칠 때 앞에 선 것이 위에 오게.
    const foes = state.foes.filter((f) => visible(f.x, f.y, 50));
    foes.sort((a, b) => a.y - b.y);
    for (const f of foes) drawFoe(f, p);

    drawMageAt(p);

    ctx.globalCompositeOperation = 'lighter';
    for (const o of state.orbits) drawOrbit(o, p);
    for (const sh of state.shots) drawShot(sh);
    for (const w of state.waves) drawWave(w);
    for (const t of state.tornados) drawTornado(t);
    for (const m of state.meteors) drawMeteor(m);
    for (const f of fx) drawFx(f, p);
    ctx.globalCompositeOperation = 'source-over';
    for (const f of fx) if (f.kind === 'puff') drawPuff(f);

    drawHp(p);
    drawVignette();
    drawBossBar();
    drawStick();
  }
  let groundPattern = null;

  function drawFoe(f, p) {
    const sp = sprites[f.flash > 0 ? f.type + '!' : f.type];
    const bob = Math.sin(clock * 8 + f.phase) * (f.type === 'wraith' ? 2 : 0.8);
    const flip = f.x > p.x;
    const w = sp.w, h = sp.h;
    if (flip) {
      ctx.save();
      ctx.translate(f.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sp.img, -w / 2, f.y - h / 2 - 4 + bob, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sp.img, f.x - w / 2, f.y - h / 2 - 4 + bob, w, h);
    }
    if (f.slow > 0) {
      ctx.fillStyle = f.slow >= 0.95 ? 'rgba(170,225,255,0.55)' : 'rgba(120,200,255,0.25)';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 2, 0, Math.PI * 2); ctx.fill();
    }
    if (f.burn > 0 && ((clock * 20 + f.phase) | 0) % 3 === 0) {
      ctx.fillStyle = 'rgba(255,140,60,0.5)';
      ctx.beginPath(); ctx.arc(f.x + (Math.random() - 0.5) * f.r, f.y - f.r, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawMageAt(p) {
    // 흡혈로 생명력이 차오르는 동안 몸이 붉게 빛난다. 숫자를 띄우면 수십 번씩 겹친다.
    if (p.healed > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, p.healed * 4) * 0.8;
      glowAt('leech', p.x, p.y - 6, 44);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const sp = p.inv > 0 && ((clock * 20) | 0) % 2 ? sprites.mage_ : sprites.mage;
    const bob = p.moving ? Math.abs(Math.sin(clock * 10)) * -2 : Math.sin(clock * 2) * 0.6;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.face < 0) ctx.scale(-1, 1);
    ctx.drawImage(sp.img, -sp.w / 2, -sp.h / 2 - 8 + bob, sp.w, sp.h);
    ctx.restore();
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

  function drawShot(sh) {
    if (sh.kind === 'bolt') {
      glowAt(sh.el, sh.x, sh.y, sh.frag ? 12 : 26 + sh.aoe * 0.2);
      glowAt(sh.el, sh.x - sh.vx * 0.03, sh.y - sh.vy * 0.03, 16);
      glowAt(sh.el, sh.x - sh.vx * 0.06, sh.y - sh.vy * 0.06, 10);
    } else {
      const len = 26;
      const a = Math.atan2(sh.vy, sh.vx);
      ctx.strokeStyle = hexA(I.colorOf(sh.el), 0.9);
      ctx.lineWidth = Math.max(2, sh.r * 0.45);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sh.x - Math.cos(a) * len, sh.y - Math.sin(a) * len); ctx.lineTo(sh.x, sh.y); ctx.stroke();
      glowAt(sh.el, sh.x, sh.y, 18 + sh.r);
    }
  }

  function drawOrbit(o, p) {
    const fade = Math.min(1, o.life / 0.3, (o.total - o.life) / 0.2 + 0.2);
    ctx.globalAlpha = fade;
    const blades = S.orbitBlades(o, p);
    ctx.strokeStyle = hexA(I.colorOf(o.el), 0.25);
    ctx.lineWidth = o.blade * 0.8;
    const oc = o.cx !== undefined ? { x: o.cx, y: o.cy } : p;
    ctx.beginPath(); ctx.arc(oc.x, oc.y, S.orbitRadius(o), 0, Math.PI * 2); ctx.stroke();
    for (const b of blades) {
      glowAt(o.el, b.x, b.y, o.blade * 3.4);
      const a = Math.atan2(b.y - oc.y, b.x - oc.x) + Math.PI / 2;
      ctx.strokeStyle = hexA(I.colorOf(o.el), 0.9);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, o.blade * 0.9, a - 0.9, a + 0.9); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawZone(z) {
    const t = 1 - z.life / z.total;
    const fade = Math.min(1, z.life / 0.3, t * 8);
    const color = I.colorOf(z.el);
    ctx.globalAlpha = fade;
    const grad = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    grad.addColorStop(0, hexA(color, 0.05));
    grad.addColorStop(0.7, hexA(color, 0.22));
    grad.addColorStop(1, hexA(color, 0.5));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(color, 0.8);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -clock * 20;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.9 + 0.1 * Math.sin(clock * 6)), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // 가시. 틱마다 솟는다.
    const pulse = 1 - (z.tick / 0.4);
    ctx.fillStyle = hexA(color, 0.7 * (1 - pulse));
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + z.x;
      const d = z.r * (0.25 + (i % 3) * 0.2);
      const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
      ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x, y - 8 * (1 - pulse) - 2); ctx.lineTo(x + 3, y + 2); ctx.fill();
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
      ctx.globalAlpha = 1 - t;
      glowAt(f.el, f.x, f.y, f.r * 2.2 * (0.6 + t * 0.6));
      ctx.strokeStyle = hexA(I.colorOf(f.el), 0.9);
      ctx.lineWidth = 3 * (1 - t) + 0.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + t * 0.7), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'bolt') {
      // 하늘에서 내리꽂는 번개. 맞은 자리 위로 꺾이는 줄 하나.
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#eaf6ff';
      ctx.lineWidth = 2.2;
      const rand = S.rng(f.seed | 0);
      ctx.beginPath();
      let x = f.x + (rand() - 0.5) * 40, y = f.y - 320;
      ctx.moveTo(x, y);
      for (let j = 1; j <= 6; j++) {
        const u = j / 6;
        x = f.x + (rand() - 0.5) * 26 * (1 - u);
        y = f.y - 320 * (1 - u);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      glowAt(f.el, f.x, f.y, f.r * 2.4);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'flash') {
      // 화면 전체를 치는 마법. 한 번 번쩍여 무엇이 쳤는지 알린다.
      ctx.globalAlpha = (1 - t) * 0.35;
      ctx.fillStyle = I.colorOf(f.el);
      ctx.fillRect(p.x - 700, p.y - 700, 1400, 1400);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'cast') {
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = I.colorOf(f.el);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 14 + t * 30, (14 + t * 30) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  const PUFF = { slime: '#8fd35a', goblin: '#8aa85a', wolf: '#8b919c', wraith: '#c9d4ff', golem: '#9a917f', boss: '#ff5a5a' };
  function drawPuff(f) {
    const t = f.t / f.life;
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.fillStyle = PUFF[f.foe] || '#fff';
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + f.x;
      const d = 4 + t * 14;
      ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - t * 6, 2.4 * (1 - t) + 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHp(p) {
    const w = 26, h = 3.5;
    const x = p.x - w / 2, y = p.y + 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = p.hp / p.maxHp < 0.3 ? '#ff5a4a' : '#e84d5b';
    ctx.fillRect(x, y, w * Math.max(0, p.hp / p.maxHp), h);
  }

  function drawBossBar() {
    const b = state.boss;
    if (!b || b.dead) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssW - 40, x = 20, y = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 2, y - 2, w + 4, 10);
    ctx.fillStyle = '#c0304a';
    ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 6);
    ctx.fillStyle = '#f3dde6';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(T('am.boss'), cssW / 2, y + 20);
  }

  function drawStick() {
    if (!stick) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = 'rgba(220,210,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); ctx.stroke();
    const v = stickVector();
    ctx.fillStyle = 'rgba(220,210,255,0.45)';
    ctx.beginPath(); ctx.arc(stick.ox + v.x * STICK_R, stick.oy + v.y * STICK_R, 16, 0, Math.PI * 2); ctx.fill();
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
      return '<button class="choice" type="button" data-i="' + i + '">' +
        '<span class="icon" style="color:' + I.colorOf(id) + '">' + I.svg(id) + '</span>' +
        '<span><span class="choice-name">' + T('rune.' + id) + tag + '</span>' +
        '<span class="choice-desc">' + optionDesc(opt) + '</span></span></button>';
    }).join('');
    el.levelup.hidden = false;
  }

  function showTargets(i) {
    const opt = state.pending.options[i];
    pickIndex = i;
    el.levelActions.hidden = false;
    if (opt.type === 'erase') {
      el.levelTitle.textContent = T('am.pickErase');
      el.levelNote.textContent = T('desc.erase');
      const rows = [];
      for (let ci = 0; ci < state.unlocked; ci++) {
        state.circles[ci].runes.forEach((r, slot) => {
          const pv = S.previewErase(state, ci, slot);
          rows.push('<button class="choice" type="button" data-ci="' + ci + '" data-slot="' + slot + '">' +
            '<span class="icon" style="color:' + I.colorOf(r.id) + '">' + I.svg(r.id) + '</span>' +
            '<span><span class="choice-name">' + T('am.slot', { n: ci + 1 }) + ' · ' + T('rune.' + r.id) + '</span>' +
            sockets(pv.runes, S.capacity(state)) + '<span class="choice-desc">' + nameFor(pv.spell) + '</span></span></button>');
        });
      }
      el.choices.innerHTML = rows.join('');
      return;
    }
    el.levelTitle.textContent = T('am.pickCircle');
    el.levelNote.innerHTML = T('rune.' + opt.id);
    const rows = [];
    const cap = S.capacity(state);
    for (let ci = 0; ci < state.unlocked; ci++) {
      const c = state.circles[ci];
      const modes = S.placeModes(state, opt.id, ci);
      if (!modes.length) {
        rows.push('<button class="choice target" type="button" disabled><span class="icon">' + (ci + 1) + '</span>' +
          '<span><span class="choice-name">' + T('am.slot', { n: ci + 1 }) + ' <span class="tag">' + T('am.full') + '</span></span>' +
          sockets(c.runes, cap) + '</span></button>');
        continue;
      }
      for (const mode of modes) {
        const pv = S.previewPlace(state, opt.id, ci, mode);
        const mark = pv.mode === 'add' ? pv.runes.length - 1 : pv.runes.findIndex((r) => r.id === opt.id);
        rows.push('<button class="choice target" type="button" data-ci="' + ci + '" data-mode="' + mode + '"><span class="icon">' + (ci + 1) + '</span>' +
          '<span><span class="choice-name">' + T('am.slot', { n: ci + 1 }) + ' <span class="tag">' + T(pv.mode === 'add' ? 'am.add' : 'am.grade') + '</span></span>' +
          sockets(pv.runes, cap, mark) +
          '<span class="choice-desc">' + nameFor(pv.spell) + '</span>' +
          '<span class="stats">' + statsDiff(c.spell, pv.spell) + '</span></span></button>');
      }
    }
    el.choices.innerHTML = rows.join('');
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
    if (opt.type === 'erase') commit({ ci: Number(btn.dataset.ci), slot: Number(btn.dataset.slot) });
    else commit({ ci: Number(btn.dataset.ci), mode: btn.dataset.mode });
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
    const time = state.bossSpawned ? T('am.boss') : fmt(state.duration - state.t);
    const sig = state.circle + '|' + state.level + '|' + state.kills + '|' + time;
    if (sig === hudSig) return;
    hudSig = sig;
    el.circleChip.textContent = nightName(state.circle);
    el.levelChip.textContent = T(state.level >= S.maxLevel(state.circle) ? 'am.levelMax' : 'am.level', { n: state.level });
    el.killsChip.textContent = T('am.kills', { n: state.kills });
    el.timeChip.textContent = time;
  }

  // --- 회귀의 방 ---
  function circleMarkSvg(n) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const r = 46 - i * 4.4;
      out += '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="currentColor" stroke-width="' + (i === 0 ? 2 : 1) + '" opacity="' + (1 - i * 0.07) + '"' + (i % 2 ? ' stroke-dasharray="3 3"' : '') + '/>';
    }
    const inner = 46 - n * 4.4;
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
      pts.push((50 + Math.cos(a) * inner).toFixed(1) + ',' + (50 + Math.sin(a) * inner).toFixed(1));
    }
    out += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>';
    return out;
  }

  function renderCamp() {
    el.campTitle.textContent = save.runs ? T('am.campTitle', { n: save.runs + 1 }) : T('am.campFirst');
    el.circleMark.innerHTML = circleMarkSvg(save.circle);
    el.campCircle.textContent = T('am.circle', { n: save.circle });
    el.campMana.textContent = T('am.mana', { n: save.mana });
    const b = M.breakCheck(save);
    el.brk.textContent = b.why === 'max' ? T('am.breakMax') : T('am.break', { n: save.circle + 1 }) + ' · ' + T('am.breakCost', { n: b.cost });
    el.brk.disabled = !b.ok;
    el.breakNote.textContent = b.why === 'clear' ? T('am.breakNeedClear', { night: nightName(save.circle) })
      : b.why === 'mana' ? T('am.breakNeedMana', { n: b.cost - save.mana }) : '';
    if (night > save.circle) night = save.circle;
    let list = '';
    for (let c = 1; c <= save.circle; c++) {
      list += '<button class="btn small" type="button" data-c="' + c + '" aria-pressed="' + (c === night) + '">' + nightName(c) + '</button>';
    }
    el.nightList.innerHTML = list;
    let info = T('am.nightInfo', { m: Math.round(S.nightLength(night) / 60 * 10) / 10, n: night, max: S.maxLevel(night) });
    if (save.best[night]) info += ' · ' + T('am.best', { t: fmt(save.best[night]) });
    el.nightInfo.innerHTML = sockets([], night) + '<br>' + info;
    const g = M.grimoireCount(save, save.circle);
    el.grimoireCount.textContent = T('am.grimoireCount', g) + ' · ' + T('am.specialCount', { found: g.specialFound, total: g.special });
    const keys = Runes.allKeys(save.circle).filter((key) => save.grimoire[key]);
    el.grimoireList.innerHTML = keys.length
      ? keys.map((key) => {
        const runes = runesFromKey(key);
        const tag = Runes.isSpecial(key) ? ' <span class="tag">' + T('am.special') + '</span>' : '';
        return '<li>' + glyphs(runes) + ' ' + spellName(Runes.compose(runes)) + tag + '</li>';
      }).join('')
      : '<li class="sheet-note">' + T('am.grimoireNone') + '</li>';
  }

  el.nightList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    night = Number(btn.dataset.c);
    Sound.play('click');
    renderCamp();
  });
  el.brk.addEventListener('click', () => {
    if (!M.breakthrough(save)) return;
    store();
    night = save.circle;
    Sound.play('unlock');
    alert(T('am.breakDone', { n: save.circle }), 2200);
    renderCamp();
  });

  function showCamp() {
    mode = 'camp';
    setPaused(false);
    state = S.create({ circle: night, seed: 1 });
    state.pending = null;
    fx = [];
    renderCamp();
    el.result.hidden = true;
    el.levelup.hidden = true;
    el.camp.hidden = false;
    slotSig = '';
    renderSlots();
  }

  function startRun() {
    mode = 'run';
    seenThisRun = new Set();
    state = S.create({ circle: night, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
    fx = [];
    acc = 0;
    el.camp.hidden = true;
    el.result.hidden = true;
    slotSig = '';
    renderSlots();
    Sound.play('click');
    showLevelUp();
  }
  el.start.addEventListener('click', startRun);

  function finish() {
    const res = S.summary(state);
    const { gained, found } = M.settle(save, res);
    store();
    const won = res.won;
    el.resultTitle.textContent = T(won ? 'am.wonTitle' : 'am.lostTitle', { night: nightName(res.circle) });
    el.resultNote.textContent = T(won ? 'am.wonNote' : 'am.lostNote');
    el.report.innerHTML = [
      T('am.reportTime', { t: fmt(res.t) }),
      T('am.reportLevel', { n: res.level }),
      T('am.reportKills', { n: res.kills }),
      T('am.reportMana', { n: gained }),
      T('am.reportFound', { n: found.length }),
    ].map((s) => '<li>' + s + '</li>').join('');
    el.result.hidden = false;
    Sound.play(won ? 'won' : 'lost');
  }
  el.regress.addEventListener('click', () => { Sound.play('click'); showCamp(); });

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
    draw();
    slotBars();
    hud();
  }

  window.addEventListener('resize', () => { layout(); groundPattern = null; });

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

  showCamp();
  layout();
  requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });

  window.ArchmageDebug = {
    state: () => state, save: () => save, sim: S,
    grant: (xp) => { state.xp += xp; },
  };
})();

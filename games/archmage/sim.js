'use strict';

// 멸망의 밤 한 판. 화면을 모르는 결정적 시뮬레이션이라 node에서 판 하나를 끝까지
// 돌려 규칙과 균형을 본다. 화면은 state를 읽어 그리고, 손은 state.input만 쓴다.
//
// 난수를 둘로 나눴다. 적이 오는 차례(world)는 서클로만 정해져 **회차마다 같은 밤이
// 온다** — 회귀자가 미래를 아는 근거다. 룬 제시(fate)는 회차마다 달라 같은 밤을
// 다른 조합으로 넘게 된다.
(function () {
  const Runes = typeof module !== 'undefined' && module.exports ? require('./runes.js') : window.ArchmageRunes;
  const { ELEMENTS, MODIFIERS, compose } = Runes;

  const PLAYER = { hp: 120, r: 12, speed: 118, pickup: 80 };
  // 적은 화면 바깥 이 거리의 고리에서 나온다. 화면의 반대각선(약 330)보다 멀어야
  // 눈앞에서 솟아나지 않는다.
  const SPAWN_RING = 420;
  // 이보다 멀어진 적은 다시 고리로 데려온다. 도망쳐서 떼어 낸 적이 영영 안 오면
  // 밤이 싱거워지고, 쫓아오게 두면 뒤에 수백 마리가 쌓인다.
  const LEASH = 760;
  const MAX_FOES = 320;
  const MAX_GEMS = 280;
  const RANGE = 330;
  // 화면 전체에 미치는 마법(9단계)의 반경. 폰 세로 화면의 반대각선보다 조금 넓다.
  const SCREEN = 480;
  const CELL = 48;

  const FOES = {
    slime: { hp: 14, speed: 40, r: 11, dmg: 8, xp: 1, from: 0, weight: 4 },
    goblin: { hp: 22, speed: 56, r: 11, dmg: 10, xp: 1, from: 0.12, weight: 4 },
    wolf: { hp: 16, speed: 92, r: 10, dmg: 8, xp: 1, from: 0.3, weight: 3 },
    wraith: { hp: 36, speed: 66, r: 12, dmg: 12, xp: 2, from: 0.5, weight: 2 },
    golem: { hp: 150, speed: 32, r: 18, dmg: 18, xp: 6, from: 0.62, weight: 1 },
    boss: { hp: 7000, speed: 50, r: 34, dmg: 28, xp: 0 },
  };

  // 룬 제시의 무게. 원소가 없으면 마법이 나가지 않으므로 수식어보다 자주 나온다.
  const WEIGHT = { element: 3, modifier: 1 };
  // 판 안에서 마법진이 늘어나는 레벨.
  const CIRCLE_UNLOCK = [1, 4, 10];
  const ECHO_GAP = 0.35;
  const ECHO_MULT = 0.6;
  // 흡혈로 되찾는 생명력의 초당 한도. 범위 마법이 수십 마리를 한꺼번에 치므로 한도가
  // 없으면 흡혈 하나로 죽지 않게 된다.
  const LEECH_RATE = 6;

  function rng(seed) {
    // 1, 2, 3처럼 붙은 씨앗은 첫 값들이 서로 닮아 나온다. 한 번 섞어서 쓴다.
    let a = Math.imul((seed >>> 0) ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 서클이 오를수록 밤이 길다. 9서클이면 15분.
  const nightLength = (circle) => 300 + 75 * (circle - 1);
  // 레벨이 오를 때마다 다음까지가 빠르게 멀어진다. 처음 곡선(3 + 1.6L + 0.05L²)은
  // 1서클 한 판에 서른 번 넘게 올라 고르는 화면이 너무 자주 끊었다.
  const xpNext = (level) => Math.floor(5 + level * 2.5 + level * level * 0.3);
  // 서클마다 오를 수 있는 레벨의 끝. 구멍이 적은 낮은 서클에서 끝없이 오르면 등급만
  // 쌓여 서클을 올릴 까닭이 흐려진다.
  const maxLevel = (circle) => 15 + 5 * circle;

  function create({ circle = 1, seed = 1 } = {}) {
    const state = {
      circle, seed,
      world: rng(0x9e3779b9 ^ circle),
      fate: rng(seed),
      t: 0, duration: nightLength(circle),
      player: { x: 0, y: 0, hp: PLAYER.hp, maxHp: PLAYER.hp, r: PLAYER.r, inv: 0, face: 1, leechLeft: LEECH_RATE, healed: 0 },
      input: { x: 0, y: 0 },
      foes: [], gems: [], shots: [], orbits: [], zones: [], echoes: [],
      meteors: [], waves: [], tornados: [], quakes: [], rains: [], auras: [],
      circles: [0, 1, 2].map(() => ({ runes: [], spell: null, cd: 0, active: 0 })),
      unlocked: 1,
      level: 1, xp: 0, kills: 0, picks: 0,
      queued: 1, pending: null,
      spawnAcc: 0, nextBurst: 60, boss: null, bossSpawned: false,
      over: null, events: [], formed: new Set(),
      nextId: 1,
    };
    offerNext(state);
    return state;
  }

  // --- 룬 제시와 새기기 ---

  function capacity(state) { return state.circle; }

  // 새길 수 있는 방법들. 빈 구멍이 있어도 같은 룬이 이미 있으면 강화를 고를 수 있다 —
  // 구멍을 아껴 두었다가 다른 룬으로 조합을 맞추고 싶을 때가 있다.
  function placeModes(state, id, ci) {
    if (ci >= state.unlocked) return [];
    const c = state.circles[ci];
    const out = [];
    if (c.runes.length < capacity(state)) out.push('add');
    if (c.runes.some((r) => r.id === id)) out.push('grade');
    return out;
  }
  const placeMode = (state, id, ci) => placeModes(state, id, ci)[0] || null;

  const placeable = (state, id) => [0, 1, 2].some((ci) => placeMode(state, id, ci));
  const anyFull = (state) => state.circles.slice(0, state.unlocked).some((c) => c.runes.length >= capacity(state));

  function offerNext(state) {
    if (state.pending || state.queued <= 0 || state.over) return;
    state.queued -= 1;
    const first = state.picks === 0;
    // 처음 하나는 원소만 낸다. 수식어부터 새기면 첫 마법이 나가지 않는다. 1서클도
    // 수식어를 내지 않는다 — 한 칸짜리 마법진에서는 원소와 함께 새길 자리가 없어,
    // 고르는 순간 그 마법진이 영영 시전하지 않는 함정이 된다.
    const pool = [];
    for (const id of ELEMENTS) pool.push({ id, w: WEIGHT.element });
    if (!first && capacity(state) >= 2) for (const id of MODIFIERS) pool.push({ id, w: WEIGHT.modifier });
    const options = [];
    const left = pool.filter((p) => placeable(state, p.id));
    while (options.length < 3 && left.length) {
      let total = 0;
      for (const p of left) total += p.w;
      let roll = state.fate() * total;
      let i = 0;
      while (i < left.length - 1 && roll >= left[i].w) { roll -= left[i].w; i++; }
      options.push({ type: 'rune', id: left[i].id });
      left.splice(i, 1);
    }
    // 칸이 찼으면 가끔 재각인을 낸다. 없으면 첫 선택에 묶여 새 조합을 찾을 길이 없다.
    if (!first && anyFull(state) && state.fate() < 0.3) {
      if (options.length >= 3) options.pop();
      options.push({ type: 'erase' });
    }
    while (options.length < 3) options.push({ type: 'heal' });
    state.pending = { options, level: state.level };
  }

  function previewPlace(state, id, ci, want) {
    const modes = placeModes(state, id, ci);
    const mode = want || modes[0];
    if (!mode || modes.indexOf(mode) < 0) return null;
    const runes = state.circles[ci].runes.map((r) => ({ id: r.id, grade: r.grade }));
    if (mode === 'add') runes.push({ id, grade: 0 });
    else runes.find((r) => r.id === id).grade += 1;
    return { mode, runes, spell: compose(runes) };
  }

  function previewErase(state, ci, slot) {
    const runes = state.circles[ci].runes.filter((_, i) => i !== slot).map((r) => ({ id: r.id, grade: r.grade }));
    return { runes, spell: compose(runes) };
  }

  // target: 룬이면 마법진 번호나 { ci, mode }, 재각인이면 { ci, slot }.
  function choose(state, index, target) {
    const offer = state.pending;
    if (!offer) return false;
    const opt = offer.options[index];
    if (!opt) return false;
    if (opt.type === 'rune') {
      const ci = typeof target === 'object' && target ? target.ci : target;
      const p = previewPlace(state, opt.id, ci, target && target.mode);
      if (!p) return false;
      setRunes(state, ci, p.runes);
    } else if (opt.type === 'erase') {
      if (!target || !state.circles[target.ci] || !state.circles[target.ci].runes[target.slot]) return false;
      setRunes(state, target.ci, previewErase(state, target.ci, target.slot).runes);
    } else if (opt.type === 'heal') {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.maxHp * 0.4);
    }
    state.picks += 1;
    state.pending = null;
    offerNext(state);
    return true;
  }

  function setRunes(state, ci, runes) {
    const c = state.circles[ci];
    const before = c.spell ? c.spell.kind : null;
    c.runes = runes;
    c.spell = compose(runes);
    // 형태가 바뀌면 지금 떠 있는 것과 어긋나므로 곧바로 새 마법으로 다시 시작한다.
    if (!c.spell || c.spell.kind !== before) { c.cd = 0; c.active = 0; }
    if (c.spell) {
      state.events.push({ type: 'formed', ci, key: c.spell.key });
      state.formed.add(c.spell.key);
    }
  }

  // --- 한 걸음 ---

  function step(state, dt) {
    if (state.over || state.pending) return;
    state.t += dt;
    movePlayer(state, dt);
    spawn(state, dt);
    moveFoes(state, dt);
    const grid = buildGrid(state);
    separate(state, grid);
    cast(state, dt, grid);
    updateShots(state, dt, grid);
    updateOrbits(state, dt, grid);
    updateZones(state, dt, grid);
    updateMeteors(state, dt, grid);
    updateWaves(state, dt, grid);
    updateTornados(state, dt, grid);
    updateQuakes(state, dt, grid);
    updateRains(state, dt, grid);
    updateAuras(state, dt, grid);
    contact(state, dt, grid);
    updateGems(state, dt);
    sweep(state);
    levelUp(state);
  }

  function movePlayer(state, dt) {
    const p = state.player;
    let { x, y } = state.input;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.x += x * PLAYER.speed * dt;
    p.y += y * PLAYER.speed * dt;
    if (Math.abs(x) > 0.1) p.face = x > 0 ? 1 : -1;
    p.moving = len > 0.1;
    if (p.inv > 0) p.inv -= dt;
    p.leechLeft = Math.min(LEECH_RATE, p.leechLeft + LEECH_RATE * dt);
    if (p.healed > 0) p.healed -= dt;
  }

  function foeScale(state) {
    // 서클의 몫은 밤이 깊을수록 커진다. 처음부터 다 걸면 구멍이 비어 있는 초반에
    // 높은 서클일수록 레벨 하나 올리기도 버거워진다.
    const frac = Math.min(1, state.t / state.duration);
    return (1 + (state.circle - 1) * (0.3 + 0.7 * frac)) * (1 + 2.2 * frac);
  }

  function addFoe(state, type, angle, dist) {
    const def = FOES[type];
    const p = state.player;
    const hp = def.hp * foeScale(state);
    const foe = {
      id: state.nextId++, type,
      x: p.x + Math.cos(angle) * dist, y: p.y + Math.sin(angle) * dist,
      hp, maxHp: hp, r: def.r, speed: def.speed, dmg: def.dmg * (1 + 0.2 * (state.circle - 1)),
      slowT: 0, slow: 0, burnT: 0, burn: 0, kx: 0, ky: 0, flash: 0, dead: false,
      phase: state.world() * Math.PI * 2,
    };
    state.foes.push(foe);
    return foe;
  }

  function pickType(state) {
    const frac = state.t / state.duration;
    let total = 0;
    const open = [];
    for (const type in FOES) {
      const d = FOES[type];
      if (d.weight && frac >= d.from) { open.push(type); total += d.weight; }
    }
    let roll = state.world() * total;
    for (const type of open) {
      if (roll < FOES[type].weight) return type;
      roll -= FOES[type].weight;
    }
    return open[open.length - 1];
  }

  function spawn(state, dt) {
    const frac = Math.min(1, state.t / state.duration);
    let rate = (1.6 + 7 * frac) * (1 + 0.2 * (state.circle - 1));
    if (state.bossSpawned) rate *= 0.4;
    state.spawnAcc += rate * dt;
    while (state.spawnAcc >= 1) {
      state.spawnAcc -= 1;
      if (state.foes.length >= MAX_FOES) continue;
      addFoe(state, pickType(state), state.world() * Math.PI * 2, SPAWN_RING + state.world() * 60);
    }
    // 1분마다 사방에서 한꺼번에 조여 온다. 고르게만 오면 한자리에서 버티는 것이
    // 정답이 되어 움직일 이유가 없어진다.
    if (state.t >= state.nextBurst && !state.bossSpawned) {
      // 늑대 포위는 2분의 한 번뿐이다. 4분에도 늑대 마흔 마리를 두르자 레벨이 느려진
      // 뒤로는 그 한 번에 판이 끝나는 일이 잦았다.
      const minute = Math.floor(state.nextBurst / 60);
      const n = 14 + minute * 4;
      const type = minute === 2 ? 'wolf' : minute % 2 ? 'slime' : 'goblin';
      // 포위에는 틈을 하나 남긴다. 빈틈없이 두르면 빠른 늑대 떼에게는 피할 길이 없다.
      const gap = state.world() * Math.PI * 2;
      for (let i = 0; i < n && state.foes.length < MAX_FOES; i++) {
        addFoe(state, type, gap + 0.6 + (i / n) * (Math.PI * 2 - 1.2), SPAWN_RING - 40);
      }
      state.events.push({ type: 'burst' });
      state.nextBurst += 60;
    }
    if (!state.bossSpawned && state.t >= state.duration) {
      state.bossSpawned = true;
      const boss = addFoe(state, 'boss', state.world() * Math.PI * 2, SPAWN_RING);
      boss.hp = boss.maxHp = FOES.boss.hp * (1 + 0.6 * (state.circle - 1));
      boss.charge = 0;
      boss.chargeCd = 4;
      state.boss = boss;
      state.events.push({ type: 'boss' });
    }
  }

  function moveFoes(state, dt) {
    const p = state.player;
    for (const f of state.foes) {
      if (f.flash > 0) f.flash -= dt;
      if (f.slowT > 0) { f.slowT -= dt; if (f.slowT <= 0) f.slow = 0; }
      if (f.burnT > 0) {
        f.burnT -= dt;
        damage(state, f, f.burn * dt, null);
        if (f.burnT <= 0) f.burn = 0;
      }
      let dx = p.x - f.x;
      let dy = p.y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > LEASH) {
        const a = Math.atan2(-dy, -dx) + Math.PI + (state.world() - 0.5) * 1.2;
        f.x = p.x + Math.cos(a) * SPAWN_RING;
        f.y = p.y + Math.sin(a) * SPAWN_RING;
        continue;
      }
      dx /= d; dy /= d;
      let speed = f.speed * (1 - f.slow);
      if (f.type === 'boss') {
        // 사도는 가끔 몸을 던진다. 쫓기만 하면 도는 것만으로 영영 안 닿는다.
        f.chargeCd -= dt;
        if (f.charge > 0) { f.charge -= dt; speed *= 3.4; }
        else if (f.chargeCd <= 0 && d < 300) { f.charge = 0.8; f.chargeCd = 6; state.events.push({ type: 'charge' }); }
      }
      f.x += (dx * speed + f.kx) * dt;
      f.y += (dy * speed + f.ky) * dt;
      const decay = Math.exp(-8 * dt);
      f.kx *= decay; f.ky *= decay;
    }
  }

  function buildGrid(state) {
    const grid = new Map();
    const foes = state.foes;
    for (let i = 0; i < foes.length; i++) {
      const f = foes[i];
      const k = cellKey(Math.floor(f.x / CELL), Math.floor(f.y / CELL));
      const list = grid.get(k);
      if (list) list.push(f); else grid.set(k, [f]);
    }
    return grid;
  }

  const cellKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

  function near(grid, x, y, r, fn) {
    const x0 = Math.floor((x - r - 20) / CELL), x1 = Math.floor((x + r + 20) / CELL);
    const y0 = Math.floor((y - r - 20) / CELL), y1 = Math.floor((y + r + 20) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = grid.get(cellKey(cx, cy));
        if (!list) continue;
        for (const f of list) {
          if (f.dead) continue;
          const rr = r + f.r;
          const dx = f.x - x, dy = f.y - y;
          if (dx * dx + dy * dy <= rr * rr) fn(f);
        }
      }
    }
  }

  // 겹친 적을 밀어낸다. 이것이 없으면 수백 마리가 한 점에 겹쳐 무리가 아니라 한 마리로 보인다.
  function separate(state, grid) {
    for (const list of grid.values()) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const rr = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5 / d;
          // 큰 적은 작은 적에게 덜 밀린다.
          const wa = b.r / rr, wb = a.r / rr;
          a.x -= dx * push * wa * 2; a.y -= dy * push * wa * 2;
          b.x += dx * push * wb * 2; b.y += dy * push * wb * 2;
        }
      }
    }
  }

  function nearest(state, x, y, range, skip) {
    let best = null, bd = range * range;
    for (const f of state.foes) {
      if (f.dead || (skip && skip.has(f))) continue;
      const dx = f.x - x, dy = f.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = f; }
    }
    return best;
  }

  function cast(state, dt, grid) {
    state.circles.forEach((c, ci) => {
      if (ci >= state.unlocked || !c.spell) return;
      if (c.active > 0) c.active -= dt;
      if (c.cd > 0) { c.cd -= dt; return; }
      if (!fire(state, ci, c.spell, 1)) return;
      c.active = c.spell.dur;
      // 쿨타임은 유지 시간이 끝난 뒤부터 센다. 겹쳐 세면 유지가 긴 마법이 끊김 없이
      // 이어져 쿨타임이 뜻을 잃는다.
      c.cd = c.spell.dur + c.spell.cd;
      for (let k = 1; k <= c.spell.echo; k++) state.echoes.push({ ci, at: state.t + ECHO_GAP * k, mult: ECHO_MULT });
      state.events.push({ type: 'cast', ci, el: c.spell.primary, kind: c.spell.kind });
    });
    if (state.echoes.length) {
      const due = state.echoes.filter((e) => e.at <= state.t);
      if (due.length) {
        state.echoes = state.echoes.filter((e) => e.at > state.t);
        for (const e of due) {
          const s = state.circles[e.ci].spell;
          if (s && fire(state, e.ci, s, e.mult)) state.events.push({ type: 'echo', ci: e.ci, el: s.primary });
        }
      }
    }
  }

  function fire(state, ci, s, mult) {
    const p = state.player;
    const dmg = s.dmg * mult;
    const common = {
      ci, el: s.primary, dmg, slow: s.slow, burn: s.burn, knock: s.knock, chain: s.chain, leech: s.leech,
      cluster: s.cluster, nova: s.nova, pulse: s.pulse, shock: s.shock,
      freeze: s.freeze, ignite: s.ignite, vortex: s.vortex, shatter: s.shatter,
    };
    if (s.kind === 'orbit') {
      const count = s.count + 2 * s.omni;
      state.orbits.push(Object.assign({}, common, {
        life: s.dur, total: s.dur, count, blade: s.size,
        radius: 58 + s.size * 1.4, spin: s.speed, angle: state.fate() * Math.PI * 2, phase: 0,
      }));
      return true;
    }
    const reach = s.screen ? SCREEN : s.kind === 'quake' || s.kind === 'aura' ? s.size : RANGE;
    const target = nearest(state, p.x, p.y, reach);
    if (!target) return false;
    if (s.kind === 'rain') {
      state.rains.push(Object.assign({}, common, {
        sub: s.sub, r: s.size, per: s.count + s.omni, every: s.every, delay: s.delay, reach,
        life: s.dur, total: s.dur, tick: 0,
      }));
      return true;
    }
    if (s.kind === 'aura') {
      state.auras.push(Object.assign({}, common, { r: s.size, every: s.every, pull: s.pull, screen: s.screen, life: s.dur, total: s.dur, tick: 0 }));
      return true;
    }
    if (s.kind === 'zone') {
      const taken = new Set();
      let t = target;
      for (let i = 0; i < s.count + s.omni && t; i++) {
        taken.add(t);
        state.zones.push(Object.assign({}, common, { x: t.x, y: t.y, r: s.size, life: s.dur, total: s.dur, tick: 0 }));
        t = nearest(state, p.x, p.y, RANGE, taken);
      }
      return true;
    }
    if (s.kind === 'meteor') {
      // 가까운 적만 노리면 한 무리에 겹쳐 떨어진다. 사거리 안에서 고르게 흩는다.
      const pool = state.foes.filter((f) => !f.dead && Math.hypot(f.x - p.x, f.y - p.y) < RANGE);
      const n = s.count + 2 * s.omni;
      for (let i = 0; i < n && pool.length; i++) {
        const f = takeTarget(state, pool);
        state.meteors.push(Object.assign({}, common, { x: f.x, y: f.y, r: s.size, delay: 0.55 + i * 0.09, total: 0.55 + i * 0.09 }));
      }
      return true;
    }
    if (s.kind === 'wave') {
      const base = Math.atan2(target.y - p.y, target.x - p.x);
      const n = s.count + 2 * s.omni;
      const round = s.omni || s.ring;
      for (let i = 0; i < n; i++) {
        const a = round ? base + (i / n) * Math.PI * 2 : base + (i - (n - 1) / 2) * 0.55;
        state.waves.push(Object.assign({}, common, {
          x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), w: s.size, speed: s.speed, life: 1.4, total: 1.4, hit: new Set(),
        }));
      }
      return true;
    }
    if (s.kind === 'tornado') {
      const n = s.count + s.omni;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        state.tornados.push(Object.assign({}, common, {
          x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30, r: s.size, speed: s.speed, life: s.dur, total: s.dur, tick: 0,
        }));
      }
      return true;
    }
    if (s.kind === 'quake') {
      state.quakes.push(Object.assign({}, common, { r: s.size, screen: s.screen, life: s.dur, total: s.dur, tick: 0 }));
      return true;
    }
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const n = s.count + 3 * s.omni;
    for (let i = 0; i < n; i++) {
      // 전방위면 고르게 두르고, 아니면 겨눈 쪽으로 부채꼴을 편다.
      const a = s.omni ? base + (i / n) * Math.PI * 2 : base + (i - (n - 1) / 2) * 0.18;
      state.shots.push(Object.assign({}, common, {
        kind: s.kind, x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, speed: s.speed,
        r: s.kind === 'bolt' ? 8 : s.size, aoe: s.kind === 'bolt' ? s.size : 0,
        pierce: s.pierce, life: 1.6, hit: new Set(),
      }));
    }
    return true;
  }

  function damage(state, f, amount, src) {
    if (f.dead) return;
    const dealt = Math.min(amount, Math.max(0, f.hp));
    f.hp -= amount;
    if (src) {
      if (src.leech) leech(state, dealt * src.leech);
      f.flash = 0.08;
      if (src.slow) { f.slow = Math.max(f.slow, src.slow); f.slowT = 1.6; }
      if (src.freeze) { f.slow = 0.95; f.slowT = Math.max(f.slowT, 0.8); }
      if (src.burn) { f.burn = Math.max(f.burn, src.burn); f.burnT = 2; }
      if (src.knock && f.type !== 'boss') {
        const dx = f.x - (src.fromX !== undefined ? src.fromX : state.player.x);
        const dy = f.y - (src.fromY !== undefined ? src.fromY : state.player.y);
        const d = Math.hypot(dx, dy) || 1;
        f.kx += (dx / d) * src.knock * 4;
        f.ky += (dy / d) * src.knock * 4;
      }
    }
    if (f.hp <= 0) kill(state, f);
  }

  function leech(state, amount) {
    const p = state.player;
    const heal = Math.min(amount, p.leechLeft, p.maxHp - p.hp);
    if (heal <= 0) return;
    p.leechLeft -= heal;
    p.hp += heal;
    p.healed = 0.25;
  }

  function kill(state, f) {
    f.dead = true;
    state.kills += 1;
    const xp = FOES[f.type].xp;
    if (xp) {
      if (state.gems.length < MAX_GEMS) state.gems.push({ x: f.x, y: f.y, v: xp, pull: false });
      else state.gems[state.kills % state.gems.length].v += xp;
    }
    state.events.push({ type: 'kill', x: f.x, y: f.y, foe: f.type });
    if (f.type === 'boss') {
      state.over = 'won';
      state.events.push({ type: 'won' });
    }
  }

  // 연쇄: 맞힌 자리에서 **그 마법 자체가** 다음 적에게 번진다. 번개가 튀는 모양으로
  // 두었더니 어느 마법에 붙여도 같은 번개라 연쇄가 마법을 바꾸는 느낌이 없었다.
  // 번질 때마다 조금씩 약해지고, 한 마법이 번지는 것은 한 번뿐이라 줄기처럼 이어진다.
  const SPREAD_REACH = 200;
  const SPREAD_DMG = 0.75;

  function nextTarget(state, x, y, skip, outside) {
    let best = null, bd = SPREAD_REACH * SPREAD_REACH;
    for (const f of state.foes) {
      if (f.dead || (skip && skip.has(f))) continue;
      const dx = f.x - x, dy = f.y - y;
      const d2 = dx * dx + dy * dy;
      if (outside && d2 < outside * outside) continue;
      if (d2 < bd) { bd = d2; best = f; }
    }
    return best;
  }

  // e는 번지는 마법 하나(탄·창·지대·운석…). x, y는 맞힌 자리.
  function spread(state, e, x, y, skip) {
    if (!e.chain || e.spread) return;
    e.spread = true;
    const t = nextTarget(state, x, y, skip, e.r && e.kind !== 'bolt' && e.kind !== 'lance' ? e.r : 0);
    if (!t) return;
    const child = Object.assign({}, e, { chain: e.chain - 1, dmg: e.dmg * SPREAD_DMG, spread: false, done: false });
    const a = Math.atan2(t.y - y, t.x - x);
    if (e.kind === 'bolt' || e.kind === 'lance') {
      Object.assign(child, {
        x, y, vx: Math.cos(a) * e.speed, vy: Math.sin(a) * e.speed, life: 1.2, blasts: 0,
        hit: new Set(skip || e.hit), frag: false,
      });
      state.shots.push(child);
    } else if (e.kind === 'zone') {
      state.zones.push(Object.assign(child, { x: t.x, y: t.y, life: e.total, tick: 0 }));
    } else if (e.kind === 'impact') {
      state.meteors.push(Object.assign(child, { x: t.x, y: t.y, delay: 0.25, total: 0.25, done: false }));
    } else if (e.kind === 'wave') {
      Object.assign(child, { x, y, dx: Math.cos(a), dy: Math.sin(a), life: e.total, hit: new Set(e.hit) });
      state.waves.push(child);
    } else if (e.kind === 'tornado') {
      state.tornados.push(Object.assign(child, { x: t.x, y: t.y, life: e.total * 0.7, tick: 0 }));
    } else if (e.kind === 'orbit') {
      // 칼날은 맞힌 적 둘레에 작은 칼날 고리를 새로 만든다.
      state.orbits.push(Object.assign(child, {
        cx: t.x, cy: t.y, radius: 34, life: Math.min(e.total, 1.6), total: Math.min(e.total, 1.6), hitAt: new Map(),
      }));
    }
  }

  // 접목(특수 조합)이 맞힌 자리에 남기는 것. 이어지는 형태(칼날·지대·오라)는 얼림·화상만
  // 쓰고 여기로 오지 않는다 — 틱마다 불길과 파편을 남기면 화면이 덮인다.
  function graftAt(state, e, x, y, r, grid) {
    if (e.ignite) {
      state.zones.push({
        kind: 'zone', el: 'fire', x, y, r: Math.max(24, r * 0.6), life: 1.4, total: 1.4, tick: 0,
        dmg: e.dmg * 0.2, burn: 6, slow: 0, knock: 0, chain: 0, leech: e.leech,
      });
    }
    if (e.vortex) pull(grid, x, y, r * 1.8, 1400);
    if (e.shatter) {
      for (let i = 0; i < 3; i++) {
        const a = state.fate() * Math.PI * 2;
        const v = 140 + state.fate() * 80;
        state.shots.push({
          kind: 'bolt', frag: true, ci: e.ci, el: 'earth', dmg: e.dmg * 0.35, slow: 0, burn: 0, knock: 20, chain: 0,
          leech: e.leech, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, speed: v, r: 6, aoe: 22, pierce: 0,
          life: 0.4, hit: new Set(),
        });
      }
    }
  }

  function pull(grid, x, y, r, power) {
    near(grid, x, y, r, (f) => {
      if (f.type === 'boss') return;
      const dx = x - f.x, dy = y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      f.kx += (dx / d) * power * 0.12; f.ky += (dy / d) * power * 0.12;
      const k = Math.hypot(f.kx, f.ky);
      if (k > PULL_MAX * 2) { f.kx *= PULL_MAX * 2 / k; f.ky *= PULL_MAX * 2 / k; }
    });
  }

  function updateShots(state, dt, grid) {
    for (const sh of state.shots) {
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life -= dt;
      if (sh.life <= 0) {
        sh.done = true;
        if (sh.frag) {
          const src = { burn: sh.burn, leech: sh.leech, fromX: sh.x, fromY: sh.y };
          near(grid, sh.x, sh.y, sh.aoe, (f) => damage(state, f, sh.dmg, src));
          state.events.push({ type: 'burst-hit', el: sh.el, x: sh.x, y: sh.y, r: sh.aoe });
        }
        continue;
      }
      let hitOne = null;
      near(grid, sh.x, sh.y, sh.r, (f) => {
        if (hitOne || sh.done || sh.hit.has(f)) return;
        hitOne = f;
      });
      if (!hitOne) continue;
      if (sh.kind === 'bolt') {
        // 관통이 남은 탄은 터지고도 계속 날아가 다음 무리에서 또 터진다. 방금 터뜨린
        // 무리는 다시 맞히지 않는다 — 안 그러면 한 자리에서 연달아 터진다.
        sh.blasts = (sh.blasts || 0) + 1;
        if (sh.blasts > sh.pierce) sh.done = true;
        const src = { slow: sh.slow, burn: sh.burn, knock: sh.knock, leech: sh.leech, fromX: sh.x, fromY: sh.y };
        src.freeze = sh.freeze;
        near(grid, sh.x, sh.y, sh.aoe, (f) => { sh.hit.add(f); damage(state, f, sh.dmg, src); });
        state.events.push({ type: 'burst-hit', el: sh.el, x: sh.x, y: sh.y, r: sh.aoe });
        if (sh.cluster && !sh.frag) scatter(state, sh);
        if (!sh.frag) graftAt(state, sh, sh.x, sh.y, sh.aoe, grid);
        spread(state, sh, sh.x, sh.y, sh.hit);
      } else {
        sh.hit.add(hitOne);
        damage(state, hitOne, sh.dmg, sh);
        if (sh.hit.size === 1) graftAt(state, sh, hitOne.x, hitOne.y, 30, grid);
        spread(state, sh, hitOne.x, hitOne.y, sh.hit);
        if (sh.nova) {
          const src = { slow: Math.max(0.5, sh.slow), leech: sh.leech };
          near(grid, hitOne.x, hitOne.y, NOVA_R, (f) => { if (f !== hitOne) damage(state, f, sh.dmg * 0.5, src); });
          state.events.push({ type: 'burst-hit', el: sh.el, x: hitOne.x, y: hitOne.y, r: NOVA_R });
        }
        if (sh.hit.size > sh.pierce) sh.done = true;
      }
    }
    state.shots = state.shots.filter((s) => !s.done);
  }

  const NOVA_R = 36;
  const FRAGMENTS = 4;

  function scatter(state, sh) {
    for (let i = 0; i < FRAGMENTS; i++) {
      const a = state.fate() * Math.PI * 2;
      const v = 150 + state.fate() * 80;
      state.shots.push({
        kind: 'bolt', frag: true, ci: sh.ci, el: sh.el, dmg: sh.dmg * 0.45, slow: sh.slow, burn: sh.burn, freeze: sh.freeze,
        knock: 0, chain: 0, leech: sh.leech, x: sh.x, y: sh.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        speed: v, r: 6, aoe: sh.aoe * 0.55, pierce: 0, life: 0.45, hit: new Set(sh.hit),
      });
    }
  }

  // 같은 적을 다시 베기까지의 틈. 0.45초였을 때는 사도처럼 단단한 적 하나를 잡지 못했다.
  const ORBIT_TICK = 0.3;
  const ZONE_TICK = 0.4;

  const orbitRadius = (o) => o.radius * (o.pulse ? 1 + 0.9 * Math.abs(Math.sin(o.phase)) : 1);

  // 칼날은 마법사 둘레를 돈다. 연쇄로 번진 칼날만 맞힌 적의 자리(cx, cy)를 돈다.
  const orbitCenter = (o, p) => (o.cx !== undefined ? { x: o.cx, y: o.cy } : p);

  function orbitBlades(o, p) {
    const out = [];
    const r = orbitRadius(o);
    const c = orbitCenter(o, p);
    for (let i = 0; i < o.count; i++) {
      const a = o.angle + (i / o.count) * Math.PI * 2;
      out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
    }
    return out;
  }

  // 칼날은 매 걸음 맞는지 보고, 같은 적은 ORBIT_TICK에 한 번만 벤다. 틱마다 한 번만
  // 보면 빠른 칼날이 그 사이에 적을 건너뛴다.
  function updateOrbits(state, dt, grid) {
    const p = state.player;
    for (const o of state.orbits) {
      o.life -= dt;
      o.angle += o.spin * dt;
      o.phase += 2.2 * dt;
      if (!o.hitAt) o.hitAt = new Map();
      for (const b of orbitBlades(o, p)) {
        near(grid, b.x, b.y, o.blade, (f) => {
          if ((o.hitAt.get(f) || 0) > state.t) return;
          o.hitAt.set(f, state.t + ORBIT_TICK);
          damage(state, f, o.dmg, o);
          spread(state, Object.assign(o, { kind: 'orbit' }), f.x, f.y, null);
        });
      }
    }
    state.orbits = state.orbits.filter((o) => o.life > 0);
  }

  function updateZones(state, dt, grid) {
    for (const z of state.zones) {
      z.life -= dt;
      z.tick -= dt;
      if (z.tick > 0) continue;
      z.tick = ZONE_TICK;
      const src = { slow: z.slow, burn: z.burn, knock: z.knock, leech: z.leech, fromX: z.x, fromY: z.y };
      let first = null;
      src.freeze = z.freeze;
      near(grid, z.x, z.y, z.r, (f) => { if (!first) first = f; damage(state, f, z.dmg, src); });
      if (z.vortex) pull(grid, z.x, z.y, z.r * 1.6, 700);
      if (first) spread(state, Object.assign(z, { kind: 'zone' }), z.x, z.y, null);
      if (z.shock) {
        const out = { knock: 60, leech: z.leech, fromX: z.x, fromY: z.y };
        near(grid, z.x, z.y, z.r * 1.8, (f) => {
          if (Math.hypot(f.x - z.x, f.y - z.y) > z.r) damage(state, f, z.dmg * 0.6, out);
        });
        state.events.push({ type: 'shock', el: z.el, x: z.x, y: z.y, r: z.r * 1.8 });
      }
    }
    state.zones = state.zones.filter((z) => z.life > 0);
  }

  function updateMeteors(state, dt, grid) {
    for (const m of state.meteors) {
      m.delay -= dt;
      if (m.delay > 0) continue;
      m.done = true;
      const src = { slow: m.slow, burn: m.burn, knock: (m.sub === 'bolt' ? 0 : 30) + m.knock, leech: m.leech, freeze: m.freeze, fromX: m.x, fromY: m.y };
      let first = null;
      near(grid, m.x, m.y, m.r, (f) => { if (!first) first = f; damage(state, f, m.dmg, src); });
      graftAt(state, m, m.x, m.y, m.r, grid);
      if (first) spread(state, Object.assign(m, { kind: 'impact' }), m.x, m.y, null);
      state.events.push({ type: 'impact', el: m.el, sub: m.sub || 'meteor', x: m.x, y: m.y, r: m.r });
    }
    state.meteors = state.meteors.filter((m) => !m.done);
  }

  // 물결은 진행 방향으로 얇고 옆으로 넓은 띠다. 띠 안에 든 적을 한 번씩 치고 민다.
  function updateWaves(state, dt, grid) {
    for (const w of state.waves) {
      w.life -= dt;
      w.x += w.dx * w.speed * dt;
      w.y += w.dy * w.speed * dt;
      const src = { slow: Math.max(0.3, w.slow), burn: w.burn, leech: w.leech, freeze: w.freeze };
      near(grid, w.x, w.y, w.w, (f) => {
        if (w.hit.has(f)) return;
        const rx = f.x - w.x, ry = f.y - w.y;
        const along = rx * w.dx + ry * w.dy;
        const across = -rx * w.dy + ry * w.dx;
        if (Math.abs(along) > 14 + f.r || Math.abs(across) > w.w) return;
        w.hit.add(f);
        damage(state, f, w.dmg, src);
        if (f.type !== 'boss') { f.kx += w.dx * 260; f.ky += w.dy * 260; }
        spread(state, Object.assign(w, { kind: 'wave' }), f.x, f.y, w.hit);
      });
    }
    state.waves = state.waves.filter((w) => w.life > 0);
  }

  const TORNADO_TICK = 0.35;
  const TORNADO_LEASH = 150;
  const PULL_MAX = 110;
  function updateTornados(state, dt, grid) {
    for (const t of state.tornados) {
      t.life -= dt;
      // 회오리는 마법사 둘레에서만 사냥한다. 적을 쫓아 멀리 가게 두었더니 마법사가
      // 빈손이 되어, 바람만 쓰는 3서클 판이 1분 안에 무너졌다.
      const p = state.player;
      const aim = nearest(state, p.x, p.y, TORNADO_LEASH);
      t.orbit = (t.orbit || state.fate() * Math.PI * 2) + dt * 1.4;
      // 적이 있으면 마법사와 그 적 사이에 선다. 적 위에 서면 둘레의 무리를 마법사 쪽으로
      // 끌어와 오히려 몸에 부딪히게 했다.
      let gx = p.x + Math.cos(t.orbit) * 80, gy = p.y + Math.sin(t.orbit) * 80;
      if (aim) {
        const ax = aim.x - p.x, ay = aim.y - p.y;
        const ad = Math.hypot(ax, ay) || 1;
        const keep = Math.max(70, Math.min(ad, 120));
        gx = p.x + (ax / ad) * keep; gy = p.y + (ay / ad) * keep;
      }
      {
        const dx = gx - t.x, dy = gy - t.y;
        const d = Math.hypot(dx, dy) || 1;
        const v = Math.min(d, t.speed * dt);
        t.x += (dx / d) * v; t.y += (dy / d) * v;
      }
      // 둘레의 적을 안으로 끌어당긴다. 모아 둔 무리를 다른 마법이 한꺼번에 치게 된다.
      // 끄는 속도에는 상한을 둔다. 쌓이게 두었더니 끌려온 적이 회오리를 지나쳐 날아와
      // 마법사에게 부딪혔다.
      near(grid, t.x, t.y, t.r * 2.2, (f) => {
        if (f.type === 'boss' || Math.hypot(f.x - p.x, f.y - p.y) < 90) return;
        const dx = t.x - f.x, dy = t.y - f.y;
        const d = Math.hypot(dx, dy) || 1;
        f.kx += (dx / d) * 900 * dt; f.ky += (dy / d) * 900 * dt;
        const k = Math.hypot(f.kx, f.ky);
        if (k > PULL_MAX) { f.kx *= PULL_MAX / k; f.ky *= PULL_MAX / k; }
      });
      t.tick -= dt;
      if (t.tick > 0) continue;
      t.tick = TORNADO_TICK;
      const src = { slow: t.slow, burn: t.burn, leech: t.leech, freeze: t.freeze };
      let first = null;
      near(grid, t.x, t.y, t.r, (f) => { if (!first) first = f; damage(state, f, t.dmg, src); });
      if (first) spread(state, Object.assign(t, { kind: 'tornado' }), t.x, t.y, null);
    }
    state.tornados = state.tornados.filter((t) => t.life > 0);
  }

  const QUAKE_TICK = 0.5;
  function updateQuakes(state, dt, grid) {
    const p = state.player;
    for (const q of state.quakes) {
      q.life -= dt;
      q.tick -= dt;
      if (q.tick > 0) continue;
      q.tick = QUAKE_TICK;
      const src = { slow: 0.85, burn: q.burn, knock: 20 + q.knock, leech: q.leech, freeze: q.freeze, fromX: p.x, fromY: p.y };
      near(grid, p.x, p.y, q.r, (f) => { damage(state, f, q.dmg, src); f.slowT = Math.max(f.slowT, 0.6); });
      if (q.vortex) pull(grid, p.x, p.y, q.r, 900);
      aftershock(state, q, p.x, p.y, q.r);
      state.events.push({ type: 'quake', x: p.x, y: p.y, r: q.r, screen: q.screen });
    }
    state.quakes = state.quakes.filter((q) => q.life > 0);
  }

  // 마법사 둘레를 치는 것(지진·오라)의 연쇄. 둘레 밖의 적에게 여진이 떨어져 번진다.
  function aftershock(state, e, x, y, r) {
    if (!e.chain || e.spread) return;
    const t = nextTarget(state, x, y, null, r);
    if (!t) return;
    e.spread = true;
    state.meteors.push(Object.assign({}, e, {
      kind: 'impact', sub: 'rock', x: t.x, y: t.y, r: 48, delay: 0.3, total: 0.3,
      chain: e.chain - 1, dmg: e.dmg * SPREAD_DMG, spread: false, done: false,
    }));
  }

  // 사거리(화면 전체일 수도) 안의 적 위로 every마다 per개씩 떨어뜨린다. 한 번에 한
  // 자리에 몰리지 않게 매번 무작위로 고른다.
  // 떨어지는 것의 과녁. 사도가 있으면 하나는 늘 사도에게 간다 — 무작위로만 고르면
  // 무리에 묻힌 사도에게는 거의 떨어지지 않아 운석으로는 밤을 끝낼 수 없었다.
  function takeTarget(state, pool) {
    const b = pool.findIndex((f) => f.type === 'boss');
    if (b >= 0) return pool.splice(b, 1)[0];
    return pool.splice(Math.floor(state.fate() * pool.length), 1)[0];
  }

  function updateRains(state, dt, grid) {
    const p = state.player;
    for (const rn of state.rains) {
      rn.life -= dt;
      rn.tick -= dt;
      if (rn.tick > 0) continue;
      rn.tick = rn.every;
      const pool = state.foes.filter((f) => !f.dead && Math.hypot(f.x - p.x, f.y - p.y) < rn.reach);
      for (let i = 0; i < rn.per && pool.length; i++) {
        const f = takeTarget(state, pool);
        state.meteors.push(Object.assign({}, rn, {
          kind: 'impact', x: f.x, y: f.y, delay: rn.delay, total: rn.delay, done: false, spread: false,
        }));
      }
    }
    state.rains = state.rains.filter((rn) => rn.life > 0);
  }

  function updateAuras(state, dt, grid) {
    const p = state.player;
    for (const a of state.auras) {
      a.life -= dt;
      if (a.pull || a.vortex) pull(grid, p.x, p.y, a.r * 1.3, 180 * dt * 60 * 0.1);
      a.tick -= dt;
      if (a.tick > 0) continue;
      a.tick = a.every;
      const src = { slow: a.slow, burn: a.burn, knock: a.knock, leech: a.leech, freeze: a.freeze, fromX: p.x, fromY: p.y };
      near(grid, p.x, p.y, a.r, (f) => damage(state, f, a.dmg, src));
      aftershock(state, a, p.x, p.y, a.r);
      state.events.push({ type: 'aura', el: a.el, x: p.x, y: p.y, r: a.r, screen: a.screen });
    }
    state.auras = state.auras.filter((a) => a.life > 0);
  }

  function contact(state, dt, grid) {
    const p = state.player;
    if (p.inv > 0) return;
    let worst = 0;
    near(grid, p.x, p.y, p.r - 3, (f) => { worst = Math.max(worst, f.dmg); });
    if (!worst) return;
    p.hp -= worst;
    p.inv = 0.5;
    state.events.push({ type: 'hurt' });
    if (p.hp <= 0) {
      p.hp = 0;
      state.over = 'lost';
      state.events.push({ type: 'lost' });
    }
  }

  function updateGems(state, dt) {
    const p = state.player;
    const reach = PLAYER.pickup * PLAYER.pickup;
    for (const g of state.gems) {
      const dx = p.x - g.x, dy = p.y - g.y;
      const d2 = dx * dx + dy * dy;
      if (!g.pull && d2 < reach) g.pull = true;
      if (!g.pull) continue;
      const d = Math.sqrt(d2) || 1;
      if (d < p.r + 6) {
        g.taken = true;
        state.xp += g.v;
        state.events.push({ type: 'gem' });
        continue;
      }
      const v = Math.min(d, 360 * dt);
      g.x += (dx / d) * v; g.y += (dy / d) * v;
    }
    state.gems = state.gems.filter((g) => !g.taken);
  }

  function sweep(state) {
    if (state.foes.some((f) => f.dead)) state.foes = state.foes.filter((f) => !f.dead);
  }

  function levelUp(state) {
    const cap = maxLevel(state.circle);
    if (state.level >= cap) state.xp = 0;
    while (state.level < cap && state.xp >= xpNext(state.level)) {
      state.xp -= xpNext(state.level);
      state.level += 1;
      state.queued += 1;
      const unlocked = CIRCLE_UNLOCK.filter((lv) => state.level >= lv).length;
      if (unlocked > state.unlocked) {
        state.unlocked = unlocked;
        state.events.push({ type: 'unlock', ci: unlocked - 1 });
      }
      state.events.push({ type: 'level', level: state.level });
    }
    offerNext(state);
  }

  function drain(state) {
    const ev = state.events;
    state.events = [];
    return ev;
  }

  function summary(state) {
    return {
      circle: state.circle, won: state.over === 'won', t: state.t, duration: state.duration,
      kills: state.kills, level: state.level, formed: Array.from(state.formed),
    };
  }

  const api = {
    FOES, PLAYER, CIRCLE_UNLOCK, RANGE,
    create, step, choose, drain, summary, previewPlace, previewErase, placeMode, placeModes, orbitBlades, orbitRadius,
    nightLength, xpNext, maxLevel, capacity, rng,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageSim = api;
})();

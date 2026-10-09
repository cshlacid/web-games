'use strict';

// 싸움 한 판의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// 한 줄의 칸 위에서 어사와 적이 번갈아 움직인다. 어사가 한 가지를 하면(움직이기·돌아서기·패
// 쌓기·출두·기다리기) 적이 모두 한 번씩 움직인다. **싸움에는 운이 없다** — 같은 판에서 같은
// 순서로 두면 늘 같은 결과다. 적이 무엇을 할지(준비 중인 공격과 남은 차례)가 화면에 다 보이므로,
// 운이 끼면 읽고 피하는 재미가 무너진다.
//
// 패는 쌓아 두었다가 출두할 때 쌓은 차례대로 한꺼번에 나간다. 쌓는 데도 차례가 들어서, 많이
// 쌓을수록 적도 그만큼 움직인다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.AmhaengData;

const inLane = (state, cell) => cell >= 0 && cell < state.lane;
const foeAt = (state, cell) => state.foes.find((f) => f.pos === cell) || null;
const empty = (state, cell) => inLane(state, cell) && state.hero.pos !== cell && !foeAt(state, cell);

// 벼린 정도(lv)는 피해가 있는 패면 피해에, 없는 패면 기다림을 줄이는 데 들어간다.
function tileDmg(tile) {
  const base = D.TILES[tile.id];
  return base.dmg > 0 ? base.dmg + tile.lv : 0;
}

// 복주머니는 모든 패의 기다림을 한 차례 줄인다(1 아래로는 안 간다).
function tileCd(tile, blessings = []) {
  const base = D.TILES[tile.id];
  const cd = base.dmg > 0 ? base.cd : base.cd - tile.lv;
  return Math.max(1, cd - (blessings.includes('pouch') ? 1 : 0));
}

// spec: { waves, hp, maxHp, tiles: [{ id, lv }], blessings: [] }
function create(spec) {
  const blessings = spec.blessings || [];
  const state = {
    lane: D.LANE,
    turn: 0,
    hero: { pos: Math.floor(D.LANE / 2), face: 1, hp: spec.hp, maxHp: spec.maxHp, ward: blessings.includes('robe') },
    foes: [],
    tiles: spec.tiles.map((t) => ({ id: t.id, lv: t.lv || 0, cd: 0 })),
    queue: [],
    queueMax: D.QUEUE_MAX + (blessings.includes('sash') ? 1 : 0),
    blessings: blessings.slice(),
    waves: spec.waves.map(([at, kind]) => ({ at, kind })),
    nextUid: 1,
    events: [],
    over: null,
  };
  spawnDue(state);
  return state;
}

function addFoe(state, kind, cell) {
  const def = D.ENEMIES[kind];
  const foe = {
    uid: state.nextUid++,
    kind,
    pos: cell,
    face: cell < state.hero.pos ? 1 : -1,
    hp: def.hp,
    maxHp: def.hp,
    wind: null,
    stun: 0,
    summonIn: def.summon ? def.summon.every : 0,
  };
  state.foes.push(foe);
  state.events.push({ type: 'spawn', uid: foe.uid, kind, cell });
  return foe;
}

// 양 끝 중 어사에게서 먼 쪽부터 들인다. 끝이 둘 다 막혔으면 다음 차례로 미룬다.
function edgeFor(state) {
  const ends = [0, state.lane - 1].sort((a, b) => Math.abs(b - state.hero.pos) - Math.abs(a - state.hero.pos));
  return ends.find((cell) => empty(state, cell));
}

function spawnDue(state) {
  for (const wave of state.waves.filter((w) => w.at <= state.turn)) {
    const cell = edgeFor(state);
    if (cell === undefined) break;
    addFoe(state, wave.kind, cell);
    state.waves.splice(state.waves.indexOf(wave), 1);
  }
}

// --- 피해 ---

function hurtHero(state, dmg, from) {
  if (dmg <= 0) return;
  if (state.hero.ward) {
    state.hero.ward = false;
    state.events.push({ type: 'ward', from });
    return;
  }
  state.hero.hp = Math.max(0, state.hero.hp - dmg);
  state.events.push({ type: 'heroHit', dmg, from });
}

// 방패는 바라보는 쪽에서 오는 피해만 줄인다. 뒤로 돌아 들어가는 길(축지법·밀치기)을 쓰게 하려는 것이다.
function hurtFoe(state, foe, dmg, fromCell) {
  if (dmg <= 0 || !state.foes.includes(foe)) return;
  let hit = dmg;
  if (D.ENEMIES[foe.kind].shield && (fromCell - foe.pos) * foe.face > 0) {
    hit = Math.max(0, dmg - 1);
    state.events.push({ type: 'block', uid: foe.uid });
  }
  if (!hit) return;
  foe.hp -= hit;
  state.events.push({ type: 'hit', uid: foe.uid, dmg: hit });
  if (foe.hp <= 0) {
    state.foes.splice(state.foes.indexOf(foe), 1);
    state.events.push({ type: 'die', uid: foe.uid, kind: foe.kind, cell: foe.pos });
  }
}

// 앞쪽으로 처음 만나는 것(어사든 적이든)의 칸.
function lineTarget(state, from, face) {
  for (let cell = from + face; inLane(state, cell); cell += face) {
    if (state.hero.pos === cell || foeAt(state, cell)) return cell;
  }
  return -1;
}

// --- 어사의 패 ---

function useTile(state, tile) {
  const base = D.TILES[tile.id];
  const { pos, face } = state.hero;
  const dmg = tileDmg(tile);
  state.events.push({ type: 'tile', id: tile.id });
  if (base.dash) {
    const front = pos + face;
    const over = foeAt(state, front) ? front + face : -1;
    if (over >= 0 && empty(state, over)) {
      state.hero.pos = over;
      state.hero.face = -face;
    } else if (!foeAt(state, front)) {
      const far = empty(state, front + face) ? front + face : front;
      if (empty(state, far)) state.hero.pos = far;
    }
    state.events.push({ type: 'heroMove', cell: state.hero.pos });
    return;
  }
  let cells;
  if (base.all) cells = state.foes.map((f) => f.pos);
  else if (base.line) cells = [lineTarget(state, pos, face)].filter((cell) => cell >= 0);
  else cells = base.hits.map((h) => pos + face * h).filter((cell) => inLane(state, cell));
  state.events.push({ type: 'aim', cells });
  const targets = cells.map((cell) => foeAt(state, cell)).filter(Boolean);
  for (const foe of targets) {
    for (let k = 0; k < (base.times || 1); k++) hurtFoe(state, foe, dmg, pos);
    if (base.stun && state.foes.includes(foe)) {
      foe.stun += base.stun;
      state.events.push({ type: 'stun', uid: foe.uid });
    }
    if (base.push && state.foes.includes(foe)) {
      const to = foe.pos + face;
      if (empty(state, to)) {
        foe.pos = to;
        state.events.push({ type: 'push', uid: foe.uid, cell: to });
      } else {
        // 벽이나 다른 적에 부딪히면 둘 다 아프다.
        const other = foeAt(state, to);
        hurtFoe(state, foe, base.push, pos);
        if (other) hurtFoe(state, other, base.push, foe.pos);
      }
    }
  }
}

// --- 적 ---

// 적의 공격이 칠 칸. 줄 공격은 지금 앞에 처음 있는 것의 칸 하나다.
function attackCells(state, foe, attack) {
  if (attack.line) {
    const cell = lineTarget(state, foe.pos, foe.face);
    return cell >= 0 ? [cell] : [];
  }
  return attack.hits.map((h) => foe.pos + foe.face * h).filter((cell) => inLane(state, cell));
}

function chooseAttack(state, foe) {
  const def = D.ENEMIES[foe.kind];
  for (let k = 0; k < def.attacks.length; k++) {
    const attack = def.attacks[k];
    if (attackCells(state, foe, attack).includes(state.hero.pos)) return k;
    // 양쪽을 치는 적은 돌아서지 않으므로 뒤쪽 무늬도 같은 공격으로 본다.
    if (def.both) {
      const back = { ...foe, face: -foe.face };
      if (attackCells(state, back, attack).includes(state.hero.pos)) return k;
    }
  }
  return -1;
}

function strike(state, foe) {
  const attack = D.ENEMIES[foe.kind].attacks[foe.wind.attack];
  const cells = attackCells(state, foe, attack);
  state.events.push({ type: 'strike', uid: foe.uid, cells });
  for (const cell of cells) {
    if (state.hero.pos === cell) {
      hurtHero(state, attack.dmg, foe.pos);
      // 끌어당기기: 어사를 제 앞 칸으로.
      if (attack.pull && empty(state, foe.pos + foe.face)) {
        state.hero.pos = foe.pos + foe.face;
        state.events.push({ type: 'heroMove', cell: state.hero.pos, pulled: true });
      }
    } else {
      // 제 편도 친다. 적끼리 줄을 세워 서로 치게 만드는 것이 이 게임의 수다.
      const other = foeAt(state, cell);
      if (other && other !== foe) hurtFoe(state, other, attack.dmg, foe.pos);
    }
  }
}

function step(state, foe, to) {
  if (!empty(state, to)) return false;
  foe.pos = to;
  state.events.push({ type: 'move', uid: foe.uid, cell: to });
  return true;
}

function foeTurn(state, foe) {
  const def = D.ENEMIES[foe.kind];
  // 졸개가 쌓이면 우두머리에게 손이 닿지 않는다. 곁에 졸개가 넉넉하면 부르지 않고 기다린다.
  if (def.summon && --foe.summonIn <= 0 && state.foes.length - 1 < def.summon.max) {
    foe.summonIn = def.summon.every;
    const cell = edgeFor(state);
    if (cell !== undefined) addFoe(state, def.summon.kind, cell);
  }
  if (foe.stun > 0) {
    foe.stun--;
    return;
  }
  if (foe.wind) {
    foe.wind.left--;
    if (foe.wind.left <= 0) {
      strike(state, foe);
      foe.wind = null;
    }
    return;
  }
  const toward = Math.sign(state.hero.pos - foe.pos);
  const pick = chooseAttack(state, foe);
  if (pick >= 0) {
    foe.wind = { attack: pick, left: def.attacks[pick].wind };
    state.events.push({ type: 'wind', uid: foe.uid });
    return;
  }
  if (def.keep && Math.abs(state.hero.pos - foe.pos) === 1 && step(state, foe, foe.pos - toward)) return;
  if (def.blink) {
    const behind = state.hero.pos - state.hero.face;
    if (empty(state, behind)) {
      foe.pos = behind;
      foe.face = Math.sign(state.hero.pos - behind);
      state.events.push({ type: 'blink', uid: foe.uid, cell: behind });
      return;
    }
  }
  if (toward && toward !== foe.face && !def.both) {
    foe.face = toward;
    state.events.push({ type: 'turn', uid: foe.uid });
    return;
  }
  if (def.both) foe.face = toward || foe.face;
  step(state, foe, foe.pos + toward);
}

function finishTurn(state, used) {
  for (const tile of state.tiles) tile.cd = Math.max(0, tile.cd - 1);
  for (const tile of used) tile.cd = tileCd(tile, state.blessings);
  for (const foe of state.foes.slice()) {
    if (state.foes.includes(foe) && state.hero.hp > 0) foeTurn(state, foe);
  }
  state.turn++;
  spawnDue(state);
  if (state.hero.hp <= 0) state.over = 'lose';
  else if (!state.foes.length && !state.waves.length) state.over = 'win';
}

// 어사의 한 수. 할 수 없는 수면 false를 돌려주고 아무것도 바꾸지 않는다.
//   { type: 'move', dir } | { type: 'turn' } | { type: 'queue', index } | { type: 'unleash' } | { type: 'wait' }
function act(state, action) {
  if (state.over) return false;
  state.events = [];
  const hero = state.hero;
  let used = [];
  if (action.type === 'move') {
    const to = hero.pos + action.dir;
    if (!empty(state, to)) return false;
    hero.pos = to;
    state.events.push({ type: 'heroMove', cell: to });
  } else if (action.type === 'turn') {
    hero.face = -hero.face;
    state.events.push({ type: 'heroTurn' });
  } else if (action.type === 'queue') {
    if (!canQueue(state, action.index)) return false;
    state.queue.push(action.index);
    state.events.push({ type: 'queue', index: action.index });
  } else if (action.type === 'unleash') {
    if (!state.queue.length) return false;
    used = state.queue.map((k) => state.tiles[k]);
    state.queue = [];
    state.events.push({ type: 'unleash' });
    for (const tile of used) useTile(state, tile);
  } else if (action.type !== 'wait') {
    return false;
  }
  finishTurn(state, used);
  return true;
}

function canQueue(state, index) {
  const tile = state.tiles[index];
  return Boolean(tile) && tile.cd === 0 && !state.queue.includes(index) && state.queue.length < state.queueMax;
}

// 화면이 칠할 위험한 칸: 칸마다 가장 먼저 떨어지는 공격의 남은 차례와 피해.
function danger(state) {
  const out = new Map();
  for (const foe of state.foes) {
    if (!foe.wind) continue;
    const attack = D.ENEMIES[foe.kind].attacks[foe.wind.attack];
    const left = foe.wind.left + foe.stun;
    for (const cell of attackCells(state, foe, attack)) {
      const was = out.get(cell);
      if (!was || left < was.left) out.set(cell, { left, dmg: attack.dmg });
    }
  }
  return out;
}

// 지금 출두하면 칠 칸. 쌓은 패를 사본 위에서 그대로 써 본다 — 축지법처럼 자리를 바꾸는 패가
// 끼면 뒤 패가 치는 칸도 바뀌기 때문이다.
function preview(state) {
  const copy = JSON.parse(JSON.stringify(state));
  copy.events = [];
  for (const k of copy.queue) useTile(copy, copy.tiles[k]);
  const out = new Set();
  for (const e of copy.events) if (e.type === 'aim') e.cells.forEach((c) => out.add(c));
  return { cells: out, hero: copy.hero };
}

const api = { create, act, canQueue, danger, preview, tileDmg, tileCd, attackCells };

if (node) module.exports = api;
root.AmhaengBattle = api;

})(typeof window !== 'undefined' ? window : globalThis);

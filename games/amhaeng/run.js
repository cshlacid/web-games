'use strict';

// 여정: 고을 셋을 차례로 지나며 싸우고, 주막에서 사고, 서낭당에서 복을 받는다. 화면을 만지지
// 않는다.
//
// **운은 여정에만 있다**(주막에 나오는 패, 우두머리 뒤에 고르는 패, 서낭당의 복). 씨앗을 여정에
// 넣어 두어, 저장했다 다시 열어도 같은 물건이 나온다 — 새로 고칠 때마다 물건이 바뀌면 새로
// 고침이 곧 다시 뽑기가 된다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.AmhaengData;

const HAND_MAX = 6;

function random(run) {
  run.rng = (run.rng + 0x6d2b79f5) >>> 0;
  let t = run.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickSome(run, list, n) {
  const pool = list.slice();
  const out = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(random(run) * pool.length), 1)[0]);
  return out;
}

function create(seed) {
  const run = {
    rng: seed >>> 0,
    region: 0,
    node: 0,
    hp: D.START_HP,
    maxHp: D.START_HP,
    coins: 0,
    tiles: D.START_TILES.map((id) => ({ id, lv: 0 })),
    blessings: [],
    phase: 'map',
    offers: [],
    fights: 0,
  };
  return run;
}

const nodeOf = (run) => D.REGIONS[run.region].nodes[run.node];

// 지금 자리에 들어간다. 싸움이면 싸움 자료를, 주막·서낭당이면 물건을 늘어놓는다.
function enter(run) {
  const here = nodeOf(run);
  if (here.type === 'fight' || here.type === 'boss') {
    run.phase = 'fight';
    return { waves: here.waves, hp: run.hp, maxHp: run.maxHp, tiles: run.tiles, blessings: run.blessings };
  }
  if (here.type === 'inn') {
    run.phase = 'inn';
    run.offers = pickSome(run, unowned(run), 2);
  } else {
    run.phase = 'shrine';
    run.offers = pickSome(run, D.BLESSINGS.filter((b) => !run.blessings.includes(b)), 3);
  }
  return null;
}

const unowned = (run) => Object.keys(D.TILES).filter((id) => !run.tiles.some((t) => t.id === id) && id !== 'mapae');

// 싸움이 끝났다. 이기면 체력을 이어받고 엽전을 받는다. 우두머리 뒤에는 패 하나를 고른다 —
// 셋째 고을 우두머리(마지막)는 고를 것 없이 여정이 끝난다.
function finishFight(run, battle) {
  if (battle.over !== 'win') {
    run.phase = 'over';
    return;
  }
  run.fights++;
  const boss = nodeOf(run).type === 'boss';
  run.hp = Math.min(run.maxHp, battle.hero.hp + D.REST + (run.blessings.includes('water') ? 1 : 0));
  run.coins += boss ? D.PAY.boss : D.PAY.fight;
  const last = run.region === D.REGIONS.length - 1 && boss;
  if (boss && !last) {
    // 첫 우두머리를 넘기면 마패가 나온다. 판을 뒤집는 패라 처음부터 주지 않는다.
    const pool = unowned(run).concat(run.region === 0 && !run.tiles.some((t) => t.id === 'mapae') ? ['mapae'] : []);
    run.offers = pickSome(run, pool, 3);
    run.phase = 'reward';
    return;
  }
  advance(run);
}

function advance(run) {
  run.offers = [];
  run.node++;
  if (run.node >= D.REGIONS[run.region].nodes.length) {
    run.region++;
    run.node = 0;
  }
  run.phase = run.region >= D.REGIONS.length ? 'won' : 'map';
}

function addTile(run, id) {
  if (run.tiles.length >= HAND_MAX || run.tiles.some((t) => t.id === id)) return false;
  run.tiles.push({ id, lv: 0 });
  return true;
}

// 우두머리 뒤 보상. 손이 가득 차 있으면 고르지 않고 지나갈 수 있다(null).
function takeReward(run, id) {
  if (run.phase !== 'reward') return false;
  if (id !== null && (!run.offers.includes(id) || !addTile(run, id))) return false;
  advance(run);
  return true;
}

function takeBlessing(run, id) {
  if (run.phase !== 'shrine' || !run.offers.includes(id)) return false;
  run.blessings.push(id);
  advance(run);
  return true;
}

// 주막. what: 'soup' | 'tonic' | 'forge'(index) | 'tile'(id)
function buy(run, what, arg) {
  if (run.phase !== 'inn') return false;
  const item = D.INN[what];
  if (!item || run.coins < item.cost) return false;
  if (what === 'soup') {
    if (run.hp >= run.maxHp) return false;
    run.hp = Math.min(run.maxHp, run.hp + item.heal);
  } else if (what === 'tonic') {
    run.maxHp += item.maxHp;
    run.hp += item.maxHp;
  } else if (what === 'forge') {
    const tile = run.tiles[arg];
    if (!tile || tile.lv >= 2) return false;
    tile.lv++;
  } else if (what === 'tile') {
    if (!run.offers.includes(arg) || !addTile(run, arg)) return false;
    run.offers = run.offers.filter((id) => id !== arg);
  }
  run.coins -= item.cost;
  return true;
}

function leaveInn(run) {
  if (run.phase !== 'inn') return false;
  advance(run);
  return true;
}

// 저장본에서 읽을 때: 모르는 값은 버리고 범위를 넘는 값은 자른다.
function adopt(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const run = create(Number(saved.rng) || 1);
  run.region = Math.max(0, Math.min(D.REGIONS.length, Number(saved.region) || 0));
  if (run.region >= D.REGIONS.length) return null;
  run.node = Math.max(0, Math.min(D.REGIONS[run.region].nodes.length - 1, Number(saved.node) || 0));
  run.maxHp = Math.max(1, Math.min(20, Number(saved.maxHp) || D.START_HP));
  run.hp = Math.max(1, Math.min(run.maxHp, Number(saved.hp) || run.maxHp));
  run.coins = Math.max(0, Math.min(999, Number(saved.coins) || 0));
  run.fights = Math.max(0, Number(saved.fights) || 0);
  const tiles = (Array.isArray(saved.tiles) ? saved.tiles : [])
    .filter((t) => t && D.TILES[t.id])
    .map((t) => ({ id: t.id, lv: Math.max(0, Math.min(2, Number(t.lv) || 0)) }));
  const seen = new Set();
  run.tiles = tiles.filter((t) => !seen.has(t.id) && seen.add(t.id)).slice(0, HAND_MAX);
  if (!run.tiles.length) run.tiles = D.START_TILES.map((id) => ({ id, lv: 0 }));
  run.blessings = [...new Set((saved.blessings || []).filter((b) => D.BLESSINGS.includes(b)))];
  // 싸움 도중에 닫았으면 그 싸움을 처음부터 다시 한다. 싸움 한가운데를 저장해 두면 나쁜 수를 둔
  // 뒤 다시 열어 되돌리는 길이 된다.
  const phase = ['map', 'inn', 'shrine', 'reward'].includes(saved.phase) ? saved.phase : 'map';
  run.phase = phase;
  const valid = phase === 'shrine' ? D.BLESSINGS : Object.keys(D.TILES);
  run.offers = (saved.offers || []).filter((o) => valid.includes(o)).slice(0, 3);
  return run;
}

const api = { HAND_MAX, create, nodeOf, enter, finishFight, advance, takeReward, takeBlessing, buy, leaveInn, adopt };

if (node) module.exports = api;
root.AmhaengRun = api;

})(typeof window !== 'undefined' ? window : globalThis);

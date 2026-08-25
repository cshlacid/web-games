'use strict';

// 화면과 입력. 전투 규칙은 logic.js, 동료 판단은 ai.js, 분배는 loot.js에 있고
// 여기서는 그리기와 누르기만 한다.
(function () {

const D = window.HealerData;
const L = window.HealerLogic;
const AI = window.HealerAI;
const Loot = window.HealerLoot;
const Sprites = window.HealerSprites;
const sound = window.HealerSound;

const $ = (id) => document.getElementById(id);
const el = (tag, cls) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
};

const app = {
  screen: 'quest',
  quest: null,
  party: [],
  skills: ['touch', 'quick', 'regen', 'ripple', 'focus'],
  battle: null,
  aiming: null,
  paused: false,
  result: null,
};

// --- 화면 전환 ---------------------------------------------------------

const SCREENS = {
  quest: { node: 'screen-quest', name: '퀘스트', note: '길드 게시판', back: null },
  party: { node: 'screen-party', name: '편성', note: '파티와 스킬을 정한다', back: 'quest' },
  battle: { node: 'screen-battle', name: '전투', note: '', back: null },
  result: { node: 'screen-result', name: '결과', note: '', back: null },
};

function show(name, note) {
  app.screen = name;
  for (const [key, screen] of Object.entries(SCREENS)) $(screen.node).hidden = key !== name;
  const screen = SCREENS[name];
  $('step-name').textContent = screen.name;
  $('step-note').textContent = note == null ? screen.note : note;
  $('step-back').hidden = !screen.back;
  $('step-back').dataset.to = screen.back || '';
}

$('step-back').addEventListener('click', () => {
  sound.play('click');
  const to = $('step-back').dataset.to;
  if (to === 'quest') openQuests();
});

// --- 퀘스트 선택 -------------------------------------------------------

function questSummary(quest) {
  const counts = {};
  for (const wave of quest.waves) {
    for (const id of wave) counts[id] = (counts[id] || 0) + 1;
  }
  return Object.entries(counts).map(([id, n]) => `${D.ENEMIES[id].name} ×${n}`);
}

function openQuests() {
  const list = $('quests');
  list.textContent = '';
  D.QUESTS.forEach((quest, i) => {
    const item = el('li');
    const button = el('button', 'quest');
    button.type = 'button';

    const title = el('div', 'quest-title');
    const name = el('b');
    name.textContent = quest.name;
    const tier = el('span', 'tier');
    tier.textContent = `${i + 1}단계 · ${quest.waves.length}웨이브`;
    title.append(name, tier);

    const desc = el('p', 'quest-desc');
    desc.textContent = quest.desc;

    const meta = el('div', 'quest-meta');
    for (const text of questSummary(quest)) {
      const tag = el('span', 'tag');
      tag.textContent = text;
      meta.append(tag);
    }
    const gold = el('span', 'tag gold');
    gold.textContent = `길드 보상 ${quest.guildReward.gold}골드`;
    meta.append(gold);

    button.append(title, desc, meta);
    button.addEventListener('click', () => {
      sound.play('click');
      openParty(quest);
    });
    item.append(button);
    list.append(item);
  });
  show('quest');
}

// --- 편성 --------------------------------------------------------------

function avatar(kind, cls) {
  const wrap = el('span', cls || 'avatar');
  wrap.innerHTML = Sprites.svg(kind);
  return wrap;
}

function jobTag(job) {
  const tag = el('span', `job ${job}`);
  tag.textContent = D.JOBS[job].name;
  return tag;
}

function renderRoster() {
  const list = $('roster');
  list.textContent = '';

  // 주인공은 빼거나 바꿀 수 없으므로 고정된 줄로 먼저 보여 준다.
  const heroItem = el('li');
  const heroRow = el('div', 'pick locked');
  heroRow.append(avatar('hero'));
  const heroBody = el('div', 'pick-body');
  const heroName = el('div', 'pick-name');
  heroName.append(document.createTextNode('주인공'), jobTag('healer'));
  const heroSub = el('div', 'pick-sub');
  heroSub.textContent = '내가 조작한다. 자동 공격은 하지 않는다.';
  heroBody.append(heroName, heroSub);
  heroRow.append(heroBody);
  heroItem.append(heroRow);
  list.append(heroItem);

  for (const def of Object.values(D.COMPANIONS)) {
    const picked = app.party.includes(def.id);
    const full = app.party.length >= D.PARTY_MAX - 1;

    const button = el('button', 'pick');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(picked));
    button.disabled = !picked && full;
    button.append(avatar(def.sprite));

    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(def.name), jobTag(def.job));
    const sub = el('div', 'pick-sub');
    sub.textContent = `체력 ${def.hp}${def.mp ? ` · 마나 ${def.mp}` : ''} · ${def.note}`;
    body.append(name, sub);
    button.append(body);

    button.addEventListener('click', () => {
      sound.play('click');
      if (picked) app.party = app.party.filter((id) => id !== def.id);
      else if (!full) app.party.push(def.id);
      renderRoster();
      updateStart();
    });

    const item = el('li');
    item.append(button);
    list.append(item);
  }
  $('party-count').textContent = `${app.party.length + 1} / ${D.PARTY_MAX}`;
}

function renderSkillPicks() {
  const list = $('skill-picks');
  list.textContent = '';

  for (const def of Object.values(D.PLAYER_SKILLS)) {
    const picked = app.skills.includes(def.id);
    const full = app.skills.length >= D.SKILL_MAX;

    const button = el('button', 'pick');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(picked));
    button.disabled = !picked && full;

    const icon = el('span', 'icon');
    icon.textContent = def.icon;
    button.append(icon);

    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    const type = el('span', 'job');
    type.textContent = def.type;
    name.append(document.createTextNode(def.name), type);
    const sub = el('div', 'pick-sub');
    sub.textContent = def.desc;
    body.append(name, sub);
    button.append(body);

    const cost = el('span', 'pick-cost');
    cost.textContent = `${def.mp ? `마나 ${def.mp}` : '마나 없음'}\n쿨 ${def.cd}초`;
    cost.style.whiteSpace = 'pre-line';
    button.append(cost);

    button.addEventListener('click', () => {
      sound.play('click');
      if (picked) app.skills = app.skills.filter((id) => id !== def.id);
      else if (!full) app.skills.push(def.id);
      renderSkillPicks();
      updateStart();
    });

    const item = el('li');
    item.append(button);
    list.append(item);
  }
  $('skill-count').textContent = `${app.skills.length} / ${D.SKILL_MAX}`;
}

function updateStart() {
  $('start').disabled = app.skills.length === 0;
}

function openParty(quest) {
  app.quest = quest;
  renderRoster();
  renderSkillPicks();
  updateStart();
  show('party', quest.name);
}

$('start').addEventListener('click', () => {
  sound.play('click');
  startBattle();
});

// --- 전투 그리기 -------------------------------------------------------

const field = $('field');
const unitNodes = new Map();
const zoneNodes = new Map();

const pctX = (x) => (x / D.FIELD.w) * 100;
const pctY = (y) => (y / D.FIELD.h) * 100;

function makeUnitNode(unit) {
  const node = el('div', `unit ${unit.side}`);
  if (unit.uid === L.HERO_UID) node.classList.add('is-hero');
  node.dataset.uid = unit.uid;
  node.innerHTML = Sprites.svg(unit.sprite);

  const bar = el('div', 'hpbar');
  bar.append(el('span'));
  node.append(bar);

  const tag = el('div', 'tag-name');
  tag.textContent = unit.name;
  node.append(tag);

  field.append(node);
  unitNodes.set(unit.uid, node);
  return node;
}

function syncUnits(state) {
  for (const unit of state.units) {
    const node = unitNodes.get(unit.uid) || makeUnitNode(unit);
    node.style.left = `${pctX(unit.x)}%`;
    node.style.top = `${pctY(unit.y)}%`;
    node.classList.toggle('dead', unit.dead);
    node.classList.toggle('low', unit.hp / unit.maxHp <= 0.3);
    node.querySelector('.hpbar span').style.width = `${(unit.hp / unit.maxHp) * 100}%`;
    node.classList.toggle('valid', Boolean(app.aiming) && isValidUnitTarget(unit));
  }
}

function syncZones(state) {
  const seen = new Set();
  for (const zone of state.zones) {
    seen.add(zone.id);
    let node = zoneNodes.get(zone.id);
    if (!node) {
      node = el('div', `zone ${zone.kind === 'heal' ? '' : 'damage'}`);
      node.style.left = `${pctX(zone.x)}%`;
      node.style.top = `${pctY(zone.y)}%`;
      node.style.width = `${pctX(zone.radius * 2)}%`;
      node.style.height = `${pctY(zone.radius * 2)}%`;
      field.append(node);
      zoneNodes.set(zone.id, node);
    }
  }
  for (const [id, node] of zoneNodes) {
    if (seen.has(id)) continue;
    node.remove();
    zoneNodes.delete(id);
  }
}

function floatText(unit, text, cls) {
  const node = el('div', `float ${cls}`);
  node.textContent = text;
  node.style.left = `${pctX(unit.x)}%`;
  node.style.top = `${pctY(unit.y) - 6}%`;
  field.append(node);
  node.addEventListener('animationend', () => node.remove());
}

function pulse(x, y, radius, cls) {
  const node = el('div', `pulse ${cls}`);
  node.style.left = `${pctX(x)}%`;
  node.style.top = `${pctY(y)}%`;
  node.style.width = `${pctX(radius * 2)}%`;
  node.style.height = `${pctY(radius * 2)}%`;
  field.append(node);
  node.addEventListener('animationend', () => node.remove());
}

function renderPortraits(state) {
  const list = $('portraits');
  list.textContent = '';
  for (const unit of state.units.filter((u) => u.side === 'ally')) {
    const button = el('button', 'portrait');
    button.type = 'button';
    button.dataset.uid = unit.uid;
    if (unit.uid === L.HERO_UID) button.classList.add('is-hero');
    button.append(avatar(unit.sprite));

    const name = el('span', 'pname');
    name.textContent = unit.name;
    button.append(name);

    const hp = el('div', 'bar');
    hp.append(el('span'));
    button.append(hp);

    button.addEventListener('click', () => onPortrait(unit.uid));
    const item = el('li');
    item.append(button);
    list.append(item);
  }
}

function syncPortraits(state) {
  for (const item of $('portraits').children) {
    const button = item.firstElementChild;
    const unit = AI.byUid(state, button.dataset.uid);
    const bar = button.querySelector('.bar');
    bar.firstElementChild.style.width = `${(unit.hp / unit.maxHp) * 100}%`;
    bar.classList.toggle('low', unit.hp / unit.maxHp <= 0.3);
    button.classList.toggle('dead', unit.dead);
    button.classList.toggle('valid', Boolean(app.aiming) && isValidUnitTarget(unit));
  }
}

function renderSkillbar() {
  const bar = $('skillbar');
  bar.textContent = '';

  for (const id of app.skills) {
    const def = D.PLAYER_SKILLS[id];
    const button = el('button', 'slot');
    button.type = 'button';
    button.dataset.skill = id;
    button.setAttribute('aria-pressed', 'false');

    const glyph = el('span', 'glyph');
    glyph.textContent = def.icon;
    const name = el('span', 'sname');
    name.textContent = def.name;
    const cost = el('span', 'cost');
    cost.textContent = def.mp ? `${def.mp}` : '－';
    const cool = el('div', 'cool');
    cool.style.transform = 'scaleY(0)';

    button.append(glyph, name, cost, cool);
    button.addEventListener('click', () => onSkill(id));
    bar.append(button);
  }

  // 물약은 스킬이 아니라 아이템이지만 손이 가는 자리는 같아야 한다.
  const potion = el('button', 'slot');
  potion.type = 'button';
  potion.dataset.potion = '1';
  const glyph = el('span', 'glyph');
  glyph.textContent = D.POTION.icon;
  const name = el('span', 'sname');
  name.textContent = D.POTION.name;
  const cost = el('span', 'cost');
  cost.textContent = `×${D.POTION.count}`;
  const cool = el('div', 'cool');
  cool.style.transform = 'scaleY(0)';
  potion.append(glyph, name, cost, cool);
  potion.addEventListener('click', onPotion);
  bar.append(potion);
}

function syncSkillbar(state) {
  const hero = L.hero(state);
  for (const button of $('skillbar').children) {
    const cool = button.querySelector('.cool');
    if (button.dataset.potion) {
      const left = Math.max(0, state.potionReadyAt - state.t);
      cool.style.transform = `scaleY(${left / D.POTION.cd})`;
      button.querySelector('.cost').textContent = `×${state.potions}`;
      button.classList.toggle('short', state.potions === 0);
      continue;
    }
    const def = D.PLAYER_SKILLS[button.dataset.skill];
    const slot = L.skillSlot(state, button.dataset.skill);
    const left = Math.max(0, slot.readyAt - state.t);
    cool.style.transform = `scaleY(${left / def.cd})`;
    button.classList.toggle('short', hero.mp < def.mp);
    button.setAttribute('aria-pressed', String(app.aiming === def.id));
  }

  const ratio = (hero.mp / hero.maxMp) * 100;
  $('hero-mp-fill').style.width = `${ratio}%`;
  $('hero-mp-text').textContent = `마나 ${Math.round(hero.mp)} / ${hero.maxMp}`;
}

// --- 조준과 조작 -------------------------------------------------------

const AIM_HINT = {
  ally: '회복할 대상을 고른다 — 초상화나 전투 화면의 아군',
  enemy: '적을 고른다',
  'area-ally': '기준점을 고른다 — 동료 초상화 또는 전투 화면의 위치',
  'area-enemy': '기준점을 고른다 — 전투 화면의 위치',
};

function isValidUnitTarget(unit) {
  if (!app.aiming || unit.dead) return false;
  const def = D.PLAYER_SKILLS[app.aiming];
  if (def.targeting === 'ally' || def.targeting === 'area-ally') return unit.side === 'ally';
  if (def.targeting === 'enemy' || def.targeting === 'area-enemy') return unit.side === 'enemy';
  return false;
}

function setAiming(skillId) {
  app.aiming = skillId;
  const def = skillId ? D.PLAYER_SKILLS[skillId] : null;
  field.classList.toggle('aiming', Boolean(skillId));
  document.body.classList.toggle('aiming-mode', Boolean(skillId));
  $('aim-hint').hidden = !def;
  if (def) $('aim-hint').textContent = `${def.name} — ${AIM_HINT[def.targeting]}`;
  if (!def) $('aim').hidden = true;
}

function onSkill(skillId) {
  const state = app.battle;
  if (!state || state.status !== 'fighting') return;
  const def = D.PLAYER_SKILLS[skillId];

  if (app.aiming === skillId) { sound.play('click'); setAiming(null); return; }

  // 대상이 필요 없는 스킬은 조준 단계 없이 바로 나간다. 한 번 더 누르게 하면
  // 마나가 급할 때 손이 늦는다.
  if (def.targeting === 'self') { cast(skillId, {}); return; }

  const slot = L.skillSlot(state, skillId);
  if (state.t < slot.readyAt || L.hero(state).mp < def.mp) { sound.play('deny'); return; }
  sound.play('click');
  setAiming(skillId);
}

function onPotion() {
  const state = app.battle;
  if (!state) return;
  const result = L.usePotion(state);
  sound.play(result.ok ? 'mana' : 'deny');
  if (!result.ok) note(result.reason);
}

function onPortrait(uid) {
  const state = app.battle;
  if (!state || !app.aiming) { sound.play('click'); return; }
  cast(app.aiming, { uid });
}

function cast(skillId, target) {
  const state = app.battle;
  const def = D.PLAYER_SKILLS[skillId];
  const result = L.castSkill(state, skillId, target);
  if (!result.ok) {
    sound.play('deny');
    note(result.reason);
    return;
  }
  setAiming(null);
  if (def.mana) sound.play('mana');
  else if (def.targeting === 'enemy' || def.targeting === 'area-enemy') sound.play('strike');
  else if (def.radius && def.tick) sound.play('zone');
  else if (def.radius) sound.play('area');
  else sound.play('heal');
}

// 화면을 누른 곳을 전투 좌표로. 아군을 겨냥하는 개별 대상 스킬은 정확히 그림
// 위를 눌러야 하면 손가락으로는 거의 맞지 않아, 가까운 대상을 집어 준다.
const SNAP = 12;

field.addEventListener('pointerdown', (event) => {
  sound.unlock();
  const state = app.battle;
  if (!state || state.status !== 'fighting' || !app.aiming) return;

  const rect = field.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * D.FIELD.w;
  const y = ((event.clientY - rect.top) / rect.height) * D.FIELD.h;
  const def = D.PLAYER_SKILLS[app.aiming];

  if (def.targeting === 'area-ally' || def.targeting === 'area-enemy') {
    cast(app.aiming, { x, y });
    return;
  }

  const side = def.targeting === 'ally' ? 'ally' : 'enemy';
  const candidates = AI.alive(state, side);
  const pick = AI.nearest({ x, y }, candidates);
  if (!pick || AI.dist(pick, { x, y }) > SNAP) {
    sound.play('deny');
    note('대상을 정확히 누른다');
    return;
  }
  cast(app.aiming, { uid: pick.uid });
});

// 범위·장판이 어디까지 닿는지 미리 보여 준다. 마우스에서만 의미가 있고,
// 손가락은 누르는 순간이 곧 발동이라 미리 보기가 없다.
field.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  const def = app.aiming ? D.PLAYER_SKILLS[app.aiming] : null;
  const aim = $('aim');
  if (!def || !def.radius) { aim.hidden = true; return; }
  const rect = field.getBoundingClientRect();
  aim.hidden = false;
  aim.style.left = `${((event.clientX - rect.left) / rect.width) * 100}%`;
  aim.style.top = `${((event.clientY - rect.top) / rect.height) * 100}%`;
  aim.style.width = `${pctX(def.radius * 2)}%`;
  aim.style.height = `${pctY(def.radius * 2)}%`;
});

field.addEventListener('pointerleave', () => { $('aim').hidden = true; });

function note(text) {
  $('log').textContent = text;
}

// --- 전투 진행 ---------------------------------------------------------

let raf = 0;
let lastFrame = 0;

const CAST_SFX = { ripple: 'area', sanctuary: 'zone', pyre: 'zone', flame: 'strike', focus: 'mana' };

function handleEvents(state, events) {
  for (const event of events) {
    if (event.type === 'damage' || event.type === 'heal') {
      const unit = AI.byUid(state, event.uid);
      if (unit && event.amount > 0) {
        const heal = event.type === 'heal';
        floatText(unit, `${heal ? '+' : '−'}${event.amount}`, heal ? 'heal' : 'harm');
      }
      continue;
    }
    if (event.type === 'cast') {
      if (event.skillId) {
        if (event.radius) pulse(event.x, event.y, event.radius,
          event.skillId === 'pyre' ? 'harm' : '');
      } else {
        // 동료가 쓴 스킬은 화면에 글자로만 알린다. 소리까지 겹치면 내 조작음이 묻힌다.
        note(event.text);
      }
      continue;
    }
    if (event.type === 'death') {
      note(event.text);
      if (event.side === 'ally') sound.play('down');
      continue;
    }
    if (event.type === 'wave') {
      note(event.text);
      sound.play('wave');
      $('wave').textContent = `${event.index + 1} / ${event.total}`;
      renderPortraits(state);
      continue;
    }
    if (event.type === 'end') {
      sound.play(event.result === 'won' ? 'win' : 'lose');
    }
  }
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  const state = app.battle;
  if (!state) return;

  const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;

  if (!app.paused) L.advance(state, dt);
  handleEvents(state, L.drainEvents(state));
  syncUnits(state);
  syncZones(state);
  syncPortraits(state);
  syncSkillbar(state);

  if (state.status !== 'fighting') finishBattle(state);
}

function startBattle() {
  field.querySelectorAll('.unit, .zone, .float, .pulse').forEach((node) => node.remove());
  unitNodes.clear();
  zoneNodes.clear();

  app.battle = L.createBattle({
    quest: app.quest,
    party: app.party,
    skills: app.skills,
    seed: (Math.random() * 1e9) | 0,
  });
  app.lootSeed = (Math.random() * 1e9) | 0;

  setAiming(null);
  renderPortraits(app.battle);
  renderSkillbar();
  $('wave').textContent = `1 / ${app.quest.waves.length}`;
  note('');
  show('battle', app.quest.name);

  L.drainEvents(app.battle);
  lastFrame = 0;
  app.paused = false;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function finishBattle(state) {
  cancelAnimationFrame(raf);
  raf = 0;
  app.battle = null;
  setAiming(null);
  openResult(state);
}

// 탭이 뒤로 가면 프레임이 멈추므로 돌아왔을 때 큰 dt가 한 번에 들어온다.
// logic.advance가 0.25초로 자르지만, 아예 멈춰 두는 편이 정직하다.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) app.paused = true;
  else if ($('help').hidden) app.paused = false;
  lastFrame = 0;
});

// --- 결과와 분배 -------------------------------------------------------

function partyMembers(state) {
  return state.units.filter((u) => u.side === 'ally').map((u) => ({
    id: u.uid, name: u.name, job: u.job, sprite: u.sprite,
  }));
}

function itemRow(itemId) {
  const item = D.ITEMS[itemId];
  const row = el('li');
  const icon = el('span');
  icon.textContent = item.icon;
  const name = el('span');
  name.textContent = item.name;
  row.append(icon, name);
  if (item.job) {
    const tag = el('span', 'why');
    tag.textContent = `${D.JOBS[item.job].name}용`;
    row.append(tag);
  }
  return row;
}

function renderAwards() {
  const { drops, members, method, seed } = app.result;
  const result = Loot.distribute(drops, members, method, seed);
  const list = $('awards');
  list.textContent = '';

  for (const award of result.awards) {
    const item = D.ITEMS[award.itemId];
    const owner = members.find((m) => m.id === award.toId);
    const row = el('li');

    const icon = el('span');
    icon.textContent = item.icon;
    const name = el('span');
    name.textContent = item.name;
    const why = el('span', 'why');
    why.textContent = award.reason;
    const to = el('span', 'to');
    to.textContent = owner.name;
    row.append(icon, name, why, to);

    if (award.rolls) {
      const rolls = el('span', 'rolls');
      rolls.textContent = award.rolls.map((r) => `${r.name} ${r.roll}`).join(' · ');
      row.append(rolls);
    }
    list.append(row);
  }

  for (const button of $('methods').children) {
    button.setAttribute('aria-pressed', String(button.dataset.method === method));
  }
}

function renderMethods() {
  const box = $('methods');
  box.textContent = '';
  for (const method of Object.values(Loot.METHODS)) {
    const button = el('button', 'method');
    button.type = 'button';
    button.dataset.method = method.id;
    const name = el('b');
    name.textContent = method.name;
    const desc = el('small');
    desc.textContent = method.desc;
    button.append(name, desc);
    button.addEventListener('click', () => {
      sound.play('click');
      app.result.method = method.id;
      renderAwards();
    });
    box.append(button);
  }
}

function openResult(state) {
  const won = state.status === 'won';
  const quest = state.quest;
  const members = partyMembers(state);

  $('verdict').textContent = won ? '퀘스트 완료' : '퀘스트 실패';
  $('verdict').className = `verdict ${won ? 'won' : 'lost'}`;

  const stats = state.stats;
  const survived = members.filter((m) => !AI.byUid(state, m.id).dead).length;
  $('verdict-note').textContent = won
    ? `${Math.round(state.t)}초 · 회복 ${Math.round(stats.healed)} (흘린 힐 ${Math.round(stats.overheal)})`
      + ` · 스킬 ${stats.casts}회 · 생존 ${survived}/${members.length}`
    : `${Math.round(state.t)}초까지 버텼다 · 회복 ${Math.round(stats.healed)} · 스킬 ${stats.casts}회`;

  $('guild-panel').hidden = !won;
  $('drop-panel').hidden = !won;

  if (won) {
    const guild = $('guild-loot');
    guild.textContent = '';
    const gold = el('li');
    const goldIcon = el('span');
    goldIcon.textContent = '🪙';
    const goldName = el('span');
    goldName.textContent = `${quest.guildReward.gold} 골드`;
    gold.append(goldIcon, goldName);
    guild.append(gold);
    for (const itemId of quest.guildReward.items) guild.append(itemRow(itemId));

    app.result = {
      drops: Loot.rollDrops(quest, app.lootSeed),
      members,
      method: app.result ? app.result.method : 'even',
      seed: app.lootSeed,
    };
    renderMethods();
    renderAwards();
  }

  show('result', quest.name);
}

$('retry').addEventListener('click', () => {
  sound.play('click');
  startBattle();
});

$('to-quests').addEventListener('click', () => {
  sound.play('click');
  openQuests();
});

// --- 소리와 도움말 -----------------------------------------------------

function bindToggle(id, key, setter) {
  const button = $(id);
  button.setAttribute('aria-pressed', String(sound.prefs[key]));
  button.addEventListener('click', () => {
    const next = !sound.prefs[key];
    setter(next);
    button.setAttribute('aria-pressed', String(next));
    if (key === 'sfx' && next) sound.play('click');
  });
}

bindToggle('toggle-bgm', 'bgm', (on) => sound.setBgm(on));
bindToggle('toggle-sfx', 'sfx', (on) => sound.setSfx(on));

$('help-open').addEventListener('click', () => {
  sound.unlock();
  sound.play('click');
  $('help').hidden = false;
  $('help-open').setAttribute('aria-pressed', 'true');
  // 실시간 전투 중에 규칙을 읽는 동안 파티가 죽어 있으면 안 된다.
  app.paused = true;
});

$('help-close').addEventListener('click', () => {
  sound.play('click');
  $('help').hidden = true;
  $('help-open').setAttribute('aria-pressed', 'false');
  app.paused = false;
  lastFrame = 0;
});

document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

openQuests();

})();

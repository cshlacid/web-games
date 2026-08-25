'use strict';

// 화면과 입력. 규칙은 다른 파일에 있다 — 전투는 logic.js, 동료 판단은 ai.js,
// 성장과 장비는 progress.js, 의뢰 생성은 quests.js, 분배는 loot.js.
// 여기서는 그리기와 누르기만 한다.
(function () {

const D = window.HealerData;
const L = window.HealerLogic;
const AI = window.HealerAI;
const Loot = window.HealerLoot;
const P = window.HealerProgress;
const Q = window.HealerQuests;
const Sprites = window.HealerSprites;
const Scenes = window.HealerScenes;
const sound = window.HealerSound;

const $ = (id) => document.getElementById(id);
const el = (tag, cls) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
};
const text = (tag, cls, value) => {
  const node = el(tag, cls);
  node.textContent = value;
  return node;
};

const app = {
  screen: 'home',
  tab: 'quest',
  progress: P.load(),
  quests: [],
  quest: null,
  candidates: [],
  party: [],
  skills: [],
  lootMethod: 'even',
  battle: null,
  aiming: null,
  paused: false,
  result: null,
};

function persist() {
  P.save(app.progress);
}

// --- 화면 전환 ---------------------------------------------------------

const SCREENS = {
  home: { node: 'screen-home', name: '길드', note: '', back: null, tabs: true },
  party: { node: 'screen-party', name: '편성', note: '파티와 스킬을 정한다', back: 'home' },
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
  $('tabbar').hidden = !screen.tabs;
}

$('step-back').addEventListener('click', () => {
  sound.play('click');
  openHome();
});

function openHome(tab) {
  if (tab) app.tab = tab;
  $('tab-quest').hidden = app.tab !== 'quest';
  $('tab-character').hidden = app.tab !== 'character';
  for (const button of $('tabbar').children) {
    button.setAttribute('aria-pressed', String(button.dataset.tab === app.tab));
  }
  if (app.tab === 'quest') renderQuests();
  else renderCharacter();
  show('home', app.tab === 'quest' ? '의뢰 게시판' : `캐릭터 Lv ${app.progress.charLevel}`);
}

for (const button of $('tabbar').children) {
  button.addEventListener('click', () => {
    sound.play('click');
    openHome(button.dataset.tab);
  });
}

// --- 퀘스트 게시판 -----------------------------------------------------

function refreshQuests() {
  app.quests = Q.generate(app.progress.charLevel, app.progress.questSeed);
}

function enemyCounts(quest) {
  const counts = {};
  for (const wave of quest.waves) {
    for (const id of wave) counts[id] = (counts[id] || 0) + 1;
  }
  return Object.entries(counts).map(([id, n]) => `${D.ENEMIES[id].name} ×${n}`);
}

// 적정 레벨과 내 레벨의 차이. 숫자만 보여 주면 그것이 쉬운지 어려운지를 매번
// 머리로 빼야 한다.
function difficultyOf(quest) {
  const gap = quest.level - app.progress.charLevel;
  if (gap <= -2) return { cls: 'easy', label: '쉬움' };
  if (gap <= 1) return { cls: 'fair', label: '알맞음' };
  if (gap <= 3) return { cls: 'hard', label: '벅참' };
  return { cls: 'deadly', label: '위험' };
}

function renderQuests() {
  if (!app.quests.length) refreshQuests();
  const list = $('quests');
  list.textContent = '';

  for (const quest of app.quests) {
    const mood = difficultyOf(quest);
    const button = el('button', 'quest');
    button.type = 'button';

    const title = el('div', 'quest-title');
    title.append(text('b', null, quest.name));
    title.append(text('span', `level ${mood.cls}`, `Lv ${quest.level} · ${mood.label}`));
    button.append(title);

    button.append(text('p', 'quest-desc', quest.desc));

    const meta = el('div', 'quest-meta');
    meta.append(text('span', 'tag place', Scenes.SCENES[quest.scene].name));
    for (const label of enemyCounts(quest)) meta.append(text('span', 'tag', label));
    meta.append(text('span', 'tag gold', `${quest.guildReward.gold} 골드 · ${quest.guildReward.exp} exp`));
    meta.append(text('span', 'tag', `전리품 ${quest.drops.length}`));
    button.append(meta);

    button.addEventListener('click', () => {
      sound.play('click');
      openParty(quest);
    });

    const item = el('li');
    item.append(button);
    list.append(item);
  }
}

$('refresh').addEventListener('click', () => {
  sound.play('click');
  app.progress.questSeed = (Math.random() * 1e9) | 0;
  persist();
  refreshQuests();
  renderQuests();
});

// --- 캐릭터 -----------------------------------------------------------

function levelRow(label, level, exp, toNext) {
  const row = el('li', 'level-row');
  row.append(text('b', null, label));
  row.append(text('span', 'lv', `Lv ${level}`));
  const bar = el('div', 'bar exp');
  const fill = el('span');
  fill.style.width = `${toNext ? Math.min(100, (exp / toNext) * 100) : 100}%`;
  bar.append(fill);
  row.append(bar);
  row.append(text('small', null, toNext ? `${exp} / ${toNext}` : '최대'));
  return row;
}

const STAT_LABELS = {
  hp: '최대 체력',
  mp: '최대 마나',
  heal: '회복력',
  armor: '받는 피해',
};

function statText(key, value) {
  if (key === 'heal') return `×${value.toFixed(2)}`;
  if (key === 'armor') return `×${value.toFixed(2)}`;
  return String(Math.round(value));
}

function renderCharacter() {
  const progress = app.progress;
  const stats = P.stats(progress);
  const max = progress.charLevel >= D.LEVEL.maxLevel;

  $('char-gold').textContent = `${progress.gold} 골드`;

  const levels = $('char-levels');
  levels.textContent = '';
  levels.append(levelRow('캐릭터', progress.charLevel, progress.charExp,
    max ? 0 : D.LEVEL.charExpTo(progress.charLevel)));
  levels.append(levelRow('힐러', progress.jobLevel, progress.jobExp,
    progress.jobLevel >= D.LEVEL.maxLevel ? 0 : D.LEVEL.jobExpTo(progress.jobLevel)));

  const statList = $('char-stats');
  statList.textContent = '';
  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const row = el('li');
    row.append(text('span', null, label));
    row.append(text('b', 'stat-value', statText(key, stats[key])));
    statList.append(row);
  }

  const slots = $('char-slots');
  slots.textContent = '';
  for (const slot of Object.values(D.SLOTS)) {
    const item = progress.equipped[slot.id];
    const button = el('button', 'slot-row');
    button.type = 'button';
    button.disabled = !item;
    button.append(text('span', 'slot-name', slot.name));
    if (item) {
      button.append(text('span', 'icon', D.GEAR[item.defId].icon));
      button.append(text('span', 'item-name', D.itemName(item)));
      button.append(text('span', 'why', statSummary(D.gearStats(item.defId, item.tier))));
    } else {
      button.append(text('span', 'item-name empty', '비어 있음'));
    }
    button.addEventListener('click', () => {
      sound.play('click');
      P.unequip(progress, slot.id);
      persist();
      renderCharacter();
    });
    const row = el('li');
    row.append(button);
    slots.append(row);
  }

  renderInventory();

  const skills = $('char-skills');
  skills.textContent = '';
  const open = new Set(P.unlockedSkills(progress).map((def) => def.id));
  for (const def of Object.values(D.PLAYER_SKILLS)) {
    const row = el('li', open.has(def.id) ? 'skill-row' : 'skill-row locked');
    row.append(text('span', 'icon', open.has(def.id) ? def.icon : '🔒'));
    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(def.name));
    name.append(text('span', 'job', def.type));
    body.append(name);
    body.append(text('div', 'pick-sub', open.has(def.id) ? def.desc : `힐러 Lv ${def.unlock}에 열린다`));
    row.append(body);
    skills.append(row);
  }
  $('skill-open').textContent = `${open.size} / ${Object.keys(D.PLAYER_SKILLS).length}`;
}

function statSummary(bonus) {
  const parts = [];
  for (const [key, value] of Object.entries(bonus)) {
    if (key === 'heal') parts.push(`회복 +${Math.round(value * 100)}%`);
    else if (key === 'armor') parts.push(`피해 ${Math.round(value * 100)}%`);
    else if (key === 'hp') parts.push(`체력 +${Math.round(value)}`);
    else if (key === 'mp') parts.push(`마나 +${Math.round(value)}`);
  }
  return parts.join(' · ');
}

// 지금 낀 것과 견준 차이. 이걸 보여 주지 않으면 갈아 끼울지 말지를 매번 머리로
// 계산해야 하고, 결국 아무도 계산하지 않는다.
function diffSummary(diff) {
  const parts = [];
  for (const [key, value] of Object.entries(diff)) {
    const sign = value > 0 ? '+' : '';
    if (key === 'heal') parts.push(`회복 ${sign}${Math.round(value * 100)}%`);
    else if (key === 'armor') parts.push(`피해 ${sign}${Math.round(value * 100)}%`);
    else if (key === 'hp') parts.push(`체력 ${sign}${Math.round(value)}`);
    else if (key === 'mp') parts.push(`마나 ${sign}${Math.round(value)}`);
  }
  return parts.length ? parts.join(' · ') : '차이 없음';
}

function itemButton(item, index, onEquip) {
  const def = D.GEAR[item.defId];
  const compare = P.compare(app.progress, item);
  // 한 수치라도 오르면 좋은 것으로 치면 거의 모든 물건에 표시가 붙는다.
  // 잃는 것 없이 오르기만 할 때만 표시한다 — 표시가 붙은 줄만 눌러 보면 되게.
  const changes = Object.entries(compare.diff)
    .map(([key, value]) => (key === 'armor' ? -value : value));
  const better = changes.some((v) => v > 0) && !changes.some((v) => v < 0);

  const button = el('button', `item ${better ? 'better' : ''}`);
  button.type = 'button';
  button.append(text('span', 'icon', def.icon));
  const body = el('div', 'pick-body');
  const name = el('div', 'pick-name');
  name.append(document.createTextNode(D.itemName(item)));
  name.append(text('span', 'job', D.SLOTS[def.slot].name));
  body.append(name);
  body.append(text('div', 'pick-sub', diffSummary(compare.diff)));
  button.append(body);
  button.append(text('span', 'pick-cost', '장착'));
  button.addEventListener('click', () => onEquip(index));
  return button;
}

function renderInventory() {
  const list = $('inventory');
  list.textContent = '';
  $('inv-count').textContent = String(app.progress.inventory.length);

  if (!app.progress.inventory.length) {
    list.append(text('li', 'empty-note', '아직 없다. 의뢰를 받아 오면 쌓인다.'));
    return;
  }

  app.progress.inventory.forEach((item, index) => {
    const row = el('li');
    row.append(itemButton(item, index, (i) => {
      sound.play('click');
      P.equip(app.progress, i);
      persist();
      renderCharacter();
    }));
    list.append(row);
  });
}

// --- 편성 --------------------------------------------------------------

function avatar(kind) {
  const wrap = el('span', 'avatar');
  wrap.innerHTML = Sprites.svg(kind);
  return wrap;
}

function jobTag(job) {
  return text('span', `job ${job}`, D.JOBS[job].name);
}

function renderBrief() {
  const quest = app.quest;
  const brief = $('quest-brief');
  brief.textContent = '';
  const head = el('div', 'panel-head');
  head.append(text('h2', null, quest.name));
  head.append(text('span', `count level ${difficultyOf(quest).cls}`, `Lv ${quest.level}`));
  brief.append(head);
  brief.append(text('p', 'panel-note',
    `${Scenes.SCENES[quest.scene].name} · ${quest.waves.length}개 무리 · `
    + `완료 시 ${quest.guildReward.gold} 골드와 ${quest.guildReward.exp} exp`));
  const meta = el('div', 'quest-meta');
  for (const label of enemyCounts(quest)) meta.append(text('span', 'tag', label));
  brief.append(meta);
}

function renderRoster() {
  const list = $('roster');
  list.textContent = '';

  // 주인공은 빼거나 바꿀 수 없으므로 고정된 줄로 먼저 보여 준다.
  const heroRow = el('div', 'pick locked');
  heroRow.append(avatar('hero'));
  const heroBody = el('div', 'pick-body');
  const heroName = el('div', 'pick-name');
  heroName.append(document.createTextNode(`주인공 Lv ${app.progress.charLevel}`));
  heroName.append(jobTag('healer'));
  heroBody.append(heroName);
  const stats = P.stats(app.progress);
  heroBody.append(text('div', 'pick-sub',
    `체력 ${stats.hp} · 마나 ${stats.mp} · 회복력 ×${stats.heal.toFixed(2)}`));
  heroRow.append(heroBody);
  const heroItem = el('li');
  heroItem.append(heroRow);
  list.append(heroItem);

  for (const entry of app.candidates) {
    const def = D.COMPANIONS[entry.defId];
    const picked = app.party.some((p) => p.defId === entry.defId);
    const full = app.party.length >= D.PARTY_MAX - 1;

    const button = el('button', 'pick');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(picked));
    button.disabled = !picked && full;
    button.append(avatar(def.sprite));

    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(`${def.name} Lv ${entry.level}`));
    name.append(jobTag(def.job));
    body.append(name);
    body.append(text('div', 'pick-sub', def.note));

    // 무엇을 들고 오는지 보여 준다. 같은 동료라도 레벨에 따라 스킬이 다르므로
    // 이것을 보지 않으면 편성이 이름 고르기가 된다.
    const skills = el('div', 'skill-chips');
    for (const id of entry.skills) {
      const skill = D.UNIT_SKILLS[id];
      const chip = text('span', 'chip', skill.name);
      chip.title = skill.desc;
      skills.append(chip);
    }
    if (!entry.skills.length) skills.append(text('span', 'chip dim', '스킬 없음'));
    body.append(skills);
    button.append(body);

    button.addEventListener('click', () => {
      sound.play('click');
      if (picked) app.party = app.party.filter((p) => p.defId !== entry.defId);
      else if (!full) app.party.push(entry);
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

  for (const def of P.unlockedSkills(app.progress)) {
    const picked = app.skills.includes(def.id);
    const full = app.skills.length >= D.SKILL_MAX;

    const button = el('button', 'pick');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(picked));
    button.disabled = !picked && full;
    button.append(text('span', 'icon', def.icon));

    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(def.name));
    name.append(text('span', 'job', def.type));
    body.append(name);
    body.append(text('div', 'pick-sub', def.desc));
    button.append(body);

    const cost = text('span', 'pick-cost', `${def.mp ? `마나 ${def.mp}` : '마나 없음'}\n쿨 ${def.cd}초`);
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

// 분배 방식은 전투 전에 정한다. 결과를 보고 고르게 두면 유리한 쪽으로만 고르게 되고,
// 파티가 미리 합의한다는 이 시스템의 뜻이 사라진다.
function renderMethods() {
  const box = $('methods');
  box.textContent = '';
  for (const method of Object.values(Loot.METHODS)) {
    const button = el('button', 'method');
    button.type = 'button';
    button.dataset.method = method.id;
    button.setAttribute('aria-pressed', String(app.lootMethod === method.id));
    button.append(text('b', null, method.name));
    button.append(text('small', null, method.desc));
    button.addEventListener('click', () => {
      sound.play('click');
      app.lootMethod = method.id;
      renderMethods();
    });
    box.append(button);
  }
}

function updateStart() {
  $('start').disabled = app.skills.length === 0;
}

function openParty(quest) {
  app.quest = quest;
  app.candidates = Q.companionsFor(quest, app.progress.questSeed + quest.level);
  app.party = [];
  app.skills = P.validSkills(app.progress, app.skills.length
    ? app.skills
    : P.unlockedSkills(app.progress).map((def) => def.id));

  renderBrief();
  renderRoster();
  renderSkillPicks();
  renderMethods();
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

// 16칸짜리 그림(테두리 포함 18)이 전장 폭에서 차지할 비율. 여기만 고치면
// 아홉 그림의 크기가 서로의 비율을 지키며 같이 커지고 작아진다.
const UNIT_WIDTH = 11;

const pctX = (x) => (x / D.FIELD.w) * 100;
const pctY = (y) => (y / D.FIELD.h) * 100;

function makeUnitNode(unit) {
  const node = el('div', `unit ${unit.side}`);
  if (unit.uid === L.HERO_UID) node.classList.add('is-hero');
  node.dataset.uid = unit.uid;

  // 도트 그림이 제 색을 가지므로 파랑·빨강으로 물들여 편을 가를 수 없다.
  // 발밑에 색 있는 발판을 깔아 그 일을 대신한다 — 그림자 노릇도 같이 한다.
  node.append(el('div', 'mark'));
  node.insertAdjacentHTML('beforeend', Sprites.svg(unit.sprite));
  node.style.width = `${(UNIT_WIDTH * Sprites.size(unit.sprite).w) / 18}%`;

  const bar = el('div', 'hpbar');
  bar.append(el('span'));
  node.append(bar);

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
    if (zoneNodes.has(zone.id)) continue;
    const node = el('div', `zone ${zone.kind === 'heal' ? '' : 'damage'}`);
    node.style.left = `${pctX(zone.x)}%`;
    node.style.top = `${pctY(zone.y)}%`;
    node.style.width = `${pctX(zone.radius * 2)}%`;
    node.style.height = `${pctY(zone.radius * 2)}%`;
    field.append(node);
    zoneNodes.set(zone.id, node);
  }
  for (const [id, node] of zoneNodes) {
    if (seen.has(id)) continue;
    node.remove();
    zoneNodes.delete(id);
  }
}

function floatText(unit, label, cls) {
  const node = text('div', `float ${cls}`, label);
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
    button.append(text('span', 'pname', unit.name));

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
    button.append(text('span', 'glyph', def.icon));
    button.append(text('span', 'sname', def.name));
    button.append(text('span', 'cost', def.mp ? String(def.mp) : '－'));
    const cool = el('div', 'cool');
    cool.style.transform = 'scaleY(0)';
    button.append(cool);
    button.addEventListener('click', () => onSkill(id));
    bar.append(button);
  }

  // 물약은 스킬이 아니라 아이템이지만 손이 가는 자리는 같아야 한다.
  const potion = el('button', 'slot');
  potion.type = 'button';
  potion.dataset.potion = '1';
  potion.append(text('span', 'glyph', D.POTION.icon));
  potion.append(text('span', 'sname', D.POTION.name));
  potion.append(text('span', 'cost', `×${D.POTION.count}`));
  const cool = el('div', 'cool');
  cool.style.transform = 'scaleY(0)';
  potion.append(cool);
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

  $('hero-mp-fill').style.width = `${(hero.mp / hero.maxMp) * 100}%`;
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
  if (!app.battle || !app.aiming) { sound.play('click'); return; }
  cast(app.aiming, { uid });
}

function cast(skillId, target) {
  const def = D.PLAYER_SKILLS[skillId];
  const result = L.castSkill(app.battle, skillId, target);
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
  const pick = AI.nearest({ x, y }, AI.alive(state, side));
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

function note(label) {
  $('log').textContent = label;
}

// --- 전투 진행 ---------------------------------------------------------

let raf = 0;
let lastFrame = 0;

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
        if (event.radius) pulse(event.x, event.y, event.radius, event.skillId === 'pyre' ? 'harm' : '');
      } else {
        // 동료가 쓴 스킬은 글자로만 알린다. 소리까지 겹치면 내 조작음이 묻힌다.
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
    if (event.type === 'end') sound.play(event.result === 'won' ? 'win' : 'lose');
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

  // 배경은 전투당 한 번만 만든다. 씨앗을 퀘스트에 묶어 두어 같은 퀘스트가 늘
  // 같은 모습이 되게 했다 — 다시 도전할 때마다 돌 배치가 바뀌면 다른 곳으로 보인다.
  $('scene').innerHTML = Scenes.svg(app.quest.scene, app.quest.id.length * 977 + app.quest.level);

  app.battle = L.createBattle({
    quest: app.quest,
    party: app.party,
    skills: app.skills,
    heroStats: P.stats(app.progress),
    heroLevel: app.progress.charLevel,
    seed: (Math.random() * 1e9) | 0,
  });
  app.lootSeed = (Math.random() * 1e9) | 0;

  setAiming(null);
  renderPortraits(app.battle);
  renderSkillbar();
  $('wave').textContent = `1 / ${app.quest.waves.length}`;
  note('');
  show('battle', `${app.quest.name} · Lv ${app.quest.level}`);

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

// --- 결과 --------------------------------------------------------------

function partyMembers(state) {
  return state.units.filter((u) => u.side === 'ally').map((u) => ({
    id: u.uid, name: u.name, job: u.job,
  }));
}

function openResult(state) {
  const won = state.status === 'won';
  const quest = state.quest;
  const members = partyMembers(state);
  const reward = L.rewardOf(state);

  $('verdict').textContent = won ? '퀘스트 완료' : '퀘스트 실패';
  $('verdict').className = `verdict ${won ? 'won' : 'lost'}`;

  const survived = members.filter((m) => !AI.byUid(state, m.id).dead).length;
  $('verdict-note').textContent = `${Math.round(state.t)}초 · 회복 ${Math.round(state.stats.healed)}`
    + ` (흘린 힐 ${Math.round(state.stats.overheal)}) · 스킬 ${state.stats.casts}회`
    + ` · 생존 ${survived}/${members.length}`;

  // 경험치를 먼저 넣는다. 레벨이 오른 뒤라야 아래에서 계산하는 스탯이 맞다.
  const before = { char: app.progress.charLevel, job: app.progress.jobLevel };
  const gained = P.addExp(app.progress, reward.charExp, reward.jobExp);
  app.progress.gold += reward.gold;

  const expList = $('exp-gained');
  expList.textContent = '';
  expList.append(levelRow(`캐릭터 +${reward.charExp}`, app.progress.charLevel, app.progress.charExp,
    app.progress.charLevel >= D.LEVEL.maxLevel ? 0 : D.LEVEL.charExpTo(app.progress.charLevel)));
  expList.append(levelRow(`힐러 +${reward.jobExp}`, app.progress.jobLevel, app.progress.jobExp,
    app.progress.jobLevel >= D.LEVEL.maxLevel ? 0 : D.LEVEL.jobExpTo(app.progress.jobLevel)));

  const lines = [`처치 ${reward.kills} · 길드 ${reward.guild} · 회복 ${reward.healExp}`];
  if (gained.charLevels) lines.push(`캐릭터 레벨 ${before.char} → ${app.progress.charLevel}`);
  if (gained.jobLevels) lines.push(`힐러 레벨 ${before.job} → ${app.progress.jobLevel}`);
  if (gained.unlocked.length) {
    lines.push(`새 스킬: ${gained.unlocked.map((def) => def.name).join(', ')}`);
  }
  $('exp-note').textContent = lines.join(' · ');

  $('guild-panel').hidden = !won;
  $('drop-panel').hidden = !won;
  $('gain-panel').hidden = !won;
  // 깬 의뢰는 게시판에서 사라진다. 다시 도전을 남겨 두면 같은 의뢰의 보상을
  // 몇 번이고 받을 수 있다.
  $('retry').hidden = won;

  if (won) {
    const guild = $('guild-loot');
    guild.textContent = '';
    const gold = el('li');
    gold.append(text('span', null, '🪙'));
    gold.append(text('span', null, `${quest.guildReward.gold} 골드`));
    guild.append(gold);

    const method = Loot.METHODS[app.lootMethod];
    $('method-name').textContent = method.name;
    const result = Loot.distribute(quest.drops, members, app.lootMethod, app.lootSeed);

    const awards = $('awards');
    awards.textContent = '';
    for (const award of result.awards) {
      const def = D.itemDef(award.item.defId);
      const owner = members.find((m) => m.id === award.toId);
      const row = el('li');
      row.append(text('span', null, def.icon));
      row.append(text('span', null, D.itemName(award.item)));
      row.append(text('span', 'why', award.reason));
      row.append(text('span', 'to', owner.name));
      if (award.rolls) {
        row.append(text('span', 'rolls', award.rolls.map((r) => `${r.name} ${r.roll}`).join(' · ')));
      }
      awards.append(row);
    }

    // 내 몫만 인벤토리로 들어간다. 재료는 그 자리에서 팔린다.
    let sold = 0;
    const mine = [];
    for (const item of result.byMember[L.HERO_UID] || []) {
      const before2 = app.progress.gold;
      const added = P.addItem(app.progress, item);
      if (added.sold) sold += app.progress.gold - before2;
      else mine.push(item);
    }
    renderGained(mine, sold);
  }

  persist();
  // 깬 의뢰는 게시판에서 사라지고 새 의뢰가 걸린다.
  if (won) {
    app.progress.cleared++;
    app.progress.questSeed = (Math.random() * 1e9) | 0;
    persist();
    refreshQuests();
  }

  show('result', quest.name);
}

function renderGained(items, sold, equipped) {
  const list = $('gained');
  list.textContent = '';

  if (sold) list.append(text('li', 'empty-note', `재료를 팔아 ${sold} 골드를 받았다.`));
  if (!items.length) {
    if (equipped) list.append(text('li', 'empty-note', '장착했다. 나머지는 인벤토리에 있다.'));
    else if (!sold) list.append(text('li', 'empty-note', '이번에는 내 몫이 없었다.'));
    return;
  }

  for (const item of items) {
    const index = app.progress.inventory.findIndex((entry) =>
      entry.defId === item.defId && entry.tier === item.tier);
    if (index < 0) continue;
    const row = el('li');
    row.append(itemButton(item, index, (i) => {
      sound.play('click');
      P.equip(app.progress, i);
      persist();
      // 장착하면 인벤토리 위치가 바뀐다. 남은 것을 다시 그려야 다음 장착이 맞는다.
      renderGained(items.filter((entry) => entry !== item), sold, true);
    }));
    list.append(row);
  }
}

$('retry').addEventListener('click', () => {
  sound.play('click');
  // 다시 도전할 때는 스킬과 편성을 그대로 쓴다. 매번 다시 고르게 하면
  // 한 판 더 해 보는 것이 번거로워진다.
  startBattle();
});

$('to-quests').addEventListener('click', () => {
  sound.play('click');
  openHome('quest');
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

refreshQuests();
openHome('quest');

})();

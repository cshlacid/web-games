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
const Items = window.HealerItems;
const Roster = window.HealerRoster;
const Shop = window.HealerShop;
const Sprites = window.HealerSprites;
const Icons = window.HealerIcons;
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
// 아이콘은 글자가 아니라 그림이다. `currentColor`로 그리므로 놓인 자리의 색을
// 그대로 입는다 — 스킬 종류 색이 아이콘에 걸리는 것이 그 때문이다.
const icon = (name, cls) => {
  const node = el('span', `ico-box${cls ? ` ${cls}` : ''}`);
  node.innerHTML = Icons.svg(name);
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
  // 주인공 위험 경고를 이미 울렸는지. 매 프레임 다시 울리지 않게 한다.
  danger: false,
  // 상세를 열어 둔 동료. 열어 둔 채로 데려가기를 눌렀을 때 단추 글씨를 고친다.
  member: null,
  result: null,
};

function persist() {
  P.save(app.progress);
}

// --- 화면 전환 ---------------------------------------------------------

const SCREENS = {
  home: { node: 'screen-home', name: '모험가 길드', note: '', back: null, tabs: true },
  party: { node: 'screen-party', name: '편성', note: '파티와 스킬을 정한다', back: 'home' },
  battle: { node: 'screen-battle', name: '전투', note: '', back: null },
  result: { node: 'screen-result', name: '결과', note: '', back: null },
};

function show(name, note) {
  app.screen = name;
  // 곡은 화면을 따라간다. 결과 화면을 길드 쪽에 붙인 것은, 전투가 끝났는데도
  // 몰아치는 곡이 계속 도는 것이 이긴 판에서든 진 판에서든 어색하기 때문이다.
  sound.setTrack(name === 'battle' ? 'battle' : 'lobby');
  // 동료 상세는 편성 화면의 것이다. 화면을 옮기면서 닫지 않으면 전투 위에 떠 있다.
  if (name !== 'party') closeMember();
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
  $('tab-shop').hidden = app.tab !== 'shop';
  if (app.tab === 'quest') renderQuests();
  else if (app.tab === 'shop') renderShop();
  else renderCharacter();

  const notes = {
    quest: '의뢰 게시판',
    character: `캐릭터 Lv ${app.progress.charLevel}`,
    shop: `${app.progress.gold} 골드`,
  };
  show('home', notes[app.tab]);
}

for (const button of $('tabbar').children) {
  button.addEventListener('click', () => {
    sound.play('click');
    openHome(button.dataset.tab);
  });
}

// 탭 아이콘은 HTML에 이름만 적어 두고 여기서 그린다. 경로를 HTML에도 적으면
// 같은 그림이 두 곳에 생겨 한쪽만 고치는 일이 난다.
for (const slot of document.querySelectorAll('[data-icon]')) {
  slot.innerHTML = Icons.svg(slot.dataset.icon);
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
    // 전리품 목록은 미리 알 수 없다 — 쓰러뜨린 적에게서 굴려진다. 게시판이
    // 말할 수 있는 것은 어떤 적이 나오는가까지다.
    meta.append(text('span', `tag rank-${quest.rank}`, `${D.RANKS[quest.rank].name} 출현`));
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

// 어느 능력치가 올리는지를 이름 옆에 적는다. 물리와 마법을 한 줄로 묶어 두었을
// 때에는 지능을 올린 것이 무엇을 올렸는지가 화면에 없었다.
//
// **회복력과 마법 공격력은 둘 다 지능에서 나오고 계수가 다르다**(회복 쪽이
// 가파르다). 한 줄로 적으면 그 차이가 보이지 않는다.
const STAT_LABELS = {
  hp: '최대 체력',
  mp: '최대 마나',
  // 주인공도 마나가 떨어지면 기본 공격을 한다. 쓰지 않는 수치가 아니므로 적는다.
  atk: '물리 공격력 (힘)',
  spell: '마법 공격력 (지능)',
  heal: '회복력 (지능)',
  crit: '치명타 확률',
  critDamage: '치명타 피해',
  dodge: '회피',
  armor: '받는 피해',
};

function statText(key, value) {
  if (key === 'heal' || key === 'armor' || key === 'critDamage' || key === 'spell') {
    return `×${value.toFixed(2)}`;
  }
  if (key === 'dodge' || key === 'crit') return `${(value * 100).toFixed(1)}%`;
  return String(Math.round(value));
}

// 능력치 한 줄. 남은 점수가 있으면 오른쪽에 넣는 단추가 붙는다.
function renderAttrs() {
  const progress = app.progress;
  const own = P.attrs(progress);
  // 장비가 얹어 준 몫은 따로 센다. 합쳐 놓으면 점수를 어디에 넣었는지도, 장비를
  // 벗으면 얼마가 빠지는지도 알 수 없다.
  const gear = P.gearAttrs(progress);
  const left = P.freePoints(progress);
  $('attr-points').textContent = left ? `남은 점수 ${left}` : '남은 점수 없음';

  const list = $('char-attrs');
  list.textContent = '';
  for (const attr of Object.values(D.ATTRS)) {
    const row = el('li', 'attr-row');
    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(attr.name));
    // 자동으로 오른 몫과 내가 넣은 몫을 나눠 보여 준다. 합쳐서 보여 주면
    // 점수를 어디에 넣었는지 알 수 없다.
    const put = progress.spent[attr.id] || 0;
    if (put) name.append(text('span', 'job', `투자 +${put}`));
    const worn = Math.round(gear[attr.id] || 0);
    if (worn) name.append(text('span', 'job gear', `장비 +${worn}`));
    body.append(name);
    body.append(text('div', 'pick-sub', attr.effect));
    row.append(body);
    row.append(text('b', 'attr-value', String(own[attr.id] + worn)));

    const add = el('button', 'attr-add');
    add.type = 'button';
    add.textContent = '＋';
    add.disabled = left <= 0;
    add.setAttribute('aria-label', `${attr.name} 올리기`);
    add.addEventListener('click', () => {
      const spent = P.spendPoint(progress, attr.id);
      sound.play(spent.ok ? 'click' : 'deny');
      if (!spent.ok) return;
      persist();
      renderCharacter();
    });
    row.append(add);
    list.append(row);
  }
}

function renderCharacter() {
  const progress = app.progress;
  const stats = P.stats(progress);
  const max = progress.charLevel >= D.LEVEL.maxLevel;

  const job = D.heroJob(progress.job);
  const jobSlot = $('char-job');
  jobSlot.textContent = '';
  jobSlot.append(jobTag('healer', job.spec, D.HERO.race));

  $('char-gold').textContent = `${progress.gold} 골드`;

  const levels = $('char-levels');
  levels.textContent = '';
  levels.append(levelRow('캐릭터', progress.charLevel, progress.charExp,
    max ? 0 : D.LEVEL.charExpTo(progress.charLevel)));
  // 직업 레벨은 계열마다 따로 쌓이고 상한도 계열이 정한다. 이름을 '힐러'로
  // 두면 계열을 바꿔도 같은 줄로 보인다.
  const jobLv = P.jobLevel(progress);
  const jobMax = D.jobMaxLevel(progress.job);
  levels.append(levelRow(`${job.name} (${jobLv}/${jobMax})`, jobLv, P.jobExpOf(progress),
    jobLv >= jobMax ? 0 : D.LEVEL.jobExpTo(jobLv)));

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
      button.append(icon(D.GEAR[item.defId].icon, 'icon'));
      button.append(itemName(item, 'item-name'));
      button.append(text('span', 'why', Items.summary(item)));
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

  renderAttrs();
  renderPotions();
  renderInventory();

  renderJobs();

  const skills = $('char-skills');
  skills.textContent = '';
  const open = new Set(P.unlockedSkills(progress).map((def) => def.id));
  const points = P.freeSkillPoints(progress);
  for (const base of D.heroSkillsOf(progress.job)) {
    const isOpen = open.has(base.id);
    const level = P.skillLevel(progress, base.id);
    const known = level > 0;
    const def = P.skillDef(progress, base.id);

    const row = el('li', isOpen ? 'skill-row' : 'skill-row locked');
    row.append(icon(isOpen ? base.icon : 'lock', 'icon'));
    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(base.name));
    name.append(text('span', 'job', base.type));
    // 레벨을 이름 옆에 적는다. 효과 줄에만 두면 어느 스킬에 점수를 넣었는지
    // 목록을 훑어서는 알 수 없다. **아직 안 배운 것은 레벨이 아니라 그렇게 적는다.**
    if (known) name.append(text('span', 'job', `Lv ${level} / ${D.SKILL.max}`));
    else if (isOpen) name.append(text('span', 'job', '안 배움'));
    body.append(name);
    body.append(text('div', 'pick-sub',
      isOpen ? base.desc : `${job.name} Lv ${base.unlock}에 배울 수 있다`));
    if (isOpen) {
      // 지금 레벨에서 실제로 얼마를 하는지. 정의에 적힌 문장만으로는 점수를
      // 넣은 것이 화면에 보이지 않는다.
      body.append(text('div', 'pick-sub', `${D.skillEffect(def)} · 마나 ${def.mp || 0}`));
      // 시전 시간과 사거리는 등록 화면에서 고르는 근거다. 캐스팅 스킬은 외우는
      // 동안 아무것도 못 하고 움직이면 취소되므로, 회복량만 보고 고르면 안 된다.
      body.append(text('div', 'pick-sub dim', castLine(base)));
    }
    row.append(body);

    if (isOpen) {
      // **배우는 것과 올리는 것이 같은 점수를 쓴다.** 단추를 하나로 두면 처음
      // 누르는 것이 무슨 일인지 알 수 없어, 아직 안 배운 스킬에는 이름을 적는다.
      const add = el('button', known ? 'attr-add' : 'attr-add learn');
      add.type = 'button';
      add.textContent = known ? '＋' : '배우기';
      add.disabled = points <= 0 || level >= D.SKILL.max;
      add.setAttribute('aria-label', known ? `${base.name} 레벨 올리기` : `${base.name} 배우기`);
      add.addEventListener('click', () => {
        const spent = known ? P.raiseSkill(progress, base.id) : P.learnSkill(progress, base.id);
        sound.play(spent.ok ? 'click' : 'deny');
        if (!spent.ok) return;
        persist();
        renderCharacter();
      });
      row.append(add);
    }
    skills.append(row);
  }
  // **다른 계열에서 배운 것도 전투에 들고 갈 수 있다.** 여기에 적지 않으면 편성
  // 화면에만 나타나, 무엇을 들고 갈 수 있는지 캐릭터 창에서는 알 수 없다.
  // 올리는 단추는 없다 — 점수는 그 계열 것이라 지금 계열에서는 쓸 수 없다.
  const others = P.learnedSkills(progress).filter((def) => def.job !== progress.job);
  const kept = $('char-kept');
  kept.textContent = '';
  kept.hidden = !others.length;
  for (const base of others) {
    const row = el('li', 'skill-row');
    row.append(icon(base.icon, 'icon'));
    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(base.name));
    name.append(text('span', 'job', D.heroJob(base.job).name));
    name.append(text('span', 'job', `Lv ${P.skillLevel(progress, base.id)}`));
    body.append(name);
    body.append(text('div', 'pick-sub', D.skillEffect(P.skillDef(progress, base.id))));
    row.append(body);
    kept.append(row);
  }

  $('skill-points').textContent = points ? `남은 점수 ${points}` : '남은 점수 없음';
  $('skill-open').textContent = `${P.learnedSkills(progress).length} / ${D.heroSkillsOf(progress.job).length}`;
}



// 고를 수 있는 계열. **회복 계열만 있다** — 자료에 그것만 적혀 있고, 화면은
// 표를 그대로 그린다.
//
// 지금 계열도 목록에 남긴다. 빠지면 무엇을 맡고 있는지가 이 자리에서 사라지고,
// 계열마다 따로 쌓인 레벨을 견줄 수도 없다.
function renderJobs() {
  const progress = app.progress;
  const box = $('char-jobs');
  box.textContent = '';
  for (const job of Object.values(D.HERO_JOBS)) {
    const now = progress.job === job.id;
    const can = P.canChangeJob(progress, job.id);
    const level = (progress.jobs || {})[job.id];
    const button = el('button', 'job-card');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(now));
    button.disabled = now || !can.ok;

    const head = el('div', 'pick-name');
    head.append(document.createTextNode(job.name));
    // 겪어 본 계열만 레벨을 적는다. 안 겪은 계열에 "Lv 1"을 적으면 이미 맡아 본
    // 것으로 보인다.
    if (level) head.append(text('span', 'job', `Lv ${level.level} / ${job.maxLevel}`));
    button.append(head);
    button.append(text('div', 'pick-sub', job.desc));
    button.append(text('div', 'pick-sub dim',
      now ? '지금 맡고 있다' : can.ok ? '전직할 수 있다' : can.reason));

    button.addEventListener('click', () => {
      const moved = P.changeJob(progress, job.id);
      sound.play(moved.ok ? 'click' : 'deny');
      if (!moved.ok) return;
      // 등록해 둔 다섯이 앞 계열의 것이라 걸러졌다. 화면이 들고 있는 것도 맞춘다.
      app.skills = progress.skills.slice();
      persist();
      renderCharacter();
    });
    box.append(button);
  }
}

// 스킬 하나의 시전 시간과 사거리. 아군·적 스킬과 주인공 스킬이 같은 형태로
// 적혀 있어 한 함수로 쓴다.
function castLine(def) {
  const cast = def.cast ? `시전 ${def.cast}초` : '즉시 시전';
  return def.range ? `${cast} · 사거리 ${def.range}` : cast;
}

// 지금 낀 것과 견준 차이. 이걸 보여 주지 않으면 갈아 끼울지 말지를 매번 머리로
// 계산해야 하고, 결국 아무도 계산하지 않는다.
// 지금 낀 것과의 차이. 화살표로 좋고 나쁨을 적어 봤더니 "받는 피해 ▲3%"가
// 피해가 늘어난 것처럼 읽혔다. 부호를 그대로 적는 편이 모든 스탯에서 헷갈리지
// 않는다 — 받는 피해가 −3%인 것은 그 자체로 좋다는 뜻이다.
function diffSummary(compare) {
  if (!compare.current) return '빈 슬롯';
  const parts = Object.entries(compare.diff).map(([key, value]) => {
    const size = key === 'hp' || key === 'mp'
      ? Math.round(Math.abs(value))
      : `${Math.round(Math.abs(value) * 100)}%`;
    return `${D.STATS[key].name} ${value > 0 ? '+' : '−'}${size}`;
  });
  return parts.length ? `지금 낀 것과 ${parts.join(' · ')}` : '지금 낀 것과 차이 없음';
}

// 인벤토리·상점·결과 화면이 같은 줄 모양을 쓴다. action은 오른쪽에 붙는 글자와
// 눌렀을 때 할 일이다 — 장착이든 구매든 판매든 줄 생김새는 같아야 한다.
function itemButton(item, action) {
  const def = D.GEAR[item.defId];
  const compare = P.compare(app.progress, item);

  const button = el('button', `item ${compare.upgrade ? 'better' : ''}`);
  button.type = 'button';
  button.append(icon(def.icon, 'icon'));

  const body = el('div', 'pick-body');
  const name = el('div', 'pick-name');
  name.append(itemName(item));
  name.append(text('span', 'job', D.SLOTS[def.slot].name));
  body.append(name);
  body.append(text('div', 'pick-sub', Items.summary(item)));
  // 지금 낀 것과의 차이. 이걸 보여 주지 않으면 갈아 끼울지를 매번 머리로
  // 계산해야 하고, 결국 아무도 계산하지 않는다.
  body.append(text('div', 'pick-sub diff', diffSummary(compare)));
  button.append(body);

  button.append(text('span', 'pick-cost', action.label));
  button.addEventListener('click', action.run);
  return button;
}

function renderPotions() {
  const list = $('char-potions');
  list.textContent = '';
  for (const potion of Object.values(D.POTIONS)) {
    const row = el('li');
    const label = el('span', 'with-ico');
    label.append(icon(potion.icon));
    label.append(document.createTextNode(potion.name));
    row.append(label);
    row.append(text('b', 'stat-value', `${app.progress.potions[potion.id] || 0} / ${D.POTION_MAX}`));
    list.append(row);
  }
}

function renderInventory() {
  const list = $('inventory');
  list.textContent = '';
  $('inv-count').textContent = String(app.progress.inventory.length);

  if (!app.progress.inventory.length) {
    list.append(text('li', 'empty-note', '아직 없다. 의뢰를 받아 오면 쌓인다.'));
    return;
  }

  for (const item of app.progress.inventory) {
    const row = el('li');
    row.append(itemButton(item, {
      label: '장착',
      run: () => {
        sound.play('click');
        P.equip(app.progress, item.uid);
        persist();
        renderCharacter();
      },
    }));
    list.append(row);
  }
}

// --- 상점 --------------------------------------------------------------

// 진열대는 화면이 들고 있는다. 씨앗에서 다시 만들 수 있으므로 저장할 필요가
// 없고, 산 물건을 목록에서 빼는 일도 여기서 하면 된다 — 저장 상태에 "산 것"
// 목록을 따로 들고 있는 것보다 낫다.
function shopStock() {
  const key = `${app.progress.charLevel}:${app.progress.shopSeed}`;
  if (!app.stock || app.stock.key !== key) {
    app.stock = Object.assign({ key }, Shop.stock(app.progress.charLevel, app.progress.shopSeed));
  }
  return app.stock;
}

function renderShop() {
  const progress = app.progress;
  const stock = shopStock();
  $('shop-gold').textContent = `${progress.gold} 골드`;
  $('shop-refresh').textContent = `진열대 바꾸기 · ${stock.refreshCost} 골드`;
  $('shop-refresh').disabled = progress.gold < stock.refreshCost;

  const potions = $('shop-potions');
  potions.textContent = '';
  for (const entry of stock.potions) {
    const potion = D.POTIONS[entry.id];
    const held = progress.potions[entry.id] || 0;
    const full = held >= D.POTION_MAX;

    const button = el('button', 'item');
    button.type = 'button';
    button.disabled = full || progress.gold < entry.price;
    button.append(icon(potion.icon, 'icon'));
    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(potion.name));
    name.append(text('span', 'job', `${held} / ${D.POTION_MAX}`));
    body.append(name);
    body.append(text('div', 'pick-sub',
      `최대 ${D.STATS[potion.restore === 'hp' ? 'hp' : 'mp'].name}의 ${Math.round(potion.ratio * 100)}% 회복`
      + ` · 쿨 ${potion.cd}초`));
    button.append(body);
    button.append(text('span', 'pick-cost', full ? '가득' : `${entry.price} 골드`));
    button.addEventListener('click', () => {
      const bought = P.buyPotion(progress, entry.id);
      sound.play(bought.ok ? 'click' : 'deny');
      if (bought.ok) { persist(); renderShop(); }
    });
    const row = el('li');
    row.append(button);
    potions.append(row);
  }

  const gear = $('shop-gear');
  gear.textContent = '';
  if (!stock.gear.length) {
    gear.append(text('li', 'empty-note', '진열대를 비웠다. 의뢰를 깨면 새로 채워진다.'));
  }
  for (const item of stock.gear) {
    const price = Items.price(item);
    const row = el('li');
    const button = itemButton(item, {
      label: `${price} 골드`,
      run: () => {
        const bought = P.buyGear(progress, item);
        sound.play(bought.ok ? 'click' : 'deny');
        if (!bought.ok) return;
        // 산 물건은 진열대에서 빠진다. 남아 있으면 같은 물건을 두 번 사고도
        // 진열대가 그대로라 무엇을 샀는지 알 수 없다.
        stock.gear = stock.gear.filter((entry) => entry !== item);
        persist();
        renderShop();
      },
    });
    button.classList.toggle('afford', progress.gold >= price);
    row.append(button);
    gear.append(row);
  }

  const sellList = $('shop-sell');
  sellList.textContent = '';
  $('sell-count').textContent = String(progress.inventory.length);
  if (!progress.inventory.length) {
    sellList.append(text('li', 'empty-note', '팔 물건이 없다.'));
  }
  for (const item of progress.inventory) {
    const row = el('li');
    row.append(itemButton(item, {
      label: `${Items.sellPrice(item)} 골드에 팔기`,
      run: () => {
        sound.play('click');
        P.sell(progress, item.uid);
        persist();
        renderShop();
      },
    }));
    sellList.append(row);
  }
}

$('shop-refresh').addEventListener('click', () => {
  const paid = P.spend(app.progress, Shop.refreshCost(app.progress.charLevel));
  sound.play(paid.ok ? 'click' : 'deny');
  if (!paid.ok) return;
  app.progress.shopSeed = (Math.random() * 1e9) | 0;
  persist();
  renderShop();
});

// --- 편성 --------------------------------------------------------------

// 그림 파일로 그리는 유닛(주인공)의 몸통. 시트를 통째로 넣고 상자로 잘라
// 보여 준다 — `background-position`을 %로 잡으면 요소 크기에 따라 계산이
// 달라지지만, 이렇게 하면 칸 하나가 늘 정확히 들어맞는다.
function sheetBody(kind, cls, cropName) {
  const info = Sprites.sheet(kind);
  // 클래스 이름이 `sheet`이면 동료 상세 시트(`position: fixed`)와 부딪힌다.
  const crop = cropOf(info, cropName);
  const wrap = el('span', `${cls} filmstrip`);
  wrap.dataset.kind = kind;
  wrap.dataset.crop = cropName || 'full';
  // 상자의 가로세로비는 **잘라 낸 자리**의 비율이다. 칸 전체로 두면 머리만
  // 보여 줄 때 얼굴이 납작해진다.
  wrap.style.aspectRatio = `${info.cell.w * crop.w} / ${info.cell.h * crop.h}`;
  const img = el('img');
  img.src = info.src;
  img.alt = '';
  img.style.width = `${(info.cols * 100) / crop.w}%`;
  img.style.height = `${(info.rows * 100) / crop.h}%`;
  wrap.append(img);
  wrap.dataset.clip = '';
  setFrame(wrap, 0, 0);
  return wrap;
}

const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };
const cropOf = (info, name) => (info.crops && info.crops[name]) || FULL_CROP;

// 시트의 (열, 줄)에서 잘라 낼 자리를 고른다. 이미지를 상자의 cols/w × rows/h 배로
// 두었으므로, 제 크기의 (col + x)/cols 만큼 밀면 그 자리가 상자에 딱 들어온다.
function setFrame(wrap, col, row) {
  const info = Sprites.sheet(wrap.dataset.kind);
  const crop = cropOf(info, wrap.dataset.crop);
  const img = wrap.firstElementChild;
  if (!img) return;
  const x = (-100 * (col + crop.x)) / info.cols;
  const y = (-100 * (row + crop.y)) / info.rows;
  img.style.transform = `translate(${x}%, ${y}%)`;
}

// crop은 칸의 어디를 보여 줄지다. 전투 초상화는 머리만('head'), 편성 화면은
// 서 있기 그림에 맞춰 좁힌 전신('list')이다.
function avatar(kind, crop) {
  if (Sprites.sheet(kind)) {
    return sheetBody(kind, 'avatar', crop || 'list');
  }
  const wrap = el('span', 'avatar');
  wrap.innerHTML = Sprites.svg(kind);
  return wrap;
}

// 역할과 계열을 함께 적는다. 역할만 적으면 궁수와 마법사가 같은 줄로 보이고,
// 계열만 적으면 누가 앞에 서는지 알 수 없다 — 둘 다 있어야 편성이 고민이 된다.
// 아이템 이름 한 줄. **등급이 색으로 먼저 읽혀야 한다** — 목록에서 이름을
// 하나하나 읽어 등급을 가리게 하면 색을 나눈 뜻이 없다.
function itemName(item, cls) {
  const node = text('span', `iname tier-${Items.tier(item).css}${cls ? ` ${cls}` : ''}`,
    Items.name(item));
  node.title = D.tierName(item.tier);
  return node;
}

function jobTag(job, spec, race) {
  const parts = [D.JOBS[job].name];
  if (spec) parts.push(D.SPECS[spec]);
  // 종족은 능력치와 물약 사용 여부를 함께 정하므로 편성할 때 보여야 한다.
  if (race) parts.push(D.RACES[race].name);
  // 계열마다 색이 다르다. 역할 색만으로는 궁수와 마법사가 같은 줄로 보인다.
  return text('span', `job ${job}${spec ? ` spec-${spec}` : ''}`, parts.join(' · '));
}

// **동료 카드에는 계열만 적는다.** 역할까지 적으면 좁은 칸에서 "딜러 · 음유시인"이
// 잘렸고, 잘린 계열 이름은 역할보다 잃는 것이 크다 — 무엇을 들고 오는지는 계열이
// 정하고, 역할은 카드 순서(탱커 → 딜러 → 힐러)와 상세에 있다.
//
// **레벨을 함께 받는다.** 계열은 레벨이 오르면 한 번 올라가므로(`D.specAt`),
// 정의에 적힌 것을 그대로 적으면 12레벨 동료가 카드에서는 수호자인데 전장에서는
// 철벽의 스킬을 쓴다.
function specTag(def, level) {
  const spec = D.specAt(def.spec, level);
  return text('span', `job ${def.job} spec-${spec}`, D.SPECS[spec]);
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

function memberSummary(member) {
  const def = Roster.defOf(member);
  const gear = Roster.gearOf(member);
  const parts = [def.note];
  if (gear.length) parts.push(`장비 ${gear.length}`);
  return parts.join(' · ');
}

// **목록에는 그림·이름·직업만 둔다.** 스킬과 장비까지 한 줄에 늘어놓았을 때에는
// 한 줄이 네 줄 높이가 되어 여섯 명이 화면을 다 먹었고, 그래서 여섯만 보여 줄 수
// 있었다. 지금은 한 명이 한 칸이라 명부 대부분을 한 화면에서 훑는다 — 무엇을
// 들고 오는지는 눌러서 본다(openMember).
//
// **누르는 곳을 둘로 나눈다.** 카드는 상세를 열고, 오른쪽 체크 단추가 데려간다.
// 카드를 누르는 것이 곧 선택이면 상세를 볼 방법이 없고, 반대로 하면 넷을 고르는
// 데 매번 상세를 거쳐야 한다.
function renderRoster() {
  const list = $('roster');
  list.textContent = '';

  // 주인공은 빼거나 바꿀 수 없으므로 고정된 줄로 먼저 보여 준다. 한 줄을 통째로
  // 쓰는 것은, 격자 안에 끼워 두면 고를 수 있는 것처럼 보이기 때문이다.
  const heroRow = el('div', 'pick locked');
  heroRow.append(avatar('hero'));
  const heroBody = el('div', 'pick-body');
  const heroName = el('div', 'pick-name');
  heroName.append(document.createTextNode(`주인공 Lv ${app.progress.charLevel}`));
  heroName.append(jobTag('healer', D.heroJob(app.progress.job).spec, D.HERO.race));
  heroBody.append(heroName);
  const stats = P.stats(app.progress);
  heroBody.append(text('div', 'pick-sub',
    `체력 ${stats.hp} · 마나 ${stats.mp} · 회복력 ×${stats.heal.toFixed(2)}`));
  heroRow.append(heroBody);
  const heroItem = el('li', 'wide');
  heroItem.append(heroRow);
  list.append(heroItem);

  for (const member of app.candidates) {
    const def = Roster.defOf(member);
    const picked = app.party.includes(member);
    const full = app.party.length >= D.PARTY_MAX - 1;

    const row = el('div', 'pick card');
    const open = el('button', 'pick-open');
    open.type = 'button';
    open.setAttribute('aria-pressed', String(picked));

    // **레벨은 그림 아래에 둔다.** 직업 앞에 붙여 두었더니 좁은 칸에서 직업·계열이
    // 두 줄로 감겼다. 여기로 옮기면 글자 줄은 이름과 직업 둘뿐이다.
    const face = el('span', 'pick-face');
    face.append(avatar(def.sprite));
    face.append(text('span', 'lv', `Lv ${member.level}`));
    open.append(face);

    const body = el('div', 'pick-body');
    body.append(text('div', 'pick-name', member.name));
    // 카드에는 종족을 적지 않는다. 셋을 다 적으면 좁은 칸에서 줄이 늘어난다.
    body.append(specTag(def, member.level));
    open.append(body);
    open.addEventListener('click', () => openMember(member));
    row.append(open);

    const take = el('button', 'pick-take');
    take.type = 'button';
    take.setAttribute('aria-pressed', String(picked));
    take.setAttribute('aria-label', `${member.name} ${picked ? '빼기' : '데려가기'}`);
    take.disabled = !picked && full;
    take.append(icon('check'));
    take.addEventListener('click', () => toggleMember(member));
    row.append(take);

    const item = el('li');
    item.append(row);
    list.append(item);
  }
  $('party-count').textContent = `${app.party.length + 1} / ${D.PARTY_MAX}`;
}

function toggleMember(member) {
  const picked = app.party.includes(member);
  if (!picked && app.party.length >= D.PARTY_MAX - 1) { sound.play('deny'); return; }
  sound.play('click');
  if (picked) app.party = app.party.filter((entry) => entry !== member);
  else app.party.push(member);
  renderRoster();
  updateStart();
  // 상세를 열어 둔 채로 눌렀을 수도 있다. 열려 있으면 단추 글씨가 따라가야 한다.
  if (app.member === member) openMember(member);
}

// 동료 하나의 상세. 같은 동료라도 레벨에 따라 들고 오는 스킬이 다르므로, 이것을
// 보지 않으면 편성이 이름 고르기가 된다. 물약과 장비도 함께 보여야 이 동료가
// 마나가 떨어진 뒤에도 버티는지 알 수 있다.
function openMember(member) {
  app.member = member;
  const def = Roster.defOf(member);
  const sheet = $('member-sheet');

  const head = $('member-head');
  head.textContent = '';
  head.append(avatar(def.sprite));
  const body = el('div', 'pick-body');
  body.append(text('div', 'pick-name', `${member.name} Lv ${member.level}`));
  const tag = el('div', 'pick-sub');
  tag.append(jobTag(def.job, D.specAt(def.spec, member.level), def.race));
  body.append(tag);
  body.append(text('div', 'pick-sub', memberSummary(member)));
  head.append(body);

  // **칩은 누를 수 있다.** 이름과 숫자만으로는 그 스킬이 무엇을 하는지, 그 장비에
  // 무슨 옵션이 붙었는지 알 수 없었고, `title`은 손가락으로는 볼 방법이 없다.
  const chips = $('member-chips');
  chips.textContent = '';
  for (const id of Roster.skillsOf(member)) {
    const skill = D.UNIT_SKILLS[id];
    const kind = D.skillKind(skill);
    // 아이콘이 "어떤 스킬인가"를, 색이 "무엇을 하는가"를 알린다. 이름만
    // 늘어놓았을 때에는 넷을 훑는 데 넷을 다 읽어야 했다.
    const chip = chipButton(`chip skill ${kind.css}`, skill.icon, `${skill.name} ${skill.mp}`,
      // 종류 이름이 스킬 이름과 같으면(도발) 두 번 적지 않는다.
      () => showChip(chip, skill.name === kind.name ? skill.name : `${skill.name} · ${kind.name}`,
        skillLines(skill), skill.desc));
    chips.append(chip);
  }
  for (const [id, count] of Object.entries(Roster.potionsOf(member))) {
    if (count > 0) {
      const potion = D.POTIONS[id];
      const chip = chipButton('chip dim', potion.icon, String(count),
        () => showChip(chip, `${potion.name} ×${count}`, potionLines(potion),
          '동료는 직업에 따라 알아서 챙겨 오고, 위급할 때 알아서 마신다.'));
      chips.append(chip);
    }
  }
  for (const item of Roster.gearOf(member)) {
    const gear = D.GEAR[item.defId];
    const chip = chipButton(`chip gear tier-${Items.tier(item).css}`, gear.icon, Items.name(item),
      () => showChip(chip, `${Items.name(item)} · ${D.SLOTS[gear.slot].name}`, gearLines(item),
        '분배로 받은 장비는 그 동료가 계속 쓴다.'));
    chips.append(chip);
  }
  if (!chips.children.length) chips.append(text('span', 'pick-sub', '들고 오는 것이 없다'));
  hideChip();

  const picked = app.party.includes(member);
  const take = $('member-take');
  take.textContent = picked ? '파티에서 뺀다' : '데려간다';
  take.disabled = !picked && app.party.length >= D.PARTY_MAX - 1;
  sheet.hidden = false;
}

function chipButton(cls, iconName, label, run) {
  const chip = el('button', cls);
  chip.type = 'button';
  chip.setAttribute('aria-pressed', 'false');
  chip.append(icon(iconName));
  chip.append(document.createTextNode(label));
  chip.addEventListener('click', () => { sound.play('click'); run(); });
  return chip;
}

// 누른 칩 하나의 설명. 칩 아래 한 자리에만 띄우는 것은, 칩마다 설명을 펼치면
// 목록이 다시 길어져 칩으로 접어 둔 뜻이 사라지기 때문이다.
function showChip(chip, title, lines, note) {
  const panel = $('member-detail');
  const open = chip.getAttribute('aria-pressed') === 'true';
  for (const other of $('member-chips').children) {
    if (other.setAttribute) other.setAttribute('aria-pressed', 'false');
  }
  if (open) { hideChip(); return; }

  chip.setAttribute('aria-pressed', 'true');
  panel.textContent = '';
  panel.append(text('p', 'detail-title', title));
  for (const line of lines) panel.append(text('p', 'detail-line', line));
  if (note) panel.append(text('p', 'detail-note', note));
  panel.hidden = false;
}

function hideChip() {
  const panel = $('member-detail');
  panel.textContent = '';
  panel.hidden = true;
}

// 스킬의 수치. 종류마다 보여야 하는 것이 다르다 — 회복 스킬에 "피해 배수"를
// 적을 수 없고, 도트에 한 번의 값을 적으면 실제로 들어가는 양이 가려진다.
function skillLines(def) {
  const lines = [];
  if (def.heal) lines.push(`한 번에 ${def.heal} 회복`);
  if (def.mul) lines.push(`공격력의 ×${def.mul}`);
  if (def.tick) {
    const total = Math.round(def.tick * (def.duration / (def.interval || 1)));
    const what = def.kind === 'heal-dot' ? '회복' : '피해';
    lines.push(`${def.interval || 1}초마다 ${def.tick} ${what} · ${def.duration}초 (합계 ${total})`);
  }
  if (def.mana) lines.push(def.kind === 'mana' ? `자기 마나 ${def.mana} 회복` : `아군 마나 ${def.mana} 회복`);
  if (def.kind === 'stun') lines.push(`${def.duration}초 동안 굳힌다 · 외우던 스킬도 끊긴다`);
  if (def.kind === 'taunt' || def.kind === 'taunt-area') lines.push(`${def.duration}초 동안 어그로를 붙든다`);
  if (def.radius) lines.push(`반경 ${def.radius} 안을 함께 친다`);
  lines.push(`마나 ${def.mp} · 쿨타임 ${def.cd}초 · ${castLine(def)}`);
  return lines;
}

function potionLines(potion) {
  return [`최대 ${potion.restore === 'hp' ? '체력' : '마나'}의 ${Math.round(potion.ratio * 100)}%를 채운다`,
    `쿨타임 ${potion.cd}초`];
}

// 등급은 이름에 이미 붙어 있고 색으로도 읽히므로 다시 적지 않는다.
function gearLines(item) {
  const options = Items.summary(item);
  return [options || '붙은 옵션이 없다'];
}

function closeMember() {
  app.member = null;
  $('member-sheet').hidden = true;
}

function renderSkillPicks() {
  const list = $('skill-picks');
  list.textContent = '';

  for (const base of P.learnedSkills(app.progress)) {
    // 등록 화면에도 지금 레벨의 수치가 떠야 한다. 정의를 그대로 보면 레벨을
    // 올린 스킬이 1레벨의 마나를 먹는 것으로 보인다.
    const def = P.skillDef(app.progress, base.id);
    const level = P.skillLevel(app.progress, base.id);
    const picked = app.skills.includes(def.id);
    const full = app.skills.length >= D.SKILL_MAX;

    const button = el('button', 'pick');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(picked));
    button.disabled = !picked && full;
    button.append(icon(def.icon, 'icon'));

    const body = el('div', 'pick-body');
    const name = el('div', 'pick-name');
    name.append(document.createTextNode(def.name));
    name.append(text('span', 'job', def.type));
    if (level > 1) name.append(text('span', 'job', `Lv ${level}`));
    // **다른 계열에서 배운 것도 들고 갈 수 있다.** 어디서 온 것인지 안 적으면
    // 지금 계열의 목록에 없는 스킬이 왜 여기 있는지 알 수 없다.
    if (base.job !== app.progress.job) {
      name.append(text('span', 'job dim', D.heroJob(base.job).name));
    }
    body.append(name);
    body.append(text('div', 'pick-sub', D.skillEffect(def)));
    body.append(text('div', 'pick-sub dim', def.desc));
    button.append(body);

    const cost = text('span', 'pick-cost', `${def.mp ? `마나 ${def.mp}` : '마나 없음'}\n쿨 ${def.cd}초`);
    cost.style.whiteSpace = 'pre-line';
    button.append(cost);

    button.addEventListener('click', () => {
      sound.play('click');
      if (picked) app.skills = app.skills.filter((id) => id !== def.id);
      else if (!full) app.skills.push(def.id);
      rememberSkills();
      renderSkillPicks();
      updateStart();
    });

    const item = el('li');
    item.append(button);
    list.append(item);
  }
  // **배운 것이 하나도 없을 수 있다** — 막 전직한 직후가 그렇다. 빈 목록만 두면
  // "전투 시작"이 꺼져 있는 이유가 화면에 없다.
  if (!list.children.length) {
    const empty = el('li');
    empty.append(text('div', 'pick-sub',
      '배운 스킬이 없다. 캐릭터 화면에서 스킬 점수로 배운다.'));
    list.append(empty);
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
      // 스킬 등록과 같다 — 고르는 순간 저장한다.
      app.progress.lootMethod = method.id;
      persist();
      renderMethods();
    });
    box.append(button);
  }
}

// 등록해 둔 스킬을 저장본에 남긴다. 전투가 끝나야 저장하던 때에는 편성만 하고
// 나가면 다음에 다시 골라야 했다.
function rememberSkills() {
  app.progress.skills = app.skills.slice();
  persist();
}

function updateStart() {
  $('start').disabled = app.skills.length === 0;
}

function openParty(quest) {
  app.quest = quest;
  app.candidates = Q.companionsFor(quest, app.progress.roster, app.progress.questSeed + quest.level);
  app.party = [];
  // 지난번에 등록해 둔 것이 저장본에 남아 있다. 처음이면 열린 것을 앞에서부터
  // 채워 준다 — 빈 채로 두면 "전투 시작"이 꺼져 있는 이유를 알 수 없다.
  app.lootMethod = Loot.METHODS[app.progress.lootMethod] ? app.progress.lootMethod : 'even';
  const remembered = app.skills.length ? app.skills : app.progress.skills;
  app.skills = P.validSkills(app.progress, remembered.length
    ? remembered
    : P.learnedSkills(app.progress).map((def) => def.id));
  rememberSkills();

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
  if (Sprites.sheet(unit.sprite)) {
    node.append(sheetBody(unit.sprite, 'sprite'));
  } else {
    node.insertAdjacentHTML('beforeend', Sprites.svg(unit.sprite));
  }
  node.style.width = `${(UNIT_WIDTH * Sprites.size(unit.sprite).w) / 18}%`;

  const bar = el('div', 'hpbar');
  bar.append(el('span'));
  node.append(bar);

  // 시전 막대. 누가 무엇을 외우고 있는지 보이지 않으면 캐스팅과 즉시 시전을
  // 나눈 것이 화면에서는 그냥 "가끔 늦게 나가는 스킬"로만 보인다.
  const cast = el('div', 'castbar');
  cast.append(el('span'));
  node.append(cast);

  field.append(node);
  unitNodes.set(unit.uid, node);
  return node;
}

// 그림 파일 유닛의 프레임 고르기. **로직에 새 이벤트를 만들지 않았다** —
// 걷는지는 좌표가 움직였는지로, 때리는지는 다음 공격 시각이 밀렸는지로 안다.
// 전투 규칙은 화면이 몇 프레임짜리 그림을 쓰는지 알 필요가 없다.
// 걷는다고 볼 속도(격자/초)와 그 뒤로 걷기를 이어 두는 시간. 이어 두지 않으면
// 걸음을 멈추는 자리마다 한두 프레임씩 서는 자세가 끼어든다.
const WALK_MIN = 3.6;
const WALK_HOLD = 0.2;

function syncSheet(node, unit, state) {
  const wrap = node.querySelector('.sprite.filmstrip');
  if (!wrap) return;
  const info = Sprites.sheet(wrap.dataset.kind);
  const d = wrap.dataset;

  const next = unit.nextAttackAt || 0;
  if (Number(d.next || 0) < next) { d.next = next; d.swing = state.t; }

  // **걸음은 프레임이 아니라 전투 시각으로 잰다.** 전투는 초당 30번 돌고 화면은
  // 그보다 자주 그려서, 좌표가 그대로인 프레임이 사이사이 섞인다. 프레임 사이의
  // 차이로 재면 그 프레임마다 서 있는 자세가 끼어들어 걷기가 떨렸다. 전투 시각이
  // 안 움직인 프레임은 아예 재지 않는다.
  if (d.pt === undefined) { d.pt = state.t; d.px = unit.x; }
  const span = state.t - Number(d.pt);
  if (span > 0) {
    const speed = (unit.x - Number(d.px)) / span;
    if (Math.abs(speed) > WALK_MIN) { d.walk = state.t; d.dir = speed > 0 ? 1 : -1; }
    d.px = unit.x;
    d.pt = state.t;
  }
  const walking = state.t - Number(d.walk === undefined ? -99 : d.walk) < WALK_HOLD;

  const atk = info.clips.attack;
  const swung = state.t - Number(d.swing === undefined ? -99 : d.swing);
  let name = 'idle';
  // 외우는 동안은 준비 자세로 선다. 시전 막대만으로는 무엇을 하는지 안 보인다.
  if (!unit.dead && unit.cast) name = 'attack';
  else if (!unit.dead && swung < atk.frames / atk.fps) name = 'attack';
  // **무리 사이에는 좌표가 움직이지 않는데도 걷는 중이다.** 대열은 이미 제자리라
  // x가 그대로고, 흘러가는 것은 배경이다. 좌표만 보면 다른 동료가 흔들리며 가는
  // 옆에서 주인공만 선 채로 미끄러진다.
  else if (!unit.dead && state.marching && unit.side === 'ally') name = 'walkRight';
  // **대열을 벌리는 힘(separate)은 걷는 것이 아니다.** 문턱이 없으면 가만히 선
  // 유닛이 걷는 자세로 떤다.
  else if (!unit.dead && walking) name = Number(d.dir) > 0 ? 'walkRight' : 'walkLeft';

  const clip = info.clips[name];
  let frame = 0;
  if (name === 'attack') {
    frame = unit.cast ? 0 : Math.min(clip.frames - 1, Math.floor(swung * clip.fps));
  } else if (clip.fps > 0) {
    frame = Math.floor(state.t * clip.fps) % clip.frames;
  }
  setFrame(wrap, frame, clip.row);
}

function syncUnits(state) {
  for (const unit of state.units) {
    // 무리 사이에 치운 시체를 다시 만들지 않는다.
    if (unit.dead && !unitNodes.has(unit.uid)) continue;
    const node = unitNodes.get(unit.uid) || makeUnitNode(unit);
    node.style.left = `${pctX(unit.x)}%`;
    node.style.top = `${pctY(unit.y)}%`;
    node.classList.toggle('dead', unit.dead);
    node.classList.toggle('low', unit.hp / unit.maxHp <= 0.3);
    node.querySelector('.hpbar span').style.width = `${(unit.hp / unit.maxHp) * 100}%`;
    node.classList.toggle('valid', Boolean(app.aiming) && isValidUnitTarget(state, unit));
    // 굳은 동안에는 아무것도 하지 않는다. 화면이 그것을 보여 주지 않으면 그 몇
    // 초가 "왜 가만히 있지"로만 보인다 — 기절이 있다는 것 자체를 알 수 없다.
    node.classList.toggle('stunned', !unit.dead && L.stunned(state, unit));
    syncSheet(node, unit, state);

    const cast = unit.cast;
    const bar = node.querySelector('.castbar');
    bar.hidden = !cast || unit.dead;
    if (cast && !unit.dead) {
      const span = Math.max(0.001, cast.endsAt - cast.startedAt);
      const done = Math.min(1, (state.t - cast.startedAt) / span);
      bar.firstChild.style.width = `${done * 100}%`;
    }
  }
}

function syncZones(state) {
  const seen = new Set();
  for (const zone of state.zones) {
    seen.add(zone.id);
    let node = zoneNodes.get(zone.id);
    if (!node) {
      node = el('div', `zone ${zone.kind === 'heal' ? '' : 'damage'}`);
      node.style.top = `${pctY(zone.y)}%`;
      node.style.width = `${pctX(zone.radius * 2)}%`;
      node.style.height = `${pctY(zone.radius * 2)}%`;
      field.append(node);
      zoneNodes.set(zone.id, node);
    }
    // 가로 자리는 매 프레임 다시 잡는다. 장판은 바닥에 붙어 있어 무리 사이를
    // 걸어가는 동안 배경과 함께 뒤로 흘러간다(`L.zoneX`).
    node.style.left = `${pctX(L.zoneX(state, zone))}%`;
  }
  for (const [id, node] of zoneNodes) {
    if (seen.has(id)) continue;
    node.remove();
    zoneNodes.delete(id);
  }
}

function floatText(unit, label, cls) {
  const node = text('div', `float ${cls}`, label);
  return place(node, unit);
}

// 시전 아이콘은 글자가 아니라 그림이라 같은 자리에 다른 내용을 넣는다.
function floatIcon(unit, name, cls) {
  const node = el('div', `float ico-float ${cls}`);
  node.innerHTML = Icons.svg(name);
  return place(node, unit);
}

function place(node, unit) {
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

// 초상화는 아군과 적 두 줄이다. 적 줄이 없을 때에는 누가 몇이나 남았는지를
// 전장에서 세어야 했는데, 뭉쳐 싸우는 화면에서 그것은 세어지지 않는다. 적
// 초상화는 적을 겨냥하는 스킬의 대상 자리이기도 하다.
function makePortrait(unit) {
  const button = el('button', `portrait ${unit.side}`);
  button.type = 'button';
  button.dataset.uid = unit.uid;
  if (unit.uid === L.HERO_UID) button.classList.add('is-hero');
  // 초상화는 머리만 보여 준다. 전신을 30px 안에 넣으면 얼굴이 몇 픽셀뿐이다.
  button.append(avatar(unit.sprite, 'head'));
  button.append(text('span', 'pname', unit.name));

  const hp = el('div', 'bar');
  hp.append(el('span'));
  button.append(hp);

  // 동료도 마나를 쓰므로 마나가 보여야 한다. 사제가 왜 가만히 있는지가
  // 화면에 없으면 고장 난 것처럼 보인다. 마나가 없는 유닛에게는 빈 자리를
  // 두지 않는다 — 지금은 없지만 앞으로 생길 수 있어서 클래스로 가른다.
  const mp = el('div', 'bar mp thin');
  mp.append(el('span'));
  mp.hidden = unit.maxMp <= 0;
  button.append(mp);

  // 걸려 있는 강화·약화. 아이콘까지 늘어놓으면 다섯 칸짜리 줄이 그것으로
  // 덮이므로 점으로만 둔다 — 색이 좋은 쪽인지 나쁜 쪽인지를 알린다.
  button.append(el('div', 'auras'));

  // 피해와 회복이 뜨는 자리. 전장에서 유닛이 뭉쳐 있으면 누가 맞았는지 숫자가
  // 겹쳐 읽히지 않아서, 초상화 위에도 같은 숫자를 띄운다.
  button.append(el('div', 'pops'));

  button.addEventListener('click', () => onPortrait(unit.uid));
  const item = el('li');
  item.append(button);
  return item;
}

function renderPortraits(state) {
  for (const [id, side] of [['enemy-portraits', 'enemy'], ['portraits', 'ally']]) {
    const list = $(id);
    list.textContent = '';
    for (const unit of state.units.filter((u) => u.side === side && !u.dead)) {
      list.append(makePortrait(unit));
    }
  }
}

function syncPortraitList(state, id) {
  for (const item of $(id).children) {
    const button = item.firstElementChild;
    const unit = AI.byUid(state, button.dataset.uid);
    if (!unit) continue;
    const bar = button.querySelector('.bar');
    bar.firstElementChild.style.width = `${(unit.hp / unit.maxHp) * 100}%`;
    bar.classList.toggle('low', unit.hp / unit.maxHp <= 0.3);
    const mana = button.querySelector('.bar.mp');
    if (unit.maxMp > 0) mana.firstElementChild.style.width = `${(unit.mp / unit.maxMp) * 100}%`;
    button.classList.toggle('dead', unit.dead);
    button.classList.toggle('casting', Boolean(unit.cast));
    button.classList.toggle('valid', Boolean(app.aiming) && isValidUnitTarget(state, unit));
    syncAuras(button, unit);
  }
}

// 걸린 것과 그려진 것이 다를 때만 다시 그린다. 매 틱 통째로 갈아 끼우면
// 초상화 다섯 개가 초당 30번 새로 만들어진다.
function syncAuras(button, unit) {
  const box = button.querySelector('.auras');
  const now = (unit.auras || []).map((aura) => (aura.buff ? 'boon' : 'wilt')).join(' ');
  if (box.dataset.on === now) return;
  box.dataset.on = now;
  box.textContent = '';
  for (const aura of unit.auras || []) {
    box.append(el('span', `aura-dot ${aura.buff ? 'boon' : 'wilt'}`));
  }
}

function syncPortraits(state) {
  syncPortraitList(state, 'portraits');
  syncPortraitList(state, 'enemy-portraits');
}

// 초상화 위에 뜨는 숫자. 전장의 숫자와 같은 값이고, 뭉쳐 싸울 때 그쪽이
// 겹쳐 읽히지 않아 여기에도 띄운다.
function popPortrait(uid, label, cls) {
  const button = document.querySelector(`.portrait[data-uid="${uid}"]`);
  if (!button) return;
  const node = text('div', `pop ${cls}`, label);
  button.querySelector('.pops').append(node);
  node.addEventListener('animationend', () => node.remove());
}

// 전투 화면이 보는 스킬은 전부 지금 레벨의 것이다. 정의를 직접 보면 마나와
// 회복량이 1레벨의 값으로 뜬다. 전투 중에는 레벨이 바뀌지 않으므로 진행
// 상태에서 읽어도 전투가 굳혀 둔 값과 같다.
const heroSkill = (id) => P.skillDef(app.progress, id);

function renderSkillbar() {
  const bar = $('skillbar');
  bar.textContent = '';

  for (const id of app.skills) {
    const def = heroSkill(id);
    const button = el('button', 'slot');
    button.type = 'button';
    button.dataset.skill = id;
    button.setAttribute('aria-pressed', 'false');
    button.append(icon(def.icon, 'glyph'));
    button.append(text('span', 'sname', def.name));
    button.append(text('span', 'cost', def.mp ? String(def.mp) : '－'));
    const cool = el('div', 'cool');
    cool.style.transform = 'scaleY(0)';
    button.append(cool);
    button.addEventListener('click', () => onSkill(id));
    bar.append(button);
  }

  // 물약은 스킬이 아니라 아이템이지만 손이 가는 자리는 같아야 한다.
  // 들고 온 것만 자리를 차지한다 — 없는 물약이 회색으로 남아 있으면 스킬 칸만 좁아진다.
  for (const potion of Object.values(D.POTIONS)) {
    if (!(app.battle.potions[potion.id] > 0)) continue;
    const button = el('button', 'slot');
    button.type = 'button';
    button.dataset.potion = potion.id;
    button.append(icon(potion.icon, 'glyph'));
    button.append(text('span', 'sname', potion.name));
    button.append(text('span', 'cost', `×${app.battle.potions[potion.id]}`));
    const cool = el('div', 'cool');
    cool.style.transform = 'scaleY(0)';
    button.append(cool);
    button.addEventListener('click', () => onPotion(potion.id));
    bar.append(button);
  }
}

function syncSkillbar(state) {
  const hero = L.hero(state);
  for (const button of $('skillbar').children) {
    const cool = button.querySelector('.cool');
    if (button.dataset.potion) {
      const potion = D.POTIONS[button.dataset.potion];
      const left = Math.max(0, state.potionReadyAt - state.t);
      cool.style.transform = `scaleY(${left / potion.cd})`;
      const held = state.potions[potion.id] || 0;
      button.querySelector('.cost').textContent = `×${held}`;
      button.classList.toggle('short', held === 0);
      continue;
    }
    const def = heroSkill(button.dataset.skill);
    const slot = L.skillSlot(state, button.dataset.skill);
    const left = Math.max(0, slot.readyAt - state.t);
    cool.style.transform = `scaleY(${left / def.cd})`;
    button.classList.toggle('short', hero.mp < def.mp);
    button.setAttribute('aria-pressed', String(app.aiming === def.id));
  }

  // 주인공이 쓰러져도 전투는 이어진다. 스킬이 왜 안 나가는지가 화면에 없으면
  // 고장 난 것으로 보인다. **굳은 동안에도 마찬가지다.**
  $('skillbar').classList.toggle('down', hero.dead || L.stunned(state, hero));

  const share = hero.hp / hero.maxHp;
  $('hero-hp-fill').style.width = `${Math.max(0, share) * 100}%`;
  $('hero-hp-text').textContent = `체력 ${Math.max(0, Math.round(hero.hp))} / ${hero.maxHp}`;
  $('hero-hp-fill').parentNode.classList.toggle('low', share <= DANGER.on);
  $('hero-mp-fill').style.width = `${(hero.mp / hero.maxMp) * 100}%`;
  $('hero-mp-text').textContent = `마나 ${Math.round(hero.mp)} / ${hero.maxMp}`;

  syncDanger(hero, share);
}

// **주인공이 위험하다는 것을 화면이 알린다.** 주인공은 힐이 끊긴 채로 몇 초에
// 걸쳐 죽는데, 눈은 전장과 스킬바에 있어서 그 몇 초가 통째로 보이지 않았다.
// 켜는 선과 끄는 선을 다르게 둔 것은, 한 선만 쓰면 그 언저리에서 경고가
// 깜빡이며 켜졌다 꺼졌다 하기 때문이다.
const DANGER = { on: 0.35, off: 0.5 };

function syncDanger(hero, share) {
  const danger = !hero.dead && share <= DANGER.on;
  // 소리는 들어올 때 한 번뿐이고, 끄는 선 위로 되짚어 올라와야 다시 무장한다.
  if (danger && !app.danger) { sound.play('danger'); app.danger = true; }
  if (hero.dead || share > DANGER.off) app.danger = false;

  $('hero-bars').classList.toggle('danger', danger);
  $('field').classList.toggle('danger', danger);
}

// --- 조준과 조작 -------------------------------------------------------

const AIM_HINT = {
  ally: '회복할 대상을 고른다 — 초상화나 전투 화면의 아군',
  enemy: '적을 고른다 — 적 초상화나 전투 화면의 적',
  'area-ally': '기준점을 고른다 — 동료 초상화 또는 전투 화면의 위치',
  'area-enemy': '기준점을 고른다 — 적 초상화 또는 전투 화면의 위치',
};

// 사거리 밖은 고를 수 있는 대상이 아니다. 눌러 보고 나서야 "사거리 밖"이라고
// 알려 주면, 그동안 쿨타임이 도는 다른 스킬을 놓친다.
function isValidUnitTarget(state, unit) {
  if (!app.aiming || unit.dead) return false;
  const def = heroSkill(app.aiming);
  const side = (def.targeting === 'ally' || def.targeting === 'area-ally') ? 'ally'
    : (def.targeting === 'enemy' || def.targeting === 'area-enemy') ? 'enemy' : null;
  if (unit.side !== side) return false;
  return AI.dist(L.hero(state), unit) <= def.range;
}

function setAiming(skillId) {
  app.aiming = skillId;
  const def = skillId ? heroSkill(skillId) : null;
  field.classList.toggle('aiming', Boolean(skillId));
  document.body.classList.toggle('aiming-mode', Boolean(skillId));
  $('aim-hint').hidden = !def;
  if (def) $('aim-hint').textContent = `${def.name} — ${AIM_HINT[def.targeting]}`;
  if (!def) $('aim').hidden = true;
}

function onSkill(skillId) {
  const state = app.battle;
  if (!state || state.status !== 'fighting') return;
  const def = heroSkill(skillId);

  if (app.aiming === skillId) { sound.play('click'); setAiming(null); return; }

  // 대상이 필요 없는 스킬은 조준 단계 없이 바로 나간다. 한 번 더 누르게 하면
  // 마나가 급할 때 손이 늦는다.
  if (def.targeting === 'self') { cast(skillId, {}); return; }

  // 못 쓰는 이유를 적어 준다. 소리만 내고 말면 스킬을 눌러도 조준이 시작되지
  // 않는 것으로만 보이고, 이어서 초상화를 눌러도 아무 일이 없는 것이 된다.
  const slot = L.skillSlot(state, skillId);
  if (state.t < slot.readyAt) { sound.play('deny'); note('쿨타임'); return; }
  if (L.hero(state).mp < def.mp) { sound.play('deny'); note('마나 부족'); return; }
  sound.play('click');
  setAiming(skillId);
}

function onPotion(potionId) {
  const state = app.battle;
  if (!state) return;
  const result = L.usePotion(state, potionId);
  sound.play(result.ok ? (potionId === 'health' ? 'heal' : 'mana') : 'deny');
  if (!result.ok) note(result.reason);
}

// 초상화는 아군을 살리는 자리이자 적을 치는 자리다. 스킬을 고르지 않은 채
// 누르면 아무 일도 일어나지 않는데, 그것이 초상화를 누를 수 없는 것으로 읽힌다.
function onPortrait(uid) {
  if (!app.battle) return;
  if (!app.aiming) { sound.play('click'); note('스킬을 먼저 고른다'); return; }
  cast(app.aiming, { uid });
}

function cast(skillId, target) {
  const def = heroSkill(skillId);
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
  const state = app.battle;
  if (!state || state.status !== 'fighting' || !app.aiming) return;

  const rect = field.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * D.FIELD.w;
  const y = ((event.clientY - rect.top) / rect.height) * D.FIELD.h;
  const def = heroSkill(app.aiming);

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
  const def = app.aiming ? heroSkill(app.aiming) : null;
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

// 무리 사이에 배경을 흘린다. 유닛 좌표는 그대로 두고 배경만 미는 것이라
// 사거리와 장판 반경은 아무 영향을 받지 않는다.
function syncScene(state) {
  const shift = (state.scroll || 0) % D.FIELD.w;
  $('scene').style.transform = `translateX(${-(shift / D.FIELD.w) * 50}%)`;
  field.classList.toggle('marching', Boolean(state.marching));
}

// 조준 중인 스킬의 사거리를 주인공 발밑에 그린다. 주인공이 저절로 움직이므로
// 매 프레임 따라다녀야 한다.
function syncReach(state) {
  const reach = $('reach');
  const def = app.aiming ? heroSkill(app.aiming) : null;
  if (!def || !def.range) { reach.hidden = true; return; }
  const hero = L.hero(state);
  reach.hidden = false;
  reach.style.left = `${pctX(hero.x)}%`;
  reach.style.top = `${pctY(hero.y)}%`;
  reach.style.width = `${pctX(def.range * 2)}%`;
  reach.style.height = `${pctY(def.range * 2)}%`;
}

function note(label) {
  $('log').textContent = label;
}

// --- 전투 진행 ---------------------------------------------------------

let raf = 0;
let lastFrame = 0;

function handleEvents(state, events) {
  for (const event of events) {
    if (event.type === 'dodge') {
      const unit = AI.byUid(state, event.uid);
      if (unit) floatText(unit, '빗나감', 'miss');
      continue;
    }
    if (event.type === 'damage' || event.type === 'heal') {
      const unit = AI.byUid(state, event.uid);
      if (unit && event.amount > 0) {
        const heal = event.type === 'heal';
        // 치명타는 느낌표와 큰 글자로 가른다. 색만 다르게 하면 피해·회복과
        // 헷갈리고, 숫자만 크게 하면 그냥 많이 맞은 것으로 보인다.
        const kind = `${heal ? 'heal' : 'harm'}${event.crit ? ' crit' : ''}`;
        const label = `${heal ? '+' : '−'}${event.amount}${event.crit ? '!' : ''}`;
        floatText(unit, label, kind);
        popPortrait(unit.uid, label, kind);
      }
      continue;
    }
    if (event.type === 'cast') {
      // 누가 무엇을 썼는지가 글자로만 지나가면 전투를 보면서는 못 읽는다.
      // 시전한 유닛 머리 위로 그 스킬의 아이콘을 띄운다.
      const caster = AI.byUid(state, event.uid);
      if (caster && event.icon) floatIcon(caster, event.icon, `skill ${event.css || ''}`);
      if (event.skillId) {
        if (event.radius) pulse(event.x, event.y, event.radius, event.skillId === 'pyre' ? 'harm' : '');
      } else {
        // 동료가 쓴 스킬은 글자로만 알린다. 소리까지 겹치면 내 조작음이 묻힌다.
        note(event.text);
      }
      continue;
    }
    // 기절은 지속 상태라 유닛에 테가 돌지만(syncUnits), 걸린 순간은 글자로도
    // 알린다 — 굳는 것이 몇 초뿐이라 놓치면 무엇이 일어났는지 알 수 없다.
    if (event.type === 'stun') {
      const target = AI.byUid(state, event.uid);
      if (target) floatText(target, '기절', 'miss');
      note(event.text);
      continue;
    }
    // 강화·약화가 걸린 순간. 지속 상태는 초상화의 점이 알리지만, 걸린 순간이
    // 화면에 없으면 점이 언제 왜 생겼는지 알 수 없다.
    if (event.type === 'aura') {
      const target = AI.byUid(state, event.uid);
      if (target) floatIcon(target, event.icon, `skill ${event.buff ? 'boon' : 'wilt'}`);
      continue;
    }
    if (event.type === 'death') {
      note(event.text);
      if (event.side === 'ally') sound.play('down');
      continue;
    }
    // 다음 무리를 찾아 나선다. 쓰러진 적을 치우지 않으면 걸어서 다른 곳에 온
    // 것인데 시체가 따라온 꼴이 된다.
    if (event.type === 'march') {
      for (const [uid, node] of unitNodes) {
        const unit = AI.byUid(state, uid);
        if (unit && unit.dead) { node.remove(); unitNodes.delete(uid); }
      }
      note(event.text);
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
  syncReach(state);
  syncScene(state);

  if (state.status !== 'fighting') finishBattle(state);
}

function startBattle() {
  field.querySelectorAll('.unit, .zone, .float, .pulse').forEach((node) => node.remove());
  unitNodes.clear();
  zoneNodes.clear();

  // 배경은 전투당 한 번만 만든다. 씨앗을 퀘스트에 묶어 두어 같은 퀘스트가 늘
  // 같은 모습이 되게 했다 — 다시 도전할 때마다 돌 배치가 바뀌면 다른 곳으로 보인다.
  // 두 장을 이어 붙인다. 무리 사이에 배경을 흘릴 때 한 장 폭만큼 밀린 자리에서
  // 되감아야 이음매가 안 보이는데, 같은 그림 두 장이면 그 자리가 정확히 맞는다.
  const scene = Scenes.svg(app.quest.scene, app.quest.id.length * 977 + app.quest.level);
  $('scene').innerHTML = scene + scene;
  $('scene').style.transform = 'translateX(0)';

  app.battle = L.createBattle({
    quest: app.quest,
    party: app.party.map(Roster.toParty),
    skills: app.skills,
    heroStats: P.stats(app.progress),
    skillLevels: P.skillLevels(app.progress),
    heroLevel: app.progress.charLevel,
    // 상점에서 사서 채운 것이 그대로 들어간다. 전투에서 쓴 만큼은 돌아오지 않는다.
    potions: Object.assign({}, app.progress.potions),
    seed: (Math.random() * 1e9) | 0,
  });
  app.lootSeed = (Math.random() * 1e9) | 0;

  setAiming(null);
  app.danger = false;
  $('hero-bars').classList.remove('danger');
  $('field').classList.remove('danger');
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
  // 전리품은 쓰러뜨린 적에게서 굴린다. **한 번만 굴린다** — 전투의 난수를 쓰는
  // 함수라 다시 부르면 다른 것이 나온다.
  const drops = L.dropsOf(state);

  $('verdict').textContent = won ? '퀘스트 완료' : '퀘스트 실패';
  $('verdict').className = `verdict ${won ? 'won' : 'lost'}`;

  const survived = members.filter((m) => !AI.byUid(state, m.id).dead).length;
  $('verdict-note').textContent = `${Math.round(state.t)}초 · 회복 ${Math.round(state.stats.healed)}`
    + ` (흘린 힐 ${Math.round(state.stats.overheal)}) · 스킬 ${state.stats.casts}회`
    + ` · 생존 ${survived}/${members.length}`;

  // 경험치를 먼저 넣는다. 레벨이 오른 뒤라야 아래에서 계산하는 스탯이 맞다.
  const before = { char: app.progress.charLevel, job: P.jobLevel(app.progress) };
  const job = D.heroJob(app.progress.job);
  const gained = P.addExp(app.progress, reward.charExp, reward.jobExp);
  app.progress.gold += reward.gold;

  // 전투에서 마신 물약은 돌아오지 않는다. 상점에서 사는 것이 뜻을 가지려면
  // 쓴 만큼 줄어야 한다.
  app.progress.potions = Object.assign({}, state.potions);

  // 명부 전체가 자란다. 데려간 쪽은 전부, 남은 쪽은 다른 파티에서 일한 몫만.
  const roster = Roster.awardExp(app.progress.roster, app.party.map((m) => m.name),
    reward.charExp, (Math.random() * 1e9) | 0);

  const expList = $('exp-gained');
  expList.textContent = '';
  expList.append(levelRow(`캐릭터 +${reward.charExp}`, app.progress.charLevel, app.progress.charExp,
    app.progress.charLevel >= D.LEVEL.maxLevel ? 0 : D.LEVEL.charExpTo(app.progress.charLevel)));
  const jobLv = P.jobLevel(app.progress);
  const jobMax = D.jobMaxLevel(app.progress.job);
  expList.append(levelRow(`${job.name} +${reward.jobExp}`, jobLv, P.jobExpOf(app.progress),
    jobLv >= jobMax ? 0 : D.LEVEL.jobExpTo(jobLv)));

  const lines = [`처치 ${reward.kills} · 모험가 길드 ${reward.guild} · 회복 ${reward.healExp}`];
  if (gained.charLevels) lines.push(`캐릭터 레벨 ${before.char} → ${app.progress.charLevel}`);
  if (gained.jobLevels) lines.push(`${job.name} 레벨 ${before.job} → ${jobLv}`);
  if (gained.unlocked.length) {
    lines.push(`배울 수 있는 스킬: ${gained.unlocked.map((def) => def.name).join(', ')}`);
  }
  $('exp-note').textContent = lines.join(' · ');

  $('guild-panel').hidden = !won;
  $('drop-panel').hidden = !won;
  $('gain-panel').hidden = !won;
  $('roster-panel').hidden = false;
  // 깬 의뢰는 게시판에서 사라진다. 다시 도전을 남겨 두면 같은 의뢰의 보상을
  // 몇 번이고 받을 수 있다.
  $('retry').hidden = won;

  if (won) {
    const guild = $('guild-loot');
    guild.textContent = '';
    const gold = el('li');
    gold.append(icon('coin'));
    gold.append(text('span', null, `${quest.guildReward.gold} 골드`));
    guild.append(gold);

    const method = Loot.METHODS[app.lootMethod];
    $('method-name').textContent = method.name;
    const result = Loot.distribute(drops, members, app.lootMethod, app.lootSeed);

    const awards = $('awards');
    awards.textContent = '';
    // 아무것도 안 떨어질 수 있다. 빈 목록을 그냥 두면 분배가 고장 난 것으로 보인다.
    if (!result.awards.length) {
      const none = el('li');
      none.append(text('span', null, '·'));
      none.append(text('span', 'why', '이번에는 아무것도 나오지 않았다'));
      awards.append(none);
    }
    for (const award of result.awards) {
      const def = Items.def(award.item);
      const owner = members.find((m) => m.id === award.toId);
      const row = el('li');
      row.append(icon(def.icon));
      row.append(itemName(award.item));
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
      const added = P.addItem(app.progress, item);
      if (added.sold) sold += added.gold;
      else mine.push(item);
    }
    renderGained(mine, sold);

    // 동료 몫은 그 동료가 실제로 가져간다. 이것이 없으면 직업 우선 분배가
    // 결과 화면의 글자로만 남는다. 전투 유닛과 명부는 이름으로 잇는다 —
    // 이름이 곧 신원이라 자리 번호로 잇는 것보다 어긋날 일이 없다.
    for (const award of result.awards) {
      if (award.toId === L.HERO_UID || !Items.isGear(award.item)) continue;
      const taker = members.find((m) => m.id === award.toId);
      const member = taker && app.party.find((entry) => entry.name === taker.name);
      if (member) Roster.offerGear(member, award.item);
    }
  }

  // 깬 의뢰는 게시판에서 사라지고 새 의뢰가 걸린다. 상점 진열대도 함께 바뀐다.
  let joined = null;
  if (won) {
    app.progress.cleared++;
    app.progress.questSeed = (Math.random() * 1e9) | 0;
    app.progress.shopSeed = (Math.random() * 1e9) | 0;
    joined = Roster.maybeJoin(app.progress.roster, app.progress.charLevel, (Math.random() * 1e9) | 0);
    refreshQuests();
  }

  renderBattleReport(L.battleReport(state));
  renderRosterReport(roster, joined);
  persist();
  show('result', quest.name);
}

// 캐릭터별로 준 피해·받은 피해·힐량. 흘린 힐은 힐을 넣은 캐릭터에게만 붙인다 —
// 0을 다 적으면 딜러 줄까지 힐 이야기가 되어 읽는 눈이 흩어진다.
function renderBattleReport(rows) {
  const list = $('battle-report');
  list.textContent = '';

  const head = el('li', 'head-row');
  head.append(text('span', 'rname', '캐릭터'));
  for (const label of ['준 피해', '받은 피해', '힐량']) head.append(text('span', null, label));
  list.append(head);

  for (const row of rows) {
    const line = el('li');
    const name = el('span', 'rname');
    name.append(document.createTextNode(row.name));
    if (row.dead) name.append(text('span', 'why', ' 쓰러짐'));
    line.append(name);
    line.append(text('b', 'stat-value', String(row.dealt)));
    line.append(text('b', 'stat-value', String(row.taken)));
    const heal = text('b', 'stat-value', String(row.healed));
    if (row.overheal) heal.append(text('small', 'why', ` +${row.overheal}`));
    line.append(heal);
    list.append(line);
  }
}

function renderRosterReport(report, joined) {
  const list = $('roster-report');
  list.textContent = '';

  // **데려간 동료만 적는다.** 남은 동료도 다른 파티에서 일한 몫을 받지만, 이
  // 화면은 방금 끝난 전투의 결과를 읽는 자리다. 명부 전체를 적으면 나가지도
  // 않은 이름이 목록의 대부분을 차지해 정작 데려간 넷이 묻힌다. 그쪽의 성장은
  // 편성 화면의 레벨로 확인한다.
  const rows = report.filter((entry) => entry.joined);
  for (const entry of rows) {
    const member = app.progress.roster.find((m) => m.name === entry.name);
    const row = el('li');
    const name = el('span');
    name.append(document.createTextNode(entry.name));
    row.append(name);
    const value = `+${entry.exp} exp${entry.levels ? ` · Lv ${member.level}` : ''}`;
    row.append(text('b', `stat-value${entry.levels ? ' up' : ''}`, value));
    list.append(row);
  }

  if (joined) {
    const row = el('li');
    row.append(text('span', null, `${joined.name} 합류`));
    row.append(text('b', 'stat-value up', `Lv ${joined.level}`));
    list.append(row);
  }
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
    const row = el('li');
    row.append(itemButton(item, {
      label: '장착',
      run: () => {
        sound.play('click');
        P.equip(app.progress, item.uid);
        persist();
        renderGained(items.filter((entry) => entry !== item), sold, true);
      },
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

$('member-close').addEventListener('click', () => { sound.play('click'); closeMember(); });
$('member-take').addEventListener('click', () => { if (app.member) toggleMember(app.member); });

$('help-open').addEventListener('click', () => {
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


refreshQuests();
openHome('quest');

})();

'use strict';

// 화면과 조작. 규칙은 battle.js(싸움)와 run.js(여정), 자료는 data.js, 그림은 art.js에 있고
// 여기서는 그것들을 부르고 그린다.
(function () {

const D = window.AmhaengData;
const B = window.AmhaengBattle;
const R = window.AmhaengRun;
const Art = window.AmhaengArt;
const Sound = window.AmhaengSound;
const t = SharedI18n.t;

const SAVE_KEY = 'web-games.amhaeng.run';
const BEST_KEY = 'web-games.amhaeng.best';

const $ = (id) => document.getElementById(id);
const el = {
  where: $('where'), hp: $('hp'), coins: $('coins'), toast: $('toast'),
  map: $('screen-map'), mapTitle: $('map-title'), track: $('track'), mapHand: $('map-hand'), mapNote: $('map-note'), depart: $('depart'),
  fight: $('screen-fight'), backdrop: $('backdrop'), lane: $('lane'), info: $('info'), queue: $('queue'), unleash: $('unleash'), hand: $('hand'),
  moveLeft: $('move-left'), moveRight: $('move-right'), turn: $('turn'), wait: $('wait'),
  pick: $('screen-pick'), pickTitle: $('pick-title'), pickNote: $('pick-note'), offers: $('offers'), pickSkip: $('pick-skip'),
  end: $('screen-end'), endTitle: $('end-title'), endNote: $('end-note'), endBest: $('end-best'), restart: $('restart'),
  help: $('help'), helpOpen: $('help-open'), helpClose: $('help-close'),
  toggleBgm: $('toggle-bgm'), toggleSfx: $('toggle-sfx'),
};

let run = null;
let battle = null;
let focus = null;
let toastTimer = null;

function toast(text) {
  el.toast.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 3500);
}

const tileName = (id) => t(`ah.tile.${id}`);
const regionName = (k) => t(`ah.region.${D.REGIONS[Math.min(k, D.REGIONS.length - 1)].id}`);
const iconHtml = (name) => Art.icon(name);

function paintIcons(scope) {
  for (const slot of scope.querySelectorAll('[data-ah-icon]')) slot.innerHTML = iconHtml(slot.dataset.ahIcon);
}

// --- 저장 ---

function save() {
  try {
    if (!run || run.phase === 'over' || run.phase === 'won') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch { /* 무시 */ }
}

// 가장 멀리 간 곳. 고을 번호와 자리 번호를 한 수로 묶어 견준다.
function recordBest() {
  const reach = run.phase === 'won' ? 999 : run.region * 10 + run.node;
  try {
    const best = Number(localStorage.getItem(BEST_KEY)) || -1;
    if (reach > best) localStorage.setItem(BEST_KEY, String(reach));
  } catch { /* 무시 */ }
}

function bestText() {
  let best = -1;
  try { best = Number(localStorage.getItem(BEST_KEY)); } catch { /* 무시 */ }
  if (!(best >= 0)) return '';
  if (best === 999) return t('ah.best', { where: t('ah.wonTitle') });
  return t('ah.best', { where: t('ah.where', { region: regionName(Math.floor(best / 10)), n: (best % 10) + 1 }) });
}

// --- 머리 줄 ---

function paintStatus() {
  const hp = battle ? battle.hero.hp : run.hp;
  const maxHp = battle ? battle.hero.maxHp : run.maxHp;
  el.where.textContent = run.region < D.REGIONS.length
    ? t('ah.where', { region: regionName(run.region), n: run.node + 1 }) : '';
  el.hp.innerHTML = `${iconHtml('heart')}<span>${hp}/${maxHp}</span>`;
  el.coins.innerHTML = `${iconHtml('coin')}<span>${run.coins}</span>`;
}

function show(name) {
  for (const key of ['map', 'fight', 'pick', 'end']) el[key].hidden = key !== name;
  paintStatus();
}

// --- 여정 지도 ---

function showMap() {
  const region = D.REGIONS[run.region];
  el.mapTitle.textContent = regionName(run.region);
  el.track.textContent = '';
  region.nodes.forEach((n, k) => {
    const li = document.createElement('li');
    li.className = `stop ${n.type}${k < run.node ? ' past' : ''}${k === run.node ? ' here' : ''}`;
    li.textContent = t(`ah.node.${n.type}`);
    el.track.append(li);
  });
  el.mapHand.innerHTML = run.tiles.map((tile) => `<span class="chip">${iconHtml(tile.id)}${tileName(tile.id)}${tile.lv ? ` ${t('ah.forgeLv', { lv: tile.lv })}` : ''}</span>`).join('')
    + run.blessings.map((b) => `<span class="chip bless">${t(`ah.blessing.${b}`)}</span>`).join('');
  el.mapNote.textContent = '';
  show('map');
}

function depart() {
  Sound.play('click');
  const spec = R.enter(run);
  save();
  if (spec) startBattle(spec);
  else showPick();
}

// --- 싸움 ---

function startBattle(spec) {
  battle = B.create(spec);
  focus = null;
  buildLane();
  show('fight');
  paintBattle();
}

function buildLane() {
  el.backdrop.innerHTML = Art.scenery(D.REGIONS[run.region].id);
  el.lane.style.setProperty('--n', battle.lane);
  el.lane.textContent = '';
  for (let c = 0; c < battle.lane; c++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.cell = c;
    el.lane.append(cell);
  }
}

function hpPips(hp, max) {
  // 체력이 많은 우두머리는 점 대신 숫자로 — 점 열여덟 개는 칸에 들어가지 않는다.
  if (max > 6) return `<span class="hpnum">${hp}/${max}</span>`;
  return Array.from({ length: max }, (_, k) => `<i class="${k < hp ? 'on' : ''}"></i>`).join('');
}

function paintBattle() {
  const danger = B.danger(battle);
  const preview = battle.queue.length ? B.preview(battle) : null;
  [...el.lane.children].forEach((cell, c) => {
    const d = danger.get(c);
    cell.classList.toggle('danger', Boolean(d));
    cell.classList.toggle('soon', Boolean(d) && d.left <= 1);
    cell.classList.toggle('aim', Boolean(preview && preview.cells.has(c)));
    let html = '';
    if (battle.hero.pos === c) {
      html = `<div class="unit hero face${battle.hero.face > 0 ? 'R' : 'L'}">${Art.figure('hero')}<span class="facing"></span>`
        + `${battle.hero.ward ? '<span class="ward"></span>' : ''}</div>`;
    }
    const foe = battle.foes.find((f) => f.pos === c);
    if (foe) {
      const def = D.ENEMIES[foe.kind];
      const badge = foe.stun ? `<span class="intent stun">${iconHtml('stun')}${foe.stun}</span>`
        : foe.wind ? `<span class="intent">${iconHtml('sword')}${foe.wind.left}</span>` : '';
      html = `<div class="unit foe${def.boss ? ' boss' : ''} face${foe.face > 0 ? 'R' : 'L'}${focus === foe.uid ? ' focus' : ''}" data-uid="${foe.uid}">`
        + `${badge}${Art.figure(foe.kind)}<span class="facing"></span><span class="pips">${hpPips(foe.hp, foe.maxHp)}</span></div>`;
    }
    cell.innerHTML = html;
  });
  // 쌓은 패.
  el.queue.innerHTML = Array.from({ length: battle.queueMax }, (_, k) => {
    const index = battle.queue[k];
    return index === undefined ? '<span class="slot"></span>'
      : `<span class="slot full">${iconHtml(battle.tiles[index].id)}</span>`;
  }).join('');
  el.unleash.disabled = !battle.queue.length;
  // 손의 패.
  el.hand.textContent = '';
  battle.tiles.forEach((tile, k) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile';
    button.dataset.index = k;
    const queued = battle.queue.includes(k);
    button.classList.toggle('queued', queued);
    button.disabled = !B.canQueue(battle, k);
    button.innerHTML = `${iconHtml(tile.id)}<span class="tile-name">${tileName(tile.id)}${tile.lv ? `+${tile.lv}` : ''}</span>`
      + (tile.cd ? `<span class="cd">${tile.cd}</span>` : '');
    el.hand.append(button);
  });
  paintInfo();
  paintStatus();
}

function paintInfo() {
  const foe = battle.foes.find((f) => f.uid === focus);
  if (foe) {
    const left = foe.stun ? t('ah.stunned', { n: foe.stun }) : foe.wind ? t('ah.intent', { n: foe.wind.left }) : '';
    el.info.textContent = `${t(`ah.foe.${foe.kind}`)} · ${t(`ah.foeDesc.${foe.kind}`)}${left ? ` · ${left}` : ''}`;
  } else if (!el.info.dataset.keep) {
    el.info.textContent = '';
  }
}

function flashCells(cells, className) {
  for (const c of cells) {
    const cell = el.lane.children[c];
    if (!cell) continue;
    cell.classList.remove(className);
    void cell.offsetWidth;
    cell.classList.add(className);
    setTimeout(() => cell.classList.remove(className), 420);
  }
}

// 사건마다 소리와 번쩍임. 한 수에 사건이 여럿이면 소리는 겹쳐 울린다.
function playEvents(events) {
  const hitCells = [];
  for (const e of events) {
    if (e.type === 'heroHit') { Sound.play('hurt'); hitCells.push(battle.hero.pos); }
    else if (e.type === 'hit') Sound.play('hit');
    else if (e.type === 'die') { Sound.play('kill'); hitCells.push(e.cell); }
    else if (e.type === 'block') Sound.play('block');
    else if (e.type === 'ward') { Sound.play('block'); toast(t('ah.ward')); }
    else if (e.type === 'unleash') Sound.play('unleash');
    else if (e.type === 'queue') Sound.play('queue');
    else if (e.type === 'strike') { Sound.play('swing'); flashCells(e.cells, 'struck'); }
    else if (e.type === 'spawn') Sound.play('spawn');
    else if (e.type === 'heroMove' || e.type === 'heroTurn') Sound.play('step');
  }
  flashCells(hitCells, 'hurt');
}

function act(action, failKey) {
  if (!battle || battle.over) return;
  if (!B.act(battle, action)) {
    if (failKey) toast(t(failKey));
    Sound.play('nope');
    return;
  }
  playEvents(battle.events);
  delete el.info.dataset.keep;
  if (focus && !battle.foes.some((f) => f.uid === focus)) focus = null;
  paintBattle();
  if (battle.over) setTimeout(endBattle, 450);
}

function endBattle() {
  const won = battle.over === 'win';
  const before = run.coins;
  R.finishFight(run, battle);
  battle = null;
  if (!won) {
    Sound.play('lose');
    recordBest();
    showEnd();
    save();
    return;
  }
  Sound.play('win');
  toast(t('ah.fightWon', { coins: run.coins - before }));
  save();
  if (run.phase === 'reward') showPick();
  else if (run.phase === 'won') { recordBest(); showEnd(); }
  else showMap();
}

// --- 고르기(우두머리 보상·서낭당·주막) ---

function offerButton(html, onClick, disabled) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'offer';
  button.innerHTML = html;
  button.disabled = Boolean(disabled);
  button.addEventListener('click', onClick);
  return button;
}

function tileOffer(id, extra = '') {
  return `<span class="offer-head">${iconHtml(id)}<b>${tileName(id)}</b>${extra}</span><span class="offer-desc">${t(`ah.tileDesc.${id}`)}</span>`;
}

function showPick() {
  el.offers.textContent = '';
  el.pickNote.textContent = '';
  el.pickSkip.hidden = false;
  const full = run.tiles.length >= R.HAND_MAX;
  if (run.phase === 'reward') {
    el.pickTitle.textContent = t('ah.rewardTitle');
    if (full) el.pickNote.textContent = t('ah.handFull', { n: R.HAND_MAX });
    for (const id of run.offers) {
      el.offers.append(offerButton(tileOffer(id), () => { Sound.play('coin'); R.takeReward(run, id); afterPick(); }, full));
    }
    el.pickSkip.textContent = t('ah.skip');
    el.pickSkip.onclick = () => { R.takeReward(run, null); afterPick(); };
  } else if (run.phase === 'shrine') {
    el.pickTitle.textContent = t('ah.shrineTitle');
    for (const id of run.offers) {
      el.offers.append(offerButton(`<span class="offer-head"><b>${t(`ah.blessing.${id}`)}</b></span><span class="offer-desc">${t(`ah.blessingDesc.${id}`)}</span>`,
        () => { Sound.play('coin'); R.takeBlessing(run, id); afterPick(); }));
    }
    el.pickSkip.hidden = true;
  } else if (run.phase === 'inn') {
    el.pickTitle.textContent = t('ah.innTitle');
    const cost = (what) => `<span class="cost">${iconHtml('coin')}${t('ah.cost', { n: D.INN[what].cost })}</span>`;
    const poor = (what) => run.coins < D.INN[what].cost;
    el.offers.append(offerButton(`<span class="offer-head"><b>${t('ah.inn.soup', { heal: D.INN.soup.heal })}</b>${cost('soup')}</span>`,
      () => buyAt('soup'), poor('soup') || run.hp >= run.maxHp));
    el.offers.append(offerButton(`<span class="offer-head"><b>${t('ah.inn.tonic')}</b>${cost('tonic')}</span>`,
      () => buyAt('tonic'), poor('tonic')));
    run.tiles.forEach((tile, k) => {
      el.offers.append(offerButton(`<span class="offer-head">${iconHtml(tile.id)}<b>${t('ah.inn.forge')} · ${tileName(tile.id)} ${t('ah.forgeLv', { lv: tile.lv + 1 })}</b>${cost('forge')}</span>`,
        () => buyAt('forge', k), poor('forge') || tile.lv >= 2));
    });
    for (const id of run.offers) {
      el.offers.append(offerButton(tileOffer(id, cost('tile')), () => buyAt('tile', id), poor('tile') || full));
    }
    if (full) el.pickNote.textContent = t('ah.handFull', { n: R.HAND_MAX });
    el.pickSkip.textContent = t('ah.leave');
    el.pickSkip.onclick = () => { R.leaveInn(run); afterPick(); };
  }
  show('pick');
}

function buyAt(what, arg) {
  if (!R.buy(run, what, arg)) { Sound.play('nope'); return; }
  Sound.play('coin');
  save();
  showPick();
}

function afterPick() {
  save();
  if (run.phase === 'won') { recordBest(); showEnd(); } else showMap();
}

// --- 끝 ---

function showEnd() {
  const won = run.phase === 'won';
  el.endTitle.textContent = t(won ? 'ah.wonTitle' : 'ah.overTitle');
  el.endNote.textContent = won ? t('ah.wonNote', { fights: run.fights })
    : t('ah.overNote', { region: regionName(run.region), fights: run.fights });
  el.endBest.textContent = bestText();
  show('end');
}

function newRun() {
  run = R.create((Math.random() * 2 ** 32) >>> 0);
  battle = null;
  save();
  showMap();
}

// --- 입력 ---

el.depart.addEventListener('click', depart);
el.restart.addEventListener('click', () => { Sound.play('click'); newRun(); });
el.unleash.addEventListener('click', () => act({ type: 'unleash' }, 'ah.emptyQueue'));
el.moveLeft.addEventListener('click', () => act({ type: 'move', dir: -1 }, 'ah.cantMove'));
el.moveRight.addEventListener('click', () => act({ type: 'move', dir: 1 }, 'ah.cantMove'));
el.turn.addEventListener('click', () => act({ type: 'turn' }));
el.wait.addEventListener('click', () => act({ type: 'wait' }));
el.hand.addEventListener('click', (event) => {
  const button = event.target.closest('.tile');
  if (!button) return;
  const k = Number(button.dataset.index);
  el.info.textContent = `${tileName(battle.tiles[k].id)} · ${t(`ah.tileDesc.${battle.tiles[k].id}`)}`;
  el.info.dataset.keep = '1';
  act({ type: 'queue', index: k }, 'ah.cantQueue');
});
el.lane.addEventListener('click', (event) => {
  const unit = event.target.closest('.foe');
  focus = unit ? Number(unit.dataset.uid) : null;
  delete el.info.dataset.keep;
  if (battle) paintBattle();
});

window.addEventListener('keydown', (event) => {
  if (!battle || el.fight.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const keys = {
    ArrowLeft: () => act({ type: 'move', dir: -1 }, 'ah.cantMove'),
    ArrowRight: () => act({ type: 'move', dir: 1 }, 'ah.cantMove'),
    ' ': () => act({ type: 'wait' }),
    Enter: () => act({ type: 'unleash' }, 'ah.emptyQueue'),
    t: () => act({ type: 'turn' }),
    T: () => act({ type: 'turn' }),
  };
  const digit = /^Digit([1-6])$/.exec(event.code);
  if (digit) { event.preventDefault(); act({ type: 'queue', index: Number(digit[1]) - 1 }, 'ah.cantQueue'); return; }
  if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
});

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

paintIcons(document);

// 저장본이 있으면 이어 간다. 싸움 도중이었으면 그 싸움 앞(지도)으로 돌아온다.
let saved = null;
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* 무시 */ }
run = R.adopt(saved);
if (!run) newRun();
else if (run.phase === 'map') showMap();
else showPick();

window.AmhaengDebug = { run: () => run, battle: () => battle, act, newRun };

})();

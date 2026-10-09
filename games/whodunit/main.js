'use strict';

// 화면과 조작. 규칙은 rules.js, 풀이는 solver.js, 판은 generator.js(구워 둔 puzzles.js)가
// 들고 있고 여기서는 그것들을 부르고 그린다.
(function () {

const R = window.WhodunitRules;
const S = window.WhodunitSolver;
const G = window.WhodunitGenerator;
const Sound = window.WhodunitSound;
const t = SharedI18n.t;

const LEVELS = [
  { key: 'easy', labelKey: 'ui.easy' },
  { key: 'normal', labelKey: 'ui.medium' },
  { key: 'hard', labelKey: 'ui.hard' },
];
const SAVE_KEY = 'web-games.whodunit.game';
const BEST_KEY = 'web-games.whodunit.best';
const COLS = 'ABCD';

// 얼굴 하나에 눈가리개와 웃는 입을 다 그려 두고, 정체에 따라 CSS가 하나만 보인다.
const FACE = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<circle cx="12" cy="8.6" r="4.4" fill="currentColor"/>'
  + '<path d="M3.8 22 C4.6 15.4 19.4 15.4 20.2 22 Z" fill="currentColor"/>'
  + '<rect class="mask" x="6.6" y="6.6" width="10.8" height="3" rx="1.5"/>'
  + '<path class="smile" d="M10 10.4 Q12 11.9 14 10.4" fill="none" stroke-width="1.3" stroke-linecap="round"/>'
  + '</svg>';

const el = {
  board: document.getElementById('board'),
  levels: document.getElementById('levels'),
  timer: document.getElementById('timer'),
  mistakes: document.getElementById('mistakes'),
  detail: document.getElementById('detail'),
  detailWho: document.getElementById('detail-who'),
  detailText: document.getElementById('detail-text'),
  tags: document.getElementById('tags'),
  used: document.getElementById('used'),
  share: document.getElementById('share'),
  markInnocent: document.getElementById('mark-innocent'),
  markCriminal: document.getElementById('mark-criminal'),
  hint: document.getElementById('hint'),
  newGame: document.getElementById('new-game'),
  result: document.getElementById('result'),
  resultTitle: document.getElementById('result-title'),
  resultNote: document.getElementById('result-note'),
  again: document.getElementById('again'),
  help: document.getElementById('help'),
  helpOpen: document.getElementById('help-open'),
  helpClose: document.getElementById('help-close'),
  toggleBgm: document.getElementById('toggle-bgm'),
  toggleSfx: document.getElementById('toggle-sfx'),
};

let game = null;
let view = null;
let toastTimer = null;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

// 알림은 판 아래 상세 칸에 잠시 띄운다. 따로 줄을 두면 글이 두 줄이 될 때마다 판 높이가
// 바뀌어 카드가 출렁인다. 다음 조작이 있으면 바로 상세로 돌아간다.
function toast(text) {
  game.note = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { game.note = ''; paint(); }, 5000);
  paint();
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; }
}

function saveBest(best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* 무시 */ }
}

// --- 문장 ---

const nameOf = (i) => t(`wd.name.${game.puzzle.names[i]}`);
const jobOf = (i) => t(`wd.job.${game.puzzle.jobs[i]}`);
const statusOf = (v) => t(v ? 'wd.crim' : 'wd.inno');

function placeText(set) {
  const vars = { name: '', n: '', job: '' };
  if ('NABLG'.includes(set.kind)) vars.name = nameOf(set.arg);
  if (set.kind === 'R') vars.n = set.arg + 1;
  if (set.kind === 'C') vars.n = COLS[set.arg];
  if (set.kind === 'J') vars.job = t(`wd.job.${set.arg}`);
  const place = t(`wd.place.${set.kind}`, vars);
  return set.job === undefined ? place : t('wd.place.withJob', { place, job: t(`wd.job.${set.job}`) });
}

function clueText(clue) {
  const side = t(`wd.side.${clue.side}`);
  const place = placeText(clue.sets[0]);
  if (clue.type === '=') return t(clue.n ? 'wd.clue.count' : 'wd.clue.none', { place, side, n: clue.n });
  if (clue.type === '>') return t('wd.clue.more', { a: place, b: placeText(clue.sets[1]), side });
  if (clue.type === '~') return t('wd.clue.same', { a: place, b: placeText(clue.sets[1]), side });
  if (clue.type === '%') return t(clue.n ? 'wd.clue.odd' : 'wd.clue.even', { place, side });
  if (clue.type === '^') return t('wd.clue.outnumber', { place, side, other: t(`wd.side.${clue.side === 'c' ? 'i' : 'c'}`) });
  return t('wd.clue.linked', { place, side });
}

// --- 판 만들기 ---

// 행 번호와 열 글자를 판 가장자리에 둔다. 단서가 "2행", "C열"로 가리키므로 세어 보게 하면 안 된다.
function label(text) {
  const node = document.createElement('span');
  node.className = 'axis';
  node.textContent = text;
  return node;
}

function build() {
  el.board.textContent = '';
  el.board.append(label(''), ...Array.from(COLS, label));
  const cards = [];
  for (let i = 0; i < R.N; i++) {
    if (R.colOf(i) === 0) el.board.append(label(String(R.rowOf(i) + 1)));
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.index = i;
    const face = document.createElement('span');
    face.className = 'face';
    face.innerHTML = FACE;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = nameOf(i);
    const job = document.createElement('span');
    job.className = 'job';
    job.textContent = jobOf(i);
    const clue = document.createElement('span');
    clue.className = 'clue';
    // 모서리 색 표시. 넷을 미리 넣어 두고 켜고 끄기만 한다.
    const tags = document.createElement('span');
    tags.className = 'tags-on';
    for (let k = 0; k < 4; k++) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.dataset.tag = k;
      tags.append(dot);
    }
    card.append(tags, face, name, job, clue);
    el.board.append(card);
    cards.push({ card, clue, dots: [...tags.children] });
  }
  view = { cards };
}

const isOpen = (i) => Boolean(game.revealed & (1 << i));

function paint() {
  const sel = game.selected;
  const scope = sel >= 0 && isOpen(sel) ? game.puzzle.clues[sel].scope : 0;
  view.cards.forEach(({ card, clue, dots }, i) => {
    const open = isOpen(i);
    const crim = (game.puzzle.truth >> i) & 1;
    card.classList.toggle('open', open);
    card.classList.toggle('criminal', open && crim === 1);
    card.classList.toggle('innocent', open && crim === 0);
    card.classList.toggle('selected', i === sel);
    card.classList.toggle('scope', Boolean(scope & (1 << i)));
    clue.textContent = open ? clueText(game.puzzle.clues[i]) : '';
    card.classList.toggle('used', open && Boolean(game.used & (1 << i)));
    dots.forEach((dot, k) => { dot.hidden = open || !(game.tags[i] & (1 << k)); });
  });
  // 고른 사람이 안 밝혀졌으면 색 표시를, 밝혀졌으면 단서를 다 썼다는 표시를 내민다.
  el.tags.hidden = game.done || sel < 0 || isOpen(sel);
  el.used.hidden = game.done || sel < 0 || !isOpen(sel);
  if (sel >= 0) {
    [...el.tags.children].forEach((b, k) => b.setAttribute('aria-pressed', String(Boolean(game.tags[sel] & (1 << k)))));
    el.used.setAttribute('aria-pressed', String(Boolean(game.used & (1 << sel))));
  }
  el.detail.classList.toggle('note', Boolean(game.note));
  if (game.note) {
    el.detailWho.textContent = sel >= 0 ? `${nameOf(sel)} · ${jobOf(sel)}` : '';
    el.detailText.textContent = game.note;
  } else if (sel < 0) {
    el.detailWho.textContent = '';
    el.detailText.textContent = t('wd.pick');
  } else {
    el.detailWho.textContent = `${nameOf(sel)} · ${jobOf(sel)}${isOpen(sel) ? ` · ${statusOf((game.puzzle.truth >> sel) & 1)}` : ''}`;
    el.detailText.textContent = isOpen(sel) ? clueText(game.puzzle.clues[sel]) : t('wd.ask');
  }
  const can = !game.done && sel >= 0 && !isOpen(sel);
  el.markInnocent.disabled = !can;
  el.markCriminal.disabled = !can;
  el.mistakes.textContent = t('wd.mistakes', { n: game.mistakes });
  el.mistakes.classList.toggle('some', game.mistakes > 0);
  for (const button of el.levels.children) {
    button.setAttribute('aria-pressed', String(button.dataset.level === game.level));
  }
}

// --- 조작 ---

function started() {
  if (!game.running && !game.done) game.running = true;
}

function select(i) {
  game.note = '';
  game.selected = game.selected === i && isOpen(i) ? -1 : i;
  Sound.play('select');
  paint();
}

function flash(i) {
  const node = view.cards[i].card;
  node.classList.remove('flash');
  void node.offsetWidth;
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), 900);
}

function reveal(i) {
  game.revealed |= 1 << i;
  Sound.play((game.puzzle.truth >> i) & 1 ? 'criminal' : 'innocent');
  save();
  paint();
  flash(i);
  if (game.revealed === R.FULL) finish();
}

// 단서로 정해지는 사람만 밝힌다. 아직 둘 다 될 수 있으면 실수로 치지 않는다 — 찍어서 맞히는 것을
// 막으려는 것이지, 성급함을 벌주려는 것이 아니다.
function mark(value) {
  const i = game.selected;
  if (game.done || i < 0 || isOpen(i)) return;
  started();
  const answer = S.decided(game.puzzle, game.revealed, i, value);
  if (answer === 'yes') { reveal(i); return; }
  if (answer === 'open') {
    Sound.play('open');
    toast(t('wd.open'));
    return;
  }
  game.mistakes++;
  game.missed |= 1 << i;
  Sound.play('wrong');
  toast(t('wd.wrong'));
  save();
  paint();
}

// 원작처럼 두 번에 나눠 돕는다. 처음에는 볼 자리(단서나 사람)만 짚고, 한 번 더 누르면 밝힌다.
// 단서만 짚어 줘도 대개 혼자 풀 수 있어, 바로 답을 주면 추리할 몫까지 가져간다.
function hint() {
  if (game.done) return;
  const pending = game.hintStep && !isOpen(game.hintStep.cell) ? game.hintStep : null;
  started();
  game.hinted++;
  if (pending) {
    game.hintStep = null;
    game.helped[pending.cell] = 2;
    game.selected = pending.cell;
    const vars = { who: nameOf(pending.cell), status: statusOf(pending.value) };
    if (pending.why.code === 'clue') vars.from = nameOf(pending.why.from);
    if (pending.why.code === 'trial') vars.assume = t(pending.why.assume ? 'wd.crimIf' : 'wd.innoIf');
    Sound.play('hint');
    reveal(pending.cell);
    toast(t(`wd.why.${pending.why.code}`, vars));
    return;
  }
  const step = S.hint(game.puzzle, game.revealed);
  if (!step) { game.hinted--; toast(t('wd.noStep')); return; }
  game.hintStep = step;
  game.helped[step.cell] = Math.max(game.helped[step.cell], 1);
  Sound.play('hint');
  if (step.why.code === 'clue') {
    // 단서를 말한 사람을 골라 두면 그 단서가 가리키는 사람들이 함께 칠해진다.
    game.selected = step.why.from;
    flash(step.why.from);
    toast(t('wd.look.clue', { from: nameOf(step.why.from) }));
  } else {
    game.selected = step.cell;
    flash(step.cell);
    toast(t(`wd.look.${step.why.code}`, {
      who: nameOf(step.cell), assume: t(step.why.assume ? 'wd.crimIf' : 'wd.innoIf'),
    }));
  }
  save();
}

function toggleTag(k) {
  const i = game.selected;
  if (game.done || i < 0 || isOpen(i)) return;
  game.tags[i] ^= 1 << k;
  Sound.play('select');
  save();
  paint();
}

function toggleUsed() {
  const i = game.selected;
  if (i < 0 || !isOpen(i)) return;
  game.used ^= 1 << i;
  Sound.play('select');
  save();
  paint();
}

// 원작의 결과 격자. 사람마다 한 칸: 힌트로 밝힘 🟠, 힌트로 짚음 🟡, 틀린 적 있음 🟨, 혼자 🟩.
function shareText() {
  const level = LEVELS.find((item) => item.key === game.level);
  const rows = [];
  for (let r = 0; r < R.H; r++) {
    let line = '';
    for (let c = 0; c < R.W; c++) {
      const i = r * R.W + c;
      line += game.helped[i] === 2 ? '🟠' : game.helped[i] === 1 ? '🟡' : game.missed & (1 << i) ? '🟨' : '🟩';
    }
    rows.push(line);
  }
  const head = t('wd.shareHead', { game: t('game.whodunit'), level: t(level.labelKey), time: formatTime(game.elapsed) });
  return [head, ...rows].join('\n');
}

async function share() {
  try {
    await navigator.clipboard.writeText(shareText());
    toast(t('wd.copied'));
  } catch {
    // 클립보드 권한이 없거나 http로 열린 경우. 복사 대신 보여주기라도 한다.
    toast(shareText());
  }
}

function showResult() {
  const best = loadBest();
  const previous = best[game.level];
  // 조각은 모아서 붙인다. 앞 공백을 달아 두면 언어마다 빈칸 규칙이 달라 어긋난다.
  const note = [];
  if (game.mistakes) note.push(t('wd.resultMistakes', { n: game.mistakes }));
  if (game.hinted) {
    note.push(t('record.hinted', { count: game.hinted }));
  } else if (!game.mistakes && !game.recorded && (!previous || game.elapsed < previous)) {
    best[game.level] = game.elapsed;
    saveBest(best);
    note.push(previous ? t('record.improved', { time: formatTime(previous) }) : t('record.first'));
  } else if (previous) {
    note.push(t('record.bestIs', { time: formatTime(previous) }));
  }
  game.recorded = true;
  el.resultTitle.textContent = t('record.done', { time: formatTime(game.elapsed) });
  el.resultNote.textContent = note.join(' ');
  el.result.hidden = false;
}

function finish() {
  game.done = true;
  game.running = false;
  game.selected = -1;
  Sound.play('win');
  showResult();
  save();
  paint();
}

// --- 저장 ---

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      level: game.level,
      id: game.id,
      code: game.code,
      revealed: game.revealed,
      mistakes: game.mistakes,
      missed: game.missed,
      used: game.used,
      tags: game.tags,
      helped: game.helped,
      elapsed: game.elapsed,
      hinted: game.hinted,
      done: game.done,
    }));
  } catch { /* 무시 */ }
}

function restore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return false; }
  if (!saved || !G.PUZZLES[saved.level]) return false;
  // 판을 다시 구우면 같은 번호가 다른 판이 된다. 적어 둔 판 자료로 가린다.
  if (G.PUZZLES[saved.level][saved.id] !== saved.code) return false;
  start({ id: saved.id, level: saved.level, code: saved.code, ...R.parse(saved.code) });
  // 처음 밝힌 사람은 늘 밝혀져 있어야 한다. 손댄 저장본이 지워 놓으면 단서가 하나도 없는 판이 된다.
  game.revealed = ((Number(saved.revealed) || 0) & R.FULL) | (1 << game.puzzle.start);
  game.mistakes = Number(saved.mistakes) || 0;
  game.missed = (Number(saved.missed) || 0) & R.FULL;
  game.used = (Number(saved.used) || 0) & R.FULL;
  const list = (value, max) => game.tags.map((_, i) => {
    const v = Array.isArray(value) ? Number(value[i]) : 0;
    return Number.isInteger(v) && v >= 0 && v <= max ? v : 0;
  });
  game.tags = list(saved.tags, 15);
  game.helped = list(saved.helped, 2);
  game.elapsed = Number(saved.elapsed) || 0;
  game.hinted = Number(saved.hinted) || 0;
  game.done = game.revealed === R.FULL;
  game.recorded = game.done;
  game.running = !game.done && game.revealed !== 1 << game.puzzle.start;
  el.timer.textContent = formatTime(game.elapsed);
  paint();
  if (game.done) showResult();
  return true;
}

// --- 새 판 ---

function start(made) {
  game = {
    level: made.level,
    id: made.id,
    code: made.code,
    puzzle: made,
    revealed: 1 << made.start,
    selected: made.start,
    mistakes: 0,
    missed: 0,
    used: 0,
    tags: new Array(R.N).fill(0),
    helped: new Array(R.N).fill(0),
    hintStep: null,
    note: '',
    elapsed: 0,
    running: false,
    done: false,
    recorded: false,
    hinted: 0,
  };
  el.result.hidden = true;
  el.timer.textContent = '0:00';
  build();
}

function newGame(level = game ? game.level : 'easy') {
  const skip = game && game.level === level ? game.id : -1;
  start(G.pick(level, skip));
  save();
  paint();
}

// --- 입력 연결 ---

for (const item of LEVELS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'level';
  button.dataset.level = item.key;
  button.textContent = t(item.labelKey);
  button.addEventListener('click', () => { Sound.play('click'); newGame(item.key); });
  el.levels.append(button);
}

el.board.addEventListener('click', (event) => {
  const card = event.target.closest('.card');
  if (card && !game.done) select(Number(card.dataset.index));
});

el.markInnocent.addEventListener('click', () => mark(0));
el.markCriminal.addEventListener('click', () => mark(1));
el.hint.addEventListener('click', hint);
el.tags.addEventListener('click', (event) => {
  const pick = event.target.closest('.tag-pick');
  if (pick) toggleTag(Number(pick.dataset.tag));
});
el.used.addEventListener('click', toggleUsed);
el.share.addEventListener('click', share);
el.newGame.addEventListener('click', () => { Sound.play('click'); newGame(); });
el.again.addEventListener('click', () => { Sound.play('click'); newGame(); });
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

setInterval(() => {
  if (!game || !game.running || game.done) return;
  game.elapsed += 1;
  el.timer.textContent = formatTime(game.elapsed);
  // 시간을 이따금 남겨 둔다. 새로 열었을 때 0초부터 다시 세면 기록이 어긋난다.
  if (game.elapsed % 5 === 0) save();
}, 1000);

window.SharedIcons.paint();
if (!restore()) newGame('easy');

window.WhodunitDebug = { game: () => game, hint, newGame };

})();

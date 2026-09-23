'use strict';

// 목록 페이지의 오늘의 도전 카드와 달력. 규칙은 `shared/daily.js`, 저장은
// `shared/daily-ui.js`에 있고 여기서는 그리기만 한다.
(function () {

const D = window.SharedDaily;
const UI = window.SharedDailyUI;
const t = (key, vars) => SharedI18n.t(key, vars) || key;

const el = {
  count: document.getElementById('daily-count'),
  streak: document.getElementById('daily-streak'),
  list: document.getElementById('daily-list'),
  row: document.getElementById('daily-row'),
  open: document.getElementById('daily-open'),
  sheet: document.getElementById('cal-sheet'),
  title: document.getElementById('cal-title'),
  grid: document.getElementById('cal-grid'),
  stats: document.getElementById('cal-stats'),
  prev: document.getElementById('cal-prev'),
  next: document.getElementById('cal-next'),
};

let state = null;
let todayKey = null;
let view = null;  // 달력이 보여 주는 달 { y, m }

function refresh() {
  state = UI.load();
  todayKey = D.dateKey();
  const isNew = !state.days[todayKey];
  D.day(state, todayKey);
  // 오늘의 셋은 처음 본 순간 박아 둔다 — 그 뒤에 미션 표가 바뀌어도 오늘은 그대로다.
  if (isNew) UI.save(state);
  renderToday();
  if (sheet.isOpen()) renderCalendar();
}

function renderToday() {
  const today = state.days[todayKey];
  el.count.textContent = `${today.done.length}/${today.q.length}`;
  el.count.classList.toggle('full', D.isComplete(today));

  const run = D.streak(state, todayKey);
  el.streak.textContent = run > 0 ? t('daily.streak', { count: run }) : '';
  el.streak.hidden = run === 0;

  const rows = today.q.map((id) => {
    const mission = D.mission(id);
    const row = el.row.content.firstElementChild.cloneNode(true);
    const done = today.done.includes(id);
    row.classList.toggle('done', done);
    const link = row.querySelector('.daily-link');
    if (mission) link.href = `games/${mission.game}/`;
    row.querySelector('.daily-game').textContent = mission ? t('game.' + mission.game) : '';
    row.querySelector('.daily-goal').textContent = UI.goal(id);
    if (done && mission) link.setAttribute('aria-label', `${t('game.' + mission.game)} · ${UI.goal(id)} · ${t('daily.done')}`);
    return row;
  });
  el.list.replaceChildren(...rows);
}

// --- 달력 ---

function monthIndex(y, m) {
  return y * 12 + m;
}

// 앞으로는 이번 달까지, 뒤로는 기록이 있는 가장 이른 달까지만 넘긴다. 아무것도
// 없는 달을 끝없이 넘기게 두면 빈 칸만 보다 돌아오게 된다.
function bounds() {
  const now = D.parseKey(todayKey);
  const keys = Object.keys(state.days).sort();
  const first = keys.length ? D.parseKey(keys[0]) : now;
  return {
    min: monthIndex(first.getFullYear(), first.getMonth()),
    max: monthIndex(now.getFullYear(), now.getMonth()),
  };
}

function renderCalendar() {
  const lang = SharedI18n.lang;
  const { y, m } = view;
  el.title.textContent = new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long' })
    .format(new Date(y, m, 1));

  const cells = [];
  // 요일 머리는 사전 대신 Intl이 그 언어로 적는다. 2023-01-01이 일요일이다.
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'narrow' });
  for (let i = 0; i < 7; i++) {
    const head = document.createElement('span');
    head.className = 'cal-wd';
    head.textContent = weekday.format(new Date(2023, 0, 1 + i));
    cells.push(head);
  }

  const lead = new Date(y, m, 1).getDay();
  for (let i = 0; i < lead; i++) cells.push(document.createElement('span'));

  const last = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const key = D.dateKey(new Date(y, m, d));
    const entry = state.days[key];
    const count = entry ? entry.done.length : 0;
    const cell = document.createElement('span');
    cell.className = `cal-day lv${Math.min(count, D.PER_DAY)}`;
    if (D.isComplete(entry)) cell.classList.add('full');
    if (key === todayKey) cell.classList.add('today');
    if (key > todayKey) cell.classList.add('future');
    cell.textContent = d;
    if (entry) cell.title = `${count}/${entry.q.length}`;
    cells.push(cell);
  }
  el.grid.replaceChildren(...cells);

  const { min, max } = bounds();
  const here = monthIndex(y, m);
  el.prev.disabled = here <= min;
  el.next.disabled = here >= max;

  const parts = [t('daily.streak', { count: D.streak(state, todayKey) })];
  const best = D.bestStreak(state);
  if (best > 0) parts.push(t('daily.best', { count: best }));
  el.stats.textContent = parts.join(' · ');
}

function step(delta) {
  const date = new Date(view.y, view.m + delta, 1);
  view = { y: date.getFullYear(), m: date.getMonth() };
  renderCalendar();
}

const sheet = SharedSheet.bind({
  sheet: el.sheet,
  opener: el.open,
  onOpen: () => {
    const now = D.parseKey(todayKey);
    view = { y: now.getFullYear(), m: now.getMonth() };
    renderCalendar();
  },
});

el.prev.addEventListener('click', () => step(-1));
el.next.addEventListener('click', () => step(1));

// 게임에서 "← 목록"으로 돌아오면 브라우저가 이 페이지를 캐시에서 그대로 꺼내
// 스크립트가 다시 돌지 않는다. 방금 해낸 미션이 반영되지 않은 채로 보이므로
// 돌아올 때마다 기록을 다시 읽는다. 자정을 넘겨 다시 꺼낸 경우도 여기서 걸린다.
window.addEventListener('pageshow', (event) => { if (event.persisted) refresh(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
document.addEventListener('i18n:change', refresh);

refresh();

})();

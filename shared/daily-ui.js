'use strict';

// 오늘의 도전의 브라우저 쪽. 기록을 저장하고, 게임 페이지에서 판이 끝났을 때
// 알려 온 결과로 미션을 가리고, 새로 해낸 것이 있으면 위에 잠깐 띄운다.
// 규칙은 `daily.js`에 있고 여기서는 그것을 저장·화면과 잇기만 한다.
(function (root) {

const D = root.SharedDaily;
const STORE_KEY = 'web-games.daily';
// 결과 안내가 판 위를 덮는 순간과 겹치므로 그것을 읽을 만큼은 떠 있어야 한다.
const TOAST_MS = 3200;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && saved.v === 1 && saved.days) return saved;
  } catch { /* 깨진 값은 새로 시작한다 */ }
  return D.create();
}

function save(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 무시 */ }
}

function t(key, vars) {
  return SharedI18n.t(key, vars) || key;
}

function goal(id) {
  const mission = D.mission(id);
  return t('daily.' + id, mission && mission.vars);
}

let toastEl = null;
let toastTimer = null;

function toast(state, key, gained) {
  const today = state.days[key];
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'daily-toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  const head = document.createElement('strong');
  head.textContent = t(D.isComplete(today) ? 'daily.toastAll' : 'daily.toast', {
    done: today.done.length,
    total: today.q.length,
  });
  const body = document.createElement('span');
  body.textContent = gained.map(goal).join(' · ');
  toastEl.replaceChildren(head, body);
  toastEl.classList.remove('show');
  // 연달아 띄울 때 빠진 상태를 한 번 거쳐야 전환이 다시 돈다.
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), TOAST_MS);
}

// 게임은 판이 끝나는 자리에서 이것만 부른다. 무엇이 미션인지는 게임이 몰라도 된다.
function report(game, result) {
  const state = load();
  const key = D.dateKey();
  const gained = D.report(state, key, game, result);
  save(state);
  if (gained.length) toast(state, key, gained);
  return gained;
}

root.SharedDailyUI = { STORE_KEY, load, save, goal, report };

})(window);

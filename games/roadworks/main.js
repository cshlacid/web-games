'use strict';

// 화면. 판은 인라인 SVG 한 장으로 그리고, 규칙은 game.js와 traffic.js가 들고 있다.
//
// **한 번에 다시 그린다.** 칸마다 요소를 들고 있다가 고치는 대신 매번 문자열을 새로
// 만들어 넣는다. 81칸짜리 판이고 한 수에 판 전체의 색이 바뀌므로(길을 하나 놓으면
// 도시 전체의 흐름이 다시 배분된다) 부분 갱신으로 얻을 것이 없다.
(function () {

const G = window.RoadGame;
const L = window.RoadLevels;
const Sound = window.RoadSound;
const t = (key, vars) => window.SharedI18n.t(key, vars);

const LEVEL = L.CITY;
const W = LEVEL.w;
const H = LEVEL.h;

const el = {
  board: document.getElementById('board'),
  boardWrap: document.getElementById('board-wrap'),
  app: document.querySelector('.app'),
  week: document.getElementById('week'),
  budget: document.getElementById('budget'),
  count: document.getElementById('complaint-count'),
  gauge: document.getElementById('load-gauge'),
  complaints: document.getElementById('complaints'),
  tools: document.getElementById('tools'),
  next: document.getElementById('next-week'),
  result: document.getElementById('result'),
  resultTitle: document.getElementById('result-title'),
  resultNote: document.getElementById('result-note'),
  again: document.getElementById('again'),
  toast: document.getElementById('toast'),
  help: document.getElementById('help'),
  helpOpen: document.getElementById('help-open'),
  helpClose: document.getElementById('help-close'),
  ruleLimit: document.getElementById('rule-limit'),
  toggleBgm: document.getElementById('toggle-bgm'),
  toggleSfx: document.getElementById('toggle-sfx'),
};

let state = null;
let tool = 'road';
let focus = [];       // 민원을 눌러 짚은 칸들
let cell = 34;
let toastTimer = null;

// --- 판 그리기 ---

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function roadLinks(net, index) {
  const x = index % W;
  const y = (index / W) | 0;
  const out = [];
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    if (net.tiles[ny * W + nx].kind === 'road') out.push([dx, dy]);
  }
  return out;
}

// 혼잡도를 네 단계로 끊는다. 연속된 색으로 칠하면 "이 칸이 넘쳤는가"라는, 민원이
// 걸리는 그 경계가 보이지 않는다. 한산한 길도 회색이 아니라 초록으로 두어 판
// 전체가 신호등처럼 읽히게 한다 — 회색으로 두면 "아직 아무 일도 없다"로 보인다.
function band(ratio) {
  if (ratio >= 1) return 3;
  if (ratio >= 0.75) return 2;
  if (ratio >= 0.45) return 1;
  return 0;
}

// 지금 고른 도구가 이 칸에 닿으면 무엇이 되는가. 신호 도구는 이미 신호가 선
// 교차로에서는 시간 조정으로 바뀐다 — 단추를 하나 더 두는 대신 같은 자리를 다시
// 누르게 했다.
function toolAt(index) {
  if (tool === 'signal' && state.net.tiles[index].signal != null) return 'split';
  return tool;
}

function buildingShape(kind, x, y) {
  const body = `<rect class="bld ${kind}" x="${x + 0.14}" y="${y + 0.16}" width="0.72" height="0.68" rx="0.1"/>`;
  if (kind === 'home') {
    return `<path class="roof" d="M${x + 0.08} ${y + 0.34} L${x + 0.5} ${y + 0.08} L${x + 0.92} ${y + 0.34} Z"/>`
      + `<rect class="bld home" x="${x + 0.16}" y="${y + 0.32}" width="0.68" height="0.52" rx="0.06"/>`
      + `<rect class="door" x="${x + 0.42}" y="${y + 0.56}" width="0.16" height="0.28" rx="0.03"/>`;
  }
  if (kind === 'work') {
    let windows = '';
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        windows += `<rect class="win" x="${x + 0.23 + c * 0.19}" y="${y + 0.27 + r * 0.22}" width="0.12" height="0.13" rx="0.02"/>`;
      }
    }
    return body + windows;
  }
  return body;
}

function signalShape(tile, x, y) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  // **녹색을 더 받은 축의 막대만 그린다.** 두 막대의 진하기로 배분을 나타내 보았는데
  // 34픽셀 칸에서는 둘의 차이가 보이지 않았다. 반반이면 둘 다 그려 십자가 된다.
  let bars = '';
  if (tile.signal >= 0.5) bars += `<rect class="sig-bar" x="${cx - 0.12}" y="${cy - 0.035}" width="0.24" height="0.07" rx="0.035"/>`;
  if (tile.signal <= 0.5) bars += `<rect class="sig-bar" x="${cx - 0.035}" y="${cy - 0.12}" width="0.07" height="0.24" rx="0.035"/>`;
  return `<circle class="sig-body" cx="${cx}" cy="${cy}" r="0.2"/>${bars}`;
}

function badgeShape(x, y) {
  const cx = x + 0.82;
  const cy = y + 0.18;
  return `<circle class="badge" cx="${cx}" cy="${cy}" r="0.17"/>`
    + `<rect class="badge-mark" x="${cx - 0.025}" y="${cy - 0.095}" width="0.05" height="0.11" rx="0.025"/>`
    + `<circle class="badge-mark" cx="${cx}" cy="${cy + 0.075}" r="0.031"/>`;
}

function paint() {
  const { net, sim } = state;
  const land = [];
  const builds = [];
  const casing = [];
  const surface = [];
  const marks = [];
  const hits = [];
  const flagged = new Set(state.complaints.map((c) => c.tile));

  for (let i = 0; i < net.tiles.length; i++) {
    const tile = net.tiles[i];
    const x = i % W;
    const y = (i / W) | 0;
    const open = !state.over && G.check(state, toolAt(i), i).ok;

    // **누를 수 있는 칸에는 종류를 가리지 않고 같은 점선 테두리를 두른다.** 도로
    // 자체를 점선으로 그어 보았더니 차선 표시처럼 읽혀 혼잡도 색과 뒤섞였다.
    if (open) marks.push(`<rect class="open-ring" x="${x + 0.05}" y="${y + 0.05}" width="0.9" height="0.9" rx="0.1"/>`);

    if (tile.kind === 'land') {
      land.push(`<rect class="land${open ? ' open' : ''}" x="${x + 0.08}" y="${y + 0.08}" width="0.84" height="0.84" rx="0.08"/>`);
    } else if (tile.kind !== 'road') {
      builds.push(buildingShape(tile.kind, x, y));
    } else {
      const links = roadLinks(net, i);
      const width = tile.lanes >= 2 ? 0.5 : 0.32;
      const cx = x + 0.5;
      const cy = y + 0.5;
      let d = '';
      for (const [dx, dy] of links) d += `M${cx} ${cy} L${cx + dx * 0.5} ${cy + dy * 0.5} `;
      // **도로는 회색 몸통으로 그리고 혼잡도는 그 안의 심으로 칠한다.** 도로 전체를
      // 혼잡도 색으로 칠했더니 한산한 길이 판에서 사라져 도시가 아니라 얼룩으로
      // 보였다. 몸통이 길이고, 색은 그 길에 실린 양이다.
      //
      // **마감은 자른다.** 둥근 마감은 이웃 칸까지 반 폭만큼 넘어가 막힌 칸의 빨강이
      // 한산한 이웃 위로 별 모양으로 번진다. 대신 칸 가운데를 네모로 메운다.
      const core = width * 0.5;
      const box = (size) => `M${cx - size / 2} ${cy - size / 2} h${size} v${size} h${-size} Z`;
      casing.push(`<path class="casing" d="${d}" stroke-width="${width}"/>`);
      casing.push(`<path class="casing-joint" d="${box(width)}"/>`);
      const paint = `q${band(sim.ratio[i])}`;
      surface.push(`<path class="road ${paint}" d="${d}" stroke-width="${core}"/>`);
      surface.push(`<path class="road-joint ${paint}" d="${box(core)}"/>`);
      if (tile.signal != null) marks.push(signalShape(tile, x, y));
    }

    if (flagged.has(i)) marks.push(badgeShape(x, y));
    if (focus.includes(i)) marks.push(`<rect class="focus" x="${x + 0.04}" y="${y + 0.04}" width="0.92" height="0.92" rx="0.1"/>`);
    hits.push(`<rect class="hit" x="${x}" y="${y}" width="1" height="1" data-i="${i}"/>`);
  }

  el.board.innerHTML = land.join('') + builds.join('') + casing.join('')
    + surface.join('') + marks.join('') + hits.join('');
}

// --- 곁들이는 화면 ---

function paintGauges() {
  el.week.textContent = String(state.week);
  el.budget.textContent = String(state.budget);
  el.count.textContent = `${state.complaints.length}/${G.LIMIT}`;
  el.gauge.classList.toggle('warn', state.complaints.length >= G.LIMIT - 2);
  for (const button of el.tools.querySelectorAll('[data-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
  }
  for (const slot of el.tools.querySelectorAll('[data-cost]')) {
    slot.textContent = String(G.COST[slot.dataset.cost]);
  }
  el.next.disabled = state.over;
}

// **숫자는 민원이 접수된 때가 아니라 지금 값을 보여 준다.** 길을 고치면 그 자리에서
// 숫자가 내려가야 무엇이 나아졌는지 보인다. 민원 자체는 다음 주에 정리된다.
function complaintLine(c) {
  const spot = G.label(state.net, c.tile);
  if (c.type === 'jam') {
    const now = state.sim.ratio[c.tile];
    return [t('road.cJam', { spot }), t('road.cJamNote', { pct: Math.round(now * 100) }), now <= G.JAM_LIMIT];
  }
  if (c.type === 'delay') {
    const trip = state.sim.trips[c.trip];
    // **양 끝을 다 적는다.** 한 집에서 여러 직장으로 다니므로 출발지만 적으면 같은
    // 이름의 민원이 둘씩 늘어선다.
    const ends = { from: spot, to: G.label(state.net, trip.to) };
    return [t('road.cDelay', ends), t('road.cDelayNote', { ratio: trip.ratio.toFixed(1) }), trip.ratio <= G.DELAY_LIMIT];
  }
  return [t('road.cWorks'), t('road.cWorksNote', { n: c.works }), false];
}

function paintComplaints() {
  if (!state.complaints.length) {
    el.complaints.innerHTML = `<li class="chip calm">${t('road.noComplaints')}</li>`;
    return;
  }
  // 오래된 민원이 위로. 밀린 것이 먼저 보여야 무엇부터 손볼지가 정해진다.
  const sorted = state.complaints.slice().sort((a, b) => (a.week || 0) - (b.week || 0));
  el.complaints.innerHTML = sorted.map((c) => {
    const [title, note, fixed] = complaintLine(c);
    const spots = c.type === 'delay' ? [c.tile, state.sim.trips[c.trip].to] : [c.tile];
    return `<li class="chip t-${c.type}${fixed ? ' fixed' : ''}" data-tile="${spots}">`
      + `<span class="chip-title">${title}</span><span class="chip-note">${note}</span></li>`;
  }).join('');
}

function say(message) {
  el.toast.textContent = message;
  el.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('on'), 1600);
}

const WHY = {
  spot: 'road.whySpot',
  lanes: 'road.whyLanes',
  crossing: 'road.whyCrossing',
  signaled: 'road.whySignaled',
  nosignal: 'road.whyNosignal',
  money: 'road.whyMoney',
};

function refresh() {
  paint();
  paintGauges();
  paintComplaints();
}

// --- 조작 ---

function tap(index) {
  if (state.over) return;
  const which = toolAt(index);
  const verdict = G.apply(state, which, index);
  if (!verdict.ok) {
    Sound.play('deny');
    const key = WHY[verdict.reason];
    if (key) say(t(key));
    return;
  }
  Sound.play(which === 'split' ? 'tune' : 'build');
  focus = [];
  refresh();
}

function advance() {
  if (state.over) return;
  const report = G.nextWeek(state);
  focus = [];
  refresh();
  if (report.over) {
    Sound.play('over');
    showResult();
    return;
  }
  if (report.made.length) Sound.play('complaint');
  else if (report.gone.length) Sound.play('solved');
  else Sound.play('week');
}

function showResult() {
  el.resultTitle.textContent = t('road.overTitle');
  el.resultNote.textContent = t('road.overNote', { weeks: state.week, solved: state.solved });
  el.result.hidden = false;
}

function start() {
  state = G.create(LEVEL);
  tool = 'road';
  focus = [];
  el.result.hidden = true;
  layout();
  refresh();
}

// --- 배치 ---

function layout() {
  const wide = el.app.clientWidth;
  // 세로도 본다. 폰을 눕히면 판이 화면을 넘어가 도구줄이 밀려난다.
  const tall = window.innerHeight - 300;
  // **칸 너비를 정수로 끊는다.** 소수점으로 두면 브라우저가 열마다 다르게 반올림해
  // 어떤 칸만 1픽셀 넓어진다.
  cell = Math.max(20, Math.min(46, Math.floor(Math.min(wide / W, tall / H))));
  el.board.setAttribute('width', String(cell * W));
  el.board.setAttribute('height', String(cell * H));
  el.board.setAttribute('viewBox', `0 0 ${W} ${H}`);
  el.boardWrap.style.width = `${cell * W}px`;
  window.SharedSnap.snap(el.board);
}

// --- 배선 ---

el.board.addEventListener('click', (event) => {
  const hit = event.target.closest('[data-i]');
  if (!hit) return;
  tap(Number(hit.dataset.i));
});

el.tools.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tool]');
  if (!button) return;
  tool = button.dataset.tool;
  Sound.play('pick');
  refresh();
});

el.complaints.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-tile]');
  if (!chip) return;
  // 통근 지연은 집과 직장을 함께 비춘다. 어느 통근이 밀리는지는 두 끝을 봐야 안다.
  const spots = chip.dataset.tile.split(',').map(Number);
  focus = String(focus) === String(spots) ? [] : spots;
  Sound.play('pick');
  paint();
});

el.next.addEventListener('click', advance);
el.again.addEventListener('click', () => { Sound.play('pick'); start(); });

window.SharedSheet.bind({ sheet: el.help, opener: el.helpOpen, closer: el.helpClose });

function bindSoundToggle(node, key, apply) {
  node.setAttribute('aria-pressed', String(Sound.prefs[key]));
  node.addEventListener('click', () => {
    const on = !Sound.prefs[key];
    node.setAttribute('aria-pressed', String(on));
    apply(on);
    Sound.play('pick');
  });
}

bindSoundToggle(el.toggleBgm, 'bgm', (on) => Sound.setBgm(on));
bindSoundToggle(el.toggleSfx, 'sfx', (on) => Sound.setSfx(on));

// 민원 한도는 game.js가 들고 있다. 도움말에 숫자를 따로 적어 두면 값을 고칠 때
// 한쪽만 바뀐다.
function paintRule() {
  const text = t('road.rule8', { limit: G.LIMIT });
  if (text) el.ruleLimit.innerHTML = text;
}

document.addEventListener('i18n:change', () => {
  paintRule();
  paintComplaints();
  if (!el.result.hidden) showResult();
});

window.addEventListener('resize', () => { layout(); paint(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { layout(); paint(); });

window.RoadIcons.paint();
window.SharedIcons.paint();
paintRule();
start();

})();

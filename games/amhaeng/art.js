'use strict';

// 암행의 그림. 사람과 요괴, 무기 패의 아이콘을 인라인 SVG 문자열로 돌려준다(저장소 규칙: 그림은
// 코드로). 시안을 받으면 사람 그림만 바꾸면 되게, 화면은 `figure(kind)`만 부른다.
//
// 사람 그림은 머리에 쓴 것으로 가른다 — 갓(어사), 머리띠(산적), 복면(자객), 전립(사병), 사모(벼슬아치).
// 34~48px 칸에서 몸 생김새는 거의 안 보이고 머리 윤곽만 남기 때문이다. 요괴는 뿔·귀·꼬리·머리채로
// 가른다.
(function (root) {

const INK = 'currentColor';

// 공통 몸: 도포 자락.
const body = (fill) => `<path d="M10 46 L13 27 Q20 23 27 27 L30 46 Z" fill="${fill}"/>`;
const head = (fill = '#f1d7b8') => `<circle cx="20" cy="20" r="6" fill="${fill}"/>`;

const FIGURES = {
  // 갓: 넓은 챙과 높은 대우. 도포는 흰색에 가까워 어두운 적과 갈린다.
  hero: body('#e9e4d8') + `<path d="M13 27 L20 33 L27 27" fill="none" stroke="#3a3226" stroke-width="1.2"/>`
    + head() + `<ellipse cx="20" cy="15" rx="12" ry="2.2" fill="#1f1b17"/><path d="M15.5 15 L16.5 7 Q20 5.6 23.5 7 L24.5 15 Z" fill="#1f1b17" opacity=".85"/>`
    + `<path d="M15 16.5 Q20 28 25 16.5" fill="none" stroke="#1f1b17" stroke-width=".8"/>`,
  bandit: body('#7a5a3a') + head() + `<rect x="13.5" y="14.5" width="13" height="3" rx="1" fill="#b23a2e"/>`
    + `<path d="M15 23 Q20 28 25 23 L24 25 Q20 29 16 25 Z" fill="#2a2018"/>`,
  spearman: body('#6f5a3f') + head() + `<rect x="13.5" y="14.5" width="13" height="3" rx="1" fill="#3b6ea8"/>`
    + `<path d="M33 46 L33 6" stroke="#5a4630" stroke-width="1.6"/><path d="M33 2 L35 8 L31 8 Z" fill="#9aa4ad"/>`,
  archer: body('#5f6b3a') + head() + `<rect x="13.5" y="14.5" width="13" height="3" rx="1" fill="#d39b2a"/>`
    + `<path d="M32 10 Q40 26 32 42" fill="none" stroke="#6b4a2a" stroke-width="1.6"/><path d="M32 10 L32 42" stroke="#ddd" stroke-width=".6"/>`,
  // 복면: 눈만 남기고 다 가린다.
  assassin: body('#22242a') + `<circle cx="20" cy="20" r="6.4" fill="#22242a"/><rect x="15" y="18.2" width="10" height="2.6" rx="1.2" fill="#f1d7b8"/>`
    + `<circle cx="17.6" cy="19.5" r=".8" fill="#111"/><circle cx="22.4" cy="19.5" r=".8" fill="#111"/>`,
  // 전립과 방패.
  guard: body('#3d4d6b') + head() + `<path d="M11 15 L29 15 L24 9 Q20 5 16 9 Z" fill="#26222a"/><circle cx="20" cy="6" r="1.4" fill="#b23a2e"/>`
    + `<rect x="2" y="26" width="9" height="15" rx="2" fill="#8a6a3e" stroke="#4a3820" stroke-width="1"/>`,
  // 도깨비: 뿔 하나, 방망이.
  dokkaebi: `<path d="M8 46 L11 25 Q20 19 29 25 L32 46 Z" fill="#3f6fa3"/><circle cx="20" cy="18" r="8" fill="#c8513d"/>`
    + `<path d="M18 11 L20 3 L22 11 Z" fill="#e8dcc0"/><circle cx="17" cy="17" r="1.3" fill="#fff"/><circle cx="23" cy="17" r="1.3" fill="#fff"/>`
    + `<path d="M15 22 L17 24 L19 22 L21 24 L23 22 L25 24" fill="none" stroke="#fff" stroke-width="1"/>`
    + `<path d="M31 44 L36 22" stroke="#6b4a2a" stroke-width="3.5" stroke-linecap="round"/><circle cx="36.5" cy="21" r="3" fill="#6b4a2a"/>`,
  // 구미호: 뾰족한 귀와 부채꼴 꼬리.
  gumiho: `<path d="M20 34 Q4 30 6 16 Q12 28 20 30 Q28 28 34 16 Q36 30 20 34 Z" fill="#e7a23a" opacity=".85"/>`
    + body('#f3efe6') + `<circle cx="20" cy="20" r="6" fill="#f6e7d0"/><path d="M14 17 L13 9 L18 14 Z M26 17 L27 9 L22 14 Z" fill="#e7a23a"/>`
    + `<path d="M17 20 L19 19.5 M21 19.5 L23 20" stroke="#8a2a2a" stroke-width="1"/>`,
  // 물귀신: 얼굴을 덮는 긴 머리채와 물방울.
  mulgwisin: `<path d="M11 46 L13 27 Q20 24 27 27 L29 46 Z" fill="#cfe0e4" opacity=".8"/><circle cx="20" cy="20" r="6" fill="#dfe9ea"/>`
    + `<path d="M13 21 Q13 11 20 11 Q27 11 27 21 L28 36 L25 30 L23 38 L20 30 L17 38 L15 30 L12 36 Z" fill="#1d2a30"/>`
    + `<circle cx="9" cy="40" r="1.5" fill="#5aa0c0"/><circle cx="32" cy="36" r="1.2" fill="#5aa0c0"/>`,
  // 산적 두목: 크고, 칼자국과 큰 칼.
  chief: `<path d="M7 46 L11 25 Q20 19 29 25 L33 46 Z" fill="#5a3e28"/><circle cx="20" cy="18" r="7" fill="#e7c9a6"/>`
    + `<rect x="12.5" y="11.5" width="15" height="3.4" rx="1" fill="#7a1f1f"/><path d="M15 16 L19 21" stroke="#8a2a2a" stroke-width="1"/>`
    + `<path d="M14 22 Q20 29 26 22 L25 26 Q20 30 15 26 Z" fill="#1f1812"/><path d="M33 44 L37 10 L39 12 L35 44 Z" fill="#aab3bb"/>`,
  // 탐관오리: 사모(양쪽 날개)와 관복.
  magistrate: `<path d="M8 46 L12 26 Q20 21 28 26 L32 46 Z" fill="#6b2f6f"/><rect x="16" y="31" width="8" height="6" fill="#d9b44a"/>`
    + head('#f0d2b0') + `<path d="M14 15 L15 9 Q20 6 25 9 L26 15 Z" fill="#1f1b17"/><rect x="6" y="11" width="9" height="2.4" rx="1.2" fill="#1f1b17"/><rect x="25" y="11" width="9" height="2.4" rx="1.2" fill="#1f1b17"/>`,
  // 이무기: 똬리를 튼 뱀.
  imugi: `<path d="M4 44 Q4 34 16 34 Q30 34 30 26 Q30 18 22 18" fill="none" stroke="#2f6b4f" stroke-width="7" stroke-linecap="round"/>`
    + `<path d="M6 44 L36 44" stroke="#2f6b4f" stroke-width="6" stroke-linecap="round"/>`
    + `<path d="M16 10 Q24 6 30 12 Q32 18 24 20 Q16 20 16 14 Z" fill="#3c8a63"/><circle cx="25" cy="13" r="1.4" fill="#f4d35e"/>`
    + `<path d="M17 8 L14 3 M21 7 L20 2" stroke="#e8dcc0" stroke-width="1.4" stroke-linecap="round"/>`,
};

function figure(kind) {
  return `<svg class="fig" viewBox="0 0 40 48" aria-hidden="true">${FIGURES[kind] || ''}</svg>`;
}

// 무기 패 아이콘. 24칸 격자에 선 굵기 2, currentColor(저장소의 아이콘 규칙과 같다).
const ICONS = {
  sword: [{ d: 'M5 19 L17 7 M15 5 L19 9 M7 15 L9 17' }, { d: 'M4 20 L6 18' }],
  spear: [{ d: 'M4 20 L18 6' }, { d: 'M21 3 L17 4.5 L19.5 7 Z', f: 1 }],
  bow: [{ d: 'M7 3 Q20 12 7 21' }, { d: 'M7 3 L7 21' }, { d: 'M5 12 L19 12 M16 9.5 L19 12 L16 14.5' }],
  flail: [{ d: 'M4 20 L9 15' }, { d: 'M9 15 Q12 12 14 10' }, { d: 'M14 10 L20 4' }, { d: 'M12.5 8.5 L15.5 11.5' }],
  twin: [{ d: 'M5 5 L19 19 M19 5 L5 19' }, { d: 'M3.5 8 L8 3.5 M16 3.5 L20.5 8' }],
  kick: [{ d: 'M8 3 L8 12 L15 17 L20 17' }, { d: 'M4 20 L8 12' }],
  charm: [{ d: 'M7 3 H17 V21 H7 Z' }, { d: 'M10 7 H14 M12 7 V11 Q9 13 12 15 Q15 17 12 19' }],
  dash: [{ d: 'M4 8 H12 M2 12 H11 M4 16 H12' }, { d: 'M15 6 L21 12 L15 18' }],
  mapae: [{ d: 'M12 3 A8 8 0 1 1 11.9 3 Z' }, { d: 'M8 11 H16 M9 14 H15' }, { d: 'M12 1 V3' }],
  // 화면의 표시와 단추.
  coin: [{ d: 'M12 3 A9 9 0 1 1 11.9 3 Z' }, { d: 'M9.5 9.5 H14.5 V14.5 H9.5 Z' }],
  heart: [{ d: 'M12 20 L4.5 12.5 A4.2 4.2 0 0 1 12 7 A4.2 4.2 0 0 1 19.5 12.5 Z', f: 1 }],
  stun: [{ d: 'M12 12 m-1 0 a1 1 0 1 1 2 0 a3 3 0 1 1 -6 0 a5 5 0 1 1 10 0 a7 7 0 1 1 -14 0' }],
  left: [{ d: 'M19 12 H5 M10 7 L5 12 L10 17' }],
  right: [{ d: 'M5 12 H19 M14 7 L19 12 L14 17' }],
  turn: [{ d: 'M5 9 H16 A4 4 0 0 1 16 17 H8' }, { d: 'M9 5 L5 9 L9 13' }],
  wait: [{ d: 'M12 3 A9 9 0 1 1 11.9 3 Z' }, { d: 'M12 7 V12 L15 14' }],
  unleash: [{ d: 'M4 12 H14' }, { d: 'M11 6 L17 12 L11 18' }, { d: 'M19 5 V19' }],
};

function icon(name) {
  const parts = (ICONS[name] || []).map((p) => `<path d="${p.d}"${p.f ? ' fill="currentColor" stroke="none"' : ''}/>`).join('');
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
}

// 싸움터 뒤의 풍경. 수묵화처럼 겹친 산 능선과 해(달). 고을마다 색과 능선만 바꾼다.
const SCENES = {
  pass: { sky: '#e9e1cf', far: '#c9c0ad', near: '#a39a86', sun: '#d8643f', ridge: [[0, 60], [40, 38], [80, 52], [130, 30], [180, 50], [240, 34], [300, 56]] },
  town: { sky: '#e6e4da', far: '#c7cbbd', near: '#9aa391', sun: '#e2a03a', ridge: [[0, 64], [60, 52], [110, 58], [170, 44], [230, 56], [300, 48]] },
  mountain: { sky: '#d8dbe0', far: '#a9b0b9', near: '#6f7883', sun: '#f2efe2', ridge: [[0, 50], [30, 24], [70, 44], [120, 16], [170, 40], [220, 20], [270, 42], [300, 30]] },
};

function scenery(id) {
  const s = SCENES[id] || SCENES.pass;
  const line = (pts, dy) => `M0 80 L${pts.map(([x, y]) => `${x} ${y + dy}`).join(' L')} L300 80 Z`;
  return `<svg class="scene" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">`
    + `<rect width="300" height="80" fill="${s.sky}"/><circle cx="236" cy="22" r="11" fill="${s.sun}" opacity=".85"/>`
    + `<path d="${line(s.ridge, 0)}" fill="${s.far}"/>`
    + `<path d="${line(s.ridge.map(([x, y]) => [x, y]).reverse().map(([x, y]) => [300 - x, y]), 16)}" fill="${s.near}"/></svg>`;
}

root.AmhaengArt = { figure, icon, scenery, FIGURES, ICONS };

})(window);

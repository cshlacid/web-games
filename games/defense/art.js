'use strict';

// 캐릭터 그림의 원본. **node에서만 돈다** — `bake.js`가 이것을 브라우저로 그려
// `units.png` 한 장으로 떨어뜨린다. 사이트는 구워진 시트만 쓴다.
//
// 한 칸은 192px이고 화면에서는 34px로 줄여 쓴다. 폰의 화면 배율이 2~3배라 줄인
// 그림이 오히려 선명하다.
//
// **도형을 늘어놓지 않고 재질로 칠한다.** 평평한 색으로 두면 아무리 모양을 잡아도
// 도형 뭉치로 보인다. 천은 위가 밝고 아래가 어두운 기울기, 쇠는 밝은 띠 하나와
// 어두운 모서리, 가죽은 따뜻한 갈색 두 단. 여기에 오른쪽 위에서 들어오는 빛을
// 모든 조각이 같이 받는다.
//
// **실루엣이 먼저다.** 34px에서 누가 누구인지 가르는 것은 색이 아니라 머리에 쓴
// 것과 손에 든 것이다.

const CELL = 192;
const COLS = 7;
const MID = CELL / 2;

const ALLY_INK = '#2a2028';
const FOE_INK = '#180f16';

// 좌우 대칭인 조각은 한 번 적고 뒤집어 쓴다.
const pair = (svg) => `${svg}<g transform="translate(${CELL} 0) scale(-1 1)">${svg}</g>`;

function defs(k, c) {
  return `
  <linearGradient id="cl${k}" x1="0.3" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="${c.light}"/>
    <stop offset="0.45" stop-color="${c.main}"/>
    <stop offset="1" stop-color="${c.dark}"/>
  </linearGradient>
  <linearGradient id="mt${k}" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#f2f5fa"/>
    <stop offset="0.28" stop-color="#c3cad6"/>
    <stop offset="0.55" stop-color="#8f97a6"/>
    <stop offset="1" stop-color="#525a69"/>
  </linearGradient>
  <linearGradient id="lt${k}" x1="0.3" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="#a87b4e"/>
    <stop offset="0.5" stop-color="#7d5733"/>
    <stop offset="1" stop-color="#4f3520"/>
  </linearGradient>
  <linearGradient id="wd${k}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#8a6238"/>
    <stop offset="0.45" stop-color="#6d4a27"/>
    <stop offset="1" stop-color="#4a301a"/>
  </linearGradient>
  <radialGradient id="sk${k}" cx="0.38" cy="0.3" r="0.85">
    <stop offset="0" stop-color="${c.skinLight || '#ffe9d0'}"/>
    <stop offset="0.55" stop-color="${c.skin || '#f0cba4'}"/>
    <stop offset="1" stop-color="${c.skinDark || '#cf9f72'}"/>
  </radialGradient>
  <radialGradient id="gl${k}" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${c.glow || '#ffffff'}" stop-opacity="0.95"/>
    <stop offset="0.5" stop-color="${c.glow || '#ffffff'}" stop-opacity="0.4"/>
    <stop offset="1" stop-color="${c.glow || '#ffffff'}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="rim${k}" x1="0" y1="0" x2="1" y2="0.4">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="0.82" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0.5"/>
  </linearGradient>`;
}

const ground = () => `
  <ellipse cx="${MID}" cy="176" rx="46" ry="9" fill="#000" opacity="0.2"/>`;

const heroGround = () => `
  <ellipse cx="${MID}" cy="176" rx="54" ry="12" fill="#f0d27a" opacity="0.45"/>
  <ellipse cx="${MID}" cy="176" rx="44" ry="8" fill="#000" opacity="0.2"/>`;

// 다리와 신발. 천 옷 아래로 조금만 내민다 — 다 보이면 몸이 길어져 SD 비율이 깨진다.
const boots = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    ${pair(`<path d="M76 140 L94 140 L94 160 Q94 170 82 170 L70 170 Q62 170 62 163 Q62 156 72 153 Z" fill="url(#lt${k})"/>`)}
    ${pair(`<rect x="72" y="141" width="23" height="9" rx="4" fill="#3f2a19" opacity="0.85"/>`)}
  </g>`;

// 옷자락. 마법사와 사제는 다리 대신 이것을 입는다.
const robe = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M74 118 Q58 148 50 170 Q96 178 142 170 Q134 148 118 118 Z" fill="url(#cl${k})"/>
    <path d="M50 170 Q96 178 142 170 Q96 166 50 170 Z" fill="#000" opacity="0.25" stroke="none"/>
    <path d="M96 122 L96 172" stroke="${c.dark}" stroke-width="3" opacity="0.7"/>
  </g>`;

// 몸통. 천 위에 무엇을 덧대느냐로 직업이 갈린다.
const torso = (k, c, w = 0) => `
  <path d="M${66 - w} 112 Q${62 - w} 104 ${74 - w} 100 L${118 + w} 100 Q${130 + w} 104 ${126 + w} 112
           L${130 + w} 146 Q96 156 ${62 - w} 146 Z"
        fill="url(#cl${k})" stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round"/>`;

const belt = (k, c, y = 134) => `
  <g stroke="${c.ink}" stroke-width="3" stroke-linejoin="round">
    <path d="M63 ${y} Q96 ${y + 8} 129 ${y} L129 ${y + 11} Q96 ${y + 19} 63 ${y + 11} Z" fill="url(#lt${k})"/>
    <rect x="88" y="${y + 3}" width="16" height="13" rx="3" fill="#d9b45c"/>
  </g>`;

// 팔. 어깨에서 손까지 한 덩어리로 두고 장갑만 따로 얹는다.
const arms = (k, c, glove = '#6b4a2d') => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    ${pair(`<path d="M66 104 Q52 108 50 124 L52 140 Q54 148 62 147 Q70 146 70 138 L68 122 Q68 112 76 108 Z" fill="url(#cl${k})"/>`)}
    ${pair(`<ellipse cx="61" cy="145" rx="11" ry="10" fill="${glove}"/>`)}
  </g>`;

// 어깨 갑옷. 쇠를 입은 캐릭터만 단다.
const pauldrons = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    ${pair(`<path d="M74 98 Q52 96 46 114 Q44 124 54 126 Q70 124 74 110 Z" fill="url(#mt${k})"/>`)}
    ${pair(`<path d="M70 102 Q56 102 52 112" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3"/>`)}
  </g>`;

// 머리. 얼굴은 늘 같은 자리에 오고 위에 쓰는 것만 바뀐다.
const head = (k, c, r = 43) => `
  <circle cx="${MID}" cy="64" r="${r}" fill="url(#sk${k})" stroke="${c.ink}" stroke-width="3.4"/>`;

// 눈·눈썹·입. 34px에서 뭉개지지 않게 흰자와 눈동자, 빛 하나까지만 넣는다.
function face(c, o = {}) {
  const y = o.y == null ? 70 : o.y;
  const dx = o.dx == null ? 17 : o.dx;
  const iris = o.iris || '#4a3a2e';
  const brow = o.brow == null ? 0 : o.brow;   // 올리면 사나워 보인다
  return `
  <g stroke="none">
    ${pair(`<ellipse cx="${MID - dx}" cy="${y}" rx="9" ry="10.5" fill="#fdf6ee"/>`)}
    ${pair(`<circle cx="${MID - dx + 1.5}" cy="${y + 1}" r="6" fill="${iris}"/>`)}
    ${pair(`<circle cx="${MID - dx + 1.5}" cy="${y + 1}" r="2.8" fill="#140f14"/>`)}
    ${pair(`<circle cx="${MID - dx - 1.5}" cy="${y - 3}" r="2.6" fill="#fff" opacity="0.95"/>`)}
    ${pair(`<path d="M${MID - dx - 11} ${y - 13 + brow} Q${MID - dx} ${y - 19} ${MID - dx + 9} ${y - 14 - brow}"
             fill="none" stroke="${o.browColor || '#5a4436'}" stroke-width="4.5" stroke-linecap="round"/>`)}
    ${o.mouth === false ? '' : `<path d="M${MID - 7} ${y + 20} Q${MID} ${y + 25} ${MID + 7} ${y + 20}"
        fill="none" stroke="${o.mouthColor || '#a9705a'}" stroke-width="3.2" stroke-linecap="round"/>`}
    ${o.fang ? pair(`<path d="M${MID - 13} ${y + 17} L${MID - 8} ${y + 27} L${MID - 4} ${y + 17} Z" fill="#fdf6ee"/>`) : ''}
  </g>`;
}

// 귀. 사람은 작게, 고블린 쪽은 길고 뾰족하게.
const ears = (k, c, long) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    ${long
    ? pair(`<path d="M58 58 Q28 40 22 62 Q34 78 56 74 Z" fill="url(#sk${k})"/>`)
    : pair(`<ellipse cx="55" cy="70" rx="9" ry="12" fill="url(#sk${k})"/>`)}
  </g>`;

const rim = (k) => `<circle cx="${MID}" cy="64" r="41" fill="url(#rim${k})" stroke="none"/>`;

// --- 머리에 쓰는 것 ---
const hood = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M124 26 Q164 22 152 66 Q140 44 120 34 Z" fill="${c.dark}"/>
    <path d="M53 66 Q50 22 96 20 Q142 22 139 66 Q136 84 126 92 Q118 58 96 56 Q74 58 66 92 Q56 84 53 66 Z"
          fill="url(#cl${k})"/>
    <path d="M66 92 Q74 58 96 56 Q118 58 126 92" fill="none" stroke="${c.dark}" stroke-width="4" opacity="0.8"/>
    <path d="M60 40 Q96 24 132 40" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
  </g>`;

const hair = (k, color, shade) => `
  <g stroke="none">
    <path d="M55 62 Q54 22 96 22 Q138 22 137 62 Q128 44 96 42 Q64 44 55 62 Z" fill="${color}"/>
    <path d="M60 44 Q96 28 132 44 Q96 36 60 44 Z" fill="${shade}" opacity="0.6"/>
  </g>`;

const wizardHat = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M112 -4 Q102 26 108 40 Q126 48 130 62 L58 62 Q62 40 78 26 Q96 10 112 -4 Z" fill="url(#cl${k})"/>
    <ellipse cx="${MID}" cy="62" rx="52" ry="13" fill="${c.dark}"/>
    <ellipse cx="${MID}" cy="59" rx="52" ry="12" fill="url(#cl${k})"/>
    <path d="M62 54 Q96 44 130 54 L130 62 Q96 52 62 62 Z" fill="${c.dark}" opacity="0.8"/>
    <circle cx="112" cy="0" r="7" fill="${c.glow}"/>
  </g>`;

const gunnerHat = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M40 56 Q96 36 152 56 Q148 70 96 72 Q44 70 40 56 Z" fill="url(#lt${k})"/>
    <path d="M64 54 Q66 16 96 16 Q126 16 128 54 Z" fill="url(#cl${k})"/>
    <path d="M62 44 Q96 34 130 44 L130 54 Q96 46 62 54 Z" fill="${c.dark}"/>
    <circle cx="118" cy="40" r="7" fill="#d9b45c"/>
  </g>`;

const closedHelm = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M53 66 Q50 20 96 20 Q142 20 139 66 Q139 96 96 100 Q53 96 53 66 Z" fill="url(#mt${k})"/>
    <path d="M53 62 Q96 50 139 62 L139 72 Q96 60 53 72 Z" fill="#4c5462"/>
    <rect x="88" y="56" width="16" height="46" rx="6" fill="#c9d0da"/>
    <rect x="60" y="76" width="26" height="9" rx="4" fill="#2b3038"/>
    <rect x="106" y="76" width="26" height="9" rx="4" fill="#2b3038"/>
    <path d="M62 34 Q96 20 130 34" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="4"/>
  </g>`;

const openHelm = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M96 6 Q112 20 108 40 Q102 30 96 30 Q90 30 84 40 Q80 20 96 6 Z" fill="${c.light}"/>
    <path d="M53 62 Q52 22 96 22 Q140 22 139 62 Q118 48 96 48 Q74 48 53 62 Z" fill="url(#mt${k})"/>
    <rect x="88" y="40" width="16" height="34" rx="6" fill="#c9d0da"/>
    <path d="M60 36 Q96 22 132 36" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="4"/>
  </g>`;

const veil = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M50 68 Q46 22 96 20 Q146 22 142 68 Q142 100 128 108 Q118 62 96 60 Q74 62 64 108 Q50 100 50 68 Z"
          fill="url(#cl${k})"/>
    <path d="M64 108 Q74 62 96 60 Q118 62 128 108" fill="none" stroke="#d9b45c" stroke-width="4"/>
    <path d="M60 38 Q96 24 132 38" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="4"/>
  </g>`;

const hornedHelm = (k, c, big) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    ${pair(`<path d="M62 36 Q${big ? 16 : 26} ${big ? 2 : 14} ${big ? 8 : 18} ${big ? 46 : 48}
              Q${big ? 24 : 30} ${big ? 34 : 38} ${big ? 30 : 34} ${big ? 40 : 42}
              Q${big ? 44 : 46} ${big ? 26 : 30} 64 54 Z" fill="#ded5c8"/>`)}
    <path d="M55 64 Q54 24 96 24 Q138 24 137 64 Q137 88 96 92 Q55 88 55 64 Z" fill="url(#mt${k})"/>
    <rect x="58" y="66" width="76" height="12" rx="5" fill="#23272e"/>
    ${pair(`<rect x="64" y="68" width="24" height="8" rx="3" fill="${c.glow}"/>`)}
  </g>`;

// --- 손에 드는 것 ---
const bow = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M46 40 Q20 100 46 160" fill="none" stroke="${c.ink}" stroke-width="13"/>
    <path d="M46 40 Q20 100 46 160" fill="none" stroke="url(#wd${k})" stroke-width="9"/>
    <path d="M46 42 L46 158" fill="none" stroke="#efe6d2" stroke-width="3"/>
    <rect x="30" y="88" width="14" height="26" rx="6" fill="#5a3d24"/>
  </g>`;

const quiver = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.2" stroke-linejoin="round">
    <path d="M140 98 L164 98 L157 152 L143 152 Z" fill="url(#lt${k})"/>
    ${[0, 1, 2].map((i) => `
      <line x1="${145 + i * 7}" y1="98" x2="${143 + i * 7}" y2="62" stroke="#8a6238" stroke-width="4.5"/>
      <path d="M${143 + i * 7} 62 l-7 11 l14 0 z" fill="${i === 1 ? '#e4dccc' : '#c05a4a'}"/>`).join('')}
  </g>`;

const kiteShield = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M14 84 Q42 68 70 84 L70 130 Q42 160 14 130 Z" fill="url(#mt${k})"/>
    <path d="M22 90 Q42 79 62 90 L62 126 Q42 148 22 126 Z" fill="url(#cl${k})"/>
    <path d="M42 92 L42 136 M26 112 L58 112" stroke="#e8e2d2" stroke-width="5" stroke-linecap="round"/>
    <circle cx="42" cy="112" r="8" fill="#d9b45c"/>
  </g>`;

const handCannon = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round" transform="rotate(-24 118 128)">
    <rect x="100" y="110" width="82" height="36" rx="16" fill="url(#mt${k})"/>
    <rect x="106" y="115" width="62" height="10" rx="5" fill="#ffffff" opacity="0.45" stroke="none"/>
    <rect x="124" y="104" width="15" height="48" rx="5" fill="#b8862f"/>
    <rect x="172" y="102" width="19" height="52" rx="8" fill="#8d949e"/>
    <path d="M104 146 Q94 166 110 170" fill="none" stroke="#5a3d24" stroke-width="7"/>
    <circle cx="186" cy="128" r="10" fill="${c.glow}"/>
  </g>`;

const iceStaff = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <rect x="146" y="52" width="12" height="118" rx="5" fill="url(#wd${k})"/>
    ${[0, 1].map((i) => `<rect x="143" y="${96 + i * 20}" width="18" height="8" rx="3" fill="#5a3d24"/>`).join('')}
    <circle cx="152" cy="38" r="26" fill="url(#gl${k})" stroke="none"/>
    <path d="M152 12 L170 26 L164 48 L140 48 L134 26 Z" fill="${c.light}"/>
    <path d="M152 20 L163 29 L159 44 L145 44 L141 29 Z" fill="#ffffff" opacity="0.8" stroke="none"/>
  </g>`;

const spear = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <rect x="148" y="36" width="11" height="136" rx="5" fill="url(#wd${k})"/>
    <path d="M153 2 Q170 24 166 40 L140 40 Q136 24 153 2 Z" fill="url(#mt${k})"/>
    <rect x="142" y="40" width="23" height="10" rx="4" fill="#8d949e"/>
    <path d="M153 50 Q142 62 148 76 Q153 64 158 76 Q164 62 153 50 Z" fill="${c.main}"/>
  </g>`;

const lantern = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <circle cx="146" cy="64" r="30" fill="url(#gl${k})" stroke="none"/>
    <path d="M146 34 L164 46 L164 74 L146 86 L128 74 L128 46 Z" fill="${c.light}"/>
    <path d="M146 42 L157 50 L157 70 L146 78 L135 70 L135 50 Z" fill="#fffbe6" opacity="0.9" stroke="none"/>
    <rect x="140" y="26" width="12" height="12" rx="4" fill="#d9b45c"/>
  </g>`;

const cleaver = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <rect x="144" y="104" width="12" height="66" rx="5" fill="url(#wd${k})"/>
    <path d="M140 58 L184 66 Q190 92 170 112 L140 106 Z" fill="url(#mt${k})"/>
    <path d="M148 70 L176 76 Q180 92 168 104" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="4.5"/>
    <path d="M140 58 L140 106" stroke="#4c5462" stroke-width="5"/>
  </g>`;

const warMaul = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <rect x="140" y="62" width="13" height="106" rx="5" fill="url(#wd${k})"/>
    <path d="M114 32 L176 22 Q186 22 186 32 L186 60 Q186 70 176 70 L114 60 Q106 58 106 46 Q106 34 114 32 Z"
          fill="url(#mt${k})"/>
    <path d="M116 36 L134 34 L134 58 L116 56 Z" fill="#ffffff" opacity="0.4" stroke="none"/>
    <path d="M186 34 L196 46 L186 58 Z" fill="#8d949e"/>
    ${[0, 1].map((i) => `<circle cx="${142 + i * 30}" cy="46" r="5" fill="#4c5462"/>`).join('')}
  </g>`;

const boneStaff = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <rect x="146" y="56" width="11" height="114" rx="5" fill="#d8cfc2"/>
    <circle cx="152" cy="40" r="26" fill="url(#gl${k})" stroke="none"/>
    <path d="M138 44 Q134 22 152 20 Q170 22 166 44 Q152 36 138 44 Z" fill="#e8e2d6"/>
    ${pair(`<circle cx="${192 - 146}" cy="36" r="4" fill="${c.glow}"/>`)}
  </g>`;

const wings = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.2" stroke-linejoin="round">
    ${pair(`<path d="M62 92 Q26 68 16 96 Q26 94 26 106 Q38 100 40 112 Q52 106 62 112 Z" fill="${c.dark}"/>`)}
  </g>`;

const cape = (k, c) => `
  <path d="M62 100 Q30 132 34 174 Q96 186 158 174 Q162 132 130 100 Z"
        fill="${c.dark}" stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round"/>`;

function figure(key, c, parts, hero) {
  return `<svg viewBox="0 0 ${CELL} ${CELL}" width="${CELL}" height="${CELL}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs(key, c)}</defs>
  ${hero ? heroGround() : ground()}
  ${parts}
</svg>`;
}

const ALLY = { skin: '#f0cba4', skinLight: '#ffe9d0', skinDark: '#cf9f72', ink: ALLY_INK };
const FOE = (skin, light, dark) => ({ skin, skinLight: light, skinDark: dark, ink: FOE_INK });

const FIGURES = {};

// 궁수 — 초록 망토와 긴 활, 어깨 너머의 화살통. 여섯 중 가장 마른 실루엣.
FIGURES.archer = (() => {
  const k = 'ar';
  const c = { ...ALLY, main: '#4f9b5c', light: '#7dc389', dark: '#2f6b3c', glow: '#e9e3d2' };
  return figure(k, c, quiver(k, c) + bow(k, c) + boots(k, c) + torso(k, c) + belt(k, c)
    + arms(k, c, '#6b4a2d') + head(k, c) + ears(k, c) + hood(k, c)
    + face(c, { iris: '#3f6b3f' }) + rim(k));
})();

// 방패병 — 판금과 연푸른 겉옷, 몸 절반을 가리는 방패. 가장 넓다.
FIGURES.shield = (() => {
  const k = 'sh';
  const c = { ...ALLY, main: '#4272b8', light: '#79a3dc', dark: '#2b4c80', glow: '#dfe6f2' };
  return figure(k, c, boots(k, c) + torso(k, c, 6) + belt(k, c) + arms(k, c, '#8f97a6')
    + pauldrons(k, c) + head(k, c) + closedHelm(k, c) + kiteShield(k, c) + rim(k));
})();

// 포수 — 챙 넓은 모자와 놋쇠 손대포, 불붙은 심지.
FIGURES.cannon = (() => {
  const k = 'ca';
  const c = { ...ALLY, main: '#c9762f', light: '#eaa055', dark: '#8a4c1a', glow: '#ffcf5c' };
  return figure(k, c, boots(k, c) + torso(k, c) + belt(k, c) + arms(k, c, '#5a3d24')
    + handCannon(k, c) + head(k, c) + hair(k, '#6b4a2d', '#8a6238') + gunnerHat(k, c)
    + face(c, { iris: '#5a3a22' }) + rim(k));
})();

// 빙결술사 — 긴 고깔과 얼음이 박힌 지팡이, 발까지 덮는 옷자락.
FIGURES.frost = (() => {
  const k = 'fr';
  const c = { ...ALLY, main: '#45a8cc', light: '#83d4ee', dark: '#2b7793', glow: '#cdf2ff' };
  return figure(k, c, iceStaff(k, c) + robe(k, c) + torso(k, c) + belt(k, c, 128)
    + arms(k, c, '#3a7f9b') + head(k, c) + wizardHat(k, c)
    + face(c, { iris: '#2f6f8c' }) + rim(k));
})();

// 창병 — 깃 달린 투구와 긴 창. 위로 가장 길다.
FIGURES.spear = (() => {
  const k = 'sp';
  const c = { ...ALLY, main: '#bc4f47', light: '#e07d6e', dark: '#80322c', glow: '#f3b9a8' };
  return figure(k, c, spear(k, c) + boots(k, c) + torso(k, c) + belt(k, c)
    + arms(k, c, '#8f97a6') + pauldrons(k, c) + head(k, c) + ears(k, c) + openHelm(k, c)
    + face(c, { iris: '#6b3a2e', brow: 2 }) + rim(k));
})();

// 힐러 — 금 테를 두른 두건과 빛나는 등. 옷자락이 길다.
FIGURES.healer = (() => {
  const k = 'he';
  const c = { ...ALLY, main: '#f0e7cf', light: '#ffffff', dark: '#c2ab72', glow: '#ffe9a8' };
  return figure(k, c, robe(k, c) + torso(k, c) + belt(k, c, 128) + arms(k, c, '#d9c48a')
    + head(k, c) + veil(k, c) + face(c, { iris: '#8a6b2a' }) + lantern(k, c) + rim(k));
})();

// --- 밀려오는 쪽. 편은 색으로 가른다 — 자주와 잿빛. ---

// 보병 — 가죽을 덧댄 고블린. 길고 뾰족한 귀와 송곳니.
FIGURES.grunt = (() => {
  const k = 'gr';
  const c = { ...FOE('#8d5a6e', '#b07d90', '#5e3a4a'), main: '#6a4150', light: '#8f5d70', dark: '#432734', glow: '#e0555f' };
  return figure(k, c, cleaver(k, c) + boots(k, c) + torso(k, c) + belt(k, c)
    + arms(k, c, '#4f3520') + head(k, c) + ears(k, c, true)
    + face(c, { iris: '#e0555f', brow: 4, browColor: '#3a2430', fang: 1, mouthColor: '#7a3a46' }) + rim(k));
})();

// 무리 — 박쥐 날개를 단 작은 것. 혼자서는 약하고 떼로 온다.
FIGURES.swarm = (() => {
  const k = 'sw';
  const c = { ...FOE('#a06a80', '#c08ea0', '#6b4353'), main: '#7a4a5c', light: '#a06a80', dark: '#4c2d39', glow: '#e0555f' };
  return figure(k, c, `<g transform="translate(${MID} 118) scale(0.74) translate(${-MID} -118)">`
    + wings(k, c) + boots(k, c) + torso(k, c) + arms(k, c, '#4c2d39') + '</g>'
    + `<g transform="translate(${MID} 86) scale(0.86) translate(${-MID} -86)">`
    + head(k, c, 40) + ears(k, c, true)
    + face(c, { y: 78, dx: 15, iris: '#ffb347', brow: 4, browColor: '#3a2430', fang: 1, mouthColor: '#7a3a46' })
    + '</g>');
})();

// 경보병 — 넝마를 걸치고 단검을 든 척후. 마르고 앞으로 기운다.
FIGURES.swift = (() => {
  const k = 'sf';
  const c = { ...FOE('#9b5f86', '#bb82a4', '#653d58'), main: '#5f3b55', light: '#8a5a7c', dark: '#3d2437', glow: '#f0a0c0' };
  return figure(k, c, `<g transform="rotate(-6 ${MID} 120)">`
    + boots(k, c) + torso(k, c, -8) + belt(k, c) + arms(k, c, '#3d2437')
    + `<g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
         <path d="M150 84 L172 132 L158 140 L140 92 Z" fill="url(#mt${k})"/>
         <rect x="136" y="86" width="22" height="11" rx="4" fill="#5a3d24" transform="rotate(-22 147 92)"/>
       </g>`
    + head(k, c, 40) + ears(k, c, true) + hood(k, c)
    + face(c, { iris: '#ffd447', brow: 5, browColor: '#2e1c2a', fang: 1, mouth: false })
    + rim(k) + '</g>');
})();

// 중장병 — 통짜 판금. 얼굴 대신 틈이 붉게 빛난다.
FIGURES.armored = (() => {
  const k = 'am';
  const c = { ...FOE('#767c85', '#9aa0a8', '#4a4f58'), main: '#6d727a', light: '#9aa0a8', dark: '#41454c', glow: '#ff7a5c' };
  return figure(k, c, boots(k, c) + torso(k, c, 12) + belt(k, c) + arms(k, c, '#4a4f58')
    + pauldrons(k, c) + head(k, c, 41) + hornedHelm(k, c) + rim(k));
})();

// 공성병 — 거대한 망치를 든 덩치. 벽이든 사람이든 부수고 온다.
FIGURES.breaker = (() => {
  const k = 'br';
  const c = { ...FOE('#875a6d', '#a97b8c', '#573a48'), main: '#5e3d4b', light: '#835569', dark: '#3a2531', glow: '#e0555f' };
  return figure(k, c, warMaul(k, c) + boots(k, c) + torso(k, c, 10) + belt(k, c)
    + arms(k, c, '#3a2531') + pauldrons(k, c) + head(k, c, 41) + ears(k, c, true)
    + face(c, { iris: '#ffb347', brow: 5, browColor: '#2e1c2a', fang: 1, mouthColor: '#6b2f3c' }) + rim(k));
})();

// 치유병 — 두건과 뼈 지팡이. 옆을 되살린다.
FIGURES.mender = (() => {
  const k = 'me';
  const c = { ...FOE('#7566a0', '#9a8cc0', '#453a5e'), main: '#584a7e', light: '#7e6fa8', dark: '#332a4a', glow: '#9fe6b4' };
  return figure(k, c, boneStaff(k, c) + robe(k, c) + torso(k, c) + belt(k, c, 128)
    + arms(k, c, '#332a4a') + head(k, c) + veil(k, c)
    + face(c, { iris: '#9fe6b4', brow: 4, browColor: '#2a2240', mouth: false }) + rim(k));
})();

// 우두머리 — 뿔 달린 투구와 망토. 마지막 웨이브에 혼자 온다.
FIGURES.boss = (() => {
  const k = 'bo';
  const c = { ...FOE('#6d3550', '#8f4f6e', '#431f32'), main: '#5a2942', light: '#8f4f6e', dark: '#331826', glow: '#ff5d4d' };
  return figure(k, c, `<g transform="translate(${MID} 104) scale(1.1) translate(${-MID} -104)">`
    + cape(k, c) + `<g transform="translate(18 26)">${warMaul(k, c)}</g>` + boots(k, c) + torso(k, c, 14) + belt(k, c)
    + arms(k, c, '#331826') + pauldrons(k, c)
    + head(k, c, 42) + hornedHelm(k, c, true) + rim(k) + '</g>');
})();


// --- 언데드 둘. 밀려오는 쪽의 자주·회색에서 **한 겹 더 창백한 쪽**으로 민다. ---
// 34px에서 산 것과 가르는 것은 색이 아니라 **얼굴이다** — 눈이 없고 구멍에서
// 빛이 난다. 둘 다 그 하나로 언데드임을 알린다.

// 해골 얼굴. 눈구멍은 검게 파고 그 안에서 불이 돈다.
const skullFace = (k, c) => `
  <g stroke="none">
    ${pair(`<ellipse cx="${MID - 17}" cy="68" rx="11" ry="12.5" fill="#140f14"/>`)}
    ${pair(`<circle cx="${MID - 16}" cy="69" r="5.5" fill="${c.glow}"/>`)}
    <path d="M${MID - 5} 84 L${MID} 76 L${MID + 5} 84 Z" fill="#140f14"/>
    <path d="M70 96 Q96 104 122 96" fill="none" stroke="#140f14" stroke-width="4" stroke-linecap="round"/>
    ${[-18, -6, 6, 18].map((dx) => `<rect x="${MID + dx - 3}" y="92" width="6" height="11" rx="2" fill="#140f14"/>`).join('')}
  </g>`;

// 갈비뼈. 살이 없는 몸통이라 옷 대신 이것이 실루엣을 만든다.
const ribs = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3" stroke-linecap="round" fill="none">
    ${[0, 1, 2].map((i) => `<path d="M74 ${118 + i * 15} Q96 ${126 + i * 15} 118 ${118 + i * 15}"
        stroke="#efe8d6" stroke-width="7"/>`).join('')}
    <rect x="91" y="112" width="10" height="56" rx="4" fill="#efe8d6" stroke="${c.ink}" stroke-width="2.6"/>
  </g>`;

// 아래가 찢어져 흩어지는 옷자락. **망령은 다리가 없다** — 34px에서 산 것과 가르는
// 두 번째 표시가 이 밑단이라, 몸통 위에 덮어 그리고 깊게 판다.
const tatters = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M58 98 Q42 146 48 182 Q60 152 70 180 Q82 150 96 182 Q110 150 122 180
             Q132 152 144 182 Q150 146 134 98 Z" fill="url(#cl${k})"/>
    <path d="M66 118 Q96 134 126 118" fill="none" stroke="${c.dark}" stroke-width="4.5" opacity="0.85"/>
    <path d="M70 100 Q96 92 122 100" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="5"/>
  </g>`;

// 낡은 검. 해골병이 든 것이라 날이 이 빠지게 꺾어 둔다.
const rustSword = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.2" stroke-linejoin="round">
    <path d="M152 18 L164 40 L162 116 L142 116 L142 40 Z" fill="url(#mt${k})"/>
    <path d="M148 34 L148 112" stroke="#ffffff" stroke-opacity="0.45" stroke-width="4"/>
    <rect x="130" y="112" width="44" height="10" rx="4" fill="#4a301a"/>
    <rect x="146" y="120" width="14" height="26" rx="5" fill="url(#wd${k})"/>
  </g>`;

// 해골병 — 뼈만 남은 병사. 빈 눈구멍과 갈비뼈, 이 빠진 검.
FIGURES.bone = (() => {
  const k = 'bn';
  const c = { ...FOE('#efe8d6', '#fffaf0', '#c9c0ab'), main: '#8b8477', light: '#b3ab9c', dark: '#5d574c', glow: '#7fe08a' };
  return figure(k, c, rustSword(k, c) + boots(k, c) + ribs(k, c) + belt(k, c, 150)
    + arms(k, c, '#efe8d6') + head(k, c, 44) + skullFace(k, c) + rim(k));
})();

// 망령 — 다리 없이 떠 온다. 후드 안에 얼굴 대신 불 두 점만 있다.
FIGURES.wraith = (() => {
  const k = 'wr';
  const c = { ...FOE('#3b2f4a', '#5a4a6e', '#241c2e'), main: '#4a3b63', light: '#6f5c8e', dark: '#291f38', glow: '#8ce0ff' };
  // 땅에 닿지 않는다는 것을 그림자를 띄워 알린다. 옷자락은 몸통 위에 덮는다.
  return figure(k, c, `<ellipse cx="${MID}" cy="182" rx="34" ry="7" fill="${c.glow}" opacity="0.28"/>`
    + torso(k, c, -10) + tatters(k, c) + arms(k, c, '#291f38')
    + head(k, c, 40) + hood(k, c)
    + `<g stroke="none">${pair(`<ellipse cx="${MID - 15}" cy="70" rx="8.5" ry="10" fill="#140f14"/>`)}
       ${pair(`<circle cx="${MID - 15}" cy="70" r="4.8" fill="${c.glow}"/>`)}
       <circle cx="${MID}" cy="72" r="38" fill="url(#gl${k})" opacity="0.55"/></g>`
    + rim(k));
})();

// --- 영웅 셋. 한 판에 한 번만 부를 수 있어 한눈에 달라 보여야 한다. ---
// 금색 테와 망토, 그리고 머리 위로 뻗는 것으로 일반 캐릭터와 가른다.

const greatSword = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M150 4 L164 30 L164 120 L136 120 L136 30 Z" fill="url(#mt${k})"/>
    <path d="M144 20 L144 116" stroke="#ffffff" stroke-opacity="0.55" stroke-width="5"/>
    <rect x="120" y="118" width="60" height="13" rx="6" fill="#d9b45c"/>
    <rect x="143" y="128" width="14" height="34" rx="6" fill="#5a3d24"/>
    <circle cx="150" cy="166" r="8" fill="#d9b45c"/>
  </g>`;

const orbStaff = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <rect x="146" y="56" width="12" height="116" rx="5" fill="url(#wd${k})"/>
    <circle cx="152" cy="34" r="34" fill="url(#gl${k})" stroke="none"/>
    <path d="M136 44 Q130 22 152 20 Q174 22 168 44 Q152 36 136 44 Z" fill="#d9b45c"/>
    <circle cx="152" cy="32" r="17" fill="${c.light}"/>
    <circle cx="146" cy="26" r="6" fill="#ffffff" opacity="0.9" stroke="none"/>
  </g>`;

const halo = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <ellipse cx="${MID}" cy="12" rx="30" ry="9" fill="none" stroke="#f0d27a" stroke-width="7"/>
    ${pair(`<path d="M58 34 Q26 16 16 44 Q34 38 44 52 Q48 38 58 34 Z" fill="#fdf7e4"/>`)}
  </g>`;

const beard = (c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <path d="M62 78 Q68 130 96 134 Q124 130 130 78 Q96 96 62 78 Z" fill="#eee6da"/>
  </g>`;

const mace = (k, c) => `
  <g stroke="${c.ink}" stroke-width="3.4" stroke-linejoin="round">
    <rect x="144" y="74" width="12" height="96" rx="5" fill="#5a3d24"/>
    <circle cx="150" cy="54" r="24" fill="url(#mt${k})"/>
    <circle cx="142" cy="46" r="8" fill="#ffffff" opacity="0.5" stroke="none"/>
    ${[0, 1, 2].map((i) => `<circle cx="${150 + Math.cos(i * 2.1) * 26}" cy="${54 + Math.sin(i * 2.1) * 26}" r="7" fill="#d9b45c"/>`).join('')}
  </g>`;

// 검성 — 붉은 판금과 망토, 등에 진 큰 칼. 붙어서 베는 자리다.
FIGURES.blade = (() => {
  const k = 'bl';
  const c = { ...ALLY, main: '#8e2f3c', light: '#c25a62', dark: '#4e1720', glow: '#ffcf5c' };
  return figure(k, c, cape(k, c) + greatSword(k, c) + boots(k, c) + torso(k, c, 6) + belt(k, c)
    + arms(k, c, '#8f97a6') + pauldrons(k, c) + head(k, c) + openHelm(k, c)
    + face(c, { iris: '#7a2a2a', brow: 3 }) + rim(k), true);
})();

// 대마법사 — 깊은 자주 옷과 흰 수염, 큰 구슬이 박힌 지팡이. 멀리서 내려친다.
FIGURES.arch = (() => {
  const k = 'ac';
  const c = { ...ALLY, main: '#5b4a9e', light: '#8c7ad0', dark: '#362b63', glow: '#c8b4ff' };
  return figure(k, c, orbStaff(k, c) + robe(k, c) + torso(k, c) + belt(k, c, 128)
    + arms(k, c, '#463a78') + head(k, c) + wizardHat(k, c)
    + face(c, { iris: '#4a3a8a', browColor: '#d8d2c6' }) + beard(c) + rim(k), true);
})();

// 성기사 — 흰 판금과 날개 달린 고리. 옆을 통째로 되살린다.
FIGURES.saint = (() => {
  const k = 'st';
  const c = { ...ALLY, main: '#e2bd5c', light: '#fff0c0', dark: '#9c7524', glow: '#ffe9a8' };
  // 망토만 푸른색이다 — 금빛 몸이 밝은 판에서 묻히지 않게 뒤를 받친다.
  const cloak = { ...c, dark: '#39538c', ink: c.ink };
  return figure(k, c, cape(k, cloak) + mace(k, c) + boots(k, c) + torso(k, c, 6) + belt(k, c)
    + arms(k, c, '#d5cdb4') + pauldrons(k, c) + head(k, c) + halo(k, c)
    + face(c, { iris: '#8a6b2a' }) + rim(k), true);
})();

const ORDER = [
  'archer', 'shield', 'cannon', 'frost', 'spear', 'healer',
  'grunt', 'swarm', 'swift', 'armored', 'breaker', 'mender', 'bone', 'wraith', 'boss',
  'blade', 'arch', 'saint',
];

module.exports = { CELL, COLS, FIGURES, ORDER };

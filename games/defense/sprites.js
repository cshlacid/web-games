'use strict';

// 캐릭터 그림. **시트 한 장(`units.png`)에 SD 캐릭터 열셋을 격자로 담았다.**
//
// 한 칸을 192px로 그려 두고 34px로 줄여 쓴다 — 폰의 화면 배율이 2~3배라 줄인
// 그림이 오히려 선명하고, 나중에 칸을 키워도 다시 구울 일이 없다.
//
// 예전에는 16×16 점 자료를 캔버스에 구워 바이너리 없이 갔다. 34px에서 표정이 두
// 점으로 끝나 열셋이 서로 비슷해 보여 그만뒀다.
//
// **칸 크기와 차례는 `art.js`가 정하고 여기는 같은 값을 적어 둔다.** `art.js`는
// node에서만 도는 그림 자료라 브라우저가 읽지 않는다. 둘을 바꿀 때는 같이 바꾼다 —
// **`art.test.js`가 그 둘이 어긋났는지 본다.** 영웅 셋을 그려 놓고 여기에 안 적어
// 한 번 데었다: 줄 수가 둘로 잡혀 칸마다 아랫줄이 비쳤고, 영웅은 판에서 아예
// 그려지지 않았다.
(function () {

const SHEET = {
  src: 'units.png',
  cell: 192,
  cols: 7,
  order: [
    'archer', 'shield', 'cannon', 'frost', 'spear', 'healer',
    'grunt', 'swarm', 'swift', 'armored', 'breaker', 'mender', 'bone', 'wraith', 'boss',
    'blade', 'arch', 'saint',
  ],
};

// 사격선과 얼음 표시에 쓰는 색. 그림에서 뽑아 쓸 수 없어 같은 값을 적어 둔다.
const TINT = {
  archer: { main: '#4f9b5c', light: '#e9e3d2' },
  shield: { main: '#4272b8', light: '#dfe6f2' },
  cannon: { main: '#c9762f', light: '#ffcf5c' },
  frost: { main: '#45a8cc', light: '#cdf2ff' },
  spear: { main: '#bc4f47', light: '#f3b9a8' },
  healer: { main: '#e0c256', light: '#ffe9a8' },
  grunt: { main: '#6a4150', light: '#e0555f' },
  swarm: { main: '#7a4a5c', light: '#e0555f' },
  swift: { main: '#5f3b55', light: '#f0a0c0' },
  armored: { main: '#6d727a', light: '#ff7a5c' },
  breaker: { main: '#5e3d4b', light: '#e0555f' },
  mender: { main: '#584a7e', light: '#9fe6b4' },
  bone: { main: '#8b8477', light: '#7fe08a' },
  wraith: { main: '#4a3b63', light: '#8ce0ff' },
  boss: { main: '#5a2942', light: '#ff5d4d' },
  blade: { main: '#8e2f3c', light: '#ffcf5c' },
  arch: { main: '#5b4a9e', light: '#c8b4ff' },
  saint: { main: '#e2bd5c', light: '#ffe9a8' },
};

function slot(key) {
  const i = SHEET.order.indexOf(key);
  if (i < 0) return null;
  return { sx: (i % SHEET.cols) * SHEET.cell, sy: Math.floor(i / SHEET.cols) * SHEET.cell, s: SHEET.cell };
}

let image = null;

// 시트를 한 번만 받아 둔다. 다 받기 전에는 그리지 않고 넘어간다 — 프레임 루프가
// 곧 다시 그리므로 기다릴 이유가 없다.
function load(then) {
  if (image || typeof Image === 'undefined') return image;
  image = new Image();
  image.decoding = 'async';
  if (then) image.addEventListener('load', then, { once: true });
  image.src = SHEET.src;
  return image;
}

const ready = () => !!(image && image.complete && image.naturalWidth);

function draw(ctx, key, cx, cy, size) {
  if (!ready()) return false;
  const at = slot(key);
  if (!at) return false;
  ctx.drawImage(image, at.sx, at.sy, at.s, at.s,
    Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
  return true;
}

// 단추와 목록에 넣는 작은 그림. DOM에서는 배경으로 얹는 편이 간단하고, 시트가
// 아직 안 왔을 때 기다릴 것도 없다.
function style(key, side) {
  const at = slot(key);
  if (!at) return '';
  const scale = side / SHEET.cell;
  const rows = Math.ceil(SHEET.order.length / SHEET.cols);
  return `width:${side}px;height:${side}px;background-image:url(${SHEET.src});`
    + `background-size:${SHEET.cols * side}px ${rows * side}px;`
    + `background-position:-${at.sx * scale}px -${at.sy * scale}px`;
}

const Sprites = { SHEET, TINT, slot, load, ready, draw, style };

if (typeof module !== 'undefined' && module.exports) module.exports = Sprites;
if (typeof window !== 'undefined') window.DefenseSprites = Sprites;

})();

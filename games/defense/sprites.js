'use strict';

// 캐릭터와 적의 그림. 16×16 점 자료를 들고 있다가 필요한 크기로 한 번 구워
// 캐시한다.
//
// **그림 파일도 인라인 SVG도 아닌 점 자료다.** 저장소에 바이너리를 들이지 않으면서
// 확대해도 흐려지지 않고, 판에서 쓰는 32px가 점 하나 2px로 딱 떨어진다. 색은
// 자료에서 갈라지므로 밝은 테마와 어두운 테마가 같은 그림을 쓴다.
//
// 도형을 먼저 놓고 실루엣 둘레에 외곽선을 두른다. 32px에서 누가 누구인지 가르는
// 것은 색이 아니라 실루엣이라, 머리 장식과 무기를 서로 다른 쪽으로 뻗게 두었다.
(function () {

const S = 16;
const blank = () => Array.from({ length: S }, () => Array(S).fill('.'));
const put = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = c; };
const rect = (g, x0, y0, x1, y1, c) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c);
};
const dots = (g, list, c) => { for (const [x, y] of list) put(g, x, y, c); };

function outline(g) {
  const o = g.map((r) => r.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (g[y][x] !== '.') continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx; const ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < S && ny < S && g[ny][nx] !== '.';
    });
    if (near) o[y][x] = 'o';
  }
  return o;
}

const make = (draw, eyes) => {
  const g = blank();
  draw(g);
  const o = outline(g);
  if (eyes) for (const [x, y, c] of eyes) put(o, x, y, c || 'o');
  return o.map((r) => r.join(''));
};

// 사람은 얼굴·몸통·다리를 함께 쓴다. 실루엣을 가르는 것은 머리 장식과 무기다.
function person(g) {
  rect(g, 5, 4, 10, 7, 's');
  rect(g, 5, 8, 10, 11, 'a');
  put(g, 4, 9, 's'); put(g, 11, 9, 's');
  rect(g, 5, 12, 6, 14, 'b');
  rect(g, 9, 12, 10, 14, 'b');
}
const FACE = [[6, 6], [9, 6]];

const ART = {
  archer: make((g) => {
    dots(g, [[3, 2], [2, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10], [2, 11], [3, 12]], 'b');
    rect(g, 3, 3, 3, 11, 'x');
    person(g);
    dots(g, [[7, 1], [8, 1]], 'a');
    rect(g, 6, 2, 9, 2, 'a');
    rect(g, 5, 3, 10, 4, 'a');
  }, FACE),
  shield: make((g) => {
    person(g);
    rect(g, 5, 2, 10, 3, 'd');
    dots(g, [[7, 1], [8, 1]], 'm');
    rect(g, 1, 6, 4, 13, 'm');
    rect(g, 2, 7, 3, 12, 'a');
    dots(g, [[2, 9], [2, 10]], 'w');
  }, FACE),
  cannon: make((g) => {
    person(g);
    rect(g, 3, 3, 12, 3, 'd');
    rect(g, 6, 1, 9, 2, 'a');
    rect(g, 11, 6, 14, 9, 'd');
    rect(g, 12, 7, 14, 8, 'm');
    dots(g, [[14, 7], [14, 8]], 'x');
  }, FACE),
  frost: make((g) => {
    person(g);
    put(g, 8, 0, 'b');
    rect(g, 7, 1, 9, 1, 'a');
    rect(g, 6, 2, 10, 2, 'a');
    rect(g, 5, 3, 10, 4, 'a');
    rect(g, 13, 5, 13, 14, 'b');
    rect(g, 12, 2, 14, 4, 'x');
    put(g, 13, 3, 'w');
  }, FACE),
  spear: make((g) => {
    person(g);
    rect(g, 5, 2, 10, 3, 'm');
    dots(g, [[7, 1], [8, 1]], 'a');
    rect(g, 13, 4, 13, 15, 'b');
    dots(g, [[13, 0], [13, 1], [12, 2], [13, 2], [14, 2], [13, 3]], 'm');
    put(g, 13, 1, 'w');
  }, FACE),
  healer: make((g) => {
    person(g);
    rect(g, 4, 2, 11, 3, 'a');
    rect(g, 4, 4, 4, 8, 'a');
    rect(g, 11, 4, 11, 8, 'a');
    rect(g, 6, 1, 9, 1, 'b');
    rect(g, 5, 4, 10, 7, 's');
    rect(g, 12, 11, 14, 13, 'x');
    put(g, 13, 12, 'w');
  }, FACE),

  // 적. 아군이 저마다 다른 색을 쓰는 대신 적은 자주·회색으로 묶어, 편이 색 하나로
  // 갈리게 했다. 크기와 실루엣으로 종류를 가른다.
  grunt: make((g) => {
    rect(g, 5, 4, 10, 7, 'a');
    rect(g, 5, 8, 10, 12, 'a');
    put(g, 4, 9, 'b'); put(g, 11, 9, 'b');
    rect(g, 5, 13, 6, 14, 'b');
    rect(g, 9, 13, 10, 14, 'b');
  }, [[6, 6, 'w'], [9, 6, 'w']]),
  swarm: make((g) => {
    rect(g, 6, 7, 9, 11, 'a');
    rect(g, 5, 8, 10, 10, 'a');
    dots(g, [[6, 12], [9, 12]], 'b');
  }, [[7, 9, 'w'], [9, 9, 'w']]),
  swift: make((g) => {
    dots(g, [[8, 3], [7, 4], [8, 4], [9, 4]], 'x');
    rect(g, 6, 5, 9, 8, 'a');
    rect(g, 7, 9, 8, 12, 'a');
    dots(g, [[5, 7], [10, 7]], 'b');
    dots(g, [[6, 13], [9, 13]], 'b');
  }, [[6, 6, 'w'], [9, 6, 'w']]),
  armored: make((g) => {
    rect(g, 4, 5, 11, 8, 'm');
    rect(g, 3, 9, 12, 12, 'd');
    dots(g, [[3, 4], [12, 4], [3, 5], [12, 5]], 'd');
    rect(g, 4, 13, 6, 14, 'd');
    rect(g, 9, 13, 11, 14, 'd');
  }, [[6, 7, 'x'], [9, 7, 'x']]),
  breaker: make((g) => {
    rect(g, 4, 5, 9, 8, 'a');
    rect(g, 4, 9, 9, 12, 'b');
    rect(g, 4, 13, 5, 14, 'b');
    rect(g, 8, 13, 9, 14, 'b');
    rect(g, 11, 3, 14, 7, 'd');   // 망치
    rect(g, 12, 4, 13, 6, 'm');
    rect(g, 12, 8, 12, 12, 'b');
  }, [[5, 7, 'w'], [8, 7, 'w']]),
  mender: make((g) => {
    rect(g, 4, 3, 11, 6, 'b');
    rect(g, 5, 6, 10, 12, 'a');
    rect(g, 5, 13, 6, 14, 'b');
    rect(g, 9, 13, 10, 14, 'b');
    rect(g, 6, 0, 9, 1, 'x');     // 떠 있는 빛
    put(g, 7, 1, 'w');
  }, [[6, 5, 'w'], [9, 5, 'w']]),
  boss: make((g) => {
    dots(g, [[2, 1], [2, 2], [3, 3], [13, 1], [13, 2], [12, 3]], 'm');
    rect(g, 3, 3, 12, 7, 'a');
    rect(g, 2, 8, 13, 12, 'b');
    rect(g, 1, 9, 2, 11, 'a');
    rect(g, 13, 9, 14, 11, 'a');
    rect(g, 3, 13, 6, 15, 'b');
    rect(g, 9, 13, 12, 15, 'b');
  }, [[5, 5, 'x'], [10, 5, 'x']]),
};

const ALLY = { o: '#241c18', s: '#f0c9a0', m: '#c9ccd4', d: '#6f7480', w: '#ffffff' };
const FOE = { o: '#1b1218', s: '#c49aa6', m: '#9aa0aa', d: '#4e545e', w: '#ffe3ea' };

const TINT = {
  archer: { ...ALLY, a: '#4f9d5d', b: '#33683d', x: '#e9e3d2' },
  shield: { ...ALLY, a: '#4272b8', b: '#2c4c7c', x: '#ffffff' },
  cannon: { ...ALLY, a: '#d0762e', b: '#8d4d1a', x: '#ffcf5c' },
  frost: { ...ALLY, a: '#45b4d6', b: '#2b7793', x: '#c9f2ff' },
  spear: { ...ALLY, a: '#c4544a', b: '#83322c', x: '#ffffff' },
  healer: { ...ALLY, a: '#e3c352', b: '#9c8128', x: '#fff3bf' },

  grunt: { ...FOE, a: '#8d5a6e', b: '#5e3a4a', x: '#e0555f' },
  swarm: { ...FOE, a: '#a06a80', b: '#6b4353', x: '#e0555f' },
  swift: { ...FOE, a: '#9b5f86', b: '#653d58', x: '#f0a0c0' },
  armored: { ...FOE, a: '#8a8f99', b: '#4a4f58', x: '#e0555f' },
  breaker: { ...FOE, a: '#7d5566', b: '#513542', x: '#e0555f' },
  mender: { ...FOE, a: '#6f5f93', b: '#453a5e', x: '#b9e9c4' },
  boss: { ...FOE, a: '#6d3550', b: '#431f32', x: '#ff6b5f' },
};

// 구운 그림을 크기마다 들고 있는다. 판을 그릴 때마다 점 256개를 찍으면 폰에서
// 프레임이 무너진다.
const oven = new Map();

function sprite(key, dot) {
  const id = `${key}:${dot}`;
  if (oven.has(id)) return oven.get(id);
  const side = S * dot;
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!cv) return null;
  cv.width = side;
  cv.height = side;
  const g = cv.getContext('2d');
  const tint = TINT[key];
  const rows = ART[key];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = rows[y][x];
      if (c === '.') continue;
      g.fillStyle = tint[c] || tint.o;
      g.fillRect(x * dot, y * dot, dot, dot);
    }
  }
  oven.set(id, cv);
  return cv;
}

const Sprites = { S, ART, TINT, sprite };

if (typeof module !== 'undefined' && module.exports) module.exports = Sprites;
if (typeof window !== 'undefined') window.DefenseSprites = Sprites;

})();

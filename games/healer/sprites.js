'use strict';

// 캐릭터 그림. 저장소에 이미지 파일을 들이지 않는다는 규칙을 따라 픽셀을 직접
// 찍고, SVG 사각형으로 그린다. 애셋 파일도 캔버스도 없이 도트 그림을 얻는 방법이다.
//
// **SD 비율로 그린다.** 머리가 키의 절반에 가깝다. 전장에서 한 유닛이 차지하는
// 크기가 화면 폭의 10% 남짓이라, 사람 비율로 그리면 머리가 서너 픽셀이 되어
// 얼굴이 사라진다. 머리를 키우면 그 크기에서도 직업과 표정이 남는다.
//
// **테두리는 그리지 않는다.** 채워진 칸의 이웃을 렌더러가 자동으로 두른다. 손으로
// 두르면 픽셀 자료가 두 배로 길어지고, 한 칸을 고칠 때마다 테두리도 같이 고쳐야
// 한다. 배경이 밝든 어둡든 실루엣이 남아야 해서 테두리 자체는 필요하다.
(function (root) {

const OUTLINE = '#241d2c';

// 소문자는 밝은 면, 대문자는 그늘. 한 색을 두 칸으로 나눠 두면 이 크기에서도
// 입체가 생긴다.
const PALETTE = {
  s: '#f6cfa6', S: '#cf9a6d',   // 살
  w: '#f2f4f8', W: '#bfc7d6',   // 흰 천
  c: '#4a72b8', C: '#33518a',   // 파란 천·갑옷
  t: '#3f9c88', T: '#2b6d60',   // 청록 천
  r: '#b5453b', R: '#7f2f28',   // 붉은 천
  m: '#c8d3e6', M: '#8794ad',   // 금속
  l: '#9c6636', L: '#6a4322',   // 가죽·나무
  g: '#efc04c', G: '#b08322',   // 금 장식
  h: '#8a5a2b', H: '#5e3b1a',   // 머리카락
  n: '#8bb85c', N: '#5f8038',   // 고블린 살
  o: '#6f8f4a', O: '#48602f',   // 오크 살
  p: '#9a6bc0', P: '#6b478a',   // 주술 보라
  k: '#4a4155', K: '#2e2839',   // 뿔·발톱·낡은 쇠
  b: '#8fe0f2',                 // 빛나는 것
  e: '#2b2338',                 // 눈
  y: '#ffd94a',                 // 빛나는 눈 (적)
  i: '#e8e2c4',                 // 실·활시위처럼 한 칸짜리 선 (테두리를 두르지 않는다)
  f: '#f6f2d8',                 // 뼈
};

// 16×20 격자에 그린다. 폭이 다른 것은 보스뿐인데, 화면에서 실제로 더 커야 해서
// 일부러 넓게 잡았다 — 렌더러가 픽셀 크기를 고정하므로 넓은 그림이 크게 나온다.
const SPRITES = {
  // 주인공. 흰 로브에 금 테두리, 빛나는 구슬이 달린 지팡이. 다섯 아군 중
  // 유일하게 흰색이라 전장에서 내 캐릭터를 찾는 데 시간이 들지 않는다.
  //
  // 아군의 눈은 1픽셀 점 두 개다. 2×2로 찍었더니 이 크기에서는 두 눈이 아니라
  // 얼굴을 가로지르는 띠로 보였고, 다섯 아군이 다 같은 얼굴이 됐다.
  hero: [
    '................',
    '....gwwwwg......',
    '..gwwwwwwwwg....',
    '..wwssssssww....',
    '..wsessssesw....',
    '..wsessssesw....',
    '..wwssssssww....',
    '...ssssssss.bbb.',
    '.....SSSS...bwb.',
    '...wwwwwwww.bbb.',
    '..wwwwwwwwww.g..',
    '..swwwwwwwws.g..',
    '..swwwwwwwwsgg..',
    '..gggggggggg.g..',
    '...WWWWWWWW..g..',
    '...ww....ww..g..',
    '...ww....ww..g..',
    '...ww....ww..g..',
    '..LLL....LLL.g..',
    '................',
  ],

  // 탱커. 얼굴을 덮는 투구와 앞쪽에 세운 방패. 방패가 오른쪽에 있는 것은
  // 아군이 오른쪽(적)을 보고 서기 때문이다. 투구는 눈이 아니라 트인 틈이므로
  // 하이라이트를 넣지 않는다.
  tank: [
    '................',
    '....mmmmmm......',
    '..mmmmmmmmmm....',
    '..mmmmmmmmmm....',
    '..mseesseesm....',
    '..mseesseesm....',
    '..mmssssssmm....',
    '...mmmmmmmm.....',
    '.....MMMM.......',
    '...cmmmmmmc.mmm.',
    '..ccmmmmmmccmmm.',
    '..sccccccccsmgm.',
    '..sccccccccsmgm.',
    '..llllllllllmmm.',
    '...CCCCCCCC..M..',
    '...ll....ll.....',
    '...ll....ll.....',
    '...mm....mm.....',
    '..LLL....LLL....',
    '................',
  ],

  // 근접 딜러. 검을 위로 세워 든다. 아래로 늘어뜨렸더니 방패와 실루엣이 붙어
  // 보여서 올렸다 — 이 크기에서는 머리 위 실루엣이 직업을 가른다.
  melee: [
    '............m...',
    '....hhhhhh..m...',
    '..hhhhhhhhhhm...',
    '..hsssssssshm...',
    '..hsessssesh....',
    '..hsessssesh....',
    '..hhssssssshm...',
    '...ssssssss.m...',
    '.....SSSS..gmg..',
    '...rrrrrrrr.l...',
    '..rrrrrrrrrrl...',
    '..srrrrrrrrsl...',
    '..srrrrrrrrs....',
    '..llllllllll....',
    '...RRRRRRRR.....',
    '...ll....ll.....',
    '...ll....ll.....',
    '...ll....ll.....',
    '..LLL....LLL....',
    '................',
  ],

  // 원거리 딜러. 활대와 시위를 두 줄로 벌리고 위아래 끝을 안쪽으로 꺾는다.
  // 곧은 두 줄로 두었더니 활이 아니라 사다리로 보였다.
  ranged: [
    '................',
    '....tttttt......',
    '..tttttttttt....',
    '..tsssssssst..l.',
    '..tsessssest.i.l',
    '..tsessssest.i.l',
    '..ttssssssttli.l',
    '...ssssssss..i.l',
    '.....SSSS....i.l',
    '...tttttttt..i.l',
    '..tttttttttt.i.l',
    '..sttttttttsli.l',
    '..sttttttttt.i.l',
    '..llllllllll.i.l',
    '...TTTTTTTT...l.',
    '...ll....ll.....',
    '...ll....ll.....',
    '...ll....ll.....',
    '..LLL....LLL....',
    '................',
  ],

  // 동료 힐러. 주인공과 같은 로브 실루엣이지만 청록이고 지팡이 끝이 나무다.
  // 흰색은 주인공에게만 준다 — 화면에서 둘을 헷갈리면 힐이 엉뚱한 곳으로 간다.
  healer: [
    '................',
    '....tttttt......',
    '..tttttttttt....',
    '..tsssssssst.b..',
    '..tsessssestbfb.',
    '..tsessssest.b..',
    '..ttsssssstt.l..',
    '...ssssssss..l..',
    '.....SSSS....l..',
    '...tttttttt..l..',
    '..tttttttttt.l..',
    '..sttttttttsll..',
    '..sttttttttsl...',
    '..gggggggggg....',
    '...TTTTTTTT.....',
    '...tt....tt.....',
    '...tt....tt.....',
    '...tt....tt.....',
    '..LLL....LLL....',
    '................',
  ],

  // 고블린. 격자의 아래쪽만 쓴다 — 같은 격자를 쓰면서도 작아 보여야 위협의
  // 크기가 한눈에 들어온다. 옆으로 뻗은 귀가 오크와 가르는 표시다.
  //
  // 적의 눈은 노랗게 빛낸다. 어두운 던전 배경에서 검은 눈은 테두리에 묻히고,
  // 아군인지 적인지를 색 하나로 가를 수 있다.
  goblin: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....nnnnnn......',
    '..nnnnnnnnnn....',
    'N.nsyynnyysn.N..',
    'NNnsyynnyysnNN..',
    'N.nnnnnnnnnn.N..',
    '...nnnnnnnn.....',
    '....NNNNNN......',
    '...llllllll.m...',
    '..nllllllllnm...',
    '..nllllllllnm...',
    '...LLLLLLLL.L...',
    '...nn....nn.....',
    '...nn....nn.....',
    '..KK......KK....',
    '................',
  ],

  // 주술사. 보라 후드 안에 초록 얼굴이 보이고, 지팡이 끝에 해골이 달린다.
  // 뒤에서 던지는 쪽이라는 것이 실루엣에 남아야 딜러가 왜 이쪽을 먼저 노리는지
  // 화면만 보고 읽힌다.
  shaman: [
    '................',
    '................',
    '.............f..',
    '....pppppp..fff.',
    '..ppppppppppfyf.',
    '..ppnnnnnnpp.f..',
    '..pnyynnyynp.f..',
    '..pnyynnyynp.l..',
    '..ppnnnnnnpp.l..',
    '...pppppppp..l..',
    '..pppppppppp.l..',
    '..npppppppppll..',
    '..nppppppppp.l..',
    '..pppppppppp.l..',
    '...PPPPPPPP..l..',
    '...pp....pp..l..',
    '...pp....pp..l..',
    '..KKK....KKK.l..',
    '................',
    '................',
  ],

  // 오크. 격자를 위아래로 다 쓴다. 아래턱 엄니와 넓은 어깨가 고블린과 가르는 표시다.
  orc: [
    '....oooooo......',
    '..oooooooooo....',
    '..oooooooooo....',
    '..osyynnyyso....',
    '..osyynnyyso....',
    '..oooooooooo....',
    '..ofoooooofo....',
    '...oooooooo.....',
    '....OOOOOO......',
    '..lloooooolll...',
    '.lllllllllll.m..',
    '.oolllllllloMm..',
    '.oolllllllloMm..',
    '..llllllllll.l..',
    '..LLLLLLLLLL.l..',
    '..oo......oo.l..',
    '..oo......oo.l..',
    '.KKK......KKK...',
    '................',
    '................',
  ],

  // 우두머리. 폭이 20이라 화면에서도 그만큼 크게 나온다 — 렌더러가 픽셀 크기를
  // 고정하므로 넓게 그린 것이 곧 큰 것이다. 뿔은 투구에 붙여 두었다. 띄워 두면
  // 이 크기에서 머리 위에 뜬 점 두 개로 보인다.
  boss: [
    '....................',
    '..kkk........kkk....',
    '..kkkkKKKKKKkkkk....',
    '...kkKKKKKKKKKKk....',
    '.....oosyynnyyso....',
    '.....oosyynnyyso....',
    '.....oooooooooo.....',
    '.....ofoooooofo.....',
    '......oooooooo......',
    '.rr...OOOOOO....rr..',
    '.rrrlloooooollrrr...',
    '.rrrllllllllllrrr.m.',
    '.RR.llllllllllo.RRmm',
    '....llllllllll....m.',
    '....LLLLLLLLLL....l.',
    '.....oo......oo...l.',
    '.....oo......oo...l.',
    '....KKK....KKK....l.',
    '..................l.',
    '....................',
  ],
};

// 픽셀 하나를 사각형 하나로 내보내면 유닛 하나에 300개가 넘는다. 같은 색이
// 가로로 이어지면 한 사각형으로 묶어 3분의 1 아래로 줄인다.
function runs(row, y, out, color) {
  let start = -1;
  for (let x = 0; x <= row.length; x++) {
    const hit = x < row.length && row[x];
    if (hit && start < 0) start = x;
    if (!hit && start >= 0) {
      out.push(`<rect x="${start}" y="${y}" width="${x - start}" height="1" fill="${color}"/>`);
      start = -1;
    }
  }
}

// 채워진 칸의 상하좌우 빈 칸을 테두리로 잡는다. 대각선까지 두르면 이 크기에서
// 모서리가 뭉툭해져 실루엣이 흐려진다.
// 한 칸짜리 선은 테두리를 두르면 세 칸 굵기가 된다. 활시위처럼 얇아야 뜻이
// 사는 것은 이 집합에 넣어 테두리 계산에서 뺀다.
const THIN = new Set(['i']);

function outlineMask(rows, w, h) {
  const mask = [];
  for (let y = -1; y <= h; y++) {
    const line = [];
    for (let x = -1; x <= w; x++) {
      const at = (cx, cy) => (cy >= 0 && cy < h && cx >= 0 && cx < w
        && rows[cy][cx] !== '.' && !THIN.has(rows[cy][cx]));
      line.push(!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)));
    }
    mask.push(line);
  }
  return mask;
}

const cache = new Map();

function svg(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const rows = SPRITES[kind] || SPRITES.melee;
  const h = rows.length;
  const w = rows[0].length;
  const parts = [];

  // 테두리를 먼저 깔고 그 위에 색을 얹는다. 캔버스를 한 칸씩 넓혀 두지 않으면
  // 가장자리에 닿은 픽셀의 테두리가 잘린다.
  const mask = outlineMask(rows, w, h);
  mask.forEach((line, i) => runs(line, i - 1, parts, OUTLINE));

  // 색마다 한 번씩 훑는다. 색이 열댓 개뿐이라 이 편이 칸마다 색을 바꾸는 것보다
  // 사각형 묶기가 잘 된다.
  for (const [key, color] of Object.entries(PALETTE)) {
    for (let y = 0; y < h; y++) {
      runs(Array.from(rows[y], (ch) => ch === key), y, parts, color);
    }
  }

  const markup = `<svg class="sprite" viewBox="-1 -1 ${w + 2} ${h + 2}"`
    + ` shape-rendering="crispEdges" aria-hidden="true">${parts.join('')}</svg>`;
  cache.set(kind, markup);
  return markup;
}

// 그림마다 폭이 다르다. 화면에서 실제 크기를 그 폭에 맞추려면 밖에서도
// 알아야 한다 — 우두머리가 넓게 그려진 것이 곧 크게 보이는 것이라는 규칙이
// 여기서만 지켜지면 소용이 없다.
function size(kind) {
  const rows = SPRITES[kind] || SPRITES.melee;
  return { w: rows[0].length + 2, h: rows.length + 2 };
}

const api = { svg, size, SPRITES, PALETTE, OUTLINE };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerSprites = api;

})(typeof window !== 'undefined' ? window : globalThis);

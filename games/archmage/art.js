'use strict';

// 캐릭터·적·소품·바닥 그림. 주인공만 그림 파일(mage.png)이고 나머지는 캔버스에 코드로
// 긋는다. main.js가 판을 열 때 한 번 찍어 두고(offscreen) 프레임마다 찍어 쓴다. 매 프레임 도형으로 그으면 적 수백 마리를
// 폰이 버티지 못한다.
//
// 그림체는 치비 비율(큰 머리·큰 눈) + 실루엣 외곽선 + 빛깔이 옮겨 가는 세 톤 음영이다.
// 34px 남짓한 크기에서 표정은 눈이, 무엇인지는 실루엣이 알린다. 빛은 늘 왼쪽 위에서 온다.
//
// 모든 그림은 오른쪽을 본다. 좌우는 화면이 뒤집는다. 걷기는 여섯 프레임(f = 0..5)이다.
(function () {
  const OUT = '#120b1e';
  const TAU = Math.PI * 2;

  // 두 톤 셀 음영. 왼쪽 위가 밝고 경계가 딱 끊긴다.
  function cel(g, x0, y0, x1, y1, light, dark, cut) {
    const c = cut === undefined ? 0.56 : cut;
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, light);
    grad.addColorStop(c, light);
    grad.addColorStop(Math.min(1, c + 0.01), dark);
    grad.addColorStop(1, dark);
    return grad;
  }

  function glow(g, x, y, r, color, a) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(color, a === undefined ? 0.8 : a));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // 부위들을 한 덩어리로 칠한다. 외곽선을 먼저 모두 긋고 그 위에 채우므로 부위 사이에는
  // 선이 남지 않고 바깥 실루엣에만 선이 돈다.
  function paint(g, parts, lw) {
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = OUT; g.lineWidth = (lw || 1.3) * 2;
    for (const p of parts) if (!p.noOutline) { p.path(g); g.stroke(); }
    for (const p of parts) {
      p.path(g);
      g.fillStyle = typeof p.fill === 'function' ? p.fill(g) : p.fill;
      g.fill();
      if (p.detail) { g.save(); p.path(g); g.clip(); p.detail(g); g.restore(); }
      if (p.line) { g.strokeStyle = OUT; g.lineWidth = p.line; p.path(g); g.stroke(); }
    }
    g.restore();
  }

  // --- 캐릭터 도구 ---
  // 음영은 세 톤이고 톤마다 빛깔이 옮겨 간다: 밝은 쪽은 따뜻하게(노랑 쪽), 그늘은 차갑게
  // (남보라 쪽). 밝기만 바꾸면 그늘이 회색으로 죽어 진흙처럼 보인다 — 상용 그림이 탁하지
  // 않은 까닭이 이것이다.
  const FRAMES = 6;
  const INK = '#1a0f26';

  function hsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) / 255, gg = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (gg - b) / d + (gg < b ? 6 : 0) : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  const css = (h, s, l, a) => 'hsla(' + ((h + 360) % 360).toFixed(1) + ',' + Math.max(0, Math.min(100, s)).toFixed(1) + '%,' + Math.max(0, Math.min(100, l)).toFixed(1) + '%,' + (a === undefined ? 1 : a) + ')';
  function toward(h, t, amt) {
    const d = ((t - h + 540) % 360) - 180;
    return h + Math.sign(d) * Math.min(Math.abs(d), amt);
  }
  const toneCache = {};
  function tones(hex) {
    if (toneCache[hex]) return toneCache[hex];
    const [h, s, l] = hsl(hex);
    return (toneCache[hex] = {
      hi: css(toward(h, 50, 12), s * 0.95, l + 14),
      mid: hex,
      lo: css(toward(h, 250, 18), s + 6, l - 16),
      deep: css(toward(h, 255, 24), s + 8, l - 28),
      line: css(toward(h, 255, 24), s + 10, Math.max(6, l - 36)),
    });
  }

  // 부위 하나를 세 톤으로 칠한다. 모양을 왼쪽 위로 밀어 겹치지 않는 오른쪽 아래가 그늘,
  // 오른쪽 아래로 밀어 겹치지 않는 왼쪽 위 가장자리가 밝은 테두리가 된다. 모양이 무엇이든
  // 같은 규칙이라 부위마다 그늘을 따로 그리지 않아도 된다.
  // shape는 경로만 긋는다(beginPath 없이).
  function part(g, shape, color, o) {
    o = o || {};
    const c = tones(color);
    const sh = o.shade === undefined ? 1.6 : o.shade;
    const hi = o.hi === undefined ? 0.9 : o.hi;
    g.save();
    g.beginPath(); shape(g); g.clip();
    g.fillStyle = c.lo; g.fillRect(-300, -300, 600, 600);
    g.beginPath(); g.save(); g.translate(-sh * 0.8, -sh); shape(g); g.restore();
    g.fillStyle = c.mid; g.fill();
    if (hi) {
      g.beginPath(); g.rect(-300, -300, 600, 600); g.save(); g.translate(hi * 0.8, hi); shape(g); g.restore();
      g.fillStyle = c.hi; g.fill('evenodd');
    }
    if (o.detail) o.detail(g, c);
    g.restore();
    if (o.edge) { g.beginPath(); shape(g); g.strokeStyle = c.line; g.lineWidth = o.edge; g.lineJoin = 'round'; g.stroke(); }
  }

  // 실루엣 외곽선. 부위를 칠하기 전에 모두 긋고 칠하면 바깥에만 선이 남는다.
  function outline(g, shapes, w) {
    g.save();
    g.strokeStyle = INK; g.lineWidth = w || 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const sh of shapes) { g.beginPath(); sh(g); g.stroke(); }
    g.restore();
  }

  // 겹친 부위 아래에 드리우는 그늘(앰비언트 오클루전).
  function occlude(g, shape, x, y, rx, ry, a) {
    g.save(); g.beginPath(); shape(g); g.clip();
    g.fillStyle = 'rgba(20,6,40,' + (a || 0.35) + ')';
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    g.restore();
  }

  function shadow(g, x, y, rx, ry) {
    const grad = g.createRadialGradient(x, y, 0, x, y, rx);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill();
    g.restore();
  }

  // 큰 눈. 흰자, 빛깔 있는 홍채(아래가 밝다), 동공, 반짝임 둘. 치비 그림에서 표정은 거의
  // 전부 눈이 한다.
  function bigEye(g, x, y, w, h, iris, o) {
    o = o || {};
    g.save();
    g.beginPath(); g.ellipse(x, y, w, h, 0, 0, TAU);
    g.fillStyle = INK; g.fill();
    g.beginPath(); g.ellipse(x, y + 0.1, w - 0.45, h - 0.45, 0, 0, TAU); g.fillStyle = '#fbf8ff'; g.fill(); g.clip();
    const ix = x + (o.look || 0.5) * w * 0.35, iy = y + h * 0.12;
    const grad = g.createLinearGradient(0, iy - h, 0, iy + h);
    grad.addColorStop(0, tones(iris).deep); grad.addColorStop(0.55, iris); grad.addColorStop(1, tones(iris).hi);
    g.fillStyle = grad; g.beginPath(); g.ellipse(ix, iy, w * 0.78, h * 0.86, 0, 0, TAU); g.fill();
    g.fillStyle = INK; g.beginPath(); g.ellipse(ix, iy, w * 0.34, h * 0.42, 0, 0, TAU); g.fill();
    // 윗눈꺼풀의 그늘
    g.fillStyle = 'rgba(30,10,60,0.35)'; g.fillRect(x - w, y - h, w * 2, h * 0.45);
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(ix - w * 0.3, iy - h * 0.35, w * 0.3, h * 0.26, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(ix + w * 0.3, iy + h * 0.35, w * 0.14, 0, TAU); g.fill();
    g.restore();
    if (o.lid) { g.strokeStyle = INK; g.lineWidth = 1; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - w * 1.1, y - h * 0.95 + o.lid); g.quadraticCurveTo(x, y - h * 1.25, x + w * 1.1, y - h * 0.8); g.stroke(); }
  }

  // 빛나는 눈(괴물). 흰 심지와 제 빛깔의 번짐.
  function glowEye(g, x, y, r, color, stretch) {
    glow(g, x, y, r * 4, color, 0.5);
    g.save(); g.translate(x, y); g.scale(stretch || 1, 1);
    g.fillStyle = color; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-r * 0.2, -r * 0.2, r * 0.5, 0, TAU); g.fill();
    g.restore();
  }

  const cycle = (f) => (f / FRAMES) * TAU;

  // --- 대마법사 ---
  // 흑발에 보랏빛 눈의 젊은 회귀자. 그림은 Canva에서 그린 시안 한 장(mage.png, 배경을 지운
  // 450×500)이고, 걷기 여섯 프레임은 그 한 장을 조각내 코드로 움직여 얻는다. 그림 생성은 같은
  // 캐릭터를 여섯 번 똑같이 그려 주지 않아 프레임마다 얼굴과 옷이 달라지기 때문이다.
  // 두 발이 번갈아 들리며 앞뒤로 엇갈리고, 보폭이 벌어질 때 몸이 내려앉고, 마도서는 따로 뜬다.
  // 몸을 올리지 않고 내리는 것은 몸이 발을 덮는 순서라서다 — 올리면 허리와 발 사이가 벌어진다.
  // 시안은 왼쪽을 보는 그림이라(지팡이를 앞손에 든다) 좌우를 뒤집어 그린다. 다른 그림처럼
  // 오른쪽을 보게 해 두어야 화면이 가는 쪽으로 뒤집는 규칙을 같이 쓴다. 처음에는 오른쪽을
  // 본다고 읽어 걷는 방향과 반대로 보였다.
  const MAGE_IMG = typeof Image === 'undefined' ? null : new Image();
  if (MAGE_IMG) MAGE_IMG.src = 'mage.png';
  // 자리는 그림을 180×200으로 본 단위로 적는다. 그림 파일의 해상도를 바꿔도 자리를 다시 재지 않게.
  const MU = 180;
  const MS = 0.28; // 한 단위가 판에서 차지하는 크기
  // 조각은 [x, y, 너비, 높이]. 발은 망토 자락과 앞자락 금테 아래만 떼어야 들렸을
  // 때 옷이 함께 뜯겨 나가지 않는다.
  const BOOK = [136, 46, 44, 60];
  const LEG_F = [46, 174, 40, 26];
  const LEG_B = [86, 174, 30, 26];
  function mage(g, f) {
    const t = cycle(f), w = Math.sin(t);
    g.save();
    g.translate(MU * MS, 0);
    g.scale(-1, 1);
    shadow(g, 23, 55, 13, 3.4);
    if (MAGE_IMG && MAGE_IMG.complete && MAGE_IMG.naturalWidth) mageBody(g, t, w);
    g.restore();
  }
  function mageBody(g, t, w) {
    const u = MAGE_IMG.naturalWidth / MU;
    const piece = (r, dx, dy) => g.drawImage(MAGE_IMG, r[0] * u, r[1] * u, r[2] * u, r[3] * u, r[0] * MS + dx, r[1] * MS + dy, r[2] * MS, r[3] * MS);
    const lift = (s) => -Math.max(0, s) * 1.5;
    piece(LEG_B, -w * 1.2, lift(-w));
    piece(LEG_F, w * 1.2, lift(w));
    const dip = Math.abs(w) * 0.9;
    g.save();
    g.beginPath();
    g.rect(0, 0, MU * MS, MAGE_IMG.naturalHeight / u * MS);
    for (const r of [BOOK, LEG_B, LEG_F]) g.rect(r[0] * MS, r[1] * MS, r[2] * MS, r[3] * MS);
    g.clip('evenodd');
    g.drawImage(MAGE_IMG, 0, dip, MU * MS, MAGE_IMG.naturalHeight / u * MS);
    g.restore();
    piece(BOOK, 0, dip * 0.5 + Math.sin(t + 1) * 1.4);
  }

  // --- 슬라임 ---
  // 속이 비치는 젤리. 안에 핵과 거품이 떠 있고, 뛰어오를 때 늘어났다 내려앉을 때 퍼진다.
  function slime(g, f) {
    const t = cycle(f);
    const hop = Math.max(0, Math.sin(t)); // 0..1 공중
    const squash = Math.cos(t);
    const sx = 1 + squash * 0.1 - hop * 0.04, sy = 1 - squash * 0.1 + hop * 0.06;
    shadow(g, 17, 27, 12 * (1 - hop * 0.25), 3.2);
    g.save(); g.translate(17, 27 - hop * 4); g.scale(sx, sy); g.translate(-17, -27);
    const body = (g) => { g.moveTo(4, 26.5); g.quadraticCurveTo(2, 16, 9, 10.5); g.quadraticCurveTo(15, 5, 22, 8.5); g.quadraticCurveTo(31, 13, 30.5, 26); g.quadraticCurveTo(17, 29, 4, 26.5); g.closePath(); };
    outline(g, [body], 2.4);
    part(g, body, '#62c83a', {
      shade: 2.4, hi: 1.4,
      detail: (g, c) => {
        // 속: 짙은 핵과 거품
        g.fillStyle = c.deep; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(14, 20, 5, 4, -0.3, 0, TAU); g.fill();
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(230,255,200,0.5)';
        for (const [x, y, r] of [[9, 21, 1.1], [11.5, 24, 0.7], [20, 23.5, 0.9], [7.5, 17, 0.6]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
        // 바닥 쪽의 짙은 테와 반사
        g.fillStyle = c.deep; g.beginPath(); g.ellipse(17, 28, 14, 3, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(200,255,150,0.35)'; g.beginPath(); g.ellipse(17, 25.6, 10, 1.1, 0, 0, TAU); g.fill();
        // 큰 윤기
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath(); g.moveTo(7.5, 16); g.quadraticCurveTo(8, 10.5, 14, 9); g.quadraticCurveTo(10, 12, 9.4, 16.5); g.closePath(); g.fill();
        g.beginPath(); g.arc(16.5, 9.6, 0.9, 0, TAU); g.fill();
      },
    });
    // 성난 큰 눈
    bigEye(g, 19.5, 16.5, 2, 2.7, '#2d5a18', { look: 0.8 });
    bigEye(g, 25.3, 16.3, 1.7, 2.5, '#2d5a18', { look: 0.9 });
    g.strokeStyle = INK; g.lineWidth = 1.3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(17, 12.6); g.lineTo(21.5, 14.2); g.moveTo(27.5, 12.6); g.lineTo(23.8, 14.1); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.moveTo(20, 21); g.quadraticCurveTo(23, 23.3, 26, 20.8); g.quadraticCurveTo(23, 21.8, 20, 21); g.fill();
    g.restore();
  }

  // --- 고블린 ---
  // 머리가 크고 귀가 긴 녹색 도적. 녹슨 식칼을 치켜들고 이를 드러내 웃는다.
  function goblin(g, f) {
    const t = cycle(f), w = Math.sin(t), bob = -Math.abs(Math.sin(t)) * 1.4;
    shadow(g, 17, 34, 10, 2.8);
    g.save(); g.translate(0, bob);
    const lift = (s) => Math.max(0, s) * 1.5;
    const legB = (g) => { g.moveTo(12 - w * 2, 26); g.lineTo(15 - w * 2, 26); g.lineTo(15 - w * 2.2, 32.5 - lift(-w)); g.lineTo(10.5 - w * 2.2, 33.5 - lift(-w)); g.closePath(); };
    const legF = (g) => { g.moveTo(18 + w * 2, 26); g.lineTo(21 + w * 2, 26); g.lineTo(21.5 + w * 2.2, 32.5 - lift(w)); g.lineTo(25.5 + w * 2.2, 33.5 - lift(w)); g.lineTo(18.5 + w * 2.2, 33.5 - lift(w)); g.closePath(); };
    const body = (g) => { g.moveTo(11, 21); g.quadraticCurveTo(9.5, 26, 10.5, 29.5); g.lineTo(23.5, 29.5); g.quadraticCurveTo(24.5, 25, 22.5, 20.5); g.closePath(); };
    const armB = (g) => { g.moveTo(11, 22); g.quadraticCurveTo(7, 25 + w, 8, 28.5 + w); g.lineTo(10, 28.5 + w); g.quadraticCurveTo(10, 25.5, 12.5, 24); g.closePath(); };
    const sw = w * 0.25;
    const earL = (g) => { g.moveTo(10, 11); g.quadraticCurveTo(4, 8, 0.5, 5 + w * 0.6); g.quadraticCurveTo(4, 12, 10.5, 15.5); g.closePath(); };
    const earR = (g) => { g.moveTo(24, 10.5); g.quadraticCurveTo(29, 6.5, 33.5, 3.5 - w * 0.6); g.quadraticCurveTo(30.5, 11, 24.5, 15); g.closePath(); };
    const head = (g) => { g.moveTo(10, 13); g.quadraticCurveTo(10, 4.5, 18, 4.5); g.quadraticCurveTo(26, 4.5, 26.5, 12.5); g.quadraticCurveTo(27, 19.5, 18.5, 21.5); g.quadraticCurveTo(10.5, 21, 10, 13); g.closePath(); };
    const nose = (g) => { g.moveTo(24, 12); g.quadraticCurveTo(30, 13, 29, 16.5); g.quadraticCurveTo(26.5, 17, 24.5, 15.5); g.closePath(); };
    outline(g, [legB, legF, armB, body, earL, earR, head, nose], 2.3);
    part(g, legB, '#4f7d2c', { hi: 0.4 });
    part(g, legF, '#6aa03a', { hi: 0.5 });
    part(g, armB, '#4f7d2c', { hi: 0.4 });
    part(g, body, '#7a4a28', {
      detail: (g, c) => {
        g.fillStyle = c.deep; g.beginPath(); g.moveTo(10, 27.5); g.lineTo(12, 30); g.lineTo(14, 27.8); g.lineTo(16.2, 30); g.lineTo(18.4, 27.8); g.lineTo(20.6, 30); g.lineTo(23, 27.8); g.lineTo(24, 30); g.lineTo(10, 30); g.closePath(); g.fill();
        g.fillStyle = '#c9a15a'; g.fillRect(9, 24.6, 16, 1.5);
        g.fillStyle = '#8a8f98'; g.fillRect(15.5, 24.3, 2.2, 2.1);
        g.strokeStyle = c.deep; g.lineWidth = 0.6; g.beginPath(); g.moveTo(13, 21.5); g.lineTo(14.5, 24); g.moveTo(20, 21.5); g.lineTo(19.5, 24); g.stroke();
      },
    });
    part(g, earL, '#78b046', { detail: (g) => { g.fillStyle = 'rgba(220,120,120,0.55)'; g.beginPath(); g.moveTo(9.5, 12); g.quadraticCurveTo(5, 9.5, 2.5, 7); g.quadraticCurveTo(5.5, 11.5, 9.8, 14); g.fill(); } });
    part(g, earR, '#78b046', { detail: (g) => { g.fillStyle = 'rgba(220,120,120,0.55)'; g.beginPath(); g.moveTo(24.8, 11.5); g.quadraticCurveTo(28.5, 8.5, 31.5, 6); g.quadraticCurveTo(29, 11, 25, 13.8); g.fill(); } });
    part(g, head, '#82bb4c', {
      shade: 2,
      detail: (g, c) => {
        g.fillStyle = c.lo; g.beginPath(); g.ellipse(18.5, 7, 7, 2.2, 0, 0, TAU); g.globalAlpha = 0.4; g.fill(); g.globalAlpha = 1;
        // 입: 큰 웃음과 이빨
        g.fillStyle = '#3a0f14'; g.beginPath(); g.moveTo(15.5, 16.8); g.quadraticCurveTo(21, 21.5, 26, 16.2); g.quadraticCurveTo(21, 18.4, 15.5, 16.8); g.fill();
        g.fillStyle = '#fff6dc';
        g.beginPath(); g.moveTo(17, 17.4); g.lineTo(17.8, 19); g.lineTo(18.6, 17.8); g.moveTo(22.5, 17.9); g.lineTo(23.2, 19.3); g.lineTo(24, 17.4); g.fill();
      },
    });
    part(g, nose, '#8dc657', { shade: 1, hi: 0.5 });
    // 째진 노란 눈
    for (const [x, y, s] of [[17.5, 11.5, 1], [22.8, 11.2, 0.85]]) {
      g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, 2.4 * s, 1.7 * s, -0.15, 0, TAU); g.fill();
      g.fillStyle = '#ffe24a'; g.beginPath(); g.ellipse(x, y + 0.1, 1.9 * s, 1.25 * s, -0.15, 0, TAU); g.fill();
      g.fillStyle = '#c21a1a'; g.beginPath(); g.ellipse(x + 0.5 * s, y + 0.1, 0.55 * s, 1.1 * s, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 0.7 * s, y - 0.4 * s, 0.4, 0, TAU); g.fill();
    }
    g.strokeStyle = INK; g.lineWidth = 1.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(15, 8.8); g.lineTo(19.5, 10); g.moveTo(25, 8.6); g.lineTo(21.4, 9.8); g.stroke();
    // 식칼을 든 앞팔
    g.save(); g.translate(23, 23); g.rotate(-0.9 + sw);
    const blade = (g) => { g.moveTo(1.5, -2.2); g.lineTo(11, -4.5); g.quadraticCurveTo(13, -2, 11.5, 0.6); g.lineTo(1.5, 1.2); g.closePath(); };
    const grip = (g) => { g.roundRect(-3, -1.3, 5, 2.6, 1); };
    const arm = (g) => { g.moveTo(-5, -2.5); g.quadraticCurveTo(-2, -3, 0, -1.5); g.lineTo(0, 1.5); g.quadraticCurveTo(-3, 2.5, -5.5, 2); g.closePath(); };
    outline(g, [blade, grip, arm], 2);
    part(g, blade, '#b8bec8', { shade: 1, hi: 0.6, detail: (g) => { g.fillStyle = 'rgba(150,70,40,0.55)'; g.beginPath(); g.arc(6, -1, 1.3, 0, TAU); g.arc(9.5, -2.5, 0.8, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(2, -2.4, 8, 0.6); } });
    part(g, grip, '#5a3418', { shade: 0.6, hi: 0.4 });
    part(g, arm, '#78b046', { shade: 0.8, hi: 0.5 });
    g.restore();
    g.restore();
  }

  // --- 그림자 늑대 ---
  // 갈기가 곤두선 검푸른 늑대. 달리는 네 발, 벌린 입의 송곳니, 노랗게 타는 눈.
  function wolf(g, f) {
    const t = cycle(f);
    const a = Math.sin(t), c = Math.cos(t);
    shadow(g, 20, 27, 15, 2.8);
    g.save(); g.translate(0, -Math.abs(a) * 1.4);
    // 다리는 관절이 있는 굵은 선으로 긋는다. 판자처럼 칠하면 뻣뻣한 나무 다리가 됐다.
    // 뒷다리는 발목(비절)이 뒤로 꺾이고, 앞다리는 곧게 뻗는다.
    const leg = (x, y, sw, color, hind) => {
      const pts = hind
        ? [[x, y], [x + 2 + sw * 2, y + 3.4], [x - 0.6 + sw * 3, y + 6.2], [x + sw * 3.8, y + 9]]
        : [[x, y], [x + 0.4 + sw * 2, y + 4.2], [x + sw * 3.6, y + 9]];
      const [px, py] = pts[pts.length - 1];
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [col, lw] of [[INK, 5], [color, 2.8]]) {
        g.strokeStyle = col; g.lineWidth = lw;
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.stroke();
      }
      g.fillStyle = INK; g.beginPath(); g.ellipse(px + 1, py + 0.2, 2.6, 1.7, 0, 0, TAU); g.fill();
      g.fillStyle = color; g.beginPath(); g.ellipse(px + 1, py - 0.1, 1.7, 1, 0, 0, TAU); g.fill();
    };
    const tail = (g) => { g.moveTo(8, 13); g.quadraticCurveTo(1, 11 + a * 2, 0.5, 5 + a * 2.5); g.quadraticCurveTo(3, 9 + a, 4, 8.5 + a); g.quadraticCurveTo(5, 12, 9.5, 11); g.closePath(); };
    const body = (g) => {
      g.moveTo(7, 16); g.quadraticCurveTo(6.5, 10, 13, 9.5);
      // 등의 털 뭉치
      g.lineTo(15, 7.8); g.lineTo(17, 9.2); g.lineTo(19.5, 7); g.lineTo(21.5, 8.6); g.lineTo(24, 6);
      g.quadraticCurveTo(29.5, 9, 29, 17); g.lineTo(26, 20.5); g.lineTo(24, 19); g.quadraticCurveTo(16, 21, 11, 19.5); g.lineTo(8.5, 20); g.closePath();
    };
    const head = (g) => { g.moveTo(24, 6.5); g.lineTo(25.5, 1); g.lineTo(28.3, 5); g.lineTo(31, 5.8); g.quadraticCurveTo(35, 7.5, 39, 10.8); g.lineTo(38.5, 13); g.lineTo(33, 13.5); g.lineTo(35.5, 15.3); g.lineTo(31, 16.5); g.quadraticCurveTo(26.5, 16.5, 25, 13.5); g.closePath(); };
    leg(10, 15.5, -a, '#2c3348', true); leg(25, 16, c, '#2c3348');
    outline(g, [tail, body, head], 2.2);
    part(g, tail, '#46506c', { detail: (g, c) => { g.fillStyle = c.hi; g.beginPath(); g.moveTo(1.2, 6); g.quadraticCurveTo(2, 9, 4, 9.5); g.lineTo(2.8, 6.8); g.fill(); } });
    part(g, body, '#4b5672', {
      shade: 2,
      detail: (g, c) => {
        g.fillStyle = '#8e97b0'; g.beginPath(); g.moveTo(12, 19.5); g.quadraticCurveTo(19, 21, 25, 18.5); g.quadraticCurveTo(19, 17.5, 12, 18); g.fill();
        g.strokeStyle = c.lo; g.lineWidth = 0.6;
        g.beginPath(); for (const [x, y] of [[14, 12], [18, 11.5], [22, 12.5]]) { g.moveTo(x, y); g.quadraticCurveTo(x + 1.5, y + 1.5, x + 1, y + 3); } g.stroke();
        // 달빛 테두리
        g.strokeStyle = 'rgba(170,200,255,0.55)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(13, 9.8); g.lineTo(15, 8.1); g.lineTo(17, 9.5); g.lineTo(19.5, 7.3); g.lineTo(21.5, 8.9); g.lineTo(24, 6.3); g.stroke();
      },
    });
    part(g, head, '#56627f', {
      shade: 1.6,
      detail: (g, c) => {
        g.fillStyle = '#9aa3bd'; g.beginPath(); g.moveTo(30, 12); g.lineTo(38.5, 12.2); g.lineTo(33, 13.5); g.lineTo(31, 15.5); g.closePath(); g.fill();
        g.fillStyle = c.deep; g.beginPath(); g.moveTo(25.8, 2.5); g.lineTo(27.4, 5.2); g.lineTo(26, 5.6); g.closePath(); g.fill();
        // 입 속
        g.fillStyle = '#5a0f1c'; g.beginPath(); g.moveTo(32, 13.3); g.lineTo(38.3, 13.1); g.lineTo(35.3, 15.1); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(33.5, 13.3); g.lineTo(34, 14.8); g.lineTo(34.6, 13.3); g.moveTo(36.5, 13.2); g.lineTo(36.8, 14.3); g.lineTo(37.3, 13.2); g.fill();
      },
    });
    g.fillStyle = INK; g.beginPath(); g.ellipse(38.6, 10.9, 1, 0.9, 0, 0, TAU); g.fill();
    glowEye(g, 31.6, 9, 1.05, '#ffd23a', 1.5);
    g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(29.8, 7.6); g.lineTo(33.3, 8.3); g.stroke();
    leg(13, 16, a, '#5b6785', true); leg(27.5, 16, -c, '#5b6785');
    g.restore();
  }

  // --- 망령 ---
  // 두건 속이 텅 빈 유령. 누더기 자락이 흩날리며 아래로 갈수록 투명해지고, 뼈 손가락을 뻗는다.
  function wraith(g, f) {
    const t = cycle(f), s = Math.sin(t), c2 = Math.cos(t);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(17, 36, 7, 1.8, 0, 0, TAU); g.fill();
    g.save(); g.translate(0, s * 1.3);
    glow(g, 16, 16, 18, '#7f8cff', 0.28);
    const robe = (g) => {
      g.moveTo(6, 14); g.quadraticCurveTo(6, 3, 15, 1.5); g.quadraticCurveTo(22, 1, 25, 6); g.quadraticCurveTo(28, 11, 27.5, 17);
      g.lineTo(28.5, 26); g.lineTo(26 + s, 33); g.lineTo(23.5, 28); g.lineTo(20.5 - c2, 35); g.lineTo(17.5, 29); g.lineTo(14 + s, 35.5);
      g.lineTo(11.5, 28.5); g.lineTo(8 - c2, 33); g.lineTo(7, 25); g.closePath();
    };
    const hand = (g) => {
      g.moveTo(24, 18.5); g.quadraticCurveTo(27, 18 + s * 0.5, 29, 17 + s);
      g.lineTo(33.5, 14.5 + s); g.lineTo(33.8, 15.6 + s); g.lineTo(30.6, 17.6 + s);
      g.lineTo(34.4, 17.4 + s); g.lineTo(34.4, 18.5 + s); g.lineTo(30.6, 18.9 + s);
      g.lineTo(33.2, 20.6 + s); g.lineTo(32.6, 21.5 + s); g.lineTo(29.4, 19.8 + s);
      g.quadraticCurveTo(27, 21.5, 24.5, 21.8); g.closePath();
    };
    outline(g, [robe, hand], 2.2);
    part(g, robe, '#4a4fa8', {
      shade: 2.2, hi: 1.2,
      detail: (g, c) => {
        g.fillStyle = c.deep; g.beginPath(); g.moveTo(11, 17); g.quadraticCurveTo(12, 26, 11, 30); g.lineTo(13, 30); g.quadraticCurveTo(14, 24, 13, 17); g.fill();
        g.beginPath(); g.moveTo(20, 18); g.quadraticCurveTo(21, 26, 20.5, 32); g.lineTo(22, 31); g.quadraticCurveTo(22.5, 24, 21.5, 18); g.fill();
        g.fillStyle = '#c9a24a'; g.globalAlpha = 0.8; g.fillRect(6, 19.5, 23, 1.2); g.globalAlpha = 1;
      },
    });
    // 두건 속의 어둠과 눈. 두건 테두리가 얼굴 자리를 감싼다.
    g.strokeStyle = '#7d84d8'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(12, 13); g.quadraticCurveTo(13, 5.5, 19.5, 5.5); g.quadraticCurveTo(25, 6.5, 25, 13); g.stroke();
    g.fillStyle = '#05041a'; g.beginPath(); g.moveTo(12, 13); g.quadraticCurveTo(13, 5.5, 19.5, 5.5); g.quadraticCurveTo(25, 6.5, 25, 13); g.quadraticCurveTo(19, 18.5, 12, 13); g.fill();
    glowEye(g, 18, 11, 1.25, '#7ff6ff', 1.6);
    glowEye(g, 22.8, 11, 1.05, '#7ff6ff', 1.6);
    part(g, hand, '#dfe2f2', { shade: 0.8, hi: 0.5 });
    // 아래로 갈수록 투명해진다.
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, 22, 0, 37);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = fade; g.fillRect(0, 22, 40, 16);
    g.globalCompositeOperation = 'source-over';
    // 흩날리는 넋
    for (let i = 0; i < 3; i++) {
      const u = ((f / FRAMES) + i / 3) % 1;
      g.fillStyle = 'rgba(160,230,255,' + (0.7 * (1 - u)).toFixed(2) + ')';
      g.beginPath(); g.arc(8 + i * 8 + Math.sin(u * 6 + i) * 2, 34 - u * 12, 0.9, 0, TAU); g.fill();
    }
    g.restore();
  }

  // --- 해골 병사 ---
  // 머리가 큰 뼈 병사. 퀭한 눈구멍 속에 도깨비불이 타고, 이 빠진 녹슨 칼을 든다.
  function skeleton(g, f) {
    const t = cycle(f), w = Math.sin(t), bob = -Math.abs(Math.sin(t)) * 1.2;
    shadow(g, 17, 35, 9, 2.6);
    g.save(); g.translate(0, bob);
    const BONE = '#e6dcc4';
    // 뼈는 늑대 다리처럼 외곽선을 두른 굵은 선으로 긋는다.
    const bone = (pts, color) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [col, lw] of [[INK, 4.4], [color, 2.2]]) {
        g.strokeStyle = col; g.lineWidth = lw;
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.stroke();
      }
    };
    bone([[14, 28], [13 - w * 2, 31.5], [12 - w * 2.6, 34.5 - Math.max(0, -w) * 1.4]], '#b7ab92');
    bone([[12.5, 20], [9.5, 23.5 + w], [9, 27 + w]], '#b7ab92');
    const ribs = (g) => { g.moveTo(12, 18.5); g.quadraticCurveTo(11, 24, 13.5, 27); g.lineTo(21.5, 27); g.quadraticCurveTo(24, 24, 22.5, 18.5); g.closePath(); };
    const pelvis = (g) => { g.moveTo(13, 26.5); g.lineTo(22, 26.5); g.lineTo(21, 29.5); g.lineTo(14, 29.5); g.closePath(); };
    const skull = (g) => { g.moveTo(10, 11); g.quadraticCurveTo(10, 2.5, 18.5, 2.5); g.quadraticCurveTo(27, 2.5, 27, 11); g.quadraticCurveTo(27, 15, 24.5, 16.5); g.lineTo(24.5, 19); g.lineTo(14, 19); g.lineTo(13.5, 16.5); g.quadraticCurveTo(10, 15, 10, 11); g.closePath(); };
    outline(g, [ribs, pelvis, skull], 2.2);
    part(g, ribs, '#2b2436', {
      shade: 1, hi: 0.3,
      detail: (g) => {
        g.strokeStyle = BONE; g.lineWidth = 1.3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(17.3, 18.5); g.lineTo(17.3, 27); g.stroke();
        for (const y of [20.5, 22.8, 25]) { g.beginPath(); g.moveTo(12.5, y); g.quadraticCurveTo(17.3, y + 1.4, 22.5, y); g.stroke(); }
      },
    });
    part(g, pelvis, BONE, { shade: 0.8, hi: 0.4 });
    part(g, skull, BONE, {
      shade: 2,
      detail: (g, c) => {
        g.strokeStyle = c.lo; g.lineWidth = 0.7; g.beginPath(); g.moveTo(14, 4); g.lineTo(15.5, 7); g.lineTo(14.5, 8.5); g.stroke();
        g.fillStyle = INK; g.fillRect(14.5, 16.4, 9.5, 2.6);
        g.fillStyle = BONE; for (const x of [15, 17, 21, 23]) g.fillRect(x, 16.4, 1.4, 1.8);
      },
    });
    // 눈구멍과 도깨비불. 빛에 약한 것들은 모두 이 초록 불을 눈에 켠다.
    g.fillStyle = INK;
    g.beginPath(); g.ellipse(17, 10.5, 2.6, 2.9, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(23.3, 10.5, 2.2, 2.7, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(20.4, 13); g.lineTo(21.4, 15); g.lineTo(19.6, 15); g.closePath(); g.fill();
    glowEye(g, 17.3, 10.8, 1.1, '#7dffc8', 1);
    glowEye(g, 23.4, 10.8, 0.95, '#7dffc8', 1);
    bone([[20, 28], [21 + w * 2, 31.5], [22.5 + w * 2.6, 34.5 - Math.max(0, w) * 1.4]], BONE);
    bone([[22, 20], [24.5, 23 - w * 0.5], [27, 22 - w]], BONE);
    g.save(); g.translate(27, 22 - w); g.rotate(-1.1 + w * 0.2);
    const blade = (g) => { g.moveTo(0, -1.3); g.lineTo(11, -2.2); g.quadraticCurveTo(13.5, -0.5, 11.5, 1.4); g.lineTo(0, 1.3); g.closePath(); };
    const guard = (g) => { g.rect(-0.8, -3, 1.8, 6); };
    outline(g, [blade, guard], 2);
    part(g, blade, '#9aa0a8', {
      shade: 0.8, hi: 0.5,
      detail: (g) => {
        g.fillStyle = 'rgba(150,80,40,0.6)'; g.beginPath(); g.arc(5, 0.4, 1.2, 0, TAU); g.fill();
        g.beginPath(); g.arc(9, -0.6, 0.8, 0, TAU); g.fill();
        g.fillStyle = INK; g.beginPath(); g.moveTo(7, 1.4); g.lineTo(8, 0.4); g.lineTo(9, 1.4); g.fill();
      },
    });
    part(g, guard, '#6b4a2a', { shade: 0.5, hi: 0.3 });
    g.restore();
    g.restore();
  }

  // --- 좀비 ---
  // 구부정하게 끌려오는 시체. 잿빛 초록 살에 찢긴 옷, 두 팔을 앞으로 뻗고 한쪽 눈이 풀렸다.
  function zombie(g, f) {
    const t = cycle(f), w = Math.sin(t), bob = Math.abs(Math.sin(t)) * 0.8;
    shadow(g, 18, 35, 10, 2.8);
    g.save(); g.translate(0, bob);
    const SKIN = '#8fa77a';
    const legB = (g) => { g.moveTo(12 - w * 1.4, 26); g.lineTo(16 - w * 1.4, 26); g.lineTo(15.5 - w * 1.8, 34); g.lineTo(10.5 - w * 1.8, 34); g.closePath(); };
    const legF = (g) => { g.moveTo(18 + w * 1.4, 26); g.lineTo(22 + w * 1.4, 26); g.lineTo(23.5 + w * 1.8, 34); g.lineTo(18 + w * 1.8, 34); g.closePath(); };
    const armB = (g) => { g.moveTo(15, 17); g.quadraticCurveTo(22, 16 + w, 30, 16.5 + w); g.lineTo(30.5, 19.2 + w); g.quadraticCurveTo(22, 19.5 + w, 15.5, 20.5); g.closePath(); };
    const body = (g) => { g.moveTo(10, 17); g.quadraticCurveTo(12, 13.5, 18, 14); g.quadraticCurveTo(24, 15, 23.5, 21); g.lineTo(23, 27.5); g.lineTo(20, 26); g.lineTo(17.5, 28); g.lineTo(15, 26.2); g.lineTo(11, 27.5); g.quadraticCurveTo(9.5, 22, 10, 17); g.closePath(); };
    const head = (g) => { g.moveTo(13, 9.5); g.quadraticCurveTo(13.5, 2.5, 20.5, 2.8); g.quadraticCurveTo(27.5, 3.5, 27, 10.5); g.quadraticCurveTo(26.5, 16, 21, 16.5); g.quadraticCurveTo(14, 16.5, 13, 9.5); g.closePath(); };
    const armF = (g) => { g.moveTo(18, 18); g.quadraticCurveTo(25, 18 - w, 33, 19.5 - w); g.lineTo(33.5, 22.3 - w); g.quadraticCurveTo(25, 22 - w, 18.5, 21.5); g.closePath(); };
    outline(g, [legB, legF, armB, body, head, armF], 2.2);
    part(g, legB, '#3d3448', { hi: 0.3 });
    part(g, legF, '#554a63', { hi: 0.4, detail: (g) => { g.fillStyle = SKIN; g.fillRect(17, 31.5, 8, 3); } });
    part(g, armB, '#6e8660', { hi: 0.4 });
    part(g, body, '#7b6a52', {
      shade: 1.8,
      detail: (g, c) => {
        g.fillStyle = SKIN; g.beginPath(); g.moveTo(14.5, 18.5); g.lineTo(18.5, 21.5); g.lineTo(15.5, 24); g.closePath(); g.fill();
        g.fillStyle = c.deep; g.fillRect(10, 24.3, 14, 1.3);
      },
    });
    part(g, head, SKIN, {
      shade: 2,
      detail: (g, c) => {
        g.fillStyle = c.deep; g.beginPath(); g.moveTo(14, 7); g.quadraticCurveTo(17, 1.5, 24, 3); g.quadraticCurveTo(19, 3.5, 14, 7); g.fill();
        // 꿰맨 자국
        g.strokeStyle = INK; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(15, 12.5); g.lineTo(17.5, 14.8);
        for (const [x, y] of [[15.4, 13.8], [16.5, 14.6]]) { g.moveTo(x - 0.8, y + 0.6); g.lineTo(x + 0.8, y - 0.6); }
        g.stroke();
        g.fillStyle = '#3a0f14'; g.beginPath(); g.ellipse(23, 13.3, 2.4, 1.4, -0.1, 0, TAU); g.fill();
        g.fillStyle = '#d8cfae'; g.fillRect(21.6, 12.2, 1, 1); g.fillRect(23.8, 12.1, 1, 1);
      },
    });
    // 눈: 하나는 퀭하고 하나는 풀려 튀어나왔다.
    g.fillStyle = INK; g.beginPath(); g.ellipse(19.2, 8.8, 1.9, 2, 0, 0, TAU); g.fill();
    glowEye(g, 19.2, 9, 0.8, '#7dffc8', 1);
    g.fillStyle = INK; g.beginPath(); g.arc(24.8, 8.6, 2.2, 0, TAU); g.fill();
    g.fillStyle = '#f2ecd2'; g.beginPath(); g.arc(24.8, 8.6, 1.6, 0, TAU); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(25.4, 9.2, 0.6, 0, TAU); g.fill();
    part(g, armF, SKIN, { hi: 0.5, detail: (g, c) => { g.fillStyle = c.lo; g.fillRect(24, 18, 1.4, 4); } });
    g.strokeStyle = INK; g.lineWidth = 1; g.lineCap = 'round';
    g.beginPath();
    for (const dy of [0, 1.3, 2.6]) { g.moveTo(33.2, 19.7 - w + dy); g.lineTo(35, 20.3 - w + dy); }
    g.stroke();
    g.restore();
  }

  // --- 돌 골렘 ---
  // 등이 굽은 바위 거인. 어깨에 이끼와 수정이 자라고, 금 사이로 룬이 푸르게 빛난다.
  function golem(g, f) {
    const t = cycle(f), w = Math.sin(t), bob = -Math.abs(Math.sin(t)) * 1.2;
    shadow(g, 23, 43, 17, 3.8);
    g.save(); g.translate(0, bob);
    const STONE = '#8a8272';
    const legB = (g) => { g.moveTo(11 - w * 1.6, 32); g.lineTo(19 - w * 1.6, 32); g.lineTo(19.5 - w * 1.6, 42); g.lineTo(10 - w * 1.6, 42); g.closePath(); };
    const legF = (g) => { g.moveTo(25 + w * 1.6, 32); g.lineTo(33 + w * 1.6, 32); g.lineTo(34.5 + w * 1.6, 42); g.lineTo(24.5 + w * 1.6, 42); g.closePath(); };
    const armB = (g) => { g.moveTo(9, 15); g.lineTo(3, 20 + w * 1.5); g.lineTo(1, 32 + w * 2); g.lineTo(8.5, 34 + w * 2); g.lineTo(11, 22); g.closePath(); };
    const torso = (g) => { g.moveTo(8, 16); g.lineTo(14, 8); g.lineTo(24, 5.5); g.lineTo(34, 9); g.lineTo(39, 17); g.lineTo(37, 30); g.lineTo(30, 35); g.lineTo(15, 35); g.lineTo(8.5, 29); g.closePath(); };
    const head = (g) => { g.moveTo(24, 10); g.lineTo(26, 3.5); g.lineTo(34, 3); g.lineTo(36.5, 9.5); g.lineTo(33, 13); g.lineTo(26, 13); g.closePath(); };
    const armF = (g) => { g.moveTo(33, 15); g.lineTo(40, 17 - w * 1.5); g.lineTo(45, 27 - w * 2); g.lineTo(44.5, 36 - w * 2); g.lineTo(35.5, 37 - w * 2); g.lineTo(34, 25); g.closePath(); };
    outline(g, [legB, legF, armB, torso, head, armF], 2.6);
    part(g, legB, '#6a6356', { hi: 0.5 });
    part(g, legF, STONE, { hi: 0.7 });
    part(g, armB, '#6a6356', { hi: 0.5 });
    const rune = (g, pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
    part(g, torso, STONE, {
      shade: 2.6, hi: 1.3,
      detail: (g, c) => {
        // 면: 바위 조각의 경계
        g.strokeStyle = c.deep; g.lineWidth = 0.9;
        rune(g, [14, 8, 17, 18, 8.5, 22]); rune(g, [17, 18, 28, 16, 34, 9]); rune(g, [28, 16, 30, 35]); rune(g, [17, 18, 15, 35]);
        g.fillStyle = c.hi; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(14, 8); g.lineTo(24, 5.5); g.lineTo(28, 16); g.lineTo(17, 18); g.closePath(); g.fill(); g.globalAlpha = 1;
        // 가슴의 룬 핵
        g.save(); g.shadowColor = '#6ff3ff'; g.shadowBlur = 5; g.strokeStyle = '#8ff8ff'; g.lineWidth = 1.3;
        rune(g, [19, 22, 22, 26, 19, 30]); rune(g, [25, 21, 28, 24.5, 26, 28, 29, 31]);
        g.fillStyle = '#bffcff'; g.beginPath(); g.arc(23, 25.5, 1.4, 0, TAU); g.fill();
        g.restore();
        // 이끼
        g.fillStyle = '#4d7a33'; g.beginPath(); g.ellipse(15, 9.5, 6, 2.6, -0.4, 0, TAU); g.ellipse(33, 10.5, 4.5, 2.2, 0.4, 0, TAU); g.fill();
        g.fillStyle = '#79a94a'; g.beginPath(); g.ellipse(14.5, 8.8, 3.5, 1.2, -0.4, 0, TAU); g.fill();
      },
    });
    // 등의 수정
    const crystal = (x, y, h, lean) => (g) => { g.moveTo(x - 1.8, y); g.lineTo(x + lean - 0.8, y - h); g.lineTo(x + lean + 0.6, y - h - 1.5); g.lineTo(x + 1.8, y); g.closePath(); };
    const crys = [crystal(12, 12, 6, -2), crystal(15.5, 9.5, 8, -1), crystal(19, 7.5, 5, 0)];
    outline(g, crys, 1.6);
    for (const cr of crys) part(g, cr, '#7fb8ff', { shade: 0.8, hi: 0.6 });
    part(g, head, '#958d7c', { shade: 1.4, detail: (g, c) => { g.fillStyle = c.deep; g.fillRect(26, 6, 10, 3.5); } });
    glowEye(g, 29, 7.8, 1.1, '#6ff3ff', 1.5);
    glowEye(g, 33.5, 7.8, 1, '#6ff3ff', 1.5);
    part(g, armF, STONE, {
      shade: 2, detail: (g, c) => {
        g.strokeStyle = c.deep; g.lineWidth = 0.8; rune(g, [36, 27, 40, 26.5, 44, 29]);
        g.fillStyle = c.hi; g.globalAlpha = 0.4; g.beginPath(); g.moveTo(33, 15); g.lineTo(40, 17 - w * 1.5); g.lineTo(39, 21); g.lineTo(34, 20); g.closePath(); g.fill(); g.globalAlpha = 1;
      },
    });
    g.restore();
  }

  // --- 재앙의 사도 (보스) ---
  // 해골 가면에 숫양 뿔을 단 사제. 등 뒤로 붉은 가시 후광이 돌고, 날개처럼 펼친 누더기 망토,
  // 가슴에서 뛰는 재앙의 핵, 떠 있는 두 손에 붉은 마력이 고인다.
  function boss(g, f) {
    const t = cycle(f), s = Math.sin(t);
    shadow(g, 46, 88, 28, 5);
    g.save(); g.translate(0, s * 1.6);
    // 후광
    glow(g, 46, 34, 40, '#ff2a48', 0.4);
    g.save(); g.translate(46, 32); g.rotate((f / FRAMES) * (TAU / 12));
    for (let i = 0; i < 12; i++) {
      g.save(); g.rotate((i / 12) * TAU);
      const L = 25 + (i % 2) * 5;
      g.beginPath(); g.moveTo(-2.6, -17); g.lineTo(0, -L); g.lineTo(2.6, -17); g.closePath();
      g.fillStyle = INK; g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
      const sp = g.createLinearGradient(0, -17, 0, -L); sp.addColorStop(0, '#5a0a18'); sp.addColorStop(1, '#ff6a7a');
      g.fillStyle = sp; g.fill();
      g.restore();
    }
    g.lineWidth = 2.2; g.strokeStyle = INK; g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke();
    g.lineWidth = 1.2; g.strokeStyle = '#ff5a6e'; g.stroke();
    g.restore();
    const cape = (g) => {
      g.moveTo(34, 28); g.quadraticCurveTo(14, 36, 5 - s * 3, 72); g.lineTo(12, 68); g.lineTo(13, 80); g.lineTo(21, 73); g.lineTo(26, 86); g.lineTo(34, 77);
      g.lineTo(41, 88); g.lineTo(47, 78); g.lineTo(54, 88); g.lineTo(60, 77); g.lineTo(67, 86); g.lineTo(72, 73); g.lineTo(80, 80); g.lineTo(81, 68);
      g.lineTo(88 + s * 3, 72); g.quadraticCurveTo(78, 36, 58, 28); g.closePath();
    };
    const robe = (g) => { g.moveTo(34, 32); g.quadraticCurveTo(30, 58, 30, 82); g.lineTo(62, 82); g.quadraticCurveTo(62, 58, 58, 32); g.closePath(); };
    const shoulderL = (g) => { g.moveTo(25, 38); g.quadraticCurveTo(26, 25, 40, 25.5); g.lineTo(41, 35); g.closePath(); };
    const shoulderR = (g) => { g.moveTo(67, 38); g.quadraticCurveTo(66, 25, 52, 25.5); g.lineTo(51, 35); g.closePath(); };
    const hood = (g) => { g.moveTo(35, 31); g.quadraticCurveTo(33, 11, 46, 10); g.quadraticCurveTo(59, 11, 57, 31); g.quadraticCurveTo(46, 35, 35, 31); g.closePath(); };
    const horn = (d) => (g) => { g.moveTo(46 + d * 7, 16); g.quadraticCurveTo(46 + d * 22, 2, 46 + d * 25, 14); g.quadraticCurveTo(46 + d * 26, 23, 46 + d * 18, 22.5); g.quadraticCurveTo(46 + d * 21, 16, 46 + d * 15, 14.5); g.quadraticCurveTo(46 + d * 11, 18, 46 + d * 8.5, 22); g.closePath(); };
    const hand = (x, y) => (g) => { g.moveTo(x, y); g.lineTo(x - 3.5, y + 8); g.lineTo(x - 0.5, y + 6); g.lineTo(x + 1.2, y + 10.5); g.lineTo(x + 3, y + 6); g.lineTo(x + 6.5, y + 8.5); g.lineTo(x + 4.5, y); g.closePath(); };
    const hands = [hand(11, 46 + s * 2.5), hand(76, 46 - s * 2.5)];
    outline(g, [cape, robe, shoulderL, shoulderR, horn(-1), horn(1), hood, ...hands], 3);
    part(g, cape, '#3c2256', {
      shade: 3, hi: 1.4,
      detail: (g, c) => {
        g.fillStyle = '#7a1428'; g.beginPath(); g.moveTo(8, 66); g.lineTo(86, 66); g.lineTo(86, 69.5); g.lineTo(8, 69.5); g.fill();
        // 망토 주름: 먹선이 아니라 한 톤 짙은 넓은 띠로 둔다.
        g.strokeStyle = c.lo; g.lineWidth = 2.2; g.globalAlpha = 0.7;
        g.beginPath(); for (const x of [18, 26, 66, 74]) { g.moveTo(46 + (x - 46) * 0.4, 34); g.quadraticCurveTo(x, 55, x - (x < 46 ? 4 : -4), 78); } g.stroke();
        g.globalAlpha = 1;
      },
    });
    part(g, robe, '#241334', {
      shade: 2, detail: (g) => {
        g.strokeStyle = '#d9ad4a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(46, 34); g.lineTo(46, 82); g.stroke();
        g.lineWidth = 1; for (const y of [44, 56, 68]) { g.beginPath(); g.moveTo(42, y); g.lineTo(46, y + 3); g.lineTo(50, y); g.stroke(); }
      },
    });
    part(g, shoulderL, '#8f8aa6', { shade: 1.6, detail: (g) => { g.fillStyle = '#d9ad4a'; g.fillRect(24, 35.5, 18, 1.4); } });
    part(g, shoulderR, '#8f8aa6', { shade: 1.6, detail: (g) => { g.fillStyle = '#d9ad4a'; g.fillRect(50, 35.5, 18, 1.4); } });
    part(g, horn(-1), '#e8dcc0', { shade: 1.4, detail: (g, c) => { g.strokeStyle = c.lo; g.lineWidth = 0.7; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(46 - 20, 12, 3 + i * 1.6, 0.5, 2.5); g.stroke(); } } });
    part(g, horn(1), '#e8dcc0', { shade: 1.4, detail: (g, c) => { g.strokeStyle = c.lo; g.lineWidth = 0.7; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(46 + 20, 12, 3 + i * 1.6, 0.6, 2.6); g.stroke(); } } });
    part(g, hood, '#3c2256', { shade: 2 });
    // 해골 가면
    const mask = (g) => { g.moveTo(40, 18); g.quadraticCurveTo(46, 14, 52, 18); g.quadraticCurveTo(53, 25, 49.5, 29); g.lineTo(42.5, 29); g.quadraticCurveTo(39, 25, 40, 18); g.closePath(); };
    g.fillStyle = '#05030b'; g.beginPath(); g.ellipse(46, 22, 8.5, 9, 0, 0, TAU); g.fill();
    outline(g, [mask], 1.6);
    part(g, mask, '#e9e1cc', {
      shade: 1.2, hi: 0.7,
      detail: (g) => {
        g.fillStyle = '#1a0610';
        g.beginPath(); g.ellipse(43.3, 21.5, 2.2, 1.9, 0.2, 0, TAU); g.ellipse(48.7, 21.5, 2.2, 1.9, -0.2, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(46, 24); g.lineTo(45, 26); g.lineTo(47, 26); g.closePath(); g.fill();
        g.fillRect(43, 27.2, 6, 0.8);
        g.fillStyle = '#e9e1cc'; for (let x = 43.6; x < 48.6; x += 1.4) g.fillRect(x, 27, 0.6, 1.2);
      },
    });
    glowEye(g, 43.3, 21.6, 1.1, '#ff3048');
    glowEye(g, 48.7, 21.6, 1.1, '#ff3048');
    // 가슴의 핵
    glow(g, 46, 46, 11 + s * 1.5, '#ff2a48', 0.85);
    g.fillStyle = INK; g.beginPath(); g.moveTo(46, 40); g.lineTo(50.5, 46); g.lineTo(46, 52); g.lineTo(41.5, 46); g.closePath(); g.fill();
    const core = g.createLinearGradient(42, 41, 50, 51); core.addColorStop(0, '#fff0f2'); core.addColorStop(0.5, '#ff6a7a'); core.addColorStop(1, '#a0102a');
    g.fillStyle = core; g.beginPath(); g.moveTo(46, 41.2); g.lineTo(49.4, 46); g.lineTo(46, 50.8); g.lineTo(42.6, 46); g.closePath(); g.fill();
    for (const h of hands) part(g, h, '#cfc4de', { shade: 1, hi: 0.6 });
    glow(g, 13.5, 55 + s * 2.5, 8, '#ff2a48', 0.6); glow(g, 78.5, 55 - s * 2.5, 8, '#ff2a48', 0.6);
    g.restore();
  }

  // box는 그림의 크기, foot은 그 안에서 발이 닿는 높이(그림자의 한가운데)다.
  const FOES = {
    slime: { draw: slime, box: [34, 30], foot: 27 },
    goblin: { draw: goblin, box: [36, 37], foot: 34 },
    wolf: { draw: wolf, box: [42, 30], foot: 27 },
    skeleton: { draw: skeleton, box: [36, 38], foot: 35 },
    wraith: { draw: wraith, box: [36, 38], foot: 36 },
    zombie: { draw: zombie, box: [38, 38], foot: 35 },
    golem: { draw: golem, box: [48, 46], foot: 43 },
    boss: { draw: boss, box: [92, 92], foot: 88 },
  };
  // crystal·flame은 지팡이 수정과 손의 마력이 있는 자리다. 화면이 그 자리에 빛을 얹는다.
  const MAGE = { draw: mage, box: [51, 56], foot: 55, img: MAGE_IMG, crystal: [45.9, 12.6], flame: [16.2, 31.4] };


  // --- 소품 ---
  // 판에 흩어 두는 폐허. 바닥이 한 가지 무늬로만 이어지면 움직여도 제자리걸음처럼
  // 보인다 — 지나가는 것이 있어야 걷는 느낌이 난다.
  const PROPS = {
    grave: { box: [22, 28], draw(g) {
      shadow(g, 11, 26, 9, 2.5);
      paint(g, [{ path: (g) => { g.beginPath(); g.moveTo(3, 26); g.lineTo(3, 9); g.quadraticCurveTo(3, 2, 11, 2); g.quadraticCurveTo(19, 2, 19, 9); g.lineTo(19, 26); g.closePath(); },
        fill: (g) => cel(g, 3, 2, 19, 26, '#6d6a7e', '#2f2d3c', 0.5),
        detail: (g) => { g.strokeStyle = '#1e1c28'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(11, 8); g.lineTo(11, 17); g.moveTo(7.5, 11); g.lineTo(14.5, 11); g.stroke(); g.fillStyle = '#4d7a3a'; g.beginPath(); g.ellipse(6, 25, 5, 2.5, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(15,12,20,0.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(17, 5); g.lineTo(14, 9); g.lineTo(15.5, 12); g.stroke(); } }], 1.1);
    } },
    pillar: { box: [26, 40], draw(g) {
      shadow(g, 13, 37, 12, 3);
      paint(g, [
        { path: (g) => { g.beginPath(); g.rect(2, 31, 22, 6); }, fill: (g) => cel(g, 2, 31, 24, 37, '#8b8698', '#3d3a4a') },
        { path: (g) => { g.beginPath(); g.moveTo(5, 31); g.lineTo(5, 10); g.lineTo(9, 6); g.lineTo(12, 9); g.lineTo(16, 4); g.lineTo(21, 8); g.lineTo(21, 31); g.closePath(); },
          fill: (g) => cel(g, 5, 4, 21, 31, '#9a95a8', '#45424f', 0.5),
          detail: (g) => { g.strokeStyle = 'rgba(20,18,28,0.55)'; g.lineWidth = 1; for (const x of [9.5, 13, 16.5]) { g.beginPath(); g.moveTo(x, 9); g.lineTo(x, 31); g.stroke(); } g.fillStyle = '#56803c'; g.beginPath(); g.ellipse(7, 29, 4, 3, 0, 0, TAU); g.fill(); } },
      ], 1.1);
    } },
    tree: { box: [40, 46], draw(g) {
      shadow(g, 20, 43, 12, 3);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const branches = [[20, 44, 20, 22, 4.5], [20, 30, 9, 18, 2.6], [9, 18, 4, 10, 1.6], [20, 24, 31, 12, 2.6], [31, 12, 36, 6, 1.5], [26, 17, 25, 6, 1.6], [12, 21, 13, 8, 1.3]];
      for (const pass of [0, 1]) for (const [x0, y0, x1, y1, w] of branches) {
        g.strokeStyle = pass ? '#3b2b2a' : OUT; g.lineWidth = pass ? w : w + 2.4;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      g.strokeStyle = 'rgba(160,130,120,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(18.8, 42); g.lineTo(18.8, 24); g.stroke();
    } },
    skulls: { box: [22, 14], draw(g) {
      shadow(g, 11, 12, 10, 2.2);
      const skull = (x, y) => [{ path: (g) => { g.beginPath(); g.arc(x, y, 3.6, Math.PI, 0); g.lineTo(x + 2.6, y + 3.4); g.lineTo(x - 2.6, y + 3.4); g.closePath(); }, fill: (g) => cel(g, x - 4, y - 4, x + 4, y + 4, '#ebe3cf', '#9a8f78') }];
      paint(g, [...skull(6, 8), ...skull(15, 8.5), ...skull(10.5, 4.5)], 0.9);
      g.fillStyle = OUT;
      for (const [x, y] of [[6, 8], [15, 8.5], [10.5, 4.5]]) { g.beginPath(); g.arc(x - 1.3, y, 0.9, 0, TAU); g.arc(x + 1.3, y, 0.9, 0, TAU); g.fill(); }
    } },
    crystal: { box: [24, 28], draw(g) {
      shadow(g, 12, 26, 9, 2.4);
      glow(g, 12, 16, 14, '#7ea8ff', 0.35);
      const shard = (x, y, w, h, lean) => ({ path: (g) => { g.beginPath(); g.moveTo(x - w, y); g.lineTo(x - w * 0.6 + lean, y - h); g.lineTo(x + lean, y - h - 3); g.lineTo(x + w * 0.6 + lean, y - h); g.lineTo(x + w, y); g.closePath(); },
        fill: (g) => cel(g, x - w, y - h, x + w, y, '#cfe0ff', '#4a5fc0', 0.45) });
      paint(g, [shard(7, 25, 3.5, 10, -2), shard(17, 25, 3.2, 8, 2), shard(12, 26, 4.5, 18, 0)], 1);
    } },
    candle: { box: [14, 22], draw(g) {
      shadow(g, 7, 20, 5, 1.6);
      glow(g, 7, 6, 8, '#ffb14a', 0.55);
      paint(g, [{ path: (g) => { g.beginPath(); g.roundRect(4, 9, 6, 11, 1.5); }, fill: (g) => cel(g, 4, 9, 10, 20, '#efe6d0', '#9f927a') }], 0.9);
      g.fillStyle = '#ffd27a'; g.beginPath(); g.moveTo(7, 3); g.quadraticCurveTo(9.3, 6.5, 7, 8.5); g.quadraticCurveTo(4.7, 6.5, 7, 3); g.fill();
      g.fillStyle = '#fff6d8'; g.beginPath(); g.ellipse(7, 7, 0.9, 1.4, 0, 0, TAU); g.fill();
    } },
  };

  // --- 바닥 ---
  // 금 간 판석이 깔린 폐허. 격자에 맞춰 돌을 놓아 조각이 이음새 없이 되풀이된다 —
  // 조각 한 변이 격자 칸의 정수 배라 가장자리 돌이 반대편과 그대로 맞물린다.
  function ground(g, size, rand) {
    g.fillStyle = '#16141f'; g.fillRect(0, 0, size, size);
    // 흙의 얼룩
    for (let i = 0; i < 90; i++) {
      const x = rand() * size, y = rand() * size, r = 10 + rand() * 40;
      for (const [ox, oy] of wraps(x, y, r, size)) {
        const gr = g.createRadialGradient(ox, oy, 0, ox, oy, r);
        const tone = rand() < 0.5 ? '40,34,58' : '24,30,40';
        gr.addColorStop(0, 'rgba(' + tone + ',0.35)'); gr.addColorStop(1, 'rgba(' + tone + ',0)');
        g.fillStyle = gr; g.fillRect(ox - r, oy - r, r * 2, r * 2);
      }
    }
    const N = 14, cell = size / N;
    const used = [];
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      if (used[cy * N + cx]) continue;
      // 두 칸짜리 판석을 섞는다. 한 칸짜리만 깔면 타일 바닥처럼 반듯해 폐허로 보이지 않는다.
      let cw = 1, ch = 1;
      const roll = rand();
      if (roll < 0.3 && cx < N - 1 && !used[cy * N + cx + 1]) cw = 2;
      else if (roll < 0.55 && cy < N - 1) ch = 2;
      if (cw === 2 && rand() < 0.3 && cy < N - 1) ch = 2;
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) used[(cy + j) * N + cx + i] = true;
      if (rand() < 0.2) continue; // 돌이 빠져 흙이 드러난 자리
      const inset = 1.5 + rand() * 2;
      const x = cx * cell + inset, y = cy * cell + inset;
      const w = cw * cell - inset * 2 - rand() * 2.5, h = ch * cell - inset * 2 - rand() * 2.5;
      const tone = 25 + (rand() * 8 | 0);
      const jit = () => (rand() - 0.5) * 3.5;
      const pts = [[x + jit(), y + jit()], [x + w + jit(), y + jit()], [x + w + jit(), y + h + jit()], [x + jit(), y + h + jit()]];
      const shape = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
      // 이음새 그늘
      g.save(); g.translate(1.2, 1.6); shape(); g.fillStyle = 'rgba(0,0,0,0.38)'; g.fill(); g.restore();
      shape();
      g.fillStyle = cel(g, x, y, x + w, y + h, 'rgb(' + (tone + 5) + ',' + tone + ',' + (tone + 16) + ')', 'rgb(' + (tone - 5) + ',' + (tone - 7) + ',' + (tone + 5) + ')', 0.6);
      g.fill();
      g.save(); shape(); g.clip();
      g.strokeStyle = 'rgba(150,140,190,0.07)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(pts[3][0], pts[3][1]); g.lineTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.stroke();
      // 금
      if (rand() < 0.3) {
        g.strokeStyle = 'rgba(8,6,14,0.7)'; g.lineWidth = 1;
        let px = x + rand() * w, py = y;
        g.beginPath(); g.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += (rand() - 0.5) * 9; py += h / 4; g.lineTo(px, py); }
        g.stroke();
      }
      // 이끼
      if (rand() < 0.4) {
        g.fillStyle = 'rgba(60,100,55,0.25)';
        g.beginPath(); g.ellipse(x + rand() * w, y + h - 2, 5 + rand() * 8, 2 + rand() * 2, 0, 0, TAU); g.fill();
      }
      g.restore();
    }
    // 풀과 자갈
    for (let i = 0; i < 70; i++) {
      const x = rand() * size, y = rand() * size;
      g.strokeStyle = 'rgba(80,120,80,' + (0.25 + rand() * 0.25) + ')'; g.lineWidth = 1.1;
      g.beginPath();
      for (let j = -1; j <= 1; j++) { g.moveTo(x + j * 1.5, y); g.lineTo(x + j * 3, y - 4 - rand() * 3); }
      g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(120,110,140,' + (0.15 + rand() * 0.2) + ')';
      g.beginPath(); g.ellipse(rand() * size, rand() * size, 1 + rand() * 1.5, 0.8 + rand(), 0, 0, TAU); g.fill();
    }
  }

  function wraps(x, y, r, size) {
    const out = [[x, y]];
    if (x < r) out.push([x + size, y]);
    if (x > size - r) out.push([x - size, y]);
    if (y < r) out.push([x, y + size]);
    if (y > size - r) out.push([x, y - size]);
    return out;
  }

  window.ArchmageArt = { FOES, MAGE, PROPS, FRAMES, ground, glow, rgba };
})();

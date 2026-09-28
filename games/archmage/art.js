'use strict';

// 캐릭터·적·소품·바닥 그림. 모두 캔버스에 코드로 긋고, main.js가 판을 열 때 한 번
// 찍어 두고(offscreen) 프레임마다 찍어 쓴다. 매 프레임 도형으로 그으면 적 수백 마리를
// 폰이 버티지 못한다.
//
// 그림체는 두꺼운 외곽선 + 두 톤 셀 음영 + 밝은 테두리빛이다. 34px 남짓한 크기에서
// 부드러운 그러데이션만 쓰면 적끼리 뭉개져 무엇이 무엇인지 안 보였다 — 외곽선이
// 실루엣을, 셀 음영이 덩어리를 가른다. 빛은 늘 왼쪽 위에서 온다.
//
// 모든 그림은 오른쪽을 본다. 좌우는 화면이 뒤집는다. 걷기는 네 프레임(f = 0..3)이다.
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

  function shadow(g, x, y, rx, ry) {
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  }

  function eye(g, x, y, r, color) {
    glow(g, x, y, r * 3.2, color, 0.55);
    g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.45, 0, TAU); g.fill();
  }

  const walk = (f) => Math.sin((f / 4) * TAU);
  const bounce = (f) => -Math.abs(Math.sin((f / 4) * TAU));

  // --- 대마법사 ---
  // 두건 달린 남색 로브, 금테, 진홍 망토, 수정 지팡이. 회귀자라 눈이 보랏빛으로 빛난다.
  function mage(g, f) {
    const w = walk(f), b = bounce(f) * 1.4;
    shadow(g, 18, 43, 10, 3);
    g.save(); g.translate(0, b);
    const cape = w * 1.8;
    // 장화
    paint(g, [
      { path: (g) => { g.beginPath(); g.roundRect(12 - w * 1.5, 37 + Math.max(0, w) * 1.2, 6, 5, 2); }, fill: '#2b2238' },
      { path: (g) => { g.beginPath(); g.roundRect(19 + w * 1.5, 37 + Math.max(0, -w) * 1.2, 6, 5, 2); }, fill: '#3a2e4c' },
    ]);
    paint(g, [
      // 망토. 걸을 때 뒤로 나부낀다.
      { path: (g) => { g.beginPath(); g.moveTo(14, 19); g.quadraticCurveTo(6 - cape, 28, 3 - cape, 39); g.quadraticCurveTo(9, 41, 14, 39); g.lineTo(22, 22); g.closePath(); },
        fill: (g) => cel(g, 3, 20, 14, 40, '#9b2748', '#541430', 0.5) },
      // 로브
      { path: (g) => { g.beginPath(); g.moveTo(13, 19); g.quadraticCurveTo(9, 30, 8, 40); g.quadraticCurveTo(18, 42.5, 28, 40); g.quadraticCurveTo(27, 29, 24, 19); g.closePath(); },
        fill: (g) => cel(g, 8, 18, 28, 40, '#5f4fd0', '#2e2478', 0.55),
        detail: (g) => {
          g.fillStyle = '#e0bc5c'; g.fillRect(0, 37.6, 40, 1.8);
          g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(10, 19, 3, 20);
          g.fillStyle = '#1d1640'; g.fillRect(0, 28.5, 40, 2.4);
          g.fillStyle = '#e0bc5c'; g.fillRect(17.4, 20, 1.3, 17.6);
        } },
    ]);
    // 허리의 룬 보석
    g.fillStyle = '#b99bff'; g.beginPath(); g.moveTo(18, 27.6); g.lineTo(20, 29.7); g.lineTo(18, 31.8); g.lineTo(16, 29.7); g.closePath(); g.fill();
    glow(g, 18, 29.7, 4, '#b99bff', 0.5);
    // 지팡이
    const sx = 30 + w * 0.6;
    g.lineCap = 'round';
    g.strokeStyle = OUT; g.lineWidth = 4.2; g.beginPath(); g.moveTo(sx - 1.5, 42); g.lineTo(sx, 12); g.stroke();
    g.strokeStyle = '#8a5a30'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(sx - 1.5, 42); g.lineTo(sx, 12); g.stroke();
    g.strokeStyle = '#c08a52'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(sx - 1.9, 40); g.lineTo(sx - 0.5, 14); g.stroke();
    // 지팡이 머리: 갈래 진 나무가 수정을 문다.
    paint(g, [
      { path: (g) => { g.beginPath(); g.moveTo(sx - 3.5, 13); g.quadraticCurveTo(sx - 4.5, 6, sx - 1, 3); g.lineTo(sx, 7); g.quadraticCurveTo(sx + 1, 3, sx + 4, 4); g.quadraticCurveTo(sx + 3.5, 9, sx + 2, 13); g.closePath(); }, fill: '#7a4d28' },
    ], 1);
    glow(g, sx, 8, 9, '#b99bff', 0.7);
    paint(g, [
      { path: (g) => { g.beginPath(); g.moveTo(sx, 2.5); g.lineTo(sx + 2.6, 7.5); g.lineTo(sx, 12); g.lineTo(sx - 2.6, 7.5); g.closePath(); },
        fill: (g) => cel(g, sx - 3, 3, sx + 3, 12, '#f1e8ff', '#9b7cff', 0.45) },
    ], 0.9);
    // 앞팔
    paint(g, [
      { path: (g) => { g.beginPath(); g.ellipse(24.5, 25, 4, 5.5, -0.5, 0, TAU); }, fill: (g) => cel(g, 20, 20, 29, 30, '#5f4fd0', '#2e2478') },
      { path: (g) => { g.beginPath(); g.arc(sx - 0.6, 27.5, 2.3, 0, TAU); }, fill: '#f0cdb0' },
    ], 1);
    // 두건과 얼굴
    const tip = -w * 1.2;
    paint(g, [
      { path: (g) => { g.beginPath(); g.moveTo(10, 16); g.quadraticCurveTo(7 + tip, 6, 3 + tip, 3); g.quadraticCurveTo(11, 1, 19, 4.5); g.arc(18.5, 13.5, 9, -1.4, 1.2); g.quadraticCurveTo(15, 23, 10, 16); g.closePath(); },
        fill: (g) => cel(g, 6, 3, 28, 22, '#6a5ae0', '#2a2070', 0.5),
        detail: (g) => { g.strokeStyle = '#e0bc5c'; g.lineWidth = 1.2; g.beginPath(); g.arc(20.5, 14.5, 7.2, -1.2, 1.15); g.stroke(); } },
      { path: (g) => { g.beginPath(); g.ellipse(21.2, 15, 5, 5.2, 0, 0, TAU); }, fill: '#f3d4bb', noOutline: true,
        detail: (g) => {
          g.fillStyle = 'rgba(40,20,80,0.35)'; g.beginPath(); g.ellipse(20, 10.5, 7, 3.4, 0, 0, TAU); g.fill();
          // 은빛 앞머리
          g.fillStyle = '#e4e8fb';
          g.beginPath(); g.moveTo(16, 10); g.quadraticCurveTo(21, 9, 26.5, 11.5); g.lineTo(24.5, 14.5); g.lineTo(22.6, 12.4); g.lineTo(21, 15); g.lineTo(19.2, 12.6); g.lineTo(17, 15); g.closePath(); g.fill();
          g.fillStyle = '#aab0d8'; g.beginPath(); g.moveTo(22.6, 12.4); g.lineTo(21, 15); g.lineTo(21.8, 12.2); g.closePath(); g.fill();
        } },
    ]);
    eye(g, 21.6, 16.2, 0.95, '#c8a6ff');
    eye(g, 24.9, 16.2, 0.85, '#c8a6ff');
    // 목의 걸쇠
    g.fillStyle = '#e0bc5c'; g.beginPath(); g.arc(19, 21.6, 1.5, 0, TAU); g.fill();
    g.restore();
  }

  // --- 슬라임 ---
  function slime(g, f) {
    const s = Math.sin((f / 4) * TAU);
    const sx = 1 + s * 0.09, sy = 1 - s * 0.09;
    shadow(g, 15, 25, 11 * sx, 3);
    g.save(); g.translate(15, 25); g.scale(sx, sy); g.translate(-15, -25);
    paint(g, [
      { path: (g) => { g.beginPath(); g.moveTo(3, 24); g.quadraticCurveTo(2, 12, 9, 8); g.quadraticCurveTo(15, 3, 21, 8); g.quadraticCurveTo(28, 12, 27, 24); g.quadraticCurveTo(15, 26.5, 3, 24); g.closePath(); },
        fill: (g) => cel(g, 4, 6, 26, 25, '#a8ec62', '#3f9a36', 0.52),
        detail: (g) => {
          g.fillStyle = 'rgba(30,90,40,0.55)'; g.beginPath(); g.ellipse(16, 19, 6, 4, 0.3, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(9.5, 11, 3.2, 1.8, -0.7, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(13, 8.8, 0.9, 0, TAU); g.fill();
          g.fillStyle = 'rgba(0,40,0,0.25)'; g.fillRect(0, 22, 30, 4);
        } },
    ]);
    // 성난 눈
    g.fillStyle = OUT;
    g.beginPath(); g.ellipse(16, 15, 1.7, 2.3, 0, 0, TAU); g.ellipse(22, 15, 1.7, 2.3, 0, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(16.5, 14.2, 0.6, 0, TAU); g.arc(22.5, 14.2, 0.6, 0, TAU); g.fill();
    g.strokeStyle = OUT; g.lineWidth = 1.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(14, 11.3); g.lineTo(17.6, 12.6); g.moveTo(24, 11.3); g.lineTo(20.6, 12.6); g.stroke();
    g.restore();
  }

  // --- 고블린 ---
  function goblin(g, f) {
    const w = walk(f), b = bounce(f) * 1.5;
    shadow(g, 15, 30, 9, 2.6);
    g.save(); g.translate(0, b);
    // 다리
    paint(g, [
      { path: (g) => { g.beginPath(); g.roundRect(10 - w * 2, 24, 4.5, 6 - Math.max(0, w), 1.8); }, fill: '#3d5a22' },
      { path: (g) => { g.beginPath(); g.roundRect(16 + w * 2, 24, 4.5, 6 - Math.max(0, -w), 1.8); }, fill: '#4c6e2a' },
    ], 1.1);
    // 몸통(누더기 가죽옷)과 칼
    const arm = w * 0.35;
    g.save(); g.translate(22, 20); g.rotate(-0.6 + arm);
    paint(g, [
      { path: (g) => { g.beginPath(); g.moveTo(0, -1); g.lineTo(9, -3); g.lineTo(10.5, -1.5); g.lineTo(1, 1.5); g.closePath(); }, fill: (g) => cel(g, 0, -3, 10, 1, '#dfe4ea', '#8a92a0', 0.5) },
      { path: (g) => { g.beginPath(); g.roundRect(-2, -2, 3.5, 4, 1); }, fill: '#6b4424' },
    ], 1);
    g.restore();
    paint(g, [
      { path: (g) => { g.beginPath(); g.moveTo(9, 16); g.quadraticCurveTo(7, 22, 8, 26.5); g.lineTo(22, 26.5); g.quadraticCurveTo(23, 22, 21, 16); g.closePath(); },
        fill: (g) => cel(g, 8, 15, 22, 27, '#8c5a2e', '#4e2f16', 0.5),
        detail: (g) => { g.strokeStyle = '#2e1a0c'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(9, 23); g.lineTo(11, 26.5); g.lineTo(13, 23.5); g.lineTo(15, 26.5); g.lineTo(17, 23.5); g.lineTo(19, 26.5); g.stroke(); g.fillStyle = '#c9a15a'; g.fillRect(8, 21, 16, 1.4); } },
      { path: (g) => { g.beginPath(); g.arc(23, 20.5, 2.4, 0, TAU); }, fill: '#78ad44' },
    ], 1.1);
    // 머리: 크고 뾰족한 귀
    const ear = Math.sin((f / 4) * TAU + 1) * 0.8;
    paint(g, [
      { path: (g) => { g.beginPath(); g.moveTo(9, 10); g.lineTo(0.5, 5 + ear); g.lineTo(9.5, 13.5); g.closePath(); }, fill: (g) => cel(g, 0, 5, 10, 13, '#9ed35e', '#4f7f2a') },
      { path: (g) => { g.beginPath(); g.moveTo(22, 10); g.lineTo(29.5, 4 - ear); g.lineTo(21.5, 13.5); g.closePath(); }, fill: (g) => cel(g, 21, 4, 30, 13, '#9ed35e', '#4f7f2a') },
      { path: (g) => { g.beginPath(); g.ellipse(15.5, 11, 7.5, 7, 0, 0, TAU); }, fill: (g) => cel(g, 8, 4, 23, 18, '#a6d965', '#57892e', 0.55),
        detail: (g) => { g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(12, 7, 3, 1.6, -0.4, 0, TAU); g.fill(); } },
    ], 1.2);
    // 코·눈·이빨
    g.fillStyle = '#5f8f32'; g.beginPath(); g.ellipse(21.5, 12, 2.2, 1.5, 0.2, 0, TAU); g.fill();
    eye(g, 15.5, 10, 1.1, '#ff5a2a');
    eye(g, 19.6, 10, 1.0, '#ff5a2a');
    g.strokeStyle = OUT; g.lineWidth = 1; g.beginPath(); g.moveTo(13.6, 8); g.lineTo(16.8, 8.9); g.moveTo(21.2, 8); g.lineTo(18.6, 8.9); g.stroke();
    g.fillStyle = OUT; g.beginPath(); g.moveTo(14, 14.3); g.quadraticCurveTo(17.5, 16.5, 21, 14.3); g.quadraticCurveTo(17.5, 15.4, 14, 14.3); g.fill();
    g.fillStyle = '#f5f0dc'; g.beginPath(); g.moveTo(15.2, 14.5); g.lineTo(15.8, 15.8); g.lineTo(16.4, 14.8); g.moveTo(18.8, 14.8); g.lineTo(19.4, 15.8); g.lineTo(20, 14.5); g.fill();
    g.restore();
  }

  // --- 그림자 늑대 ---
  function wolf(g, f) {
    const t = (f / 4) * TAU;
    const a = Math.sin(t), c = Math.cos(t);
    shadow(g, 17, 24, 13, 2.8);
    g.save(); g.translate(0, -Math.abs(a) * 1.2);
    const leg = (x, y, s, fill) => ({ path: (g) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 3.5, y + 6); g.lineTo(x + s * 3.5 + 2.4, y + 6); g.lineTo(x + 2.8, y); g.closePath(); }, fill });
    paint(g, [
      leg(7, 17, -a, '#2c3244'), leg(22, 17, c, '#2c3244'),
    ], 1);
    paint(g, [
      // 꼬리
      { path: (g) => { g.beginPath(); g.moveTo(7, 13); g.quadraticCurveTo(0, 9 + a * 2, 1, 5 + a * 2); g.quadraticCurveTo(4, 11, 9, 12); g.closePath(); }, fill: '#3b4258' },
      // 몸
      { path: (g) => { g.beginPath(); g.moveTo(6, 15); g.quadraticCurveTo(7, 9, 14, 9); g.lineTo(22, 8.5); g.quadraticCurveTo(26, 12, 25, 18); g.quadraticCurveTo(15, 20.5, 6, 15); g.closePath(); },
        fill: (g) => cel(g, 6, 8, 25, 20, '#6f7890', '#2e3346', 0.5),
        detail: (g) => {
          // 등의 뾰족한 털
          g.fillStyle = '#2e3346';
          for (let i = 0; i < 4; i++) { const x = 10 + i * 3.4; g.beginPath(); g.moveTo(x, 9.5); g.lineTo(x + 1.6, 6.8 - (i % 2)); g.lineTo(x + 3.2, 9.5); g.fill(); }
          g.fillStyle = 'rgba(160,190,255,0.22)'; g.fillRect(7, 10, 14, 1.4);
        } },
      // 머리
      { path: (g) => { g.beginPath(); g.moveTo(21, 8); g.lineTo(23, 2.5); g.lineTo(25.5, 6.5); g.lineTo(28, 7.5); g.lineTo(34, 11.5); g.lineTo(33, 13.8); g.lineTo(27, 14.5); g.quadraticCurveTo(22, 15, 21, 12); g.closePath(); },
        fill: (g) => cel(g, 21, 3, 34, 15, '#7a849e', '#343a50', 0.55) },
    ], 1.1);
    paint(g, [leg(9.5, 16.5, a, '#454d66'), leg(20, 16.5, -c, '#454d66')], 1);
    eye(g, 27.4, 9.6, 1.05, '#ffd23a');
    g.fillStyle = OUT; g.beginPath(); g.arc(33.6, 12.3, 0.9, 0, TAU); g.fill();
    g.fillStyle = '#f2efe6'; g.beginPath(); g.moveTo(29, 14.2); g.lineTo(29.6, 15.8); g.lineTo(30.3, 14.1); g.fill();
    g.restore();
  }

  // --- 망령 ---
  function wraith(g, f) {
    const t = (f / 4) * TAU;
    const s = Math.sin(t);
    // 떠다니므로 그림자가 작고 흐리다.
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(15, 32, 7, 2, 0, 0, TAU); g.fill();
    g.save(); g.translate(0, s * 1.2);
    glow(g, 15, 15, 16, '#8fa2ff', 0.25);
    const hem = (g) => {
      g.beginPath(); g.moveTo(5, 12); g.quadraticCurveTo(5, 2, 15, 2); g.quadraticCurveTo(25, 2, 25.5, 12);
      g.lineTo(26, 22); g.lineTo(23.5 + s, 28); g.lineTo(21, 24); g.lineTo(18 - s, 30.5); g.lineTo(15, 25); g.lineTo(11.5 + s, 30); g.lineTo(9, 24); g.lineTo(5.5 - s, 28); g.lineTo(4.5, 21); g.closePath();
    };
    paint(g, [
      { path: hem, fill: (g) => { const gr = g.createLinearGradient(0, 2, 0, 31); gr.addColorStop(0, '#8e9cf0'); gr.addColorStop(0.55, '#4b52a8'); gr.addColorStop(1, 'rgba(40,40,110,0.35)'); return gr; },
        detail: (g) => { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(7, 12); g.quadraticCurveTo(8, 4, 15, 3.5); g.quadraticCurveTo(10, 6, 9.5, 20); g.closePath(); g.fill(); } },
    ], 1.1);
    // 두건 속 어둠
    g.fillStyle = '#07061a'; g.beginPath(); g.ellipse(17, 11, 6, 6.5, 0.1, 0, TAU); g.fill();
    eye(g, 16, 11, 1.2, '#7ff6ff');
    eye(g, 20.4, 11, 1.1, '#7ff6ff');
    // 뻗은 뼈손
    paint(g, [
      { path: (g) => { g.beginPath(); g.moveTo(22, 17); g.quadraticCurveTo(27, 16 + s, 29.5, 15 + s); g.lineTo(29, 17.5 + s); g.quadraticCurveTo(26, 19, 23, 20); g.closePath(); }, fill: '#d9dcf0' },
    ], 0.9);
    g.restore();
  }

  // --- 돌 골렘 ---
  function golem(g, f) {
    const w = walk(f), b = bounce(f) * 1.2;
    shadow(g, 22, 41, 16, 3.6);
    g.save(); g.translate(0, b);
    const stone = (x0, y0, x1, y1) => (g) => cel(g, x0, y0, x1, y1, '#9d9582', '#4a453b', 0.52);
    const rune = (g, pts) => { g.strokeStyle = '#6ff3ff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
    paint(g, [
      // 다리
      { path: (g) => { g.beginPath(); g.roundRect(10 - w * 1.5, 31, 9, 10, 3); }, fill: stone(10, 31, 19, 41) },
      { path: (g) => { g.beginPath(); g.roundRect(25 + w * 1.5, 31, 9, 10, 3); }, fill: stone(25, 31, 34, 41) },
      // 뒷팔
      { path: (g) => { g.beginPath(); g.roundRect(1, 17 + w * 2, 9, 17, 4); }, fill: stone(1, 17, 10, 34) },
    ], 1.4);
    paint(g, [
      // 몸통 바위
      { path: (g) => { g.beginPath(); g.moveTo(8, 14); g.lineTo(15, 8); g.lineTo(30, 8.5); g.lineTo(37, 15); g.lineTo(36, 30); g.lineTo(29, 35); g.lineTo(14, 35); g.lineTo(7.5, 29); g.closePath(); },
        fill: stone(8, 8, 37, 35),
        detail: (g) => {
          g.fillStyle = '#5f8a3a'; g.beginPath(); g.ellipse(14, 9.5, 7, 3, 0.2, 0, TAU); g.ellipse(33, 12, 4, 2.2, -0.4, 0, TAU); g.fill();
          g.fillStyle = '#7fae4a'; g.beginPath(); g.ellipse(13, 9, 4, 1.4, 0.2, 0, TAU); g.fill();
          g.save(); g.shadowColor = '#6ff3ff'; g.shadowBlur = 4;
          rune(g, [16, 18, 20, 23, 17, 28]); rune(g, [26, 17, 29, 21, 27, 25, 30, 29]);
          g.restore();
          g.strokeStyle = 'rgba(20,16,12,0.6)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(10, 24); g.lineTo(14, 25); g.moveTo(31, 31); g.lineTo(34, 27); g.stroke();
        } },
      // 머리
      { path: (g) => { g.beginPath(); g.moveTo(17, 9); g.lineTo(18, 2.5); g.lineTo(28, 2); g.lineTo(30, 8.5); g.closePath(); }, fill: stone(17, 2, 30, 9) },
      // 앞팔
      { path: (g) => { g.beginPath(); g.roundRect(33, 16 - w * 2, 10, 18, 4.5); }, fill: stone(33, 16, 43, 34),
        detail: (g) => { g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(34, 17 - w * 2, 2, 14); } },
    ], 1.4);
    eye(g, 23, 5.8, 1.2, '#6ff3ff');
    eye(g, 27.2, 5.8, 1.1, '#6ff3ff');
    g.restore();
  }

  // --- 재앙의 사도 (보스) ---
  // 숫양 뿔의 사제. 등 뒤에 붉은 가시 후광, 가슴에 재앙의 핵이 뛴다.
  function boss(g, f) {
    const t = (f / 4) * TAU, s = Math.sin(t);
    shadow(g, 44, 82, 26, 5);
    g.save(); g.translate(0, s * 1.5);
    // 후광
    glow(g, 44, 36, 38, '#ff3048', 0.45);
    g.save(); g.translate(44, 32); g.rotate(f * 0.2);
    g.fillStyle = '#2a0710'; g.strokeStyle = '#ff5468'; g.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      g.save(); g.rotate((i / 12) * TAU);
      g.beginPath(); g.moveTo(-2.4, -18); g.lineTo(0, -27 - (i % 2) * 4); g.lineTo(2.4, -18); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    g.strokeStyle = 'rgba(255,90,110,0.8)'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 19, 0, TAU); g.stroke();
    g.restore();
    const cloak = (g) => {
      g.beginPath(); g.moveTo(30, 28); g.quadraticCurveTo(14, 44, 8 - s * 3, 80); g.lineTo(18, 74); g.lineTo(24, 81); g.lineTo(32, 75); g.lineTo(40, 82);
      g.lineTo(48, 75); g.lineTo(56, 82); g.lineTo(62, 74); g.lineTo(70, 80); g.lineTo(80 + s * 3, 78); g.quadraticCurveTo(72, 44, 58, 28); g.closePath();
    };
    paint(g, [
      { path: cloak, fill: (g) => cel(g, 10, 28, 78, 82, '#4a2a68', '#1a0d2a', 0.5),
        detail: (g) => {
          g.fillStyle = '#7a1a2c'; g.fillRect(0, 70, 90, 3);
          g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; g.beginPath(); g.moveTo(26, 36); g.quadraticCurveTo(18, 56, 16, 76); g.stroke();
          g.strokeStyle = '#c9a24a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(44, 36); g.lineTo(44, 74); g.stroke();
        } },
      // 어깨 갑주
      { path: (g) => { g.beginPath(); g.moveTo(24, 36); g.quadraticCurveTo(26, 25, 36, 26); g.lineTo(38, 34); g.closePath(); }, fill: (g) => cel(g, 24, 25, 38, 36, '#8e8aa0', '#3a3648') },
      { path: (g) => { g.beginPath(); g.moveTo(64, 36); g.quadraticCurveTo(62, 25, 52, 26); g.lineTo(50, 34); g.closePath(); }, fill: (g) => cel(g, 50, 25, 64, 36, '#8e8aa0', '#3a3648') },
    ], 1.8);
    // 가슴의 핵
    glow(g, 44, 46, 10 + s * 1.5, '#ff3048', 0.8);
    g.fillStyle = '#ffd0d6'; g.beginPath(); g.moveTo(44, 41); g.lineTo(47.5, 46); g.lineTo(44, 51); g.lineTo(40.5, 46); g.closePath(); g.fill();
    // 떠 있는 손
    const hand = (x, y) => ({ path: (g) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 7); g.lineTo(x, y + 5); g.lineTo(x + 1.5, y + 9); g.lineTo(x + 3, y + 5); g.lineTo(x + 6, y + 7); g.lineTo(x + 4, y); g.closePath(); }, fill: '#c9bfd8' });
    paint(g, [hand(12, 46 + s * 2), hand(72, 46 - s * 2)], 1.2);
    glow(g, 14, 52 + s * 2, 7, '#ff3048', 0.5); glow(g, 74, 52 - s * 2, 7, '#ff3048', 0.5);
    // 머리와 뿔
    const horn = (dir) => ({ path: (g) => { g.beginPath(); g.moveTo(44 + dir * 6, 16); g.quadraticCurveTo(44 + dir * 20, 4, 44 + dir * 22, 14); g.quadraticCurveTo(44 + dir * 23, 22, 44 + dir * 16, 21); g.quadraticCurveTo(44 + dir * 19, 15, 44 + dir * 13, 14); g.quadraticCurveTo(44 + dir * 9, 17, 44 + dir * 7, 21); g.closePath(); },
      fill: (g) => cel(g, 44, 4, 44 + dir * 23, 22, '#efe3c8', '#8c7b5c', 0.5) });
    paint(g, [
      horn(-1), horn(1),
      { path: (g) => { g.beginPath(); g.moveTo(34, 30); g.quadraticCurveTo(33, 12, 44, 11); g.quadraticCurveTo(55, 12, 54, 30); g.quadraticCurveTo(44, 34, 34, 30); g.closePath(); }, fill: (g) => cel(g, 34, 11, 54, 32, '#4a2a68', '#1a0d2a', 0.5) },
    ], 1.6);
    g.fillStyle = '#05030b'; g.beginPath(); g.ellipse(44, 23, 7, 7.5, 0, 0, TAU); g.fill();
    eye(g, 41, 22, 1.8, '#ff3048');
    eye(g, 47, 22, 1.8, '#ff3048');
    g.restore();
  }

  // box는 그림의 크기, foot은 그 안에서 발이 닿는 높이(그림자의 한가운데)다.
  const FOES = {
    slime: { draw: slime, box: [30, 28], foot: 25 },
    goblin: { draw: goblin, box: [30, 32], foot: 30 },
    wolf: { draw: wolf, box: [36, 28], foot: 24 },
    wraith: { draw: wraith, box: [30, 34], foot: 32 },
    golem: { draw: golem, box: [44, 44], foot: 41 },
    boss: { draw: boss, box: [88, 88], foot: 82 },
  };
  const MAGE = { draw: mage, box: [36, 46], foot: 43 };

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

  window.ArchmageArt = { FOES, MAGE, PROPS, ground, glow, rgba };
})();

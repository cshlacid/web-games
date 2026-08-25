'use strict';

// 전투 배경. 퀘스트마다 장소가 다르므로 배경도 다르다 — 폐광은 갱도, 초소는
// 무너진 성벽, 야영지는 밤이다. 어디서 싸우고 있는지가 화면에 없으면 세 퀘스트가
// 같은 전투로 보인다.
//
// 캐릭터와 같은 규칙으로 그린다: 애셋 파일 없이 사각형만 찍고, 좌표는 픽셀이
// 아니라 전장 격자(FIELD)다. 격자에 맞춰야 장판 반경과 배경의 눈금이 어긋나지 않는다.
//
// 배경은 전투당 한 번만 만든다. 매 프레임 다시 그릴 것이 아니므로 난수를 써서
// 돌 하나하나를 흩어 놓아도 되고, 씨앗을 고정하면 같은 퀘스트가 같은 모습이 된다.
(function (root) {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : root.HealerData;

const W = D.FIELD.w;
const H = D.FIELD.h;

// 벽과 바닥의 경계. 유닛은 y 5~41에 서므로 벽을 이보다 낮게 두면 뒤쪽 유닛이
// 바닥이 아니라 벽에 서 있는 것처럼 보인다.
const HORIZON = 13;

function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n) => Math.round(n * 100) / 100;
const box = (x, y, w, h, fill) =>
  `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="${fill}"/>`;

// 돌벽. 줄마다 반 칸씩 어긋나게 쌓아야 벽돌로 보인다. 색을 두세 개 섞는 것은
// 한 색으로 채우면 이 크기에서 그냥 판때기로 보이기 때문이다.
function stoneWall(out, y0, y1, bw, bh, colors, rng) {
  for (let y = y0, row = 0; y < y1; y += bh, row++) {
    const offset = row % 2 ? -bw / 2 : 0;
    for (let x = offset; x < W; x += bw) {
      const left = Math.max(0, x);
      const width = Math.min(x + bw - 0.6, W) - left;
      if (width <= 0) continue;
      out.push(box(left, y, width, Math.min(bh - 0.6, y1 - y), colors[(rng() * colors.length) | 0]));
    }
  }
}

// 바닥 얼룩. 아래로 갈수록(=가까울수록) 큰 얼룩을 놓아 깊이를 만든다.
function grain(out, y0, y1, count, colors, rng) {
  for (let i = 0; i < count; i++) {
    const y = y0 + rng() * (y1 - y0);
    const depth = (y - y0) / (y1 - y0);
    const size = 0.8 + depth * 1.6;
    out.push(box(rng() * W, y, size * (1 + rng()), size, colors[(rng() * colors.length) | 0]));
  }
}

// 불빛 웅덩이. 그냥 원을 깔았더니 각진 원판이 배경 위에 떠 보였다. 가장자리가
// 투명으로 흐려지는 방사 그라디언트라야 빛으로 읽힌다.
function glow(out, x, y, r, id) {
  out.push(`<ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(r)}" ry="${round(r * 0.7)}"`
    + ` fill="url(#${id})"/>`);
}

function torch(out, x, y) {
  out.push(box(x, y, 1.2, 4, '#4a3626'));          // 받침
  out.push(box(x - 1, y - 2.4, 3.2, 2.6, '#e8873a'));
  out.push(box(x - 0.4, y - 3.6, 2, 1.6, '#f6d24a'));
  out.push(box(x + 0.2, y - 4.4, 1.2, 1.2, '#fdf2b8'));
}

// 계단으로 쌓은 삼각형. 어두운 테를 먼저 깔지 않으면 밤하늘에 묻힌다.
function tent(out, cx, top, steps, light, dark) {
  for (let i = 0; i < steps; i++) {
    const w = 2.8 + i * 2.8;
    const y = top + i * 1.5;
    out.push(box(cx - w / 2 - 0.6, y, w + 1.2, 1.5, dark));
    out.push(box(cx - w / 2, y, w, 1.5, i % 2 ? light : dark));
  }
  const base = top + steps * 1.5;
  out.push(box(cx - 1.6, base - 3, 3.2, 3, '#1a140e'));   // 입구
}

const SCENES = {
  // 폐광. 갱도라 하늘이 없다 — 위아래가 다 막혀 있어야 좁은 곳에서 싸우는 느낌이 난다.
  mine: {
    name: '폐광 갱도',
    build(out, rng) {
      out.push(box(0, 0, W, HORIZON, '#2b2119'));
      stoneWall(out, 0, HORIZON, 9, 4.5, ['#3a2d22', '#443528', '#332720'], rng);
      out.push(box(0, 0, W, 3, '#1d1611'));            // 천장의 어둠

      // 나무 지지대. 서 있는 기둥 둘과 그 위를 잇는 들보.
      for (const x of [17, 63]) {
        out.push(box(x, 0, 3, HORIZON + 3, '#5a4028'));
        out.push(box(x + 2.2, 0, 0.8, HORIZON + 3, '#3f2c1b'));
        out.push(box(x - 3, HORIZON - 1, 9, 2.2, '#66492e'));
      }

      // 벽과 바닥 사이의 그늘. 이 한 줄이 없으면 둘이 한 덩어리로 보인다.
      out.push(box(0, HORIZON, W, 1.6, '#1a1410'));
      out.push(box(0, HORIZON + 1.6, W, H - HORIZON - 1.6, '#4a3a2b'));
      grain(out, HORIZON + 2, H, 46, ['#3d3025', '#553f2d', '#5d4b36'], rng);

      // 광차 레일. 가로로 깔린 선 두 줄이 바닥을 바닥으로 읽히게 한다.
      for (const y of [30, 34.2]) {
        for (let x = 0; x < W; x += 5) out.push(box(x, y - 1.2, 3.4, 1.1, '#4e3d2c'));
        out.push(box(0, y, W, 0.9, '#7a6a55'));
      }

      glow(out, 34.6, 4, 13, 'gw');
      glow(out, 84.6, 4, 13, 'gw');
      torch(out, 34, 4);
      torch(out, 84, 4);
    },
  },

  // 무너진 초소. 셋 중 유일하게 바깥이라 하늘이 있고 뒤에 탑이 선다.
  // 벽·바닥을 같은 회색으로 깔았더니 화면 전체가 돌 한 덩어리가 되어, 바닥은
  // 따뜻한 쪽으로 밀고 사이에 그늘을 넣어 갈랐다.
  outpost: {
    name: '무너진 초소',
    build(out, rng) {
      out.push(box(0, 0, W, HORIZON + 2, '#3f4a63'));
      out.push(box(0, 0, W, 4.5, '#333d54'));
      for (let i = 0; i < 30; i++) {
        out.push(box(rng() * W, rng() * 8, 0.7, 0.7, '#93a0bd'));
      }

      // 뒤에 선 탑. 무너진 초소라는 것은 이 실루엣 하나로 전해진다.
      out.push(box(71, 0, 14, 10, '#2f3644'));
      out.push(box(69.5, 0.8, 17, 2.2, '#39414f'));
      for (let x = 70; x < 86; x += 4) out.push(box(x, 0, 2.4, 1.4, '#2f3644'));
      out.push(box(76, 4, 3, 3.6, '#1a1e26'));

      // 흉벽. 이가 빠진 자리가 있어야 폐허로 보인다.
      for (let x = 0, i = 0; x < W; x += 7, i++) {
        if (i % 3 === 1) continue;
        out.push(box(x, 6.4, 4.6, 3, '#525a6b'));
        out.push(box(x, 6.4, 4.6, 0.8, '#606978'));
      }
      stoneWall(out, 9.4, HORIZON + 1, 8, 3.2, ['#4c5364', '#565e6f', '#434a59'], rng);

      out.push(box(0, HORIZON + 1, W, 1.6, '#22262f'));
      out.push(box(0, HORIZON + 2.6, W, H - HORIZON - 2.6, '#6d6a62'));
      stoneWall(out, HORIZON + 2.6, H, 14, 7, ['#736f66', '#67635b', '#7c7870'], rng);
      grain(out, HORIZON + 4, H, 26, ['#5b5852', '#847f74'], rng);

      // 잔해 더미. 바닥보다 어두워야 떨어져 있는 것으로 보인다.
      for (const x of [12, 47, 88]) {
        out.push(box(x, 30, 6, 3, '#4f4c46'));
        out.push(box(x + 1.5, 27.5, 3.5, 2.6, '#5c5851'));
        out.push(box(x + 5, 28.6, 2.4, 1.8, '#464340'));
      }
    },
  },

  // 오크 야영지. 밤이고 모닥불이 유일한 빛이다. 앞의 둘보다 어둡게 두어
  // 마지막 퀘스트라는 것이 배경만으로도 전해지게 했다.
  camp: {
    name: '오크 야영지',
    build(out, rng) {
      out.push(box(0, 0, W, HORIZON + 2, '#1b2132'));
      for (let i = 0; i < 34; i++) {
        out.push(box(rng() * W, rng() * 9, 0.7, 0.7, '#7686ad'));
      }
      out.push(`<circle cx="18" cy="5" r="3.2" fill="#e8e6d0"/>`);
      out.push(`<circle cx="16.4" cy="4.2" r="2.6" fill="#1b2132"/>`);

      // 뒤쪽 능선. 하늘보다 밝아야 앞뒤가 갈린다 — 어둡게 뒀더니 하늘에 묻혔다.
      for (let x = -4; x < W; x += 13) {
        out.push(box(x, HORIZON - 5 - (x % 7) * 0.4, 14, 9, '#2b3348'));
      }

      tent(out, 60, HORIZON - 7, 6, '#5b432e', '#3f2e1f');
      tent(out, 88, HORIZON - 5, 5, '#54402c', '#3a2b1d');

      // 말뚝 울타리.
      for (let x = 4; x < 46; x += 6) {
        out.push(box(x, HORIZON - 5, 1.8, 7, '#4b3722'));
        out.push(box(x - 0.4, HORIZON - 6, 2.6, 1.2, '#332516'));
      }

      out.push(box(0, HORIZON + 2, W, 1.4, '#151a26'));
      out.push(box(0, HORIZON + 3.4, W, H - HORIZON - 3.4, '#2e3626'));
      grain(out, HORIZON + 4, H, 40, ['#262d1f', '#39442d', '#414d34'], rng);

      // 모닥불. 화면에서 가장 밝은 점이라 시선이 여기로 먼저 간다.
      glow(out, 72, 32, 22, 'gw');
      out.push(box(67, 33, 10, 2, '#4a3524'));
      out.push(box(69, 31, 6, 2.4, '#e07b32'));
      out.push(box(70, 28.6, 4, 2.6, '#f0a83e'));
      out.push(box(71, 26.8, 2, 2, '#f8dc74'));
      glow(out, 30.6, 18, 12, 'gw');
      torch(out, 30, 20);
    },
  },
};

// 배경은 유닛보다 뒤에 있어야 하므로 화면 쪽에서 맨 앞에 붙인다.
// preserveAspectRatio를 끄는 것은 전장 격자와 화면 비율이 이미 같아서인데,
// 한쪽이 반올림으로 한 픽셀 어긋날 때 배경만 여백을 남기지 않게 하려는 것이다.
function svg(sceneId, seed) {
  const scene = SCENES[sceneId] || SCENES.mine;
  const out = [];
  scene.build(out, createRng(seed == null ? 1 : seed));
  const defs = '<defs><radialGradient id="gw">'
    + '<stop offset="0%" stop-color="#ffc266" stop-opacity="0.34"/>'
    + '<stop offset="60%" stop-color="#ffab4a" stop-opacity="0.11"/>'
    + '<stop offset="100%" stop-color="#ff9a3c" stop-opacity="0"/>'
    + '</radialGradient></defs>';
  return `<svg class="scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"`
    + ` shape-rendering="crispEdges" aria-hidden="true">${defs}${out.join('')}</svg>`;
}

const api = { SCENES, svg, HORIZON };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerScenes = api;

})(typeof window !== 'undefined' ? window : globalThis);

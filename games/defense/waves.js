'use strict';

// 스테이지 하나가 데려오는 웨이브 열 개. 스테이지 번호로 그대로 다시 만들어진다.
//
// **스테이지가 올려 보내는 것은 마릿수가 아니라 체력이다.** 마릿수를 같이 올리면
// 화면에 백 마리가 서고 폰이 먼저 죽는다. 마릿수는 웨이브 번호에만 따라 늘고,
// 스테이지는 체력 배수로만 오른다.
(function () {

const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./data.js') : window.DefenseData;

// 스테이지마다 적 체력이 오르는 배수. **1.12에서 멈췄다** — 판 길이를 정하는 것은
// 이 값이 아니라 아군 성장률과의 격차이고, 이 값이 크면 숫자만 커진다. 1.20이면
// 스테이지 100에서 체력이 8천만 배, 1.12면 8만 배다.
const GROWTH = 1.12;
// 판 전체의 절대 난이도는 이 값 하나다. 성장률(위)은 스테이지 사이의 기울기를,
// 이 값은 그 기울기가 시작하는 높이를 정한다.
//
// **사거리와 스킬을 손보면 여기부터 다시 잰다.** 궁수의 사거리를 2.6에서 4로
// 넓혔더니 서른 스테이지를 한 판씩에 다 깨서, 자동 플레이로 다시 맞춘 값이 50이다
// (30이면 전부 한 판, 60이면 한 스테이지에 열 판, 75면 중앙값이 네 판이 된다).
const BASE = 44;
// 같은 스테이지 안에서도 뒤 웨이브가 무겁다. 판 하나에도 기울기가 있어야 한다.
const STEP = 0.08;

// 한 번에 화면에 설 수 있는 수. 넘기면 폰에서 프레임이 무너진다.
const CAP = 46;
const FIRST_MEET = 3;

const hpOf = (stage, wave) => BASE * Math.pow(GROWTH, stage - 1) * (1 + STEP * (wave - 1));

function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 마리 사이 간격. 무리는 쏟아지고 중장병은 뚝뚝 떨어져야 같은 예산이라도
// 다른 판이 된다.
const GAP = { swarm: 0.25, swift: 0.42, grunt: 0.7, mender: 0.9, armored: 1.0, breaker: 1.1, boss: 0 };

// 한 무더기의 상한. 예산만 보고 나누면 싼 종류가 스무 마리씩 쏟아져 다른 종류가
// 낄 자리가 없어진다.
const MOST = { swarm: 22, swift: 14, grunt: 12, armored: 9, breaker: 6, mender: 5 };
// 그 종류를 처음 만나는 스테이지에서는 몇 마리만 섞어 보낸다. 처음 보는 적이
// 떼로 오면 무엇이 달라졌는지 배울 틈이 없다.

// 비싼 종류가 나오기 시작하는 웨이브. **앞쪽 웨이브는 싼 것만 온다** — 시작
// 골드로는 서너 명밖에 못 세우는데 거기에 중장병이 끼면 대응이 문제가 아니라
// 지갑이 문제가 된다. 실제로 스테이지 21의 세 번째 웨이브가 중장병 넷이라
// 백 판 넘게 막혔다.
const firstWave = (key) => (D.FOES[key].cost <= 1 ? 1 : Math.ceil(4 + (D.FOES[key].cost - 1) * 2));

function poolAt(stage) {
  return Object.keys(D.FOE_FROM).filter((k) => stage >= D.FOE_FROM[k]);
}

// **판마다 주력으로 오는 적이 하나 있다.** 종류를 고르게 섞어 보냈더니 판마다
// "이번에는 무엇이 문제인가"가 뭉개져, 사거리 넓은 자를 여섯 세우는 것이 늘 맞는
// 답이 됐다. 한 종류를 앞세우면 그 종류의 약점을 아는 것이 편성이 된다 —
// 무리 판에는 범위, 중장병 판에는 관통, 경보병 판에는 느리게.
//
// 목표(goals)와 같이 **스테이지 씨드로 고정**한다. 재도전할 때 같은 적이 와야
// "이번엔 대비하고"가 성립한다.
function themeOf(stage) {
  const pool = poolAt(stage).filter((k) => k !== 'boss');
  if (!pool.length) return null;
  const next = createRng(Math.imul(stage * 131 + 7, 0xC2B2AE35));
  return pool[Math.floor(next() * pool.length)];
}

function waveOf(stage, wave) {
  const next = createRng(Math.imul(stage * 97 + wave, 0x85EBCA6B));
  const themed = themeOf(stage);
  const hp = hpOf(stage, wave);
  const groups = [];

  if (wave === D.RUN.waves) {
    // 마지막은 우두머리. 혼자 두면 길이 뻔해져 앞세울 무리를 같이 보낸다.
    groups.push({ foe: 'grunt', count: 4 + Math.floor(next() * 4), gap: GAP.grunt });
    groups.push({ foe: 'boss', count: 1, gap: 0 });
  } else {
    // 예산은 웨이브 번호에만 따른다. 스테이지로도 올리면 마릿수가 터진다.
    let budget = 4 + wave * 2.2;
    const pool = poolAt(stage);
    const used = [];
    for (let slot = 0; slot < 2 && budget >= 0.5; slot++) {
      // 비싼 종류는 웨이브가 무르익은 뒤에만 나온다. 그리고 같은 종류를 두 무더기로
      // 쪼개지 않는다 — 한 웨이브에 종류가 둘이어야 대응할 것이 생긴다.
      const ready = pool.filter((k) => !used.includes(k)
        && D.FOES[k].cost <= budget && wave >= firstWave(k));
      if (!ready.length) break;
      // 첫 무더기는 그 판의 주력이다. 아직 나올 수 없는 웨이브면 평소대로 고른다.
      const theme = slot === 0 && ready.includes(themed) ? themed : null;
      const foe = theme || ready[Math.floor(next() * ready.length)];
      used.push(foe);
      const share = slot === 0 ? 0.7 : 1;
      let count = Math.max(1, Math.floor((budget * share) / D.FOES[foe].cost));
      count = Math.min(count, MOST[foe]);
      // 첫 스테이지의 보병은 처음 만나는 적이 아니라 이 게임의 기본값이라 빼 준다.
      if (stage > 1 && stage === D.FOE_FROM[foe]) count = Math.min(count, FIRST_MEET);
      groups.push({ foe, count, gap: GAP[foe] });
      budget -= count * D.FOES[foe].cost;
    }
  }

  let total = groups.reduce((n, g) => n + g.count, 0);
  while (total > CAP) {
    const g = groups.reduce((a, b) => (a.count >= b.count ? a : b));
    g.count--;
    total--;
  }

  return { index: wave, hp, groups, boss: wave === D.RUN.waves, reward: 20 + wave * 4 };
}

const wavesOf = (stage) => {
  const list = [];
  for (let w = 1; w <= D.RUN.waves; w++) list.push(waveOf(stage, w));
  return list;
};

const Waves = { GROWTH, BASE, CAP, MOST, FIRST_MEET, firstWave, hpOf, waveOf, wavesOf, poolAt, themeOf };

if (typeof module !== 'undefined' && module.exports) module.exports = Waves;
if (typeof window !== 'undefined') window.DefenseWaves = Waves;

})();

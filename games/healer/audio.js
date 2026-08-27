'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 곡이 둘인 것은 화면의 온도가 둘이기 때문이다. 길드에서는 장비를 고르고 동료를
// 들여다보는 시간이 길어 곡이 재촉하면 안 되고, 전투는 실시간이라 박자가 손을
// 끌어 줘야 한다. 하나로 맞추면 둘 중 하나는 반드시 어긋난다.
(function () {
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // --- 길드 ------------------------------------------------------------
  // 76 BPM. 드럼을 아예 넣지 않았다 — 전투와의 차이를 음색이 아니라 '박자가
  // 있는가'로 내면 화면이 바뀌는 순간이 귀에도 분명해진다.
  const LOBBY_STEP = 60 / 76 / 2;
  const LOBBY_BAR = 16;

  // F - C - Dm - Bb. 장조로 두어 길드가 쉬는 곳으로 들리게 했다.
  const LOBBY_BARS = [
    { pad: [53, 57, 60, 65], bass: 41, arp: [65, 69, 72, 69] },
    { pad: [52, 55, 60, 64], bass: 36, arp: [64, 67, 72, 67] },
    { pad: [53, 57, 62, 65], bass: 38, arp: [65, 69, 74, 69] },
    { pad: [53, 58, 62, 65], bass: 46, arp: [65, 70, 74, 70] },
  ];

  // 뜯는 자리를 정박에서 한 칸씩 밀어 놓았다. 정박에 두면 드럼이 없는데도
  // 행진처럼 들려 쉬는 곡이 되지 못한다.
  const LOBBY_PLUCKS = [2, 5, 7, 10, 13, 15];

  function lobbyStep(index, at, tone) {
    const bar = LOBBY_BARS[Math.floor(index / LOBBY_BAR) % LOBBY_BARS.length];
    const beat = index % LOBBY_BAR;

    if (beat === 0) {
      for (const note of bar.pad) {
        tone({ freq: midi(note), at, dur: LOBBY_STEP * 17, type: 'sine', gain: 0.085, attack: 0.9 });
      }
      tone({ freq: midi(bar.bass), at, dur: LOBBY_STEP * 6, type: 'triangle', gain: 0.2, attack: 0.03 });
    }
    if (beat === 8) {
      tone({ freq: midi(bar.bass + 7), at, dur: LOBBY_STEP * 5, type: 'triangle', gain: 0.14, attack: 0.03 });
    }

    const pluck = LOBBY_PLUCKS.indexOf(beat);
    if (pluck >= 0) {
      const note = bar.arp[pluck % bar.arp.length];
      tone({ freq: midi(note), at, dur: LOBBY_STEP * 2.4, type: 'triangle', gain: 0.09, attack: 0.008 });
      // 한 옥타브 위를 아주 작게 겹쳐 뜯은 현의 배음을 흉내 낸다. 사인 하나만
      // 두면 뜯는 소리가 아니라 삑 소리로 들린다.
      tone({ freq: midi(note + 12), at, dur: LOBBY_STEP * 1.2, type: 'sine', gain: 0.03, attack: 0.006 });
    }
  }

  // --- 전투 ------------------------------------------------------------
  // 138 BPM. 8분음표 베이스가 쉬지 않고 굴러가는 것이 이 곡의 전부다 — 실시간
  // 전투에서 다음 스킬을 언제 누를지를 곡이 세어 준다.
  const BATTLE_STEP = 60 / 138 / 2;
  const BATTLE_BAR = 8;

  // Am - Am - F - G - Am - Am - Dm - E. 여덟 마디로 늘린 것은 네 마디로 돌리면
  // 한 판이 끝나기 전에 반복이 귀에 걸리기 때문이다.
  const BATTLE_BARS = [
    { pad: [57, 60, 64], bass: 45, lead: null },
    { pad: [57, 60, 64], bass: 45, lead: [76, 74, 72] },
    { pad: [57, 60, 65], bass: 41, lead: null },
    { pad: [59, 62, 67], bass: 43, lead: [74, 72, 71] },
    { pad: [57, 60, 64], bass: 45, lead: null },
    { pad: [57, 60, 64], bass: 45, lead: [76, 79, 76] },
    { pad: [57, 62, 65], bass: 38, lead: null },
    { pad: [56, 59, 64], bass: 40, lead: [71, 72, 76] },
  ];

  const KICK = [0, 3, 4];
  const SNARE = [2, 6];
  const STAB = [0, 3, 6];
  const LEAD_AT = [2, 4, 7];
  // 루트-루트-옥타브-루트를 두 번. 셋째 칸의 옥타브가 굴러가는 느낌을 만든다.
  const BASS_SHAPE = [0, 0, 12, 0, 0, 0, 12, 7];

  function battleStep(index, at, tone, noise) {
    const bar = BATTLE_BARS[Math.floor(index / BATTLE_BAR) % BATTLE_BARS.length];
    const beat = index % BATTLE_BAR;

    tone({
      freq: midi(bar.bass + BASS_SHAPE[beat]),
      at,
      dur: BATTLE_STEP * 0.85,
      type: 'sawtooth',
      gain: 0.13,
      attack: 0.006,
    });

    // 킥은 음정을 급히 떨어뜨린 사인이다. 잡음으로 만들면 베이스와 같은
    // 대역에서 뭉쳐 둘 다 안 들린다.
    if (KICK.includes(beat)) {
      tone({ freq: 150, at, dur: 0.13, type: 'sine', gain: 0.5, attack: 0.002, glide: 45 });
    }
    if (SNARE.includes(beat)) {
      noise({ at, dur: 0.13, type: 'highpass', freq: 1400, gain: 0.13, attack: 0.002 });
      tone({ freq: 190, at, dur: 0.09, type: 'triangle', gain: 0.12, attack: 0.002, glide: 150 });
    }
    // 하이햇은 8분마다. 정박만 세게 두어 어디가 1박인지 알 수 있게 한다.
    noise({
      at,
      dur: 0.035,
      type: 'highpass',
      freq: 7500,
      gain: beat % 2 === 0 ? 0.045 : 0.022,
      attack: 0.001,
    });

    if (STAB.includes(beat)) {
      for (const note of bar.pad) {
        // 같은 음을 살짝 어긋나게 두 번 쌓아 폭을 준다. 톱니 하나로는 얇다.
        tone({ freq: midi(note), at, dur: BATTLE_STEP * 1.6, type: 'sawtooth', gain: 0.05, attack: 0.004 });
        tone({ freq: midi(note), at, dur: BATTLE_STEP * 1.6, type: 'sawtooth', gain: 0.05, attack: 0.004, detune: 9 });
      }
    }

    if (bar.lead) {
      const slot = LEAD_AT.indexOf(beat);
      if (slot >= 0) {
        tone({
          freq: midi(bar.lead[slot]),
          at,
          dur: BATTLE_STEP * 2.2,
          type: 'square',
          gain: 0.075,
          attack: 0.006,
        });
      }
    }
  }

  window.HealerSound = window.createGameAudio({
    storageKey: 'web-games.healer.sound',
    sfxLevel: 0.75,

    tracks: {
      // 첫 칸이 기본값이다. 페이지는 길드에서 열린다.
      lobby: { step: LOBBY_STEP, stepsPerLoop: LOBBY_BARS.length * LOBBY_BAR, scheduleStep: lobbyStep, level: 0.62 },
      battle: { step: BATTLE_STEP, stepsPerLoop: BATTLE_BARS.length * BATTLE_BAR, scheduleStep: battleStep, level: 0.8 },
    },

    sfx: {
      // 힐. 올라가는 음이라야 회복으로 읽힌다. 위에 얹은 잡음은 숨결 쪽에 가깝게
      // 높은 대역만 남겨, 음정이 아니라 결로만 들리게 했다.
      heal: (now, tone, arg, noise) => {
        tone({ freq: 620, at: now, dur: 0.16, type: 'sine', gain: 0.16, attack: 0.006, glide: 930 });
        tone({ freq: 1240, at: now + 0.02, dur: 0.22, type: 'sine', gain: 0.05, attack: 0.01, glide: 1860 });
        noise({ at: now, dur: 0.2, type: 'bandpass', freq: 2400, q: 3, gain: 0.05, attack: 0.03, glide: 5200 });
      },
      // 범위 힐은 같은 성격에 한 겹 더. 개별 힐과 구분되되 같은 계열로 들려야 한다.
      area: (now, tone, arg, noise) => {
        tone({ freq: 520, at: now, dur: 0.26, type: 'sine', gain: 0.15, attack: 0.01, glide: 780 });
        tone({ freq: 780, at: now + 0.06, dur: 0.24, type: 'sine', gain: 0.1, attack: 0.01, glide: 1170 });
        noise({ at: now, dur: 0.34, type: 'bandpass', freq: 1200, q: 2, gain: 0.06, attack: 0.06, glide: 4800 });
      },
      // 장판이 깔리는 소리. 낮게 퍼지는 쪽으로.
      zone: (now, tone, arg, noise) => {
        tone({ freq: 300, at: now, dur: 0.4, type: 'triangle', gain: 0.14, attack: 0.06, glide: 450 });
        noise({ at: now, dur: 0.45, type: 'lowpass', freq: 500, q: 1, gain: 0.09, attack: 0.12, glide: 1500 });
      },
      // 공격 스킬. 힐과 헷갈리면 안 되므로 내려가는 음에 거친 파형을 쓴다.
      // 앞머리의 짧은 잡음이 맞은 지점을 만든다.
      strike: (now, tone, arg, noise) => {
        noise({ at: now, dur: 0.07, type: 'bandpass', freq: 2600, q: 0.8, gain: 0.16, attack: 0.001 });
        tone({ freq: 420, at: now, dur: 0.18, type: 'sawtooth', gain: 0.12, attack: 0.004, glide: 190 });
      },
      mana: (now, tone, arg, noise) => {
        tone({ freq: 380, at: now, dur: 0.3, type: 'sine', gain: 0.16, attack: 0.02, glide: 760 });
        noise({ at: now + 0.04, dur: 0.24, type: 'bandpass', freq: 3200, q: 6, gain: 0.05, attack: 0.02, glide: 6400 });
      },
      // 아군이 쓰러졌을 때. 곡보다 낮게 깔아 놓쳐도 눈에 띄게 한다.
      down: (now, tone, arg, noise) => {
        tone({ freq: 200, at: now, dur: 0.5, type: 'sawtooth', gain: 0.16, attack: 0.01, glide: 90 });
        noise({ at: now, dur: 0.4, type: 'lowpass', freq: 900, q: 1, gain: 0.11, attack: 0.004, glide: 160 });
      },
      // 다음 무리 등장. 잡음을 위로 훑어 올려 몰려오는 쪽으로 들리게 한다.
      wave: (now, tone, arg, noise) => {
        tone({ freq: 160, at: now, dur: 0.35, type: 'square', gain: 0.1, attack: 0.02, glide: 220 });
        noise({ at: now, dur: 0.5, type: 'bandpass', freq: 300, q: 1.5, gain: 0.1, attack: 0.25, glide: 2600 });
      },
      win: (now, tone, arg, noise) => {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.11, dur: 0.42, type: 'sine', gain: 0.2, attack: 0.01 });
          tone({ freq: freq * 2, at: now + i * 0.11, dur: 0.3, type: 'triangle', gain: 0.05, attack: 0.01 });
        });
        noise({ at: now + 0.33, dur: 0.7, type: 'highpass', freq: 5000, gain: 0.06, attack: 0.05 });
      },
      lose: (now, tone, arg, noise) => {
        [392, 349.23, 293.66].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.17, dur: 0.5, type: 'triangle', gain: 0.18, attack: 0.02 });
        });
        noise({ at: now, dur: 0.9, type: 'lowpass', freq: 700, q: 1, gain: 0.06, attack: 0.06, glide: 180 });
      },
      // 주인공이 위험하다. 두 번 두드리는 낮은 음이라 곡에 섞이지 않고, 힐
      // (올라가는 음)과도 헷갈리지 않는다. 여기에는 잡음을 얹지 않았다 — 경고는
      // 다른 소리에 묻히지 않게 결이 단순해야 한다.
      danger: (now, tone) => {
        tone({ freq: 330, at: now, dur: 0.12, type: 'square', gain: 0.1, attack: 0.004, glide: 250 });
        tone({ freq: 330, at: now + 0.16, dur: 0.12, type: 'square', gain: 0.1, attack: 0.004, glide: 250 });
      },
      click: (now, tone, arg, noise) => {
        tone({ freq: 480, at: now, dur: 0.05, type: 'sine', gain: 0.12, attack: 0.002 });
        noise({ at: now, dur: 0.02, type: 'highpass', freq: 4000, gain: 0.04, attack: 0.001 });
      },
      deny: (now, tone) => {
        tone({ freq: 220, at: now, dur: 0.1, type: 'square', gain: 0.08, attack: 0.003, glide: 160 });
      },
    },
  });
})();

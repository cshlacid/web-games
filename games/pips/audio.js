'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 도미노를 내려놓는 게임이라 놓는 소리는 음높이보다 "딸깍"이 먼저다 — 짧은 잡음 같은 사각파
// 둘을 겹쳐 패가 판에 닿는 느낌을 낸다. 곡은 느린 왈츠 베이스에 마림바 같은 짧은 음을 얹는다.
(function () {
  const BPM = 96;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_BAR = 6;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const BARS = [
    { bass: 45, notes: [69, 72, 76] },
    { bass: 41, notes: [69, 72, 77] },
    { bass: 43, notes: [67, 71, 74] },
    { bass: 40, notes: [67, 71, 76] },
  ];

  window.PipsSound = window.createGameAudio({
    storageKey: 'web-games.pips.sound',
    bgmLevel: 0.6,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: BARS.length * STEPS_PER_BAR,

    scheduleStep(index, at, tone) {
      const bar = BARS[Math.floor(index / STEPS_PER_BAR) % BARS.length];
      const beat = index % STEPS_PER_BAR;
      if (beat === 0) tone({ freq: midi(bar.bass), at, dur: STEP * 4, type: 'triangle', gain: 0.11, attack: 0.02 });
      if (beat === 2 || beat === 4) {
        tone({ freq: midi(bar.notes[(index >> 1) % 3]), at, dur: STEP * 0.7, type: 'sine', gain: 0.035, attack: 0.005 });
      }
    },

    sfx: {
      place(now, tone) {
        tone({ freq: 210, at: now, dur: 0.05, type: 'square', gain: 0.05, attack: 0.002 });
        tone({ freq: 640, at: now + 0.012, dur: 0.06, type: 'triangle', gain: 0.07, attack: 0.002 });
      },
      pick(now, tone) {
        tone({ freq: 520, at: now, dur: 0.05, type: 'triangle', gain: 0.06, attack: 0.003 });
      },
      rotate(now, tone) {
        tone({ freq: 900, at: now, dur: 0.035, type: 'triangle', gain: 0.05, attack: 0.002 });
      },
      conflict(now, tone) {
        tone({ freq: 155, at: now, dur: 0.14, type: 'square', gain: 0.06, attack: 0.004 });
      },
      hint(now, tone) {
        tone({ freq: 880, at: now, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.006 });
        tone({ freq: 1175, at: now + 0.08, dur: 0.16, type: 'sine', gain: 0.06, attack: 0.006 });
      },
      win(now, tone) {
        [523, 659, 784, 988, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.08, dur: 0.7, type: 'sine', gain: 0.14, attack: 0.008 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

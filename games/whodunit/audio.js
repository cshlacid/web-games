'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 추리물이라 곡은 단조의 느린 베이스와 드문드문 떨어지는 높은 음으로 긴장만 깔아 둔다.
// 밝힐 때의 소리는 무고와 범인을 귀로도 가르게 한다 — 무고는 위로 오르는 두 음, 범인은
// 낮게 떨어지는 한 음.
(function () {
  const BPM = 72;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_BAR = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const BARS = [
    { bass: 45, high: 76 },
    { bass: 41, high: 72 },
    { bass: 43, high: 74 },
    { bass: 40, high: 71 },
  ];

  window.WhodunitSound = window.createGameAudio({
    storageKey: 'web-games.whodunit.sound',
    bgmLevel: 0.55,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: BARS.length * STEPS_PER_BAR,

    scheduleStep(index, at, tone) {
      const bar = BARS[Math.floor(index / STEPS_PER_BAR) % BARS.length];
      const beat = index % STEPS_PER_BAR;
      if (beat === 0) tone({ freq: midi(bar.bass), at, dur: STEP * 6, type: 'triangle', gain: 0.1, attack: 0.03 });
      if (beat === 5) tone({ freq: midi(bar.high), at, dur: STEP * 1.2, type: 'sine', gain: 0.03, attack: 0.01 });
    },

    sfx: {
      innocent(now, tone) {
        tone({ freq: 660, at: now, dur: 0.1, type: 'sine', gain: 0.09, attack: 0.004 });
        tone({ freq: 880, at: now + 0.08, dur: 0.16, type: 'sine', gain: 0.08, attack: 0.004 });
      },
      criminal(now, tone) {
        tone({ freq: 196, at: now, dur: 0.3, type: 'triangle', gain: 0.13, attack: 0.004 });
        tone({ freq: 147, at: now + 0.05, dur: 0.3, type: 'sine', gain: 0.08, attack: 0.004 });
      },
      open(now, tone) {
        tone({ freq: 420, at: now, dur: 0.08, type: 'sine', gain: 0.06, attack: 0.004 });
      },
      wrong(now, tone) {
        tone({ freq: 155, at: now, dur: 0.18, type: 'square', gain: 0.06, attack: 0.004 });
      },
      select(now, tone) {
        tone({ freq: 1200, at: now, dur: 0.03, type: 'triangle', gain: 0.04, attack: 0.002 });
      },
      hint(now, tone) {
        tone({ freq: 880, at: now, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.006 });
        tone({ freq: 1175, at: now + 0.08, dur: 0.16, type: 'sine', gain: 0.06, attack: 0.006 });
      },
      win(now, tone) {
        [440, 554, 659, 880].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.1, dur: 0.8, type: 'sine', gain: 0.13, attack: 0.008 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

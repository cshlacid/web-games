'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 전구를 켜는 게임이라 전구 소리는 밝고 짧은 두 음으로, 곡은 높은 자리에서 반짝이는
// 음을 성기게 흩는다 — 다른 퍼즐이 낮은 패드와 드론을 쓰는 것과 겹치지 않게.
(function () {
  const BPM = 92;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_BAR = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const BARS = [
    { bass: 48, sparkle: [79, 76, 72] },
    { bass: 45, sparkle: [76, 72, 69] },
    { bass: 41, sparkle: [77, 72, 69] },
    { bass: 43, sparkle: [79, 74, 71] },
  ];

  window.LightUpSound = window.createGameAudio({
    storageKey: 'web-games.lightup.sound',
    bgmLevel: 0.6,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: BARS.length * STEPS_PER_BAR,

    scheduleStep(index, at, tone) {
      const bar = BARS[Math.floor(index / STEPS_PER_BAR) % BARS.length];
      const beat = index % STEPS_PER_BAR;
      if (beat === 0) {
        tone({ freq: midi(bar.bass), at, dur: STEP * 7, type: 'triangle', gain: 0.11, attack: 0.05 });
      }
      if (beat === 1 || beat === 4 || beat === 6) {
        const note = bar.sparkle[[1, 4, 6].indexOf(beat)];
        tone({ freq: midi(note), at, dur: STEP * 1.6, type: 'sine', gain: 0.035, attack: 0.01 });
      }
    },

    sfx: {
      bulb(now, tone) {
        tone({ freq: 988, at: now, dur: 0.08, type: 'sine', gain: 0.08, attack: 0.004 });
        tone({ freq: 1319, at: now + 0.05, dur: 0.12, type: 'sine', gain: 0.06, attack: 0.004 });
      },
      clash(now, tone) {
        tone({ freq: 150, at: now, dur: 0.12, type: 'square', gain: 0.06, attack: 0.004 });
      },
      dot(now, tone) {
        tone({ freq: 520, at: now, dur: 0.04, type: 'sine', gain: 0.05, attack: 0.003 });
      },
      erase(now, tone) {
        tone({ freq: 260, at: now, dur: 0.05, type: 'sine', gain: 0.05, attack: 0.004 });
      },
      hint(now, tone) {
        tone({ freq: 880, at: now, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.006 });
        tone({ freq: 1175, at: now + 0.08, dur: 0.16, type: 'sine', gain: 0.06, attack: 0.006 });
      },
      win(now, tone) {
        [523, 659, 784, 1047, 1319].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.08, dur: 0.7, type: 'sine', gain: 0.14, attack: 0.008 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

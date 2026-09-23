'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 바다를 칠하는 게임이라 칠하는 소리에 물기를 준다 — 짧은 잡음을 낮은 쪽으로 걸러
// 파도 끝처럼 들리게 한다. 곡은 느린 6/8 흔들림에 낮은 음만 두어 판을 오래 들여다보는
// 동안 귀가 지치지 않게 한다.
(function () {
  const BPM = 66;
  const STEP = 60 / BPM / 3;
  const STEPS_PER_BAR = 6;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const BARS = [
    { bass: 38, notes: [62, 65, 69] },
    { bass: 36, notes: [60, 64, 67] },
    { bass: 41, notes: [60, 65, 69] },
    { bass: 43, notes: [62, 67, 71] },
  ];

  window.NurikabeSound = window.createGameAudio({
    storageKey: 'web-games.nurikabe.sound',
    bgmLevel: 0.65,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: BARS.length * STEPS_PER_BAR,

    scheduleStep(index, at, tone, noise) {
      const bar = BARS[Math.floor(index / STEPS_PER_BAR) % BARS.length];
      const beat = index % STEPS_PER_BAR;
      if (beat === 0) {
        tone({ freq: midi(bar.bass), at, dur: STEP * 5.5, type: 'triangle', gain: 0.12, attack: 0.08 });
        noise({ at, dur: STEP * 3, gain: 0.012, type: 'lowpass', freq: 500, q: 0.7 });
      }
      if (beat === 0 || beat === 2 || beat === 4) {
        const note = bar.notes[beat / 2];
        tone({ freq: midi(note), at, dur: STEP * 2.2, type: 'sine', gain: 0.04, attack: 0.03 });
      }
    },

    sfx: {
      sea(now, tone, arg, noise) {
        noise({ at: now, dur: 0.07, gain: 0.07, type: 'lowpass', freq: 900, q: 0.8 });
        tone({ freq: 196, at: now, dur: 0.06, type: 'sine', gain: 0.05, attack: 0.004 });
      },
      dot(now, tone) {
        tone({ freq: 740, at: now, dur: 0.05, type: 'sine', gain: 0.06, attack: 0.004 });
      },
      erase(now, tone) {
        tone({ freq: 260, at: now, dur: 0.05, type: 'sine', gain: 0.05, attack: 0.004 });
      },
      hint(now, tone) {
        tone({ freq: 880, at: now, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.006 });
        tone({ freq: 1175, at: now + 0.08, dur: 0.16, type: 'sine', gain: 0.06, attack: 0.006 });
      },
      win(now, tone) {
        [392, 494, 587, 784].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.1, dur: 0.7, type: 'sine', gain: 0.16, attack: 0.008 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

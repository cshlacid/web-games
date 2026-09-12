'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 주사위를 굴리는 놀이라 효과음은 나무 위에 구르는 소리를 흉내 냈다 — 짧은 잡음을
// 두 번 튕기고 끝을 낮은 음으로 받는다. 곡은 그 사이를 비워 두려고 성기게 짰다.
(function () {
  const BPM = 84;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 45, pad: [57, 64, 69] },
    { bass: 48, pad: [60, 67, 72] },
    { bass: 43, pad: [55, 62, 67] },
    { bass: 41, pad: [53, 60, 65] },
  ];

  window.DiceSound = window.createGameAudio({
    storageKey: 'web-games.dicewars.sound',
    bgmLevel: 0.8,
    sfxLevel: 0.8,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone, noise) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 6, type: 'triangle', gain: 0.16, attack: 0.06 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 7, type: 'sine', gain: 0.07, attack: 0.9 });
        }
      }
      // 네 박에 한 번 나무를 두드리는 소리. 차례가 도는 느낌을 준다.
      if (beat === 4) {
        noise({ at, dur: 0.07, gain: 0.05, type: 'bandpass', freq: 1600, q: 2 });
      }
    },

    sfx: {
      // 이겼을 때(내 공격이 통했을 때). arg로 크기를 줄여 상대 차례에는 작게 낸다.
      win(now, tone, scale = 1, noise) {
        noise({ at: now, dur: 0.09, gain: 0.18 * scale, type: 'bandpass', freq: 2200, q: 1.2 });
        noise({ at: now + 0.08, dur: 0.07, gain: 0.12 * scale, type: 'bandpass', freq: 1500, q: 1.2 });
        tone({ freq: 523, at: now + 0.14, dur: 0.3, type: 'sine', gain: 0.16 * scale, attack: 0.006 });
        tone({ freq: 784, at: now + 0.2, dur: 0.3, type: 'sine', gain: 0.12 * scale, attack: 0.006 });
      },

      // 막혔을 때. 같은 굴림 소리 뒤에 낮은 음으로 받는다.
      fail(now, tone, scale = 1, noise) {
        noise({ at: now, dur: 0.09, gain: 0.16 * scale, type: 'bandpass', freq: 2000, q: 1.2 });
        noise({ at: now + 0.08, dur: 0.07, gain: 0.1 * scale, type: 'bandpass', freq: 1200, q: 1.2 });
        tone({ freq: 262, at: now + 0.14, dur: 0.34, type: 'triangle', gain: 0.14 * scale, attack: 0.008 });
      },

      // 차례를 넘길 때 받는 보급.
      turn(now, tone) {
        [392, 523].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.08, dur: 0.26, type: 'sine', gain: 0.13, attack: 0.006 });
        });
      },

      victory(now, tone) {
        [523, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.1, dur: 0.7, type: 'sine', gain: 0.19, attack: 0.01 });
        });
      },
      defeat(now, tone) {
        [392, 330, 262, 196].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.13, dur: 0.8, type: 'triangle', gain: 0.15, attack: 0.02 });
        });
      },

      click(now, tone) {
        tone({ freq: 660, at: now, dur: 0.05, type: 'sine', gain: 0.1, attack: 0.004 });
      },
    },
  });
})();

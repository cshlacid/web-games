'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 굴리는 사이가 비어 있는 놀이라 곡은 성기게, 효과음은 나무 위에 주사위가 구르는 소리로
// 맞췄다. 주사위 소리는 짧은 잡음을 여러 번 튕겨 만든다.
(function () {
  const BPM = 92;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 46, pad: [58, 65, 70] },
    { bass: 51, pad: [63, 67, 70] },
    { bass: 44, pad: [56, 63, 68] },
    { bass: 49, pad: [61, 65, 68] },
  ];

  window.YachtSound = window.createGameAudio({
    storageKey: 'web-games.yacht.sound',
    bgmLevel: 0.75,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone, noise) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 6, type: 'triangle', gain: 0.15, attack: 0.05 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 7, type: 'sine', gain: 0.06, attack: 0.9 });
        }
      }
      if (beat === 4) {
        noise({ at, dur: 0.06, gain: 0.04, type: 'bandpass', freq: 1800, q: 2 });
      }
    },

    sfx: {
      // 주사위가 구르는 소리. 굴리기 시작할 때 한 번 낸다.
      roll(now, tone, scale = 1, noise) {
        for (let i = 0; i < 5; i++) {
          noise({
            at: now + i * 0.055, dur: 0.05, gain: (0.13 - i * 0.015) * scale,
            type: 'bandpass', freq: 2400 - i * 220, q: 1.4,
          });
        }
      },

      // 주사위를 잡거나 놓을 때.
      keep(now, tone) {
        tone({ freq: 740, at: now, dur: 0.05, type: 'sine', gain: 0.1, attack: 0.004 });
      },

      // 점수를 적을 때. 점수가 붙으면 높게, 0점이면 낮게 — 방금 무엇을 했는지 소리로도 안다.
      write(now, tone, got = 1) {
        const notes = got ? [523, 784] : [330, 262];
        notes.forEach((freq, i) => {
          tone({ freq, at: now + i * 0.07, dur: 0.24, type: 'sine', gain: 0.14, attack: 0.006 });
        });
      },

      bonus(now, tone) {
        [659, 784, 988].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.09, dur: 0.5, type: 'sine', gain: 0.16, attack: 0.008 });
        });
      },

      finish(now, tone) {
        [523, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.11, dur: 0.7, type: 'sine', gain: 0.18, attack: 0.01 });
        });
      },

      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

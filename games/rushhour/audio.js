'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 차가 미끄러지는 소리를 짧은 잡음으로, 막힌 소리를 둔탁한 낮은 음으로 냈다. 곡은
// 오래 들여다보는 놀이라 성기게 두고 낮은 자리에서만 움직인다.
(function () {
  const BPM = 76;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 40, pad: [55, 59, 64] },
    { bass: 45, pad: [57, 60, 64] },
    { bass: 43, pad: [55, 58, 62] },
    { bass: 38, pad: [53, 57, 62] },
  ];

  window.RushSound = window.createGameAudio({
    storageKey: 'web-games.rushhour.sound',
    bgmLevel: 0.7,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone, noise) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 7, type: 'triangle', gain: 0.14, attack: 0.07 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.05, attack: 1.0 });
        }
      }
      if (beat === 6) {
        noise({ at, dur: 0.05, gain: 0.03, type: 'bandpass', freq: 1200, q: 2 });
      }
    },

    sfx: {
      // 차가 미끄러지는 소리. 옮긴 칸 수를 받아 길이를 늘린다.
      slide(now, tone, far = 1, noise) {
        const dur = Math.min(0.22, 0.07 + far * 0.04);
        noise({ at: now, dur, gain: 0.1, type: 'bandpass', freq: 900, q: 1.1 });
        tone({ freq: 210 + far * 20, at: now, dur: dur * 0.9, type: 'triangle', gain: 0.05, attack: 0.01 });
      },
      // 막혀서 못 갈 때.
      stuck(now, tone) {
        tone({ freq: 120, at: now, dur: 0.1, type: 'square', gain: 0.07, attack: 0.004 });
      },
      win(now, tone) {
        [392, 523, 659, 784].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.1, dur: 0.7, type: 'sine', gain: 0.17, attack: 0.008 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

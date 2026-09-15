'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 판이 도는 동안 계속 깔리는 곡이라 낮은 자리에서 성기게 두었다. 웨이브가 오는
// 것을 소리로 먼저 알리려고 북을 넷에 한 번만 친다.
(function () {
  const BPM = 92;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 38, pad: [53, 57, 60] },
    { bass: 41, pad: [53, 57, 60] },
    { bass: 36, pad: [51, 55, 60] },
    { bass: 43, pad: [55, 58, 62] },
  ];

  window.DefenseSound = window.createGameAudio({
    storageKey: 'web-games.defense.sound',
    bgmLevel: 0.6,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone, noise) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;
      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 6, type: 'triangle', gain: 0.13, attack: 0.05 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.04, attack: 0.9 });
        }
      }
      if (beat === 4) noise({ at, dur: 0.06, gain: 0.035, type: 'bandpass', freq: 260, q: 1.4 });
    },

    sfx: {
      // 사격. 종류마다 음높이를 달리해 무엇이 쏘는지 귀로도 갈린다.
      shot(now, tone, pitch = 660) {
        tone({ freq: pitch, at: now, dur: 0.05, type: 'square', gain: 0.045, attack: 0.003 });
      },
      kill(now, tone, _a, noise) {
        noise({ at: now, dur: 0.07, gain: 0.06, type: 'bandpass', freq: 1400, q: 1.2 });
      },
      // 사람을 세울 때의 둔탁한 착지음.
      place(now, tone) {
        tone({ freq: 180, at: now, dur: 0.12, type: 'triangle', gain: 0.1, attack: 0.005 });
        tone({ freq: 360, at: now + 0.03, dur: 0.08, type: 'sine', gain: 0.06, attack: 0.004 });
      },
      // 사람이 부서질 때. 낮게 깔아 새는 것과 구별한다.
      down(now, tone, _a, noise) {
        noise({ at: now, dur: 0.22, gain: 0.1, type: 'lowpass', freq: 700, q: 0.8 });
        tone({ freq: 110, at: now, dur: 0.2, type: 'square', gain: 0.07, attack: 0.004 });
      },
      // 적이 출구를 지날 때. 이 소리는 반드시 알아차려야 해서 가장 크다.
      leak(now, tone) {
        tone({ freq: 320, at: now, dur: 0.3, type: 'sawtooth', gain: 0.12, attack: 0.006, glide: 160 });
      },
      wave(now, tone) {
        [294, 392].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.11, dur: 0.32, type: 'triangle', gain: 0.1, attack: 0.006 });
        });
      },
      win(now, tone) {
        [392, 523, 659, 784].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.1, dur: 0.7, type: 'sine', gain: 0.16, attack: 0.008 });
        });
      },
      lose(now, tone) {
        [330, 262, 196].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.16, dur: 0.6, type: 'triangle', gain: 0.13, attack: 0.01 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.08, attack: 0.004 });
      },
    },
  });
})();

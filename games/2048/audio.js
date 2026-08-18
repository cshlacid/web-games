'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
(function () {
  const BPM = 88;
  const STEP = 60 / BPM / 2; // 8분음표
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Am - F - G - Em. 자리를 많이 차지하지 않도록 완만한 진행을 골랐다.
  const CHORDS = [
    { pad: [57, 60, 64], bass: 45, arp: [69, 72, 76, 72] },
    { pad: [53, 57, 60], bass: 41, arp: [65, 69, 72, 69] },
    { pad: [55, 59, 62], bass: 43, arp: [67, 71, 74, 71] },
    { pad: [52, 55, 59], bass: 40, arp: [64, 67, 71, 67] },
  ];

  window.Game2048Sound = window.createGameAudio({
    storageKey: 'web-games.2048.sound',
    bgmLevel: 0.92,
    sfxLevel: 0.72,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.13, attack: 0.5 });
        }
        tone({ freq: midi(chord.bass), at, dur: STEP * 4, type: 'triangle', gain: 0.24, attack: 0.02 });
      }
      if (beat % 2 === 0) {
        const note = chord.arp[(beat / 2) % chord.arp.length];
        tone({ freq: midi(note), at, dur: STEP * 1.6, type: 'triangle', gain: 0.12 });
      }
    },

    sfx: {
      move(now, tone) {
        tone({ freq: 220, glide: 160, at: now, dur: 0.08, type: 'triangle', gain: 0.20 });
      },
      merge(now, tone, value) {
        // 큰 수가 합쳐질수록 높은 음이 나게 해서 진행이 귀로도 느껴지게 한다.
        const rank = Math.min(Math.max(Math.log2(value) - 2, 0), 9);
        const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
        const base = 60 + scale[Math.round(rank)];
        tone({ freq: midi(base), at: now, dur: 0.24, type: 'triangle', gain: 0.38, attack: 0.008 });
        tone({ freq: midi(base + 12), at: now + 0.04, dur: 0.18, type: 'sine', gain: 0.20 });
      },
      win(now, tone) {
        [60, 64, 67, 72].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.11, dur: 0.4, type: 'triangle', gain: 0.34 });
        });
      },
      gameOver(now, tone) {
        [57, 53, 48].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.16, dur: 0.5, type: 'sine', gain: 0.34 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.22 });
      },
    },
  });
})();

'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 걸음은 아주 짧고 여린 소리로 둔다 — 한 판에 백 걸음을 넘게 걸으므로 조금만 커도
// 귀가 먼저 지친다. 상자를 미는 소리만 무게를 싣고, 목표에 올렸을 때는 음을 달아
// 판을 보지 않아도 하나 끝낸 것을 알게 한다.
(function () {
  const BPM = 72;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 41, pad: [57, 60, 64] },
    { bass: 38, pad: [57, 62, 65] },
    { bass: 43, pad: [55, 59, 62] },
    { bass: 36, pad: [55, 60, 64] },
  ];

  window.SokobanSound = window.createGameAudio({
    storageKey: 'web-games.sokoban.sound',
    bgmLevel: 0.7,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 7, type: 'triangle', gain: 0.13, attack: 0.08 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.045, attack: 1.1 });
        }
      }
      if (beat === 3 || beat === 6) {
        tone({ freq: midi(chord.pad[beat === 3 ? 2 : 1] + 12), at, dur: STEP * 1.5, type: 'sine', gain: 0.035, attack: 0.02 });
      }
    },

    sfx: {
      step(now, tone) {
        tone({ freq: 330, at: now, dur: 0.035, type: 'sine', gain: 0.035, attack: 0.003 });
      },
      // 상자가 바닥에 끌리는 소리.
      push(now, tone, arg, noise) {
        noise({ at: now, dur: 0.09, gain: 0.09, type: 'lowpass', freq: 700, q: 0.8 });
        tone({ freq: 140, at: now, dur: 0.08, type: 'triangle', gain: 0.06, attack: 0.005 });
      },
      // 상자가 목표에 올라갔을 때.
      goal(now, tone) {
        tone({ freq: 659, at: now, dur: 0.18, type: 'sine', gain: 0.12, attack: 0.005 });
        tone({ freq: 988, at: now + 0.06, dur: 0.22, type: 'sine', gain: 0.09, attack: 0.005 });
      },
      // 벽이나 못 미는 상자에 막혔을 때.
      bump(now, tone) {
        tone({ freq: 110, at: now, dur: 0.08, type: 'square', gain: 0.05, attack: 0.004 });
      },
      win(now, tone) {
        [440, 554, 659, 880].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.1, dur: 0.7, type: 'sine', gain: 0.17, attack: 0.008 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

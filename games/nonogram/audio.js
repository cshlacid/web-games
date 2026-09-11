'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 오래 들여다보는 놀이라 곡은 음을 성기게 두고 낮은 자리에서 움직인다. 칸을 칠하는
// 소리는 아주 짧게 — 한 판에 수백 번 나므로 조금만 길어도 시끄럽다.
(function () {
  const BPM = 68;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 45, pad: [60, 64, 69] },
    { bass: 50, pad: [62, 65, 69] },
    { bass: 43, pad: [59, 62, 67] },
    { bass: 48, pad: [60, 64, 67] },
  ];

  window.NonoSound = window.createGameAudio({
    storageKey: 'web-games.nonogram.sound',
    bgmLevel: 0.7,
    sfxLevel: 0.8,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 7, type: 'triangle', gain: 0.13, attack: 0.08 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.055, attack: 1.1 });
        }
      }
      if (beat === 5) {
        tone({ freq: midi(chord.pad[2] + 12), at, dur: STEP * 2, type: 'sine', gain: 0.04, attack: 0.3 });
      }
    },

    sfx: {
      // 칸을 칠할 때. 끌면 잇달아 나므로 짧고 낮게.
      fill(now, tone) {
        tone({ freq: 440, at: now, dur: 0.035, type: 'sine', gain: 0.075, attack: 0.003 });
      },
      // 가위표를 칠 때. 칠하기와 갈리게 한 음 위로.
      mark(now, tone) {
        tone({ freq: 620, at: now, dur: 0.03, type: 'triangle', gain: 0.06, attack: 0.003 });
      },
      erase(now, tone) {
        tone({ freq: 300, at: now, dur: 0.035, type: 'sine', gain: 0.06, attack: 0.003 });
      },
      // 한 줄을 맞췄을 때. 이 게임의 작은 성취라 따로 소리를 준다.
      line(now, tone) {
        [784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.055, dur: 0.2, type: 'sine', gain: 0.09, attack: 0.005 });
        });
      },
      win(now, tone) {
        [523, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.11, dur: 0.75, type: 'sine', gain: 0.17, attack: 0.01 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 한 판을 오래 붙들고 있는 게임이라 셋 중 가장 느리고 성기게 짰다.
(function () {
  const BPM = 60;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Cmaj7 - Am7 - Fmaj7 - G6. 긴장이 쌓이지 않고 제자리로 돌아오는 진행이라
  // 오래 틀어둬도 재촉하는 느낌이 없다.
  const CHORDS = [
    { pad: [60, 64, 67], bass: 36, arp: [72, 76, 79] },
    { pad: [57, 60, 64], bass: 33, arp: [69, 72, 76] },
    { pad: [57, 60, 65], bass: 29, arp: [69, 72, 77] },
    { pad: [59, 62, 67], bass: 31, arp: [71, 74, 79] },
  ];

  // 숫자를 놓을 때 음높이가 숫자를 따라간다. 눌린 숫자가 귀로도 구분돼서 오타를
  // 알아채기 쉽다.
  const DIGIT_NOTES = [0, 60, 62, 64, 65, 67, 69, 71, 72, 74];

  window.SudokuSound = window.createGameAudio({
    storageKey: 'web-games.sudoku.sound',
    bgmLevel: 0.95,
    sfxLevel: 0.72,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 9, type: 'sine', gain: 0.12, attack: 1.1 });
        }
        tone({ freq: midi(chord.bass), at, dur: STEP * 6, type: 'triangle', gain: 0.22, attack: 0.05 });
      }
      // 아르페지오는 네 스텝에 한 번만. 더 잦으면 배경이 아니라 박자로 들린다.
      if (beat % 4 === 0) {
        const note = chord.arp[(beat / 4) % chord.arp.length];
        tone({ freq: midi(note), at, dur: STEP * 4, type: 'sine', gain: 0.10, attack: 0.02 });
      }
    },

    sfx: {
      place(now, tone, digit) {
        tone({ freq: midi(DIGIT_NOTES[digit] || 60), at: now, dur: 0.14, type: 'triangle', gain: 0.24 });
      },
      // 연필은 확정이 아니므로 더 짧고 여리게. 소리로도 무게가 달라야 한다.
      pencil(now, tone) {
        tone({ freq: 880, at: now, dur: 0.04, type: 'sine', gain: 0.10 });
      },
      erase(now, tone) {
        tone({ freq: 320, glide: 230, at: now, dur: 0.07, type: 'triangle', gain: 0.14 });
      },
      undo(now, tone) {
        tone({ freq: 300, glide: 420, at: now, dur: 0.09, type: 'sine', gain: 0.16 });
      },
      conflict(now, tone) {
        tone({ freq: 155, at: now, dur: 0.18, type: 'square', gain: 0.10 });
        tone({ freq: 146, at: now + 0.02, dur: 0.18, type: 'square', gain: 0.10 });
      },
      hint(now, tone) {
        tone({ freq: midi(72), at: now, dur: 0.3, type: 'sine', gain: 0.24 });
        tone({ freq: midi(79), at: now + 0.09, dur: 0.34, type: 'sine', gain: 0.20 });
      },
      win(now, tone) {
        [60, 64, 67, 72, 76, 79].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.11, dur: 0.6, type: 'triangle', gain: 0.30 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.20 });
      },
    },
  });
})();

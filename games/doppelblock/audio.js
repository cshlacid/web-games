'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 네 번째 게임이라 곡이 서로 구별돼야 한다. 스도쿠와 성격이 비슷하지만 4도
// 쌓기(sus) 화음을 써서 덜 해결된, 열린 소리로 잡았다.
(function () {
  const BPM = 56;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { pad: [62, 64, 69], bass: 38, arp: [74, 76, 81] },
    { pad: [57, 62, 64], bass: 33, arp: [69, 74, 76] },
    { pad: [60, 65, 67], bass: 29, arp: [72, 77, 79] },
    { pad: [59, 62, 67], bass: 31, arp: [71, 74, 79] },
  ];

  // 숫자를 놓을 때 음높이가 숫자를 따라간다. 판 크기에 따라 쓰는 숫자가 1~2에서
  // 1~4까지 달라지므로, 없는 숫자까지 미리 채워 둔다.
  const DIGIT_NOTES = [0, 60, 64, 67, 72, 76, 79];

  window.DoppelSound = window.createGameAudio({
    storageKey: 'web-games.doppelblock.sound',
    bgmLevel: 0.95,
    sfxLevel: 0.72,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 9, type: 'sine', gain: 0.12, attack: 1.2 });
        }
        tone({ freq: midi(chord.bass), at, dur: STEP * 6, type: 'triangle', gain: 0.22, attack: 0.06 });
      }
      // 네 스텝에 한 번만. 더 잦으면 배경이 아니라 박자로 들린다.
      if (beat % 4 === 0) {
        const note = chord.arp[(beat / 4) % chord.arp.length];
        tone({ freq: midi(note), at, dur: STEP * 4, type: 'sine', gain: 0.10, attack: 0.03 });
      }
    },

    sfx: {
      digit(now, tone, value) {
        tone({ freq: midi(DIGIT_NOTES[value] || 60), at: now, dur: 0.14, type: 'triangle', gain: 0.24 });
      },
      // 검은 칸은 이 퍼즐에서 가장 중요한 수라 숫자와 확실히 다른 소리를 준다.
      block(now, tone) {
        tone({ freq: 130, glide: 98, at: now, dur: 0.16, type: 'triangle', gain: 0.30, attack: 0.004 });
        tone({ freq: 65, at: now, dur: 0.18, type: 'sine', gain: 0.20 });
      },
      pencil(now, tone) {
        tone({ freq: 880, at: now, dur: 0.04, type: 'sine', gain: 0.10 });
      },
      erase(now, tone) {
        tone({ freq: 320, glide: 230, at: now, dur: 0.07, type: 'triangle', gain: 0.14 });
      },
      undo(now, tone) {
        tone({ freq: 300, glide: 420, at: now, dur: 0.09, type: 'sine', gain: 0.16 });
      },
      // 줄 하나가 완성돼 단서가 초록으로 바뀌는 순간. 이 퍼즐에서 눈에 보이는
      // 진척이 이것뿐이라 소리로도 표시한다.
      lineDone(now, tone) {
        [72, 76, 79].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.055, dur: 0.34, type: 'sine', gain: 0.22 });
        });
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
        [62, 66, 69, 74, 78, 81].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.11, dur: 0.6, type: 'triangle', gain: 0.30 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.20 });
      },
    },
  });
})();

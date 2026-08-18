'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 2048과 곡을 공유하지 않는 이유: 생각하며 오래 보는 게임이라 훨씬 느리고 성겨야 한다.
(function () {
  const BPM = 72;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Dm7 - G7 - Cmaj7 - Am7. 해결되는 진행이라 배경에 깔아둬도 긴장을 만들지 않는다.
  const CHORDS = [
    { pad: [62, 65, 69], bass: 38, arp: [74, 77, 81, 77] },
    { pad: [59, 62, 67], bass: 43, arp: [71, 74, 79, 74] },
    { pad: [60, 64, 67], bass: 36, arp: [72, 76, 79, 76] },
    { pad: [60, 64, 69], bass: 45, arp: [72, 76, 81, 76] },
  ];

  window.KkodleSound = window.createGameAudio({
    storageKey: 'web-games.kkodle.sound',
    bgmLevel: 1.04,
    sfxLevel: 0.72,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.11, attack: 0.7 });
        }
        tone({ freq: midi(chord.bass), at, dur: STEP * 5, type: 'triangle', gain: 0.20, attack: 0.03 });
      }
      if (beat % 2 === 0) {
        const note = chord.arp[(beat / 2) % chord.arp.length];
        // 종처럼 길게 남기고 여리게 친다. 짧게 끊으면 배경이 아니라 신호로 들린다.
        tone({ freq: midi(note), at, dur: STEP * 3, type: 'sine', gain: 0.10, attack: 0.01 });
      }
    },

    sfx: {
      // 자모 하나마다 울리므로 가장 짧고 여려야 한다. 길면 금방 피곤해진다.
      key(now, tone) {
        tone({ freq: 660, at: now, dur: 0.05, type: 'sine', gain: 0.14 });
      },
      back(now, tone) {
        tone({ freq: 300, glide: 220, at: now, dur: 0.06, type: 'triangle', gain: 0.13 });
      },
      invalid(now, tone) {
        tone({ freq: 150, at: now, dur: 0.16, type: 'square', gain: 0.09 });
        tone({ freq: 142, at: now + 0.02, dur: 0.16, type: 'square', gain: 0.09 });
      },
      /** 판정 공개. 글자마다 맞은 정도를 음높이로 들려준다. */
      reveal(now, tone, scores) {
        const scale = [60, 64, 67, 72]; // 0~3개 맞음
        scores.forEach((score, i) => {
          tone({ freq: midi(scale[Math.min(score, 3)]), at: now + i * 0.13, dur: 0.3, type: 'triangle', gain: 0.26 });
        });
      },
      win(now, tone) {
        [60, 64, 67, 72, 76].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.1, dur: 0.5, type: 'triangle', gain: 0.30 });
        });
      },
      lose(now, tone) {
        [62, 58, 53].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.18, dur: 0.6, type: 'sine', gain: 0.30 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.20 });
      },
    },
  });
})();

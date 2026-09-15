'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 다리를 하나씩 놓아 가는 놀이라 소리도 하나씩 얹히는 쪽으로 짰다. 곡은 4음만 도는
// 느린 아르페지오이고, 다리를 놓을 때 나는 소리가 그 위에 화음으로 앉는다.
(function () {
  const BPM = 60;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 45, arp: [69, 76, 81, 76] },
    { bass: 43, arp: [67, 74, 79, 74] },
    { bass: 41, arp: [65, 72, 77, 72] },
    { bass: 40, arp: [64, 71, 76, 71] },
  ];

  window.HashiSound = window.createGameAudio({
    storageKey: 'web-games.hashi.sound',
    bgmLevel: 0.85,
    sfxLevel: 0.75,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 7, type: 'sine', gain: 0.17, attack: 0.8 });
      }
      // 두 박에 한 음씩. 다리를 놓는 소리가 들어올 자리를 비워 둔다.
      if (beat % 2 === 0) {
        const note = chord.arp[(beat / 2) % chord.arp.length];
        tone({ freq: midi(note), at, dur: STEP * 1.8, type: 'sine', gain: 0.085, attack: 0.02 });
      }
    },

    sfx: {
      // 다리를 놓을 때. arg가 2면 두 번째 다리라 한 음 위에서 난다.
      place(now, tone, n = 1) {
        const base = n === 2 ? 587 : 440;
        tone({ freq: base, at: now, dur: 0.22, type: 'sine', gain: 0.16, attack: 0.005 });
        tone({ freq: base * 1.5, at: now + 0.02, dur: 0.18, type: 'sine', gain: 0.09, attack: 0.005 });
      },

      // 지울 때. 놓을 때를 뒤집어 내려가게 한다.
      erase(now, tone) {
        tone({ freq: 392, at: now, dur: 0.16, type: 'triangle', gain: 0.12, attack: 0.004, glide: 262 });
      },

      hint(now, tone) {
        [659, 784].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.07, dur: 0.26, type: 'sine', gain: 0.13, attack: 0.006 });
        });
      },

      win(now, tone) {
        [523, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.1, dur: 0.7, type: 'sine', gain: 0.19, attack: 0.01 });
        });
      },

      click(now, tone) {
        tone({ freq: 660, at: now, dur: 0.05, type: 'sine', gain: 0.1, attack: 0.004 });
      },
    },
  });
})();

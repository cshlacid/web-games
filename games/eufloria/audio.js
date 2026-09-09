'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 이 게임은 손을 놓고 지켜보는 시간이 길다. 앞의 퍼즐들처럼 박자가 또렷하면 그
// 기다림이 재촉처럼 들려서, 여기서는 박을 거의 지우고 아주 느린 화음만 겹쳐 둔다.
// 위에 얹는 음은 화음이 바뀌는 자리에만 하나씩 떨어진다.
(function () {
  const BPM = 48;
  const STEP = 60 / BPM;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Dm9 – Bb maj9 – F maj9 – Am9. 자리바꿈을 좁게 두어 화음이 바뀌어도 덩어리가
  // 움직이지 않는다.
  const CHORDS = [
    { bass: 38, pad: [57, 62, 69, 72], top: 81 },
    { bass: 34, pad: [58, 62, 65, 72], top: 77 },
    { bass: 41, pad: [57, 60, 65, 72], top: 79 },
    { bass: 33, pad: [55, 60, 64, 71], top: 76 },
  ];

  window.EufloriaSound = window.createGameAudio({
    storageKey: 'web-games.eufloria.sound',
    bgmLevel: 0.85,
    sfxLevel: 0.75,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 8, type: 'sine', gain: 0.18, attack: 1.2 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8.5, type: 'sine', gain: 0.075, attack: 2.0 });
        }
      }

      // 화음 한가운데에 떨어지는 한 음. 박자를 세는 소리가 아니라 화음이 바뀌고
      // 있다는 표시다.
      if (beat === 4) {
        tone({ freq: midi(chord.top), at, dur: STEP * 3, type: 'triangle', gain: 0.07, attack: 0.4 });
      }
    },

    sfx: {
      // 씨앗을 보낼 때. 짧게 올라가는 소리로 "떠났다"를 알린다.
      send(now, tone) {
        tone({ freq: 520, at: now, dur: 0.16, type: 'triangle', gain: 0.16, attack: 0.005, glide: 760 });
      },

      // 나무를 심을 때. arg가 있으면 방어 나무라 한 옥타브 아래로 두툼하게 낸다.
      plant(now, tone, defense) {
        const base = defense ? 196 : 294;
        tone({ freq: base, at: now, dur: 0.5, type: 'sine', gain: 0.18, attack: 0.01 });
        tone({ freq: base * 1.5, at: now + 0.06, dur: 0.45, type: 'sine', gain: 0.12, attack: 0.01 });
      },

      // 나무가 부서질 때. 음정 없는 소리라 화음을 건드리지 않는다.
      fell(now, tone, arg, noise) {
        noise({ at: now, dur: 0.24, gain: 0.16, type: 'bandpass', freq: 900, q: 0.8, glide: 260 });
      },

      // 소행성을 얻을 때와 잃을 때. 같은 음형을 위아래로 뒤집어 둘을 짝으로 만든다.
      take(now, tone) {
        [523, 659, 784].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.07, dur: 0.3, type: 'sine', gain: 0.16, attack: 0.006 });
        });
      },
      lost(now, tone) {
        [392, 330, 262].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.08, dur: 0.34, type: 'triangle', gain: 0.14, attack: 0.006 });
        });
      },

      win(now, tone) {
        [523, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.11, dur: 0.7, type: 'sine', gain: 0.2, attack: 0.01 });
        });
      },
      lose(now, tone) {
        [349, 294, 233, 175].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.14, dur: 0.8, type: 'triangle', gain: 0.16, attack: 0.02 });
        });
      },

      click(now, tone) {
        tone({ freq: 660, at: now, dur: 0.05, type: 'sine', gain: 0.1, attack: 0.004 });
      },
    },
  });
})();

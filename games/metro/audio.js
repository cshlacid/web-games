'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 설계를 붙들고 한참 만지작거리는 게임이라 곡은 앞에 나서지 않는 쪽으로 짰다 —
// 느린 패드 두 음이 겹쳐 있고, 손이 움직일 때 나는 소리가 그 위에 얹힌다.
(function () {
  const BPM = 52;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 16;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 41, pad: [60, 65, 69] },
    { bass: 43, pad: [59, 64, 67] },
    { bass: 38, pad: [57, 62, 65] },
    { bass: 40, pad: [59, 64, 68] },
  ];

  window.MetroSound = window.createGameAudio({
    storageKey: 'web-games.metro.sound',
    bgmLevel: 0.8,
    sfxLevel: 0.8,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 15, type: 'sine', gain: 0.15, attack: 1.2 });
        chord.pad.forEach((n, i) => {
          tone({ freq: midi(n), at: at + i * 0.05, dur: STEP * 14, type: 'sine', gain: 0.055, attack: 1.6 });
        });
      }
      // 여덟 박마다 한 점. 초를 세는 소리라 아주 작게 둔다.
      if (beat === 8) {
        tone({ freq: midi(chord.pad[2] + 12), at, dur: STEP * 2, type: 'sine', gain: 0.045, attack: 0.02 });
      }
    },

    sfx: {
      // 역을 고를 때. 짧고 분명하게.
      select(now, tone) {
        tone({ freq: 523, at: now, dur: 0.12, type: 'sine', gain: 0.14, attack: 0.004 });
      },

      // 선을 잡아 중간점이 생길 때.
      place(now, tone) {
        tone({ freq: 392, at: now, dur: 0.14, type: 'triangle', gain: 0.12, attack: 0.004, glide: 494 });
      },

      // 도로에 달라붙는 순간. 자석이 걸렸다는 것을 손이 아니라 귀로 알려 준다 —
      // 화면의 고리만으로는 손가락에 가려 안 보인다.
      snap(now, tone) {
        tone({ freq: 880, at: now, dur: 0.05, type: 'sine', gain: 0.075, attack: 0.002 });
      },

      erase(now, tone) {
        tone({ freq: 440, at: now, dur: 0.14, type: 'triangle', gain: 0.1, attack: 0.004, glide: 294 });
      },

      // 확정. 한 구간이 실제로 깔린 순간이라 이 게임에서 가장 큰 소리다.
      build(now, tone) {
        [392, 523, 659].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.075, dur: 0.5, type: 'sine', gain: 0.16, attack: 0.008 });
        });
      },

      deny(now, tone) {
        tone({ freq: 233, at: now, dur: 0.18, type: 'triangle', gain: 0.11, attack: 0.004 });
      },
    },
  });
})();

'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 셈을 맞추는 게임이라 숫자를 넣는 소리에 음높이를 준다 — 숫자마다 5음 음계의 한 음을
// 울려, 줄을 채우면 음계가 차오르는 것이 귀에도 들린다. 곡은 가벼운 스윙 베이스에 짧은
// 화음만 얹어 스도쿠의 느린 패드와 갈리게 한다.
(function () {
  const BPM = 100;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_BAR = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // 숫자 1~9에 붙는 음. 5음 음계라 어떤 순서로 넣어도 서로 부딪히지 않는다.
  const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79];

  const BARS = [
    { bass: [43, 50], chord: [59, 62, 67] },
    { bass: [45, 52], chord: [60, 64, 69] },
    { bass: [41, 48], chord: [57, 60, 65] },
    { bass: [43, 50], chord: [59, 62, 65] },
  ];

  window.KenKenSound = window.createGameAudio({
    storageKey: 'web-games.kenken.sound',
    bgmLevel: 0.6,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: BARS.length * STEPS_PER_BAR,

    scheduleStep(index, at, tone) {
      const bar = BARS[Math.floor(index / STEPS_PER_BAR) % BARS.length];
      const beat = index % STEPS_PER_BAR;
      if (beat === 0 || beat === 4) {
        tone({ freq: midi(bar.bass[beat / 4]), at, dur: STEP * 3, type: 'triangle', gain: 0.11, attack: 0.02 });
      }
      if (beat === 2 || beat === 6) {
        for (const note of bar.chord) tone({ freq: midi(note), at, dur: STEP * 0.8, type: 'sine', gain: 0.025, attack: 0.01 });
      }
    },

    sfx: {
      place(now, tone, digit = 1) {
        tone({ freq: midi(SCALE[(digit - 1) % SCALE.length] + 12), at: now, dur: 0.12, type: 'sine', gain: 0.09, attack: 0.004 });
      },
      conflict(now, tone) {
        tone({ freq: 155, at: now, dur: 0.14, type: 'square', gain: 0.06, attack: 0.004 });
      },
      pencil(now, tone) {
        tone({ freq: 1400, at: now, dur: 0.03, type: 'triangle', gain: 0.04, attack: 0.002 });
      },
      erase(now, tone) {
        tone({ freq: 260, at: now, dur: 0.05, type: 'sine', gain: 0.05, attack: 0.004 });
      },
      hint(now, tone) {
        tone({ freq: 880, at: now, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.006 });
        tone({ freq: 1175, at: now + 0.08, dur: 0.16, type: 'sine', gain: 0.06, attack: 0.006 });
      },
      win(now, tone) {
        [523, 587, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.08, dur: 0.7, type: 'sine', gain: 0.14, attack: 0.008 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

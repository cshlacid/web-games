'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 선을 긋는 게임이라 선 하나마다 짧은 음을 낸다. 끌어서 여러 변을 이을 때 음이 조금씩
// 올라가게 해 선이 뻗어 나가는 것이 귀에도 들린다. 곡은 오래 들여다보는 퍼즐이라
// 5음 음계의 느린 아르페지오로 성기게 둔다 — 다른 퍼즐의 패드·오스티나토·드론과 겹치지 않게.
(function () {
  const BPM = 84;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_BAR = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // 마디마다 아르페지오 네 음과 베이스.
  const BARS = [
    { bass: 45, notes: [64, 69, 72, 76] },
    { bass: 41, notes: [65, 69, 72, 77] },
    { bass: 43, notes: [62, 67, 71, 74] },
    { bass: 40, notes: [64, 67, 71, 76] },
  ];

  window.SlitherSound = window.createGameAudio({
    storageKey: 'web-games.slitherlink.sound',
    bgmLevel: 0.65,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: BARS.length * STEPS_PER_BAR,

    scheduleStep(index, at, tone) {
      const bar = BARS[Math.floor(index / STEPS_PER_BAR) % BARS.length];
      const beat = index % STEPS_PER_BAR;
      if (beat === 0) {
        tone({ freq: midi(bar.bass), at, dur: STEP * 7.5, type: 'triangle', gain: 0.12, attack: 0.06 });
      }
      if (beat % 2 === 0) {
        const note = bar.notes[(beat / 2) % bar.notes.length];
        tone({ freq: midi(note), at, dur: STEP * 2.4, type: 'sine', gain: 0.045, attack: 0.02 });
      }
    },

    sfx: {
      // 선 하나. 끄는 동안 이어지는 선은 반음씩 올린다(`arg`가 몇 번째인지).
      line(now, tone, n = 0) {
        tone({ freq: midi(76 + Math.min(n, 12)), at: now, dur: 0.07, type: 'sine', gain: 0.07, attack: 0.004 });
      },
      cross(now, tone) {
        tone({ freq: 330, at: now, dur: 0.05, type: 'triangle', gain: 0.05, attack: 0.004 });
      },
      erase(now, tone) {
        tone({ freq: 240, at: now, dur: 0.06, type: 'sine', gain: 0.05, attack: 0.004 });
      },
      hint(now, tone) {
        tone({ freq: 880, at: now, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.006 });
        tone({ freq: 1175, at: now + 0.08, dur: 0.16, type: 'sine', gain: 0.06, attack: 0.006 });
      },
      win(now, tone) {
        [523, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.09, dur: 0.7, type: 'sine', gain: 0.16, attack: 0.008 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 });
      },
    },
  });
})();

'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 아홉 번째 게임이라 앞의 것들과 구별돼야 한다. 스도쿠·더블블록이 느린 패드,
// 한붓그리기가 쉬지 않고 구르는 오스티나토, 왕관 놓기가 3박에 드론이라면 이쪽은
// **뜯는 소리로 짧게 끊어 놓는다.** 천을 한 땀씩 꿰매는 게임이라 소리도 한 땀씩
// 놓이는 편이 맞고, 앞의 넷이 전부 이어지는 소리라 끊는 것만으로 구별된다.
(function () {
  const BPM = 84;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_BAR = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // F 리디안 계열. 4도가 올라가 있어 밝지만 해결되지 않아, 오래 틀어도 곡이
  // 끝나려 들지 않는다.
  const BARS = [
    { bass: 41, stitch: [65, 72, 69, 77] },
    { bass: 43, stitch: [67, 74, 71, 79] },
    { bass: 36, stitch: [64, 72, 67, 76] },
    { bass: 38, stitch: [65, 69, 72, 74] },
  ];

  window.PatchesSound = window.createGameAudio({
    storageKey: 'web-games.patches.sound',
    bgmLevel: 0.85,
    sfxLevel: 0.8,
    step: STEP,
    stepsPerLoop: BARS.length * STEPS_PER_BAR,

    scheduleStep(index, at, tone) {
      const bar = BARS[Math.floor(index / STEPS_PER_BAR) % BARS.length];
      const beat = index % STEPS_PER_BAR;

      // 베이스는 1박과 3박에만. 사이를 비워야 뜯는 소리가 들린다.
      if (beat === 0 || beat === 4) {
        tone({ freq: midi(bar.bass), at, dur: STEP * 1.4, type: 'triangle', gain: 0.20, attack: 0.012 });
      }

      // 한 땀. 홀수 박을 비워 두 땀이 붙었다 떨어졌다 한다.
      if (beat % 2 === 1) {
        const note = bar.stitch[(beat - 1) / 2 % bar.stitch.length];
        tone({ freq: midi(note), at, dur: STEP * 0.7, type: 'sine', gain: 0.11, attack: 0.004 });
      }
    },

    sfx: {
      // 조각을 놓을 때. 넓을수록 낮게 울려 몇 칸을 덮었는지가 소리로도 들린다.
      draw(now, tone, area = 1) {
        const scale = [0, 79, 76, 74, 72, 71, 69, 67, 65, 64];
        const note = scale[Math.min(scale.length - 1, Math.max(1, area))];
        tone({ freq: midi(note), at: now, dur: 0.20, type: 'triangle', gain: 0.20, attack: 0.004 });
        tone({ freq: midi(note - 12), at: now, dur: 0.26, type: 'sine', gain: 0.12, attack: 0.006 });
      },
      // 규칙을 어긴 조각. 반음을 부딪혀 "틀렸다"를 말로 하지 않고 알린다.
      wrong(now, tone) {
        tone({ freq: midi(61), at: now, dur: 0.18, type: 'triangle', gain: 0.16 });
        tone({ freq: midi(62), at: now, dur: 0.18, type: 'triangle', gain: 0.13 });
      },
      erase(now, tone) {
        tone({ freq: 430, glide: 280, at: now, dur: 0.13, type: 'triangle', gain: 0.14 });
      },
      hint(now, tone) {
        tone({ freq: midi(69), at: now, dur: 0.24, type: 'sine', gain: 0.20 });
        tone({ freq: midi(76), at: now + 0.08, dur: 0.28, type: 'sine', gain: 0.16 });
        tone({ freq: midi(81), at: now + 0.16, dur: 0.32, type: 'sine', gain: 0.13 });
      },
      win(now, tone) {
        [65, 69, 72, 77, 81, 84].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.085, dur: 0.66, type: 'triangle', gain: 0.24 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.18 });
      },
    },
  });
})();

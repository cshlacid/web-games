'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 이 게임은 시간이 주 단위로 툭툭 끊기고, 플레이어는 판을 오래 들여다보며 어디를
// 고칠지 고른다. 그래서 박자를 앞세우지 않고 **느린 화음 위에 낮은 맥박 하나**만
// 얹었다 — 도시가 돌아가는 소리 정도로 들리게 두고, 사건은 효과음이 말한다.
(function () {
  const BPM = 58;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 38, pad: [57, 62, 65] },
    { bass: 43, pad: [59, 62, 67] },
    { bass: 41, pad: [57, 60, 65] },
    { bass: 36, pad: [55, 60, 64] },
  ];

  window.RoadSound = window.createGameAudio({
    storageKey: 'web-games.roadworks.sound',
    bgmLevel: 0.85,
    sfxLevel: 0.75,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 7, type: 'triangle', gain: 0.18, attack: 0.06 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.085, attack: 1.2 });
        }
      }
      // 낮은 맥박. 네 박에 한 번만 짚어 재촉하는 느낌을 주지 않는다.
      if (beat === 4) {
        tone({ freq: midi(chord.bass + 12), at, dur: STEP * 2, type: 'sine', gain: 0.09, attack: 0.02 });
      }
    },

    sfx: {
      // 도구를 고르거나 목록을 짚을 때. 가볍고 짧게.
      pick(now, tone) {
        tone({ freq: midi(76), at: now, dur: 0.07, type: 'sine', gain: 0.12, attack: 0.003 });
      },
      // 공사. 땅을 파는 소리라 잡음을 짧게 얹고 음을 올려 "생겼다"로 맺는다.
      build(now, tone, arg, noise) {
        noise({ at: now, dur: 0.13, gain: 0.16, freq: 900, q: 0.9 });
        tone({ freq: midi(57), glide: midi(64), at: now, dur: 0.22, type: 'triangle', gain: 0.18 });
      },
      // 신호 시간 조정. 공사가 아니라 손잡이를 돌리는 일이라 두 음으로 짧게.
      tune(now, tone) {
        tone({ freq: midi(71), at: now, dur: 0.09, type: 'square', gain: 0.07 });
        tone({ freq: midi(78), at: now + 0.09, dur: 0.11, type: 'square', gain: 0.07 });
      },
      // 할 수 없는 자리. 낮고 둔한 소리 하나로 끝낸다.
      deny(now, tone) {
        tone({ freq: 150, glide: 110, at: now, dur: 0.14, type: 'sawtooth', gain: 0.1 });
      },
      // 한 주가 지났다. 조용한 주에는 이 소리만 난다.
      week(now, tone) {
        tone({ freq: midi(64), at: now, dur: 0.2, type: 'sine', gain: 0.14 });
        tone({ freq: midi(71), at: now + 0.1, dur: 0.24, type: 'sine', gain: 0.11 });
      },
      // 새 민원. 내려가는 두 음이라 좋은 소식과 헷갈리지 않는다.
      complaint(now, tone) {
        tone({ freq: midi(69), at: now, dur: 0.16, type: 'triangle', gain: 0.16 });
        tone({ freq: midi(63), at: now + 0.13, dur: 0.26, type: 'triangle', gain: 0.16 });
      },
      // 민원이 풀렸다. 올라가는 세 음.
      solved(now, tone) {
        [67, 71, 76].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.08, dur: 0.22, type: 'sine', gain: 0.15 });
        });
      },
      over(now, tone) {
        [62, 58, 55, 50].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.16, dur: 0.5, type: 'triangle', gain: 0.17, attack: 0.01 });
        });
      },
    },
  });
})();

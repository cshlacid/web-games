'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 다섯 번째 게임이라 곡이 앞의 것들과 구별돼야 한다. 이 게임은 선을 끊지 않고
// 계속 끌고 가는 놀이라, 화음을 길게 깔고 그 위에 5음계 오스티나토를 쉬지 않고
// 굴린다 — 스도쿠·더블블록의 느린 패드와 달리 계속 움직이는 소리를 만든다.
(function () {
  const BPM = 72;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const CHORDS = [
    { bass: 40, pad: [59, 64, 67], run: [76, 79, 83, 79] },
    { bass: 45, pad: [57, 64, 69], run: [81, 76, 79, 76] },
    { bass: 43, pad: [59, 62, 67], run: [74, 79, 83, 79] },
    { bass: 38, pad: [57, 62, 66], run: [78, 74, 81, 74] },
  ];

  window.ZipSound = window.createGameAudio({
    storageKey: 'web-games.zip.sound',
    bgmLevel: 0.9,
    sfxLevel: 0.75,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 7, type: 'triangle', gain: 0.20, attack: 0.05 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.10, attack: 1.0 });
        }
      }

      // 오스티나토. 홀수 박에만 놓아 8분음표가 쉬지 않고 이어지는 대신 조금 성기게
      // 들리게 한다.
      if (beat % 2 === 0) {
        const note = chord.run[(beat / 2) % chord.run.length];
        tone({ freq: midi(note), at, dur: STEP * 1.6, type: 'sine', gain: 0.13, attack: 0.008 });
      }
    },

    sfx: {
      // 한 칸 나아갈 때. 판을 채워 갈수록 음이 올라가 진척이 소리로도 들린다.
      // arg는 0~1 사이의 진행 비율이다.
      step(now, tone, ratio = 0) {
        const scale = [62, 64, 67, 69, 71, 74, 76, 79, 81, 83, 86];
        const note = scale[Math.min(scale.length - 1, Math.round(ratio * (scale.length - 1)))];
        tone({ freq: midi(note), at: now, dur: 0.13, type: 'sine', gain: 0.16, attack: 0.004 });
      },
      // 되짚어 지울 때. 나아갈 때와 반대로 음을 떨어뜨린다.
      back(now, tone) {
        tone({ freq: 420, glide: 300, at: now, dur: 0.12, type: 'triangle', gain: 0.14 });
      },
      hint(now, tone) {
        tone({ freq: midi(74), at: now, dur: 0.28, type: 'sine', gain: 0.22 });
        tone({ freq: midi(81), at: now + 0.09, dur: 0.32, type: 'sine', gain: 0.18 });
      },
      win(now, tone) {
        [64, 69, 76, 81, 88].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.1, dur: 0.62, type: 'triangle', gain: 0.28 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.20 });
      },
    },
  });
})();

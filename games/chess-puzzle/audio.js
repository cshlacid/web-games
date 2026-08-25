'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 한 수를 오래 들여다보는 게임이라 스도쿠 쪽에 가깝게 느리고 성기게 짰다.
(function () {
  const BPM = 52;
  const STEP = 60 / BPM / 2;
  // 화음이 바뀌는 간격보다 소리의 길이가 길어야 다음 화음과 겹쳐서 이어진다.
  // 8스텝으로 두었더니 화음 사이가 거의 비어 다른 게임보다 네 배쯤 조용했다.
  //
  // 화음 사이가 잦아드는 것 자체는 다섯 게임이 다 그렇다(공유 오디오의 음 하나가
  // 지수적으로 감쇠한다). 없애려 들지 않고 최대·중앙값이 다른 게임과 같은 대에
  // 오도록만 맞췄다 — 이 게임만 유독 크거나 작지 않게 하는 것이 목적이다.
  const STEPS_PER_CHORD = 6;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Dm - B♭maj7 - Fmaj7 - Csus. 단조로 시작해 밝은 쪽으로 풀린다 — 막혔다가
  // 수가 보이는 이 게임의 리듬과 맞다.
  const CHORDS = [
    { pad: [62, 65, 69], bass: 38 },
    { pad: [58, 62, 65], bass: 34 },
    { pad: [57, 60, 65], bass: 29 },
    { pad: [60, 65, 67], bass: 36 },
  ];

  window.ChessSound = window.createGameAudio({
    storageKey: 'web-games.chess-puzzle.sound',
    bgmLevel: 0.8,
    sfxLevel: 0.7,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.17, attack: 1.0 });
        }
        tone({ freq: midi(chord.bass), at, dur: STEP * 7, type: 'triangle', gain: 0.26, attack: 0.06 });
      }
      // 박을 다 채우면 초읽기처럼 들려서 생각을 방해한다. 넷째 박에만 하나 둔다.
      if (beat === 3) {
        tone({ freq: midi(chord.pad[2] + 12), at, dur: STEP * 3, type: 'sine', gain: 0.08, attack: 0.02 });
      }
    },

    sfx: {
      // 말을 내려놓는 소리. 짧고 낮게 떨어뜨려 나무 판 느낌을 낸다.
      move: (now, tone) => {
        tone({ freq: 260, at: now, dur: 0.09, type: 'triangle', gain: 0.3, attack: 0.002, glide: 170 });
      },
      // 잡을 때는 한 겹 더 얹어 "부딪히는" 쪽으로 민다.
      capture: (now, tone) => {
        tone({ freq: 200, at: now, dur: 0.12, type: 'square', gain: 0.16, attack: 0.002, glide: 120 });
        tone({ freq: 330, at: now, dur: 0.07, type: 'triangle', gain: 0.2, attack: 0.002, glide: 220 });
      },
      // 체크는 올라가는 두 음. 위험 신호지만 오답음과 헷갈리면 안 되므로 상행이다.
      check: (now, tone) => {
        tone({ freq: 520, at: now, dur: 0.1, type: 'sine', gain: 0.22, attack: 0.004 });
        tone({ freq: 700, at: now + 0.09, dur: 0.14, type: 'sine', gain: 0.22, attack: 0.004 });
      },
      wrong: (now, tone) => {
        tone({ freq: 190, at: now, dur: 0.2, type: 'sawtooth', gain: 0.13, attack: 0.004, glide: 120 });
      },
      hint: (now, tone) => {
        tone({ freq: 660, at: now, dur: 0.16, type: 'sine', gain: 0.16, attack: 0.01, glide: 880 });
      },
      // 풀었을 때. 3도씩 쌓아 올려 끝났다는 느낌을 준다.
      solved: (now, tone) => {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.1, dur: 0.4, type: 'sine', gain: 0.2, attack: 0.01 });
        });
      },
      click: (now, tone) => {
        tone({ freq: 440, at: now, dur: 0.05, type: 'sine', gain: 0.12, attack: 0.002 });
      },
    },
  });
})();

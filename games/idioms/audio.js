'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 열여덟 번째 게임이라 앞의 것들과 구별돼야 한다. 앞선 퍼즐들이 서양 음계의 화음을
// 깔았다면 이쪽은 **다섯 음만 쓰고 화음을 쌓지 않는다.** 성어를 다루는 판이라
// 가락도 그쪽에 어울리는 편이 맞고, 화음이 없으면 소리가 성글어 글자를 읽는 동안
// 귀를 붙들지 않는다.
(function () {
  const BPM = 52;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_BAR = 8;
  const BARS = 4;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // 다섯 음(황–태–중–림–남에 해당하는 자리). 반음이 없어 어느 둘을 겹쳐도
  // 부딪히지 않으므로, 가락을 아무 데서 끊어도 어색해지지 않는다.
  const SCALE = [62, 64, 67, 69, 71, 74, 76, 79, 81, 83, 86];
  const LINES = [
    [74, 71, 69, 67, 69, 71, 74, 76],
    [71, 69, 67, 64, 62, 64, 67, 69],
    [74, 76, 79, 76, 74, 71, 69, 71],
    [67, 69, 71, 74, 71, 69, 67, 62],
  ];

  window.IdiomsSound = window.createGameAudio({
    storageKey: 'web-games.idioms.sound',
    bgmLevel: 0.85,
    sfxLevel: 0.8,
    step: STEP,
    stepsPerLoop: BARS * STEPS_PER_BAR,

    scheduleStep(index, at, tone) {
      const bar = Math.floor(index / STEPS_PER_BAR) % BARS;
      const beat = index % STEPS_PER_BAR;

      // 바닥음은 두 마디에 한 번만 짚는다. 계속 깔면 다섯 음의 성근 맛이 없어진다.
      if (beat === 0 && bar % 2 === 0) {
        tone({ freq: midi(50), at, dur: STEP * STEPS_PER_BAR * 1.8, type: 'sine', gain: 0.1, attack: 0.9 });
      }

      // 가락은 홀수 칸을 비워 둔다. 뜯는 소리 사이의 빈자리가 국악의 장단처럼
      // 들리고, 글자를 읽는 동안 소리가 비집고 들어오지 않는다.
      if (beat % 2 === 1) return;
      const note = LINES[bar][beat];
      const strong = beat === 0 || beat === 4;
      tone({
        freq: midi(note), at,
        dur: STEP * (strong ? 3.2 : 1.8), type: 'triangle',
        gain: strong ? 0.1 : 0.062, attack: 0.006,
      });
    },

    sfx: {
      // 길을 한 칸씩 이을 때. 네 칸이 다섯 음 중 넷을 차례로 밟아 올라간다.
      step(now, tone, at = 0) {
        const note = SCALE[Math.min(SCALE.length - 1, 3 + at * 2)];
        tone({ freq: midi(note), at: now, dur: 0.14, type: 'triangle', gain: 0.15, attack: 0.004 });
      },
      // 성어를 찾았을 때. 다섯 음을 훑어 올려 "맞았다"를 말로 하지 않고 알린다.
      found(now, tone) {
        [74, 79, 83, 86].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.06, dur: 0.34, type: 'sine', gain: 0.17, attack: 0.004 });
        });
      },
      // 성어가 아닐 때. 음을 떨어뜨리되 부딪히는 화음은 쓰지 않는다 — 틀린 것이
      // 아니라 "그건 아니다"에 가깝다.
      wrong(now, tone) {
        tone({ freq: midi(69), glide: midi(62), at: now, dur: 0.18, type: 'triangle', gain: 0.14 });
      },
      erase(now, tone) {
        tone({ freq: 420, glide: 280, at: now, dur: 0.12, type: 'triangle', gain: 0.12 });
      },
      hint(now, tone) {
        [67, 74, 79].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.08, dur: 0.3, type: 'sine', gain: 0.16 });
        });
      },
      win(now, tone) {
        [62, 67, 74, 79, 86].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.1, dur: 0.8, type: 'sine', gain: 0.22 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.18 });
      },
    },
  });
})();

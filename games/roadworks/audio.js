'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 시계가 끊기지 않고 흐르는 화면이라 **박자를 세지 않는 소리**를 깔았다. 느린 화음
// 둘이 번갈아 겹치기만 하고 맥박이 없다 — 차가 도는 것을 보는 중에 박자가 들어오면
// 그 박자에 맞춰 무언가 일어날 것 같아진다.
(function () {
  const STEP = 0.75;
  const CHORDS = [
    [45, 57, 64, 69],
    [43, 55, 62, 67],
    [40, 52, 59, 65],
    [41, 53, 60, 67],
  ];
  const HOLD = 8;   // 화음 하나가 머무는 스텝 수

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  window.RoadSound = window.createGameAudio({
    storageKey: 'web-games.roadworks.sound',
    bgmLevel: 0.8,
    sfxLevel: 0.7,
    step: STEP,
    stepsPerLoop: CHORDS.length * HOLD,

    scheduleStep(index, at, tone) {
      if (index % HOLD !== 0) return;
      const chord = CHORDS[Math.floor(index / HOLD) % CHORDS.length];
      chord.forEach((note, i) => {
        // 음마다 조금씩 늦게 들어오게 해 화음이 한 덩어리로 툭 나타나지 않게 한다.
        tone({
          freq: midi(note),
          at: at + i * 0.12,
          dur: STEP * HOLD,
          type: i === 0 ? 'triangle' : 'sine',
          gain: i === 0 ? 0.16 : 0.07,
          attack: 1.6,
        });
      });
    },

    sfx: {
      click(now, tone) {
        tone({ freq: midi(74), at: now, dur: 0.08, type: 'sine', gain: 0.12, attack: 0.003 });
      },
      // 교차로에 무언가를 놓을 때. 올라가는 두 음.
      place(now, tone) {
        tone({ freq: midi(69), at: now, dur: 0.1, type: 'triangle', gain: 0.13 });
        tone({ freq: midi(76), at: now + 0.08, dur: 0.16, type: 'triangle', gain: 0.12 });
      },
      // 거둘 때. 내려가는 두 음.
      clear(now, tone) {
        tone({ freq: midi(74), at: now, dur: 0.1, type: 'triangle', gain: 0.12 });
        tone({ freq: midi(67), at: now + 0.08, dur: 0.16, type: 'triangle', gain: 0.11 });
      },
    },
  });
})();

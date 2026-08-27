'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 실시간 전투라 다른 게임보다 빠르고, 박자가 있어야 손이 따라 움직인다.
(function () {
  const BPM = 96;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Am - F - C - G. 흔한 진행을 고른 것은, 전투 중에 곡이 귀에 걸리면
  // 안 되기 때문이다. 들리되 신경이 가지 않아야 한다.
  const CHORDS = [
    { pad: [57, 60, 64], bass: 33 },
    { pad: [53, 57, 60], bass: 29 },
    { pad: [52, 55, 60], bass: 36 },
    { pad: [55, 59, 62], bass: 31 },
  ];

  window.HealerSound = window.createGameAudio({
    storageKey: 'web-games.healer.sound',
    bgmLevel: 0.75,
    sfxLevel: 0.75,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;

      if (beat === 0) {
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 9, type: 'sine', gain: 0.14, attack: 0.5 });
        }
      }
      // 베이스를 짝수 박마다 두어 걸음처럼 들리게 한다. 전투가 흐르고 있다는 신호다.
      if (beat % 4 === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 3, type: 'triangle', gain: 0.24, attack: 0.02 });
      }
      // 위쪽 반짝임. 힐러가 주인공인 게임이라 밝은 쪽으로 기울였다.
      if (beat === 6) {
        tone({ freq: midi(chord.pad[2] + 12), at, dur: STEP * 2, type: 'sine', gain: 0.07, attack: 0.01 });
      }
    },

    sfx: {
      // 힐. 올라가는 음이라야 회복으로 읽힌다.
      heal: (now, tone) => {
        tone({ freq: 620, at: now, dur: 0.16, type: 'sine', gain: 0.16, attack: 0.006, glide: 930 });
      },
      // 범위 힐은 같은 성격에 한 겹 더. 개별 힐과 구분되되 같은 계열로 들려야 한다.
      area: (now, tone) => {
        tone({ freq: 520, at: now, dur: 0.26, type: 'sine', gain: 0.15, attack: 0.01, glide: 780 });
        tone({ freq: 780, at: now + 0.06, dur: 0.24, type: 'sine', gain: 0.1, attack: 0.01, glide: 1170 });
      },
      // 장판이 깔리는 소리. 낮게 퍼지는 쪽으로.
      zone: (now, tone) => {
        tone({ freq: 300, at: now, dur: 0.4, type: 'triangle', gain: 0.14, attack: 0.06, glide: 450 });
      },
      // 공격 스킬. 힐과 헷갈리면 안 되므로 내려가는 음에 거친 파형을 쓴다.
      strike: (now, tone) => {
        tone({ freq: 420, at: now, dur: 0.18, type: 'sawtooth', gain: 0.12, attack: 0.004, glide: 190 });
      },
      mana: (now, tone) => {
        tone({ freq: 380, at: now, dur: 0.3, type: 'sine', gain: 0.16, attack: 0.02, glide: 760 });
      },
      // 아군이 쓰러졌을 때. 곡보다 낮게 깔아 놓쳐도 눈에 띄게 한다.
      down: (now, tone) => {
        tone({ freq: 200, at: now, dur: 0.5, type: 'sawtooth', gain: 0.16, attack: 0.01, glide: 90 });
      },
      // 다음 무리 등장.
      wave: (now, tone) => {
        tone({ freq: 160, at: now, dur: 0.35, type: 'square', gain: 0.1, attack: 0.02, glide: 220 });
      },
      win: (now, tone) => {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.11, dur: 0.42, type: 'sine', gain: 0.2, attack: 0.01 });
        });
      },
      lose: (now, tone) => {
        [392, 349.23, 293.66].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.17, dur: 0.5, type: 'triangle', gain: 0.18, attack: 0.02 });
        });
      },
      // 주인공이 위험하다. 두 번 두드리는 낮은 음이라 곡에 섞이지 않고, 힐
      // (올라가는 음)과도 헷갈리지 않는다.
      danger: (now, tone) => {
        tone({ freq: 330, at: now, dur: 0.12, type: 'square', gain: 0.1, attack: 0.004, glide: 250 });
        tone({ freq: 330, at: now + 0.16, dur: 0.12, type: 'square', gain: 0.1, attack: 0.004, glide: 250 });
      },
      click: (now, tone) => {
        tone({ freq: 480, at: now, dur: 0.05, type: 'sine', gain: 0.12, attack: 0.002 });
      },
      deny: (now, tone) => {
        tone({ freq: 220, at: now, dur: 0.1, type: 'square', gain: 0.08, attack: 0.003, glide: 160 });
      },
    },
  });
})();

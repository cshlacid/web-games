'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 마법이 초당 몇 번씩 터지는 게임이라 곡은 낮고 성기게 깔았다. 위를 비워 둬야
// 시전음이 묻히지 않는다.
(function () {
  const BPM = 78;
  const STEP = 60 / BPM / 2;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // 라단조. 마지막 화음을 장조로 올려 한 바퀴마다 긴장이 되돌아오게 했다.
  const CHORDS = [
    { bass: 45, pad: [57, 60, 64], arp: [69, 72, 76, 72] },
    { bass: 41, pad: [57, 60, 65], arp: [69, 72, 77, 72] },
    { bass: 43, pad: [55, 59, 62], arp: [67, 71, 74, 71] },
    { bass: 40, pad: [56, 59, 64], arp: [68, 71, 76, 71] },
  ];

  // 원소마다 시전음의 결을 달리한다. 화면을 안 보고도 무엇이 나갔는지 귀로 갈린다.
  const CAST = {
    fire(now, tone, noise) {
      noise({ at: now, dur: 0.16, gain: 0.05, type: 'bandpass', freq: 900, q: 0.8, glide: 2400 });
      tone({ freq: 220, at: now, dur: 0.1, type: 'triangle', gain: 0.04, glide: 330 });
    },
    water(now, tone) {
      tone({ freq: 1180, at: now, dur: 0.12, type: 'sine', gain: 0.05, glide: 1560 });
      tone({ freq: 1760, at: now + 0.02, dur: 0.08, type: 'sine', gain: 0.025 });
    },
    wind(now, tone, noise) {
      noise({ at: now, dur: 0.4, gain: 0.05, type: 'bandpass', freq: 600, q: 2.5, glide: 1800, attack: 0.08 });
    },
    earth(now, tone, noise) {
      tone({ freq: 90, at: now, dur: 0.22, type: 'triangle', gain: 0.12, glide: 55 });
      noise({ at: now, dur: 0.12, gain: 0.05, type: 'lowpass', freq: 500, q: 0.7 });
    },
  };

  window.ArchmageSound = window.createGameAudio({
    storageKey: 'web-games.archmage.sound',
    bgmLevel: 0.55,
    sfxLevel: 0.8,
    step: STEP,
    stepsPerLoop: CHORDS.length * STEPS_PER_CHORD,

    scheduleStep(index, at, tone, noise) {
      const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
      const beat = index % STEPS_PER_CHORD;
      if (beat === 0) {
        tone({ freq: midi(chord.bass), at, dur: STEP * 7, type: 'triangle', gain: 0.12, attack: 0.06 });
        tone({ freq: midi(chord.bass - 12), at, dur: STEP * 7, type: 'sine', gain: 0.08, attack: 0.06 });
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.03, attack: 1.0 });
        }
      }
      // 두 박에 한 번 가는 종소리. 마법진이 도는 느낌을 곡에도 남긴다.
      if (beat % 2 === 1) {
        const note = chord.arp[(beat >> 1) % chord.arp.length];
        tone({ freq: midi(note), at, dur: STEP * 1.6, type: 'sine', gain: 0.018, attack: 0.01 });
      }
      if (beat === 4) noise({ at, dur: 0.08, gain: 0.03, type: 'bandpass', freq: 220, q: 1.4 });
    },

    sfx: {
      cast(now, tone, el, noise) { (CAST[el] || CAST.fire)(now, tone, noise); },
      hit(now, tone, _a, noise) {
        noise({ at: now, dur: 0.05, gain: 0.04, type: 'bandpass', freq: 1800, q: 1.2 });
      },
      kill(now, tone) {
        tone({ freq: 520, at: now, dur: 0.05, type: 'square', gain: 0.02, glide: 260 });
      },
      gem(now, tone, pitch = 0) {
        tone({ freq: 1320 + pitch * 40, at: now, dur: 0.05, type: 'sine', gain: 0.03 });
      },
      level(now, tone) {
        [523, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.07, dur: 0.45, type: 'sine', gain: 0.1 });
        });
      },
      engrave(now, tone) {
        tone({ freq: 392, at: now, dur: 0.3, type: 'triangle', gain: 0.1 });
        tone({ freq: 784, at: now + 0.05, dur: 0.4, type: 'sine', gain: 0.07 });
      },
      discover(now, tone) {
        [784, 988, 1175, 1568].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.06, dur: 0.6, type: 'sine', gain: 0.07 });
        });
      },
      hurt(now, tone, _a, noise) {
        tone({ freq: 160, at: now, dur: 0.14, type: 'sawtooth', gain: 0.07, glide: 90 });
        noise({ at: now, dur: 0.08, gain: 0.05, type: 'lowpass', freq: 900 });
      },
      burst(now, tone) {
        [220, 233].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.18, dur: 0.4, type: 'sawtooth', gain: 0.06 });
        });
      },
      boss(now, tone, _a, noise) {
        tone({ freq: 55, at: now, dur: 1.4, type: 'sawtooth', gain: 0.14, glide: 41, attack: 0.1 });
        tone({ freq: 82, at: now, dur: 1.4, type: 'sawtooth', gain: 0.08, glide: 62, attack: 0.1 });
        noise({ at: now, dur: 1.0, gain: 0.06, type: 'lowpass', freq: 400, attack: 0.2 });
      },
      unlock(now, tone) {
        [440, 554, 659, 880].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.09, dur: 0.6, type: 'triangle', gain: 0.08 });
        });
      },
      won(now, tone) {
        [392, 523, 659, 784, 1047].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.12, dur: 0.9, type: 'sine', gain: 0.14 });
        });
      },
      lost(now, tone) {
        [330, 262, 220, 165].forEach((freq, i) => {
          tone({ freq, at: now + i * 0.2, dur: 0.8, type: 'triangle', gain: 0.12 });
        });
      },
      click(now, tone) {
        tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.07 });
      },
    },
  });
})();

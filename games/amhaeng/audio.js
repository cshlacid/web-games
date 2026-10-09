'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
//
// 장구 장단에 5음 가락을 얹는다. 북 소리는 낮은 사인파(쿵)와 짧은 세모파(덕)로 흉내 내고,
// 장단은 세마치(셋으로 나뉜 한 장단)로 둔다 — 넷으로 끊는 박이면 국악 느낌이 나지 않았다.
// 가락은 해금처럼 들리게 톱니파를 아주 작게, 길게 끈다.
(function () {
  const BPM = 84;
  const STEP = 60 / BPM / 3;
  const STEPS_PER_BAR = 9;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // 평조 느낌의 5음(솔·라·도·레·미).
  const SCALE = [55, 57, 60, 62, 64, 67, 69, 72];
  const PHRASE = [4, -1, 3, 2, -1, 1, 2, -1, -1, 3, -1, 4, 5, -1, 4, 3, -1, -1, 2, -1, 1, 0, -1, -1, 1, -1, 2, 3, -1, 2, 1, -1, -1, 0, -1, -1];

  function drum(tone, at, kind) {
    if (kind === 'deong') {
      tone({ freq: 70, at, dur: 0.28, type: 'sine', gain: 0.16, attack: 0.004 });
      tone({ freq: 900, at, dur: 0.04, type: 'triangle', gain: 0.04, attack: 0.001 });
    } else if (kind === 'kung') {
      tone({ freq: 62, at, dur: 0.24, type: 'sine', gain: 0.14, attack: 0.004 });
    } else {
      tone({ freq: 1100, at, dur: 0.035, type: 'triangle', gain: 0.05, attack: 0.001 });
    }
  }

  // 세마치: 덩 . 덕 | 쿵 . 덕 | 덕 . .
  const BEAT = { 0: 'deong', 2: 'deok', 3: 'kung', 5: 'deok', 6: 'deok' };

  window.AmhaengSound = window.createGameAudio({
    storageKey: 'web-games.amhaeng.sound',
    bgmLevel: 0.55,
    sfxLevel: 0.85,
    step: STEP,
    stepsPerLoop: PHRASE.length * 3,

    scheduleStep(index, at, tone) {
      const beat = index % STEPS_PER_BAR;
      if (BEAT[beat]) drum(tone, at, BEAT[beat]);
      if (index % 3 === 0) {
        const note = PHRASE[(index / 3) % PHRASE.length];
        if (note >= 0) tone({ freq: midi(SCALE[note]), at, dur: STEP * 5, type: 'sawtooth', gain: 0.012, attack: 0.06 });
      }
    },

    sfx: {
      step(now, tone) { tone({ freq: 300, at: now, dur: 0.03, type: 'triangle', gain: 0.04, attack: 0.002 }); },
      queue(now, tone) { tone({ freq: 880, at: now, dur: 0.05, type: 'sine', gain: 0.06, attack: 0.003 }); },
      unleash(now, tone) {
        tone({ freq: 196, at: now, dur: 0.5, type: 'triangle', gain: 0.12, attack: 0.004 });
        tone({ freq: 294, at: now + 0.02, dur: 0.45, type: 'sine', gain: 0.07, attack: 0.004 });
      },
      hit(now, tone) { tone({ freq: 520, at: now, dur: 0.07, type: 'square', gain: 0.05, attack: 0.002 }); },
      kill(now, tone) {
        tone({ freq: 660, at: now, dur: 0.08, type: 'sine', gain: 0.09, attack: 0.003 });
        tone({ freq: 990, at: now + 0.06, dur: 0.12, type: 'sine', gain: 0.07, attack: 0.003 });
      },
      block(now, tone) { tone({ freq: 1400, at: now, dur: 0.05, type: 'triangle', gain: 0.06, attack: 0.001 }); },
      hurt(now, tone) { tone({ freq: 140, at: now, dur: 0.2, type: 'square', gain: 0.07, attack: 0.003 }); },
      swing(now, tone) { tone({ freq: 240, at: now, dur: 0.06, type: 'sawtooth', gain: 0.025, attack: 0.002 }); },
      spawn(now, tone) { drum(tone, now, 'kung'); },
      coin(now, tone) {
        tone({ freq: 1320, at: now, dur: 0.06, type: 'sine', gain: 0.07, attack: 0.002 });
        tone({ freq: 1760, at: now + 0.05, dur: 0.08, type: 'sine', gain: 0.05, attack: 0.002 });
      },
      nope(now, tone) { tone({ freq: 180, at: now, dur: 0.08, type: 'square', gain: 0.04, attack: 0.003 }); },
      win(now, tone) {
        [55, 57, 60, 62, 64, 67].forEach((n, i) => tone({ freq: midi(n + 12), at: now + i * 0.08, dur: 0.6, type: 'sine', gain: 0.11, attack: 0.006 }));
      },
      lose(now, tone) {
        [62, 60, 57, 55].forEach((n, i) => tone({ freq: midi(n), at: now + i * 0.18, dur: 0.5, type: 'triangle', gain: 0.1, attack: 0.01 }));
      },
      click(now, tone) { tone({ freq: 620, at: now, dur: 0.05, type: 'sine', gain: 0.09, attack: 0.004 }); },
    },
  });
})();

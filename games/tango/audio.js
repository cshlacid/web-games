'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 열 번째 게임이라 앞의 것들과 구별돼야 한다. 스도쿠·도펠블록이 느린 패드,
// Zip이 구르는 오스티나토, Queens가 3박에 드론, Patches가 뜯어서 끊는
// 소리라면 이쪽은 **6/8로 흔들리고 화음이 밝은 쪽과 어두운 쪽을 번갈아 간다.**
// 해와 달을 번갈아 놓는 게임이라 곡도 두 자리를 오가는 편이 맞고, 앞의 것들이
// 전부 한 성격으로 쭉 가는 것과 그 점에서 갈린다.
(function () {
  const BPM = 58;
  // 6/8이라 한 박을 셋으로 쪼갠다. 흔들리는 느낌은 이 셋잇단에서 나온다.
  const STEP = 60 / BPM / 3;
  const STEPS_PER_BAR = 6;
  const BARS = 4;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // 같은 자리에서 3음만 장·단으로 갈린다. 밝은 마디와 어두운 마디가 서로
  // 멀어지지 않아야 번갈아 가는 것이 자연스럽다.
  const BARS_PLAN = [
    { root: 45, chord: [57, 64, 69], lead: [76, 81, 79, 76, 72, 74] },   // 밝은 쪽
    { root: 45, chord: [57, 63, 68], lead: [75, 80, 78, 75, 71, 73] },   // 어두운 쪽
    { root: 43, chord: [55, 62, 67], lead: [74, 79, 76, 74, 71, 69] },
    { root: 48, chord: [55, 60, 67], lead: [72, 76, 79, 76, 72, 67] },
  ];

  window.TangoSound = window.createGameAudio({
    storageKey: 'web-games.tango.sound',
    bgmLevel: 0.85,
    sfxLevel: 0.8,
    step: STEP,
    stepsPerLoop: BARS * STEPS_PER_BAR,

    scheduleStep(index, at, tone) {
      const bar = Math.floor(index / STEPS_PER_BAR) % BARS;
      const beat = index % STEPS_PER_BAR;
      const plan = BARS_PLAN[bar];

      if (beat === 0) {
        tone({ freq: midi(plan.root), at, dur: STEP * STEPS_PER_BAR, type: 'sine', gain: 0.12, attack: 0.5 });
        for (const note of plan.chord) {
          tone({ freq: midi(note), at, dur: STEP * STEPS_PER_BAR * 0.95, type: 'triangle', gain: 0.055, attack: 0.5 });
        }
      }

      // 6/8의 무게는 첫 박과 넷째 박에 실린다. 그 둘만 조금 크게 두면 박자를
      // 세지 않아도 흔들리는 것이 들린다.
      const strong = beat === 0 || beat === 3;
      tone({
        freq: midi(plan.lead[beat]), at,
        dur: STEP * (strong ? 2.1 : 1.3), type: 'sine',
        gain: strong ? 0.105 : 0.06, attack: 0.008,
      });
    },

    sfx: {
      // 해를 놓을 때. 위로 열리는 5도.
      sun(now, tone) {
        tone({ freq: midi(76), at: now, dur: 0.24, type: 'sine', gain: 0.20, attack: 0.004 });
        tone({ freq: midi(83), at: now + 0.04, dur: 0.28, type: 'sine', gain: 0.13, attack: 0.004 });
      },
      // 달을 놓을 때. 해와 같은 모양을 한 옥타브 아래에서 낸다 — 둘을 번갈아
      // 놓는 게임이라 소리도 짝으로 들려야 한다.
      moon(now, tone) {
        tone({ freq: midi(64), at: now, dur: 0.26, type: 'triangle', gain: 0.18, attack: 0.004 });
        tone({ freq: midi(71), at: now + 0.04, dur: 0.30, type: 'triangle', gain: 0.12, attack: 0.004 });
      },
      erase(now, tone) {
        tone({ freq: 420, glide: 280, at: now, dur: 0.12, type: 'triangle', gain: 0.13 });
      },
      // 규칙을 어긴 순간. 자동 체크가 켜져 있을 때만 난다.
      clash(now, tone) {
        tone({ freq: midi(61), at: now, dur: 0.20, type: 'triangle', gain: 0.16 });
        tone({ freq: midi(62), at: now, dur: 0.20, type: 'triangle', gain: 0.13 });
      },
      hint(now, tone) {
        tone({ freq: midi(69), at: now, dur: 0.24, type: 'sine', gain: 0.19 });
        tone({ freq: midi(76), at: now + 0.08, dur: 0.28, type: 'sine', gain: 0.16 });
        tone({ freq: midi(81), at: now + 0.16, dur: 0.32, type: 'sine', gain: 0.13 });
      },
      win(now, tone) {
        [57, 64, 69, 76, 81, 88].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.09, dur: 0.7, type: 'sine', gain: 0.23 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.18 });
      },
    },
  });
})();

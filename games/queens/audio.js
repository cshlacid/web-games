'use strict';

// 곡과 효과음만 여기서 정의한다. 컨텍스트·리미터·자동재생 처리는 ../../shared/audio.js.
// 여덟 번째 게임이라 앞의 것들과 구별돼야 한다. 스도쿠·더블블록이 4박 패드,
// 한붓그리기가 쉬지 않고 구르는 오스티나토라면 이쪽은 **3박에 드론**이다.
// 한 수를 놓기 전에 한참 들여다보는 게임이라 박자가 셋으로 도는 편이 재촉하지
// 않고, 낮은 5도를 계속 깔아 두면 화음이 바뀌어도 바닥이 흔들리지 않는다.
(function () {
  const BPM = 66;
  const STEP = 60 / BPM;
  const BEATS = 3;
  const BARS = 4;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // D 도리안. 3음이 단3도라 어둡지만 6음이 장6도라 닫히지 않는다.
  const DRONE = [38, 45];
  const CHORDS = [
    { pad: [57, 62, 65], bell: [74, 81, 77] },
    { pad: [55, 60, 64], bell: [72, 79, 76] },
    { pad: [57, 62, 67], bell: [76, 81, 79] },
    { pad: [53, 60, 65], bell: [72, 77, 74] },
  ];

  window.QueensSound = window.createGameAudio({
    storageKey: 'web-games.queens.sound',
    bgmLevel: 0.85,
    sfxLevel: 0.8,
    step: STEP,
    stepsPerLoop: BARS * BEATS,

    scheduleStep(index, at, tone) {
      const bar = Math.floor(index / BEATS) % BARS;
      const beat = index % BEATS;
      const chord = CHORDS[bar];

      if (index === 0) {
        // 드론은 루프 한 바퀴를 통째로 덮는다. 마디마다 다시 치면 이음매가
        // 들리는데, 바닥에 깔아 두는 소리라 이음매가 가장 거슬린다.
        for (const note of DRONE) {
          tone({ freq: midi(note), at, dur: STEP * BEATS * BARS, type: 'sine', gain: 0.13, attack: 1.6 });
        }
      }

      if (beat === 0) {
        for (const note of chord.pad) {
          tone({ freq: midi(note), at, dur: STEP * BEATS, type: 'triangle', gain: 0.07, attack: 0.6 });
        }
      }

      // 종소리 한 알씩. 박마다 하나뿐이라 소리 사이가 넉넉히 비고, 그 빈자리가
      // 판을 들여다보는 시간이 된다.
      tone({ freq: midi(chord.bell[beat]), at, dur: STEP * 1.9, type: 'sine', gain: 0.11, attack: 0.005 });
    },

    sfx: {
      // X를 찍을 때. 판단이 아니라 메모라서 가장 작고 짧게 둔다.
      mark(now, tone) {
        tone({ freq: 300, at: now, dur: 0.055, type: 'triangle', gain: 0.10 });
      },
      // 왕관을 놓을 때. 5도를 겹쳐 "자리를 정했다"로 들리게 한다.
      crown(now, tone) {
        tone({ freq: midi(74), at: now, dur: 0.30, type: 'sine', gain: 0.22, attack: 0.004 });
        tone({ freq: midi(81), at: now + 0.045, dur: 0.34, type: 'sine', gain: 0.15, attack: 0.004 });
      },
      // 지울 때. 놓을 때와 반대로 음을 떨어뜨린다.
      erase(now, tone) {
        tone({ freq: 430, glide: 290, at: now, dur: 0.12, type: 'triangle', gain: 0.13 });
      },
      // 규칙을 어긴 순간. 자동 체크가 켜져 있을 때만 난다. 화음을 반음으로
      // 부딪혀 "틀렸다"를 말로 하지 않고 알린다.
      clash(now, tone) {
        tone({ freq: midi(61), at: now, dur: 0.20, type: 'triangle', gain: 0.16 });
        tone({ freq: midi(62), at: now, dur: 0.20, type: 'triangle', gain: 0.13 });
      },
      hint(now, tone) {
        tone({ freq: midi(69), at: now, dur: 0.26, type: 'sine', gain: 0.20 });
        tone({ freq: midi(76), at: now + 0.08, dur: 0.30, type: 'sine', gain: 0.17 });
        tone({ freq: midi(81), at: now + 0.16, dur: 0.34, type: 'sine', gain: 0.14 });
      },
      win(now, tone) {
        [62, 69, 74, 78, 81, 86].forEach((note, i) => {
          tone({ freq: midi(note), at: now + i * 0.09, dur: 0.7, type: 'sine', gain: 0.24 });
        });
      },
      click(now, tone) {
        tone({ freq: 520, glide: 660, at: now, dur: 0.09, type: 'sine', gain: 0.18 });
      },
    },
  });
})();

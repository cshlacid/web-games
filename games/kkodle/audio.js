'use strict';

// 2048과 같은 이유로 음원 파일 없이 Web Audio로 합성한다. 다만 곡과 효과음은
// 공유하지 않는다 — 생각하며 오래 보는 게임이라 훨씬 조용하고 성겨야 한다.
(function () {
  const KEY = 'web-games.kkodle.sound';

  const prefs = { bgm: true, sfx: true };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch { /* 저장된 설정이 없거나 접근 불가: 기본값을 쓴다 */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* 무시 */ }
  }

  // 음량은 여기서만 조정한다. 리미터가 뒤를 받치지만 올릴수록 더 자주 눌린다.
  const BGM_LEVEL = 1.04;
  const SFX_LEVEL = 0.72;

  const BPM = 72;
  const STEP = 60 / BPM / 2;
  const LOOKAHEAD = 0.12;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Dm7 - G7 - Cmaj7 - Am7. 해결되는 진행이라 배경에 깔아둬도 긴장을 만들지 않는다.
  const CHORDS = [
    { pad: [62, 65, 69], bass: 38, arp: [74, 77, 81, 77] },
    { pad: [59, 62, 67], bass: 43, arp: [71, 74, 79, 74] },
    { pad: [60, 64, 67], bass: 36, arp: [72, 76, 79, 76] },
    { pad: [60, 64, 69], bass: 45, arp: [72, 76, 81, 76] },
  ];

  let ctx = null;
  let master = null;
  let bgmBus = null;
  let sfxBus = null;
  let timer = null;
  let nextStepTime = 0;
  let step = 0;

  function init() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(limiter);

    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0;
    bgmBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_LEVEL;
    sfxBus.connect(master);

    // 컨텍스트가 언제 열리는지는 브라우저마다 다르다. running이 되는 순간을
    // 직접 듣는 것이 유일하게 확실한 신호다.
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running' && prefs.bgm) startBgm();
    });

    return ctx;
  }

  // 게인이 정확히 0이면 exponentialRamp가 동작하지 않으므로 0.0001에서 시작한다.
  function tone(bus, { freq, at, dur, type = 'sine', gain = 0.2, attack = 0.006, glide }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, at + dur);

    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.03);
  }

  function scheduleStep(index, at) {
    const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length];
    const beat = index % STEPS_PER_CHORD;

    if (beat === 0) {
      for (const note of chord.pad) {
        tone(bgmBus, { freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.11, attack: 0.7 });
      }
      tone(bgmBus, { freq: midi(chord.bass), at, dur: STEP * 5, type: 'triangle', gain: 0.20, attack: 0.03 });
    }

    if (beat % 2 === 0) {
      const note = chord.arp[(beat / 2) % chord.arp.length];
      // 종처럼 길게 남기고 여리게 친다. 짧게 끊으면 배경이 아니라 신호로 들린다.
      tone(bgmBus, { freq: midi(note), at, dur: STEP * 3, type: 'sine', gain: 0.10, attack: 0.01 });
    }
  }

  // setInterval의 흔들림은 음악 타이밍에 쓸 수 없다. 타이머는 예약할 때가
  // 됐는지만 보고, 실제 시각은 ctx.currentTime 기준으로 잡는다.
  function scheduler() {
    if (!ctx) return;
    while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextStepTime);
      nextStepTime += STEP;
      step = (step + 1) % (CHORDS.length * STEPS_PER_CHORD);
    }
  }

  function startBgm() {
    if (!ctx || timer || !prefs.bgm) return;
    nextStepTime = ctx.currentTime + 0.08;
    step = 0;
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bgmBus.gain.exponentialRampToValueAtTime(BGM_LEVEL, ctx.currentTime + 1.4);
    timer = setInterval(scheduler, 25);
    scheduler();
  }

  function stopBgm() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(Math.max(bgmBus.gain.value, 0.0001), ctx.currentTime);
    bgmBus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  }

  const sfx = {
    // 자모 하나마다 울리므로 가장 짧고 여려야 한다. 길면 금방 피곤해진다.
    key() {
      tone(sfxBus, { freq: 660, at: ctx.currentTime, dur: 0.05, type: 'sine', gain: 0.14 });
    },
    back() {
      tone(sfxBus, { freq: 300, glide: 220, at: ctx.currentTime, dur: 0.06, type: 'triangle', gain: 0.13 });
    },
    invalid() {
      const at = ctx.currentTime;
      tone(sfxBus, { freq: 150, at, dur: 0.16, type: 'square', gain: 0.09 });
      tone(sfxBus, { freq: 142, at: at + 0.02, dur: 0.16, type: 'square', gain: 0.09 });
    },
    /** 판정 공개. 글자마다 맞은 정도를 음높이로 들려준다. */
    reveal(scores) {
      const at = ctx.currentTime;
      const scale = [60, 64, 67, 72]; // 0~3개 맞음
      scores.forEach((score, i) => {
        const note = scale[Math.min(score, 3)];
        tone(sfxBus, { freq: midi(note), at: at + i * 0.13, dur: 0.3, type: 'triangle', gain: 0.26 });
      });
    },
    win() {
      const at = ctx.currentTime;
      [60, 64, 67, 72, 76].forEach((note, i) => {
        tone(sfxBus, { freq: midi(note), at: at + i * 0.1, dur: 0.5, type: 'triangle', gain: 0.30 });
      });
    },
    lose() {
      const at = ctx.currentTime;
      [62, 58, 53].forEach((note, i) => {
        tone(sfxBus, { freq: midi(note), at: at + i * 0.18, dur: 0.6, type: 'sine', gain: 0.30 });
      });
    },
    click() {
      tone(sfxBus, { freq: 520, glide: 660, at: ctx.currentTime, dur: 0.09, type: 'sine', gain: 0.20 });
    },
  };

  function play(name, arg) {
    if (!prefs.sfx || !ctx || ctx.state !== 'running') return;
    sfx[name](arg);
  }

  // resume()의 반환값에 기대지 않는다. 프라미스를 돌려주지 않는 브라우저가
  // 있고(사파리 구버전), 돌려주더라도 실제 재생이 시작될 때까지 해결하지 않는
  // 경우가 있다. 예전에는 여기서 .then()을 부르다 TypeError가 나면서 BGM 시작이
  // 통째로 죽었고, 토글 버튼을 눌러야만 소리가 나왔다. 시작 신호는 statechange가
  // 책임지고, 여기서는 거부만 삼킨다 — 자동재생이 막히면 거부되는 것이 정상이다.
  function safeResume() {
    try {
      const pending = ctx.resume();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch { /* 무시 */ }
  }

  function unlock() {
    if (!init()) return;

    // iOS는 resume()만으로 열리지 않고 실제 재생이 한 번 일어나야 한다.
    if (!unlock.primed) {
      unlock.primed = true;
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      source.start(0);
    }

    safeResume();
    if (ctx.state === 'running' && prefs.bgm) startBgm();
  }

  // 자동재생이 허용된 환경(사용자가 이 사이트에 소리를 허용했거나, 크롬의
  // 미디어 관여도 점수가 충분한 경우)에서는 조작을 기다릴 이유가 없다. 막히면
  // 컨텍스트가 suspended로 남고 첫 입력 때 statechange가 이어받는다.
  function tryAutostart() {
    if (!init()) return;
    safeResume();
    if (ctx.state === 'running' && prefs.bgm) startBgm();
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) stopBgm();
    else if (prefs.bgm && ctx.state === 'running') startBgm();
  });

  const Sound = {
    prefs,
    unlock,
    play,
    setBgm(on) {
      prefs.bgm = on;
      save();
      if (!init()) return;
      if (on) {
        safeResume();
        startBgm();
      } else {
        stopBgm();
      }
    },
    setSfx(on) {
      prefs.sfx = on;
      save();
    },
  };

  window.KkodleSound = Sound;

  tryAutostart();
})();

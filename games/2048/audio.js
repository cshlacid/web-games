'use strict';

// 소리를 오디오 파일 대신 Web Audio로 합성한다. 저장소에 바이너리 애셋을 두지
// 않아도 되고, 빌드 없이 정적 파일만으로 배포한다는 제약과도 맞는다.
(function () {
  const KEY = 'web-games.2048.sound';

  const prefs = { bgm: true, sfx: true };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch { /* 저장된 설정이 없거나 접근 불가: 기본값을 쓴다 */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* 무시 */ }
  }

  let ctx = null;
  let master = null;
  let bgmBus = null;
  let sfxBus = null;
  let timer = null;
  let nextStepTime = 0;
  let step = 0;

  const BPM = 88;
  const STEP = 60 / BPM / 2; // 8분음표
  const LOOKAHEAD = 0.12;
  const STEPS_PER_CHORD = 8;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // Am - F - G - Em. 자리를 많이 차지하지 않도록 완만한 진행을 골랐다.
  const CHORDS = [
    { pad: [57, 60, 64], bass: 45, arp: [69, 72, 76, 72] },
    { pad: [53, 57, 60], bass: 41, arp: [65, 69, 72, 69] },
    { pad: [55, 59, 62], bass: 43, arp: [67, 71, 74, 71] },
    { pad: [52, 55, 59], bass: 40, arp: [64, 67, 71, 67] },
  ];

  function init() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();

    // 게인을 귀에 들리는 수준까지 올리면 효과음과 BGM이 겹칠 때 1.0을 넘길 수
    // 있다. 넘긴 만큼은 깨진 소리로 들리므로 마스터에 리미터를 물린다.
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
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    return ctx;
  }

  /**
   * 오실레이터 하나 + 게인 엔벨로프 하나로 음 하나를 예약한다.
   * 게인을 정확히 0으로 두면 exponentialRamp가 동작하지 않으므로 0.0001에서
   * 시작하고 끝낸다.
   */
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
        tone(bgmBus, { freq: midi(note), at, dur: STEP * 8, type: 'sine', gain: 0.13, attack: 0.5 });
      }
      tone(bgmBus, { freq: midi(chord.bass), at, dur: STEP * 4, type: 'triangle', gain: 0.24, attack: 0.02 });
    }

    if (beat % 2 === 0) {
      const note = chord.arp[(beat / 2) % chord.arp.length];
      tone(bgmBus, { freq: midi(note), at, dur: STEP * 1.6, type: 'triangle', gain: 0.12 });
    }
  }

  // setInterval의 흔들림은 음악 타이밍에 쓸 수 없다. 타이머는 "미리 예약할
  // 시점이 됐는지"만 보고, 실제 시각은 ctx.currentTime 기준으로 잡는다.
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
    bgmBus.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 1.2);
    timer = setInterval(scheduler, 25);
    scheduler();
  }

  function stopBgm() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    // 이미 예약된 음이 남아 있으므로 곧바로 끊지 않고 짧게 페이드한다.
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(Math.max(bgmBus.gain.value, 0.0001), ctx.currentTime);
    bgmBus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  }

  const sfx = {
    move() {
      const at = ctx.currentTime;
      tone(sfxBus, { freq: 220, glide: 160, at, dur: 0.08, type: 'triangle', gain: 0.20 });
    },
    merge(value) {
      // 큰 수가 합쳐질수록 높은 음이 나게 해서 진행이 귀로도 느껴지게 한다.
      const rank = Math.min(Math.max(Math.log2(value) - 2, 0), 9);
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
      const at = ctx.currentTime;
      const base = 60 + scale[Math.round(rank)];
      tone(sfxBus, { freq: midi(base), at, dur: 0.24, type: 'triangle', gain: 0.38, attack: 0.008 });
      tone(sfxBus, { freq: midi(base + 12), at: at + 0.04, dur: 0.18, type: 'sine', gain: 0.20 });
    },
    win() {
      const at = ctx.currentTime;
      [60, 64, 67, 72].forEach((note, i) => {
        tone(sfxBus, { freq: midi(note), at: at + i * 0.11, dur: 0.4, type: 'triangle', gain: 0.34 });
      });
    },
    gameOver() {
      const at = ctx.currentTime;
      [57, 53, 48].forEach((note, i) => {
        tone(sfxBus, { freq: midi(note), at: at + i * 0.16, dur: 0.5, type: 'sine', gain: 0.34 });
      });
    },
    click() {
      const at = ctx.currentTime;
      tone(sfxBus, { freq: 520, glide: 660, at, dur: 0.09, type: 'sine', gain: 0.22 });
    },
  };

  function play(name, arg) {
    if (!prefs.sfx || !ctx || ctx.state !== 'running') return;
    sfx[name](arg);
  }

  // 브라우저는 사용자 조작 전에는 소리를 내지 못하게 막는다. 첫 입력에서
  // 컨텍스트를 만들고 재개한다.
  function unlock() {
    if (!init()) return;

    // iOS는 resume()만으로는 열리지 않고 실제 재생이 한 번 일어나야 한다.
    // 길이 1샘플짜리 무음이면 충분하다.
    if (!unlock.primed) {
      unlock.primed = true;
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      source.start(0);
    }

    // resume()이 끝나기 전에는 currentTime이 멈춰 있어 예약 시각이 어긋난다.
    const started = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    started.then(() => { if (prefs.bgm) startBgm(); }).catch(() => { /* 무시 */ });
  }

  const Sound = {
    prefs,
    unlock,
    play,
    setBgm(on) {
      prefs.bgm = on;
      save();
      if (!init()) return;
      if (on) {
        if (ctx.state === 'suspended') ctx.resume();
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

  // 탭을 벗어났을 때까지 음악이 흐르면 성가시다.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) stopBgm();
    else if (prefs.bgm && ctx.state === 'running') startBgm();
  });

  window.Game2048Sound = Sound;
})();

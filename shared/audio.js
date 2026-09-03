'use strict';

// 게임 셋이 같은 뼈대를 쓰게 되어 뽑아낸 오디오 코어.
//
// 여기 있는 것은 곡이 아니라 배관이다 — 컨텍스트·리미터·버스, 설정 저장, 그리고
// 브라우저 자동재생 정책을 다루는 부분. 곡과 효과음은 게임마다 완전히 다르므로
// 각 게임이 자기 파일에서 정의해 넘긴다. 그래야 이 파일을 공유해도 게임이 서로의
// 소리를 제약하지 않는다.
//
// 정책 관련해서 두 번 데인 곳이 있어 그대로 옮겨 왔다: resume()의 반환값에
// 기대면 안 되고(프라미스를 돌려주지 않는 브라우저가 있다), 컨텍스트가 언제
// 열리는지는 statechange로 직접 들어야 한다.
window.createGameAudio = function createGameAudio(config) {
  const {
    storageKey,
    bgmLevel = 1,
    sfxLevel = 0.9,
    step,          // 8분음표 하나의 길이(초)
    stepsPerLoop,  // 루프 한 바퀴의 스텝 수
    scheduleStep,  // (index, at, tone, noise) => void — 소리는 BGM 버스로 나간다
    sfx,           // { 이름: (now, tone, arg, noise) => void } — 효과음 버스로
  } = config;

  // 곡이 여럿인 게임은 tracks로 넘긴다. 하나뿐이면 예전처럼 최상위에 적어도 되게
  // 한 칸짜리 tracks로 접어 둔다 — 이 파일을 함께 쓰는 다른 게임들을 건드리지
  // 않으려는 것이다.
  const tracks = config.tracks || { main: { step, stepsPerLoop, scheduleStep } };
  const trackKeys = Object.keys(tracks);

  const LOOKAHEAD = 0.12;
  const START_FADE = 1.4;  // 페이지를 열 때. 갑자기 곡이 튀어나오지 않게 길게 연다.
  const SWITCH_FADE = 0.4; // 곡을 바꿀 때. 길면 화면은 이미 전투인데 소리가 안 따라온다.

  const prefs = { bgm: true, sfx: true };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(storageKey) || '{}'));
  } catch { /* 저장된 설정이 없거나 접근 불가: 기본값을 쓴다 */ }

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { /* 무시 */ }
  }

  let ctx = null;
  let bgmBus = null;
  let sfxBus = null;
  let noiseBuffer = null;
  let timer = null;
  let switchTimer = null;
  let nextStepTime = 0;
  let stepIndex = 0;
  let playing = trackKeys[0];   // 스케줄러가 지금 돌리고 있는 곡
  let wanted = trackKeys[0];    // 게임이 요청한 곡. 페이드가 끝나야 playing이 따라온다

  function init() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();

    // 들리는 크기까지 게인을 올리면 효과음과 BGM이 겹칠 때 1.0을 넘긴다.
    // 넘긴 만큼은 깨진 소리로 들리므로 마스터에 리미터를 물린다.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(limiter);

    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0;
    bgmBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxLevel;
    sfxBus.connect(master);

    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running' && prefs.bgm) startBgm();
    });

    return ctx;
  }

  // 게인이 정확히 0이면 exponentialRamp가 동작하지 않으므로 0.0001에서 시작한다.
  function toneOn(bus, { freq, at, dur, type = 'sine', gain = 0.2, attack = 0.006, glide, detune }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, at + dur);
    if (detune) osc.detune.setValueAtTime(detune, at);

    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.03);
  }

  // 오실레이터만으로는 못 만드는 소리가 있다 — 하이햇·스네어, 그리고 부딪히고
  // 스치는 효과음. 잡음을 필터에 물려 그 자리를 메운다. 버퍼는 한 번 만들어
  // 돌려 쓴다(매번 1초치를 채우면 그 자체가 끊김이 된다).
  function noiseOn(bus, { at, dur, gain = 0.2, attack = 0.004, type = 'bandpass', freq = 2000, q = 1, glide }) {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    if (glide) filter.frequency.exponentialRampToValueAtTime(glide, at + dur);
    filter.Q.value = q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    source.connect(filter).connect(env).connect(bus);
    source.start(at);
    source.stop(at + dur + 0.03);
  }

  // setInterval의 흔들림은 음악 타이밍에 쓸 수 없다. 타이머는 예약할 때가 됐는지만
  // 보고, 실제 시각은 ctx.currentTime 기준으로 잡는다.
  function scheduler() {
    if (!ctx) return;
    const track = tracks[playing];
    while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
      track.scheduleStep(
        stepIndex,
        nextStepTime,
        (opts) => toneOn(bgmBus, opts),
        (opts) => noiseOn(bgmBus, opts),
      );
      nextStepTime += track.step;
      stepIndex = (stepIndex + 1) % track.stepsPerLoop;
    }
  }

  function startBgm(fade = START_FADE) {
    if (!ctx || timer || !prefs.bgm) return;
    playing = wanted;
    const track = tracks[playing];
    if (!track) return;
    nextStepTime = ctx.currentTime + 0.08;
    stepIndex = 0;
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bgmBus.gain.exponentialRampToValueAtTime(track.level || bgmLevel, ctx.currentTime + fade);
    timer = setInterval(scheduler, 25);
    scheduler();
  }

  function stopBgm(fade = 0.4) {
    // 곡을 바꾸는 중에 꺼지면 예약해 둔 재시작이 소리를 되살린다.
    if (switchTimer) { clearTimeout(switchTimer); switchTimer = null; }
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    // 이미 예약된 음이 남아 있으므로 곧바로 끊지 않고 짧게 페이드한다.
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(Math.max(bgmBus.gain.value, 0.0001), ctx.currentTime);
    bgmBus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade);
  }

  // 자동재생이 막히면 거부되는 것이 정상이다. 콘솔에 잡히지 않은 거부로 남지
  // 않게 삼킨다. 시작 신호는 statechange가 책임진다.
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

  // 자동재생이 허용된 환경에서는 조작을 기다릴 이유가 없다. 막히면 컨텍스트가
  // suspended로 남고 첫 입력 때 statechange가 이어받는다.
  function tryAutostart() {
    if (!init()) return;
    safeResume();
    if (ctx.state === 'running' && prefs.bgm) startBgm();
  }

  // **첫 조작 한 번만 듣고 끊으면 안 된다.** 자동재생이 막힌 브라우저에서는 조작이
  // 곧 시작 신호인데, 그 한 번의 resume()이 통하지 않는 경우가 있다. 그러면 그
  // 뒤로는 게임이 직접 unlock()을 부르는 자리(힐러의 전장 누르기 같은)에 닿기
  // 전까지 곡이 나오지 않는다 — 실제로 특정 스킬을 써야 BGM이 시작됐다.
  // 컨텍스트가 열릴 때까지 계속 듣고, 열리면 스스로 뗀다.
  //
  // **캡처 단계에서 듣는다.** 게임이 자기 처리에서 전파를 멈추면 문서까지 오지
  // 않는데, 소리를 여는 것은 어느 게임의 처리보다 앞이다.
  const GESTURES = ['pointerdown', 'touchend', 'keydown', 'click'];
  function onGesture() {
    unlock();
    if (ctx && ctx.state === 'running') {
      for (const name of GESTURES) document.removeEventListener(name, onGesture, true);
    }
  }
  for (const name of GESTURES) document.addEventListener(name, onGesture, true);

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) stopBgm();
    else if (prefs.bgm && ctx.state === 'running') startBgm();
  });

  const sound = {
    prefs,
    unlock,
    play(name, arg) {
      if (!prefs.sfx || !ctx || ctx.state !== 'running') return;
      const handler = sfx[name];
      if (handler) {
        handler(ctx.currentTime, (opts) => toneOn(sfxBus, opts), arg, (opts) => noiseOn(sfxBus, opts));
      }
    },
    // 곡을 바꾼다. 두 곡을 겹치면 화음이 부딪히므로 겹치지 않고 앞 곡을 접은 뒤
    // 뒤 곡을 연다. 꺼져 있거나 아직 열리지 않았으면 다음 시작 때 새 곡이 나간다.
    setTrack(name) {
      if (!tracks[name] || name === wanted) return;
      wanted = name;
      if (!ctx || !timer) return;
      stopBgm(SWITCH_FADE);
      switchTimer = setTimeout(() => {
        switchTimer = null;
        startBgm(SWITCH_FADE);
      }, SWITCH_FADE * 1000);
    },
    setBgm(on) {
      prefs.bgm = on;
      save();
      if (!init()) return;
      if (on) { safeResume(); startBgm(); } else { stopBgm(); }
    },
    setSfx(on) {
      prefs.sfx = on;
      save();
    },
  };

  tryAutostart();
  return sound;
};

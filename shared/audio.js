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
    scheduleStep,  // (index, at, tone) => void — tone은 BGM 버스로 나간다
    sfx,           // { 이름: (now, tone, arg) => void } — tone은 효과음 버스로
  } = config;

  const LOOKAHEAD = 0.12;

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
  let timer = null;
  let nextStepTime = 0;
  let stepIndex = 0;

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
  function toneOn(bus, { freq, at, dur, type = 'sine', gain = 0.2, attack = 0.006, glide }) {
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

  // setInterval의 흔들림은 음악 타이밍에 쓸 수 없다. 타이머는 예약할 때가 됐는지만
  // 보고, 실제 시각은 ctx.currentTime 기준으로 잡는다.
  function scheduler() {
    if (!ctx) return;
    while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(stepIndex, nextStepTime, (opts) => toneOn(bgmBus, opts));
      nextStepTime += step;
      stepIndex = (stepIndex + 1) % stepsPerLoop;
    }
  }

  function startBgm() {
    if (!ctx || timer || !prefs.bgm) return;
    nextStepTime = ctx.currentTime + 0.08;
    stepIndex = 0;
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bgmBus.gain.exponentialRampToValueAtTime(bgmLevel, ctx.currentTime + 1.4);
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
      if (handler) handler(ctx.currentTime, (opts) => toneOn(sfxBus, opts), arg);
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

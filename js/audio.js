// ===== 사운드 엔진 (Web Audio API로 그 자리에서 합성 - 외부 효과음 파일 없음) =====
// 프리뷰 아티팩트에서 확인받은 소리들을 그대로 게임에 연결한다.
// 브라우저 자동재생 정책 때문에 실제 유저 입력(캐릭터 선택 클릭 등) 이후에만 소리가 나지만,
// 이 게임은 항상 클릭/키 입력으로 시작되므로 별도 처리 없이 자연스럽게 풀린다.

const SFX = (() => {
  let actx = null;
  let masterVol = 0.7;

  function ensureCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function noiseBuffer(ctx, duration) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function masterGain(ctx, level) {
    const g = ctx.createGain();
    g.gain.value = level * masterVol;
    g.connect(ctx.destination);
    return g;
  }

  // 찌그러뜨림(디스토션) 곡선 - 저음 몸통에 걸어서 "퍽" 하는 질감/무게감을 더한다
  function makeDistortionCurve(amount) {
    const k = amount || 40;
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // 타격음 공통 구조: (1) 아주 짧은 트랜지언트 클릭으로 "닿는 순간"을 또렷하게 찍고,
  // (2) 디스토션 걸린 저음 몸통으로 무게감을 주고, (3) 넓은 노이즈 스매시로 살이 부딪히는 질감을 겹친다
  function impact({ master, clickGain, bodyFreqStart, bodyFreqEnd, bodyDecay, bodyType, distortAmount, noiseDur, noiseFreq, noiseQ, noiseGain, noiseDecay }) {
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    const out = masterGain(ctx, master);

    const click = ctx.createBufferSource();
    click.buffer = noiseBuffer(ctx, 0.015);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(clickGain, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    click.connect(cg).connect(out);
    click.start(now); click.stop(now + 0.015);

    const osc = ctx.createOscillator();
    osc.type = bodyType;
    osc.frequency.setValueAtTime(bodyFreqStart, now);
    osc.frequency.exponentialRampToValueAtTime(bodyFreqEnd, now + bodyDecay * 0.7);
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(distortAmount);
    shaper.oversample = '2x';
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + bodyDecay);
    osc.connect(shaper).connect(oscGain).connect(out);
    osc.start(now); osc.stop(now + bodyDecay + 0.02);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, noiseDur);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = noiseFreq; nf.Q.value = noiseQ;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(noiseGain, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + noiseDecay);
    noise.connect(nf).connect(ng).connect(out);
    noise.start(now); noise.stop(now + noiseDur);
  }

  function punch() {
    impact({
      master: 0.85, clickGain: 0.9,
      bodyFreqStart: 190, bodyFreqEnd: 62, bodyDecay: 0.11, bodyType: 'triangle', distortAmount: 30,
      noiseDur: 0.08, noiseFreq: 1700, noiseQ: 0.45, noiseGain: 0.75, noiseDecay: 0.06
    });
  }

  function kick() {
    impact({
      master: 1.0, clickGain: 1,
      bodyFreqStart: 150, bodyFreqEnd: 42, bodyDecay: 0.2, bodyType: 'triangle', distortAmount: 45,
      noiseDur: 0.13, noiseFreq: 1000, noiseQ: 0.4, noiseGain: 0.95, noiseDecay: 0.1
    });
  }

  // 필살기/궁극기 등 스킬 판정이나 투사체에 맞았을 때 - 기본기보다 한층 더 무겁고 거친 타격음
  function bigHit() {
    impact({
      master: 1.15, clickGain: 1,
      bodyFreqStart: 130, bodyFreqEnd: 34, bodyDecay: 0.26, bodyType: 'sawtooth', distortAmount: 65,
      noiseDur: 0.16, noiseFreq: 850, noiseQ: 0.35, noiseGain: 1, noiseDecay: 0.13
    });
  }

  function block() {
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    const master = masterGain(ctx, 0.5);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.12);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 0.05);
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass'; nf.frequency.value = 2800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.45, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    noise.connect(nf).connect(ng).connect(master);
    noise.start(now); noise.stop(now + 0.05);
  }

  function cast(big) {
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    const dur = big ? 0.85 : 0.45;
    const master = masterGain(ctx, big ? 0.65 : 0.5);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(big ? 75 : 130, now);
    osc.frequency.exponentialRampToValueAtTime(big ? 480 : 440, now + dur * 0.8);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.9, now + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(filter).connect(g).connect(master);
    osc.start(now); osc.stop(now + dur + 0.05);

    if (big) {
      const sub = ctx.createOscillator();
      sub.type = 'sine'; sub.frequency.value = 52;
      const subg = ctx.createGain();
      subg.gain.setValueAtTime(0.0001, now);
      subg.gain.exponentialRampToValueAtTime(0.55, now + dur * 0.7);
      subg.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.25);
      sub.connect(subg).connect(master);
      sub.start(now); sub.stop(now + dur + 0.3);

      const shimmer = ctx.createOscillator();
      shimmer.type = 'sine'; shimmer.frequency.setValueAtTime(1800, now + dur * 0.5);
      shimmer.frequency.exponentialRampToValueAtTime(2600, now + dur);
      const shg = ctx.createGain();
      shg.gain.setValueAtTime(0.0001, now + dur * 0.5);
      shg.gain.exponentialRampToValueAtTime(0.25, now + dur * 0.75);
      shg.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.15);
      shimmer.connect(shg).connect(master);
      shimmer.start(now + dur * 0.5); shimmer.stop(now + dur + 0.2);
    }
  }

  function projectile() {
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    const master = masterGain(ctx, 0.5);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 0.4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.35);
    filter.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.65, now + 0.09);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    noise.connect(filter).connect(g).connect(master);
    noise.start(now); noise.stop(now + 0.4);
  }

  function seal() {
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    const master = masterGain(ctx, 0.5);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.42);
  }

  function ko() {
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    const master = masterGain(ctx, 0.7);
    [[0, 440], [0.15, 349], [0.32, 220]].forEach(([t, freq]) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.45, now + t);
      g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.32);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1400;
      osc.connect(lp).connect(g).connect(master);
      osc.start(now + t); osc.stop(now + t + 0.35);
    });
  }

  function jump() {
    const ctx = ensureCtx();
    const now = ctx.currentTime;
    const master = masterGain(ctx, 0.4);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g).connect(master);
    osc.start(now); osc.stop(now + 0.16);
  }

  return {
    punch, kick, bigHit, block,
    castSpecial: () => cast(false),
    castUltimate: () => cast(true),
    projectile, seal, ko, jump,
    setVolume(v) { masterVol = Math.max(0, Math.min(1, v)); }
  };
})();

// ===== 배경음악 (실제 mp3 파일, 판마다 3곡 중 랜덤 재생) =====
const BGM = (() => {
  const TRACKS = [
    'assets/bgm/bgm1.mp3',
    'assets/bgm/bgm2.mp3',
    'assets/bgm/bgm3.mp3'
  ];
  let audioEl = null;
  let volume = 0.35;

  function ensureEl() {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.loop = true;
      audioEl.volume = volume;
    }
    return audioEl;
  }

  // 전투 시작마다 3곡 중 하나를 무작위로 골라 처음부터 재생 (같은 곡이 연달아 나올 수도 있음 - 진짜 랜덤)
  function playRandom() {
    const el = ensureEl();
    const track = TRACKS[Math.floor(Math.random() * TRACKS.length)];
    el.src = track;
    el.currentTime = 0;
    el.volume = volume;
    const p = el.play();
    // 자동재생 정책으로 막히는 경우가 있어도(거의 없음 - 이미 클릭으로 시작된 흐름) 조용히 무시
    if (p && p.catch) p.catch(() => {});
  }

  function stop() {
    if (audioEl) audioEl.pause();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (audioEl) audioEl.volume = volume;
  }

  return { playRandom, stop, setVolume };
})();

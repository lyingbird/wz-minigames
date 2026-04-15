/**
 * 王者荣耀 Mini-Game Collection — Web Audio Sound Engine
 * All sounds are synthesized via Web Audio API. No audio files needed.
 */

export function initAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.value = 1.0;

  let muted = false;
  let savedVolume = 1.0;

  // ── helpers ──────────────────────────────────────────────

  function now() {
    return ctx.currentTime;
  }

  /** Create a gain node that auto-disconnects after `duration` seconds. */
  function tmpGain(volume = 1, duration = 0.5) {
    const g = ctx.createGain();
    g.gain.value = volume;
    g.connect(masterGain);
    setTimeout(() => { try { g.disconnect(); } catch (_) { /* noop */ } }, duration * 1000 + 200);
    return g;
  }

  /** Quick oscillator burst. */
  function osc(type, freq, start, end, duration, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (end !== freq) {
      o.frequency.linearRampToValueAtTime(end, start + duration);
    }
    o.connect(dest);
    o.start(start);
    o.stop(start + duration);
  }

  /** Noise burst (white noise through bandpass). */
  function noiseBurst(duration, freq, Q, dest, startTime) {
    const t = startTime ?? now();
    const bufLen = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = Q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.01, t + duration);

    src.connect(bp).connect(env).connect(dest);
    src.start(t);
    src.stop(t + duration);
  }

  // ── sound methods ────────────────────────────────────────

  function playHit() {
    const t = now();
    const g = tmpGain(0.7, 0.15);

    // Low punchy thud
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(150, t);
    o1.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const env1 = ctx.createGain();
    env1.gain.setValueAtTime(1, t);
    env1.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    o1.connect(env1).connect(g);
    o1.start(t);
    o1.stop(t + 0.12);

    // High transient click
    noiseBurst(0.04, 3000, 1.5, g, t);
  }

  function playScore() {
    const t = now();
    const g = tmpGain(0.5, 0.4);
    const notes = [523, 659, 784]; // C5 E5 G5

    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t + i * 0.08);
      env.gain.linearRampToValueAtTime(0.8, t + i * 0.08 + 0.02);
      env.gain.exponentialRampToValueAtTime(0.01, t + i * 0.08 + 0.25);
      o.connect(env).connect(g);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.25);
    });
  }

  function playCombo(level) {
    const t = now();
    const clampedLevel = Math.min(Math.max(level, 1), 10);
    const g = tmpGain(0.4 + clampedLevel * 0.05, 0.6);

    // Rising arpeggio — more notes and higher pitch at higher combos
    const baseFreq = 400 + clampedLevel * 60;
    const noteCount = Math.min(2 + clampedLevel, 8);

    for (let i = 0; i < noteCount; i++) {
      const freq = baseFreq * Math.pow(2, i / 6);
      const offset = i * 0.04;
      const o = ctx.createOscillator();
      o.type = clampedLevel > 5 ? 'sawtooth' : 'triangle';
      o.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t + offset);
      env.gain.linearRampToValueAtTime(0.6, t + offset + 0.015);
      env.gain.exponentialRampToValueAtTime(0.01, t + offset + 0.2);
      o.connect(env).connect(g);
      o.start(t + offset);
      o.stop(t + offset + 0.2);
    }

    // Dramatic sub bass rumble for high combos
    if (clampedLevel >= 5) {
      osc('sine', 60 + clampedLevel * 5, 60, 30, 0.3, g);
    }
  }

  function playDeath() {
    const t = now();
    const g = tmpGain(0.6, 0.8);

    // Descending low tone
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.linearRampToValueAtTime(0.6, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.7);
    o.connect(env).connect(g);
    o.start(t);
    o.stop(t + 0.7);

    // Low rumble
    osc('sine', 80, 40, 0.5, 0.5, g);
    noiseBurst(0.3, 400, 0.8, g, t);
  }

  function playDash() {
    const t = now();
    const g = tmpGain(0.4, 0.2);

    // Whoosh — filtered noise sweep
    const bufLen = ctx.sampleRate * 0.18;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(800, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.06);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.18);
    bp.Q.value = 2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

    src.connect(bp).connect(env).connect(g);
    src.start(t);
    src.stop(t + 0.18);
  }

  function playHook() {
    const t = now();
    const g = tmpGain(0.5, 0.35);

    // Metallic chain rattle — rapid modulated tone
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(200, t);
    o.frequency.linearRampToValueAtTime(600, t + 0.15);
    o.frequency.linearRampToValueAtTime(400, t + 0.3);

    // Ring-mod style: AM with fast LFO for metallic feel
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 45;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(g.gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.6, t);
    env.gain.linearRampToValueAtTime(0.8, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 300;

    o.connect(hp).connect(env).connect(g);
    o.start(t);
    o.stop(t + 0.3);
    lfo.start(t);
    lfo.stop(t + 0.3);
  }

  function playSlash() {
    const t = now();
    const g = tmpGain(0.5, 0.2);

    // Sharp noise sweep — high to low
    const bufLen = ctx.sampleRate * 0.12;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.setValueAtTime(6000, t);
    bp.frequency.exponentialRampToValueAtTime(800, t + 0.1);
    bp.Q.value = 3;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    src.connect(bp).connect(env).connect(g);
    src.start(t);
    src.stop(t + 0.12);

    // Tonal zing
    osc('sawtooth', 1200, 400, 0.08, 0.08, g);
  }

  function playShoot() {
    const t = now();
    const g = tmpGain(0.45, 0.2);

    // Quick descending square for snap
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(100, t + 0.08);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.7, t);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    o.connect(env).connect(g);
    o.start(t);
    o.stop(t + 0.1);

    // Noise crack
    noiseBurst(0.05, 5000, 1, g, t);
  }

  function playBeat(perfect = false) {
    const t = now();
    const g = tmpGain(0.55, 0.3);

    if (perfect) {
      // Bright chime
      const notes = [880, 1320];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.6, t + i * 0.03);
        env.gain.exponentialRampToValueAtTime(0.01, t + i * 0.03 + 0.2);
        o.connect(env).connect(g);
        o.start(t + i * 0.03);
        o.stop(t + i * 0.03 + 0.2);
      });
    } else {
      // Duller thump
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(220, t + 0.1);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.6, t);
      env.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      o.connect(env).connect(g);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  function playCountdown() {
    const t = now();
    const g = tmpGain(0.5, 0.15);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 880;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.7, t);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    o.connect(env).connect(g);
    o.start(t);
    o.stop(t + 0.1);

    // Click transient
    noiseBurst(0.02, 6000, 2, g, t);
  }

  function playStart() {
    const t = now();
    const g = tmpGain(0.5, 0.8);

    // Fanfare — ascending power chord
    const chords = [
      { freq: 523, time: 0 },      // C5
      { freq: 659, time: 0.1 },    // E5
      { freq: 784, time: 0.2 },    // G5
      { freq: 1047, time: 0.35 },  // C6
    ];

    chords.forEach(({ freq, time }) => {
      ['triangle', 'sine'].forEach((type, ti) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq * (ti === 1 ? 2 : 1);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t + time);
        env.gain.linearRampToValueAtTime(ti === 0 ? 0.5 : 0.25, t + time + 0.03);
        env.gain.exponentialRampToValueAtTime(0.01, t + time + 0.45);
        o.connect(env).connect(g);
        o.start(t + time);
        o.stop(t + time + 0.45);
      });
    });

    // Sub thump on final note
    osc('sine', 130, 65, 0.3, 0.3, g);
  }

  function setVolume(v) {
    const vol = Math.min(Math.max(v, 0), 1);
    savedVolume = vol;
    if (!muted) {
      masterGain.gain.setValueAtTime(vol, now());
    }
  }

  function mute() {
    muted = true;
    masterGain.gain.setValueAtTime(0, now());
  }

  function unmute() {
    muted = false;
    masterGain.gain.setValueAtTime(savedVolume, now());
  }

  function toggleMute() {
    if (muted) unmute();
    else mute();
    return muted;
  }

  // Resume context if suspended (autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  return {
    context: ctx,
    playHit,
    playScore,
    playCombo,
    playDeath,
    playDash,
    playHook,
    playSlash,
    playShoot,
    playBeat,
    playCountdown,
    playStart,
    setVolume,
    mute,
    unmute,
    toggleMute,
  };
}

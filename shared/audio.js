/**
 * 王者荣耀 Mini-Game Collection — Web Audio Sound Engine v2
 * Rich synthesized BGM + enhanced SFX. Pure Web Audio API, zero dependencies.
 */

export function initAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  // ── Routing: separate buses for BGM and SFX ──────────────
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.value = 1.0;

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.7;
  sfxBus.connect(masterGain);

  const bgmBus = ctx.createGain();
  bgmBus.gain.value = 0.3;
  bgmBus.connect(masterGain);

  let muted = false;
  let savedVolume = 1.0;
  let sfxVolume = 0.7;
  let bgmVolume = 0.3;

  // ── helpers ──────────────────────────────────────────────
  function now() { return ctx.currentTime; }

  function tmpGain(volume = 1, duration = 0.5) {
    const g = ctx.createGain();
    g.gain.value = volume;
    g.connect(sfxBus);
    setTimeout(() => { try { g.disconnect(); } catch (_) {} }, duration * 1000 + 300);
    return g;
  }

  function osc(type, freq, endFreq, duration, dest, startTime) {
    const t = startTime ?? now();
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) {
      o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + duration);
    }
    o.connect(dest);
    o.start(t);
    o.stop(t + duration);
  }

  function noiseBurst(duration, freq, Q, dest, startTime) {
    const t = startTime ?? now();
    const bufLen = Math.max(1, Math.floor(ctx.sampleRate * duration));
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

  /** Create a noise buffer of given length (reusable). */
  function createNoiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  const sharedNoise = createNoiseBuffer(2);

  // ── MIDI note helper ────────────────────────────────────
  function mtof(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  // ════════════════════════════════════════════════════════
  // ██  BGM SYSTEM
  // ════════════════════════════════════════════════════════

  let currentBGM = null;       // { name, interval, gainNode, stop() }
  const SCHEDULE_AHEAD = 0.2;  // seconds
  const TICK_MS = 50;

  // Scales as MIDI note arrays (octave 4 base)
  const SCALES = {
    lobby:  [60, 62, 64, 67, 69, 72, 74, 76, 79, 81],           // C major pentatonic
    hook:   [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74],   // G mixolydian
    slash:  [57, 60, 62, 64, 67, 69, 72, 74, 76, 79],            // A minor pentatonic
    dodge:  [52, 54, 55, 57, 59, 60, 62, 64, 66, 67, 69, 71],   // E minor
    shoot:  [50, 53, 55, 57, 60, 62, 65, 67, 69, 72],            // D minor pentatonic
    rhythm: [53, 55, 57, 58, 60, 62, 64, 65, 67, 69, 70, 72],   // F major
  };

  // Chord progressions as arrays of MIDI root notes + quality
  // quality: 'M' = major triad, 'm' = minor triad
  const CHORDS = {
    lobby:  [{ r: 60, q: 'M' }, { r: 57, q: 'm' }, { r: 53, q: 'M' }, { r: 55, q: 'M' }],
    hook:   [{ r: 55, q: 'M' }, { r: 60, q: 'M' }, { r: 62, q: 'M' }, { r: 55, q: 'M' }],
    slash:  [{ r: 57, q: 'm' }, { r: 53, q: 'M' }, { r: 60, q: 'M' }, { r: 55, q: 'M' }],
    dodge:  [{ r: 52, q: 'm' }, { r: 60, q: 'M' }, { r: 55, q: 'M' }, { r: 62, q: 'M' }],
    shoot:  [{ r: 50, q: 'm' }, { r: 58, q: 'M' }, { r: 53, q: 'M' }, { r: 60, q: 'M' }],
    rhythm: [{ r: 53, q: 'M' }, { r: 55, q: 'm' }, { r: 60, q: 'M' }, { r: 58, q: 'M' }],
  };

  function chordNotes(root, quality) {
    if (quality === 'M') return [root, root + 4, root + 7];
    return [root, root + 3, root + 7];
  }

  /**
   * Create a BGM track. Returns { gainNode, start(), stop() }.
   * Each track builds its own scheduler that loops a pattern.
   */
  function createBGMTrack(trackName) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bgmBus);

    const scale = SCALES[trackName];
    const chords = CHORDS[trackName];
    if (!scale || !chords) return null;

    let intervalId = null;
    let running = false;
    let nextBeatTime = 0;
    let beatIndex = 0;
    // Track all scheduled sources for cleanup
    let scheduledNodes = [];

    function cleanOldNodes(before) {
      scheduledNodes = scheduledNodes.filter(n => {
        if (n.endTime < before) {
          try { n.node.disconnect(); } catch (_) {}
          return false;
        }
        return true;
      });
    }

    function scheduleNode(node, dest, startT, stopT) {
      node.connect(dest);
      node.start(startT);
      node.stop(stopT);
      scheduledNodes.push({ node, endTime: stopT });
    }

    // ── Per-track pattern generators ──

    function lobbyPattern(beatTime, beat) {
      // BPM 80, 4/4 time. 16 beats = 4 bars.
      const beatDur = 60 / 80;
      const bar = Math.floor(beat / 4) % 4;
      const inBar = beat % 4;
      const chord = chords[bar];
      const notes = chordNotes(chord.r, chord.q);

      // Pad chord — sustained, soft
      if (inBar === 0) {
        notes.forEach(n => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = mtof(n);
          const e = ctx.createGain();
          e.gain.setValueAtTime(0, beatTime);
          e.gain.linearRampToValueAtTime(0.12, beatTime + 0.3);
          e.gain.setValueAtTime(0.12, beatTime + beatDur * 3.5);
          e.gain.linearRampToValueAtTime(0, beatTime + beatDur * 4 - 0.05);
          o.connect(e);
          scheduleNode(o, gain, beatTime, beatTime + beatDur * 4);
        });
      }

      // Arpeggio — gentle triangle plucks
      const arpNotes = [scale[0], scale[2], scale[4], scale[3], scale[1], scale[4], scale[2], scale[3]];
      const arpIdx = beat % arpNotes.length;
      const arpNote = arpNotes[arpIdx] + 12; // one octave up
      const ao = ctx.createOscillator();
      ao.type = 'triangle';
      ao.frequency.value = mtof(arpNote);
      const ae = ctx.createGain();
      ae.gain.setValueAtTime(0, beatTime);
      ae.gain.linearRampToValueAtTime(0.08, beatTime + 0.02);
      ae.gain.exponentialRampToValueAtTime(0.001, beatTime + beatDur * 0.8);
      ao.connect(ae);
      scheduleNode(ao, gain, beatTime, beatTime + beatDur);

      // Soft kick every 2 beats
      if (inBar % 2 === 0) {
        const ko = ctx.createOscillator();
        ko.type = 'sine';
        ko.frequency.setValueAtTime(80, beatTime);
        ko.frequency.exponentialRampToValueAtTime(30, beatTime + 0.15);
        const ke = ctx.createGain();
        ke.gain.setValueAtTime(0.15, beatTime);
        ke.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.2);
        ko.connect(ke);
        scheduleNode(ko, gain, beatTime, beatTime + 0.25);
      }

      return beatDur;
    }

    function hookPattern(beatTime, beat) {
      // BPM 100
      const beatDur = 60 / 100;
      const bar = Math.floor(beat / 4) % 4;
      const inBar = beat % 4;
      const chord = chords[bar];
      const notes = chordNotes(chord.r, chord.q);

      // Bass pulse on beats 1 and 3
      if (inBar === 0 || inBar === 2) {
        const bo = ctx.createOscillator();
        bo.type = 'triangle';
        bo.frequency.value = mtof(chord.r - 12);
        const be = ctx.createGain();
        be.gain.setValueAtTime(0.2, beatTime);
        be.gain.exponentialRampToValueAtTime(0.001, beatTime + beatDur * 0.9);
        bo.connect(be);
        scheduleNode(bo, gain, beatTime, beatTime + beatDur);
      }

      // Plucky muted notes on off-beats (8th note off-beats)
      const halfBeat = beatDur / 2;
      const offTime = beatTime + halfBeat;
      const pluckNote = notes[beat % 3] + 12;
      const po = ctx.createOscillator();
      po.type = 'square';
      po.frequency.value = mtof(pluckNote);
      const pf = ctx.createBiquadFilter();
      pf.type = 'lowpass';
      pf.frequency.value = 1500;
      const pe = ctx.createGain();
      pe.gain.setValueAtTime(0, offTime);
      pe.gain.linearRampToValueAtTime(0.1, offTime + 0.01);
      pe.gain.exponentialRampToValueAtTime(0.001, offTime + 0.08);
      po.connect(pf).connect(pe);
      scheduleNode(po, gain, offTime, offTime + 0.1);

      // Light percussion — hihat on every beat
      {
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const he = ctx.createGain();
        he.gain.setValueAtTime(inBar === 0 ? 0.08 : 0.04, beatTime);
        he.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.05);
        src.connect(hp).connect(he);
        scheduleNode(src, gain, beatTime, beatTime + 0.06);
      }

      // Kick on beat 1
      if (inBar === 0) {
        const ko = ctx.createOscillator();
        ko.type = 'sine';
        ko.frequency.setValueAtTime(120, beatTime);
        ko.frequency.exponentialRampToValueAtTime(40, beatTime + 0.12);
        const ke = ctx.createGain();
        ke.gain.setValueAtTime(0.18, beatTime);
        ke.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.15);
        ko.connect(ke);
        scheduleNode(ko, gain, beatTime, beatTime + 0.2);
      }

      return beatDur;
    }

    function slashPattern(beatTime, beat) {
      // BPM 130 — intense
      const beatDur = 60 / 130;
      const bar = Math.floor(beat / 4) % 4;
      const inBar = beat % 4;
      const chord = chords[bar];
      const notes = chordNotes(chord.r, chord.q);

      // Aggressive bass riff — 8th notes
      const halfBeat = beatDur / 2;
      for (let sub = 0; sub < 2; sub++) {
        const t = beatTime + sub * halfBeat;
        const bassNote = sub === 0 ? chord.r - 12 : chord.r - 12 + (beat % 2 === 0 ? 0 : 2);
        const bo = ctx.createOscillator();
        bo.type = 'sawtooth';
        bo.frequency.value = mtof(bassNote);
        const bf = ctx.createBiquadFilter();
        bf.type = 'lowpass';
        bf.frequency.value = 400;
        const be = ctx.createGain();
        be.gain.setValueAtTime(0.18, t);
        be.gain.exponentialRampToValueAtTime(0.001, t + halfBeat * 0.8);
        bo.connect(bf).connect(be);
        scheduleNode(bo, gain, t, t + halfBeat);
      }

      // Fast hi-hats — 16th notes
      const sixteenth = beatDur / 4;
      for (let s = 0; s < 4; s++) {
        const t = beatTime + s * sixteenth;
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 8000;
        const he = ctx.createGain();
        const vol = (s === 0 || s === 2) ? 0.07 : 0.04;
        he.gain.setValueAtTime(vol, t);
        he.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        src.connect(hp).connect(he);
        scheduleNode(src, gain, t, t + 0.04);
      }

      // Kick on 1 and 3, snare on 2 and 4
      if (inBar === 0 || inBar === 2) {
        const ko = ctx.createOscillator();
        ko.type = 'sine';
        ko.frequency.setValueAtTime(150, beatTime);
        ko.frequency.exponentialRampToValueAtTime(35, beatTime + 0.1);
        const ke = ctx.createGain();
        ke.gain.setValueAtTime(0.25, beatTime);
        ke.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.12);
        ko.connect(ke);
        scheduleNode(ko, gain, beatTime, beatTime + 0.15);
      }
      if (inBar === 1 || inBar === 3) {
        // Snare = noise + tone
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3000;
        bp.Q.value = 1;
        const se = ctx.createGain();
        se.gain.setValueAtTime(0.15, beatTime);
        se.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1);
        src.connect(bp).connect(se);
        scheduleNode(src, gain, beatTime, beatTime + 0.12);

        const so = ctx.createOscillator();
        so.type = 'triangle';
        so.frequency.value = 200;
        const se2 = ctx.createGain();
        se2.gain.setValueAtTime(0.1, beatTime);
        se2.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.06);
        so.connect(se2);
        scheduleNode(so, gain, beatTime, beatTime + 0.08);
      }

      // Staccato synth stabs on bar downbeats
      if (inBar === 0) {
        notes.forEach(n => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(n + 12);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(3000, beatTime);
          f.frequency.exponentialRampToValueAtTime(500, beatTime + 0.08);
          const e = ctx.createGain();
          e.gain.setValueAtTime(0.1, beatTime);
          e.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1);
          o.connect(f).connect(e);
          scheduleNode(o, gain, beatTime, beatTime + 0.12);
        });
      }

      return beatDur;
    }

    function dodgePattern(beatTime, beat) {
      // BPM 120 — tense electronic
      const beatDur = 60 / 120;
      const bar = Math.floor(beat / 4) % 4;
      const inBar = beat % 4;
      const chord = chords[bar];

      // Pulsing bass — 8th notes
      const halfBeat = beatDur / 2;
      for (let sub = 0; sub < 2; sub++) {
        const t = beatTime + sub * halfBeat;
        const bo = ctx.createOscillator();
        bo.type = 'sine';
        bo.frequency.value = mtof(chord.r - 12);
        const be = ctx.createGain();
        be.gain.setValueAtTime(sub === 0 ? 0.2 : 0.12, t);
        be.gain.exponentialRampToValueAtTime(0.001, t + halfBeat * 0.7);
        bo.connect(be);
        scheduleNode(bo, gain, t, t + halfBeat);
      }

      // Swirling pad — detuned sine pair
      if (inBar === 0) {
        const notes = chordNotes(chord.r, chord.q);
        notes.forEach(n => {
          for (let det = -1; det <= 1; det += 2) {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = mtof(n) + det * 1.5;
            const e = ctx.createGain();
            e.gain.setValueAtTime(0, beatTime);
            e.gain.linearRampToValueAtTime(0.06, beatTime + 0.4);
            e.gain.setValueAtTime(0.06, beatTime + beatDur * 3.5);
            e.gain.linearRampToValueAtTime(0, beatTime + beatDur * 4 - 0.05);
            o.connect(e);
            scheduleNode(o, gain, beatTime, beatTime + beatDur * 4);
          }
        });
      }

      // Rapid arpeggios — 16th notes, cycle through scale
      const sixteenth = beatDur / 4;
      for (let s = 0; s < 4; s++) {
        const t = beatTime + s * sixteenth;
        const idx = (beat * 4 + s) % scale.length;
        const arpNote = scale[idx] + 12;
        const ao = ctx.createOscillator();
        ao.type = 'triangle';
        ao.frequency.value = mtof(arpNote);
        const ae = ctx.createGain();
        ae.gain.setValueAtTime(0, t);
        ae.gain.linearRampToValueAtTime(0.06, t + 0.01);
        ae.gain.exponentialRampToValueAtTime(0.001, t + sixteenth * 0.8);
        ao.connect(ae);
        scheduleNode(ao, gain, t, t + sixteenth);
      }

      // Kick on 1, hihat on all
      if (inBar === 0) {
        const ko = ctx.createOscillator();
        ko.type = 'sine';
        ko.frequency.setValueAtTime(100, beatTime);
        ko.frequency.exponentialRampToValueAtTime(30, beatTime + 0.15);
        const ke = ctx.createGain();
        ke.gain.setValueAtTime(0.18, beatTime);
        ke.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.18);
        ko.connect(ke);
        scheduleNode(ko, gain, beatTime, beatTime + 0.22);
      }
      {
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 9000;
        const he = ctx.createGain();
        he.gain.setValueAtTime(0.03, beatTime);
        he.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.03);
        src.connect(hp).connect(he);
        scheduleNode(src, gain, beatTime, beatTime + 0.04);
      }

      return beatDur;
    }

    function shootPattern(beatTime, beat) {
      // BPM 140 — powerful, heavy
      const beatDur = 60 / 140;
      const bar = Math.floor(beat / 4) % 4;
      const inBar = beat % 4;
      const chord = chords[bar];
      const notes = chordNotes(chord.r, chord.q);

      // Heavy kick on every beat
      {
        const ko = ctx.createOscillator();
        ko.type = 'sine';
        ko.frequency.setValueAtTime(160, beatTime);
        ko.frequency.exponentialRampToValueAtTime(30, beatTime + 0.12);
        const ke = ctx.createGain();
        ke.gain.setValueAtTime(inBar === 0 ? 0.3 : 0.22, beatTime);
        ke.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.15);
        ko.connect(ke);
        scheduleNode(ko, gain, beatTime, beatTime + 0.18);
      }

      // Driving bass — root note, tight
      {
        const bo = ctx.createOscillator();
        bo.type = 'sawtooth';
        bo.frequency.value = mtof(chord.r - 12);
        const bf = ctx.createBiquadFilter();
        bf.type = 'lowpass';
        bf.frequency.value = 300;
        const be = ctx.createGain();
        be.gain.setValueAtTime(0.18, beatTime);
        be.gain.exponentialRampToValueAtTime(0.001, beatTime + beatDur * 0.7);
        bo.connect(bf).connect(be);
        scheduleNode(bo, gain, beatTime, beatTime + beatDur);
      }

      // Power chords on downbeats
      if (inBar === 0 || inBar === 2) {
        notes.forEach(n => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(n);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(2000, beatTime);
          f.frequency.exponentialRampToValueAtTime(600, beatTime + beatDur * 1.5);
          const e = ctx.createGain();
          e.gain.setValueAtTime(0.08, beatTime);
          e.gain.exponentialRampToValueAtTime(0.001, beatTime + beatDur * 1.8);
          o.connect(f).connect(e);
          scheduleNode(o, gain, beatTime, beatTime + beatDur * 2);
        });
      }

      // Militant snare — 2 and 4 with ghost notes
      if (inBar === 1 || inBar === 3) {
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 4000;
        bp.Q.value = 0.8;
        const se = ctx.createGain();
        se.gain.setValueAtTime(0.2, beatTime);
        se.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1);
        src.connect(bp).connect(se);
        scheduleNode(src, gain, beatTime, beatTime + 0.12);
      }
      // Ghost snare on "e" of beat 2 and 4
      if ((inBar === 1 || inBar === 3)) {
        const gt = beatTime + beatDur * 0.75;
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3500;
        bp.Q.value = 1;
        const ge = ctx.createGain();
        ge.gain.setValueAtTime(0.06, gt);
        ge.gain.exponentialRampToValueAtTime(0.001, gt + 0.05);
        src.connect(bp).connect(ge);
        scheduleNode(src, gain, gt, gt + 0.06);
      }

      // Hi-hat 8ths
      const halfBeat = beatDur / 2;
      for (let s = 0; s < 2; s++) {
        const t = beatTime + s * halfBeat;
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 8000;
        const he = ctx.createGain();
        he.gain.setValueAtTime(s === 0 ? 0.06 : 0.03, t);
        he.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        src.connect(hp).connect(he);
        scheduleNode(src, gain, t, t + 0.04);
      }

      return beatDur;
    }

    function rhythmPattern(beatTime, beat) {
      // BPM 110 — melodic, light (menu/results)
      const beatDur = 60 / 110;
      const bar = Math.floor(beat / 4) % 4;
      const inBar = beat % 4;
      const chord = chords[bar];
      const notes = chordNotes(chord.r, chord.q);

      // Light pad
      if (inBar === 0) {
        notes.forEach(n => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = mtof(n);
          const e = ctx.createGain();
          e.gain.setValueAtTime(0, beatTime);
          e.gain.linearRampToValueAtTime(0.08, beatTime + 0.2);
          e.gain.setValueAtTime(0.08, beatTime + beatDur * 3.5);
          e.gain.linearRampToValueAtTime(0, beatTime + beatDur * 4 - 0.05);
          o.connect(e);
          scheduleNode(o, gain, beatTime, beatTime + beatDur * 4);
        });
      }

      // Melodic line — simple scale walk
      const melodyPattern = [0, 2, 4, 5, 4, 2, 3, 1];
      const melIdx = beat % melodyPattern.length;
      const melNote = scale[melodyPattern[melIdx]] + 12;
      if (melNote) {
        const mo = ctx.createOscillator();
        mo.type = 'triangle';
        mo.frequency.value = mtof(melNote);
        const me = ctx.createGain();
        me.gain.setValueAtTime(0, beatTime);
        me.gain.linearRampToValueAtTime(0.1, beatTime + 0.02);
        me.gain.exponentialRampToValueAtTime(0.001, beatTime + beatDur * 0.9);
        mo.connect(me);
        scheduleNode(mo, gain, beatTime, beatTime + beatDur);
      }

      // Soft bass
      if (inBar === 0 || inBar === 2) {
        const bo = ctx.createOscillator();
        bo.type = 'sine';
        bo.frequency.value = mtof(chord.r - 12);
        const be = ctx.createGain();
        be.gain.setValueAtTime(0.12, beatTime);
        be.gain.exponentialRampToValueAtTime(0.001, beatTime + beatDur * 1.5);
        bo.connect(be);
        scheduleNode(bo, gain, beatTime, beatTime + beatDur * 2);
      }

      // Light kick on 1, 3
      if (inBar === 0 || inBar === 2) {
        const ko = ctx.createOscillator();
        ko.type = 'sine';
        ko.frequency.setValueAtTime(90, beatTime);
        ko.frequency.exponentialRampToValueAtTime(30, beatTime + 0.1);
        const ke = ctx.createGain();
        ke.gain.setValueAtTime(0.12, beatTime);
        ke.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.12);
        ko.connect(ke);
        scheduleNode(ko, gain, beatTime, beatTime + 0.15);
      }

      // Soft hihat
      {
        const src = ctx.createBufferSource();
        src.buffer = sharedNoise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 8000;
        const he = ctx.createGain();
        he.gain.setValueAtTime(0.025, beatTime);
        he.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.04);
        src.connect(hp).connect(he);
        scheduleNode(src, gain, beatTime, beatTime + 0.05);
      }

      return beatDur;
    }

    const patternFns = {
      lobby: lobbyPattern,
      hook: hookPattern,
      slash: slashPattern,
      dodge: dodgePattern,
      shoot: shootPattern,
      rhythm: rhythmPattern,
    };

    function scheduler() {
      const patternFn = patternFns[trackName];
      if (!patternFn || !running) return;
      cleanOldNodes(ctx.currentTime - 0.5);
      while (nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD) {
        const dur = patternFn(nextBeatTime, beatIndex);
        nextBeatTime += dur;
        beatIndex++;
        // Loop every 16 beats (4 bars)
        if (beatIndex >= 16) beatIndex = 0;
      }
    }

    return {
      gainNode: gain,
      start() {
        if (running) return;
        running = true;
        nextBeatTime = ctx.currentTime + 0.05;
        beatIndex = 0;
        intervalId = setInterval(scheduler, TICK_MS);
        scheduler(); // prime immediately
      },
      stop() {
        running = false;
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        // Stop all scheduled nodes
        scheduledNodes.forEach(n => {
          try { n.node.stop(); } catch (_) {}
          try { n.node.disconnect(); } catch (_) {}
        });
        scheduledNodes = [];
        try { gain.disconnect(); } catch (_) {}
      },
    };
  }

  function playBGM(trackName) {
    if (ctx.state === 'suspended') ctx.resume();

    if (currentBGM && currentBGM.name === trackName) return; // already playing

    const newTrack = createBGMTrack(trackName);
    if (!newTrack) return;

    const fadeTime = 0.8;

    if (currentBGM) {
      // Crossfade: fade out old, fade in new
      const old = currentBGM;
      const t = now();
      old.gainNode.gain.setValueAtTime(old.gainNode.gain.value, t);
      old.gainNode.gain.linearRampToValueAtTime(0, t + fadeTime);
      setTimeout(() => { old.stop(); }, fadeTime * 1000 + 100);
    }

    newTrack.start();
    const t = now();
    newTrack.gainNode.gain.setValueAtTime(0, t);
    newTrack.gainNode.gain.linearRampToValueAtTime(1, t + fadeTime);

    currentBGM = { name: trackName, ...newTrack };
  }

  function stopBGM(fadeTime = 1) {
    if (!currentBGM) return;
    const old = currentBGM;
    currentBGM = null;
    const t = now();
    old.gainNode.gain.setValueAtTime(old.gainNode.gain.value, t);
    old.gainNode.gain.linearRampToValueAtTime(0, t + fadeTime);
    setTimeout(() => { old.stop(); }, fadeTime * 1000 + 100);
  }

  function setBGMVolume(v) {
    bgmVolume = Math.min(Math.max(v, 0), 1);
    bgmBus.gain.setValueAtTime(bgmVolume, now());
  }

  // ════════════════════════════════════════════════════════
  // ██  SFX — Enhanced originals + New effects
  // ════════════════════════════════════════════════════════

  function playHit() {
    const t = now();
    const g = tmpGain(0.85, 0.2);

    // Loud transient — punchy attack
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(200, t);
    o1.frequency.exponentialRampToValueAtTime(30, t + 0.12);
    const env1 = ctx.createGain();
    env1.gain.setValueAtTime(1, t);
    env1.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    o1.connect(env1).connect(g);
    o1.start(t);
    o1.stop(t + 0.15);

    // Sub bass thump for weight
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.1);
    const subEnv = ctx.createGain();
    subEnv.gain.setValueAtTime(0.6, t);
    subEnv.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    sub.connect(subEnv).connect(g);
    sub.start(t);
    sub.stop(t + 0.12);

    // Sharper transient click
    noiseBurst(0.03, 4000, 2, g, t);
  }

  function playScore() {
    const t = now();
    const g = tmpGain(0.55, 0.5);
    const notes = [523, 659, 784]; // C5 E5 G5

    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t + i * 0.08);
      env.gain.linearRampToValueAtTime(0.7, t + i * 0.08 + 0.02);
      env.gain.exponentialRampToValueAtTime(0.01, t + i * 0.08 + 0.3);
      o.connect(env).connect(g);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.3);
    });

    // Sparkle: high frequency noise burst
    const sparkleTime = t + 0.15;
    const src = ctx.createBufferSource();
    src.buffer = sharedNoise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 10000;
    const se = ctx.createGain();
    se.gain.setValueAtTime(0.12, sparkleTime);
    se.gain.exponentialRampToValueAtTime(0.001, sparkleTime + 0.15);
    src.connect(hp).connect(se).connect(g);
    src.start(sparkleTime);
    src.stop(sparkleTime + 0.15);
  }

  function playCombo(level) {
    const t = now();
    const clampedLevel = Math.min(Math.max(level, 1), 10);
    const g = tmpGain(0.45 + clampedLevel * 0.05, 0.7);

    const baseFreq = 400 + clampedLevel * 60;
    const noteCount = Math.min(2 + clampedLevel, 8);

    for (let i = 0; i < noteCount; i++) {
      const freq = baseFreq * Math.pow(2, i / 6);
      const offset = i * 0.035;
      const o = ctx.createOscillator();
      o.type = clampedLevel > 5 ? 'sawtooth' : 'triangle';
      o.frequency.value = freq;

      let dest = g;
      // Overdrive feel at level 5+: use waveshaper
      if (clampedLevel >= 5) {
        const ws = ctx.createWaveShaper();
        const amount = Math.min((clampedLevel - 4) * 8, 40);
        const curve = new Float32Array(256);
        for (let j = 0; j < 256; j++) {
          const x = (j / 128) - 1;
          curve[j] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
        }
        ws.curve = curve;
        ws.connect(g);
        dest = ws;
      }

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t + offset);
      env.gain.linearRampToValueAtTime(0.5, t + offset + 0.015);
      env.gain.exponentialRampToValueAtTime(0.01, t + offset + 0.22);
      o.connect(env).connect(dest);
      o.start(t + offset);
      o.stop(t + offset + 0.22);
    }

    if (clampedLevel >= 5) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(60 + clampedLevel * 5, t);
      sub.frequency.exponentialRampToValueAtTime(30, t + 0.3);
      const subEnv = ctx.createGain();
      subEnv.gain.setValueAtTime(0.3, t);
      subEnv.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      sub.connect(subEnv).connect(g);
      sub.start(t);
      sub.stop(t + 0.3);
    }
  }

  function playDeath() {
    const t = now();
    const g = tmpGain(0.6, 0.8);

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

    osc('sine', 80, 40, 0.5, g, t);
    noiseBurst(0.3, 400, 0.8, g, t);
  }

  function playDash() {
    const t = now();
    const g = tmpGain(0.4, 0.2);

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

    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(200, t);
    o.frequency.linearRampToValueAtTime(600, t + 0.15);
    o.frequency.linearRampToValueAtTime(400, t + 0.3);

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
    const g = tmpGain(0.55, 0.35);

    // Sharp noise sweep — high to low, longer tail
    const bufLen = ctx.sampleRate * 0.25;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.setValueAtTime(8000, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.2);
    bp.Q.value = 4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    src.connect(bp).connect(env).connect(g);
    src.start(t);
    src.stop(t + 0.25);

    // Tonal zing — sharper
    osc('sawtooth', 1500, 300, 0.1, g, t);

    // Metallic ring
    const ring = ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.value = 2800;
    const ringEnv = ctx.createGain();
    ringEnv.gain.setValueAtTime(0.15, t);
    ringEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    ring.connect(ringEnv).connect(g);
    ring.start(t);
    ring.stop(t + 0.3);
  }

  function playShoot() {
    const t = now();
    const g = tmpGain(0.5, 0.2);

    // Quick descending square snap
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

    // Sub-bass thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.08);
    const subEnv = ctx.createGain();
    subEnv.gain.setValueAtTime(0.4, t);
    subEnv.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    sub.connect(subEnv).connect(g);
    sub.start(t);
    sub.stop(t + 0.1);
  }

  function playBeat(perfect = false) {
    const t = now();
    const g = tmpGain(0.55, 0.3);

    if (perfect) {
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

    noiseBurst(0.02, 6000, 2, g, t);
  }

  function playStart() {
    const t = now();
    const g = tmpGain(0.5, 0.8);

    const chords = [
      { freq: 523, time: 0 },
      { freq: 659, time: 0.1 },
      { freq: 784, time: 0.2 },
      { freq: 1047, time: 0.35 },
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

    osc('sine', 130, 65, 0.3, g, t);
  }

  // ── NEW SFX ──────────────────────────────────────────────

  function playGraze() {
    const t = now();
    const g = tmpGain(0.4, 0.12);

    // Quick bright ping — high, clean, short
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.6, t);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    o.connect(env).connect(g);
    o.start(t);
    o.stop(t + 0.1);

    // Tiny shimmer
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 3600;
    const e2 = ctx.createGain();
    e2.gain.setValueAtTime(0.2, t);
    e2.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    o2.connect(e2).connect(g);
    o2.start(t);
    o2.stop(t + 0.06);
  }

  function playUlt() {
    const t = now();
    const g = tmpGain(0.7, 1.2);

    // Dramatic whoosh — noise sweep
    const bufLen = ctx.sampleRate * 0.6;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.3);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.8);
    bp.Q.value = 3;
    const nEnv = ctx.createGain();
    nEnv.gain.setValueAtTime(0, t);
    nEnv.gain.linearRampToValueAtTime(0.5, t + 0.15);
    nEnv.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
    src.connect(bp).connect(nEnv).connect(g);
    src.start(t);
    src.stop(t + 0.8);

    // Bass drop
    const bass = ctx.createOscillator();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(120, t + 0.2);
    bass.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    const bEnv = ctx.createGain();
    bEnv.gain.setValueAtTime(0, t + 0.15);
    bEnv.gain.linearRampToValueAtTime(0.8, t + 0.25);
    bEnv.gain.exponentialRampToValueAtTime(0.01, t + 0.9);
    bass.connect(bEnv).connect(g);
    bass.start(t + 0.15);
    bass.stop(t + 0.9);

    // Rising tone
    const rise = ctx.createOscillator();
    rise.type = 'sawtooth';
    rise.frequency.setValueAtTime(200, t);
    rise.frequency.exponentialRampToValueAtTime(1600, t + 0.8);
    const rFilt = ctx.createBiquadFilter();
    rFilt.type = 'lowpass';
    rFilt.frequency.setValueAtTime(400, t);
    rFilt.frequency.exponentialRampToValueAtTime(3000, t + 0.7);
    const rEnv = ctx.createGain();
    rEnv.gain.setValueAtTime(0.3, t);
    rEnv.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
    rise.connect(rFilt).connect(rEnv).connect(g);
    rise.start(t);
    rise.stop(t + 1.0);
  }

  function playPickup() {
    const t = now();
    const g = tmpGain(0.45, 0.5);

    // Bubbly ascending notes — cheerful
    const freqs = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
    freqs.forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const delay = i * 0.06;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t + delay);
      env.gain.linearRampToValueAtTime(0.5, t + delay + 0.015);
      env.gain.exponentialRampToValueAtTime(0.01, t + delay + 0.15);
      o.connect(env).connect(g);
      o.start(t + delay);
      o.stop(t + delay + 0.15);
    });

    // Tiny bubble pop on each
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.08;
      const bo = ctx.createOscillator();
      bo.type = 'sine';
      bo.frequency.setValueAtTime(1800 + i * 400, t + delay);
      bo.frequency.exponentialRampToValueAtTime(800, t + delay + 0.04);
      const be = ctx.createGain();
      be.gain.setValueAtTime(0.15, t + delay);
      be.gain.exponentialRampToValueAtTime(0.01, t + delay + 0.05);
      bo.connect(be).connect(g);
      bo.start(t + delay);
      bo.stop(t + delay + 0.05);
    }
  }

  function playWhoosh() {
    const t = now();
    const g = tmpGain(0.45, 0.35);

    // Rising wind sound — filtered noise
    const bufLen = ctx.sampleRate * 0.3;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + 0.15);
    bp.frequency.exponentialRampToValueAtTime(1000, t + 0.3);
    bp.Q.value = 2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.7, t + 0.08);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    src.connect(bp).connect(env).connect(g);
    src.start(t);
    src.stop(t + 0.3);

    // Subtle tonal rise
    osc('sine', 300, 900, 0.2, g, t);
  }

  function playExplosion() {
    const t = now();
    const g = tmpGain(0.7, 0.5);

    // Deep boom
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(100, t);
    boom.frequency.exponentialRampToValueAtTime(20, t + 0.3);
    const bEnv = ctx.createGain();
    bEnv.gain.setValueAtTime(1, t);
    bEnv.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    boom.connect(bEnv).connect(g);
    boom.start(t);
    boom.stop(t + 0.35);

    // Noise crack
    noiseBurst(0.15, 2000, 0.5, g, t);

    // High debris noise
    const src = ctx.createBufferSource();
    src.buffer = sharedNoise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(3000, t);
    hp.frequency.exponentialRampToValueAtTime(6000, t + 0.2);
    const he = ctx.createGain();
    he.gain.setValueAtTime(0.3, t + 0.02);
    he.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    src.connect(hp).connect(he).connect(g);
    src.start(t);
    src.stop(t + 0.35);
  }

  function playTick() {
    const t = now();
    const g = tmpGain(0.5, 0.1);

    // Sharp urgent click
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1200;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.8, t);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
    o.connect(env).connect(g);
    o.start(t);
    o.stop(t + 0.04);

    // Tiny click transient
    noiseBurst(0.01, 8000, 3, g, t);
  }

  function playNewRecord() {
    const t = now();
    const g = tmpGain(0.55, 1.8);

    // Fanfare: ascending chord hits
    const fanfare = [
      { notes: [523, 659, 784], time: 0 },       // C maj
      { notes: [587, 740, 880], time: 0.25 },     // D maj
      { notes: [659, 831, 988], time: 0.5 },      // E maj
      { notes: [784, 988, 1175], time: 0.8 },     // G maj
      { notes: [1047, 1319, 1568], time: 1.0 },   // C maj octave
    ];

    fanfare.forEach(({ notes, time }) => {
      notes.forEach(freq => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t + time);
        env.gain.linearRampToValueAtTime(0.4, t + time + 0.03);
        env.gain.exponentialRampToValueAtTime(0.01, t + time + 0.4);
        o.connect(env).connect(g);
        o.start(t + time);
        o.stop(t + time + 0.4);
      });
    });

    // Sparkle throughout
    for (let i = 0; i < 6; i++) {
      const sTime = t + i * 0.2 + 0.1;
      const src = ctx.createBufferSource();
      src.buffer = sharedNoise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 10000 + i * 500;
      const se = ctx.createGain();
      se.gain.setValueAtTime(0.1, sTime);
      se.gain.exponentialRampToValueAtTime(0.001, sTime + 0.1);
      src.connect(hp).connect(se).connect(g);
      src.start(sTime);
      src.stop(sTime + 0.1);
    }

    // Final sub thump
    osc('sine', 100, 40, 0.4, g, t + 1.0);
  }

  function playMenuTap() {
    const t = now();
    const g = tmpGain(0.3, 0.15);

    // Subtle click
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(800, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.04);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
    o.connect(env).connect(g);
    o.start(t);
    o.stop(t + 0.06);

    // Tiny reverb tail — delayed quiet repeat
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 700;
    const e2 = ctx.createGain();
    e2.gain.setValueAtTime(0.1, t + 0.04);
    e2.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    o2.connect(e2).connect(g);
    o2.start(t + 0.04);
    o2.stop(t + 0.12);
  }

  // ── Volume controls ──────────────────────────────────────

  function setVolume(v) {
    sfxVolume = Math.min(Math.max(v, 0), 1);
    sfxBus.gain.setValueAtTime(sfxVolume, now());
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

    // BGM
    playBGM,
    stopBGM,
    setBGMVolume,

    // SFX — enhanced originals
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

    // SFX — new
    playGraze,
    playUlt,
    playPickup,
    playWhoosh,
    playExplosion,
    playTick,
    playNewRecord,
    playMenuTap,

    // Volume
    setVolume,
    setBGMVolume,
    mute,
    unmute,
    toggleMute,
  };
}

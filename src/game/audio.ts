import { MAX_SPEED, MUSIC_URL, REVERSE_MAX, gearFor, gearSpan } from "./constants";

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Overall output level of the synthesised effects. */
const MASTER_LEVEL = 0.82;

/**
 * The engine is tilted with PITCH, but only GENTLY.
 *
 * The previous version pulled the gain down by 0.55·speed + 0.22·revs, which
 * ends up at ×0.18 ≈ −12 dB (four times quieter) in 6th gear at v-max – the car
 * went silent exactly when the engine should sound most alive.
 *
 * Now the maximum attenuation is just under ×0.6 (≈ −4.5 dB), and it is mostly
 * a SPEED effect rather than a rev effect, so at LOW revs inside a gear the
 * engine stays loud:
 *
 *   1st, standstill (s 0.00, rev 0.00) → ×1.00
 *   2nd, ~120 km/h   (s 0.33, rev 0.30) → ×0.86
 *   6th, 305 km/h    (s 0.85, rev 0.07) → ×0.74   ← low revs in top gear: loud
 *   6th, 360 km/h    (s 1.00, rev 0.86) → ×0.45   ← −20 % vs. the previous curve
 *
 * The extra `rpm²` term is what makes the cut land where it is wanted: it is
 * negligible at low revs (those stay exactly as loud as before) and dominates
 * at the top of the range.
 */
const enginePitchTilt = (speed01: number, rpm01: number): number =>
  Math.max(0.4, 1 - 0.36 * speed01 - 0.09 * rpm01 - 0.15 * rpm01 * rpm01);

/**
 * All sound effects are synthesised with the WebAudio API, so the game has no
 * binary dependencies. The engine is two detuned oscillators through a low-pass
 * filter whose pitch follows the car speed; skids are filtered noise; impacts
 * are noise bursts with a low "thump".
 */
class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private limiter!: DynamicsCompressorNode;
  /** cached waveshaper curve (see distortionCurve) */
  private curveCache: Float32Array<ArrayBuffer> | null = null;
  private curveDrive = -1;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private skidGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private music: HTMLAudioElement | null = null;
  /** the player wants music (menu setting) – default on */
  private musicWanted = true;
  private musicPlaying = false;
  private musicBroken = false;

  enabled = true;
  onMusicUnavailable: (() => void) | null = null;

  /** Must be called from a user gesture (click / key). */
  unlock(): void {
    // a music start that was blocked by the autoplay policy can be retried here
    this.retryMusicIfNeeded();
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    // master → limiter → destination. The limiter keeps spikes (impacts on top
    // of the engine) from clipping, and it makes the whole mix quieter without
    // squashing the quiet parts.
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? MASTER_LEVEL : 0;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;

    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // noise buffer (1s of white noise)
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    // engine
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 500;
    this.engineFilter.Q.value = 2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = "sawtooth";
    this.osc2 = ctx.createOscillator();
    this.osc2.type = "square";
    this.osc1.frequency.value = 40;
    this.osc2.frequency.value = 20;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // skid (looping band-passed noise)
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = buf;
    skidSrc.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = "bandpass";
    skidFilter.frequency.value = 1400;
    skidFilter.Q.value = 1.2;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    skidSrc.connect(skidFilter);
    skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.master);
    skidSrc.start();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx) {
      // not a mute: with FX off the engine parameters are not updated at all
      // (see setEngine), so the synthesis costs nothing while the switch is off
      this.master.gain.setTargetAtTime(on ? MASTER_LEVEL : 0, this.ctx.currentTime, 0.05);
    }
  }

  /** speed in km/h, throttle 0..1, active = engine running */
  setEngine(kmh: number, throttle: number, active: boolean): void {
    // switched off (or never unlocked) → nothing to compute, nothing to automate
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const v = Math.abs(kmh);
    const s = Math.min(1, v / MAX_SPEED);

    // Six real gears: the rpm (pitch) climbs inside a gear and drops the moment
    // the next one is engaged. 6th is engaged at 300 km/h and revs out towards
    // the asymptote, so the last stretch is a slow, low-rpm pull.
    const gear = gearFor(kmh);
    const [from, to] = gearSpan(gear);
    const rpm =
      gear === 0 ? clamp01(v / REVERSE_MAX) : clamp01((v - from) / Math.max(1, to - from));

    const tone = gear === 0 ? 1 : gear; // reverse sounds like a low first gear
    const base = 36 + tone * 5; // higher gear = lower idle tone
    const freq = active ? base + rpm * 88 + s * 14 : 0;

    // Volume follows the tilt above: loud at low revs, only a little quieter at
    // v-max (the old curve lost 12 dB there, which made 6th gear inaudible).
    const vol = active
      ? (0.075 + throttle * 0.02) * enginePitchTilt(s, rpm)
      : 0;

    // The tone still loses a little brightness with revs, but the low-pass
    // corner keeps more of the body than before (cap ≈ 1330 Hz instead of
    // ~1000 Hz), so the engine sounds present rather than muffled.
    this.osc1.frequency.setTargetAtTime(Math.max(1, freq), t, 0.05);
    this.osc2.frequency.setTargetAtTime(Math.max(1, freq / 2), t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(
      320 + rpm * 420 + s * 300 + throttle * 170,
      t,
      0.08,
    );
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
  }

  /** amount 0..1 */
  setSkid(amount: number): void {
    if (!this.ctx || !this.enabled) return;
    this.skidGain.gain.setTargetAtTime(
      Math.min(1, amount) * 0.11,
      this.ctx.currentTime,
      0.04,
    );
  }

  /** Filtered noise burst; `delay` schedules it relative to now (seconds). */
  private noiseBurst(
    duration: number,
    volume: number,
    cutoffFrom: number,
    cutoffTo: number,
    delay = 0,
    type: BiquadFilterType = "lowpass",
    q = 0.9,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + Math.max(0, delay);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(cutoffFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(60, cutoffTo),
      t0 + duration,
    );
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + Math.min(0.004, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  /**
   * Low sine drop – the "deep thud" body. `peak` adds a resonant bump so the
   * hit sounds like it lands on a closed box rather than a bare sine.
   */
  private thump(
    duration: number,
    volume: number,
    from: number,
    to: number,
    delay = 0,
    peak?: { freq: number; q: number },
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + Math.max(0, delay);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);

    let tail: AudioNode = osc;
    if (peak) {
      const resonance = ctx.createBiquadFilter();
      resonance.type = "peaking";
      resonance.frequency.value = peak.freq;
      resonance.Q.value = peak.q;
      resonance.gain.value = 12;
      osc.connect(resonance);
      tail = resonance;
    }
    tail.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /**
   * One grain of crumpling metal / breaking glass.
   *
   * These are NOISE squawks through a narrow band-pass – deliberately not
   * oscillators: a swept tone through a band-pass is a bird chirp, while random
   * noise in a band is what steel and glass actually sound like. The playback
   * rate is jittered so repeated grains never sound like the same sample.
   */
  private metalGrain(
    delay: number,
    volume: number,
    freqFrom: number,
    freqTo: number,
    duration = 0.07,
    q = 4,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + Math.max(0, delay);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.75 + Math.random() * 0.5;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = q;
    band.frequency.setValueAtTime(freqFrom, t0);
    band.frequency.exponentialRampToValueAtTime(
      Math.max(80, freqTo),
      t0 + duration,
    );

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0006, t0 + duration);

    src.connect(band);
    band.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.03);
  }

  /**
   * tanh soft-clip curve – gives the low hit some weight without a musical pitch.
   * CACHED: a 4 KB Float32Array per impact was pure garbage (impacts happen on
   * every contact, and every allocation of that size is something the GC has to
   * walk later).
   */
  private distortionCurve(drive: number): Float32Array<ArrayBuffer> {
    if (this.curveCache && this.curveDrive === drive) return this.curveCache;
    const samples = 1024;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
    }
    this.curveCache = curve;
    this.curveDrive = drive;
    return curve;
  }

  /**
   * The body of an impact: a descending sine, saturated and low-passed. No
   * resonance bump any more – that "peaking" made a soft smack instead of a
   * hit, and this is supposed to feel like half a ton of metal.
   */
  private impact(delay: number, volume: number, duration: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + Math.max(0, delay);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t0);
    osc.frequency.exponentialRampToValueAtTime(24, t0 + duration);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distortionCurve(3);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 420;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);

    osc.connect(shaper);
    shaper.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);

    // the "crack" of the contact itself: broadband, very short
    this.noiseBurst(0.06, volume * 0.5, 5200, 900, delay);
  }

  /**
   * Small collision, intensity 0..1 – a dull, weighty knock. No resonant
   * "peaking" and no square blip: those produced the wet smack that made the
   * whole crash sound like a kiss.
   */
  bump(intensity: number): void {
    const i = Math.max(0.15, Math.min(1, intensity));
    this.impact(0, 0.16 + i * 0.2, 0.24 + i * 0.18);
    this.noiseBurst(0.1 + i * 0.12, 0.1 + i * 0.14, 1800, 240, 0);
  }

  /**
   * Sliding along sheet metal: a circular saw tearing at the bodywork
   * ("bzzz" – two detuned saws plus noise, tremolo-modulated), finished with
   * deep, boxy knocks as the panels buckle.
   */
  scrape(intensity = 0.7): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const i = Math.max(0.1, Math.min(1, intensity));
    const t0 = ctx.currentTime;
    const dur = 0.3;

    // amplitude modulation – this tremolo is what makes it a SAW and not a hum
    const grindGain = ctx.createGain();
    grindGain.gain.setValueAtTime(0.0001, t0);
    grindGain.gain.linearRampToValueAtTime(0.075 * i, t0 + 0.008);
    grindGain.gain.setValueAtTime(0.075 * i, t0 + dur * 0.72);
    grindGain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 46; // blade teeth passing the metal
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.06 * i;
    lfo.connect(lfoDepth);
    lfoDepth.connect(grindGain.gain);

    const tone = ctx.createBiquadFilter();
    tone.type = "bandpass";
    tone.frequency.value = 1500 + 900 * i;
    tone.Q.value = 1.2;

    const teeth = ctx.createBiquadFilter();
    teeth.type = "highpass";
    teeth.frequency.value = 320;

    for (const f of [138, 173]) {
      const saw = ctx.createOscillator();
      saw.type = "sawtooth";
      saw.frequency.value = f;
      saw.connect(teeth);
      saw.start(t0);
      saw.stop(t0 + dur + 0.05);
    }

    teeth.connect(tone);
    tone.connect(grindGain);
    grindGain.connect(this.master);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);

    // the hiss of torn metal riding on top of the buzz
    this.noiseBurst(0.26, 0.06 * i, 2400, 1200, 0, "bandpass", 0.9);

    // ...and the panels taking the hit: deep and boxy
    this.thump(0.22, 0.16 * i, 130, 48, 0.01, { freq: 200, q: 7 });
    this.thump(0.16, 0.1 * i, 100, 42, 0.11, { freq: 165, q: 6 });
    this.noiseBurst(0.14, 0.05 * i, 900, 260, 0.02);
  }

  /** Part 1 of the crash: the deep, weighty hit (saturated low sine + crack). */
  private deepHit(delay: number, strength: number): void {
    this.impact(delay, 0.5 * strength, 0.95);
    this.noiseBurst(0.45, 0.2 * strength, 900, 110, delay);
    this.noiseBurst(0.12, 0.14 * strength, 2600, 700, delay + 0.01);
  }

  /**
   * Part 2 of the crash: a can being crushed. Dense metal grains at first,
   * thinning out – all noise in a band-pass, so it reads as sheet steel and
   * never chirps.
   */
  private crushCan(delay: number): void {
    // 10 grains instead of 16: each one builds three WebAudio nodes, and a crash
    // used to allocate ~120 nodes in a single frame – a burst big enough to be
    // noticed as a hitch right after an accident.
    const grains = 10;
    for (let i = 0; i < grains; i++) {
      const at = delay + Math.pow(i / grains, 1.35) * 0.55;
      const from = 650 + Math.random() * 1500;
      this.metalGrain(
        at,
        0.04 + Math.random() * 0.05,
        from,
        from * (0.45 + Math.random() * 0.35),
        0.05 + Math.random() * 0.09,
        3.5 + Math.random() * 3,
      );
    }
    // the buckled box gives way once – a low, dry thud (no resonance bump)
    this.thump(0.3, 0.16, 135, 52, delay + 0.03);
    this.noiseBurst(0.24, 0.1, 1200, 260, delay + 0.05);
  }

  /**
   * Part 3 of the crash: glass. Many tiny high shards, plus a few longer
   * tinkles – noise again, just far up the spectrum.
   */
  private shatterGlass(delay: number): void {
    // 24 → 14 shards, same reasoning as crushCan: fewer nodes per crash
    const shards = 14;
    for (let i = 0; i < shards; i++) {
      const at = delay + Math.random() * 0.42;
      const from = 4200 + Math.random() * 3600;
      this.metalGrain(
        at,
        0.02 + Math.random() * 0.035,
        from,
        from * (0.6 + Math.random() * 0.3),
        0.02 + Math.random() * 0.05,
        6 + Math.random() * 5,
      );
    }
    // a handful of shards keep ringing as they settle
    for (let i = 0; i < 4; i++) {
      const at = delay + 0.06 + Math.random() * 0.4;
      const from = 5200 + Math.random() * 2200;
      this.metalGrain(at, 0.022, from, from * 0.7, 0.3 + Math.random() * 0.3, 9);
    }
  }

  /**
   * Full crash, in the requested order:
   *   1. deep impact,  2. crushed can,  3. shattering glass.
   */
  crash(): void {
    this.deepHit(0, 1);
    this.crushCan(0.12);
    this.shatterGlass(0.3);
  }

  beep(high: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = high ? 1320 : 880;
    const gain = ctx.createGain();
    const d = high ? 0.5 : 0.12;
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + d + 0.05);
  }

  // ---- music (the original track, streamed from the original repository) ----
  /**
   * Music is driven by the RACE state, not by the player:
   *   - it starts FROM THE BEGINNING when the countdown ends (phase "playing"),
   *   - it is stopped completely on a crash or at the finish line.
   *
   * "Completely" is meant literally: pausing alone kept the element parked in
   * the middle of the track, so the next run resumed from there and the music
   * seemed to have been running all along (only muted). Every stop now rewinds
   * to 0:00:00 as well, and every start rewinds again, so each race gets the
   * track from the first note.
   *
   * The setting below only decides whether the player wants music at all.
   */
  setMusicWanted(on: boolean): void {
    this.musicWanted = on;
    if (!on) {
      this.musicPlaying = false;
      this.stopMusic();
    }
  }

  isMusicWanted(): boolean {
    return this.musicWanted && !this.musicBroken;
  }

  /** Called by the scene on every phase change. */
  setMusicPlaying(active: boolean): void {
    if (this.musicBroken) return;
    if (active) {
      if (!this.musicWanted || this.musicPlaying) return;
      // start of a race: play the track from its first second
      this.musicPlaying = true;
      this.playMusic(true);
    } else if (this.musicPlaying) {
      this.musicPlaying = false;
      this.stopMusic();
    }
  }

  isMusicPlaying(): boolean {
    return this.musicPlaying;
  }

  /**
   * Pause AND rewind – the element is never left mid-track.
   *
   * This is a REAL stop, not a mute: the `<audio>` element stops decoding and
   * releases the network stream, so with music switched off (or between races)
   * nothing is buffered or decoded in the background and no CPU/memory is spent
   * on a track nobody hears.
   */
  private stopMusic(): void {
    const a = this.music;
    if (!a) return;
    a.pause();
    try {
      a.currentTime = 0;
    } catch {
      /* seek not possible yet – harmless */
    }
  }

  /** Retry a playback that the browser refused (called from a user gesture). */
  retryMusicIfNeeded(): void {
    if (this.musicPlaying && this.music && this.music.paused && !this.musicBroken) {
      void this.music.play().catch(() => undefined);
    }
  }

  private playMusic(restart = false): void {
    if (this.musicBroken) return;
    if (!this.music) {
      const a = new Audio(MUSIC_URL);
      a.loop = true;
      a.volume = 0.45;
      // NOTHING is downloaded or decoded until the first race starts: with
      // "auto" the browser began buffering the track while the player was still
      // sitting in the menu, which competes with the game for CPU and memory.
      a.preload = "none";
      a.addEventListener("error", () => {
        this.musicBroken = true;
        this.musicWanted = false;
        this.musicPlaying = false;
        this.onMusicUnavailable?.();
      });
      this.music = a;
    }
    // start buffering only now that the track is really going to be played
    this.music.preload = "auto";
    if (restart) {
      try {
        this.music.currentTime = 0;
      } catch {
        /* seek not possible before metadata – playback still starts at 0 */
      }
    }
    void this.music.play().catch(() => {
      // playback can still be refused (autoplay policy) – retried from the
      // next real user gesture via retryMusicIfNeeded()
      this.musicPlaying = false;
    });
  }
}

export const audio = new GameAudio();

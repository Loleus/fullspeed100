/**
 * Particles and the time-based FX/audio pacing, separated from the scene.
 *
 * Everything that used to run "once per rendered frame" is bound to time here,
 * so a 144 Hz or 260 Hz display gets exactly the same amount of particles and
 * WebAudio work as a 60 Hz one (and never a burst after a stalled frame).
 */
import Phaser from "phaser";
import { DEBUG } from "./debug";
import { Rnd } from "./rng";
import { TEX } from "./textures";

const SKID_EMIT_MS = 26; // smoke puffs per wheel
const SKID_BURST_MAX = 3;
const SMOKE_EMIT_MS = 45; // wreck smoke
const SMOKE_BURST_MAX = 4;
const AUDIO_UPDATE_MS = 50; // WebAudio parameter updates

export class SceneFx {
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private skid!: Phaser.GameObjects.Particles.ParticleEmitter;

  private skidAcc = 0;
  private smokeAcc = 0;
  private audioAcc = 0;
  /** which wreck is next in line for a smoke puff */
  private smokeCursor = 0;

  create(scene: Phaser.Scene): void {
    // diagnostic switch: ?no=fx replaces every emitter with a no-op
    if (!DEBUG.fx) {
      const noop = {
        explode: () => undefined,
        emitParticleAt: () => undefined,
        killAll: () => undefined,
      };
      this.sparks = noop as unknown as Phaser.GameObjects.Particles.ParticleEmitter;
      this.smoke = noop as unknown as Phaser.GameObjects.Particles.ParticleEmitter;
      this.skid = noop as unknown as Phaser.GameObjects.Particles.ParticleEmitter;
      return;
    }
    // speeds scaled with the world (which scrolls 5.556 px per km/h), otherwise
    // the sparks would look glued to the car
    this.sparks = scene.add
      .particles(0, 0, TEX.SPARK, {
        lifespan: { min: 160, max: 520 },
        speed: { min: 180, max: 900 },
        scale: { start: 1.1, end: 0 },
        quantity: 0,
        maxParticles: 140,
        blendMode: "ADD",
        emitting: false,
        tint: [0xffc857, 0xffffff, 0xff7b2e],
      })
      .setDepth(12);

    this.smoke = scene.add
      .particles(0, 0, TEX.SMOKE, {
        lifespan: { min: 500, max: 1200 },
        speed: { min: 30, max: 180 },
        scale: { start: 1.5, end: 3.0 },
        alpha: { start: 0.5, end: 0 },
        quantity: 0,
        maxParticles: 160,
        emitting: false,
        tint: [0xe8e8e8, 0xa9a9a9, 0x4a4a4a],
      })
      .setDepth(11);

    this.skid = scene.add
      .particles(0, 0, TEX.SMOKE, {
        lifespan: { min: 380, max: 900 },
        speed: { min: 20, max: 100 },
        scale: { start: 0.7, end: 1.8 },
        alpha: { start: 0.32, end: 0 },
        quantity: 0,
        emitting: false,
        // hard ceilings: particle objects are the one thing the game creates in
        // real volume, and an unbounded emitter is the easiest way to make the
        // frame time creep up the longer a run lasts
        maxParticles: 120,
        tint: 0xdcdcdc,
      })
      .setDepth(7);
  }

  reset(): void {
    this.smoke.killAll();
    this.skid.killAll();
    this.skidAcc = 0;
    this.smokeAcc = 0;
    this.smokeCursor = 0;
  }

  burstSparks(x: number, y: number, count: number): void {
    this.sparks.explode(count, x, y);
  }



  /**
   * Wreck smoke: a burst at the crash, then a steady 45 ms stream.
   *
   * The emission is shared by EVERY wreck (the player and each destroyed
   * opponent – they all burn after the crash) and is time-based, so a 144 Hz
   * screen does not get four times the puffs of a 60 Hz one. One accumulator is
   * enough; the caller decides how many wrecks feed it per frame.
   */
  wreckSmoke(
    delta: number,
    sources: ReadonlyArray<{ x: number; y: number }>,
    count: number,
    rng: Rnd,
  ): void {
    if (count <= 0) return;
    this.smokeAcc += delta;
    let guard = 0;
    while (this.smokeAcc > SMOKE_EMIT_MS && guard < SMOKE_BURST_MAX) {
      this.smokeAcc -= SMOKE_EMIT_MS;
      guard++;
      // round-robin over the wrecks, so each of them smokes on its own
      const src = sources[this.smokeCursor % count];
      this.smokeCursor++;
      this.smoke.emitParticleAt(
        src.x + rng.nextRange(-10, 10),
        src.y + rng.nextRange(-20, 20),
        1,
      );
    }
    this.smokeAcc = Math.min(this.smokeAcc, SMOKE_EMIT_MS);
  }

  explodeSmoke(x: number, y: number, count: number): void {
    this.smoke.explode(count, x, y);
  }

  /** Tyre smoke under the rear wheels while sliding. */
  skidSmoke(delta: number, wheels: ReadonlyArray<{ x: number; y: number }>): void {
    this.skidAcc += delta;
    let guard = 0;
    while (this.skidAcc >= SKID_EMIT_MS && guard < SKID_BURST_MAX) {
      this.skidAcc -= SKID_EMIT_MS;
      guard++;
      for (const w of wheels) this.skid.emitParticleAt(w.x, w.y, 1);
    }
    this.skidAcc = Math.min(this.skidAcc, SKID_EMIT_MS);
  }

  stopSkid(): void {
    this.skidAcc = 0;
  }

  /** WebAudio parameters are updated at a fixed rate too (no per-frame spam). */
  shouldUpdateAudio(delta: number): boolean {
    this.audioAcc += delta;
    if (this.audioAcc < AUDIO_UPDATE_MS) return false;
    this.audioAcc = 0;
    return true;
  }
}

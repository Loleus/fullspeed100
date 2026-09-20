import Phaser from "phaser";

/**
 * Minimal, typed view on the Matter.js `Body` module bundled with Phaser
 * (Matter 0.20). Velocities are expressed per base delta (1/60 s), so
 * `px/s = v * STEPS_PER_SECOND`.
 */
export interface MatterBodyApi {
  getVelocity(body: MatterJS.BodyType): { x: number; y: number };
  setVelocity(body: MatterJS.BodyType, v: { x: number; y: number }): void;
  getAngularVelocity(body: MatterJS.BodyType): number;
  setAngularVelocity(body: MatterJS.BodyType, v: number): void;
  setStatic(body: MatterJS.BodyType, isStatic: boolean): void;
  setPosition(
    body: MatterJS.BodyType,
    p: { x: number; y: number },
    updateVelocity?: boolean,
  ): void;
  setStatic(body: MatterJS.BodyType, isStatic: boolean): void;
  setAngle(body: MatterJS.BodyType, angle: number, updateVelocity?: boolean): void;
}

// `Phaser.Physics.Matter.Matter` is the raw Matter.js namespace (not covered by
// the bundled typings), so we reach it through a small cast.
export const MBody = (
  Phaser.Physics.Matter as unknown as { Matter: { Body: MatterBodyApi } }
).Matter.Body;

export const STEPS_PER_SECOND = 60;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Move `value` towards `target` by at most `maxDelta`. */
export const approach = (value: number, target: number, maxDelta: number): number => {
  if (value < target) return Math.min(target, value + maxDelta);
  if (value > target) return Math.max(target, value - maxDelta);
  return value;
};

/** Wrap an angle into (-PI, PI]. */
export const wrapAngle = (a: number): number => {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
};

/** Shared scratch vector – reading a velocity must NOT allocate (this runs for
 *  every car, every physics step: ~800 objects/s otherwise, which is enough to
 *  keep the garbage collector busy and make the game stutter). */
const _scratchV = { x: 0, y: 0 };

/**
 * Velocity of a body in px/s, written into `out` (or a shared scratch object when
 * omitted). The result is a VIEW – copy it if you need to keep it around.
 */
export const readVelocityPxPerSec = (
  body: MatterJS.BodyType,
  out: { x: number; y: number } = _scratchV,
): { x: number; y: number } => {
  const v = MBody.getVelocity(body);
  out.x = v.x * STEPS_PER_SECOND;
  out.y = v.y * STEPS_PER_SECOND;
  return out;
};

/** Allocation-free shorthand for one-off reads. Same caveat: a shared view. */
export const velocityPxPerSec = (body: MatterJS.BodyType): { x: number; y: number } =>
  readVelocityPxPerSec(body, _scratchV);

/** Second scratch vector, for writes. Matter reads the values immediately, so
 *  handing it the same object every time is safe and saves a vector per call –
 *  and this is called for the player plus every opponent, on every step. */
const _scratchW = { x: 0, y: 0 };

export const setVelocityPxPerSec = (
  body: MatterJS.BodyType,
  x: number,
  y: number,
): void => {
  _scratchW.x = x / STEPS_PER_SECOND;
  _scratchW.y = y / STEPS_PER_SECOND;
  MBody.setVelocity(body, _scratchW);
};

/** Allocation-free `Body.setPosition` (positions are in px, same units). */
export const setPositionPx = (
  body: MatterJS.BodyType,
  x: number,
  y: number,
  updateVelocity = false,
): void => {
  _scratchW.x = x;
  _scratchW.y = y;
  MBody.setPosition(body, _scratchW, updateVelocity);
};

export const angularVelocityRadPerSec = (body: MatterJS.BodyType): number =>
  MBody.getAngularVelocity(body) * STEPS_PER_SECOND;

export const setAngularVelocityRadPerSec = (
  body: MatterJS.BodyType,
  w: number,
): void => {
  MBody.setAngularVelocity(body, w / STEPS_PER_SECOND);
};

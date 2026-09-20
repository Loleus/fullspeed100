/**
 * Collision helpers.
 *
 * Kept free of any scene state, so the two very different detection paths used
 * by the game can share them:
 *   – Matter's own `collisionstart` events (deep contacts), and
 *   – the swept-segment safety net for the pairs the discrete detector misses
 *     at motorway speeds (see GameScene#sweepContacts).
 */
import * as C from "./constants";
import { MBody, STEPS_PER_SECOND } from "./physics";

export type Vec = { x: number; y: number };

/**
 * NOTE: Matter/Phaser do not guarantee any of these members to exist: pairs can
 * arrive with `null` bodies, and `collision`, `collision.normal` as well as the
 * entries of `collision.supports` may be `null` as well.
 */
export interface CollisionPairLike {
  bodyA?: MatterJS.BodyType | null;
  bodyB?: MatterJS.BodyType | null;
  collision?: {
    normal?: Vec | null;
    supports?: ReadonlyArray<Vec | null> | null;
  } | null;
}

/**
 * Liang–Barsky: does the segment (x0,y0)→(x1,y1) touch the axis-aligned box?
 */
export function segmentHitsBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, x0 - minX) && clip(dx, maxX - x0) && clip(-dy, y0 - minY) && clip(dy, maxY - y0)
  );
}

/** Contact point: average of Matter's supports, or the midpoint of the cars. */
export function contactPoint(
  pair: CollisionPairLike,
  playerBody: MatterJS.BodyType,
  other: MatterJS.BodyType,
  fallback: Vec,
): Vec {
  const supports = pair.collision ? pair.collision.supports : undefined;
  if (Array.isArray(supports)) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const s of supports) {
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) {
        sx += s.x;
        sy += s.y;
        n++;
      }
    }
    if (n > 0) return { x: sx / n, y: sy / n };
  }
  const p = playerBody.position;
  const o = other.position;
  if (p && o && Number.isFinite(p.x) && Number.isFinite(o.x)) {
    return { x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 };
  }
  return { ...fallback };
}

/** Unit contact normal: Matter's (if usable) or the axis between the bodies. */
export function contactNormal(
  pair: CollisionPairLike,
  playerBody: MatterJS.BodyType,
  other: MatterJS.BodyType,
): Vec {
  const raw = pair.collision ? pair.collision.normal : undefined;
  if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
    const len = Math.hypot(raw.x, raw.y);
    if (len > 1e-6) return { x: raw.x / len, y: raw.y / len };
  }
  const p = playerBody.position;
  const o = other.position;
  if (p && o) {
    let dx = p.x - o.x;
    let dy = p.y - o.y;
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) return { x: dx / len, y: dy / len };
      // bodies on top of each other – use the velocity difference instead
      const pv = MBody.getVelocity(playerBody);
      const ov = MBody.getVelocity(other);
      if (pv && ov) {
        dx = pv.x - ov.x;
        dy = pv.y - ov.y;
        const l2 = Math.hypot(dx, dy);
        if (l2 > 1e-6) return { x: dx / l2, y: dy / l2 };
      }
    }
  }
  return { x: 0, y: -1 };
}

/** Relative closing speed along `n`, in km/h, from Matter's per-step velocities. */
export function normalImpactKmh(
  playerBody: MatterJS.BodyType,
  other: MatterJS.BodyType,
  n: Vec,
): number {
  const pv = MBody.getVelocity(playerBody);
  const ov = MBody.getVelocity(other);
  if (!pv || !ov) return 0;
  const along = (pv.x - ov.x) * n.x + (pv.y - ov.y) * n.y;
  const kmh = (Math.abs(along) * STEPS_PER_SECOND) / C.KPH_TO_PX;
  return Number.isFinite(kmh) ? kmh : 0;
}

/**
 * Broad phase for the swept test: could the player's travelled segment possibly
 * reach this other body?
 *
 * One cheap axis-aligned reject before the Liang–Barsky clip. It throws out the
 * vast majority of cars (typically only the one being overtaken is within reach)
 * and it allocates nothing – the narrow phase then runs ~10× less often.
 */
export function sweepReaches(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  otherX: number,
  otherY: number,
): boolean {
  const minX = Math.min(x0, x1) - C.CAR_W;
  const maxX = Math.max(x0, x1) + C.CAR_W;
  const minY = Math.min(y0, y1) - C.CAR_H;
  const maxY = Math.max(y0, y1) + C.CAR_H;
  return otherX >= minX && otherX <= maxX && otherY >= minY && otherY <= maxY;
}

/**
 * Grinding speed: the difference of velocity ALONG the player's own axis, in
 * km/h. This is the severity of a side contact – how fast the two cars are
 * tearing past each other – and it is what a scrape should be billed by.
 */
export function longitudinalImpactKmh(
  playerBody: MatterJS.BodyType,
  other: MatterJS.BodyType,
): number {
  const pv = MBody.getVelocity(playerBody);
  const ov = MBody.getVelocity(other);
  if (!pv || !ov) return 0;
  const a = playerBody.angle ?? 0;
  const fx = Math.sin(a);
  const fy = -Math.cos(a);
  const along = (pv.x - ov.x) * fx + (pv.y - ov.y) * fy;
  const kmh = (Math.abs(along) * STEPS_PER_SECOND) / C.KPH_TO_PX;
  return Number.isFinite(kmh) ? kmh : 0;
}

export interface SweepHit {
  impactKmh: number;
  contact: Vec;
  /** which part of the player's car was hit (see constants.ContactZone) */
  zone: C.ContactZone;
  /** true when the other car was met head-on (it drives the opposite way) */
  headOn: boolean;
}

/**
 * Classifies a contact in the PLAYER's frame of reference.
 *
 *   side   – centres alongside each other: the cars are parked next to one
 *            another and drag along their whole length ("przytulenie")
 *   corner – the overlap is small and the contact is near a corner
 *            ("zahaczanie narożnika")
 *   rear   – one car is clearly ahead of the other, overlap is full
 *
 * @param playerAngle body angle of the player (0 = driving "up")
 */
export function contactZone(
  playerX: number,
  playerY: number,
  playerAngle: number,
  otherX: number,
  otherY: number,
): C.ContactZone {
  const fx = Math.sin(playerAngle);
  const fy = -Math.cos(playerAngle);
  const dx = otherX - playerX;
  const dy = otherY - playerY;

  // along / across, both in units of the car's outer size (4 m long, 1.6 m wide)
  const along = (dx * fx + dy * fy) / C.CAR_H;
  const across = (dx * -fy + dy * fx) / C.CAR_W;
  const overlapAlong = Math.max(0, 1 - Math.abs(along));
  const overlapAcross = Math.max(0, 1 - Math.abs(across));

  if (overlapAlong < 0.45) return "side";
  if (overlapAlong < 0.72 && overlapAcross < 0.5) return "corner";
  return "rear";
}

const RANK: Record<C.ContactZone, number> = { corner: 0, rear: 1, side: 2 };

/** Picks the worse of two zones (a side hit is always the worst news). */
export function worstZone(a: C.ContactZone, b: C.ContactZone): C.ContactZone {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Angle of travel of a body, in the same frame as the player's body angle. */
export function headingOf(vx: number, vy: number): number {
  // forward = (sin a, -cos a), so a = atan2(vx, -vy)
  return Math.atan2(vx, -vy);
}

/**
 * Swept test of the player's centre segment against one opponent box (inflated
 * by the player's half extents). Returns the relative closing speed in km/h.
 *
 * A side swipe (player's centre alongside the opponent, beyond its ends) counts
 * only the LATERAL relative speed – otherwise merely overtaking a car closely
 * would be charged as a full head-on impact.
 */
export function sweepImpact(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  otherBody: MatterJS.BodyType,
  otherCentreX: number,
  otherCentreY: number,
  dt: number,
): SweepHit | null {
  const ob = otherBody.position;
  if (!ob) return null;
  const halfW = C.CAR_W / 2;
  const halfH = C.CAR_H / 2;
  if (!segmentHitsBox(x0, y0, x1, y1, ob.x - halfW * 2, ob.y - halfH * 2, ob.x + halfW * 2, ob.y + halfH * 2)) {
    return null;
  }

  // relative displacement over the step: player's own movement minus the
  // opponent's (taken from its velocity, which Matter keeps in px/step)
  const ov = otherBody.velocity;
  const ovx = (ov?.x ?? 0) * STEPS_PER_SECOND * dt;
  const ovy = (ov?.y ?? 0) * STEPS_PER_SECOND * dt;

  const dxc = Math.abs(x1 - ob.x);
  const dyc = Math.abs(y1 - ob.y);
  const sideSwipe = dxc < halfW * 2 && dyc > halfH * 1.4;
  const relPxPerSec =
    (sideSwipe ? Math.hypot(x1 - x0 - ovx, 0) : Math.hypot(x1 - x0 - ovx, y1 - y0 - ovy)) /
    Math.max(dt, 1e-4);

  // head-on: the other car travels roughly against the player's heading
  const pv = otherBody.velocity ?? { x: 0, y: 0 };
  const otherHeading = headingOf(pv.x, pv.y);
  const headOn = Math.abs(otherHeading) > Math.PI / 2;

  return {
    impactKmh: relPxPerSec / C.KPH_TO_PX,
    contact: { x: (x1 + otherCentreX) / 2, y: (y1 + otherCentreY) / 2 },
    zone: sideSwipe ? "side" : "corner",
    headOn,
  };
}

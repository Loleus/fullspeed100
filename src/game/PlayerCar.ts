import Phaser from "phaser";
import * as C from "./constants";
import { DEBUG } from "./debug";
import { TEX } from "./textures";
import {
  MBody,
  angularVelocityRadPerSec,
  approach,
  clamp,
  lerp,
  readVelocityPxPerSec,
  setAngularVelocityRadPerSec,
  setPositionPx,
  setVelocityPxPerSec,
  velocityPxPerSec,
  wrapAngle,
} from "./physics";

export interface CarInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  brake: boolean;
}

/**
 * The player's car: a dynamic Matter body driven by a simple but "real"
 * top-down car model.
 *
 *  - longitudinal: engine force (fading with speed), brakes, rolling + aero
 *    drag, extra drag on the gravel shoulder, handbrake;
 *  - lateral: the tyres continuously kill sideways velocity ("grip"); low
 *    grip (gravel / handbrake / wreck) lets the car slide;
 *  - steering: bicycle model, yaw rate = v / wheelbase * tan(steer angle);
 *  - a light stability assist eases the heading back to the road direction.
 *
 * Collisions are entirely handled by Matter – we only ever *modify* the current
 * velocity, never overwrite it from scratch, so impacts are preserved.
 */
export class PlayerCar {
  /**
   * NOTE: the car is deliberately NOT a `Matter.Sprite`.
   *
   * On a Matter sprite the `x`/`y`/`rotation` setters (and `setPosition` /
   * `setRotation`) forward to `Matter.Body.setPosition` – writing to them each
   * frame for render interpolation would drag the physics body itself and
   * corrupt the simulation. Instead the body is a plain Matter rectangle and
   * the visuals are an ordinary Image that this class positions freely, which
   * is what makes sub-step-smooth rendering possible.
   */
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  private bodyRef: MatterJS.BodyType | null = null;

  kmh = 0;
  steer = 0;
  throttle = 0;
  health = 100;
  distance = 0; // metres
  time = 0; // seconds
  fullSpeed = 0; // seconds at top speed
  topSpeed = 0;
  slip = 0; // lateral speed (px/s) – used for skid FX
  /** > 0 right after a contact: the tyres are unsettled and slide a bit. */
  private impactTimer = 0;
  /** scratch: reused every step instead of allocating a vector per read */
  private readonly vel = { x: 0, y: 0 };
  /** scratch: the two rear-wheel positions, rewritten on every call */
  private readonly wheels = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  offroad = false;
  alive = true;
  controllable = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.shadow = scene.add.image(x, y, TEX.SHADOW).setDepth(8);
    // diagnostic switch: ?no=shadow
    if (!DEBUG.shadow) this.shadow.setVisible(false);
    this.sprite = scene.add.image(x, y, TEX.PLAYER).setDepth(10);
    // Body size == sprite size (32 × 80 px = 1.6 m × 4 m). It used to be 4 px
    // narrower and shorter than the drawing, which left an invisible 2 px slack
    // on each side – enough to squeeze "between" two cars without contact.
    this.bodyRef = scene.matter.add.rectangle(x, y, C.CAR_W, C.CAR_H, {
      label: "player",
      mass: C.PLAYER_MASS,
      // grippy, non-bouncy car-to-car material (see constants.CAR_FRICTION)
      friction: C.CAR_FRICTION,
      frictionStatic: C.CAR_FRICTION_STATIC,
      frictionAir: 0,
      restitution: C.CAR_RESTITUTION,
      slop: 0.03,
      chamfer: { radius: 6 },
      // player ↔ walls and opponents only (see constants: Collision categories)
      collisionFilter: C.FILTER_PLAYER,
    });
    this.interpSnap(x, y, 0);
  }

  /**
   * Render interpolation state. Matter always simulates at a fixed 60 Hz, but
   * the renderer may run at 144 / 260 Hz – without interpolation the car would
   * visibly step at 60 Hz on fast displays (and stutter whenever a frame gets
   * 0 or 2 physics steps). The two snapshots below let us draw the car between
   * the last two physics states, which makes motion smooth at ANY refresh rate
   * while physics stays bit-for-bit identical everywhere.
   */
  private prevX = 0;
  private prevY = 0;
  private prevA = 0;
  private curX = 0;
  private curY = 0;
  private curA = 0;
  /** interpolated (rendered) state */
  private reX = 0;
  private reY = 0;
  private reA = 0;
  private hasInterp = false;

  /** Live Matter body, or `null` once the scene was destroyed. */
  get body(): MatterJS.BodyType | null {
    return this.bodyRef;
  }
  get x(): number {
    const b = this.body;
    return b && b.position && Number.isFinite(b.position.x) ? b.position.x : this.reX;
  }
  get y(): number {
    const b = this.body;
    return b && b.position && Number.isFinite(b.position.y) ? b.position.y : this.reY;
  }

  /** Shifts the whole interpolation window (world rebase – see GameScene). */
  shiftRenderY(dy: number): void {
    this.prevY -= dy;
    this.curY -= dy;
    this.reY -= dy;
  }

  /** Position as drawn on screen (interpolated between physics steps). */
  get renderX(): number {
    return this.reX;
  }
  get renderY(): number {
    return this.reY;
  }

  /** Where the car was at the beginning of the last physics step (px). */
  get lastStepX(): number {
    return this.prevX;
  }
  get lastStepY(): number {
    return this.prevY;
  }

  /** Physics step boundary: shift the snapshot window. */
  interpAdvance(): void {
    const b = this.body;
    if (!b || !b.position) return;
    if (!this.hasInterp) {
      this.interpSnap(b.position.x, b.position.y, b.angle);
      return;
    }
    this.prevX = this.curX;
    this.prevY = this.curY;
    this.prevA = this.curA;
    this.curX = b.position.x;
    this.curY = b.position.y;
    this.curA = b.angle;
  }

  /** Collapse the window onto one state (teleports: reset / spawn / park). */
  interpSnap(x: number, y: number, a: number): void {
    this.prevX = this.curX = this.reX = x;
    this.prevY = this.curY = this.reY = y;
    this.prevA = this.curA = this.reA = a;
    this.hasInterp = true;
  }

  /** Compute the state to draw this frame (alpha = 0..1 inside a step). */
  interpRender(alpha: number): void {
    if (!this.hasInterp) return;
    this.reX = this.prevX + (this.curX - this.prevX) * alpha;
    this.reY = this.prevY + (this.curY - this.prevY) * alpha;
    const dA = this.curA - this.prevA;
    this.reA = Math.abs(dA) > Math.PI ? this.curA : this.prevA + dA * alpha;
  }

  reset(x: number, y: number): void {
    const b = this.body;
    if (!b) return;
    this.interpSnap(x, y, 0);
    setPositionPx(b, x, y);
    MBody.setAngle(b, 0);
    setVelocityPxPerSec(b, 0, 0);
    MBody.setAngularVelocity(b, 0);
    this.kmh = 0;
    this.steer = 0;
    this.throttle = 0;
    this.health = 100;
    this.distance = 0;
    this.time = 0;
    this.fullSpeed = 0;
    this.topSpeed = 0;
    this.slip = 0;
    this.offroad = false;
    this.alive = true;
    this.impactTimer = 0;
    this.controllable = false;
    this.sprite.clearTint();
    this.sprite.setAlpha(1);
    this.syncVisuals();
  }

  /** One physics step. `counting` = the run timer / odometer is active. */
  fixedStep(dt: number, input: CarInput, counting: boolean): void {
    const body = this.body;
    if (!body) return;
    const rot = body.angle;
    // forward and right unit vectors (sprite points "up" at rotation 0)
    const fx = Math.sin(rot);
    const fy = -Math.cos(rot);
    const rx = Math.cos(rot);
    const ry = Math.sin(rot);

    const v = readVelocityPxPerSec(body, this.vel);
    // ---- collision sanity ------------------------------------------------
    // A hit may not teleport the car: cap the total speed and, above all, the
    // sideways component (see constants.IMPACT_SPEED_MARGIN). Without this a
    // 60 km/h-contact could be turned by the solver into a 200+ km/h launch.
    let vx = v.x;
    let vy = v.y;
    const speed = Math.hypot(vx, vy);
    const maxSpeedPx = C.MAX_SPEED * C.KPH_TO_PX * C.IMPACT_SPEED_MARGIN;
    if (speed > maxSpeedPx) {
      const k = maxSpeedPx / speed;
      vx *= k;
      vy *= k;
    }
    let vf = vx * fx + vy * fy; // forward component
    let vr = clamp(
      vx * rx + vy * ry, // lateral component
      -C.IMPACT_LATERAL_MAX,
      C.IMPACT_LATERAL_MAX,
    );
    let kmh = vf / C.KPH_TO_PX;
    const t = clamp(Math.abs(kmh) / C.MAX_SPEED, 0, 1);

    const cx = body.position.x;
    this.offroad = cx < C.ROAD_LEFT + 10 || cx > C.ROAD_RIGHT - 10;

    const ctrl = this.controllable && this.alive;
    const braking = ctrl && input.down;
    const gas = ctrl && !braking && input.up;
    const hand = ctrl && input.brake;
    this.throttle = gas ? 1 : 0;

    // --- longitudinal -----------------------------------------------------
    // Road load (rolling + aero) is applied in every situation – coasting,
    // braking, off throttle. Under throttle the engine has to make it up, so
    // the power curve adds it back: the *net* acceleration is therefore exactly
    // the designed curve a(v) = ENGINE_ACCEL * (1 - (v/vmax)^ENGINE_CURVE_EXP)
    // and not a linear ramp that pushes 100 km/h on the clock every 3 s.
    const roadDrag = C.ROLL_DRAG + C.AERO_DRAG * Math.abs(kmh);
    if (gas) {
      if (kmh >= 0) {
        // power fades towards the ASYMPTOTE (ENGINE_V_MAX = 370), not towards
        // the design v-max (360) – so 360 is still reached in finite time
        const s = clamp(kmh / C.ENGINE_V_MAX, 0, 1);
        const pull = 1 - Math.pow(s, C.ENGINE_CURVE_EXP); // 1 → 0 at 370
        // + roadDrag (compensation) → net a(v) is exactly the power curve
        kmh += (C.ENGINE_ACCEL * pull + roadDrag) * dt;
      } else {
        kmh += C.BRAKE_DECEL * dt; // rolling backwards + gas = brake first
      }
    } else if (braking) {
      if (kmh > 1) kmh -= C.BRAKE_DECEL * dt;
      else kmh = Math.max(kmh - C.REVERSE_ACCEL * dt, -C.REVERSE_MAX);
    }

    let drag = roadDrag;
    if (this.offroad) drag += C.OFFROAD_DRAG + C.OFFROAD_DRAG_K * Math.abs(kmh);
    // scrubbing sideways: a car that got knocked out of line loses speed fast,
    // so it slides a metre or two instead of sailing across the carriageway
    if (Math.abs(kmh) > C.SCRUB_MIN_KPH) {
      drag += Math.abs(Math.sin(rot)) * Math.abs(kmh) * C.SCRUB_DRAG_K;
    }
    if (hand) drag += C.HANDBRAKE_DECEL;
    if (!this.alive) drag += C.WRECK_DRAG;
    kmh -= Math.sign(kmh) * Math.min(Math.abs(kmh), drag * dt);
    // hard ceiling = the asymptote itself; a(v) → 0 there, so it is never
    // actually reached – the practical end is ≈ 369 km/h after a long pull
    kmh = clamp(kmh, -C.REVERSE_MAX, C.ENGINE_V_MAX);

    // --- lateral grip -------------------------------------------------------
    let grip = lerp(C.GRIP_SLOW, C.GRIP_FAST, t);
    // just after a contact the tyres cannot hold the line: the shove is felt
    // instead of being erased by the grip model within two frames
    this.impactTimer = Math.max(0, this.impactTimer - dt);
    if (this.impactTimer > 0) grip *= C.PLAYER_HIT_GRIP_FACTOR;
    if (this.offroad) grip = C.GRIP_OFFROAD;
    if (hand) grip = Math.min(grip, C.GRIP_HANDBRAKE);
    if (!this.alive) grip = C.GRIP_WRECK;
    this.slip = Math.abs(vr);
    vr *= Math.max(0, 1 - grip * dt);

    // --- steering (bicycle model) -----------------------------------------
    const target = ctrl ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
    this.steer = approach(
      this.steer,
      target,
      (target !== 0 ? C.STEER_IN_RATE : C.STEER_OUT_RATE) * dt,
    );
    const maxSteer = lerp(
      C.STEER_MAX_SLOW,
      C.STEER_MAX_FAST,
      Math.pow(t, C.STEER_CURVE_EXP),
    );
    const steerAngle = this.steer * maxSteer;
    vf = kmh * C.KPH_TO_PX;
    let omegaTarget = (vf / C.WHEELBASE) * Math.tan(steerAngle);

    if (ctrl && Math.abs(this.steer) < 0.05) {
      const heading = wrapAngle(rot);
      if (Math.abs(heading) < 1.2) {
        omegaTarget +=
          -heading *
          C.ASSIST_RATE *
          Math.min(1, Math.abs(vf) / C.ASSIST_SPEED_REF) *
          (0.4 + 0.6 * t);
      }
    }

    const omegaNow = angularVelocityRadPerSec(body);
    const omega = this.alive
      ? omegaNow + (omegaTarget - omegaNow) * Math.min(1, C.ANGULAR_BLEND * dt)
      : omegaNow * Math.max(0, 1 - 1.5 * dt);

    setVelocityPxPerSec(body, fx * vf + rx * vr, fy * vf + ry * vr);
    // ...and no instant spins either: a contact may not whip the car round
    setAngularVelocityRadPerSec(body, clamp(omega, -C.MAX_SPIN_RADS, C.MAX_SPIN_RADS));
    this.kmh = kmh;

    // --- counters -----------------------------------------------------------
    if (counting) {
      this.time += dt;
      if (kmh > 0) this.distance += (kmh / 3.6) * dt;
      if (kmh >= C.FULL_SPEED_THRESHOLD) this.fullSpeed += dt;
      if (kmh > this.topSpeed) this.topSpeed = kmh;
    }
  }

  /**
   * Odrzut gracza dla kolizji rozstrzygniętej poza solverem Mattera (siatka
   * `sweepContacts`): bez tego uderzenie w auto zadawało obrażenia, ale nie
   * dawało żadnej fizycznej odpowiedzi, więc auta potrafiły jechać dalej
   * "poprzylepiane".
   */
  applyBounce(
    strength: number,
    fromX: number,
    fromY: number,
    zone: C.ContactZone = "rear",
  ): void {
    const b = this.body;
    if (!b || !b.position || !b.velocity) return;
    const s = clamp(strength, 0, 1);

    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const len = Math.hypot(dx, dy) || 1;

    const v = velocityPxPerSec(b);
    // a side contact pushes mostly PERPENDICULAR (you are dragged away from the
    // other flank), a rear hit mainly along the road
    const push =
      s *
      (zone === "side"
        ? C.SIDE_KICK_PERP
        : zone === "corner"
          ? C.CORNER_KICK
          : C.PLAYER_BOUNCE_MAX);
    let vx = v.x + (dx / len) * push;
    let vy = v.y + (dy / len) * push;
    // a real hit costs momentum as well – no "brushing through" a car
    vy *= 1 - C.PLAYER_BOUNCE_LOSS * s;
    vx = clamp(vx, -C.PLAYER_BOUNCE_MAX, C.PLAYER_BOUNCE_MAX);
    setVelocityPxPerSec(b, vx, vy);
    // ...and the tyres are unsettled for a moment, so the bounce survives
    this.impactTimer = Math.max(this.impactTimer, C.PLAYER_HIT_GRIP_S * (0.6 + 0.6 * s));
    // ...and a real twist. Zone-weighted: a corner clip or a side swipe throws the
    // car off line properly, a rear-end shunt mostly just slows it down.
    const spinFactor = zone === "rear" ? 0.45 : zone === "corner" ? 1 : 0.85;
    setAngularVelocityRadPerSec(
      b,
      clamp(
        angularVelocityRadPerSec(b) + (dx / len) * s * C.PLAYER_HIT_SPIN * spinFactor,
        -C.MAX_SPIN_RADS,
        C.MAX_SPIN_RADS,
      ),
    );
  }

  /**
   * Momentum handed to the wreck: when somebody slams into the dead car, the
   * wreck is pushed along the impact direction instead of standing still.
   * Only applies once the car is wrecked – a live car is driven by its driver.
   *
   * @param closingPxPerSec closing speed of the impact (px/s)
   * @param dirX unit direction of the push
   * @param dirY unit direction of the push
   */
  applyWreckShove(closingPxPerSec: number, dirX: number, dirY: number): void {
    if (this.alive) return;
    const b = this.body;
    if (!b) return;
    const push = Math.min(closingPxPerSec * C.WRECK_SHOVE_FACTOR, C.WRECK_SHOVE_MAX_PX);
    const v = velocityPxPerSec(b);
    setVelocityPxPerSec(b, v.x + dirX * push, v.y + dirY * push);
  }

  /** Returns true when this hit was fatal. */
  applyDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  /** Checkpoint service: every bit of damage is repaired. */
  repair(): void {
    this.health = 100;
    this.sprite.clearTint();
    this.sprite.setAlpha(1);
  }

  wreck(spin: number): void {
    this.alive = false;
    this.controllable = false;
    this.throttle = 0;
    this.sprite.setTint(0x6d6d6d);
    const b = this.body;
    if (b) {
      setAngularVelocityRadPerSec(
        b,
        clamp(spin, -C.MAX_SPIN_RADS, C.MAX_SPIN_RADS),
      );
    }
  }

  /**
   * Rear axle centres in world space (for skid smoke), using the drawn state.
   * Fills and returns a REUSED array – read it at once, do not keep it (it is
   * called every frame and must not feed the garbage collector).
   */
  rearWheels(): ReadonlyArray<{ x: number; y: number }> {
    const rot = this.hasInterp ? this.reA : (this.body?.angle ?? 0);
    const fx = Math.sin(rot);
    const fy = -Math.cos(rot);
    const rx = Math.cos(rot);
    const ry = Math.sin(rot);
    const px = this.renderX;
    const py = this.renderY;
    const bx = px - fx * 26;
    const by = py - fy * 26;
    const l = this.wheels[0];
    const r = this.wheels[1];
    l.x = bx - rx * 13;
    l.y = by - ry * 13;
    r.x = bx + rx * 13;
    r.y = by + ry * 13;
    return this.wheels;
  }

  /**
   * Draw the car at its interpolated position. Matter writes the body into the
   * sprite during the physics step (Scene `UPDATE`, before this scene's
   * `update()`), so overwriting the transform here is safe and gives
   * sub-step-smooth rendering at any refresh rate.
   */
  syncVisuals(): void {
    this.shadow.setPosition(this.reX + 4, this.reY + 6);
    this.shadow.rotation = this.reA;
    // ordinary Image -> no side effects on the physics body
    this.sprite.setPosition(this.reX, this.reY);
    this.sprite.setRotation(this.reA);
  }
}

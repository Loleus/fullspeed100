import Phaser from "phaser";
import { settings } from "./bus";
import * as C from "./constants";
import { DEBUG } from "./debug";
import { Rnd } from "./rng";
import { TEX } from "./textures";
import {
  MBody,
  angularVelocityRadPerSec,
  approach,
  clamp,
  readVelocityPxPerSec,
  setAngularVelocityRadPerSec,
  setPositionPx,
  setVelocityPxPerSec,
  velocityPxPerSec,
  wrapAngle,
} from "./physics";

const PARK_Y = -50000;

/**
 * An AI car locked to one lane.
 *
 * Deterministic generation (as in the original): every opponent owns an LCG
 * seeded with the same seed. Each (re)appearance consumes exactly two values –
 * the speed and the "loop" (how far away from the player it re-enters).
 *
 * ── FIX ──────────────────────────────────────────────────────────────────
 * The original design only ever spawned opponents at *negative* "loop" values,
 * i.e. ahead of the player. The very first cars of a run therefore appeared in
 * front of a standing player, even though the player had not moved at all.
 *
 * Now every same-direction opponent's FIRST appearance is placed BEHIND the
 * player (`START_FROM_BEHIND`): the traffic in your carriageway drives up from
 * the bottom of the screen and reels you in – whether you accelerate, sit
 * still or immediately select reverse. Oncoming lanes keep entering from
 * ahead (that is what oncoming traffic does) and stay far outside the
 * viewport. Only later re-appearances use the original ahead-of-player loop.
 * ─────────────────────────────────────────────────────────────────────────
 */
export class OpponentCar {
  readonly lane: number;
  /**
   * Plain Image + plain Matter body (not a `Matter.Sprite`): writing to a
   * Matter sprite's transform would move the physics body as well (see
   * PlayerCar), which would break the simulation when interpolating.
   */
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  private bodyRef: MatterJS.BodyType | null = null;

  /** Index of this car inside its lane (0-based) – also shifts the RNG seed. */
  readonly slot: number;
  /** Every opponent of the scene (used to keep spawns of a lane apart). */
  siblings: OpponentCar[] = [];

  /** Deterministic lane wander (see constants.WEAVE_AMPLITUDE_PX). */
  private weaveT = 0;
  private readonly weaveOmega: number;
  private readonly weavePhase: number;
  /** > 0 while the car is still recovering from a contact (seconds). */
  private hitTimer = 0;
  /** > 0 while further impulses on this car are ignored (seconds). */
  private impactCooldown = 0;
  /** > 0 after hitting a wreck: the car brakes to a stop and stays there. */
  private blockedFor = 0;
  /** Seconds of "not on the road" between two appearances (see LANE_DENSITY). */
  private dwellTimer = 0;
  /** Extra corridor room right after a spawn (see spawn / fixedStep). */
  private spawnClearance = 0;
  /**
   * Contact cooldown, stored ON the car (milliseconds on the scene clock).
   * Keeping it here instead of in a Map keyed by Matter's `body.id` matters:
   * every respawn creates a new body with a new id, so such a map grew without
   * bound and slowed the game down the longer a run lasted.
   */
  contactUntil = 0;
  /** scratch vector for velocity reads – never allocate inside the step loop */
  private readonly vel = { x: 0, y: 0 };
  /** scratch for the traffic-queuing rule (replaces a per-step closure) */
  private queueTarget = 0;
  /** true once the car has been destroyed by the wreck – it never drives again. */
  private wrecked = false;
  /** true once the body was frozen solid (static, zero velocity). */
  private frozen = false;

  rng: Rnd;
  speedKmh = 0; // cruise speed from the RNG (negative = oncoming)
  /** Half-length of the roaming corridor around the player, in px. */
  private corridor = C.CORRIDOR_MIN_PX;
  curKmh = 0; // current desired speed (after AI braking)
  appearances = 0;
  active = false;
  /** true when this car entered the run from behind the player (bottom edge). */
  enteredFromBehind = false;
  /** start-from-behind distance of the first appearance (px, diagnostic/UI). */
  startBehindPx = 0;

  constructor(scene: Phaser.Scene, lane: number, seed: number, slot = 0) {
    this.lane = lane;
    this.slot = slot;
    // every car gets its own deterministic stream (slot + lane), so two cars of
    // neighbouring lanes do not draw the very same speed from the same seed
    this.rng = new Rnd(seed + slot * 7919 + lane * 104729);
    // weave: period 7–13 s and a phase that differ per car – derived by
    // arithmetic only, never from the RNG (the traffic pattern must stay keyed
    // to the seed alone)
    this.weaveOmega = (Math.PI * 2) / (7 + ((lane * 3 + slot * 2) % 7));
    this.weavePhase = (lane * 2.4 + slot * 1.9) % (Math.PI * 2);
    this.shadow = scene.add.image(0, 0, TEX.SHADOW).setDepth(8);
    // diagnostic switch: ?no=shadow
    if (!DEBUG.shadow) this.shadow.setVisible(false);
    const parkY = PARK_Y - lane * 300;
    this.sprite = scene.add.image(C.LANE_X[lane], parkY, TEX.OPP(lane)).setDepth(9);
    // body size == sprite size, so what you see is what you can hit
    this.bodyRef = scene.matter.add.rectangle(
      C.LANE_X[lane],
      parkY,
      C.CAR_W,
      C.CAR_H,
      {
        label: "opponent",
        mass: C.OPPONENT_MASS,
        // grippy and non-bouncy: bodies grip each other instead of skating apart
        friction: C.CAR_FRICTION,
        frictionStatic: C.CAR_FRICTION_STATIC,
        frictionAir: 0,
        restitution: C.CAR_RESTITUTION,
        slop: 0.03,
        chamfer: { radius: 6 },
        // never collides with another AI car – only the player and the rails
        collisionFilter: C.FILTER_OPPONENT,
      },
    );
    this.interpSnap(C.LANE_X[lane], parkY, 0);
    this.park();
  }

  /**
   * Render interpolation state – the same trick as in PlayerCar: Matter solves
   * at a fixed 60 Hz, the picture is drawn between the last two solver states so
   * the traffic glides smoothly on 144 / 260 Hz displays too.
   */
  private prevX = 0;
  private prevY = 0;
  private prevA = 0;
  private curX = 0;
  private curY = 0;
  private curA = 0;
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
  get isOncoming(): boolean {
    return this.lane < C.ONCOMING_LANES;
  }

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

  interpSnap(x: number, y: number, a: number): void {
    this.prevX = this.curX = this.reX = x;
    this.prevY = this.curY = this.reY = y;
    this.prevA = this.curA = this.reA = a;
    this.hasInterp = true;
  }

  interpRender(alpha: number): void {
    if (!this.hasInterp || !this.active) return;
    this.reX = this.prevX + (this.curX - this.prevX) * alpha;
    this.reY = this.prevY + (this.curY - this.prevY) * alpha;
    const dA = this.curA - this.prevA;
    this.reA = Math.abs(dA) > Math.PI ? this.curA : this.prevA + dA * alpha;
  }

  reseed(seed: number): void {
    this.rng = new Rnd(seed + this.slot * 7919);
    this.appearances = 0;
  }

  /**
   * Corridor half-length (px) and re-entry distances, all derived from the RELATIVE
   * speed between this car and the player.
   *
   * This is the fix for "the fast lanes are almost empty": the corridor used to be
   * `ownSpeed × 4 s`, so a 295 km/h car in lane 2 was allowed to roam 3800 px (190 m)
   * away from the player – and since the player drives nearly as fast, it took
   * *minutes* to drift that far, so it was recycled only rarely. Those cars therefore
   * patiently hovered off screen.
   *
   * With the relative speed the numbers mean "seconds until we meet":
   *   – same direction, 90 km/h apart → corridor 1100 px, recycled after ~4 s,
   *   – oncoming (500+ km/h of closing speed) → corridor 2200 px, gone in a blink,
   * so every lane now produces traffic at a similar rate, fastest lanes included.
   */
  private relativePx(playerKmh: number): number {
    const own = Math.abs(this.speedKmh) * C.KPH_TO_PX;
    const player = Math.abs(playerKmh) * C.KPH_TO_PX;
    return this.isOncoming ? own + player : Math.abs(own - player);
  }

  private corridorFor(playerKmh: number): number {
    // While the player is standing (or crawling) every car is "faster" than him, so
    // they all belong to the from-behind case and need room behind: the floor is
    // raised so a stationary player does not squeeze them into a 1000 px box (in
    // which they would be recycled before they could ever reach him).
    const rel = Math.max(this.relativePx(playerKmh), 300);
    const span = clamp(rel * C.CORRIDOR_S, C.CORRIDOR_MIN_PX, C.CORRIDOR_MAX_PX);
    /*
      The corridor is measured FROM THE PLAYER in both directions, but a car can
      only be `span` away in the direction it is travelling: a faster car catches the
      player up and only ever approaches from BEHIND, so all its room has to be
      behind him. Splitting the span in half (the first version of the relative-speed
      corridor) left it only 550–1100 px of room – it was recycled almost immediately
      and, with the oncoming density breaks, the road ended up empty for tens of
      seconds. Now: full span behind for cars that overtake, full span ahead for cars
      the player overtakes.
    */
    const fromBehind = this.speedKmh > playerKmh;
    // Room BEHIND the player: enough for the car to travel one second of the
    // player's own speed, and never less than the safe re-entry distance – so a car
    // that drives up from behind always has the room to actually get there.
    const limit = fromBehind
      ? Math.max(C.REENTRY_SAFE_MIN_PX, playerKmh * C.KPH_TO_PX * 1.1)
      : C.CORRIDOR_MAX_PX * 1.6;
    return Math.min(span, limit);
  }

  /** How far away this car re-enters – also in the player's frame of reference. */
  private reentryFor(playerKmh: number, fromBehind: boolean): number {
    const rel = Math.max(this.relativePx(playerKmh), 120);
    // The absolute floor (REENTRY_SAFE_MIN_PX) is what stops a recycled car from
    // being dropped right next to the player: with short corridors the relative
    // distance could come out as little as 400 px, i.e. inside the bottom edge of
    // the screen.
    return fromBehind
      ? clamp(
          rel * C.REENTRY_BEHIND_S,
          Math.max(C.REENTRY_SAFE_MIN_PX, C.REENTRY_BEHIND_MIN_PX),
          C.REENTRY_BEHIND_MAX_PX,
        )
      : clamp(
          rel * C.REENTRY_AHEAD_S,
          Math.max(C.REENTRY_SAFE_MIN_PX, C.REENTRY_AHEAD_MIN_PX),
          C.REENTRY_AHEAD_MAX_PX,
        );
  }

  /** Hide the car far away from the action. */
  park(): void {
    // NOTE: `dwellTimer` is deliberately NOT cleared here – the "waiting between
    // appearances" state is set by the caller just after parking.
    this.active = false;
    this.enteredFromBehind = false;
    const parkY = PARK_Y - this.lane * 300;
    this.interpSnap(C.LANE_X[this.lane], parkY, 0);
    const b = this.body;
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    if (!b) return;
    setPositionPx(b, C.LANE_X[this.lane], parkY);
    setVelocityPxPerSec(b, 0, 0);
    MBody.setAngularVelocity(b, 0);
    MBody.setAngle(b, 0);
  }

  /**
   * Physical reaction to a contact, so a collision is mutual instead of the
   * player bouncing off a car that ignores it.
   *
   * The shove is applied as extra velocity in world space plus a spin whose
   * direction comes from which side was hit (deterministic – no RNG draw, the
   * traffic pattern stays keyed to the seed). `hitTimer` keeps the driver model
   * from instantly erasing it.
   *
   * @param strength 0..1 (scrapes are light, collisions are heavy)
   * @param fromX  world X of the contact (the shove pushes away from it)
   * @param fromY  world Y of the contact
   */
  applyImpact(
    strength: number,
    fromX: number,
    fromY: number,
    zone: C.ContactZone = "rear",
  ): void {
    const b = this.body;
    if (!b || !b.position || !b.velocity) return;
    const s = clamp(strength, 0, 1);

    // contacts repeat every physics step while the boxes overlap – only the
    // first one kicks, the rest just keep the car "unsettled"
    if (this.impactCooldown > 0) {
      this.hitTimer = Math.max(this.hitTimer, C.OPP_HIT_RECOVER_S * (0.5 + 0.5 * s));
      return;
    }
    this.impactCooldown = C.OPP_IMPACT_COOLDOWN_S;

    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    // Zone-weighted kick. Sideways is taken from the contact geometry (so a
    // scrape shoves the car AWAY from the player's flank), while the component
    // along the road comes from the zone: a nose-to-tail hit shoves the car
    // forward, a side hit drags it.
    const v = velocityPxPerSec(b);
    const kick =
      s *
      (zone === "side" ? C.SIDE_KICK : zone === "corner" ? C.CORNER_KICK : C.OPP_IMPACT_PUSH);

    let vx = v.x + nx * kick;
    let vy = v.y + ny * kick;
    if (zone === "rear") {
      // pushed along its own direction of travel
      vy += vy >= 0 ? kick * 0.5 : -kick * 0.5;
    } else if (zone === "side") {
      // pulled along: the whole flank is scraping, so speed bleeds away
      vy *= 1 - C.SIDE_PULL_FACTOR * s;
    } else {
      // corner clip: keep most of the sideways kick (damping it by 30 % made a
      // corner rub barely move the car) and only bleed a little speed
      vx *= 0.9;
      vy *= 1 - C.SIDE_PULL_FACTOR * 0.5 * s;
    }

    setVelocityPxPerSec(
      b,
      clamp(vx, -C.OPP_LATERAL_MAX, C.OPP_LATERAL_MAX),
      vy,
    );

    // a touch of rotation, hard-capped: whichever side was hit turns the nose
    // away, but never into a pirouette
    const fx = Math.sin(b.angle);
    const fy = -Math.cos(b.angle);
    const side = Math.sign(nx * fy - ny * fx) || 1;
    const omega = angularVelocityRadPerSec(b);
    // sideways contacts twist visibly harder than a rear-end shunt
    const spinFactor = zone === "rear" ? 0.5 : zone === "corner" ? 1.2 : 1.4;
    setAngularVelocityRadPerSec(
      b,
      clamp(
        omega + side * s * C.OPP_IMPACT_SPIN * spinFactor,
        -C.OPP_MAX_SPIN_RADS,
        C.OPP_MAX_SPIN_RADS,
      ),
    );

    // at least ~0.5 s of "not my lane, not my speed" so the two cars separate
    this.hitTimer = Math.max(this.hitTimer, Math.max(0.5, C.OPP_HIT_RECOVER_S * (0.5 + 0.5 * s)));
  }

  /**
   * "Stay where you hit it": called when this car runs into the player's wreck.
   * It brakes to a full stop instead of driving on.
   */
  blockFor(seconds = C.OPP_BLOCKED_S): void {
    this.blockedFor = Math.max(this.blockedFor, seconds);
  }

  /**
   * Traffic-queuing rule, as a method instead of a closure: called once per car
   * per physics step (and once more per other car), so it has to be
   * allocation-free.
   */
  private consider(ox: number, oy: number, okmh: number): void {
    const dy = this.y - oy;
    if (
      dy > 0 &&
      dy < C.OPP_LOOKAHEAD &&
      // narrow enough that lane wander cannot make a car brake for the car in the
      // neighbouring lane
      Math.abs(ox - this.x) < C.LANE_W * 0.55 &&
      okmh < this.queueTarget
    ) {
      // hard braking inside ~21 m (430 px = the old 140 px × 3.09)
      this.queueTarget = Math.max(0, dy < C.OPP_BRAKE_HARD_PX ? okmh - 15 : okmh);
    }
  }

  /** Has this car driven out of the roaming corridor around the player? */
  outsideCorridor(playerY: number): boolean {
    const rel = this.y - playerY;
    return rel > this.corridor || rel < -this.corridor - 600;
  }

  /** Corridor currently in force (kept from the last step) – for diagnostics. */
  get corridorNow(): number {
    return this.corridor;
  }

  /**
   * Leaves the world for good (used on the results screen: cars that drive away
   * must not be recycled back in – nothing new may enter the road any more).
   */
  leave(): void {
    this.park();
  }

  /**
   * Destroyed by the wreck: the car is written off, tinted like scrap, stops
   * dead and is never recycled – it stays on screen next to the player.
   */
  trash(): void {
    if (this.wrecked) return;
    this.wrecked = true;
    this.blockedFor = C.OPP_BLOCKED_S;
    this.sprite.setTint(0x6d6d6d);
    const b = this.body;
    if (b) {
      // a short, heavy twist as the panels give way – then it is scrap
      setAngularVelocityRadPerSec(
        b,
        clamp(
          angularVelocityRadPerSec(b) + (this.isOncoming ? -1 : 1) * 1.2,
          -C.OPP_MAX_SPIN_RADS,
          C.OPP_MAX_SPIN_RADS,
        ),
      );
    }
  }

  /** Cars that are scrap are never recycled off screen. */
  get isWrecked(): boolean {
    return this.wrecked;
  }

  /**
   * Freezes the car completely: zero velocity, zero spin and a static body, so
   * nothing can move it any more (Matter keeps integrating dynamic bodies even
   * when the driver model has stopped writing to them).
   */
  freeze(): void {
    const b = this.body;
    if (!b) return;
    this.frozen = true;
    this.speedKmh = 0;
    this.curKmh = 0;
    setVelocityPxPerSec(b, 0, 0);
    setAngularVelocityRadPerSec(b, 0);
    MBody.setStatic(b, true);
  }

  /** Spin the car got from a contact, for the FX layer. */
  get isRecovering(): boolean {
    return this.hitTimer > 0;
  }

  /**
   * Should this appearance enter from BEHIND the player?
   *
   * The car is faster than the player (by `REENTRY_SPEED_MARGIN_KPH`) → it is
   * the one closing the gap, so it must come up from the bottom edge. This is
   * also what happens at the very start of a run (`playerKmh = 0`), which is
   * exactly the case the original build got wrong: the first cars used to
   * materialise in front of a standing player.
   */
  entersFromBehind(playerKmh: number): boolean {
    if (!settings.startFromBehind || this.isOncoming) return false;
    return this.speedKmh > playerKmh + C.REENTRY_SPEED_MARGIN_KPH;
  }

  /**
   * Draw the next (speed, loop) pair from the RNG and place the car.
   *
   * The RNG still decides the cruise speed; the DISTANCE is derived from that
   * speed so that a recycled car is always just outside the visible road and
   * therefore meets the player within a couple of seconds (the old implementation
   * dropped it up to 700 m away, invisible, which is why the six-lane motorway
   * felt completely empty when the player sat in the inner lane).
   *
   * @param playerY    world Y of the player (spawn reference)
   * @param playerKmh  player's speed – decides whether the car comes in from
   *                   behind (bottom edge) or is placed ahead in the stream
   * @param first      true for the start grid (long, staggered lead-in)
   */
  spawn(playerY: number, playerKmh = 0, first = false): void {
    this.speedKmh = this.rng.getSpeed(this.lane);
    // the "loop" draw is kept so each seed keeps producing the same traffic
    // pattern as before, but the distance now comes from the speed
    this.rng.getNumb(this.lane);
    this.appearances++;
    this.curKmh = this.speedKmh;
    // a fresh car starts calm and intact
    this.hitTimer = 0;
    this.impactCooldown = 0;
    this.blockedFor = 0;
    this.contactUntil = 0;
    this.wrecked = false;
    this.frozen = false;
    this.dwellTimer = 0;
    const b = this.body;
    if (!b) return;
    // a car respawned after a freeze must be dynamic again, otherwise it would
    // hang motionless as a static obstacle in its lane
    MBody.setStatic(b, false);
    this.sprite.clearTint();
    const fromBehind = this.entersFromBehind(playerKmh);
    this.enteredFromBehind = fromBehind;

    const speedPx = Math.abs(this.speedKmh) * C.KPH_TO_PX;
    const laneFromOuter = C.LANE_COUNT - 1 - this.lane;
    /*
      Start grid: the lead-in is expressed in seconds for a STANDING player, but it
      is capped in absolute pixels (START_GRID_MAX_PX). Uncapped it grew with the
      car's own speed – a 295 km/h car started ~9500 px behind and, since the player
      drives nearly as fast, took ages to catch up (the empty-road complaint).
    */
    const gridDist = clamp(
      speedPx * (C.START_ARRIVAL_S + laneFromOuter * C.START_ARRIVAL_STEP_S),
      C.START_BEHIND_MIN,
      C.START_GRID_MAX_PX,
    );
    // distance measured in the PLAYER's frame – see reentryFor()
    const reentryDist = this.reentryFor(playerKmh, fromBehind);
    const dist = first && fromBehind ? gridDist : reentryDist;

    let y = playerY + (fromBehind ? dist : -dist);

    // never drop a car on top of another one of the same lane
    for (let guard = 0; guard < 6; guard++) {
      const clash = this.siblings.some(
        (o) =>
          o !== this &&
          o.active &&
          o.lane === this.lane &&
          Math.abs(o.y - y) < C.SPAWN_SEPARATION_PX,
      );
      if (!clash) break;
      y += fromBehind ? C.SPAWN_SEPARATION_PX : -C.SPAWN_SEPARATION_PX;
    }

    // Corridor: the relative-speed formula, but never shorter than where we just
    // put the car – otherwise it would be recycled on its very first step (the
    // start grid sits further back than the corridor). `spawnClearance` is dropped
    // as soon as the car gets close to the player, so the fast cycling resumes
    // right after each car has passed.
    this.spawnClearance = Math.abs(y - playerY) + 400;
    this.corridor = Math.max(this.corridorFor(playerKmh), this.spawnClearance);
    this.startBehindPx = first && fromBehind ? dist : 0;

    // start x oscillates a little from appearance to appearance (deterministic
    // arithmetic, no RNG draw): traffic never lines up in a perfect column.
    // Halved compared to the weave amplitude: at full swing a car from the outer
    // lane could reach the inner lane's edge, which looked like cars merging.
    const offX = (((this.appearances * 5 + this.lane * 3 + this.slot * 2) % 5) - 2) * 6;
    const spawnX = C.LANE_X[this.lane] + offX;
    const angle = this.isOncoming ? Math.PI : 0;
    this.interpSnap(spawnX, y, angle);
    setPositionPx(b, spawnX, y);
    MBody.setAngle(b, angle);
    setVelocityPxPerSec(b, 0, -this.curKmh * C.KPH_TO_PX);
    MBody.setAngularVelocity(b, 0);

    this.active = true;
    this.sprite.setVisible(true);
    this.shadow.setVisible(true);
    this.syncVisuals();
  }

  fixedStep(
    dt: number,
    playerX: number,
    playerY: number,
    playerKmh: number,
    playerAlive: boolean,
    others: OpponentCar[],
    moving: boolean,
    spawning = true,
  ): void {
    // ---- waiting off the road (thinned-out lanes) --------------------------
    // Handled before the `active` check, because a dwelling car is parked and
    // invisible – it still has to count down.
    if (this.dwellTimer > 0) {
      this.dwellTimer = Math.max(0, this.dwellTimer - dt);
      if (this.dwellTimer > 0) return;
      if (moving) {
        this.spawn(playerY, playerKmh);
        return;
      }
    }

    if (!this.active || !moving) return;
    const b = this.body;
    if (!b) return;

    // --- loop / respawn -----------------------------------------------------
    // the corridor is measured in px around the player and rebuilt on every
    // spawn from that car's own speed (see spawn)
    // a car that left the corridor leaves the world for good – no respawn once
    // the run is over (only `park()`/`spawn()` on the next start may revive it)
    if (!this.wrecked && !spawning && this.outsideCorridor(playerY)) {
      this.leave();
      return;
    }

    // The corridor is recomputed every step from the CURRENT relative speed: when
    // the player speeds up the traffic cycles faster, when he slows down the cars
    // stop being recycled early.
    //
    // The spawn allowance is dropped only when the car is LEVEL with the player
    // (|Δy| < 400). Two wrong versions came before this one:
    //   • dropping it at 1200 px recycled cars a moment before they reached the
    //     player (nothing ever came up from behind),
    //   • dropping it on `y - playerY < 0` was true IMMEDIATELY for every car placed
    //     AHEAD – so those were recycled on their first step, which is why the fast
    //     lanes looked empty.
    if (this.spawnClearance > 0 && Math.abs(this.y - playerY) < 400) {
      this.spawnClearance = 0;
    }
    this.corridor = Math.max(this.corridorFor(playerKmh), this.spawnClearance);

    const rel = this.y - playerY; // > 0: behind the player
    if (spawning && !this.wrecked && (rel > this.corridor || rel < -this.corridor - 600)) {
      /*
        Deterministic re-entry – side decided by the speed comparison, so a
        standing (or reversing) player keeps being overtaken from below.

        On the oncoming lanes the car first takes a break (LANE_DENSITY): it parks
        off screen for (density − 1) travel times, which is what reduces the
        number of cars of that lane on screen to a third / a sixth. Those two
        streams are the most expensive traffic in the game (they cross the viewport
        at 500+ km/h of closing speed and were almost always in view).
      */
      const density = C.LANE_DENSITY[this.lane] ?? 1;
      if (density > 1) {
        const speedPx = Math.max(1, Math.abs(this.speedKmh) * C.KPH_TO_PX);
        const transitS = (2 * this.corridor) / speedPx;
        this.park();
        this.dwellTimer = transitS * (density - 1);
        return;
      }
      this.spawn(playerY, playerKmh);
      return;
    }

    // --- a car destroyed by the wreck: slide to a halt and stay put --------
    if (this.wrecked) {
      if (this.frozen) return;
      const w = velocityPxPerSec(b);
      const speed = Math.hypot(w.x, w.y);
      const dragPx = C.OPP_WRECK_DRAG * C.KPH_TO_PX * dt;
      const k = speed > dragPx ? (speed - dragPx) / speed : 0;
      setVelocityPxPerSec(b, w.x * k, w.y * k);
      setAngularVelocityRadPerSec(b, 0);
      this.speedKmh = 0;
      this.curKmh = 0;
      // once it has stopped, freeze it: Matter keeps integrating bodies, and a
      // car with a leftover velocity and `frictionAir: 0` would creep along for
      // ever (the "last lost opponent drifts off after game over" case)
      if (speed < C.OPP_WRECK_STOP_PX) this.freeze();
      return;
    }

    // --- driver model -------------------------------------------------------
    this.blockedFor = Math.max(0, this.blockedFor - dt);
    let target = this.speedKmh;

    // Slowing down for the player only makes sense while he drives; a wreck is
    // handled by the collision handler (it trashes the car that hits it).
    /*
      NO "start guard" here any more.

      A grace window that braked every same-direction car approaching the standing
      player looked sensible but was wrong: it applied to the whole carriageway, so
      during the countdown cars in the OTHER lanes drove up level with the player and
      stopped there – a traffic jam in the middle of the screen. The protection
      against a first-second hit is geometric instead: a car may never re-enter
      closer than REENTRY_SAFE_MIN_PX (2000 px) and the start grid is placed even
      further back, so the earliest arrival is seconds after "GO!".
    */

    if (!this.isOncoming) {
      // "don't ram slower traffic ahead in my lane" – no closure here: this runs
      // for every car on every step, and a closure per step was pure garbage.
      this.queueTarget = this.speedKmh;
      target = this.queueTarget;

      // Only the SLOWEST lane – the one the player starts in (right edge) – queues
      // up behind the player. Everywhere else the traffic just keeps driving: if
      // the player pulls into their lane they plough into him instead of politely
      // braking (that is the whole point of the fast lanes).
      // THE START LANE WAITS – always. While the player stands on the grid, crawls
      // or drives, a car of the lane he started in queues up behind him instead of
      // driving through him. The old gate at 25 km/h meant that during the countdown
      // (and at any low speed) those cars simply rammed a standing player. Every
      // other lane keeps driving – that is the whole point of the fast lanes.
      if (playerAlive && this.lane === C.START_LANE) {
        this.consider(playerX, playerY, playerKmh);
      }
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        // WRECKS ARE NOT TRAFFIC. Treating them as "a slower car ahead" made the
        // AI brake to a standstill behind them, where they then sat wobbling in
        // the lane (only the cross-lane weave was still running) instead of
        // driving on. They now plough into the wreck and are written off by it.
        if (o !== this && o.active && !o.isOncoming && !o.isWrecked) {
          this.consider(o.x, o.y, o.curKmh);
        }
      }
      target = this.queueTarget;
    }
    this.curKmh = approach(
      this.curKmh,
      target,
      (target < this.curKmh ? C.OPP_DECEL : C.OPP_ACCEL) * dt,
    );

    const v = readVelocityPxPerSec(b, this.vel);
    // same sanity as the player: a shove may not launch an opponent either.
    // (The old floor of 600 px/s let a slow car be flung at ~160 km/h and glide
    // for more than a second – that was the "flying straight" effect.)
    const vMax = Math.max(
      Math.abs(this.curKmh) * C.KPH_TO_PX * C.OPP_IMPACT_SPEED_MARGIN,
      440,
    );
    const vLen = Math.hypot(v.x, v.y);
    if (vLen > vMax) {
      const k = vMax / vLen;
      v.x *= k;
      v.y *= k;
    }
    // sideways motion is capped as well: a shove may be felt, but it can never
    // turn into a sideways glide across the lanes
    v.x = clamp(v.x, -C.OPP_LATERAL_MAX, C.OPP_LATERAL_MAX);
    const vyDes = -this.curKmh * C.KPH_TO_PX;
    // slow lane wander: the car drifts left/right inside its lane, so the gaps
    // between two neighbouring cars keep opening and closing instead of forming
    // a straight, infinitely long channel
    this.weaveT += dt;
    const weaveTarget =
      C.LANE_X[this.lane] +
      Math.sin(this.weaveT * this.weaveOmega + this.weavePhase) *
        C.WEAVE_AMPLITUDE_PX;
    const vxDes = clamp(
      (weaveTarget - this.x) * 2,
      -C.OPP_LANE_CLAMP,
      C.OPP_LANE_CLAMP,
    );

    // Right after a contact the driver "corrects harder": the shove is clearly
    // visible for a moment, then the car is reeled back into its lane and stops
    // pirouetting. Without this extra damping a hit turned opponents into
    // spinning tops gliding straight across the road.
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const recovering = this.hitTimer > 0;
    // slower lane return while recovering: the car must be pushed OFF its line
    // for a moment, otherwise it is dragged straight back into the player
    const recover = recovering ? C.OPP_RECOVER_AFTER_HIT : C.OPP_RECOVER;
    const k = Math.min(1, recover * dt);
    setVelocityPxPerSec(b, v.x + (vxDes - v.x) * k, v.y + (vyDes - v.y) * k);

    // ---- heading: self-righting, always --------------------------------
    // The lane direction is pulled back in with a stiff spring and the spin is
    // additionally damped every single step, so a hit cannot leave the car
    // rotated (which used to make it "drive on sideways": the velocity is along
    // the lane while the sprite was left at 90°).
    const targetAngle = this.isOncoming ? Math.PI : 0;
    const err = wrapAngle(b.angle - targetAngle);
    const omegaDes = -err * C.OPP_OMEGA_STIFFNESS;
    const omegaNow = angularVelocityRadPerSec(b);
    let omega = omegaNow + (omegaDes - omegaNow) * Math.min(1, C.OPP_OMEGA_BLEND * dt);
    omega *= Math.max(0, 1 - C.OPP_OMEGA_DAMP * dt);
    omega = clamp(omega, -C.OPP_MAX_SPIN_RADS, C.OPP_MAX_SPIN_RADS);
    setAngularVelocityRadPerSec(b, omega);
  }

  /**
   * "I was hit by another car": stop correcting the lane for a moment, so the
   * shove is visible and the car does not snap straight back into the one that
   * pushed it. Called for AI-AI contacts (see GameScene#handleCarVsCar).
   */
  unsettle(): void {
    this.hitTimer = Math.max(this.hitTimer, C.OPP_HIT_RECOVER_S);
    this.impactCooldown = Math.max(this.impactCooldown, C.OPP_IMPACT_COOLDOWN_S);
  }

  /** Moves the interpolation window (and the shadow) by dx/dy. */
  private shiftRender(dx: number, dy: number): void {
    this.prevX += dx;
    this.prevY += dy;
    this.curX += dx;
    this.curY += dy;
    this.reX += dx;
    this.reY += dy;
    this.shadow.setPosition(this.reX + 4, this.reY + 6);
  }

  /** Shifts the whole interpolation window (world rebase – see GameScene). */
  shiftRenderY(dy: number): void {
    this.shiftRender(0, -dy);
  }

  /** Position as drawn on screen (interpolated between physics steps). */
  get renderX(): number {
    return this.reX;
  }
  get renderY(): number {
    return this.reY;
  }

  /** Draw at the interpolated position (see PlayerCar#syncVisuals). */
  syncVisuals(): void {
    this.shadow.setPosition(this.reX + 4, this.reY + 6);
    this.shadow.rotation = this.reA;
    this.sprite.setPosition(this.reX, this.reY);
    this.sprite.setRotation(this.reA);
  }
}

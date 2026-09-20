import Phaser from "phaser";
import * as C from "./constants";
import { audio } from "./audio";
import { DEBUG } from "./debug";
import { bus, EV, pendingCommands, settings } from "./bus";
import type { GamePhase, HitInfo, HudData, RunStats } from "./bus";
import {
  contactNormal,
  contactPoint,
  contactZone,
  longitudinalImpactKmh,
  normalImpactKmh,
  sweepImpact,
  sweepReaches,
  worstZone,
} from "./collision";
import type { CollisionPairLike, Vec } from "./collision";
import { resolveImpact, resolveScrape } from "./impact";
import { readCarInput } from "./inputMap";
import { OpponentCar } from "./OpponentCar";
import { PlayerCar } from "./PlayerCar";
import { clamp, setAngularVelocityRadPerSec, STEPS_PER_SECOND } from "./physics";
import { RaceCamera } from "./raceCamera";
import { RaceProgress } from "./race";
import { Roadside } from "./roadside";
import { Rnd } from "./rng";
import { SceneFx } from "./sceneFx";
import { createTextures, TEX } from "./textures";

/**
 * Revs inside the current gear, 0..1 – used by the tachometer on the dashboard.
 * Reverse maps onto its own (short) range.
 */
function computeRpm(kmh: number): number {
  const gear = C.gearFor(kmh);
  const [from, to] = C.gearSpan(gear);
  if (gear === 0) return clamp(Math.abs(kmh) / C.REVERSE_MAX, 0, 1);
  return clamp((Math.abs(kmh) - from) / Math.max(1, to - from), 0, 1);
}

/**
 * The scene is an orchestrator: it owns the game flow (menu → countdown →
 * race → results) and wires together the focused modules:
 *
 *   PlayerCar / OpponentCar  the cars themselves (physics + driver model)
 *   RaceCamera               zoom / anchor rise, pixel-snapped scroll
 *   RaceProgress             checkpoints + finish line
 *   Roadside                 scenery and guard-rail bodies
 *   SceneFx                  particles and FX/audio pacing
 *   collision                null-safe pairs, swept-collision safety net
 *   inputMap                 keyboard + touch input
 *   bus                      the React shell on the other side
 */
export class GameScene extends Phaser.Scene {
  private phase: GamePhase = "boot";
  private player!: PlayerCar;
  private opponents: OpponentCar[] = [];

  private road!: Phaser.GameObjects.TileSprite;
  private readonly cam = new RaceCamera();
  private readonly race = new RaceProgress();
  private readonly roadside = new Roadside();
  private readonly fx = new SceneFx();
  private fxRng = new Rnd(99);

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private countdown = 0;
  private lastCountInt = -1;
  private crashTimer = 0;
  /**
   * Contact cooldowns, indexed BY CAR (the opponents array), not by Matter's
   * `body.id`. A Map keyed by body id grew with every respawned body and never
   * released the dead keys – a slow leak that made the GC work harder the longer
   * the run lasted. Two plain arrays cost nothing and cannot leak.
   */


  /** set on scene shutdown, so late events cannot touch destroyed bodies */
  private destroyed = false;
  private pairWarningLogged = false;
  /** render interpolation cursor (physics runs at a fixed 60 Hz) */
  private lastStepAtMs = 0;
  private interpAlpha = 0;

  constructor() {
    super("game");
  }

  /**
   * Phaser tears the Matter plugin down BEFORE it emits the Scene SHUTDOWN /
   * DESTROY events (MatterPhysics.shutdown sets `world = null`), so anything
   * reached from a shutdown handler must tolerate a missing world. Reading it
   * through this helper is what kept `game.destroy()` from throwing
   * "can't access property off, this.matter.world is null".
   */
  private matterWorld(): Phaser.Physics.Matter.World | null {
    const plugin = this.matter as unknown as
      | { world?: Phaser.Physics.Matter.World | null }
      | undefined;
    return plugin?.world ?? null;
  }

  create(): void {
    // a scene may be started again after a shutdown – make sure the flag from
    // the previous lifecycle cannot disable this one
    this.destroyed = false;

    createTextures(this);
    const cam = this.cameras.main;
    cam.setBackgroundColor(C.COLOR_GRASS);

    // Infinite road: a screen-locked tile sprite whose texture offset follows
    // the camera, so the markings move exactly with the world. Wide and tall
    // enough to cover the viewport even at ZOOM_FAST.
    // Diagnostic switch `?no=road` swaps it for a flat rectangle, which is the
    // quickest way to tell whether the tiled texture is what stutters.
    this.road = this.add
      .tileSprite(C.GAME_W / 2, C.GAME_H / 2, C.ROAD_TEX_W, C.GAME_H + 900, TEX.ROAD)
      .setScrollFactor(0)
      .setDepth(0);
    if (!DEBUG.road) this.road.setVisible(false);

    this.player = new PlayerCar(this, C.LANE_X[C.START_LANE], 0);
    // create() may run again after a shutdown – start from clean containers so
    // bodies/sprites of the previous lifecycle are not duplicated
    this.opponents = [];
    this.resetContacts();
    // two cars per lane, otherwise the motorway feels deserted
    for (let lane = 0; lane < C.LANE_COUNT; lane++) {
      for (let slot = 0; slot < C.OPPONENTS_PER_LANE; slot++) {
        this.opponents.push(new OpponentCar(this, lane, C.DEFAULT_SEED, slot));
      }
    }
    for (const o of this.opponents) o.siblings = this.opponents;

    this.roadside.create(this);
    this.fx.create(this);

    // ---- input ----------------------------------------------------------
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys({
      up: "W",
      down: "S",
      left: "A",
      right: "D",
      hand: "SPACE",
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    const restartKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    restartKey.on("down", () => {
      audio.unlock();
      if (this.phase !== "playing" && this.phase !== "countdown") {
        this.startRun(settings.seed);
      }
    });

    // audio needs a user gesture
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());
    kb.on("keydown", () => audio.unlock());

    // ---- physics hooks --------------------------------------------------
    const onCollisionStart = (event: { pairs: CollisionPairLike[] }) =>
      this.handleCollisionStart(event);
    this.matter.world.on("collisionstart", onCollisionStart);
    this.matter.world.on("beforeupdate", this.onPhysicsStep, this);

    // ---- shell commands -------------------------------------------------
    const onStart = () => this.startRun(settings.seed);
    const onMenu = () => this.enterMenu();
    bus.on(EV.CMD_START, onStart);
    bus.on(EV.CMD_MENU, onMenu);

    const cleanup = () => {
      this.destroyed = true;
      bus.off(EV.CMD_START, onStart);
      bus.off(EV.CMD_MENU, onMenu);
      // the Matter plugin may already be gone (see matterWorld)
      const world = this.matterWorld();
      world?.off("collisionstart", onCollisionStart);
      world?.off("beforeupdate", this.onPhysicsStep, this);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    /*
      20 Hz for the dashboard.

      The chronograph shows HUNDREDTHS, so the refresh rate has to be fast enough
      for them to visibly tick: at 20 Hz every refresh advances them by ~5, which
      reads as a running clock.

      That is still cheap: `emitHud` reuses one object and skips the React update
      entirely whenever nothing visible changed (standing still, menu, frozen
      values), so the HUD costs nothing it does not have to.
    */
    this.time.addEvent({
      delay: 50,
      loop: true,
      callback: this.tickHud,
      callbackScope: this,
    });

    this.enterMenu();
    bus.emit(EV.READY);

    // a START / MENU clicked before this scene existed must not be lost
    if (pendingCommands.start) {
      pendingCommands.start = false;
      pendingCommands.menu = false;
      this.startRun(settings.seed);
    } else {
      pendingCommands.menu = false;
    }
  }

  // ---------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------
  private setPhase(p: GamePhase): void {
    this.phase = p;
    // music lives with the race: starts when the countdown ends, stops on a
    // crash or at the finish line (menu / countdown / results are silent)
    audio.setMusicPlaying(p === "playing");
    bus.emit(EV.PHASE, p);
  }

  private placePlayerAtStart(): void {
    this.player.reset(C.LANE_X[C.START_LANE], 0);
    this.player.interpSnap(C.LANE_X[C.START_LANE], 0, 0);
  }

  private enterMenu(): void {
    for (const o of this.opponents) o.park();
    this.placePlayerAtStart();
    this.fx.reset();
    this.countdown = 0;
    this.cam.reset();
    this.appliedZoom = Number.NaN; // force the next frame to re-apply the zoom
    this.roadside.reset(this.player.y);
    this.syncCamera(16.667);
    this.setPhase("menu");
    // one HUD frame with the new phase; the periodic tick stays silent in the
    // menu, so there is no pointless re-rendering next to the game loop
    this.emitHud();
  }

  private startRun(seed: number): void {
    settings.seed = seed;
    for (const o of this.opponents) o.park();
    this.placePlayerAtStart();
    this.fxRng = new Rnd(99);
    this.roadside.reset(this.player.y);

    for (const o of this.opponents) {
      o.reseed(seed);
      // ── START GRID ────────────────────────────────────────────────────
      // Every opponent draws its speed first; same-direction cars that are
      // faster than the (standing) player are placed BEHIND it, so the first
      // cars of a run drive up from the bottom edge instead of appearing in
      // front of a car that never moved. Traffic flows during the countdown.
      o.spawn(this.player.y, this.player.kmh, true);
      // ─────────────────────────────────────────────────────────────────
    }

    this.fx.reset();
    this.resetContacts();
    this.race.reset();
    this.countdown = C.COUNTDOWN_SECONDS;
    this.lastCountInt = -1;
    this.cam.reset();
    this.appliedZoom = Number.NaN; // force the next frame to re-apply the zoom
    this.syncCamera(16.667);
    this.setPhase("countdown");
  }

  private crash(): void {
    this.crashTimer = C.CRASH_SEQUENCE_MS;
    audio.crash();
    audio.setSkid(0);
    const spin =
      (this.fxRng.nextRange(0, 2) === 0 ? -1 : 1) * (2 + this.fxRng.nextRange(0, 300) / 100);
    this.player.wreck(spin);
    // spawn the wreck smoke where the car is actually drawn
    this.fx.explodeSmoke(this.player.renderX, this.player.renderY, 14);
    this.cameras.main.flash(220, 255, 255, 255);
    this.setPhase("crashed");

    // The camera stops following the car here: the wreck may still be shoved down
    // the road by traffic, and the view must stay on the crash site (it only
    // settles gently – zoom/anchor keep easing – so there is no jerk).
    this.cam.freeze(this.player.renderY);

    // The wreck is NOT turned static: its own WRECK_DRAG stops it, but a car
    // slamming into it at speed keeps pushing it down the road (see
    // PlayerCar#applyWreckShove).
    // Every car caught in the fatal crash is written off on the spot, so the
    // ones that killed the player stop with it instead of flying on.
    const pb = this.player.body;
    if (pb) setAngularVelocityRadPerSec(pb, 0);
    this.trashCrashPartners();
  }

  /**
   * Cars close to the fatal crash are destroyed together with the player: they
   * are tinted like scrap, stop (wreck drag) and stay on screen. Without this the
   * car that killed the player kept its impulse and flew off across the road,
   * because at the moment of the hit the player was still alive.
   */
  private trashCrashPartners(): void {
    const p = this.player;
    for (const o of this.opponents) {
      if (!o.active) continue;
      // oncoming traffic is in another carriageway – never part of the crash
      if (o.isOncoming) continue;
      // same lane AND right at the impact point: the cars that hit / were hit
      if (Math.abs(o.x - p.x) > C.CRASH_PARTNER_ACROSS_PX) continue;
      if (Math.abs(o.y - p.y) > C.CRASH_PARTNER_ALONG_PX) continue;
      o.trash();
    }
  }

  private finishRun(finished = false): void {
    const p = this.player;
    const stats: RunStats = {
      distance: p.distance,
      time: p.time,
      fullSpeed: p.fullSpeed,
      topSpeed: p.topSpeed,
      seed: settings.seed,
      finished,
    };
    this.crashTimer = 0;
    p.controllable = false; // the car coasts to a stop behind the results screen

    // Only the WRECKS stay put – the rest of the traffic keeps driving past them
    // under the results window (freezing every car left the whole road littered
    // with cars stopped dead in the middle of their lanes). Wrecks are already
    // excluded from recycling, and the shove on the player's wreck decays through
    // its own WRECK_DRAG, so nothing creeps for ever.

    this.setPhase("gameover");
    if (finished) {
      audio.beep(true);
      this.cameras.main.flash(320, 80, 255, 140);
    }
    bus.emit(EV.GAMEOVER, stats);
  }

  /** Checkpoints (full repair) and the 100 km finish line. */
  private handleRaceEvents(): void {
    // `race.update()` was already called; its reused buffer holds the events
    for (let i = 0; i < this.race.eventCount; i++) {
      const event = this.race.events[i];
      if (event.kind === "finish") {
        this.finishRun(true);
        return;
      }
      this.player.repair();
      audio.beep(true);
      this.cameras.main.flash(180, 40, 220, 90);
      bus.emit(EV.CHECKPOINT, {
        index: event.index,
        total: event.total,
        distance: event.distance,
      });
      this.emitHud();
    }
  }

  // ---------------------------------------------------------------------
  // Fixed physics step (runs once per Matter engine step, 60 Hz)
  // ---------------------------------------------------------------------
  private onPhysicsStep(): void {
    try {
      this.physicsStep();
    } catch (err) {
      this.reportLoopError(err);
    }
  }

  /** One logged error is enough – repeating it every frame helps nobody. */
  private loopErrorLogged = false;
  private reportLoopError(err: unknown): void {
    if (this.loopErrorLogged) return;
    this.loopErrorLogged = true;
    console.error("[fullspeed] błąd w pętli gry (zgłaszam raz):", err);
  }

  private physicsStep(): void {
    if (this.destroyed || !this.player || !this.player.body) return;

    // physics step boundary: remember when it happened and shift the render
    // interpolation window of every car onto the state we just finished
    this.lastStepAtMs = performance.now();
    this.player.interpAdvance();
    for (const o of this.opponents) o.interpAdvance();

    const engine = (
      this.matter.world as unknown as { engine: { timing: { lastDelta: number } } }
    ).engine;
    const raw = (engine?.timing?.lastDelta || 1000 / STEPS_PER_SECOND) / 1000;
    // never let a hiccup (alt-tab, breakpoint) blow up the step
    const dt = clamp(raw, 1 / 240, 1 / 30);

    // catch the pairs Matter's discrete detector may have skipped
    this.sweepContacts(dt);

    if (this.phase === "countdown") {
      this.countdown -= dt;
      const ci = Math.ceil(this.countdown);
      if (ci !== this.lastCountInt) {
        this.lastCountInt = ci;
        if (ci > 0) audio.beep(false);
      }
      if (this.countdown <= 0) {
        this.countdown = 0;
        audio.beep(true);
        this.player.controllable = true;
        this.setPhase("playing");
      }
    } else if (this.phase === "crashed") {
      this.crashTimer -= dt * 1000;
      if (this.crashTimer <= 0) {
        this.finishRun();
        return;
      }
    }

    const counting = this.phase === "playing";
    // Traffic runs during the countdown, the race, the crash sequence AND under
    // the results window – the cars that were never part of the crash must keep
    // driving normally instead of freezing mid-lane.
    const moving =
      this.phase === "countdown" ||
      this.phase === "playing" ||
      this.phase === "crashed" ||
      this.phase === "gameover";
    // Once the results window is up NOTHING new may enter the road: no respawns.
    // Cars keep driving and leave the screen, wrecks stay where they are, and when
    // the last car has left, the road is finally quiet.
    const spawning = this.phase !== "gameover";

    this.player.fixedStep(dt, readCarInput(this.cursors, this.wasd), counting);
    for (const o of this.opponents) {
      o.fixedStep(
        dt,
        this.player.x,
        this.player.y,
        this.player.kmh,
        this.player.alive,
        this.opponents,
        moving,
        spawning,
      );
    }

    // a live car driving into somebody else's wreck is destroyed by it
    // (skipped entirely while no wreck exists – see handleWreckVsOpponents)
    this.handleWreckVsOpponents();

    if (counting && this.player.alive) {
      this.race.update(this.player.distance);
      this.handleRaceEvents();
    }

  }

  private handleWreckVsOpponents(): void {
    // nothing to do while there is no wreck at all – this runs every step, and
    // scanning 12 × 12 cars for nothing is wasted work
    if (this.wreckCounter === 0) return;
    const halfW = C.CAR_W / 2;
    const halfH = C.CAR_H / 2;
    const reachX = halfW * 2 - 6;
    const reachY = halfH * 2 - 8;

    for (const car of this.opponents) {
      if (!car.active || car.isWrecked) continue;
      for (const wreck of this.opponents) {
        if (wreck === car || !wreck.active || !wreck.isWrecked) continue;
        if (Math.abs(car.x - wreck.x) > reachX) continue;
        if (Math.abs(car.y - wreck.y) > reachY) continue;

        // the moving car is written off on the spot and the wreck is pinned
        car.trash();
        wreck.freeze();
        this.fx.burstSparks(
          (car.x + wreck.x) / 2,
          (car.y + wreck.y) / 2,
          Math.round(10 + Math.random() * 8),
        );
        this.fx.explodeSmoke((car.x + wreck.x) / 2, (car.y + wreck.y) / 2, 5);
        audio.bump(0.5);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Collisions
  // ---------------------------------------------------------------------
  /**
   * Matter does not guarantee that `pair.collision`, its `normal` or its
   * `supports` are present (see collision.ts), and a body may already be
   * detached – so every pair is validated and each one is isolated in a
   * try/catch: a single malformed pair must never kill the physics loop.
   */
  private handleCollisionStart(event: unknown): void {
    if (this.destroyed) return;
    if (this.phase === "menu" || this.phase === "boot") return;

    const pairs = (event as { pairs?: CollisionPairLike[] } | null | undefined)?.pairs;
    if (!pairs || typeof pairs.length !== "number") return;

    const playerBody = this.player.body;
    if (!playerBody || !playerBody.position) return;

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!pair) continue;
      try {
        this.handleCollisionPair(pair, playerBody);
      } catch (err) {
        if (!this.pairWarningLogged) {
          this.pairWarningLogged = true;
          console.warn("[fullspeed] malformed collision pair skipped", err);
        }
      }
    }
  }

  private handleCollisionPair(
    pair: CollisionPairLike,
    playerBody: MatterJS.BodyType,
  ): void {
    const bodyA = pair.bodyA;
    const bodyB = pair.bodyB;
    if (!bodyA || !bodyB) return;

    let other: MatterJS.BodyType | null = null;
    if (bodyA === playerBody) other = bodyB;
    else if (bodyB === playerBody) other = bodyA;
    if (!other) return;
    if (other.label !== "wall" && other.label !== "opponent") return;
    if (!other.position || !other.velocity || !playerBody.velocity) return;

    const victim = other.label === "opponent" ? this.opponentForBody(other) : null;
    const now = this.time.now;
    if (now < this.cooldownFor(victim)) return;
    this.setCooldown(victim, now + C.IMPACT_COOLDOWN_MS);

    const contact = contactPoint(pair, playerBody, other, this.fallback);
    const n = contactNormal(pair, playerBody, other);
    const impactKmh = normalImpactKmh(playerBody, other, n);
    /**
     * Closing speed used for the bill: the LARGER of the perpendicular impact
     * and the speed difference ALONG the road.
     *
     * The perpendicular component alone is blind to oncoming traffic: two cars
     * tearing past each other at 300 + 300 km/h touch corner to corner with a
     * perpendicular speed of ~0, which used to be billed as a 9 % scrape. Their
     * real closing speed is the sum of their speeds, and the along-road
     * difference is exactly that.
     */
    const closingKmh = Math.max(impactKmh, longitudinalImpactKmh(playerBody, other));

    // where the contact happened: alongside, on a corner, or nose-to-tail
    const zone = contactZone(
      this.player.x,
      this.player.y,
      playerBody.angle,
      other.position?.x ?? this.player.x,
      other.position?.y ?? this.player.y,
    );
    /**
     * Head-on is decided by the OTHER CAR'S LANE, not by its momentary velocity.
     * A body that is stopped, parked or momentarily zeroed by the solver has a
     * velocity of (0,0), and `atan2(0, -0)` returns π – i.e. it used to be
     * classified as oncoming, so ordinary rubs were charged as full head-ons.
     */
    const headOn = victim != null && victim.isOncoming;

    if (closingKmh < C.MIN_IMPACT_KPH) {
      // same-direction rub only – a head-on is NEVER a scrape, however the
      // geometry looks (see the closingKmh comment above)
      if (other.label === "opponent" && closingKmh >= C.MIN_SCRAPE_KPH && !headOn) {
        this.setCooldown(victim, now + C.SCRAPE_COOLDOWN_MS);
        const scr = resolveScrape(closingKmh);
        victim?.applyImpact(scr.strength, contact.x, contact.y, zone);
        // brushing the wreck also writes the other car off
        if (victim && !this.player.alive) victim.trash();
        // the player is thrown too – previously he only saw the opponent bounce
        this.player.applyBounce(scr.strength, contact.x, contact.y, zone);
        this.scrape(contact, scr.damage);
      } else {
        this.fx.burstSparks(contact.x, contact.y, 6);
      }
      return;
    }

    // A head-on keeps its full weight even if the geometry says "corner": the
    // two cars are closing at the SUM of their speeds, and the recoil is a full
    // one (bounceZone), so a corner-to-corner clash at 600 km/h kills.
    const bounceZone: C.ContactZone = headOn ? "rear" : zone;
    // `/ 220` instead of `/ 160`: a light touch now maps to a small impulse (0.3 →
    // 0.3) while only a real smack reaches full strength, so nudging the car in
    // front no longer behaves like a full-speed impact.
    const strength = clamp(closingKmh / 220, 0.25, 1);
    victim?.applyImpact(strength, contact.x, contact.y, bounceZone);
    // Running into the player's WRECK destroys the other car: it is trashed on
    // the spot, stops and stays on screen (see OpponentCar#trash).
    if (victim && !this.player.alive) victim.trash();
    this.player.applyBounce(strength * 0.8, contact.x, contact.y, bounceZone);
    // ...and the wreck itself is shoved along the impact direction. A standing
    // car hit at 300 km/h must be pushed tens of metres, not stay put.
    if (!this.player.alive) {
      const px = this.player.x - contact.x;
      const py = this.player.y - contact.y;
      const len = Math.hypot(px, py) || 1;
      this.player.applyWreckShove(closingKmh * C.KPH_TO_PX, px / len, py / len);
    }

    if (other.label === "wall") {
      // Same formula as a car contact, just a different share of the reference bill
      // (see constants.WALL_SCALE) – so a rail is no longer deadlier than a crash.
      const damage = (closingKmh / C.FULL_IMPACT_KPH) * C.WALL_SCALE * 100;
      const fatal = damage >= 100 && closingKmh >= C.MIN_FATAL_KPH;
      this.hitPlayer(fatal ? 999 : damage, closingKmh, contact, fatal);
      return;
    }

    // car-on-car: the zone and the direction decide the bill
    const outcome = resolveImpact(closingKmh, zone, headOn);
    this.hitPlayer(outcome.damage, closingKmh, contact, outcome.fatal);
  }

  /** Finds the AI car that owns a Matter body (used to push it on contact). */
  private opponentForBody(body: MatterJS.BodyType): OpponentCar | null {
    for (const o of this.opponents) {
      const b = o.body;
      if (b && b.id === body.id) return o;
    }
    return null;
  }

  /**
   * Swept-collision safety net: at motorway speeds the player covers ~33 px per
   * step and an oncoming car up to ~80 px, so Matter's discrete detector can
   * miss a pair completely. This tests the travelled segment (exactly the two
   * interpolation snapshots) against every active opponent box.
   */
  private sweepContacts(dt: number): void {
    const p = this.player;
    // nothing to resolve for a dead player (wrecks are handled by trash/freeze)
    if (!p.alive) return;

    // Cheap early out: the whole test is pointless if the player barely moved
    // (standing still, creeping, or blocked) – and it used to run for every car
    // on every single physics step.
    const x0 = p.lastStepX;
    const y0 = p.lastStepY;
    const x1 = p.x;
    const y1 = p.y;
    const movedX = x1 - x0;
    const movedY = y1 - y0;
    if (Math.abs(movedX) < 8 && Math.abs(movedY) < 8) return;

    const now = this.time.now;
    const px = this.player.x;

    for (let i = 0; i < this.opponents.length; i++) {
      const o = this.opponents[i];
      if (!o.active) continue;
      // LANE FILTER: the player is 1.6 m wide, so a car two or more lanes away
      // (1.5 × 64 px) can never touch him – skip it before touching any body.
      const laneX = C.LANE_X[o.lane];
      if (laneX < px - C.LANE_W * 1.5 || laneX > px + C.LANE_W * 1.5) continue;
      if (now < o.contactUntil) continue;
      const ob = o.body;
      if (!ob || !ob.position) continue;
      // broad phase: one range test instead of the full segment clip
      if (!sweepReaches(x0, y0, x1, y1, ob.position.x, ob.position.y)) continue;

      const hit = sweepImpact(x0, y0, x1, y1, ob, ob.position.x, ob.position.y, dt);
      if (!hit) continue;
      // one impulse per car per IMPACT_COOLDOWN_MS – repeated kicks while two
      // boxes still overlap were what made the shoves pile up into "weird force"
      this.setCooldown(o, now + C.IMPACT_COOLDOWN_MS);

      // This path is a simulated detection (Matter's detector missed the pair),
      // so BOTH cars have to be handed their impulse explicitly – otherwise the
      // cars just sit inside each other ("glued") while only damage is applied.
      // The zone comes from the sweep itself, refined with the geometry.
      const zone = worstZone(
        hit.zone,
        contactZone(p.x, p.y, p.body?.angle ?? 0, ob.position.x, ob.position.y),
      );

      // Same severity measure as the solver path: the sum of the speeds when the
      // cars meet head-on, the perpendicular component otherwise.
      const closingKmh = Math.max(hit.impactKmh, Math.abs(p.kmh - o.curKmh));
      const headOn = o.isOncoming;
      const bounceZone: C.ContactZone = headOn ? "rear" : zone;

      if (closingKmh >= C.MIN_IMPACT_KPH) {
        const strength = clamp(closingKmh / 220, 0.25, 1);
        o.applyImpact(strength, hit.contact.x, hit.contact.y, bounceZone);
        if (!p.alive) {
          o.trash();
          const px = p.x - o.x;
          const py = p.y - o.y;
          const len = Math.hypot(px, py) || 1;
          p.applyWreckShove(closingKmh * C.KPH_TO_PX, px / len, py / len);
        }
        p.applyBounce(strength * 0.8, o.x, o.y, bounceZone);
        const outcome = resolveImpact(closingKmh, zone, headOn);
        this.hitPlayer(outcome.damage, closingKmh, hit.contact, outcome.fatal);
      } else if (closingKmh >= C.MIN_SCRAPE_KPH && !headOn) {
        this.setCooldown(o, now + C.SCRAPE_COOLDOWN_MS);
        const scr = resolveScrape(closingKmh);
        o.applyImpact(scr.strength, hit.contact.x, hit.contact.y, zone);
        p.applyBounce(scr.strength, o.x, o.y, zone);
        this.scrape(hit.contact, scr.damage);
      }
    }
  }

  /** A scrape along another car: sparks, a knock, damage from the grinding speed. */
  private scrape(contact: Vec, damage: number = C.SCRAPE_DAMAGE): void {
    const died = this.player.applyDamage(damage);
    this.fx.burstSparks(contact.x, contact.y, 8);
    /*
      NO camera shake here on purpose. A scrape fires every SCRAPE_COOLDOWN_MS
      (260 ms) for as long as the cars touch, so shaking on each of them kept the
      camera trembling the whole time – sparks, dust and the grind sound carry the
      feedback just as well. Only real impacts shake (see hitPlayer).
    */
    bus.emit(EV.HIT, { damage: C.SCRAPE_DAMAGE, fatal: died, impact: 0 });
    if (died) this.crash();
    // saw-on-sheet-metal grind instead of a plain knock
    else audio.scrape();
  }

  private hitPlayer(
    damage: number,
    impactKmh: number,
    contact: Vec,
    forceFatal = false,
  ): void {
    // NOTE: the damage is applied in BOTH cases. The old `forceFatal || apply`
    // short-circuit skipped it whenever the hit was lethal, so the car crashed
    // with a nearly full health bar – "zdycha, a pasek ledwo się świeci".
    const died = this.player.applyDamage(
      forceFatal ? Math.max(damage, this.player.health) : damage,
    );
    const strength = clamp(impactKmh / 200, 0.1, 1);
    this.fx.burstSparks(contact.x, contact.y, Math.round(6 + strength * 18));
    // Shake, but never more often than ~3 per second: repeated hits used to chain
    // the effect into a permanent vibration.
    if (this.time.now - this.lastShakeAt > 330) {
      this.lastShakeAt = this.time.now;
      this.cameras.main.shake(120 + strength * 320, 0.004 + strength * 0.012);
    }
    const info: HitInfo = { damage, fatal: died, impact: impactKmh };
    bus.emit(EV.HIT, info);
    if (died) this.crash();
    else audio.bump(strength);
  }

  // ---------------------------------------------------------------------
  // Render-side update
  // ---------------------------------------------------------------------
  update(_time: number, delta: number): void {
    /*
      Phaser schedules the next animation frame only AFTER `step()` returns, so a
      single thrown exception inside the scene update kills the whole loop – the
      game freezes with nothing moving and the only trace is one console error.
      Everything the frame does is therefore guarded: a bad frame is logged once
      and skipped, the next frame still runs.
    */
    try {
      this.updateFrame(delta);
    } catch (err) {
      this.reportLoopError(err);
    }
  }

  private updateFrame(delta: number): void {
    if (this.destroyed || !this.player || !this.player.body) return;
    const p = this.player;

    // ---- render interpolation -------------------------------------------
    // Matter solves in fixed 60 Hz steps (0, 1 or 2 per rendered frame); we draw
    // between the last two states, so the picture is smooth on 60, 144 and
    // 260 Hz displays alike. Cars, shadows, camera, road and FX all derive from
    // the same interpolated state, so nothing drifts relative to anything else.
    const stepMs = 1000 / STEPS_PER_SECOND;
    this.interpAlpha = clamp((performance.now() - this.lastStepAtMs) / stepMs, 0, 1);
    p.interpRender(this.interpAlpha);
    for (const o of this.opponents) o.interpRender(this.interpAlpha);

    this.syncCamera(delta);
    this.roadside.update(p.y);

    // drawn at the interpolated positions – deliberately no camera shake here:
    // a per-frame shake made the whole screen tremble
    p.syncVisuals();
    for (const o of this.opponents) o.syncVisuals();

    // ---- FX + audio, paced by time (refresh-rate independent) -----------
    // EVERY wreck smokes – the player's and all the destroyed opponents' cars.
    // The list is a POOL of reused vectors: building it with fresh objects every
    // frame was feeding the garbage collector for no reason. The same loop counts
    // the wrecks, which lets the physics step skip its own scan entirely while
    // nobody is wrecked.
    this.wreckCount = 0;
    this.wreckCounter = p.alive ? 0 : 1;
    if (!p.alive) this.pushWreck(p.renderX, p.renderY);
    for (let i = 0; i < this.opponents.length; i++) {
      const o = this.opponents[i];
      if (o.active && o.isWrecked) {
        this.wreckCounter++;
        this.pushWreck(o.renderX, o.renderY);
      }
    }
    this.fx.wreckSmoke(delta, this.wreckPool, this.wreckCount, this.fxRng);

    const skidding = p.alive && p.slip > C.SKID_SLIP_PX && Math.abs(p.kmh) > 20;
    if (skidding) this.fx.skidSmoke(delta, p.rearWheels());
    else this.fx.stopSkid();

    // Diagnostic switch `?no=audio` stops the WebAudio parameter updates entirely
    // (engine + skid), which isolates the audio thread as a cause of stutter.
    if (DEBUG.audio && this.fx.shouldUpdateAudio(delta)) {
      audio.setSkid(skidding ? clamp((p.slip - C.SKID_SLIP_PX) / C.SKID_SLIP_SPAN, 0, 1) : 0);
      audio.setEngine(p.kmh, p.throttle, this.phase === "playing" || this.phase === "countdown");
    }
  }

  /** Ready-made contact position for cases where Matter gave us no supports. */
  private readonly fallback: Vec = { x: 0, y: 0 };

  /** Timestamp of the last camera shake (see hitPlayer). */
  private lastShakeAt = 0;
  /** Last zoom handed to the camera (skip redundant setZoom calls). */
  private appliedZoom = Number.NaN;
  /** How many opponents are wrecked right now (cheap early-out, see below). */
  private wreckCounter = 0;

  /**
   * Contact cooldown. Cars carry their own stamp (see OpponentCar#contactUntil);
   * the two guard rails need one of their own, because they are not cars.
   *
   * NOTE: walls used to fall through this check when the cooldown was keyed by
   * car – scraping along a barrier then fired sparks and damage on EVERY physics
   * step, which is a lot of work and looks like the game is "filling up".
   */
  private wallContactUntil = 0;

  private cooldownFor(car: OpponentCar | null): number {
    return car ? car.contactUntil : this.wallContactUntil;
  }

  private setCooldown(car: OpponentCar | null, until: number): void {
    if (car) car.contactUntil = until;
    else this.wallContactUntil = until;
  }

  private resetContacts(): void {
    this.wallContactUntil = 0;
    for (const o of this.opponents) o.contactUntil = 0;
  }

  /** Wreck smoke sources: a fixed pool, filled up to `wreckCount` per frame. */
  private readonly wreckPool: Array<{ x: number; y: number }> = Array.from(
    { length: 40 },
    () => ({ x: 0, y: 0 }),
  );
  private wreckCount = 0;

  private pushWreck(x: number, y: number): void {
    if (this.wreckCount >= this.wreckPool.length) return;
    const slot = this.wreckPool[this.wreckCount++];
    slot.x = x;
    slot.y = y;
  }

  /** Applies the camera module's state to Phaser's camera and the road tile. */
  private syncCamera(delta: number): void {
    // `update()` writes into the camera's own fields – no tuple per frame
    this.cam.update(delta, this.player.kmh, this.player.renderY);
    const cam = this.cameras.main;
    // only touch the camera when the value really changed: below 200 km/h the zoom
    // is constant, so this is skipped for most of a normal drive
    if (this.appliedZoom !== this.cam.zoom) {
      this.appliedZoom = this.cam.zoom;
      cam.setZoom(this.cam.zoom);
    }
    // camera scroll and road-tile offset share the same whole pixel, so the
    // tiled asphalt never shimmers while the cars stay sub-pixel smooth
    cam.setScroll(C.ROAD_CENTER - C.GAME_W / 2, this.cam.scrollY);
    this.road.tilePositionY = this.cam.scrollY;
  }

  /** Periodic HUD tick: silent while the menu is up (nothing to draw there). */
  private tickHud(): void {
    if (this.phase === "menu" || this.phase === "boot") return;
    this.emitHud();
  }

  /** Last HUD frame, reused – and compared before emitting (see emitHud). */
  private readonly hudFrame: HudData = {
    phase: "boot",
    speed: 0,
    distance: 0,
    time: 0,
    fullSpeed: 0,
    health: 100,
    countdown: 0,
    offroad: false,
    gear: 1,
    rpm: 0,
    goal: C.RACE_DISTANCE_M,
    checkpoint: 0,
    checkpoints: C.CHECKPOINT_COUNT,
  };
  /** tick counter of the chronograph's hundredths, to detect changes cheaply */
  private hudLastHundredths = -1;

  /**
   * Sends the dashboard state to React.
   *
   * The object is REUSED and the frame is skipped entirely when nothing the user
   * can see has changed. A fresh object plus a React re-render 20 times a second
   * was allocating thousands of short-lived objects (the HUD tree alone builds
   * ~70 of them per render), which is exactly the churn a major GC is triggered
   * by during gameplay.
   */
  private emitHud(): void {
    if (this.destroyed) return;
    const p = this.player;
    const d = this.hudFrame;

    const speed = Math.round(Math.abs(p.kmh));
    const distance = Math.floor(p.distance);
    const fullSpeed = Math.floor(p.fullSpeed);
    const health = Math.round(p.health);
    const gear = C.gearFor(p.kmh);
    // the bar only moves in 5 % steps – finer resolution is invisible
    const rpm = Math.round(computeRpm(p.kmh) * 20) / 20;
    const countdown = Math.max(0, Math.ceil(this.countdown));
    const hundredths = Math.floor(p.time * 100);

    const changed =
      d.phase !== this.phase ||
      d.speed !== speed ||
      d.distance !== distance ||
      d.fullSpeed !== fullSpeed ||
      d.health !== health ||
      d.gear !== gear ||
      d.rpm !== rpm ||
      d.countdown !== countdown ||
      d.offroad !== p.offroad ||
      this.hudLastHundredths !== hundredths ||
      d.checkpoint !== this.race.count;

    if (!changed) return;

    d.phase = this.phase;
    d.speed = speed;
    d.distance = distance;
    d.time = p.time;
    d.fullSpeed = fullSpeed;
    d.health = health;
    d.countdown = countdown;
    d.offroad = p.offroad;
    d.gear = gear;
    d.rpm = rpm;
    d.goal = C.RACE_DISTANCE_M;
    d.checkpoint = this.race.count;
    d.checkpoints = this.race.total;
    this.hudLastHundredths = hundredths;

    // React gets a shallow copy: it must not see the object mutate under it
    bus.emit(EV.HUD, { ...d });
  }
}

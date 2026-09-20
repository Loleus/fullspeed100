// ---------------------------------------------------------------------------
// World / rendering
// ---------------------------------------------------------------------------
export const GAME_W = 480;
export const GAME_H = 800;

export const LANE_COUNT = 6;
export const LANE_W = 64;
export const ROAD_W = LANE_W * LANE_COUNT; // 384
export const ROAD_LEFT = (GAME_W - ROAD_W) / 2; // 48
export const ROAD_RIGHT = ROAD_LEFT + ROAD_W; // 432
export const ROAD_CENTER = GAME_W / 2;

/** How many lanes on the left carry oncoming traffic. Both are open; the
 * inner one (lane 1, next to the median) is the fast lane. */
export const ONCOMING_LANES = 2;
/** Double solid line between the oncoming carriageway and the player's four lanes. */
export const MEDIAN_X = ROAD_LEFT + LANE_W * ONCOMING_LANES; // 176

/** Centre X of every lane. Lane 0 is the slow oncoming lane at the left edge. */
export const LANE_X: number[] = Array.from(
  { length: LANE_COUNT },
  (_, i) => ROAD_LEFT + LANE_W * (i + 0.5),
); // 80, 144, 208, 272, 336, 400

export const SHOULDER_W = 24; // gravel strip outside the asphalt on both sides
export const RAIL_X_LEFT = ROAD_LEFT - SHOULDER_W - 2; // 22
export const RAIL_X_RIGHT = ROAD_RIGHT + SHOULDER_W + 2; // 458

// ---------------------------------------------------------------------------
// METRIC SCALE – the single source of truth for "how many pixels is a metre"
// ---------------------------------------------------------------------------
/**
 * The player car is 4 m long, 1.6 m wide and has a 2.5 m wheelbase (the real
 * figures from the prompt). Its sprite is 80 px long, so:
 *
 *      20 px = 1 m   →   PX_PER_M = 20
 *
 * Everything else is derived from that, which is what makes the scrolling
 * honest: 100 km/h = 27.78 m/s = 555.6 px/s of road moving under the car
 * (≈ 7 car lengths per second), not the 180 px/s the old 1.8 px/km-h mapping
 * produced (which made the background crawl at about a third of the real
 * speed – the car "did" 100 km/h while the world moved as if it were 32 km/h).
 */
export const PX_PER_M = 20;
export const CAR_LENGTH_M = 4;
export const CAR_WIDTH_M = 1.6;
export const WHEELBASE_M = 2.5;

export const CAR_W = CAR_WIDTH_M * PX_PER_M; // 32 px (1.6 m)
export const CAR_H = CAR_LENGTH_M * PX_PER_M; // 80 px (4 m)

// ---------------------------------------------------------------------------
// Road markings – motorway spacing (bigger spread than a national road)
// ---------------------------------------------------------------------------
/**
 * Poland, motorway / expressway (autostrada, S): the broken lane line P-1 is a
 * 6 m stroke followed by a 12 m gap → an 18 m cycle = 360 px of texture.
 *
 * For comparison, a national road (droga krajowa) uses a 3 m stroke with a 6 m
 * gap = 9 m cycle: half the stroke and half the spacing. The old texture had
 * ~36 px strokes every 80 px, i.e. a 1.8 m + 2.2 m "urban" rhythm – far too
 * dense for the six-lane motorway this game plays on, and it made the ground
 * look like it was barely moving.
 */
export const LINE_M_MOTORWAY = 6;
export const GAP_M_MOTORWAY = 12;
export const LINE_M_NATIONAL = 3;
export const GAP_M_NATIONAL = 6;
/** Texture tile height in px = one full dash cycle. */
export const ROAD_TILE_H = (LINE_M_MOTORWAY + GAP_M_MOTORWAY) * PX_PER_M; // 360
/** Line width: 0.2 m (P-1/P-2/P-4 in the Polish standard). */
export const ROAD_LINE_W = Math.round(0.2 * PX_PER_M); // 4 px

/**
 * The road texture is wider than the screen: when the camera pulls back to
 * ZOOM_FAST the visible world gets wider than GAME_W, and without the extra
 * grass on both sides you would see the flat camera background next to the
 * banded grass of the texture. The road itself is drawn at +ROAD_TEX_OFFSET_X,
 * which is exactly the difference, so world x = 0 lands on the right pixel.
 */
export const ROAD_TEX_EXTRA_W = 640;
export const ROAD_TEX_W = GAME_W + ROAD_TEX_EXTRA_W;
export const ROAD_TEX_OFFSET_X = ROAD_TEX_EXTRA_W / 2;

// ---------------------------------------------------------------------------
// Camera – GTA-1 style: the faster you drive, the higher the camera rises
// ---------------------------------------------------------------------------
/**
 * Two things change with speed:
 *
 *   1) where the car sits on screen: 1/7 from the bottom at a standstill
 *      (FRAC_SLOW) to 1/5 from the bottom at v-max (FRAC_FAST);
 *   2) the zoom pulls back from 1.0 to 0.66, which lifts the view exactly like
 *      the classic top-down GTA.
 *
 * The road visible AHEAD of the car is  frac × GAME_H / zoom:
 *
 *   standstill   0.857 × 800 / 1.00 =  686 px (34 m)
 *   v-max        0.800 × 800 / 0.66 =  970 px (48 m)
 *
 * With the slowest car of the fastest lane at 270 km/h, the closing speed at
 * v-max is 90 km/h = 500 px/s, so the warning time grows from 0.99 s (old:
 * anchor 2/3, zoom 0.88 → 551 px ahead) to 1.94 s – twice as much, which is
 * what makes lane 2 playable at full throttle.
 */
export const FRAC_SLOW = 6 / 7; // car 1/7 from the bottom at standstill
export const FRAC_FAST = 0.8; // car 1/5 from the bottom at v-max
export const ZOOM_SLOW = 1.0;
export const ZOOM_FAST = 0.78;

// ---------------------------------------------------------------------------
// Camera rise window
// ---------------------------------------------------------------------------
/**
 * The camera only reacts to speed in this window:
 *
 *   below ZOOM_FROM_KPH (200)  → zoom and anchor sit still at their slow values,
 *   between 200 and ZOOM_FULL_KPH (300) → the camera rises smoothly,
 *   above 300 → nothing changes any more, the view stays at ZOOM_FAST.
 *
 * With the whole 0–360 km/h range mapped (the old behaviour) the camera was
 * adjusting on EVERY frame of every drive – constant work and a picture that never
 * held still. Now, below 200 km/h nothing moves at all: the frame is perfectly
 * stable (and the renderer has one less thing to recompute), which is what a
 * player mostly sees while driving normally.
 */
export const ZOOM_FROM_KPH = 200;
export const ZOOM_FULL_KPH = 300;

export const COLOR_GRASS = 0x2f6b2c;

// ---------------------------------------------------------------------------
// Physics tuning (speeds in km/h, world in px)
// ---------------------------------------------------------------------------
/**
 * px per second for every km/h, derived from the metric scale:
 *   1 km/h = 1000/3600 m/s = 0.2778 m/s → × 20 px/m = 5.556 px/s
 * So 100 km/h scrolls the world at 555.6 px/s (27.78 m/s) – the background
 * moves exactly as far as the car really travels.
 */
export const KPH_TO_PX = (PX_PER_M * 1000) / 3600; // ≈ 5.556
/**
 * Design v-max: the speed the run is built around (camera, zoom, gearbox,
 * "V-MAX CZAS" counter). It is reachable in a FINITE time – see below.
 */
export const MAX_SPEED = 360;
export const REVERSE_MAX = 30;

/**
 * Asymptote of the power curve, i.e. the absolute maximum the car can reach
 * only after an INFINITE time. It sits 10 km/h above the design v-max, so there
 * is always a little acceleration left at 360 km/h – the car really gets there
 * (≈ 30 s from a standstill) instead of creeping up on 360 forever.
 */
export const ENGINE_V_MAX = 370;

/**
 * Net acceleration under full throttle (km/h per second at standstill) follows
 * a power curve – it is NOT a constant ramp:
 *
 *   a(v) = ENGINE_ACCEL * (1 - (v / ENGINE_V_MAX) ^ ENGINE_CURVE_EXP)
 *
 * which gives roughly
 *   0→100 km/h ≈ 5.0 s · 0→200 ≈ 10.2 s · 0→300 ≈ 16.9 s
 *   0→350 ≈ 25.5 s · 0→360 ≈ 29 s · 370 = asymptota (t → ∞)
 * and the last 10 km/h take longer than the first 100 – like a real car at the
 * top of its last gear, instead of "100 km/h every 3 s" all the way to v-max.
 */
export const ENGINE_ACCEL = 20; // km/h per s at standstill (0→100 in ≈ 5 s)
/** Higher = the power fades harder as speed grows (4 ≈ strong top-end wall). */
export const ENGINE_CURVE_EXP = 4;
export const BRAKE_DECEL = 75;
export const REVERSE_ACCEL = 18;
export const ROLL_DRAG = 3;
export const AERO_DRAG = 0.02; // per second, times speed
/**
 * Gravel penalty.
 *
 * BUG FIX: these used to be 20 + 0.15·v, while the engine makes
 * ENGINE_ACCEL = 20 km/h per second at a standstill – so on the shoulder the
 * NET acceleration was exactly 0.0 and a car that stopped there could never
 * move again ("nie startuje ze żwiru"), which also looked like the car was
 * glued to the road edge and unable to climb back onto the tarmac.
 *
 * With 8 + 0.12·v the car still pulls away from a standstill (20 − 8 = 12
 * km/h/s ≈ 0→60 in 5 s) but the shoulder keeps its cost: net torque goes
 * negative around 100 km/h, so the gravel tops you out at roughly 100 km/h.
 */
export const OFFROAD_DRAG = 8;
export const OFFROAD_DRAG_K = 0.12;
export const HANDBRAKE_DECEL = 55;
export const WRECK_DRAG = 110;

/** Rear/front axle distance: the real 2.5 m wheelbase = 50 px. */
export const WHEELBASE = WHEELBASE_M * PX_PER_M; // 50 px

/**
 * Steering limits.
 *
 * Yaw rate is a bicycle-model rate: ω = (KPH_TO_PX · kmh / WHEELBASE) · tan θ,
 * so with a 2.5 m wheelbase a full 8° of lock at 100 km/h would spin the car at
 * ~57°/s – a slot car, not a car. The intended feel:
 *
 *   100 km/h → ≈ 28°/s   (lane change in ~2.5 s)
 *   200 km/h → ≈ 32°/s   (still confident, the assist keeps it straight)
 *   360 km/h → ≈ 10°/s   (gentle, no twitchiness at v-max)
 *
 * The wheel "shrinks" steeply with speed (STEER_CURVE_EXP < 1 moves most of the
 * reduction into the low range), which is what a real rack does too.
 */
export const STEER_MAX_SLOW = 0.16; // rad ≈ 9° at standstill
export const STEER_MAX_FAST = 0.0045; // rad ≈ 0.26° at v-max
export const STEER_CURVE_EXP = 0.35; // how fast the lock fades with speed
/** Seconds to full lock – the main "how sensitive are the keys" dial (0.38 s). */
export const STEER_IN_RATE = 2.6; // per second
/** And back to centre (0.2 s), slightly quicker so releasing straightens out. */
export const STEER_OUT_RATE = 5; // per second
/** Speed (px/s) at which the stability assist is fully effective – 80 px/s in
 *  the old px-era × 3.09 = 247 px/s (≈ 44 km/h). */
export const ASSIST_SPEED_REF = PX_PER_M * 12.35; // 247 px/s
export const GRIP_SLOW = 13;
export const GRIP_FAST = 7;
/** Gravel: loose, but not so loose that steering back onto the road is hopeless. */
export const GRIP_OFFROAD = 5;
export const GRIP_HANDBRAKE = 2.5;
export const GRIP_WRECK = 1.5;
export const ASSIST_RATE = 3.0; // heading self-centering when not steering
/** How fast the yaw settles onto the bicycle-model target (lower = calmer). */
export const ANGULAR_BLEND = 7;

export const PLAYER_MASS = 120;
export const OPPONENT_MASS = 110;

// ---------------------------------------------------------------------------
// Collision categories
// ---------------------------------------------------------------------------
/**
 * Collision categories. Every car collides with EVERYTHING except itself:
 * the player, the other cars and both guard rails.
 *
 * Cars must collide with each other: if you shove one opponent aside it has to be
 * able to hit the car next to it, and that one can then be knocked into the
 * barriers – chain reactions are half the fun of a crash. Disabling those pairs
 * was tried while hunting the stutter; the real cause was the number of bodies
 * (12 opponents instead of 6), so the pairs are back and the traffic is lighter
 * instead.
 */
export const CATEGORY_PLAYER = 0x0001;
export const CATEGORY_OPPONENT = 0x0002;
export const CATEGORY_WALL = 0x0004;

/** Matter `collisionFilter` values (category / mask). */
export const FILTER_PLAYER = {
  category: CATEGORY_PLAYER,
  mask: CATEGORY_WALL | CATEGORY_OPPONENT,
  group: 0,
};
export const FILTER_OPPONENT = {
  category: CATEGORY_OPPONENT,
  mask: CATEGORY_WALL | CATEGORY_PLAYER | CATEGORY_OPPONENT,
  group: 0,
};
export const FILTER_WALL = {
  category: CATEGORY_WALL,
  mask: CATEGORY_PLAYER | CATEGORY_OPPONENT,
  group: 0,
};

// ---------------------------------------------------------------------------
// Collision sanity limits
// ---------------------------------------------------------------------------
/**
 * There is no gravity in this top-down world: what made the car "fly" after a
 * hit was Matter's collision solver. When two boxes interpenetrate deeply (at
 * 360 km/h a car covers 33 px per step, and oncoming traffic up to 80 px) the
 * engine injects a positional correction which becomes *velocity* on the next
 * step – far more than the real relative speed of the impact. On top of that,
 * a spun car turns its sideways momentum into "forward" momentum, so the grip
 * model no longer fights the slide.
 *
 * These clamps keep contacts physical: a 60 km/h-relative impact shoves the car
 * (≈ 1 m of slide, gone in ~100 ms), it does not launch it across the road.
 */
/** Max |velocity| a hit may give the player, as a factor of v-max. */
export const IMPACT_SPEED_MARGIN = 1.12;
/** Max sideways velocity from an impact (px/s ≈ 47 km/h). */
export const IMPACT_LATERAL_MAX = 260;
/** Angular velocity cap (rad/s ≈ 229°/s) – no instant spins on contact. */
export const MAX_SPIN_RADS = 4;
/** Opponents: a shove may not exceed their own cruise by more than this. */
export const OPP_IMPACT_SPEED_MARGIN = 1.25;

// ---------------------------------------------------------------------------
// Opponent collision response
// ---------------------------------------------------------------------------
/**
 * Opponents used to be pure "rails": the driver model overwrote their velocity
 * every step, so a contact with them did nothing visible (the player bounced off
 * an immovable object) and Matter's own impulse produced spins that the model
 * then failed to damp – the car pirouetted across the road like it was on ice.
 *
 * Now every contact pushes the opponent sideways AND spins it, and that shove is
 * deliberately allowed to survive for a moment before the lane-keeping model
 * reels the car back in:
 */
/** Fallback kick used when no contact zone could be determined (px/s). */
export const OPP_IMPACT_PUSH = 320;
/**
 * Spin a contact may add (rad/s). Deliberately tiny: the rotation of an AI car
 * comes from the geometry of the crash, and we do NOT want to top it up – adding
 * spin on top of what Matter already applied was what turned opponents into
 * spinning tops that then drove on sideways.
 */
export const OPP_IMPACT_SPIN = 1;
/**
 * Hard ceiling on an AI car's angular velocity (rad/s ≈ 80°/s). The player gets
 * MAX_SPIN_RADS, which is fine for a wreck, but a traffic car must never
 * pirouette – it would only end up sliding down the road at right angles.
 */
export const OPP_MAX_SPIN_RADS = 2;
/** Max sideways velocity of an AI car – defined with the contact zones below. */
// (OPP_LATERAL_MAX: see "Contact zones")
/** Self-righting: how hard the heading is pulled back to the lane direction. */
export const OPP_OMEGA_STIFFNESS = 10; // rad/s per rad of error
/** How fast the angular velocity follows that target. */
export const OPP_OMEGA_BLEND = 10; // per second
/** Plain angular damping, applied every step (kills any leftover spin). */
export const OPP_OMEGA_DAMP = 6; // per second
/** How long a car stays unsettled after a hit (s) – then normal driving resumes. */
export const OPP_HIT_RECOVER_S = 0.45;
/**
 * Minimum gap between two impulses handed to the same car (s). Contacts repeat
 * every physics step while two cars overlap, so a gate is needed – but it has to
 * stay short, otherwise a scrape gets no kick at all and the two cars just ride
 * glued together.
 */
export const OPP_IMPACT_COOLDOWN_S = 0.12;

/**
 * Car-to-car material.
 *
 * 0.3 friction / 0.03 restitution (my previous set) made the cars grab each
 * other and stick – scrapes dragged the two bodies along together and even a
 * full hit had nothing to bounce with. These values keep a little grip but let
 * the bodies slide apart and rebound visibly.
 */
export const CAR_FRICTION = 0.12;
export const CAR_FRICTION_STATIC = 0.35;
export const CAR_RESTITUTION = 0.22;
/** A full impact may not re-trigger on the same body more often than this (ms). */
export const IMPACT_COOLDOWN_MS = 200;
/**
 * Lane-keeping rate right after a hit. It is SLOWER than the normal OPP_RECOVER
 * (3) on purpose: pulling the shoved car straight back into the lane it was just
 * knocked out of pressed it right back against the player, which is what made
 * the two cars look glued together. The heading is still righted immediately
 * (see OPP_OMEGA_STIFFNESS), so the car does not drive sideways meanwhile.
 */
export const OPP_RECOVER_AFTER_HIT = 3.1;

/**
 * A car is only treated as "traffic to queue behind" while it is actually
 * moving. A wreck (or a player standing still) used to be braked up to at full
 * stop, which parked every AI car on top of it – the "wszystko poprzylepiane
 * po kraksie" case. They now drive on and are pushed aside by the contact.
 */
export const OPP_QUEUE_MIN_PLAYER_KPH = 25;

/**
 * A wreck is a solid obstacle, not traffic: cars that run into it are written
 * off on the spot – they get trashed, stop dead and STAY on screen next to the
 * player (no swerving around, no driving through, no recycling off-screen).
 */
export const OPP_BLOCKED_S = 999; // effectively "for the rest of the run"
/** Drag applied to a trashed opponent so it slides to a halt and stays. */
export const OPP_WRECK_DRAG = 150; // km/h per second – scrap stops fast
/** Below this speed a wrecked car is frozen solid (px/s). */
export const OPP_WRECK_STOP_PX = 40;
// ---------------------------------------------------------------------------
// Wreck momentum
// ---------------------------------------------------------------------------
/**
 * The player's wreck is NOT immovable: a car ploughing into a standing car at
 * 300 km/h has to shove it down the road by tens of metres, not bounce off it.
 * The wreck stays dynamic and gets this much of the closing speed (capped), then
 * its own WRECK_DRAG (110 km/h per second) brings it to a stop.
 *
 *   300 km/h of closing speed → ~165 km/h of shove → ~40 m of slide in ~1.5 s
 */
export const WRECK_SHOVE_FACTOR = 0.55;
export const WRECK_SHOVE_MAX_PX = 1200; // ≈ 216 km/h, hard ceiling
/**
 * Cars written off together with the player in the fatal crash: only the ones
 * ACTUALLY involved, i.e. in the player's own lane and right at the impact.
 * A single radius used to catch the whole neighbourhood, so traffic just driving
 * past in the neighbouring lanes blew up as well.
 */
export const CRASH_PARTNER_ALONG_PX = 150; // ≈ 1.9 car lengths, fore/aft
export const CRASH_PARTNER_ACROSS_PX = 44; // ≈ 1.4 car widths, same lane

/** Player: lateral kick of an impact resolved without Matter (px/s ≈ 47 km/h). */
export const PLAYER_BOUNCE_MAX = 260;
/**
 * How hard a contact twists the player's car (rad/s at full strength).
 * A corner clip or a side swipe must visibly throw the car off line – the old
 * flat 1.5 rad/s was barely noticeable at motorway speed.
 */
export const PLAYER_HIT_SPIN = 2.8;
/** Player: forward momentum kept after such an impact (0.85 = 15 % lost). */
export const PLAYER_BOUNCE_LOSS = 0.15;
/** Below this speed the extra collision scrub does nothing. */
export const SCRUB_MIN_KPH = 20;
/**
 * Tyre scrub for a car that is not pointing along its travel direction: a
 * sideways car loses speed instead of skating across the lanes forever.
 */
export const SCRUB_DRAG_K = 0.25;

// ---------------------------------------------------------------------------
// Gearbox (6 forward gears + reverse)
// ---------------------------------------------------------------------------
export const GEAR_COUNT = 6;
/**
 * Shift points in km/h – six forward gears, the last one engaged early enough
 * that the final stretch towards the ceiling is a long, low-rpm pull:
 *   1st 0–60 · 2nd 60–110 · 3rd 110–165 · 4th 165–230 · 5th 230–300 · 6th 300–370
 */
export const GEAR_BOUNDS: ReadonlyArray<number> = [60, 110, 165, 230, 300];

/** 0 = reverse, 1..GEAR_COUNT = forward gear for a given speed. */
export function gearFor(kmh: number): number {
  if (kmh < 0) return 0;
  let gear = 1;
  for (const bound of GEAR_BOUNDS) if (kmh >= bound) gear++;
  return Math.min(gear, GEAR_COUNT);
}

/**
 * Precomputed gear spans, `[from, to]` in km/h, index 0 = reverse.
 *
 * The table is built ONCE at module load. The previous implementation returned a
 * fresh array on every call, and the engine sound asks for it ~20 times a second –
 * small, but it is exactly the kind of steady allocation the garbage collector
 * reacts to. Callers must treat the tuples as read-only.
 */
const GEAR_SPANS: ReadonlyArray<readonly [number, number]> = [
  [-REVERSE_MAX, 0],
  ...Array.from(
    { length: GEAR_COUNT },
    (_, i): [number, number] => [
      i === 0 ? 0 : GEAR_BOUNDS[i - 1],
      i === GEAR_COUNT - 1 ? ENGINE_V_MAX : GEAR_BOUNDS[i],
    ],
  ),
];

/**
 * Locked-ratio bounds of a gear: [from, to] in km/h. Gear 0 = reverse; the top
 * gear revs out towards ENGINE_V_MAX (the asymptote), not the design v-max.
 * Returns a shared tuple – do not mutate it.
 */
export function gearSpan(gear: number): readonly [number, number] {
  if (gear <= 0) return GEAR_SPANS[0];
  return GEAR_SPANS[Math.min(gear, GEAR_COUNT)];
}

/**
 * The "V-MAX CZAS" counter runs from here – a hair below the design v-max,
 * which the power curve reaches after ≈ 30 s of flat-out driving.
 */
export const FULL_SPEED_THRESHOLD = MAX_SPEED - 4;

// opponents
/**
 * The RNG "loop" values come from the original build (tuned for a 521 px tall
 * screen). They are converted to this world's pixels with SPAWN_SCALE.
 *
 * Metric scale: the world now scrolls 5.556 px per km/h instead of the old 1.8
 * (×3.09), so every px distance is scaled by the same 3.09 to keep the reaction
 * times identical: 2 × 3.09 ≈ 6.
 *
 * With SPAWN_SCALE = 6 a lane-5 car (slow, same direction) re-enters 2100–4800
 * px away from the player, i.e. a real 105–240 m instead of the old 700–1600 px
 * that only "pretended" to be metres.
 */
export const SPAWN_SCALE = 6;
export const OPP_ACCEL = 25;
export const OPP_DECEL = 110;
export const OPP_RECOVER = 3; // how fast an opponent returns to its lane / speed after a bump
/** Braking look-ahead: 380 px in the old pacing × 3.09 ≈ 1200 px (60 m). */
export const OPP_LOOKAHEAD = 1200;
/** Lane-keeping speed clamp: ±70 px/s in the old pacing × 3.09 ≈ ±215 px/s. */
export const OPP_LANE_CLAMP = 215;
/** Distance at which an opponent brakes hard for slower traffic: 430 px ≈ 21 m. */
export const OPP_BRAKE_HARD_PX = 430;

/** Lateral slip (px/s) from which the tyres squeal – 80 px/s in the old pacing. */
export const SKID_SLIP_PX = 250;
/** Slip range mapped onto the skid volume. */
export const SKID_SLIP_SPAN = 500;
/** A 33 px physics step can jump past a thin rail – make the bodies fat. */
export const WALL_THICKNESS = 60;

// ---------------------------------------------------------------------------
// START GRID FIX
// ---------------------------------------------------------------------------
/**
 * The original build always dropped the first opponents *ahead* of the player
 * (the RNG only knows negative "loop" values), so traffic materialised in
 * front of a standing car. Wrong: on a highway the cars you share your
 * carriageway with must come up from behind – you see them appear at the
 * bottom edge and reel you in, even if you never touch the throttle (or
 * immediately reverse into them).
 *
 * With START_FROM_BEHIND the first appearance of every same-direction
 * opponent is placed at a positive distance behind the player instead.
 * Oncoming lanes keep entering from ahead – that is what oncoming traffic
 * does – but they stay far outside the viewport so nothing pops in front of
 * the player either.
 */
export const START_FROM_BEHIND = true;
/**
 * Where the first car of a lane starts. The distance is derived from that car's
 * OWN cruise speed, so the start stays fair whatever the RNG drew:
 *
 *   behind_px = cruise_speed_px_per_s × arrival_delay
 *
 * i.e. the car needs `START_ARRIVAL_S` seconds to reach a player who never
 * moves (plus `START_ARRIVAL_STEP_S` per lane towards the median, which also
 * staggers the start grid). The delay is measured from the beginning of the run
 * – including the countdown – so the fastest lane-5 car (150 km/h, 833 px/s)
 * arrives after ≈ 6 s, leaving the player time to get going instead of being
 * rear-ended while still waiting for "GO!".
 */
export const START_ARRIVAL_S = 6;
/** Extra delay per lane towards the median (s). */
export const START_ARRIVAL_STEP_S = 1.2;
/** Never start the first car closer than this (px ≈ 65 m). */
export const START_BEHIND_MIN = 1300;

/**
 * ONE car per lane – 6 opponents in total.
 *
 * It used to be two per lane (12 bodies) because a single car in a 100–200 m
 * corridor could only create one encounter per cycle and the road felt deserted.
 * With Matter that density is not free: every body is integrated and swept on
 * every step of the whole run, on screen or not, and the cost shows up as stutter
 * (exactly what the measured 21 bodies / permanent physics work pointed at).
 *
 * Six cars – one per lane – keep the traffic alive (the density table below still
 * thins the oncoming lanes further) while halving the number of simulated bodies.
 */
export const OPPONENTS_PER_LANE = 1;

/**
 * Traffic density per lane, as a divisor of the normal rate (1 = normal).
 *
 * The oncoming carriageway is deliberately thinned out:
 *   lane 0 (slow, far left)  → 6× fewer cars
 *   lane 1 (fast, at median) → 3× fewer cars
 *
 * Those two streams are the most expensive traffic in the game – they close on the
 * player at 500–650 km/h, so they cross the whole viewport in a fraction of a
 * second and were almost permanently on screen, i.e. permanently in the physics
 * and broadphase. A car of such a lane now leaves the road after its pass and waits
 * (density − 1) travel times before it comes back, so the average number of
 * oncoming cars on screen drops to a third / a sixth.
 *
 * Our own direction (lanes 2–5) keeps its normal rate: that is the traffic the
 * player actually races against.
 */
export const LANE_DENSITY: ReadonlyArray<number> = [2, 2, 1, 1, 1, 1];
/** Minimum gap between two cars of the same lane when (re)spawning (px = 80 m). */
export const SPAWN_SEPARATION_PX = 1600;

/**
 * Traffic corridor: how far from the player a car may roam before it is recycled
 * onto the other side.
 *
 * Tightened to 2.5 s of its own travel (≈ 65–190 m) so the same six cars come
 * round much more often – with one car per lane that is what keeps the road
 * feeling busy without adding a single Matter body.
 */
export const CORRIDOR_S = 2.5;
export const CORRIDOR_MIN_PX = 1400; // 70 m
export const CORRIDOR_MAX_PX = 3800; // 190 m

/**
 * Re-entry spots, just outside the visible road, so a recycled car is seen
 * almost immediately instead of driving for hundreds of metres where nobody
 * can see it:
 *   – ahead of the player (player catches it up): ~1.6 s of its own travel,
 *   – behind the player (it catches the player up): ~0.8 s, i.e. it drives out
 *     from the bottom edge of the screen, as requested earlier.
 */
export const REENTRY_AHEAD_S = 1.3;
export const REENTRY_AHEAD_MIN_PX = 700;
export const REENTRY_AHEAD_MAX_PX = 1500;
export const REENTRY_BEHIND_S = 0.7;
export const REENTRY_BEHIND_MIN_PX = 400;
export const REENTRY_BEHIND_MAX_PX = 950;
/** Safety factor: the respawn range must cover the initial distance. */
export const START_BEHIND_MARGIN = 1.25;
/**
 * A same-direction car enters the stream from BEHIND whenever its cruise speed
 * is at least this many km/h higher than the player's current speed – i.e.
 * whenever it is the car that closes the gap and overtakes. Otherwise the
 * player is the one catching up, so it is placed ahead (original behaviour).
 * With the player standing still (or reversing) every same-direction car is
 * faster, so the whole carriageway keeps flowing in from the bottom edge.
 */
export const REENTRY_SPEED_MARGIN_KPH = 15;

// damage
/**
 * Damage per km/h of relative closing speed. A car-on-car hit is now priced like
 * the wall it feels like: 100 km/h of closing speed = 55 % of the car's health
 * (it used to be 32 %, which read as "light damage" after a full-speed hit).
 */
export const DAMAGE_PER_KPH_CAR = 0.55;
/** Walls stay a bit harsher than another car. */
export const DAMAGE_PER_KPH_WALL = 0.62;
/** Only a head-on with oncoming traffic (or a wall at speed) writes a car off. */
export const FATAL_IMPACT_KPH = 220;
export const CRASH_SEQUENCE_MS = 1900;
/** Below the impact threshold a car-on-car contact is a SCRAPE, not a crash. */
export const MIN_SCRAPE_KPH = 1.5;
/**
 * Fallback value for a scrape when the grinding speed cannot be measured.
 *
 * Scrapes are charged by GRINDING SPEED – the difference of speed ALONG the
 * contact (how fast you are tearing past the other car), not the perpendicular
 * component. Measuring only the perpendicular part was why a 100 km/h swipe cost
 * a flat 1.2 %: the two cars were almost parallel, so the normal speed was ~0.
 */
export const SCRAPE_DAMAGE = 1.2;
/** Grip lost per km/h of grinding speed, in percent of health. */
export const GRIND_DAMAGE_PER_KPH = 0.11;
/** Bounds so a light brush cannot cost nothing and a long grind cannot nuke. */
export const GRIND_DAMAGE_MIN = 1;
export const GRIND_DAMAGE_MAX = 15;

/**
 * Player: after a contact the tyres lose grip for a moment. Without it the
 * player's own grip model (13/s) erased the shove within ~80 ms, so the AI cars
 * bounced off the player while the player felt nothing and drove on straight.
 */
export const PLAYER_HIT_GRIP_S = 0.35;
export const PLAYER_HIT_GRIP_FACTOR = 0.35;

// ---------------------------------------------------------------------------
// Contact zones
// ---------------------------------------------------------------------------
/**
 * A contact is not just "car or wall": where the two bodies touched decides how
 * much it hurts and how the cars are pushed. The zones are derived from the
 * player's own axes, so they work in his frame of reference:
 *
 *   REAR   – nose-to-tail. Rear-ending traffic that drives faster than you is
 *            cheap-ish; running into a slower car is your fault.
 *   CORNER – a clip on your front corner while passing: small spin, small bill.
 *   SIDE   – parked alongside someone ("przytulenie"): the expensive one, it
 *            tears both cars along their whole length.
 */
export type ContactZone = "rear" | "corner" | "side";

/**
 * THE reference contact: a head-on meeting with oncoming traffic. Everything
 * else is a FRACTION of this, expressed in `CONTACT_SCALE` below – one single
 * scale, so the bills can never drift apart again (the previous version had a
 * separate "fatal km/h" per zone, and they ended up wildly out of proportion:
 * a rub cost nearly as much as a frontal hit).
 *
 * A head-on at FULL_IMPACT_KPH takes 100 % of the car's health = it is fatal.
 */
export const FULL_IMPACT_KPH = 100;

/**
 * Share of the head-on bill, per contact zone (and direction):
 *   headOn 1.00 → fatal at 100 km/h
 *   side   0.30 → fatal at 333 km/h  ("przytulenie": a rub, not a crash)
 *   corner 0.26 → fatal at 385 km/h  ("zahaczanie narożnika", the cheapest)
 *   rear   0.45 → fatal at 222 km/h  (rear-ending: the forgiving one)
 * So at 60 km/h of closing speed: side 18 %, corner 16 %, rear 27 %, head-on 60 %.
 */
export const CONTACT_SCALE = {
  headOn: 1,
  side: 0.3,
  corner: 0.26,
  rear: 0.45,
} as const;

/** Below this speed the contact is a scrape/knock, not an impact. */
export const MIN_IMPACT_KPH = 12;
/**
 * No contact below this closing speed may ever be fatal, whatever the zone says.
 * Belt and braces against a misclassified scrape ending the run.
 */
export const MIN_FATAL_KPH = 90;

/** Sideways kick of an AI car on a full-strength SIDE contact (px/s). */
export const SIDE_KICK = 460;
/** Perpendicular kick while brushing past (SIDE). */
export const SIDE_KICK_PERP = 280;
/** Kick of a corner clip – smaller, it is only a corner. */
export const CORNER_KICK = 280;
/** Lateral velocity cap for an AI car (px/s ≈ 93 km/h in a violent hit). */
export const OPP_LATERAL_MAX = 520;
/** Sheds 15 % of the closing speed on a pull-along contact (a rub, not a brake). */
export const SIDE_PULL_FACTOR = 0.15;
/** Minimum time between two scrape events on the same car (ms). */
export const SCRAPE_COOLDOWN_MS = 260;

// ---------------------------------------------------------------------------
// Lane wander ("oscylacja w osi x")
// ---------------------------------------------------------------------------
/**
 * Opponents are not on rails: every car slowly weaves inside its lane
 * (deterministic sine, no RNG draws so the traffic stream stays intact) and
 * also enters the road with a small x offset. Together with collision bodies
 * that match the drawn car exactly, this closes the "perfect channel" the
 * player could previously thread at full speed between two cars: the sideways
 * gaps keep opening and closing, so passing between two cars has to be a
 * scrape.
 */
export const WEAVE_AMPLITUDE_PX = 11;

// game flow
export const DEFAULT_SEED = 10;
/** Seed used for the traffic generator: whole numbers only, 1…9999. */
export const SEED_MIN = 1;
export const SEED_MAX = 9999;

/**
 * Single place that turns whatever the user typed into a legal seed:
 * non-numeric input is dropped, fractions are truncated and the value is
 * clamped into SEED_MIN…SEED_MAX. Guarantees an integer ≥ 1, so a seed of
 * 0 / negative / 12.7 can never reach the RNG (which would produce a
 * different traffic pattern than the one shown in the UI).
 */
export function sanitizeSeed(value: unknown): number {
  const raw =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(raw)) return DEFAULT_SEED;
  const whole = Math.trunc(raw);
  return Math.min(SEED_MAX, Math.max(SEED_MIN, whole));
}

/** A fresh random seed inside the legal range. */
export function randomSeed(): number {
  return SEED_MIN + Math.floor(Math.random() * (SEED_MAX - SEED_MIN + 1));
}
export const COUNTDOWN_SECONDS = 3;
export const START_LANE = 5;

// ---------------------------------------------------------------------------
// RACE / GOAL
// ---------------------------------------------------------------------------
/** The run is won at 100 km. */
export const RACE_DISTANCE_M = 100_000;
/** A checkpoint every 10 km repairs the car completely (all damage). */
export const CHECKPOINT_EVERY_M = 10_000;
export const CHECKPOINT_COUNT = RACE_DISTANCE_M / CHECKPOINT_EVERY_M; // 10

export const REPO_URL = "https://github.com/Loleus/fsphaser";

// ---------------------------------------------------------------------------
// Absolute addresses
// ---------------------------------------------------------------------------
/**
 * The game is published at a fixed address (see `.env` → VITE_SITE_URL). Every
 * external asset is referenced ABSOLUTELY – no relative `./` paths – so the
 * music, icons and Open Graph image resolve no matter where the build is opened
 * from (sub-directory, iframe, file://…).
 */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL ?? "https://loleus.github.io/fullspeed/"
).replace(/\/+$/, "/");

/** The original soundtrack, served from the published site. */
export const MUSIC_URL = `${SITE_URL}assets/audio/music.ogg`;
/** Display face of the FULL SPEED logo, self-hosted next to the game. */
export const LOGO_FONT_URL = `${SITE_URL}assets/fonts/FasterOne-Regular.woff2`;

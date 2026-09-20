/**
 * How hard a contact hits – ONE scale for everything.
 *
 * The reference is the worst case in the game: a head-on meeting with oncoming
 * traffic at `FULL_IMPACT_KPH` costs the whole car. Every other contact is a
 * fixed FRACTION of that bill (`CONTACT_SCALE`), so the zones always stay in
 * proportion to each other instead of drifting apart:
 *
 *   closing speed  →  damage
 *     60 km/h : head-on 60 %   rear 27 %   side 18 %   corner 16 %
 *    100 km/h : head-on 100 % (fatal)   rear 45 %   side 30 %   corner 26 %
 *
 * Fatality is simply "the bill reached 100 %", so a head-on is fatal at
 * FULL_IMPACT_KPH, rear-ending at ~222 km/h, and a rub would need 333 km/h –
 * it tears the paint off, it does not kill.
 */
import * as C from "./constants";

export interface ImpactOutcome {
  damage: number;
  fatal: boolean;
  /** 0..1 – how violent it was, for FX and for the physical kick */
  strength: number;
  /** which bill was charged: 1 = full head-on */
  scale: number;
  headOnFatal: boolean;
}

/**
 * A scrape ("przytulenie", "zahaczanie narożnika"): billed by the grinding speed
 * along the contact, so a 100 km/h swipe costs ~7 % per contact while a light
 * brush costs the minimum. Repeated contacts (every SCRAPE_COOLDOWN_MS) make a
 * long grind hurt roughly 25 %/s, i.e. serious but not instant.
 */
export function resolveScrape(grindKmh: number): { damage: number; strength: number } {
  const damage = Math.max(
    C.GRIND_DAMAGE_MIN,
    Math.min(C.GRIND_DAMAGE_MAX, grindKmh * C.GRIND_DAMAGE_PER_KPH),
  );
  // Impulse strength: reaches full at 80 km/h of grinding speed, so a corner clip
  // at motorway pace really knocks the car about (at 120 km/h the old curve only
  // got to ~0.85 and smaller clips were barely felt).
  const strength = Math.max(0.35, Math.min(1, grindKmh / 80));
  return { damage, strength };
}

export function resolveImpact(
  impactKmh: number,
  zone: C.ContactZone,
  headOn: boolean,
): ImpactOutcome {
  const scale = headOn ? C.CONTACT_SCALE.headOn : C.CONTACT_SCALE[zone];
  // damage relative to the reference contact, in percent of the car's health
  const damage = (impactKmh / C.FULL_IMPACT_KPH) * scale * 100;
  // Two conditions, so a light contact can never kill: the bill has to reach
  // 100 % AND the closing speed has to be a real one (no "fatal rubs").
  const fatal = damage >= 100 && impactKmh >= C.MIN_FATAL_KPH;

  return {
    damage: fatal ? 999 : damage,
    fatal,
    strength: Math.max(0.15, Math.min(1, impactKmh / 160)),
    scale,
    headOnFatal: fatal && headOn,
  };
}

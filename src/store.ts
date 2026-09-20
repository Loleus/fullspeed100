/**
 * Persistence layer – settings + best run, restored on the next launch.
 *
 * ── WHY localStorage AND NOT IndexedDB ────────────────────────────────────
 * The whole payload is a few hundred bytes of plain configuration (language,
 * two audio switches, the seed and the best run). There is nothing big or
 * binary to keep: no replay ghosts, no audio buffers, no images.
 *
 *   1. It must be readable SYNCHRONOUSLY while React mounts. The first render
 *      has to show the remembered language/record immediately; IndexedDB is
 *      async, so the UI would flash the defaults and correct itself a frame
 *      later (layout shift + visible flicker of the record card).
 *   2. No schema/upgrade machinery, no `open()`/`onupgradeneeded` races, no
 *      "blocked" state when another tab holds the database.
 *   3. It keeps working in private mode, where IndexedDB frequently refuses to
 *      open at all.
 *   4. Writes are synchronous and tiny (a JSON string), so there is no need to
 *      debounce or batch anything.
 *
 * IndexedDB becomes the right tool the moment we store something large or
 * binary – e.g. ghost replays or the decoded music buffer. That decision would
 * only touch this file, because every read/write in the game goes through it.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { DEFAULT_SEED, sanitizeSeed } from "./game/constants";
import { DEFAULT_LANG } from "./ui/strings";
import type { Lang } from "./ui/strings";
import { EMPTY_BEST } from "./ui/types";
import type { BestStats } from "./ui/types";

/** Versioned keys: bump the suffix if the payload ever changes shape. */
const SETTINGS_KEY = "fsphaser.settings.v1";
/** Kept at v1 on purpose – existing saved records stay valid. */
const BEST_KEY = "fsphaser.best.v1";
/** Pre-merge key that only held the language. */
const LEGACY_LANG_KEY = "fsphaser.lang.v1";

export interface StoredSettings {
  lang: Lang;
  /** sound effects (engine, tyres, impacts) */
  sound: boolean;
  /** music preference – playback itself follows the race state */
  music: boolean;
  seed: number;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  lang: DEFAULT_LANG,
  sound: true,
  music: true,
  seed: DEFAULT_SEED,
};

/* --------------------------------------------------------------- helpers */
function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    // unavailable storage (private mode, disabled cookies) or corrupt JSON
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / blocked – losing the save must never break the game
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asLang(value: unknown): Lang | null {
  return value === "pl" || value === "en" ? value : null;
}

/* -------------------------------------------------------------- settings */
/** Reads, validates and repairs the stored settings (never throws). */
export function loadSettings(): StoredSettings {
  const obj = asObject(readJSON(SETTINGS_KEY));
  // language used to live in its own key – migrate it once
  const legacyLang = asLang(readJSON(LEGACY_LANG_KEY));

  if (!obj) {
    return { ...DEFAULT_SETTINGS, lang: legacyLang ?? DEFAULT_SETTINGS.lang };
  }

  return {
    lang: asLang(obj.lang) ?? legacyLang ?? DEFAULT_SETTINGS.lang,
    sound: asBool(obj.sound, DEFAULT_SETTINGS.sound),
    music: asBool(obj.music, DEFAULT_SETTINGS.music),
    // anything outside 1…9999 (or a fraction) is clamped, never trusted
    seed: sanitizeSeed(obj.seed ?? DEFAULT_SETTINGS.seed),
  };
}

export function saveSettings(value: StoredSettings): void {
  writeJSON(SETTINGS_KEY, {
    lang: value.lang,
    sound: value.sound,
    music: value.music,
    seed: sanitizeSeed(value.seed),
  });
}

/* ------------------------------------------------------------ best run */
/** Reads the saved record; missing/partial/old data falls back to zeros. */
export function loadBestFromStorage(): BestStats {
  const obj = asObject(readJSON(BEST_KEY));
  if (!obj) return { ...EMPTY_BEST };
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    distance: num(obj.distance),
    time: num(obj.time),
    fullSpeed: num(obj.fullSpeed),
    topSpeed: num(obj.topSpeed),
    seed: num(obj.seed),
  };
}

export function saveBestToStorage(best: BestStats): void {
  writeJSON(BEST_KEY, {
    distance: best.distance,
    time: best.time,
    fullSpeed: best.fullSpeed,
    topSpeed: best.topSpeed,
    seed: best.seed,
  });
}

/** Wipes everything this game keeps (not wired to a button yet). */
export function clearStorage(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(BEST_KEY);
    localStorage.removeItem(LEGACY_LANG_KEY);
  } catch {
    /* nothing to do */
  }
}

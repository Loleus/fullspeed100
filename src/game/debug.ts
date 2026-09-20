/**
 * Diagnostic switches – OFF in normal play, turned on with a URL parameter.
 *
 *   ?no=fx        – no particles at all (sparks, smoke, skid)
 *   ?no=road      – no scrolling road TileSprite (flat colour instead)
 *   ?no=shadow    – no car shadows
 *   ?no=audio     – no WebAudio parameter updates (engine, skid)
 *   ?no=all       – all of the above
 *
 * Why they exist: the frame-time profiler showed our own code at 0.0–0.2 ms per
 * frame with 21 bodies and a handful of pairs, i.e. the physics and the game logic
 * are not the bottleneck. When a stutter survives that, it lives in one of exactly
 * four places – particle rendering, the road's tiled texture, the shadow sprites or
 * the audio thread. These flags let you switch them off one at a time and see
 * which one it is, without touching the code.
 *
 * They are read once, at startup, and cost a single object lookup per frame.
 */
export interface DebugFlags {
  fx: boolean;
  road: boolean;
  shadow: boolean;
  audio: boolean;
}

function parse(): DebugFlags {
  const off = new Set<string>();
  if (typeof location !== "undefined") {
    const value = new URLSearchParams(location.search).get("no");
    if (value) {
      for (const part of value.split(",")) {
        const key = part.trim().toLowerCase();
        if (key) off.add(key);
      }
    }
  }
  const all = off.has("all");
  return {
    fx: !(all || off.has("fx")),
    road: !(all || off.has("road")),
    shadow: !(all || off.has("shadow")),
    audio: !(all || off.has("audio")),
  };
}

export const DEBUG: DebugFlags = parse();

/** True when any switch is active – handy for a one-time console note. */
export const DEBUG_ACTIVE = Object.values(DEBUG).some((v) => !v);

if (DEBUG_ACTIVE) {
  console.log("[fullspeed] diagnostyka:", DEBUG);
}

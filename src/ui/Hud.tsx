import type { HudData } from "../game/bus";
import { GEAR_COUNT, MAX_SPEED } from "../game/constants";
import { fmtDistance, fmtClock } from "./format";
import type { Strings } from "./strings";

/**
 * Index lists used by the dashboard are built ONCE, at module level.
 *
 * The HUD re-renders up to ten times a second; `Array.from(...)` inside the
 * component meant a fresh array (plus its elements) on every one of those
 * renders. None of this depends on state, so it never needs rebuilding.
 */
const GEAR_ROWS: ReadonlyArray<number> = Array.from(
  { length: GEAR_COUNT },
  (_, i) => GEAR_COUNT - i,
); // 6 → 1
const DAMAGE_TICKS: ReadonlyArray<number> = [0, 1, 2, 3];
/** one tick per checkpoint, the finish line excluded */
const PROGRESS_TICKS: ReadonlyArray<number> = Array.from({ length: 9 }, (_, i) => i);

/** Static styles: object literals in JSX are rebuilt on every render. */
const BAR_TRACK = { background: "rgba(21,181,54,0.18)" } as const;
const BAR_FILLED = "rgba(56,236,19,0.4)";
const GEAR_GRADIENT = "linear-gradient(90deg, #38ec13 0%, #ffd23f 55%, #df0d0d 100%)";
const GEAR_GLOW = "0 0 6px rgba(255,210,63,0.45)";

/**
 * Vertical gauge shared by both side modules. It has NO height of its own: the
 * parent row is `flex-1`, so the bar always stretches to exactly the space the
 * panel leaves free – that is what keeps the two panels the same length.
 */
function VBar({
  ratio,
  tone,
  ticks,
}: {
  ratio: number;
  tone: string;
  /** module-level tick index list; no array is created while rendering */
  ticks: ReadonlyArray<number>;
}) {
  const pct = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  return (
    <div className="relative h-full w-[11px] overflow-hidden rounded-full" style={BAR_TRACK}>
      <div
        className="absolute inset-x-0 bottom-0 rounded-full"
        style={{ height: pct, background: tone, boxShadow: `0 0 6px ${tone}` }}
      />
      {ticks.map((i) => (
        <span
          key={i}
          className="absolute left-0 h-px w-full bg-[#0b2c05]/70"
          style={{ bottom: `${((i + 1) / (ticks.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Dashboard: two vertical modules standing on the shoulders of the road.
 *   left   KM/H + speed · gearbox with tachometer · DAMAGE (vertical bar)
 *   right  PROGRESS (vertical bar, tick per checkpoint) · distance · CP · TIME · V-MAX
 *
 * The panels share ONE height (`panelHeight`) and hang at the same distance from
 * the top edge (`PANEL_TOP`, aligned with the FULL SPEED watermark), and inside
 * each panel the gauges stretch (`flex-1`), so the two modules are always the
 * same length whatever the numbers do.
 */
const PANEL_TOP = "clamp(38px, 6vh, 54px)";
const PANEL_HEIGHT = "clamp(272px, 40vh, 348px)";

export function Hud({ hud, t }: { hud: HudData | null; t: Strings }) {
  if (!hud) return null;
  if (hud.phase === "menu" || hud.phase === "boot") return null;

  const damage = Math.max(0, Math.min(100, Math.round(100 - hud.health)));
  const tone = damage < 30 ? "#38ec13" : damage < 70 ? "#ffd23f" : "#df0d0d";
  const progress = Math.min(1, hud.distance / hud.goal);

  const speedT = Math.max(0, Math.min(1, hud.speed / MAX_SPEED));
  const logoOpacity = 0.1 + 0.9 * speedT;

  const panelStyle = { top: PANEL_TOP, height: PANEL_HEIGHT };

  return (
    <>
      {/* ------------------------------------------------ left module */}
      <div
        style={panelStyle}
        className="retro-side retro-side-l pointer-events-none absolute left-0 z-20 flex w-[10%] min-w-[40px] flex-col items-center justify-between gap-1 overflow-hidden px-1 py-2 select-none"
      >
        {/* speed: the counter sits directly under its caption (no gap) */}
        <div className="flex flex-col items-center">
          <span className="retro-label">{t.kmh}</span>
          <span
            className="retro-glow font-mono leading-none font-black tabular-nums text-[#eaffdf]"
            style={{ fontSize: "clamp(13px, 3.2vh, 26px)" }}
          >
            {hud.speed}
          </span>
        </div>

        {/* gearbox fused with a tachometer: one bar per gear (6 on top, 1 at the
            bottom); the current gear's bar fills with the revs, painted
            green→yellow→red */}
        <div className="flex flex-col items-center gap-[3px]">
          {GEAR_ROWS.map((g) => {
            const active = hud.gear === g;
            const passed = hud.gear > g;
            const fill = active ? 0.12 + 0.88 * hud.rpm : passed ? 1 : 0;
            return (
              <span
                key={g}
                className="relative h-[4px] w-[26px] overflow-hidden rounded-full bg-[#15b536]/20"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${fill * 100}%`,
                    background: active ? GEAR_GRADIENT : passed ? BAR_FILLED : "transparent",
                    boxShadow: active ? GEAR_GLOW : "none",
                  }}
                />
              </span>
            );
          })}
          <span className="font-mono text-[18px] leading-none font-bold text-[#38ec13]">
            {hud.gear === 0 ? "R" : hud.gear}
          </span>
        </div>

        {/* damage: caption first, bar second, caption on the bottom edge */}
        <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
          <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-1">
            <span className="retro-label-lg retro-label-v">{t.damage}</span>
            <VBar ratio={damage / 100} tone={tone} ticks={DAMAGE_TICKS} />
          </div>
          <span className="retro-glow font-mono text-[11px] leading-none font-bold tabular-nums text-[#eaffdf]">
            {damage}%
          </span>
        </div>
      </div>

      {/* ------------------------------------------------ right module */}
      <div
        style={panelStyle}
        className="retro-side retro-side-r pointer-events-none absolute right-0 z-20 flex w-[10%] min-w-[40px] flex-col items-center justify-between gap-1 overflow-hidden px-1 py-2 text-center select-none"
      >
        {/* progress towards the 100 km finish – same layout as the damage gauge.
            (No "CP x/y" row: it was removed from this panel on request and must
            not come back.) */}
        <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-1">
          <span className="retro-label-lg retro-label-v">{t.progress}</span>
          <VBar ratio={progress} tone="#38ec13" ticks={PROGRESS_TICKS} />
        </div>

        <span className="retro-glow font-mono text-[11px] leading-none font-bold tabular-nums text-[#eaffdf]">
          {fmtDistance(hud.distance)}
        </span>

        {/* chronograph mm:ss.hs – eight characters that must fit the narrow
            panel, so the font is SMALLER than the other values */}
        <div className="flex w-full flex-col items-center">
          <span className="retro-label">{t.time}</span>
          <span
            className="retro-glow w-full origin-center text-center font-mono leading-none font-bold tabular-nums whitespace-nowrap text-[#eaffdf]"
            style={{ fontSize: "clamp(8px, 1.15vh, 10px)", transform: "scaleX(0.9)" }}
          >
            {fmtClock(hud.time)}
          </span>
        </div>

        <div className="flex w-full flex-col items-center">
          <span className="retro-label">{t.vmax}</span>
          <span className="retro-glow font-mono text-[11px] leading-none font-bold tabular-nums text-[#eaffdf]">
            {hud.fullSpeed.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* FULL SPEED watermark, top centre (opacity grows with speed) */}
      <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
        {/* Each line carries its OWN glow colour (blue for FULL, red for SPEED) and
            the halo grows with speed – a glow like on the buttons, not a flat
            drop-shadow. */}
        <span
          className="retro-title flex flex-col items-center leading-[0.8] whitespace-nowrap"
          style={{
            opacity: logoOpacity,
            transform: `scale(${0.94 + 0.08 * speedT})`,
          }}
        >
          <span
            className="text-[20px] text-[#1372c5] sm:text-[24px]"
            style={{
              textShadow: `0 1px 2px rgba(0,0,0,0.5), 0 0 2px rgba(19,114,197,0.95), 0 0 ${
                8 + 22 * speedT
              }px rgba(19,114,197,0.75), 0 0 ${18 + 30 * speedT}px rgba(19,114,197,0.45)`,
            }}
          >
            FULL
          </span>
          <span
            className="text-[20px] text-[#c60e0e] sm:text-[24px]"
            style={{
              textShadow: `0 1px 2px rgba(0,0,0,0.5), 0 0 2px rgba(198,14,14,0.95), 0 0 ${
                8 + 22 * speedT
              }px rgba(198,14,14,0.75), 0 0 ${18 + 30 * speedT}px rgba(198,14,14,0.45)`,
            }}
          >
            SPEED
          </span>
        </span>
      </div>

      {/* warnings */}
      <div className="pointer-events-none absolute inset-x-0 top-[26%] z-20 flex justify-center gap-2">
        {hud.offroad && hud.phase === "playing" && (
          <span className="rounded-full border border-[#15b536] bg-[rgba(15,75,3,0.82)] px-3 py-0.5 text-[10px] font-bold tracking-widest text-[#ffd23f]">
            {t.gravel}
          </span>
        )}
        {hud.health <= 30 && hud.phase === "playing" && (
          <span className="rounded-full border border-[#df0d0d] bg-[rgba(90,10,10,0.8)] px-3 py-0.5 text-[10px] font-bold tracking-widest text-[#ffb3b3]">
            {t.failing}
          </span>
        )}
      </div>

      {/* countdown – dead centre, big display digits ("GO!" is language neutral) */}
      {hud.phase === "countdown" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div
            key={hud.countdown}
            className="retro-title text-9xl leading-none text-[#38ec13]"
            style={{
              animation: "popIn 0.45s ease-out",
              textShadow:
                "0 0 14px rgba(19,236,114,0.95), 0 0 70px rgba(19,236,114,0.55), 0 6px 26px rgba(0,0,0,0.95)",
            }}
          >
            {hud.countdown === 0 ? "GO!" : hud.countdown}
          </div>
        </div>
      )}
    </>
  );
}

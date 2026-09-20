/** Shared value formatters + the inline game logo used by the UI cards. */
import { cn } from "../utils/cn";

export const fmtDistance = (m: number): string =>
  m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;

/**
 * Chronograph format: mm:ss.hs (e.g. 00:00.00 → 02:07.43). Two decimal places,
 * not milliseconds, and the minutes are padded too so the string always has a
 * fixed width of eight characters – that is what lets the narrow side panel keep
 * one, stable type size instead of jumping when the format changes.
 * The shell still carries full precision; only the display is truncated.
 */
export const fmtClock = (seconds: number): string => {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const hs = Math.floor((t - Math.floor(t)) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(hs).padStart(2, "0")}`;
};

/** Average speed of a run: distance / time, in km/h. */
export const fmtAvgSpeed = (distanceM: number, seconds: number): string => {
  if (!(distanceM > 0) || !(seconds > 0)) return "—";
  return `${Math.round((distanceM / seconds) * 3.6)} km/h`;
};

/**
 * FULL SPEED on a single line, left aligned – used instead of the "V-max time"
 * row label. The title is never translated.
 */
export function LogoInline({ className }: { className?: string }) {
  return (
    <span className={cn("retro-title leading-none whitespace-nowrap", className)}>
      <span className="text-[#1372c5]">FULL</span>{" "}
      <span className="text-[#c60e0e]">SPEED</span>
    </span>
  );
}

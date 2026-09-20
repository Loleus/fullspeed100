import { fmtAvgSpeed, fmtClock, fmtDistance, LogoInline } from "./format";
import type { Strings } from "./strings";
import type { BestStats } from "./types";
import { cn } from "../utils/cn";

/**
 * Record window, opened with the REKORD / HI SCORE button in the menu.
 * Opaque, closes with the ✕ in its top-right corner (or a click outside, ESC).
 *
 * @param topPx  offset of the window's TOP EDGE, measured in the menu so it
 *               lines up exactly with the top edge of the START button;
 *               when it is not available yet the window is centred instead.
 */
export function RecordModal({
  best,
  onClose,
  t,
  topPx,
}: {
  best: BestStats;
  onClose: () => void;
  t: Strings;
  topPx?: number | null;
}) {
  const empty = !(best.distance > 0);

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex justify-center px-4",
        topPx == null && "items-center",
      )}
      style={topPx == null ? undefined : { paddingTop: topPx }}
      onClick={onClose}
    >
      <div
        // brighter card (a record is good news), 260 px wide.
        // Bottom padding = 6 px (gap to the ✕) + 8 px extra under "Seed".
        className="retro-modal-bright relative h-fit w-full max-w-[260px] px-3 pt-3 pb-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button.
            `z-10` is essential: the title below carries a text shadow and, as a
            later sibling, could otherwise paint over this corner and swallow the
            clicks. */}
        <button
          onClick={onClose}
          aria-label={t.close}
          title={t.close}
          className="absolute top-1.5 right-1.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md font-mono text-[16px] leading-none font-bold text-[#d9f7cd] transition hover:bg-black/25 hover:text-white"
        >
          ✕
        </button>

        {/* tighter gap to the first row: everything hugs the title */}
        <h3 className="mb-1 px-7 text-center font-mono text-[17px] font-bold tracking-[0.2em] text-[#eaffb0] [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
          {t.record}
        </h3>

        {/* rows in record-priority order; the seed is informational only.
            The first label says "Distance", exactly as on the GAME OVER layer.
            Labels are pale green, values near-white – bright, not mournful. */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 font-mono text-[12px] leading-relaxed">
          <span className="text-[#daf6cf]">{t.distance}</span>
          <span className="text-right font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
            {empty ? "—" : fmtDistance(Math.round(best.distance))}
          </span>
          <span className="text-[#daf6cf]">{t.time}</span>
          <span className="text-right font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
            {empty ? "—" : fmtClock(best.time)}
          </span>
          {/* logo instead of the "V-max time" label */}
          <LogoInline className="text-[12px]" />
          <span className="text-right font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
            {empty ? "—" : `${best.fullSpeed.toFixed(1)} s`}
          </span>
          <span className="text-[#daf6cf]">{t.avgSpeed}</span>
          <span className="text-right font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
            {empty ? "—" : fmtAvgSpeed(best.distance, best.time)}
          </span>
          <span className="text-[#daf6cf]">{t.seedLabel}</span>
          <span className="text-right font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
            {!empty && best.seed > 0 ? best.seed : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

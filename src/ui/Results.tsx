import type { RunStats } from "../game/bus";
import { fmtAvgSpeed, fmtClock, fmtDistance, LogoInline } from "./format";
import type { Strings } from "./strings";
import type { BestStats } from "./types";
import { cn } from "../utils/cn";

/** End-of-race screen: FINISH (goal reached) or GAME OVER (wrecked). */
export function Results({
  stats,
  best,
  isRecord,
  onRestart,
  onMenu,
  t,
}: {
  stats: RunStats | null;
  best: BestStats;
  isRecord: boolean;
  onRestart: () => void;
  onMenu: () => void;
  t: Strings;
}) {
  if (!stats) return null;

  // The heading stays exactly where it was: the container gets as much extra
  // top padding as the block below it gets top margin, so the two cancel out
  // and only the content under the title moves down.
  const SHIFT = 64;

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center px-5"
      style={{ paddingTop: SHIFT }}
    >
      <h2
        className={cn(
          "retro-title text-center text-[2.4rem] leading-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)]",
          stats.finished ? "text-[#38ec13]" : "text-[#c60e0e]",
        )}
      >
        {stats.finished ? t.finished : t.gameOver}
      </h2>

      <div
        className="flex flex-col items-center gap-3"
        style={{ marginTop: SHIFT }}
      >
      {stats.finished && (
        <div className="font-mono text-[10.5px] tracking-widest text-[#c2e6bb]/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {t.goalDone}
        </div>
      )}
      {isRecord && (
        // bigger, and deliberately without a shadow (no glow, no ring)
        <div className="rounded-full bg-[#23532d] px-3.5 py-1 font-mono text-[14px] font-bold tracking-widest text-[#38ec13]">
          {t.newRecord}
        </div>
      )}

      <div className="retro-info w-full max-w-[290px] px-3 py-2 font-mono text-[11px]">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <span className="text-[#c2e6bb]/70">{t.distance}</span>
          <span className="retro-glow text-right text-[#eaffdf]">
            {fmtDistance(Math.round(stats.distance))}
          </span>
          <span className="text-[#c2e6bb]/70">{t.time}</span>
          <span className="retro-glow text-right text-[#eaffdf]">{fmtClock(stats.time)}</span>
          {/* logo instead of the "V-max time" label */}
          <LogoInline className="text-[12px]" />
          <span className="retro-glow text-right text-[#eaffdf]">
            {stats.fullSpeed.toFixed(1)} s
          </span>
          <span className="text-[#c2e6bb]/70">{t.avgSpeed}</span>
          <span className="retro-glow text-right text-[#eaffdf]">
            {fmtAvgSpeed(stats.distance, stats.time)}
          </span>
          <span className="text-[#c2e6bb]/70">{t.best}</span>
          <span className="retro-glow text-right text-[#eaffdf]">
            {fmtDistance(Math.round(best.distance))}
          </span>
          <span className="text-[#c2e6bb]/70">{t.seedLabel}</span>
          <span className="retro-glow text-right text-[#eaffdf]">{stats.seed}</span>
        </div>
      </div>

      {/* just the buttons – the green container under them is gone */}
      <div className="w-full max-w-[230px] space-y-2">
        <button onClick={onRestart} className="btn btn-primary">
          {t.again}
        </button>
        <button onClick={onMenu} className="btn">
          {t.menu}
        </button>
        {/* keyboard hint stays below the buttons, just closer to MENU than the
            old gap (accent green, like "NEW RECORD") */}
        <div className="pt-1 text-center font-mono text-[10px] font-bold tracking-widest text-[#38ec13] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          {t.resultsHint}
        </div>
      </div>
      </div>
    </div>
  );
}

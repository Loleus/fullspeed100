import type { CheckpointInfo } from "../game/bus";
import type { Strings } from "./strings";

/** "CHECKPOINT 3/10 · 30 km · CAR REPAIRED" – shows up for 2.4 s. */
export function CheckpointBanner({
  info,
  t,
}: {
  info: CheckpointInfo | null;
  t: Strings;
}) {
  if (!info) return null;
  return (
    <div
      key={info.index}
      className="pointer-events-none absolute inset-x-0 top-[36%] z-20 flex justify-center"
      style={{ animation: "cpBanner 2.4s ease-out forwards" }}
    >
      <div className="retro-info px-5 py-2 text-center">
        <div className="retro-title text-[26px] leading-tight text-[#38ec13]">
          {t.checkpoint} {info.index}/{info.total}
        </div>
        <div className="font-mono text-[10.5px] tracking-wide text-[#c2e6bb]/85">
          {Math.round(info.distance / 1000)} km · {t.repaired}
        </div>
      </div>
    </div>
  );
}

/** Red vignette pulse on a hit (one-shot, 0.4 s). */
export function HitFlash({ pulse, health }: { pulse: number; health: number }) {
  if (pulse === 0) return null;
  return (
    <div
      key={pulse}
      className="pointer-events-none absolute inset-0 z-10"
      style={{ animation: "hitFlash 0.4s ease-out forwards" }}
    >
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `inset 0 0 ${60 + (100 - health) * 1.6}px rgba(223,13,13,${
            0.25 + (100 - health) / 200
          })`,
        }}
      />
    </div>
  );
}

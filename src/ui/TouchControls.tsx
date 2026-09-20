import type { PointerEvent as ReactPointerEvent } from "react";
import { touchInput } from "../game/bus";
import { cn } from "../utils/cn";

type Key = keyof typeof touchInput;

/**
 * Touch buttons in the original's style: green circles, red brake.
 * Solid colours (no translucency) so the road never shows through the labels.
 */
function Hold({
  name,
  label,
  hint,
  className,
}: {
  name: Key;
  label: string;
  hint?: string;
  className?: string;
}) {
  const set = (down: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    touchInput[name] = down;
  };
  return (
    <button
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerLeave={set(false)}
      onPointerCancel={set(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        // `shrink-0`: without it flex squashes the buttons when the row overflows
        // on a narrow phone, which makes neighbours visually touch
        "retro-touch flex shrink-0 flex-col items-center justify-center leading-none font-bold",
        className,
      )}
    >
      <span>{label}</span>
      {hint && <span className="mt-0.5 text-[8px] opacity-70">{hint}</span>}
    </button>
  );
}

/**
 * On-screen controls.
 *
 * They are anchored to the BOTTOM EDGE OF THE SCREEN, not to the game canvas:
 * the bar is `position: fixed`, sits outside the game frame (which has
 * `overflow: hidden` and its own containing block, so a fixed child would be
 * clipped to it) and honours the phone's safe area, so the buttons stay where a
 * thumb expects them even with a home indicator or navigation bar.
 *
 * Layout mirrors the keyboard: ← → on the left, and on the right ↓ (brake) next to
 * ↑ (gas) – exactly like the arrow keys – with SPACE (handbrake) placed on the
 * outside so the pedals stay together.
 */
export function TouchControls() {
  return (
    <div
      // `gap-6` keeps a clear lane between the steering pad and the pedal cluster:
      // on a narrow phone the two groups used to end up shoulder to shoulder.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-between gap-6 px-3 select-none lg:hidden"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto flex shrink-0 items-end gap-3">
        <Hold name="left" label="◀" className="h-16 w-16 text-2xl" />
        <Hold name="right" label="▶" className="h-16 w-16 text-2xl" />
      </div>

      {/*
        Right cluster, left → right: SPACE (handbrake) on the outside,
        then ↓ (brake) and ↑ (gas) together – the pedals are one pair, exactly like
        the arrow keys. All of them are the same 64 px square; only the colours
        separate them, so the strip stays even and easy to hit with a thumb.
      */}
      <div className="pointer-events-auto flex shrink-0 items-end gap-3">
        <Hold
          name="brake"
          label="SPACJA"
          hint="ręczny"
          className="retro-touch-red h-16 w-16 text-[10px]"
        />
        <Hold name="down" label="↓" hint="hamulec" className="h-16 w-16 text-2xl" />
        <Hold name="up" label="↑" hint="gaz" className="h-16 w-16 text-2xl" />
      </div>
    </div>
  );
}

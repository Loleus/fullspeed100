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
        // no `shrink-0` needed: in a grid the button fills its own 1fr cell, which
        // can never be stolen by a neighbour – that is what keeps the spacing equal
        "retro-touch flex flex-col items-center justify-center text-center leading-none font-bold",
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
  /*
    FIVE equal columns across the full width – no flexbox, no `justify-between`.

    With flex the buttons were squashed on real phones, the gaps between the groups
    collapsed and nothing lined up with the screen edges. A grid cannot do any of
    that: every button owns exactly one 1fr cell, the column gap is one single
    value, and the row is centred and symmetric by construction.

        ◀  ▶  ␣  ↓  ↑
        └─ 5 × 1fr, gap 12px, cells 56–64 px ─┘

    Buttons fill their cell (square, capped at 64 px), so on a 360 px phone they
    are ~56 px each and never touch.
  */
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 select-none lg:hidden"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div
        className="pointer-events-auto mx-auto grid w-full max-w-[440px] grid-cols-5 items-end justify-items-center gap-2 px-3 sm:gap-3"
      >
        <Hold name="left" label="◀" className="aspect-square w-full max-w-[64px] text-2xl" />
        <Hold name="right" label="▶" className="aspect-square w-full max-w-[64px] text-2xl" />
        <Hold
          name="brake"
          label="␣"
          hint="RĘCZNY"
          className="retro-touch-red aspect-square w-full max-w-[64px] text-xl"
        />
        <Hold
          name="down"
          label="↓"
          hint="HAM"
          className="aspect-square w-full max-w-[64px] text-2xl"
        />
        <Hold
          name="up"
          label="↑"
          hint="GAZ"
          className="aspect-square w-full max-w-[64px] text-2xl"
        />
      </div>
    </div>
  );
}

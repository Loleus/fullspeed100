import type { PointerEvent as ReactPointerEvent } from "react";
import { touchInput } from "../game/bus";
import { cn } from "../utils/cn";

type Key = keyof typeof touchInput;

/** Touch buttons in the original's style: green circles, red brake. */
function Hold({
  name,
  label,
  className,
}: {
  name: Key;
  label: string;
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
      className={cn("retro-touch flex items-center justify-center font-bold", className)}
    >
      {label}
    </button>
  );
}

/** On-screen controls for touch devices (keyboard works everywhere). */
export function TouchControls() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-3 lg:hidden">
      <div className="pointer-events-auto flex gap-3">
        <Hold name="left" label="◀" className="h-14 w-14 text-xl" />
        <Hold name="right" label="▶" className="h-14 w-14 text-xl" />
      </div>
      <div className="pointer-events-auto flex items-end gap-3">
        <Hold
          name="brake"
          label="■"
          className="retro-touch-red h-11 w-11 rounded-[10px] text-lg"
        />
        <Hold name="down" label="HAM" className="h-14 w-14 text-[10px]" />
        <Hold name="up" label="GAZ" className="h-16 w-16 text-xs" />
      </div>
    </div>
  );
}

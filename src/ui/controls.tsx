import type { ReactNode } from "react";
import { cn } from "../utils/cn";

/**
 * The two primitives the settings screen is built from, so the whole panel
 * keeps one shape, one type scale and the one accent colour (green).
 */
export function ChoiceRow<T extends string | boolean>({
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg bg-[#0a1c06] px-2 py-1.5",
        disabled && "opacity-45",
      )}
    >
      <span className="min-w-0 leading-tight">
        <span className="block font-mono text-[11px] font-bold tracking-wide text-[#eaffdf]">
          {label}
        </span>
        {hint && <span className="block font-mono text-[9px] text-[#83b07b]">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className="flex items-center gap-1 font-mono text-[10px] tracking-wide"
            >
              <span
                className={cn(
                  "flex h-[13px] w-[13px] items-center justify-center rounded-full",
                  active ? "bg-[#23532d]" : "bg-[#12290c]",
                )}
              >
                <span
                  className={cn(
                    "h-[6px] w-[6px] rounded-full",
                    active ? "bg-[#38ec13] shadow-[0_0_6px_#13ec72]" : "bg-[#2f5c26]",
                  )}
                />
              </span>
              <span className={active ? "text-[#eaffdf]" : "text-[#6f8f68]"}>
                {option.label}
              </span>
            </button>
          );
        })}
      </span>
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  wide,
  primary,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  wide?: boolean;
  primary?: boolean;
  disabled?: boolean;
  /** extra classes – e.g. the accent green for a label */
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider transition",
        wide && "w-full py-2 text-[11px]",
        // one accent green everywhere: #38ec13 (headings, radio dots, ZAMKNIJ)
        primary
          ? "bg-[#23532d] text-[#38ec13] hover:bg-[#2c6a3a]"
          : "bg-[#12290c] text-[#c2e6bb] hover:bg-[#1a3a10]",
        disabled && "opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

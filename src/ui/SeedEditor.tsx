import { useState } from "react";
import { SEED_MAX, SEED_MIN } from "../game/constants";
import { ActionButton } from "./controls";
import type { Strings } from "./strings";

/**
 * Dedicated little window for typing a seed by hand. It is impossible to enter
 * anything illegal: digits only (no dots, minus, letters or exponents – paste
 * included), leading zeros squeezed out, and the value must land inside
 * 1…9999, otherwise APPLY stays disabled and the reason is shown.
 */
export function SeedEditor({
  value,
  onApply,
  onClose,
  t,
}: {
  value: number;
  onApply: (v: number) => void;
  onClose: () => void;
  t: Strings;
}) {
  const [text, setText] = useState(String(value));
  const [notice, setNotice] = useState<string | null>(null);

  const parsed = text.length > 0 ? Number(text) : NaN;
  const valid =
    text.length > 0 && Number.isInteger(parsed) && parsed >= SEED_MIN && parsed <= SEED_MAX;

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (/[^\d]/.test(raw)) setNotice(t.errDigits);
    else if (digits.length === 0) setNotice(t.errWhole);
    else if (Number(digits) < SEED_MIN) setNotice(t.errMin);
    else if (Number(digits) > SEED_MAX) setNotice(t.errMax);
    else setNotice(null);
    setText(digits.replace(/^0+(?=\d)/, "").slice(0, String(SEED_MAX).length));
  };

  const commit = () => {
    if (!valid) return;
    onApply(parsed);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="retro-modal w-full max-w-[280px] p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-center font-mono text-[13px] font-bold tracking-[0.25em] text-[#38ec13]">
          {t.seedTitle}
        </h3>

        <input
          autoFocus
          value={text}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={String(SEED_MAX).length}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onClose();
          }}
          placeholder={`${SEED_MIN}–${SEED_MAX}`}
          className="w-full rounded-lg bg-[#0a1c06] px-3 py-2 text-center font-mono text-[16px] font-bold tabular-nums text-[#eaffdf] outline-none placeholder:text-[#4e6b48]"
        />

        <div className="mt-1.5 min-h-[13px] text-center font-mono text-[9px] text-[#83b07b]">
          {notice ?? t.range}
        </div>

        <div className="mt-3 flex gap-1.5">
          <span className="flex-1">
            <ActionButton wide primary onClick={commit} disabled={!valid}>
              {t.apply}
            </ActionButton>
          </span>
          <span className="flex-1">
            <ActionButton wide onClick={onClose}>
              {t.cancel}
            </ActionButton>
          </span>
        </div>
      </div>
    </div>
  );
}

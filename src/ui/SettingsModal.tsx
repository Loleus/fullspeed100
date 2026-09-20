import { useState } from "react";
import { GEAR_BOUNDS, GEAR_COUNT } from "../game/constants";
import { ActionButton, ChoiceRow } from "./controls";
import { SeedEditor } from "./SeedEditor";
import { LANG_NAMES } from "./strings";
import type { Lang, Strings } from "./strings";

export interface SettingsProps {
  onClose: () => void;
  seed: number;
  onSeed: (v: number) => void;
  onRandomSeed: () => void;
  sound: boolean;
  onSound: (v: boolean) => void;
  music: boolean;
  onMusic: () => void;
  musicBroken: boolean;
  fullscreen: boolean;
  onFullscreen: () => void;
  /** false in portal builds – the host player owns the fullscreen state */
  allowFullscreen?: boolean;
  lang: Lang;
  onLang: (l: Lang) => void;
  t: Strings;
}

/** Settings panel: radios for FX / music / fullscreen / language, seed, help. */
export function SettingsModal({
  onClose,
  seed,
  onSeed,
  onRandomSeed,
  sound,
  onSound,
  music,
  onMusic,
  musicBroken,
  fullscreen,
  onFullscreen,
  allowFullscreen = true,
  lang,
  onLang,
  t,
}: SettingsProps) {
  const [seedOpen, setSeedOpen] = useState(false);
  const yesNo: ReadonlyArray<{ value: boolean; label: string }> = [
    { value: true, label: t.on },
    { value: false, label: t.off },
  ];

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center px-4" onClick={onClose}>
      <div className="retro-modal w-full max-w-[300px] p-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-center font-mono text-[13px] font-bold tracking-[0.25em] text-[#38ec13]">
          {t.settings}
        </h2>

        <div className="space-y-1.5">
          {/* no sub-labels under FX / MUSIC – only the option rows themselves */}
          <ChoiceRow label={t.fx} options={yesNo} value={sound} onChange={onSound} />
          <ChoiceRow
            label={t.music}
            hint={musicBroken ? t.musicUnavailable : undefined}
            options={yesNo}
            value={music && !musicBroken}
            onChange={() => onMusic()}
            disabled={musicBroken}
          />
          {/* hidden in portal builds (CrazyGames/Yandex/itch.io) */}
          {allowFullscreen && (
            <ChoiceRow
              label={t.fullscreen}
              options={yesNo}
              value={fullscreen}
              onChange={() => onFullscreen()}
            />
          )}
          <ChoiceRow label={t.language} options={LANG_NAMES} value={lang} onChange={onLang} />
        </div>

        <div className="mt-3">
          <div className="retro-label mb-1">{t.seed}</div>
          <div className="flex items-center gap-1.5">
            <span className="flex-1 rounded-lg bg-[#0a1c06] px-2 py-1.5 text-center font-mono text-[12px] font-bold tabular-nums text-[#eaffdf]">
              {seed}
            </span>
            <ActionButton className="text-[#38ec13]" onClick={() => setSeedOpen(true)}>
              {t.type}
            </ActionButton>
            <ActionButton className="text-[#38ec13]" onClick={onRandomSeed}>
              {t.random}
            </ActionButton>
          </div>
        </div>

        <div className="mt-3 space-y-0.5 font-mono text-[10px] leading-relaxed text-[#83b07b]">
          {/* race goal in the accent green, same as the headings/radios */}
          <div className="text-[#38ec13]">{t.goalLine}</div>
          <div>{t.controls}</div>
          <div>{t.gears(GEAR_COUNT, GEAR_BOUNDS)}</div>
          <div>{t.shortcuts}</div>
        </div>

        <div className="mt-3">
          <ActionButton wide primary onClick={onClose}>
            {t.close}
          </ActionButton>
        </div>

        {seedOpen && (
          <SeedEditor
            value={seed}
            onApply={(v) => {
              onSeed(v);
              setSeedOpen(false);
            }}
            onClose={() => setSeedOpen(false)}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

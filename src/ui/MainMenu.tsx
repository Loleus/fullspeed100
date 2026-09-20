import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RecordModal } from "./RecordModal";
import { SettingsModal } from "./SettingsModal";
import type { SettingsProps } from "./SettingsModal";
import type { Strings } from "./strings";
import type { BestStats } from "./types";

/**
 * Main screen: three buttons (START / SETTINGS / REKORD·HI SCORE), no card
 * underneath them and no dimming layer – the road stays visible behind the
 * logo. The record and the settings are separate windows.
 */
export function MainMenu({
  ready,
  best,
  onStart,
  t,
  settings,
}: {
  ready: boolean;
  best: BestStats;
  onStart: () => void;
  t: Strings;
  /** everything the settings modal needs (seed, audio, language, fullscreen) */
  settings: Omit<SettingsProps, "onClose" | "t">;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  // The record window must start exactly where the START button starts, so the
  // real position is measured instead of guessed: top edge of the buttons block
  // relative to this overlay.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<HTMLDivElement | null>(null);
  const [startTop, setStartTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      const buttons = buttonsRef.current;
      if (!root || !buttons) return;
      const top = buttons.getBoundingClientRect().top - root.getBoundingClientRect().top;
      setStartTop(Math.round(top));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!settingsOpen && !recordOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setRecordOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, recordOpen]);

  return (
    // logo pinned to the top, buttons vertically centred exactly as before the
    // record card was removed (it used to be the third, bottom item)
    <div ref={rootRef} className="absolute inset-0 z-30 flex flex-col items-center px-5 py-5">
      {/*
        Logo glow: each line is lit in its own colour – "FULL" blue, "SPEED" red –
        with the same layered neon shadow used by the buttons (tight 2 px core plus
        10/26 px halos). The heavy black drop-shadow is gone: this is a glow, not a
        shadow.
      */}
      <h1
        className="retro-title w-full text-center leading-[0.78]"
        style={{ fontSize: "clamp(2.6rem, 20cqw, 7rem)" }}
      >
        <span
          className="block text-[#1372c5]"
          style={{
            textShadow:
              "1px 2px 2px rgba(0,0,0,0.55), 0 0 2px rgba(19,114,197,0.95), 0 0 10px rgba(19,114,197,0.8), 0 0 26px rgba(19,114,197,0.55)",
          }}
        >
          FULL
        </span>
        <span
          className="block text-[#c60e0e]"
          style={{
            fontSize: "0.86em",
            textShadow:
              "1px 2px 2px rgba(0,0,0,0.55), 0 0 2px rgba(198,14,14,0.95), 0 0 10px rgba(198,14,14,0.8), 0 0 26px rgba(198,14,14,0.55)",
          }}
        >
          SPEED
        </span>
      </h1>

      <div className="flex w-full flex-1 flex-col items-center justify-center">
      <div ref={buttonsRef} className="w-full max-w-[230px] space-y-2">
        <button onClick={onStart} className="btn btn-primary">
          {t.start}
        </button>
        {/* same colour as START */}
        <button onClick={() => setSettingsOpen(true)} className="btn btn-primary">
          {t.settings}
        </button>
        {/* the record lives in its own window now (REKORD / HI SCORE) */}
        <button onClick={() => setRecordOpen(true)} className="btn btn-primary">
          {t.record}
        </button>
        {!ready && (
          <div className="text-center font-mono text-[10px] text-[#ffd23f] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {t.loading}
          </div>
        )}
      </div>
      </div>

      {/* title screen footer – opens the author's LinkedIn in a new tab */}
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <a
          href="https://www.linkedin.com/in/%C5%82ukasz-k-ba2159277/"
          target="_blank"
          rel="noopener noreferrer"
          className="copyright cursor-pointer leading-none transition-opacity hover:opacity-80"
        >
          ©2026 LUKAMI
        </a>
      </div>

      {settingsOpen && (
        <SettingsModal {...settings} t={t} onClose={() => setSettingsOpen(false)} />
      )}

      {recordOpen && (
        <RecordModal
          best={best}
          t={t}
          topPx={startTop}
          onClose={() => setRecordOpen(false)}
        />
      )}
    </div>
  );
}

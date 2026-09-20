/**
 * Public surface of the UI layer.
 *
 * The overlays used to live in this single file; they are now split into
 * focused modules and re-exported here, so the React shell has one import
 * point:
 *
 *   Hud.tsx                 dashboard (two vertical side modules) + countdown
 *   CheckpointBanner.tsx    checkpoint flash + hit vignette
 *   MainMenu.tsx            START / SETTINGS, record card
 *   SettingsModal.tsx       radios (FX, music, fullscreen, language), seed
 *   SeedEditor.tsx          numeric seed window
 *   controls.tsx            ChoiceRow / ActionButton primitives
 *   Results.tsx             FINISH / GAME OVER screen
 *   format.tsx              value formatters + inline FULL SPEED logo
 *   strings.ts              PL/EN dictionary
 *   types.ts                BestStats record shape
 */
export { Hud } from "./Hud";
export { CheckpointBanner, HitFlash } from "./CheckpointBanner";
export { MainMenu } from "./MainMenu";
export { Results } from "./Results";
export { fmtAvgSpeed, fmtClock, fmtDistance, LogoInline } from "./format";
export { EMPTY_BEST } from "./types";
export type { BestStats } from "./types";

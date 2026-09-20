/**
 * UI translations. The game title "FULL SPEED" (and the "GO!" flash) stay
 * English in both languages on purpose – only the interface is translated.
 */
export type Lang = "pl" | "en";

export const DEFAULT_LANG: Lang = "pl";

export interface Strings {
  /* common */
  on: string;
  off: string;
  /* dashboard */
  kmh: string;
  damage: string;
  progress: string;
  time: string;
  vmax: string;
  cp: string;
  rec: string;
  gravel: string;
  failing: string;
  /* checkpoint banner */
  checkpoint: string;
  repaired: string;
  /* menu */
  start: string;
  settings: string;
  loading: string;
  best: string;
  /** average speed of the run (distance / time) */
  avgSpeed: string;
  /** button that opens the record ("HI SCORE") window */
  record: string;
  goalLine: string;
  /* settings */
  fx: string;
  music: string;
  musicUnavailable: string;
  fullscreen: string;
  language: string;
  seed: string;
  seedHint: string;
  type: string;
  random: string;
  close: string;
  controls: string;
  /** gearbox line – takes the real constants so it can never go stale */
  gears: (count: number, bounds: readonly number[]) => string;
  shortcuts: string;
  /* seed editor */
  seedTitle: string;
  errDigits: string;
  errWhole: string;
  errMin: string;
  errMax: string;
  range: string;
  apply: string;
  cancel: string;
  /* results */
  finished: string;
  gameOver: string;
  goalDone: string;
  newRecord: string;
  distance: string;
  seedLabel: string;
  again: string;
  menu: string;
  resultsHint: string;
}

const PL: Strings = {
  on: "WŁ.",
  off: "WYŁ.",
  kmh: "KM/H",
  damage: "USZKODZENIA",
  progress: "POSTĘP",
  time: "CZAS",
  vmax: "V-MAX",
  cp: "CP",
  rec: "REK",
  gravel: "ŻWIR",
  failing: "AWARIA?",
  checkpoint: "CHECKPOINT",
  repaired: "AUTO NAPRAWIONE",
  start: "START",
  settings: "USTAWIENIA",
  loading: "wczytywanie silnika…",
  best: "Rekord:",
  avgSpeed: "Średnia prędkość:",
  record: "REKORD",
  goalLine: "Cel: 100 km · checkpoint co 10 km (naprawa auta)",
  fx: "FX",
  music: "MUZYKA",
  musicUnavailable: "niedostępna",
  fullscreen: "PEŁNY EKRAN",
  language: "JĘZYK",
  seed: "ZIARNO (1–9999)",
  seedHint: "Ten sam numer = identyczny ruch przeciwników.",
  type: "WPISZ",
  random: "LOSUJ",
  close: "ZAMKNIJ",
  controls: "Strzałki / WASD – kierowanie · SPACJA – ręczny",
  gears: (count, bounds) =>
    `biegi 1–${count}, zmiana przy ${bounds.join(" / ")} km/h`,
  shortcuts: "ENTER start · ESC menu · R restart · M dźwięk",
  seedTitle: "ZIARNO",
  errDigits: "Tylko cyfry — bez kropek, minusów i liter.",
  errWhole: "Podaj liczbę całkowitą 1–9999.",
  errMin: "Ziarno musi wynosić co najmniej 1.",
  errMax: "Maksymalne ziarno to 9999.",
  range: "Zakres 1–9999, tylko liczby całkowite.",
  apply: "USTAW",
  cancel: "ANULUJ",
  finished: "META! 100 KM",
  gameOver: "GAME OVER",
  goalDone: "DOJECHAŁEŚ DO CELU · WSZYSTKIE CHECKPOINTY ZALICZONE",
  newRecord: "NOWY REKORD",
  distance: "Odległość:",
  seedLabel: "Ziarno:",
  again: "JESZCZE RAZ",
  menu: "MENU",
  resultsHint: "ENTER / R – restart · ESC – menu",
};

const EN: Strings = {
  on: "ON",
  off: "OFF",
  kmh: "KM/H",
  damage: "DAMAGE",
  progress: "PROGRESS",
  time: "TIME",
  vmax: "V-MAX",
  cp: "CP",
  rec: "BEST",
  gravel: "GRAVEL",
  failing: "CRITICAL",
  checkpoint: "CHECKPOINT",
  repaired: "CAR REPAIRED",
  start: "START",
  settings: "SETTINGS",
  loading: "loading engine…",
  best: "Best:",
  avgSpeed: "Average speed:",
  record: "HI SCORE",
  goalLine: "Goal: 100 km · checkpoint every 10 km (full repair)",
  fx: "FX",
  music: "MUSIC",
  musicUnavailable: "unavailable",
  fullscreen: "FULLSCREEN",
  language: "LANGUAGE",
  seed: "SEED (1–9999)",
  seedHint: "Same number = identical traffic.",
  type: "TYPE",
  random: "RANDOM",
  close: "CLOSE",
  controls: "Arrows / WASD – steer · SPACE – handbrake",
  gears: (count, bounds) => `gears 1–${count}, shifts at ${bounds.join(" / ")} km/h`,
  shortcuts: "ENTER start · ESC menu · R restart · M sound",
  seedTitle: "SEED",
  errDigits: "Digits only — no dots, minus or letters.",
  errWhole: "Enter a whole number 1–9999.",
  errMin: "Minimum seed is 1.",
  errMax: "Maximum seed is 9999.",
  range: "Range 1–9999, whole numbers only.",
  apply: "APPLY",
  cancel: "CANCEL",
  finished: "FINISH! 100 KM",
  gameOver: "GAME OVER",
  goalDone: "YOU REACHED THE GOAL · ALL CHECKPOINTS CLEARED",
  newRecord: "NEW RECORD",
  distance: "Distance:",
  seedLabel: "Seed:",
  again: "RESTART",
  menu: "MENU",
  resultsHint: "ENTER / R – restart · ESC – menu",
};

export const STRINGS: Record<Lang, Strings> = { pl: PL, en: EN };
/** Language names are written in their own language – same in both versions. */
export const LANG_NAMES: Array<{ value: Lang; label: string }> = [
  { value: "pl", label: "Polski" },
  { value: "en", label: "English" },
];

// Loading/saving the language is part of the persisted settings – see ../store.
// Keeping storage access in one module is what makes a future move to
// IndexedDB (or a different key layout) a single-file change.

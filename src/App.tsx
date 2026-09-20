import { useCallback, useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { audio } from "./game/audio";
import { bus, EV, pendingCommands, settings } from "./game/bus";
import type { CheckpointInfo, GamePhase, HudData, RunStats } from "./game/bus";
import { randomSeed, sanitizeSeed } from "./game/constants";
import { createGame } from "./game/createGame";
import { CheckpointBanner, HitFlash, Hud, MainMenu, Results } from "./ui/Overlays";
import type { BestStats } from "./ui/Overlays";
import { bestFromRun, loadBest, outranks, saveBest } from "./ui/record";
import { STRINGS } from "./ui/strings";
import type { Lang } from "./ui/strings";
import { TouchControls } from "./ui/TouchControls";
import { loadSettings, saveSettings } from "./store";

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const readyRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<GamePhase>("boot");
  const [hud, setHud] = useState<HudData | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [hitPulse, setHitPulse] = useState(0);
  const [isRecord, setIsRecord] = useState(false);
  const [best, setBest] = useState<BestStats>(() => loadBest());

  // Settings of the previous session are read ONCE, synchronously, before the
  // first render – so the menu never flashes the defaults (see ../store for why
  // this lives in localStorage and not in IndexedDB).
  const [stored] = useState(() => loadSettings());
  const [seed, setSeed] = useState(stored.seed);
  const [sound, setSound] = useState(stored.sound);
  const [music, setMusic] = useState(stored.music);
  const [musicBroken, setMusicBroken] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [checkpoint, setCheckpoint] = useState<CheckpointInfo | null>(null);
  /** Polish is the default; the last choice is remembered. */
  const [lang, setLang] = useState<Lang>(stored.lang);
  const t = STRINGS[lang];

  const changeLang = useCallback((next: Lang) => setLang(next), []);

  const bestRef = useRef(best);
  bestRef.current = best;

  /* ------------------------------------------------ Phaser bootstrap */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const game = createGame(host);
    gameRef.current = game;

    const onReady = () => {
      readyRef.current = true;
      setReady(true);
    };
    const onPhase = (p: GamePhase) => setPhase(p);
    const onHud = (d: HudData) => setHud(d);
    const onHit = () => setHitPulse((n) => n + 1);
    const onOver = (s: RunStats) => {
      setStats(s);
      const record = outranks(s, bestRef.current);
      setIsRecord(record);
      if (record) {
        const next = bestFromRun(s);
        setBest(next);
        saveBest(next);
      } else {
        setBest((b) => ({ ...b, topSpeed: Math.max(b.topSpeed, s.topSpeed) }));
      }
    };

    let cpTimer: number | undefined;
    const onCheckpoint = (info: CheckpointInfo) => {
      setCheckpoint(info);
      window.clearTimeout(cpTimer);
      cpTimer = window.setTimeout(() => setCheckpoint(null), 2400);
    };

    bus.on(EV.READY, onReady);
    bus.on(EV.PHASE, onPhase);
    bus.on(EV.HUD, onHud);
    bus.on(EV.HIT, onHit);
    bus.on(EV.CHECKPOINT, onCheckpoint);
    bus.on(EV.GAMEOVER, onOver);

    return () => {
      window.clearTimeout(cpTimer);
      bus.off(EV.READY, onReady);
      bus.off(EV.PHASE, onPhase);
      bus.off(EV.HUD, onHud);
      bus.off(EV.HIT, onHit);
      bus.off(EV.CHECKPOINT, onCheckpoint);
      bus.off(EV.GAMEOVER, onOver);
      game.destroy(true);
      gameRef.current = null;
      readyRef.current = false;
    };
  }, []);

  /* ------------------------------- settings: live sync + persistence ---- */
  // mirror into the game's settings object and apply the audio switches
  useEffect(() => {
    settings.seed = seed;
    settings.sound = sound;
    audio.setEnabled(sound);
  }, [seed, sound]);

  // music preference is applied immediately too (playback itself follows the
  // race state – see GameScene.setPhase)
  useEffect(() => {
    audio.setMusicWanted(music);
  }, [music]);

  // persist every change; the next launch reads it back before the first render
  useEffect(() => {
    saveSettings({ lang, sound, music, seed });
  }, [lang, sound, music, seed]);

  useEffect(() => {
    audio.onMusicUnavailable = () => {
      setMusicBroken(true);
      setMusic(false);
    };
    return () => {
      audio.onMusicUnavailable = null;
    };
  }, []);

  /* ------------------------------------------------ commands */
  const start = useCallback(() => {
    audio.unlock();
    settings.seed = sanitizeSeed(seed);
    settings.sound = sound;
    audio.setEnabled(sound);
    setStats(null);
    setIsRecord(false);
    // the scene may not exist yet (click in the first frames) – queue it
    if (readyRef.current) bus.emit(EV.CMD_START);
    else pendingCommands.start = true;
  }, [seed, sound]);

  /** Every seed change goes through the sanitiser (1…9999, integers only). */
  const applySeed = useCallback((value: number | string) => {
    const clean = sanitizeSeed(value);
    settings.seed = clean;
    setSeed(clean);
    return clean;
  }, []);

  const toMenu = useCallback(() => {
    audio.unlock();
    setStats(null);
    if (readyRef.current) bus.emit(EV.CMD_MENU);
    else pendingCommands.menu = true;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const rest = phase === "menu" || phase === "gameover" || phase === "crashed";
      if (rest && (e.key === "Enter" || e.key === "r" || e.key === "R")) start();
      else if (e.key === "Escape") toMenu();
      else if (e.key === "m" || e.key === "M") setSound((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, start, toMenu]);

  const toggleMusic = useCallback(() => {
    audio.unlock();
    const on = !audio.isMusicWanted();
    audio.setMusicWanted(on);
    setMusic(on);
    // if the track cannot be loaded, keep the setting honest
    if (on && !audio.isMusicWanted()) setMusicBroken(true);
  }, []);

  // while the race is on, a click may be needed to start the track if the
  // browser refused it at the phase change (autoplay policy)
  useEffect(() => {
    if (phase !== "playing") return;
    audio.retryMusicIfNeeded();
  }, [phase]);

  /**
   * Portal builds (CrazyGames, Yandex, itch.io) run inside the host's own
   * player, so the fullscreen switch is hidden there – see vite.web.config.ts.
   */
  const allowFullscreen = import.meta.env.VITE_BUILD_TARGET !== "web";

  const toggleFullscreen = useCallback(() => {
    if (!allowFullscreen) return;
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => setFullscreen(false));
  }, [allowFullscreen]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // keep the document language in sync with the UI language
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const inMenu = phase === "menu" || phase === "boot";

  return (
    // the page backdrop (photo + saturation blend + blur) lives on <body>
    <div className="flex h-[100svh] w-full items-center justify-center overflow-hidden">
      <div
        className="game-frame relative aspect-[3/5] overflow-hidden bg-black"
        // container sized typography: the menu logo scales with the game board
        style={{
          height: "min(100svh, calc(100vw * 5 / 3))",
          containerType: "inline-size",
        }}
      >
        <div ref={hostRef} className="absolute inset-0" />

        <HitFlash pulse={hitPulse} health={hud?.health ?? 100} />
        <Hud hud={hud} t={t} />
        <CheckpointBanner info={checkpoint} t={t} />
        {/* touch pads only while driving – in the menu they would sit on top of
            the menu buttons now that the dimming layer is gone */}
        {!inMenu && <TouchControls />}

        {/* Nothing else is drawn over the road while driving – restart (R),
            menu (ESC) and mute (M) are keyboard/touch driven. */}

        {inMenu && (
          <MainMenu
            ready={ready}
            best={best}
            onStart={start}
            t={t}
            settings={{
              seed,
              onSeed: applySeed,
              onRandomSeed: () => applySeed(randomSeed()),
              sound,
              onSound: setSound,
              music,
              onMusic: toggleMusic,
              musicBroken,
              fullscreen,
              onFullscreen: toggleFullscreen,
              allowFullscreen,
              lang,
              onLang: changeLang,
            }}
          />
        )}

        {(phase === "gameover" || phase === "crashed") && stats && (
          <Results
            stats={stats}
            best={best}
            isRecord={isRecord}
            onRestart={start}
            onMenu={toMenu}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

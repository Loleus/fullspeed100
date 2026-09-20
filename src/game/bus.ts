import Phaser from "phaser";
import { DEFAULT_SEED, START_FROM_BEHIND } from "./constants";

export type GamePhase =
  | "boot"
  | "menu"
  | "countdown"
  | "playing"
  | "crashed"
  | "gameover";

export interface HudData {
  phase: GamePhase;
  speed: number; // km/h
  distance: number; // m
  time: number; // s
  fullSpeed: number; // s spent at top speed
  health: number; // 0..100
  countdown: number; // seconds left (countdown phase)
  offroad: boolean;
  gear: number;
  /** 0..1 within the current gear – drives the tachometer bars */
  rpm: number;
  /** race goal in metres (100 km) */
  goal: number;
  /** checkpoints reached so far */
  checkpoint: number;
  /** total number of checkpoints */
  checkpoints: number;
}

export interface CheckpointInfo {
  index: number;
  total: number;
  distance: number;
}

export interface RunStats {
  distance: number;
  time: number;
  fullSpeed: number;
  topSpeed: number;
  seed: number;
  /** true when the 100 km goal was reached */
  finished: boolean;
}

export interface HitInfo {
  damage: number;
  fatal: boolean;
  impact: number;
}

/** Tiny event bus shared between the React shell and the Phaser scene. */
export const bus = new Phaser.Events.EventEmitter();

/** Flags written by on-screen touch buttons, merged with the keyboard in the scene. */
export const touchInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  brake: false,
};

export function clearTouchInput(): void {
  touchInput.left = false;
  touchInput.right = false;
  touchInput.up = false;
  touchInput.down = false;
  touchInput.brake = false;
}

export const settings = {
  seed: DEFAULT_SEED,
  sound: true,
  /** FIX: first cars of the run enter from behind the player (bottom edge). */
  startFromBehind: START_FROM_BEHIND,
};

/**
 * Commands issued BEFORE the Phaser scene finished booting.
 *
 * The React shell sets these, and the scene consumes them right after its
 * `create()` – this is what makes the START button work even when it is clicked
 * in the very first frames after load (otherwise the event is emitted before
 * any listener exists and the click silently does nothing).
 */
export const pendingCommands = {
  start: false,
  menu: false,
};

export const EV = {
  READY: "ready",
  PHASE: "phase",
  HUD: "hud",
  HIT: "hit",
  CHECKPOINT: "checkpoint",
  GAMEOVER: "gameover",
  CMD_START: "cmd:start",
  CMD_MENU: "cmd:menu",
} as const;

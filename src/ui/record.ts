/**
 * Record handling: what counts as a better run and how it is persisted.
 *
 * Priority (as designed):
 *   1. longest distance,
 *   2. then the shortest total time,
 *   3. then the longest time spent at v-max,
 *   4. the seed is only informational and never decides.
 */
import type { RunStats } from "../game/bus";
// persistence itself lives in ../store (single place that touches storage);
// loadBest/saveBest stay as the domain-level names used by the shell
import { loadBestFromStorage, saveBestToStorage } from "../store";
import type { BestStats } from "./types";

/** Reads the record saved by the previous sessions. */
export function loadBest(): BestStats {
  return loadBestFromStorage();
}

/** Stores the record so the next launch shows it straight away. */
export function saveBest(best: BestStats): void {
  saveBestToStorage(best);
}

/**
 * Values are compared at the precision they are displayed with, so a run that
 * looks identical in the UI never silently overwrites the record.
 */
export function outranks(next: RunStats, prev: BestStats): boolean {
  const dNext = Math.round(next.distance);
  const dPrev = Math.round(prev.distance);
  if (dNext !== dPrev) return dNext > dPrev;

  const tNext = Math.round(next.time * 1000);
  const tPrev = Math.round(prev.time * 1000);
  if (tNext !== tPrev) return tNext < tPrev;

  return Math.round(next.fullSpeed * 10) > Math.round(prev.fullSpeed * 10);
}

/** Turn a finished run into the record payload. */
export function bestFromRun(run: RunStats): BestStats {
  return {
    distance: run.distance,
    time: run.time,
    fullSpeed: run.fullSpeed,
    topSpeed: run.topSpeed,
    seed: run.seed,
  };
}

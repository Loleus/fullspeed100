/**
 * Race rules, isolated from the scene: a checkpoint every 10 km repairs the car
 * completely, and the run is won at 100 km.
 */
import * as C from "./constants";

export type RaceEvent =
  | { kind: "checkpoint"; index: number; total: number; distance: number }
  | { kind: "finish" };

export class RaceProgress {
  /** checkpoints already cleared */
  count = 0;
  /** distance of the next checkpoint, in metres */
  private nextM = C.CHECKPOINT_EVERY_M;
  /**
   * Events produced by the last `update()`. The array and its entries are REUSED
   * (only three of them can ever exist per run), because `update()` is called on
   * every physics step and must not allocate.
   */
  readonly events: RaceEvent[] = [
    { kind: "checkpoint", index: 0, total: 0, distance: 0 },
    { kind: "checkpoint", index: 0, total: 0, distance: 0 },
    { kind: "checkpoint", index: 0, total: 0, distance: 0 },
    { kind: "finish" },
  ];
  /** how many entries of `events` are valid after the last update */
  eventCount = 0;

  get total(): number {
    return C.CHECKPOINT_COUNT;
  }

  reset(): void {
    this.count = 0;
    this.nextM = C.CHECKPOINT_EVERY_M;
    this.eventCount = 0;
  }

  /**
   * Feed the odometer; fills `events` with what happened (see `eventCount`).
   * A `while` loop, so a huge jump between two steps cannot swallow a checkpoint.
   */
  update(distanceM: number): void {
    this.eventCount = 0;
    while (this.count < C.CHECKPOINT_COUNT && distanceM >= this.nextM) {
      this.count++;
      this.nextM += C.CHECKPOINT_EVERY_M;
      if (this.eventCount >= this.events.length) break;
      const slot = this.events[this.eventCount++] as Extract<
        RaceEvent,
        { kind: "checkpoint" }
      >;
      slot.index = this.count;
      slot.total = C.CHECKPOINT_COUNT;
      slot.distance = this.count * C.CHECKPOINT_EVERY_M;
    }
    if (distanceM >= C.RACE_DISTANCE_M) {
      if (this.eventCount < this.events.length) this.events[this.eventCount++] = { kind: "finish" };
    }
  }
}

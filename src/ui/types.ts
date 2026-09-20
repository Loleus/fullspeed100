/** Record held in localStorage: the best run driven so far. */
export interface BestStats {
  distance: number;
  time: number;
  /** seconds spent at v-max – the third record criterion */
  fullSpeed: number;
  topSpeed: number;
  /** seed the record run was driven with */
  seed: number;
}

export const EMPTY_BEST: BestStats = {
  distance: 0,
  time: 0,
  fullSpeed: 0,
  topSpeed: 0,
  seed: 0,
};

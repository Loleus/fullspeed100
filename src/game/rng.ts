/**
 * Faithful port of the original `js/rand.js`.
 *
 * It is a seeded LCG. Every opponent owns its own instance seeded with the
 * same number, so the k-th appearance of a given opponent (its speed and how
 * far ahead it re-enters) is always identical from run to run.
 */
export class Rnd {
  readonly m = 0x80000000;
  readonly a = 1103515245;
  readonly c = 12345;
  state: number;

  /**
   * km/h ranges per lane. Negative = oncoming traffic (lanes 0–1).
   *
   * The speed ladder runs from the median (fast) to the outer edge (slow), on
   * both carriageways:
   *
   *   lane 0  oncoming, outer left       90–115 km/h
   *   lane 1  oncoming, next to median  120–140 km/h
   *   lane 2  player's side, inner      250–300 km/h   (cap 300)
   *   lane 3                            200–250 km/h   (cap 250)
   *   lane 4                            150–200 km/h   (cap 200)
   *   lane 5  player's side, outer      100–150 km/h   (cap 150, min 100)
   *
   * Before this the oncoming lanes drew −110…−200 and −320…−520 km/h: a head-on
   * car closed on a standing player at up to 520 km/h (≈ 3 km/s on the old px
   * mapping), i.e. it flew past several times faster than anything on the
   * player's carriageway. Now every lane sits in a realistic band and only the
   * RELATIVE closing speed makes oncoming traffic look quick.
   */
  static readonly speedys: ReadonlyArray<[number, number]> = [
    // The oncoming carriageway MIRRORS the two lanes next to the median of the
    // player's side (previously it was tuned like the two OUTER, slow lanes,
    // which made oncoming traffic crawl next to a 300 km/h stream):
    //   lane 0 (left edge)  = lane 3 = third from the right  → 210–235 km/h
    //   lane 1 (at median)  = lane 2 = fourth from the right → 270–295 km/h
    [-235, -210], // lane 0 – oncoming, left edge
    [-295, -270], // lane 1 – oncoming, at the median (fastest)
    [270, 295], // lane 2 – same direction, next to the median (fastest)
    [210, 235], // lane 3
    [155, 180], // lane 4
    [105, 130], // lane 5 – same direction, right edge (slow lane)
  ];
  /**
   * NOTE: the bands must NOT touch each other. They used to be
   * 100–150 / 150–200 / 200–250 / 250–300, so a car at the top of one lane was
   * exactly as fast as a car at the bottom of the next one – which read as
   * "lane 2 is faster than lane 3" and "the two left lanes have the same
   * speed". With a ≥20 km/h gap between neighbouring bands every car of an
   * inner lane is now unambiguously quicker than every car of the lane outside
   * it, on both carriageways.
   */

  /** How far ahead of the player (negative y) an opponent (re)spawns. */
  static readonly loops: ReadonlyArray<[number, number]> = [
    [-800, -350],
    [-1800, -400],
    [-600, -400],
    [-700, -500],
    [-400, -600],
    [-800, -350],
  ];

  constructor(seed?: number) {
    this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
  }

  getSpeed(id: number): number {
    const [a, b] = Rnd.speedys[id];
    return this.nextRange(a, b);
  }

  getNumb(id: number): number {
    const [a, b] = Rnd.loops[id];
    return this.nextRange(a, b);
  }

  nextInt(): number {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state;
  }

  nextFloat(): number {
    return this.nextInt() / (this.m - 1);
  }

  nextRange(start: number, end: number): number {
    const rangeSize = end - start;
    const randomUnder1 = this.nextInt() / this.m;
    return start + Math.floor(randomUnder1 * rangeSize);
  }

  choice<T>(array: T[]): T {
    return array[this.nextRange(0, array.length)];
  }
}

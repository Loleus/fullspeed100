/**
 * Camera behaviour of the race, isolated from the scene: the faster the player
 * drives, the further the camera pulls back and the higher the car sits on
 * screen (the "GTA-1" rise that buys reaction time in the fast lanes).
 */
import * as C from "./constants";
import { clamp, lerp } from "./physics";

export class RaceCamera {
  zoom = C.ZOOM_SLOW;
  /** screen fraction (from the top) the car is pinned at – 1/7 → 1/5 */
  private frac = C.FRAC_SLOW;
  /**
   * World Y the camera follows. While `null` it tracks the car; after a crash it
   * is pinned to the spot of the accident, so the wreck can be shoved around
   * inside a still frame instead of dragging the view with it.
   */
  private followY: number | null = null;

  reset(): void {
    this.zoom = C.ZOOM_SLOW;
    this.frac = C.FRAC_SLOW;
    this.followY = null;
  }

  /**
   * Stop following the car (called the moment the run ends). The zoom and the
   * screen anchor keep relaxing towards their slow-speed values, so the view
   * settles gently instead of cutting to a halt.
   */
  freeze(atWorldY: number): void {
    this.followY = atWorldY;
  }

  get isFrozen(): boolean {
    return this.followY !== null;
  }

  /** World rebase: keep the pinned crash position in the new coordinates. */
  shiftFollow(dy: number): void {
    if (this.followY !== null) this.followY += dy;
  }

  /**
   * @param delta   frame time in ms
   * @param kmh     player speed
   * @param renderY interpolated player position (never the raw physics value)
   * @returns the zoom to apply and the camera scrollY, already snapped to whole
   *          pixels (a fractional road-tile offset shimmers every frame)
   */
  /** Camera scrollY of the last update (whole pixels). */
  scrollY = 0;

  /**
   * Recomputes zoom + scroll. Writes into this object's fields instead of
   * returning a tuple: this runs every frame and must not allocate.
   */
  update(delta: number, kmh: number, renderY: number): void {
    /*
      0 below ZOOM_FROM_KPH, 1 above ZOOM_FULL_KPH, a straight ramp in between
      (see constants.Camera rise window). Outside that window the target equals the
      current value, so the smoothing below has nothing to do and the camera is
      completely still – no per-frame zoom maths on a normal drive at all.
    */
    const t = clamp(
      (Math.abs(kmh) - C.ZOOM_FROM_KPH) / (C.ZOOM_FULL_KPH - C.ZOOM_FROM_KPH),
      0,
      1,
    );

    // exp() decay instead of a per-frame factor: identical on 60, 144, 260 Hz
    const targetZoom = lerp(C.ZOOM_SLOW, C.ZOOM_FAST, t);
    const targetFrac = lerp(C.FRAC_SLOW, C.FRAC_FAST, t);

    // snap when the gap is negligible: without this the value keeps creeping by
    // 1e-9 for ever and every frame stays "changed"
    const zGap = targetZoom - this.zoom;
    this.zoom = Math.abs(zGap) < 0.0005 ? targetZoom : this.zoom + zGap * (1 - Math.exp(-delta / 400));

    const fGap = targetFrac - this.frac;
    this.frac = Math.abs(fGap) < 0.0005 ? targetFrac : this.frac + fGap * (1 - Math.exp(-delta / 330));

    // World height currently on screen grows as the camera pulls back, so the
    // road visible ahead is frac × (GAME_H / zoom) – 686 px at a standstill,
    // 970 px at v-max (≈ 48 m of warning in the fastest lane).
    //
    // IMPORTANT: Phaser zooms about the CAMERA CENTRE, hence the (frac − 0.5)
    // term; without it the car is pushed down by (1 − 1/zoom)·GAME_H/2.
    const viewH = C.GAME_H / this.zoom;
    // after a crash the frame stays where the accident happened; only the zoom and
    // the anchor keep easing, which is the "slight coast to a stop" feel
    const followY = this.followY ?? renderY;
    this.scrollY = Math.round(followY - C.GAME_H / 2 - (this.frac - 0.5) * viewH);
  }
}

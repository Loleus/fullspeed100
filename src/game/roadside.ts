/**
 * Roadside of the "infinite" highway: guard-rail collision bodies recycled
 * vertically around the player plus decorative trees/bushes on the grass.
 */
import Phaser from "phaser";
import * as C from "./constants";
import { setPositionPx } from "./physics";
import { Rnd } from "./rng";
import { TEX } from "./textures";

/**
 * Barrier segments. 2000 px (100 m) each × 4 per side = 8 static bodies total.
 *
 * This matters for the collision broadphase: Matter's default Grid inserts every
 * body into a 48 px cell for as many cells as its bounds span, so a 2400 px tall
 * rail cost ~50 cell lookups per body per step (with string keys, allocated every
 * update). Fewer, and the brute-force Detector used in GameScene.create() only
 * ever sees ~25 bodies, which is far cheaper than any grid at this scale.
 */
const WALL_SEG_H = 2000;
/**
 * Two segments per side (4 static bodies in total) instead of four: each one is
 * wider than the viewport is tall, and every body – static or not – is walked by
 * the engine on every step, so keeping the count minimal is free performance.
 */
const WALL_SEGS_PER_SIDE = 2;
/** Roadside scenery is sparser per metre than it used to be. */
const TREE_COUNT = 20;

export class Roadside {
  private trees: Phaser.GameObjects.Image[] = [];
  private walls: Array<{ body: MatterJS.BodyType; x: number; offset: number }> = [];
  private lastWallBase = Number.NaN;
  private decoRng = new Rnd(7);

  create(scene: Phaser.Scene): void {
    // create() may run again after a scene shutdown – never keep stale bodies
    // or sprites from the previous lifecycle
    this.trees = [];
    this.walls = [];
    this.lastWallBase = Number.NaN;
    this.decoRng = new Rnd(7);

    // Guard rails. The collision body is FAT and pushed outwards so its inner
    // face sits exactly where the drawn rail is: a 360 km/h car covers ~33 px
    // per physics step, which would otherwise tunnel through the thin rail.
    for (const [visualX, dir] of [
      [C.RAIL_X_LEFT, -1],
      [C.RAIL_X_RIGHT, 1],
    ] as const) {
      const innerX = visualX + dir * 2;
      const bodyX = innerX + dir * (C.WALL_THICKNESS / 2);
      for (let i = 0; i < WALL_SEGS_PER_SIDE; i++) {
        const body = scene.matter.add.rectangle(
          bodyX,
          (i - WALL_SEGS_PER_SIDE / 2) * WALL_SEG_H,
          C.WALL_THICKNESS,
          WALL_SEG_H + 16,
          {
            isStatic: true,
            label: "wall",
            friction: 0,
            // no catapulting off the rail
            restitution: 0.15,
            collisionFilter: C.FILTER_WALL,
          },
        );
        this.walls.push({ body, x: bodyX, offset: i - WALL_SEGS_PER_SIDE / 2 });
      }
    }

    for (let i = 0; i < TREE_COUNT; i++) {
      this.trees.push(
        scene.add.image(0, 0, i % 3 === 0 ? TEX.BUSH : TEX.TREE).setDepth(1),
      );
    }
  }

  /** Deterministic re-seed for a fresh run/menu (same scenery every time). */
  reset(playerY: number): void {
    this.decoRng = new Rnd(7);
    this.trees.forEach((tr, i) =>
      this.placeTree(tr, playerY + 500 - (i * 2400) / this.trees.length),
    );
  }

  /** World rebase: shifts the scenery (rails are re-placed from the player). */
  shift(dy: number): void {
    for (const tr of this.trees) tr.y += dy;
    this.lastWallBase = Number.NaN;
  }

  /** Per-frame: cycles the scenery and the barrier bodies with the player. */
  update(playerY: number): void {
    for (const tr of this.trees) {
      if (tr.y > playerY + 700) this.placeTree(tr, playerY - 1300 - this.decoRng.nextRange(0, 600));
      else if (tr.y < playerY - 1700) this.placeTree(tr, playerY + 800 + this.decoRng.nextRange(0, 600));
    }
    this.recycleWalls(playerY);
  }

  private recycleWalls(playerY: number): void {
    const base = Math.round(playerY / WALL_SEG_H) * WALL_SEG_H;
    if (base === this.lastWallBase) return;
    this.lastWallBase = base;
    for (const w of this.walls) {
      setPositionPx(w.body, w.x, base + w.offset * WALL_SEG_H, false);
    }
  }

  private placeTree(tr: Phaser.GameObjects.Image, y: number): void {
    const r = this.decoRng;
    const left = r.nextRange(0, 2) === 0;
    const x = left ? -40 + r.nextRange(0, 60) : C.GAME_W - 20 + r.nextRange(0, 60);
    tr.setTexture(r.nextRange(0, 3) === 0 ? TEX.BUSH : TEX.TREE);
    tr.setPosition(x, y);
    tr.setScale(0.7 + r.nextRange(0, 60) / 100);
  }
}

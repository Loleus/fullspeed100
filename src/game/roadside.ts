/**
 * Roadside of the "infinite" highway: guard-rail collision bodies recycled
 * vertically around the player plus decorative trees/bushes on the grass.
 */
import Phaser from "phaser";
import * as C from "./constants";
import { Rnd } from "./rng";
import { TEX } from "./textures";

/**
/** Roadside scenery is sparser per metre than it used to be. */
const TREE_COUNT = 20;

export class Roadside {
  private trees: Phaser.GameObjects.Image[] = [];
  private decoRng = new Rnd(7);

  create(scene: Phaser.Scene): void {
    // create() may run again after a scene shutdown – never keep stale bodies
    // or sprites from the previous lifecycle
    this.trees = [];
    this.decoRng = new Rnd(7);

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
  }

  /** Per-frame: cycles the scenery and the barrier bodies with the player. */
  update(playerY: number): void {
    for (const tr of this.trees) {
      if (tr.y > playerY + 700) this.placeTree(tr, playerY - 1300 - this.decoRng.nextRange(0, 600));
      else if (tr.y < playerY - 1700) this.placeTree(tr, playerY + 800 + this.decoRng.nextRange(0, 600));
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

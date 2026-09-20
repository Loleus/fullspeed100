import Phaser from "phaser";
import { COLOR_GRASS, GAME_H, GAME_W } from "./constants";
import { GameScene } from "./GameScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_W,
    height: GAME_H,
    backgroundColor: COLOR_GRASS,
    banner: false,
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_W,
      height: GAME_H,
    },
    render: {
      /*
        Back to the quality settings: antialiasing came back on and sprites are no
        longer snapped. Turning MSAA off was a guess ("it must be the renderer")
        that never showed up in the measurements, and it did cost edge quality.
        The real cause of the stutter turned out to be the number of Matter bodies.
      */
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: "high-performance",
    },
    audio: { noAudio: true }, // all sound is synthesised in audio.ts
    physics: {
      default: "matter",
      matter: {
        // top-down world: no gravity at all
        gravity: { x: 0, y: 0 },
        enableSleeping: false,
        debug: false,
        /*
          Phaser's defaults (6/4/2), restored. Cutting them to 2/2/1 was another
          guess at the stutter; the solver work was never the bottleneck (0.03–
          0.19 ms per step in the measurements) and fewer iterations only weakened
          the resolution of overlapping bodies.
        */
        positionIterations: 6,
        velocityIterations: 4,
        constraintIterations: 2,
      },
    },
    scene: [GameScene],
  });
}

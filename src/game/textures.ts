import Phaser from "phaser";
import {
  CAR_H,
  CAR_W,
  COLOR_GRASS,
  LANE_COUNT,
  LANE_W,
  MEDIAN_X,
  ONCOMING_LANES,
  RAIL_X_LEFT,
  RAIL_X_RIGHT,
  ROAD_LEFT,
  ROAD_RIGHT,
  ROAD_LINE_W,
  ROAD_TEX_OFFSET_X,
  ROAD_TEX_W,
  ROAD_TILE_H,
  ROAD_W,
  SHOULDER_W,
  LANE_X,
  LINE_M_MOTORWAY,
  PX_PER_M,
} from "./constants";
import { Rnd } from "./rng";

export const CAR_COLORS = {
  player: 0xd62828,
  lanes: [0xe9e9ec, 0x9b5de5, 0x1d6fd6, 0xf2c31b, 0x2e9e5b, 0xff8c1a],
};

export const TEX = {
  ROAD: "road",
  PLAYER: "car_player",
  OPP: (lane: number) => `car_${lane}`,
  SHADOW: "car_shadow",
  TREE: "tree",
  BUSH: "bush",
  SMOKE: "smoke",
  SPARK: "spark",
} as const;

function shade(color: number, percent: number): number {
  const c = Phaser.Display.Color.ValueToColor(color);
  if (percent < 0) c.darken(-percent);
  else c.lighten(percent);
  return c.color;
}

function newGraphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.make.graphics({}, false);
}

function drawCar(
  g: Phaser.GameObjects.Graphics,
  color: number,
  sporty: boolean,
): void {
  const w = CAR_W;
  const h = CAR_H;
  const wheelW = 7;
  const wheelH = 16;

  // wheels
  g.fillStyle(0x151515, 1);
  const wheels: Array<[number, number]> = [
    [0, 10],
    [w - wheelW, 10],
    [0, h - 10 - wheelH],
    [w - wheelW, h - 10 - wheelH],
  ];
  for (const [wx, wy] of wheels) g.fillRoundedRect(wx, wy, wheelW, wheelH, 2);

  // body
  const bodyX = 4;
  const bodyW = w - 8;
  g.fillStyle(shade(color, -30), 1);
  g.fillRoundedRect(bodyX, 1, bodyW, h - 2, { tl: 10, tr: 10, bl: 7, br: 7 });
  g.fillStyle(color, 1);
  g.fillRoundedRect(bodyX + 1.5, 2.5, bodyW - 3, h - 5, {
    tl: 9,
    tr: 9,
    bl: 6,
    br: 6,
  });

  // bonnet highlight
  g.fillStyle(shade(color, 18), 0.9);
  g.fillRoundedRect(bodyX + 5, 8, bodyW - 10, 10, 3);

  // windscreen
  g.fillStyle(0x1b2733, 1);
  g.fillRoundedRect(bodyX + 3, 20, bodyW - 6, 14, { tl: 5, tr: 5, bl: 2, br: 2 });
  g.fillStyle(0x9fd0f5, 0.35);
  g.fillRect(bodyX + 5, 22, bodyW - 10, 3);

  // roof
  g.fillStyle(shade(color, -10), 1);
  g.fillRect(bodyX + 3, 34, bodyW - 6, 20);

  // rear window
  g.fillStyle(0x1b2733, 1);
  g.fillRoundedRect(bodyX + 3, 54, bodyW - 6, 9, { tl: 2, tr: 2, bl: 4, br: 4 });

  // headlights & tail lights
  g.fillStyle(0xfff4c2, 1);
  g.fillRoundedRect(bodyX + 2, 3, 7, 4, 1);
  g.fillRoundedRect(bodyX + bodyW - 9, 3, 7, 4, 1);
  g.fillStyle(0xff2a2a, 1);
  g.fillRoundedRect(bodyX + 2, h - 7, 7, 4, 1);
  g.fillRoundedRect(bodyX + bodyW - 9, h - 7, 7, 4, 1);

  if (sporty) {
    g.fillStyle(0x111111, 1);
    g.fillRoundedRect(bodyX - 1, h - 12, bodyW + 2, 4, 1);
    g.fillStyle(0xffffff, 0.85);
    g.fillRect(w / 2 - 5, 6, 3, 12);
    g.fillRect(w / 2 + 2, 6, 3, 12);
    g.fillRect(w / 2 - 5, 63, 3, 8);
    g.fillRect(w / 2 + 2, 63, 3, 8);
  }
}

function makeCars(scene: Phaser.Scene): void {
  let g = newGraphics(scene);
  drawCar(g, CAR_COLORS.player, true);
  g.generateTexture(TEX.PLAYER, CAR_W, CAR_H);
  g.destroy();

  CAR_COLORS.lanes.forEach((color, lane) => {
    g = newGraphics(scene);
    drawCar(g, color, false);
    g.generateTexture(TEX.OPP(lane), CAR_W, CAR_H);
    g.destroy();
  });

  // soft drop shadow
  g = newGraphics(scene);
  const pad = 4;
  for (let i = 0; i < 3; i++) {
    g.fillStyle(0x000000, 0.13);
    g.fillRoundedRect(
      pad - i * 1.5 + 2,
      pad - i * 1.5 + 2,
      CAR_W - 4 + i * 3,
      CAR_H - 4 + i * 3,
      10,
    );
  }
  g.generateTexture(TEX.SHADOW, CAR_W + pad * 2, CAR_H + pad * 2);
  g.destroy();
}

function makeRoad(scene: Phaser.Scene): void {
  const g = newGraphics(scene);
  const H = ROAD_TILE_H; // one full dash cycle: 6 m line + 12 m gap = 18 m

  // everything below is drawn in WORLD x, shifted right by ROAD_TEX_OFFSET_X
  g.translateCanvas(ROAD_TEX_OFFSET_X, 0);

  // grass with a faint alternating band (motion cue) – full texture width, so
  // the banded grass also covers what you see when the camera pulls back
  g.fillStyle(COLOR_GRASS, 1);
  g.fillRect(-ROAD_TEX_OFFSET_X, 0, ROAD_TEX_W, H);
  g.fillStyle(0x2c6529, 1);
  g.fillRect(-ROAD_TEX_OFFSET_X, 0, ROAD_TEX_W, H / 2);

  // gravel shoulders on both outer edges
  g.fillStyle(0x8e8a7a, 1);
  g.fillRect(ROAD_LEFT - SHOULDER_W, 0, SHOULDER_W, H);
  g.fillRect(ROAD_RIGHT, 0, SHOULDER_W, H);
  const rnd = new Rnd(3);
  const gravelBits = Math.round(H * (180 / 160));
  for (let i = 0; i < gravelBits; i++) {
    const left = rnd.nextRange(0, 2) === 0;
    const x =
      (left ? ROAD_LEFT - SHOULDER_W : ROAD_RIGHT) + rnd.nextRange(0, SHOULDER_W);
    const y = rnd.nextRange(0, H);
    g.fillStyle(rnd.nextRange(0, 2) ? 0x7d7969 : 0x9c988a, 1);
    g.fillRect(x, y, 2, 2);
  }

  // guard rails – posts every 2 m so they read as motion at any speed
  for (const rx of [RAIL_X_LEFT, RAIL_X_RIGHT]) {
    g.fillStyle(0x5a5e66, 1);
    for (let py = 12; py < H; py += PX_PER_M * 2) g.fillRect(rx - 3, py, 6, 8);
    g.fillStyle(0xc4c7cc, 1);
    g.fillRect(rx - 2, 0, 4, H);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(rx - 2, 0, 1, H);
  }

  // asphalt
  g.fillStyle(0x3b3b43, 1);
  g.fillRect(ROAD_LEFT, 0, ROAD_W, H);
  // tyre-worn tracks in every lane (wheels 1.6 m apart → ±16 px)
  g.fillStyle(0x36363d, 1);
  for (const lx of LANE_X) {
    g.fillRect(lx - 20, 0, 8, H);
    g.fillRect(lx + 12, 0, 8, H);
  }
  const asphaltBits = Math.round(H * (320 / 160));
  for (let i = 0; i < asphaltBits; i++) {
    const x = ROAD_LEFT + rnd.nextRange(0, ROAD_W);
    const y = rnd.nextRange(0, H);
    g.fillStyle(rnd.nextRange(0, 2) ? 0x33333a : 0x45454d, 1);
    g.fillRect(x, y, 2, 2);
  }

  // edge lines (P-2, solid, 0.2 m = 4 px)
  g.fillStyle(0xf4f4f4, 1);
  g.fillRect(ROAD_LEFT + 2, 0, ROAD_LINE_W, H);
  g.fillRect(ROAD_RIGHT - 2 - ROAD_LINE_W, 0, ROAD_LINE_W, H);

  // double solid line between the oncoming carriageway and the player's lanes
  // (two 0.2 m lines 0.2 m apart)
  g.fillStyle(0xf4f4f4, 1);
  g.fillRect(MEDIAN_X - ROAD_LINE_W - 2, 0, ROAD_LINE_W, H);
  g.fillRect(MEDIAN_X + 2, 0, ROAD_LINE_W, H);

  // broken lane lines (P-1) between neighbouring lanes on both carriageways,
  // in MOTORWAY spacing: lineM_MOTORWAY px painted, then gapM_MOTORWAY px empty
  const linePx = LINE_M_MOTORWAY * PX_PER_M; // 120 px = 6 m of paint
  // one stroke per 18 m tile, so the 12 m gap is simply the rest of the tile
  for (let k = 1; k < LANE_COUNT; k++) {
    if (k === ONCOMING_LANES) continue; // median already drawn as a double solid
    const x = ROAD_LEFT + LANE_W * k;
    g.fillRect(x - ROAD_LINE_W / 2, 0, ROAD_LINE_W, linePx);
  }
  // (the gap is GAP_M_MOTORWAY = 12 m: the tile is exactly one line+gap cycle)

  g.generateTexture(TEX.ROAD, ROAD_TEX_W, H);
  g.destroy();
}

function makeScenery(scene: Phaser.Scene): void {
  // tree
  let g = newGraphics(scene);
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(32, 34, 46, 40);
  g.fillStyle(0x1e4d1e, 1);
  g.fillCircle(28, 28, 22);
  g.fillStyle(0x2f7d2f, 1);
  g.fillCircle(25, 25, 16);
  g.fillStyle(0x3f9a3f, 1);
  g.fillCircle(21, 21, 8);
  g.generateTexture(TEX.TREE, 60, 60);
  g.destroy();

  // bush
  g = newGraphics(scene);
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(16, 17, 24, 20);
  g.fillStyle(0x25602a, 1);
  g.fillCircle(14, 14, 11);
  g.fillStyle(0x3a8a3a, 1);
  g.fillCircle(12, 12, 6);
  g.generateTexture(TEX.BUSH, 32, 32);
  g.destroy();

  // smoke puff (soft radial blob)
  g = newGraphics(scene);
  for (let r = 16; r >= 2; r -= 2) {
    g.fillStyle(0xffffff, 0.07);
    g.fillCircle(16, 16, r);
  }
  g.generateTexture(TEX.SMOKE, 32, 32);
  g.destroy();

  // spark
  g = newGraphics(scene);
  g.fillStyle(0xffc857, 1);
  g.fillCircle(4, 4, 3.5);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 1.5);
  g.generateTexture(TEX.SPARK, 8, 8);
  g.destroy();
}

export function createTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.ROAD)) return;
  makeCars(scene);
  makeRoad(scene);
  makeScenery(scene);
}

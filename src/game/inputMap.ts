/**
 * Keyboard + touch input mapped onto the car's control vector.
 * Pure function – the scene just feeds it the Phaser keys.
 */
import { touchInput } from "./bus";
import type { CarInput } from "./PlayerCar";

/** Reused carrier for the input state – `readCarInput` runs every physics step
 *  and must not hand out a fresh object 60 times a second. */
const inputState: CarInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  brake: false,
};

export function readCarInput(
  cursors: Phaser.Types.Input.Keyboard.CursorKeys,
  wasd: Record<string, Phaser.Input.Keyboard.Key>,
): CarInput {
  inputState.left = cursors.left.isDown || wasd.left.isDown || touchInput.left;
  inputState.right = cursors.right.isDown || wasd.right.isDown || touchInput.right;
  inputState.up = cursors.up.isDown || wasd.up.isDown || touchInput.up;
  inputState.down = cursors.down.isDown || wasd.down.isDown || touchInput.down;
  inputState.brake = cursors.space.isDown || wasd.hand.isDown || touchInput.brake;
  return inputState;
}

import type { KeyboardControlsEntry } from "@react-three/drei";

export type Control =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "jump"
  | "turnLeft"
  | "turnRight"
  | "formUpright"
  | "formFlat";

export const controlMap: KeyboardControlsEntry<Control>[] = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "jump", keys: ["Space"] },
  { name: "turnLeft", keys: ["KeyQ"] },
  { name: "turnRight", keys: ["KeyE"] },
  { name: "formUpright", keys: ["Digit1"] },
  { name: "formFlat", keys: ["Digit2"] },
];

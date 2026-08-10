"use client";

/**
 * The canvas is created inside the r3f tree but the pause menu lives outside
 * it, so the element both need is kept here.
 */
let target: HTMLCanvasElement | null = null;

export function setLockTarget(canvas: HTMLCanvasElement | null) {
  target = canvas;
}

export function requestLock() {
  target?.requestPointerLock();
}

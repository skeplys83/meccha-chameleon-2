import { matchMaker } from "colyseus";

/**
 * No `I`, `O`, `0` or `1`. The code exists to be read aloud or typed off
 * somebody's screen, and those four are the pairs that get read back wrong.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 4;
/** After this many collisions, take the hint and use a longer code. */
const TRIES = 12;

const draw = (length: number) =>
  Array.from(
    { length },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
  ).join("");

/** A code no live room is using. */
export async function freeRoomCode() {
  for (let i = 0; i < TRIES; i++) {
    const code = draw(LENGTH);
    if ((await matchMaker.query({ roomId: code })).length === 0) return code;
  }
  return draw(LENGTH + 2);
}

/** What a typed code looks like once it has been tidied up. Codes are stored
 *  uppercase, so a lowercase one is the same room. */
export const normaliseCode = (raw: string) =>
  raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

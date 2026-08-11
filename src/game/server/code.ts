import { matchMaker } from "colyseus";

/**
 * Invite codes.
 *
 * A code *is* the room id. Colyseus lets `roomId` be replaced during `onCreate`
 * and nowhere else, so a lobby simply names itself something a person can read
 * out, and joining an invite is `client.joinById(code)` — no token store, no
 * second lookup, and it survives a page reload because it is only a string.
 */

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

/**
 * A code no live room is using.
 *
 * 32⁴ is a million, so a collision needs either bad luck or a lot of rooms —
 * but a collision is not survivable (two rooms with one id) so it is checked
 * rather than assumed. The room directory is the authority here, which is the
 * same `matchMaker.query` the lobby listing uses.
 */
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

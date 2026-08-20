/**
 * Fallback player names.
 *
 * **Here rather than in `client/hud/` because both halves read them now.** The
 * client offers one in the name box; the server hands one out when it takes a
 * name away, so a player who types something unrepeatable becomes `Gecko42`
 * rather than being refused a seat.
 */
export const NAMES = [
  "Gecko",
  "Iguana",
  "Skink",
  "Anole",
  "Monitor",
  "Basilisk",
  "Agama",
  "Tegu",
  "Draco",
  "Newt",
  "Salamander",
  "Axolotl",
  "Komodo",
  "Uromastyx",
  "Tuatara",
  "Chuckwalla",
  "Gila",
  "Bearded",
  "Frilled",
  "Leafmimic",
];

export function randomName() {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  return `${name}${Math.floor(Math.random() * 90) + 10}`;
}

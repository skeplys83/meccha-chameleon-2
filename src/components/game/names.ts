/**
 * Fallback player names. Nobody should have to think of one to get into a
 * game, so a tab with no stored name gets a random pick plus two digits — the
 * digits are what stop two people picking "Gecko" from being indistinguishable.
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

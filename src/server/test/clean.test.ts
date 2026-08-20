import { describe, expect, it } from "vitest";
import { cleanChat, cleanName, isFoul } from "../clean.ts";
import { NAMES } from "../../shared/names.ts";

/**
 * The filter itself, away from a room. What is being pinned here is not the
 * word list — that is `obscenity`'s and will change under us — but the three
 * decisions made on top of it: chat is masked, a name is replaced, and neither
 * touches text that is merely rude-adjacent.
 */

describe("the profanity filter", () => {
  it("catches the obvious", () => {
    expect(isFoul("what the fuck")).toBe(true);
    expect(isFoul("shit")).toBe(true);
  });

  it("catches it stretched, leetspoken, buried and in confusables", () => {
    // A word list matches none of these. This is why the dependency exists
    // rather than a regex over an array.
    expect(isFoul("fuuuuuuuck")).toBe(true);
    expect(isFoul("fuckkkk")).toBe(true);
    expect(isFoul("fvck")).toBe(true);
    expect(isFoul("f0ck")).toBe(true);
    expect(isFoul("sh1t")).toBe(true);
    expect(isFoul("a$$hole")).toBe(true);
    expect(isFoul("ʃṳ𝒸𝗄")).toBe(true);
    expect(isFoul("saysfuckhere")).toBe(true);
    expect(isFoul("fu ck")).toBe(true);
  });

  it("does not catch letters spelled out one by one, and that is deliberate", () => {
    // `obscenity` will not collapse every separator, because then the initials
    // of an innocent sentence start matching. Pinned so the day it changes is
    // visible rather than surprising — and so the asymmetry below has a reason
    // written next to it.
    expect(isFoul("f u c k")).toBe(false);
    expect(isFoul("f-u-c-k")).toBe(false);
  });

  it("leaves ordinary talk alone", () => {
    for (const line of [
      "one more coming",
      "pick the dungeon",
      "behind the second pillar",
      "nice hide",
      "gg",
    ]) {
      expect(isFoul(line), line).toBe(false);
    }
  });

  it("leaves every fallback name alone, which is the false positive that bites", () => {
    // The classic failure of a substring matcher. These are the names the game
    // *hands out*, so flagging one would mean the server renaming a player to
    // something it then considers foul.
    for (const name of NAMES) {
      expect(isFoul(name), name).toBe(false);
    }
  });

  it("masks a chat line rather than dropping it", () => {
    const line = cleanChat("what the fuck are you doing");
    expect(line).not.toContain("fuck");
    // The sentence around it survives, so the sender can see what happened.
    expect(line).toContain("what the");
    expect(line).toContain("are you doing");
  });

  it("returns a clean line untouched, character for character", () => {
    const line = "he is behind the barrel, go left";
    expect(cleanChat(line)).toBe(line);
  });

  it("replaces a foul name instead of masking or refusing it", () => {
    const replaced = cleanName("fuckface");
    expect(replaced).not.toContain("fuck");
    // A fresh name from the same pool the menu offers, not a grawlix.
    expect(replaced).not.toContain("*");
    expect(NAMES.some((n) => replaced.startsWith(n))).toBe(true);
  });

  it("reads a name more strictly than a chat line", () => {
    // The one place the separator trick is worth closing: a name is short,
    // chosen to be looked at, and worn for a whole round.
    expect(cleanName("f u c k")).not.toBe("f u c k");
    expect(cleanName("f.u.c.k")).not.toBe("f.u.c.k");
    // And the same string in chat is left alone, because collapsing gaps in a
    // sentence invents words across them.
    expect(cleanChat("f u c k")).toBe("f u c k");
  });

  it("leaves a clean name exactly as it was typed", () => {
    expect(cleanName("Martin")).toBe("Martin");
    expect(cleanName("xX_sniper_Xx")).toBe("xX_sniper_Xx");
  });
});

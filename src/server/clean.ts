import {
  RegExpMatcher,
  TextCensor,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";
import { randomName } from "../shared/names.ts";

/**
 * What a player is allowed to make everybody else read.
 *
 * **Server-side, and only server-side.** A filter on the client is decoration:
 * a name is a join option and a message is a websocket frame, and anyone
 * willing to open a console can send either by hand. This is the same trust
 * model as every other message — see `messages.ts`.
 *
 * **`obscenity` rather than a word list**, because the interesting input is not
 * the word itself. Its transformers fold `fuuuuuck`, `f0ck` and `ʃṳ𝒸𝗄` back
 * onto the same match, which is what a name chosen *to be seen* will try. The
 * dataset also carries whitelist entries, which is what stops the classic
 * false positive — the fallback names next door include `Chuckwalla`,
 * `Uromastyx` and `Basilisk`, and a naive substring match is exactly how one of
 * those gets banned.
 *
 * **What it catches, measured rather than assumed**: the plain word in any
 * case, stretched (`fuuuuuck`, `fuckkkk`), leetspoken (`fvck`, `f0ck`, `sh1t`,
 * `a$$hole`), in unicode confusables (`ʃṳ𝒸𝗄`), buried inside another word
 * (`saysfuckhere`), truncated (`fuk`), and broken by a single space (`fu ck`).
 *
 * **What it does not** is letters separated one by one — `f u c k`, `f-u-c-k`.
 * That is `obscenity` being careful rather than weak: collapsing every
 * separator means the initials of an innocent sentence start matching, and the
 * false positives are worse than the misses. `cleanName` takes that trade
 * differently — see below.
 *
 * **It is a mechanism, not a guarantee.** No list is complete, this one is
 * English, and near-misses like `phuck` go straight through.
 * GameDistribution's guidelines ask that "mechanisms should be in place",
 * which is a different and achievable bar. **What it does not cover at all is
 * paint** — a chameleon can draw whatever they like on their own body and no
 * text filter reaches it.
 */
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** Replaces each matched region with grawlixes rather than deleting it, so the
 *  sentence around it still reads. */
const censor = new TextCensor();

/** Whether this text has anything in it we would rather nobody read. */
export const isFoul = (text: string) => matcher.hasMatch(text);

/**
 * A chat line, with anything foul masked.
 *
 * **Masked rather than dropped.** A message that silently vanishes reads as the
 * server being broken, and the sender simply types it again; `****` says what
 * happened without a word of UI.
 */
export function cleanChat(text: string) {
  const matches = matcher.getAllMatches(text);
  return matches.length === 0 ? text : censor.applyTo(text, matches);
}

/**
 * A player name, or a fresh one if theirs cannot be used.
 *
 * **Replaced rather than masked or refused.** A name is worn for the whole
 * round and `Ge****42` is worse than either alternative; refusing the join
 * outright is worse still, because the player is left at an error screen with
 * nothing to fix and no idea what was wrong. Handing them `Gecko42` is the
 * quiet answer, and it is the same pool the name box offers by default.
 */
export function cleanName(name: string) {
  return isFoul(name) || isFoul(collapsed(name)) ? randomName() : name;
}

/**
 * The name with every separator taken out, so `f u c k` and `f.u.c.k` are read
 * as what they plainly are.
 *
 * **Only names get this second pass.** Doing it to a sentence invents words
 * across the gaps between real ones — "I saw a bass hole" collapses into
 * something the filter would catch — and chat is where that would happen all
 * day. A name is sixteen characters, chosen deliberately to be looked at, and
 * worn for a whole round, so it is worth the stricter reading and the rare
 * unlucky rename.
 */
const collapsed = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, "");

import { randomUUID } from "node:crypto";
import { matchMaker, Room, type Client } from "colyseus";
import { GameState, Player } from "./schema.ts";
import {
  DEFAULT_MATCH_MAP,
  LOBBY_MAP,
  MATCH_MAP_IDS,
} from "../world/mapIds.ts";
import { mapRoundSeconds } from "../world/maps.ts";
import { freeRoomCode } from "./code.ts";
import { setSessionName } from "./discovery.ts";
import {
  COUNTDOWN_SECONDS,
  HIDE_SECONDS,
  REVEAL_SECONDS,
  FIRE_INTERVAL_MS,
  FIRE_INTERVAL_TOLERANCE,
  MAX_PLAYERS,
  MAX_STROKE_BATCH,
  MIN_PLAYERS,
  WHISTLE_INTERVAL_MS,
  WHISTLE_TOLERANCE,
  MAX_STROKES,
  MAX_STROKE_LENGTH,
  POSE_COUNT,
  ROOM_LIMIT,
} from "../shared/protocol.ts";

/**
 * One class, two registered names: `"lobby"` and `"match"`.
 *
 * A **lobby** is where a game starts. It is the arena, and it is playable — you
 * walk around and paint yourself while people arrive — and it owns a short
 * invite code, which is its `roomId`. A **match** is the game proper on the
 * chosen map, created by a lobby and unlisted, since it is reached by being
 * moved into it rather than by being found.
 *
 * The two differ in three things: which map they run, whether Start exists, and
 * whether they appear in the listing. Everything else — movement, paint, kills,
 * whistles — is identical, which is why it is one class.
 *
 * The trust model is friends-on-a-couch, not anti-cheat: clients simulate their
 * own movement and simply tell the server where they are, and the server clamps
 * the result into the arena. Everything that affects *someone else* — a kill —
 * is checked here, because a client asserting another client's death is the one
 * message where being wrong is not cosmetic.
 */

// ROOM_LIMIT, POSE_COUNT, MAX_STROKES and MAX_STROKE_LENGTH are imported above:
// the client reads the same definitions, and each used to exist here as a second
// copy with a comment asking the next person to change both.
const PATCH_MS = 50; // 20 Hz state patches
const MAX_GRAVES = 200; // server-only: the client just renders what it is sent
/** How often an empty lobby checks whether it still has a reason to exist. */
const SWEEP_MS = 15_000;
/**
 * How long a round runs is a property of the *map* — `world/maps.ts`, read here
 * through `mapRoundSeconds`.
 *
 * That import is only possible because the map registry and everything under it
 * are free of React and three.js and use relative `.ts` paths: plain Node can
 * load them. It is the first thing outside the browser to read map data, and the
 * reason `world/` keeps that constraint.
 */
/**
 * How long a dropped player's seat is held for them, in a match.
 *
 * Their body stays standing in the world for the duration — which is the honest
 * outcome, and shootable. Long enough for a wifi blip or a tab that got
 * throttled; short enough that a match this brief is not mostly ghosts.
 */
const RECONNECT_SECONDS = 20;
/**
 * How long the host's seat is held for them after a match ends.
 *
 * Everyone comes back at once, in whatever order their seat reservations land,
 * and the host is not necessarily first through the door. Without this pause the
 * first arrival would be handed the button a moment before its owner walked in
 * and kept it — the exact reshuffle the host rule exists to prevent.
 */
const HOST_GRACE_MS = 10_000;

/** Anything non-finite off the wire becomes 0 rather than poisoning the state. */
const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;

const MIN_FIRE_GAP_MS = FIRE_INTERVAL_MS * FIRE_INTERVAL_TOLERANCE;
const MIN_WHISTLE_GAP_MS = WHISTLE_INTERVAL_MS * WHISTLE_TOLERANCE;

/**
 * A room directory entry, as `matchMaker` hands them back.
 *
 * Derived rather than imported: `IRoomCache` is not on the package's public type
 * surface, and reaching into `@colyseus/core/build/...` for it would break on a
 * patch release. This says exactly the same thing and cannot drift.
 */
type RoomCache = Awaited<ReturnType<typeof matchMaker.createRoom>>;

/**
 * What `allowReconnection` hands back — a promise that can also be abandoned.
 *
 * Derived for the same reason as `RoomCache`: Colyseus's `Deferred` types its
 * `reject` as the bare `Function`, which the lint rules refuse, and only the one
 * call is needed here.
 */
type Reconnection = { reject(): void };

type StateMsg = { p?: unknown; yaw?: unknown; pitch?: unknown; pose?: unknown; cling?: unknown };
type PaintMsg = { strokes?: unknown };
type KillMsg = { id?: unknown; position?: unknown };
type ShootMsg = {
  position: [number, number, number];
  rotation: [number, number, number];
  origin: [number, number, number];
};

export class GameRoom extends Room<GameState> {
  /** When each client last got a shot through, so a spammed trigger is dropped
   *  here as well as on the client. Rate is the one property of a shot that
   *  reaches everybody — an unlimited one is a wall of noise for the whole room. */
  private lastShot = new Map<string, number>();
  /** When each client last whistled, so nobody can turn theirs into a siren. */
  private lastWhistle = new Map<string, number>();

  /** True at most once per FIRE_INTERVAL_MS per client, and records the shot. */
  private canFire(sessionId: string) {
    const now = Date.now();
    if (now - (this.lastShot.get(sessionId) ?? 0) < MIN_FIRE_GAP_MS) return false;
    this.lastShot.set(sessionId, now);
    return true;
  }

  /** The match this lobby started, if it has started one. Lobbies only. */
  private matchId: string | null = null;
  /** Start is async and Start is a button. Two presses would open two matches
   *  and send half the room to each. */
  private starting = false;
  /** True from the moment the clock runs out, so the trip home happens once. */
  private ending = false;
  /**
   * The secret that makes a role trustworthy.
   *
   * A seat reservation's options and a client's own join options arrive at
   * `onJoin` in the same argument, indistinguishable by shape — so a match that
   * simply believed `options.role` would let any chameleon leave and come back as
   * the hunter, and every player in a match knows its id. The lobby mints this,
   * passes it in `createRoom`, and includes it in each reservation; a join
   * without it is a chameleon no matter what it claims.
   */
  private pass = "";
  /**
   * Reconnections currently being waited on, by session id, so a player who is
   * killed while away can be let go of rather than returning to a room they are
   * no longer in.
   */
  private pendingReturn = new Map<string, Reconnection>();
  /**
   * Which tab each seat belongs to, by session id.
   *
   * A session id identifies a connection to *this* room and is replaced every
   * time a player changes rooms, so it cannot answer "is this the person who
   * opened the game". The player id can, and this is where the two are tied
   * together for as long as the connection lasts.
   */
  private pidOf = new Map<string, string>();
  /**
   * When each player id was first seen in this room, for the room's whole life.
   *
   * This is what "longest participating" has to mean. Arrival *order* is no use:
   * everybody leaves the lobby when a match starts and comes back with fresh
   * session ids in whatever order their seat reservations happened to land, so
   * ordering by the current join would just be "first back from the match" —
   * exactly the arbitrary thing the host rule exists to avoid.
   *
   * Entries are kept after their player leaves. Someone who steps out and comes
   * back is still the same length of participating, and the map is a handful of
   * timestamps.
   */
  private firstSeen = new Map<string, number>();
  /** The tab currently holding the Start button. Empty while nobody does. */
  private hostPid = "";
  /** Until when the button waits for an absent host rather than moving on. */
  private hostGraceUntil = 0;
  /**
   * The lobby's countdown, while one is running. Lobbies only.
   *
   * Held so it can be *cancelled*: a countdown that kept running after the room
   * dropped below two players would start a round with one person in it.
   */
  private counting: ReturnType<GameRoom["clock"]["setInterval"]> | null = null;
  /**
   * The lobby's display mirror of the hiding countdown, and the hunter it is
   * waiting to send.
   *
   * The hunter does *not* travel with the chameleons: they stay here and play
   * the arena alone while the others hide. The match decides when that ends —
   * it calls `sendHunter` — and this interval only paints the number they are
   * watching. **It decides nothing**, which is what keeps invariant 17 ("one
   * clock, not two") intact: two clocks would be a problem if both could end the
   * phase, and only one of these can.
   */
  private hiding: ReturnType<GameRoom["clock"]["setInterval"]> | null = null;
  private hunterId = "";
  /** The pass minted for this round, kept so the hunter's later seat carries it. */
  private roundPass = "";
  /** The hunt's length, from the map, minus the hiding phase. Matches only. */
  private huntSeconds = 0;

  private get isLobby() {
    return this.roomName !== "match";
  }

  /**
   * Decide who holds the Start button, and put their session id in state.
   *
   * The rule is one line: **the present player who has been part of this game
   * longest holds it.** The creator satisfies that by construction, so they keep
   * it for the room's whole life without being a special case — and if they
   * leave for good it passes to whoever has been here next-longest, which is
   * the behaviour anyone would expect.
   *
   * The gate is what makes it work: **nothing is reassigned while a match is
   * running.** A lobby is deliberately empty for that whole minute, so without
   * the gate the button would fall to the first stranger to wander in on the
   * invite code — and, before `start` learned to refuse, let them open a second
   * match. With it, an absent host during a match simply means nobody holds the
   * button until the group comes back.
   *
   * Called from every place the answer can change: a join, a leave, and the
   * sweep, which is where a match is noticed to have ended.
   */
  private reassignHost() {
    if (!this.isLobby) return;

    const here = this.clients
      .map((c) => ({ sessionId: c.sessionId, pid: this.pidOf.get(c.sessionId) ?? "" }))
      .filter((c) => this.state.players.has(c.sessionId));

    // The holder is here: nothing to decide, but their session id has changed if
    // they have just come back from the match.
    const holder = here.find((c) => c.pid !== "" && c.pid === this.hostPid);
    if (holder) {
      this.state.hostId = holder.sessionId;
      return;
    }

    // They are away. If a match is running they are in it, and if one has just
    // ended they are on their way back through the door — either way the button
    // waits rather than falling to whoever happens to be standing here.
    if (this.matchId || Date.now() < this.hostGraceUntil) {
      this.state.hostId = "";
      return;
    }

    // Gone for good, as far as this room can tell. Longest-participating wins,
    // measured from when each *player* first arrived rather than from when their
    // current connection did.
    let best: { sessionId: string; pid: string } | null = null;
    let bestSeen = Infinity;
    for (const candidate of here) {
      if (candidate.pid === "") continue;
      const seen = this.firstSeen.get(candidate.pid) ?? Infinity;
      if (seen < bestSeen) {
        best = candidate;
        bestSeen = seen;
      }
    }

    this.hostPid = best?.pid ?? "";
    this.state.hostId = best?.sessionId ?? "";
  }

  /**
   * Our match telling us it is over, over the matchmaker.
   *
   * Public because `matchMaker.remoteRoomCall` reaches it by name. The sweep
   * would notice the same thing within fifteen seconds, which is fine for
   * bookkeeping and much too slow for a person: the host walks back in, presses
   * Start, and nothing happens because this room still believes its match is
   * running. The grace window starts here too — everyone is mid-return.
   */
  matchEnded(id: string) {
    if (!this.isLobby || this.matchId !== id) return;
    this.matchId = null;
    this.hostGraceUntil = Date.now() + HOST_GRACE_MS;
    this.publish();
  }

  /**
   * What the menu's listing reads off this lobby.
   *
   * The room directory is the only thing a listing can be built from — Colyseus
   * 0.16 has no room-list route — and `metadata` is the part of a directory
   * entry a room may write. `matchId` is here so the listing can add the players
   * who have already gone through to the match: a game's population is both
   * rooms, not just the one people are still waiting in.
   */
  private publish() {
    if (!this.isLobby) return;
    this.setMetadata({
      host: this.state.players.get(this.state.hostId)?.name ?? "",
      map: this.state.nextMap,
      started: this.matchId !== null,
      matchId: this.matchId ?? "",
      // So the menu can show "4 / 8" rather than a bare count, and grey out a
      // game there is no room in.
      maxPlayers: this.state.maxPlayers,
    });
  }

  async onCreate(options?: {
    map?: string;
    listed?: boolean;
    lobby?: string;
    pass?: string;
    pid?: string;
    maxPlayers?: number;
  }) {
    this.setState(new GameState());
    this.setPatchRate(PATCH_MS);

    /**
     * How many people this game holds.
     *
     * Clamped rather than trusted: it arrives from a client, and a lobby of 0 or
     * of 10,000 are both one hand-typed number away. `maxClients` is what
     * actually refuses the join — Colyseus enforces it before `onJoin` ever runs
     * — and the schema copy exists so the panel can display it and the countdown
     * knows what full means.
     *
     * A match is created with the same number so a full lobby cannot arrive at a
     * room that will not take all of it.
     */
    const cap = clamp(Math.trunc(Number(options?.maxPlayers)), MIN_PLAYERS, MAX_PLAYERS);
    this.maxClients = cap || MAX_PLAYERS;
    this.state.maxPlayers = this.maxClients;

    // The arena is where lobbies wait, never a map a match runs on, so it is
    // refused here as well as absent from the picker.
    const wanted =
      typeof options?.map === "string" && MATCH_MAP_IDS.includes(options.map as never)
        ? options.map
        : DEFAULT_MATCH_MAP;

    if (this.isLobby) {
      this.state.mode = "lobby";
      this.state.phase = "waiting";
      // The waiting room is always the arena. It is somewhere to *be* while
      // people arrive, and the map you are about to play should still be a
      // surprise when you get there.
      this.state.map = LOBBY_MAP;
      this.state.nextMap = wanted;
      // The invite code is the room id, and `roomId` may only be replaced here —
      // the setter throws at any later point in the room's life.
      this.roomId = await freeRoomCode();
      /**
       * A lobby outlives its own emptiness on purpose. Starting a match moves
       * every client out at once, and an auto-disposing room would take the
       * invite code down in that gap — so the sweep below is what ends it: no
       * players, and no live match to come back to.
       */
      this.autoDispose = false;
      this.clock.setInterval(() => void this.sweep(), SWEEP_MS);
      /**
       * Listed unless the creator said otherwise, and only ever decided here.
       *
       * `setPrivate` hides a room from the directory the listing queries; it
       * does **not** lock it, so the invite code works exactly the same either
       * way. Unlisted therefore means "you need the code from me", not "you
       * cannot get in".
       */
      this.state.listed = options?.listed !== false;
      this.setPrivate(!this.state.listed);
      // A lobby is its own home. Everything downstream — a client leaving a
      // match, a match sending everyone back — reads this one field.
      this.state.lobby = this.roomId;
      // Written rather than left alone: an unset number is simply absent from
      // the encoded state, and the client would read `undefined` where it
      // expects "no clock is running".
      this.state.timeLeft = 0;
      // Whoever opened it holds the button, and keeps holding it for as long as
      // the room exists — through the match and back again. `onJoin` is too late
      // for this: by then a returning player is indistinguishable from a
      // latecomer, which is precisely the confusion this is here to end.
      this.hostPid = String(options?.pid ?? "");
      this.publish();
    } else {
      this.state.mode = "match";
      // A round opens with everybody hiding and the hunter still in the lobby.
      this.state.phase = "hiding";
      this.state.map = wanted;
      // The map decides how long a round is; the hiding phase is carved out of
      // it rather than added to it, so "two minutes" means two minutes.
      this.huntSeconds = mapRoundSeconds(wanted) - HIDE_SECONDS;
      this.state.nextMap = wanted;
      this.state.lobby = String(options?.lobby ?? "");
      this.pass = String(options?.pass ?? "");
      // Reached by being moved into it, never by being found. `joinById` still
      // works, which is what a respawn uses.
      this.setPrivate(true);

      /**
       * The match clock, and the only thing that moves a round forward.
       *
       * **One `clock.setInterval` drives all three phases.** Not a timer each:
       * two timers are two things that can disagree, and the number on screen
       * must be the same one that decides what happens next. Each phase sets the
       * seconds for the one after it and the same tick keeps counting.
       *
       * `this.clock` is Colyseus's own timing, which advances with the room — it
       * is ticked from the patch loop, so it stops when the room does and cannot
       * outlive it the way a stray `setInterval` would.
       */
      this.state.timeLeft = HIDE_SECONDS;
      this.clock.setInterval(() => {
        if (this.state.timeLeft <= 0) return;
        this.state.timeLeft -= 1;
        if (this.state.timeLeft > 0) return;

        if (this.state.phase === "hiding") {
          // The bell. Everyone is told by the phase changing — see
          // `net/CLAUDE.md` — and the hunter is fetched from the lobby.
          this.state.phase = "hunt";
          this.state.timeLeft = Math.max(1, this.huntSeconds);
          void this.callLobby("sendHunter", this.roomId);
        } else if (this.state.phase === "hunt") {
          // Time ran out with somebody still free.
          this.finish("chameleons");
        } else if (this.state.phase === "reveal") {
          void this.goHome();
        }
      }, 1000);
    }

    // Only a host may start, and only a lobby has anything to start. Pressing it
    // does not open a match — it starts the countdown, which does.
    this.onMessage("start", (client: Client) => {
      if (!this.isLobby || client.sessionId !== this.state.hostId) return;
      this.beginCountdown();
    });

    // The host may still change their mind while people are arriving. It only
    // moves `nextMap`: the lobby's own geometry never changes under anyone.
    this.onMessage("setMap", (client: Client, msg: { map?: unknown }) => {
      if (!this.isLobby || client.sessionId !== this.state.hostId) return;
      const map = String(msg?.map ?? "");
      if (!MATCH_MAP_IDS.includes(map as never)) return;
      this.state.nextMap = map;
      this.publish();
    });

    this.onMessage("state", (client: Client, msg: StateMsg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !msg) return;
      const [x, y, z] = Array.isArray(msg.p) ? (msg.p as number[]) : [0, 0, 0];
      player.x = clamp(x, -ROOM_LIMIT, ROOM_LIMIT);
      player.y = clamp(y, -5, 30);
      player.z = clamp(z, -ROOM_LIMIT, ROOM_LIMIT);
      player.yaw = Number.isFinite(msg.yaw) ? (msg.yaw as number) : 0;
      player.pitch = Number.isFinite(msg.pitch) ? (msg.pitch as number) : 0;
      player.pose = clamp(Math.trunc(msg.pose as number), 0, POSE_COUNT - 1);
      // Coerced, never stored raw: schema "boolean" will happily encode whatever
      // truthy junk arrives and hand it to every client. Chameleons only, because
      // clinging is what silences your footsteps for everyone else — a hunter
      // who could set it would simply hunt without making a sound.
      player.cling = player.role === "chameleon" && msg.cling === true;
    });

    // Paint is cosmetic and self-applied: it is stored on the painter and
    // relayed to everyone else, who already have the same brush code.
    this.onMessage("paint", (client: Client, msg: PaintMsg) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !Array.isArray(msg?.strokes)) return;

      const strokes = (msg.strokes as unknown[])
        .filter((s): s is string => typeof s === "string" && s.length <= MAX_STROKE_LENGTH)
        .slice(0, MAX_STROKE_BATCH);
      if (!strokes.length) return;

      for (const stroke of strokes) player.strokes.push(stroke);
      const overflow = player.strokes.length - MAX_STROKES;
      if (overflow > 0) player.strokes.splice(0, overflow);

      this.broadcast("paint", { id: client.sessionId, strokes }, { except: client });
    });

    /**
     * A catch, called by the hunter who made it — the same trust model as
     * movement. The server checks the shooter is a hunter and the victim is a
     * chameleon, then **converts** rather than kills.
     *
     * Being caught does not put you out of the game: you become a hunter, at the
     * map's spawn, stripped back to white, and you join the hunt for whoever is
     * left. That is why there is no death screen and no respawn any more, and
     * why the hunt gets harder the longer it runs.
     */
    this.onMessage("kill", (client: Client, msg: KillMsg) => {
      // Nobody is caught in the waiting room. Everyone there is armed — that is
      // what a lobby *is* — and being converted while queuing for a game you
      // have not started would be nonsense. The shot still bangs and still marks
      // the wall; only the consequence is withheld.
      if (this.isLobby) return;
      // The round is decided. The reveal is a thirty-second look at where
      // everybody was, not extra time.
      if (this.state.phase !== "hunt") return;

      const shooter = this.state.players.get(client.sessionId);
      const victimId = String(msg?.id ?? "");
      const victim = this.state.players.get(victimId);
      if (
        !shooter ||
        shooter.role !== "hunter" ||
        !victim ||
        // A hunter cannot catch a hunter, which also makes this safe to send
        // twice: the second one finds a victim who has already converted.
        victim.role !== "chameleon" ||
        victimId === client.sessionId
      ) {
        return;
      }
      if (!this.canFire(client.sessionId)) return;

      const [rawX, rawY, rawZ] = Array.isArray(msg.position)
        ? (msg.position as number[])
        : [victim.x, victim.y, victim.z];
      const x = clamp(rawX, -ROOM_LIMIT, ROOM_LIMIT);
      const y = clamp(rawY, -5, 30);
      const z = clamp(rawZ, -ROOM_LIMIT, ROOM_LIMIT);

      // Where somebody was found, and who. The name rides along so the reveal
      // can label the spot rather than showing anonymous markers.
      this.state.graves.push(
        [x.toFixed(2), y.toFixed(2), z.toFixed(2), victim.name].join(","),
      );
      if (this.state.graves.length > MAX_GRAVES) {
        this.state.graves.splice(0, this.state.graves.length - MAX_GRAVES);
      }

      /**
       * The conversion itself.
       *
       * Paint goes with the side: a chameleon's camouflage is the thing they
       * spent the lobby on, and carrying it into the hunt would leave a hunter
       * wearing the pattern of the wall they were caught against.
       * `clearSkin` tells everyone else, because they are the ones who have to
       * stop seeing it.
       */
      victim.role = "hunter";
      victim.cling = false;
      victim.pose = 0;
      victim.strokes.clear();
      this.broadcast("clearSkin", { id: victimId });

      // A catching shot is still a shot: it makes the same bang as one that hit
      // a wall, and it is the only bang for it, since this path relays no mark.
      this.broadcast("shot", { id: client.sessionId });
      this.broadcast("caught", { id: victimId, by: shooter.name, position: [x, y, z] });

      // The last one caught ends the round then and there.
      if (this.chameleonsLeft === 0) this.finish("hunters");
    });

    this.onMessage("clearSkin", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.strokes.clear();
      this.broadcast("clearSkin", { id: client.sessionId }, { except: client });
    });

    // Marks are cosmetic and expire in three seconds, so they are simply relayed
    // and never stored. The bang is a separate broadcast: a mark is at the wall
    // the pellets hit, and a gunshot has to come from the gun.
    this.onMessage("shoot", (client: Client, msg: ShootMsg) => {
      if (!msg || !this.canFire(client.sessionId)) return;
      this.broadcast("mark", {
        id: randomUUID(),
        position: msg.position,
        rotation: msg.rotation,
        origin: msg.origin,
      });
      this.broadcast("shot", { id: client.sessionId });
    });

    // A whistle is only a position given away, so it is relayed like a shot:
    // everyone hears it, at whoever let it out. Chameleons only — the mirror of the
    // kill check below, which refuses anyone who is not a hunter.
    this.onMessage("whistle", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role !== "chameleon") return;
      const now = Date.now();
      if (now - (this.lastWhistle.get(client.sessionId) ?? 0) < MIN_WHISTLE_GAP_MS) return;
      this.lastWhistle.set(client.sessionId, now);
      this.broadcast("whistle", { id: client.sessionId });
    });
  }

  /**
   * Whether this lobby could begin a round right now.
   *
   * Two players is the floor and it is not arbitrary: a round needs a hunter and
   * something to hunt, and the draw at the end of the countdown takes one of the
   * people standing here.
   */
  private get canStart() {
    return this.isLobby && !this.matchId && !this.starting && this.state.players.size >= MIN_PLAYERS;
  }

  /**
   * Start the ten seconds before a round.
   *
   * Two things ask for this and they are deliberately the same path: **the lobby
   * filling up**, and **the host pressing Start** before it does. Neither opens a
   * match directly — the countdown is what does, when it reaches zero — so there
   * is exactly one place a round can begin from and exactly one thing to cancel.
   *
   * Idempotent: asking again while it runs is ignored rather than restarting it,
   * which is what stops the last player to join resetting the clock for
   * everybody.
   */
  private beginCountdown() {
    if (this.counting || !this.canStart) return;
    this.state.phase = "countdown";
    this.state.timeLeft = COUNTDOWN_SECONDS;
    this.publish();

    this.counting = this.clock.setInterval(() => {
      // Someone left and there is no longer a game to start. Back to waiting
      // rather than starting a round one person cannot play.
      if (this.state.players.size < MIN_PLAYERS) {
        this.cancelCountdown();
        return;
      }
      this.state.timeLeft -= 1;
      if (this.state.timeLeft > 0) return;
      this.cancelCountdown();
      void this.start();
    }, 1000);
  }

  /** Stop counting and go back to waiting. Safe to call when not counting. */
  private cancelCountdown() {
    this.counting?.clear();
    this.counting = null;
    if (!this.isLobby) return;
    this.state.phase = "waiting";
    this.state.timeLeft = 0;
    this.publish();
  }

  /**
   * Take everyone in this lobby to a match.
   *
   * A seat reservation is the only supported way to hand a client to another
   * room: the match is created, a seat is held in it for each player, and each
   * client is told to go and consume theirs. The lobby itself stays behind, so
   * its invite code keeps working and anyone arriving late has somewhere to
   * land.
   *
   * Seats are held for fifteen seconds by default, which is the whole budget for
   * every client to make the trip. One that does not simply stays here — which
   * is why the client surfaces the failure rather than assuming it worked.
   *
   * **This is where sides are decided.** Nobody picks one: everybody waits as a
   * hunter, and exactly one of them is drawn at random to stay one — the rest
   * become chameleons as the match opens. It happens here rather than in the match
   * room because the draw needs the whole roster at once, and the match has no
   * players yet — its seats are what is being handed out.
   */
  private async start() {
    // A match already running is the third way this can be asked for wrongly,
    // after "not a lobby" and "asked twice". It used to be reachable: a lobby is
    // empty while its match runs, so anyone joining by the code became host and
    // could open a second match, orphaning the first.
    if (!this.isLobby || this.starting || this.matchId) return;
    this.starting = true;
    try {
      // The pass is minted here and known only to this pair of rooms. It is what
      // makes the roles below trustworthy on the other side, and it is kept
      // because the hunter's seat is reserved a whole hiding phase later.
      this.roundPass = randomUUID();
      const match = await matchMaker.createRoom("match", {
        map: this.state.nextMap,
        lobby: this.roomId,
        pass: this.roundPass,
        // The same cap, or a full lobby could arrive at a room that will not
        // take all of it.
        maxPlayers: this.state.maxPlayers,
      });
      this.matchId = match.roomId;

      const going = this.clients.filter((c) => this.state.players.has(c.sessionId));
      this.hunterId = going.length
        ? going[Math.floor(Math.random() * going.length)].sessionId
        : "";

      /**
       * **Only the chameleons make the trip.** The hunter stays exactly where
       * they are, in a lobby that is a playable arena, for the whole hiding
       * phase — which is the entire point of it: they cannot watch anybody
       * choose a spot, because they are not in the room where spots are chosen.
       *
       * They are fetched by `sendHunter` when the match rings the bell.
       */
      await Promise.all(
        going
          .filter((client) => client.sessionId !== this.hunterId)
          .map((client) =>
            this.handOver(client, match, {
              name: this.state.players.get(client.sessionId)?.name ?? "player",
              role: "chameleon",
              pass: this.roundPass,
              // Carried through so the match can hand it back on the way home.
              // Without it the host returns as a stranger and the button moves.
              pid: this.pidOf.get(client.sessionId) ?? "",
            }),
          ),
      );

      // The lobby shows the hiding countdown too, because the hunter is standing
      // in it. Display only — see the note on `hiding`.
      this.state.phase = "hiding";
      this.state.timeLeft = HIDE_SECONDS;
      this.hiding = this.clock.setInterval(() => {
        if (this.state.timeLeft > 0) this.state.timeLeft -= 1;
      }, 1000);
      this.publish();
    } catch (e) {
      this.broadcast("moveFailed", {
        reason: e instanceof Error ? e.message : "could not open the match",
      });
    } finally {
      this.starting = false;
    }
  }

  /**
   * The match ringing the bell: send the hunter in.
   *
   * Public because `matchMaker.remoteRoomCall` reaches it by name, and checked
   * against `matchId` for the same reason `matchEnded` is — a call naming a
   * match this lobby does not own is not ours to act on.
   *
   * The role goes out on the seat reservation with the round's pass, which is
   * the only thing that makes it trustworthy: a match takes a role from a seat
   * its lobby reserved and from nowhere else.
   */
  async sendHunter(id: string) {
    if (!this.isLobby || this.matchId !== id) return;
    this.hiding?.clear();
    this.hiding = null;

    const [match] = await matchMaker.query({ roomId: id });
    const hunter = this.clients.find((c) => c.sessionId === this.hunterId);
    this.hunterId = "";
    if (!match || !hunter) {
      // Nobody to send, or nowhere to send them. The round runs on without a
      // hunter and the chameleons win it, which is a strange game but not a
      // broken one.
      this.state.phase = "waiting";
      this.state.timeLeft = 0;
      this.publish();
      return;
    }

    await this.handOver(hunter, match, {
      name: this.state.players.get(hunter.sessionId)?.name ?? "player",
      role: "hunter",
      pass: this.roundPass,
      pid: this.pidOf.get(hunter.sessionId) ?? "",
    });

    /**
     * **The lobby stays in `hiding` until the hunter has been handed over.**
     *
     * The bell is not a message — it is the phase changing from `hiding` to
     * `hunt`, which every client reads for itself. Clearing this to `waiting`
     * first meant the hunter's last sight of the lobby was `waiting`, so their
     * arrival in the match read as `waiting → hunt` and no bell rang for the one
     * person it is actually about. Setting it after leaves them `hiding → hunt`,
     * the same transition the chameleons already see.
     */
    this.state.phase = "waiting";
    this.state.timeLeft = 0;
    this.publish();
  }

  /**
   * Reach the lobby that owns this match, by name.
   *
   * Both directions of the round talk this way — `sendHunter` on the way in,
   * `matchEnded` on the way out — so the lookup and the swallowed failure live
   * in one place. A failure is never worth breaking the round for: the lobby's
   * own fifteen-second sweep is the backstop for everything said here.
   */
  private async callLobby(method: string, ...args: unknown[]) {
    if (this.isLobby) return;
    const [lobby] = await matchMaker.query({ roomId: this.state.lobby });
    if (!lobby) return;
    await matchMaker.remoteRoomCall(lobby.roomId, method, args).catch(() => {
      // The sweep is the backstop. Nothing here is worth failing a round for.
    });
  }

  /** How many players are still hiding. Zero of them ends the round. */
  private get chameleonsLeft() {
    let n = 0;
    this.state.players.forEach((p) => {
      if (p.role === "chameleon") n += 1;
    });
    return n;
  }

  /**
   * The round is decided. Nobody moves yet.
   *
   * **This does not send anyone home** — it opens the reveal, and the same match
   * clock counts that down before `goHome` runs. Thirty seconds with the world
   * still standing is the difference between a hunt that ends with an answer and
   * one that cuts to a menu: the surviving chameleons are still in their spots,
   * and the graves are still where people were found.
   *
   * `winner` goes into state rather than a broadcast because the reveal is long
   * enough for somebody to reconnect inside it and still need telling what they
   * are looking at.
   */
  private finish(winner: "chameleons" | "hunters") {
    if (this.isLobby || this.ending) return;
    this.ending = true;

    // Anyone still away is not coming back to a round that is over.
    for (const pending of this.pendingReturn.values()) pending.reject();
    this.pendingReturn.clear();

    this.state.winner = winner;
    this.state.phase = "reveal";
    this.state.timeLeft = REVEAL_SECONDS;
  }

  /**
   * The reveal is over: everybody goes back to the waiting room.
   *
   * The same hand-off as `start`, in reverse, and for the same reason — a seat
   * reservation is the only supported way to move a client. The lobby is still
   * there because it deliberately never auto-disposed, so the group lands back
   * where their invite code still works and can start another round.
   *
   * There is no separate "the round is over" message: `moveTo` *is* the news,
   * and `winner` was in state for the thirty seconds before it.
   */
  private async goHome() {
    if (this.isLobby) return;

    const [lobby] = await matchMaker.query({ roomId: this.state.lobby });
    if (!lobby) {
      // The lobby outlived its match by design, so this is the odd case: the
      // whole group left and the sweep closed it. Nothing to go back to.
      this.broadcast("moveFailed", { reason: "the waiting room is gone" });
      return;
    }

    // Told rather than discovered: the lobby's own sweep would get there
    // eventually, but "eventually" is a Start button that does nothing.
    await this.callLobby("matchEnded", this.roomId);

    await Promise.all(
      this.clients.map((client) =>
        this.handOver(client, lobby, {
          name: this.state.players.get(client.sessionId)?.name ?? "player",
          // The other half of the round trip: this is what tells the lobby that
          // the player walking back in is the one who opened it.
          pid: this.pidOf.get(client.sessionId) ?? "",
        }),
      ),
    );
  }

  /**
   * Hold a seat for one client in another room and tell them where to go.
   *
   * The payload is trimmed to what `consumeSeatReservation` actually reads — the
   * cache entry carries a process id and a creation date besides, which mean
   * nothing to a browser.
   *
   * A seat is held for fifteen seconds by default, which is the whole budget for
   * the trip. One client failing is *that* client's problem and nobody else's,
   * so the failure is sent rather than thrown: they stay where they are and are
   * told why.
   */
  private async handOver(client: Client, to: RoomCache, options: Record<string, string>) {
    try {
      const seat = await matchMaker.reserveSeatFor(to, options);
      client.send("moveTo", {
        sessionId: seat.sessionId,
        room: {
          roomId: to.roomId,
          name: to.name,
          publicAddress: to.publicAddress,
          clients: to.clients,
          maxClients: to.maxClients,
        },
      });
    } catch (e) {
      client.send("moveFailed", { reason: e instanceof Error ? e.message : "no seat" });
    }
  }

  /**
   * End a lobby that has nothing left to wait for.
   *
   * `autoDispose` is off, so this is the only thing that closes one. Empty is
   * not enough on its own: during a start every client is momentarily out of the
   * room while consuming their seat, and a lobby that vanished in that window
   * would take its invite code with it. A live match is a reason to stay.
   *
   * It doubles as the match's death certificate — once the match is gone the
   * lobby forgets it, so a group that comes back can start another one.
   */
  private async sweep() {
    if (!this.isLobby) return;
    if (this.matchId && (await matchMaker.query({ roomId: this.matchId })).length === 0) {
      this.matchId = null;
      this.publish();
    }
    // The backstop for a host who never came back: once the grace window has
    // passed, this is where the button finally moves on.
    this.reassignHost();
    this.publish();

    if (this.clients.length === 0 && !this.matchId) this.disconnect();
  }

  onJoin(
    client: Client,
    options?: { name?: string; role?: string; pass?: string; pid?: string },
  ) {
    const pid = String(options?.pid ?? "");

    /**
     * **While a round is running, a lobby admits only people who were already in
     * this game.** Someone walking back out of the match keeps their seat;
     * a stranger with the invite code is turned away until the round ends.
     *
     * This is a capacity rule, not a privacy one, and it is load-bearing. A
     * lobby's `maxClients` is the cap the host chose, and `reserveSeatFor`
     * *respects* it — `Room._reserveSeat` returns false once
     * `hasReachedMaxClients()` — so a stranger who took a seat while the match
     * was out would make the trip home fail for whoever reserved last. They
     * would be left in a room that is about to dispose, holding a `moveFailed`
     * and no way back. Refusing the stranger is the cheap end of that trade.
     *
     * `firstSeen` is the test because it is already the record of who has been
     * part of this game, kept for the room's whole life for the host rule.
     */
    if (this.isLobby && this.matchId && (!pid || !this.firstSeen.has(pid))) {
      client.leave(4001);
      return;
    }

    // Tie this seat to the tab behind it before anything else looks at either.
    // A player with no id — an old client, or storage refused — simply never
    // holds the button; they can still play.
    if (pid) {
      this.pidOf.set(client.sessionId, pid);
      if (!this.firstSeen.has(pid)) this.firstSeen.set(pid, Date.now());
    }

    const player = new Player();
    player.name = String(options?.name ?? "player").slice(0, 16);
    /**
     * Nobody picks a side.
     *
     * Everybody waits as a **hunter** — armed, first person, upright — and one
     * of them stays that way when the match opens while the rest become chameleons.
     * A match therefore takes a role only from a seat its lobby reserved, which
     * is what the pass proves: the two arrive in the same argument and are
     * otherwise indistinguishable, so without it any chameleon could leave a match
     * and rejoin by its id claiming the gun.
     *
     * A join with no valid pass is a chameleon, and that is the right answer for the
     * only case that reaches it — a dead player respawning, who is necessarily a
     * chameleon, since a hunter cannot be shot.
     */
    const vouched = this.pass !== "" && options?.pass === this.pass;
    player.role = this.isLobby || (vouched && options?.role === "hunter") ? "hunter" : "chameleon";
    player.x = 0;
    player.y = 4;
    player.z = 0;
    player.yaw = 0;
    player.pitch = 0;
    player.pose = 0;
    player.cling = false;
    this.state.players.set(client.sessionId, player);

    // Never "claim the button if it looks vacant" — that is what handed it to
    // whoever wandered into an empty lobby mid-match. `reassignHost` knows the
    // difference between vacant and waiting.
    this.reassignHost();
    this.publish();

    // The first person to join names the session, so it shows up on the LAN as
    // "Martin's Session" rather than the OS account name.
    if (this.state.players.size === 1 && !process.env.SESSION_NAME) {
      setSessionName(player.name);
    }

    // A full lobby starts itself. The host may still press Start earlier; both
    // roads lead to the same countdown, and `beginCountdown` ignores the second
    // caller rather than restarting the clock.
    if (this.isLobby && this.state.players.size >= this.state.maxPlayers) {
      this.beginCountdown();
    }
  }

  async onLeave(client: Client, consented?: boolean) {
    /**
     * A drop is not a departure.
     *
     * `consented` is true when the client asked to leave — quitting, or being
     * handed to another room — and false when the socket simply died. Only the
     * second is worth waiting on, and only in a match: a lobby is cheap to walk
     * back into by its code, while a match has your side, your position and your
     * paint in it, none of which a fresh join can restore.
     *
     * The player stays in state while we wait, so their body is still standing
     * where they left it. That is the honest outcome and it is shootable — a
     * drop should not be a way to become invulnerable — which is why the kill
     * handler lets go of any pending return for its victim.
     */
    if (!this.isLobby && !consented && !this.ending && this.state.players.has(client.sessionId)) {
      const pending = this.allowReconnection(client, RECONNECT_SECONDS);
      this.pendingReturn.set(client.sessionId, pending as unknown as Reconnection);
      try {
        await pending;
        return; // They came back to the seat they left. State was never touched.
      } catch {
        // Never came back, or was killed while away. Fall through and clean up.
      } finally {
        this.pendingReturn.delete(client.sessionId);
      }
    }

    this.state.players.delete(client.sessionId);
    this.lastShot.delete(client.sessionId);
    this.lastWhistle.delete(client.sessionId);
    // The seat is gone; the *player* is remembered in `firstSeen`, because
    // stepping out and coming back does not shorten how long you have been here.
    this.pidOf.delete(client.sessionId);

    // A countdown that outlived its second player would open a round for one
    // person. The interval checks this too, but doing it here means the panel
    // stops counting the moment somebody leaves rather than up to a second
    // later.
    if (this.counting && this.state.players.size < MIN_PLAYERS) this.cancelCountdown();

    /**
     * The last chameleon quitting ends the round exactly as the last one caught
     * does. Without this the hunters are left sweeping an empty map for the rest
     * of the clock, which reads as the game having hung.
     *
     * It has to be checked *after* the delete above, and only in a hunt: during
     * the hiding phase the chameleons are the only people here, so an early
     * leaver would otherwise hand the round to nobody.
     */
    if (!this.isLobby && this.state.phase === "hunt" && this.chameleonsLeft === 0) {
      this.finish("hunters");
    }

    this.reassignHost();
    this.publish();
  }
}

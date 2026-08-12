# Traps already hit — do not reintroduce

Every one of these cost a debugging session. They are numbered, and **the
numbers are referenced from code comments and folder docs all over the repo** —
`// see trap 5`, `Root doc, trap 8`. Renumbering breaks those silently, so add
to the end rather than inserting.

The folder docs hold the rest; these eight are project-wide.

The folder docs hold the rest. These eight are project-wide:

1. **Never wrap the tree in `<StrictMode>`.** R3F's `Canvas` does not survive
   StrictMode's dev-only double mount: the discarded mount calls
   `forceContextLoss()` and the canvas stays dead. Symptom is a black screen and
   `THREE.WebGLRenderer: Context Lost.` This used to be spelled
   `reactStrictMode: false` in `next.config.ts`; it now lives as the *absence* of
   a wrapper in `src/main.tsx`, which is easier to reintroduce by accident —
   every React starter template has one.
2. **Never let a WebSocket server own the HTTP server's `upgrade` event.**
   `new WebSocketServer({ server, path })` destroys every non-matching upgrade,
   including the dev HMR socket, which stops the client bootstrap so **nothing
   mounts and no button works**. Both Colyseus and Vite's HMR are on their own
   ports precisely to avoid this — `server.hmr.server` would hand Vite this one.
   Symptom is "connection refused" plus a completely dead UI.
3. **No CDN assets, at runtime *or* at build time.** `<Environment preset="city" />`
   fetches an HDR at runtime and, under one `Suspense`, blanks the whole scene.
   Lighting is plain lights. Name labels use drei `Html`, not `Text` (troika
   fetches a font). **Everything the game needs is served by the machine serving
   the game.** A third-party CDN is an availability dependency you do not control,
   a privacy leak to somebody else's logs, and the one thing that breaks when the
   game is played on a network with no uplink — which is still a supported way to
   run it. The same rule cost the Geist webfonts: `next/font/google` downloaded
   them during `npm run build`, so the *build* needed the internet. The HUD is
   `font-mono` throughout and resolves to Tailwind's system stack. To put a real
   font back, commit the files under `public/` and `@font-face` them.
4. **`<Physics timeStep="vary">` in `Scene.tsx` is load-bearing, and more so
   now.** On the default fixed 1/60 step, @react-three/rapier renders every body
   at an *interpolated* transform each frame while `rb.translation()` — which the
   camera and every raycast in `players/Player.tsx` read — only changes on a
   step. Two clocks, drifting apart by up to one step, which shows as the figure
   jittering against the camera at one-frame intervals. Stepping once per
   rendered frame makes the interpolation alpha 1 and the two always agree. The
   player is now a *kinematic* body driven by one
   `setNextKinematicTranslation` per frame, so a fixed step would also mean
   frames that compute a new target and then do not move — the same stutter,
   arrived at from the other direction.
5. **Never call into rapier from a React effect — only from `useFrame`, and
   never cache a rapier handle across a world reset.** This is why
   `players/controller.ts` builds the character controller lazily on first frame
   rather than in a mount effect — *and* why it re-checks the cached one against
   `world.characterControllers` before reusing it. `useRapier().world` is a
   **singleton proxy**: a stable JS object whose inner world @react-three/rapier
   can free and rebuild, so a `WeakMap` keyed on it happily survives the reset
   and hands back a controller belonging to a world that is gone. A handle
   touched after its world is gone (an HMR remount is enough) panics inside wasm:
   one `RuntimeError: unreachable`, then an endless flood of `recursive use of an
   object detected which would lead to unsafe aliasing in rust`. The module is
   then poisoned, *every* later rapier call throws, physics is dead and the frame
   loop aborts halfway — which looks like the player teleporting into the ground
   and the screen going white. Colliders are swapped by React (a `key` on
   `CuboidCollider`) rather than mutated in place.
6. **Write TypeScript that Node can strip.** Node blanks type syntax out rather
   than re-emitting, which forbids `enum`, `namespace`, decorators and
   `constructor(private x)` parameter properties. It applies to `server/`, which
   Node runs, *and* to any module you want to import into Node for testing.
   Two specific bites, both already paid for:
   - Colyseus schema fields must be `declare x: T`, never `x!: T` — the latter
     survives as the class field `x;`, an own property that shadows the accessor
     `defineTypes` installs, and every state encode then dies with `Cannot read
     properties of undefined (reading 'Symbol(Symbol.metadata)')`, taking the
     server down on the first join.
   - A parameter property throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` the moment
     the module is loaded outside the bundler.
7. **Nothing here deploys to a serverless platform.** The game is one long-lived
   process holding websocket rooms in memory. Ignore advice shaped around
   request-scoped functions, and ignore the Vercel-shaped advice this repo used
   to attract by being a Next app. The hosted path is the Dockerfile.
8. **No secure-context-only browser API.** `crypto.randomUUID`,
   `navigator.clipboard`, `crypto.subtle`, geolocation and the rest exist on
   `localhost` and over HTTPS and **nowhere else** — including
   `http://192.168.x.x:3000`, which is how every guest opens this game. The
   failure only ever hits the people who are not the developer, and it is not
   subtle: `crypto.randomUUID is not a function` killed every join over a plain
   address the day player ids were added. **A public deployment behind TLS is a
   secure context and would not hit this** — which is exactly why it stays a rule:
   it fails only for the people not on `localhost` and not on HTTPS, and both
   still exist. Use `crypto.getRandomValues`, which carries no such restriction;
   where there is no unrestricted equivalent, feature-detect and fall back
   (`LobbyPanel`'s Copy button falls back to `execCommand`, deprecated and
   therefore unrestricted). Testing on localhost cannot catch this.


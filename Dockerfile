# One process serves both halves: Next on PORT and Colyseus on GAME_PORT.
# The Colyseus docs' example is a single-port server; this needs both exposed.
#
# Node 22 is not a preference. The server is TypeScript that Node runs directly
# by stripping types, which needs 22.18 or newer — there is no build step for it,
# and on an older Node the process fails to parse rather than misbehave.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Tailwind and its postcss plugin are devDependencies and are needed *here* —
# this is the stage that has them.
RUN npm run build


FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# No peers to shout at on a hosted box; `/api/sessions` still answers with self.
ENV LAN_DISCOVERY=0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# `.next` and `public` are the built site. `src` is here because the server is
# still TypeScript at runtime — Node strips it on the way in — and `next.config.ts`
# is read at boot, which Next handles through that same native stripping rather
# than the typescript package, so it is not needed in production.
# --chown matters: Next writes into .next/cache at runtime, and files copied as
# root would leave the unprivileged user unable to.
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/next.config.ts ./

USER node
EXPOSE 3000 2567

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/sessions').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/game/server/index.ts"]

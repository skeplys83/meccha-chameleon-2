# One process serves both halves: the built client on PORT and Colyseus on
# GAME_PORT. The Colyseus docs' example is a single-port server; this needs both.
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
# Vite and Tailwind are devDependencies and are needed *here* — this is the
# stage that has them. The output is `dist/`, and nothing else from this stage
# is carried forward except the sources the server itself still needs.
RUN npm run build


FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# No peers to shout at on a hosted box; `/api/sessions` still answers with self.
ENV LAN_DISCOVERY=0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# `dist` is the built client, which the server hands out with express.static.
# `public` is copied by the build into `dist`, so it is not needed separately.
# `src` is here because the server is still TypeScript at runtime — Node strips
# it on the way in. There is no config file to carry: `vite.config.ts` is a
# build-time artefact and the production server never imports vite at all.
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src ./src

USER node
EXPOSE 3000 2567

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/sessions').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/game/server/index.ts"]
